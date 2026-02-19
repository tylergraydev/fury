use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffResult {
    pub files: Vec<FileDiff>,
    pub total_additions: u32,
    pub total_deletions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub status: FileStatus,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileStatus {
    Added,
    Modified,
    Deleted,
    Renamed { from: String },
    Untracked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiffContent {
    pub path: String,
    pub original: String,
    pub modified: String,
    pub language: String,
}
