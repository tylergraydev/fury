# ADO Full Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 4 remaining feature gaps between GitHub and Azure DevOps support in Fury — work items, pipeline logs, pipeline rerun, and PR details.

**Architecture:** Split monolithic `services/ado.rs` into submodules mirroring `services/gh/`. Add new `WorkItem` data models (distinct from GitHub's Issue types). Extend pipeline commands with log fetching and rerun. All ADO interactions use direct REST API calls with PAT auth — no external CLI dependencies.

**Tech Stack:** Rust (Tauri v2 backend), React 19 + TypeScript (frontend), Zustand (state), Vitest (testing), ADO REST API v7.1

---

## File Structure

### Backend — New Files
| File | Responsibility |
|------|---------------|
| `src-tauri/src/services/ado/mod.rs` | HTTP client, `api_base()`, `ado_err()`, `check_auth()`, re-exports |
| `src-tauri/src/services/ado/pulls.rs` | PR CRUD: create, get by branch, detail, merge, checks, reviewers, threads, list |
| `src-tauri/src/services/ado/work_items.rs` | Work item list/detail/create/update/link via WIQL + WIT API |
| `src-tauri/src/services/ado/pipelines.rs` | Pipeline runs, timeline, build logs, rerun |
| `src-tauri/src/services/ado/mapping.rs` | All `map_*` and `parse_*` helpers |
| `src-tauri/src/models/work_item.rs` | `WorkItemListItem`, `WorkItemDetail`, `WorkItemRelation`, `CreateWorkItemRequest`, `WorkItemQueryType`, `TaskLog` |
| `src-tauri/src/commands/work_items.rs` | Tauri commands: `list_work_items`, `get_work_item_detail`, `create_work_item`, `update_work_item_state`, `link_work_item_to_pr` |

### Backend — Modified Files
| File | Change |
|------|--------|
| `src-tauri/src/services/mod.rs` | Change `pub mod ado;` to directory module (automatic — Rust resolves `ado/mod.rs`) |
| `src-tauri/src/models/mod.rs` | Add `pub mod work_item;` |
| `src-tauri/src/models/pr.rs` | Add `task_logs: Option<Vec<TaskLog>>` to `RunLogsResult` |
| `src-tauri/src/commands/mod.rs` | Add `pub mod work_items;` |
| `src-tauri/src/commands/pr_workflows.rs` | Fill ADO match arms for `get_run_logs` and `rerun_workflow` |
| `src-tauri/src/commands/pr_issues.rs` | Fill ADO match arm for `get_pr_details` |
| `src-tauri/src/lib.rs` | Register 5 new work item commands in `generate_handler!` |

### Frontend — New Files
| File | Responsibility |
|------|---------------|
| `src/lib/tauri/workItems.ts` | IPC wrappers for work item commands |
| `src/stores/workItemStore.ts` | Zustand store for work item state |
| `src/stores/workItemStore.test.ts` | Store tests |
| `src/components/work-items/WorkItemsPanel.tsx` | Work item list with query tabs |
| `src/components/work-items/WorkItemDetail.tsx` | Inline detail view for a single work item |
| `src/components/work-items/CreateWorkItemForm.tsx` | Create work item form |
| `src/components/work-items/WorkItemBadge.tsx` | Type badge (Bug/Task/Story/Feature/Epic) with color |

### Frontend — Modified Files
| File | Change |
|------|--------|
| `src/lib/tauri/types.ts` | Add work item types, `TaskLog`, extend `RunLogsResult` |
| `src/lib/tauri/index.ts` | Add `export * from "./workItems"` |
| `src/components/sidebar/ChecksPanel.tsx` | Provider-switch between Issues (GH) and WorkItems (ADO) |
| `src/components/sidebar/WorkflowRunRow.tsx` | Structured log rendering for ADO, hide "Re-run Failed" for ADO |
| `src/components/settings/tabs/AzureDevOpsTab.tsx` | Update PAT scope guidance to include Work Items |

---

## Task 1: Restructure `services/ado.rs` into submodules

**Files:**
- Delete: `src-tauri/src/services/ado.rs`
- Create: `src-tauri/src/services/ado/mod.rs`
- Create: `src-tauri/src/services/ado/pulls.rs`
- Create: `src-tauri/src/services/ado/pipelines.rs`
- Create: `src-tauri/src/services/ado/mapping.rs`

This is a mechanical move. No new functionality — all existing public functions stay accessible via `ado_svc::function_name()`.

- [ ] **Step 1: Create `services/ado/` directory and `mod.rs`**

Create `src-tauri/src/services/ado/mod.rs` with the shared infrastructure and re-exports:

```rust
mod mapping;
mod pipelines;
mod pulls;

pub use mapping::*;
pub use pipelines::*;
pub use pulls::*;

use crate::error::AppError;

/// Build a `reqwest::Client` with the ADO PAT as Basic auth.
pub(crate) fn client(pat: &str) -> Result<reqwest::Client, AppError> {
    let encoded = base64::engine::general_purpose::STANDARD.encode(format!(":{}", pat));
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::AUTHORIZATION,
        reqwest::header::HeaderValue::from_str(&format!("Basic {}", encoded))
            .map_err(|e| AppError::AzureDevOpsError(format!("Invalid PAT: {}", e)))?,
    );

    reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .map_err(|e| AppError::AzureDevOpsError(format!("Failed to build HTTP client: {}", e)))
}

pub(crate) fn api_base(org: &str, project: &str) -> String {
    format!("https://dev.azure.com/{}/{}/_apis", org, project)
}

pub(crate) fn ado_err(msg: impl std::fmt::Display) -> AppError {
    AppError::AzureDevOpsError(msg.to_string())
}

/// Verify PAT authentication by listing projects.
#[allow(dead_code)]
pub async fn check_auth(pat: &str, org: &str) -> Result<(), AppError> {
    let c = client(pat)?;
    let url = format!(
        "https://dev.azure.com/{}/_apis/projects?api-version=7.1&$top=1",
        org
    );
    let resp = c.get(&url).send().await.map_err(ado_err)?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(ado_err(format!(
            "Authentication failed (HTTP {}): {}",
            status, text
        )));
    }
    Ok(())
}
```

- [ ] **Step 2: Create `services/ado/pulls.rs`**

Move all PR functions from the old `ado.rs` — `create_pr`, `get_pr_by_branch`, `get_pr_checks`, `merge_pr`, `get_pr_threads`, `get_pr_reviewers`, `list_prs`. Each function calls `super::client()`, `super::api_base()`, `super::ado_err()` (or import from `super`).

```rust
use uuid::Uuid;

use crate::error::AppError;
use crate::models::pr::{
    MergeResult, PrCheck, PrComment, PrInfo, PrListItem, PrReview,
};

use super::{client, api_base, ado_err};
use super::mapping::*;

// Paste the full body of: create_pr, get_pr_by_branch, get_pr_checks,
// merge_pr, get_pr_threads, get_pr_reviewers, list_prs
// from the old ado.rs — unchanged except `client(` → `client(`, etc.
// (They already call top-level functions by name, which now resolve to super::)
```

Copy each function verbatim from the existing `ado.rs` (lines 55-384). The only change is the import paths — `client`, `api_base`, `ado_err` come from `super::`, and parsing helpers come from `super::mapping::*`.

- [ ] **Step 3: Create `services/ado/pipelines.rs`**

Move `get_pipeline_runs` and `get_build_timeline` from old `ado.rs`:

```rust
use crate::error::AppError;
use crate::models::pr::{WorkflowJob, WorkflowRun, WorkflowStep};

use super::{client, api_base, ado_err};
use super::mapping::*;

// Paste the full body of: get_pipeline_runs, get_build_timeline
// from old ado.rs (lines 387-475) — unchanged except imports.
```

- [ ] **Step 4: Create `services/ado/mapping.rs`**

Move all `map_*`, `parse_*` helpers and their `#[cfg(test)] mod tests` block:

```rust
use crate::models::pr::{
    PrCheck, PrInfo, PrListItem, WorkflowRun, WorkflowStep,
};
use uuid::Uuid;

// Paste: parse_pr_info, parse_pr_check, parse_pr_list_item, parse_workflow_run,
// map_pr_status, map_vote_to_state, map_check_state, map_build_status, map_build_result
// from old ado.rs (lines 477-638)
// Plus the #[cfg(test)] mod tests block (lines 640-775)

// All functions remain pub(crate) or pub as they were.
```

- [ ] **Step 5: Delete old `services/ado.rs`**

Remove `src-tauri/src/services/ado.rs`. The `pub mod ado;` in `services/mod.rs` now resolves to `services/ado/mod.rs` automatically — no change to `mod.rs` needed.

- [ ] **Step 6: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Compiles with no errors. All `ado_svc::function_name()` calls in `commands/` still resolve.

- [ ] **Step 7: Run existing backend tests**

Run: `cd src-tauri && cargo test`
Expected: All existing ADO tests pass (they moved to `mapping.rs` but the test runner finds them).

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/services/ado/ src-tauri/src/services/ado.rs
git commit -m "refactor: split services/ado.rs into submodules

Mirrors services/gh/ structure. No functional changes — mechanical move
of functions into ado/mod.rs, ado/pulls.rs, ado/pipelines.rs, ado/mapping.rs."
```

---

## Task 2: Add `TaskLog` model and extend `RunLogsResult`

**Files:**
- Modify: `src-tauri/src/models/pr.rs`
- Modify: `src/lib/tauri/types.ts`

- [ ] **Step 1: Add `TaskLog` struct to Rust models**

In `src-tauri/src/models/pr.rs`, add after the `RunLogsResult` struct (after line 172):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskLog {
    pub task_name: String,
    pub job_name: String,
    pub log_content: String,
    pub status: String,
    pub conclusion: Option<String>,
}
```

- [ ] **Step 2: Add `task_logs` field to `RunLogsResult`**

In `src-tauri/src/models/pr.rs`, modify `RunLogsResult`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunLogsResult {
    pub logs: String,
    pub truncated: bool,
    pub task_logs: Option<Vec<TaskLog>>,
}
```

- [ ] **Step 3: Fix the empty `RunLogsResult` in `pr_workflows.rs`**

In `src-tauri/src/commands/pr_workflows.rs`, the ADO fallback (line 82) needs the new field:

```rust
        // ADO log fetching not implemented in MVP
        _ => Ok(RunLogsResult {
            logs: String::new(),
            truncated: false,
            task_logs: None,
        }),
```

- [ ] **Step 4: Add TypeScript types**

In `src/lib/tauri/types.ts`, add after the `RunLogsResult` interface (after line 329):

```typescript
export interface TaskLog {
  taskName: string;
  jobName: string;
  logContent: string;
  status: string;
  conclusion: string | null;
}
```

Modify `RunLogsResult` to add the optional field:

```typescript
export interface RunLogsResult {
  logs: string;
  truncated: boolean;
  taskLogs?: TaskLog[];
}
```

- [ ] **Step 5: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Compiles with no errors.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/models/pr.rs src-tauri/src/commands/pr_workflows.rs src/lib/tauri/types.ts
git commit -m "feat: add TaskLog model and extend RunLogsResult for ADO pipeline logs"
```

---

## Task 3: Add Work Item data models

**Files:**
- Create: `src-tauri/src/models/work_item.rs`
- Modify: `src-tauri/src/models/mod.rs`
- Modify: `src/lib/tauri/types.ts`

- [ ] **Step 1: Create Rust work item models**

Create `src-tauri/src/models/work_item.rs`:

```rust
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkItemListItem {
    pub id: u32,
    pub title: String,
    pub work_item_type: String,
    pub state: String,
    pub assigned_to: Option<String>,
    pub area_path: Option<String>,
    pub iteration_path: Option<String>,
    pub parent_id: Option<u32>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
    pub description: Option<String>,
    pub acceptance_criteria: Option<String>,
    pub priority: Option<u32>,
    pub created_by: Option<String>,
    pub created_date: Option<String>,
    pub changed_date: Option<String>,
    pub linked_pr_ids: Vec<u32>,
    pub relations: Vec<WorkItemRelation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkItemRelation {
    pub rel_type: String,
    pub target_id: u32,
    pub target_title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkItemQueryType {
    AssignedToMe,
    LinkedToPr,
    RecentInIteration,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_work_item_list_item_serde_roundtrip() {
        let item = WorkItemListItem {
            id: 42,
            title: "Fix login bug".to_string(),
            work_item_type: "Bug".to_string(),
            state: "Active".to_string(),
            assigned_to: Some("Dev User".to_string()),
            area_path: Some("Project\\Team".to_string()),
            iteration_path: Some("Project\\Sprint 5".to_string()),
            parent_id: Some(10),
            tags: vec!["urgent".to_string()],
        };
        let json = serde_json::to_string(&item).unwrap();
        let deserialized: WorkItemListItem = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, 42);
        assert_eq!(deserialized.work_item_type, "Bug");
    }

    #[test]
    fn test_work_item_query_type_serde() {
        let qt = WorkItemQueryType::AssignedToMe;
        let json = serde_json::to_string(&qt).unwrap();
        assert_eq!(json, "\"assigned_to_me\"");

        let deserialized: WorkItemQueryType =
            serde_json::from_str("\"linked_to_pr\"").unwrap();
        assert!(matches!(deserialized, WorkItemQueryType::LinkedToPr));
    }
}
```

- [ ] **Step 2: Register module in `models/mod.rs`**

Add to `src-tauri/src/models/mod.rs`:

```rust
pub mod work_item;
```

- [ ] **Step 3: Add TypeScript work item types**

In `src/lib/tauri/types.ts`, add after the `IssueDetail` interface (after line 366):

```typescript
// Work Item types (Azure DevOps)
export type WorkItemQueryType = "assigned_to_me" | "linked_to_pr" | "recent_in_iteration";

export interface WorkItemListItem {
  id: number;
  title: string;
  workItemType: string;
  state: string;
  assignedTo: string | null;
  areaPath: string | null;
  iterationPath: string | null;
  parentId: number | null;
  tags: string[];
}

export interface WorkItemDetail {
  id: number;
  title: string;
  workItemType: string;
  state: string;
  assignedTo: string | null;
  areaPath: string | null;
  iterationPath: string | null;
  parentId: number | null;
  tags: string[];
  description: string | null;
  acceptanceCriteria: string | null;
  priority: number | null;
  createdBy: string | null;
  createdDate: string | null;
  changedDate: string | null;
  linkedPrIds: number[];
  relations: WorkItemRelation[];
}

export interface WorkItemRelation {
  relType: string;
  targetId: number;
  targetTitle: string | null;
}

export interface CreateWorkItemRequest {
  workspaceId: string;
  workItemType: string;
  title: string;
  description?: string | null;
  assignedTo?: string | null;
  areaPath?: string | null;
  iterationPath?: string | null;
  parentId?: number | null;
  tags: string[];
}
```

- [ ] **Step 4: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Compiles. Models are defined but not yet used.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/models/work_item.rs src-tauri/src/models/mod.rs src/lib/tauri/types.ts
git commit -m "feat: add WorkItem data models for ADO work item support"
```

---

## Task 4: Implement `services/ado/work_items.rs`

**Files:**
- Create: `src-tauri/src/services/ado/work_items.rs`
- Modify: `src-tauri/src/services/ado/mod.rs`

- [ ] **Step 1: Write parsing tests first**

Create `src-tauri/src/services/ado/work_items.rs` with test fixtures:

```rust
use crate::error::AppError;
use crate::models::work_item::{
    CreateWorkItemRequest, WorkItemDetail, WorkItemListItem, WorkItemQueryType, WorkItemRelation,
};

use super::{api_base, ado_err, client};

// --- Parsing helpers ---

fn parse_work_item_list(value: &serde_json::Value) -> WorkItemListItem {
    let fields = &value["fields"];
    let id = value["id"].as_u64().unwrap_or(0) as u32;

    let tags_str = fields["System.Tags"].as_str().unwrap_or("");
    let tags: Vec<String> = if tags_str.is_empty() {
        Vec::new()
    } else {
        tags_str.split("; ").map(|s| s.trim().to_string()).collect()
    };

    let parent_id = fields["System.Parent"].as_u64().map(|v| v as u32);

    WorkItemListItem {
        id,
        title: fields["System.Title"].as_str().unwrap_or("").to_string(),
        work_item_type: fields["System.WorkItemType"].as_str().unwrap_or("").to_string(),
        state: fields["System.State"].as_str().unwrap_or("").to_string(),
        assigned_to: fields["System.AssignedTo"]["displayName"]
            .as_str()
            .map(|s| s.to_string()),
        area_path: fields["System.AreaPath"].as_str().map(|s| s.to_string()),
        iteration_path: fields["System.IterationPath"].as_str().map(|s| s.to_string()),
        parent_id,
        tags,
    }
}

fn parse_work_item_detail(value: &serde_json::Value) -> WorkItemDetail {
    let list = parse_work_item_list(value);
    let fields = &value["fields"];

    let mut linked_pr_ids = Vec::new();
    let mut relations = Vec::new();

    if let Some(rels) = value["relations"].as_array() {
        for rel in rels {
            let rel_type_url = rel["rel"].as_str().unwrap_or("");
            let url = rel["url"].as_str().unwrap_or("");

            // ArtifactLink for PRs: vstfs:///Git/PullRequestId/{project}%2F{repo}%2F{id}
            if rel_type_url == "ArtifactLink" {
                if let Some(artifact_url) = rel["url"].as_str() {
                    if artifact_url.contains("Git/PullRequestId") {
                        // Extract PR ID from the end of the URL after last %2F
                        if let Some(id_str) = artifact_url.rsplit("%2F").next() {
                            if let Ok(pr_id) = id_str.parse::<u32>() {
                                linked_pr_ids.push(pr_id);
                            }
                        }
                    }
                }
                continue;
            }

            // Parent/Child/Related relations
            let mapped_type = match rel_type_url {
                "System.LinkTypes.Hierarchy-Reverse" => "Parent",
                "System.LinkTypes.Hierarchy-Forward" => "Child",
                "System.LinkTypes.Related" => "Related",
                _ => continue,
            };

            // Extract work item ID from URL (last segment)
            let target_id = url
                .rsplit('/')
                .next()
                .and_then(|s| s.parse::<u32>().ok())
                .unwrap_or(0);

            let target_title = rel["attributes"]["name"]
                .as_str()
                .map(|s| s.to_string());

            relations.push(WorkItemRelation {
                rel_type: mapped_type.to_string(),
                target_id,
                target_title,
            });
        }
    }

    WorkItemDetail {
        id: list.id,
        title: list.title,
        work_item_type: list.work_item_type,
        state: list.state,
        assigned_to: list.assigned_to,
        area_path: list.area_path,
        iteration_path: list.iteration_path,
        parent_id: list.parent_id,
        tags: list.tags,
        description: fields["System.Description"].as_str().map(|s| s.to_string()),
        acceptance_criteria: fields["Microsoft.VSTS.Common.AcceptanceCriteria"]
            .as_str()
            .map(|s| s.to_string()),
        priority: fields["Microsoft.VSTS.Common.Priority"].as_u64().map(|v| v as u32),
        created_by: fields["System.CreatedBy"]["displayName"]
            .as_str()
            .map(|s| s.to_string()),
        created_date: fields["System.CreatedDate"].as_str().map(|s| s.to_string()),
        changed_date: fields["System.ChangedDate"].as_str().map(|s| s.to_string()),
        linked_pr_ids,
        relations,
    }
}

fn build_wiql_assigned_to_me() -> String {
    "SELECT [System.Id] FROM WorkItems \
     WHERE [System.AssignedTo] = @Me \
     AND [System.State] <> 'Closed' AND [System.State] <> 'Removed' \
     ORDER BY [System.ChangedDate] DESC"
        .to_string()
}

fn build_wiql_recent_in_iteration(iteration_path: &str) -> String {
    format!(
        "SELECT [System.Id] FROM WorkItems \
         WHERE [System.IterationPath] = '{}' \
         AND [System.State] <> 'Removed' \
         ORDER BY [System.ChangedDate] DESC",
        iteration_path
    )
}

// --- API functions ---

/// List work items using predefined queries.
pub async fn list_work_items(
    pat: &str,
    org: &str,
    project: &str,
    repo_name: &str,
    pr_id: Option<u64>,
    query_type: &WorkItemQueryType,
) -> Result<Vec<WorkItemListItem>, AppError> {
    match query_type {
        WorkItemQueryType::AssignedToMe => {
            let ids = run_wiql(pat, org, project, &build_wiql_assigned_to_me()).await?;
            batch_get_work_items(pat, org, project, &ids).await
        }
        WorkItemQueryType::LinkedToPr => {
            let Some(pr_id) = pr_id else {
                return Ok(Vec::new());
            };
            let ids = get_pr_linked_work_item_ids(pat, org, project, repo_name, pr_id).await?;
            batch_get_work_items(pat, org, project, &ids).await
        }
        WorkItemQueryType::RecentInIteration => {
            match get_current_iteration_path(pat, org, project).await? {
                Some(path) => {
                    let ids = run_wiql(pat, org, project, &build_wiql_recent_in_iteration(&path)).await?;
                    batch_get_work_items(pat, org, project, &ids).await
                }
                None => Ok(Vec::new()),
            }
        }
    }
}

/// Get detailed info for a single work item.
pub async fn get_work_item_detail(
    pat: &str,
    org: &str,
    project: &str,
    work_item_id: u32,
) -> Result<WorkItemDetail, AppError> {
    let c = client(pat)?;
    let url = format!(
        "{}/wit/workitems/{}?$expand=relations&api-version=7.1",
        api_base(org, project),
        work_item_id
    );

    let resp = c.get(&url).send().await.map_err(ado_err)?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(ado_err(format!(
            "Get work item failed (HTTP {}): {}",
            status, text
        )));
    }

    let raw: serde_json::Value = resp.json().await.map_err(ado_err)?;
    Ok(parse_work_item_detail(&raw))
}

/// Create a new work item.
pub async fn create_work_item(
    pat: &str,
    org: &str,
    project: &str,
    work_item_type: &str,
    title: &str,
    description: Option<&str>,
    assigned_to: Option<&str>,
    area_path: Option<&str>,
    iteration_path: Option<&str>,
    parent_id: Option<u32>,
    tags: &[String],
) -> Result<WorkItemListItem, AppError> {
    let c = client(pat)?;
    let url = format!(
        "{}/wit/workitems/${}?api-version=7.1",
        api_base(org, project),
        work_item_type
    );

    let mut ops = vec![serde_json::json!({
        "op": "add",
        "path": "/fields/System.Title",
        "value": title
    })];

    if let Some(desc) = description {
        ops.push(serde_json::json!({
            "op": "add",
            "path": "/fields/System.Description",
            "value": desc
        }));
    }
    if let Some(assignee) = assigned_to {
        ops.push(serde_json::json!({
            "op": "add",
            "path": "/fields/System.AssignedTo",
            "value": assignee
        }));
    }
    if let Some(area) = area_path {
        ops.push(serde_json::json!({
            "op": "add",
            "path": "/fields/System.AreaPath",
            "value": area
        }));
    }
    if let Some(iteration) = iteration_path {
        ops.push(serde_json::json!({
            "op": "add",
            "path": "/fields/System.IterationPath",
            "value": iteration
        }));
    }
    if !tags.is_empty() {
        ops.push(serde_json::json!({
            "op": "add",
            "path": "/fields/System.Tags",
            "value": tags.join("; ")
        }));
    }
    if let Some(pid) = parent_id {
        ops.push(serde_json::json!({
            "op": "add",
            "path": "/relations/-",
            "value": {
                "rel": "System.LinkTypes.Hierarchy-Reverse",
                "url": format!("{}/wit/workitems/{}", api_base(org, project), pid)
            }
        }));
    }

    let resp = c
        .post(&url)
        .header("Content-Type", "application/json-patch+json")
        .json(&ops)
        .send()
        .await
        .map_err(ado_err)?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(ado_err(format!(
            "Create work item failed (HTTP {}): {}",
            status, text
        )));
    }

    let raw: serde_json::Value = resp.json().await.map_err(ado_err)?;
    Ok(parse_work_item_list(&raw))
}

/// Update work item state.
pub async fn update_work_item_state(
    pat: &str,
    org: &str,
    project: &str,
    work_item_id: u32,
    new_state: &str,
) -> Result<WorkItemListItem, AppError> {
    let c = client(pat)?;
    let url = format!(
        "{}/wit/workitems/{}?api-version=7.1",
        api_base(org, project),
        work_item_id
    );

    let ops = vec![serde_json::json!({
        "op": "replace",
        "path": "/fields/System.State",
        "value": new_state
    })];

    let resp = c
        .patch(&url)
        .header("Content-Type", "application/json-patch+json")
        .json(&ops)
        .send()
        .await
        .map_err(ado_err)?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(ado_err(format!(
            "Update work item state failed (HTTP {}): {}",
            status, text
        )));
    }

    let raw: serde_json::Value = resp.json().await.map_err(ado_err)?;
    Ok(parse_work_item_list(&raw))
}

