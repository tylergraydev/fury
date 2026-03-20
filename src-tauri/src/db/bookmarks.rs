use super::Database;
use crate::error::AppError;
use crate::models::bookmark::FileBookmark;
use chrono::{DateTime, Utc};
use uuid::Uuid;

impl Database {
    pub fn insert_bookmark(&self, bookmark: &FileBookmark) -> Result<(), AppError> {
        self.conn.execute(
            "INSERT INTO file_bookmarks (id, repo_id, file_path, line_number, note, color, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                bookmark.id.to_string(),
                bookmark.repo_id.to_string(),
                bookmark.file_path,
                bookmark.line_number,
                bookmark.note,
                bookmark.color,
                bookmark.created_at.to_rfc3339(),
                bookmark.updated_at.to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    pub fn list_bookmarks(&self, repo_id: &Uuid) -> Result<Vec<FileBookmark>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, repo_id, file_path, line_number, note, color, created_at, updated_at
             FROM file_bookmarks WHERE repo_id = ?1 ORDER BY file_path ASC, line_number ASC",
        )?;
        let bookmarks = stmt
            .query_map(rusqlite::params![repo_id.to_string()], |row| {
                let id_str: String = row.get(0)?;
                let repo_id_str: String = row.get(1)?;
                let created_str: String = row.get(6)?;
                let updated_str: String = row.get(7)?;
                Ok(FileBookmark {
                    id: Uuid::parse_str(&id_str).unwrap_or_default(),
                    repo_id: Uuid::parse_str(&repo_id_str).unwrap_or_default(),
                    file_path: row.get(2)?,
                    line_number: row.get(3)?,
                    note: row.get(4)?,
                    color: row.get(5)?,
                    created_at: DateTime::parse_from_rfc3339(&created_str)
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(|_| Utc::now()),
                    updated_at: DateTime::parse_from_rfc3339(&updated_str)
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(|_| Utc::now()),
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(bookmarks)
    }

    #[allow(dead_code)]
    pub fn list_bookmarks_for_file(
        &self,
        repo_id: &Uuid,
        file_path: &str,
    ) -> Result<Vec<FileBookmark>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, repo_id, file_path, line_number, note, color, created_at, updated_at
             FROM file_bookmarks WHERE repo_id = ?1 AND file_path = ?2 ORDER BY line_number ASC",
        )?;
        let bookmarks = stmt
            .query_map(rusqlite::params![repo_id.to_string(), file_path], |row| {
                let id_str: String = row.get(0)?;
                let repo_id_str: String = row.get(1)?;
                let created_str: String = row.get(6)?;
                let updated_str: String = row.get(7)?;
                Ok(FileBookmark {
                    id: Uuid::parse_str(&id_str).unwrap_or_default(),
                    repo_id: Uuid::parse_str(&repo_id_str).unwrap_or_default(),
                    file_path: row.get(2)?,
                    line_number: row.get(3)?,
                    note: row.get(4)?,
                    color: row.get(5)?,
                    created_at: DateTime::parse_from_rfc3339(&created_str)
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(|_| Utc::now()),
                    updated_at: DateTime::parse_from_rfc3339(&updated_str)
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(|_| Utc::now()),
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(bookmarks)
    }

    pub fn get_bookmark(&self, id: &Uuid) -> Result<Option<FileBookmark>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, repo_id, file_path, line_number, note, color, created_at, updated_at
             FROM file_bookmarks WHERE id = ?1",
        )?;
        let result = stmt.query_row(rusqlite::params![id.to_string()], |row| {
            let id_str: String = row.get(0)?;
            let repo_id_str: String = row.get(1)?;
            let created_str: String = row.get(6)?;
            let updated_str: String = row.get(7)?;
            Ok(FileBookmark {
                id: Uuid::parse_str(&id_str).unwrap_or_default(),
                repo_id: Uuid::parse_str(&repo_id_str).unwrap_or_default(),
                file_path: row.get(2)?,
                line_number: row.get(3)?,
                note: row.get(4)?,
                color: row.get(5)?,
                created_at: DateTime::parse_from_rfc3339(&created_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                updated_at: DateTime::parse_from_rfc3339(&updated_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
            })
        });
        match result {
            Ok(bookmark) => Ok(Some(bookmark)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::DbError(e.to_string())),
        }
    }

    pub fn update_bookmark(&self, bookmark: &FileBookmark) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE file_bookmarks SET note = ?1, color = ?2, line_number = ?3, updated_at = ?4 WHERE id = ?5",
            rusqlite::params![
                bookmark.note,
                bookmark.color,
                bookmark.line_number,
                bookmark.updated_at.to_rfc3339(),
                bookmark.id.to_string(),
            ],
        )?;
        Ok(())
    }

    pub fn delete_bookmark(&self, id: &Uuid) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM file_bookmarks WHERE id = ?1",
            rusqlite::params![id.to_string()],
        )?;
        Ok(())
    }

    pub fn delete_bookmark_at_line(
        &self,
        repo_id: &Uuid,
        file_path: &str,
        line_number: u32,
    ) -> Result<bool, AppError> {
        let count = self.conn.execute(
            "DELETE FROM file_bookmarks WHERE repo_id = ?1 AND file_path = ?2 AND line_number = ?3",
            rusqlite::params![repo_id.to_string(), file_path, line_number],
        )?;
        Ok(count > 0)
    }
}

#[cfg(test)]
mod tests {
    use crate::test_helpers::*;
    use chrono::Utc;
    use uuid::Uuid;

    #[test]
    fn test_insert_and_list_bookmarks() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let bookmark = test_bookmark(repo.id);
        db.insert_bookmark(&bookmark).unwrap();
        let bookmarks = db.list_bookmarks(&repo.id).unwrap();
        assert_eq!(bookmarks.len(), 1);
        assert_eq!(bookmarks[0].id, bookmark.id);
        assert_eq!(bookmarks[0].file_path, "src/main.ts");
        assert_eq!(bookmarks[0].line_number, 42);
        assert_eq!(bookmarks[0].note.as_deref(), Some("Important function"));
        assert_eq!(bookmarks[0].color.as_deref(), Some("blue"));
    }

    #[test]
    fn test_list_bookmarks_for_file() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let bm1 = test_bookmark(repo.id);
        db.insert_bookmark(&bm1).unwrap();
        let mut bm2 = test_bookmark(repo.id);
        bm2.id = Uuid::new_v4();
        bm2.file_path = "src/other.ts".to_string();
        bm2.line_number = 10;
        db.insert_bookmark(&bm2).unwrap();
        let bookmarks = db.list_bookmarks_for_file(&repo.id, "src/main.ts").unwrap();
        assert_eq!(bookmarks.len(), 1);
        assert_eq!(bookmarks[0].file_path, "src/main.ts");
    }

