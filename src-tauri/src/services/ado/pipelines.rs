use crate::error::AppError;
use crate::models::pr::{RunLogsResult, TaskLog, WorkflowJob, WorkflowRun, WorkflowStep};

use super::{ado_err, api_base, client};
use super::mapping::{map_build_result, map_build_status, parse_workflow_run};

/// Get pipeline/build runs for a branch.
pub async fn get_pipeline_runs(
    pat: &str,
    org: &str,
    project: &str,
    branch: &str,
) -> Result<Vec<WorkflowRun>, AppError> {
    let c = client(pat)?;
    let url = format!(
        "{}/build/builds?branchName=refs/heads/{}&$top=20&api-version=7.1",
        api_base(org, project),
        branch
    );

    let resp = c.get(&url).send().await.map_err(ado_err)?;

    if !resp.status().is_success() {
        return Ok(Vec::new());
    }

    let raw: serde_json::Value = resp.json().await.map_err(ado_err)?;
    let builds = raw["value"].as_array().cloned().unwrap_or_default();

    Ok(builds.iter().map(parse_workflow_run).collect())
}

/// Get build timeline (jobs/steps).
pub async fn get_build_timeline(
    pat: &str,
    org: &str,
    project: &str,
    build_id: u64,
) -> Result<Vec<WorkflowJob>, AppError> {
    let c = client(pat)?;
    let url = format!(
        "{}/build/builds/{}/timeline?api-version=7.1",
        api_base(org, project),
        build_id
    );

    let resp = c.get(&url).send().await.map_err(ado_err)?;

    if !resp.status().is_success() {
        return Ok(Vec::new());
    }

    let raw: serde_json::Value = resp.json().await.map_err(ado_err)?;
    let records = raw["records"].as_array().cloned().unwrap_or_default();

    // ADO timeline has a flat list of records with parentId relationships.
    // Jobs have type "Job", steps have type "Task" with a parentId pointing to a Job.
    let mut jobs: Vec<WorkflowJob> = Vec::new();

    // First pass: collect jobs
    let job_records: Vec<&serde_json::Value> = records
        .iter()
        .filter(|r| r["type"].as_str() == Some("Job"))
        .collect();

    for job in &job_records {
        let job_id = job["id"].as_str().unwrap_or("");

        // Collect steps for this job
        let steps: Vec<WorkflowStep> = records
            .iter()
            .filter(|r| {
                r["type"].as_str() == Some("Task") && r["parentId"].as_str() == Some(job_id)
            })
            .map(|step| WorkflowStep {
                name: step["name"].as_str().unwrap_or("").to_string(),
                status: map_build_status(step["state"].as_str().unwrap_or("")),
                conclusion: step["result"].as_str().map(map_build_result),
            })
            .collect();

        jobs.push(WorkflowJob {
            id: job["id"]
                .as_str()
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(0),
            name: job["name"].as_str().unwrap_or("").to_string(),
            status: map_build_status(job["state"].as_str().unwrap_or("")),
            conclusion: job["result"].as_str().map(map_build_result),
            steps,
        });
    }

    Ok(jobs)
}

