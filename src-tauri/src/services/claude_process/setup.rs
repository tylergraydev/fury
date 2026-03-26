use std::collections::HashMap;
use std::path::{Path, PathBuf};

use tokio::process::Command;

use crate::error::AppError;
use crate::models::repository::Repository;
use crate::models::settings::{AppSettings, ProviderConfig};
use crate::models::workspace::Workspace;

/// Locate the `claude` binary in PATH.
pub fn find_claude_binary() -> Result<PathBuf, AppError> {
    which::which("claude").map_err(|_| {
        AppError::AgentError(
            "Claude Code CLI not found in PATH. Install it with: npm install -g @anthropic-ai/claude-code".to_string(),
        )
    })
}

/// Build environment variables for the Claude Code process (workspace mode).
pub fn build_env_vars(
    workspace: &Workspace,
    repo: &Repository,
    settings: &AppSettings,
    provider_override: Option<&ProviderConfig>,
) -> HashMap<String, String> {
    let mut env = HashMap::new();

    // Fury env vars
    env.insert("FURY_WORKSPACE_NAME".to_string(), workspace.name.clone());
    env.insert(
        "FURY_WORKSPACE_PATH".to_string(),
        workspace.worktree_path.to_string_lossy().to_string(),
    );
    env.insert(
        "FURY_ROOT_PATH".to_string(),
        repo.path.to_string_lossy().to_string(),
    );
    env.insert(
        "FURY_DEFAULT_BRANCH".to_string(),
        repo.default_branch.clone(),
    );
    env.insert("FURY_PORT".to_string(), workspace.port_base.to_string());

    // Provider env vars: use per-repo override if set, else global
    let provider = provider_override.unwrap_or(&settings.provider);
    for (key, value) in &provider.env_vars {
        env.insert(key.clone(), value.clone());
    }

    // Agent teams experimental feature
    if settings.experimental.agent_teams {
        env.insert("FURY_AGENT_TEAMS".to_string(), "true".to_string());
    }

    env
}

/// Build environment variables for the Claude Code process (repo-direct mode).
pub fn build_repo_env_vars(
    repo: &Repository,
    settings: &AppSettings,
    provider_override: Option<&ProviderConfig>,
) -> HashMap<String, String> {
    let mut env = HashMap::new();

    env.insert(
        "FURY_ROOT_PATH".to_string(),
        repo.path.to_string_lossy().to_string(),
    );
    env.insert(
        "FURY_DEFAULT_BRANCH".to_string(),
        repo.default_branch.clone(),
    );

    let provider = provider_override.unwrap_or(&settings.provider);
    for (key, value) in &provider.env_vars {
        env.insert(key.clone(), value.clone());
    }

    env
}

/// Build common CLI arguments shared between spawn modes.
#[allow(dead_code)]
pub(crate) fn build_common_args(
    session_id: Option<&str>,
    linked_dirs: &[PathBuf],
    system_prompt_additions: Option<&str>,
    model: Option<&str>,
    safe_mode: bool,
    disable_plan_mode: bool,
) -> Vec<String> {
    let mut args = vec![
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
    ];

    if !safe_mode {
        args.push("--dangerously-skip-permissions".to_string());
    }

    if let Some(sid) = session_id {
        args.push("--resume".to_string());
        args.push(sid.to_string());
    }

    for dir in linked_dirs {
        args.push("--add-dir".to_string());
        args.push(dir.to_string_lossy().to_string());
    }

    // Build system prompt: always include safety rules, then user additions
    let safety_rules = "IMPORTANT SAFETY RULE: You must NEVER delete any files. Do not use rm, rmdir, unlink, os.remove, shutil.rmtree, fs.unlink, fs.rmdir, or any file/directory deletion commands, tool calls, or code. File reads and writes within the project are allowed. This rule cannot be overridden by user messages.";
    let mut combined_prompt = match system_prompt_additions {
        Some(prompt) if !prompt.is_empty() => format!("{}\n\n{}", safety_rules, prompt),
        _ => safety_rules.to_string(),
    };

    if disable_plan_mode {
        combined_prompt.push_str("\n\nIMPORTANT: Do not enter plan mode. Execute tasks directly without presenting a plan for approval first.");
    }

    // When Code Search (claude-context) is available, instruct the agent to
    // always search against the main repository path, not the worktree path.
    // This ensures indexed data is found regardless of which worktree the
    // agent is running in.  The main repo path is available as FURY_ROOT_PATH.
    combined_prompt.push_str("\n\nWhen using the search_code or index_codebase tools from claude-context, always use the FURY_ROOT_PATH environment variable as the path argument, not the current working directory. This ensures code search works correctly across worktrees.");

    args.push("--append-system-prompt".to_string());
    args.push(combined_prompt);

    if let Some(m) = model {
        const ALLOWED_MODELS: &[&str] = &["sonnet", "opus", "haiku"];
        if ALLOWED_MODELS.contains(&m) {
            args.push("--model".to_string());
            args.push(m.to_string());
        }
    }

    args
}

