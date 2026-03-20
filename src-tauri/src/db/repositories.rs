use super::Database;
use crate::error::AppError;
use crate::models::repository::Repository;
use std::path::PathBuf;
use uuid::Uuid;

impl Database {
    pub fn insert_repository(&self, repo: &Repository) -> Result<(), AppError> {
        self.conn.execute(
            "INSERT INTO repositories (id, name, path, default_branch, provider, remote_url) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                repo.id.to_string(),
                repo.name,
                repo.path.to_string_lossy().to_string(),
                repo.default_branch,
                repo.provider.as_str(),
                repo.remote_url,
            ],
        )?;
        Ok(())
    }

    pub fn delete_repository(&self, id: &Uuid) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM repositories WHERE id = ?1",
            rusqlite::params![id.to_string()],
        )?;
        Ok(())
    }

    pub fn list_repositories(&self) -> Result<Vec<Repository>, AppError> {
        use crate::models::repository::GitProvider;
        let mut stmt = self.conn.prepare(
            "SELECT id, name, path, default_branch, provider, remote_url FROM repositories",
        )?;
        let repos = stmt
            .query_map([], |row| {
                let provider_str: String = row.get(4)?;
                let remote_url: Option<String> = row.get(5)?;
                Ok(Repository {
                    id: row.get::<_, String>(0)?.parse::<Uuid>().unwrap_or_default(),
                    name: row.get(1)?,
                    path: PathBuf::from(row.get::<_, String>(2)?),
                    default_branch: row.get(3)?,
                    current_branch: None,
                    provider: GitProvider::from_db_str(&provider_str),
                    remote_url,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(repos)
    }
}

#[cfg(test)]
mod tests {
    use crate::test_helpers::*;

    #[test]
    fn test_list_repositories_empty() {
        let db = test_db();
        let repos = db.list_repositories().unwrap();
        assert!(repos.is_empty());
    }

    #[test]
    fn test_insert_and_list_repository() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let repos = db.list_repositories().unwrap();
        assert_eq!(repos.len(), 1);
        assert_eq!(repos[0].id, repo.id);
        assert_eq!(repos[0].name, "test-repo");
        assert_eq!(repos[0].default_branch, "main");
    }

    #[test]
    fn test_delete_repository() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        db.delete_repository(&repo.id).unwrap();
        let repos = db.list_repositories().unwrap();
        assert!(repos.is_empty());
    }
}
