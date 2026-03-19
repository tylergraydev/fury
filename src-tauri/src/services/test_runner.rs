use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use uuid::Uuid;

use crate::db::Database;
use crate::error::AppError;
use crate::models::test_runner::*;
use crate::platform;

/// Detect the test framework based on files present in the repo root.
pub fn detect_framework(repo_path: &Path) -> Option<TestFramework> {
    // Vitest
    for name in &[
        "vitest.config.ts",
        "vitest.config.js",
        "vitest.config.mts",
        "vitest.config.mjs",
    ] {
        if repo_path.join(name).exists() {
            return Some(TestFramework::Vitest);
        }
    }

    // Jest (check config files first, then package.json)
    for name in &["jest.config.js", "jest.config.ts", "jest.config.mjs"] {
        if repo_path.join(name).exists() {
            return Some(TestFramework::Jest);
        }
    }
    if let Ok(contents) = std::fs::read_to_string(repo_path.join("package.json")) {
        if contents.contains("\"jest\"") {
            return Some(TestFramework::Jest);
        }
    }

    // Pytest
    if repo_path.join("pytest.ini").exists() || repo_path.join("conftest.py").exists() {
        return Some(TestFramework::Pytest);
    }
    if let Ok(contents) = std::fs::read_to_string(repo_path.join("pyproject.toml")) {
        if contents.contains("[tool.pytest") {
            return Some(TestFramework::Pytest);
        }
    }
    if let Ok(contents) = std::fs::read_to_string(repo_path.join("setup.cfg")) {
        if contents.contains("[tool:pytest]") {
            return Some(TestFramework::Pytest);
        }
    }

    // Cargo test
    if repo_path.join("Cargo.toml").exists() {
        return Some(TestFramework::CargoTest);
    }

    // Go test
    if repo_path.join("go.mod").exists() {
        return Some(TestFramework::GoTest);
    }

    None
}

/// Return default commands for a given framework.
pub fn default_commands(framework: &TestFramework) -> TestRunnerConfig {
    match framework {
        TestFramework::Vitest => TestRunnerConfig {
            framework: Some(TestFramework::Vitest),
            test_command: Some("npx vitest --reporter=json --run 2>/dev/null".to_string()),
            test_file_command: Some(
                "npx vitest --reporter=json --run {file} 2>/dev/null".to_string(),
            ),
            working_dir: None,
            coverage_command: None,
        },
        TestFramework::Jest => TestRunnerConfig {
            framework: Some(TestFramework::Jest),
            test_command: Some("npx jest --json 2>/dev/null".to_string()),
            test_file_command: Some("npx jest --json {file} 2>/dev/null".to_string()),
            working_dir: None,
            coverage_command: None,
        },
        TestFramework::Pytest => TestRunnerConfig {
            framework: Some(TestFramework::Pytest),
            test_command: Some("python -m pytest -v --tb=short".to_string()),
            test_file_command: Some("python -m pytest -v --tb=short {file}".to_string()),
            working_dir: None,
            coverage_command: None,
        },
        TestFramework::CargoTest => TestRunnerConfig {
            framework: Some(TestFramework::CargoTest),
            test_command: Some("cargo test 2>&1".to_string()),
            test_file_command: Some("cargo test {file} 2>&1".to_string()),
            working_dir: None,
            coverage_command: None,
        },
        TestFramework::GoTest => TestRunnerConfig {
            framework: Some(TestFramework::GoTest),
            test_command: Some("go test -v -json ./...".to_string()),
            test_file_command: Some("go test -v -json {file}".to_string()),
            working_dir: None,
            coverage_command: None,
        },
        TestFramework::Custom => TestRunnerConfig {
            framework: Some(TestFramework::Custom),
            test_command: None,
            test_file_command: None,
            working_dir: None,
            coverage_command: None,
        },
    }
}

/// Spawn a test process and stream output, then parse results on completion.
#[allow(clippy::too_many_arguments)]
pub async fn spawn_test_run(
    context_id: Uuid,
    command: &str,
    working_dir: &Path,
    framework: &TestFramework,
    env_vars: HashMap<String, String>,
    app_handle: AppHandle,
    db: Arc<Mutex<Option<Database>>>,
    repo_id: Uuid,
) -> Result<Child, AppError> {
    let shell = platform::default_shell();
    let flag = platform::shell_exec_flag();

    let mut cmd = Command::new(shell);
    cmd.arg(flag)
        .arg(command)
        .current_dir(working_dir)
        .envs(&env_vars)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(unix)]
    unsafe {
        cmd.pre_exec(|| {
            libc::setpgid(0, 0);
            Ok(())
        });
    }

    #[cfg(windows)]
    cmd.creation_flags(0x08000200); // CREATE_NO_WINDOW

    let mut child = cmd.spawn().map_err(|e| {
        AppError::ScriptError(format!("Failed to spawn test command: {}", e))
    })?;

    let event_name = format!("test-runner:{}", context_id);
    let framework_clone = framework.clone();

    // Collect stdout for parsing
    let stdout_lines = std::sync::Arc::new(tokio::sync::Mutex::new(Vec::<String>::new()));

    // Stream stdout
    let stdout_handle = if let Some(stdout) = child.stdout.take() {
        let app_out = app_handle.clone();
        let event_out = event_name.clone();
        let lines_ref = std::sync::Arc::clone(&stdout_lines);
        Some(tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                lines_ref.lock().await.push(line.clone());
                let _ = app_out.emit(
                    &event_out,
                    &TestRunEvent::OutputLine {
                        line,
                        stream: "stdout".to_string(),
                    },
                );
            }
        }))
    } else {
        None
    };

    // Stream stderr
    if let Some(stderr) = child.stderr.take() {
        let app_err = app_handle.clone();
        let event_err = event_name.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_err.emit(
                    &event_err,
                    &TestRunEvent::OutputLine {
                        line,
                        stream: "stderr".to_string(),
                    },
                );
            }
        });
    }

    // Background task: wait for stdout reader to finish, then parse output and emit results
    let app_final = app_handle.clone();
    let event_final = event_name;
    let lines_final = stdout_lines;
    tokio::spawn(async move {
        // Wait for the stdout reader to finish (i.e., process closed its stdout)
        if let Some(handle) = stdout_handle {
            let _ = handle.await;
        }

        let collected = lines_final.lock().await;
        let full_stdout = collected.join("\n");
        drop(collected);

        let summary = parse_output(&framework_clone, &full_stdout);
        match summary {
            Ok(s) => {
                // Persist test run history
                if let Ok(db_guard) = db.lock() {
                    if let Some(ref db_ref) = *db_guard {
                        let _ = db_ref.insert_test_run(&repo_id, &s);
                    }
                }
                let _ = app_final.emit(&event_final, &TestRunEvent::RunComplete { summary: s });
            }
            Err(e) => {
                let _ = app_final.emit(
                    &event_final,
                    &TestRunEvent::Error {
                        message: format!("Failed to parse test output: {}", e),
                    },
                );
            }
        }
    });

    Ok(child)
}