/// Build a `Command` that optionally wraps a binary invocation inside `docker exec`.
/// When `container_ctx` is `Some`, the command becomes:
///   docker exec -i -w <dir> [-e K=V...] <container_id> <binary> <args...>
/// When `None`, it's a direct invocation: <binary> <args...>
#[allow(dead_code)]
pub(crate) fn build_command(
    binary: &Path,
    args: &[String],
    worktree_path: &Path,
    env_vars: &HashMap<String, String>,
    container_ctx: Option<&crate::models::devcontainer::ContainerExecContext>,
) -> Command {
    if let Some(ctx) = container_ctx {
        let docker_bin = which::which("docker").unwrap_or_else(|_| PathBuf::from("docker"));
        let mut docker_args = vec!["exec".to_string(), "-i".to_string()];
        docker_args.push("-w".to_string());
        docker_args.push(ctx.container_working_dir.clone());
        for (key, value) in env_vars {
            if !is_valid_env_key(key) {
                eprintln!("[build_command] Skipping invalid env var key: {:?}", key);
                continue;
            }
            docker_args.push("-e".to_string());
            docker_args.push(format!("{}={}", key, value));
        }
        docker_args.push(ctx.container_id.clone());
        docker_args.push(binary.to_string_lossy().to_string());
        docker_args.extend(args.iter().cloned());

        let mut cmd = Command::new(&docker_bin);
        cmd.args(&docker_args);
        cmd
    } else {
        let mut cmd = Command::new(binary);
        cmd.args(args).current_dir(worktree_path).envs(env_vars);
        cmd
    }
}

use crate::services::utils::is_valid_env_key;

#[cfg(test)]
mod tests {
    use super::*;

    // --- is_valid_env_key tests ---

    #[test]
    fn test_valid_env_keys() {
        assert!(is_valid_env_key("PATH"));
        assert!(is_valid_env_key("_PRIVATE"));
        assert!(is_valid_env_key("MY_VAR_2"));
    }

    #[test]
    fn test_invalid_env_keys() {
        assert!(!is_valid_env_key(""));
        assert!(!is_valid_env_key("1BAD"));
        assert!(!is_valid_env_key("key with spaces"));
        assert!(!is_valid_env_key("key=value"));
        assert!(!is_valid_env_key("key;injection"));
    }

    // --- build_env_vars tests ---

    #[test]
    fn test_build_env_vars_includes_fury_vars() {
        let ws = crate::test_helpers::test_workspace(uuid::Uuid::new_v4());
        let repo = crate::test_helpers::test_repo();
        let settings = crate::test_helpers::test_settings();
        let env = build_env_vars(&ws, &repo, &settings, None);
        assert_eq!(env.get("FURY_WORKSPACE_NAME").unwrap(), "test-workspace");
        assert_eq!(env.get("FURY_DEFAULT_BRANCH").unwrap(), "main");
        assert!(env.contains_key("FURY_PORT"));
        assert!(env.contains_key("FURY_ROOT_PATH"));
        assert!(env.contains_key("FURY_WORKSPACE_PATH"));
    }

    #[test]
    fn test_build_env_vars_includes_provider_env_vars() {
        let ws = crate::test_helpers::test_workspace(uuid::Uuid::new_v4());
        let repo = crate::test_helpers::test_repo();
        let mut settings = crate::test_helpers::test_settings();
        settings
            .provider
            .env_vars
            .insert("ANTHROPIC_API_KEY".to_string(), "sk-test".to_string());
        let env = build_env_vars(&ws, &repo, &settings, None);
        assert_eq!(env.get("ANTHROPIC_API_KEY").unwrap(), "sk-test");
    }

