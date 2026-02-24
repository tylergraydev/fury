use crate::error::AppError;
use crate::models::diff::{DiffResult, FileDiff, FileDiffContent, FileStatus};
use crate::platform;
use std::io::{BufRead, BufReader};
use std::path::Path;

/// Skip untracked files larger than 1MB (likely generated or binary).
const MAX_UNTRACKED_FILE_SIZE: u64 = 1_000_000;
/// Cap the number of untracked files processed to avoid unbounded I/O.
const MAX_UNTRACKED_FILES: usize = 200;

/// Empty tree SHA used as fallback when git merge-base fails.
const EMPTY_TREE_SHA: &str = "4b825dc642cb6eb9a060e54bf899d15363ed7fd1";

/// Get a summary of all changed files relative to the default branch.
pub fn get_workspace_diff(
    worktree_path: &Path,
    default_branch: &str,
) -> Result<DiffResult, AppError> {
    let merge_base = find_merge_base(worktree_path, default_branch);

    // Get file statuses (M/A/D/R)
    let name_status_output = platform::command("git")
        .args(["diff", "--name-status", &merge_base])
        .current_dir(worktree_path)
        .output()?;

    // Get line counts
    let numstat_output = platform::command("git")
        .args(["diff", "--numstat", &merge_base])
        .current_dir(worktree_path)
        .output()?;

    // Get untracked files
    let untracked_output = platform::command("git")
        .args(["ls-files", "--others", "--exclude-standard"])
        .current_dir(worktree_path)
        .output()?;

    let name_status_str = String::from_utf8_lossy(&name_status_output.stdout);
    let numstat_str = String::from_utf8_lossy(&numstat_output.stdout);
    let untracked_str = String::from_utf8_lossy(&untracked_output.stdout);

    // Parse numstat into a lookup map: path -> (additions, deletions)
    let mut stats: std::collections::HashMap<String, (u32, u32)> = std::collections::HashMap::new();
    for line in numstat_str.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 3 {
            let additions = parts[0].parse::<u32>().unwrap_or(0);
            let deletions = parts[1].parse::<u32>().unwrap_or(0);
            stats.insert(parts[2].to_string(), (additions, deletions));
        }
    }

    let mut files = Vec::new();
    let mut total_additions: u32 = 0;
    let mut total_deletions: u32 = 0;

    // Parse name-status for tracked changes
    for line in name_status_str.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.splitn(3, '\t').collect();
        if parts.is_empty() {
            continue;
        }

        let status_char = parts[0];
        let (status, path) = if status_char.starts_with('R') {
            // Rename: R<pct>\told_path\tnew_path
            let from = parts.get(1).unwrap_or(&"").to_string();
            let to = parts.get(2).unwrap_or(&"").to_string();
            (FileStatus::Renamed { from }, to)
        } else {
            let path = parts.get(1).unwrap_or(&"").to_string();
            let status = match status_char {
                "A" => FileStatus::Added,
                "D" => FileStatus::Deleted,
                _ => FileStatus::Modified,
            };
            (status, path)
        };

        let (add, del) = stats.get(&path).copied().unwrap_or((0, 0));
        total_additions += add;
        total_deletions += del;

        files.push(FileDiff {
            path,
            status,
            additions: add,
            deletions: del,
        });
    }

    // Add untracked files
    let mut untracked_count = 0;
    for line in untracked_str.lines() {
        let path = line.trim().to_string();
        if path.is_empty() {
            continue;
        }
        if untracked_count >= MAX_UNTRACKED_FILES {
            break;
        }
        untracked_count += 1;

        // Count lines efficiently without reading entire file into a String
        let file_path = worktree_path.join(&path);
        let line_count = std::fs::metadata(&file_path)
            .ok()
            .filter(|m| m.len() <= MAX_UNTRACKED_FILE_SIZE)
            .and_then(|_| std::fs::File::open(&file_path).ok())
            .map(|f| BufReader::new(f).lines().count() as u32)
            .unwrap_or(0);

        total_additions += line_count;

        files.push(FileDiff {
            path,
            status: FileStatus::Untracked,
            additions: line_count,
            deletions: 0,
        });
    }

    Ok(DiffResult {
        files,
        total_additions,
        total_deletions,
    })
}

/// Get the original and modified content of a single file for Monaco DiffEditor.
pub fn get_file_diff_content(
    worktree_path: &Path,
    default_branch: &str,
    file_path: &str,
) -> Result<FileDiffContent, AppError> {
    let merge_base = find_merge_base(worktree_path, default_branch);

    // Get original content at merge base
    let original_output = platform::command("git")
        .args(["show", &format!("{}:{}", merge_base, file_path)])
        .current_dir(worktree_path)
        .output()?;

    let original = if original_output.status.success() {
        String::from_utf8_lossy(&original_output.stdout).to_string()
    } else {
        String::new() // New file — no original content
    };

    // Get modified content from filesystem
    let full_path = worktree_path.join(file_path);
    let modified = std::fs::read_to_string(&full_path).unwrap_or_default();

    let language = detect_language(file_path);

    Ok(FileDiffContent {
        path: file_path.to_string(),
        original,
        modified,
        language,
    })
}

/// Find the merge base between the current HEAD and the default branch.
/// Falls back to the empty tree SHA if no common ancestor exists.
fn find_merge_base(worktree_path: &Path, default_branch: &str) -> String {
    let output = platform::command("git")
        .args(["merge-base", default_branch, "HEAD"])
        .current_dir(worktree_path)
        .output();

    match output {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).trim().to_string(),
        _ => EMPTY_TREE_SHA.to_string(),
    }
}

