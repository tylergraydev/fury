mod commands;
mod db;
mod error;
mod models;
mod platform;
mod services;
mod state;

#[cfg(test)]
mod test_helpers;

use std::sync::Arc;
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            // Repository commands
            commands::repository::add_repository,
            commands::repository::remove_repository,
            commands::repository::list_repositories,
            commands::repository::list_branches,
            commands::repository::clone_repository,
            commands::repository::init_repository,
            // Workspace commands
            commands::workspace::create_workspace,
            commands::workspace::list_workspaces,
            commands::workspace::archive_workspace,
            commands::workspace::delete_workspace,
            commands::workspace::update_sparse_dirs,
            commands::workspace::link_workspaces,
            commands::workspace::unlink_workspaces,
            commands::workspace::get_linked_workspaces,
            commands::workspace::start_spotlight,
            commands::workspace::stop_spotlight,
            commands::workspace::list_archived_workspaces,
            commands::workspace::restore_workspace,
            commands::workspace::update_workspace_notes,
            commands::workspace::rename_workspace,
            commands::workspace::set_workspace_pinned,
            // Agent commands
            commands::agent::send_message,
            commands::agent::stop_agent,
            commands::agent::get_agent_status,
            commands::agent::clear_session,
            commands::agent::respond_to_permission,
            // Chat commands
            commands::chat::save_chat_message,
            commands::chat::list_chat_messages,
            commands::chat::clear_chat_messages,
            // Checkpoint commands
            commands::checkpoint::list_checkpoints,
            commands::checkpoint::revert_to_checkpoint,
            // Git/diff commands
            commands::git::get_diff,
            commands::git::get_file_diff,
            commands::git::get_git_log,
            commands::git::list_repo_directories,
            commands::git::list_workspace_files,
            commands::git::list_repo_files,
            commands::git::get_repo_diff,
            commands::git::get_repo_file_diff,
            commands::git::read_workspace_file,
            commands::git::read_repo_file,
            commands::git::write_workspace_file,
            commands::git::write_repo_file,
            commands::git::load_type_definitions,
            commands::git::read_file_base64,
            // Merge/branch commands
            commands::merge::get_branch_status,
            commands::merge::fetch_upstream,
            commands::merge::pull_rebase,
            commands::merge::pull_merge,
            commands::merge::get_conflicted_files,
            commands::merge::get_conflict_content,
            commands::merge::resolve_conflict,
            commands::merge::abort_merge_cmd,
            commands::merge::continue_merge,
            commands::merge::cross_worktree_diff,
            commands::merge::get_cross_worktree_file_diff,
            commands::merge::push_workspace,
            // Script commands
            commands::script::run_script,
            commands::script::stop_script,
            commands::script::run_repo_script,
            commands::script::stop_repo_script,
            commands::script::get_repo_settings,
            commands::script::update_repo_settings,
            // Terminal commands
            commands::terminal::create_terminal,
            commands::terminal::write_terminal,
            commands::terminal::resize_terminal,
            commands::terminal::close_terminal,
            commands::terminal::create_repo_terminal,
            // PR commands
            commands::pr::create_pr,
            commands::pr::get_pr_info,
            commands::pr::get_pr_checks,
            commands::pr::push_changes,
            commands::pr::fix_failing_checks,
            commands::pr::merge_pr,
            commands::pr::get_pr_reviews,
            commands::pr::get_pr_review_comments,
            commands::pr::list_repo_prs,
            commands::pr::list_repo_issues,
            commands::pr::get_pr_details,
            commands::pr::get_issue_details,
            commands::pr::get_workflow_runs,
            commands::pr::get_run_jobs,
            commands::pr::get_run_logs,
            commands::pr::rerun_workflow,
            // Linear commands
            commands::linear::search_linear_issues,
            commands::linear::link_issue_to_workspace,
            commands::linear::unlink_issue_from_workspace,
            commands::linear::get_workspace_issues,
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
            // Copilot commands
            commands::copilot::start_copilot,
            commands::copilot::stop_copilot,
            commands::copilot::copilot_sign_in,
            commands::copilot::copilot_check_status,
            commands::copilot::copilot_did_open,
            commands::copilot::copilot_did_change,
            commands::copilot::copilot_did_close,
            commands::copilot::copilot_complete,
            // Claude Context commands
            commands::claude_context::index_repository,
            commands::claude_context::get_indexing_status,
            commands::claude_context::list_indexing_statuses,
            // MCP + Settings commands
            commands::mcp::list_mcp_servers,
            commands::mcp::add_mcp_server,
            commands::mcp::remove_mcp_server,
            commands::mcp::detect_cursor_config,
            commands::mcp::import_cursor_config,
            commands::mcp::get_app_settings,
            commands::mcp::update_app_settings,
            commands::mcp::detect_cursorrules,
            commands::mcp::import_cursorrules,
            // Performance monitor commands
            commands::perf::push_ipc_metrics,
            commands::perf::push_frame_metrics,
            commands::perf::push_agent_turn_metric,
            commands::perf::push_stream_events,
            commands::perf::toggle_perf_monitor,
            commands::perf::get_perf_status,
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

            // Start performance monitor HTTP server
            let perf_metrics = Arc::clone(&app.state::<AppState>().perf_metrics);
            tauri::async_runtime::spawn(services::perf_server::start_perf_server(perf_metrics));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
