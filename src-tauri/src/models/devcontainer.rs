use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub enum ContainerBackend {
    #[default]
    DevcontainerCli,
    RawDocker,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub enum AgentExecMode {
    #[default]
    Host,
    Container,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub enum ContainerStatus {
    #[default]
    None,
    Building,
    Running,
    Stopped,
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DevContainerConfig {
    pub enabled: bool,
    pub backend: ContainerBackend,
    pub agent_exec_mode: AgentExecMode,
    pub image: Option<String>,
    pub compose_file: Option<String>,
    pub compose_service: Option<String>,
    pub devcontainer_path: Option<String>,
    pub container_workspace_path: Option<String>,
    pub extra_docker_args: Vec<String>,
    pub container_env_vars: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerState {
    pub workspace_id: Uuid,
    pub status: ContainerStatus,
    pub container_id: Option<String>,
    pub container_name: Option<String>,
    pub log_tail: Vec<String>,
}

impl ContainerState {
    pub fn new(workspace_id: Uuid) -> Self {
        Self {
            workspace_id,
            status: ContainerStatus::None,
            container_id: None,
            container_name: None,
            log_tail: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerStatusEvent {
    pub workspace_id: Uuid,
    pub status: ContainerStatus,
    pub container_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ContainerExecContext {
    pub container_id: String,
    pub container_working_dir: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_devcontainer_config_default() {
        let config = DevContainerConfig::default();
        assert!(!config.enabled);
        assert_eq!(config.backend, ContainerBackend::DevcontainerCli);
        assert_eq!(config.agent_exec_mode, AgentExecMode::Host);
        assert!(config.image.is_none());
        assert!(config.compose_file.is_none());
        assert!(config.devcontainer_path.is_none());
        assert!(config.container_workspace_path.is_none());
        assert!(config.extra_docker_args.is_empty());
        assert!(config.container_env_vars.is_empty());
    }

    #[test]
    fn test_container_status_default() {
        let status = ContainerStatus::default();
        assert_eq!(status, ContainerStatus::None);
    }

    #[test]
    fn test_container_state_new() {
        let id = Uuid::new_v4();
        let state = ContainerState::new(id);
        assert_eq!(state.workspace_id, id);
        assert_eq!(state.status, ContainerStatus::None);
        assert!(state.container_id.is_none());
        assert!(state.log_tail.is_empty());
    }

    #[test]
    fn test_devcontainer_config_serde_roundtrip() {
        let config = DevContainerConfig {
            enabled: true,
            backend: ContainerBackend::RawDocker,
            agent_exec_mode: AgentExecMode::Container,
            image: Some("node:20".to_string()),
            compose_file: None,
            compose_service: None,
            devcontainer_path: Some(".devcontainer/devcontainer.json".to_string()),
            container_workspace_path: Some("/workspaces/myapp".to_string()),
            extra_docker_args: vec!["--gpus=all".to_string()],
            container_env_vars: std::collections::HashMap::from([(
                "NODE_ENV".to_string(),
                "development".to_string(),
            )]),
        };
        let json = serde_json::to_string(&config).unwrap();
        let deserialized: DevContainerConfig = serde_json::from_str(&json).unwrap();
        assert!(deserialized.enabled);
        assert_eq!(deserialized.backend, ContainerBackend::RawDocker);
        assert_eq!(deserialized.agent_exec_mode, AgentExecMode::Container);
        assert_eq!(deserialized.image.as_deref(), Some("node:20"));
        assert_eq!(deserialized.extra_docker_args.len(), 1);
    }

    #[test]
    fn test_container_status_event_serde() {
        let event = ContainerStatusEvent {
            workspace_id: Uuid::new_v4(),
            status: ContainerStatus::Running,
            container_id: Some("abc123".to_string()),
        };
        let json = serde_json::to_string(&event).unwrap();
        let deserialized: ContainerStatusEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.status, ContainerStatus::Running);
        assert_eq!(deserialized.container_id.as_deref(), Some("abc123"));
    }

    #[test]
    fn test_container_status_error_variant() {
        let status = ContainerStatus::Error("build failed".to_string());
        let json = serde_json::to_string(&status).unwrap();
        let deserialized: ContainerStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(
            deserialized,
            ContainerStatus::Error("build failed".to_string())
        );
    }
}