/// Parse test output based on framework.
pub fn parse_output(framework: &TestFramework, stdout: &str) -> Result<TestRunSummary, AppError> {
    match framework {
        TestFramework::Vitest | TestFramework::Jest => parse_vitest_json(stdout),
        TestFramework::Pytest => parse_pytest_verbose(stdout),
        TestFramework::CargoTest => parse_cargo_test(stdout),
        TestFramework::GoTest => parse_go_test_json(stdout),
        TestFramework::Custom => parse_generic(stdout),
    }
}

// ─── Vitest / Jest JSON Parser ───

/// Intermediate structs for vitest/jest JSON output
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct VitestOutput {
    #[serde(default)]
    num_total_tests: usize,
    #[serde(default)]
    num_passed_tests: usize,
    #[serde(default)]
    num_failed_tests: usize,
    #[serde(default)]
    num_pending_tests: usize,
    #[serde(default)]
    test_results: Vec<VitestFileResult>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct VitestFileResult {
    #[serde(default)]
    name: String,
    #[serde(default)]
    start_time: Option<f64>,
    #[serde(default)]
    end_time: Option<f64>,
    #[serde(default)]
    assertion_results: Vec<VitestAssertion>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct VitestAssertion {
    #[serde(default)]
    full_name: String,
    #[serde(default)]
    status: String,
    #[serde(default)]
    duration: Option<f64>,
    #[serde(default)]
    failure_messages: Vec<String>,
}

pub fn parse_vitest_json(stdout: &str) -> Result<TestRunSummary, AppError> {
    // The JSON output might be preceded by non-JSON lines; find the first '{'
    let json_start = stdout.find('{').ok_or_else(|| {
        AppError::ScriptError("No JSON found in test output".to_string())
    })?;
    // Find the matching closing brace
    let json_str = &stdout[json_start..];
    let output: VitestOutput = serde_json::from_str(json_str).map_err(|e| {
        AppError::ScriptError(format!("Failed to parse vitest/jest JSON: {}", e))
    })?;

    let mut suites = Vec::new();
    let mut total_duration = 0.0;

    for file_result in &output.test_results {
        let suite_name = make_relative_path(&file_result.name);
        let suite_duration = match (file_result.start_time, file_result.end_time) {
            (Some(start), Some(end)) => Some(end - start),
            _ => None,
        };
        if let Some(d) = suite_duration {
            total_duration += d;
        }

        let mut tests = Vec::new();
        let mut has_failure = false;
        let mut has_pass = false;

        for assertion in &file_result.assertion_results {
            let status = match assertion.status.as_str() {
                "passed" => {
                    has_pass = true;
                    TestStatus::Passed
                }
                "failed" => {
                    has_failure = true;
                    TestStatus::Failed
                }
                "pending" | "skipped" | "todo" | "disabled" => TestStatus::Skipped,
                _ => TestStatus::Skipped,
            };
            let failure_msg = if assertion.failure_messages.is_empty() {
                None
            } else {
                Some(assertion.failure_messages.join("\n"))
            };
            tests.push(TestResult {
                name: assertion.full_name.clone(),
                suite: suite_name.clone(),
                status,
                duration_ms: assertion.duration,
                failure_message: failure_msg,
            });
        }

        let suite_status = if has_failure {
            TestStatus::Failed
        } else if has_pass {
            TestStatus::Passed
        } else {
            TestStatus::Skipped
        };

        suites.push(TestSuite {
            name: suite_name,
            tests,
            status: suite_status,
            duration_ms: suite_duration,
        });
    }

    Ok(TestRunSummary {
        total: output.num_total_tests,
        passed: output.num_passed_tests,
        failed: output.num_failed_tests,
        skipped: output.num_pending_tests,
        duration_ms: total_duration,
        suites,
    })
}

// ─── Pytest Verbose Parser ───

pub fn parse_pytest_verbose(stdout: &str) -> Result<TestRunSummary, AppError> {
    let mut suites_map: HashMap<String, Vec<TestResult>> = HashMap::new();
    let mut total = 0;
    let mut passed = 0;
    let mut failed = 0;
    let mut skipped = 0;

    // Collect failure messages keyed by test name
    let mut failure_messages: HashMap<String, String> = HashMap::new();
    let mut current_failure_name: Option<String> = None;
    let mut current_failure_lines: Vec<String> = Vec::new();
    let mut in_failures_section = false;

    for line in stdout.lines() {
        if line.starts_with("= FAILURES =") || line.starts_with("=== FAILURES ===")
            || line.contains("FAILURES")
                && line.starts_with('=')
                && line.ends_with('=')
        {
            in_failures_section = true;
            continue;
        }

        if in_failures_section {
            if line.starts_with("_ ") && line.ends_with(" _") || line.starts_with("___ ") {
                // Save previous failure
                if let Some(ref name) = current_failure_name {
                    failure_messages.insert(name.clone(), current_failure_lines.join("\n"));
                }
                // Extract test name from ___ test_name ___
                let trimmed = line.trim_matches(|c: char| c == '_' || c == ' ');
                current_failure_name = Some(trimmed.to_string());
                current_failure_lines.clear();
            } else if line.starts_with("= ") && line.contains(" passed")
                || line.starts_with("=") && line.contains("short test summary")
            {
                // End of failures section
                if let Some(ref name) = current_failure_name {
                    failure_messages.insert(name.clone(), current_failure_lines.join("\n"));
                }
                in_failures_section = false;
            } else {
                current_failure_lines.push(line.to_string());
            }
            continue;
        }

        // Match test result lines: path::test_name PASSED/FAILED/SKIPPED
        if let Some((test_path, status_str)) = parse_pytest_line(line) {
            let (suite, test_name) = split_pytest_path(&test_path);
            let status = match status_str {
                "PASSED" => {
                    passed += 1;
                    TestStatus::Passed
                }
                "FAILED" | "ERROR" => {
                    failed += 1;
                    TestStatus::Failed
                }
                "SKIPPED" => {
                    skipped += 1;
                    TestStatus::Skipped
                }
                _ => {
                    skipped += 1;
                    TestStatus::Skipped
                }
            };
            total += 1;

            let failure_msg = failure_messages.get(&test_name).cloned();

            suites_map
                .entry(suite.clone())
                .or_default()
                .push(TestResult {
                    name: test_name,
                    suite,
                    status,
                    duration_ms: None,
                    failure_message: failure_msg,
                });
        }
    }

    // Also save final failure if any
    if let Some(ref name) = current_failure_name {
        if !failure_messages.contains_key(name) {
            failure_messages.insert(name.clone(), current_failure_lines.join("\n"));
        }
    }

    let suites = suites_map
        .into_iter()
        .map(|(name, tests)| {
            let has_failure = tests.iter().any(|t| t.status == TestStatus::Failed);
            let has_pass = tests.iter().any(|t| t.status == TestStatus::Passed);
            let status = if has_failure {
                TestStatus::Failed
            } else if has_pass {
                TestStatus::Passed
            } else {
                TestStatus::Skipped
            };
            TestSuite {
                name,
                tests,
                status,
                duration_ms: None,
            }
        })
        .collect();

    Ok(TestRunSummary {
        total,
        passed,
        failed,
        skipped,
        duration_ms: 0.0,
        suites,
    })
}

fn parse_pytest_line(line: &str) -> Option<(String, &str)> {
    // Pattern: tests/test_foo.py::test_bar PASSED  [ 50%]
    // or: tests/test_foo.py::TestClass::test_bar FAILED [100%]
    for status in &["PASSED", "FAILED", "SKIPPED", "ERROR"] {
        if let Some(pos) = line.find(status) {
            let path_part = line[..pos].trim();
            if path_part.contains("::") {
                return Some((path_part.to_string(), status));
            }
        }
    }
    None
}

fn split_pytest_path(path: &str) -> (String, String) {
    // "tests/test_foo.py::TestClass::test_bar" -> ("tests/test_foo.py", "TestClass::test_bar")
    if let Some(pos) = path.find("::") {
        (path[..pos].to_string(), path[pos + 2..].to_string())
    } else {
        ("(unknown)".to_string(), path.to_string())
    }
}

// ─── Cargo Test Parser ───

pub fn parse_cargo_test(stdout: &str) -> Result<TestRunSummary, AppError> {
    let mut suites_map: HashMap<String, Vec<TestResult>> = HashMap::new();
    let mut total = 0;
    let mut passed = 0;
    let mut failed = 0;
    let mut skipped = 0;

    // Cargo test output pattern:
    //   test module::test_name ... ok
    //   test module::test_name ... FAILED
    //   test module::test_name ... ignored
    for line in stdout.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with("test ") {
            continue;
        }

        let rest = &trimmed[5..]; // skip "test "
        if let Some(pos) = rest.rfind(" ... ") {
            let test_path = &rest[..pos];
            let result_str = rest[pos + 5..].trim();

            let (suite, test_name) = if let Some(last_sep) = test_path.rfind("::") {
                (
                    test_path[..last_sep].to_string(),
                    test_path[last_sep + 2..].to_string(),
                )
            } else {
                ("(root)".to_string(), test_path.to_string())
            };

            let status = match result_str {
                "ok" => {
                    passed += 1;
                    TestStatus::Passed
                }
                "FAILED" => {
                    failed += 1;
                    TestStatus::Failed
                }
                "ignored" => {
                    skipped += 1;
                    TestStatus::Skipped
                }
                _ => {
                    skipped += 1;
                    TestStatus::Skipped
                }
            };
            total += 1;

            suites_map
                .entry(suite.clone())
                .or_default()
                .push(TestResult {
                    name: test_name,
                    suite,
                    status,
                    duration_ms: None,
                    failure_message: None,
                });
        }
    }

    // Parse failure output sections
    // cargo test prints failures between "failures:" and "test result:"
    let mut in_failures = false;
    let mut current_failure_name: Option<String> = None;
    let mut current_failure_lines: Vec<String> = Vec::new();
    let mut failure_messages: HashMap<String, String> = HashMap::new();

    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed == "failures:" {
            in_failures = true;
            continue;
        }
        if in_failures && trimmed.starts_with("test result:") {
            if let Some(ref name) = current_failure_name {
                failure_messages.insert(name.clone(), current_failure_lines.join("\n"));
            }
            break;
        }
        if in_failures {
            if trimmed.starts_with("---- ") && trimmed.ends_with(" ----") {
                if let Some(ref name) = current_failure_name {
                    failure_messages.insert(name.clone(), current_failure_lines.join("\n"));
                }
                let test_name = trimmed
                    .trim_start_matches("---- ")
                    .trim_end_matches(" ----")
                    .trim_end_matches(" stdout")
                    .trim_end_matches(" stderr");
                current_failure_name = Some(test_name.to_string());
                current_failure_lines.clear();
            } else if current_failure_name.is_some() {
                current_failure_lines.push(line.to_string());
            }
        }
    }

    // Attach failure messages to tests
    for tests in suites_map.values_mut() {
        for test in tests.iter_mut() {
            let full_key = format!("{}::{}", test.suite, test.name);
            if let Some(msg) = failure_messages.get(&full_key) {
                test.failure_message = Some(msg.clone());
            }
        }
    }

    let suites = suites_map
        .into_iter()
        .map(|(name, tests)| {
            let has_failure = tests.iter().any(|t| t.status == TestStatus::Failed);
            let has_pass = tests.iter().any(|t| t.status == TestStatus::Passed);
            let status = if has_failure {
                TestStatus::Failed
            } else if has_pass {
                TestStatus::Passed
            } else {
                TestStatus::Skipped
            };
            TestSuite {
                name,
                tests,
                status,
                duration_ms: None,
            }
        })
        .collect();

    Ok(TestRunSummary {
        total,
        passed,
        failed,
        skipped,
        duration_ms: 0.0,
        suites,
    })
}