/// Detect Monaco language ID from file extension.
pub fn detect_language(file_path: &str) -> String {
    let ext = file_path.rsplit('.').next().unwrap_or("");
    match ext {
        "rs" => "rust",
        "ts" | "tsx" => "typescript",
        "js" | "jsx" | "mjs" | "cjs" => "javascript",
        "py" => "python",
        "json" => "json",
        "md" | "mdx" => "markdown",
        "css" => "css",
        "scss" => "scss",
        "html" | "htm" => "html",
        "toml" => "toml",
        "yaml" | "yml" => "yaml",
        "xml" => "xml",
        "sql" => "sql",
        "sh" | "bash" | "zsh" => "shell",
        "go" => "go",
        "java" => "java",
        "kt" | "kts" => "kotlin",
        "swift" => "swift",
        "c" | "h" => "c",
        "cpp" | "cc" | "cxx" | "hpp" => "cpp",
        "cs" => "csharp",
        "rb" => "ruby",
        "php" => "php",
        "lua" => "lua",
        "r" => "r",
        "dart" => "dart",
        "vue" => "vue",
        "svelte" => "svelte",
        "graphql" | "gql" => "graphql",
        "dockerfile" => "dockerfile",
        _ => "plaintext",
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_language_rust() {
        assert_eq!(detect_language("src/main.rs"), "rust");
    }

    #[test]
    fn test_detect_language_typescript() {
        assert_eq!(detect_language("app.ts"), "typescript");
        assert_eq!(detect_language("component.tsx"), "typescript");
    }

    #[test]
    fn test_detect_language_javascript() {
        assert_eq!(detect_language("app.js"), "javascript");
        assert_eq!(detect_language("app.jsx"), "javascript");
        assert_eq!(detect_language("app.mjs"), "javascript");
        assert_eq!(detect_language("app.cjs"), "javascript");
    }

    #[test]
    fn test_detect_language_python() {
        assert_eq!(detect_language("script.py"), "python");
    }

    #[test]
    fn test_detect_language_go() {
        assert_eq!(detect_language("main.go"), "go");
    }

    #[test]
    fn test_detect_language_shell() {
        assert_eq!(detect_language("script.sh"), "shell");
        assert_eq!(detect_language("script.bash"), "shell");
        assert_eq!(detect_language("script.zsh"), "shell");
    }

    #[test]
    fn test_detect_language_markup() {
        assert_eq!(detect_language("README.md"), "markdown");
        assert_eq!(detect_language("index.html"), "html");
        assert_eq!(detect_language("page.htm"), "html");
    }

    #[test]
    fn test_detect_language_config() {
        assert_eq!(detect_language("Cargo.toml"), "toml");
        assert_eq!(detect_language("config.yaml"), "yaml");
        assert_eq!(detect_language("config.yml"), "yaml");
        assert_eq!(detect_language("data.json"), "json");
    }

    #[test]
    fn test_detect_language_unknown() {
        assert_eq!(detect_language("file.xyz"), "plaintext");
    }

    #[test]
    fn test_detect_language_no_extension() {
        assert_eq!(detect_language("Makefile"), "plaintext");
    }

    #[test]
    fn test_detect_language_cpp() {
        assert_eq!(detect_language("main.cpp"), "cpp");
        assert_eq!(detect_language("main.cc"), "cpp");
        assert_eq!(detect_language("header.hpp"), "cpp");
    }

    // --- Integration tests with temp git repo ---

    #[test]
    fn test_get_workspace_diff_clean_repo() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let result = get_workspace_diff(&path, "main").unwrap();
        assert!(result.files.is_empty());
        assert_eq!(result.total_additions, 0);
        assert_eq!(result.total_deletions, 0);
    }

    #[test]
    fn test_get_workspace_diff_with_changes() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        // Create a new branch and modify a file
        std::process::Command::new("git")
            .args(["checkout", "-b", "feature"])
            .current_dir(&path)
            .output()
            .unwrap();
        std::fs::write(path.join("new_file.txt"), "hello\nworld\n").unwrap();
        std::process::Command::new("git")
            .args(["add", "new_file.txt"])
            .current_dir(&path)
            .output()
            .unwrap();
        std::process::Command::new("git")
            .args(["commit", "-m", "Add new file"])
            .current_dir(&path)
            .output()
            .unwrap();
        let result = get_workspace_diff(&path, "main").unwrap();
        assert!(!result.files.is_empty());
        assert!(result.total_additions > 0);
    }

    #[test]
    fn test_get_file_diff_content_new_file() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        std::process::Command::new("git")
            .args(["checkout", "-b", "feature"])
            .current_dir(&path)
            .output()
            .unwrap();
        std::fs::write(path.join("test.rs"), "fn main() {}\n").unwrap();
        std::process::Command::new("git")
            .args(["add", "test.rs"])
            .current_dir(&path)
            .output()
            .unwrap();
        std::process::Command::new("git")
            .args(["commit", "-m", "Add test.rs"])
            .current_dir(&path)
            .output()
            .unwrap();
        let content = get_file_diff_content(&path, "main", "test.rs").unwrap();
        assert_eq!(content.path, "test.rs");
        assert!(content.original.is_empty()); // new file, no original
        assert_eq!(content.modified, "fn main() {}\n");
        assert_eq!(content.language, "rust");
    }
}
