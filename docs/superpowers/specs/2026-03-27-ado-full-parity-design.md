# Azure DevOps Full Parity Design

**Date:** 2026-03-27
**Status:** Draft
**Scope:** Close all feature gaps between GitHub and Azure DevOps support in Fury

## Context

Fury has deep GitHub integration covering PRs, reviews, issues, CI checks, workflow runs, and merge workflows. ADO support was added as an MVP with ~90% feature parity for the core PR workflow. Four gaps remain:

1. **Work Items** — ADO's equivalent of GitHub Issues (fundamentally different data model)
2. **Pipeline Logs** — Cannot view build step output for ADO pipelines
3. **Pipeline Rerun** — Cannot trigger pipeline re-run from UI for ADO
4. **PR Details** — `get_pr_details()` not implemented for ADO

This spec closes all four gaps to reach full parity.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| API approach | Direct REST API | Consistent with existing `ado.rs`, no `az` CLI dependency |
| Work item depth | Full support (list, detail, create, link, state transitions) | Fury should be a complete workflow tool for ADO users |
| Work item fields | Standard fields only (no custom fields) | Custom fields vary wildly across orgs; standard covers 90% of use |
| Work item queries | Predefined defaults (assigned to me, linked to PR, recent in iteration) | No arbitrary WIQL; sensible defaults avoid complexity |
| Pipeline log format | Structured per-task logs | ADO's timeline API provides per-task granularity; richer than concatenated text |
| Code structure | Split `ado.rs` into `services/ado/` submodules | Mirrors `services/gh/` structure, keeps files focused and testable |

## 1. Backend — ADO Service Restructure

### Current State

Single `services/ado.rs` (776 lines) containing all ADO logic: HTTP client, PR operations, pipeline operations, and all parsing/mapping helpers.

### Proposed Structure

```
services/ado/
  mod.rs          — client(), api_base(), ado_err(), check_auth(), re-exports
  pulls.rs        — create_pr, get_pr_by_branch, get_pr_detail, merge_pr,
                    get_pr_checks, get_pr_reviewers, get_pr_threads, list_prs
  work_items.rs   — list_work_items, get_work_item_detail, create_work_item,
                    update_work_item_state, link_work_item_to_pr
  pipelines.rs    — get_pipeline_runs, get_build_timeline (existing)
                    + get_build_logs, rerun_build (new)
  mapping.rs      — All map_* and parse_* helpers
```

The refactor is mechanical: move functions into submodules, re-export from `mod.rs`. All external call sites use `ado_svc::function_name()` which stays the same.

### Why This Is Safe

- `ado.rs` has no public API consumers outside `commands/` modules
- All calls go through `use crate::services::ado as ado_svc` — re-exports preserve the interface
- Existing unit tests move with their functions

## 2. New Data Models

### Work Item Types (`models/work_item.rs`)

```rust
pub struct WorkItemListItem {
    pub id: u32,
    pub title: String,
    pub work_item_type: String,         // Bug, Task, User Story, Feature, Epic
    pub state: String,                  // New, Active, Resolved, Closed
    pub assigned_to: Option<String>,
    pub area_path: Option<String>,
    pub iteration_path: Option<String>,
    pub parent_id: Option<u32>,
    pub tags: Vec<String>,
}

pub struct WorkItemDetail {
    pub id: u32,
    pub title: String,
    pub work_item_type: String,
    pub state: String,
    pub assigned_to: Option<String>,
    pub area_path: Option<String>,
    pub iteration_path: Option<String>,
    pub parent_id: Option<u32>,
    pub tags: Vec<String>,
    pub description: Option<String>,        // HTML body
    pub acceptance_criteria: Option<String>,
    pub priority: Option<u32>,              // 1-4
    pub created_by: Option<String>,
    pub created_date: Option<String>,
    pub changed_date: Option<String>,
    pub linked_pr_ids: Vec<u32>,    // Extracted from ArtifactLink relations
                                     // matching vstfs:///Git/PullRequestId/{project}%2F{repo}%2F{id}
    pub relations: Vec<WorkItemRelation>,
}

pub struct WorkItemRelation {
    pub rel_type: String,   // Parent, Child, Related
    pub target_id: u32,
    pub target_title: Option<String>,
}

pub struct CreateWorkItemRequest {
    pub workspace_id: Uuid,
    pub work_item_type: String,
    pub title: String,
    pub description: Option<String>,
    pub assigned_to: Option<String>,
    pub area_path: Option<String>,
    pub iteration_path: Option<String>,
    pub parent_id: Option<u32>,
    pub tags: Vec<String>,
}

pub struct WorkItemStateTransition {
    pub work_item_id: u32,
    pub new_state: String,
}

pub enum WorkItemQueryType {
    AssignedToMe,
    LinkedToPr,
    RecentInIteration,
}
```

