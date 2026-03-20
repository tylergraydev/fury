use crate::error::AppError;
use crate::models::test_runner::*;

use super::parsers::make_relative_path;

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
                    if let Some(start) = mapping
                        .get("start")
                        .and_then(|s| s.get("line"))
                        .and_then(|l| l.as_u64())
                    {
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
        TestFramework::Vitest => {
            Some("npx vitest --coverage --reporter=json --run 2>/dev/null".to_string())
        }
        TestFramework::Jest => Some("npx jest --coverage --json 2>/dev/null".to_string()),
        TestFramework::Pytest => Some("python -m pytest --cov --cov-report=term -q".to_string()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_coverage_command_vitest() {
        assert!(default_coverage_command(&TestFramework::Vitest)
            .unwrap()
            .contains("coverage"));
    }

    #[test]
    fn test_default_coverage_command_jest() {
        assert!(default_coverage_command(&TestFramework::Jest)
            .unwrap()
            .contains("coverage"));
    }

    #[test]
    fn test_default_coverage_command_pytest() {
        assert!(default_coverage_command(&TestFramework::Pytest)
            .unwrap()
            .contains("cov"));
    }

    #[test]
    fn test_default_coverage_command_cargo_none() {
        assert!(default_coverage_command(&TestFramework::CargoTest).is_none());
    }

    #[test]
    fn test_default_coverage_command_go_none() {
        assert!(default_coverage_command(&TestFramework::GoTest).is_none());
    }

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
        assert_eq!(report.files[0].lines_pct, 100.0);
    }

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
        let output =
            "Name    Stmts   Miss  Cover\n---\nsrc/a.py  10  2  80%\nsrc/b.py  20  10  50%\n";
        let report = parse_pytest_cov(output).unwrap();
        assert_eq!(report.files.len(), 2);
        assert_eq!(report.total_lines_pct, 65.0);
    }
}
