# Containerize Repo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-click migration of repos into dev containers via AI-powered config generation.

**Architecture:** New `containerize` service gathers repo context and spawns a one-shot `claude -p` call to generate a `devcontainer.json`. User reviews in Monaco editor, chooses to commit or save in Fury only. Then existing `start_container` / `container_exec` pipeline takes over.

**Tech Stack:** Rust (Tauri commands + tokio async), TypeScript/React (Zustand store + Monaco editor), Claude CLI (`claude -p --output-format json`)

**Spec:** `docs/superpowers/specs/2026-03-23-containerize-repo-design.md`

---

## File Structure

### Backend (Rust)

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src-tauri/src/services/containerize.rs` | Repo context gathering, JSON parsing/extraction |
| Create | `src-tauri/src/commands/containerize.rs` | Tauri commands: `containerize_repo`, `apply_devcontainer_config` |
| Modify | `src-tauri/src/services/mod.rs` | Register new `containerize` module |
| Modify | `src-tauri/src/commands/mod.rs` | Register new `containerize` module |
| Modify | `src-tauri/src/lib.rs:241-246` | Add new commands to `generate_handler!` |

### Frontend (TypeScript/React)

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/lib/tauri/types.ts` | Add `ContainerizeStatus` event type |
| Modify | `src/lib/tauri/devcontainer.ts` | Add `containerizeRepo`, `applyDevcontainerConfig` IPC wrappers |
| Modify | `src/stores/devContainerStore.ts` | Add `containerizing`, `proposedConfig`, and new actions |
| Create | `src/components/devcontainer/ContainerizePanel.tsx` | Main UI: idle/analyzing/review/error states |
| Modify | `src/components/settings/RepoSettingsPanel.tsx` | Integrate ContainerizePanel |

### Tests

| Action | File | What it tests |
|--------|------|--------------|
| Create | `src-tauri/src/services/containerize.rs` (inline) | `gather_repo_context`, `extract_json_from_response` (pure functions) |
| Create | `src-tauri/src/commands/containerize.rs` (inline) | Command handlers with mock state |
| Create | `src/components/devcontainer/ContainerizePanel.test.tsx` | Component states, user interactions |
| Modify | `src/stores/devContainerStore.test.ts` | New actions and state transitions |

---

## Task 1: Backend Service — Repo Context Gathering

**Files:**
- Create: `src-tauri/src/services/containerize.rs`
- Modify: `src-tauri/src/services/mod.rs`

- [ ] **Step 1: Write failing tests for `gather_repo_context`**

In `src-tauri/src/services/containerize.rs`, write inline tests:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn setup_repo(dir: &TempDir, files: &[(&str, &str)]) {
        // Init a git repo so git ls-files works
        std::process::Command::new("git")
            .args(["init"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        for (name, content) in files {
            let path = dir.path().join(name);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).unwrap();
            }
            fs::write(&path, content).unwrap();
        }
        // Stage all files so git ls-files returns them
        std::process::Command::new("git")
            .args(["add", "."])
            .current_dir(dir.path())
            .output()
            .unwrap();
    }

    #[test]
    fn test_gather_includes_package_json() {
        let dir = TempDir::new().unwrap();
        setup_repo(&dir, &[
            ("package.json", r#"{"name":"test","dependencies":{"react":"^19"}}"#),
            ("src/index.ts", "console.log('hello')"),
        ]);
        let ctx = gather_repo_context(dir.path(), None);
        assert!(ctx.contains("package.json"));
        assert!(ctx.contains("react"));
    }

    #[test]
    fn test_gather_includes_cargo_toml() {
        let dir = TempDir::new().unwrap();
        setup_repo(&dir, &[
            ("Cargo.toml", "[package]\nname = \"myapp\"\nversion = \"0.1.0\""),
            ("src/main.rs", "fn main() {}"),
        ]);
        let ctx = gather_repo_context(dir.path(), None);
        assert!(ctx.contains("Cargo.toml"));
        assert!(ctx.contains("myapp"));
    }

    #[test]
    fn test_gather_includes_setup_script() {
        let dir = TempDir::new().unwrap();
        setup_repo(&dir, &[("README.md", "hello")]);
        let ctx = gather_repo_context(dir.path(), Some("npm install && npm run build"));
        assert!(ctx.contains("npm install && npm run build"));
    }

    #[test]
    fn test_gather_caps_large_files() {
        let dir = TempDir::new().unwrap();
        let big_content = "line\n".repeat(500);
        setup_repo(&dir, &[("package.json", &big_content)]);
        let ctx = gather_repo_context(dir.path(), None);
        // Should be truncated, not all 500 lines
        let line_count = ctx.lines().count();
        assert!(line_count < 400, "Expected truncation, got {} lines", line_count);
    }

    #[test]
    fn test_gather_empty_repo() {
        let dir = TempDir::new().unwrap();
        setup_repo(&dir, &[]);
        let ctx = gather_repo_context(dir.path(), None);
        assert!(ctx.contains("File listing"));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test services::containerize --no-run 2>&1 | head -20`
Expected: Compilation failure — `gather_repo_context` not defined

- [ ] **Step 3: Implement `gather_repo_context`**

```rust
use std::collections::HashMap;
use std::path::Path;
use std::process::Command as StdCommand;

/// Manifest files to read contents of, with max line cap.
const MANIFEST_FILES: &[&str] = &[
    "package.json",
    "Cargo.toml",
    "requirements.txt",
    "pyproject.toml",
    "go.mod",
    "Gemfile",
    "docker-compose.yml",
    "Dockerfile",
    "pom.xml",
    "build.gradle",
    "mix.exs",
];

const MAX_MANIFEST_LINES: usize = 200;

/// Gather repo context for the containerize agent prompt.
///
/// Uses `git ls-files` for the file listing (respects .gitignore).
/// Reads manifest files up to MAX_MANIFEST_LINES each.
/// Optionally includes the Fury setup script.
pub fn gather_repo_context(repo_path: &Path, setup_script: Option<&str>) -> String {
    let mut sections: Vec<String> = Vec::new();

    // File listing via git ls-files
    let file_listing = match StdCommand::new("git")
        .args(["ls-files"])
        .current_dir(repo_path)
        .output()
    {
        Ok(output) => String::from_utf8_lossy(&output.stdout).to_string(),
        Err(_) => {
            // Fallback: list top-level files only
            list_dir_shallow(repo_path)
        }
    };
    sections.push(format!("## File listing\n```\n{}\n```", file_listing.trim()));

    // Read manifest files
    for &manifest in MANIFEST_FILES {
        let path = repo_path.join(manifest);
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                let truncated: String = content
                    .lines()
                    .take(MAX_MANIFEST_LINES)
                    .collect::<Vec<_>>()
                    .join("\n");
                let suffix = if content.lines().count() > MAX_MANIFEST_LINES {
                    "\n... (truncated)"
                } else {
                    ""
                };
                sections.push(format!(
                    "## {}\n```\n{}{}\n```",
                    manifest, truncated, suffix
                ));
            }
        }
    }

    // Setup script
    if let Some(script) = setup_script {
        if !script.is_empty() {
            sections.push(format!(
                "## Fury setup script\n```\n{}\n```",
                script
            ));
        }
    }

    sections.join("\n\n")
}