/// Link a work item to a pull request.
pub async fn link_work_item_to_pr(
    pat: &str,
    org: &str,
    project: &str,
    repo_name: &str,
    work_item_id: u32,
    pr_id: u32,
) -> Result<(), AppError> {
    let c = client(pat)?;
    let url = format!(
        "{}/wit/workitems/{}?api-version=7.1",
        api_base(org, project),
        work_item_id
    );

    // ADO uses vstfs artifact links for PR associations
    let artifact_url = format!(
        "vstfs:///Git/PullRequestId/{}%2F{}%2F{}",
        project, repo_name, pr_id
    );

    let ops = vec![serde_json::json!({
        "op": "add",
        "path": "/relations/-",
        "value": {
            "rel": "ArtifactLink",
            "url": artifact_url,
            "attributes": {
                "name": "Pull Request"
            }
        }
    })];

    let resp = c
        .patch(&url)
        .header("Content-Type", "application/json-patch+json")
        .json(&ops)
        .send()
        .await
        .map_err(ado_err)?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(ado_err(format!(
            "Link work item to PR failed (HTTP {}): {}",
            status, text
        )));
    }

    Ok(())
}

// --- Internal helpers ---

async fn run_wiql(
    pat: &str,
    org: &str,
    project: &str,
    query: &str,
) -> Result<Vec<u32>, AppError> {
    let c = client(pat)?;
    let url = format!("{}/wit/wiql?api-version=7.1", api_base(org, project));
    let payload = serde_json::json!({ "query": query });

    let resp = c.post(&url).json(&payload).send().await.map_err(ado_err)?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(ado_err(format!("WIQL query failed (HTTP {}): {}", status, text)));
    }

    let raw: serde_json::Value = resp.json().await.map_err(ado_err)?;
    let ids = raw["workItems"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|wi| wi["id"].as_u64().map(|id| id as u32))
                .take(50) // Limit to 50 results
                .collect()
        })
        .unwrap_or_default();

    Ok(ids)
}

