use crate::error::AppError;
use crate::models::slash_command::{SlashCommand, SlashCommandSource};
use std::path::Path;

pub fn discover_commands(repo_root: Option<&Path>) -> Result<Vec<SlashCommand>, AppError> {
    let mut commands = Vec::new();

    // Scan global: ~/.claude/commands/*.md
    if let Some(home) = dirs::home_dir() {
        let global_dir = home.join(".claude").join("commands");
        if global_dir.is_dir() {
            scan_directory(&global_dir, SlashCommandSource::Global, &mut commands)?;
        }
    }

    // Scan project: <repo_root>/.claude/commands/*.md
    if let Some(root) = repo_root {
        let project_dir = root.join(".claude").join("commands");
        if project_dir.is_dir() {
            scan_directory(&project_dir, SlashCommandSource::Project, &mut commands)?;
        }
    }

    // Sort: project commands first, then global, alphabetical within each group
    commands.sort_by(|a, b| {
        let source_ord = match (&a.source, &b.source) {
            (SlashCommandSource::Project, SlashCommandSource::Global) => std::cmp::Ordering::Less,
            (SlashCommandSource::Global, SlashCommandSource::Project) => {
                std::cmp::Ordering::Greater
            }
            _ => std::cmp::Ordering::Equal,
        };
        source_ord.then_with(|| a.name.cmp(&b.name))
    });

    Ok(commands)
}

fn scan_directory(
    dir: &Path,
    source: SlashCommandSource,
    commands: &mut Vec<SlashCommand>,
) -> Result<(), AppError> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().map_or(false, |e| e == "md") {
            let name = path
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            let content = std::fs::read_to_string(&path)?;
            let description = content.lines().next().unwrap_or("").to_string();
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
