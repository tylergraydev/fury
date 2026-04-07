// Several legacy service modules (branch, checkpoint, copilot_lsp,
// cursor_migration, script_runner, slash_commands, terminal, worktree)
// have a `#[cfg(test)] mod tests` block in the middle of the file with
// additional helper items afterwards. clippy 1.94 flags this pattern;
// rearranging each file is out of scope for the security/reliability pass.
#![allow(clippy::items_after_test_module)]

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

/// Build the tauri-specta binding generator / invoke handler.
///
/// In debug builds this also writes `src/lib/tauri/bindings.generated.ts`
/// so TypeScript types stay in sync with Rust automatically.
fn specta_builder() -> tauri_specta::Builder {
    let builder = tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![
            // Repository commands
            commands::repository::add_repository,
            commands::repository::remove_repository,
            commands::repository::list_repositories,
            commands::repository::list_branches,
            commands::repository::clone_repository,
            commands::repository::init_repository,
            // Workspace commands
            commands::workspace::create_workspace,
            commands::workspace::extract_changes_to_workspace,
            commands::workspace::list_workspaces,
            commands::workspace::archive_workspace,
            commands::workspace::delete_workspace,
            commands::workspace::list_archived_workspaces,
            commands::workspace::restore_workspace,
            // Workspace config commands
            commands::workspace_config::update_sparse_dirs,
            commands::workspace_config::update_workspace_notes,
            commands::workspace_config::rename_workspace,
            commands::workspace_config::set_workspace_pinned,
            // Workspace links commands
            commands::workspace_links::link_workspaces,
            commands::workspace_links::unlink_workspaces,
            commands::workspace_links::get_linked_workspaces,
            commands::workspace_links::start_spotlight,
            commands::workspace_links::stop_spotlight,
            // Agent commands
            commands::agent::send_message,
            commands::agent::respond_to_permission,
            commands::agent::get_pending_permission,
            commands::agent::send_followup_message,
            // Agent lifecycle commands
            commands::agent_lifecycle::stop_agent,
            commands::agent_lifecycle::get_agent_status,
            commands::agent_lifecycle::clear_session,
            // Chat commands
            commands::chat::save_chat_message,
            commands::chat::list_chat_messages,
            commands::chat::clear_chat_messages,
            commands::chat::search_chat_messages,
            // Checkpoint commands
            commands::checkpoint::list_checkpoints,
            commands::checkpoint::revert_to_checkpoint,
            // Git/diff commands
            commands::git_diff::get_diff,
            commands::git_diff::get_file_diff,
            commands::git_diff::get_git_log,
            commands::git_diff::get_repo_diff,
            commands::git_diff::get_repo_file_diff,
            commands::git_diff::get_file_patch,
            commands::git_diff::get_repo_file_patch,
            // File viewer commands
            commands::file_viewer::list_repo_directories,
            commands::file_viewer::list_workspace_files,
            commands::file_viewer::list_repo_files,
            commands::file_viewer::init_workspace_git,
            commands::file_viewer::read_workspace_file,
            commands::file_viewer::read_repo_file,
            commands::file_viewer::load_type_definitions,
            // File editor commands
            commands::file_editor::write_workspace_file,
            commands::file_editor::write_repo_file,
            commands::file_editor::read_file_base64,
            commands::file_editor::save_clipboard_image,
            // Diff watcher commands
            commands::diff_watcher::start_diff_watcher,
            commands::diff_watcher::stop_diff_watcher,
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
            // Stash commands
            commands::stash::list_stashes,
            commands::stash::create_stash,
            commands::stash::apply_stash,
            commands::stash::pop_stash,
            commands::stash::drop_stash,
            commands::stash::show_stash,
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
            // PR commands (core)
            commands::pr::create_pr,
            commands::pr::get_pr_info,
            commands::pr::get_pr_checks,
            commands::pr::push_changes,
            commands::pr::fix_failing_checks,
            commands::pr::merge_pr,
            // PR AI review commands
            commands::pr_review_ai::get_pr_diff,
            commands::pr_review_ai::submit_ai_review,
            // PR review commands
            commands::pr_reviews::get_pr_reviews,
            commands::pr_reviews::get_pr_review_comments,
            commands::pr_reviews::get_pr_full_data,
            commands::pr_reviews::get_reviews_and_comments,
            // PR issue commands
            commands::pr_issues::list_repo_prs,
            commands::pr_issues::list_repo_issues,
            commands::pr_issues::get_pr_details,
            commands::pr_issues::get_issue_details,
            // PR workflow commands
            commands::pr_workflows::get_workflow_runs,
            commands::pr_workflows::get_run_jobs,
            commands::pr_workflows::get_run_logs,
            commands::pr_workflows::rerun_workflow,
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
            commands::copilot::copilot_notify_accepted,
            commands::copilot::copilot_notify_rejected,
            // Claude Context commands
            commands::claude_context::index_repository,
            commands::claude_context::get_indexing_status,
            commands::claude_context::list_indexing_statuses,
            // Codebase search commands
            commands::codebase_search::search_codebase,
            commands::codebase_search::search_symbols,
            commands::codebase_search::start_codebase_indexing,
            commands::codebase_search::stop_codebase_indexing,
            commands::codebase_search::delete_codebase_index,
            commands::codebase_search::get_codebase_index_stats,
            // Claude permission commands
            commands::claude_permissions::get_claude_permissions,
            commands::claude_permissions::add_claude_permissions,
            commands::claude_permissions::remove_claude_permissions,
            // MCP + Settings commands
            commands::mcp::list_mcp_servers,
            commands::mcp::add_mcp_server,
            commands::mcp::remove_mcp_server,
            commands::mcp::detect_cursor_config,
            commands::mcp::import_cursor_config,
            commands::mcp::get_app_settings,
            commands::mcp::update_app_settings,
            commands::mcp::get_last_active_context,
            commands::mcp::save_last_active_context,
            commands::mcp::detect_cursorrules,
            commands::mcp::import_cursorrules,
            // LSP Plugin commands
            commands::lsp::get_lsp_catalog,
            commands::lsp::list_lsp_plugins,
            commands::lsp::install_lsp_plugin,
            commands::lsp::uninstall_lsp_plugin,
            commands::lsp::detect_lsp_suggestions,
            // Bookmark commands
            commands::bookmark::create_bookmark,
            commands::bookmark::list_bookmarks,
            commands::bookmark::update_bookmark,
            commands::bookmark::delete_bookmark,
            commands::bookmark::toggle_bookmark,
            // Workspace template commands
            commands::workspace_template::create_workspace_template,
            commands::workspace_template::list_workspace_templates,
            commands::workspace_template::update_workspace_template,
            commands::workspace_template::delete_workspace_template,
            // Prompt library commands
            commands::prompt::create_prompt,
            commands::prompt::list_prompts,
            commands::prompt::update_prompt,
            commands::prompt::delete_prompt,
            // Snippet manager commands
            commands::snippet::create_snippet,
            commands::snippet::list_snippets,
            commands::snippet::update_snippet,
            commands::snippet::delete_snippet,
            // Notepad commands
            commands::notepad::create_notepad,
            commands::notepad::list_notepads,
            commands::notepad::get_notepad,
            commands::notepad::update_notepad,
            commands::notepad::delete_notepad,
            // Test runner commands
            commands::test_runner::detect_test_framework,
            commands::test_runner::get_test_runner_config,
            commands::test_runner::save_test_runner_config,
            commands::test_runner::run_tests,
            commands::test_runner::stop_tests,
            commands::test_runner::start_test_watch,
            commands::test_runner::stop_test_watch,
            commands::test_runner::list_test_history,
            commands::test_runner::run_coverage,
            // Performance monitor commands
            commands::perf::push_ipc_metrics,
            commands::perf::push_frame_metrics,
            commands::perf::push_agent_turn_metric,
            commands::perf::push_stream_events,
            commands::perf::toggle_perf_monitor,
            commands::perf::get_perf_status,
            // Usage commands
            commands::usage::get_usage_data,
            // Export commands
            commands::export::export_workspace,
            // Dev container commands
            commands::devcontainer::start_container,
            commands::devcontainer::stop_container,
            commands::devcontainer::rebuild_container,
            commands::devcontainer::get_container_status,
            commands::devcontainer::update_devcontainer_config,
            commands::devcontainer::detect_devcontainer,
            // Containerize commands
            commands::containerize::containerize_repo,
            commands::containerize::apply_devcontainer_config,
            // Browser commands
            commands::browser::create_browser,
            commands::browser::navigate_browser,
            commands::browser::update_browser_bounds,
            commands::browser::show_browser,
            commands::browser::hide_browser,
            commands::browser::close_browser,
            commands::browser::eval_browser_js,
            // URL fetch commands
            commands::url_fetch::fetch_url_content,
            // Web search commands
            commands::web_search::web_search,
            // Diagnostics commands
            commands::diagnostics::run_lint,
            // Docs commands
            commands::docs::resolve_library_id,
            commands::docs::query_library_docs,
            // Inline edit commands
            commands::inline_edit::inline_edit,
            commands::inline_edit::cancel_inline_edit,
        ]);

    builder
}

