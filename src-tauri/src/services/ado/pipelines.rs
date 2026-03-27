use crate::error::AppError;
use crate::models::pr::{WorkflowJob, WorkflowRun, WorkflowStep};

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