async fn batch_get_work_items(
    pat: &str,
    org: &str,
    project: &str,
    ids: &[u32],
) -> Result<Vec<WorkItemListItem>, AppError> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }

    let c = client(pat)?;
    let ids_csv: String = ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(",");
    let url = format!(
        "{}/wit/workitems?ids={}&$expand=relations&api-version=7.1",
        api_base(org, project),
        ids_csv
    );

    let resp = c.get(&url).send().await.map_err(ado_err)?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(ado_err(format!(
            "Batch get work items failed (HTTP {}): {}",
            status, text
        )));
    }

    let raw: serde_json::Value = resp.json().await.map_err(ado_err)?;
    let items = raw["value"].as_array().cloned().unwrap_or_default();

    Ok(items.iter().map(parse_work_item_list).collect())
}

async fn get_pr_linked_work_item_ids(
    pat: &str,
    org: &str,
    project: &str,
    repo_name: &str,
    pr_id: u64,
) -> Result<Vec<u32>, AppError> {
    let c = client(pat)?;
    let url = format!(
        "{}/git/repositories/{}/pullrequests/{}/workitems?api-version=7.1",
        api_base(org, project),
        repo_name,
        pr_id
    );

    let resp = c.get(&url).send().await.map_err(ado_err)?;

    if !resp.status().is_success() {
        return Ok(Vec::new());
    }

    let raw: serde_json::Value = resp.json().await.map_err(ado_err)?;
    let items = raw["value"].as_array().cloned().unwrap_or_default();

    Ok(items
        .iter()
        .filter_map(|wi| {
            // The URL field contains the work item URL; extract ID from end
            wi["url"]
                .as_str()
                .and_then(|url| url.rsplit('/').next())
                .and_then(|id| id.parse::<u32>().ok())
        })
        .collect())
}

