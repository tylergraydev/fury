use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DocLibrary {
    pub id: String,
    pub name: String,
    pub version: Option<String>,
}
