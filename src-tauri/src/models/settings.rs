use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AgentType {
    #[default]
    ClaudeCode,
    CodexCli,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default)]
    pub agent_type: AgentType,
    pub theme: Theme,
    pub provider: ProviderConfig,
    pub system_prompt_additions: Option<String>,
    pub analytics_enabled: bool,
    pub experimental: ExperimentalSettings,
    #[serde(default)]
    pub copilot: CopilotSettings,
    #[serde(default)]
    pub linear: LinearSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            agent_type: AgentType::default(),
            theme: Theme::Blend,
            provider: ProviderConfig::default(),
            system_prompt_additions: None,
            analytics_enabled: false,
            experimental: ExperimentalSettings::default(),
            copilot: CopilotSettings::default(),
            linear: LinearSettings::default(),
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
    #[serde(default)]
    pub persistent_processes: bool,
    #[serde(default)]
    pub safe_mode: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CopilotSettings {
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LinearSettings {
    pub api_key: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_settings_default() {
        let s = AppSettings::default();
        assert_eq!(s.agent_type, AgentType::ClaudeCode);
        assert!(matches!(s.theme, Theme::Blend));
        assert!(matches!(s.provider.provider_type, ProviderType::Anthropic));
        assert!(s.provider.env_vars.is_empty());
        assert!(s.system_prompt_additions.is_none());
        assert!(!s.analytics_enabled);
        assert!(!s.experimental.spotlight_testing);
        assert!(!s.experimental.agent_teams);
        assert!(!s.copilot.enabled);
        assert!(s.linear.api_key.is_none());
    }

    #[test]
    fn test_theme_serde_aliases() {
        // "system" should deserialize to Blend
        let blend: Theme = serde_json::from_str("\"system\"").unwrap();
        assert!(matches!(blend, Theme::Blend));

        // "dark" should deserialize to Midnight
        let midnight: Theme = serde_json::from_str("\"dark\"").unwrap();
        assert!(matches!(midnight, Theme::Midnight));

        // "light" should deserialize to Github
        let github: Theme = serde_json::from_str("\"light\"").unwrap();
        assert!(matches!(github, Theme::Github));
    }

    #[test]
    fn test_theme_canonical_serde() {
        let blend: Theme = serde_json::from_str("\"blend\"").unwrap();
        assert!(matches!(blend, Theme::Blend));

        let midnight: Theme = serde_json::from_str("\"midnight\"").unwrap();
        assert!(matches!(midnight, Theme::Midnight));

        let github: Theme = serde_json::from_str("\"github\"").unwrap();
        assert!(matches!(github, Theme::Github));
    }

    #[test]
    fn test_app_settings_serde_roundtrip() {
        let settings = AppSettings::default();
        let json = serde_json::to_string(&settings).unwrap();
        let deserialized: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.agent_type, settings.agent_type);
        assert_eq!(deserialized.analytics_enabled, settings.analytics_enabled);
    }

    #[test]
    fn test_provider_type_variants_serde() {
        let variants = vec![
            ("\"Anthropic\"", "Anthropic"),
            ("\"OpenRouter\"", "OpenRouter"),
            ("\"Bedrock\"", "Bedrock"),
            ("\"Custom\"", "Custom"),
        ];
        for (json, _name) in variants {
            let _pt: ProviderType = serde_json::from_str(json).unwrap();
        }
    }
}
