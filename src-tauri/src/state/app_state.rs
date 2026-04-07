use crate::db::Database;
use crate::models::agent::{AgentInfo, FrontendStreamEvent};
use crate::models::devcontainer::ContainerState;
use crate::models::mcp::IndexingStatus;
use crate::models::repository::Repository;
use crate::models::settings::AppSettings;
use crate::models::workspace::Workspace;
use crate::services::claude_process::SidecarHandle;
use crate::services::browser::BrowserWebviews;
use crate::services::codebase_index::CodebaseIndex;
use crate::services::copilot_lsp::CopilotLspHandle;
use crate::services::diff_watcher::DiffWatcherHandle;
use crate::services::perf_server::PerfMetrics;
use crate::services::port_allocator::PortAllocator;
use crate::services::spotlight::SpotlightHandle;
use crate::services::terminal::TerminalSession;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};
use tokio::process::{Child, ChildStdin};
use uuid::Uuid;

/// Handle for a persistent Claude Code process, storing spawn-time configuration.
#[allow(dead_code)]
pub struct PersistentAgentHandle {
    pub stdin: ChildStdin,
    pub disable_thinking: bool,
    pub disable_plan_mode: bool,
}

pub struct AppState {
    pub repositories: RwLock<HashMap<Uuid, Repository>>,
    pub workspaces: RwLock<HashMap<Uuid, Workspace>>,
    pub settings: RwLock<AppSettings>,
    pub port_allocator: Mutex<PortAllocator>,
    pub db: Arc<Mutex<Option<Database>>>,
    /// Agent metadata — Arc-wrapped so async tasks can hold a reference
    pub agents: Arc<Mutex<HashMap<Uuid, AgentInfo>>>,
    /// Agent process handles — Arc-wrapped so async tasks can hold a reference
    pub agent_processes: Arc<Mutex<HashMap<Uuid, Child>>>,
    /// Script process PIDs — keyed by "{workspace_id}:{kind}" or "repo:{repo_id}:{kind}".
    /// The background task owns the Child for `.wait()` while this map stores the PID
    /// so stop_script can kill by PID without racing.
    pub script_pids: Arc<Mutex<HashMap<String, u32>>>,
    /// Terminal PTY sessions — keyed by terminal session ID
    pub terminal_sessions: Arc<Mutex<HashMap<Uuid, TerminalSession>>>,
    /// Spotlight file watchers — keyed by workspace ID
    pub spotlight_watchers: Arc<Mutex<HashMap<Uuid, SpotlightHandle>>>,
    /// Diff file watchers — keyed by workspace/repo ID
    pub diff_watchers: Arc<Mutex<HashMap<Uuid, DiffWatcherHandle>>>,
    /// Persistent agent handles — for Performance Mode (kept alive between turns)
    pub persistent_agents: Arc<Mutex<HashMap<Uuid, PersistentAgentHandle>>>,
    /// Agent stdin handles — for Safe Mode permission responses (all spawn modes)
    pub agent_stdins: Arc<Mutex<HashMap<Uuid, ChildStdin>>>,
    /// Copilot Language Server — global singleton (handle + child process)
    pub copilot: Arc<Mutex<Option<(CopilotLspHandle, Child)>>>,
    /// Performance metrics — shared with the HTTP perf server
    pub perf_metrics: Arc<Mutex<PerfMetrics>>,
    /// Claude Context indexing status per repo — keyed by repo UUID
    pub indexing_status: Arc<Mutex<HashMap<Uuid, IndexingStatus>>>,
    /// Test runner process PIDs — keyed by "test:{context_id}"
    pub test_processes: Arc<Mutex<HashMap<String, u32>>>,
    /// Test watch mode file watchers — keyed by context_id string
    pub test_watchers: Arc<Mutex<HashMap<String, DiffWatcherHandle>>>,
    /// Dev container runtime state — keyed by workspace UUID
    pub container_states: Arc<Mutex<HashMap<Uuid, ContainerState>>>,
    /// Claude Agent SDK sidecar process handle (singleton, shared across workspaces).
    /// Uses tokio::sync::Mutex so the lock can be held across async send_command calls,
    /// eliminating the take/use/replace race condition.
    pub agent_sidecar: Arc<tokio::sync::Mutex<Option<SidecarHandle>>>,
    /// Pending permission requests per workspace — stored so they can be
    /// re-emitted when the frontend resubscribes (e.g. after HMR).
    pub pending_permissions: Arc<Mutex<HashMap<Uuid, FrontendStreamEvent>>>,
    /// Codebase search indexes — keyed by repo UUID
    pub codebase_indexes: Arc<Mutex<HashMap<Uuid, CodebaseIndex>>>,
    /// Browser webviews — keyed by browser session ID
    pub browser_webviews: BrowserWebviews,
}

