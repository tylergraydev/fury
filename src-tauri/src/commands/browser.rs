use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::error::AppError;
use crate::services::browser::{self, BrowserBounds};
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn create_browser(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<String, AppError> {
    let bounds = BrowserBounds {
        x,
        y,
        width,
        height,
    };
    let webviews = Arc::clone(&state.browser_webviews);
    browser::create_browser(&app, &url, &bounds, &webviews)
}

#[tauri::command]
#[specta::specta]
pub async fn navigate_browser(
    state: State<'_, AppState>,
    browser_id: String,
    url: String,
) -> Result<(), AppError> {
    let webviews = Arc::clone(&state.browser_webviews);
    browser::navigate(&browser_id, &url, &webviews)
}

#[tauri::command]
#[specta::specta]
pub async fn update_browser_bounds(
    state: State<'_, AppState>,
    browser_id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), AppError> {
    let bounds = BrowserBounds {
        x,
        y,
        width,
        height,
    };
    let webviews = Arc::clone(&state.browser_webviews);
    browser::update_bounds(&browser_id, &bounds, &webviews)
}

#[tauri::command]
#[specta::specta]
pub async fn show_browser(
    state: State<'_, AppState>,
    browser_id: String,
) -> Result<(), AppError> {
    let webviews = Arc::clone(&state.browser_webviews);
    browser::show(&browser_id, &webviews)
}

#[tauri::command]
#[specta::specta]
pub async fn hide_browser(
    state: State<'_, AppState>,
    browser_id: String,
) -> Result<(), AppError> {
    let webviews = Arc::clone(&state.browser_webviews);
    browser::hide(&browser_id, &webviews)
}

#[tauri::command]
#[specta::specta]
pub async fn close_browser(
    state: State<'_, AppState>,
    browser_id: String,
) -> Result<(), AppError> {
    let webviews = Arc::clone(&state.browser_webviews);
    browser::close(&browser_id, &webviews)
}

#[tauri::command]
#[specta::specta]
pub async fn eval_browser_js(
    state: State<'_, AppState>,
    browser_id: String,
    script: String,
) -> Result<(), AppError> {
    let webviews = Arc::clone(&state.browser_webviews);
    browser::eval_js(&browser_id, &script, &webviews)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::*;
    use tauri::Manager;

    #[tokio::test]
    async fn test_navigate_browser_nonexistent() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, AppState> = app.state();
        let result = navigate_browser(state, "nonexistent".into(), "http://localhost:3000".into()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_show_browser_nonexistent() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, AppState> = app.state();
        let result = show_browser(state, "nonexistent".into()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_hide_browser_nonexistent() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, AppState> = app.state();
        let result = hide_browser(state, "nonexistent".into()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_close_browser_nonexistent() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, AppState> = app.state();
        let result = close_browser(state, "nonexistent".into()).await;
        // Closing nonexistent is a no-op, not an error
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_eval_browser_js_nonexistent() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, AppState> = app.state();
        let result = eval_browser_js(state, "nonexistent".into(), "1+1".into()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_update_browser_bounds_nonexistent() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, AppState> = app.state();
        let result = update_browser_bounds(state, "nonexistent".into(), 0.0, 0.0, 100.0, 100.0).await;
        assert!(result.is_err());
    }
}