### Pipeline Log Extension

Extend `RunLogsResult` to support structured per-task logs for ADO:

```rust
pub struct TaskLog {
    pub task_name: String,
    pub job_name: String,
    pub log_content: String,
    pub status: String,
    pub conclusion: Option<String>,
}

// Existing struct, extended:
pub struct RunLogsResult {
    pub logs: String,                       // Concatenated (GitHub)
    pub truncated: bool,
    pub task_logs: Option<Vec<TaskLog>>,    // Structured per-task (ADO)
}
```

The `task_logs` field is `Option` so GitHub codepaths return `None` with zero changes.

## 3. Backend — New & Modified Commands

### New: `commands/work_items.rs`

| Command | Input | Output | ADO REST API |
|---------|-------|--------|-------------|
| `list_work_items` | workspace_id, query_type | `Vec<WorkItemListItem>` | `POST _apis/wit/wiql` with predefined WIQL |
| `get_work_item_detail` | workspace_id, work_item_id | `WorkItemDetail` | `GET _apis/wit/workitems/{id}?$expand=relations` |
| `create_work_item` | CreateWorkItemRequest | `WorkItemListItem` | `POST _apis/wit/workitems/${type}` (JSON Patch) |
| `update_work_item_state` | workspace_id, work_item_id, new_state | `WorkItemListItem` | `PATCH _apis/wit/workitems/{id}` (JSON Patch) |
| `link_work_item_to_pr` | workspace_id, work_item_id, pr_id | `()` | `PATCH _apis/wit/workitems/{id}` (add ArtifactLink relation) |

All commands are ADO-only. They extract PAT + org/project from workspace state (same pattern as existing PR commands). GitHub workspaces calling these commands get `AppError::PrError("Work items are only available for Azure DevOps repositories")`.

#### WIQL Queries (predefined)

**AssignedToMe:**
```sql
SELECT [System.Id] FROM WorkItems
WHERE [System.AssignedTo] = @Me
AND [System.State] <> 'Closed' AND [System.State] <> 'Removed'
ORDER BY [System.ChangedDate] DESC
```

**LinkedToPr:**
Uses the work item links on the current PR. Fetch PR, extract linked work item IDs from `_apis/git/repositories/{repo}/pullrequests/{id}/workitems`, then batch-fetch those work items.

**RecentInIteration:**
The `@CurrentIteration` macro is not available in the REST API's WIQL endpoint. Instead, the service will first fetch the team's current iteration via `GET _apis/work/teamsettings/iterations?$timeframe=current`, extract the iteration path, and substitute it into the query:
```sql
SELECT [System.Id] FROM WorkItems
WHERE [System.IterationPath] = '{current_iteration_path}'
AND [System.State] <> 'Removed'
ORDER BY [System.ChangedDate] DESC
```
If the current iteration cannot be determined (no team configured, no iterations set up), return an empty list with no error.

#### JSON Patch Format (ADO Work Item API)

ADO's work item API uses JSON Patch (`Content-Type: application/json-patch+json`):

```json
[
  { "op": "add", "path": "/fields/System.Title", "value": "Fix login bug" },
  { "op": "add", "path": "/fields/System.WorkItemType", "value": "Bug" }
]
```

State transitions use the same format:
```json
[
  { "op": "replace", "path": "/fields/System.State", "value": "Active" }
]
```

### Modified: `commands/pr_workflows.rs`

**`get_run_logs`** — Fill the ADO match arm:

1. Fetch build timeline (`_apis/build/builds/{id}/timeline`)
2. For each task record that has a `log.id`, fetch `_apis/build/builds/{id}/logs/{logId}`
3. If `failed_only`, filter to tasks where `result == "failed"`
4. Return `RunLogsResult` with `task_logs` populated (structured) and `logs` as concatenated fallback

**`rerun_workflow`** — Fill the ADO match arm:

1. Fetch the original build to get its `definition.id` and `sourceBranch`
2. `POST _apis/build/builds` with `{ "definition": { "id": defId }, "sourceBranch": branch }`
3. The `failed_only` parameter is ignored — ADO does not support partial reruns. Queue a full new build.

### Modified: `commands/pr_issues.rs`

**`get_pr_details`** — Fill the ADO match arm:

Fetch PR from `_apis/git/repositories/{repo}/pullrequests/{id}` and map to `PrDetail` (title, head_branch, base_branch, body from description, state, URL).

### Modified: `commands/pr.rs`

**`provider_supports_issues`** — Remains `false` for ADO. Work items are a separate feature, not a GitHub Issues equivalent. The frontend will handle the provider distinction.

