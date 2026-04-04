use serde::Serialize;

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct StashEntry {
    pub index: u32,
    pub message: String,
    pub branch: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct StashFileStat {
    pub path: String,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct StashDetail {
    pub index: u32,
    pub message: String,
    pub files: Vec<StashFileStat>,
    pub patch: String,
}