/// Export the generated TypeScript bindings to disk.
/// Called from a `cargo test` integration test AND during `tauri dev` startup.
#[cfg(debug_assertions)]
pub fn export_bindings() {
    let builder = specta_builder();
    builder
        .export(
            specta_typescript::Typescript::default()
                .bigint(specta_typescript::BigIntExportBehavior::Number)
                .header("/* eslint-disable */\n// @ts-nocheck\n// Auto-generated by tauri-specta. DO NOT EDIT.\n// Run `cargo test export_specta_bindings` to regenerate.\n"),
            "../src/lib/tauri/bindings.generated.ts",
        )
        .expect("Failed to export specta bindings");
}

/// Initialize the AppState from the database at the given data directory.
/// Restores repositories, workspaces, and settings from persistent storage.
pub(crate) fn initialize_state_from_db(
    state: &AppState,
    app_data_dir: &std::path::Path,
) -> Result<(), String> {
    match db::Database::init(app_data_dir) {
        Ok(database) => {
            if let Ok(repos) = database.list_repositories() {
                let mut repo_map = state.repositories.write().unwrap();
                for repo in repos {
                    repo_map.insert(repo.id, repo);
                }
            }
            if let Ok(workspaces) = database.list_workspaces() {
                let mut ws_map = state.workspaces.write().unwrap();
                for ws in workspaces {
                    ws_map.insert(ws.id, ws);
                }
            }
            if let Ok(settings) = database.get_app_settings() {
                *state.settings.write().unwrap() = settings;
            }
            *state.db.lock().unwrap() = Some(database);
            Ok(())
        }
        Err(e) => Err(format!("Failed to initialize database: {}", e)),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let specta = specta_builder();

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build());

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(tauri_plugin_mcp_bridge::init());
    }

    builder
        .manage(AppState::new())
        .invoke_handler(specta.invoke_handler())
        .setup(move |app| {
            specta.mount_events(app);

            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| platform::app_data_dir());

            // Initialize database and restore state
            let state = app.state::<AppState>();
            if let Err(e) = initialize_state_from_db(&state, &app_data_dir) {
                eprintln!("{}", e);
            }

            // Start performance monitor HTTP server
            let perf_metrics = Arc::clone(&app.state::<AppState>().perf_metrics);
            tauri::async_runtime::spawn(services::perf_server::start_perf_server(perf_metrics));

            // Start browser bridge HTTP server and register MCP server
            {
                let state = app.state::<AppState>();
                let port = {
                    let mut allocator = state.port_allocator.lock().unwrap();
                    allocator.allocate().unwrap_or(9747)
                };
                let token: String = uuid::Uuid::new_v4().to_string();
                let browser_webviews = Arc::clone(&state.browser_webviews);

                // Note: we deliberately do NOT put the port/token into the
                // process environment. Every child process Fury spawns
                // (agents, terminals, devcontainers, test runners, scripts)
                // would otherwise inherit them and gain full eval power over
                // the embedded browser. The MCP sidecar receives them as
                // explicit CLI args below.
                let token_clone = token.clone();
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(
                    services::browser_bridge::start_bridge_server(browser_webviews, token, port, app_handle),
                );

                // Register the browser MCP server with Claude Code in the background
                let resource_dir = app.path().resource_dir().ok();
                tauri::async_runtime::spawn_blocking(move || {
                    // Dev path: relative to Cargo manifest directory
                    let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                        .join("sidecar")
                        .join("dist")
                        .join("fury-browser-mcp.mjs");
                    let mcp_path = if dev_path.exists() {
                        dev_path.to_string_lossy().to_string()
                    } else {
                        // Production: resource directory
                        resource_dir
                            .map(|d| d.join("fury-browser-mcp.mjs"))
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string()
                    };

                    // Remove any stale registration from a previous crash
                    let _ = services::mcp::remove_mcp_server(
                        "fury-browser",
                        &models::mcp::McpScope::User,
                    );

                    // Register with fresh port and token
                    let args = vec![
                        mcp_path,
                        "--port".to_string(),
                        port.to_string(),
                        "--token".to_string(),
                        token_clone,
                    ];
                    if let Err(e) = services::mcp::add_mcp_server(
                        "fury-browser",
                        "node",
                        &args,
                        &std::collections::HashMap::new(),
                        &models::mcp::McpScope::User,
                    ) {
                        eprintln!("[browser-mcp] Failed to register MCP server: {}", e);
                    } else {
                        eprintln!("[browser-mcp] Registered fury-browser MCP server on port {}", port);
                    }
                });
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                let state = app.state::<AppState>();

                // Kill all agent child processes
                {
                    let mut processes = state.agent_processes.lock().unwrap();
                    for (_, mut child) in processes.drain() {
                        let _ = child.start_kill();
                    }
                }

                // Drop persistent agent handles and stdins
                state.persistent_agents.lock().unwrap().clear();
                state.agent_stdins.lock().unwrap().clear();

                // Kill all running scripts
                {
                    let mut pids = state.script_pids.lock().unwrap();
                    for (_, pid) in pids.drain() {
                        let _ = platform::kill_process_group(pid);
                    }
                }

                // Close all terminal sessions
                {
                    let mut sessions = state.terminal_sessions.lock().unwrap();
                    for (_, mut session) in sessions.drain() {
                        let _ = session.child.kill();
                    }
                }

                // Stop copilot LSP
                {
                    let mut copilot = state.copilot.lock().unwrap();
                    if let Some((_, mut child)) = copilot.take() {
                        let _ = child.start_kill();
                    }
                }

                // Stop sidecar. `agent_sidecar` is a `tokio::sync::Mutex`, so
                // we need an async context to acquire it. A bare `try_lock`
                // (the previous implementation) would fail and leak the node
                // child whenever an in-flight `send_command` was holding the
                // lock. Use `block_on` on the Tauri async runtime handle so
                // we actually wait for the lock with a short timeout.
                {
                    let sidecar_arc = Arc::clone(&state.agent_sidecar);
                    tauri::async_runtime::block_on(async move {
                        // Cap the wait so we never block shutdown forever.
                        let acquire =
                            tokio::time::timeout(std::time::Duration::from_secs(2), sidecar_arc.lock());
                        match acquire.await {
                            Ok(mut sidecar) => {
                                if let Some(mut handle) = sidecar.take() {
                                    let _ = handle.child.start_kill();
                                }
                            }
                            Err(_) => {
                                eprintln!(
                                    "[shutdown] Could not acquire agent_sidecar lock within 2s — sidecar may leak"
                                );
                            }
                        }
                    });
                }

                // Kill test processes
                {
                    let mut processes = state.test_processes.lock().unwrap();
                    for (_, pid) in processes.drain() {
                        let _ = platform::kill_process_group(pid);
                    }
                }

                // Close all browser webviews
                services::browser::close_all(&state.browser_webviews);

                // Remove browser MCP server registration
                let _ = services::mcp::remove_mcp_server(
                    "fury-browser",
                    &models::mcp::McpScope::User,
                );
            }
        });
}