/// Fallback directory listing when git is not available.
fn list_dir_shallow(path: &Path) -> String {
    match std::fs::read_dir(path) {
        Ok(entries) => {
            let mut names: Vec<String> = entries
                .filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().to_string())
                .filter(|n| !n.starts_with('.'))
                .collect();
            names.sort();
            names.join("\n")
        }
        Err(_) => String::new(),
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test services::containerize -- --nocapture`
Expected: All 5 tests pass

- [ ] **Step 5: Register module in `services/mod.rs`**

Add `pub mod containerize;` to `src-tauri/src/services/mod.rs` (alphabetically, after `checkpoint`).

- [ ] **Step 6: Run `cargo check` to verify compilation**

Run: `cd src-tauri && cargo check`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/services/containerize.rs src-tauri/src/services/mod.rs
git commit -m "feat(containerize): add repo context gathering service"
```

---

## Task 2: Backend Service — JSON Response Parsing

**Files:**
- Modify: `src-tauri/src/services/containerize.rs`

- [ ] **Step 1: Write failing tests for `extract_json_from_response`**

Add to the existing `tests` module in `containerize.rs`:

```rust
    #[test]
    fn test_extract_json_direct() {
        let input = r#"{"image": "node:20"}"#;
        let result = extract_json_from_response(input).unwrap();
        assert!(result.contains("node:20"));
    }

    #[test]
    fn test_extract_json_from_markdown_fences() {
        let input = "Here's the config:\n```json\n{\"image\": \"node:20\"}\n```\nDone!";
        let result = extract_json_from_response(input).unwrap();
        assert!(result.contains("node:20"));
    }

    #[test]
    fn test_extract_json_from_bare_fences() {
        let input = "```\n{\"image\": \"node:20\"}\n```";
        let result = extract_json_from_response(input).unwrap();
        assert!(result.contains("node:20"));
    }

    #[test]
    fn test_extract_json_invalid() {
        let input = "I couldn't figure out the config, sorry!";
        let result = extract_json_from_response(input);
        assert!(result.is_err());
    }

    #[test]
    fn test_extract_json_nested_object() {
        let input = r#"```json
{
  "name": "test",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:20",
  "features": {
    "ghcr.io/devcontainers/features/github-cli:1": {}
  },
  "postCreateCommand": "npm install"
}
```"#;
        let result = extract_json_from_response(input).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["image"], "mcr.microsoft.com/devcontainers/typescript-node:20");
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test services::containerize::tests::test_extract_json --no-run 2>&1 | head -10`
Expected: Compilation failure — `extract_json_from_response` not defined

- [ ] **Step 3: Implement `extract_json_from_response`**

Add to `containerize.rs` (above the `tests` module):

```rust
use crate::error::AppError;

/// Extract valid JSON from an agent response.
///
/// Tries three strategies:
/// 1. Direct JSON parse of the entire response
/// 2. Extract from markdown code fences (```json ... ``` or ``` ... ```)
/// 3. Return error with the raw text
pub fn extract_json_from_response(response: &str) -> Result<String, AppError> {
    let trimmed = response.trim();

    // Strategy 1: direct parse
    if serde_json::from_str::<serde_json::Value>(trimmed).is_ok() {
        return Ok(trimmed.to_string());
    }

    // Strategy 2: extract from code fences
    // Match ```json\n...\n``` or ```\n...\n```
    if let Some(json_str) = extract_from_code_fence(trimmed) {
        if serde_json::from_str::<serde_json::Value>(&json_str).is_ok() {
            return Ok(json_str);
        }
    }

    Err(AppError::ContainerError(format!(
        "Could not parse valid JSON from agent response. Raw output:\n{}",
        trimmed
    )))
}

/// Extract content between first pair of code fences.
fn extract_from_code_fence(text: &str) -> Option<String> {
    let start_markers = ["```json\n", "```json\r\n", "```\n", "```\r\n"];
    for marker in &start_markers {
        if let Some(start) = text.find(marker) {
            let content_start = start + marker.len();
            if let Some(end) = text[content_start..].find("```") {
                return Some(text[content_start..content_start + end].trim().to_string());
            }
        }
    }
    None
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test services::containerize -- --nocapture`
Expected: All 10 tests pass

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/services/containerize.rs
git commit -m "feat(containerize): add JSON response extraction from agent output"
```

