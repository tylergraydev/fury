use super::Database;
use crate::error::AppError;
use crate::models::prompt::Prompt;
use crate::models::snippet::Snippet;
use chrono::{DateTime, Utc};
use uuid::Uuid;

impl Database {
    // --- Prompt library operations ---

    pub fn insert_prompt(&self, prompt: &Prompt) -> Result<(), AppError> {
        let tags_json = serde_json::to_string(&prompt.tags)?;
        self.conn.execute(
            "INSERT INTO prompts (id, name, content, description, category, tags, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                prompt.id.to_string(),
                prompt.name,
                prompt.content,
                prompt.description,
                prompt.category,
                tags_json,
                prompt.sort_order,
                prompt.created_at.to_rfc3339(),
                prompt.updated_at.to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    pub fn list_prompts(&self) -> Result<Vec<Prompt>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, content, description, category, tags, sort_order, created_at, updated_at
             FROM prompts ORDER BY category ASC, sort_order ASC, name ASC",
        )?;
        let prompts = stmt
            .query_map([], |row| {
                let tags_json: String = row.get(5)?;
                let id_str: String = row.get(0)?;
                let created_str: String = row.get(7)?;
                let updated_str: String = row.get(8)?;
                Ok(Prompt {
                    id: Uuid::parse_str(&id_str).unwrap_or_default(),
                    name: row.get(1)?,
                    content: row.get(2)?,
                    description: row.get(3)?,
                    category: row.get(4)?,
                    tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                    sort_order: row.get(6)?,
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
        Ok(prompts)
    }

    pub fn get_prompt(&self, id: &Uuid) -> Result<Option<Prompt>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, content, description, category, tags, sort_order, created_at, updated_at
             FROM prompts WHERE id = ?1",
        )?;
        let result = stmt.query_row(rusqlite::params![id.to_string()], |row| {
            let tags_json: String = row.get(5)?;
            let id_str: String = row.get(0)?;
            let created_str: String = row.get(7)?;
            let updated_str: String = row.get(8)?;
            Ok(Prompt {
                id: Uuid::parse_str(&id_str).unwrap_or_default(),
                name: row.get(1)?,
                content: row.get(2)?,
                description: row.get(3)?,
                category: row.get(4)?,
                tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                sort_order: row.get(6)?,
                created_at: DateTime::parse_from_rfc3339(&created_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                updated_at: DateTime::parse_from_rfc3339(&updated_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
            })
        });
        match result {
            Ok(prompt) => Ok(Some(prompt)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::DbError(e.to_string())),
        }
    }

    pub fn update_prompt(&self, prompt: &Prompt) -> Result<(), AppError> {
        let tags_json = serde_json::to_string(&prompt.tags)?;
        self.conn.execute(
            "UPDATE prompts SET name = ?1, content = ?2, description = ?3, category = ?4, tags = ?5, sort_order = ?6, updated_at = ?7 WHERE id = ?8",
            rusqlite::params![
                prompt.name,
                prompt.content,
                prompt.description,
                prompt.category,
                tags_json,
                prompt.sort_order,
                prompt.updated_at.to_rfc3339(),
                prompt.id.to_string(),
            ],
        )?;
        Ok(())
    }

    pub fn delete_prompt(&self, id: &Uuid) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM prompts WHERE id = ?1",
            rusqlite::params![id.to_string()],
        )?;
        Ok(())
    }

    // --- Snippet Manager ---

    pub fn insert_snippet(&self, snippet: &Snippet) -> Result<(), AppError> {
        let tags_json = serde_json::to_string(&snippet.tags)?;
        self.conn.execute(
            "INSERT INTO snippets (id, title, content, language, description, tags, source, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                snippet.id.to_string(),
                snippet.title,
                snippet.content,
                snippet.language,
                snippet.description,
                tags_json,
                snippet.source,
                snippet.created_at.to_rfc3339(),
                snippet.updated_at.to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    pub fn list_snippets(&self) -> Result<Vec<Snippet>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, content, language, description, tags, source, created_at, updated_at
             FROM snippets ORDER BY updated_at DESC",
        )?;
        let snippets = stmt
            .query_map([], |row| {
                let tags_json: String = row.get(5)?;
                let id_str: String = row.get(0)?;
                let created_str: String = row.get(7)?;
                let updated_str: String = row.get(8)?;
                Ok(Snippet {
                    id: Uuid::parse_str(&id_str).unwrap_or_default(),
                    title: row.get(1)?,
                    content: row.get(2)?,
                    language: row.get(3)?,
                    description: row.get(4)?,
                    tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                    source: row.get(6)?,
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
        Ok(snippets)
    }

    pub fn get_snippet(&self, id: &Uuid) -> Result<Option<Snippet>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, content, language, description, tags, source, created_at, updated_at
             FROM snippets WHERE id = ?1",
        )?;
        let result = stmt.query_row(rusqlite::params![id.to_string()], |row| {
            let tags_json: String = row.get(5)?;
            let id_str: String = row.get(0)?;
            let created_str: String = row.get(7)?;
            let updated_str: String = row.get(8)?;
            Ok(Snippet {
                id: Uuid::parse_str(&id_str).unwrap_or_default(),
                title: row.get(1)?,
                content: row.get(2)?,
                language: row.get(3)?,
                description: row.get(4)?,
                tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                source: row.get(6)?,
                created_at: DateTime::parse_from_rfc3339(&created_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                updated_at: DateTime::parse_from_rfc3339(&updated_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
            })
        });
        match result {
            Ok(snippet) => Ok(Some(snippet)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::DbError(e.to_string())),
        }
    }

    pub fn update_snippet(&self, snippet: &Snippet) -> Result<(), AppError> {
        let tags_json = serde_json::to_string(&snippet.tags)?;
        self.conn.execute(
            "UPDATE snippets SET title = ?1, content = ?2, language = ?3, description = ?4, tags = ?5, source = ?6, updated_at = ?7 WHERE id = ?8",
            rusqlite::params![
                snippet.title,
                snippet.content,
                snippet.language,
                snippet.description,
                tags_json,
                snippet.source,
                snippet.updated_at.to_rfc3339(),
                snippet.id.to_string(),
            ],
        )?;
        Ok(())
    }

    pub fn delete_snippet(&self, id: &Uuid) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM snippets WHERE id = ?1",
            rusqlite::params![id.to_string()],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::test_helpers::*;
    use chrono::Utc;
    use uuid::Uuid;

    // --- Prompt library ---

    #[test]
    fn test_insert_and_list_prompts() {
        let db = test_db();
        let prompt = test_prompt();
        db.insert_prompt(&prompt).unwrap();
        let prompts = db.list_prompts().unwrap();
        assert_eq!(prompts.len(), 1);
        assert_eq!(prompts[0].id, prompt.id);
        assert_eq!(prompts[0].name, "test-prompt");
        assert_eq!(prompts[0].tags, vec!["review", "quality"]);
    }

    #[test]
    fn test_get_prompt() {
        let db = test_db();
        let prompt = test_prompt();
        db.insert_prompt(&prompt).unwrap();
        let fetched = db.get_prompt(&prompt.id).unwrap().unwrap();
        assert_eq!(fetched.name, "test-prompt");
        assert_eq!(
            fetched.content,
            "Review the {{file}} for {{issue_type}} issues"
        );
        assert_eq!(fetched.category.as_deref(), Some("Code Review"));
    }

    #[test]
    fn test_get_nonexistent_prompt() {
        let db = test_db();
        let result = db.get_prompt(&Uuid::new_v4()).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_update_prompt() {
        let db = test_db();
        let mut prompt = test_prompt();
        db.insert_prompt(&prompt).unwrap();
        prompt.name = "renamed-prompt".to_string();
        prompt.content = "New content".to_string();
        prompt.updated_at = Utc::now();
        db.update_prompt(&prompt).unwrap();
        let fetched = db.get_prompt(&prompt.id).unwrap().unwrap();
        assert_eq!(fetched.name, "renamed-prompt");
        assert_eq!(fetched.content, "New content");
    }

    #[test]
    fn test_delete_prompt() {
        let db = test_db();
        let prompt = test_prompt();
        db.insert_prompt(&prompt).unwrap();
        db.delete_prompt(&prompt.id).unwrap();
        let prompts = db.list_prompts().unwrap();
        assert!(prompts.is_empty());
    }

    // --- Snippet Manager ---

    #[test]
    fn test_insert_and_list_snippets() {
        let db = test_db();
        let snippet = test_snippet();
        db.insert_snippet(&snippet).unwrap();
        let snippets = db.list_snippets().unwrap();
        assert_eq!(snippets.len(), 1);
        assert_eq!(snippets[0].id, snippet.id);
        assert_eq!(snippets[0].title, "fetch helper");
        assert_eq!(snippets[0].tags, vec!["http", "utility"]);
    }

    #[test]
    fn test_get_snippet() {
        let db = test_db();
        let snippet = test_snippet();
        db.insert_snippet(&snippet).unwrap();
        let fetched = db.get_snippet(&snippet.id).unwrap().unwrap();
        assert_eq!(fetched.title, "fetch helper");
        assert_eq!(fetched.language.as_deref(), Some("typescript"));
        assert_eq!(fetched.source.as_deref(), Some("chat"));
    }

    #[test]
    fn test_get_nonexistent_snippet() {
        let db = test_db();
        let result = db.get_snippet(&Uuid::new_v4()).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_update_snippet() {
        let db = test_db();
        let mut snippet = test_snippet();
        db.insert_snippet(&snippet).unwrap();
        snippet.title = "renamed snippet".to_string();
        snippet.content = "new content".to_string();
        snippet.updated_at = Utc::now();
        db.update_snippet(&snippet).unwrap();
        let fetched = db.get_snippet(&snippet.id).unwrap().unwrap();
        assert_eq!(fetched.title, "renamed snippet");
        assert_eq!(fetched.content, "new content");
    }

    #[test]
    fn test_delete_snippet() {
        let db = test_db();
        let snippet = test_snippet();
        db.insert_snippet(&snippet).unwrap();
        db.delete_snippet(&snippet.id).unwrap();
        let snippets = db.list_snippets().unwrap();
        assert!(snippets.is_empty());
    }
}
