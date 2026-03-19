use crate::error::AppError;
use crate::models::slash_command::{SlashCommand, SlashCommandSource};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

pub fn discover_commands(repo_root: Option<&Path>) -> Result<Vec<SlashCommand>, AppError> {
    let mut commands = Vec::new();

    // 1. Global: ~/.claude/commands/*.md
    if let Some(home) = dirs::home_dir() {
        let global_dir = home.join(".claude").join("commands");
        scan_directory(&global_dir, SlashCommandSource::Global, None, &mut commands)?;
    }

    // 2. Project: <repo_root>/.claude/commands/*.md
    if let Some(root) = repo_root {
        let project_dir = root.join(".claude").join("commands");
        scan_directory(
            &project_dir,
            SlashCommandSource::Project,
            None,
            &mut commands,
        )?;
    }

    // 3. Plugins: ~/.claude/plugins/installed_plugins.json
    discover_plugin_commands(repo_root, &mut commands)?;

    eprintln!(
        "[slash-commands] discovered {} commands (repo_root={:?})",
        commands.len(),
        repo_root
    );

    // Sort: project first, then plugin, then global; alphabetical within each
    commands.sort_by(|a, b| {
        let source_ord = |s: &SlashCommandSource| match s {
            SlashCommandSource::Project => 0,
            SlashCommandSource::Plugin => 1,
            SlashCommandSource::Global => 2,
        };
        source_ord(&a.source)
            .cmp(&source_ord(&b.source))
            .then_with(|| a.name.cmp(&b.name))
    });

    Ok(commands)
}

/// Parse YAML frontmatter from a markdown command file.
/// Returns (description, body_content).
fn parse_frontmatter(raw: &str) -> (String, String) {
    let trimmed = raw.trim_start();
    if !trimmed.starts_with("---") {
        let desc = raw.lines().next().unwrap_or("").to_string();
        return (desc, raw.to_string());
    }

    // Skip the opening "---" line
    let after_open = match trimmed.strip_prefix("---") {
        Some(rest) => rest.trim_start_matches(['\r', '\n']),
        None => return (String::new(), raw.to_string()),
    };

    if let Some(close_idx) = after_open.find("\n---") {
        let yaml_block = &after_open[..close_idx];
        let body_start = close_idx + 4; // "\n---" is 4 chars
        let body = after_open[body_start..].trim_start_matches(['\r', '\n']);

        let mut description = String::new();
        for line in yaml_block.lines() {
            let line = line.trim();
            if let Some(val) = line.strip_prefix("description:") {
                description = val.trim().trim_matches('"').to_string();
                break;
            }
        }

        (description, body.to_string())
    } else {
        let desc = raw.lines().next().unwrap_or("").to_string();
        (desc, raw.to_string())
    }
}

/// Scan skills/<name>/SKILL.md directories for skill-based commands.
fn scan_skills_directory(
    dir: &Path,
    source: SlashCommandSource,
    name_prefix: Option<&str>,
    commands: &mut Vec<SlashCommand>,
) -> Result<(), AppError> {
    if !dir.is_dir() {
        return Ok(());
    }
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let skill_file = path.join("SKILL.md");
        if !skill_file.is_file() {
            continue;
        }
        let dir_name = path
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();

        let name = match name_prefix {
            Some(prefix) => format!("{}:{}", prefix, dir_name),
            None => dir_name,
        };

        let raw = std::fs::read_to_string(&skill_file)?;
        let (description, content) = parse_frontmatter(&raw);

        commands.push(SlashCommand {
            name,
            source: source.clone(),
            description,
            content,
        });
    }
    Ok(())
}

fn scan_directory(
    dir: &Path,
    source: SlashCommandSource,
    name_prefix: Option<&str>,
    commands: &mut Vec<SlashCommand>,
) -> Result<(), AppError> {
    if !dir.is_dir() {
        return Ok(());
    }
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().is_some_and(|e| e == "md") {
            let file_stem = path
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();

            let name = match name_prefix {
                Some(prefix) => format!("{}:{}", prefix, file_stem),
                None => file_stem,
            };

            let raw = std::fs::read_to_string(&path)?;
            let (description, content) = parse_frontmatter(&raw);

            commands.push(SlashCommand {
                name,
                source: source.clone(),
                description,
                content,
            });
        }
    }
    Ok(())
}

