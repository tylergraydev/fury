use std::path::Path;
use std::process::Command as StdCommand;

use crate::error::AppError;

const MANIFEST_FILES: &[&str] = &[
    "package.json",
    "Cargo.toml",
    "requirements.txt",
    "pyproject.toml",
    "go.mod",
    "Gemfile",
    "docker-compose.yml",
    "Dockerfile",
    "pom.xml",
    "build.gradle",
    "mix.exs",
];

const MAX_MANIFEST_LINES: usize = 200;

pub fn gather_repo_context(repo_path: &Path, setup_script: Option<&str>) -> String {
    let mut sections: Vec<String> = Vec::new();

    let file_listing = match StdCommand::new("git")
        .args(["ls-files"])
        .current_dir(repo_path)
        .output()
    {
        Ok(output) => String::from_utf8_lossy(&output.stdout).to_string(),
        Err(_) => list_dir_shallow(repo_path),
    };
    sections.push(format!(
        "## File listing\n```\n{}\n```",
        file_listing.trim()
    ));

    for &manifest in MANIFEST_FILES {
        let path = repo_path.join(manifest);
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                let truncated: String = content
                    .lines()
                    .take(MAX_MANIFEST_LINES)
                    .collect::<Vec<_>>()
                    .join("\n");
                let suffix = if content.lines().count() > MAX_MANIFEST_LINES {
                    "\n... (truncated)"
                } else {
                    ""
                };
                sections.push(format!(
                    "## {}\n```\n{}{}\n```",
                    manifest, truncated, suffix
                ));
            }
        }
    }

    if let Some(script) = setup_script {
        if !script.is_empty() {
            sections.push(format!("## Fury setup script\n```\n{}\n```", script));
        }
    }

    sections.join("\n\n")
}

pub fn extract_json_from_response(response: &str) -> Result<String, AppError> {
    let trimmed = response.trim();

    // Strategy 1: direct parse
    if serde_json::from_str::<serde_json::Value>(trimmed).is_ok() {
        return Ok(trimmed.to_string());
    }

    // Strategy 2: extract from code fences
    if let Some(json_str) = extract_from_code_fence(trimmed) {
        if serde_json::from_str::<serde_json::Value>(&json_str).is_ok() {
            return Ok(json_str);
        }
    }

    Err(AppError::ContainerError(format!(
        "Could not parse valid JSON from agent response. Raw output:\n{}",
        trimmed
    )))
}

fn extract_from_code_fence(text: &str) -> Option<String> {
    let start_markers = ["```json\n", "```json\r\n", "```\n", "```\r\n"];
    for marker in &start_markers {
        if let Some(start) = text.find(marker) {
            let content_start = start + marker.len();
            if let Some(end) = text[content_start..].find("```") {
                return Some(text[content_start..content_start + end].trim().to_string());
            }
        }
    }
    None
}

pub fn build_containerize_prompt(repo_context: &str) -> String {
    format!(
        r#"Analyze this repository and generate a devcontainer.json configuration.

Requirements:
- Use Microsoft devcontainer base images (mcr.microsoft.com/devcontainers/...)
- Include appropriate "features" for common tools (git, GitHub CLI, etc.)
- Set "postCreateCommand" to install dependencies based on the detected package manager
- Only return valid JSON — no markdown, no commentary, no explanation
- The JSON should be a valid devcontainer.json that works with the devcontainer CLI

Repository context:

{}"#,
        repo_context
    )
}

