use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// The permissions section of a Claude settings.json file.
#[derive(Debug, Clone, Default, Serialize, Deserialize, specta::Type)]
pub struct ClaudePermissions {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub allow: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub deny: Vec<String>,
}

/// Response for get_claude_permissions: returns the current allow/deny lists.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ClaudePermissionsResponse {
    pub permissions: ClaudePermissions,
    pub settings_path: String,
}

fn claude_settings_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("~"))
        .join(".claude")
        .join("settings.json")
}

fn read_settings(path: &PathBuf) -> Result<serde_json::Value, AppError> {
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let content = std::fs::read_to_string(path)
        .map_err(|e| AppError::AgentError(format!("Failed to read Claude settings: {}", e)))?;
    serde_json::from_str(&content)
        .map_err(|e| AppError::AgentError(format!("Failed to parse Claude settings: {}", e)))
}

fn write_settings(path: &PathBuf, value: &serde_json::Value) -> Result<(), AppError> {
    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            AppError::AgentError(format!("Failed to create .claude directory: {}", e))
        })?;
    }
    let content = serde_json::to_string_pretty(value)
        .map_err(|e| AppError::AgentError(format!("Failed to serialize Claude settings: {}", e)))?;
    std::fs::write(path, content)
        .map_err(|e| AppError::AgentError(format!("Failed to write Claude settings: {}", e)))
}

/// Read the current Claude permission rules from ~/.claude/settings.json.
#[tauri::command]
#[specta::specta]
pub fn get_claude_permissions() -> Result<ClaudePermissionsResponse, AppError> {
    let path = claude_settings_path();
    let settings = read_settings(&path)?;

    let permissions = settings
        .get("permissions")
        .map(|p| serde_json::from_value::<ClaudePermissions>(p.clone()).unwrap_or_default())
        .unwrap_or_default();

    Ok(ClaudePermissionsResponse {
        permissions,
        settings_path: path.to_string_lossy().to_string(),
    })
}

/// Add permission rules to ~/.claude/settings.json.
/// Merges with existing rules (no duplicates).
#[tauri::command]
#[specta::specta]
pub fn add_claude_permissions(rules: Vec<String>) -> Result<ClaudePermissions, AppError> {
    let path = claude_settings_path();
    let mut settings = read_settings(&path)?;

    let permissions = settings
        .as_object_mut()
        .ok_or_else(|| AppError::AgentError("Settings is not a JSON object".to_string()))?
        .entry("permissions")
        .or_insert_with(|| serde_json::json!({}));

    let allow = permissions
        .as_object_mut()
        .ok_or_else(|| AppError::AgentError("Permissions is not a JSON object".to_string()))?
        .entry("allow")
        .or_insert_with(|| serde_json::json!([]));

    let existing: Vec<String> = serde_json::from_value(allow.clone()).unwrap_or_default();
    let mut merged = existing;
    for rule in &rules {
        if !merged.contains(rule) {
            merged.push(rule.clone());
        }
    }
    *allow = serde_json::to_value(&merged)
        .map_err(|e| AppError::AgentError(format!("Failed to serialize rules: {}", e)))?;

    write_settings(&path, &settings)?;

    // Return updated permissions
    let updated = settings
        .get("permissions")
        .map(|p| serde_json::from_value::<ClaudePermissions>(p.clone()).unwrap_or_default())
        .unwrap_or_default();

    Ok(updated)
}