// ─── Go Test JSON Parser ───

#[derive(serde::Deserialize)]
#[allow(dead_code)]
struct GoTestEvent {
    #[serde(rename = "Action")]
    action: String,
    #[serde(rename = "Package")]
    package: Option<String>,
    #[serde(rename = "Test")]
    test: Option<String>,
    #[serde(rename = "Elapsed")]
    elapsed: Option<f64>,
    #[serde(rename = "Output")]
    output: Option<String>,
}

pub fn parse_go_test_json(stdout: &str) -> Result<TestRunSummary, AppError> {
    let mut suites_map: HashMap<String, Vec<TestResult>> = HashMap::new();
    let mut total = 0;
    let mut passed = 0;
    let mut failed = 0;
    let mut skipped = 0;
    // Collect output per test for failure messages
    let mut test_output: HashMap<String, Vec<String>> = HashMap::new();

    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || !trimmed.starts_with('{') {
            continue;
        }
        let event: GoTestEvent = match serde_json::from_str(trimmed) {
            Ok(e) => e,
            Err(_) => continue,
        };

        let test_name = match &event.test {
            Some(t) => t.clone(),
            None => continue,
        };
        let package = event.package.clone().unwrap_or_else(|| "(unknown)".to_string());
        let key = format!("{}::{}", package, test_name);

        match event.action.as_str() {
            "output" => {
                if let Some(output) = &event.output {
                    test_output.entry(key).or_default().push(output.clone());
                }
            }
            "pass" => {
                total += 1;
                passed += 1;
                suites_map
                    .entry(package.clone())
                    .or_default()
                    .push(TestResult {
                        name: test_name,
                        suite: package,
                        status: TestStatus::Passed,
                        duration_ms: event.elapsed.map(|e| e * 1000.0),
                        failure_message: None,
                    });
            }
            "fail" => {
                total += 1;
                failed += 1;
                let failure_msg = test_output.get(&key).map(|lines| lines.join(""));
                suites_map
                    .entry(package.clone())
                    .or_default()
                    .push(TestResult {
                        name: test_name,
                        suite: package,
                        status: TestStatus::Failed,
                        duration_ms: event.elapsed.map(|e| e * 1000.0),
                        failure_message: failure_msg,
                    });
            }
            "skip" => {
                total += 1;
                skipped += 1;
                suites_map
                    .entry(package.clone())
                    .or_default()
                    .push(TestResult {
                        name: test_name,
                        suite: package,
                        status: TestStatus::Skipped,
                        duration_ms: event.elapsed.map(|e| e * 1000.0),
                        failure_message: None,
                    });
            }
            _ => {}
        }
    }

    let suites = suites_map
        .into_iter()
        .map(|(name, tests)| {
            let has_failure = tests.iter().any(|t| t.status == TestStatus::Failed);
            let has_pass = tests.iter().any(|t| t.status == TestStatus::Passed);
            let status = if has_failure {
                TestStatus::Failed
            } else if has_pass {
                TestStatus::Passed
            } else {
                TestStatus::Skipped
            };
            TestSuite {
                name,
                tests,
                status,
                duration_ms: None,
            }
        })
        .collect();

    Ok(TestRunSummary {
        total,
        passed,
        failed,
        skipped,
        duration_ms: 0.0,
        suites,
    })
}

