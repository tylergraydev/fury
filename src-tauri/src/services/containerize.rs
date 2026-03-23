use std::path::Path;
use std::process::Command as StdCommand;

#[allow(dead_code)]
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

#[allow(dead_code)]
const MAX_MANIFEST_LINES: usize = 200;

#[allow(dead_code)]
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

#[allow(dead_code)]
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
}
