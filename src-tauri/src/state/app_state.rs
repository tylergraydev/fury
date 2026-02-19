use crate::db::Database;
use crate::models::agent::AgentInfo;
use crate::models::repository::Repository;
use crate::models::settings::AppSettings;
use crate::models::workspace::Workspace;
use crate::services::port_allocator::PortAllocator;
use crate::services::terminal::TerminalSession;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::process::Child;
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
            script_processes: Arc::new(Mutex::new(HashMap::new())),
            terminal_sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}