async fn get_current_iteration_path(
    pat: &str,
    org: &str,
    project: &str,
) -> Result<Option<String>, AppError> {
    let c = client(pat)?;
    let url = format!(
        "{}/work/teamsettings/iterations?$timeframe=current&api-version=7.1",
        api_base(org, project)
    );

    let resp = c.get(&url).send().await.map_err(ado_err)?;

    if !resp.status().is_success() {
        // No team/iteration configured — not an error
        return Ok(None);
    }

    let raw: serde_json::Value = resp.json().await.map_err(ado_err)?;
    let path = raw["value"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|iter| iter["path"].as_str())
        .map(|s| s.to_string());

    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_work_item_list() {
        let json = serde_json::json!({
            "id": 42,
            "fields": {
                "System.Title": "Fix login bug",
                "System.WorkItemType": "Bug",
                "System.State": "Active",
                "System.AssignedTo": { "displayName": "Dev User" },
                "System.AreaPath": "Project\\Team",
                "System.IterationPath": "Project\\Sprint 5",
                "System.Parent": 10,
                "System.Tags": "urgent; backend"
            }
        });

        let item = parse_work_item_list(&json);
        assert_eq!(item.id, 42);
        assert_eq!(item.title, "Fix login bug");
        assert_eq!(item.work_item_type, "Bug");
        assert_eq!(item.state, "Active");
        assert_eq!(item.assigned_to.as_deref(), Some("Dev User"));
        assert_eq!(item.area_path.as_deref(), Some("Project\\Team"));
        assert_eq!(item.parent_id, Some(10));
        assert_eq!(item.tags, vec!["urgent", "backend"]);
    }

    #[test]
    fn test_parse_work_item_detail_with_relations() {
        let json = serde_json::json!({
            "id": 42,
            "fields": {
                "System.Title": "Fix login bug",
                "System.WorkItemType": "Bug",
                "System.State": "Active",
                "System.Description": "<p>Login fails</p>",
                "Microsoft.VSTS.Common.AcceptanceCriteria": "<p>Login works</p>",
                "Microsoft.VSTS.Common.Priority": 1,
                "System.CreatedBy": { "displayName": "Admin" },
                "System.CreatedDate": "2026-01-01T00:00:00Z",
                "System.ChangedDate": "2026-01-02T00:00:00Z",
                "System.Tags": ""
            },
            "relations": [
                {
                    "rel": "System.LinkTypes.Hierarchy-Reverse",
                    "url": "https://dev.azure.com/org/project/_apis/wit/workitems/10",
                    "attributes": { "name": "Parent Story" }
                },
                {
                    "rel": "System.LinkTypes.Hierarchy-Forward",
                    "url": "https://dev.azure.com/org/project/_apis/wit/workitems/50",
                    "attributes": { "name": "Sub-task" }
                },
                {
                    "rel": "ArtifactLink",
                    "url": "vstfs:///Git/PullRequestId/project%2Frepo%2F99",
                    "attributes": { "name": "Pull Request" }
                }
            ]
        });

        let detail = parse_work_item_detail(&json);
        assert_eq!(detail.id, 42);
        assert_eq!(detail.description.as_deref(), Some("<p>Login fails</p>"));
        assert_eq!(detail.priority, Some(1));
        assert_eq!(detail.linked_pr_ids, vec![99]);
        assert_eq!(detail.relations.len(), 2);
        assert_eq!(detail.relations[0].rel_type, "Parent");
        assert_eq!(detail.relations[0].target_id, 10);
        assert_eq!(detail.relations[1].rel_type, "Child");
        assert_eq!(detail.relations[1].target_id, 50);
    }

    #[test]
    fn test_parse_work_item_list_empty_tags() {
        let json = serde_json::json!({
            "id": 1,
            "fields": {
                "System.Title": "Task",
                "System.WorkItemType": "Task",
                "System.State": "New",
                "System.Tags": ""
            }
        });

        let item = parse_work_item_list(&json);
        assert!(item.tags.is_empty());
    }

    #[test]
    fn test_build_wiql_assigned_to_me() {
        let wiql = build_wiql_assigned_to_me();
        assert!(wiql.contains("@Me"));
        assert!(wiql.contains("Closed"));
        assert!(wiql.contains("Removed"));
    }

    #[test]
    fn test_build_wiql_recent_in_iteration() {
        let wiql = build_wiql_recent_in_iteration("Project\\Sprint 5");
        assert!(wiql.contains("Project\\Sprint 5"));
        assert!(wiql.contains("Removed"));
    }
}
```

- [ ] **Step 2: Register module in `ado/mod.rs`**

Add to `src-tauri/src/services/ado/mod.rs`:

```rust
mod work_items;
// ... existing mods ...

pub use work_items::*;
// ... existing re-exports ...
```

- [ ] **Step 3: Verify compilation and run tests**

Run: `cd src-tauri && cargo test -- work_items`
Expected: All 5 parsing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/services/ado/work_items.rs src-tauri/src/services/ado/mod.rs
git commit -m "feat: implement ADO work items service with WIQL queries and CRUD"
```

---

## Task 5: Implement pipeline logs and rerun in `services/ado/pipelines.rs`

**Files:**
- Modify: `src-tauri/src/services/ado/pipelines.rs`

- [ ] **Step 1: Add `get_build_logs` function**

Add to `src-tauri/src/services/ado/pipelines.rs`:

```rust
use crate::models::pr::{TaskLog, RunLogsResult};

use super::{client, api_base, ado_err};
use super::mapping::{map_build_status, map_build_result};

/// Fetch structured build logs for an ADO pipeline run.
pub async fn get_build_logs(
    pat: &str,
    org: &str,
    project: &str,
    build_id: u64,
    failed_only: bool,
) -> Result<RunLogsResult, AppError> {
    // First get the timeline to know which tasks have logs
    let jobs = get_build_timeline(pat, org, project, build_id).await?;

    let c = client(pat)?;
    let mut task_logs = Vec::new();
    let mut all_logs = String::new();

    for job in &jobs {
        for step in &job.steps {
            // If failed_only, skip non-failed steps
            if failed_only && step.conclusion.as_deref() != Some("failure") {
                continue;
            }

            // Fetch the log for this step from the timeline records
            // We need the log ID from the timeline — re-fetch timeline for log IDs
            // (the WorkflowStep model doesn't carry log IDs, so we fetch raw timeline)
        }
    }

    // Fetch raw timeline for log IDs
    let timeline_url = format!(
        "{}/build/builds/{}/timeline?api-version=7.1",
        api_base(org, project),
        build_id
    );
    let timeline_resp = c.get(&timeline_url).send().await.map_err(ado_err)?;
    if !timeline_resp.status().is_success() {
        return Ok(RunLogsResult {
            logs: String::new(),
            truncated: false,
            task_logs: Some(Vec::new()),
        });
    }

    let timeline_raw: serde_json::Value = timeline_resp.json().await.map_err(ado_err)?;
    let records = timeline_raw["records"].as_array().cloned().unwrap_or_default();

    // Build a map of job IDs to job names
    let job_names: std::collections::HashMap<String, String> = records
        .iter()
        .filter(|r| r["type"].as_str() == Some("Job"))
        .filter_map(|r| {
            let id = r["id"].as_str()?.to_string();
            let name = r["name"].as_str()?.to_string();
            Some((id, name))
        })
        .collect();

    // Process task records that have logs
    for record in &records {
        if record["type"].as_str() != Some("Task") {
            continue;
        }

        let log_id = match record["log"]["id"].as_u64() {
            Some(id) => id,
            None => continue,
        };

        let result = record["result"].as_str().unwrap_or("");
        let status = map_build_status(record["state"].as_str().unwrap_or(""));

        if failed_only && result != "failed" {
            continue;
        }

        let task_name = record["name"].as_str().unwrap_or("Unknown").to_string();
        let parent_id = record["parentId"].as_str().unwrap_or("");
        let job_name = job_names
            .get(parent_id)
            .cloned()
            .unwrap_or_else(|| "Unknown Job".to_string());

        // Fetch the actual log content
        let log_url = format!(
            "{}/build/builds/{}/logs/{}?api-version=7.1",
            api_base(org, project),
            build_id,
            log_id
        );

        let log_content = match c.get(&log_url).send().await {
            Ok(resp) if resp.status().is_success() => {
                resp.text().await.unwrap_or_default()
            }
            _ => "(log unavailable)".to_string(),
        };

        all_logs.push_str(&format!("=== {} / {} ===\n{}\n\n", job_name, task_name, log_content));

        task_logs.push(TaskLog {
            task_name,
            job_name,
            log_content,
            status,
            conclusion: if result.is_empty() { None } else { Some(map_build_result(result)) },
        });
    }

    let truncated = all_logs.len() > 500_000;
    if truncated {
        all_logs.truncate(500_000);
    }

    Ok(RunLogsResult {
        logs: all_logs,
        truncated,
        task_logs: Some(task_logs),
    })
}

/// Re-run (re-queue) an ADO pipeline build.
pub async fn rerun_build(
    pat: &str,
    org: &str,
    project: &str,
    build_id: u64,
) -> Result<(), AppError> {
    let c = client(pat)?;

    // First fetch the original build to get its definition
    let get_url = format!(
        "{}/build/builds/{}?api-version=7.1",
        api_base(org, project),
        build_id
    );
    let get_resp = c.get(&get_url).send().await.map_err(ado_err)?;

    if !get_resp.status().is_success() {
        return Err(ado_err("Failed to fetch build for rerun"));
    }

    let build_data: serde_json::Value = get_resp.json().await.map_err(ado_err)?;
    let definition_id = build_data["definition"]["id"]
        .as_u64()
        .ok_or_else(|| ado_err("Build has no definition ID"))?;
    let source_branch = build_data["sourceBranch"]
        .as_str()
        .unwrap_or("refs/heads/main")
        .to_string();

    // Queue a new build
    let queue_url = format!(
        "{}/build/builds?api-version=7.1",
        api_base(org, project)
    );
    let payload = serde_json::json!({
        "definition": { "id": definition_id },
        "sourceBranch": source_branch
    });

    let resp = c.post(&queue_url).json(&payload).send().await.map_err(ado_err)?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(ado_err(format!(
            "Rerun build failed (HTTP {}): {}",
            status, text
        )));
    }

    Ok(())
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Compiles.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/services/ado/pipelines.rs
git commit -m "feat: implement ADO pipeline log fetching and build rerun"
```

---

## Task 6: Add `get_pr_detail` to `services/ado/pulls.rs`

**Files:**
- Modify: `src-tauri/src/services/ado/pulls.rs`

- [ ] **Step 1: Write the test**

Add to the `#[cfg(test)] mod tests` in `pulls.rs`:

