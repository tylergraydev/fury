use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::webview::WebviewBuilder;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Webview, WebviewUrl};
use uuid::Uuid;

use crate::error::AppError;

/// Bounds for positioning the browser webview overlay.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BrowserBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// A console log entry captured from the browser.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ConsoleLogEntry {
    pub level: String,
    pub message: String,
    pub timestamp: f64,
}

/// Shared state for browser webviews.
pub type BrowserWebviews = Arc<Mutex<HashMap<String, Webview>>>;

/// The JavaScript bridge script injected into every page loaded in the browser webview.
/// Captures console logs and provides DOM interaction functions.
const BRIDGE_SCRIPT: &str = r#"
(function() {
    if (window.__fury) return;

    const MAX_LOGS = 1000;
    const logs = [];

    function pushLog(level, args) {
        if (logs.length >= MAX_LOGS) logs.shift();
        logs.push({
            level: level,
            message: Array.from(args).map(a => {
                try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
                catch { return String(a); }
            }).join(' '),
            timestamp: Date.now()
        });
    }

    const origConsole = {
        log: console.log.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        info: console.info.bind(console),
    };

    console.log = function() { origConsole.log.apply(console, arguments); pushLog('log', arguments); };
    console.warn = function() { origConsole.warn.apply(console, arguments); pushLog('warn', arguments); };
    console.error = function() { origConsole.error.apply(console, arguments); pushLog('error', arguments); };
    console.info = function() { origConsole.info.apply(console, arguments); pushLog('info', arguments); };

    // Capture uncaught errors
    window.addEventListener('error', function(e) {
        pushLog('error', ['Uncaught Error: ' + e.message + ' at ' + e.filename + ':' + e.lineno]);
    });
    window.addEventListener('unhandledrejection', function(e) {
        pushLog('error', ['Unhandled Promise Rejection: ' + e.reason]);
    });

    window.__fury = {
        getLogs: function(level) {
            if (!level || level === 'all') return JSON.stringify(logs);
            return JSON.stringify(logs.filter(l => l.level === level));
        },
        clearLogs: function() { logs.length = 0; },
        click: function(selector) {
            const el = document.querySelector(selector);
            if (!el) return JSON.stringify({ error: 'Element not found: ' + selector });
            el.click();
            return JSON.stringify({ ok: true });
        },
        type: function(selector, text) {
            const el = document.querySelector(selector);
            if (!el) return JSON.stringify({ error: 'Element not found: ' + selector });
            el.focus();
            el.value = text;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return JSON.stringify({ ok: true });
        },
        getText: function(selector) {
            const el = document.querySelector(selector);
            if (!el) return JSON.stringify({ error: 'Element not found: ' + selector });
            return JSON.stringify({ text: el.textContent });
        },
        getHTML: function(selector) {
            if (!selector) return JSON.stringify({ html: document.documentElement.outerHTML });
            const el = document.querySelector(selector);
            if (!el) return JSON.stringify({ error: 'Element not found: ' + selector });
            return JSON.stringify({ html: el.outerHTML });
        },
        waitFor: function(selector, timeoutMs) {
            return new Promise(function(resolve) {
                const deadline = Date.now() + (timeoutMs || 5000);
                function check() {
                    if (document.querySelector(selector)) return resolve(JSON.stringify({ ok: true }));
                    if (Date.now() > deadline) return resolve(JSON.stringify({ error: 'Timeout waiting for: ' + selector }));
                    requestAnimationFrame(check);
                }
                check();
            });
        }
    };
})();
"#;

/// Create a new browser webview overlaid on the main window.
pub fn create_browser(
    app: &AppHandle,
    url: &str,
    bounds: &BrowserBounds,
    webviews: &BrowserWebviews,
) -> Result<String, AppError> {
    let id = Uuid::new_v4().to_string();
    let label = format!("fury-browser-{}", &id[..8]);

    let window = app
        .get_window("main")
        .ok_or_else(|| AppError::InternalError("Main window not found".into()))?;

    let parsed_url: url::Url = url
        .parse()
        .map_err(|e| AppError::InternalError(format!("Invalid URL: {e}")))?;

    let builder = WebviewBuilder::new(&label, WebviewUrl::External(parsed_url))
        .initialization_script(BRIDGE_SCRIPT)
        .on_navigation(move |_url| true);

    let position = LogicalPosition::new(bounds.x, bounds.y);
    let size = LogicalSize::new(bounds.width, bounds.height);

    let webview = window
        .add_child(builder, position, size)
        .map_err(|e| AppError::InternalError(format!("Failed to create webview: {e}")))?;

    webviews.lock().unwrap().insert(id.clone(), webview);

    Ok(id)
}

/// Navigate the browser webview to a new URL.
pub fn navigate(webview_id: &str, url: &str, webviews: &BrowserWebviews) -> Result<(), AppError> {
    let webviews = webviews.lock().unwrap();
    let webview = webviews
        .get(webview_id)
        .ok_or_else(|| AppError::InternalError(format!("Browser not found: {webview_id}")))?;

    let parsed: url::Url = url
        .parse()
        .map_err(|e| AppError::InternalError(format!("Invalid URL: {e}")))?;

    webview
        .navigate(parsed)
        .map_err(|e| AppError::InternalError(format!("Navigation failed: {e}")))
}

