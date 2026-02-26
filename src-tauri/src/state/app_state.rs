use crate::db::Database;
use crate::models::agent::AgentInfo;
use crate::models::mcp::IndexingStatus;
use crate::models::repository::Repository;
use crate::models::settings::AppSettings;
use crate::models::workspace::Workspace;
use crate::services::copilot_lsp::CopilotLspHandle;
use crate::services::perf_server::PerfMetrics;
use crate::services::port_allocator::PortAllocator;
use crate::services::spotlight::SpotlightHandle;
use crate::services::terminal::TerminalSession;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::process::{Child, ChildStdin};
use uuid::Uuid;

/// Handle for a persistent Claude Code process, storing spawn-time configuration.
pub struct PersistentAgentHandle {
    pub stdin: ChildStdin,
    pub disable_thinking: bool,
    pub disable_plan_mode: bool,
}

pub struct AppState {
    pub repositories: Mutex<HashMap<Uuid, Repository>>,
    pub workspaces: Mutex<HashMap<Uuid, Workspace>>,
    pub settings: Mutex<AppSettings>,
    pub port_allocator: Mutex<PortAllocator>,
    pub db: Mutex<Option<Database>>,
    /// Agent metadata — Arc-wrapped so async tasks can hold a reference
    pub agents: Arc<Mutex<HashMap<Uuid, AgentInfo>>>,
    /// Agent process handles — Arc-wrapped so async tasks can hold a reference
    pub agent_processes: Arc<Mutex<HashMap<Uuid, Child>>>,
    /// Script process handles — keyed by "{workspace_id}:{kind}"
    pub script_processes: Arc<Mutex<HashMap<String, Child>>>,
    /// Terminal PTY sessions — keyed by terminal session ID
    pub terminal_sessions: Arc<Mutex<HashMap<Uuid, TerminalSession>>>,
    /// Spotlight file watchers — keyed by workspace ID
    pub spotlight_watchers: Arc<Mutex<HashMap<Uuid, SpotlightHandle>>>,
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
}

impl AppState {
    pub fn new() -> Self {
        Self {
            repositories: Mutex::new(HashMap::new()),
            workspaces: Mutex::new(HashMap::new()),
            settings: Mutex::new(AppSettings::default()),
            port_allocator: Mutex::new(PortAllocator::new(10000, 60000)),
            db: Mutex::new(None),
            agents: Arc::new(Mutex::new(HashMap::new())),
            agent_processes: Arc::new(Mutex::new(HashMap::new())),
            persistent_agents: Arc::new(Mutex::new(HashMap::new())),
            agent_stdins: Arc::new(Mutex::new(HashMap::new())),
            script_processes: Arc::new(Mutex::new(HashMap::new())),
            terminal_sessions: Arc::new(Mutex::new(HashMap::new())),
            spotlight_watchers: Arc::new(Mutex::new(HashMap::new())),
            copilot: Arc::new(Mutex::new(None)),
            perf_metrics: Arc::new(Mutex::new(PerfMetrics::new())),
            indexing_status: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_initializes_empty_collections() {
        let state = AppState::new();

        assert!(state.repositories.lock().unwrap().is_empty());
        assert!(state.workspaces.lock().unwrap().is_empty());
        assert!(state.agents.lock().unwrap().is_empty());
        assert!(state.agent_processes.lock().unwrap().is_empty());
        assert!(state.script_processes.lock().unwrap().is_empty());
        assert!(state.terminal_sessions.lock().unwrap().is_empty());
        assert!(state.spotlight_watchers.lock().unwrap().is_empty());
        assert!(state.persistent_agents.lock().unwrap().is_empty());
        assert!(state.agent_stdins.lock().unwrap().is_empty());
        assert!(state.copilot.lock().unwrap().is_none());
        assert!(state.db.lock().unwrap().is_none());
        assert!(state.indexing_status.lock().unwrap().is_empty());
    }

    #[test]
    fn test_new_initializes_default_settings() {
        let state = AppState::new();
        let settings = state.settings.lock().unwrap();
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
        };
        let id = repo.id;
        state.repositories.lock().unwrap().insert(id, repo);
        assert_eq!(state.repositories.lock().unwrap().len(), 1);
        assert!(state.repositories.lock().unwrap().contains_key(&id));
    }

    #[test]
    fn test_workspaces_can_be_inserted() {
        let state = AppState::new();
        let ws = crate::test_helpers::test_workspace(Uuid::new_v4());
        let id = ws.id;
        state.workspaces.lock().unwrap().insert(id, ws);
        assert_eq!(state.workspaces.lock().unwrap().len(), 1);
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