---

## Task 3: Backend Service — System Prompt Builder

**Files:**
- Modify: `src-tauri/src/services/containerize.rs`

- [ ] **Step 1: Write failing test for `build_containerize_prompt`**

```rust
    #[test]
    fn test_build_prompt_includes_context() {
        let context = "## File listing\npackage.json\nsrc/index.ts";
        let prompt = build_containerize_prompt(context);
        assert!(prompt.contains("package.json"));
        assert!(prompt.contains("devcontainer.json"));
        assert!(prompt.contains("mcr.microsoft.com/devcontainers"));
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test services::containerize::tests::test_build_prompt --no-run 2>&1 | head -10`
Expected: Compilation failure

- [ ] **Step 3: Implement `build_containerize_prompt`**

```rust
/// Build the full prompt for the containerize agent call.
///
/// Combines the system instruction with the gathered repo context.
pub fn build_containerize_prompt(repo_context: &str) -> String {
    format!(
        r#"Analyze this repository and generate a devcontainer.json configuration.

Requirements:
- Use Microsoft devcontainer base images (mcr.microsoft.com/devcontainers/...)
- Include appropriate "features" for common tools (git, GitHub CLI, etc.)
- Set "postCreateCommand" to install dependencies based on the detected package manager
- Only return valid JSON — no markdown, no commentary, no explanation
- The JSON should be a valid devcontainer.json that works with the devcontainer CLI

Repository context:

{}"#,
        repo_context
    )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test services::containerize -- --nocapture`
Expected: All 11 tests pass

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/services/containerize.rs
git commit -m "feat(containerize): add system prompt builder for agent call"
```

---

## Task 4: Backend Commands — `containerize_repo` and `apply_devcontainer_config`

**Files:**
- Create: `src-tauri/src/commands/containerize.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs:241-246`

- [ ] **Step 1: Write tests for the command helpers**

Create `src-tauri/src/commands/containerize.rs` with tests:

```rust
use std::path::PathBuf;

use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::devcontainer::{
    AgentExecMode, ContainerBackend, DevContainerConfig,
};
use crate::services::containerize as ctz_svc;
use crate::state::AppState;

/// Build a DevContainerConfig with containerize defaults.
pub(crate) fn build_default_devcontainer_config(
    devcontainer_path: Option<String>,
) -> DevContainerConfig {
    DevContainerConfig {
        enabled: true,
        backend: ContainerBackend::DevcontainerCli,
        agent_exec_mode: AgentExecMode::Container,
        image: None,
        compose_file: None,
        compose_service: None,
        devcontainer_path,
        container_workspace_path: None,
        extra_docker_args: vec![],
        container_env_vars: std::collections::HashMap::new(),
    }
}

