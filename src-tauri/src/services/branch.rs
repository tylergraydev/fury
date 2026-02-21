use std::path::Path;
use std::process::Command;

use crate::error::AppError;
use crate::models::diff::{DiffResult, FileDiff, FileDiffContent, FileStatus};
use crate::models::merge::{
    BranchStatus, ConflictContent, ConflictType, ConflictedFile, PullResult,
};
use crate::services::diff::detect_language;

/// Get ahead/behind counts for the current branch relative to the default branch.
pub fn get_branch_status(
    worktree_path: &Path,
    branch: &str,
    default_branch: &str,
) -> Result<BranchStatus, AppError> {
    // Check if upstream exists
    let has_upstream = Command::new("git")
        .args(["rev-parse", "--verify", &format!("origin/{}", branch)])
        .current_dir(worktree_path)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    // Get ahead/behind relative to default branch
    let upstream_ref = format!("origin/{}", default_branch);
    let output = Command::new("git")
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
    let output = Command::new("git")
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
    let output = Command::new("git")
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
    let output = Command::new("git")
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
    let output = Command::new("git")
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
    let output = Command::new("git")
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
    let output = Command::new("git")
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
            let output = Command::new("git")
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
            let output = Command::new("git")
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
    let output = Command::new("git")
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
    let output = Command::new("git")
        .args(["merge", "--abort"])
        .current_dir(worktree_path)
        .output()?;

    if !output.status.success() {
        // May be a rebase instead
        let rebase_output = Command::new("git")
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
    let rebase_output = Command::new("git")
        .args(["rebase", "--continue"])
        .env("GIT_EDITOR", "true")
        .current_dir(worktree_path)
        .output()?;

    if rebase_output.status.success() {
        return Ok(());
    }

    // Fall back to committing the merge
    let output = Command::new("git")
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
    let name_status_output = Command::new("git")
        .args(["diff", "--name-status", &range])
        .current_dir(repo_path)
        .output()?;

    // Get line counts
    let numstat_output = Command::new("git")
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

/// Get file content at a specific git ref for cross-worktree comparison.
pub fn get_file_at_ref(
    repo_path: &Path,
    branch_a: &str,
    branch_b: &str,
    file_path: &str,
) -> Result<FileDiffContent, AppError> {
    let original = {
        let ref_spec = format!("{}:{}", branch_a, file_path);
        let output = Command::new("git")
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
        let output = Command::new("git")
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