// ─── Generic Fallback Parser ───

pub fn parse_generic(stdout: &str) -> Result<TestRunSummary, AppError> {
    let mut total = 0;
    let mut passed = 0;
    let mut failed = 0;
    let mut tests = Vec::new();

    for line in stdout.lines() {
        let lower = line.to_lowercase();
        if lower.contains("pass") || lower.contains(" ok") {
            total += 1;
            passed += 1;
            tests.push(TestResult {
                name: line.trim().to_string(),
                suite: "(output)".to_string(),
                status: TestStatus::Passed,
                duration_ms: None,
                failure_message: None,
            });
        } else if lower.contains("fail") || lower.contains("error") {
            total += 1;
            failed += 1;
            tests.push(TestResult {
                name: line.trim().to_string(),
                suite: "(output)".to_string(),
                status: TestStatus::Failed,
                duration_ms: None,
                failure_message: Some(line.trim().to_string()),
            });
        }
    }

    let status = if failed > 0 {
        TestStatus::Failed
    } else if passed > 0 {
        TestStatus::Passed
    } else {
        TestStatus::Pending
    };

    Ok(TestRunSummary {
        total,
        passed,
        failed,
        skipped: 0,
        duration_ms: 0.0,
        suites: vec![TestSuite {
            name: "(output)".to_string(),
            tests,
            status,
            duration_ms: None,
        }],
    })
}

// ─── Helpers ───

fn make_relative_path(path: &str) -> String {
    // Try to extract a relative path from an absolute one
    // Look for common project directories
    for marker in &["/src/", "/tests/", "/test/", "/spec/", "/e2e/"] {
        if let Some(pos) = path.find(marker) {
            return path[pos + 1..].to_string();
        }
    }
    // If path contains node_modules or target, return as-is
    // Otherwise try to get the filename
    if let Some(pos) = path.rfind('/') {
        path[pos + 1..].to_string()
    } else {
        path.to_string()
    }
}

// ─── Coverage Parsing ───

/// Parse Istanbul v8 coverage-final.json format (Vitest/Jest)
pub fn parse_istanbul_coverage(json_str: &str) -> Result<CoverageReport, AppError> {
    let raw: serde_json::Value =
        serde_json::from_str(json_str).map_err(|e| AppError::ScriptError(e.to_string()))?;

    let obj = raw
        .as_object()
        .ok_or_else(|| AppError::ScriptError("Coverage JSON is not an object".to_string()))?;

    let mut files = Vec::new();
    let mut total_covered = 0u64;
    let mut total_statements = 0u64;

    for (file_path, data) in obj {
        let s_map = data.get("s").and_then(|v| v.as_object());
        let statement_map = data.get("statementMap").and_then(|v| v.as_object());

        let (covered, total_s, uncovered) = if let (Some(s), Some(sm)) = (s_map, statement_map) {
            let mut covered = 0u64;
            let mut uncovered_lines = Vec::new();

            for (key, count) in s {
                let c = count.as_u64().unwrap_or(0);
                if c > 0 {
                    covered += 1;
                } else if let Some(mapping) = sm.get(key) {
                    if let Some(start) = mapping.get("start").and_then(|s| s.get("line")).and_then(|l| l.as_u64()) {
                        uncovered_lines.push(start as u32);
                    }
                }
            }
            (covered, s.len() as u64, uncovered_lines)
        } else {
            (0, 0, vec![])
        };

        let lines_pct = if total_s > 0 {
            (covered as f32 / total_s as f32) * 100.0
        } else {
            100.0
        };

        total_covered += covered;
        total_statements += total_s;

        files.push(FileCoverage {
            file: make_relative_path(file_path),
            lines_pct,
            branches_pct: 0.0, // simplified — branch coverage requires parsing 'b' map
            uncovered_lines: uncovered,
        });
    }

    let total_lines_pct = if total_statements > 0 {
        (total_covered as f32 / total_statements as f32) * 100.0
    } else {
        100.0
    };

    Ok(CoverageReport {
        files,
        total_lines_pct,
        total_branches_pct: 0.0,
    })
}

/// Parse pytest-cov terminal table output
pub fn parse_pytest_cov(stdout: &str) -> Result<CoverageReport, AppError> {
    let mut files = Vec::new();
    let mut in_table = false;

    for line in stdout.lines() {
        let trimmed = line.trim();

        // Detect table header
        if trimmed.starts_with("Name") && trimmed.contains("Cover") {
            in_table = true;
            continue;
        }
        if trimmed.starts_with("---") || trimmed.starts_with("===") {
            continue;
        }
        if trimmed.starts_with("TOTAL") {
            // Parse total line
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            if parts.len() >= 4 {
                if let Some(pct_str) = parts.last() {
                    let pct = pct_str.trim_end_matches('%').parse::<f32>().unwrap_or(0.0);
                    return Ok(CoverageReport {
                        files,
                        total_lines_pct: pct,
                        total_branches_pct: 0.0,
                    });
                }
            }
            break;
        }

        if in_table && !trimmed.is_empty() {
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            if parts.len() >= 4 {
                let file = parts[0].to_string();
                let cover_pct = parts
                    .iter()
                    .rev()
                    .find_map(|p| p.trim_end_matches('%').parse::<f32>().ok())
                    .unwrap_or(0.0);
                files.push(FileCoverage {
                    file,
                    lines_pct: cover_pct,
                    branches_pct: 0.0,
                    uncovered_lines: vec![],
                });
            }
        }
    }

    // If we didn't find a TOTAL line, compute from files
    let total_pct = if files.is_empty() {
        0.0
    } else {
        files.iter().map(|f| f.lines_pct).sum::<f32>() / files.len() as f32
    };

    Ok(CoverageReport {
        files,
        total_lines_pct: total_pct,
        total_branches_pct: 0.0,
    })
}