impl Drop for AppState {
    fn drop(&mut self) {
        // Kill all agent child processes
        if let Ok(mut processes) = self.agent_processes.lock() {
            for (_, mut child) in processes.drain() {
                let _ = child.start_kill();
            }
        }

        // Drop persistent agent handles and stdins
        if let Ok(mut p) = self.persistent_agents.lock() { p.clear(); }
        if let Ok(mut s) = self.agent_stdins.lock() { s.clear(); }

        // Kill all running scripts
        if let Ok(mut pids) = self.script_pids.lock() {
            for (_, pid) in pids.drain() {
                let _ = crate::platform::kill_process_group(pid);
            }
        }

        // Close all terminal sessions
        if let Ok(mut sessions) = self.terminal_sessions.lock() {
            for (_, mut session) in sessions.drain() {
                let _ = session.child.kill();
            }
        }

        // Stop copilot LSP
        if let Ok(mut copilot) = self.copilot.lock() {
            if let Some((_, mut child)) = copilot.take() {
                let _ = child.start_kill();
            }
        }

        // Stop sidecar (tokio::sync::Mutex — use try_lock in sync Drop)
        if let Ok(mut sidecar) = self.agent_sidecar.try_lock() {
            if let Some(mut handle) = sidecar.take() {
                let _ = handle.child.start_kill();
            }
        }

        // Kill test processes
        if let Ok(mut processes) = self.test_processes.lock() {
            for (_, pid) in processes.drain() {
                let _ = crate::platform::kill_process_group(pid);
            }
        }

        // Clean up browser MCP registration
        let _ = crate::services::mcp::remove_mcp_server(
            "fury-browser",
            &crate::models::mcp::McpScope::User,
        );
    }
}

impl AppState {
    /// Run a closure with a database reference on the blocking thread pool.
    ///
    /// This prevents SQLite operations from blocking the async event loop,
    /// which would freeze the UI.
    pub async fn with_db<F, R>(&self, f: F) -> Result<R, crate::error::AppError>
    where
        F: FnOnce(&Database) -> Result<R, crate::error::AppError> + Send + 'static,
        R: Send + 'static,
    {
        let db = Arc::clone(&self.db);
        tokio::task::spawn_blocking(move || {
            let db_lock = db
                .lock()
                .map_err(|_| crate::error::AppError::DbError("Failed to acquire database lock".into()))?;
            let db = db_lock
                .as_ref()
                .ok_or(crate::error::AppError::DbError("DB not initialized".into()))?;
            f(db)
        })
        .await
        .map_err(|e| crate::error::AppError::InternalError(format!("task failed: {e}")))?
    }

