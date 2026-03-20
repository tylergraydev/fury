use std::path::Path;

use crate::models::test_runner::*;

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
    fn test_detect_framework_jest_config() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("jest.config.js"), "module.exports = {}").unwrap();
        assert_eq!(detect_framework(tmp.path()), Some(TestFramework::Jest));
    }

    #[test]
    fn test_detect_framework_jest_from_package_json() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(
            tmp.path().join("package.json"),
            r#"{"jest":{"testEnvironment":"jsdom"}}"#,
        )
        .unwrap();
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
        std::fs::write(
            tmp.path().join("pyproject.toml"),
            "[tool.pytest.ini_options]\naddopts = \"-v\"",
        )
        .unwrap();
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
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("vitest.config.ts"), "export default {}").unwrap();
        std::fs::write(tmp.path().join("jest.config.js"), "module.exports = {}").unwrap();
        assert_eq!(detect_framework(tmp.path()), Some(TestFramework::Vitest));
    }

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
}