    #[test]
    fn test_get_bookmark() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let bookmark = test_bookmark(repo.id);
        db.insert_bookmark(&bookmark).unwrap();
        let fetched = db.get_bookmark(&bookmark.id).unwrap().unwrap();
        assert_eq!(fetched.file_path, "src/main.ts");
        assert_eq!(fetched.line_number, 42);
    }

    #[test]
    fn test_get_nonexistent_bookmark() {
        let db = test_db();
        let result = db.get_bookmark(&Uuid::new_v4()).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_update_bookmark() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let mut bookmark = test_bookmark(repo.id);
        db.insert_bookmark(&bookmark).unwrap();
        bookmark.note = Some("Updated note".to_string());
        bookmark.color = Some("red".to_string());
        bookmark.updated_at = Utc::now();
        db.update_bookmark(&bookmark).unwrap();
        let fetched = db.get_bookmark(&bookmark.id).unwrap().unwrap();
        assert_eq!(fetched.note.as_deref(), Some("Updated note"));
        assert_eq!(fetched.color.as_deref(), Some("red"));
    }

    #[test]
    fn test_delete_bookmark() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let bookmark = test_bookmark(repo.id);
        db.insert_bookmark(&bookmark).unwrap();
        db.delete_bookmark(&bookmark.id).unwrap();
        let bookmarks = db.list_bookmarks(&repo.id).unwrap();
        assert!(bookmarks.is_empty());
    }

    #[test]
    fn test_delete_bookmark_at_line() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let bookmark = test_bookmark(repo.id);
        db.insert_bookmark(&bookmark).unwrap();
        let deleted = db
            .delete_bookmark_at_line(&repo.id, "src/main.ts", 42)
            .unwrap();
        assert!(deleted);
        let bookmarks = db.list_bookmarks(&repo.id).unwrap();
        assert!(bookmarks.is_empty());
    }

    #[test]
    fn test_delete_bookmark_at_line_nonexistent() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let deleted = db
            .delete_bookmark_at_line(&repo.id, "src/main.ts", 99)
            .unwrap();
        assert!(!deleted);
    }

    #[test]
    fn test_bookmarks_cascade_on_repo_delete() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let bookmark = test_bookmark(repo.id);
        db.insert_bookmark(&bookmark).unwrap();
        db.delete_repository(&repo.id).unwrap();
        let bookmarks = db.list_bookmarks(&repo.id).unwrap();
        assert!(bookmarks.is_empty());
    }

    #[test]
    fn test_bookmark_unique_constraint() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let bm1 = test_bookmark(repo.id);
        db.insert_bookmark(&bm1).unwrap();
        let mut bm2 = test_bookmark(repo.id);
        bm2.id = Uuid::new_v4();
        let result = db.insert_bookmark(&bm2);
        assert!(result.is_err());
    }
}