/// Get structured per-task logs for a build.
#[allow(dead_code)]
pub async fn get_build_logs(
    pat: &str,
    org: &str,
    project: &str,
    build_id: u64,
    failed_only: bool,
) -> Result<RunLogsResult, AppError> {
    let c = client(pat)?;

    // Step 1: Fetch the build timeline
    let timeline_url = format!(
        "{}/build/builds/{}/timeline?api-version=7.1",
        api_base(org, project),
        build_id
    );
    let timeline_resp = c.get(&timeline_url).send().await.map_err(ado_err)?;

    if !timeline_resp.status().is_success() {
        return Ok(RunLogsResult {
            logs: String::new(),
            truncated: false,
            task_logs: Some(Vec::new()),
        });
    }

    let timeline_raw: serde_json::Value = timeline_resp.json().await.map_err(ado_err)?;
    let records = timeline_raw["records"].as_array().cloned().unwrap_or_default();

    // Step 2: Build a map of Job record IDs → job names
    let job_name_map: std::collections::HashMap<String, String> = records
        .iter()
        .filter(|r| r["type"].as_str() == Some("Job"))
        .filter_map(|r| {
            let id = r["id"].as_str()?.to_string();
            let name = r["name"].as_str()?.to_string();
            Some((id, name))
        })
        .collect();

    // Step 3: Iterate task records and fetch logs
    let mut task_logs: Vec<TaskLog> = Vec::new();
    let mut all_logs = String::new();

    for record in &records {
        if record["type"].as_str() != Some("Task") {
            continue;
        }

        let log_id = match record["log"]["id"].as_u64() {
            Some(id) => id,
            None => continue,
        };

        let result_str = record["result"].as_str().unwrap_or("");
        if failed_only && result_str != "failed" {
            continue;
        }

        // Fetch log content
        let log_url = format!(
            "{}/build/builds/{}/logs/{}?api-version=7.1",
            api_base(org, project),
            build_id,
            log_id
        );
        let log_resp = c.get(&log_url).send().await.map_err(ado_err)?;
        let log_content = if log_resp.status().is_success() {
            log_resp.text().await.unwrap_or_default()
        } else {
            String::new()
        };

        let task_name = record["name"].as_str().unwrap_or("").to_string();
        let parent_id = record["parentId"].as_str().unwrap_or("");
        let job_name = job_name_map
            .get(parent_id)
            .cloned()
            .unwrap_or_default();
        let status = map_build_status(record["state"].as_str().unwrap_or(""));
        let conclusion = record["result"].as_str().map(map_build_result);

        all_logs.push_str(&format!("=== {} / {} ===\n{}\n", job_name, task_name, log_content));

        task_logs.push(TaskLog {
            task_name,
            job_name,
            log_content,
            status,
            conclusion,
        });
    }

    let truncated = all_logs.len() > 500_000;
    Ok(RunLogsResult {
        logs: all_logs,
        truncated,
        task_logs: Some(task_logs),
    })
}

/// Rerun (re-queue) a build by its ID.
#[allow(dead_code)]
pub async fn rerun_build(
    pat: &str,
    org: &str,
    project: &str,
    build_id: u64,
) -> Result<(), AppError> {
    let c = client(pat)?;

    // Step 1: Get the existing build to get definition ID and source branch
    let get_url = format!(
        "{}/build/builds/{}?api-version=7.1",
        api_base(org, project),
        build_id
    );
    let get_resp = c.get(&get_url).send().await.map_err(ado_err)?;

    if !get_resp.status().is_success() {
        let status = get_resp.status();
        let text = get_resp.text().await.unwrap_or_default();
        return Err(ado_err(format!(
            "Get build failed (HTTP {}): {}",
            status, text
        )));
    }

    let build_data: serde_json::Value = get_resp.json().await.map_err(ado_err)?;
    let def_id = build_data["definition"]["id"]
        .as_u64()
        .ok_or_else(|| ado_err("Build definition id missing"))?;
    let source_branch = build_data["sourceBranch"]
        .as_str()
        .unwrap_or("")
        .to_string();

    // Step 2: Queue a new build
    let post_url = format!(
        "{}/build/builds?api-version=7.1",
        api_base(org, project)
    );
    let payload = serde_json::json!({
        "definition": { "id": def_id },
        "sourceBranch": source_branch,
    });

    let post_resp = c.post(&post_url).json(&payload).send().await.map_err(ado_err)?;

    if !post_resp.status().is_success() {
        let status = post_resp.status();
        let text = post_resp.text().await.unwrap_or_default();
        return Err(ado_err(format!(
            "Rerun build failed (HTTP {}): {}",
            status, text
        )));
    }

    Ok(())
}
