use std::path::Path;

use crate::error::AppError;
use crate::models::pr::PrCheck;
use crate::platform;

use super::find_gh_binary;

/// Maps `gh pr checks` `state` field to `(status, conclusion)` to match the
/// frontend's expected shape. The `state` field combines lifecycle and outcome:
/// terminal states like SUCCESS/FAILURE map to status=COMPLETED with a conclusion,
/// while in-progress states map to their lifecycle name with no conclusion.
fn map_check_state(state: &str) -> (String, Option<String>) {
    match state {
        "SUCCESS" => ("COMPLETED".to_string(), Some("SUCCESS".to_string())),
        "FAILURE" | "ERROR" | "STARTUP_FAILURE" => {
            ("COMPLETED".to_string(), Some("FAILURE".to_string()))
        }
        "NEUTRAL" => ("COMPLETED".to_string(), Some("NEUTRAL".to_string())),
        "CANCELLED" => ("COMPLETED".to_string(), Some("CANCELLED".to_string())),
        "TIMED_OUT" => ("COMPLETED".to_string(), Some("TIMED_OUT".to_string())),
        "SKIPPED" => ("COMPLETED".to_string(), Some("SKIPPED".to_string())),
        "ACTION_REQUIRED" => ("COMPLETED".to_string(), Some("ACTION_REQUIRED".to_string())),
        "STALE" => ("COMPLETED".to_string(), Some("STALE".to_string())),
        "PENDING" | "EXPECTED" => ("IN_PROGRESS".to_string(), None),
        "QUEUED" => ("QUEUED".to_string(), None),
        other => (other.to_string(), None),
    }
}

/// Parse a list of `PrCheck` from the JSON array returned by `gh pr checks --json name,state,link,description`.
pub fn parse_pr_checks_from_json(raw: &[serde_json::Value]) -> Vec<PrCheck> {
    raw.iter()
        .map(|check| {
            let state = check
                .get("state")
                .and_then(|v| v.as_str())
                .unwrap_or("UNKNOWN");
            let (status, conclusion) = map_check_state(state);
            PrCheck {
                name: check
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                status,
                conclusion,
                details_url: check.get("link").and_then(|v| v.as_str()).map(String::from),
                description: check
                    .get("description")
                    .and_then(|v| v.as_str())
                    .map(String::from),
            }
        })
        .collect()
}

/// Check whether a stderr message from `gh pr checks` or `gh run list` indicates
/// a benign "not found" condition rather than a real error.
pub fn is_benign_not_found(stderr: &str) -> bool {
    stderr.contains("no pull request")
        || stderr.contains("no checks")
        || stderr.contains("could not find")
        || stderr.contains("no runs")
}