### New handler registration

Register new work item commands in `lib.rs` `tauri::generate_handler!`:
- `list_work_items`
- `get_work_item_detail`
- `create_work_item`
- `update_work_item_state`
- `link_work_item_to_pr`

## 4. Frontend — IPC Layer

### New: `src/lib/tauri/workItems.ts`

```typescript
export async function listWorkItems(
  workspaceId: string, queryType: WorkItemQueryType
): Promise<WorkItemListItem[]>

export async function getWorkItemDetail(
  workspaceId: string, workItemId: number
): Promise<WorkItemDetail>

export async function createWorkItem(
  request: CreateWorkItemRequest
): Promise<WorkItemListItem>

export async function updateWorkItemState(
  workspaceId: string, workItemId: number, newState: string
): Promise<WorkItemListItem>

export async function linkWorkItemToPr(
  workspaceId: string, workItemId: number, prId: number
): Promise<void>
```

### New types in `src/lib/tauri/types.ts`

TypeScript interfaces mirroring the Rust models:
- `WorkItemListItem`
- `WorkItemDetail`
- `WorkItemRelation`
- `CreateWorkItemRequest`
- `WorkItemQueryType` (enum: `"assigned_to_me" | "linked_to_pr" | "recent_in_iteration"`)
- `TaskLog`

### Modified: `RunLogsResult` type

Add `taskLogs?: TaskLog[]` field.

## 5. Frontend — Stores

### New: `src/stores/workItemStore.ts`

Zustand store following the same patterns as `prStore.ts`:

```
State:
  workItems: Record<string, WorkItemListItem[]>   // keyed by workspace ID
  workItemDetail: Record<string, WorkItemDetail>   // keyed by work item ID (string)
  activeQuery: Record<string, WorkItemQueryType>   // current query per workspace
  loading: Record<string, boolean>
  error: Record<string, string | null>

Actions:
  loadWorkItems(workspaceId, queryType)
  loadWorkItemDetail(workspaceId, workItemId)
  createWorkItem(request)
  updateWorkItemState(workspaceId, workItemId, newState)
  linkWorkItemToPr(workspaceId, workItemId, prId)

Selectors (individual, not destructured):
  getWorkItems(workspaceId)
  getWorkItemDetail(workItemId)
  isLoading(workspaceId)
  getError(workspaceId)
```

Module-level inflight deduplication sets: `_inflightWorkItems`, `_inflightDetails`.

### Existing: `prStore.ts`

No changes needed. The `getRunLogs` and `rerunWorkflow` IPC wrappers already exist. Once the backend stops returning empty/error for ADO, the store works as-is.

## 6. Frontend — Components

### New: `src/components/work-items/WorkItemsPanel.tsx`

Main panel for ADO work items. Shown in the sidebar/right panel for ADO repos (where GitHub repos show Issues).

**Layout:**
- Query selector tabs: "Assigned to Me" | "Linked to PR" | "This Iteration"
- Scrollable work item list
- Each item shows: type badge (color-coded), title, state badge, assigned to
- Click expands detail inline

**Type badge colors (follows ADO conventions):**
- Bug: red
- Task: yellow
- User Story: green
- Feature: purple
- Epic: orange

**Actions per item:**
- State transition dropdown (New -> Active -> Resolved -> Closed)
- "Link to PR" button (visible when workspace has an active PR)

### New: `src/components/work-items/WorkItemDetail.tsx`

Inline detail view:
- Title, type badge, state badge, priority
- Assigned to, area path, iteration path
- Description (rendered from HTML, sanitized)
- Acceptance criteria
- Relations list (parent, children, related — each showing title + type)
- Linked PRs

### New: `src/components/work-items/CreateWorkItemForm.tsx`

Form for creating work items:
- Type picker dropdown (Bug, Task, User Story, Feature, Epic)
- Title (required)
- Description (optional, plain text — converted to HTML on backend)
- Assigned to (optional)
- Area path (optional)
- Iteration path (optional)
- Parent work item ID (optional)
- Tags (optional, comma-separated)

### Modified: `src/components/sidebar/ChecksPanel.tsx`

The panel already switches "Pipelines" vs "Actions" based on provider. Add a section that switches between Issues (GitHub) and Work Items (ADO). The `ChecksPanel` is the right mounting point because it already owns the provider-aware CI/workflow section and is conditionally rendered (not hidden with CSS):

```tsx
{isAdo ? <WorkItemsPanel workspaceId={wsId} /> : <IssuesList repoId={repoId} />}
```

The section heading switches to "Work Items" for ADO repos, "Issues" for GitHub repos.

### Modified: `src/components/sidebar/WorkflowRunRow.tsx`

