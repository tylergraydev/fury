use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
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

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
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

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct WorkItemRelation {
    pub rel_type: String,
    pub target_id: u32,
    pub target_title: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
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

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
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

        let deserialized: WorkItemQueryType = serde_json::from_str("\"linked_to_pr\"").unwrap();
        assert!(matches!(deserialized, WorkItemQueryType::LinkedToPr));
    }
}
