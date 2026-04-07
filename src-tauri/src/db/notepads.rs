use super::Database;
use crate::error::AppError;
use crate::models::notepad::Notepad;
use chrono::{DateTime, Utc};
use uuid::Uuid;

impl Database {
    pub fn insert_notepad(&self, notepad: &Notepad) -> Result<(), AppError> {
        let tags_json = serde_json::to_string(&notepad.tags)?;
        self.conn.execute(
            "INSERT INTO notepads (id, title, content, description, tags, pinned, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                notepad.id.to_string(),
                notepad.title,
                notepad.content,
                notepad.description,
                tags_json,
                notepad.pinned as i32,
                notepad.created_at.to_rfc3339(),
                notepad.updated_at.to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    pub fn list_notepads(&self) -> Result<Vec<Notepad>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, content, description, tags, pinned, created_at, updated_at
             FROM notepads ORDER BY pinned DESC, title ASC",
        )?;
        let notepads = stmt
            .query_map([], |row| {
                let tags_json: String = row.get(4)?;
                let id_str: String = row.get(0)?;
                let created_str: String = row.get(6)?;
                let updated_str: String = row.get(7)?;
                let pinned_int: i32 = row.get(5)?;
                Ok(Notepad {
                    id: Uuid::parse_str(&id_str).unwrap_or_default(),
                    title: row.get(1)?,
                    content: row.get(2)?,
                    description: row.get(3)?,
                    tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                    pinned: pinned_int != 0,
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
        Ok(notepads)
    }

    pub fn get_notepad(&self, id: &Uuid) -> Result<Option<Notepad>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, content, description, tags, pinned, created_at, updated_at
             FROM notepads WHERE id = ?1",
        )?;
        let result = stmt.query_row(rusqlite::params![id.to_string()], |row| {
            let tags_json: String = row.get(4)?;
            let id_str: String = row.get(0)?;
            let created_str: String = row.get(6)?;
            let updated_str: String = row.get(7)?;
            let pinned_int: i32 = row.get(5)?;
            Ok(Notepad {
                id: Uuid::parse_str(&id_str).unwrap_or_default(),
                title: row.get(1)?,
                content: row.get(2)?,
                description: row.get(3)?,
                tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                pinned: pinned_int != 0,
                created_at: DateTime::parse_from_rfc3339(&created_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                updated_at: DateTime::parse_from_rfc3339(&updated_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
            })
        });
        match result {
            Ok(notepad) => Ok(Some(notepad)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::DbError(e.to_string())),
        }
    }

    pub fn update_notepad(&self, notepad: &Notepad) -> Result<(), AppError> {
        let tags_json = serde_json::to_string(&notepad.tags)?;
        self.conn.execute(
            "UPDATE notepads SET title = ?1, content = ?2, description = ?3, tags = ?4, pinned = ?5, updated_at = ?6 WHERE id = ?7",
            rusqlite::params![
                notepad.title,
                notepad.content,
                notepad.description,
                tags_json,
                notepad.pinned as i32,
                notepad.updated_at.to_rfc3339(),
                notepad.id.to_string(),
            ],
        )?;
        Ok(())
    }

    pub fn delete_notepad(&self, id: &Uuid) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM notepads WHERE id = ?1",
            rusqlite::params![id.to_string()],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::models::notepad::Notepad;
    use crate::test_helpers::*;
    use chrono::Utc;
    use uuid::Uuid;

    fn test_notepad() -> Notepad {
        Notepad {
            id: Uuid::new_v4(),
            title: "test notepad".to_string(),
            content: "Some notes here".to_string(),
            description: Some("A test notepad".to_string()),
            tags: vec!["test".to_string(), "notes".to_string()],
            pinned: false,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[test]
    fn test_insert_and_list_notepads() {
        let db = test_db();
        let notepad = test_notepad();
        db.insert_notepad(&notepad).unwrap();
        let notepads = db.list_notepads().unwrap();
        assert_eq!(notepads.len(), 1);
        assert_eq!(notepads[0].id, notepad.id);
        assert_eq!(notepads[0].title, "test notepad");
    }

    #[test]
    fn test_get_notepad() {
        let db = test_db();
        let notepad = test_notepad();
        db.insert_notepad(&notepad).unwrap();
        let fetched = db.get_notepad(&notepad.id).unwrap().unwrap();
        assert_eq!(fetched.title, "test notepad");
    }

    #[test]
    fn test_delete_notepad() {
        let db = test_db();
        let notepad = test_notepad();
        db.insert_notepad(&notepad).unwrap();
        db.delete_notepad(&notepad.id).unwrap();
        let notepads = db.list_notepads().unwrap();
        assert!(notepads.is_empty());
    }

    #[test]
    fn test_pinned_ordering() {
        let db = test_db();
        let mut n1 = test_notepad();
        n1.title = "beta".to_string();
        n1.pinned = false;
        let mut n2 = test_notepad();
        n2.title = "alpha".to_string();
        n2.pinned = true;
        db.insert_notepad(&n1).unwrap();
        db.insert_notepad(&n2).unwrap();
        let list = db.list_notepads().unwrap();
        assert_eq!(list[0].title, "alpha");
        assert!(list[0].pinned);
    }
}
