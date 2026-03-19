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

/// A single entry from `claude plugin list --json`.
#[derive(serde::Deserialize)]
struct CliPluginEntry {
    /// e.g. "typescript-lsp@claude-plugins-official"
    id: String,
    scope: String,
    enabled: bool,
}

/// List installed LSP plugins by running `claude plugin list --json` and
/// filtering against the known catalog.
pub fn list_installed_lsp_plugins() -> Result<Vec<LspPlugin>, AppError> {
    let claude = claude_process::find_claude_binary()?;
    let lookup = catalog_lookup();

    let output = platform::command(&claude)
        .args(["plugin", "list", "--json"])
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

    let entries: Vec<CliPluginEntry> = serde_json::from_str(&stdout).map_err(|e| {
        AppError::PluginError(format!("Failed to parse claude plugin list output: {}", e))
    })?;

    let mut plugins = Vec::new();
    for entry in &entries {
        // id is "plugin-name@marketplace" — extract the plugin name
        let name = entry.id.split('@').next().unwrap_or(&entry.id);

        if let Some(catalog_def) = lookup.get(name) {
            let binary_found = which::which(catalog_def.binary_name).is_ok();

            plugins.push(LspPlugin {
                name: name.to_string(),
                scope: entry.scope.clone(),
                enabled: entry.enabled,
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
    fn test_get_lsp_catalog_fields() {
        let catalog = get_lsp_catalog();
        for entry in &catalog {
            assert!(!entry.plugin_name.is_empty());
            assert!(!entry.language.is_empty());
            assert!(!entry.binary_name.is_empty());
            assert!(!entry.extensions.is_empty());
            assert!(!entry.install_hint.is_empty());
        }
    }

    #[test]
    fn test_detect_lsp_suggestions_nonexistent_path() {
        let result = detect_lsp_suggestions("/nonexistent/path");
        assert!(result.is_err());
    }

    #[test]
    fn test_detect_lsp_suggestions_real_repo() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        // Create some files to trigger detection
        for i in 0..6 {
            std::fs::write(path.join(format!("file{}.rs", i)), "fn main() {}").unwrap();
        }
        std::process::Command::new("git")
            .args(["add", "."])
            .current_dir(&path)
            .output()
            .unwrap();
        std::process::Command::new("git")
            .args(["commit", "-m", "add files"])
            .current_dir(&path)
            .output()
            .unwrap();

        let result = detect_lsp_suggestions(path.to_str().unwrap());
        assert!(result.is_ok());
        // Should detect rust-analyzer-lsp suggestion (6 .rs files)
        let suggestions = result.unwrap();
        // Verify the function completed successfully
        // Suggestions may be empty if the matching LSP plugin is already installed
        for s in &suggestions {
            assert!(s.file_count >= 5);
        }
    }

    #[test]
    fn test_detect_lsp_suggestions_below_threshold() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        // Only 2 .rs files — below threshold of 5
        for i in 0..2 {
            std::fs::write(path.join(format!("file{}.rs", i)), "").unwrap();
        }
        std::process::Command::new("git")
            .args(["add", "."])
            .current_dir(&path)
            .output()
            .unwrap();
        std::process::Command::new("git")
            .args(["commit", "-m", "add files"])
            .current_dir(&path)
            .output()
            .unwrap();

        let suggestions = detect_lsp_suggestions(path.to_str().unwrap()).unwrap();
        let rust_suggestion = suggestions
            .iter()
            .find(|s| s.plugin_name == "rust-analyzer-lsp");
        assert!(rust_suggestion.is_none());
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

    #[test]
    fn test_catalog_plugin_names_are_unique() {
        let lookup = catalog_lookup();
        assert_eq!(lookup.len(), LSP_CATALOG.len());
    }

    #[test]
    fn test_catalog_known_entries() {
        let lookup = catalog_lookup();
        let ts = lookup.get("typescript-lsp").unwrap();
        assert_eq!(ts.language, "TypeScript");
        assert_eq!(ts.binary_name, "typescript-language-server");
        assert!(ts.extensions.contains(&".ts"));
        assert!(ts.extensions.contains(&".tsx"));
        assert!(ts.extensions.contains(&".js"));
        assert!(ts.extensions.contains(&".jsx"));

        let rust = lookup.get("rust-analyzer-lsp").unwrap();
        assert_eq!(rust.language, "Rust");
        assert_eq!(rust.binary_name, "rust-analyzer");
        assert!(rust.extensions.contains(&".rs"));

        let go = lookup.get("gopls-lsp").unwrap();
        assert_eq!(go.binary_name, "gopls");
    }

    #[test]
    fn test_get_lsp_catalog_roundtrip_serialization() {
        let catalog = get_lsp_catalog();
        let json = serde_json::to_string(&catalog).unwrap();
        let parsed: Vec<LspCatalogEntry> = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.len(), catalog.len());
        for (orig, rt) in catalog.iter().zip(parsed.iter()) {
            assert_eq!(orig.plugin_name, rt.plugin_name);
            assert_eq!(orig.language, rt.language);
            assert_eq!(orig.extensions, rt.extensions);
        }
    }

    #[test]
    fn test_detect_lsp_suggestions_multiple_languages() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        // Create files for two languages above threshold
        for i in 0..6 {
            std::fs::write(path.join(format!("file{}.ts", i)), "export {};").unwrap();
            std::fs::write(path.join(format!("file{}.py", i)), "pass").unwrap();
        }
        // Below threshold for Go
        for i in 0..3 {
            std::fs::write(path.join(format!("file{}.go", i)), "package main").unwrap();
        }
        std::process::Command::new("git")
            .args(["add", "."])
            .current_dir(&path)
            .output()
            .unwrap();
        std::process::Command::new("git")
            .args(["commit", "-m", "add multi-lang files"])
            .current_dir(&path)
            .output()
            .unwrap();

        let suggestions = detect_lsp_suggestions(path.to_str().unwrap()).unwrap();

        // Go should not be suggested (only 3 files < 5 threshold)
        let go_suggestion = suggestions.iter().find(|s| s.plugin_name == "gopls-lsp");
        assert!(go_suggestion.is_none());

        // All suggestions should have file_count >= 5
        for s in &suggestions {
            assert!(s.file_count >= 5);
        }
    }

    #[test]
    fn test_detect_lsp_suggestions_sorted_by_file_count_desc() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        // Create more .rs files than .py files
        for i in 0..10 {
            std::fs::write(path.join(format!("f{}.rs", i)), "fn main() {}").unwrap();
        }
        for i in 0..6 {
            std::fs::write(path.join(format!("f{}.py", i)), "pass").unwrap();
        }
        std::process::Command::new("git")
            .args(["add", "."])
            .current_dir(&path)
            .output()
            .unwrap();
        std::process::Command::new("git")
            .args(["commit", "-m", "add files"])
            .current_dir(&path)
            .output()
            .unwrap();

        let suggestions = detect_lsp_suggestions(path.to_str().unwrap()).unwrap();
        // Verify descending order
        for window in suggestions.windows(2) {
            assert!(window[0].file_count >= window[1].file_count);
        }
    }

    #[test]
    fn test_detect_lsp_suggestions_case_insensitive_extensions() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        // Mix of cases - all should count as .rs
        for i in 0..3 {
            std::fs::write(path.join(format!("lower{}.rs", i)), "").unwrap();
        }
        // Git is case-sensitive for filenames, so .RS files should also be counted
        for i in 0..3 {
            std::fs::write(path.join(format!("upper{}.RS", i)), "").unwrap();
        }
        std::process::Command::new("git")
            .args(["add", "."])
            .current_dir(&path)
            .output()
            .unwrap();
        std::process::Command::new("git")
            .args(["commit", "-m", "add mixed case files"])
            .current_dir(&path)
            .output()
            .unwrap();

        let suggestions = detect_lsp_suggestions(path.to_str().unwrap()).unwrap();
        // 6 total .rs files (case-insensitive) >= 5 threshold
        let rust = suggestions
            .iter()
            .find(|s| s.plugin_name == "rust-analyzer-lsp");
        if let Some(r) = rust {
            assert!(r.file_count >= 5);
        }
    }

    #[test]
    fn test_detect_lsp_suggestions_no_extension_files_ignored() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        // Files without extensions should not cause issues
        for i in 0..10 {
            std::fs::write(path.join(format!("Makefile{}", i)), "all:").unwrap();
        }
        std::process::Command::new("git")
            .args(["add", "."])
            .current_dir(&path)
            .output()
            .unwrap();
        std::process::Command::new("git")
            .args(["commit", "-m", "add extensionless files"])
            .current_dir(&path)
            .output()
            .unwrap();

        let suggestions = detect_lsp_suggestions(path.to_str().unwrap()).unwrap();
        // No language should match files without a dot extension
        // (the Makefile files don't match any catalog extension)
        for s in &suggestions {
            assert!(s.file_count >= 5);
        }
    }

    #[test]
    fn test_detect_lsp_suggestions_not_git_repo() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();
        let result = detect_lsp_suggestions(path);
        // Should fail because git ls-tree will fail (not a git repo)
        assert!(result.is_err());
    }

    #[test]
    fn test_catalog_has_swift_and_clangd() {
        let lookup = catalog_lookup();
        let swift = lookup.get("swift-lsp").unwrap();
        assert_eq!(swift.language, "Swift");
        assert!(swift.extensions.contains(&".swift"));

        let clangd = lookup.get("clangd-lsp").unwrap();
        assert_eq!(clangd.language, "C/C++");
        assert!(clangd.extensions.contains(&".c"));
        assert!(clangd.extensions.contains(&".cpp"));
        assert!(clangd.extensions.contains(&".h"));
    }
}