```rust
#[test]
fn test_parse_pr_detail() {
    let json = serde_json::json!({
        "pullRequestId": 42,
        "title": "Feature branch",
        "sourceRefName": "refs/heads/feature/test",
        "targetRefName": "refs/heads/main",
        "description": "This adds a new feature",
        "status": "active",
        "repository": {
            "webUrl": "https://dev.azure.com/org/project/_git/repo"
        }
    });

    let detail = parse_pr_detail(&json);
    assert_eq!(detail.number, 42);
    assert_eq!(detail.title, "Feature branch");
    assert_eq!(detail.head_branch, "feature/test");
    assert_eq!(detail.base_branch, "main");
    assert_eq!(detail.body, "This adds a new feature");
    assert_eq!(detail.state, "OPEN");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test -- test_parse_pr_detail`
Expected: FAIL — `parse_pr_detail` not defined.

- [ ] **Step 3: Implement `parse_pr_detail` and `get_pr_detail`**

Add to `src-tauri/src/services/ado/pulls.rs`:

```rust
use crate::models::pr::PrDetail;

fn parse_pr_detail(pr: &serde_json::Value) -> PrDetail {
    let pr_id = pr["pullRequestId"].as_u64().unwrap_or(0) as u32;
    let source = pr["sourceRefName"]
        .as_str()
        .unwrap_or("")
        .strip_prefix("refs/heads/")
        .unwrap_or("")
        .to_string();
    let target = pr["targetRefName"]
        .as_str()
        .unwrap_or("")
        .strip_prefix("refs/heads/")
        .unwrap_or("")
        .to_string();
    let web_url = pr["repository"]["webUrl"]
        .as_str()
        .map(|base| format!("{}/pullrequest/{}", base, pr_id))
        .unwrap_or_default();

    PrDetail {
        number: pr_id,
        title: pr["title"].as_str().unwrap_or("").to_string(),
        head_branch: source,
        base_branch: target,
        body: pr["description"].as_str().unwrap_or("").to_string(),
        state: map_pr_status(pr["status"].as_str().unwrap_or("unknown")),
        url: web_url,
    }
}

/// Get detailed PR info by PR number.
pub async fn get_pr_detail(
    pat: &str,
    org: &str,
    project: &str,
    repo_name: &str,
    pr_number: u32,
) -> Result<PrDetail, AppError> {
    let c = client(pat)?;
    let url = format!(
        "{}/git/repositories/{}/pullrequests/{}?api-version=7.1",
        api_base(org, project),
        repo_name,
        pr_number
    );

    let resp = c.get(&url).send().await.map_err(ado_err)?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(ado_err(format!(
            "Get PR detail failed (HTTP {}): {}",
            status, text
        )));
    }

    let raw: serde_json::Value = resp.json().await.map_err(ado_err)?;
    Ok(parse_pr_detail(&raw))
}
```

Note: `map_pr_status` is imported from `super::mapping::*`.

- [ ] **Step 4: Run tests**

Run: `cd src-tauri && cargo test -- test_parse_pr_detail`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/services/ado/pulls.rs
git commit -m "feat: implement ADO PR detail endpoint"
```

---

## Task 7: Add `commands/work_items.rs` and register handlers

**Files:**
- Create: `src-tauri/src/commands/work_items.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create the command module**

Create `src-tauri/src/commands/work_items.rs`:

```rust
use crate::commands::pr::{get_ado_pat, parse_ado_url, parse_ws_id, ws_context};
use crate::error::AppError;
use crate::models::repository::GitProvider;
use crate::models::work_item::{
    CreateWorkItemRequest, WorkItemDetail, WorkItemListItem, WorkItemQueryType,
};
use crate::services::ado as ado_svc;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_work_items(
    state: State<'_, AppState>,
    workspace_id: String,
    query_type: WorkItemQueryType,
) -> Result<Vec<WorkItemListItem>, AppError> {
    let ws_id = parse_ws_id(&workspace_id)?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, repo_name) = parse_ado_url(&ctx.remote_url)?;

            // For LinkedToPr, we need the PR number
            let pr_id = if matches!(query_type, WorkItemQueryType::LinkedToPr) {
                let pr_info = ado_svc::get_pr_by_branch(
                    &pat, &org, &project, &repo_name, &ctx.branch, ws_id,
                )
                .await?;
                pr_info.and_then(|p| p.pr_number)
            } else {
                None
            };

            ado_svc::list_work_items(&pat, &org, &project, &repo_name, pr_id, &query_type).await
        }
        _ => Err(AppError::AzureDevOpsError(
            "Work items are only available for Azure DevOps repositories.".into(),
        )),
    }
}

#[tauri::command]
pub async fn get_work_item_detail(
    state: State<'_, AppState>,
    workspace_id: String,
    work_item_id: u32,
) -> Result<WorkItemDetail, AppError> {
    let ws_id = parse_ws_id(&workspace_id)?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, _repo_name) = parse_ado_url(&ctx.remote_url)?;
            ado_svc::get_work_item_detail(&pat, &org, &project, work_item_id).await
        }
        _ => Err(AppError::AzureDevOpsError(
            "Work items are only available for Azure DevOps repositories.".into(),
        )),
    }
}

#[tauri::command]
pub async fn create_work_item(
    state: State<'_, AppState>,
    request: CreateWorkItemRequest,
) -> Result<WorkItemListItem, AppError> {
    let ws_id = parse_ws_id(&request.workspace_id.to_string())?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, _repo_name) = parse_ado_url(&ctx.remote_url)?;
            ado_svc::create_work_item(
                &pat,
                &org,
                &project,
                &request.work_item_type,
                &request.title,
                request.description.as_deref(),
                request.assigned_to.as_deref(),
                request.area_path.as_deref(),
                request.iteration_path.as_deref(),
                request.parent_id,
                &request.tags,
            )
            .await
        }
        _ => Err(AppError::AzureDevOpsError(
            "Work items are only available for Azure DevOps repositories.".into(),
        )),
    }
}

#[tauri::command]
pub async fn update_work_item_state(
    state: State<'_, AppState>,
    workspace_id: String,
    work_item_id: u32,
    new_state: String,
) -> Result<WorkItemListItem, AppError> {
    let ws_id = parse_ws_id(&workspace_id)?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, _repo_name) = parse_ado_url(&ctx.remote_url)?;
            ado_svc::update_work_item_state(&pat, &org, &project, work_item_id, &new_state).await
        }
        _ => Err(AppError::AzureDevOpsError(
            "Work items are only available for Azure DevOps repositories.".into(),
        )),
    }
}

#[tauri::command]
pub async fn link_work_item_to_pr(
    state: State<'_, AppState>,
    workspace_id: String,
    work_item_id: u32,
    pr_id: u32,
) -> Result<(), AppError> {
    let ws_id = parse_ws_id(&workspace_id)?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, repo_name) = parse_ado_url(&ctx.remote_url)?;
            ado_svc::link_work_item_to_pr(
                &pat, &org, &project, &repo_name, work_item_id, pr_id,
            )
            .await
        }
        _ => Err(AppError::AzureDevOpsError(
            "Work items are only available for Azure DevOps repositories.".into(),
        )),
    }
}
```

- [ ] **Step 2: Register in `commands/mod.rs`**

Add to `src-tauri/src/commands/mod.rs`:

```rust
pub mod work_items;
```

- [ ] **Step 3: Register handlers in `lib.rs`**

In `src-tauri/src/lib.rs`, add after the PR workflow commands section (after line 153):

```rust
            // Work item commands
            commands::work_items::list_work_items,
            commands::work_items::get_work_item_detail,
            commands::work_items::create_work_item,
            commands::work_items::update_work_item_state,
            commands::work_items::link_work_item_to_pr,
```

- [ ] **Step 4: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Compiles with no errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/work_items.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat: add Tauri commands for ADO work items CRUD"
```

---

## Task 8: Fill ADO match arms in `pr_workflows.rs` and `pr_issues.rs`

**Files:**
- Modify: `src-tauri/src/commands/pr_workflows.rs`
- Modify: `src-tauri/src/commands/pr_issues.rs`

- [ ] **Step 1: Fill `get_run_logs` ADO match arm**

In `src-tauri/src/commands/pr_workflows.rs`, replace the ADO fallback (lines 81-86):

```rust
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, _repo_name) = parse_ado_url(&ctx.remote_url)?;
            ado_svc::get_build_logs(&pat, &org, &project, run_id, failed_only).await
        }
```

- [ ] **Step 2: Fill `rerun_workflow` ADO match arm**

In `src-tauri/src/commands/pr_workflows.rs`, replace the ADO error (lines 107-110):

```rust
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, _repo_name) = parse_ado_url(&ctx.remote_url)?;
            // ADO does not support partial reruns — always queues a full new build
            ado_svc::rerun_build(&pat, &org, &project, run_id).await
        }
```

- [ ] **Step 3: Fill `get_pr_details` ADO match arm**

In `src-tauri/src/commands/pr_issues.rs`, replace the ADO error (lines 68-72):

```rust
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, repo_name) = parse_ado_url(&ctx.remote_url)?;
            ado_svc::get_pr_detail(&pat, &org, &project, &repo_name, pr_number).await
        }
```

- [ ] **Step 4: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Compiles.

- [ ] **Step 5: Run all backend tests**

Run: `cd src-tauri && cargo test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/pr_workflows.rs src-tauri/src/commands/pr_issues.rs
git commit -m "feat: fill ADO match arms for pipeline logs, rerun, and PR details"
```

---

## Task 9: Frontend IPC wrappers for work items

**Files:**
- Create: `src/lib/tauri/workItems.ts`
- Modify: `src/lib/tauri/index.ts`

- [ ] **Step 1: Create work items IPC module**

Create `src/lib/tauri/workItems.ts`:

```typescript
import { instrumentedInvoke as invoke } from "../ipcInstrumentation";
import type {
  WorkItemListItem,
  WorkItemDetail,
  WorkItemQueryType,
  CreateWorkItemRequest,
} from "./types";

export async function listWorkItems(
  workspaceId: string,
  queryType: WorkItemQueryType,
): Promise<WorkItemListItem[]> {
  return invoke<WorkItemListItem[]>("list_work_items", {
    workspaceId,
    queryType,
  });
}

