use chrono::Utc;
use tauri::State;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::snippet::{CreateSnippetRequest, Snippet, UpdateSnippetRequest};
use crate::state::AppState;

pub(crate) fn create_snippet_inner(
    db: &crate::db::Database,
    request: CreateSnippetRequest,
) -> Result<Snippet, AppError> {
    let now = Utc::now();
    let snippet = Snippet {
        id: Uuid::new_v4(),
        title: request.title,
        content: request.content,
        language: request.language,
        description: request.description,
        tags: request.tags.unwrap_or_default(),
        source: request.source,
        created_at: now,
        updated_at: now,
    };

    db.insert_snippet(&snippet)?;
    Ok(snippet)
}

pub(crate) fn list_snippets_inner(
    db: &crate::db::Database,
) -> Result<Vec<Snippet>, AppError> {
    db.list_snippets()
}

pub(crate) fn update_snippet_inner(
    db: &crate::db::Database,
    snippet_id: String,
    request: UpdateSnippetRequest,
) -> Result<Snippet, AppError> {
    let id = Uuid::parse_str(&snippet_id)
        .map_err(|e| AppError::DbError(format!("Invalid UUID: {}", e)))?;

    let mut snippet = db
        .get_snippet(&id)?
        .ok_or_else(|| AppError::DbError(format!("Snippet not found: {}", id)))?;

    if let Some(title) = request.title {
        snippet.title = title;
    }
    if let Some(content) = request.content {
        snippet.content = content;
    }
    if let Some(language) = request.language {
        snippet.language = Some(language);
    }
    if let Some(desc) = request.description {
        snippet.description = Some(desc);
    }
    if let Some(tags) = request.tags {
        snippet.tags = tags;
    }
    if let Some(source) = request.source {
        snippet.source = Some(source);
    }
    snippet.updated_at = Utc::now();

    db.update_snippet(&snippet)?;
    Ok(snippet)
}

pub(crate) fn delete_snippet_inner(
    db: &crate::db::Database,
    snippet_id: String,
) -> Result<(), AppError> {
    let id = Uuid::parse_str(&snippet_id)
        .map_err(|e| AppError::DbError(format!("Invalid UUID: {}", e)))?;
    db.delete_snippet(&id)?;
    Ok(())
}

#[tauri::command]
pub async fn create_snippet(
    state: State<'_, AppState>,
    request: CreateSnippetRequest,
) -> Result<Snippet, AppError> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::DbError("Database not initialized".to_string()))?;
    create_snippet_inner(db, request)
}

#[tauri::command]
pub async fn list_snippets(state: State<'_, AppState>) -> Result<Vec<Snippet>, AppError> {
    let db_lock = state.db.lock().unwrap();
    if let Some(db) = db_lock.as_ref() {
        list_snippets_inner(db)
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
pub async fn update_snippet(
    state: State<'_, AppState>,
    snippet_id: String,
    request: UpdateSnippetRequest,
) -> Result<Snippet, AppError> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::DbError("Database not initialized".to_string()))?;
    update_snippet_inner(db, snippet_id, request)
}