pub fn get_pr_checks(worktree_path: &Path) -> Result<Vec<PrCheck>, AppError> {
    let gh = find_gh_binary()?;
    let output = platform::command(&gh)
        .args(["pr", "checks", "--json", "name,state,link,description"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh pr checks: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if is_benign_not_found(&stderr) {
            return Ok(Vec::new());
        }
        return Err(AppError::PrError(format!(
            "gh pr checks failed: {}",
            stderr
        )));
    }

    let raw: Vec<serde_json::Value> = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse checks output: {}", e)))?;

    Ok(parse_pr_checks_from_json(&raw))
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- map_check_state tests ---

    #[test]
    fn test_map_check_state_success() {
        let (status, conclusion) = map_check_state("SUCCESS");
        assert_eq!(status, "COMPLETED");
        assert_eq!(conclusion, Some("SUCCESS".to_string()));
    }

    #[test]
    fn test_map_check_state_failure() {
        let (status, conclusion) = map_check_state("FAILURE");
        assert_eq!(status, "COMPLETED");
        assert_eq!(conclusion, Some("FAILURE".to_string()));
    }

    #[test]
    fn test_map_check_state_error() {
        let (status, conclusion) = map_check_state("ERROR");
        assert_eq!(status, "COMPLETED");
        assert_eq!(conclusion, Some("FAILURE".to_string()));
    }

    #[test]
    fn test_map_check_state_startup_failure() {
        let (status, conclusion) = map_check_state("STARTUP_FAILURE");
        assert_eq!(status, "COMPLETED");
        assert_eq!(conclusion, Some("FAILURE".to_string()));
    }

    #[test]
    fn test_map_check_state_pending() {
        let (status, conclusion) = map_check_state("PENDING");
        assert_eq!(status, "IN_PROGRESS");
        assert_eq!(conclusion, None);
    }

    #[test]
    fn test_map_check_state_expected() {
        let (status, conclusion) = map_check_state("EXPECTED");
        assert_eq!(status, "IN_PROGRESS");
        assert_eq!(conclusion, None);
    }

    #[test]
    fn test_map_check_state_action_required() {
        let (status, conclusion) = map_check_state("ACTION_REQUIRED");
        assert_eq!(status, "COMPLETED");
        assert_eq!(conclusion, Some("ACTION_REQUIRED".to_string()));
    }

    #[test]
    fn test_map_check_state_timed_out() {
        let (status, conclusion) = map_check_state("TIMED_OUT");
        assert_eq!(status, "COMPLETED");
        assert_eq!(conclusion, Some("TIMED_OUT".to_string()));
    }

    #[test]
    fn test_map_check_state_cancelled() {
        let (status, conclusion) = map_check_state("CANCELLED");
        assert_eq!(status, "COMPLETED");
        assert_eq!(conclusion, Some("CANCELLED".to_string()));
    }

    #[test]
    fn test_map_check_state_stale() {
        let (status, conclusion) = map_check_state("STALE");
        assert_eq!(status, "COMPLETED");
        assert_eq!(conclusion, Some("STALE".to_string()));
    }

    #[test]
    fn test_map_check_state_neutral() {
        let (status, conclusion) = map_check_state("NEUTRAL");
        assert_eq!(status, "COMPLETED");
        assert_eq!(conclusion, Some("NEUTRAL".to_string()));
    }

    #[test]
    fn test_map_check_state_skipped() {
        let (status, conclusion) = map_check_state("SKIPPED");
        assert_eq!(status, "COMPLETED");
        assert_eq!(conclusion, Some("SKIPPED".to_string()));
    }

    #[test]
    fn test_map_check_state_queued() {
        let (status, conclusion) = map_check_state("QUEUED");
        assert_eq!(status, "QUEUED");
        assert_eq!(conclusion, None);
    }

    #[test]
    fn test_map_check_state_in_progress() {
        let (status, conclusion) = map_check_state("IN_PROGRESS");
        assert_eq!(status, "IN_PROGRESS");
        assert_eq!(conclusion, None);
    }

    #[test]
    fn test_map_check_state_completed() {
        let (status, conclusion) = map_check_state("COMPLETED");
        assert_eq!(status, "COMPLETED");
        assert_eq!(conclusion, None);
    }

    #[test]
    fn test_map_check_state_unknown() {
        let (status, conclusion) = map_check_state("SOMETHING_ELSE");
        assert_eq!(status, "SOMETHING_ELSE");
        assert_eq!(conclusion, None);
    }

    // --- parse_pr_checks_from_json tests ---

    #[test]
    fn test_parse_pr_checks_from_json_multiple() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[
            {
                "name": "CI Build",
                "state": "SUCCESS",
                "link": "https://github.com/actions/runs/1",
                "description": "Build passed"
            },
            {
                "name": "Lint",
                "state": "FAILURE",
                "link": "https://github.com/actions/runs/2",
                "description": "Lint errors found"
            },
            {
                "name": "Deploy",
                "state": "PENDING",
                "link": null,
                "description": null
            }
        ]"#,
        )
        .unwrap();
        let checks = parse_pr_checks_from_json(&raw);
        assert_eq!(checks.len(), 3);

        assert_eq!(checks[0].name, "CI Build");
        assert_eq!(checks[0].status, "COMPLETED");
        assert_eq!(checks[0].conclusion, Some("SUCCESS".to_string()));
        assert_eq!(
            checks[0].details_url,
            Some("https://github.com/actions/runs/1".to_string())
        );
        assert_eq!(checks[0].description, Some("Build passed".to_string()));

        assert_eq!(checks[1].name, "Lint");
        assert_eq!(checks[1].status, "COMPLETED");
        assert_eq!(checks[1].conclusion, Some("FAILURE".to_string()));

        assert_eq!(checks[2].name, "Deploy");
        assert_eq!(checks[2].status, "IN_PROGRESS");
        assert_eq!(checks[2].conclusion, None);
        assert_eq!(checks[2].details_url, None);
        assert_eq!(checks[2].description, None);
    }

    #[test]
    fn test_parse_pr_checks_from_json_empty() {
        let raw: Vec<serde_json::Value> = vec![];
        let checks = parse_pr_checks_from_json(&raw);
        assert!(checks.is_empty());
    }

    #[test]
    fn test_parse_pr_checks_from_json_missing_state() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(r#"[{"name": "test"}]"#).unwrap();
        let checks = parse_pr_checks_from_json(&raw);
        assert_eq!(checks.len(), 1);
        assert_eq!(checks[0].name, "test");
        // missing state defaults to "UNKNOWN" which falls through to `other` arm
        assert_eq!(checks[0].status, "UNKNOWN");
        assert_eq!(checks[0].conclusion, None);
    }

    // --- parse_pr_checks integration with map_check_state ---

    #[test]
    fn test_parse_pr_checks_all_states() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[
            {"name": "a", "state": "SUCCESS"},
            {"name": "b", "state": "FAILURE"},
            {"name": "c", "state": "ERROR"},
            {"name": "d", "state": "STARTUP_FAILURE"},
            {"name": "e", "state": "NEUTRAL"},
            {"name": "f", "state": "CANCELLED"},
            {"name": "g", "state": "TIMED_OUT"},
            {"name": "h", "state": "SKIPPED"},
            {"name": "i", "state": "ACTION_REQUIRED"},
            {"name": "j", "state": "STALE"},
            {"name": "k", "state": "PENDING"},
            {"name": "l", "state": "EXPECTED"},
            {"name": "m", "state": "QUEUED"}
        ]"#,
        )
        .unwrap();
        let checks = parse_pr_checks_from_json(&raw);
        assert_eq!(checks.len(), 13);

        // SUCCESS -> COMPLETED/SUCCESS
        assert_eq!(checks[0].status, "COMPLETED");
        assert_eq!(checks[0].conclusion, Some("SUCCESS".to_string()));
        // FAILURE -> COMPLETED/FAILURE
        assert_eq!(checks[1].status, "COMPLETED");
        assert_eq!(checks[1].conclusion, Some("FAILURE".to_string()));
        // ERROR -> COMPLETED/FAILURE
        assert_eq!(checks[2].status, "COMPLETED");
        assert_eq!(checks[2].conclusion, Some("FAILURE".to_string()));
        // STARTUP_FAILURE -> COMPLETED/FAILURE
        assert_eq!(checks[3].status, "COMPLETED");
        assert_eq!(checks[3].conclusion, Some("FAILURE".to_string()));
        // NEUTRAL -> COMPLETED/NEUTRAL
        assert_eq!(checks[4].status, "COMPLETED");
        assert_eq!(checks[4].conclusion, Some("NEUTRAL".to_string()));
        // CANCELLED -> COMPLETED/CANCELLED
        assert_eq!(checks[5].status, "COMPLETED");
        assert_eq!(checks[5].conclusion, Some("CANCELLED".to_string()));
        // TIMED_OUT -> COMPLETED/TIMED_OUT
        assert_eq!(checks[6].status, "COMPLETED");
        assert_eq!(checks[6].conclusion, Some("TIMED_OUT".to_string()));
        // SKIPPED -> COMPLETED/SKIPPED
        assert_eq!(checks[7].status, "COMPLETED");
        assert_eq!(checks[7].conclusion, Some("SKIPPED".to_string()));
        // ACTION_REQUIRED -> COMPLETED/ACTION_REQUIRED
        assert_eq!(checks[8].status, "COMPLETED");
        assert_eq!(checks[8].conclusion, Some("ACTION_REQUIRED".to_string()));
        // STALE -> COMPLETED/STALE
        assert_eq!(checks[9].status, "COMPLETED");
        assert_eq!(checks[9].conclusion, Some("STALE".to_string()));
        // PENDING -> IN_PROGRESS/None
        assert_eq!(checks[10].status, "IN_PROGRESS");
        assert_eq!(checks[10].conclusion, None);
        // EXPECTED -> IN_PROGRESS/None
        assert_eq!(checks[11].status, "IN_PROGRESS");
        assert_eq!(checks[11].conclusion, None);
        // QUEUED -> QUEUED/None
        assert_eq!(checks[12].status, "QUEUED");
        assert_eq!(checks[12].conclusion, None);
    }

    // --- is_benign_not_found tests ---

    #[test]
    fn test_is_benign_not_found_no_pull_request() {
        assert!(is_benign_not_found("no pull request found for branch"));
    }

    #[test]
    fn test_is_benign_not_found_no_checks() {
        assert!(is_benign_not_found("no checks reported on this PR"));
    }

    #[test]
    fn test_is_benign_not_found_could_not_find() {
        assert!(is_benign_not_found(
            "could not find any matching pull requests"
        ));
    }

    #[test]
    fn test_is_benign_not_found_no_runs() {
        assert!(is_benign_not_found("no runs found for branch main"));
    }

    #[test]
    fn test_is_benign_not_found_real_error() {
        assert!(!is_benign_not_found("authentication required"));
    }

    #[test]
    fn test_is_benign_not_found_empty() {
        assert!(!is_benign_not_found(""));
    }

    #[test]
    fn test_is_benign_not_found_mixed_case() {
        // Currently case-sensitive
        assert!(!is_benign_not_found("No Pull Request"));
    }
}