**Pipeline logs:** When `taskLogs` is present in the `RunLogsResult` (ADO), render structured view:
- Collapsible sections per task, grouped by job name
- Each section: task name, status badge, log content in monospace
- Failed tasks auto-expanded, succeeded tasks collapsed by default
- Falls back to concatenated `logs` string if `taskLogs` is absent (GitHub)

**Pipeline rerun:** The "Re-run" button already exists but errors for ADO. Once backend fills in:
- Button works for ADO
- Tooltip for ADO: "Queues a new full build" (vs GitHub's "Re-run failed jobs" option)
- Hide "Re-run Failed" button for ADO (not supported)

## 7. Testing Strategy

### Backend (Rust)

**Unit tests** for each new `services/ado/` submodule:
- `work_items.rs`: Parse work item list JSON, parse detail JSON, parse relations, WIQL query construction
- `pipelines.rs`: Parse build logs JSON, parse timeline with log IDs
- `mapping.rs`: Existing map_* tests move here, add work item state mapping tests
- `pulls.rs`: Existing PR parsing tests move here, add `parse_pr_detail` test

**Integration pattern:** Same as existing — unit test the parsing/mapping with fixture JSON, no live API calls in CI.

### Frontend (Vitest)

**Store tests** (`workItemStore.test.ts`):
- Load work items with each query type
- Load detail
- Create work item optimistic update
- State transition
- Link to PR
- Error handling
- Deduplication

**Component tests:**
- `WorkItemsPanel`: Renders list, switches queries, shows loading/error states
- `WorkItemDetail`: Renders all fields, relations, linked PRs
- `CreateWorkItemForm`: Validation, submit handler
- `WorkflowRunRow`: Structured logs rendering for ADO, fallback for GitHub

**Modified test files:**
- `ChecksPanel.test.tsx`: Verify provider-based switching between Issues and Work Items

### E2E

No new E2E tests for ADO features (would require live ADO instance). Existing E2E tests must continue to pass.

## 8. ADO REST API Reference

All endpoints use `api-version=7.1` and Basic auth with PAT.

| Feature | Method | Endpoint |
|---------|--------|----------|
| WIQL query | POST | `_apis/wit/wiql` |
| Get work item | GET | `_apis/wit/workitems/{id}?$expand=relations` |
| Batch get work items | GET | `_apis/wit/workitems?ids={csv}&$expand=relations` |
| Create work item | POST | `_apis/wit/workitems/${type}` (JSON Patch) |
| Update work item | PATCH | `_apis/wit/workitems/{id}` (JSON Patch) |
| PR linked work items | GET | `_apis/git/repositories/{repo}/pullrequests/{id}/workitems` |
| Build logs list | GET | `_apis/build/builds/{id}/logs` |
| Build log by ID | GET | `_apis/build/builds/{id}/logs/{logId}` |
| Queue build | POST | `_apis/build/builds` |
| PR detail | GET | `_apis/git/repositories/{repo}/pullrequests/{id}` |

### PAT Scopes Required

Existing scopes (Code R&W, Build R) plus:
- **Work Items: Read & Write** — for work item CRUD and linking

The AzureDevOpsTab.tsx settings panel should update its scope guidance to include this.

## 9. Migration & Compatibility

- No database migrations required (work items are fetched live from ADO API, not cached)
- No breaking changes to existing commands or models
- `RunLogsResult` gains an optional field (`task_logs`) — additive, non-breaking
- Existing ADO users see new features immediately after update
- GitHub users are completely unaffected

## 10. Build Sequence

Ordered by dependency:

1. **Restructure `services/ado/`** — mechanical move, no new functionality, all existing tests pass
2. **Add `models/work_item.rs`** + extend `RunLogsResult` with `TaskLog`
3. **Implement `services/ado/work_items.rs`** — REST calls + parsing
4. **Implement `services/ado/pipelines.rs` additions** — `get_build_logs`, `rerun_build`
5. **Implement `services/ado/pulls.rs` addition** — `get_pr_detail`
6. **Add `commands/work_items.rs`** + register in `lib.rs`
7. **Fill ADO match arms** in `pr_workflows.rs` and `pr_issues.rs`
8. **Frontend types + IPC** — `types.ts`, `workItems.ts`
9. **Frontend store** — `workItemStore.ts`
10. **Frontend components** — `WorkItemsPanel`, `WorkItemDetail`, `CreateWorkItemForm`
11. **Modify existing components** — `ChecksPanel.tsx` provider switch, `WorkflowRunRow.tsx` structured logs
12. **Update ADO settings tab** — add Work Items scope guidance
13. **Tests** — backend unit tests, frontend store + component tests