#[tauri::command]
pub async fn delete_snippet(state: State<'_, AppState>, snippet_id: String) -> Result<(), AppError> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::DbError("Database not initialized".to_string()))?;
    delete_snippet_inner(db, snippet_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::*;

    #[test]
    fn test_create_snippet_inner() {
        let db = test_db();
        let request = CreateSnippetRequest {
            title: "test snippet".into(),
            content: "console.log('hi')".into(),
            language: None,
            description: None,
            tags: None,
            source: None,
        };
        let result = create_snippet_inner(&db, request);
        assert!(result.is_ok());
        let snippet = result.unwrap();
        assert_eq!(snippet.title, "test snippet");
        assert_eq!(snippet.content, "console.log('hi')");
        assert!(snippet.tags.is_empty());
        assert!(snippet.language.is_none());
    }

    #[test]
    fn test_create_snippet_inner_with_all_fields() {
        let db = test_db();
        let request = CreateSnippetRequest {
            title: "full snippet".into(),
            content: "fn main() {}".into(),
            language: Some("rust".into()),
            description: Some("A rust snippet".into()),
            tags: Some(vec!["rust".into(), "example".into()]),
            source: Some("chat".into()),
        };
        let result = create_snippet_inner(&db, request).unwrap();
        assert_eq!(result.title, "full snippet");
        assert_eq!(result.language.as_deref(), Some("rust"));
        assert_eq!(result.description.as_deref(), Some("A rust snippet"));
        assert_eq!(result.tags, vec!["rust", "example"]);
        assert_eq!(result.source.as_deref(), Some("chat"));
    }

    #[test]
    fn test_list_snippets_inner_empty() {
        let db = test_db();
        let result = list_snippets_inner(&db).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_list_snippets_inner_returns_inserted() {
        let db = test_db();
        let s1 = create_snippet_inner(
            &db,
            CreateSnippetRequest {
                title: "first".into(),
                content: "c1".into(),
                language: None,
                description: None,
                tags: None,
                source: None,
            },
        )
        .unwrap();
        let s2 = create_snippet_inner(
            &db,
            CreateSnippetRequest {
                title: "second".into(),
                content: "c2".into(),
                language: None,
                description: None,
                tags: None,
                source: None,
            },
        )
        .unwrap();

        let list = list_snippets_inner(&db).unwrap();
        assert_eq!(list.len(), 2);
        let ids: Vec<Uuid> = list.iter().map(|s| s.id).collect();
        assert!(ids.contains(&s1.id));
        assert!(ids.contains(&s2.id));
    }

    #[test]
    fn test_update_snippet_inner() {
        let db = test_db();
        let snippet = create_snippet_inner(
            &db,
            CreateSnippetRequest {
                title: "original".into(),
                content: "original content".into(),
                language: None,
                description: None,
                tags: None,
                source: None,
            },
        )
        .unwrap();

        let updated = update_snippet_inner(
            &db,
            snippet.id.to_string(),
            UpdateSnippetRequest {
                title: Some("renamed".into()),
                content: None,
                language: Some("python".into()),
                description: Some("new desc".into()),
                tags: Some(vec!["tag1".into()]),
                source: Some("manual".into()),
            },
        )
        .unwrap();

        assert_eq!(updated.title, "renamed");
        assert_eq!(updated.content, "original content");
        assert_eq!(updated.language.as_deref(), Some("python"));
        assert_eq!(updated.description.as_deref(), Some("new desc"));
        assert_eq!(updated.tags, vec!["tag1"]);
        assert_eq!(updated.source.as_deref(), Some("manual"));
        assert!(updated.updated_at >= snippet.updated_at);
    }

    #[test]
    fn test_update_snippet_inner_partial() {
        let db = test_db();
        let snippet = create_snippet_inner(
            &db,
            CreateSnippetRequest {
                title: "original".into(),
                content: "body".into(),
                language: Some("js".into()),
                description: Some("desc".into()),
                tags: Some(vec!["a".into()]),
                source: Some("chat".into()),
            },
        )
        .unwrap();

        let updated = update_snippet_inner(
            &db,
            snippet.id.to_string(),
            UpdateSnippetRequest {
                title: None,
                content: Some("new body".into()),
                language: None,
                description: None,
                tags: None,
                source: None,
            },
        )
        .unwrap();

        assert_eq!(updated.title, "original");
        assert_eq!(updated.content, "new body");
        assert_eq!(updated.language.as_deref(), Some("js"));
        assert_eq!(updated.description.as_deref(), Some("desc"));
        assert_eq!(updated.tags, vec!["a"]);
        assert_eq!(updated.source.as_deref(), Some("chat"));
    }

    #[test]
    fn test_update_snippet_inner_not_found() {
        let db = test_db();
        let fake_id = Uuid::new_v4().to_string();
        let result = update_snippet_inner(
            &db,
            fake_id,
            UpdateSnippetRequest {
                title: Some("x".into()),
                content: None,
                language: None,
                description: None,
                tags: None,
                source: None,
            },
        );
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("not found") || err.contains("Snippet"));
    }

    #[test]
    fn test_update_snippet_inner_invalid_uuid() {
        let db = test_db();
        let result = update_snippet_inner(
            &db,
            "not-a-uuid".into(),
            UpdateSnippetRequest {
                title: None,
                content: None,
                language: None,
                description: None,
                tags: None,
                source: None,
            },
        );
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("Invalid UUID"));
    }

    #[test]
    fn test_delete_snippet_inner() {
        let db = test_db();
        let snippet = create_snippet_inner(
            &db,
            CreateSnippetRequest {
                title: "to-delete".into(),
                content: "body".into(),
                language: None,
                description: None,
                tags: None,
                source: None,
            },
        )
        .unwrap();

        let result = delete_snippet_inner(&db, snippet.id.to_string());
        assert!(result.is_ok());

        let list = list_snippets_inner(&db).unwrap();
        assert!(list.is_empty());
    }

    #[test]
    fn test_delete_snippet_inner_invalid_uuid() {
        let db = test_db();
        let result = delete_snippet_inner(&db, "bad-uuid".into());
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("Invalid UUID"));
    }

    #[test]
    fn test_create_and_list_roundtrip() {
        let db = test_db();
        let request = CreateSnippetRequest {
            title: "roundtrip".into(),
            content: "content".into(),
            language: Some("ts".into()),
            description: Some("desc".into()),
            tags: Some(vec!["t1".into(), "t2".into()]),
            source: Some("manual".into()),
        };
        let created = create_snippet_inner(&db, request).unwrap();

        let list = list_snippets_inner(&db).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, created.id);
        assert_eq!(list[0].title, "roundtrip");
        assert_eq!(list[0].tags, vec!["t1", "t2"]);
    }

    // ── Command wrapper tests ──

    use tauri::Manager;

    #[tokio::test]
    async fn test_create_snippet_command() {
        let app = mock_app_with_state();
        let state = app.state::<AppState>();
        let request = CreateSnippetRequest {
            title: "test snippet".into(),
            content: "console.log('hi')".into(),
            language: None,
            description: None,
            tags: None,
            source: None,
        };
        let result = create_snippet(state, request).await;
        assert!(result.is_ok());
        let snippet = result.unwrap();
        assert_eq!(snippet.title, "test snippet");
        assert_eq!(snippet.content, "console.log('hi')");
    }

    #[tokio::test]
    async fn test_list_snippets_command() {
        let app = mock_app_with_state();
        let state = app.state::<AppState>();

        let list = list_snippets(state.clone()).await.unwrap();
        assert!(list.is_empty());

        create_snippet(
            state.clone(),
            CreateSnippetRequest {
                title: "listed".into(),
                content: "c".into(),
                language: None,
                description: None,
                tags: None,
                source: None,
            },
        )
        .await
        .unwrap();
        let list = list_snippets(state).await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].title, "listed");
    }

    #[tokio::test]
    async fn test_update_snippet_command() {
        let app = mock_app_with_state();
        let state = app.state::<AppState>();
        let created = create_snippet(
            state.clone(),
            CreateSnippetRequest {
                title: "original".into(),
                content: "body".into(),
                language: None,
                description: None,
                tags: None,
                source: None,
            },
        )
        .await
        .unwrap();

        let updated = update_snippet(
            state,
            created.id.to_string(),
            UpdateSnippetRequest {
                title: Some("renamed".into()),
                content: None,
                language: Some("rust".into()),
                description: None,
                tags: None,
                source: None,
            },
        )
        .await
        .unwrap();

        assert_eq!(updated.title, "renamed");
        assert_eq!(updated.content, "body");
        assert_eq!(updated.language.as_deref(), Some("rust"));
    }

    #[tokio::test]
    async fn test_delete_snippet_command() {
        let app = mock_app_with_state();
        let state = app.state::<AppState>();
        let created = create_snippet(
            state.clone(),
            CreateSnippetRequest {
                title: "to-delete".into(),
                content: "body".into(),
                language: None,
                description: None,
                tags: None,
                source: None,
            },
        )
        .await
        .unwrap();

        let result = delete_snippet(state.clone(), created.id.to_string()).await;
        assert!(result.is_ok());

        let list = list_snippets(state).await.unwrap();
        assert!(list.is_empty());
    }
}
