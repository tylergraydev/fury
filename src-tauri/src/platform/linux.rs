pub const DEFAULT_SHELL: &str = "/bin/bash";
pub const SHELL_EXEC_FLAG: &str = "-c";

pub fn kill_process_group(pid: u32) -> Result<(), std::io::Error> {
    unsafe {
        libc::killpg(pid as i32, libc::SIGTERM);
    }
    Ok(())
}
