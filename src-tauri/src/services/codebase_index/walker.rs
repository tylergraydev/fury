use std::path::{Path, PathBuf};

use crate::error::AppError;

/// Maximum file size to index (1 MB).
const MAX_FILE_SIZE: u64 = 1_048_576;

/// File extensions that are always skipped (binary/generated).
const SKIP_EXTENSIONS: &[&str] = &[
    // Images
    "png", "jpg", "jpeg", "gif", "ico", "svg", "webp", "bmp",
    // Fonts
    "woff", "woff2", "ttf", "eot", "otf",
    // Archives
    "zip", "tar", "gz", "bz2", "xz", "7z", "rar",
    // Compiled / binary
    "exe", "dll", "so", "dylib", "o", "a", "lib", "class", "pyc", "pyo",
    // Media
    "mp3", "mp4", "wav", "avi", "mov", "mkv", "flac",
    // Documents
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    // Database
    "sqlite", "db", "sqlite3",
    // Other
    "wasm", "map",
];

/// File names that are always skipped (large generated files).
const SKIP_FILENAMES: &[&str] = &[
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "Cargo.lock",
    "composer.lock",
    "Gemfile.lock",
    "poetry.lock",
    "Pipfile.lock",
];

/// Walk a repository directory and return all indexable file paths.
///
/// Uses the `ignore` crate to respect `.gitignore` rules.
/// Skips binary files, lock files, and files larger than 1 MB.
pub fn walk_repo(repo_path: &Path) -> Result<Vec<PathBuf>, AppError> {
    let mut files = Vec::new();

    let walker = ignore::WalkBuilder::new(repo_path)
        .hidden(true) // skip dotfiles/dotdirs
        .git_ignore(true) // respect .gitignore
        .git_global(true) // respect global gitignore
        .git_exclude(true) // respect .git/info/exclude
        .build();

    for entry in walker {
        let entry = entry.map_err(|e| {
            AppError::IoError(std::io::Error::other(format!("Walk error: {}", e)))
        })?;

        // Skip directories
        if !entry.file_type().map_or(false, |ft| ft.is_file()) {
            continue;
        }

        let path = entry.path();

        // Skip by filename
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if SKIP_FILENAMES.contains(&name) {
                continue;
            }
        }

        // Skip by extension
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            if SKIP_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
                continue;
            }
        }

        // Skip files that are too large
        if let Ok(meta) = entry.metadata() {
            if meta.len() > MAX_FILE_SIZE {
                continue;
            }
        }

        files.push(path.to_path_buf());
    }

    Ok(files)
}

/// Detect the programming language from a file extension.
/// Returns None for unknown/unsupported extensions.
pub fn detect_language(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?;
    match ext.to_lowercase().as_str() {
        "rs" => Some("rust"),
        "ts" | "tsx" | "mts" | "cts" => Some("typescript"),
        "js" | "jsx" | "mjs" | "cjs" => Some("javascript"),
        "py" | "pyi" => Some("python"),
        "go" => Some("go"),
        "java" => Some("java"),
        "c" | "h" => Some("c"),
        "cpp" | "cc" | "cxx" | "hpp" | "hxx" | "hh" => Some("cpp"),
        "json" => Some("json"),
        "toml" => Some("toml"),
        "css" | "scss" | "less" => Some("css"),
        "html" | "htm" => Some("html"),
        "sh" | "bash" | "zsh" => Some("bash"),
        "md" | "markdown" => Some("markdown"),
        "yaml" | "yml" => Some("yaml"),
        "xml" => Some("xml"),
        "sql" => Some("sql"),
        "rb" => Some("ruby"),
        "swift" => Some("swift"),
        "kt" | "kts" => Some("kotlin"),
        "lua" => Some("lua"),
        "r" | "R" => Some("r"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_walk_repo_finds_files() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("main.rs"), "fn main() {}").unwrap();
        fs::write(dir.path().join("lib.rs"), "pub fn lib() {}").unwrap();

        let files = walk_repo(dir.path()).unwrap();
        assert_eq!(files.len(), 2);
    }

    #[test]
    fn test_walk_repo_skips_lock_files() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("main.rs"), "fn main() {}").unwrap();
        fs::write(dir.path().join("package-lock.json"), "{}").unwrap();
        fs::write(dir.path().join("Cargo.lock"), "").unwrap();

        let files = walk_repo(dir.path()).unwrap();
        assert_eq!(files.len(), 1);
    }

    #[test]
    fn test_walk_repo_skips_binary_extensions() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("main.rs"), "fn main() {}").unwrap();
        fs::write(dir.path().join("image.png"), &[0u8; 100]).unwrap();
        fs::write(dir.path().join("font.woff2"), &[0u8; 100]).unwrap();

        let files = walk_repo(dir.path()).unwrap();
        assert_eq!(files.len(), 1);
    }

    #[test]
    fn test_walk_repo_skips_large_files() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("small.rs"), "fn main() {}").unwrap();
        // Create a file larger than 1MB
        let large_content = vec![b'x'; (MAX_FILE_SIZE + 1) as usize];
        fs::write(dir.path().join("large.rs"), &large_content).unwrap();

        let files = walk_repo(dir.path()).unwrap();
        assert_eq!(files.len(), 1);
    }

    #[test]
    fn test_detect_language() {
        assert_eq!(detect_language(Path::new("main.rs")), Some("rust"));
        assert_eq!(detect_language(Path::new("app.tsx")), Some("typescript"));
        assert_eq!(detect_language(Path::new("index.js")), Some("javascript"));
        assert_eq!(detect_language(Path::new("main.py")), Some("python"));
        assert_eq!(detect_language(Path::new("main.go")), Some("go"));
        assert_eq!(detect_language(Path::new("App.java")), Some("java"));
        assert_eq!(detect_language(Path::new("main.c")), Some("c"));
        assert_eq!(detect_language(Path::new("main.cpp")), Some("cpp"));
        assert_eq!(detect_language(Path::new("data.json")), Some("json"));
        assert_eq!(detect_language(Path::new("config.toml")), Some("toml"));
        assert_eq!(detect_language(Path::new("style.css")), Some("css"));
        assert_eq!(detect_language(Path::new("index.html")), Some("html"));
        assert_eq!(detect_language(Path::new("script.sh")), Some("bash"));
        assert_eq!(detect_language(Path::new("unknown.xyz")), None);
        assert_eq!(detect_language(Path::new("noext")), None);
    }
}