/// Resolve the repo path and setup script for a workspace.
/// Lock ordering: workspaces → repositories (read, then drop), then db.
pub(crate) fn resolve_workspace_repo_context(
    state: &AppState,
    workspace_id: Uuid,
) -> Result<(PathBuf, Option<String>, String), AppError> {
    // Scoped read locks — released before db lock
    let (repo_id, repo_path, repo_name) = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&workspace_id)
            .ok_or(AppError::WorkspaceNotFound(workspace_id))?;
        let repo_id = ws.repo_id;
        let repos = state.repositories.read().unwrap();
        let repo = repos
            .get(&repo_id)
            .ok_or(AppError::RepoNotFound(repo_id))?;
        (repo_id, repo.path.clone(), repo.name.clone())
    };

    // Separate db lock — no other locks held
    let setup_script = {
        let db_guard = state.db.lock().unwrap();
        db_guard
            .as_ref()
            .and_then(|db| db.get_repo_settings(&repo_id).ok())
            .and_then(|s| s.setup_script)
    };

    Ok((repo_path, setup_script, repo_name))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::devcontainer::{AgentExecMode, ContainerBackend};

    #[test]
    fn test_build_default_config_with_path() {
        let config = build_default_devcontainer_config(Some(".devcontainer/devcontainer.json".to_string()));
        assert!(config.enabled);
        assert_eq!(config.backend, ContainerBackend::DevcontainerCli);
        assert_eq!(config.agent_exec_mode, AgentExecMode::Container);
        assert_eq!(
            config.devcontainer_path.as_deref(),
            Some(".devcontainer/devcontainer.json")
        );
    }

    #[test]
    fn test_build_default_config_without_path() {
        let config = build_default_devcontainer_config(None);
        assert!(config.enabled);
        assert!(config.devcontainer_path.is_none());
    }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd src-tauri && cargo test commands::containerize -- --nocapture`
Expected: 2 tests pass

- [ ] **Step 3: Implement the `containerize_repo` command**

Add to `src-tauri/src/commands/containerize.rs`:

```rust
/// Gather repo context and spawn a one-shot Claude CLI call to generate
/// a devcontainer.json. Returns the proposed JSON string for user review.
///
/// Uses `claude -p` with `--output-format json` for a simple one-shot call.
/// The JSON output format returns a single JSON object on stdout with a
/// `result` field containing the assistant's text response.
#[tauri::command]
pub async fn containerize_repo(
    workspace_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    // Resolve repo path and setup script (locks scoped internally)
    let (repo_path, setup_script, _repo_name) =
        resolve_workspace_repo_context(&state, ws_id)?;

    // Emit analyzing status
    let _ = app.emit(
        &format!("containerize-status:{}", ws_id),
        "analyzing",
    );

    // Gather context
    let context = ctz_svc::gather_repo_context(
        &repo_path,
        setup_script.as_deref(),
    );

    // Build prompt
    let prompt = ctz_svc::build_containerize_prompt(&context);

    // Resolve provider env vars — each lock in its own scope
    let (env_vars, repo_settings) = {
        let settings = state.settings.read().unwrap();
        let repo_id = {
            let workspaces = state.workspaces.read().unwrap();
            workspaces
                .get(&ws_id)
                .ok_or(AppError::WorkspaceNotFound(ws_id))?
                .repo_id
        };
        let rs = {
            let db_guard = state.db.lock().unwrap();
            db_guard
                .as_ref()
                .and_then(|db| db.get_repo_settings(&repo_id).ok())
        };
        let provider_override = rs.as_ref().and_then(|s| s.provider_override.as_ref());
        let provider = provider_override.unwrap_or(&settings.provider);
        let mut env: std::collections::HashMap<String, String> = std::collections::HashMap::new();
        for (key, value) in &provider.env_vars {
            env.insert(key.clone(), value.clone());
        }
        (env, rs)
    };

    // Find claude binary
    let claude_bin = crate::services::claude_process::setup::find_claude_binary()?;

    // Build args for one-shot mode with --output-format json (single JSON response)
    let args = vec![
        "-p".to_string(),
        prompt,
        "--output-format".to_string(),
        "json".to_string(),
        "--dangerously-skip-permissions".to_string(),
    ];

    // Spawn one-shot process with process group for clean teardown
    let mut cmd = tokio::process::Command::new(&claude_bin);
    cmd.args(&args)
        .current_dir(&repo_path)
        .envs(&env_vars)
        .env_remove("CLAUDECODE")
        .env_remove("CLAUDE_CODE_ENTRYPOINT")
        .env_remove("CLAUDE_AGENT_SDK_VERSION")
        .env_remove("CLAUDE_CODE_ENABLE_TASKS")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    // Set process group on Unix for clean teardown
    #[cfg(unix)]
    unsafe {
        cmd.pre_exec(|| {
            libc::setpgid(0, 0);
            Ok(())
        });
    }

    let mut child = cmd.spawn().map_err(|e| {
        AppError::ContainerError(format!("Failed to spawn Claude CLI: {}", e))
    })?;

    // Collect stdout — with --output-format json, Claude outputs a single JSON object.
    // wait_with_output() consumes the child and collects all stdout/stderr.
    let output = child.wait_with_output().await.map_err(|e| {
        AppError::ContainerError(format!("Claude CLI process error: {}", e))
    })?;

    if !output.status.success() && output.stdout.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::ContainerError(
            format!("Claude CLI exited with an error: {}", stderr.trim()),
        ));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();

    // Parse the JSON output — format is {"result": "...assistant text...", ...}
    let result_text = if let Ok(json) = serde_json::from_str::<serde_json::Value>(&stdout_str) {
        json.get("result")
            .and_then(|r| r.as_str())
            .unwrap_or(&stdout_str)
            .to_string()
    } else {
        stdout_str
    };

    // Emit done status
    let _ = app.emit(
        &format!("containerize-status:{}", ws_id),
        "done",
    );

    // Try to extract valid JSON from the result text
    match ctz_svc::extract_json_from_response(&result_text) {
        Ok(json) => Ok(json),
        Err(_) => Ok(result_text), // Frontend will show in error state for manual editing
    }
}
```

- [ ] **Step 4: Implement the `apply_devcontainer_config` command**

Add to `src-tauri/src/commands/containerize.rs`:

```rust
/// Apply a devcontainer config to a workspace.
///
/// If `config_json` is empty, this is an "enable existing" flow — just sets the
/// DevContainerConfig in memory and DB pointing to the detected devcontainer_path.
/// If `commit_to_repo` is true, writes `.devcontainer/devcontainer.json` to disk
/// and commits it. In all cases, updates the workspace's devcontainer_config.
#[tauri::command]
pub async fn apply_devcontainer_config(
    workspace_id: String,
    config_json: String,
    commit_to_repo: bool,
    devcontainer_path: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let rel_path = devcontainer_path
        .unwrap_or_else(|| ".devcontainer/devcontainer.json".to_string());

    // If config_json is non-empty, validate and optionally write to disk
    if !config_json.is_empty() {
        serde_json::from_str::<serde_json::Value>(&config_json).map_err(|e| {
            AppError::ContainerError(format!("Invalid JSON: {}", e))
        })?;

        if commit_to_repo {
            let (repo_path, _, _) = resolve_workspace_repo_context(&state, ws_id)?;

            // Write file
            let full_path = repo_path.join(&rel_path);
            if let Some(parent) = full_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| {
                    AppError::ContainerError(format!("Failed to create directory: {}", e))
                })?;
            }
            std::fs::write(&full_path, &config_json).map_err(|e| {
                AppError::ContainerError(format!("Failed to write devcontainer.json: {}", e))
            })?;

            // Git add (scoped to just this file)
            let _ = tokio::process::Command::new("git")
                .args(["add", &rel_path])
                .current_dir(&repo_path)
                .output()
                .await;

            // Git commit
            let _ = tokio::process::Command::new("git")
                .args(["commit", "-m", "Add devcontainer configuration", "--", &rel_path])
                .current_dir(&repo_path)
                .output()
                .await;
        }
    }

    // Update workspace devcontainer config in memory
    let config = build_default_devcontainer_config(Some(rel_path));
    {
        let mut workspaces = state.workspaces.write().unwrap();
        if let Some(ws) = workspaces.get_mut(&ws_id) {
            ws.devcontainer_config = Some(config.clone());
        }
    }
    // Persist to DB — separate lock scope
    {
        let db_guard = state.db.lock().unwrap();
        if let Some(db) = db_guard.as_ref() {
            let _ = db.update_workspace_devcontainer_config(&ws_id, Some(&config));
        }
    }

    Ok(())
}
```

- [ ] **Step 5: Register module and commands**

In `src-tauri/src/commands/mod.rs`, add:
```rust
pub mod containerize;
```

In `src-tauri/src/lib.rs`, add after the existing devcontainer commands (around line 246):
```rust
            commands::containerize::containerize_repo,
            commands::containerize::apply_devcontainer_config,
