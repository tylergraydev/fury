#![allow(dead_code)]

use crate::error::AppError;
use crate::models::work_item::{
    WorkItemDetail, WorkItemListItem, WorkItemQueryType, WorkItemRelation,
};

use super::{ado_err, api_base, client};

// ─── Parsing helpers ──────────────────────────────────────────────────────────

/// Parse a single work item JSON value into a `WorkItemListItem`.
pub fn parse_work_item_list(value: &serde_json::Value) -> WorkItemListItem {
    let id = value["id"].as_u64().unwrap_or(0) as u32;
    let fields = &value["fields"];

    let title = fields["System.Title"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let work_item_type = fields["System.WorkItemType"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let state = fields["System.State"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let assigned_to = fields["System.AssignedTo"]["displayName"]
        .as_str()
        .map(|s| s.to_string());

    let area_path = fields["System.AreaPath"]
        .as_str()
        .map(|s| s.to_string());

    let iteration_path = fields["System.IterationPath"]
        .as_str()
        .map(|s| s.to_string());

    let parent_id = fields["System.Parent"]
        .as_u64()
        .map(|v| v as u32);

    let tags = fields["System.Tags"]
        .as_str()
        .map(|s| {
            if s.is_empty() {
                Vec::new()
            } else {
                s.split("; ").map(|t| t.trim().to_string()).collect()
            }
        })
        .unwrap_or_default();

    WorkItemListItem {
        id,
        title,
        work_item_type,
        state,
        assigned_to,
        area_path,
        iteration_path,
        parent_id,
        tags,
    }
}

/// Parse a work item JSON value into a `WorkItemDetail`, including relations.
pub fn parse_work_item_detail(value: &serde_json::Value) -> WorkItemDetail {
    let list_item = parse_work_item_list(value);
    let fields = &value["fields"];

    let description = fields["System.Description"]
        .as_str()
        .map(|s| s.to_string());

    let acceptance_criteria = fields["Microsoft.VSTS.Common.AcceptanceCriteria"]
        .as_str()
        .map(|s| s.to_string());

    let priority = fields["Microsoft.VSTS.Common.Priority"]
        .as_u64()
        .map(|v| v as u32);

    let created_by = fields["System.CreatedBy"]["displayName"]
        .as_str()
        .map(|s| s.to_string());

    let created_date = fields["System.CreatedDate"]
        .as_str()
        .map(|s| s.to_string());

    let changed_date = fields["System.ChangedDate"]
        .as_str()
        .map(|s| s.to_string());

    let mut linked_pr_ids: Vec<u32> = Vec::new();
    let mut relations: Vec<WorkItemRelation> = Vec::new();

    if let Some(rels) = value["relations"].as_array() {
        for rel in rels {
            let rel_type = rel["rel"].as_str().unwrap_or("").to_string();
            let url = rel["url"].as_str().unwrap_or("");

            // ArtifactLink relations that reference a PR
            if rel_type == "ArtifactLink" {
                if let Some(pr_id) = extract_pr_id_from_artifact_url(url) {
                    linked_pr_ids.push(pr_id);
                }
                continue;
            }

            // Map hierarchy / related link types to human-readable rel_type
            let mapped_rel_type = match rel_type.as_str() {
                "System.LinkTypes.Hierarchy-Reverse" => "Parent".to_string(),
                "System.LinkTypes.Hierarchy-Forward" => "Child".to_string(),
                "System.LinkTypes.Related" => "Related".to_string(),
                other => other.to_string(),
            };

            // Extract target work item ID from the URL (last path segment)
            let target_id = url
                .rsplit('/')
                .next()
                .and_then(|s| s.parse::<u32>().ok())
                .unwrap_or(0);

            let target_title = rel["attributes"]["name"]
                .as_str()
                .map(|s| s.to_string());

            relations.push(WorkItemRelation {
                rel_type: mapped_rel_type,
                target_id,
                target_title,
            });
        }
    }

    WorkItemDetail {
        id: list_item.id,
        title: list_item.title,
        work_item_type: list_item.work_item_type,
        state: list_item.state,
        assigned_to: list_item.assigned_to,
        area_path: list_item.area_path,
        iteration_path: list_item.iteration_path,
        parent_id: list_item.parent_id,
        tags: list_item.tags,
        description,
        acceptance_criteria,
        priority,
        created_by,
        created_date,
        changed_date,
        linked_pr_ids,
        relations,
    }
}

/// Extract a PR ID from a vstfs artifact URL like:
/// `vstfs:///Git/PullRequestId/{project_id}/{repo_id}/{pr_id}`
fn extract_pr_id_from_artifact_url(url: &str) -> Option<u32> {
    if !url.contains("vstfs:///Git/PullRequestId/") {
        return None;
    }
    url.rsplit('/').next().and_then(|s| s.parse::<u32>().ok())
}

// ─── WIQL query builders ─────────────────────────────────────────────────────

pub fn build_wiql_assigned_to_me() -> String {
    "SELECT [System.Id] FROM WorkItems \
     WHERE [System.AssignedTo] = @Me \
     AND [System.State] <> 'Closed' \
     AND [System.State] <> 'Removed' \
     ORDER BY [System.ChangedDate] DESC"
        .to_string()
}

pub fn build_wiql_recent_in_iteration(iteration_path: &str) -> String {
    let safe_iteration_path = iteration_path.replace("'", "''");
    format!(
        "SELECT [System.Id] FROM WorkItems \
         WHERE [System.IterationPath] = '{}' \
         AND [System.State] <> 'Closed' \
         AND [System.State] <> 'Removed' \
         ORDER BY [System.ChangedDate] DESC",
        safe_iteration_path
    )
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/// Run a WIQL query and return the list of work item IDs (limited to 50).
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
        return Err(ado_err(format!(
            "WIQL query failed (HTTP {}): {}",
            status, text
        )));
    }

    let raw: serde_json::Value = resp.json().await.map_err(ado_err)?;
    let ids: Vec<u32> = raw["workItems"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|item| item["id"].as_u64().map(|v| v as u32))
        .take(50)
        .collect();

    Ok(ids)
}

/// Batch-fetch work items by ID list.
async fn batch_get_work_items(
    pat: &str,
    org: &str,
    project: &str,
    ids: Vec<u32>,
) -> Result<Vec<WorkItemListItem>, AppError> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }

    let ids_csv: String = ids
        .iter()
        .map(|id| id.to_string())
        .collect::<Vec<_>>()
        .join(",");

    let c = client(pat)?;
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

/// Fetch work item IDs linked to a PR.
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
    let ids: Vec<u32> = raw["value"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|item| item["id"].as_u64().map(|v| v as u32))
        .take(50)
        .collect();

    Ok(ids)
}

