use crate::error::AppError;
use crate::services::mempalace::{self, MemPalaceStatus};
use crate::state::AppState;
use tauri::State;

/// Get the current status of the MemPalace integration.
#[tauri::command]
#[specta::specta]
pub async fn check_mempalace_status(
    state: State<'_, AppState>,
) -> Result<MemPalaceStatus, AppError> {
    let settings = state.settings.read().unwrap().clone();
    Ok(mempalace::get_status(
        settings.mempalace.python_command.as_deref(),
        settings.mempalace.palace_path.as_deref(),
    )
    .await)
}

/// Initialize a MemPalace palace directory.
#[tauri::command]
#[specta::specta]
pub async fn initialize_mempalace_palace(
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let settings = state.settings.read().unwrap().clone();
    let python_cmd = mempalace::detect_python(settings.mempalace.python_command.as_deref())
        .await
        .ok_or_else(|| AppError::AgentError("Python not found".to_string()))?;
    let palace_path = mempalace::resolve_palace_path(settings.mempalace.palace_path.as_deref());
    mempalace::initialize_palace(&python_cmd, &palace_path).await
}

/// Install mempalace via pipx, uv, or pip.
#[tauri::command]
#[specta::specta]
pub async fn install_mempalace_package(
    state: State<'_, AppState>,
) -> Result<String, AppError> {
    let settings = state.settings.read().unwrap().clone();
    let python_cmd = mempalace::detect_python(settings.mempalace.python_command.as_deref())
        .await
        .ok_or_else(|| AppError::AgentError("Python not found".to_string()))?;
    mempalace::install_mempalace(&python_cmd).await
}

/// Migrate existing SQLite memory snapshots to MemPalace drawers.
/// No-op if already migrated.
#[tauri::command]
#[specta::specta]
pub async fn migrate_memory_to_mempalace(
    state: State<'_, AppState>,
) -> Result<u32, AppError> {
    // Check if already migrated
    let already_migrated = state
        .with_db(|db| Ok(db.is_mempalace_migrated()))
        .await?;
    if already_migrated {
        return Ok(0);
    }

    let settings = state.settings.read().unwrap().clone();
    let python_cmd = mempalace::detect_python(settings.mempalace.python_command.as_deref())
        .await
        .ok_or_else(|| AppError::AgentError("Python not found".to_string()))?;

    if mempalace::detect_mempalace(&python_cmd).await.is_none() {
        return Err(AppError::AgentError("MemPalace not installed".to_string()));
    }

    let palace_path = mempalace::resolve_palace_path(settings.mempalace.palace_path.as_deref());

    // Read all snapshots from SQLite
    let snapshots = state
        .with_db(|db| db.get_all_memory_snapshots())
        .await?;

    if snapshots.is_empty() {
        state.with_db(|db| db.set_mempalace_migrated()).await?;
        return Ok(0);
    }

    // Convert snapshots to MemPalace sync entries
    let entries: Vec<mempalace::MemPalaceSyncEntry> = snapshots
        .iter()
        .map(|snap| {
            let repo_name = snap.scope_id.clone().unwrap_or_default();
            mempalace::MemPalaceSyncEntry {
                content: snap.content.clone(),
                category: snap.category.clone(),
                repo_name,
                file_paths: vec![],
            }
        })
        .collect();

    let count = entries.len();
    mempalace::sync_observations_to_mempalace(&python_cmd, &palace_path, entries).await?;

    // Mark migration as complete
    state.with_db(|db| db.set_mempalace_migrated()).await?;

    Ok(count as u32)
}