export async function getWorkItemDetail(
  workspaceId: string,
  workItemId: number,
): Promise<WorkItemDetail> {
  return invoke<WorkItemDetail>("get_work_item_detail", {
    workspaceId,
    workItemId,
  });
}

export async function createWorkItem(
  request: CreateWorkItemRequest,
): Promise<WorkItemListItem> {
  return invoke<WorkItemListItem>("create_work_item", { request });
}

export async function updateWorkItemState(
  workspaceId: string,
  workItemId: number,
  newState: string,
): Promise<WorkItemListItem> {
  return invoke<WorkItemListItem>("update_work_item_state", {
    workspaceId,
    workItemId,
    newState,
  });
}

export async function linkWorkItemToPr(
  workspaceId: string,
  workItemId: number,
  prId: number,
): Promise<void> {
  return invoke("link_work_item_to_pr", { workspaceId, workItemId, prId });
}
```

- [ ] **Step 2: Add to barrel export**

In `src/lib/tauri/index.ts`, add:

```typescript
export * from "./workItems";
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/tauri/workItems.ts src/lib/tauri/index.ts
git commit -m "feat: add frontend IPC wrappers for work item commands"
```

---

## Task 10: Work item Zustand store

**Files:**
- Create: `src/stores/workItemStore.ts`

- [ ] **Step 1: Create the store**

Create `src/stores/workItemStore.ts`:

```typescript
import { create } from "zustand";
import type {
  WorkItemListItem,
  WorkItemDetail,
  WorkItemQueryType,
  CreateWorkItemRequest,
} from "../lib/tauri";
import {
  listWorkItems as listWorkItemsCmd,
  getWorkItemDetail as getWorkItemDetailCmd,
  createWorkItem as createWorkItemCmd,
  updateWorkItemState as updateWorkItemStateCmd,
  linkWorkItemToPr as linkWorkItemToPrCmd,
} from "../lib/tauri";

// Deduplication sets
const _inflightWorkItems = new Set<string>();
const _inflightDetails = new Set<string>();

interface WorkItemStore {
  workItems: Record<string, WorkItemListItem[]>;
  workItemDetail: Record<string, WorkItemDetail>;
  activeQuery: Record<string, WorkItemQueryType>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;

  loadWorkItems: (
    workspaceId: string,
    queryType: WorkItemQueryType,
  ) => Promise<void>;
  loadWorkItemDetail: (
    workspaceId: string,
    workItemId: number,
  ) => Promise<void>;
  createWorkItem: (request: CreateWorkItemRequest) => Promise<WorkItemListItem>;
  updateWorkItemState: (
    workspaceId: string,
    workItemId: number,
    newState: string,
  ) => Promise<void>;
  linkWorkItemToPr: (
    workspaceId: string,
    workItemId: number,
    prId: number,
  ) => Promise<void>;

  getWorkItems: (workspaceId: string) => WorkItemListItem[];
  getWorkItemDetail: (workItemId: number) => WorkItemDetail | null;
  isLoading: (workspaceId: string) => boolean;
  getError: (workspaceId: string) => string | null;
}

export const useWorkItemStore = create<WorkItemStore>((set, get) => ({
  workItems: {},
  workItemDetail: {},
  activeQuery: {},
  loading: {},
  error: {},

  loadWorkItems: async (workspaceId, queryType) => {
    const key = `${workspaceId}:${queryType}`;
    if (_inflightWorkItems.has(key)) return;
    _inflightWorkItems.add(key);

    set((s) => ({
      loading: { ...s.loading, [workspaceId]: true },
      error: { ...s.error, [workspaceId]: null },
      activeQuery: { ...s.activeQuery, [workspaceId]: queryType },
    }));

    try {
      const items = await listWorkItemsCmd(workspaceId, queryType);
      set((s) => ({
        workItems: { ...s.workItems, [workspaceId]: items },
        loading: { ...s.loading, [workspaceId]: false },
      }));
    } catch (e) {
      set((s) => ({
        error: { ...s.error, [workspaceId]: String(e) },
        loading: { ...s.loading, [workspaceId]: false },
      }));
    } finally {
      _inflightWorkItems.delete(key);
    }
  },

  loadWorkItemDetail: async (workspaceId, workItemId) => {
    const key = `${workspaceId}:${workItemId}`;
    if (_inflightDetails.has(key)) return;
    _inflightDetails.add(key);

    try {
      const detail = await getWorkItemDetailCmd(workspaceId, workItemId);
      set((s) => ({
        workItemDetail: { ...s.workItemDetail, [String(workItemId)]: detail },
      }));
    } catch (_e) {
      // Detail load failure is non-critical — list still shows
    } finally {
      _inflightDetails.delete(key);
    }
  },

  createWorkItem: async (request) => {
    const item = await createWorkItemCmd(request);
    // Refresh the list
    const wsId = request.workspaceId;
    const queryType = get().activeQuery[wsId] ?? "assigned_to_me";
    set((s) => ({
      workItems: {
        ...s.workItems,
        [wsId]: [item, ...(s.workItems[wsId] ?? [])],
      },
    }));
    // Background refresh for accurate data
    get().loadWorkItems(wsId, queryType);
    return item;
  },

  updateWorkItemState: async (workspaceId, workItemId, newState) => {
    const updated = await updateWorkItemStateCmd(
      workspaceId,
      workItemId,
      newState,
    );
    // Update in list
    set((s) => ({
      workItems: {
        ...s.workItems,
        [workspaceId]: (s.workItems[workspaceId] ?? []).map((wi) =>
          wi.id === workItemId ? updated : wi,
        ),
      },
    }));
  },

  linkWorkItemToPr: async (workspaceId, workItemId, prId) => {
    await linkWorkItemToPrCmd(workspaceId, workItemId, prId);
    // Refresh detail to show the new link
    get().loadWorkItemDetail(workspaceId, workItemId);
  },

  getWorkItems: (workspaceId) => get().workItems[workspaceId] ?? [],
  getWorkItemDetail: (workItemId) =>
    get().workItemDetail[String(workItemId)] ?? null,
  isLoading: (workspaceId) => get().loading[workspaceId] ?? false,
  getError: (workspaceId) => get().error[workspaceId] ?? null,
}));
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/workItemStore.ts
git commit -m "feat: add Zustand work item store with deduplication"
```

---

## Task 11: Work item store tests

**Files:**
- Create: `src/stores/workItemStore.test.ts`

- [ ] **Step 1: Write store tests**

Create `src/stores/workItemStore.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useWorkItemStore } from "./workItemStore";
import type { WorkItemListItem, WorkItemDetail } from "../lib/tauri";

const mockedInvoke = vi.mocked(invoke);

const MOCK_WORK_ITEM: WorkItemListItem = {
  id: 42,
  title: "Fix login bug",
  workItemType: "Bug",
  state: "Active",
  assignedTo: "Dev User",
  areaPath: "Project\\Team",
  iterationPath: "Project\\Sprint 5",
  parentId: 10,
  tags: ["urgent"],
};

const MOCK_DETAIL: WorkItemDetail = {
  ...MOCK_WORK_ITEM,
  description: "<p>Login fails</p>",
  acceptanceCriteria: "<p>Login works</p>",
  priority: 1,
  createdBy: "Admin",
  createdDate: "2026-01-01T00:00:00Z",
  changedDate: "2026-01-02T00:00:00Z",
  linkedPrIds: [99],
  relations: [{ relType: "Parent", targetId: 10, targetTitle: "Parent Story" }],
};