/// Fetch the current sprint iteration path.
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

// ─── Public API functions ─────────────────────────────────────────────────────

/// List work items based on the requested query type.
#[allow(clippy::too_many_arguments)]
pub async fn list_work_items(
    pat: &str,
    org: &str,
    project: &str,
    repo_name: &str,
    pr_id: Option<u64>,
    query_type: WorkItemQueryType,
) -> Result<Vec<WorkItemListItem>, AppError> {
    match query_type {
        WorkItemQueryType::LinkedToPr => {
            let pid = pr_id.ok_or_else(|| ado_err("pr_id is required for LinkedToPr query"))?;
            let ids = get_pr_linked_work_item_ids(pat, org, project, repo_name, pid).await?;
            batch_get_work_items(pat, org, project, ids).await
        }
        WorkItemQueryType::AssignedToMe => {
            let query = build_wiql_assigned_to_me();
            let ids = run_wiql(pat, org, project, &query).await?;
            batch_get_work_items(pat, org, project, ids).await
        }
        WorkItemQueryType::RecentInIteration => {
            let iteration_path = get_current_iteration_path(pat, org, project)
                .await?
                .ok_or_else(|| ado_err("No current iteration found"))?;
            let query = build_wiql_recent_in_iteration(&iteration_path);
            let ids = run_wiql(pat, org, project, &query).await?;
            batch_get_work_items(pat, org, project, ids).await
        }
    }
}

/// Fetch full detail for a single work item.
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
            "Get work item detail failed (HTTP {}): {}",
            status, text
        )));
    }

    let raw: serde_json::Value = resp.json().await.map_err(ado_err)?;
    Ok(parse_work_item_detail(&raw))
}

