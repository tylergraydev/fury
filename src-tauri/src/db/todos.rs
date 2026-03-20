use super::Database;
use crate::error::AppError;
use crate::models::todo::TodoItem;
use uuid::Uuid;

impl Database {
    pub fn insert_todo(&self, todo: &TodoItem) -> Result<(), AppError> {
        self.conn.execute(
            "INSERT INTO todos (id, workspace_id, text, completed, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                todo.id.to_string(),
                todo.workspace_id.to_string(),
                todo.text,
                todo.completed as i32,
                todo.sort_order,
            ],
        )?;
        Ok(())
    }

    pub fn update_todo(
        &self,
        id: &Uuid,
        text: Option<&str>,
        completed: Option<bool>,
    ) -> Result<(), AppError> {
        if let Some(t) = text {
            self.conn.execute(
                "UPDATE todos SET text = ?1 WHERE id = ?2",
                rusqlite::params![t, id.to_string()],
            )?;
        }
        if let Some(c) = completed {
            self.conn.execute(
                "UPDATE todos SET completed = ?1 WHERE id = ?2",
                rusqlite::params![c as i32, id.to_string()],
            )?;
        }
        Ok(())
    }

    pub fn delete_todo(&self, id: &Uuid) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM todos WHERE id = ?1",
            rusqlite::params![id.to_string()],
        )?;
        Ok(())
    }

    pub fn list_todos(&self, workspace_id: &Uuid) -> Result<Vec<TodoItem>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, workspace_id, text, completed, sort_order
             FROM todos WHERE workspace_id = ?1 ORDER BY sort_order ASC, created_at ASC",
        )?;
        let todos = stmt
            .query_map(rusqlite::params![workspace_id.to_string()], |row| {
                Ok(TodoItem {
                    id: row.get::<_, String>(0)?.parse::<Uuid>().unwrap_or_default(),
                    workspace_id: row.get::<_, String>(1)?.parse::<Uuid>().unwrap_or_default(),
                    text: row.get(2)?,
                    completed: row.get::<_, i32>(3)? != 0,
                    sort_order: row.get(4)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(todos)
    }

    pub fn toggle_todo(&self, id: &Uuid) -> Result<bool, AppError> {
        self.conn.execute(
            "UPDATE todos SET completed = CASE WHEN completed = 0 THEN 1 ELSE 0 END WHERE id = ?1",
            rusqlite::params![id.to_string()],
        )?;
        let new_val: i32 = self.conn.query_row(
            "SELECT completed FROM todos WHERE id = ?1",
            rusqlite::params![id.to_string()],
            |row| row.get(0),
        )?;
        Ok(new_val != 0)
    }

    pub fn reorder_todos(&self, workspace_id: &Uuid, todo_ids: &[Uuid]) -> Result<(), AppError> {
        for (index, id) in todo_ids.iter().enumerate() {
            self.conn.execute(
                "UPDATE todos SET sort_order = ?1 WHERE id = ?2 AND workspace_id = ?3",
                rusqlite::params![index as i32, id.to_string(), workspace_id.to_string()],
            )?;
        }
        Ok(())
    }

    pub fn get_next_sort_order(&self, workspace_id: &Uuid) -> Result<i32, AppError> {
        let result: Result<Option<i32>, _> = self.conn.query_row(
            "SELECT MAX(sort_order) FROM todos WHERE workspace_id = ?1",
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

    #[test]
    fn test_insert_and_list_todos() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let todo = test_todo(ws.id);
        db.insert_todo(&todo).unwrap();
        let todos = db.list_todos(&ws.id).unwrap();
        assert_eq!(todos.len(), 1);
        assert_eq!(todos[0].text, "Test todo item");
        assert!(!todos[0].completed);
    }

    #[test]
    fn test_update_todo_text() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let todo = test_todo(ws.id);
        db.insert_todo(&todo).unwrap();
        db.update_todo(&todo.id, Some("Updated text"), None)
            .unwrap();
        let todos = db.list_todos(&ws.id).unwrap();
        assert_eq!(todos[0].text, "Updated text");
    }

    #[test]
    fn test_toggle_todo() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let todo = test_todo(ws.id);
        db.insert_todo(&todo).unwrap();
        let result = db.toggle_todo(&todo.id).unwrap();
        assert!(result);
        let result = db.toggle_todo(&todo.id).unwrap();
        assert!(!result);
    }

    #[test]
    fn test_delete_todo() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let todo = test_todo(ws.id);
        db.insert_todo(&todo).unwrap();
        db.delete_todo(&todo.id).unwrap();
        let todos = db.list_todos(&ws.id).unwrap();
        assert!(todos.is_empty());
    }

    #[test]
    fn test_reorder_todos() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let mut todo1 = test_todo(ws.id);
        todo1.sort_order = 0;
        let mut todo2 = test_todo(ws.id);
        todo2.sort_order = 1;
        db.insert_todo(&todo1).unwrap();
        db.insert_todo(&todo2).unwrap();
        db.reorder_todos(&ws.id, &[todo2.id, todo1.id]).unwrap();
        let todos = db.list_todos(&ws.id).unwrap();
        assert_eq!(todos[0].id, todo2.id);
        assert_eq!(todos[1].id, todo1.id);
    }

    #[test]
    fn test_get_next_sort_order() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        assert_eq!(db.get_next_sort_order(&ws.id).unwrap(), 0);
        let todo = test_todo(ws.id);
        db.insert_todo(&todo).unwrap();
        assert_eq!(db.get_next_sort_order(&ws.id).unwrap(), 1);
    }
}
