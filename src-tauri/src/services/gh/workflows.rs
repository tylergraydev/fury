use std::path::Path;

use crate::error::AppError;
use crate::models::pr::{RunLogsResult, WorkflowJob, WorkflowRun, WorkflowStep};
use crate::platform;

use super::{find_gh_binary, is_benign_not_found};

/// Parse a list of `WorkflowRun` from the JSON array returned by `gh run list`.
pub fn parse_workflow_runs_from_json(raw: &[serde_json::Value]) -> Vec<WorkflowRun> {
    raw.iter()
        .map(|run| WorkflowRun {
            id: run.get("databaseId").and_then(|v| v.as_u64()).unwrap_or(0),
            name: run
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            workflow_name: run
                .get("workflowName")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            status: run
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            conclusion: run
                .get("conclusion")
                .and_then(|v| v.as_str())
                .map(String::from),
            event: run
                .get("event")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            created_at: run
                .get("createdAt")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        })
        .collect()
}

pub fn get_workflow_runs(worktree_path: &Path, branch: &str) -> Result<Vec<WorkflowRun>, AppError> {
    let gh = find_gh_binary()?;
    let output = platform::command(&gh)
        .args([
            "run",
            "list",
            "--branch",
            branch,
            "--json",
            "databaseId,status,conclusion,name,workflowName,event,createdAt",
            "--limit",
            "20",
        ])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh run list: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if is_benign_not_found(&stderr) {
            return Ok(Vec::new());
        }
        return Err(AppError::PrError(format!("gh run list failed: {}", stderr)));
    }

    let raw: Vec<serde_json::Value> = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse workflow runs: {}", e)))?;

    Ok(parse_workflow_runs_from_json(&raw))
}

/// Parse a list of `WorkflowJob` from the JSON returned by `gh run view --json jobs`.
pub fn parse_run_jobs_from_json(raw: &serde_json::Value) -> Vec<WorkflowJob> {
    let jobs = raw
        .get("jobs")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    jobs.iter()
        .map(|job| WorkflowJob {
            id: job.get("databaseId").and_then(|v| v.as_u64()).unwrap_or(0),
            name: job
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            status: job
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            conclusion: job
                .get("conclusion")
                .and_then(|v| v.as_str())
                .map(String::from),
            steps: job
                .get("steps")
                .and_then(|v| v.as_array())
                .map(|steps| {
                    steps
                        .iter()
                        .map(|step| WorkflowStep {
                            name: step
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            status: step
                                .get("status")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            conclusion: step
                                .get("conclusion")
                                .and_then(|v| v.as_str())
                                .map(String::from),
                        })
                        .collect()
                })
                .unwrap_or_default(),
        })
        .collect()
}

pub fn get_run_jobs(worktree_path: &Path, run_id: u64) -> Result<Vec<WorkflowJob>, AppError> {
    let gh = find_gh_binary()?;
    let output = platform::command(&gh)
        .args(["run", "view", &run_id.to_string(), "--json", "jobs"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh run view: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::PrError(format!(
            "gh run view failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    let raw: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse run jobs: {}", e)))?;

    Ok(parse_run_jobs_from_json(&raw))
}

/// Truncate log output to `max_bytes`, respecting char boundaries.
/// Returns `(logs, truncated)`.
pub fn truncate_logs(full: &str, max_bytes: usize) -> (String, bool) {
    let truncated = full.len() > max_bytes;
    let logs = if truncated {
        let mut end = max_bytes;
        while end < full.len() && !full.is_char_boundary(end) {
            end += 1;
        }
        full[..end].to_string()
    } else {
        full.to_string()
    };
    (logs, truncated)
}

/// Select the `gh run view` log flag based on whether we want only failed logs.
pub fn log_flag_for_failed_only(failed_only: bool) -> &'static str {
    if failed_only {
        "--log-failed"
    } else {
        "--log"
    }
}

