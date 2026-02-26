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
    #[serde(deserialize_with = "deserialize_theme")]
    pub theme: String,
    pub provider: ProviderConfig,
    pub system_prompt_additions: Option<String>,
    pub analytics_enabled: bool,
    pub experimental: ExperimentalSettings,
    #[serde(default)]
    pub copilot: CopilotSettings,
    #[serde(default)]
    pub linear: LinearSettings,
    #[serde(default)]
    pub claude_context: ClaudeContextSettings,
    #[serde(default)]
    pub custom_themes: Vec<CustomTheme>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            agent_type: AgentType::default(),
            theme: "blend".to_string(),
            provider: ProviderConfig::default(),
            system_prompt_additions: None,
            analytics_enabled: false,
            experimental: ExperimentalSettings::default(),
            copilot: CopilotSettings::default(),
            linear: LinearSettings::default(),
            claude_context: ClaudeContextSettings::default(),
            custom_themes: Vec::new(),
        }
    }
}

/// Normalizes legacy theme aliases during deserialization.
fn deserialize_theme<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let s = String::deserialize(deserializer)?;
    Ok(match s.as_str() {
        "system" => "blend".to_string(),
        "dark" => "midnight".to_string(),
        "light" => "github".to_string(),
        other => other.to_string(),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomTheme {
    pub id: String,
    pub name: String,
    pub vars: HashMap<String, String>,
    #[serde(default)]
    pub base_theme: Option<String>,
    pub created_at: String,
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

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeContextSettings {
    pub enabled: bool,
    pub openai_api_key: Option<String>,
    pub zilliz_uri: Option<String>,
    pub zilliz_token: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_settings_default() {
        let s = AppSettings::default();
        assert_eq!(s.agent_type, AgentType::ClaudeCode);
        assert_eq!(s.theme, "blend");
        assert!(matches!(s.provider.provider_type, ProviderType::Anthropic));
        assert!(s.provider.env_vars.is_empty());
        assert!(s.system_prompt_additions.is_none());
        assert!(!s.analytics_enabled);
        assert!(!s.experimental.spotlight_testing);
        assert!(!s.experimental.agent_teams);
        assert!(!s.copilot.enabled);
        assert!(s.linear.api_key.is_none());
        assert!(!s.claude_context.enabled);
        assert!(s.claude_context.openai_api_key.is_none());
        assert!(s.custom_themes.is_empty());
    }

    #[test]
    fn test_theme_alias_normalization() {
        // Legacy aliases should be normalized during deserialization
        let json = r#"{"theme":"system","provider":{"providerType":"Anthropic","envVars":{}},"systemPromptAdditions":null,"analyticsEnabled":false,"experimental":{"spotlightTesting":false,"agentTeams":false}}"#;
        let settings: AppSettings = serde_json::from_str(json).unwrap();
        assert_eq!(settings.theme, "blend");

        let json = r#"{"theme":"dark","provider":{"providerType":"Anthropic","envVars":{}},"systemPromptAdditions":null,"analyticsEnabled":false,"experimental":{"spotlightTesting":false,"agentTeams":false}}"#;
        let settings: AppSettings = serde_json::from_str(json).unwrap();
        assert_eq!(settings.theme, "midnight");

        let json = r#"{"theme":"light","provider":{"providerType":"Anthropic","envVars":{}},"systemPromptAdditions":null,"analyticsEnabled":false,"experimental":{"spotlightTesting":false,"agentTeams":false}}"#;
        let settings: AppSettings = serde_json::from_str(json).unwrap();
        assert_eq!(settings.theme, "github");
    }

    #[test]
    fn test_theme_canonical_values() {
        let json = r#"{"theme":"blend","provider":{"providerType":"Anthropic","envVars":{}},"systemPromptAdditions":null,"analyticsEnabled":false,"experimental":{"spotlightTesting":false,"agentTeams":false}}"#;
        let settings: AppSettings = serde_json::from_str(json).unwrap();
        assert_eq!(settings.theme, "blend");

        let json = r#"{"theme":"midnight","provider":{"providerType":"Anthropic","envVars":{}},"systemPromptAdditions":null,"analyticsEnabled":false,"experimental":{"spotlightTesting":false,"agentTeams":false}}"#;
        let settings: AppSettings = serde_json::from_str(json).unwrap();
        assert_eq!(settings.theme, "midnight");
    }

    #[test]
    fn test_custom_theme_id_preserved() {
        let json = r#"{"theme":"custom-abc123","provider":{"providerType":"Anthropic","envVars":{}},"systemPromptAdditions":null,"analyticsEnabled":false,"experimental":{"spotlightTesting":false,"agentTeams":false}}"#;
        let settings: AppSettings = serde_json::from_str(json).unwrap();
        assert_eq!(settings.theme, "custom-abc123");
    }

    #[test]
    fn test_app_settings_serde_roundtrip() {
        let settings = AppSettings::default();
        let json = serde_json::to_string(&settings).unwrap();
        let deserialized: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.agent_type, settings.agent_type);
        assert_eq!(deserialized.theme, settings.theme);
        assert_eq!(deserialized.analytics_enabled, settings.analytics_enabled);
        assert!(deserialized.custom_themes.is_empty());
    }

    #[test]
    fn test_app_settings_with_custom_themes_roundtrip() {
        let mut settings = AppSettings::default();
        settings.custom_themes.push(CustomTheme {
            id: "custom-test".to_string(),
            name: "Test Theme".to_string(),
            vars: HashMap::from([
                ("--bg-primary".to_string(), "#111111".to_string()),
                ("--accent".to_string(), "#ff0000".to_string()),
            ]),
            base_theme: Some("blend".to_string()),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        });
        settings.theme = "custom-test".to_string();

        let json = serde_json::to_string(&settings).unwrap();
        let deserialized: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.theme, "custom-test");
        assert_eq!(deserialized.custom_themes.len(), 1);
        assert_eq!(deserialized.custom_themes[0].name, "Test Theme");
        assert_eq!(
            deserialized.custom_themes[0].vars.get("--accent").unwrap(),
            "#ff0000"
        );
    }

    #[test]
    fn test_backward_compat_no_custom_themes_field() {
        // Old settings JSON without customThemes should still deserialize
        let json = r#"{"theme":"blend","provider":{"providerType":"Anthropic","envVars":{}},"systemPromptAdditions":null,"analyticsEnabled":false,"experimental":{"spotlightTesting":false,"agentTeams":false}}"#;
        let settings: AppSettings = serde_json::from_str(json).unwrap();
        assert!(settings.custom_themes.is_empty());
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
