use std::path::Path;

use crate::error::AppError;
use crate::models::diff::{DiffResult, FileDiff, FileDiffContent, FileStatus};
use crate::models::merge::{
    BranchStatus, ConflictContent, ConflictType, ConflictedFile, PullResult,
};
use crate::platform;
use crate::services::diff::detect_language;

/// Get ahead/behind counts for the current branch relative to the default branch.
pub fn get_branch_status(
    worktree_path: &Path,
    branch: &str,
    default_branch: &str,
) -> Result<BranchStatus, AppError> {
    // Check if upstream exists
    let has_upstream = platform::command("git")
        .args(["rev-parse", "--verify", &format!("origin/{}", branch)])
        .current_dir(worktree_path)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    // Get ahead/behind relative to default branch
    let upstream_ref = format!("origin/{}", default_branch);
    let output = platform::command("git")
        .args([
            "rev-list",
            "--left-right",
            "--count",
            &format!("{}...HEAD", upstream_ref),
        ])
        .current_dir(worktree_path)
        .output()?;

    let (behind, ahead) = if output.status.success() {
        let text = String::from_utf8_lossy(&output.stdout);
        let parts: Vec<&str> = text.trim().split('\t').collect();
        let behind = parts
            .first()
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(0);
        let ahead = parts
            .get(1)
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(0);
        (behind, ahead)
    } else {
        (0, 0)
    };

    Ok(BranchStatus {
        branch: branch.to_string(),
        default_branch: default_branch.to_string(),
        ahead,
        behind,
        has_upstream,
    })
}

