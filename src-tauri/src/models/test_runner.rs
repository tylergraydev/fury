use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TestFramework {
    Vitest,
    Jest,
    Pytest,
    #[serde(rename = "cargotest")]
    CargoTest,
    #[serde(rename = "gotest")]
    GoTest,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TestRunnerConfig {
    pub framework: Option<TestFramework>,
    pub test_command: Option<String>,
    pub test_file_command: Option<String>,
    pub working_dir: Option<String>,
    pub coverage_command: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TestStatus {
    Passed,
    Failed,
    Skipped,
    Running,
    Pending,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestResult {
    pub name: String,
    pub suite: String,
    pub status: TestStatus,
    pub duration_ms: Option<f64>,
    pub failure_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestSuite {
    pub name: String,
    pub tests: Vec<TestResult>,
    pub status: TestStatus,
    pub duration_ms: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestRunSummary {
    pub total: usize,
    pub passed: usize,
    pub failed: usize,
    pub skipped: usize,
    pub duration_ms: f64,
    pub suites: Vec<TestSuite>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "type")]
#[allow(dead_code)]
pub enum TestRunEvent {
    #[serde(rename_all = "camelCase")]
    SuiteUpdate { suite: TestSuite },
    #[serde(rename_all = "camelCase")]
    RunComplete { summary: TestRunSummary },
    #[serde(rename_all = "camelCase")]
    OutputLine { line: String, stream: String },
    #[serde(rename_all = "camelCase")]
    Error { message: String },
    #[serde(rename_all = "camelCase")]
    CoverageResult { report: CoverageReport },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileCoverage {
    pub file: String,
    pub lines_pct: f32,
    pub branches_pct: f32,
    pub uncovered_lines: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverageReport {
    pub files: Vec<FileCoverage>,
    pub total_lines_pct: f32,
    pub total_branches_pct: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestRunRecord {
    pub id: String,
    pub repo_id: String,
    pub ran_at: String,
    pub total: usize,
    pub passed: usize,
    pub failed: usize,
    pub skipped: usize,
    pub duration_ms: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_framework_serde() {
        let vitest: TestFramework = serde_json::from_str("\"vitest\"").unwrap();
        assert_eq!(vitest, TestFramework::Vitest);

        let cargo: TestFramework = serde_json::from_str("\"cargotest\"").unwrap();
        assert_eq!(cargo, TestFramework::CargoTest);

        let go: TestFramework = serde_json::from_str("\"gotest\"").unwrap();
        assert_eq!(go, TestFramework::GoTest);
    }

    #[test]
    fn test_config_default() {
        let config = TestRunnerConfig::default();
        assert!(config.framework.is_none());
        assert!(config.test_command.is_none());
        assert!(config.test_file_command.is_none());
        assert!(config.working_dir.is_none());
    }

    #[test]
    fn test_status_serde() {
        let passed: TestStatus = serde_json::from_str("\"passed\"").unwrap();
        assert_eq!(passed, TestStatus::Passed);

        let failed: TestStatus = serde_json::from_str("\"failed\"").unwrap();
        assert_eq!(failed, TestStatus::Failed);
    }

    #[test]
    fn test_run_event_serialization() {
        let event = TestRunEvent::OutputLine {
            line: "PASS test_foo".to_string(),
            stream: "stdout".to_string(),
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"type\":\"outputLine\""));
        assert!(json.contains("\"line\":\"PASS test_foo\""));
    }

    #[test]
    fn test_summary_serde_roundtrip() {
        let summary = TestRunSummary {
            total: 10,
            passed: 8,
            failed: 1,
            skipped: 1,
            duration_ms: 1234.5,
            suites: vec![TestSuite {
                name: "test_file.rs".to_string(),
                tests: vec![TestResult {
                    name: "test_something".to_string(),
                    suite: "test_file.rs".to_string(),
                    status: TestStatus::Passed,
                    duration_ms: Some(12.3),
                    failure_message: None,
                }],
                status: TestStatus::Passed,
                duration_ms: Some(12.3),
            }],
        };
        let json = serde_json::to_string(&summary).unwrap();
        let deserialized: TestRunSummary = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.total, 10);
        assert_eq!(deserialized.passed, 8);
        assert_eq!(deserialized.suites.len(), 1);
    }
}
