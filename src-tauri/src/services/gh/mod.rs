mod checks;
mod git;
mod issues;
mod pulls;
mod reviews;
mod workflows;

pub use checks::*;
pub use git::*;
pub use issues::*;
pub use pulls::*;
pub use reviews::*;
pub use workflows::*;

use crate::error::AppError;

pub fn find_gh_binary() -> Result<std::path::PathBuf, AppError> {
    which::which("gh").map_err(|_| {
        AppError::PrError(
            "GitHub CLI (gh) not found in PATH. Install it from https://cli.github.com/"
                .to_string(),
        )
    })
}

pub fn check_gh_auth() -> Result<(), AppError> {
    let gh = find_gh_binary()?;
    let output = crate::platform::command(&gh)
        .args(["auth", "status"])
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh auth status: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::PrError(
            "Not authenticated with GitHub CLI. Run `gh auth login` first.".to_string(),
        ));
    }
    Ok(())
}
