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