```

- [ ] **Step 6: Run `cargo check` to verify compilation**

Run: `cd src-tauri && cargo check`
Expected: No errors

- [ ] **Step 7: Run all containerize tests**

Run: `cd src-tauri && cargo test containerize -- --nocapture`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/commands/containerize.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(containerize): add containerize_repo and apply_devcontainer_config commands"
```

---

## Task 5: Frontend — TypeScript Types and IPC Wrappers

**Files:**
- Modify: `src/lib/tauri/types.ts`
- Modify: `src/lib/tauri/devcontainer.ts`

- [ ] **Step 1: Add types to `types.ts`**

Add after the existing `ContainerStatusEvent` interface (around line 920):

```typescript
export type ContainerizeStatus = "analyzing" | "done" | "error";
```

- [ ] **Step 2: Add IPC wrappers to `devcontainer.ts`**

Add to `src/lib/tauri/devcontainer.ts`:

```typescript
export async function containerizeRepo(
  workspaceId: string,
): Promise<string> {
  return invoke<string>("containerize_repo", { workspaceId });
}

export async function applyDevcontainerConfig(
  workspaceId: string,
  configJson: string,
  commitToRepo: boolean,
  devcontainerPath?: string,
): Promise<void> {
  return invoke("apply_devcontainer_config", {
    workspaceId,
    configJson,
    commitToRepo,
    devcontainerPath: devcontainerPath ?? null,
  });
}
```

- [ ] **Step 3: Verify lint passes**

Run: `npm run lint -- --no-error-on-unmatched-pattern src/lib/tauri/devcontainer.ts src/lib/tauri/types.ts`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/tauri/types.ts src/lib/tauri/devcontainer.ts
git commit -m "feat(containerize): add IPC types and wrapper functions"
```

---

## Task 6: Frontend — Store Additions

**Files:**
- Modify: `src/stores/devContainerStore.ts`
- Modify: `src/stores/devContainerStore.test.ts`

- [ ] **Step 1: Write failing tests for new store actions**

Add to `src/stores/devContainerStore.test.ts`:

```typescript
import { vi, describe, it, expect, beforeEach } from "vitest";

// Add these tests to the existing describe block:

