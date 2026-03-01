use std::collections::HashMap;
use std::path::Path;

use crate::error::AppError;
use crate::models::lsp::{
    InstallLspPluginRequest, LspCatalogEntry, LspPlugin, LspSuggestion, UninstallLspPluginRequest,
};
use crate::platform;
use crate::services::claude_process;

struct CatalogDef {
    plugin_name: &'static str,
    language: &'static str,
    binary_name: &'static str,
    extensions: &'static [&'static str],
    install_hint: &'static str,
}

const LSP_CATALOG: &[CatalogDef] = &[
    CatalogDef {
        plugin_name: "typescript-lsp",
        language: "TypeScript",
        binary_name: "typescript-language-server",
        extensions: &[".ts", ".tsx", ".js", ".jsx"],
        install_hint: "npm install -g typescript-language-server typescript",
    },
    CatalogDef {
        plugin_name: "pyright-lsp",
        language: "Python",
        binary_name: "pyright-langserver",
        extensions: &[".py"],
        install_hint: "npm install -g pyright",
    },
    CatalogDef {
        plugin_name: "rust-analyzer-lsp",
        language: "Rust",
        binary_name: "rust-analyzer",
        extensions: &[".rs"],
        install_hint: "rustup component add rust-analyzer",
    },
    CatalogDef {
        plugin_name: "gopls-lsp",
        language: "Go",
        binary_name: "gopls",
        extensions: &[".go"],
        install_hint: "go install golang.org/x/tools/gopls@latest",
    },
    CatalogDef {
        plugin_name: "swift-lsp",
        language: "Swift",
        binary_name: "sourcekit-lsp",
        extensions: &[".swift"],
        install_hint: "Included with Xcode",
    },
    CatalogDef {
        plugin_name: "clangd-lsp",
        language: "C/C++",
        binary_name: "clangd",
        extensions: &[".c", ".cpp", ".h", ".hpp", ".cc", ".cxx"],
        install_hint: "brew install llvm (macOS) or apt install clangd (Linux)",
    },
    CatalogDef {
        plugin_name: "csharp-lsp",
        language: "C#",
        binary_name: "csharp-ls",
        extensions: &[".cs"],
        install_hint: "dotnet tool install -g csharp-ls",
    },
    CatalogDef {
        plugin_name: "jdtls-lsp",
        language: "Java",
        binary_name: "jdtls",
        extensions: &[".java"],
        install_hint: "brew install jdtls (macOS) or download from eclipse.org",
    },
    CatalogDef {
        plugin_name: "kotlin-lsp",
        language: "Kotlin",
        binary_name: "kotlin-language-server",
        extensions: &[".kt", ".kts"],
        install_hint: "brew install kotlin-language-server (macOS)",
    },
    CatalogDef {
        plugin_name: "lua-lsp",
        language: "Lua",
        binary_name: "lua-language-server",
        extensions: &[".lua"],
        install_hint: "brew install lua-language-server (macOS)",
    },
    CatalogDef {
        plugin_name: "php-lsp",
        language: "PHP",
        binary_name: "intelephense",
        extensions: &[".php"],
        install_hint: "npm install -g intelephense",
    },
];

/// Build a lookup from plugin_name to catalog definition.
fn catalog_lookup() -> HashMap<&'static str, &'static CatalogDef> {
    LSP_CATALOG
        .iter()
        .map(|entry| (entry.plugin_name, entry))
        .collect()
}

/// Returns the hardcoded LSP plugin catalog.
pub fn get_lsp_catalog() -> Vec<LspCatalogEntry> {
    LSP_CATALOG
        .iter()
        .map(|def| LspCatalogEntry {
            plugin_name: def.plugin_name.to_string(),
            language: def.language.to_string(),
            binary_name: def.binary_name.to_string(),
            extensions: def.extensions.iter().map(|s| s.to_string()).collect(),
            install_hint: def.install_hint.to_string(),
        })
        .collect()
}

