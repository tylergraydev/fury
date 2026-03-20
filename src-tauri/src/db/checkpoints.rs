use super::Database;
use crate::error::AppError;
use crate::models::checkpoint::Checkpoint;
use uuid::Uuid;

impl Database {
    pub fn insert_checkpoint(&self, cp: &Checkpoint) -> Result<(), AppError> {
        self.conn.execute(
            "INSERT INTO checkpoints (id, workspace_id, session_id, turn_index, ref_name, tree_sha, commit_sha, user_message, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                cp.id.to_string(),
                cp.workspace_id.to_string(),
                cp.session_id,
                cp.turn_index,
                cp.ref_name,
                cp.tree_sha,
                cp.commit_sha,
                cp.user_message,
                cp.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_checkpoint(&self, checkpoint_id: &Uuid) -> Result<Option<Checkpoint>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, workspace_id, session_id, turn_index, ref_name, tree_sha, commit_sha, user_message, created_at
             FROM checkpoints WHERE id = ?1",
        )?;
        let result = stmt.query_row(rusqlite::params![checkpoint_id.to_string()], |row| {
            Ok(Checkpoint {
                id: row.get::<_, String>(0)?.parse::<Uuid>().unwrap_or_default(),
                workspace_id: row.get::<_, String>(1)?.parse::<Uuid>().unwrap_or_default(),
                session_id: row.get(2)?,
                turn_index: row.get(3)?,
                ref_name: row.get(4)?,
                tree_sha: row.get(5)?,
                commit_sha: row.get(6)?,
                user_message: row.get(7)?,
                created_at: row.get(8)?,
            })
        });
        match result {
            Ok(cp) => Ok(Some(cp)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::DbError(e.to_string())),
        }
    }

    pub fn list_checkpoints(&self, workspace_id: &Uuid) -> Result<Vec<Checkpoint>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, workspace_id, session_id, turn_index, ref_name, tree_sha, commit_sha, user_message, created_at
             FROM checkpoints WHERE workspace_id = ?1 ORDER BY turn_index ASC",
        )?;
        let checkpoints = stmt
            .query_map(rusqlite::params![workspace_id.to_string()], |row| {
                Ok(Checkpoint {
                    id: row.get::<_, String>(0)?.parse::<Uuid>().unwrap_or_default(),
                    workspace_id: row.get::<_, String>(1)?.parse::<Uuid>().unwrap_or_default(),
                    session_id: row.get(2)?,
                    turn_index: row.get(3)?,
                    ref_name: row.get(4)?,
                    tree_sha: row.get(5)?,
                    commit_sha: row.get(6)?,
                    user_message: row.get(7)?,
                    created_at: row.get(8)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(checkpoints)
    }

    pub fn delete_checkpoints_after(
        &self,
        workspace_id: &Uuid,
        turn_index: u32,
    ) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM checkpoints WHERE workspace_id = ?1 AND turn_index > ?2",
            rusqlite::params![workspace_id.to_string(), turn_index],
        )?;
        Ok(())
    }

    pub fn get_next_turn_index(&self, workspace_id: &Uuid) -> Result<u32, AppError> {
        let result: Result<Option<u32>, _> = self.conn.query_row(
            "SELECT MAX(turn_index) FROM checkpoints WHERE workspace_id = ?1",
            rusqlite::params![workspace_id.to_string()],
            |row| row.get(0),
        );
        match result {
            Ok(Some(n)) => Ok(n + 1),
            Ok(None) | Err(_) => Ok(0),
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::test_helpers::*;
    use uuid::Uuid;

    #[test]
    fn test_insert_and_get_checkpoint() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let cp = test_checkpoint(ws.id);
        db.insert_checkpoint(&cp).unwrap();
        let fetched = db.get_checkpoint(&cp.id).unwrap().unwrap();
        assert_eq!(fetched.id, cp.id);
        assert_eq!(fetched.workspace_id, ws.id);
        assert_eq!(fetched.session_id, "test-session");
        assert_eq!(fetched.user_message, "test message");
    }

    #[test]
    fn test_get_nonexistent_checkpoint() {
        let db = test_db();
        let result = db.get_checkpoint(&Uuid::new_v4()).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_list_checkpoints_ordered() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let mut cp1 = test_checkpoint(ws.id);
        cp1.turn_index = 0;
        let mut cp2 = test_checkpoint(ws.id);
        cp2.turn_index = 1;
        let mut cp3 = test_checkpoint(ws.id);
        cp3.turn_index = 2;
        db.insert_checkpoint(&cp1).unwrap();
        db.insert_checkpoint(&cp3).unwrap();
        db.insert_checkpoint(&cp2).unwrap();
        let list = db.list_checkpoints(&ws.id).unwrap();
        assert_eq!(list.len(), 3);
        assert_eq!(list[0].turn_index, 0);
        assert_eq!(list[1].turn_index, 1);
        assert_eq!(list[2].turn_index, 2);
    }

    #[test]
    fn test_delete_checkpoints_after() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        for i in 0..5 {
            let mut cp = test_checkpoint(ws.id);
            cp.turn_index = i;
            db.insert_checkpoint(&cp).unwrap();
        }
        db.delete_checkpoints_after(&ws.id, 2).unwrap();
        let list = db.list_checkpoints(&ws.id).unwrap();
        assert_eq!(list.len(), 3);
    }

    #[test]
    fn test_get_next_turn_index_empty() {
        let db = test_db();
        let ws_id = Uuid::new_v4();
        assert_eq!(db.get_next_turn_index(&ws_id).unwrap(), 0);
    }

    #[test]
    fn test_get_next_turn_index_with_checkpoints() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let mut cp = test_checkpoint(ws.id);
        cp.turn_index = 3;
        db.insert_checkpoint(&cp).unwrap();
        assert_eq!(db.get_next_turn_index(&ws.id).unwrap(), 4);
    }
}
