use super::Database;
use crate::error::AppError;
use crate::models::chat::{
    ChatMessage, ChatMessageSearchResult, ContentBlock, MessageRole, UsageDataPoint,
};
use chrono::{DateTime, Utc};
use uuid::Uuid;

impl Database {
    pub fn insert_chat_message(&self, msg: &ChatMessage) -> Result<(), AppError> {
        let content_json = serde_json::to_string(&msg.content)?;
        let metadata_json = msg
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let role_str = match msg.role {
            MessageRole::User => "user",
            MessageRole::Assistant => "assistant",
            MessageRole::System => "system",
        };
        self.conn.execute(
            "INSERT OR REPLACE INTO chat_messages (id, workspace_id, role, content, timestamp, display_text, metadata) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                msg.id.to_string(),
                msg.workspace_id.to_string(),
                role_str,
                content_json,
                msg.timestamp.to_rfc3339(),
                msg.display_text,
                metadata_json,
            ],
        )?;
        Ok(())
    }

    pub fn list_chat_messages(&self, workspace_id: &Uuid) -> Result<Vec<ChatMessage>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, workspace_id, role, content, timestamp, display_text, metadata
             FROM chat_messages WHERE workspace_id = ?1 ORDER BY timestamp ASC, rowid ASC",
        )?;
        let messages = stmt
            .query_map(rusqlite::params![workspace_id.to_string()], |row| {
                let role_str: String = row.get(2)?;
                let content_json: String = row.get(3)?;
                let timestamp_str: String = row.get(4)?;
                let display_text: Option<String> = row.get(5)?;
                let metadata_json: Option<String> = row.get(6)?;
                let metadata = match metadata_json {
                    Some(j) => match serde_json::from_str(&j) {
                        Ok(m) => Some(m),
                        Err(e) => {
                            eprintln!("[db] Failed to deserialize chat message metadata: {e}");
                            None
                        }
                    },
                    None => None,
                };
                Ok(ChatMessage {
                    id: row.get::<_, String>(0)?.parse::<Uuid>().unwrap_or_default(),
                    workspace_id: row.get::<_, String>(1)?.parse::<Uuid>().unwrap_or_default(),
                    role: match role_str.as_str() {
                        "user" => MessageRole::User,
                        "assistant" => MessageRole::Assistant,
                        _ => MessageRole::System,
                    },
                    content: serde_json::from_str::<Vec<ContentBlock>>(&content_json)
                        .unwrap_or_default(),
                    timestamp: timestamp_str
                        .parse::<DateTime<Utc>>()
                        .unwrap_or_else(|_| Utc::now()),
                    display_text,
                    metadata,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(messages)
    }

    pub fn clear_chat_messages(&self, workspace_id: &Uuid) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM chat_messages WHERE workspace_id = ?1",
            rusqlite::params![workspace_id.to_string()],
        )?;
        Ok(())
    }

    pub fn search_chat_messages(
        &self,
        query: &str,
        workspace_id: Option<&Uuid>,
    ) -> Result<Vec<ChatMessageSearchResult>, AppError> {
        let pattern = format!("%{}%", query);
        let (sql, params): (&str, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(ws_id) =
            workspace_id
        {
            (
                "SELECT cm.id, cm.workspace_id, w.name, cm.role, cm.content, cm.display_text, cm.timestamp
                 FROM chat_messages cm
                 JOIN workspaces w ON cm.workspace_id = w.id
                 WHERE cm.workspace_id = ?1
                   AND (cm.content LIKE ?2 OR cm.display_text LIKE ?2)
                 ORDER BY cm.timestamp DESC
                 LIMIT 50",
                vec![
                    Box::new(ws_id.to_string()) as Box<dyn rusqlite::types::ToSql>,
                    Box::new(pattern.clone()),
                ],
            )
        } else {
            (
                "SELECT cm.id, cm.workspace_id, w.name, cm.role, cm.content, cm.display_text, cm.timestamp
                 FROM chat_messages cm
                 JOIN workspaces w ON cm.workspace_id = w.id
                 WHERE cm.content LIKE ?1 OR cm.display_text LIKE ?1
                 ORDER BY cm.timestamp DESC
                 LIMIT 50",
                vec![Box::new(pattern.clone()) as Box<dyn rusqlite::types::ToSql>],
            )
        };

        let mut stmt = self.conn.prepare(sql)?;
        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            params.iter().map(|p| p.as_ref()).collect();
        let results = stmt
            .query_map(params_refs.as_slice(), |row| {
                let content_json: String = row.get(4)?;
                let display_text: Option<String> = row.get(5)?;

                // Extract matched text from content blocks
                let matched = extract_matched_text(&content_json, &display_text, query);

                Ok(ChatMessageSearchResult {
                    message_id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    workspace_name: row.get(2)?,
                    role: row.get(3)?,
                    matched_text: matched,
                    timestamp: row.get(6)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(results)
    }

    pub fn get_usage_data(
        &self,
        workspace_id: Option<&Uuid>,
        since: Option<&str>,
    ) -> Result<Vec<UsageDataPoint>, AppError> {
        let mut sql = String::from(
            "SELECT
                cm.workspace_id,
                w.name AS workspace_name,
                cm.timestamp,
                json_extract(cm.metadata, '$.totalCostUsd') AS total_cost_usd,
                json_extract(cm.metadata, '$.inputTokens') AS input_tokens,
                json_extract(cm.metadata, '$.outputTokens') AS output_tokens,
                COALESCE(json_extract(cm.metadata, '$.cacheReadTokens'), 0) AS cache_read_tokens,
                COALESCE(json_extract(cm.metadata, '$.cacheCreationTokens'), 0) AS cache_creation_tokens,
                COALESCE(json_extract(cm.metadata, '$.numTurns'), 0) AS num_turns,
                COALESCE(json_extract(cm.metadata, '$.durationMs'), 0) AS duration_ms
            FROM chat_messages cm
            JOIN workspaces w ON cm.workspace_id = w.id
            WHERE cm.role = 'assistant'
              AND cm.metadata IS NOT NULL
              AND json_extract(cm.metadata, '$.totalCostUsd') IS NOT NULL",
        );

        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        let mut param_idx = 1;

        if let Some(ws_id) = workspace_id {
            sql.push_str(&format!(" AND cm.workspace_id = ?{param_idx}"));
            params.push(Box::new(ws_id.to_string()));
            param_idx += 1;
        }

        if let Some(since_ts) = since {
            sql.push_str(&format!(" AND cm.timestamp >= ?{param_idx}"));
            params.push(Box::new(since_ts.to_string()));
            let _ = param_idx; // suppress unused warning
        }

        sql.push_str(" ORDER BY cm.timestamp ASC");

        let mut stmt = self.conn.prepare(&sql)?;
        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            params.iter().map(|p| p.as_ref()).collect();

        let results: Vec<UsageDataPoint> = stmt
            .query_map(params_refs.as_slice(), |row| {
                Ok(UsageDataPoint {
                    workspace_id: row.get::<_, String>(0)?,
                    workspace_name: row.get::<_, String>(1)?,
                    timestamp: row.get::<_, String>(2)?,
                    total_cost_usd: row.get::<_, f64>(3).unwrap_or(0.0),
                    input_tokens: row.get::<_, u64>(4).unwrap_or(0),
                    output_tokens: row.get::<_, u64>(5).unwrap_or(0),
                    cache_read_tokens: row.get::<_, u64>(6).unwrap_or(0),
                    cache_creation_tokens: row.get::<_, u64>(7).unwrap_or(0),
                    num_turns: row.get::<_, u32>(8).unwrap_or(0),
                    duration_ms: row.get::<_, u64>(9).unwrap_or(0),
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(results)
    }
}

/// Extract a text snippet from chat message content that matches the search query.
fn extract_matched_text(content_json: &str, display_text: &Option<String>, query: &str) -> String {
    let query_lower = query.to_lowercase();

    // Check display_text first
    if let Some(dt) = display_text {
        if dt.to_lowercase().contains(&query_lower) {
            return snippet(dt, &query_lower);
        }
    }

    // Parse content blocks and search text blocks
    if let Ok(blocks) = serde_json::from_str::<Vec<ContentBlock>>(content_json) {
        for block in &blocks {
            if let ContentBlock::Text { text } = block {
                if text.to_lowercase().contains(&query_lower) {
                    return snippet(text, &query_lower);
                }
            }
        }
    }

    // Fallback: raw substring match on JSON
    snippet(content_json, &query_lower)
}

/// Return a short snippet around the first occurrence of `query_lower` in `text`.
fn snippet(text: &str, query_lower: &str) -> String {
    let text_lower = text.to_lowercase();
    let max_len = 120;
    if let Some(pos) = text_lower.find(query_lower) {
        let start = pos.saturating_sub(40);
        let end = (pos + query_lower.len() + 40).min(text.len());
        // Align to char boundaries
        let start = text.floor_char_boundary(start);
        let end = text.ceil_char_boundary(end);
        let mut s = String::new();
        if start > 0 {
            s.push_str("...");
        }
        s.push_str(&text[start..end]);
        if end < text.len() {
            s.push_str("...");
        }
        s
    } else {
        text.chars().take(max_len).collect()
    }
}

#[cfg(test)]
mod tests {
    use crate::models::chat::{ContentBlock, MessageRole, ResponseMetadata};
    use crate::test_helpers::*;

    #[test]
    fn test_insert_and_list_chat_messages() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let msg = test_chat_message(ws.id);
        db.insert_chat_message(&msg).unwrap();
        let messages = db.list_chat_messages(&ws.id).unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].id, msg.id);
        assert_eq!(messages[0].role, MessageRole::User);
    }

    #[test]
    fn test_clear_chat_messages() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let msg = test_chat_message(ws.id);
        db.insert_chat_message(&msg).unwrap();
        db.clear_chat_messages(&ws.id).unwrap();
        let messages = db.list_chat_messages(&ws.id).unwrap();
        assert!(messages.is_empty());
    }

    #[test]
    fn test_chat_message_with_metadata() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let mut msg = test_chat_message(ws.id);
        msg.metadata = Some(ResponseMetadata {
            duration_ms: Some(1000),
            duration_api_ms: Some(800),
            total_cost_usd: Some(0.05),
            num_turns: Some(1),
            input_tokens: Some(100),
            output_tokens: Some(200),
            cache_read_tokens: None,
            cache_creation_tokens: None,
        });
        db.insert_chat_message(&msg).unwrap();
        let messages = db.list_chat_messages(&ws.id).unwrap();
        let meta = messages[0].metadata.as_ref().unwrap();
        assert_eq!(meta.duration_ms, Some(1000));
        assert_eq!(meta.total_cost_usd, Some(0.05));
    }

    #[test]
    fn test_search_chat_messages_by_content() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let mut msg = test_chat_message(ws.id);
        msg.content = vec![ContentBlock::Text {
            text: "The quick brown fox jumps over the lazy dog".to_string(),
        }];
        msg.display_text = Some("The quick brown fox jumps over the lazy dog".to_string());
        db.insert_chat_message(&msg).unwrap();
        let results = db.search_chat_messages("brown fox", Some(&ws.id)).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].matched_text.contains("brown fox"));
        assert_eq!(results[0].role, "user");
    }

    #[test]
    fn test_search_chat_messages_no_match() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let msg = test_chat_message(ws.id);
        db.insert_chat_message(&msg).unwrap();
        let results = db
            .search_chat_messages("nonexistent query", Some(&ws.id))
            .unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_search_chat_messages_across_workspaces() {
        let db = test_db();
        let (repo, ws1) = insert_test_repo_and_workspace(&db);
        let mut ws2 = test_workspace(repo.id);
        ws2.branch = "search-branch".to_string();
        db.insert_workspace(&ws2).unwrap();
        let mut msg1 = test_chat_message(ws1.id);
        msg1.content = vec![ContentBlock::Text {
            text: "unique search term alpha".to_string(),
        }];
        msg1.display_text = Some("unique search term alpha".to_string());
        db.insert_chat_message(&msg1).unwrap();
        let mut msg2 = test_chat_message(ws2.id);
        msg2.content = vec![ContentBlock::Text {
            text: "unique search term beta".to_string(),
        }];
        msg2.display_text = Some("unique search term beta".to_string());
        db.insert_chat_message(&msg2).unwrap();
        let results = db.search_chat_messages("unique search term", None).unwrap();
        assert_eq!(results.len(), 2);
        let results = db
            .search_chat_messages("unique search term", Some(&ws1.id))
            .unwrap();
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn test_search_chat_messages_by_display_text() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let mut msg = test_chat_message(ws.id);
        msg.content = vec![ContentBlock::Text {
            text: "content text".to_string(),
        }];
        msg.display_text = Some("searchable display text here".to_string());
        db.insert_chat_message(&msg).unwrap();
        let results = db
            .search_chat_messages("searchable display", Some(&ws.id))
            .unwrap();
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn test_get_usage_data_empty() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let data = db.get_usage_data(Some(&ws.id), None).unwrap();
        assert!(data.is_empty());
    }

    #[test]
    fn test_get_usage_data_with_metadata() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let mut msg = test_chat_message(ws.id);
        msg.role = MessageRole::Assistant;
        msg.metadata = Some(ResponseMetadata {
            duration_ms: Some(2000),
            duration_api_ms: Some(1500),
            total_cost_usd: Some(0.10),
            num_turns: Some(3),
            input_tokens: Some(500),
            output_tokens: Some(1000),
            cache_read_tokens: Some(100),
            cache_creation_tokens: Some(50),
        });
        db.insert_chat_message(&msg).unwrap();
        let data = db.get_usage_data(Some(&ws.id), None).unwrap();
        assert_eq!(data.len(), 1);
        assert_eq!(data[0].total_cost_usd, 0.10);
        assert_eq!(data[0].input_tokens, 500);
        assert_eq!(data[0].output_tokens, 1000);
        assert_eq!(data[0].cache_read_tokens, 100);
        assert_eq!(data[0].cache_creation_tokens, 50);
        assert_eq!(data[0].num_turns, 3);
        assert_eq!(data[0].duration_ms, 2000);
    }

    #[test]
    fn test_get_usage_data_excludes_user_messages() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let mut user_msg = test_chat_message(ws.id);
        user_msg.role = MessageRole::User;
        user_msg.metadata = Some(ResponseMetadata {
            duration_ms: Some(100),
            duration_api_ms: None,
            total_cost_usd: Some(0.01),
            num_turns: Some(1),
            input_tokens: Some(10),
            output_tokens: Some(20),
            cache_read_tokens: None,
            cache_creation_tokens: None,
        });
        db.insert_chat_message(&user_msg).unwrap();
        let data = db.get_usage_data(Some(&ws.id), None).unwrap();
        assert!(data.is_empty());
    }

    #[test]
    fn test_get_usage_data_all_workspaces() {
        let db = test_db();
        let (repo, ws1) = insert_test_repo_and_workspace(&db);
        let mut ws2 = test_workspace(repo.id);
        ws2.branch = "usage-branch".to_string();
        db.insert_workspace(&ws2).unwrap();
        for ws_id in [ws1.id, ws2.id] {
            let mut msg = test_chat_message(ws_id);
            msg.role = MessageRole::Assistant;
            msg.metadata = Some(ResponseMetadata {
                duration_ms: Some(500),
                duration_api_ms: None,
                total_cost_usd: Some(0.05),
                num_turns: Some(1),
                input_tokens: Some(100),
                output_tokens: Some(200),
                cache_read_tokens: None,
                cache_creation_tokens: None,
            });
            db.insert_chat_message(&msg).unwrap();
        }
        let all_data = db.get_usage_data(None, None).unwrap();
        assert_eq!(all_data.len(), 2);
        let ws1_data = db.get_usage_data(Some(&ws1.id), None).unwrap();
        assert_eq!(ws1_data.len(), 1);
    }

    // ─── snippet() mutation-killing tests ────────────────────────────

    #[test]
    fn test_snippet_short_text_returns_full() {
        let result = super::snippet("hello world", "hello");
        assert_eq!(result, "hello world");
        // No ellipsis for short text
        assert!(!result.contains("..."));
    }

    #[test]
    fn test_snippet_long_text_adds_leading_ellipsis() {
        let long = format!("{}MATCH{}", "a".repeat(60), "b".repeat(60));
        let result = super::snippet(&long, "match");
        assert!(result.starts_with("..."), "Expected leading ellipsis for mid-text match: {result}");
    }

    #[test]
    fn test_snippet_long_text_adds_trailing_ellipsis() {
        let long = format!("MATCH{}", "b".repeat(200));
        let result = super::snippet(&long, "match");
        assert!(result.ends_with("..."), "Expected trailing ellipsis: {result}");
    }

    #[test]
    fn test_snippet_match_at_start_no_leading_ellipsis() {
        let text = format!("MATCH{}", "x".repeat(200));
        let result = super::snippet(&text, "match");
        assert!(!result.starts_with("..."), "Should not have leading ellipsis: {result}");
        assert!(result.ends_with("..."), "Should have trailing ellipsis: {result}");
    }

    #[test]
    fn test_snippet_match_at_end_no_trailing_ellipsis() {
        let text = format!("{}MATCH", "x".repeat(200));
        let result = super::snippet(&text, "match");
        assert!(result.starts_with("..."), "Should have leading ellipsis: {result}");
        assert!(!result.ends_with("..."), "Should not have trailing ellipsis: {result}");
    }

    #[test]
    fn test_snippet_no_match_returns_truncated() {
        let long = "a".repeat(200);
        let result = super::snippet(&long, "zzz");
        assert_eq!(result.len(), 120);
    }

    #[test]
    fn test_snippet_boundary_arithmetic() {
        // Ensure pos + query.len() + 40 doesn't exceed text length
        let text = "short MATCH end";
        let result = super::snippet(text, "match");
        assert!(result.contains("MATCH"));
        assert_eq!(result, "short MATCH end");
    }

    #[test]
    fn test_search_returns_assistant_role() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let mut msg = test_chat_message(ws.id);
        msg.role = MessageRole::Assistant;
        msg.content = vec![ContentBlock::Text {
            text: "I found the bug in auth module".to_string(),
        }];
        msg.display_text = Some("I found the bug in auth module".to_string());
        db.insert_chat_message(&msg).unwrap();
        let results = db.search_chat_messages("auth module", Some(&ws.id)).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].role, "assistant");
    }
}
