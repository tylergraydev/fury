use axum::{
    extract::State as AxumState,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use super::browser::{self, BrowserWebviews};

/// Shared state for the browser bridge HTTP server.
#[derive(Clone)]
pub struct BridgeState {
    pub webviews: BrowserWebviews,
    pub token: String,
    pub app: AppHandle,
}

/// Auth token header name.
const AUTH_HEADER: &str = "x-fury-token";

// --- Request/response types ---

#[derive(Deserialize)]
pub struct NavigateRequest {
    pub url: String,
    #[serde(default)]
    pub browser_id: Option<String>,
}

#[derive(Deserialize)]
pub struct SelectorRequest {
    pub selector: String,
    #[serde(default)]
    pub browser_id: Option<String>,
}

#[derive(Deserialize)]
pub struct TypeRequest {
    pub selector: String,
    pub text: String,
    #[serde(default)]
    pub browser_id: Option<String>,
}

#[derive(Serialize)]
pub struct BridgeResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl BridgeResponse {
    fn success(data: impl Into<serde_json::Value>) -> Self {
        Self {
            ok: true,
            data: Some(data.into()),
            error: None,
        }
    }

    fn ok() -> Self {
        Self {
            ok: true,
            data: None,
            error: None,
        }
    }

    fn err(msg: impl Into<String>) -> Self {
        Self {
            ok: false,
            data: None,
            error: Some(msg.into()),
        }
    }
}

/// Get the first available browser ID from state, or use the provided one.
fn resolve_browser_id(
    browser_id: Option<&str>,
    webviews: &BrowserWebviews,
) -> Result<String, String> {
    if let Some(id) = browser_id {
        return Ok(id.to_string());
    }
    let lock = webviews.lock().unwrap();
    let count = lock.len();
    let result = lock.keys().next().cloned();
    drop(lock);
    match result {
        Some(id) => {
            eprintln!("[browser-bridge] Resolved browser (total={})", count);
            Ok(id)
        }
        None => {
            eprintln!("[browser-bridge] No browser webviews registered (count=0)");
            Err("No browser is open. Call browser_navigate first to open the browser panel.".into())
        }
    }
}

// --- Middleware: auth check ---

fn check_auth(headers: &axum::http::HeaderMap, expected: &str) -> Result<(), (StatusCode, String)> {
    let token = headers
        .get(AUTH_HEADER)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    // Constant-time comparison to avoid leaking token length/prefix via
    // timing. Short-circuit length mismatch first — the lengths are not
    // secret, but the contents are.
    if token.len() != expected.len() || !constant_time_eq(token.as_bytes(), expected.as_bytes()) {
        // Never log the received or expected token, even a prefix — anything
        // that reaches stderr can end up in devcontainer log capture or crash
        // reporters.
        eprintln!(
            "[browser-bridge] AUTH FAILED (header present={})",
            headers.get(AUTH_HEADER).is_some()
        );
        return Err((StatusCode::UNAUTHORIZED, "Invalid token".into()));
    }
    Ok(())
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff: u8 = 0;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

// --- Handlers ---

async fn health() -> Json<BridgeResponse> {
    Json(BridgeResponse::ok())
}

async fn handle_navigate(
    headers: axum::http::HeaderMap,
    AxumState(state): AxumState<BridgeState>,
    Json(req): Json<NavigateRequest>,
) -> Result<Json<BridgeResponse>, (StatusCode, String)> {
    check_auth(&headers, &state.token)?;

    match resolve_browser_id(req.browser_id.as_deref(), &state.webviews) {
        Ok(id) => {
            match browser::navigate(&id, &req.url, &state.webviews) {
                Ok(()) => Ok(Json(BridgeResponse::ok())),
                Err(e) => Ok(Json(BridgeResponse::err(e.to_string()))),
            }
        }
        Err(_) => {
            // No browser open — tell the frontend to open one. If the emit
            // fails we must propagate the error so the MCP client doesn't
            // think the navigation succeeded.
            if let Err(e) = state.app.emit("browser-open", &req.url) {
                return Ok(Json(BridgeResponse::err(format!(
                    "Failed to dispatch browser-open event to UI: {}",
                    e
                ))));
            }
            Ok(Json(BridgeResponse::success(
                "Browser panel opening — navigate request sent to Fury UI",
            )))
        }
    }
}

async fn handle_click(
    headers: axum::http::HeaderMap,
    AxumState(state): AxumState<BridgeState>,
    Json(req): Json<SelectorRequest>,
) -> Result<Json<BridgeResponse>, (StatusCode, String)> {
    check_auth(&headers, &state.token)?;
    let id = resolve_browser_id(req.browser_id.as_deref(), &state.webviews)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    let selector_json = match serde_json::to_string(&req.selector) {
        Ok(s) => s,
        Err(e) => return Ok(Json(BridgeResponse::err(format!("Invalid selector: {}", e)))),
    };
    let js = format!("window.__fury.click({})", selector_json);
    match browser::eval_js(&id, &js, &state.webviews) {
        Ok(()) => Ok(Json(BridgeResponse::ok())),
        Err(e) => Ok(Json(BridgeResponse::err(e.to_string()))),
    }
}

async fn handle_type(
    headers: axum::http::HeaderMap,
    AxumState(state): AxumState<BridgeState>,
    Json(req): Json<TypeRequest>,
) -> Result<Json<BridgeResponse>, (StatusCode, String)> {
    check_auth(&headers, &state.token)?;
    let id = resolve_browser_id(req.browser_id.as_deref(), &state.webviews)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    let selector_json = match serde_json::to_string(&req.selector) {
        Ok(s) => s,
        Err(e) => return Ok(Json(BridgeResponse::err(format!("Invalid selector: {}", e)))),
    };
    let text_json = match serde_json::to_string(&req.text) {
        Ok(s) => s,
        Err(e) => return Ok(Json(BridgeResponse::err(format!("Invalid text: {}", e)))),
    };
    let js = format!("window.__fury.type({}, {})", selector_json, text_json);
    match browser::eval_js(&id, &js, &state.webviews) {
        Ok(()) => Ok(Json(BridgeResponse::ok())),
        Err(e) => Ok(Json(BridgeResponse::err(e.to_string()))),
    }
}

async fn handle_open(
    headers: axum::http::HeaderMap,
    AxumState(state): AxumState<BridgeState>,
    Json(req): Json<NavigateRequest>,
) -> Result<Json<BridgeResponse>, (StatusCode, String)> {
    check_auth(&headers, &state.token)?;

    // If a browser is already open, navigate it and report the real result.
    if let Ok(id) = resolve_browser_id(req.browser_id.as_deref(), &state.webviews) {
        return match browser::navigate(&id, &req.url, &state.webviews) {
            Ok(()) => Ok(Json(BridgeResponse::success("Navigated existing browser"))),
            Err(e) => Ok(Json(BridgeResponse::err(format!(
                "Navigation failed: {}",
                e
            )))),
        };
    }

    // Emit event to frontend to open the browser panel with this URL. If the
    // emit fails, surface the error instead of claiming success.
    if let Err(e) = state.app.emit("browser-open", &req.url) {
        return Ok(Json(BridgeResponse::err(format!(
            "Failed to dispatch browser-open event to UI: {}",
            e
        ))));
    }
    Ok(Json(BridgeResponse::success(
        "Browser panel opening with requested URL",
    )))
}

/// Logging middleware for all bridge requests.
async fn log_requests(
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    let method = req.method().clone();
    let uri = req.uri().clone();
    eprintln!("[browser-bridge] → {} {}", method, uri);
    let resp = next.run(req).await;
    eprintln!("[browser-bridge] ← {} {} → {}", method, uri, resp.status());
    resp
}

/// Start the browser bridge HTTP server.
pub async fn start_bridge_server(webviews: BrowserWebviews, token: String, port: u16, app: AppHandle) {
    let state = BridgeState { webviews, token, app };

    let app = Router::new()
        .route("/health", get(health))
        .route("/browser/open", post(handle_open))
        .route("/browser/navigate", post(handle_navigate))
        .route("/browser/click", post(handle_click))
        .route("/browser/type", post(handle_type))
        .layer(axum::middleware::from_fn(log_requests))
        .with_state(state);

    let addr = format!("127.0.0.1:{}", port);
    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[browser-bridge] Failed to bind port {}: {}", port, e);
            return;
        }
    };

    eprintln!("[browser-bridge] Server running on http://{}", addr);

    if let Err(e) = axum::serve(listener, app).await {
        eprintln!("[browser-bridge] Server error: {}", e);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn test_bridge_response_ok() {
        let resp = BridgeResponse::ok();
        assert!(resp.ok);
        assert!(resp.data.is_none());
        assert!(resp.error.is_none());
    }

    #[test]
    fn test_bridge_response_success() {
        let resp = BridgeResponse::success("hello");
        assert!(resp.ok);
        assert!(resp.data.is_some());
    }

    #[test]
    fn test_bridge_response_err() {
        let resp = BridgeResponse::err("something went wrong");
        assert!(!resp.ok);
        assert!(resp.error.is_some());
        assert_eq!(resp.error.unwrap(), "something went wrong");
    }

    #[test]
    fn test_resolve_browser_id_with_explicit_id() {
        let webviews: BrowserWebviews = Arc::new(std::sync::Mutex::new(std::collections::HashMap::new()));
        let result = resolve_browser_id(Some("my-id"), &webviews);
        assert_eq!(result.unwrap(), "my-id");
    }

    #[test]
    fn test_resolve_browser_id_none_no_webviews() {
        let webviews: BrowserWebviews = Arc::new(std::sync::Mutex::new(std::collections::HashMap::new()));
        let result = resolve_browser_id(None, &webviews);
        assert!(result.is_err());
    }

    #[test]
    fn test_check_auth_valid() {
        let mut headers = axum::http::HeaderMap::new();
        headers.insert(AUTH_HEADER, "my-secret".parse().unwrap());
        assert!(check_auth(&headers, "my-secret").is_ok());
    }

    #[test]
    fn test_check_auth_invalid() {
        let mut headers = axum::http::HeaderMap::new();
        headers.insert(AUTH_HEADER, "wrong".parse().unwrap());
        assert!(check_auth(&headers, "my-secret").is_err());
    }

    #[test]
    fn test_check_auth_missing() {
        let headers = axum::http::HeaderMap::new();
        assert!(check_auth(&headers, "my-secret").is_err());
    }
}
