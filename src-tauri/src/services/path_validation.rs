use std::path::{Component, Path, PathBuf};

use crate::error::AppError;

/// Sensitive directories under the user's home that should never be read.
const SENSITIVE_DIRS: &[&str] = &[".ssh", ".gnupg", ".gpg", ".aws", ".config/gcloud"];

/// Validate that `child` is contained within `root` after normalization.
/// This prevents path traversal attacks where `file_path` contains `..` segments
/// that escape the intended root directory.
///
/// If the file exists on disk, we canonicalize both paths for an exact prefix check.
/// If the file does not exist yet (e.g. new/untracked), we normalize the path by
/// resolving `.` and `..` components manually.
pub fn validate_path_within_root(child: &Path, root: &Path) -> Result<PathBuf, AppError> {
    let resolved_root = resolve_path(root)
        .map_err(|e| AppError::PathTraversal(format!("failed to resolve root path: {}", e)))?;

    let resolved_child = resolve_path(child)
        .map_err(|e| AppError::PathTraversal(format!("failed to resolve file path: {}", e)))?;

    if !resolved_child.starts_with(&resolved_root) {
        return Err(AppError::PathTraversal(format!(
            "path '{}' is outside allowed root '{}'",
            resolved_child.display(),
            resolved_root.display()
        )));
    }

    Ok(resolved_child)
}

/// Check that a path is not inside a sensitive home directory (e.g. ~/.ssh).
pub fn reject_sensitive_paths(path: &Path) -> Result<(), AppError> {
    if let Some(home) = dirs::home_dir() {
        let resolved = resolve_path(path).unwrap_or_else(|_| normalize_path(path));

        for dir in SENSITIVE_DIRS {
            let sensitive = home.join(dir);
            if resolved.starts_with(&sensitive) {
                return Err(AppError::PathTraversal(format!(
                    "access to '{}' is not allowed",
                    resolved.display()
                )));
            }
        }
    }
    Ok(())
}

/// Resolve a path to its canonical form, handling the case where the file doesn't exist
/// by canonicalizing the nearest existing ancestor and appending the remaining components.
/// This ensures consistent symlink resolution (important on macOS where /var -> /private/var).
fn resolve_path(path: &Path) -> Result<PathBuf, String> {
    // If the path exists, canonicalize directly
    if path.exists() {
        return path
            .canonicalize()
            .map_err(|e| format!("{}: {}", path.display(), e));
    }

    // Walk up to find the nearest existing ancestor, then append remaining components
    let normalized = normalize_path(path);
    let mut ancestor = normalized.as_path();
    let mut tail_components = Vec::new();

    loop {
        if ancestor.exists() {
            let canonical_ancestor = ancestor
                .canonicalize()
                .map_err(|e| format!("{}: {}", ancestor.display(), e))?;
            let mut result = canonical_ancestor;
            for comp in tail_components.iter().rev() {
                result.push(comp);
            }
            return Ok(result);
        }
        if let Some(file_name) = ancestor.file_name() {
            tail_components.push(file_name.to_owned());
            ancestor = ancestor
                .parent()
                .ok_or_else(|| format!("cannot resolve path: {}", path.display()))?;
        } else {
            // Reached root or empty path — just return normalized
            return Ok(normalized);
        }
    }
}

/// Normalize a path by resolving `.` and `..` components without touching the filesystem.
/// This is used when a file may not exist yet.
fn normalize_path(path: &Path) -> PathBuf {
    let mut components = Vec::new();
    for component in path.components() {
        match component {
            Component::ParentDir => {
                // Only pop if we have a normal component to pop
                if matches!(components.last(), Some(Component::Normal(_))) {
                    components.pop();
                } else if !matches!(components.last(), Some(Component::RootDir)) {
                    components.push(component);
                }
            }
            Component::CurDir => {} // skip
            _ => components.push(component),
        }
    }
    components.iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_valid_path_within_root() {
        let root = PathBuf::from("/tmp/project");
        let child = PathBuf::from("/tmp/project/src/main.rs");
        assert!(validate_path_within_root(&child, &root).is_ok());
    }

    #[test]
    fn test_path_traversal_rejected() {
        let root = PathBuf::from("/tmp/project");
        let child = PathBuf::from("/tmp/project/../../../etc/passwd");
        let result = validate_path_within_root(&child, &root);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("outside allowed root"));
    }

    #[test]
    fn test_path_outside_root_rejected() {
        let root = PathBuf::from("/tmp/project");
        let child = PathBuf::from("/etc/passwd");
        let result = validate_path_within_root(&child, &root);
        assert!(result.is_err());
    }

    #[test]
    fn test_normalize_resolves_parent() {
        let p = PathBuf::from("/a/b/../c");
        assert_eq!(normalize_path(&p), PathBuf::from("/a/c"));
    }

    #[test]
    fn test_normalize_resolves_current() {
        let p = PathBuf::from("/a/./b/./c");
        assert_eq!(normalize_path(&p), PathBuf::from("/a/b/c"));
    }

    #[test]
    fn test_reject_sensitive_ssh() {
        if let Some(home) = dirs::home_dir() {
            let path = home.join(".ssh/id_rsa");
            assert!(reject_sensitive_paths(&path).is_err());
        }
    }

    #[test]
    fn test_allow_normal_path() {
        let path = PathBuf::from("/tmp/safe/file.txt");
        assert!(reject_sensitive_paths(&path).is_ok());
    }
}