    pub fn new() -> Self {
        Self {
            repositories: RwLock::new(HashMap::new()),
            workspaces: RwLock::new(HashMap::new()),
            settings: RwLock::new(AppSettings::default()),
            port_allocator: Mutex::new(PortAllocator::new(10000, 60000)),
            db: Arc::new(Mutex::new(None)),
            agents: Arc::new(Mutex::new(HashMap::new())),
            agent_processes: Arc::new(Mutex::new(HashMap::new())),
            persistent_agents: Arc::new(Mutex::new(HashMap::new())),
            agent_stdins: Arc::new(Mutex::new(HashMap::new())),
            script_pids: Arc::new(Mutex::new(HashMap::new())),
            terminal_sessions: Arc::new(Mutex::new(HashMap::new())),
            spotlight_watchers: Arc::new(Mutex::new(HashMap::new())),
            diff_watchers: Arc::new(Mutex::new(HashMap::new())),
            copilot: Arc::new(Mutex::new(None)),
            perf_metrics: Arc::new(Mutex::new(PerfMetrics::new())),
            indexing_status: Arc::new(Mutex::new(HashMap::new())),
            test_processes: Arc::new(Mutex::new(HashMap::new())),
            test_watchers: Arc::new(Mutex::new(HashMap::new())),
            container_states: Arc::new(Mutex::new(HashMap::new())),
            agent_sidecar: Arc::new(tokio::sync::Mutex::new(None)),
            pending_permissions: Arc::new(Mutex::new(HashMap::new())),
            codebase_indexes: Arc::new(Mutex::new(HashMap::new())),
            browser_webviews: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_initializes_empty_collections() {
        let state = AppState::new();

        assert!(state.repositories.read().unwrap().is_empty());
        assert!(state.workspaces.read().unwrap().is_empty());
        assert!(state.agents.lock().unwrap().is_empty());
        assert!(state.agent_processes.lock().unwrap().is_empty());
        assert!(state.script_pids.lock().unwrap().is_empty());
        assert!(state.terminal_sessions.lock().unwrap().is_empty());
        assert!(state.spotlight_watchers.lock().unwrap().is_empty());
        assert!(state.diff_watchers.lock().unwrap().is_empty());
        assert!(state.persistent_agents.lock().unwrap().is_empty());
        assert!(state.agent_stdins.lock().unwrap().is_empty());
        assert!(state.copilot.lock().unwrap().is_none());
        assert!(state.db.lock().unwrap().is_none());
        assert!(state.indexing_status.lock().unwrap().is_empty());
        assert!(state.test_processes.lock().unwrap().is_empty());
        assert!(state.test_watchers.lock().unwrap().is_empty());
        assert!(state.container_states.lock().unwrap().is_empty());
        assert!(state.agent_sidecar.try_lock().unwrap().is_none());
        assert!(state.pending_permissions.lock().unwrap().is_empty());
        assert!(state.codebase_indexes.lock().unwrap().is_empty());
        assert!(state.browser_webviews.lock().unwrap().is_empty());
    }

    #[test]
    fn test_new_initializes_default_settings() {
        let state = AppState::new();
        let settings = state.settings.read().unwrap();
        // Verify settings are the default
        assert!(!settings.analytics_enabled);
        assert!(settings.system_prompt_additions.is_none());
    }

    #[test]
    fn test_repositories_can_be_inserted() {
        let state = AppState::new();
        let repo = crate::models::repository::Repository {
            id: Uuid::new_v4(),
            name: "test".to_string(),
            path: std::path::PathBuf::from("/tmp/test"),
            default_branch: "main".to_string(),
            current_branch: None,
            provider: Default::default(),
            remote_url: None,
        };
        let id = repo.id;
        state.repositories.write().unwrap().insert(id, repo);
        assert_eq!(state.repositories.read().unwrap().len(), 1);
        assert!(state.repositories.read().unwrap().contains_key(&id));
    }

    #[test]
    fn test_workspaces_can_be_inserted() {
        let state = AppState::new();
        let ws = crate::test_helpers::test_workspace(Uuid::new_v4());
        let id = ws.id;
        state.workspaces.write().unwrap().insert(id, ws);
        assert_eq!(state.workspaces.read().unwrap().len(), 1);
    }

    #[test]
    fn test_agents_arc_clone() {
        let state = AppState::new();
        let agents_clone = Arc::clone(&state.agents);
        let ws_id = Uuid::new_v4();
        agents_clone
            .lock()
            .unwrap()
            .insert(ws_id, AgentInfo::new(ws_id));
        // Original should see the insert
        assert_eq!(state.agents.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn test_with_db_returns_result() {
        let state = AppState::new();
        let db = crate::db::Database::init_in_memory().unwrap();
        *state.db.lock().unwrap() = Some(db);
        let result = state.with_db(|_db| Ok(42)).await;
        assert_eq!(result.unwrap(), 42);
    }

    #[tokio::test]
    async fn test_with_db_no_db_initialized() {
        let state = AppState::new();
        let result = state.with_db(|_db| Ok(())).await;
        let err = result.unwrap_err().to_string();
        assert!(err.contains("DB not initialized"), "got: {}", err);
    }

    #[tokio::test]
    async fn test_with_db_propagates_closure_error() {
        let state = AppState::new();
        let db = crate::db::Database::init_in_memory().unwrap();
        *state.db.lock().unwrap() = Some(db);
        let result: Result<(), _> = state
            .with_db(|_db| Err(crate::error::AppError::DbError("boom".into())))
            .await;
        let err = result.unwrap_err().to_string();
        assert!(err.contains("boom"), "got: {}", err);
    }

    #[tokio::test]
    async fn test_with_db_concurrent_reads() {
        let state = Arc::new(AppState::new());
        let db = crate::db::Database::init_in_memory().unwrap();
        *state.db.lock().unwrap() = Some(db);

        let mut handles = vec![];
        for i in 0..10 {
            let s = Arc::clone(&state);
            handles.push(tokio::spawn(async move {
                s.with_db(move |_db| Ok(i)).await
            }));
        }
        for h in handles {
            assert!(h.await.unwrap().is_ok());
        }
    }

    #[tokio::test]
    async fn test_with_db_sequential_calls_dont_deadlock() {
        let state = AppState::new();
        let db = crate::db::Database::init_in_memory().unwrap();
        *state.db.lock().unwrap() = Some(db);
        let a = state.with_db(|_db| Ok(1)).await.unwrap();
        let b = state.with_db(|_db| Ok(2)).await.unwrap();
        assert_eq!(a + b, 3);
    }
}
