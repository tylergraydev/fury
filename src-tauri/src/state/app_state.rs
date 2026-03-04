use crate::db::Database;
use crate::models::agent::AgentInfo;
use crate::models::mcp::IndexingStatus;
use crate::models::repository::Repository;
use crate::models::settings::AppSettings;
use crate::models::workspace::Workspace;
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
}

impl AppState {
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
}
