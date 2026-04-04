use chrono::Utc;
use tauri::State;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::bookmark::{CreateBookmarkRequest, FileBookmark, UpdateBookmarkRequest};
use crate::state::AppState;

pub(crate) fn create_bookmark_inner(
    db: &crate::db::Database,
    request: CreateBookmarkRequest,
) -> Result<FileBookmark, AppError> {
    let now = Utc::now();
    let bookmark = FileBookmark {
        id: Uuid::new_v4(),
        repo_id: request.repo_id,
        file_path: request.file_path,
        line_number: request.line_number,
        note: request.note,
        color: request.color,
        created_at: now,
        updated_at: now,
    };

    db.insert_bookmark(&bookmark)?;
    Ok(bookmark)
}

pub(crate) fn list_bookmarks_inner(
    db: &crate::db::Database,
    repo_id: String,
) -> Result<Vec<FileBookmark>, AppError> {
    let repo_uuid = Uuid::parse_str(&repo_id)
        .map_err(|e| AppError::DbError(format!("Invalid UUID: {}", e)))?;
    db.list_bookmarks(&repo_uuid)
}

pub(crate) fn update_bookmark_inner(
    db: &crate::db::Database,
    bookmark_id: String,
    request: UpdateBookmarkRequest,
) -> Result<FileBookmark, AppError> {
    let id = Uuid::parse_str(&bookmark_id)
        .map_err(|e| AppError::DbError(format!("Invalid UUID: {}", e)))?;

    let mut bookmark = db
        .get_bookmark(&id)?
        .ok_or_else(|| AppError::DbError(format!("Bookmark not found: {}", id)))?;

    if let Some(note) = request.note {
        bookmark.note = if note.is_empty() { None } else { Some(note) };
    }
    if let Some(color) = request.color {
        bookmark.color = Some(color);
    }
    if let Some(line_number) = request.line_number {
        bookmark.line_number = line_number;
    }
    bookmark.updated_at = Utc::now();

    db.update_bookmark(&bookmark)?;
    Ok(bookmark)
}

pub(crate) fn delete_bookmark_inner(
    db: &crate::db::Database,
    bookmark_id: String,
) -> Result<(), AppError> {
    let id = Uuid::parse_str(&bookmark_id)
        .map_err(|e| AppError::DbError(format!("Invalid UUID: {}", e)))?;
    db.delete_bookmark(&id)?;
    Ok(())
}

pub(crate) fn toggle_bookmark_inner(
    db: &crate::db::Database,
    repo_id: String,
    file_path: String,
    line_number: u32,
) -> Result<Option<FileBookmark>, AppError> {
    let repo_uuid = Uuid::parse_str(&repo_id)
        .map_err(|e| AppError::DbError(format!("Invalid UUID: {}", e)))?;

    // Check if a bookmark exists at this location
    let deleted = db.delete_bookmark_at_line(&repo_uuid, &file_path, line_number)?;

    if deleted {
        Ok(None)
    } else {
        let now = Utc::now();
        let bookmark = FileBookmark {
            id: Uuid::new_v4(),
            repo_id: repo_uuid,
            file_path,
            line_number,
            note: None,
            color: None,
            created_at: now,
            updated_at: now,
        };
        db.insert_bookmark(&bookmark)?;
        Ok(Some(bookmark))
    }
}

#[tauri::command]
#[specta::specta]
pub async fn create_bookmark(
    state: State<'_, AppState>,
    request: CreateBookmarkRequest,
) -> Result<FileBookmark, AppError> {
    state.with_db(move |db| create_bookmark_inner(db, request)).await
}