/// Default coverage commands for each framework
pub fn default_coverage_command(framework: &TestFramework) -> Option<String> {
    match framework {
        TestFramework::Vitest => Some("npx vitest --coverage --reporter=json --run 2>/dev/null".to_string()),
        TestFramework::Jest => Some("npx jest --coverage --json 2>/dev/null".to_string()),
        TestFramework::Pytest => Some("python -m pytest --cov --cov-report=term -q".to_string()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_framework_none() {
        let tmp = std::env::temp_dir().join("fury_test_empty");
        let _ = std::fs::create_dir_all(&tmp);
        assert_eq!(detect_framework(&tmp), None);
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_detect_framework_vitest() {
        let tmp = std::env::temp_dir().join("fury_test_vitest");
        let _ = std::fs::create_dir_all(&tmp);
        std::fs::write(tmp.join("vitest.config.ts"), "export default {}").unwrap();
        assert_eq!(detect_framework(&tmp), Some(TestFramework::Vitest));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_detect_framework_cargo() {
        let tmp = std::env::temp_dir().join("fury_test_cargo");
        let _ = std::fs::create_dir_all(&tmp);
        std::fs::write(tmp.join("Cargo.toml"), "[package]").unwrap();
        assert_eq!(detect_framework(&tmp), Some(TestFramework::CargoTest));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_default_commands_vitest() {
        let config = default_commands(&TestFramework::Vitest);
        assert!(config.test_command.unwrap().contains("vitest"));
    }

    #[test]
    fn test_parse_vitest_json() {
        let json = r#"{
            "numTotalTestSuites": 1,
            "numPassedTestSuites": 1,
            "numFailedTestSuites": 0,
            "numTotalTests": 2,
            "numPassedTests": 1,
            "numFailedTests": 1,
            "numPendingTests": 0,
            "testResults": [
                {
                    "name": "/home/user/project/src/test.ts",
                    "startTime": 1000,
                    "endTime": 2000,
                    "assertionResults": [
                        {
                            "fullName": "should pass",
                            "status": "passed",
                            "duration": 5,
                            "failureMessages": []
                        },
                        {
                            "fullName": "should fail",
                            "status": "failed",
                            "duration": 10,
                            "failureMessages": ["Expected true to be false"]
                        }
                    ]
                }
            ]
        }"#;

        let summary = parse_vitest_json(json).unwrap();
        assert_eq!(summary.total, 2);
        assert_eq!(summary.passed, 1);
        assert_eq!(summary.failed, 1);
        assert_eq!(summary.suites.len(), 1);
        assert_eq!(summary.suites[0].tests.len(), 2);
        assert_eq!(summary.suites[0].tests[0].status, TestStatus::Passed);
        assert_eq!(summary.suites[0].tests[1].status, TestStatus::Failed);
        assert!(summary.suites[0].tests[1].failure_message.is_some());
    }

    #[test]
    fn test_parse_cargo_test() {
        let output = r#"
running 3 tests
test models::test_runner::tests::test_framework_serde ... ok
test models::test_runner::tests::test_config_default ... ok
test models::test_runner::tests::test_status_serde ... FAILED

failures:

---- models::test_runner::tests::test_status_serde stdout ----
assertion failed: status == "wrong"

test result: FAILED. 2 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out
"#;

        let summary = parse_cargo_test(output).unwrap();
        assert_eq!(summary.total, 3);
        assert_eq!(summary.passed, 2);
        assert_eq!(summary.failed, 1);
    }

    #[test]
    fn test_parse_pytest_verbose() {
        let output = r#"
============================= test session starts ==============================
collected 3 items

tests/test_math.py::test_add PASSED                                     [ 33%]
tests/test_math.py::test_subtract PASSED                                [ 66%]
tests/test_math.py::test_divide FAILED                                  [100%]

= FAILURES =
___ test_divide ___
ZeroDivisionError: division by zero

============================== 1 failed, 2 passed ==============================
"#;

        let summary = parse_pytest_verbose(output).unwrap();
        assert_eq!(summary.total, 3);
        assert_eq!(summary.passed, 2);
        assert_eq!(summary.failed, 1);
        assert_eq!(summary.suites.len(), 1);
    }

    #[test]
    fn test_parse_go_test_json() {
        let output = r#"
{"Time":"2024-01-01T00:00:00Z","Action":"run","Package":"pkg","Test":"TestAdd"}
{"Time":"2024-01-01T00:00:01Z","Action":"pass","Package":"pkg","Test":"TestAdd","Elapsed":0.5}
{"Time":"2024-01-01T00:00:00Z","Action":"run","Package":"pkg","Test":"TestFail"}
{"Time":"2024-01-01T00:00:01Z","Action":"fail","Package":"pkg","Test":"TestFail","Elapsed":0.3}
"#;

        let summary = parse_go_test_json(output).unwrap();
        assert_eq!(summary.total, 2);
        assert_eq!(summary.passed, 1);
        assert_eq!(summary.failed, 1);
    }

    #[test]
    fn test_make_relative_path() {
        assert_eq!(
            make_relative_path("/home/user/project/src/test.ts"),
            "src/test.ts"
        );
        assert_eq!(
            make_relative_path("/home/user/project/tests/test_foo.py"),
            "tests/test_foo.py"
        );
        assert_eq!(make_relative_path("test.ts"), "test.ts");
    }

    #[test]
    fn test_parse_generic() {
        let output = "PASS test_foo\nFAIL test_bar\nsome other line";
        let summary = parse_generic(output).unwrap();
        assert_eq!(summary.total, 2);
        assert_eq!(summary.passed, 1);
        assert_eq!(summary.failed, 1);
    }

    // --- detect_framework additional tests ---

    #[test]
    fn test_detect_framework_jest_config() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("jest.config.js"), "module.exports = {}").unwrap();
        assert_eq!(detect_framework(tmp.path()), Some(TestFramework::Jest));
    }

    #[test]
    fn test_detect_framework_jest_from_package_json() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("package.json"), r#"{"jest":{"testEnvironment":"jsdom"}}"#).unwrap();
        assert_eq!(detect_framework(tmp.path()), Some(TestFramework::Jest));
    }

    #[test]
    fn test_detect_framework_pytest_ini() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("pytest.ini"), "[pytest]").unwrap();
        assert_eq!(detect_framework(tmp.path()), Some(TestFramework::Pytest));
    }

    #[test]
    fn test_detect_framework_conftest() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("conftest.py"), "import pytest").unwrap();
        assert_eq!(detect_framework(tmp.path()), Some(TestFramework::Pytest));
    }

    #[test]
    fn test_detect_framework_pyproject_toml() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("pyproject.toml"), "[tool.pytest.ini_options]\naddopts = \"-v\"").unwrap();
        assert_eq!(detect_framework(tmp.path()), Some(TestFramework::Pytest));
    }

    #[test]
    fn test_detect_framework_setup_cfg() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("setup.cfg"), "[tool:pytest]\naddopts = -v").unwrap();
        assert_eq!(detect_framework(tmp.path()), Some(TestFramework::Pytest));
    }

    #[test]
    fn test_detect_framework_go() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("go.mod"), "module example.com/mymod").unwrap();
        assert_eq!(detect_framework(tmp.path()), Some(TestFramework::GoTest));
    }

    #[test]
    fn test_detect_framework_vitest_mts() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("vitest.config.mts"), "export default {}").unwrap();
        assert_eq!(detect_framework(tmp.path()), Some(TestFramework::Vitest));
    }

    #[test]
    fn test_detect_framework_vitest_mjs() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("vitest.config.mjs"), "export default {}").unwrap();
        assert_eq!(detect_framework(tmp.path()), Some(TestFramework::Vitest));
    }

    #[test]
    fn test_detect_framework_priority_vitest_over_jest() {
        // If both vitest and jest configs exist, vitest should win
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("vitest.config.ts"), "export default {}").unwrap();
        std::fs::write(tmp.path().join("jest.config.js"), "module.exports = {}").unwrap();
        assert_eq!(detect_framework(tmp.path()), Some(TestFramework::Vitest));
    }

    // --- default_commands tests ---

    #[test]
    fn test_default_commands_jest() {
        let config = default_commands(&TestFramework::Jest);
        assert!(config.test_command.unwrap().contains("jest"));
    }

    #[test]
    fn test_default_commands_pytest() {
        let config = default_commands(&TestFramework::Pytest);
        assert!(config.test_command.unwrap().contains("pytest"));
    }

    #[test]
    fn test_default_commands_cargo() {
        let config = default_commands(&TestFramework::CargoTest);
        assert!(config.test_command.unwrap().contains("cargo test"));
    }

    #[test]
    fn test_default_commands_go() {
        let config = default_commands(&TestFramework::GoTest);
        assert!(config.test_command.unwrap().contains("go test"));
    }

    #[test]
    fn test_default_commands_custom() {
        let config = default_commands(&TestFramework::Custom);
        assert!(config.test_command.is_none());
        assert!(config.test_file_command.is_none());
    }

    // --- default_coverage_command tests ---

    #[test]
    fn test_default_coverage_command_vitest() {
        assert!(default_coverage_command(&TestFramework::Vitest).unwrap().contains("coverage"));
    }

    #[test]
    fn test_default_coverage_command_jest() {
        assert!(default_coverage_command(&TestFramework::Jest).unwrap().contains("coverage"));
    }

    #[test]
    fn test_default_coverage_command_pytest() {
        assert!(default_coverage_command(&TestFramework::Pytest).unwrap().contains("cov"));
    }

    #[test]
    fn test_default_coverage_command_cargo_none() {
        assert!(default_coverage_command(&TestFramework::CargoTest).is_none());
    }

    #[test]
    fn test_default_coverage_command_go_none() {
        assert!(default_coverage_command(&TestFramework::GoTest).is_none());
    }

    // --- parse_pytest_line tests ---

    #[test]
    fn test_parse_pytest_line_passed() {
        let (path, status) = parse_pytest_line("tests/test_math.py::test_add PASSED  [ 50%]").unwrap();
        assert_eq!(path, "tests/test_math.py::test_add");
        assert_eq!(status, "PASSED");
    }

    #[test]
    fn test_parse_pytest_line_failed() {
        let (path, status) = parse_pytest_line("tests/test_math.py::test_div FAILED [100%]").unwrap();
        assert_eq!(path, "tests/test_math.py::test_div");
        assert_eq!(status, "FAILED");
    }

    #[test]
    fn test_parse_pytest_line_skipped() {
        let (path, status) = parse_pytest_line("tests/test_math.py::test_skip SKIPPED [ 75%]").unwrap();
        assert_eq!(path, "tests/test_math.py::test_skip");
        assert_eq!(status, "SKIPPED");
    }

    #[test]
    fn test_parse_pytest_line_error() {
        let (path, status) = parse_pytest_line("tests/test_math.py::test_err ERROR [100%]").unwrap();
        assert_eq!(path, "tests/test_math.py::test_err");
        assert_eq!(status, "ERROR");
    }

    #[test]
    fn test_parse_pytest_line_no_match() {
        assert!(parse_pytest_line("collected 5 items").is_none());
    }

    #[test]
    fn test_parse_pytest_line_class_method() {
        let (path, status) = parse_pytest_line("tests/test_cls.py::TestClass::test_method PASSED [100%]").unwrap();
        assert_eq!(path, "tests/test_cls.py::TestClass::test_method");
        assert_eq!(status, "PASSED");
    }

    // --- split_pytest_path tests ---

    #[test]
    fn test_split_pytest_path_simple() {
        let (suite, name) = split_pytest_path("tests/test_foo.py::test_bar");
        assert_eq!(suite, "tests/test_foo.py");
        assert_eq!(name, "test_bar");
    }

    #[test]
    fn test_split_pytest_path_with_class() {
        let (suite, name) = split_pytest_path("tests/test_foo.py::TestClass::test_bar");
        assert_eq!(suite, "tests/test_foo.py");
        assert_eq!(name, "TestClass::test_bar");
    }

    #[test]
    fn test_split_pytest_path_no_separator() {
        let (suite, name) = split_pytest_path("test_bar");
        assert_eq!(suite, "(unknown)");
        assert_eq!(name, "test_bar");
    }

    // --- make_relative_path tests ---

    #[test]
    fn test_make_relative_path_tests_dir() {
        assert_eq!(make_relative_path("/home/user/project/tests/test_foo.py"), "tests/test_foo.py");
    }

    #[test]
    fn test_make_relative_path_test_dir() {
        assert_eq!(make_relative_path("/home/user/project/test/foo.spec.ts"), "test/foo.spec.ts");
    }

    #[test]
    fn test_make_relative_path_spec_dir() {
        assert_eq!(make_relative_path("/home/user/project/spec/helper.rb"), "spec/helper.rb");
    }

    #[test]
    fn test_make_relative_path_e2e_dir() {
        assert_eq!(make_relative_path("/home/user/project/e2e/login.test.ts"), "e2e/login.test.ts");
    }

    #[test]
    fn test_make_relative_path_no_marker_extracts_filename() {
        assert_eq!(make_relative_path("/home/user/project/lib/utils.ts"), "utils.ts");
    }

    #[test]
    fn test_make_relative_path_no_slashes() {
        assert_eq!(make_relative_path("test.ts"), "test.ts");
    }

    // --- parse_vitest_json additional tests ---

    #[test]
    fn test_parse_vitest_json_no_json() {
        assert!(parse_vitest_json("no json here at all").is_err());
    }

    #[test]
    fn test_parse_vitest_json_with_preceding_text() {
        let output = "some warning\n{\"numTotalTests\":1,\"numPassedTests\":1,\"numFailedTests\":0,\"numPendingTests\":0,\"testResults\":[]}";
        let summary = parse_vitest_json(output).unwrap();
        assert_eq!(summary.total, 1);
        assert_eq!(summary.passed, 1);
    }

    #[test]
    fn test_parse_vitest_json_pending_tests() {
        let json = r#"{
            "numTotalTests": 3,
            "numPassedTests": 1,
            "numFailedTests": 0,
            "numPendingTests": 2,
            "testResults": [
                {
                    "name": "src/test.ts",
                    "assertionResults": [
                        {"fullName": "passes", "status": "passed", "failureMessages": []},
                        {"fullName": "pending one", "status": "pending", "failureMessages": []},
                        {"fullName": "todo one", "status": "todo", "failureMessages": []}
                    ]
                }
            ]
        }"#;
        let summary = parse_vitest_json(json).unwrap();
        assert_eq!(summary.total, 3);
        assert_eq!(summary.skipped, 2);
        assert_eq!(summary.suites[0].tests[1].status, TestStatus::Skipped);
        assert_eq!(summary.suites[0].tests[2].status, TestStatus::Skipped);
    }

    #[test]
    fn test_parse_vitest_json_all_skipped_suite_status() {
        let json = r#"{
            "numTotalTests": 1,
            "numPassedTests": 0,
            "numFailedTests": 0,
            "numPendingTests": 1,
            "testResults": [
                {
                    "name": "src/test.ts",
                    "assertionResults": [
                        {"fullName": "skipped test", "status": "skipped", "failureMessages": []}
                    ]
                }
            ]
        }"#;
        let summary = parse_vitest_json(json).unwrap();
        assert_eq!(summary.suites[0].status, TestStatus::Skipped);
    }

    #[test]
    fn test_parse_vitest_json_suite_duration() {
        let json = r#"{
            "numTotalTests": 1,
            "numPassedTests": 1,
            "numFailedTests": 0,
            "numPendingTests": 0,
            "testResults": [
                {
                    "name": "src/test.ts",
                    "startTime": 1000.0,
                    "endTime": 2500.0,
                    "assertionResults": [
                        {"fullName": "test", "status": "passed", "failureMessages": []}
                    ]
                }
            ]
        }"#;
        let summary = parse_vitest_json(json).unwrap();
        assert_eq!(summary.suites[0].duration_ms, Some(1500.0));
        assert_eq!(summary.duration_ms, 1500.0);
    }

    #[test]
    fn test_parse_vitest_json_empty_test_results() {
        let json = r#"{"numTotalTests":0,"numPassedTests":0,"numFailedTests":0,"numPendingTests":0,"testResults":[]}"#;
        let summary = parse_vitest_json(json).unwrap();
        assert_eq!(summary.total, 0);
        assert!(summary.suites.is_empty());
    }

    // --- parse_cargo_test additional tests ---

    #[test]
    fn test_parse_cargo_test_ignored() {
        let output = "test my_mod::my_test ... ignored\n";
        let summary = parse_cargo_test(output).unwrap();
        assert_eq!(summary.total, 1);
        assert_eq!(summary.skipped, 1);
        assert_eq!(summary.suites[0].tests[0].status, TestStatus::Skipped);
    }

    #[test]
    fn test_parse_cargo_test_no_module() {
        let output = "test my_test ... ok\n";
        let summary = parse_cargo_test(output).unwrap();
        assert_eq!(summary.total, 1);
        assert_eq!(summary.passed, 1);
        assert_eq!(summary.suites[0].name, "(root)");
        assert_eq!(summary.suites[0].tests[0].name, "my_test");
    }

    #[test]
    fn test_parse_cargo_test_empty_output() {
        let summary = parse_cargo_test("").unwrap();
        assert_eq!(summary.total, 0);
        assert!(summary.suites.is_empty());
    }

    #[test]
    fn test_parse_cargo_test_failure_message_attached() {
        let output = r#"
test mymod::test_thing ... FAILED

failures:

---- mymod::test_thing stdout ----
thread 'main' panicked at 'assertion failed'
note: run with RUST_BACKTRACE=1

test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured
"#;
        let summary = parse_cargo_test(output).unwrap();
        assert_eq!(summary.failed, 1);
        let test = &summary.suites[0].tests[0];
        assert!(test.failure_message.is_some());
        assert!(test.failure_message.as_ref().unwrap().contains("assertion failed"));
    }

    #[test]
    fn test_parse_cargo_test_unknown_result() {
        let output = "test my_mod::test_bench ... bench: 100 ns/iter\n";
        let summary = parse_cargo_test(output).unwrap();
        // "bench: 100 ns/iter" doesn't match known results, skipped as unknown
        assert_eq!(summary.total, 1);
        assert_eq!(summary.skipped, 1);
    }

    // --- parse_go_test_json additional tests ---

    #[test]
    fn test_parse_go_test_json_skip() {
        let output = r#"{"Action":"skip","Package":"pkg","Test":"TestSkipped","Elapsed":0.0}"#;
        let summary = parse_go_test_json(output).unwrap();
        assert_eq!(summary.total, 1);
        assert_eq!(summary.skipped, 1);
    }

    #[test]
    fn test_parse_go_test_json_output_collected_for_failure() {
        let output = r#"
{"Action":"output","Package":"pkg","Test":"TestFail","Output":"expected 1 got 2\n"}
{"Action":"output","Package":"pkg","Test":"TestFail","Output":"at line 42\n"}
{"Action":"fail","Package":"pkg","Test":"TestFail","Elapsed":0.1}
"#;
        let summary = parse_go_test_json(output).unwrap();
        assert_eq!(summary.failed, 1);
        let test = &summary.suites[0].tests[0];
        assert!(test.failure_message.is_some());
        let msg = test.failure_message.as_ref().unwrap();
        assert!(msg.contains("expected 1 got 2"));
        assert!(msg.contains("at line 42"));
    }

    #[test]
    fn test_parse_go_test_json_no_test_field_skipped() {
        let output = r#"{"Action":"pass","Package":"pkg","Elapsed":1.0}"#;
        let summary = parse_go_test_json(output).unwrap();
        // Events without Test field are skipped
        assert_eq!(summary.total, 0);
    }

    #[test]
    fn test_parse_go_test_json_empty_output() {
        let summary = parse_go_test_json("").unwrap();
        assert_eq!(summary.total, 0);
        assert!(summary.suites.is_empty());
    }

    #[test]
    fn test_parse_go_test_json_non_json_lines_ignored() {
        let output = "ok  \tpkg\t0.5s\n{\"Action\":\"pass\",\"Package\":\"pkg\",\"Test\":\"TestA\",\"Elapsed\":0.1}\n";
        let summary = parse_go_test_json(output).unwrap();
        assert_eq!(summary.total, 1);
        assert_eq!(summary.passed, 1);
    }

    #[test]
    fn test_parse_go_test_json_duration_conversion() {
        let output = r#"{"Action":"pass","Package":"pkg","Test":"TestA","Elapsed":1.5}"#;
        let summary = parse_go_test_json(output).unwrap();
        // 1.5 seconds = 1500ms
        assert_eq!(summary.suites[0].tests[0].duration_ms, Some(1500.0));
    }

    #[test]
    fn test_parse_go_test_json_no_package() {
        let output = r#"{"Action":"pass","Test":"TestA","Elapsed":0.1}"#;
        let summary = parse_go_test_json(output).unwrap();
        assert_eq!(summary.suites[0].name, "(unknown)");
    }

    // --- parse_generic additional tests ---

    #[test]
    fn test_parse_generic_empty() {
        let summary = parse_generic("").unwrap();
        assert_eq!(summary.total, 0);
        assert_eq!(summary.suites[0].status, TestStatus::Pending);
    }

    #[test]
    fn test_parse_generic_only_passes() {
        let output = "test1 PASS\ntest2 ok\n";
        let summary = parse_generic(output).unwrap();
        assert_eq!(summary.total, 2);
        assert_eq!(summary.passed, 2);
        assert_eq!(summary.failed, 0);
        assert_eq!(summary.suites[0].status, TestStatus::Passed);
    }

    #[test]
    fn test_parse_generic_only_failures() {
        let output = "test1 FAIL\ntest2 error\n";
        let summary = parse_generic(output).unwrap();
        assert_eq!(summary.total, 2);
        assert_eq!(summary.passed, 0);
        assert_eq!(summary.failed, 2);
        assert_eq!(summary.suites[0].status, TestStatus::Failed);
    }

    #[test]
    fn test_parse_generic_failure_message_set() {
        let output = "FAIL: test_something broke";
        let summary = parse_generic(output).unwrap();
        assert!(summary.suites[0].tests[0].failure_message.is_some());
    }

    // --- parse_output dispatch tests ---

    #[test]
    fn test_parse_output_dispatches_to_vitest() {
        let json = r#"{"numTotalTests":1,"numPassedTests":1,"numFailedTests":0,"numPendingTests":0,"testResults":[]}"#;
        let summary = parse_output(&TestFramework::Vitest, json).unwrap();
        assert_eq!(summary.total, 1);
    }

    #[test]
    fn test_parse_output_dispatches_to_jest() {
        let json = r#"{"numTotalTests":1,"numPassedTests":1,"numFailedTests":0,"numPendingTests":0,"testResults":[]}"#;
        let summary = parse_output(&TestFramework::Jest, json).unwrap();
        assert_eq!(summary.total, 1);
    }

    #[test]
    fn test_parse_output_dispatches_to_custom() {
        let output = "PASS test_foo";
        let summary = parse_output(&TestFramework::Custom, output).unwrap();
        assert_eq!(summary.total, 1);
    }

    // --- parse_pytest_verbose additional tests ---

    #[test]
    fn test_parse_pytest_verbose_empty() {
        let summary = parse_pytest_verbose("").unwrap();
        assert_eq!(summary.total, 0);
        assert!(summary.suites.is_empty());
    }

    #[test]
    fn test_parse_pytest_verbose_skipped() {
        let output = "tests/test_foo.py::test_skip SKIPPED [ 50%]\ntests/test_foo.py::test_pass PASSED [100%]";
        let summary = parse_pytest_verbose(output).unwrap();
        assert_eq!(summary.total, 2);
        assert_eq!(summary.passed, 1);
        assert_eq!(summary.skipped, 1);
    }

    #[test]
    fn test_parse_pytest_verbose_multiple_suites() {
        let output = "tests/test_a.py::test_one PASSED [50%]\ntests/test_b.py::test_two FAILED [100%]";
        let summary = parse_pytest_verbose(output).unwrap();
        assert_eq!(summary.total, 2);
        assert_eq!(summary.suites.len(), 2);
    }

    // --- parse_istanbul_coverage tests ---

    #[test]
    fn test_parse_istanbul_coverage_basic() {
        let json = r#"{
            "/home/user/src/app.ts": {
                "s": {"0": 5, "1": 0, "2": 3},
                "statementMap": {
                    "0": {"start": {"line": 1, "column": 0}, "end": {"line": 1, "column": 10}},
                    "1": {"start": {"line": 5, "column": 0}, "end": {"line": 5, "column": 10}},
                    "2": {"start": {"line": 10, "column": 0}, "end": {"line": 10, "column": 10}}
                }
            }
        }"#;
        let report = parse_istanbul_coverage(json).unwrap();
        assert_eq!(report.files.len(), 1);
        assert_eq!(report.files[0].uncovered_lines, vec![5]);
        // 2/3 covered = ~66.67%
        assert!(report.total_lines_pct > 66.0 && report.total_lines_pct < 67.0);
    }

    #[test]
    fn test_parse_istanbul_coverage_empty_object() {
        let report = parse_istanbul_coverage("{}").unwrap();
        assert!(report.files.is_empty());
        assert_eq!(report.total_lines_pct, 100.0);
    }

    #[test]
    fn test_parse_istanbul_coverage_invalid_json() {
        assert!(parse_istanbul_coverage("not json").is_err());
    }

    #[test]
    fn test_parse_istanbul_coverage_not_object() {
        assert!(parse_istanbul_coverage("[1,2,3]").is_err());
    }

    #[test]
    fn test_parse_istanbul_coverage_no_statement_map() {
        let json = r#"{"/src/app.ts": {"s": {"0": 1}}}"#;
        let report = parse_istanbul_coverage(json).unwrap();
        assert_eq!(report.files[0].lines_pct, 100.0); // no statement map, falls to (0,0)
    }

    // --- parse_pytest_cov tests ---

    #[test]
    fn test_parse_pytest_cov_basic() {
        let output = r#"
Name                      Stmts   Miss  Cover
-----------------------------------------------
src/app.py                   50     10    80%
src/utils.py                 30      5    83%
-----------------------------------------------
TOTAL                        80     15    81%
"#;
        let report = parse_pytest_cov(output).unwrap();
        assert_eq!(report.files.len(), 2);
        assert_eq!(report.total_lines_pct, 81.0);
        assert_eq!(report.files[0].file, "src/app.py");
        assert_eq!(report.files[0].lines_pct, 80.0);
    }

    #[test]
    fn test_parse_pytest_cov_empty() {
        let report = parse_pytest_cov("").unwrap();
        assert!(report.files.is_empty());
        assert_eq!(report.total_lines_pct, 0.0);
    }

    #[test]
    fn test_parse_pytest_cov_no_total_line() {
        let output = "Name    Stmts   Miss  Cover\n---\nsrc/a.py  10  2  80%\nsrc/b.py  20  10  50%\n";
        let report = parse_pytest_cov(output).unwrap();
        assert_eq!(report.files.len(), 2);
        // Average of 80 and 50 = 65
        assert_eq!(report.total_lines_pct, 65.0);
    }
}
