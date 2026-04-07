use crate::error::AppError;
use crate::models::diagnostic::LintDiagnostic;
use crate::state::AppState;
use std::process::Command;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
#[specta::specta]
pub async fn run_lint(
    state: State<'_, AppState>,
    repo_id: String,
    file_path: Option<String>,
) -> Result<Vec<LintDiagnostic>, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let repo_path = {
        let repos = state.repositories.read().unwrap();
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

    let mut diagnostics = Vec::new();

    // Try ESLint (for JS/TS projects). If the runner fails outright we must
    // propagate the error — returning an empty list silently would let users
    // believe "no lint errors" when really the linter never ran.
    if repo_path.join("node_modules/.bin/eslint").exists()
        || repo_path.join("package.json").exists()
    {
        match run_eslint(&repo_path, file_path.as_deref()) {
            Ok(results) => diagnostics.extend(results),
            Err(e) => {
                return Err(AppError::InternalError(format!(
                    "ESLint runner failed: {}",
                    e
                )));
            }
        }
    }

    // Try cargo clippy (for Rust projects)
    if repo_path.join("Cargo.toml").exists() {
        match run_clippy(&repo_path) {
            Ok(results) => diagnostics.extend(results),
            Err(e) => {
                return Err(AppError::InternalError(format!(
                    "Clippy runner failed: {}",
                    e
                )));
            }
        }
    }

    Ok(diagnostics)
}

fn run_eslint(
    repo_path: &std::path::Path,
    file_path: Option<&str>,
) -> Result<Vec<LintDiagnostic>, AppError> {
    let mut cmd = Command::new("npx");
    cmd.current_dir(repo_path)
        .args(["eslint", "--format", "json", "--no-error-on-unmatched-pattern"]);

    if let Some(fp) = file_path {
        cmd.arg(fp);
    } else {
        cmd.arg(".");
    }

    let output = cmd
        .output()
        .map_err(|e| AppError::InternalError(format!("Failed to run eslint: {}", e)))?;

    // ESLint exits non-zero when it finds problems; that's normal. It only
    // indicates runner failure when stdout is empty AND exit != 0.
    let stdout = String::from_utf8_lossy(&output.stdout);
    if stdout.trim().is_empty() && !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::InternalError(format!(
            "eslint exited {} with no JSON output: {}",
            output.status, stderr
        )));
    }
    parse_eslint_json(&stdout)
}

fn parse_eslint_json(json: &str) -> Result<Vec<LintDiagnostic>, AppError> {
    #[derive(serde::Deserialize)]
    struct EslintFile {
        #[serde(rename = "filePath")]
        file_path: String,
        messages: Vec<EslintMessage>,
    }
    #[derive(serde::Deserialize)]
    struct EslintMessage {
        line: Option<u32>,
        column: Option<u32>,
        severity: u32,
        message: String,
        #[serde(rename = "ruleId")]
        rule_id: Option<String>,
    }

    // An empty stdout means "no files linted" — return empty, not a parse
    // error. Any other stdout that can't be parsed as the ESLint JSON schema
    // means the runner misbehaved and we should surface it.
    if json.trim().is_empty() {
        return Ok(Vec::new());
    }
    let files: Vec<EslintFile> = serde_json::from_str(json).map_err(|e| {
        AppError::InternalError(format!("Failed to parse eslint JSON output: {}", e))
    })?;
    let mut results = Vec::new();
    for file in files {
        for msg in file.messages {
            results.push(LintDiagnostic {
                file_path: file.file_path.clone(),
                line: msg.line.unwrap_or(0),
                column: msg.column.unwrap_or(0),
                severity: match msg.severity {
                    2 => "error",
                    1 => "warning",
                    _ => "info",
                }
                .to_string(),
                message: msg.message,
                rule: msg.rule_id,
            });
        }
    }
    Ok(results)
}

fn run_clippy(repo_path: &std::path::Path) -> Result<Vec<LintDiagnostic>, AppError> {
    let output = Command::new("cargo")
        .current_dir(repo_path)
        .args(["clippy", "--message-format", "json", "--quiet"])
        .output()
        .map_err(|e| AppError::InternalError(format!("Failed to run clippy: {}", e)))?;

    // Clippy exits non-zero when there are warnings/errors — that's normal.
    // Runner failure is only signaled by an empty stdout with a non-success
    // status (e.g. compile error before diagnostics are emitted).
    let stdout = String::from_utf8_lossy(&output.stdout);
    if stdout.trim().is_empty() && !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::InternalError(format!(
            "cargo clippy exited {} with no JSON output: {}",
            output.status, stderr
        )));
    }
    parse_clippy_json(&stdout)
}

fn parse_clippy_json(output: &str) -> Result<Vec<LintDiagnostic>, AppError> {
    #[derive(serde::Deserialize)]
    struct CargoMessage {
        reason: Option<String>,
        message: Option<ClippyDiag>,
    }
    #[derive(serde::Deserialize)]
    struct ClippyDiag {
        message: String,
        level: String,
        spans: Vec<ClippySpan>,
        code: Option<ClippyCode>,
    }
    #[derive(serde::Deserialize)]
    struct ClippySpan {
        file_name: String,
        line_start: u32,
        column_start: u32,
    }
    #[derive(serde::Deserialize)]
    struct ClippyCode {
        code: String,
    }

    let mut results = Vec::new();
    for line in output.lines() {
        if let Ok(msg) = serde_json::from_str::<CargoMessage>(line) {
            if msg.reason.as_deref() != Some("compiler-message") {
                continue;
            }
            if let Some(diag) = msg.message {
                if diag.level == "note" || diag.level == "help" {
                    continue;
                }
                if let Some(span) = diag.spans.first() {
                    results.push(LintDiagnostic {
                        file_path: span.file_name.clone(),
                        line: span.line_start,
                        column: span.column_start,
                        severity: diag.level,
                        message: diag.message,
                        rule: diag.code.map(|c| c.code),
                    });
                }
            }
        }
    }
    Ok(results)
}
