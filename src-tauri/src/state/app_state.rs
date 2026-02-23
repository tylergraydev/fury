use crate::db::Database;
use crate::models::agent::AgentInfo;
use crate::models::repository::Repository;
use crate::models::settings::AppSettings;
use crate::models::workspace::Workspace;
use crate::services::copilot_lsp::CopilotLspHandle;
use crate::services::port_allocator::PortAllocator;
use crate::services::spotlight::SpotlightHandle;
use crate::services::terminal::TerminalSession;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::process::{Child, ChildStdin};
use uuid::Uuid;

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
    /// Persistent agent stdin handles — for Performance Mode (kept alive between turns)
    pub persistent_agents: Arc<Mutex<HashMap<Uuid, ChildStdin>>>,
    /// Agent stdin handles — for Safe Mode permission responses (all spawn modes)
    pub agent_stdins: Arc<Mutex<HashMap<Uuid, ChildStdin>>>,
    /// Copilot Language Server — global singleton (handle + child process)
    pub copilot: Arc<Mutex<Option<(CopilotLspHandle, Child)>>>,
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
        }
    }
}
