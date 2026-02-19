use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, DebouncedEvent, Debouncer, RecommendedCache};

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

pub struct SpotlightHandle {
    _debouncer: Debouncer<notify::RecommendedWatcher, RecommendedCache>,
    stop_tx: mpsc::Sender<()>,
}

impl SpotlightHandle {
    pub fn stop(self) {
        let _ = self.stop_tx.send(());
    }
}

/// Start watching a worktree and syncing changes to the repo root.
pub fn start_spotlight(
    worktree_path: PathBuf,
    repo_root: PathBuf,
) -> Result<SpotlightHandle, AppError> {
    let (stop_tx, stop_rx) = mpsc::channel();
    let wt = worktree_path.clone();
    let root = repo_root.clone();

    let mut debouncer = new_debouncer(
        Duration::from_millis(500),
        None,
        move |events: Result<Vec<DebouncedEvent>, Vec<notify::Error>>| {
            if let Ok(events) = events {
                for event in events {
                    for path in &event.paths {
                        if should_ignore(path) {
                            continue;
                        }
                        if let Ok(relative) = path.strip_prefix(&wt) {
                            let dest = root.join(relative);
                            if path.is_file() {
                                if let Some(parent) = dest.parent() {
                                    let _ = std::fs::create_dir_all(parent);
                                }
                                let _ = std::fs::copy(path, &dest);
                            } else if !path.exists() {
                                // File was deleted
                                let _ = std::fs::remove_file(&dest);
                            }
                        }
                    }
                }
            }
        },
    )
    .map_err(|e| {
        AppError::IoError(std::io::Error::new(
            std::io::ErrorKind::Other,
            e.to_string(),
        ))
    })?;

    debouncer
        .watch(&worktree_path, RecursiveMode::Recursive)
        .map_err(|e| {
            AppError::IoError(std::io::Error::new(
                std::io::ErrorKind::Other,
                e.to_string(),
            ))
        })?;

    // Spawn a thread to wait for stop signal and drop debouncer
    let handle = SpotlightHandle {
        _debouncer: debouncer,
        stop_tx: stop_tx.clone(),
    };

    std::thread::spawn(move || {
        let _ = stop_rx.recv();
    });

    Ok(handle)
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
