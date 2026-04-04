use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SlashCommand {
    pub name: String,
    pub source: SlashCommandSource,
    pub description: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum SlashCommandSource {
    Global,
    Project,
    Plugin,
}