#[derive(Deserialize)]
struct InstalledPluginsFile {
    #[serde(default)]
    plugins: HashMap<String, Vec<PluginEntry>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginEntry {
    scope: String,
    install_path: String,
    #[serde(default)]
    project_path: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_frontmatter_with_description() {
        let raw = "---\ndescription: \"Hello world\"\n---\nBody content here";
        let (desc, body) = parse_frontmatter(raw);
        assert_eq!(desc, "Hello world");
        assert_eq!(body, "Body content here");
    }

    #[test]
    fn test_parse_frontmatter_no_frontmatter() {
        let raw = "Just a plain body\nwith two lines";
        let (desc, body) = parse_frontmatter(raw);
        assert_eq!(desc, "Just a plain body");
        assert_eq!(body, raw);
    }

    #[test]
    fn test_parse_frontmatter_empty_body() {
        let raw = "---\ndescription: test\n---\n";
        let (desc, body) = parse_frontmatter(raw);
        assert_eq!(desc, "test");
        assert_eq!(body, "");
    }

    #[test]
    fn test_parse_frontmatter_no_description_field() {
        let raw = "---\ntitle: something\n---\nBody";
        let (desc, body) = parse_frontmatter(raw);
        assert_eq!(desc, "");
        assert_eq!(body, "Body");
    }

    #[test]
    fn test_parse_frontmatter_unclosed() {
        let raw = "---\ndescription: test\nno closing fence";
        let (desc, body) = parse_frontmatter(raw);
        assert_eq!(desc, "---");
        assert_eq!(body, raw);
    }

    #[test]
    fn test_parse_frontmatter_quoted_description() {
        let raw = "---\ndescription: \"Quoted value\"\n---\nContent";
        let (desc, _body) = parse_frontmatter(raw);
        assert_eq!(desc, "Quoted value");
    }

    #[test]
    fn test_parse_frontmatter_empty_string() {
        let (desc, body) = parse_frontmatter("");
        assert_eq!(desc, "");
        assert_eq!(body, "");
    }

    #[test]
    fn test_scan_directory_with_md_files() {
        let dir = tempfile::TempDir::new().unwrap();
        std::fs::write(
            dir.path().join("hello.md"),
            "---\ndescription: greeting\n---\nHi there",
        )
        .unwrap();
        std::fs::write(dir.path().join("bye.md"), "Goodbye content").unwrap();
        std::fs::write(dir.path().join("not-md.txt"), "ignored").unwrap();

        let mut commands = Vec::new();
        scan_directory(dir.path(), SlashCommandSource::Global, None, &mut commands).unwrap();
        assert_eq!(commands.len(), 2);
        let names: Vec<&str> = commands.iter().map(|c| c.name.as_str()).collect();
        assert!(names.contains(&"hello"));
        assert!(names.contains(&"bye"));
    }

    #[test]
    fn test_scan_directory_nonexistent() {
        let mut commands = Vec::new();
        let result = scan_directory(
            Path::new("/nonexistent/dir"),
            SlashCommandSource::Global,
            None,
            &mut commands,
        );
        assert!(result.is_ok());
        assert!(commands.is_empty());
    }

    #[test]
    fn test_scan_directory_with_prefix() {
        let dir = tempfile::TempDir::new().unwrap();
        std::fs::write(dir.path().join("cmd.md"), "content").unwrap();

        let mut commands = Vec::new();
        scan_directory(
            dir.path(),
            SlashCommandSource::Plugin,
            Some("myplugin"),
            &mut commands,
        )
        .unwrap();
        assert_eq!(commands.len(), 1);
        assert_eq!(commands[0].name, "myplugin:cmd");
    }

    #[test]
    fn test_scan_skills_directory() {
        let dir = tempfile::TempDir::new().unwrap();
        let skill_dir = dir.path().join("my-skill");
        std::fs::create_dir_all(&skill_dir).unwrap();
        std::fs::write(
            skill_dir.join("SKILL.md"),
            "---\ndescription: A skill\n---\nSkill body",
        )
        .unwrap();

        // Non-skill dir (no SKILL.md)
        let other_dir = dir.path().join("no-skill");
        std::fs::create_dir_all(&other_dir).unwrap();

        let mut commands = Vec::new();
        scan_skills_directory(dir.path(), SlashCommandSource::Plugin, None, &mut commands).unwrap();
        assert_eq!(commands.len(), 1);
        assert_eq!(commands[0].name, "my-skill");
        assert_eq!(commands[0].description, "A skill");
    }

    #[test]
    fn test_scan_skills_directory_with_prefix() {
        let dir = tempfile::TempDir::new().unwrap();
        let skill_dir = dir.path().join("test-skill");
        std::fs::create_dir_all(&skill_dir).unwrap();
        std::fs::write(skill_dir.join("SKILL.md"), "body").unwrap();

        let mut commands = Vec::new();
        scan_skills_directory(
            dir.path(),
            SlashCommandSource::Plugin,
            Some("pkg"),
            &mut commands,
        )
        .unwrap();
        assert_eq!(commands[0].name, "pkg:test-skill");
    }

    #[test]
    fn test_scan_skills_directory_nonexistent() {
        let mut commands = Vec::new();
        let result = scan_skills_directory(
            Path::new("/nonexistent"),
            SlashCommandSource::Global,
            None,
            &mut commands,
        );
        assert!(result.is_ok());
        assert!(commands.is_empty());
    }

    #[test]
    fn test_discover_commands_sort_order() {
        // Commands should be sorted: project < plugin < global, then alphabetical
        let dir = tempfile::TempDir::new().unwrap();
        let project_dir = dir.path().join(".claude").join("commands");
        std::fs::create_dir_all(&project_dir).unwrap();
        std::fs::write(project_dir.join("zulu.md"), "project zulu").unwrap();
        std::fs::write(project_dir.join("alpha.md"), "project alpha").unwrap();

        let result = discover_commands(Some(dir.path()));
        assert!(result.is_ok());
        let cmds = result.unwrap();
        // At minimum, the project commands should be first and alphabetically sorted
        let project_cmds: Vec<&str> = cmds
            .iter()
            .filter(|c| matches!(c.source, SlashCommandSource::Project))
            .map(|c| c.name.as_str())
            .collect();
        if project_cmds.len() >= 2 {
            assert_eq!(project_cmds[0], "alpha");
            assert_eq!(project_cmds[1], "zulu");
        }
    }

    #[test]
    fn test_discover_commands_no_repo() {
        let result = discover_commands(None);
        assert!(result.is_ok());
    }

    #[test]
    fn test_plugin_entry_deserialization() {
        let json = r#"{
            "plugins": {
                "my-plugin@1.0.0": [
                    {
                        "scope": "global",
                        "installPath": "/path/to/plugin"
                    }
                ]
            }
        }"#;
        let parsed: InstalledPluginsFile = serde_json::from_str(json).unwrap();
        assert_eq!(parsed.plugins.len(), 1);
        let entries = parsed.plugins.get("my-plugin@1.0.0").unwrap();
        assert_eq!(entries[0].scope, "global");
        assert_eq!(entries[0].install_path, "/path/to/plugin");
        assert!(entries[0].project_path.is_none());
    }

