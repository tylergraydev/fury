use std::collections::HashMap;
use std::path::Path;

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use uuid::Uuid;

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
        },
        TestFramework::Jest => TestRunnerConfig {
            framework: Some(TestFramework::Jest),
            test_command: Some("npx jest --json 2>/dev/null".to_string()),
            test_file_command: Some("npx jest --json {file} 2>/dev/null".to_string()),
            working_dir: None,
        },
        TestFramework::Pytest => TestRunnerConfig {
            framework: Some(TestFramework::Pytest),
            test_command: Some("python -m pytest -v --tb=short".to_string()),
            test_file_command: Some("python -m pytest -v --tb=short {file}".to_string()),
            working_dir: None,
        },
        TestFramework::CargoTest => TestRunnerConfig {
            framework: Some(TestFramework::CargoTest),
            test_command: Some("cargo test 2>&1".to_string()),
            test_file_command: Some("cargo test {file} 2>&1".to_string()),
            working_dir: None,
        },
        TestFramework::GoTest => TestRunnerConfig {
            framework: Some(TestFramework::GoTest),
            test_command: Some("go test -v -json ./...".to_string()),
            test_file_command: Some("go test -v -json {file}".to_string()),
            working_dir: None,
        },
        TestFramework::Custom => TestRunnerConfig {
            framework: Some(TestFramework::Custom),
            test_command: None,
            test_file_command: None,
            working_dir: None,
        },
    }
}

/// Spawn a test process and stream output, then parse results on completion.
pub async fn spawn_test_run(
    context_id: Uuid,
    command: &str,
    working_dir: &Path,
    framework: &TestFramework,
    env_vars: HashMap<String, String>,
    app_handle: AppHandle,
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
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000200);
    }

    let mut child = cmd.spawn().map_err(|e| {
        AppError::ScriptError(format!("Failed to spawn test command: {}", e))
    })?;

    let event_name = format!("test-runner:{}", context_id);
    let framework_clone = framework.clone();

    // Collect stdout for parsing
    let stdout_lines = std::sync::Arc::new(tokio::sync::Mutex::new(Vec::<String>::new()));

    // Stream stdout
    if let Some(stdout) = child.stdout.take() {
        let app_out = app_handle.clone();
        let event_out = event_name.clone();
        let lines_ref = std::sync::Arc::clone(&stdout_lines);
        tokio::spawn(async move {
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
        });
    }

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

    // Background task: wait for exit, parse output, emit results
    let app_final = app_handle.clone();
    let event_final = event_name;
    let lines_final = stdout_lines;
    tokio::spawn(async move {
        // Give the IO tasks a moment to finish flushing
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        let collected = lines_final.lock().await;
        let full_stdout = collected.join("\n");
        drop(collected);

        let summary = parse_output(&framework_clone, &full_stdout);
        match summary {
            Ok(s) => {
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
}
