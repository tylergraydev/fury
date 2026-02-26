use std::path::Path;

use crate::error::AppError;
use crate::models::stash::{StashDetail, StashEntry, StashFileStat};
use crate::platform;

/// List all stashes in the repository.
pub fn list_stashes(worktree_path: &Path) -> Result<Vec<StashEntry>, AppError> {
    let output = platform::command("git")
        .args([
            "stash",
            "list",
            "--format=%gd\x1f%gs\x1f%creatordate:iso-strict",
        ])
        .current_dir(worktree_path)
        .output()?;

    if !output.status.success() {
        // No stashes is not an error — git stash list exits 0 even when empty,
        // but just in case, return empty.
        return Ok(Vec::new());
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let entries = text
        .lines()
        .filter(|l| !l.is_empty())
        .filter_map(parse_stash_list_line)
        .collect();

    Ok(entries)
}

/// Parse a single line from `git stash list --format=%gd\x1f%gs\x1f%creatordate:iso-strict`.
/// Example line: "stash@{0}\x1fWIP on main: abc1234 commit msg\x1f2024-01-15T10:30:00+00:00"
fn parse_stash_list_line(line: &str) -> Option<StashEntry> {
    let parts: Vec<&str> = line.splitn(3, '\x1f').collect();
    if parts.len() < 3 {
        return None;
    }

    let ref_name = parts[0]; // e.g. "stash@{0}"
    let subject = parts[1];
    let timestamp = parts[2].trim().to_string();

    // Extract index from "stash@{N}"
    let index = ref_name
        .strip_prefix("stash@{")
        .and_then(|s| s.strip_suffix('}'))
        .and_then(|s| s.parse::<u32>().ok())?;

    // Extract branch from subject like "WIP on main: ..." or "On main: ..."
    let branch = extract_branch_from_subject(subject);
    let message = extract_message_from_subject(subject);

    Some(StashEntry {
        index,
        message,
        branch,
        timestamp,
    })
}

/// Extract branch name from stash subject.
/// Subjects look like "WIP on main: abc1234 msg" or "On main: abc1234 msg" or custom messages.
fn extract_branch_from_subject(subject: &str) -> String {
    // Try "WIP on <branch>:" or "On <branch>:"
    for prefix in &["WIP on ", "On "] {
        if let Some(rest) = subject.strip_prefix(prefix) {
            if let Some(colon_pos) = rest.find(':') {
                return rest[..colon_pos].to_string();
            }
        }
    }
    String::new()
}

/// Extract a human-readable message from stash subject.
/// For default stashes: "WIP on main: abc1234 commit message" -> "abc1234 commit message"
/// For custom messages: the message itself.
fn extract_message_from_subject(subject: &str) -> String {
    for prefix in &["WIP on ", "On "] {
        if let Some(rest) = subject.strip_prefix(prefix) {
            if let Some(colon_pos) = rest.find(':') {
                let after_colon = &rest[colon_pos + 1..];
                return after_colon.trim().to_string();
            }
        }
    }
    subject.to_string()
}

/// Create a new stash.
pub fn create_stash(
    worktree_path: &Path,
    message: Option<&str>,
    include_untracked: bool,
) -> Result<StashEntry, AppError> {
    let mut args = vec!["stash", "push"];
    if include_untracked {
        args.push("-u");
    }

    let msg_string;
    if let Some(msg) = message {
        if !msg.is_empty() {
            args.push("-m");
            msg_string = msg.to_string();
            args.push(&msg_string);
        }
    }

    let output = platform::command("git")
        .args(&args)
        .current_dir(worktree_path)
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // "No local changes to save" is a common non-error
        if stderr.contains("No local changes to save")
            || String::from_utf8_lossy(&output.stdout).contains("No local changes to save")
        {
            return Err(AppError::GitError("No local changes to save".into()));
        }
        return Err(AppError::GitError(format!(
            "git stash push failed: {}",
            stderr
        )));
    }

    // After creating, the new stash is at index 0. Fetch its details.
    let stashes = list_stashes(worktree_path)?;
    stashes
        .into_iter()
        .find(|s| s.index == 0)
        .ok_or_else(|| AppError::GitError("Failed to find newly created stash".into()))
}

