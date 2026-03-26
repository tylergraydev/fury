mod setup;
mod sidecar;
#[allow(dead_code)]
mod spawn;
pub mod stream;

pub use setup::{build_env_vars, build_repo_env_vars, find_claude_binary};
pub use sidecar::{send_command, start_sidecar, SidecarCommand, SidecarHandle};
pub use spawn::write_message;
#[allow(unused_imports)]
pub use stream::parse_stream_line;