/// List installed LSP plugins by running `claude plugin list` and filtering
/// against the known catalog.
pub fn list_installed_lsp_plugins() -> Result<Vec<LspPlugin>, AppError> {
    let claude = claude_process::find_claude_binary()?;
    let lookup = catalog_lookup();

    let output = platform::command(&claude)
        .args(["plugin", "list"])
        .output()
        .map_err(|e| AppError::PluginError(format!("Failed to run claude plugin list: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("No plugins") || stderr.trim().is_empty() {
            return Ok(Vec::new());
        }
        return Err(AppError::PluginError(format!(
            "claude plugin list failed: {}",
            stderr
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    if stdout.trim().is_empty() {
        return Ok(Vec::new());
    }

    let mut plugins = Vec::new();
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        // Parse plugin list output: name, scope, enabled status
        // Format may vary — extract the first token as the plugin name
        let parts: Vec<&str> = line.split_whitespace().collect();
        let name = parts.first().copied().unwrap_or(line);

        // Only include known LSP plugins
        if let Some(catalog_def) = lookup.get(name) {
            let scope = parts.get(1).copied().unwrap_or("user").to_string();
            let enabled = !parts.contains(&"disabled");
            let binary_found = which::which(catalog_def.binary_name).is_ok();

            plugins.push(LspPlugin {
                name: name.to_string(),
                scope,
                enabled,
                binary_found,
                binary_name: catalog_def.binary_name.to_string(),
                install_hint: catalog_def.install_hint.to_string(),
            });
        }
    }

    Ok(plugins)
}

/// Install an LSP plugin via `claude plugin install`.
pub fn install_lsp_plugin(request: &InstallLspPluginRequest) -> Result<(), AppError> {
    let claude = claude_process::find_claude_binary()?;

    let plugin_ref = format!("{}@claude-plugins-official", request.plugin_name);

    let output = platform::command(&claude)
        .args(["plugin", "install", &plugin_ref, "--scope", &request.scope])
        .output()
        .map_err(|e| {
            AppError::PluginError(format!("Failed to run claude plugin install: {}", e))
        })?;

    if !output.status.success() {
        return Err(AppError::PluginError(format!(
            "claude plugin install failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(())
}

/// Uninstall an LSP plugin via `claude plugin uninstall`.
pub fn uninstall_lsp_plugin(request: &UninstallLspPluginRequest) -> Result<(), AppError> {
    let claude = claude_process::find_claude_binary()?;

    let plugin_ref = format!("{}@claude-plugins-official", request.plugin_name);

    let output = platform::command(&claude)
        .args([
            "plugin",
            "uninstall",
            &plugin_ref,
            "--scope",
            &request.scope,
        ])
        .output()
        .map_err(|e| {
            AppError::PluginError(format!("Failed to run claude plugin uninstall: {}", e))
        })?;

    if !output.status.success() {
        return Err(AppError::PluginError(format!(
            "claude plugin uninstall failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(())
}

/// Detect LSP plugins that could be useful for a repo by analyzing file extensions.
/// Returns suggestions for languages with >= 5 files that don't have installed plugins.
pub fn detect_lsp_suggestions(repo_path: &str) -> Result<Vec<LspSuggestion>, AppError> {
    let path = Path::new(repo_path);
    if !path.exists() {
        return Err(AppError::PluginError(format!(
            "Repository path does not exist: {}",
            repo_path
        )));
    }

    // Get file list from git
    let output = platform::command("git")
        .args(["ls-tree", "-r", "--name-only", "HEAD"])
        .current_dir(path)
        .output()
        .map_err(|e| AppError::PluginError(format!("Failed to run git ls-tree: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::PluginError(format!(
            "git ls-tree failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Count file extensions
    let mut ext_counts: HashMap<String, usize> = HashMap::new();
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(dot_pos) = line.rfind('.') {
            let ext = &line[dot_pos..];
            *ext_counts.entry(ext.to_lowercase()).or_insert(0) += 1;
        }
    }

    // Get currently installed LSP plugins
    let installed = list_installed_lsp_plugins().unwrap_or_default();
    let installed_names: std::collections::HashSet<String> =
        installed.iter().map(|p| p.name.clone()).collect();

    // Match against catalog
    let mut suggestions = Vec::new();
    for def in LSP_CATALOG {
        if installed_names.contains(def.plugin_name) {
            continue;
        }

        let file_count: usize = def
            .extensions
            .iter()
            .map(|ext| ext_counts.get(&ext.to_lowercase()).copied().unwrap_or(0))
            .sum();

        if file_count >= 5 {
            suggestions.push(LspSuggestion {
                plugin_name: def.plugin_name.to_string(),
                language: def.language.to_string(),
                file_count,
                binary_name: def.binary_name.to_string(),
                install_hint: def.install_hint.to_string(),
            });
        }
    }

    // Sort by file count descending
    suggestions.sort_by(|a, b| b.file_count.cmp(&a.file_count));

    Ok(suggestions)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_catalog_has_11_entries() {
        assert_eq!(LSP_CATALOG.len(), 11);
    }

    #[test]
    fn test_get_lsp_catalog_returns_all_entries() {
        let catalog = get_lsp_catalog();
        assert_eq!(catalog.len(), 11);
        assert_eq!(catalog[0].plugin_name, "typescript-lsp");
    }

    #[test]
    fn test_catalog_lookup_contains_all_entries() {
        let lookup = catalog_lookup();
        assert_eq!(lookup.len(), 11);
        assert!(lookup.contains_key("typescript-lsp"));
        assert!(lookup.contains_key("rust-analyzer-lsp"));
        assert!(lookup.contains_key("php-lsp"));
    }

    #[test]
    fn test_catalog_extensions_are_lowercase_with_dot() {
        for def in LSP_CATALOG {
            for ext in def.extensions {
                assert!(
                    ext.starts_with('.'),
                    "Extension {} should start with '.'",
                    ext
                );
                assert_eq!(
                    ext.to_lowercase(),
                    *ext,
                    "Extension {} should be lowercase",
                    ext
                );
            }
        }
    }
}
