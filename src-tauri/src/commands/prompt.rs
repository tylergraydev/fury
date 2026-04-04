use chrono::Utc;
use tauri::State;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::prompt::{CreatePromptRequest, Prompt, UpdatePromptRequest};
use crate::state::AppState;

pub(crate) fn create_prompt_inner(
    db: &crate::db::Database,
    request: CreatePromptRequest,
) -> Result<Prompt, AppError> {
    let now = Utc::now();
    let prompt = Prompt {
        id: Uuid::new_v4(),
        name: request.name,
        content: request.content,
        description: request.description,
        category: request.category,
        tags: request.tags.unwrap_or_default(),
        sort_order: 0,
        created_at: now,
        updated_at: now,
    };

    db.insert_prompt(&prompt)?;
    Ok(prompt)
}

pub(crate) fn list_prompts_inner(
    db: &crate::db::Database,
) -> Result<Vec<Prompt>, AppError> {
    db.list_prompts()
}

pub(crate) fn update_prompt_inner(
    db: &crate::db::Database,
    prompt_id: String,
    request: UpdatePromptRequest,
) -> Result<Prompt, AppError> {
    let id = Uuid::parse_str(&prompt_id)
        .map_err(|e| AppError::DbError(format!("Invalid UUID: {}", e)))?;

    let mut prompt = db
        .get_prompt(&id)?
        .ok_or_else(|| AppError::DbError(format!("Prompt not found: {}", id)))?;

    if let Some(name) = request.name {
        prompt.name = name;
    }
    if let Some(content) = request.content {
        prompt.content = content;
    }
    if let Some(desc) = request.description {
        prompt.description = Some(desc);
    }
    if let Some(cat) = request.category {
        prompt.category = Some(cat);
    }
    if let Some(tags) = request.tags {
        prompt.tags = tags;
    }
    prompt.updated_at = Utc::now();

    db.update_prompt(&prompt)?;
    Ok(prompt)
}

