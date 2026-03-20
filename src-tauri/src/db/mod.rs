mod bookmarks;
mod chat;
mod checkpoints;
mod library;
mod migrations;
mod repositories;
mod settings;
mod templates;
mod todos;
mod workspaces;

use crate::error::AppError;
use rusqlite::Connection;
use std::path::Path;

pub struct Database {
    pub(crate) conn: Connection,
}

impl Database {
    pub fn init(data_dir: &Path) -> Result<Self, AppError> {
        std::fs::create_dir_all(data_dir)?;
        let db_path = data_dir.join("fury.db");
        let conn = Connection::open(&db_path).map_err(|e| AppError::DbError(e.to_string()))?;

        // Enable WAL mode for better concurrent access
        conn.execute_batch("PRAGMA journal_mode=WAL;")
            .map_err(|e| AppError::DbError(e.to_string()))?;

        let db = Self { conn };
        db.run_migrations()?;
        Ok(db)
    }

    /// Create an in-memory database for testing with all migrations applied.
    #[cfg(test)]
    pub fn init_in_memory() -> Result<Self, AppError> {
        let conn = Connection::open_in_memory().map_err(|e| AppError::DbError(e.to_string()))?;
        let db = Self { conn };
        db.run_migrations()?;
        Ok(db)
    }

    fn run_migrations(&self) -> Result<(), AppError> {
        migrations::run(&self.conn)
    }
}

#[cfg(test)]
mod tests {
    use crate::test_helpers::*;

    #[test]
    fn test_migrations_idempotent() {
        let db = test_db();
        // Running migrations again should not error
        db.run_migrations().unwrap();
    }
}
