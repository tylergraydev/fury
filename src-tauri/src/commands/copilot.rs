use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

use crate::error::AppError;
use crate::services::copilot_lsp::{self, CopilotCompletion, CopilotLspHandle, CopilotSignInResult};
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionResult {
    pub items: Vec<CopilotCompletion>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocSyncEvent {
    pub uri: String,
    pub language_id: String,
    pub version: i32,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocChangeEvent {
    pub uri: String,
    pub version: i32,
    pub text: String,
}

/// Extract a cloned CopilotLspHandle from AppState without holding the lock across awaits.
fn get_handle(state: &State<'_, AppState>) -> Result<CopilotLspHandle, AppError> {
    let guard = state.copilot.lock().unwrap();
    guard
        .as_ref()
        .map(|(handle, _)| handle.clone())
        .ok_or_else(|| AppError::CopilotError("Copilot is not running".to_string()))
}

/// Start the Copilot Language Server.
#[tauri::command]
pub async fn start_copilot(
    state: State<'_, AppState>,
    root_uri: String,
) -> Result<(), AppError> {
    // Check if already running
    {
        let guard = state.copilot.lock().unwrap();
        if guard.is_some() {
            return Ok(());
        }
    }

    let (handle, child) = copilot_lsp::start(&root_uri).await?;

    {
        let mut guard = state.copilot.lock().unwrap();
        *guard = Some((handle, child));
    }

    Ok(())
}

/// Stop the Copilot Language Server.
#[tauri::command]
pub async fn stop_copilot(state: State<'_, AppState>) -> Result<(), AppError> {
    let taken = {
        let mut guard = state.copilot.lock().unwrap();
        guard.take()
    };

    if let Some((handle, mut child)) = taken {
        copilot_lsp::stop(&handle, &mut child).await;
    }

    Ok(())
}

/// Trigger GitHub OAuth device flow sign-in.
#[tauri::command]
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

    let result_val = result.get("result").cloned().unwrap_or(Value::Null);

    Ok(serde_json::from_value(result_val).unwrap_or(CopilotSignInResult {
        status: "Unknown".to_string(),
        user_code: None,
        verification_uri: None,
        user: None,
    }))
}

/// Check Copilot authentication status.
#[tauri::command]
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

    Ok(result.get("result").cloned().unwrap_or(Value::Null))
}

/// Notify Copilot LS that a document was opened.
#[tauri::command]
pub async fn copilot_did_open(
    state: State<'_, AppState>,
    event: DocSyncEvent,
) -> Result<(), AppError> {
    let handle = get_handle(&state)?;

    copilot_lsp::send_notification(
        &handle,
        "textDocument/didOpen",
        serde_json::json!({
            "textDocument": {
                "uri": event.uri,
                "languageId": event.language_id,
                "version": event.version,
                "text": event.text,
            }
        }),
    )
    .await
}

/// Notify Copilot LS that a document changed.
#[tauri::command]
pub async fn copilot_did_change(
    state: State<'_, AppState>,
    event: DocChangeEvent,
) -> Result<(), AppError> {
    let handle = get_handle(&state)?;

    copilot_lsp::send_notification(
        &handle,
        "textDocument/didChange",
        serde_json::json!({
            "textDocument": {
                "uri": event.uri,
                "version": event.version,
            },
            "contentChanges": [{
                "text": event.text,
            }],
        }),
    )
    .await
}

/// Notify Copilot LS that a document was closed.
#[tauri::command]
pub async fn copilot_did_close(
    state: State<'_, AppState>,
    uri: String,
) -> Result<(), AppError> {
    let handle = get_handle(&state)?;

    copilot_lsp::send_notification(
        &handle,
        "textDocument/didClose",
        serde_json::json!({
            "textDocument": { "uri": uri }
        }),
    )
    .await
}

/// Request inline completions at a given position.
#[tauri::command]
pub async fn copilot_complete(
    state: State<'_, AppState>,
    uri: String,
    line: u32,
    character: u32,
) -> Result<CompletionResult, AppError> {
    let handle = get_handle(&state)?;

    let result = copilot_lsp::send_request(
        &handle,
        "textDocument/inlineCompletion",
        serde_json::json!({
            "textDocument": { "uri": uri },
            "position": { "line": line, "character": character },
            "context": {
                "triggerKind": 1
            }
        }),
    )
    .await?;

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

    let items: Vec<CopilotCompletion> = items_val
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|item| serde_json::from_value(item.clone()).ok())
                .collect()
        })
        .unwrap_or_default();

    Ok(CompletionResult { items })
}