/// Update the position and size of the browser webview.
pub fn update_bounds(
    webview_id: &str,
    bounds: &BrowserBounds,
    webviews: &BrowserWebviews,
) -> Result<(), AppError> {
    let webviews = webviews.lock().unwrap();
    let webview = webviews
        .get(webview_id)
        .ok_or_else(|| AppError::InternalError(format!("Browser not found: {webview_id}")))?;

    let _ = webview.set_position(tauri::LogicalPosition::new(bounds.x, bounds.y));
    let _ = webview.set_size(tauri::LogicalSize::new(bounds.width, bounds.height));
    Ok(())
}

/// Show the browser webview.
pub fn show(webview_id: &str, webviews: &BrowserWebviews) -> Result<(), AppError> {
    let webviews = webviews.lock().unwrap();
    let webview = webviews
        .get(webview_id)
        .ok_or_else(|| AppError::InternalError(format!("Browser not found: {webview_id}")))?;
    webview
        .show()
        .map_err(|e| AppError::InternalError(format!("Failed to show browser: {e}")))
}

/// Hide the browser webview.
pub fn hide(webview_id: &str, webviews: &BrowserWebviews) -> Result<(), AppError> {
    let webviews = webviews.lock().unwrap();
    let webview = webviews
        .get(webview_id)
        .ok_or_else(|| AppError::InternalError(format!("Browser not found: {webview_id}")))?;
    webview
        .hide()
        .map_err(|e| AppError::InternalError(format!("Failed to hide browser: {e}")))
}

/// Execute JavaScript in the browser webview.
pub fn eval_js(webview_id: &str, js: &str, webviews: &BrowserWebviews) -> Result<(), AppError> {
    let webviews = webviews.lock().unwrap();
    let webview = webviews
        .get(webview_id)
        .ok_or_else(|| AppError::InternalError(format!("Browser not found: {webview_id}")))?;
    webview
        .eval(js)
        .map_err(|e| AppError::InternalError(format!("JS eval failed: {e}")))
}

/// Close and destroy the browser webview.
pub fn close(webview_id: &str, webviews: &BrowserWebviews) -> Result<(), AppError> {
    let mut webviews = webviews.lock().unwrap();
    if let Some(webview) = webviews.remove(webview_id) {
        let _ = webview.close();
    }
    Ok(())
}

/// Close all browser webviews (used during app shutdown).
pub fn close_all(webviews: &BrowserWebviews) {
    let mut webviews = webviews.lock().unwrap();
    for (_, webview) in webviews.drain() {
        let _ = webview.close();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bridge_script_is_not_empty() {
        assert!(!BRIDGE_SCRIPT.is_empty());
        assert!(BRIDGE_SCRIPT.contains("__fury"));
    }

    #[test]
    fn test_browser_bounds_serialization() {
        let bounds = BrowserBounds {
            x: 100.0,
            y: 200.0,
            width: 800.0,
            height: 600.0,
        };
        let json = serde_json::to_string(&bounds).unwrap();
        assert!(json.contains("800"));
        let deserialized: BrowserBounds = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.width, 800.0);
    }

    #[test]
    fn test_console_log_entry_serialization() {
        let entry = ConsoleLogEntry {
            level: "error".to_string(),
            message: "test error".to_string(),
            timestamp: 1234567890.0,
        };
        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("error"));
        assert!(json.contains("test error"));
    }

    #[test]
    fn test_close_nonexistent_webview() {
        let webviews: BrowserWebviews = Arc::new(Mutex::new(HashMap::new()));
        let result = close("nonexistent", &webviews);
        assert!(result.is_ok());
    }

    #[test]
    fn test_close_all_empty() {
        let webviews: BrowserWebviews = Arc::new(Mutex::new(HashMap::new()));
        close_all(&webviews);
        assert!(webviews.lock().unwrap().is_empty());
    }

    #[test]
    fn test_navigate_nonexistent_webview() {
        let webviews: BrowserWebviews = Arc::new(Mutex::new(HashMap::new()));
        let result = navigate("nonexistent", "http://localhost:3000", &webviews);
        assert!(result.is_err());
    }

    #[test]
    fn test_show_nonexistent_webview() {
        let webviews: BrowserWebviews = Arc::new(Mutex::new(HashMap::new()));
        let result = show("nonexistent", &webviews);
        assert!(result.is_err());
    }

    #[test]
    fn test_hide_nonexistent_webview() {
        let webviews: BrowserWebviews = Arc::new(Mutex::new(HashMap::new()));
        let result = hide("nonexistent", &webviews);
        assert!(result.is_err());
    }

    #[test]
    fn test_eval_js_nonexistent_webview() {
        let webviews: BrowserWebviews = Arc::new(Mutex::new(HashMap::new()));
        let result = eval_js("nonexistent", "1+1", &webviews);
        assert!(result.is_err());
    }

    #[test]
    fn test_update_bounds_nonexistent_webview() {
        let webviews: BrowserWebviews = Arc::new(Mutex::new(HashMap::new()));
        let bounds = BrowserBounds {
            x: 0.0,
            y: 0.0,
            width: 100.0,
            height: 100.0,
        };
        let result = update_bounds("nonexistent", &bounds, &webviews);
        assert!(result.is_err());
    }
}