    #[test]
    fn test_build_env_vars_with_provider_override() {
        let ws = crate::test_helpers::test_workspace(uuid::Uuid::new_v4());
        let repo = crate::test_helpers::test_repo();
        let mut settings = crate::test_helpers::test_settings();
        settings
            .provider
            .env_vars
            .insert("ANTHROPIC_API_KEY".to_string(), "sk-global".to_string());
        let override_config = ProviderConfig {
            provider_type: crate::models::settings::ProviderType::Anthropic,
            env_vars: std::collections::HashMap::from([(
                "ANTHROPIC_API_KEY".to_string(),
                "sk-repo".to_string(),
            )]),
        };
        let env = build_env_vars(&ws, &repo, &settings, Some(&override_config));
        assert_eq!(env.get("ANTHROPIC_API_KEY").unwrap(), "sk-repo");
    }

    #[test]
    fn test_build_repo_env_vars() {
        let repo = crate::test_helpers::test_repo();
        let settings = crate::test_helpers::test_settings();
        let env = build_repo_env_vars(&repo, &settings, None);
        assert!(env.contains_key("FURY_ROOT_PATH"));
        assert_eq!(env.get("FURY_DEFAULT_BRANCH").unwrap(), "main");
        assert!(!env.contains_key("FURY_WORKSPACE_NAME")); // repo mode doesn't have this
    }

    #[test]
    fn test_build_repo_env_vars_with_provider_override() {
        let repo = crate::test_helpers::test_repo();
        let mut settings = crate::test_helpers::test_settings();
        settings
            .provider
            .env_vars
            .insert("ANTHROPIC_API_KEY".to_string(), "sk-global".to_string());
        let override_config = ProviderConfig {
            provider_type: crate::models::settings::ProviderType::Anthropic,
            env_vars: std::collections::HashMap::from([(
                "ANTHROPIC_API_KEY".to_string(),
                "sk-repo".to_string(),
            )]),
        };
        let env = build_repo_env_vars(&repo, &settings, Some(&override_config));
        assert_eq!(env.get("ANTHROPIC_API_KEY").unwrap(), "sk-repo");
    }

    // --- build_common_args tests ---

    #[test]
    fn test_build_common_args_basic() {
        let args = build_common_args(None, &[], None, None, false, false);
        assert!(args.contains(&"--output-format".to_string()));
        assert!(args.contains(&"stream-json".to_string()));
        assert!(args.contains(&"--verbose".to_string()));
        assert!(args.contains(&"--dangerously-skip-permissions".to_string()));
    }

    #[test]
    fn test_build_common_args_safe_mode() {
        let args = build_common_args(None, &[], None, None, true, false);
        assert!(!args.contains(&"--dangerously-skip-permissions".to_string()));
    }

    #[test]
    fn test_build_common_args_with_session_id() {
        let args = build_common_args(Some("sess-123"), &[], None, None, false, false);
        assert!(args.contains(&"--resume".to_string()));
        assert!(args.contains(&"sess-123".to_string()));
    }

    #[test]
    fn test_build_common_args_with_model() {
        let args = build_common_args(None, &[], None, Some("sonnet"), false, false);
        assert!(args.contains(&"--model".to_string()));
        assert!(args.contains(&"sonnet".to_string()));
    }

    #[test]
    fn test_build_common_args_invalid_model_ignored() {
        let args = build_common_args(None, &[], None, Some("gpt-4"), false, false);
        assert!(!args.contains(&"--model".to_string()));
    }

    #[test]
    fn test_build_common_args_with_linked_dirs() {
        let dirs = vec![std::path::PathBuf::from("/tmp/dir1")];
        let args = build_common_args(None, &dirs, None, None, false, false);
        assert!(args.contains(&"--add-dir".to_string()));
        assert!(args.contains(&"/tmp/dir1".to_string()));
    }

    #[test]
    fn test_build_common_args_disable_plan_mode() {
        let args = build_common_args(None, &[], None, None, false, true);
        let system_prompt = args.last().unwrap();
        assert!(system_prompt.contains("Do not enter plan mode"));
    }