pub(crate) fn delete_prompt_inner(
    db: &crate::db::Database,
    prompt_id: String,
) -> Result<(), AppError> {
    let id = Uuid::parse_str(&prompt_id)
        .map_err(|e| AppError::DbError(format!("Invalid UUID: {}", e)))?;
    db.delete_prompt(&id)?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn create_prompt(
    state: State<'_, AppState>,
    request: CreatePromptRequest,
) -> Result<Prompt, AppError> {
    state.with_db(move |db| create_prompt_inner(db, request)).await
}

#[tauri::command]
#[specta::specta]
pub async fn list_prompts(state: State<'_, AppState>) -> Result<Vec<Prompt>, AppError> {
    Ok(state.with_db(list_prompts_inner).await.unwrap_or_else(|_| vec![]))
}

#[tauri::command]
#[specta::specta]
pub async fn update_prompt(
    state: State<'_, AppState>,
    prompt_id: String,
    request: UpdatePromptRequest,
) -> Result<Prompt, AppError> {
    state.with_db(move |db| update_prompt_inner(db, prompt_id, request)).await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_prompt(state: State<'_, AppState>, prompt_id: String) -> Result<(), AppError> {
    state.with_db(move |db| delete_prompt_inner(db, prompt_id)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::*;

    #[test]
    fn test_create_prompt_inner() {
        let db = test_db();
        let request = CreatePromptRequest {
            name: "test".into(),
            content: "body".into(),
            description: None,
            category: None,
            tags: None,
        };
        let result = create_prompt_inner(&db, request);
        assert!(result.is_ok());
        let prompt = result.unwrap();
        assert_eq!(prompt.name, "test");
        assert_eq!(prompt.content, "body");
        assert!(prompt.tags.is_empty());
        assert_eq!(prompt.sort_order, 0);
    }

    #[test]
    fn test_create_prompt_inner_with_all_fields() {
        let db = test_db();
        let request = CreatePromptRequest {
            name: "full".into(),
            content: "Review {{file}}".into(),
            description: Some("A description".into()),
            category: Some("Code Review".into()),
            tags: Some(vec!["review".into(), "quality".into()]),
        };
        let result = create_prompt_inner(&db, request).unwrap();
        assert_eq!(result.name, "full");
        assert_eq!(result.description.as_deref(), Some("A description"));
        assert_eq!(result.category.as_deref(), Some("Code Review"));
        assert_eq!(result.tags, vec!["review", "quality"]);
    }

    #[test]
    fn test_list_prompts_inner_empty() {
        let db = test_db();
        let result = list_prompts_inner(&db).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_list_prompts_inner_returns_inserted() {
        let db = test_db();
        let p1 = create_prompt_inner(
            &db,
            CreatePromptRequest {
                name: "first".into(),
                content: "c1".into(),
                description: None,
                category: None,
                tags: None,
            },
        )
        .unwrap();
        let p2 = create_prompt_inner(
            &db,
            CreatePromptRequest {
                name: "second".into(),
                content: "c2".into(),
                description: None,
                category: None,
                tags: None,
            },
        )
        .unwrap();

        let list = list_prompts_inner(&db).unwrap();
        assert_eq!(list.len(), 2);
        let ids: Vec<Uuid> = list.iter().map(|p| p.id).collect();
        assert!(ids.contains(&p1.id));
        assert!(ids.contains(&p2.id));
    }

    #[test]
    fn test_update_prompt_inner() {
        let db = test_db();
        let prompt = create_prompt_inner(
            &db,
            CreatePromptRequest {
                name: "original".into(),
                content: "original content".into(),
                description: None,
                category: None,
                tags: None,
            },
        )
        .unwrap();

        let updated = update_prompt_inner(
            &db,
            prompt.id.to_string(),
            UpdatePromptRequest {
                name: Some("renamed".into()),
                content: None,
                description: Some("new desc".into()),
                category: Some("Testing".into()),
                tags: Some(vec!["tag1".into()]),
            },
        )
        .unwrap();

        assert_eq!(updated.name, "renamed");
        assert_eq!(updated.content, "original content");
        assert_eq!(updated.description.as_deref(), Some("new desc"));
        assert_eq!(updated.category.as_deref(), Some("Testing"));
        assert_eq!(updated.tags, vec!["tag1"]);
        assert!(updated.updated_at >= prompt.updated_at);
    }

    #[test]
    fn test_update_prompt_inner_partial() {
        let db = test_db();
        let prompt = create_prompt_inner(
            &db,
            CreatePromptRequest {
                name: "original".into(),
                content: "body".into(),
                description: Some("desc".into()),
                category: Some("cat".into()),
                tags: Some(vec!["a".into()]),
            },
        )
        .unwrap();

        let updated = update_prompt_inner(
            &db,
            prompt.id.to_string(),
            UpdatePromptRequest {
                name: None,
                content: Some("new body".into()),
                description: None,
                category: None,
                tags: None,
            },
        )
        .unwrap();

        assert_eq!(updated.name, "original");
        assert_eq!(updated.content, "new body");
        assert_eq!(updated.description.as_deref(), Some("desc"));
        assert_eq!(updated.category.as_deref(), Some("cat"));
        assert_eq!(updated.tags, vec!["a"]);
    }

    #[test]
    fn test_update_prompt_inner_not_found() {
        let db = test_db();
        let fake_id = Uuid::new_v4().to_string();
        let result = update_prompt_inner(
            &db,
            fake_id,
            UpdatePromptRequest {
                name: Some("x".into()),
                content: None,
                description: None,
                category: None,
                tags: None,
            },
        );
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("not found") || err.contains("Prompt"));
    }

    #[test]
    fn test_update_prompt_inner_invalid_uuid() {
        let db = test_db();
        let result = update_prompt_inner(
            &db,
            "not-a-uuid".into(),
            UpdatePromptRequest {
                name: None,
                content: None,
                description: None,
                category: None,
                tags: None,
            },
        );
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("Invalid UUID"));
    }

    #[test]
    fn test_delete_prompt_inner() {
        let db = test_db();
        let prompt = create_prompt_inner(
            &db,
            CreatePromptRequest {
                name: "to-delete".into(),
                content: "body".into(),
                description: None,
                category: None,
                tags: None,
            },
        )
        .unwrap();

        let result = delete_prompt_inner(&db, prompt.id.to_string());
        assert!(result.is_ok());

        let list = list_prompts_inner(&db).unwrap();
        assert!(list.is_empty());
    }

    #[test]
    fn test_delete_prompt_inner_invalid_uuid() {
        let db = test_db();
        let result = delete_prompt_inner(&db, "bad-uuid".into());
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("Invalid UUID"));
    }

    #[test]
    fn test_create_and_list_roundtrip() {
        let db = test_db();
        let request = CreatePromptRequest {
            name: "roundtrip".into(),
            content: "content".into(),
            description: Some("desc".into()),
            category: Some("cat".into()),
            tags: Some(vec!["t1".into(), "t2".into()]),
        };
        let created = create_prompt_inner(&db, request).unwrap();

        let list = list_prompts_inner(&db).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, created.id);
        assert_eq!(list[0].name, "roundtrip");
        assert_eq!(list[0].tags, vec!["t1", "t2"]);
    }

    // ── Command wrapper tests ──

    use tauri::Manager;

    #[tokio::test]
    async fn test_create_prompt_command() {
        let app = mock_app_with_state();
        let state = app.state::<AppState>();
        let request = CreatePromptRequest {
            name: "test".into(),
            content: "body".into(),
            description: None,
            category: None,
            tags: None,
        };
        let result = create_prompt(state, request).await;
        assert!(result.is_ok());
        let prompt = result.unwrap();
        assert_eq!(prompt.name, "test");
        assert_eq!(prompt.content, "body");
    }

    #[tokio::test]
    async fn test_list_prompts_command() {
        let app = mock_app_with_state();
        let state = app.state::<AppState>();

        // Empty initially
        let list = list_prompts(state.clone()).await.unwrap();
        assert!(list.is_empty());

        // Create one, then list
        let request = CreatePromptRequest {
            name: "listed".into(),
            content: "c".into(),
            description: None,
            category: None,
            tags: None,
        };
        create_prompt(state.clone(), request).await.unwrap();
        let list = list_prompts(state).await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "listed");
    }

    #[tokio::test]
    async fn test_update_prompt_command() {
        let app = mock_app_with_state();
        let state = app.state::<AppState>();
        let created = create_prompt(
            state.clone(),
            CreatePromptRequest {
                name: "original".into(),
                content: "body".into(),
                description: None,
                category: None,
                tags: None,
            },
        )
        .await
        .unwrap();

        let updated = update_prompt(
            state,
            created.id.to_string(),
            UpdatePromptRequest {
                name: Some("renamed".into()),
                content: None,
                description: None,
                category: None,
                tags: None,
            },
        )
        .await
        .unwrap();

        assert_eq!(updated.name, "renamed");
        assert_eq!(updated.content, "body");
    }

    #[tokio::test]
    async fn test_delete_prompt_command() {
        let app = mock_app_with_state();
        let state = app.state::<AppState>();
        let created = create_prompt(
            state.clone(),
            CreatePromptRequest {
                name: "to-delete".into(),
                content: "body".into(),
                description: None,
                category: None,
                tags: None,
            },
        )
        .await
        .unwrap();

        let result = delete_prompt(state.clone(), created.id.to_string()).await;
        assert!(result.is_ok());

        let list = list_prompts(state).await.unwrap();
        assert!(list.is_empty());
    }
}
