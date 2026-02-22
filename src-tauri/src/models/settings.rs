use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: Theme,
    pub provider: ProviderConfig,
    pub system_prompt_additions: Option<String>,
    pub analytics_enabled: bool,
    pub experimental: ExperimentalSettings,
    #[serde(default)]
    pub copilot: CopilotSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: Theme::Blend,
            provider: ProviderConfig::default(),
            system_prompt_additions: None,
            analytics_enabled: false,
            experimental: ExperimentalSettings::default(),
            copilot: CopilotSettings::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    #[default]
    #[serde(alias = "system")]
    Blend,
    #[serde(alias = "dark")]
    Midnight,
    #[serde(alias = "light")]
    Github,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    pub provider_type: ProviderType,
    pub env_vars: HashMap<String, String>,
}

impl Default for ProviderConfig {
    fn default() -> Self {
        Self {
            provider_type: ProviderType::Anthropic,
            env_vars: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub enum ProviderType {
    #[default]
    Anthropic,
    OpenRouter,
    VercelAIGateway,
    Bedrock,
    Vertex,
    AzureFoundry,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExperimentalSettings {
    pub spotlight_testing: bool,
    pub agent_teams: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CopilotSettings {
    pub enabled: bool,
}