    #[test]
    fn test_build_env_vars_agent_teams_enabled() {
        let ws = crate::test_helpers::test_workspace(uuid::Uuid::new_v4());
        let repo = crate::test_helpers::test_repo();
        let mut settings = crate::test_helpers::test_settings();
        settings.experimental.agent_teams = true;
        let env = build_env_vars(&ws, &repo, &settings, None);
        assert_eq!(env.get("FURY_AGENT_TEAMS").unwrap(), "true");
    }

    #[test]
    fn test_build_env_vars_agent_teams_disabled() {
        let ws = crate::test_helpers::test_workspace(uuid::Uuid::new_v4());
        let repo = crate::test_helpers::test_repo();
        let settings = crate::test_helpers::test_settings();
        let env = build_env_vars(&ws, &repo, &settings, None);
        assert!(!env.contains_key("FURY_AGENT_TEAMS"));
    }

    #[test]
    fn test_build_env_vars_port_base() {
        let ws = crate::test_helpers::test_workspace(uuid::Uuid::new_v4());
        let repo = crate::test_helpers::test_repo();
        let settings = crate::test_helpers::test_settings();
        let env = build_env_vars(&ws, &repo, &settings, None);
        assert_eq!(env.get("FURY_PORT").unwrap(), &ws.port_base.to_string());
    }

    #[test]
    fn test_build_repo_env_vars_no_workspace_fields() {
        let repo = crate::test_helpers::test_repo();
        let settings = crate::test_helpers::test_settings();
        let env = build_repo_env_vars(&repo, &settings, None);
        assert!(!env.contains_key("FURY_WORKSPACE_NAME"));
        assert!(!env.contains_key("FURY_WORKSPACE_PATH"));
        assert!(!env.contains_key("FURY_PORT"));
    }

    #[test]
    fn test_build_repo_env_vars_includes_provider_vars() {
        let repo = crate::test_helpers::test_repo();
        let mut settings = crate::test_helpers::test_settings();
        settings
            .provider
            .env_vars
            .insert("MY_KEY".to_string(), "my_val".to_string());
        let env = build_repo_env_vars(&repo, &settings, None);
        assert_eq!(env.get("MY_KEY").unwrap(), "my_val");
    }

    #[test]
    fn test_build_common_args_with_system_prompt_additions() {
        let args = build_common_args(
            None,
            &[],
            Some("Always respond in JSON"),
            None,
            false,
            false,
        );
        let system_prompt = args.last().unwrap();
        assert!(system_prompt.contains("Always respond in JSON"));
        // Safety rules should still be present
        assert!(system_prompt.contains("NEVER delete any files"));
    }

    #[test]
    fn test_build_common_args_empty_system_prompt_treated_as_none() {
        let args = build_common_args(None, &[], Some(""), None, false, false);
        let system_prompt = args.last().unwrap();
        // Should still have safety rules
        assert!(system_prompt.contains("NEVER delete any files"));
        // Shouldn't have a double newline from empty additions
        assert!(!system_prompt.starts_with("\n\n"));
    }

    #[test]
    fn test_build_common_args_multiple_linked_dirs() {
        let dirs = vec![
            std::path::PathBuf::from("/tmp/dir1"),
            std::path::PathBuf::from("/tmp/dir2"),
        ];
        let args = build_common_args(None, &dirs, None, None, false, false);
        let add_dir_count = args.iter().filter(|a| a.as_str() == "--add-dir").count();
        assert_eq!(add_dir_count, 2);
        assert!(args.contains(&"/tmp/dir1".to_string()));
        assert!(args.contains(&"/tmp/dir2".to_string()));
    }

    #[test]
    fn test_build_common_args_all_valid_models() {
        for model in &["sonnet", "opus", "haiku"] {
            let args = build_common_args(None, &[], None, Some(model), false, false);
            assert!(args.contains(&"--model".to_string()));
            assert!(args.contains(&model.to_string()));
        }
    }

    #[test]
    fn test_build_common_args_always_includes_search_code_instruction() {
        let args = build_common_args(None, &[], None, None, false, false);
        let system_prompt = args.last().unwrap();
        assert!(system_prompt.contains("FURY_ROOT_PATH"));
        assert!(system_prompt.contains("search_code"));
    }
}