#[tauri::command]
#[specta::specta]
pub async fn list_bookmarks(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<Vec<FileBookmark>, AppError> {
    state.with_db(move |db| list_bookmarks_inner(db, repo_id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn update_bookmark(
    state: State<'_, AppState>,
    bookmark_id: String,
    request: UpdateBookmarkRequest,
) -> Result<FileBookmark, AppError> {
    state.with_db(move |db| update_bookmark_inner(db, bookmark_id, request)).await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_bookmark(state: State<'_, AppState>, bookmark_id: String) -> Result<(), AppError> {
    state.with_db(move |db| delete_bookmark_inner(db, bookmark_id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn toggle_bookmark(
    state: State<'_, AppState>,
    repo_id: String,
    file_path: String,
    line_number: u32,
) -> Result<Option<FileBookmark>, AppError> {
    state.with_db(move |db| toggle_bookmark_inner(db, repo_id, file_path, line_number)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::*;

    fn setup_db_with_repo() -> (crate::db::Database, Uuid) {
        let db = test_db();
        let (repo, _ws) = insert_test_repo_and_workspace(&db);
        (db, repo.id)
    }

    #[test]
    fn test_create_bookmark_inner() {
        let (db, repo_id) = setup_db_with_repo();
        let request = CreateBookmarkRequest {
            repo_id,
            file_path: "src/main.rs".into(),
            line_number: 10,
            note: None,
            color: None,
        };
        let result = create_bookmark_inner(&db, request);
        assert!(result.is_ok());
        let bookmark = result.unwrap();
        assert_eq!(bookmark.repo_id, repo_id);
        assert_eq!(bookmark.file_path, "src/main.rs");
        assert_eq!(bookmark.line_number, 10);
        assert!(bookmark.note.is_none());
        assert!(bookmark.color.is_none());
    }

    #[test]
    fn test_create_bookmark_inner_with_all_fields() {
        let (db, repo_id) = setup_db_with_repo();
        let request = CreateBookmarkRequest {
            repo_id,
            file_path: "src/lib.rs".into(),
            line_number: 42,
            note: Some("Important".into()),
            color: Some("red".into()),
        };
        let result = create_bookmark_inner(&db, request).unwrap();
        assert_eq!(result.note.as_deref(), Some("Important"));
        assert_eq!(result.color.as_deref(), Some("red"));
        assert_eq!(result.line_number, 42);
    }

    #[test]
    fn test_list_bookmarks_inner_empty() {
        let (db, repo_id) = setup_db_with_repo();
        let result = list_bookmarks_inner(&db, repo_id.to_string()).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_list_bookmarks_inner_returns_inserted() {
        let (db, repo_id) = setup_db_with_repo();
        let b1 = create_bookmark_inner(
            &db,
            CreateBookmarkRequest {
                repo_id,
                file_path: "file1.rs".into(),
                line_number: 1,
                note: None,
                color: None,
            },
        )
        .unwrap();
        let b2 = create_bookmark_inner(
            &db,
            CreateBookmarkRequest {
                repo_id,
                file_path: "file2.rs".into(),
                line_number: 2,
                note: None,
                color: None,
            },
        )
        .unwrap();

        let list = list_bookmarks_inner(&db, repo_id.to_string()).unwrap();
        assert_eq!(list.len(), 2);
        let ids: Vec<Uuid> = list.iter().map(|b| b.id).collect();
        assert!(ids.contains(&b1.id));
        assert!(ids.contains(&b2.id));
    }

    #[test]
    fn test_list_bookmarks_inner_filters_by_repo() {
        let db = test_db();
        // Create two repos
        let repo1 = test_repo();
        db.insert_repository(&repo1).unwrap();
        let ws1 = test_workspace(repo1.id);
        db.insert_workspace(&ws1).unwrap();

        let mut repo2 = test_repo();
        repo2.id = Uuid::new_v4();
        repo2.name = "other-repo".into();
        repo2.path = std::path::PathBuf::from("/tmp/other-repo");
        db.insert_repository(&repo2).unwrap();

        create_bookmark_inner(
            &db,
            CreateBookmarkRequest {
                repo_id: repo1.id,
                file_path: "file1.rs".into(),
                line_number: 1,
                note: None,
                color: None,
            },
        )
        .unwrap();
        create_bookmark_inner(
            &db,
            CreateBookmarkRequest {
                repo_id: repo2.id,
                file_path: "file2.rs".into(),
                line_number: 2,
                note: None,
                color: None,
            },
        )
        .unwrap();

        let list1 = list_bookmarks_inner(&db, repo1.id.to_string()).unwrap();
        assert_eq!(list1.len(), 1);
        assert_eq!(list1[0].file_path, "file1.rs");

        let list2 = list_bookmarks_inner(&db, repo2.id.to_string()).unwrap();
        assert_eq!(list2.len(), 1);
        assert_eq!(list2[0].file_path, "file2.rs");
    }

    #[test]
    fn test_list_bookmarks_inner_invalid_uuid() {
        let db = test_db();
        let result = list_bookmarks_inner(&db, "not-a-uuid".into());
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("Invalid UUID"));
    }

    #[test]
    fn test_update_bookmark_inner() {
        let (db, repo_id) = setup_db_with_repo();
        let bookmark = create_bookmark_inner(
            &db,
            CreateBookmarkRequest {
                repo_id,
                file_path: "src/main.rs".into(),
                line_number: 10,
                note: None,
                color: None,
            },
        )
        .unwrap();

        let updated = update_bookmark_inner(
            &db,
            bookmark.id.to_string(),
            UpdateBookmarkRequest {
                note: Some("Updated note".into()),
                color: Some("green".into()),
                line_number: Some(20),
            },
        )
        .unwrap();

        assert_eq!(updated.note.as_deref(), Some("Updated note"));
        assert_eq!(updated.color.as_deref(), Some("green"));
        assert_eq!(updated.line_number, 20);
        assert!(updated.updated_at >= bookmark.updated_at);
    }

    #[test]
    fn test_update_bookmark_inner_empty_note_becomes_none() {
        let (db, repo_id) = setup_db_with_repo();
        let bookmark = create_bookmark_inner(
            &db,
            CreateBookmarkRequest {
                repo_id,
                file_path: "src/main.rs".into(),
                line_number: 10,
                note: Some("has a note".into()),
                color: None,
            },
        )
        .unwrap();

        let updated = update_bookmark_inner(
            &db,
            bookmark.id.to_string(),
            UpdateBookmarkRequest {
                note: Some("".into()),
                color: None,
                line_number: None,
            },
        )
        .unwrap();

        assert!(updated.note.is_none());
    }

    #[test]
    fn test_update_bookmark_inner_partial() {
        let (db, repo_id) = setup_db_with_repo();
        let bookmark = create_bookmark_inner(
            &db,
            CreateBookmarkRequest {
                repo_id,
                file_path: "src/main.rs".into(),
                line_number: 10,
                note: Some("original".into()),
                color: Some("blue".into()),
            },
        )
        .unwrap();

        let updated = update_bookmark_inner(
            &db,
            bookmark.id.to_string(),
            UpdateBookmarkRequest {
                note: None,
                color: None,
                line_number: Some(99),
            },
        )
        .unwrap();

        assert_eq!(updated.note.as_deref(), Some("original"));
        assert_eq!(updated.color.as_deref(), Some("blue"));
        assert_eq!(updated.line_number, 99);
    }

    #[test]
    fn test_update_bookmark_inner_not_found() {
        let db = test_db();
        let fake_id = Uuid::new_v4().to_string();
        let result = update_bookmark_inner(
            &db,
            fake_id,
            UpdateBookmarkRequest {
                note: Some("x".into()),
                color: None,
                line_number: None,
            },
        );
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("not found") || err.contains("Bookmark"));
    }

    #[test]
    fn test_update_bookmark_inner_invalid_uuid() {
        let db = test_db();
        let result = update_bookmark_inner(
            &db,
            "not-a-uuid".into(),
            UpdateBookmarkRequest {
                note: None,
                color: None,
                line_number: None,
            },
        );
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("Invalid UUID"));
    }

    #[test]
    fn test_delete_bookmark_inner() {
        let (db, repo_id) = setup_db_with_repo();
        let bookmark = create_bookmark_inner(
            &db,
            CreateBookmarkRequest {
                repo_id,
                file_path: "src/main.rs".into(),
                line_number: 10,
                note: None,
                color: None,
            },
        )
        .unwrap();

        let result = delete_bookmark_inner(&db, bookmark.id.to_string());
        assert!(result.is_ok());

        let list = list_bookmarks_inner(&db, repo_id.to_string()).unwrap();
        assert!(list.is_empty());
    }

    #[test]
    fn test_delete_bookmark_inner_invalid_uuid() {
        let db = test_db();
        let result = delete_bookmark_inner(&db, "bad-uuid".into());
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("Invalid UUID"));
    }

    #[test]
    fn test_toggle_bookmark_inner_creates_when_none_exists() {
        let (db, repo_id) = setup_db_with_repo();
        let result =
            toggle_bookmark_inner(&db, repo_id.to_string(), "src/main.rs".into(), 42).unwrap();

        assert!(result.is_some());
        let bookmark = result.unwrap();
        assert_eq!(bookmark.repo_id, repo_id);
        assert_eq!(bookmark.file_path, "src/main.rs");
        assert_eq!(bookmark.line_number, 42);
        assert!(bookmark.note.is_none());
        assert!(bookmark.color.is_none());
    }

    #[test]
    fn test_toggle_bookmark_inner_deletes_when_exists() {
        let (db, repo_id) = setup_db_with_repo();

        // First toggle creates
        let created =
            toggle_bookmark_inner(&db, repo_id.to_string(), "src/main.rs".into(), 42).unwrap();
        assert!(created.is_some());

        // Second toggle at same location deletes
        let deleted =
            toggle_bookmark_inner(&db, repo_id.to_string(), "src/main.rs".into(), 42).unwrap();
        assert!(deleted.is_none());

        // Verify it's gone
        let list = list_bookmarks_inner(&db, repo_id.to_string()).unwrap();
        assert!(list.is_empty());
    }

    #[test]
    fn test_toggle_bookmark_inner_different_lines_are_independent() {
        let (db, repo_id) = setup_db_with_repo();

        toggle_bookmark_inner(&db, repo_id.to_string(), "src/main.rs".into(), 10).unwrap();
        toggle_bookmark_inner(&db, repo_id.to_string(), "src/main.rs".into(), 20).unwrap();

        let list = list_bookmarks_inner(&db, repo_id.to_string()).unwrap();
        assert_eq!(list.len(), 2);

        // Toggle off line 10 only
        let result =
            toggle_bookmark_inner(&db, repo_id.to_string(), "src/main.rs".into(), 10).unwrap();
        assert!(result.is_none());

        let list = list_bookmarks_inner(&db, repo_id.to_string()).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].line_number, 20);
    }

    #[test]
    fn test_toggle_bookmark_inner_invalid_uuid() {
        let db = test_db();
        let result = toggle_bookmark_inner(&db, "not-a-uuid".into(), "file.rs".into(), 1);
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("Invalid UUID"));
    }

    #[test]
    fn test_create_and_list_roundtrip() {
        let (db, repo_id) = setup_db_with_repo();
        let request = CreateBookmarkRequest {
            repo_id,
            file_path: "roundtrip.rs".into(),
            line_number: 100,
            note: Some("note".into()),
            color: Some("yellow".into()),
        };
        let created = create_bookmark_inner(&db, request).unwrap();

        let list = list_bookmarks_inner(&db, repo_id.to_string()).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, created.id);
        assert_eq!(list[0].file_path, "roundtrip.rs");
        assert_eq!(list[0].line_number, 100);
        assert_eq!(list[0].note.as_deref(), Some("note"));
    }

    // ── Command wrapper tests ──

    use tauri::Manager;

    fn setup_app_with_repo() -> (tauri::App<tauri::test::MockRuntime>, Uuid) {
        let app = mock_app_with_state();
        let state = app.state::<AppState>();
        let repo_id = {
            let db_lock = state.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            let repo = test_repo();
            db.insert_repository(&repo).unwrap();
            let ws = test_workspace(repo.id);
            db.insert_workspace(&ws).unwrap();
            repo.id
        };
        (app, repo_id)
    }

    #[tokio::test]
    async fn test_create_bookmark_command() {
        let (app, repo_id) = setup_app_with_repo();
        let state = app.state::<AppState>();
        let request = CreateBookmarkRequest {
            repo_id,
            file_path: "src/main.rs".into(),
            line_number: 10,
            note: None,
            color: None,
        };
        let result = create_bookmark(state, request).await;
        assert!(result.is_ok());
        let bookmark = result.unwrap();
        assert_eq!(bookmark.repo_id, repo_id);
        assert_eq!(bookmark.file_path, "src/main.rs");
        assert_eq!(bookmark.line_number, 10);
    }

    #[tokio::test]
    async fn test_list_bookmarks_command() {
        let (app, repo_id) = setup_app_with_repo();
        let state = app.state::<AppState>();

        let list = list_bookmarks(state.clone(), repo_id.to_string()).await.unwrap();
        assert!(list.is_empty());

        create_bookmark(
            state.clone(),
            CreateBookmarkRequest {
                repo_id,
                file_path: "file.rs".into(),
                line_number: 1,
                note: None,
                color: None,
            },
        )
        .await
        .unwrap();

        let list = list_bookmarks(state, repo_id.to_string()).await.unwrap();
        assert_eq!(list.len(), 1);
    }

    #[tokio::test]
    async fn test_update_bookmark_command() {
        let (app, repo_id) = setup_app_with_repo();
        let state = app.state::<AppState>();
        let created = create_bookmark(
            state.clone(),
            CreateBookmarkRequest {
                repo_id,
                file_path: "src/main.rs".into(),
                line_number: 10,
                note: None,
                color: None,
            },
        )
        .await
        .unwrap();

        let updated = update_bookmark(
            state,
            created.id.to_string(),
            UpdateBookmarkRequest {
                note: Some("Updated".into()),
                color: Some("red".into()),
                line_number: Some(20),
            },
        )
        .await
        .unwrap();

        assert_eq!(updated.note.as_deref(), Some("Updated"));
        assert_eq!(updated.color.as_deref(), Some("red"));
        assert_eq!(updated.line_number, 20);
    }

    #[tokio::test]
    async fn test_delete_bookmark_command() {
        let (app, repo_id) = setup_app_with_repo();
        let state = app.state::<AppState>();
        let created = create_bookmark(
            state.clone(),
            CreateBookmarkRequest {
                repo_id,
                file_path: "src/main.rs".into(),
                line_number: 10,
                note: None,
                color: None,
            },
        )
        .await
        .unwrap();

        let result = delete_bookmark(state.clone(), created.id.to_string()).await;
        assert!(result.is_ok());

        let list = list_bookmarks(state, repo_id.to_string()).await.unwrap();
        assert!(list.is_empty());
    }

    #[tokio::test]
    async fn test_toggle_bookmark_command() {
        let (app, repo_id) = setup_app_with_repo();
        let state = app.state::<AppState>();

        // First toggle creates
        let result = toggle_bookmark(
            state.clone(),
            repo_id.to_string(),
            "src/main.rs".into(),
            42,
        )
        .await
        .unwrap();
        assert!(result.is_some());

        // Second toggle deletes
        let result = toggle_bookmark(
            state,
            repo_id.to_string(),
            "src/main.rs".into(),
            42,
        )
        .await
        .unwrap();
        assert!(result.is_none());
    }
}
