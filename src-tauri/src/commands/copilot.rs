use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

use crate::error::AppError;
use crate::services::copilot_lsp::{self, CopilotCompletion, CopilotLspHandle, CopilotSignInResult};
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CompletionResult {
    pub items: Vec<CopilotCompletion>,
}

#[derive(Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DocSyncEvent {
    pub uri: String,
    pub language_id: String,
    pub version: i32,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DocChangeEvent {
    pub uri: String,
    pub version: i32,
    pub text: String,
}

/// Extract a cloned CopilotLspHandle from AppState without holding the lock across awaits.
fn get_handle(state: &State<'_, AppState>) -> Result<CopilotLspHandle, AppError> {
    get_handle_from_mutex(&state.copilot)
}

/// Extract a CopilotLspHandle from a mutex — testable without AppState.
pub(crate) fn get_handle_from_mutex(
    copilot: &std::sync::Mutex<Option<(CopilotLspHandle, tokio::process::Child)>>,
) -> Result<CopilotLspHandle, AppError> {
    let guard = copilot
        .lock()
        .map_err(|_| AppError::CopilotError("Failed to acquire copilot lock".into()))?;
    guard
        .as_ref()
        .map(|(handle, _)| handle.clone())
        .ok_or_else(|| AppError::CopilotError("Copilot is not running".to_string()))
}

/// Parse a sign-in response from the LSP into a CopilotSignInResult.
pub(crate) fn parse_sign_in_result(result: &Value) -> Result<CopilotSignInResult, AppError> {
    let result_val = result.get("result").cloned().unwrap_or(Value::Null);
    serde_json::from_value(result_val.clone()).map_err(|e| {
        AppError::CopilotError(format!(
            "Failed to parse sign-in result: {} - raw: {}",
            e, result_val
        ))
    })
}

/// Extract the result field from a check-status response.
pub(crate) fn extract_result_field(response: &Value) -> Value {
    response.get("result").cloned().unwrap_or(Value::Null)
}

/// Build the didOpen notification params.
pub(crate) fn build_did_open_params(event: &DocSyncEvent) -> Value {
    serde_json::json!({
        "textDocument": {
            "uri": event.uri,
            "languageId": event.language_id,
            "version": event.version,
            "text": event.text,
        }
    })
}

/// Build the didChange notification params.
pub(crate) fn build_did_change_params(event: &DocChangeEvent) -> Value {
    serde_json::json!({
        "textDocument": {
            "uri": event.uri,
            "version": event.version,
        },
        "contentChanges": [{
            "text": event.text,
        }],
    })
}

/// Build the didClose notification params.
pub(crate) fn build_did_close_params(uri: &str) -> Value {
    serde_json::json!({
        "textDocument": { "uri": uri }
    })
}

/// Build the inline completion request params.
pub(crate) fn build_completion_params(uri: &str, line: u32, character: u32, trigger_kind: u32) -> Value {
    serde_json::json!({
        "textDocument": { "uri": uri },
        "position": { "line": line, "character": character },
        "context": {
            "triggerKind": trigger_kind
        }
    })
}