describe("containerize actions", () => {
  const workspaceId = "test-ws-id";

  beforeEach(() => {
    useDevContainerStore.getState().reset?.();
    vi.clearAllMocks();
  });

  it("containerize sets containerizing flag and stores proposed config on success", async () => {
    const mockJson = '{"image": "node:20"}';
    vi.mocked(containerizeRepo).mockResolvedValue(mockJson);

    await useDevContainerStore.getState().containerize(workspaceId);

    expect(useDevContainerStore.getState().containerizing[workspaceId]).toBe(false);
    expect(useDevContainerStore.getState().proposedConfig[workspaceId]).toBe(mockJson);
  });

  it("containerize sets error on failure", async () => {
    vi.mocked(containerizeRepo).mockRejectedValue(new Error("CLI failed"));

    await useDevContainerStore.getState().containerize(workspaceId);

    expect(useDevContainerStore.getState().containerizing[workspaceId]).toBe(false);
    expect(useDevContainerStore.getState().containerizeError[workspaceId]).toBe("CLI failed");
  });

  it("applyConfig calls IPC and clears proposed config", async () => {
    // Pre-set proposed config
    useDevContainerStore.setState({
      proposedConfig: { [workspaceId]: '{"image": "node:20"}' },
    });

    vi.mocked(applyDevcontainerConfig).mockResolvedValue(undefined);

    await useDevContainerStore.getState().applyConfig(workspaceId, '{"image": "node:20"}', true);

    expect(applyDevcontainerConfig).toHaveBeenCalledWith(workspaceId, '{"image": "node:20"}', true);
    expect(useDevContainerStore.getState().proposedConfig[workspaceId]).toBeUndefined();
  });

  it("clearProposedConfig removes config for workspace", () => {
    useDevContainerStore.setState({
      proposedConfig: { [workspaceId]: '{"image": "node:20"}' },
    });

    useDevContainerStore.getState().clearProposedConfig(workspaceId);

    expect(useDevContainerStore.getState().proposedConfig[workspaceId]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/stores/devContainerStore.test.ts`
Expected: Failures — `containerize`, `applyConfig`, `clearProposedConfig` not defined

- [ ] **Step 3: Add new state and actions to the store**

Read the current store file first, then add these new fields and actions. Add to the interface and implementation:

**New state fields:**
```typescript
containerizing: Record<string, boolean>;
proposedConfig: Record<string, string>;
containerizeError: Record<string, string | null>;
```

**New actions:**
```typescript
containerize: async (workspaceId: string) => {
  set((s) => ({
    containerizing: { ...s.containerizing, [workspaceId]: true },
    containerizeError: { ...s.containerizeError, [workspaceId]: null },
  }));
  try {
    const json = await containerizeRepo(workspaceId);
    set((s) => ({
      proposedConfig: { ...s.proposedConfig, [workspaceId]: json },
      containerizing: { ...s.containerizing, [workspaceId]: false },
    }));
  } catch (e) {
    set((s) => ({
      containerizing: { ...s.containerizing, [workspaceId]: false },
      containerizeError: {
        ...s.containerizeError,
        [workspaceId]: e instanceof Error ? e.message : String(e),
      },
    }));
  }
},

applyConfig: async (workspaceId: string, configJson: string, commitToRepo: boolean, devcontainerPath?: string) => {
  await applyDevcontainerConfig(workspaceId, configJson, commitToRepo, devcontainerPath);
  set((s) => {
    const { [workspaceId]: _, ...rest } = s.proposedConfig;
    return { proposedConfig: rest };
  });
},

clearProposedConfig: (workspaceId: string) => {
  set((s) => {
    const { [workspaceId]: _, ...rest } = s.proposedConfig;
    return { proposedConfig: rest };
  });
},
```

Add `containerizeRepo` and `applyDevcontainerConfig` to the imports from `@/lib/tauri`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/stores/devContainerStore.test.ts`
Expected: All tests pass (existing + new)

- [ ] **Step 5: Commit**

```bash
git add src/stores/devContainerStore.ts src/stores/devContainerStore.test.ts
git commit -m "feat(containerize): add containerize actions to devContainerStore"
```

---

## Task 7: Frontend — ContainerizePanel Component

**Files:**
- Create: `src/components/devcontainer/ContainerizePanel.tsx`
- Create: `src/components/devcontainer/ContainerizePanel.test.tsx`

- [ ] **Step 1: Write failing tests for ContainerizePanel**

Create `src/components/devcontainer/ContainerizePanel.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ContainerizePanel from "./ContainerizePanel";
import { useDevContainerStore } from "@/stores/devContainerStore";

// Mock the store
vi.mock("@/stores/devContainerStore");

// Mock Monaco editor
vi.mock("@monaco-editor/react", () => ({
  default: ({ value, onChange }: { value: string; onChange?: (v: string | undefined) => void }) => (
    <textarea
      data-testid="monaco-editor"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

describe("ContainerizePanel", () => {
  const workspaceId = "test-ws-id";
  const mockContainerize = vi.fn();
  const mockApplyConfig = vi.fn();
  const mockClearProposedConfig = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDevContainerStore).mockImplementation((selector: any) =>
      selector({
        containerizing: {},
        proposedConfig: {},
        containerizeError: {},
        containerize: mockContainerize,
        applyConfig: mockApplyConfig,
        clearProposedConfig: mockClearProposedConfig,
      })
    );
  });

  it("renders Containerize button in idle state", () => {
    render(<ContainerizePanel workspaceId={workspaceId} />);
    expect(screen.getByText("Containerize")).toBeInTheDocument();
  });

  it("calls containerize on button click", () => {
    render(<ContainerizePanel workspaceId={workspaceId} />);
    fireEvent.click(screen.getByText("Containerize"));
    expect(mockContainerize).toHaveBeenCalledWith(workspaceId);
  });

  it("shows analyzing state when containerizing", () => {
    vi.mocked(useDevContainerStore).mockImplementation((selector: any) =>
      selector({
        containerizing: { [workspaceId]: true },
        proposedConfig: {},
        containerizeError: {},
        containerize: mockContainerize,
        applyConfig: mockApplyConfig,
        clearProposedConfig: mockClearProposedConfig,
      })
    );
    render(<ContainerizePanel workspaceId={workspaceId} />);
    expect(screen.getByText(/Analyzing/i)).toBeInTheDocument();
  });

  it("shows review state with proposed config", () => {
    const config = '{"image": "node:20"}';
    vi.mocked(useDevContainerStore).mockImplementation((selector: any) =>
      selector({
        containerizing: {},
        proposedConfig: { [workspaceId]: config },
        containerizeError: {},
        containerize: mockContainerize,
        applyConfig: mockApplyConfig,
        clearProposedConfig: mockClearProposedConfig,
      })
    );
    render(<ContainerizePanel workspaceId={workspaceId} />);
    expect(screen.getByTestId("monaco-editor")).toBeInTheDocument();
    expect(screen.getByText("Commit to repo")).toBeInTheDocument();
    expect(screen.getByText("Save to Fury only")).toBeInTheDocument();
  });

  it("calls applyConfig with commitToRepo=true", () => {
    const config = '{"image": "node:20"}';
    vi.mocked(useDevContainerStore).mockImplementation((selector: any) =>
      selector({
        containerizing: {},
        proposedConfig: { [workspaceId]: config },
        containerizeError: {},
        containerize: mockContainerize,
        applyConfig: mockApplyConfig,
        clearProposedConfig: mockClearProposedConfig,
      })
    );
    render(<ContainerizePanel workspaceId={workspaceId} />);
    fireEvent.click(screen.getByText("Commit to repo"));
    expect(mockApplyConfig).toHaveBeenCalledWith(workspaceId, config, true);
  });

  it("calls applyConfig with commitToRepo=false", () => {
    const config = '{"image": "node:20"}';
    vi.mocked(useDevContainerStore).mockImplementation((selector: any) =>
      selector({
        containerizing: {},
        proposedConfig: { [workspaceId]: config },
        containerizeError: {},
        containerize: mockContainerize,
        applyConfig: mockApplyConfig,
        clearProposedConfig: mockClearProposedConfig,
      })
    );
    render(<ContainerizePanel workspaceId={workspaceId} />);
    fireEvent.click(screen.getByText("Save to Fury only"));
    expect(mockApplyConfig).toHaveBeenCalledWith(workspaceId, config, false);
  });

  it("shows error state with retry button", () => {
    vi.mocked(useDevContainerStore).mockImplementation((selector: any) =>
      selector({
        containerizing: {},
        proposedConfig: {},
        containerizeError: { [workspaceId]: "CLI failed" },
        containerize: mockContainerize,
        applyConfig: mockApplyConfig,
        clearProposedConfig: mockClearProposedConfig,
      })
    );
    render(<ContainerizePanel workspaceId={workspaceId} />);
    expect(screen.getByText(/CLI failed/)).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/devcontainer/ContainerizePanel.test.tsx`
Expected: Failure — component doesn't exist

- [ ] **Step 3: Implement ContainerizePanel**

Create `src/components/devcontainer/ContainerizePanel.tsx`:

```tsx
import { useState } from "react";
import Editor from "@monaco-editor/react";
import { useDevContainerStore } from "../../stores/devContainerStore";
import { applyDevcontainerConfig } from "../../lib/tauri";

const buttonStyle = {
  border: "1px solid var(--border)",
  backgroundColor: "var(--bg-surface)",
  color: "var(--text-primary)",
};

interface ContainerizePanelProps {
  workspaceId: string;
  existingDevcontainer?: string | null;
  onContainerized?: () => void;
}

export default function ContainerizePanel({
  workspaceId,
  existingDevcontainer,
  onContainerized,
}: ContainerizePanelProps) {
  const containerizing = useDevContainerStore(
    (s) => s.containerizing[workspaceId] ?? false,
  );
  const proposedConfig = useDevContainerStore(
    (s) => s.proposedConfig[workspaceId],
  );
  const containerizeError = useDevContainerStore(
    (s) => s.containerizeError[workspaceId],
  );
  const containerize = useDevContainerStore((s) => s.containerize);
  const applyConfig = useDevContainerStore((s) => s.applyConfig);
  const clearProposedConfig = useDevContainerStore(
    (s) => s.clearProposedConfig,
  );

  const [editedConfig, setEditedConfig] = useState<string | null>(null);

  const displayConfig = editedConfig ?? proposedConfig;

  const handleContainerize = () => {
    containerize(workspaceId);
  };

  const handleApply = async (commitToRepo: boolean) => {
    if (!displayConfig) return;
    await applyConfig(workspaceId, displayConfig, commitToRepo);
    setEditedConfig(null);
    onContainerized?.();
  };

  const handleUseExisting = async () => {
    // For existing devcontainer.json, enable it by passing empty config_json
    // with the detected path — backend handles the "enable existing" case
    await applyDevcontainerConfig(workspaceId, "", false, existingDevcontainer ?? undefined);
    onContainerized?.();
  };

  const handleCancel = () => {
    clearProposedConfig(workspaceId);
    setEditedConfig(null);
  };

  // Error state
  if (containerizeError && !containerizing && !proposedConfig) {
    return (
      <div className="flex flex-col gap-3 p-3">
        <div
          className="rounded px-3 py-2 text-xs break-words"
          style={{
            backgroundColor: "var(--error-bg)",
            color: "var(--error)",
            border: "1px solid var(--error-border)",
          }}
        >
          {containerizeError}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleContainerize}
            className="rounded px-3 py-1 text-xs"
            style={buttonStyle}
          >
            Retry
          </button>
          <button
            onClick={handleCancel}
            className="rounded px-3 py-1 text-xs"
            style={buttonStyle}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Analyzing state
  if (containerizing) {
    return (
      <div className="flex flex-col gap-2 p-3">
        <div
          className="flex items-center gap-2 text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          Analyzing repository...
        </div>
      </div>
    );
  }

  // Review state
  if (proposedConfig) {
    return (
      <div className="flex flex-col gap-3 p-3">
        <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          Review the generated devcontainer.json:
        </div>
        <div
          className="rounded overflow-hidden"
          style={{ border: "1px solid var(--border)", height: 300 }}
        >
          <Editor
            defaultLanguage="json"
            value={displayConfig}
            onChange={(v) => setEditedConfig(v ?? null)}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              fontSize: 12,
              tabSize: 2,
              wordWrap: "on",
            }}
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleApply(true)}
            className="rounded px-3 py-1 text-xs"
            style={buttonStyle}
          >
            Commit to repo
          </button>
          <button
            onClick={() => handleApply(false)}
            className="rounded px-3 py-1 text-xs"
            style={buttonStyle}
          >
            Save to Fury only
          </button>
          <button
            onClick={handleCancel}
            className="rounded px-3 py-1 text-xs"
            style={buttonStyle}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Idle state
  return (
    <div className="flex flex-col gap-3 p-3">
      {existingDevcontainer ? (
        <button
          onClick={handleUseExisting}
          className="rounded px-3 py-1 text-xs"
          style={buttonStyle}
        >
          Use existing devcontainer
        </button>
      ) : (
        <button
          onClick={handleContainerize}
          disabled={containerizing}
          className="rounded px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          style={buttonStyle}
        >
          Containerize
        </button>
      )}
      <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
        {existingDevcontainer
          ? `Found ${existingDevcontainer} — enable container mode for this workspace.`
          : "Analyze this repo and generate a devcontainer.json using AI."}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/devcontainer/ContainerizePanel.test.tsx`
Expected: All 7 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/components/devcontainer/ContainerizePanel.tsx src/components/devcontainer/ContainerizePanel.test.tsx
git commit -m "feat(containerize): add ContainerizePanel component with idle/analyzing/review/error states"
```

---

## Task 8: Frontend — Integrate into RepoSettingsPanel

**Files:**
- Modify: `src/components/settings/RepoSettingsPanel.tsx`
- Modify: `src/components/settings/RepoSettingsPanel.test.tsx`

- [ ] **Step 1: Read the current RepoSettingsPanel to understand structure**

Read `src/components/settings/RepoSettingsPanel.tsx` and identify where the devcontainer section lives.

- [ ] **Step 2: Write a failing test for the integration**

Add to `src/components/settings/RepoSettingsPanel.test.tsx`:

```typescript
it("renders ContainerizePanel when no devcontainer config exists", async () => {
  // Mock repo with no devcontainer config
  // ... (adapt to existing test patterns in the file)
  render(<RepoSettingsPanel repoId={repoId} />);
  await waitFor(() => {
    expect(screen.getByText("Containerize")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/settings/RepoSettingsPanel.test.tsx -t "ContainerizePanel"`
Expected: Failure — ContainerizePanel not rendered

- [ ] **Step 4: Add ContainerizePanel to RepoSettingsPanel**

In the devcontainer section of `RepoSettingsPanel.tsx`, add conditional rendering:
- If workspace has no `devcontainerConfig` (or `enabled: false`): render `<ContainerizePanel>`
- If workspace has `devcontainerConfig.enabled`: render existing container controls

Import `ContainerizePanel` and `detectDevcontainer` at the top. On mount, call `detectDevcontainer(repoId)` to check for existing `.devcontainer.json` and pass result as `existingDevcontainer` prop.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/settings/RepoSettingsPanel.test.tsx`
Expected: All tests pass (existing + new)

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/RepoSettingsPanel.tsx src/components/settings/RepoSettingsPanel.test.tsx
git commit -m "feat(containerize): integrate ContainerizePanel into RepoSettingsPanel"
```

---

## Task 9: Full Integration Test

**Files:** None new — verification only

- [ ] **Step 1: Run all Rust tests**

Run: `cd src-tauri && cargo test`
Expected: All tests pass, including new `containerize` module tests

- [ ] **Step 2: Run all frontend tests**

Run: `npm test`
Expected: All ~2700+ tests pass

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 4: Run `cargo check` for type safety**

Run: `cd src-tauri && cargo check`
Expected: No errors

- [ ] **Step 5: Commit any fixes if needed, then final verification**

Run: `npm test && cd src-tauri && cargo test`
Expected: Everything green