/// Create a new work item.
#[allow(clippy::too_many_arguments)]
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
    tags: Vec<String>,
) -> Result<WorkItemListItem, AppError> {
    let c = client(pat)?;
    let url = format!(
        "{}/wit/workitems/${}?api-version=7.1",
        api_base(org, project),
        work_item_type
    );

    let mut patch_ops: Vec<serde_json::Value> = vec![serde_json::json!({
        "op": "add",
        "path": "/fields/System.Title",
        "value": title
    })];

    if let Some(desc) = description {
        patch_ops.push(serde_json::json!({
            "op": "add",
            "path": "/fields/System.Description",
            "value": desc
        }));
    }

    if let Some(assignee) = assigned_to {
        patch_ops.push(serde_json::json!({
            "op": "add",
            "path": "/fields/System.AssignedTo",
            "value": assignee
        }));
    }

    if let Some(area) = area_path {
        patch_ops.push(serde_json::json!({
            "op": "add",
            "path": "/fields/System.AreaPath",
            "value": area
        }));
    }

    if let Some(iteration) = iteration_path {
        patch_ops.push(serde_json::json!({
            "op": "add",
            "path": "/fields/System.IterationPath",
            "value": iteration
        }));
    }

    if let Some(pid) = parent_id {
        patch_ops.push(serde_json::json!({
            "op": "add",
            "path": "/relations/-",
            "value": {
                "rel": "System.LinkTypes.Hierarchy-Reverse",
                "url": format!(
                    "https://dev.azure.com/{}/_apis/wit/workitems/{}",
                    org, pid
                )
            }
        }));
    }

    if !tags.is_empty() {
        patch_ops.push(serde_json::json!({
            "op": "add",
            "path": "/fields/System.Tags",
            "value": tags.join("; ")
        }));
    }

    let resp = c
        .post(&url)
        .header("Content-Type", "application/json-patch+json")
        .json(&patch_ops)
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

/// Update the state of a work item.
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

    let patch_ops = serde_json::json!([{
        "op": "add",
        "path": "/fields/System.State",
        "value": new_state
    }]);

    let resp = c
        .patch(&url)
        .header("Content-Type", "application/json-patch+json")
        .json(&patch_ops)
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

/// Link a work item to a pull request via ArtifactLink.
pub async fn link_work_item_to_pr(
    pat: &str,
    org: &str,
    project: &str,
    repo_name: &str,
    work_item_id: u32,
    pr_id: u64,
) -> Result<(), AppError> {
    // We need the project ID to build the vstfs URL.  Look it up from the repo.
    let c = client(pat)?;

    // Resolve the repo to get project and repo GUIDs.
    let repo_url = format!(
        "{}/git/repositories/{}?api-version=7.1",
        api_base(org, project),
        repo_name
    );
    let repo_resp = c.get(&repo_url).send().await.map_err(ado_err)?;
    if !repo_resp.status().is_success() {
        return Err(ado_err(format!(
            "Failed to resolve repository '{}' for PR link",
            repo_name
        )));
    }
    let repo_data: serde_json::Value = repo_resp.json().await.map_err(ado_err)?;
    let project_id = repo_data["project"]["id"].as_str().unwrap_or("").to_string();
    let repo_id = repo_data["id"].as_str().unwrap_or("").to_string();

    let artifact_url = format!(
        "vstfs:///Git/PullRequestId/{}/{}/{}",
        project_id, repo_id, pr_id
    );

    let url = format!(
        "{}/wit/workitems/{}?api-version=7.1",
        api_base(org, project),
        work_item_id
    );

    let patch_ops = serde_json::json!([{
        "op": "add",
        "path": "/relations/-",
        "value": {
            "rel": "ArtifactLink",
            "url": artifact_url,
            "attributes": {
                "name": "Pull Request"
            }
        }
    }]);

    let resp = c
        .patch(&url)
        .header("Content-Type", "application/json-patch+json")
        .json(&patch_ops)
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

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_work_item_json(
        id: u64,
        title: &str,
        work_item_type: &str,
        state: &str,
        assigned_display_name: Option<&str>,
        area_path: Option<&str>,
        iteration_path: Option<&str>,
        parent_id: Option<u64>,
        tags: Option<&str>,
    ) -> serde_json::Value {
        let assigned_to = match assigned_display_name {
            Some(name) => serde_json::json!({ "displayName": name }),
            None => serde_json::Value::Null,
        };
        serde_json::json!({
            "id": id,
            "fields": {
                "System.Title": title,
                "System.WorkItemType": work_item_type,
                "System.State": state,
                "System.AssignedTo": assigned_to,
                "System.AreaPath": area_path,
                "System.IterationPath": iteration_path,
                "System.Parent": parent_id,
                "System.Tags": tags,
            }
        })
    }

    #[test]
    fn test_parse_work_item_list() {
        let json = make_work_item_json(
            42,
            "Fix the bug",
            "Bug",
            "Active",
            Some("Alice"),
            Some("MyProject\\Team"),
            Some("MyProject\\Sprint 5"),
            Some(10),
            Some("urgent; backend"),
        );

        let item = parse_work_item_list(&json);
        assert_eq!(item.id, 42);
        assert_eq!(item.title, "Fix the bug");
        assert_eq!(item.work_item_type, "Bug");
        assert_eq!(item.state, "Active");
        assert_eq!(item.assigned_to.as_deref(), Some("Alice"));
        assert_eq!(item.area_path.as_deref(), Some("MyProject\\Team"));
        assert_eq!(item.iteration_path.as_deref(), Some("MyProject\\Sprint 5"));
        assert_eq!(item.parent_id, Some(10));
        assert_eq!(item.tags, vec!["urgent", "backend"]);
    }

    #[test]
    fn test_parse_work_item_list_empty_tags() {
        let json = make_work_item_json(
            1, "Simple task", "Task", "New", None, None, None, None,
            Some(""),
        );

        let item = parse_work_item_list(&json);
        assert!(item.tags.is_empty());
        assert!(item.assigned_to.is_none());
        assert!(item.parent_id.is_none());
    }

    #[test]
    fn test_parse_work_item_detail_with_relations() {
        let mut json = make_work_item_json(
            99,
            "Parent Story",
            "User Story",
            "Active",
            Some("Bob"),
            None,
            None,
            None,
            Some("feature"),
        );

        json["fields"]["System.Description"] = serde_json::json!("<p>Do the thing</p>");
        json["fields"]["System.CreatedBy"] = serde_json::json!({ "displayName": "Carol" });
        json["fields"]["System.CreatedDate"] = serde_json::json!("2024-01-15T10:00:00Z");
        json["fields"]["System.ChangedDate"] = serde_json::json!("2024-01-20T12:00:00Z");
        json["fields"]["Microsoft.VSTS.Common.Priority"] = serde_json::json!(2);

        json["relations"] = serde_json::json!([
            {
                "rel": "System.LinkTypes.Hierarchy-Forward",
                "url": "https://dev.azure.com/org/proj/_apis/wit/workitems/200",
                "attributes": { "name": "Child" }
            },
            {
                "rel": "System.LinkTypes.Related",
                "url": "https://dev.azure.com/org/proj/_apis/wit/workitems/300",
                "attributes": { "name": "Related" }
            },
            {
                "rel": "ArtifactLink",
                "url": "vstfs:///Git/PullRequestId/proj-guid/repo-guid/42",
                "attributes": { "name": "Pull Request" }
            }
        ]);

        let detail = parse_work_item_detail(&json);
        assert_eq!(detail.id, 99);
        assert_eq!(detail.title, "Parent Story");
        assert_eq!(detail.description.as_deref(), Some("<p>Do the thing</p>"));
        assert_eq!(detail.priority, Some(2));
        assert_eq!(detail.created_by.as_deref(), Some("Carol"));
        assert_eq!(detail.tags, vec!["feature"]);

        // Relations
        assert_eq!(detail.relations.len(), 2);
        assert_eq!(detail.relations[0].rel_type, "Child");
        assert_eq!(detail.relations[0].target_id, 200);
        assert_eq!(detail.relations[1].rel_type, "Related");
        assert_eq!(detail.relations[1].target_id, 300);

        // Linked PR IDs
        assert_eq!(detail.linked_pr_ids, vec![42]);
    }

    #[test]
    fn test_build_wiql_assigned_to_me() {
        let query = build_wiql_assigned_to_me();
        assert!(query.contains("@Me"));
        assert!(query.contains("[System.AssignedTo]"));
        assert!(query.contains("ORDER BY [System.ChangedDate] DESC"));
    }

    #[test]
    fn test_build_wiql_recent_in_iteration() {
        let iteration = "MyProject\\Sprint 7";
        let query = build_wiql_recent_in_iteration(iteration);
        assert!(query.contains(iteration));
        assert!(query.contains("[System.IterationPath]"));
        assert!(query.contains("ORDER BY [System.ChangedDate] DESC"));
    }
}