describe("workItemStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkItemStore.setState({
      workItems: {},
      workItemDetail: {},
      activeQuery: {},
      loading: {},
      error: {},
    });
  });

  it("loads work items for a workspace", async () => {
    mockedInvoke.mockResolvedValueOnce([MOCK_WORK_ITEM]);

    await useWorkItemStore.getState().loadWorkItems("ws-1", "assigned_to_me");

    const items = useWorkItemStore.getState().getWorkItems("ws-1");
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Fix login bug");
    expect(useWorkItemStore.getState().activeQuery["ws-1"]).toBe("assigned_to_me");
  });

  it("loads work item detail", async () => {
    mockedInvoke.mockResolvedValueOnce(MOCK_DETAIL);

    await useWorkItemStore.getState().loadWorkItemDetail("ws-1", 42);

    const detail = useWorkItemStore.getState().getWorkItemDetail(42);
    expect(detail).not.toBeNull();
    expect(detail!.description).toBe("<p>Login fails</p>");
    expect(detail!.linkedPrIds).toEqual([99]);
  });

  it("creates a work item and prepends to list", async () => {
    // First call: createWorkItem, second call: loadWorkItems (background refresh)
    mockedInvoke
      .mockResolvedValueOnce(MOCK_WORK_ITEM)
      .mockResolvedValueOnce([MOCK_WORK_ITEM]);

    useWorkItemStore.setState({
      workItems: { "ws-1": [] },
      activeQuery: { "ws-1": "assigned_to_me" },
    });

    const result = await useWorkItemStore.getState().createWorkItem({
      workspaceId: "ws-1",
      workItemType: "Bug",
      title: "Fix login bug",
      tags: [],
    });

    expect(result.id).toBe(42);
    expect(useWorkItemStore.getState().getWorkItems("ws-1")).toHaveLength(1);
  });

  it("updates work item state in list", async () => {
    const updated = { ...MOCK_WORK_ITEM, state: "Resolved" };
    mockedInvoke.mockResolvedValueOnce(updated);

    useWorkItemStore.setState({
      workItems: { "ws-1": [MOCK_WORK_ITEM] },
    });

    await useWorkItemStore.getState().updateWorkItemState("ws-1", 42, "Resolved");

    const items = useWorkItemStore.getState().getWorkItems("ws-1");
    expect(items[0].state).toBe("Resolved");
  });

  it("handles load error", async () => {
    mockedInvoke.mockRejectedValueOnce(new Error("PAT not configured"));

    await useWorkItemStore.getState().loadWorkItems("ws-1", "assigned_to_me");

    expect(useWorkItemStore.getState().getError("ws-1")).toContain("PAT not configured");
    expect(useWorkItemStore.getState().isLoading("ws-1")).toBe(false);
  });

  it("returns defaults for unknown workspace", () => {
    expect(useWorkItemStore.getState().getWorkItems("unknown")).toEqual([]);
    expect(useWorkItemStore.getState().getWorkItemDetail(999)).toBeNull();
    expect(useWorkItemStore.getState().isLoading("unknown")).toBe(false);
    expect(useWorkItemStore.getState().getError("unknown")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/stores/workItemStore.test.ts`
Expected: All 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/stores/workItemStore.test.ts
git commit -m "test: add work item store tests"
```

---

## Task 12: Work item UI components

**Files:**
- Create: `src/components/work-items/WorkItemBadge.tsx`
- Create: `src/components/work-items/WorkItemDetail.tsx`
- Create: `src/components/work-items/CreateWorkItemForm.tsx`
- Create: `src/components/work-items/WorkItemsPanel.tsx`

- [ ] **Step 1: Create `WorkItemBadge.tsx`**

```typescript
const TYPE_COLORS: Record<string, string> = {
  Bug: "var(--error)",
  Task: "var(--warning)",
  "User Story": "var(--success)",
  Feature: "#a855f7", // purple
  Epic: "#f97316", // orange
};

export function WorkItemBadge({ type }: { type: string }) {
  const color = TYPE_COLORS[type] ?? "var(--text-muted)";
  return (
    <span
      className="inline-flex items-center rounded px-1 py-0.5 text-[9px] font-medium"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      {type}
    </span>
  );
}
```

- [ ] **Step 2: Create `WorkItemDetail.tsx`**

```typescript
import { useEffect } from "react";
import { useWorkItemStore } from "../../stores/workItemStore";
import { WorkItemBadge } from "./WorkItemBadge";

export function WorkItemDetailView({
  workspaceId,
  workItemId,
}: {
  workspaceId: string;
  workItemId: number;
}) {
  const detail = useWorkItemStore((s) => s.workItemDetail[String(workItemId)] ?? null);

  useEffect(() => {
    useWorkItemStore.getState().loadWorkItemDetail(workspaceId, workItemId);
  }, [workspaceId, workItemId]);

  if (!detail) {
    return (
      <div className="px-2 py-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-1.5 px-2 py-1.5" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="flex items-center gap-1.5">
        <WorkItemBadge type={detail.workItemType} />
        <span
          className="text-[10px] font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          #{detail.id}
        </span>
        {detail.priority && (
          <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
            P{detail.priority}
          </span>
        )}
      </div>

      {detail.assignedTo && (
        <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          Assigned to: {detail.assignedTo}
        </div>
      )}

      {detail.areaPath && (
        <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          Area: {detail.areaPath}
        </div>
      )}

      {detail.iterationPath && (
        <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          Iteration: {detail.iterationPath}
        </div>
      )}

      {detail.description && (
        <div
          className="max-h-24 overflow-auto text-[10px] leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
          dangerouslySetInnerHTML={{ __html: detail.description }}
        />
      )}

      {detail.relations.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-[9px] font-medium" style={{ color: "var(--text-muted)" }}>
            Relations
          </div>
          {detail.relations.map((rel) => (
            <div
              key={`${rel.relType}-${rel.targetId}`}
              className="flex items-center gap-1 text-[10px]"
              style={{ color: "var(--text-secondary)" }}
            >
              <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
                {rel.relType}:
              </span>
              #{rel.targetId} {rel.targetTitle ?? ""}
            </div>
          ))}
        </div>
      )}

      {detail.linkedPrIds.length > 0 && (
        <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          Linked PRs: {detail.linkedPrIds.map((id) => `#${id}`).join(", ")}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `CreateWorkItemForm.tsx`**

```typescript
import { useState } from "react";
import { useWorkItemStore } from "../../stores/workItemStore";

const WORK_ITEM_TYPES = ["Bug", "Task", "User Story", "Feature", "Epic"];

export function CreateWorkItemForm({
  workspaceId,
  onClose,
}: {
  workspaceId: string;
  onClose: () => void;
}) {
  const [type, setType] = useState("Task");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await useWorkItemStore.getState().createWorkItem({
        workspaceId,
        workItemType: type,
        title: title.trim(),
        description: description.trim() || null,
        tags: [],
      });
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2 p-2" style={{ borderTop: "1px solid var(--border)" }}>
      {error && (
        <div className="text-[10px]" style={{ color: "var(--error)" }}>
          {error}
        </div>
      )}
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        className="w-full rounded px-1.5 py-1 text-[10px]"
        style={{
          backgroundColor: "var(--bg-surface)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
        }}
      >
        {WORK_ITEM_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title..."
        className="w-full rounded px-1.5 py-1 text-[10px]"
        style={{
          backgroundColor: "var(--bg-surface)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
          outline: "none",
        }}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)..."
        rows={2}
        className="w-full rounded px-1.5 py-1 text-[10px]"
        style={{
          backgroundColor: "var(--bg-surface)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
          outline: "none",
          resize: "vertical",
        }}
      />
      <div className="flex justify-end gap-1">
        <button
          onClick={onClose}
          className="rounded px-2 py-0.5 text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting || !title.trim()}
          className="rounded px-2 py-0.5 text-[10px] font-medium disabled:opacity-50"
          style={{
            backgroundColor: "var(--accent)",
            color: "var(--bg-primary)",
          }}
        >
          {submitting ? "Creating..." : "Create"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `WorkItemsPanel.tsx`**

```typescript
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useWorkItemStore } from "../../stores/workItemStore";
import { usePrStore } from "../../stores/prStore";
import type { WorkItemQueryType } from "../../lib/tauri";
import { WorkItemBadge } from "./WorkItemBadge";
import { WorkItemDetailView } from "./WorkItemDetail";
import { CreateWorkItemForm } from "./CreateWorkItemForm";

const QUERY_TABS: { label: string; value: WorkItemQueryType }[] = [
  { label: "Assigned to Me", value: "assigned_to_me" },
  { label: "Linked to PR", value: "linked_to_pr" },
  { label: "This Iteration", value: "recent_in_iteration" },
];

const STATE_OPTIONS = ["New", "Active", "Resolved", "Closed"];

export function WorkItemsPanel({ workspaceId }: { workspaceId: string }) {
  const workItems = useWorkItemStore((s) => s.workItems[workspaceId] ?? []);
  const loading = useWorkItemStore((s) => s.loading[workspaceId] ?? false);
  const error = useWorkItemStore((s) => s.error[workspaceId] ?? null);
  const activeQuery = useWorkItemStore(
    (s) => s.activeQuery[workspaceId] ?? "assigned_to_me",
  );
  const prNumber = usePrStore((s) => s.prInfo[workspaceId]?.prNumber ?? null);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    useWorkItemStore.getState().loadWorkItems(workspaceId, activeQuery);
  }, [workspaceId, activeQuery]);

  const handleQueryChange = (queryType: WorkItemQueryType) => {
    useWorkItemStore.getState().loadWorkItems(workspaceId, queryType);
  };

  const handleStateChange = async (workItemId: number, newState: string) => {
    await useWorkItemStore
      .getState()
      .updateWorkItemState(workspaceId, workItemId, newState);
  };

  const handleLinkToPr = async (workItemId: number) => {
    if (!prNumber) return;
    await useWorkItemStore
      .getState()
      .linkWorkItemToPr(workspaceId, workItemId, prNumber);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1">
        <span
          className="text-[10px] font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          Work Items {workItems.length > 0 && `(${workItems.length})`}
        </span>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="rounded p-0.5"
          style={{ color: "var(--text-muted)" }}
          title="Create work item"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <CreateWorkItemForm
          workspaceId={workspaceId}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Query tabs */}
      <div className="flex gap-0.5 px-2 pb-1">
        {QUERY_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleQueryChange(tab.value)}
            className="rounded px-1.5 py-0.5 text-[9px]"
            style={{
              backgroundColor:
                activeQuery === tab.value
                  ? "var(--accent)"
                  : "var(--bg-surface)",
              color:
                activeQuery === tab.value
                  ? "var(--bg-primary)"
                  : "var(--text-muted)",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="px-2 py-1 text-[10px]" style={{ color: "var(--error)" }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && workItems.length === 0 && (
        <div
          className="px-2 py-2 text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          Loading work items...
        </div>
      )}

      {/* Empty state */}
      {!loading && workItems.length === 0 && !error && (
        <div
          className="px-2 py-2 text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          No work items found.
        </div>
      )}

      {/* Work item list */}
      <div className="space-y-px">
        {workItems.map((wi) => (
          <div key={wi.id}>
            <div
              className="flex cursor-pointer items-center gap-1.5 px-2 py-1 hover:opacity-80"
              style={{ backgroundColor: expandedId === wi.id ? "var(--bg-surface)" : "transparent" }}
              onClick={() => setExpandedId(expandedId === wi.id ? null : wi.id)}
            >
              <WorkItemBadge type={wi.workItemType} />
              <span
                className="flex-1 truncate text-[10px]"
                style={{ color: "var(--text-primary)" }}
              >
                {wi.title}
              </span>
              <select
                value={wi.state}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => handleStateChange(wi.id, e.target.value)}
                className="rounded px-1 py-0.5 text-[9px]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                }}
              >
                {STATE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {prNumber && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLinkToPr(wi.id);
                  }}
                  className="rounded px-1 py-0.5 text-[9px]"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-muted)",
                    border: "1px solid var(--border)",
                  }}
                  title="Link to current PR"
                >
                  Link PR
                </button>
              )}
            </div>
            {expandedId === wi.id && (
              <WorkItemDetailView
                workspaceId={workspaceId}
                workItemId={wi.id}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/work-items/
git commit -m "feat: add WorkItemsPanel, WorkItemDetail, CreateWorkItemForm, WorkItemBadge components"
```

---

## Task 13: Integrate work items into ChecksPanel and update WorkflowRunRow

**Files:**
- Modify: `src/components/sidebar/ChecksPanel.tsx`
- Modify: `src/components/sidebar/WorkflowRunRow.tsx`

- [ ] **Step 1: Add work items section to ChecksPanel**

In `src/components/sidebar/ChecksPanel.tsx`, add the import at the top:

```typescript
import { WorkItemsPanel } from "../work-items/WorkItemsPanel";
```

Then add the work items section inside the component's JSX, after the workflow runs section. Find the section that renders workflow runs (look for `isAdo ? "Pipelines" : "Actions"`) and add after its closing `</div>`:

```tsx
      {/* Work Items (ADO) or Issues placeholder */}
      {isAdo && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <WorkItemsPanel workspaceId={workspaceId} />
        </div>
      )}
```

- [ ] **Step 2: Update WorkflowRunRow for structured logs**

In `src/components/sidebar/WorkflowRunRow.tsx`, modify the log viewer section. Replace the existing `<pre>` block (around line 230-239) that shows `logsResult.logs` with:

```tsx
                <>
                  {logsResult?.taskLogs && logsResult.taskLogs.length > 0 ? (
                    <div className="space-y-1 px-2 py-1">
                      {logsResult.taskLogs.map((task, i) => (
                        <details
                          key={i}
                          open={task.conclusion === "failure"}
                        >
                          <summary
                            className="flex cursor-pointer items-center gap-1 text-[10px]"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            <span
                              className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                              style={{
                                backgroundColor:
                                  task.conclusion === "failure"
                                    ? "var(--error)"
                                    : task.conclusion === "success"
                                      ? "var(--success)"
                                      : "var(--text-muted)",
                              }}
                            />
                            <span className="font-medium">{task.jobName}</span>
                            <span style={{ color: "var(--text-muted)" }}>/</span>
                            <span>{task.taskName}</span>
                          </summary>
                          <pre
                            className="mt-0.5 max-h-48 overflow-auto rounded px-2 py-1 text-[9px] leading-relaxed"
                            style={{
                              color: "var(--text-primary)",
                              backgroundColor: "var(--bg-primary)",
                              fontFamily: "monospace",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-all",
                            }}
                          >
                            {stripAnsi(task.logContent)}
                          </pre>
                        </details>
                      ))}
                    </div>
                  ) : (
                    <pre
                      className="max-h-64 overflow-auto px-2 py-1 text-[10px] leading-relaxed"
                      style={{
                        color: "var(--text-primary)",
                        fontFamily: "monospace",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                      }}
                    >
                      {logsResult ? stripAnsi(logsResult.logs) : ""}
                    </pre>
                  )}
                </>
```

- [ ] **Step 3: Hide "Re-run Failed" for ADO in WorkflowRunRow**

The `WorkflowRunRow` component needs to know the provider. Add an `isAdo` prop:

In the component signature, add the prop:
```typescript
export function WorkflowRunRow({
  run,
  workspaceId,
  expanded,
  onToggle,
  isAdo,
}: {
  run: WorkflowRun;
  workspaceId: string;
  expanded: boolean;
  onToggle: () => void;
  isAdo?: boolean;
}) {
```

Then wrap the "Re-run Failed" button with a provider check:

```tsx
            {run.conclusion === "failure" && !isAdo && (
              <button
                onClick={() => handleRerun(true)}
                ...
              >
                Re-run Failed
              </button>
            )}
```

And add a tooltip to the "Re-run" button for ADO:

```tsx
            <button
              onClick={() => handleRerun(false)}
              disabled={rerunning}
              className="rounded px-1.5 py-0.5 text-[10px] disabled:opacity-50"
              style={{
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-secondary)",
              }}
              title={isAdo ? "Queues a new full build" : undefined}
            >
              {rerunning ? "Re-running..." : "Re-run"}
            </button>
```

Update `ChecksPanel.tsx` to pass the `isAdo` prop where `WorkflowRunRow` is used:

```tsx
<WorkflowRunRow
  key={run.id}
  run={run}
  workspaceId={workspaceId}
  expanded={expandedRunId === run.id}
  onToggle={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
  isAdo={isAdo}
/>
```

- [ ] **Step 4: Verify frontend compiles**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/ChecksPanel.tsx src/components/sidebar/WorkflowRunRow.tsx
git commit -m "feat: integrate work items into ChecksPanel, add structured ADO logs to WorkflowRunRow"
```

---

## Task 14: Update ADO settings tab PAT scope guidance

**Files:**
- Modify: `src/components/settings/tabs/AzureDevOpsTab.tsx`

- [ ] **Step 1: Update scope guidance text**

In `src/components/settings/tabs/AzureDevOpsTab.tsx`, change line 76:

From:
```
Create a PAT at dev.azure.com &rarr; User Settings &rarr; Personal access tokens. Required scopes: Code (Read &amp; Write), Build (Read).
```

To:
```
Create a PAT at dev.azure.com &rarr; User Settings &rarr; Personal access tokens. Required scopes: Code (Read &amp; Write), Build (Read &amp; Execute), Work Items (Read &amp; Write).
```

- [ ] **Step 2: Commit**

```bash
git add src/components/settings/tabs/AzureDevOpsTab.tsx
git commit -m "docs: update ADO PAT scope guidance to include Build Execute and Work Items"
```

---

## Task 15: Frontend component and integration tests

**Files:**
- Create: `src/components/work-items/WorkItemsPanel.test.tsx`
- Create: `src/components/work-items/WorkItemBadge.test.tsx`

- [ ] **Step 1: Write WorkItemBadge tests**

Create `src/components/work-items/WorkItemBadge.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkItemBadge } from "./WorkItemBadge";

describe("WorkItemBadge", () => {
  it("renders the type text", () => {
    render(<WorkItemBadge type="Bug" />);
    expect(screen.getByText("Bug")).toBeInTheDocument();
  });

  it("renders unknown types with muted color", () => {
    render(<WorkItemBadge type="Custom Type" />);
    expect(screen.getByText("Custom Type")).toBeInTheDocument();
  });

  it.each(["Bug", "Task", "User Story", "Feature", "Epic"])(
    "renders known type: %s",
    (type) => {
      render(<WorkItemBadge type={type} />);
      expect(screen.getByText(type)).toBeInTheDocument();
    },
  );
});
```

- [ ] **Step 2: Write WorkItemsPanel tests**

Create `src/components/work-items/WorkItemsPanel.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { WorkItemsPanel } from "./WorkItemsPanel";
import { useWorkItemStore } from "../../stores/workItemStore";
import { usePrStore } from "../../stores/prStore";

const mockedInvoke = vi.mocked(invoke);

const MOCK_ITEMS = [
  {
    id: 1,
    title: "Fix login bug",
    workItemType: "Bug",
    state: "Active",
    assignedTo: "Dev",
    areaPath: null,
    iterationPath: null,
    parentId: null,
    tags: [],
  },
  {
    id: 2,
    title: "Add dark mode",
    workItemType: "User Story",
    state: "New",
    assignedTo: null,
    areaPath: null,
    iterationPath: null,
    parentId: null,
    tags: [],
  },
];

describe("WorkItemsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkItemStore.setState({
      workItems: {},
      workItemDetail: {},
      activeQuery: {},
      loading: {},
      error: {},
    });
    usePrStore.setState({
      prInfo: {},
    });
  });

  it("renders loading state", () => {
    useWorkItemStore.setState({
      loading: { "ws-1": true },
    });
    render(<WorkItemsPanel workspaceId="ws-1" />);
    expect(screen.getByText("Loading work items...")).toBeInTheDocument();
  });

  it("renders empty state", () => {
    render(<WorkItemsPanel workspaceId="ws-1" />);
    expect(screen.getByText("No work items found.")).toBeInTheDocument();
  });

  it("renders work items with type badges", () => {
    useWorkItemStore.setState({
      workItems: { "ws-1": MOCK_ITEMS },
    });
    render(<WorkItemsPanel workspaceId="ws-1" />);
    expect(screen.getByText("Fix login bug")).toBeInTheDocument();
    expect(screen.getByText("Add dark mode")).toBeInTheDocument();
    expect(screen.getByText("Bug")).toBeInTheDocument();
    expect(screen.getByText("User Story")).toBeInTheDocument();
  });

  it("renders error state", () => {
    useWorkItemStore.setState({
      error: { "ws-1": "PAT not configured" },
    });
    render(<WorkItemsPanel workspaceId="ws-1" />);
    expect(screen.getByText("PAT not configured")).toBeInTheDocument();
  });

  it("shows query tabs", () => {
    render(<WorkItemsPanel workspaceId="ws-1" />);
    expect(screen.getByText("Assigned to Me")).toBeInTheDocument();
    expect(screen.getByText("Linked to PR")).toBeInTheDocument();
    expect(screen.getByText("This Iteration")).toBeInTheDocument();
  });

  it("shows count in header", () => {
    useWorkItemStore.setState({
      workItems: { "ws-1": MOCK_ITEMS },
    });
    render(<WorkItemsPanel workspaceId="ws-1" />);
    expect(screen.getByText("Work Items (2)")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run all frontend tests**

Run: `npx vitest run src/components/work-items/ src/stores/workItemStore.test.ts`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/work-items/WorkItemsPanel.test.tsx src/components/work-items/WorkItemBadge.test.tsx
git commit -m "test: add work item component and badge tests"
```

---

## Task 16: Full test suite verification

**Files:** None (verification only)

- [ ] **Step 1: Run backend tests**

Run: `cd src-tauri && cargo test`
Expected: All tests pass, including new ADO work item and pipeline tests.

- [ ] **Step 2: Run frontend tests**

Run: `npm test`
Expected: All ~2700+ tests pass (existing + new work item tests).

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 4: Cargo check**

Run: `cd src-tauri && cargo check`
Expected: Clean compilation.

- [ ] **Step 5: Final commit if any fixes were needed**

If any tests or lint issues required fixes, commit them:

```bash
git add -A
git commit -m "fix: resolve test and lint issues from ADO full parity work"
```