/// Fetch from origin.
pub fn fetch_upstream(worktree_path: &Path) -> Result<(), AppError> {
    let output = platform::command("git")
        .args(["fetch", "origin"])
        .current_dir(worktree_path)
        .output()?;

    if !output.status.success() {
        return Err(AppError::GitError(format!(
            "git fetch failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(())
}

/// Pull from upstream with rebase.
pub fn pull_rebase(worktree_path: &Path, default_branch: &str) -> Result<PullResult, AppError> {
    let output = platform::command("git")
        .args(["pull", "--rebase", "origin", default_branch])
        .current_dir(worktree_path)
        .output()?;

    let message = if output.status.success() {
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    } else {
        String::from_utf8_lossy(&output.stderr).trim().to_string()
    };

    let conflicted_files = get_unmerged_files(worktree_path);
    let has_conflicts = !conflicted_files.is_empty();

    Ok(PullResult {
        success: output.status.success() && !has_conflicts,
        message,
        has_conflicts,
        conflicted_files,
    })
}

/// Pull from upstream with merge.
pub fn pull_merge(worktree_path: &Path, default_branch: &str) -> Result<PullResult, AppError> {
    let output = platform::command("git")
        .args(["pull", "origin", default_branch])
        .current_dir(worktree_path)
        .output()?;

    let message = if output.status.success() {
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    } else {
        String::from_utf8_lossy(&output.stderr).trim().to_string()
    };

    let conflicted_files = get_unmerged_files(worktree_path);
    let has_conflicts = !conflicted_files.is_empty();

    Ok(PullResult {
        success: output.status.success() && !has_conflicts,
        message,
        has_conflicts,
        conflicted_files,
    })
}

/// Get list of files with unmerged entries (conflict markers).
fn get_unmerged_files(worktree_path: &Path) -> Vec<String> {
    let output = platform::command("git")
        .args(["diff", "--name-only", "--diff-filter=U"])
        .current_dir(worktree_path)
        .output();

    match output {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout)
            .lines()
            .filter(|l| !l.is_empty())
            .map(String::from)
            .collect(),
        _ => Vec::new(),
    }
}

/// Get list of conflicted files with their conflict types.
pub fn get_conflicted_files(worktree_path: &Path) -> Result<Vec<ConflictedFile>, AppError> {
    let output = platform::command("git")
        .args(["status", "--porcelain=v2"])
        .current_dir(worktree_path)
        .output()?;

    if !output.status.success() {
        return Err(AppError::GitError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let mut files = Vec::new();

    for line in text.lines() {
        // Unmerged entries start with "u "
        if let Some(rest) = line.strip_prefix("u ") {
            // Format: u <xy> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
            let parts: Vec<&str> = rest.splitn(11, ' ').collect();
            if parts.len() >= 11 {
                let xy = parts[0];
                let path = parts[10].to_string();
                let conflict_type = match xy {
                    "DD" => ConflictType::BothDeleted,
                    "AU" => ConflictType::AddedByBoth,
                    "UA" => ConflictType::AddedByBoth,
                    "UU" => ConflictType::BothModified,
                    "DU" => ConflictType::DeletedByUs,
                    "UD" => ConflictType::DeletedByThem,
                    "AA" => ConflictType::AddedByBoth,
                    _ => ConflictType::Unknown,
                };
                files.push(ConflictedFile {
                    path,
                    conflict_type,
                });
            }
        }
    }

    Ok(files)
}

/// Get the three-way merge content for a conflicted file.
pub fn get_conflict_content(
    worktree_path: &Path,
    file_path: &str,
) -> Result<ConflictContent, AppError> {
    // Base (common ancestor) - stage 1
    let base = git_show_stage(worktree_path, 1, file_path);
    // Ours (current branch) - stage 2
    let ours = git_show_stage(worktree_path, 2, file_path);
    // Theirs (incoming) - stage 3
    let theirs = git_show_stage(worktree_path, 3, file_path);

    // Current file content with conflict markers
    let full_path = worktree_path.join(file_path);
    let merged = std::fs::read_to_string(&full_path).unwrap_or_default();

    let language = detect_language(file_path);

    Ok(ConflictContent {
        path: file_path.to_string(),
        base,
        ours,
        theirs,
        merged,
        language,
    })
}

/// Get file content at a specific merge stage (1=base, 2=ours, 3=theirs).
fn git_show_stage(worktree_path: &Path, stage: u8, file_path: &str) -> String {
    let ref_spec = format!(":{}:{}", stage, file_path);
    let output = platform::command("git")
        .args(["show", &ref_spec])
        .current_dir(worktree_path)
        .output();

    match output {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).to_string(),
        _ => String::new(),
    }
}

/// Resolve a single file's conflict using a strategy.
pub fn resolve_conflict(
    worktree_path: &Path,
    file_path: &str,
    strategy: &str,
) -> Result<(), AppError> {
    match strategy {
        "ours" => {
            let output = platform::command("git")
                .args(["checkout", "--ours", file_path])
                .current_dir(worktree_path)
                .output()?;
            if !output.status.success() {
                return Err(AppError::GitError(
                    String::from_utf8_lossy(&output.stderr).to_string(),
                ));
            }
        }
        "theirs" => {
            let output = platform::command("git")
                .args(["checkout", "--theirs", file_path])
                .current_dir(worktree_path)
                .output()?;
            if !output.status.success() {
                return Err(AppError::GitError(
                    String::from_utf8_lossy(&output.stderr).to_string(),
                ));
            }
        }
        // "manual" - assume the file has already been edited
        _ => {}
    }

    // Stage the resolved file
    let output = platform::command("git")
        .args(["add", file_path])
        .current_dir(worktree_path)
        .output()?;

    if !output.status.success() {
        return Err(AppError::GitError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    Ok(())
}

/// Abort an in-progress merge.
pub fn abort_merge(worktree_path: &Path) -> Result<(), AppError> {
    // Try merge --abort first, then rebase --abort
    let output = platform::command("git")
        .args(["merge", "--abort"])
        .current_dir(worktree_path)
        .output()?;

    if !output.status.success() {
        // May be a rebase instead
        let rebase_output = platform::command("git")
            .args(["rebase", "--abort"])
            .current_dir(worktree_path)
            .output()?;

        if !rebase_output.status.success() {
            return Err(AppError::GitError(
                "Failed to abort merge/rebase".to_string(),
            ));
        }
    }

    Ok(())
}

/// Continue merge after all conflicts resolved.
pub fn continue_merge(worktree_path: &Path) -> Result<(), AppError> {
    // Try rebase --continue first (more common after pull --rebase)
    let rebase_output = platform::command("git")
        .args(["rebase", "--continue"])
        .env("GIT_EDITOR", "true")
        .current_dir(worktree_path)
        .output()?;

    if rebase_output.status.success() {
        return Ok(());
    }

    // Fall back to committing the merge
    let output = platform::command("git")
        .args(["commit", "--no-edit"])
        .current_dir(worktree_path)
        .output()?;

    if !output.status.success() {
        return Err(AppError::GitError(format!(
            "Failed to continue merge: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(())
}

/// Diff files between two branches.
pub fn cross_worktree_diff(
    repo_path: &Path,
    branch_a: &str,
    branch_b: &str,
) -> Result<DiffResult, AppError> {
    let range = format!("{}...{}", branch_a, branch_b);

    // Get file statuses
    let name_status_output = platform::command("git")
        .args(["diff", "--name-status", &range])
        .current_dir(repo_path)
        .output()?;

    // Get line counts
    let numstat_output = platform::command("git")
        .args(["diff", "--numstat", &range])
        .current_dir(repo_path)
        .output()?;

    let name_status_str = String::from_utf8_lossy(&name_status_output.stdout);
    let numstat_str = String::from_utf8_lossy(&numstat_output.stdout);

    // Parse numstat
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

    Ok(DiffResult {
        files,
        total_additions,
        total_deletions,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_repo_with_branch() -> (tempfile::TempDir, std::path::PathBuf) {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        // Create a feature branch
        std::process::Command::new("git")
            .args(["checkout", "-b", "feature"])
            .current_dir(&path)
            .output()
            .unwrap();
        std::fs::write(path.join("feature.txt"), "feature content").unwrap();
        std::process::Command::new("git")
            .args(["add", "."])
            .current_dir(&path)
            .output()
            .unwrap();
        std::process::Command::new("git")
            .args(["commit", "-m", "feature commit"])
            .current_dir(&path)
            .output()
            .unwrap();
        (_dir, path)
    }

    #[test]
    fn test_get_branch_status() {
        let (_dir, path) = setup_repo_with_branch();
        let result = get_branch_status(&path, "feature", "main");
        assert!(result.is_ok());
        let status = result.unwrap();
        assert_eq!(status.branch, "feature");
        assert_eq!(status.default_branch, "main");
        assert!(!status.has_upstream);
    }

    #[test]
    fn test_get_branch_status_no_upstream() {
        let (_dir, path) = setup_repo_with_branch();
        let status = get_branch_status(&path, "feature", "main").unwrap();
        // No remote, so ahead/behind are 0 (origin/main doesn't exist)
        assert_eq!(status.ahead, 0);
        assert_eq!(status.behind, 0);
        assert!(!status.has_upstream);
    }

    #[test]
    fn test_get_conflicted_files_no_conflicts() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let files = get_conflicted_files(&path).unwrap();
        assert!(files.is_empty());
    }

    #[test]
    fn test_get_conflict_content() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        // No conflict, should return empty content for stages
        let result = get_conflict_content(&path, "nonexistent.txt");
        assert!(result.is_ok());
        let content = result.unwrap();
        assert!(content.base.is_empty());
        assert!(content.ours.is_empty());
        assert!(content.theirs.is_empty());
    }

    #[test]
    fn test_resolve_conflict_manual() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        std::fs::write(path.join("test.txt"), "resolved content").unwrap();
        // "manual" strategy just stages the file
        let result = resolve_conflict(&path, "test.txt", "manual");
        assert!(result.is_ok());
    }

    #[test]
    fn test_abort_merge_no_merge_in_progress() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let result = abort_merge(&path);
        // Should fail since no merge is in progress
        assert!(result.is_err());
    }

    #[test]
    fn test_continue_merge_no_merge_in_progress() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let result = continue_merge(&path);
        assert!(result.is_err());
    }

    #[test]
    fn test_cross_worktree_diff() {
        let (_dir, path) = setup_repo_with_branch();
        let result = cross_worktree_diff(&path, "main", "feature");
        assert!(result.is_ok());
        let diff = result.unwrap();
        assert!(!diff.files.is_empty());
        assert!(diff.total_additions > 0);
    }

    #[test]
    fn test_cross_worktree_diff_same_branch() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let result = cross_worktree_diff(&path, "main", "main");
        assert!(result.is_ok());
        let diff = result.unwrap();
        assert!(diff.files.is_empty());
    }

    #[test]
    fn test_git_show_stage() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        // No merge stages, should return empty string
        let result = git_show_stage(&path, 1, "test.txt");
        assert!(result.is_empty());
    }

    #[test]
    fn test_fetch_upstream_no_remote() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let result = fetch_upstream(&path);
        assert!(result.is_err()); // No remote configured
    }

    #[test]
    fn test_pull_rebase_no_remote() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let result = pull_rebase(&path, "main");
        assert!(result.is_ok());
        let pr = result.unwrap();
        assert!(!pr.success);
    }

    #[test]
    fn test_pull_merge_no_remote() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let result = pull_merge(&path, "main");
        assert!(result.is_ok());
        let pr = result.unwrap();
        assert!(!pr.success);
    }

    #[test]
    fn test_get_unmerged_files_clean() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let files = get_unmerged_files(&path);
        assert!(files.is_empty());
    }

    #[test]
    fn test_cross_worktree_diff_with_multiple_changes() {
        let (_dir, path) = setup_repo_with_branch();
        // Add more files on the feature branch
        std::fs::write(path.join("new_file.txt"), "new content").unwrap();
        std::fs::write(path.join("README.md"), "modified content").unwrap();
        std::process::Command::new("git")
            .args(["add", "."])
            .current_dir(&path)
            .output()
            .unwrap();
        std::process::Command::new("git")
            .args(["commit", "-m", "more changes"])
            .current_dir(&path)
            .output()
            .unwrap();

        let result = cross_worktree_diff(&path, "main", "feature").unwrap();
        // Should have feature.txt, new_file.txt, and modified README.md
        assert!(result.files.len() >= 2);
        assert!(result.total_additions > 0);
    }

    #[test]
    fn test_cross_worktree_diff_deleted_file() {
        let (_dir, path) = setup_repo_with_branch();
        // Delete README.md on feature branch
        std::fs::remove_file(path.join("README.md")).unwrap();
        std::process::Command::new("git")
            .args(["add", "."])
            .current_dir(&path)
            .output()
            .unwrap();
        std::process::Command::new("git")
            .args(["commit", "-m", "delete readme"])
            .current_dir(&path)
            .output()
            .unwrap();

        let result = cross_worktree_diff(&path, "main", "feature").unwrap();
        let deleted = result.files.iter().find(|f| f.path == "README.md");
        if let Some(d) = deleted {
            assert!(matches!(d.status, FileStatus::Deleted));
            assert!(d.deletions > 0);
        }
    }

    #[test]
    fn test_cross_worktree_diff_totals_are_sum_of_files() {
        let (_dir, path) = setup_repo_with_branch();
        // Add another file
        std::fs::write(path.join("extra.txt"), "extra\nlines\nhere\n").unwrap();
        std::process::Command::new("git")
            .args(["add", "."])
            .current_dir(&path)
            .output()
            .unwrap();
        std::process::Command::new("git")
            .args(["commit", "-m", "add extra"])
            .current_dir(&path)
            .output()
            .unwrap();

        let result = cross_worktree_diff(&path, "main", "feature").unwrap();
        let sum_add: u32 = result.files.iter().map(|f| f.additions).sum();
        let sum_del: u32 = result.files.iter().map(|f| f.deletions).sum();
        assert_eq!(result.total_additions, sum_add);
        assert_eq!(result.total_deletions, sum_del);
    }

    #[test]
    fn test_get_file_at_ref() {
        let (_dir, path) = setup_repo_with_branch();
        let result = get_file_at_ref(&path, "main", "feature", "feature.txt");
        assert!(result.is_ok());
        let content = result.unwrap();
        assert_eq!(content.path, "feature.txt");
        // File doesn't exist on main, so original should be empty
        assert!(content.original.is_empty());
        // File exists on feature
        assert_eq!(content.modified, "feature content");
    }

    #[test]
    fn test_get_file_at_ref_existing_on_both() {
        let (_dir, path) = setup_repo_with_branch();
        // README.md exists on both branches
        let result = get_file_at_ref(&path, "main", "feature", "README.md");
        assert!(result.is_ok());
        let content = result.unwrap();
        assert!(!content.original.is_empty());
        assert!(!content.modified.is_empty());
    }

    #[test]
    fn test_get_file_at_ref_nonexistent_file() {
        let (_dir, path) = setup_repo_with_branch();
        let result = get_file_at_ref(&path, "main", "feature", "no_such_file.txt");
        assert!(result.is_ok());
        let content = result.unwrap();
        assert!(content.original.is_empty());
        assert!(content.modified.is_empty());
    }

    #[test]
    fn test_get_file_at_ref_detects_language() {
        let (_dir, path) = setup_repo_with_branch();
        // Create a .rs file on feature branch
        std::fs::write(path.join("main.rs"), "fn main() {}").unwrap();
        std::process::Command::new("git")
            .args(["add", "."])
            .current_dir(&path)
            .output()
            .unwrap();
        std::process::Command::new("git")
            .args(["commit", "-m", "add rust file"])
            .current_dir(&path)
            .output()
            .unwrap();

        let result = get_file_at_ref(&path, "main", "feature", "main.rs").unwrap();
        assert_eq!(result.language, "rust");
    }

    #[test]
    fn test_resolve_conflict_manual_stages_file() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        std::fs::write(path.join("resolved.txt"), "resolved content").unwrap();
        // "manual" strategy just runs git add
        let result = resolve_conflict(&path, "resolved.txt", "manual");
        assert!(result.is_ok());
        // Verify file is staged
        let output = std::process::Command::new("git")
            .args(["diff", "--cached", "--name-only"])
            .current_dir(&path)
            .output()
            .unwrap();
        let staged = String::from_utf8_lossy(&output.stdout);
        assert!(staged.contains("resolved.txt"));
    }

    #[test]
    fn test_resolve_conflict_unknown_strategy_stages_file() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        std::fs::write(path.join("file.txt"), "content").unwrap();
        // Unknown strategy falls through to just staging the file
        let result = resolve_conflict(&path, "file.txt", "unknown_strategy");
        assert!(result.is_ok());
    }

    #[test]
    fn test_get_conflict_content_detects_language() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let content = get_conflict_content(&path, "main.rs").unwrap();
        assert_eq!(content.language, "rust");
        assert_eq!(content.path, "main.rs");
    }

    #[test]
    fn test_get_branch_status_on_main() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let status = get_branch_status(&path, "main", "main").unwrap();
        assert_eq!(status.branch, "main");
        assert_eq!(status.default_branch, "main");
        assert!(!status.has_upstream);
    }

    #[test]
    fn test_git_show_stage_all_stages_empty() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        for stage in 1..=3 {
            let result = git_show_stage(&path, stage, "README.md");
            assert!(result.is_empty());
        }
    }
}

/// Get file content at a specific git ref for cross-worktree comparison.
pub fn get_file_at_ref(
    repo_path: &Path,
    branch_a: &str,
    branch_b: &str,
    file_path: &str,
) -> Result<FileDiffContent, AppError> {
    let original = {
        let ref_spec = format!("{}:{}", branch_a, file_path);
        let output = platform::command("git")
            .args(["show", &ref_spec])
            .current_dir(repo_path)
            .output()?;
        if output.status.success() {
            String::from_utf8_lossy(&output.stdout).to_string()
        } else {
            String::new()
        }
    };

    let modified = {
        let ref_spec = format!("{}:{}", branch_b, file_path);
        let output = platform::command("git")
            .args(["show", &ref_spec])
            .current_dir(repo_path)
            .output()?;
        if output.status.success() {
            String::from_utf8_lossy(&output.stdout).to_string()
        } else {
            String::new()
        }
    };

    let language = detect_language(file_path);

    Ok(FileDiffContent {
        path: file_path.to_string(),
        original,
        modified,
        language,
    })
}
