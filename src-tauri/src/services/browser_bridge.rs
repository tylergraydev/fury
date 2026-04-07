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

#[derive(Deserialize)]
pub struct EvalRequest {
    pub script: String,
    #[serde(default)]
    pub browser_id: Option<String>,
}

#[derive(Deserialize)]
pub struct HtmlRequest {
    #[serde(default)]
    pub selector: Option<String>,
    #[serde(default)]
    pub browser_id: Option<String>,
}

#[derive(Deserialize)]
pub struct ConsoleRequest {
    #[serde(default)]
    pub level: Option<String>,
    #[serde(default)]
    pub browser_id: Option<String>,
}

#[derive(Deserialize)]
pub struct WaitRequest {
    pub selector: String,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
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
            eprintln!("[browser-bridge] Resolved browser id={} (total={})", &id[..8.min(id.len())], count);
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
    if token != expected {
        eprintln!(
            "[browser-bridge] AUTH FAILED: got={} expected={} (header present={})",
            if token.len() > 8 { &token[..8] } else { token },
            if expected.len() > 8 { &expected[..8] } else { expected },
            headers.get(AUTH_HEADER).is_some()
        );
        return Err((StatusCode::UNAUTHORIZED, "Invalid token".into()));
    }
    Ok(())
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
            // No browser open — tell the frontend to open one
            let _ = state.app.emit("browser-open", &req.url);
            Ok(Json(BridgeResponse::success("Browser panel opening — navigate request sent to Fury UI")))
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

    let js = format!("window.__fury.click({})", serde_json::to_string(&req.selector).unwrap());
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

    let js = format!(
        "window.__fury.type({}, {})",
        serde_json::to_string(&req.selector).unwrap(),
        serde_json::to_string(&req.text).unwrap()
    );
    match browser::eval_js(&id, &js, &state.webviews) {
        Ok(()) => Ok(Json(BridgeResponse::ok())),
        Err(e) => Ok(Json(BridgeResponse::err(e.to_string()))),
    }
}

async fn handle_eval(
    headers: axum::http::HeaderMap,
    AxumState(state): AxumState<BridgeState>,
    Json(req): Json<EvalRequest>,
) -> Result<Json<BridgeResponse>, (StatusCode, String)> {
    check_auth(&headers, &state.token)?;
    let id = resolve_browser_id(req.browser_id.as_deref(), &state.webviews)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    match browser::eval_js(&id, &req.script, &state.webviews) {
        Ok(()) => Ok(Json(BridgeResponse::ok())),
        Err(e) => Ok(Json(BridgeResponse::err(e.to_string()))),
    }
}

async fn handle_console(
    headers: axum::http::HeaderMap,
    AxumState(state): AxumState<BridgeState>,
    Json(req): Json<ConsoleRequest>,
) -> Result<Json<BridgeResponse>, (StatusCode, String)> {
    check_auth(&headers, &state.token)?;
    let id = resolve_browser_id(req.browser_id.as_deref(), &state.webviews)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    let level = req.level.as_deref().unwrap_or("all");
    let js = format!("window.__fury.getLogs({})", serde_json::to_string(level).unwrap());
    match browser::eval_js(&id, &js, &state.webviews) {
        Ok(()) => Ok(Json(BridgeResponse::success("Console logs requested (eval is fire-and-forget; use screenshot for visible results)"))),
        Err(e) => Ok(Json(BridgeResponse::err(e.to_string()))),
    }
}

async fn handle_html(
    headers: axum::http::HeaderMap,
    AxumState(state): AxumState<BridgeState>,
    Json(req): Json<HtmlRequest>,
) -> Result<Json<BridgeResponse>, (StatusCode, String)> {
    check_auth(&headers, &state.token)?;
    let id = resolve_browser_id(req.browser_id.as_deref(), &state.webviews)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    let selector_arg = match req.selector {
        Some(ref s) => serde_json::to_string(s).unwrap(),
        None => "null".to_string(),
    };
    let js = format!("window.__fury.getHTML({})", selector_arg);
    match browser::eval_js(&id, &js, &state.webviews) {
        Ok(()) => Ok(Json(BridgeResponse::ok())),
        Err(e) => Ok(Json(BridgeResponse::err(e.to_string()))),
    }
}

async fn handle_wait(
    headers: axum::http::HeaderMap,
    AxumState(state): AxumState<BridgeState>,
    Json(req): Json<WaitRequest>,
) -> Result<Json<BridgeResponse>, (StatusCode, String)> {
    check_auth(&headers, &state.token)?;
    let id = resolve_browser_id(req.browser_id.as_deref(), &state.webviews)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    let timeout = req.timeout_ms.unwrap_or(5000);
    let js = format!(
        "window.__fury.waitFor({}, {})",
        serde_json::to_string(&req.selector).unwrap(),
        timeout
    );
    match browser::eval_js(&id, &js, &state.webviews) {
        Ok(()) => Ok(Json(BridgeResponse::ok())),
        Err(e) => Ok(Json(BridgeResponse::err(e.to_string()))),
    }
}

async fn handle_screenshot(
    headers: axum::http::HeaderMap,
    AxumState(state): AxumState<BridgeState>,
) -> Result<Json<BridgeResponse>, (StatusCode, String)> {
    check_auth(&headers, &state.token)?;

    // Screenshot requires platform-specific implementation.
    // For now, return HTML snapshot as a fallback.
    let id = {
        let lock = state.webviews.lock().unwrap();
        lock.keys().next().cloned()
    };

    match id {
        Some(id) => {
            let js = "window.__fury.getHTML(null)";
            match browser::eval_js(&id, js, &state.webviews) {
                Ok(()) => Ok(Json(BridgeResponse::success("Screenshot requested (HTML snapshot via eval)"))),
                Err(e) => Ok(Json(BridgeResponse::err(e.to_string()))),
            }
        }
        None => Ok(Json(BridgeResponse::err("No browser is open"))),
    }
}

async fn handle_open(
    headers: axum::http::HeaderMap,
    AxumState(state): AxumState<BridgeState>,
    Json(req): Json<NavigateRequest>,
) -> Result<Json<BridgeResponse>, (StatusCode, String)> {
    check_auth(&headers, &state.token)?;

    // If a browser is already open, navigate it
    if let Ok(id) = resolve_browser_id(req.browser_id.as_deref(), &state.webviews) {
        let _ = browser::navigate(&id, &req.url, &state.webviews);
        return Ok(Json(BridgeResponse::success("Navigated existing browser")));
    }

    // Emit event to frontend to open the browser panel with this URL
    let _ = state.app.emit("browser-open", &req.url);
    Ok(Json(BridgeResponse::success("Browser panel opening with requested URL")))
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
        .route("/browser/eval", post(handle_eval))
        .route("/browser/console", post(handle_console))
        .route("/browser/html", post(handle_html))
        .route("/browser/wait", post(handle_wait))
        .route("/browser/screenshot", post(handle_screenshot))
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
