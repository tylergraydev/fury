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
            // Checkpoint commands
            commands::checkpoint::list_checkpoints,
            commands::checkpoint::revert_to_checkpoint,
            // Git/diff commands
            commands::git::get_diff,
            commands::git::get_file_diff,
            // Script commands
            commands::script::run_script,
            commands::script::stop_script,
            commands::script::get_repo_settings,
            commands::script::update_repo_settings,
            // Terminal commands
            commands::terminal::create_terminal,
            commands::terminal::write_terminal,
            commands::terminal::resize_terminal,
            commands::terminal::close_terminal,
            // PR commands
            commands::pr::create_pr,
            commands::pr::get_pr_info,
            commands::pr::get_pr_checks,
            commands::pr::push_changes,
            commands::pr::fix_failing_checks,
            commands::pr::merge_pr,
            // Todo commands
            commands::todo::add_todo,
            commands::todo::update_todo,
            commands::todo::delete_todo,
            commands::todo::list_todos,
            commands::todo::toggle_todo,
            commands::todo::reorder_todos,
            commands::todo::get_todo_summary,
            // Slash command commands
            commands::slash_command::list_slash_commands,
            commands::slash_command::get_slash_command_content,
            // MCP + Settings commands
            commands::mcp::list_mcp_servers,
            commands::mcp::add_mcp_server,
            commands::mcp::remove_mcp_server,
            commands::mcp::detect_cursor_config,
            commands::mcp::import_cursor_config,
            commands::mcp::get_app_settings,
            commands::mcp::update_app_settings,
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

                    // Restore app settings from database
                    if let Ok(settings) = database.get_app_settings() {
                        *state.settings.lock().unwrap() = settings;
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