    #[test]
    fn test_plugin_entry_with_project_path() {
        let json = r#"{
            "plugins": {
                "plugin@2.0": [
                    {
                        "scope": "local",
                        "installPath": "/install",
                        "projectPath": "/my/project"
                    }
                ]
            }
        }"#;
        let parsed: InstalledPluginsFile = serde_json::from_str(json).unwrap();
        let entries = parsed.plugins.get("plugin@2.0").unwrap();
        assert_eq!(entries[0].project_path.as_deref(), Some("/my/project"));
    }
}

fn discover_plugin_commands(
    repo_root: Option<&Path>,
    commands: &mut Vec<SlashCommand>,
) -> Result<(), AppError> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return Ok(()),
    };

    let plugins_file = home
        .join(".claude")
        .join("plugins")
        .join("installed_plugins.json");
    if !plugins_file.is_file() {
        return Ok(());
    }

    let content = std::fs::read_to_string(&plugins_file)?;
    let installed: InstalledPluginsFile = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return Ok(()),
    };

    for (key, entries) in &installed.plugins {
        let plugin_name = key.split('@').next().unwrap_or(key);

        for entry in entries {
            if entry.scope == "local" {
                match (&repo_root, &entry.project_path) {
                    (Some(root), Some(project_path)) => {
                        let project = Path::new(project_path);
                        let root_canon =
                            dunce::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
                        let proj_canon =
                            dunce::canonicalize(project).unwrap_or_else(|_| project.to_path_buf());
                        if root_canon != proj_canon {
                            continue;
                        }
                    }
                    _ => continue,
                }
            }

            let install_path = Path::new(&entry.install_path);
            let commands_dir = install_path.join("commands");
            scan_directory(
                &commands_dir,
                SlashCommandSource::Plugin,
                Some(plugin_name),
                commands,
            )?;
            let skills_dir = install_path.join("skills");
            scan_skills_directory(
                &skills_dir,
                SlashCommandSource::Plugin,
                Some(plugin_name),
                commands,
            )?;
        }
    }

    Ok(())
}
