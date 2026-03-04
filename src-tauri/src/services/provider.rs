use crate::models::repository::GitProvider;
use crate::platform;
use std::path::Path;

/// Detect the git hosting provider from the repo's origin remote URL.
pub fn detect_provider(repo_path: &Path) -> (GitProvider, Option<String>) {
    let output = platform::command("git")
        .args(["remote", "get-url", "origin"])
        .current_dir(repo_path)
        .output();

    let url = match output {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).trim().to_string(),
        _ => return (GitProvider::Unknown, None),
    };

    if url.is_empty() {
        return (GitProvider::Unknown, None);
    }

    let provider = provider_from_url(&url);
    (provider, Some(url))
}

/// Determine the provider from a remote URL string.
fn provider_from_url(url: &str) -> GitProvider {
    let lower = url.to_lowercase();
    if lower.contains("github.com") || lower.contains("github.") {
        GitProvider::GitHub
    } else if lower.contains("dev.azure.com")
        || lower.contains("visualstudio.com")
        || lower.contains("ssh.dev.azure.com")
    {
        GitProvider::AzureDevOps
    } else {
        GitProvider::Unknown
    }
}

/// Parse an Azure DevOps remote URL into (org, project, repo).
///
/// Supported formats:
/// - `https://dev.azure.com/{org}/{project}/_git/{repo}`
/// - `git@ssh.dev.azure.com:v3/{org}/{project}/{repo}`
/// - `https://{org}.visualstudio.com/{project}/_git/{repo}`
/// - `https://{org}@dev.azure.com/{org}/{project}/_git/{repo}` (with username)
pub fn parse_ado_remote(url: &str) -> Option<(String, String, String)> {
    // SSH format: git@ssh.dev.azure.com:v3/{org}/{project}/{repo}
    if url.contains("ssh.dev.azure.com") {
        let parts: Vec<&str> = url.split(':').collect();
        if parts.len() >= 2 {
            let path = parts[1..].join(":");
            let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
            // v3/{org}/{project}/{repo}
            if segments.len() >= 4 && segments[0] == "v3" {
                return Some((
                    segments[1].to_string(),
                    segments[2].to_string(),
                    segments[3].to_string(),
                ));
            }
        }
        return None;
    }

    // HTTPS format: dev.azure.com or visualstudio.com
    if let Ok(parsed) = url::Url::parse(url) {
        let host = parsed.host_str().unwrap_or("");
        let segments: Vec<&str> = parsed.path().split('/').filter(|s| !s.is_empty()).collect();

        if host.contains("dev.azure.com") {
            // https://dev.azure.com/{org}/{project}/_git/{repo}
            // or https://{user}@dev.azure.com/{org}/{project}/_git/{repo}
            if segments.len() >= 4 && segments[2] == "_git" {
                return Some((
                    segments[0].to_string(),
                    segments[1].to_string(),
                    segments[3].to_string(),
                ));
            }
        } else if host.contains("visualstudio.com") {
            // https://{org}.visualstudio.com/{project}/_git/{repo}
            let org = host.split('.').next().unwrap_or("").to_string();
            if segments.len() >= 3 && segments[1] == "_git" {
                return Some((org, segments[0].to_string(), segments[2].to_string()));
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provider_from_url_github() {
        assert_eq!(
            provider_from_url("https://github.com/user/repo.git"),
            GitProvider::GitHub
        );
        assert_eq!(
            provider_from_url("git@github.com:user/repo.git"),
            GitProvider::GitHub
        );
    }

    #[test]
    fn test_provider_from_url_ado() {
        assert_eq!(
            provider_from_url("https://dev.azure.com/org/project/_git/repo"),
            GitProvider::AzureDevOps
        );
        assert_eq!(
            provider_from_url("git@ssh.dev.azure.com:v3/org/project/repo"),
            GitProvider::AzureDevOps
        );
        assert_eq!(
            provider_from_url("https://org.visualstudio.com/project/_git/repo"),
            GitProvider::AzureDevOps
        );
    }

    #[test]
    fn test_provider_from_url_unknown() {
        assert_eq!(
            provider_from_url("https://gitlab.com/user/repo.git"),
            GitProvider::Unknown
        );
        assert_eq!(
            provider_from_url("https://bitbucket.org/user/repo.git"),
            GitProvider::Unknown
        );
    }

    #[test]
    fn test_parse_ado_remote_https() {
        let result = parse_ado_remote("https://dev.azure.com/myorg/myproject/_git/myrepo").unwrap();
        assert_eq!(
            result,
            ("myorg".into(), "myproject".into(), "myrepo".into())
        );
    }

    #[test]
    fn test_parse_ado_remote_https_with_user() {
        let result =
            parse_ado_remote("https://user@dev.azure.com/myorg/myproject/_git/myrepo").unwrap();
        assert_eq!(
            result,
            ("myorg".into(), "myproject".into(), "myrepo".into())
        );
    }

    #[test]
    fn test_parse_ado_remote_ssh() {
        let result = parse_ado_remote("git@ssh.dev.azure.com:v3/myorg/myproject/myrepo").unwrap();
        assert_eq!(
            result,
            ("myorg".into(), "myproject".into(), "myrepo".into())
        );
    }

    #[test]
    fn test_parse_ado_remote_visualstudio() {
        let result =
            parse_ado_remote("https://myorg.visualstudio.com/myproject/_git/myrepo").unwrap();
        assert_eq!(
            result,
            ("myorg".into(), "myproject".into(), "myrepo".into())
        );
    }

    #[test]
    fn test_parse_ado_remote_invalid() {
        assert!(parse_ado_remote("https://github.com/user/repo.git").is_none());
        assert!(parse_ado_remote("not-a-url").is_none());
    }
}
