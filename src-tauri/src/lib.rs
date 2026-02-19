mod commands;
mod db;
mod error;
mod models;
mod platform;
mod services;
mod state;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            // Repository commands
            commands::repository::add_repository,
            commands::repository::remove_repository,
            commands::repository::list_repositories,
            commands::repository::list_branches,
            // Workspace commands
            commands::workspace::create_workspace,
            commands::workspace::list_workspaces,
            commands::workspace::archive_workspace,
            commands::workspace::delete_workspace,
            // Agent commands
            commands::agent::send_message,
            commands::agent::stop_agent,
            commands::agent::get_agent_status,
            commands::agent::clear_session,
        ])
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| platform::app_data_dir());

            // Initialize database
            match db::Database::init(&app_data_dir) {
                Ok(database) => {
                    let state = app.state::<AppState>();

                    // Restore repositories from database
                    if let Ok(repos) = database.list_repositories() {
                        let mut repo_map = state.repositories.lock().unwrap();
                        for repo in repos {
                            repo_map.insert(repo.id, repo);
                        }
                    }

                    // Restore workspaces from database
                    if let Ok(workspaces) = database.list_workspaces() {
                        let mut ws_map = state.workspaces.lock().unwrap();
                        for ws in workspaces {
                            ws_map.insert(ws.id, ws);
                        }
                    }

                    *state.db.lock().unwrap() = Some(database);
                }
                Err(e) => {
                    eprintln!("Failed to initialize database: {}", e);
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