pub fn get_run_logs(
    worktree_path: &Path,
    run_id: u64,
    failed_only: bool,
) -> Result<RunLogsResult, AppError> {
    let gh = find_gh_binary()?;
    let log_flag = log_flag_for_failed_only(failed_only);
    let output = platform::command(&gh)
        .args(["run", "view", &run_id.to_string(), log_flag])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh run view --log: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::PrError(format!(
            "gh run view --log failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    let full = String::from_utf8_lossy(&output.stdout);
    let (logs, truncated) = truncate_logs(&full, 100_000);

    Ok(RunLogsResult { logs, truncated })
}

/// Build the argument list for `gh run rerun`.
pub fn build_rerun_args(run_id_str: &str, failed_only: bool) -> Vec<&str> {
    let mut args = vec!["run", "rerun", run_id_str];
    if failed_only {
        args.push("--failed");
    }
    args
}

pub fn rerun_workflow(
    worktree_path: &Path,
    run_id: u64,
    failed_only: bool,
) -> Result<(), AppError> {
    let gh = find_gh_binary()?;
    let run_id_str = run_id.to_string();
    let args = build_rerun_args(&run_id_str, failed_only);

    let output = platform::command(&gh)
        .args(&args)
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh run rerun: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::PrError(format!(
            "gh run rerun failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- parse_workflow_runs_from_json tests ---

    #[test]
    fn test_parse_workflow_runs_from_json_full() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[
            {
                "databaseId": 12345,
                "name": "CI",
                "workflowName": "Build and Test",
                "status": "completed",
                "conclusion": "success",
                "event": "push",
                "createdAt": "2025-06-01T10:00:00Z"
            },
            {
                "databaseId": 12346,
                "name": "Deploy",
                "workflowName": "Deploy to Prod",
                "status": "in_progress",
                "conclusion": null,
                "event": "workflow_dispatch",
                "createdAt": "2025-06-01T11:00:00Z"
            }
        ]"#,
        )
        .unwrap();
        let runs = parse_workflow_runs_from_json(&raw);
        assert_eq!(runs.len(), 2);
        assert_eq!(runs[0].id, 12345);
        assert_eq!(runs[0].name, "CI");
        assert_eq!(runs[0].workflow_name, "Build and Test");
        assert_eq!(runs[0].status, "completed");
        assert_eq!(runs[0].conclusion, Some("success".to_string()));
        assert_eq!(runs[0].event, "push");
        assert_eq!(runs[0].created_at, "2025-06-01T10:00:00Z");

        assert_eq!(runs[1].id, 12346);
        assert_eq!(runs[1].conclusion, None);
        assert_eq!(runs[1].status, "in_progress");
    }

    #[test]
    fn test_parse_workflow_runs_from_json_empty() {
        let raw: Vec<serde_json::Value> = vec![];
        assert!(parse_workflow_runs_from_json(&raw).is_empty());
    }

    #[test]
    fn test_parse_workflow_runs_from_json_defaults() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(r#"[{}]"#).unwrap();
        let runs = parse_workflow_runs_from_json(&raw);
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].id, 0);
        assert_eq!(runs[0].name, "");
        assert_eq!(runs[0].workflow_name, "");
        assert_eq!(runs[0].status, "");
        assert_eq!(runs[0].conclusion, None);
        assert_eq!(runs[0].event, "");
        assert_eq!(runs[0].created_at, "");
    }

    // --- parse_run_jobs_from_json tests ---

    #[test]
    fn test_parse_run_jobs_from_json_full() {
        let raw = serde_json::json!({
            "jobs": [
                {
                    "databaseId": 100,
                    "name": "build",
                    "status": "completed",
                    "conclusion": "success",
                    "steps": [
                        {
                            "name": "Checkout",
                            "status": "completed",
                            "conclusion": "success"
                        },
                        {
                            "name": "Run tests",
                            "status": "completed",
                            "conclusion": "failure"
                        }
                    ]
                },
                {
                    "databaseId": 101,
                    "name": "deploy",
                    "status": "queued",
                    "conclusion": null,
                    "steps": []
                }
            ]
        });
        let jobs = parse_run_jobs_from_json(&raw);
        assert_eq!(jobs.len(), 2);

        assert_eq!(jobs[0].id, 100);
        assert_eq!(jobs[0].name, "build");
        assert_eq!(jobs[0].status, "completed");
        assert_eq!(jobs[0].conclusion, Some("success".to_string()));
        assert_eq!(jobs[0].steps.len(), 2);
        assert_eq!(jobs[0].steps[0].name, "Checkout");
        assert_eq!(jobs[0].steps[0].status, "completed");
        assert_eq!(jobs[0].steps[0].conclusion, Some("success".to_string()));
        assert_eq!(jobs[0].steps[1].name, "Run tests");
        assert_eq!(jobs[0].steps[1].conclusion, Some("failure".to_string()));

        assert_eq!(jobs[1].id, 101);
        assert_eq!(jobs[1].name, "deploy");
        assert_eq!(jobs[1].status, "queued");
        assert_eq!(jobs[1].conclusion, None);
        assert!(jobs[1].steps.is_empty());
    }

    #[test]
    fn test_parse_run_jobs_from_json_no_jobs_key() {
        let raw = serde_json::json!({});
        let jobs = parse_run_jobs_from_json(&raw);
        assert!(jobs.is_empty());
    }

    #[test]
    fn test_parse_run_jobs_from_json_empty_jobs() {
        let raw = serde_json::json!({"jobs": []});
        let jobs = parse_run_jobs_from_json(&raw);
        assert!(jobs.is_empty());
    }

    #[test]
    fn test_parse_run_jobs_from_json_no_steps_key() {
        let raw = serde_json::json!({
            "jobs": [{"databaseId": 50, "name": "test", "status": "completed"}]
        });
        let jobs = parse_run_jobs_from_json(&raw);
        assert_eq!(jobs.len(), 1);
        assert!(jobs[0].steps.is_empty());
    }

    #[test]
    fn test_parse_run_jobs_from_json_defaults() {
        let raw = serde_json::json!({"jobs": [{}]});
        let jobs = parse_run_jobs_from_json(&raw);
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].id, 0);
        assert_eq!(jobs[0].name, "");
        assert_eq!(jobs[0].status, "");
        assert_eq!(jobs[0].conclusion, None);
        assert!(jobs[0].steps.is_empty());
    }

    // --- truncate_logs tests ---

    #[test]
    fn test_truncate_logs_short_string() {
        let (logs, truncated) = truncate_logs("hello world", 100);
        assert_eq!(logs, "hello world");
        assert!(!truncated);
    }

    #[test]
    fn test_truncate_logs_exact_boundary() {
        let input = "abcde";
        let (logs, truncated) = truncate_logs(input, 5);
        assert_eq!(logs, "abcde");
        assert!(!truncated);
    }

    #[test]
    fn test_truncate_logs_truncates() {
        let input = "abcdefghij";
        let (logs, truncated) = truncate_logs(input, 5);
        assert_eq!(logs, "abcde");
        assert!(truncated);
    }

    #[test]
    fn test_truncate_logs_empty() {
        let (logs, truncated) = truncate_logs("", 100);
        assert_eq!(logs, "");
        assert!(!truncated);
    }

    #[test]
    fn test_truncate_logs_multibyte_char_boundary() {
        // Multi-byte UTF-8: each emoji is 4 bytes
        let input = "\u{1F600}\u{1F601}\u{1F602}"; // 12 bytes total
                                                   // Truncate at 5 bytes - mid-char, should advance to byte 8 (end of second emoji)
        let (logs, truncated) = truncate_logs(input, 5);
        assert!(truncated);
        // Should include up to the next valid char boundary after byte 5,
        // which is byte 8 (end of second emoji)
        assert_eq!(logs, "\u{1F600}\u{1F601}");
    }

    #[test]
    fn test_truncate_logs_zero_max() {
        let (logs, truncated) = truncate_logs("abc", 0);
        assert_eq!(logs, "");
        assert!(truncated);
    }

    // --- log_flag_for_failed_only tests ---

    #[test]
    fn test_log_flag_for_failed_only_true() {
        assert_eq!(log_flag_for_failed_only(true), "--log-failed");
    }

    #[test]
    fn test_log_flag_for_failed_only_false() {
        assert_eq!(log_flag_for_failed_only(false), "--log");
    }

    // --- build_rerun_args tests ---

    #[test]
    fn test_build_rerun_args_no_failed() {
        let args = build_rerun_args("12345", false);
        assert_eq!(args, vec!["run", "rerun", "12345"]);
    }

    #[test]
    fn test_build_rerun_args_with_failed() {
        let args = build_rerun_args("67890", true);
        assert_eq!(args, vec!["run", "rerun", "67890", "--failed"]);
    }

    #[test]
    fn test_parse_workflow_runs_with_null_conclusion() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[{
            "databaseId": 5000,
            "name": "Tests",
            "workflowName": "CI Pipeline",
            "status": "in_progress",
            "conclusion": null,
            "event": "pull_request",
            "createdAt": "2025-06-18T09:00:00Z"
        }]"#,
        )
        .unwrap();
        let runs = parse_workflow_runs_from_json(&raw);
        assert_eq!(runs[0].id, 5000);
        assert_eq!(runs[0].conclusion, None);
        assert_eq!(runs[0].event, "pull_request");
    }

    #[test]
    fn test_parse_run_jobs_with_nested_steps() {
        let raw = serde_json::json!({
            "jobs": [{
                "databaseId": 200,
                "name": "integration-tests",
                "status": "completed",
                "conclusion": "failure",
                "steps": [
                    {"name": "Setup Node", "status": "completed", "conclusion": "success"},
                    {"name": "Install deps", "status": "completed", "conclusion": "success"},
                    {"name": "Run e2e", "status": "completed", "conclusion": "failure"},
                    {"name": "Upload artifacts", "status": "completed", "conclusion": "skipped"}
                ]
            }]
        });
        let jobs = parse_run_jobs_from_json(&raw);
        assert_eq!(jobs[0].steps.len(), 4);
        assert_eq!(jobs[0].steps[2].name, "Run e2e");
        assert_eq!(jobs[0].steps[2].conclusion, Some("failure".to_string()));
        assert_eq!(jobs[0].steps[3].conclusion, Some("skipped".to_string()));
    }
}
