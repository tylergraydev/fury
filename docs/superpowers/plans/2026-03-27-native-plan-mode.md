# Native SDK Plan Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the plan mode UI toggle to the Claude Agent SDK's native `permissionMode: 'plan'` so the agent actually plans before executing.

**Architecture:** The frontend already has plan approval UI, ExitPlanMode detection, and the "Approve" flow. The only real gap is that `permissionMode` is hardcoded to `"default"` in the Rust backend. The fix sets it to `"plan"` when enabled, and ensures the approval message ("yes") is sent with `permissionMode: "default"` so execution proceeds normally. A stale `disable_plan_mode` field on `SidecarCommand::Query` (added by a partial earlier edit) needs to be removed since the SDK uses `permissionMode` directly.

**Tech Stack:** Rust (Tauri commands), TypeScript (React frontend), Claude Agent SDK (`permissionMode: 'plan'`)

---

## Current State (Important Context)

The plan mode feature is ~90% wired already:

| Layer | Status |
|---|---|
| UI toggle (Composer.tsx) | Done - orange "Plan" button, Shift+Tab shortcut, dashed border |
| Frontend flag derivation (ChatPanel.tsx) | Done - `planEnabled ? undefined : true` → `disablePlanMode` |
| Agent store (agentStore.ts) | Done - passes `disablePlanMode` to backend |
| Rust model (models/agent.rs) | Done - `SendMessageRequest.disable_plan_mode` field |
| Rust extraction (commands/agent.rs) | Done - `extract_toggle_flags()` reads both flags |
| **Rust permissionMode (commands/agent.rs:456)** | **BUG - hardcoded `"default"`** |
| Sidecar protocol (protocol.ts) | Done - `permissionMode` already flows through |
| Sidecar handler (index.ts:53) | Done - `permissionMode: permissionMode \|\| "default"` passed to SDK |
| ExitPlanMode detection (chatStore.ts:437) | Done - sets `planApproval[wsId] = true` |
| Approval UI (Composer.tsx) | Done - ActionBar with "Approve" and "Copy" buttons |
| **Approval sends with plan mode ON (ChatPanel.tsx:205)** | **BUG - "yes" resends with plan mode, loops forever** |

### Partial Edits to Clean Up