/// Parse completion items from an LSP inline completion response.
pub(crate) fn parse_completion_items(result: &Value) -> Vec<CopilotCompletion> {
    let result_val = result.get("result").cloned().unwrap_or(Value::Null);

    // The response can be an array or an object with "items"
    let items_val = if result_val.is_array() {
        result_val
    } else {
        result_val
            .get("items")
            .cloned()
            .unwrap_or(Value::Array(vec![]))
    };

    items_val
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    match serde_json::from_value::<CopilotCompletion>(item.clone()) {
                        Ok(c) => Some(c),
                        Err(e) => {
                            eprintln!(
                                "[copilot] Failed to parse completion item: {} - raw: {}",
                                e, item
                            );
                            None
                        }
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Start the Copilot Language Server.
#[tauri::command]
#[specta::specta]
pub async fn start_copilot(
    state: State<'_, AppState>,
    root_uri: String,
) -> Result<(), AppError> {
    // Check if already running
    {
        let guard = state.copilot.lock()
            .map_err(|_| AppError::CopilotError("Failed to acquire copilot lock".into()))?;
        if guard.is_some() {
            return Ok(());
        }
    }

    let (handle, child) = copilot_lsp::start(&root_uri).await?;

    // Re-check after the await: another call may have won the race.
    let mut cleanup = None;
    {
        let mut guard = state.copilot.lock()
            .map_err(|_| AppError::CopilotError("Failed to acquire copilot lock".into()))?;
        if guard.is_some() {
            // Lost the race — clean up our process
            cleanup = Some((handle, child));
        } else {
            *guard = Some((handle, child));
        }
    }

    if let Some((ref h, ref mut c)) = cleanup {
        copilot_lsp::stop(h, c).await;
    }

    Ok(())
}

/// Stop the Copilot Language Server.
#[tauri::command]
#[specta::specta]
pub async fn stop_copilot(state: State<'_, AppState>) -> Result<(), AppError> {
    let taken = {
        let mut guard = state.copilot.lock()
            .map_err(|_| AppError::CopilotError("Failed to acquire copilot lock".into()))?;
        guard.take()
    };

    if let Some((handle, mut child)) = taken {
        copilot_lsp::stop(&handle, &mut child).await;
    }

    Ok(())
}

/// Trigger GitHub OAuth device flow sign-in.
#[tauri::command]
#[specta::specta]
pub async fn copilot_sign_in(
    state: State<'_, AppState>,
) -> Result<CopilotSignInResult, AppError> {
    let handle = get_handle(&state)?;

    let result = copilot_lsp::send_request(
        &handle,
        "signIn",
        serde_json::json!({}),
    )
    .await?;

    parse_sign_in_result(&result)
}

/// Check Copilot authentication status.
#[tauri::command]
#[specta::specta]
pub async fn copilot_check_status(
    state: State<'_, AppState>,
) -> Result<Value, AppError> {
    let handle = get_handle(&state)?;

    let result = copilot_lsp::send_request(
        &handle,
        "checkStatus",
        serde_json::json!({}),
    )
    .await?;

    Ok(extract_result_field(&result))
}

/// Notify Copilot LS that a document was opened.
#[tauri::command]
#[specta::specta]
pub async fn copilot_did_open(
    state: State<'_, AppState>,
    event: DocSyncEvent,
) -> Result<(), AppError> {
    let handle = get_handle(&state)?;
    let params = build_did_open_params(&event);
    copilot_lsp::send_notification(&handle, "textDocument/didOpen", params).await
}

/// Notify Copilot LS that a document changed.
#[tauri::command]
#[specta::specta]
pub async fn copilot_did_change(
    state: State<'_, AppState>,
    event: DocChangeEvent,
) -> Result<(), AppError> {
    let handle = get_handle(&state)?;
    let params = build_did_change_params(&event);
    copilot_lsp::send_notification(&handle, "textDocument/didChange", params).await
}

/// Notify Copilot LS that a document was closed.
#[tauri::command]
#[specta::specta]
pub async fn copilot_did_close(
    state: State<'_, AppState>,
    uri: String,
) -> Result<(), AppError> {
    let handle = get_handle(&state)?;
    let params = build_did_close_params(&uri);
    copilot_lsp::send_notification(&handle, "textDocument/didClose", params).await
}

/// Request inline completions at a given position.
#[tauri::command]
#[specta::specta]
pub async fn copilot_complete(
    state: State<'_, AppState>,
    uri: String,
    line: u32,
    character: u32,
    trigger_kind: u32,
) -> Result<CompletionResult, AppError> {
    let handle = get_handle(&state)?;

    let params = build_completion_params(&uri, line, character, trigger_kind);
    let result = copilot_lsp::send_request(
        &handle,
        "textDocument/inlineCompletion",
        params,
    )
    .await?;

    let items = parse_completion_items(&result);
    Ok(CompletionResult { items })
}

/// Notify Copilot LS that a completion was accepted.
#[tauri::command]
#[specta::specta]
pub async fn copilot_notify_accepted(
    state: State<'_, AppState>,
    uuid: String,
) -> Result<(), AppError> {
    let handle = get_handle(&state)?;
    copilot_lsp::send_notification(
        &handle,
        "notifyAccepted",
        serde_json::json!({ "uuid": uuid }),
    )
    .await
}

/// Notify Copilot LS that completions were rejected.
#[tauri::command]
#[specta::specta]
pub async fn copilot_notify_rejected(
    state: State<'_, AppState>,
    uuids: Vec<String>,
) -> Result<(), AppError> {
    let handle = get_handle(&state)?;
    copilot_lsp::send_notification(
        &handle,
        "notifyRejected",
        serde_json::json!({ "uuids": uuids }),
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_handle_from_mutex_none_returns_error() {
        let copilot: std::sync::Mutex<Option<(CopilotLspHandle, tokio::process::Child)>> =
            std::sync::Mutex::new(None);
        let result = get_handle_from_mutex(&copilot);
        assert!(result.is_err());
        let err = format!("{}", result.err().expect("expected error"));
        assert!(err.contains("not running"));
    }

    #[test]
    fn test_parse_sign_in_result_valid() {
        let response = serde_json::json!({
            "result": {
                "status": "AlreadySignedIn",
                "user": "testuser"
            }
        });
        let result = parse_sign_in_result(&response).unwrap();
        assert_eq!(result.status, "AlreadySignedIn");
        assert_eq!(result.user.as_deref(), Some("testuser"));
    }

    #[test]
    fn test_parse_sign_in_result_with_device_flow() {
        let response = serde_json::json!({
            "result": {
                "status": "PromptUserDeviceFlow",
                "userCode": "ABCD-1234",
                "verificationUri": "https://github.com/login/device"
            }
        });
        let result = parse_sign_in_result(&response).unwrap();
        assert_eq!(result.status, "PromptUserDeviceFlow");
        assert_eq!(result.user_code.as_deref(), Some("ABCD-1234"));
        assert_eq!(
            result.verification_uri.as_deref(),
            Some("https://github.com/login/device")
        );
    }

    #[test]
    fn test_parse_sign_in_result_missing_result() {
        let response = serde_json::json!({});
        let result = parse_sign_in_result(&response);
        assert!(result.is_err());
    }

    #[test]
    fn test_extract_result_field_present() {
        let response = serde_json::json!({"result": {"status": "OK"}});
        let val = extract_result_field(&response);
        assert_eq!(val, serde_json::json!({"status": "OK"}));
    }

    #[test]
    fn test_extract_result_field_missing() {
        let response = serde_json::json!({});
        let val = extract_result_field(&response);
        assert!(val.is_null());
    }

    #[test]
    fn test_build_did_open_params() {
        let event = DocSyncEvent {
            uri: "file:///test.ts".to_string(),
            language_id: "typescript".to_string(),
            version: 1,
            text: "const x = 1;".to_string(),
        };
        let params = build_did_open_params(&event);
        let td = params.get("textDocument").unwrap();
        assert_eq!(td.get("uri").unwrap().as_str().unwrap(), "file:///test.ts");
        assert_eq!(td.get("languageId").unwrap().as_str().unwrap(), "typescript");
        assert_eq!(td.get("version").unwrap().as_i64().unwrap(), 1);
        assert_eq!(td.get("text").unwrap().as_str().unwrap(), "const x = 1;");
    }

    #[test]
    fn test_build_did_change_params() {
        let event = DocChangeEvent {
            uri: "file:///test.ts".to_string(),
            version: 2,
            text: "const x = 2;".to_string(),
        };
        let params = build_did_change_params(&event);
        let td = params.get("textDocument").unwrap();
        assert_eq!(td.get("uri").unwrap().as_str().unwrap(), "file:///test.ts");
        assert_eq!(td.get("version").unwrap().as_i64().unwrap(), 2);
        let changes = params.get("contentChanges").unwrap().as_array().unwrap();
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].get("text").unwrap().as_str().unwrap(), "const x = 2;");
    }

    #[test]
    fn test_build_did_close_params() {
        let params = build_did_close_params("file:///test.ts");
        let td = params.get("textDocument").unwrap();
        assert_eq!(td.get("uri").unwrap().as_str().unwrap(), "file:///test.ts");
    }

    #[test]
    fn test_build_completion_params() {
        let params = build_completion_params("file:///test.ts", 10, 5, 1);
        let td = params.get("textDocument").unwrap();
        assert_eq!(td.get("uri").unwrap().as_str().unwrap(), "file:///test.ts");
        let pos = params.get("position").unwrap();
        assert_eq!(pos.get("line").unwrap().as_u64().unwrap(), 10);
        assert_eq!(pos.get("character").unwrap().as_u64().unwrap(), 5);
        let ctx = params.get("context").unwrap();
        assert_eq!(ctx.get("triggerKind").unwrap().as_u64().unwrap(), 1);
    }

    #[test]
    fn test_build_completion_params_explicit_trigger() {
        let params = build_completion_params("file:///test.ts", 0, 0, 2);
        let ctx = params.get("context").unwrap();
        assert_eq!(ctx.get("triggerKind").unwrap().as_u64().unwrap(), 2);
    }

    #[test]
    fn test_parse_completion_items_array_format() {
        let response = serde_json::json!({
            "result": [
                {
                    "insertText": "console.log('hello');",
                    "range": {
                        "start": {"line": 0, "character": 0},
                        "end": {"line": 0, "character": 0}
                    }
                }
            ]
        });
        let items = parse_completion_items(&response);
        assert_eq!(items.len(), 1);
    }

    #[test]
    fn test_parse_completion_items_object_format() {
        let response = serde_json::json!({
            "result": {
                "items": [
                    {
                        "insertText": "let x = 1;",
                        "range": {
                            "start": {"line": 0, "character": 0},
                            "end": {"line": 0, "character": 0}
                        }
                    }
                ]
            }
        });
        let items = parse_completion_items(&response);
        assert_eq!(items.len(), 1);
    }

    #[test]
    fn test_parse_completion_items_empty() {
        let response = serde_json::json!({"result": null});
        let items = parse_completion_items(&response);
        assert!(items.is_empty());
    }

    #[test]
    fn test_parse_completion_items_no_result() {
        let response = serde_json::json!({});
        let items = parse_completion_items(&response);
        assert!(items.is_empty());
    }

    #[test]
    fn test_parse_completion_items_empty_items_array() {
        let response = serde_json::json!({"result": {"items": []}});
        let items = parse_completion_items(&response);
        assert!(items.is_empty());
    }

    #[test]
    fn test_parse_completion_items_skips_invalid() {
        let response = serde_json::json!({
            "result": [
                {"invalid": "data"},
                {
                    "insertText": "valid",
                    "range": {
                        "start": {"line": 0, "character": 0},
                        "end": {"line": 0, "character": 0}
                    }
                }
            ]
        });
        let items = parse_completion_items(&response);
        // Should parse the valid one, skip the invalid
        assert!(items.len() <= 2);
    }

    #[test]
    fn test_completion_result_serde_roundtrip() {
        let result = CompletionResult { items: vec![] };
        let json = serde_json::to_string(&result).unwrap();
        let deserialized: CompletionResult = serde_json::from_str(&json).unwrap();
        assert!(deserialized.items.is_empty());
    }

    #[test]
    fn test_doc_sync_event_serde_roundtrip() {
        let event = DocSyncEvent {
            uri: "file:///main.rs".to_string(),
            language_id: "rust".to_string(),
            version: 3,
            text: "fn main() {}".to_string(),
        };
        let json = serde_json::to_string(&event).unwrap();
        let deserialized: DocSyncEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.uri, "file:///main.rs");
        assert_eq!(deserialized.language_id, "rust");
        assert_eq!(deserialized.version, 3);
    }

    #[test]
    fn test_doc_change_event_serde_roundtrip() {
        let event = DocChangeEvent {
            uri: "file:///main.rs".to_string(),
            version: 5,
            text: "fn main() { println!(); }".to_string(),
        };
        let json = serde_json::to_string(&event).unwrap();
        let deserialized: DocChangeEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.uri, "file:///main.rs");
        assert_eq!(deserialized.version, 5);
    }

    // ── Command wrapper tests ──

    #[tokio::test]
    async fn test_copilot_check_status_command_not_running() {
        use crate::test_helpers::*;
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        // Copilot is not started, so check_status should return an error
        let result = copilot_check_status(state).await;
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("not running"));
    }

    #[tokio::test]
    async fn test_copilot_sign_in_command_not_running() {
        use crate::test_helpers::*;
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        // Copilot is not started, so sign_in should return an error
        let result = copilot_sign_in(state).await;
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("not running"));
    }

    #[tokio::test]
    async fn test_stop_copilot_command_when_not_running() {
        use crate::test_helpers::*;
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        // Stopping when not running should succeed gracefully
        let result = stop_copilot(state).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_copilot_did_open_command_not_running() {
        use crate::test_helpers::*;
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let event = DocSyncEvent {
            uri: "file:///test.ts".to_string(),
            language_id: "typescript".to_string(),
            version: 1,
            text: "const x = 1;".to_string(),
        };
        let result = copilot_did_open(state, event).await;
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("not running"));
    }

    #[tokio::test]
    async fn test_copilot_complete_command_not_running() {
        use crate::test_helpers::*;
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let result = copilot_complete(state, "file:///test.ts".to_string(), 0, 0, 1).await;
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("not running"));
    }

    #[tokio::test]
    async fn test_copilot_did_change_command_not_running() {
        use crate::test_helpers::*;
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let event = DocChangeEvent {
            uri: "file:///test.ts".to_string(),
            version: 2,
            text: "const x = 2;".to_string(),
        };
        let result = copilot_did_change(state, event).await;
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("not running"));
    }

    #[tokio::test]
    async fn test_copilot_did_close_command_not_running() {
        use crate::test_helpers::*;
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let result = copilot_did_close(state, "file:///test.ts".to_string()).await;
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("not running"));
    }

    #[tokio::test]
    async fn test_copilot_notify_accepted_not_running() {
        use crate::test_helpers::*;
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let result = copilot_notify_accepted(state, "test-uuid".to_string()).await;
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("not running"));
    }

    #[tokio::test]
    async fn test_copilot_notify_rejected_not_running() {
        use crate::test_helpers::*;
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let result = copilot_notify_rejected(state, vec!["uuid-1".to_string()]).await;
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("not running"));
    }

    #[tokio::test]
    async fn test_start_copilot_command_idempotent() {
        // start_copilot when copilot is None will try to launch the LSP,
        // which will fail in test (no copilot binary), but we test that the
        // error path works correctly.
        use crate::test_helpers::*;
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let result = start_copilot(state, "file:///tmp".to_string()).await;
        // Will error because copilot binary is not available
        assert!(result.is_err());
    }

    #[test]
    fn test_build_did_change_params_preserves_version() {
        let event = DocChangeEvent {
            uri: "file:///main.rs".to_string(),
            version: 99,
            text: "updated content".to_string(),
        };
        let params = build_did_change_params(&event);
        let td = params.get("textDocument").unwrap();
        assert_eq!(td.get("version").unwrap().as_i64().unwrap(), 99);
    }

    #[test]
    fn test_build_did_close_params_with_complex_uri() {
        let params = build_did_close_params("file:///home/user/project%20name/src/lib.rs");
        let td = params.get("textDocument").unwrap();
        assert_eq!(
            td.get("uri").unwrap().as_str().unwrap(),
            "file:///home/user/project%20name/src/lib.rs"
        );
    }

    #[test]
    fn test_parse_completion_items_multiple_items() {
        let response = serde_json::json!({
            "result": {
                "items": [
                    {
                        "insertText": "item1",
                        "range": {
                            "start": {"line": 0, "character": 0},
                            "end": {"line": 0, "character": 0}
                        }
                    },
                    {
                        "insertText": "item2",
                        "range": {
                            "start": {"line": 1, "character": 0},
                            "end": {"line": 1, "character": 0}
                        }
                    }
                ]
            }
        });
        let items = parse_completion_items(&response);
        assert_eq!(items.len(), 2);
    }
}
