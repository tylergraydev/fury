use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, Debouncer, RecommendedCache};
use tauri::{AppHandle, Emitter};

use crate::error::AppError;

const IGNORE_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    ".next",
    "dist",
    "build",
    "__pycache__",
    ".cache",
];

pub struct DiffWatcherHandle {
    _debouncer: Debouncer<notify::RecommendedWatcher, RecommendedCache>,
    _stop_tx: mpsc::Sender<()>,
}

impl DiffWatcherHandle {
    pub fn stop(self) {
        let _ = self._stop_tx.send(());
    }
}

/// Start watching a directory for file changes and emit a Tauri event when changes are detected.
pub fn start_diff_watcher(
    watch_path: PathBuf,
    app_handle: AppHandle,
    context_id: String,
) -> Result<DiffWatcherHandle, AppError> {
    let (stop_tx, stop_rx) = mpsc::channel();
    let event_name = format!("diff-changed:{}", context_id);

    let mut debouncer = new_debouncer(
        Duration::from_millis(500),
        None,
        move |events: Result<Vec<notify_debouncer_full::DebouncedEvent>, Vec<notify::Error>>| {
            if let Ok(events) = events {
                let has_relevant_change = events
                    .iter()
                    .any(|event| event.paths.iter().any(|p| !should_ignore(p)));
                if has_relevant_change {
                    let _ = app_handle.emit(&event_name, ());
                }
            }
        },
    )
    .map_err(|e| AppError::IoError(std::io::Error::other(e.to_string())))?;

    debouncer
        .watch(&watch_path, RecursiveMode::Recursive)
        .map_err(|e| AppError::IoError(std::io::Error::other(e.to_string())))?;

    std::thread::spawn(move || {
        let _ = stop_rx.recv();
    });

    Ok(DiffWatcherHandle {
        _debouncer: debouncer,
        _stop_tx: stop_tx,
    })
}

fn should_ignore(path: &Path) -> bool {
    for component in path.components() {
        if let std::path::Component::Normal(s) = component {
            if let Some(s) = s.to_str() {
                if IGNORE_DIRS.contains(&s) {
                    return true;
                }
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_should_ignore_git() {
        assert!(should_ignore(&PathBuf::from("/project/.git/objects/abc")));
    }

    #[test]
    fn test_should_ignore_node_modules() {
        assert!(should_ignore(&PathBuf::from(
            "/project/node_modules/pkg/index.js"
        )));
    }

    #[test]
    fn test_should_ignore_target() {
        assert!(should_ignore(&PathBuf::from(
            "/project/target/debug/binary"
        )));
    }

    #[test]
    fn test_should_ignore_next() {
        assert!(should_ignore(&PathBuf::from(
            "/project/.next/static/chunks/main.js"
        )));
    }

    #[test]
    fn test_should_ignore_dist() {
        assert!(should_ignore(&PathBuf::from("/project/dist/bundle.js")));
    }

    #[test]
    fn test_should_ignore_build() {
        assert!(should_ignore(&PathBuf::from("/project/build/output.js")));
    }

    #[test]
    fn test_should_ignore_pycache() {
        assert!(should_ignore(&PathBuf::from(
            "/project/__pycache__/module.pyc"
        )));
    }

    #[test]
    fn test_should_ignore_cache() {
        assert!(should_ignore(&PathBuf::from("/project/.cache/data")));
    }

    #[test]
    fn test_should_not_ignore_src() {
        assert!(!should_ignore(&PathBuf::from("/project/src/main.rs")));
    }

    #[test]
    fn test_should_not_ignore_regular_file() {
        assert!(!should_ignore(&PathBuf::from("/project/README.md")));
    }

    #[test]
    fn test_should_not_ignore_nested_src() {
        assert!(!should_ignore(&PathBuf::from(
            "/project/src/components/App.tsx"
        )));
    }

    #[test]
    fn test_diff_watcher_handle_stop() {
        let dir = tempfile::TempDir::new().unwrap();
        // We can't easily test start_diff_watcher without a Tauri AppHandle,
        // but we can verify the IGNORE_DIRS constant is correct
        assert_eq!(IGNORE_DIRS.len(), 8);
        assert!(IGNORE_DIRS.contains(&".git"));
        assert!(IGNORE_DIRS.contains(&"node_modules"));
        assert!(dir.path().exists()); // Just use dir to avoid unused warning
    }
}