Earlier edits left the codebase in a broken intermediate state:
- `sidecar.rs` line 48-49: Has a `disable_plan_mode` field that should NOT exist (we use `permissionMode` instead)
- `agent.rs` line 403: Changed from `_disable_plan_mode` to `disable_plan_mode` (correct, keep)
- `agent.rs` line 469: References `disable_plan_mode` field on `SidecarCommand` (must remove — field shouldn't exist)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src-tauri/src/services/claude_process/sidecar.rs` | **Modify** | Remove stale `disable_plan_mode` field from `SidecarCommand::Query` |
| `src-tauri/src/commands/agent.rs` | **Modify** | Set `permission_mode` based on `disable_plan_mode` flag; remove stale field usage |
| `src/components/chat/ChatPanel.tsx` | **Modify** | Send approval with `disablePlanMode: true` to exit plan mode |
| `src-tauri/src/commands/agent.rs` (tests) | **Modify** | Update serialization tests for removed field |
| `src/components/chat/ChatPanel.test.tsx` | **Modify** | Add test for plan approval sending correct flag |

---

## Task 1: Clean Up Stale `disable_plan_mode` Field on SidecarCommand

The `disable_plan_mode` field was added to `SidecarCommand::Query` by a partial edit. It's unnecessary because the SDK uses `permissionMode` directly — not a separate boolean.

**Files:**
- Modify: `src-tauri/src/services/claude_process/sidecar.rs:48-49`

- [ ] **Step 1: Remove the stale field from SidecarCommand::Query**

In `src-tauri/src/services/claude_process/sidecar.rs`, remove lines 48-49:

```rust
// REMOVE these two lines:
#[serde(rename = "disablePlanMode", skip_serializing_if = "Option::is_none")]
disable_plan_mode: Option<bool>,
```

The `Query` variant should end with `disable_thinking`:

```rust
Query {
    id: String,
    prompt: String,
    cwd: String,
    #[serde(rename = "sessionId", skip_serializing_if = "Option::is_none")]
    session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
    #[serde(rename = "systemPrompt", skip_serializing_if = "Option::is_none")]
    system_prompt: Option<String>,
    #[serde(rename = "permissionMode")]
    permission_mode: String,
    #[serde(rename = "envVars", skip_serializing_if = "Option::is_none")]
    env_vars: Option<HashMap<String, String>>,
    #[serde(rename = "additionalDirs", skip_serializing_if = "Option::is_none")]
    additional_dirs: Option<Vec<String>>,
    #[serde(rename = "disableThinking", skip_serializing_if = "Option::is_none")]
    disable_thinking: Option<bool>,
},
```

- [ ] **Step 2: Verify any serialization tests don't reference the removed field**

Run: `cd src-tauri && cargo test sidecar_command -- --nocapture`

Check the test `test_sidecar_command_query_serializes` — it should not reference `disable_plan_mode`. If it does, remove that field from the test construction.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/services/claude_process/sidecar.rs
git commit -m "fix: remove stale disable_plan_mode field from SidecarCommand::Query"
```

---

## Task 2: Wire `permission_mode` Based on Plan Toggle

This is the core fix. Instead of hardcoding `"default"`, set `permission_mode` to `"plan"` when the user has plan mode enabled.

**Semantics:**
- `disable_plan_mode == false` (toggle ON, default) → `permissionMode: "plan"`
- `disable_plan_mode == true` (toggle OFF) → `permissionMode: "default"`

**Files:**
- Modify: `src-tauri/src/commands/agent.rs:456-469`

- [ ] **Step 1: Write the test**

In `src-tauri/src/commands/agent.rs`, in the `#[cfg(test)]` module, add:

```rust
#[test]
fn test_permission_mode_plan_when_enabled() {
    // disable_plan_mode = false means plan mode is ON
    let mode = if false { "default" } else { "plan" };
    assert_eq!(mode, "plan");
}

#[test]
fn test_permission_mode_default_when_disabled() {
    // disable_plan_mode = true means plan mode is OFF
    let mode = if true { "default" } else { "plan" };
    assert_eq!(mode, "default");
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd src-tauri && cargo test permission_mode_plan -- --nocapture`
Expected: PASS (these test the logic we're about to use)

- [ ] **Step 3: Replace hardcoded permission_mode and remove stale field usage**

In `src-tauri/src/commands/agent.rs`, replace lines 456-469:

```rust
// BEFORE:
let permission_mode = "default";

let cmd = claude_process::SidecarCommand::Query {
    id: context_id.to_string(),
    prompt: request.message.clone(),
    cwd: working_dir.to_string_lossy().to_string(),
    session_id: session_id.clone(),
    model: request.model.clone(),
    system_prompt: system_prompt.clone(),
    permission_mode: permission_mode.to_string(),
    env_vars: Some(env_vars),
    additional_dirs: Some(linked_dirs.iter().map(|d| d.to_string_lossy().to_string()).collect()),
    disable_thinking: Some(disable_thinking),
    disable_plan_mode: Some(disable_plan_mode),
};
```

```rust
// AFTER:
let permission_mode = if disable_plan_mode { "default" } else { "plan" };

let cmd = claude_process::SidecarCommand::Query {
    id: context_id.to_string(),
    prompt: request.message.clone(),
    cwd: working_dir.to_string_lossy().to_string(),
    session_id: session_id.clone(),
    model: request.model.clone(),
    system_prompt: system_prompt.clone(),
    permission_mode: permission_mode.to_string(),
    env_vars: Some(env_vars),
    additional_dirs: Some(linked_dirs.iter().map(|d| d.to_string_lossy().to_string()).collect()),
    disable_thinking: Some(disable_thinking),
};
```

Key changes:
1. `permission_mode` is now conditional instead of hardcoded
2. `disable_plan_mode` field removed from the command construction (field no longer exists on enum)

- [ ] **Step 4: Run Rust tests**

Run: `cd src-tauri && cargo test -- --nocapture`
Expected: All tests pass, including the new ones and existing `extract_toggle_flags` tests.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/agent.rs
git commit -m "feat: set permissionMode to 'plan' based on plan toggle state"
```

---

## Task 3: Fix Plan Approval to Exit Plan Mode

Currently `handleApprovePlan` calls `handleSend("yes")`, which inherits the current `disablePlanMode` flag. When plan mode is ON, `disablePlanMode` is `undefined` (falsy), so the approval message starts ANOTHER plan-mode query — infinite loop.

The fix: `handleApprovePlan` must explicitly send with `disablePlanMode: true` so the follow-up query uses `permissionMode: "default"`.

**Files:**
- Modify: `src/components/chat/ChatPanel.tsx:205-207`
- Test: `src/components/chat/ChatPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

In `src/components/chat/ChatPanel.test.tsx`, add a test:

```typescript
it("sends plan approval with disablePlanMode=true", async () => {
  // Set up: plan approval is active, agent is idle
  useChatStore.setState({
    planApproval: { [workspaceId]: true },
  });
  useAgentStore.setState({
    agents: { [workspaceId]: { status: "Idle" } },
  });

  const { getByText } = render(
    <ChatPanel
      contextId={workspaceId}
      contextType="workspace"
    />
  );

  // Click the Approve button
  fireEvent.click(getByText("Approve"));

  await waitFor(() => {
    expect(useAgentStore.getState().sendMessage).toHaveBeenCalledWith(
      workspaceId,
      "yes",
      "workspace",
      undefined,
      expect.anything(), // disableThinking — whatever the current toggle is
      true, // disablePlanMode MUST be true for execution
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/chat/ChatPanel.test.tsx -t "sends plan approval with disablePlanMode=true"`
Expected: FAIL — currently sends `undefined` for `disablePlanMode` instead of `true`

- [ ] **Step 3: Fix handleApprovePlan to force execution mode**

In `src/components/chat/ChatPanel.tsx`, replace lines 205-207:

```typescript
// BEFORE:
const handleApprovePlan = useCallback(async () => {
  await handleSend("yes");
}, [handleSend]);
```

```typescript
// AFTER:
const handleApprovePlan = useCallback(async () => {
  const disableThinking = thinkingEnabled ? undefined : true;
  useChatStore.getState().addUserMessage(contextId, "yes");
  try {
    await useAgentStore
      .getState()
      .sendMessage(contextId, "yes", contextType, undefined, disableThinking, true);
  } catch (e) {
    console.error("Failed to approve plan:", e);
  }
}, [contextId, contextType, thinkingEnabled]);
```

Key change: passes `true` as `disablePlanMode` (6th arg) so the execution query uses `permissionMode: "default"`. Cannot reuse `handleSend` because it reads `planEnabled` from state (which is still ON).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/chat/ChatPanel.test.tsx -t "sends plan approval with disablePlanMode=true"`
Expected: PASS

- [ ] **Step 5: Run the full frontend test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/ChatPanel.tsx src/components/chat/ChatPanel.test.tsx
git commit -m "fix: send plan approval with permissionMode=default so agent executes"
```

---

## Task 4: Update BUGS.md

**Files:**
- Modify: `BUGS.md`

- [ ] **Step 1: Update Bug #2 status to Fixed**

Replace the Bug #2 entry:

```markdown
## 2. Plan mode toggle doesn't actually enable plan mode
**Status:** Fixed
**Description:** The plan mode toggle in the Composer defaults to ON and visually shows as active. Previously the `disable_plan_mode` flag was extracted but never used — `permissionMode` was hardcoded to `"default"`.
**Fix:** `permissionMode` is now set to `"plan"` when plan mode is enabled, using the SDK's native plan mode. Plan approval sends with `permissionMode: "default"` to transition to execution.
```

- [ ] **Step 2: Commit**

```bash
git add BUGS.md
git commit -m "docs: mark plan mode bug as fixed"
```

---

## Task 5: Manual E2E Verification

This can't be fully automated since it requires a running agent, but these are the manual test steps.

- [ ] **Step 1: Run the dev app**

Run: `npm run tauri dev`

- [ ] **Step 2: Test plan mode ON (default)**

1. Open a workspace
2. Verify "Plan" toggle is orange (ON) and composer border is dashed
3. Send a message like "Create a hello world function in TypeScript"
4. Verify the agent produces a plan (text describing what it would do) and calls ExitPlanMode
5. Verify the "Approve" button appears in the composer
6. Click "Approve"
7. Verify the agent then executes the plan (actually creates the file)

- [ ] **Step 3: Test plan mode OFF**

1. Click the "Plan" toggle to disable it (should no longer be orange)
2. Send a message like "Create a goodbye world function in TypeScript"
3. Verify the agent executes immediately without planning first

- [ ] **Step 4: Test Shift+Tab toggle**

1. Press Shift+Tab to toggle plan mode
2. Verify the visual state changes (dashed border appears/disappears)
3. Send a message and verify behavior matches the toggle state