/// Remove permission rules from ~/.claude/settings.json.
#[tauri::command]
#[specta::specta]
pub fn remove_claude_permissions(rules: Vec<String>) -> Result<ClaudePermissions, AppError> {
    let path = claude_settings_path();
    let mut settings = read_settings(&path)?;

    if let Some(permissions) = settings.get_mut("permissions") {
        if let Some(allow) = permissions.get_mut("allow") {
            let existing: Vec<String> = serde_json::from_value(allow.clone()).unwrap_or_default();
            let filtered: Vec<String> = existing
                .into_iter()
                .filter(|r| !rules.contains(r))
                .collect();
            *allow = serde_json::to_value(&filtered)
                .map_err(|e| AppError::AgentError(format!("Failed to serialize rules: {}", e)))?;
        }
    }

    write_settings(&path, &settings)?;

    let updated = settings
        .get("permissions")
        .map(|p| serde_json::from_value::<ClaudePermissions>(p.clone()).unwrap_or_default())
        .unwrap_or_default();

    Ok(updated)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_read_settings_missing_file() {
        let path = PathBuf::from("/tmp/nonexistent-claude-settings.json");
        let settings = read_settings(&path).unwrap();
        assert_eq!(settings, serde_json::json!({}));
    }

    #[test]
    fn test_read_write_settings_roundtrip() {
        let mut tmp = NamedTempFile::new().unwrap();
        let initial = serde_json::json!({"permissions": {"allow": ["Read"]}});
        write!(tmp, "{}", serde_json::to_string(&initial).unwrap()).unwrap();

        let path = tmp.path().to_path_buf();
        let settings = read_settings(&path).unwrap();
        assert_eq!(settings["permissions"]["allow"][0], "Read");

        write_settings(&path, &settings).unwrap();
        let reread = read_settings(&path).unwrap();
        assert_eq!(reread["permissions"]["allow"][0], "Read");
    }

    #[test]
    fn test_claude_permissions_default() {
        let perms = ClaudePermissions::default();
        assert!(perms.allow.is_empty());
        assert!(perms.deny.is_empty());
    }

    #[test]
    fn test_add_permissions_to_empty_file() {
        let tmp = NamedTempFile::new().unwrap();
        let path = tmp.path().to_path_buf();
        write_settings(&path, &serde_json::json!({})).unwrap();

        // Simulate add_claude_permissions logic on the temp file
        let mut settings = read_settings(&path).unwrap();
        let permissions = settings
            .as_object_mut()
            .unwrap()
            .entry("permissions")
            .or_insert_with(|| serde_json::json!({}));
        let allow = permissions
            .as_object_mut()
            .unwrap()
            .entry("allow")
            .or_insert_with(|| serde_json::json!([]));

        let existing: Vec<String> = serde_json::from_value(allow.clone()).unwrap_or_default();
        let mut merged = existing;
        for rule in &["Read".to_string(), "Glob".to_string()] {
            if !merged.contains(rule) {
                merged.push(rule.clone());
            }
        }
        *allow = serde_json::to_value(&merged).unwrap();
        write_settings(&path, &settings).unwrap();

        // Verify
        let result = read_settings(&path).unwrap();
        let perms: ClaudePermissions =
            serde_json::from_value(result["permissions"].clone()).unwrap();
        assert_eq!(perms.allow, vec!["Read", "Glob"]);
    }

    #[test]
    fn test_add_permissions_no_duplicates() {
        let tmp = NamedTempFile::new().unwrap();
        let path = tmp.path().to_path_buf();
        let initial = serde_json::json!({"permissions": {"allow": ["Read"]}});
        write_settings(&path, &initial).unwrap();

        let mut settings = read_settings(&path).unwrap();
        let allow = settings["permissions"].as_object_mut().unwrap()
            .entry("allow")
            .or_insert_with(|| serde_json::json!([]));
        let existing: Vec<String> = serde_json::from_value(allow.clone()).unwrap_or_default();
        let mut merged = existing;
        for rule in &["Read".to_string(), "Write".to_string()] {
            if !merged.contains(rule) {
                merged.push(rule.clone());
            }
        }
        *allow = serde_json::to_value(&merged).unwrap();
        write_settings(&path, &settings).unwrap();

        let result = read_settings(&path).unwrap();
        let perms: ClaudePermissions =
            serde_json::from_value(result["permissions"].clone()).unwrap();
        assert_eq!(perms.allow, vec!["Read", "Write"]); // No duplicate "Read"
    }

    #[test]
    fn test_remove_permissions() {
        let tmp = NamedTempFile::new().unwrap();
        let path = tmp.path().to_path_buf();
        let initial = serde_json::json!({"permissions": {"allow": ["Read", "Write", "Glob"]}});
        write_settings(&path, &initial).unwrap();

        let mut settings = read_settings(&path).unwrap();
        if let Some(allow) = settings["permissions"].as_object_mut().unwrap().get_mut("allow") {
            let existing: Vec<String> = serde_json::from_value(allow.clone()).unwrap_or_default();
            let filtered: Vec<String> = existing
                .into_iter()
                .filter(|r| !["Read", "Glob"].contains(&r.as_str()))
                .collect();
            *allow = serde_json::to_value(&filtered).unwrap();
        }
        write_settings(&path, &settings).unwrap();

        let result = read_settings(&path).unwrap();
        let perms: ClaudePermissions =
            serde_json::from_value(result["permissions"].clone()).unwrap();
        assert_eq!(perms.allow, vec!["Write"]); // Read and Glob removed
    }

    #[test]
    fn test_remove_nonexistent_rule() {
        let tmp = NamedTempFile::new().unwrap();
        let path = tmp.path().to_path_buf();
        let initial = serde_json::json!({"permissions": {"allow": ["Read"]}});
        write_settings(&path, &initial).unwrap();

        let mut settings = read_settings(&path).unwrap();
        if let Some(allow) = settings["permissions"].as_object_mut().unwrap().get_mut("allow") {
            let existing: Vec<String> = serde_json::from_value(allow.clone()).unwrap_or_default();
            let filtered: Vec<String> = existing
                .into_iter()
                .filter(|r| r != "NonExistent")
                .collect();
            *allow = serde_json::to_value(&filtered).unwrap();
        }
        write_settings(&path, &settings).unwrap();

        let result = read_settings(&path).unwrap();
        let perms: ClaudePermissions =
            serde_json::from_value(result["permissions"].clone()).unwrap();
        assert_eq!(perms.allow, vec!["Read"]); // Unchanged
    }

    #[test]
    fn test_read_settings_invalid_json() {
        let mut tmp = NamedTempFile::new().unwrap();
        write!(tmp, "not valid json {{{{").unwrap();
        let result = read_settings(&tmp.path().to_path_buf());
        assert!(result.is_err());
    }

    #[test]
    fn test_claude_permissions_serialization() {
        let perms = ClaudePermissions {
            allow: vec!["Read".to_string(), "Write".to_string()],
            deny: vec![],
        };
        let json = serde_json::to_value(&perms).unwrap();
        // deny should be skipped when empty (skip_serializing_if)
        assert!(json.get("deny").is_none());
        assert_eq!(json["allow"].as_array().unwrap().len(), 2);
    }
}
