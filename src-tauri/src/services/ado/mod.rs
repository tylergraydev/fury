use base64::Engine;

use crate::error::AppError;

pub mod mapping;
pub mod pipelines;
pub mod pulls;
pub mod work_items;

pub use pipelines::{get_build_timeline, get_pipeline_runs};
pub use pulls::{
    create_pr, get_pr_by_branch, get_pr_checks, get_pr_reviewers, get_pr_threads, list_prs,
    merge_pr,
};
#[allow(unused_imports)]
pub use work_items::*;

/// Build a `reqwest::Client` with the ADO PAT as Basic auth.
pub(super) fn client(pat: &str) -> Result<reqwest::Client, AppError> {
    let encoded = base64::engine::general_purpose::STANDARD.encode(format!(":{}", pat));
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::AUTHORIZATION,
        reqwest::header::HeaderValue::from_str(&format!("Basic {}", encoded))
            .map_err(|e| AppError::AzureDevOpsError(format!("Invalid PAT: {}", e)))?,
    );

    reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .map_err(|e| AppError::AzureDevOpsError(format!("Failed to build HTTP client: {}", e)))
}

pub(super) fn api_base(org: &str, project: &str) -> String {
    format!("https://dev.azure.com/{}/{}/_apis", org, project)
}

pub(super) fn ado_err(msg: impl std::fmt::Display) -> AppError {
    AppError::AzureDevOpsError(msg.to_string())
}

/// Verify PAT authentication by listing projects.
#[allow(dead_code)]
pub async fn check_auth(pat: &str, org: &str) -> Result<(), AppError> {
    let c = client(pat)?;
    let url = format!(
        "https://dev.azure.com/{}/_apis/projects?api-version=7.1&$top=1",
        org
    );
    let resp = c.get(&url).send().await.map_err(ado_err)?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(ado_err(format!(
            "Authentication failed (HTTP {}): {}",
            status, text
        )));
    }
    Ok(())
}
