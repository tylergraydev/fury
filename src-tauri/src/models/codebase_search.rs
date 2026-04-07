use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CodeSearchResult {
    pub file_path: String,
    pub content: String,
    pub start_line: u32,
    pub end_line: u32,
    pub score: f32,
    /// Chunk type: "function", "class", "import", "block", "file_header"
    pub kind: String,
    pub language: String,
    /// The symbol name extracted from the AST (e.g. function name, class name).
    pub symbol_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct IndexProgress {
    pub repo_id: String,
    pub files_indexed: u32,
    pub total_files: u32,
    pub current_file: Option<String>,
}