#[cfg(test)]
mod specta_tests {
    #[test]
    fn export_specta_bindings() {
        super::export_bindings();
    }
}

#[cfg(test)]
mod init_tests {
    use super::*;

    #[test]
    fn test_initialize_state_from_db_creates_db() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::new();
        let result = initialize_state_from_db(&state, dir.path());
        assert!(result.is_ok(), "init failed: {:?}", result.err());
        assert!(state.db.lock().unwrap().is_some());
    }

    #[test]
    fn test_initialize_state_from_db_restores_repos() {
        let dir = tempfile::tempdir().unwrap();
        // Pre-populate DB with a repo
        {
            let db = db::Database::init(dir.path()).unwrap();
            let repo = test_helpers::test_repo();
            db.insert_repository(&repo).unwrap();
        }
        let state = AppState::new();
        initialize_state_from_db(&state, dir.path()).unwrap();
        assert_eq!(state.repositories.read().unwrap().len(), 1);
    }

    #[test]
    fn test_initialize_state_from_db_restores_workspaces() {
        let dir = tempfile::tempdir().unwrap();
        {
            let db = db::Database::init(dir.path()).unwrap();
            let repo = test_helpers::test_repo();
            db.insert_repository(&repo).unwrap();
            let ws = test_helpers::test_workspace(repo.id);
            db.insert_workspace(&ws).unwrap();
        }
        let state = AppState::new();
        initialize_state_from_db(&state, dir.path()).unwrap();
        assert_eq!(state.workspaces.read().unwrap().len(), 1);
    }

    #[test]
    fn test_initialize_state_from_db_restores_settings() {
        let dir = tempfile::tempdir().unwrap();
        {
            let db = db::Database::init(dir.path()).unwrap();
            let settings = models::settings::AppSettings {
                analytics_enabled: true,
                ..models::settings::AppSettings::default()
            };
            db.save_app_settings(&settings).unwrap();
        }
        let state = AppState::new();
        initialize_state_from_db(&state, dir.path()).unwrap();
        assert!(state.settings.read().unwrap().analytics_enabled);
    }
}