fn list_dir_shallow(path: &Path) -> String {
    match std::fs::read_dir(path) {
        Ok(entries) => {
            let mut names: Vec<String> = entries
                .filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().to_string())
                .filter(|n| !n.starts_with('.'))
                .collect();
            names.sort();
            names.join("\n")
        }
        Err(_) => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn setup_repo(dir: &TempDir, files: &[(&str, &str)]) {
        std::process::Command::new("git")
            .args(["init"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        for (name, content) in files {
            let path = dir.path().join(name);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).unwrap();
            }
            fs::write(&path, content).unwrap();
        }
        std::process::Command::new("git")
            .args(["add", "."])
            .current_dir(dir.path())
            .output()
            .unwrap();
    }

    #[test]
    fn test_gather_includes_package_json() {
        let dir = TempDir::new().unwrap();
        setup_repo(
            &dir,
            &[
                (
                    "package.json",
                    r#"{"name":"test","dependencies":{"react":"^19"}}"#,
                ),
                ("src/index.ts", "console.log('hello')"),
            ],
        );
        let ctx = gather_repo_context(dir.path(), None);
        assert!(ctx.contains("package.json"));
        assert!(ctx.contains("react"));
    }

    #[test]
    fn test_gather_includes_cargo_toml() {
        let dir = TempDir::new().unwrap();
        setup_repo(
            &dir,
            &[
                (
                    "Cargo.toml",
                    "[package]\nname = \"myapp\"\nversion = \"0.1.0\"",
                ),
                ("src/main.rs", "fn main() {}"),
            ],
        );
        let ctx = gather_repo_context(dir.path(), None);
        assert!(ctx.contains("Cargo.toml"));
        assert!(ctx.contains("myapp"));
    }

    #[test]
    fn test_gather_includes_setup_script() {
        let dir = TempDir::new().unwrap();
        setup_repo(&dir, &[("README.md", "hello")]);
        let ctx = gather_repo_context(dir.path(), Some("npm install && npm run build"));
        assert!(ctx.contains("npm install && npm run build"));
    }

    #[test]
    fn test_gather_caps_large_files() {
        let dir = TempDir::new().unwrap();
        let big_content = "line\n".repeat(500);
        setup_repo(&dir, &[("package.json", &big_content)]);
        let ctx = gather_repo_context(dir.path(), None);
        let line_count = ctx.lines().count();
        assert!(
            line_count < 400,
            "Expected truncation, got {} lines",
            line_count
        );
    }

    #[test]
    fn test_gather_empty_repo() {
        let dir = TempDir::new().unwrap();
        setup_repo(&dir, &[]);
        let ctx = gather_repo_context(dir.path(), None);
        assert!(ctx.contains("File listing"));
    }

    #[test]
    fn test_extract_json_direct() {
        let input = r#"{"image": "node:20"}"#;
        let result = extract_json_from_response(input).unwrap();
        assert!(result.contains("node:20"));
    }

    #[test]
    fn test_extract_json_from_markdown_fences() {
        let input = "Here's the config:\n```json\n{\"image\": \"node:20\"}\n```\nDone!";
        let result = extract_json_from_response(input).unwrap();
        assert!(result.contains("node:20"));
    }

    #[test]
    fn test_extract_json_from_bare_fences() {
        let input = "```\n{\"image\": \"node:20\"}\n```";
        let result = extract_json_from_response(input).unwrap();
        assert!(result.contains("node:20"));
    }

    #[test]
    fn test_extract_json_invalid() {
        let input = "I couldn't figure out the config, sorry!";
        let result = extract_json_from_response(input);
        assert!(result.is_err());
    }

    #[test]
    fn test_extract_json_nested_object() {
        let input = r#"```json
{
  "name": "test",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:20",
  "features": {
    "ghcr.io/devcontainers/features/github-cli:1": {}
  },
  "postCreateCommand": "npm install"
}
```"#;
        let result = extract_json_from_response(input).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(
            parsed["image"],
            "mcr.microsoft.com/devcontainers/typescript-node:20"
        );
    }

    #[test]
    fn test_build_prompt_includes_context() {
        let context = "## File listing\npackage.json\nsrc/index.ts";
        let prompt = build_containerize_prompt(context);
        assert!(prompt.contains("package.json"));
        assert!(prompt.contains("devcontainer.json"));
        assert!(prompt.contains("mcr.microsoft.com/devcontainers"));
    }
}