/// Apply a stash without removing it from the stash list.
pub fn apply_stash(worktree_path: &Path, index: u32) -> Result<(), AppError> {
    let stash_ref = format!("stash@{{{}}}", index);
    let output = platform::command("git")
        .args(["stash", "apply", &stash_ref])
        .current_dir(worktree_path)
        .output()?;

    if !output.status.success() {
        return Err(AppError::GitError(format!(
            "git stash apply failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(())
}

/// Pop a stash — apply and remove it.
pub fn pop_stash(worktree_path: &Path, index: u32) -> Result<(), AppError> {
    let stash_ref = format!("stash@{{{}}}", index);
    let output = platform::command("git")
        .args(["stash", "pop", &stash_ref])
        .current_dir(worktree_path)
        .output()?;

    if !output.status.success() {
        return Err(AppError::GitError(format!(
            "git stash pop failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(())
}

/// Drop (delete) a stash.
pub fn drop_stash(worktree_path: &Path, index: u32) -> Result<(), AppError> {
    let stash_ref = format!("stash@{{{}}}", index);
    let output = platform::command("git")
        .args(["stash", "drop", &stash_ref])
        .current_dir(worktree_path)
        .output()?;

    if !output.status.success() {
        return Err(AppError::GitError(format!(
            "git stash drop failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(())
}

/// Show the contents of a stash (file stats + patch).
pub fn show_stash(worktree_path: &Path, index: u32) -> Result<StashDetail, AppError> {
    let stash_ref = format!("stash@{{{}}}", index);

    // Get file stats via --numstat
    let numstat_output = platform::command("git")
        .args(["stash", "show", "--numstat", &stash_ref])
        .current_dir(worktree_path)
        .output()?;

    let files = if numstat_output.status.success() {
        String::from_utf8_lossy(&numstat_output.stdout)
            .lines()
            .filter(|l| !l.is_empty())
            .filter_map(|line| {
                let parts: Vec<&str> = line.split('\t').collect();
                if parts.len() >= 3 {
                    let additions = parts[0].parse::<u32>().unwrap_or(0);
                    let deletions = parts[1].parse::<u32>().unwrap_or(0);
                    let path = parts[2].to_string();
                    Some(StashFileStat {
                        path,
                        additions,
                        deletions,
                    })
                } else {
                    None
                }
            })
            .collect()
    } else {
        Vec::new()
    };

    // Get full patch
    let patch_output = platform::command("git")
        .args(["stash", "show", "-p", &stash_ref])
        .current_dir(worktree_path)
        .output()?;

    let patch = if patch_output.status.success() {
        String::from_utf8_lossy(&patch_output.stdout)
            .trim()
            .to_string()
    } else {
        String::new()
    };

    // Get message from stash list
    let stashes = list_stashes(worktree_path)?;
    let message = stashes
        .iter()
        .find(|s| s.index == index)
        .map(|s| s.message.clone())
        .unwrap_or_default();

    Ok(StashDetail {
        index,
        message,
        files,
        patch,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_stash_list_line_wip() {
        let line = "stash@{0}\x1fWIP on main: abc1234 commit msg\x1f2024-01-15T10:30:00+00:00";
        let entry = parse_stash_list_line(line).unwrap();
        assert_eq!(entry.index, 0);
        assert_eq!(entry.branch, "main");
        assert_eq!(entry.message, "abc1234 commit msg");
        assert_eq!(entry.timestamp, "2024-01-15T10:30:00+00:00");
    }

    #[test]
    fn test_parse_stash_list_line_on_prefix() {
        let line = "stash@{2}\x1fOn feature/test: def5678 another msg\x1f2024-02-20T14:00:00+00:00";
        let entry = parse_stash_list_line(line).unwrap();
        assert_eq!(entry.index, 2);
        assert_eq!(entry.branch, "feature/test");
        assert_eq!(entry.message, "def5678 another msg");
    }

    #[test]
    fn test_parse_stash_list_line_custom_message() {
        let line = "stash@{1}\x1fOn main: my custom stash message\x1f2024-03-01T08:00:00+00:00";
        let entry = parse_stash_list_line(line).unwrap();
        assert_eq!(entry.index, 1);
        assert_eq!(entry.branch, "main");
        assert_eq!(entry.message, "my custom stash message");
    }

    #[test]
    fn test_parse_stash_list_line_invalid() {
        assert!(parse_stash_list_line("garbage").is_none());
        assert!(parse_stash_list_line("").is_none());
    }

    #[test]
    fn test_parse_stash_list_line_bad_index() {
        let line = "stash@{abc}\x1fWIP on main: msg\x1f2024-01-01T00:00:00+00:00";
        assert!(parse_stash_list_line(line).is_none());
    }

    #[test]
    fn test_extract_branch_from_subject() {
        assert_eq!(
            extract_branch_from_subject("WIP on main: abc123 msg"),
            "main"
        );
        assert_eq!(
            extract_branch_from_subject("On feature/branch: msg"),
            "feature/branch"
        );
        assert_eq!(extract_branch_from_subject("custom message"), "");
    }

    #[test]
    fn test_extract_message_from_subject() {
        assert_eq!(
            extract_message_from_subject("WIP on main: abc123 msg"),
            "abc123 msg"
        );
        assert_eq!(
            extract_message_from_subject("On main: my stash"),
            "my stash"
        );
        assert_eq!(
            extract_message_from_subject("custom message"),
            "custom message"
        );
    }
}
