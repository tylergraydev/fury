use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DiffResult {
    pub files: Vec<FileDiff>,
    pub total_additions: u32,
    pub total_deletions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub status: FileStatus,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum FileStatus {
    Added,
    Modified,
    Deleted,
    Renamed { from: String },
    Untracked,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FileDiffContent {
    pub path: String,
    pub original: String,
    pub modified: String,
    pub language: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FilePatchPreview {
    pub path: String,
    pub language: String,
    pub patch: String,
    pub truncated: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_file_status_serde_roundtrip() {
        let statuses = vec![
            FileStatus::Added,
            FileStatus::Modified,
            FileStatus::Deleted,
            FileStatus::Renamed {
                from: "old.rs".to_string(),
            },
            FileStatus::Untracked,
        ];
        for status in statuses {
            let json = serde_json::to_string(&status).unwrap();
            let _: FileStatus = serde_json::from_str(&json).unwrap();
        }
    }

    #[test]
    fn test_diff_result_serde_roundtrip() {
        let result = DiffResult {
            files: vec![FileDiff {
                path: "src/main.rs".to_string(),
                status: FileStatus::Modified,
                additions: 10,
                deletions: 3,
            }],
            total_additions: 10,
            total_deletions: 3,
        };
        let json = serde_json::to_string(&result).unwrap();
        let deserialized: DiffResult = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.files.len(), 1);
        assert_eq!(deserialized.total_additions, 10);
    }

    #[test]
    fn test_file_patch_preview_serde_roundtrip() {
        let preview = FilePatchPreview {
            path: "src/main.rs".to_string(),
            language: "rust".to_string(),
            patch: "+fn main() {}\n-old line".to_string(),
            truncated: true,
        };
        let json = serde_json::to_string(&preview).unwrap();
        let deserialized: FilePatchPreview = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.path, "src/main.rs");
        assert_eq!(deserialized.language, "rust");
        assert!(deserialized.truncated);
        assert!(deserialized.patch.contains("+fn main()"));
    }
}
