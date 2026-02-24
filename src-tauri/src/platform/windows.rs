pub const DEFAULT_SHELL: &str = "powershell.exe";
pub const SHELL_EXEC_FLAG: &str = "-Command";

pub fn kill_process_group(pid: u32) -> Result<(), std::io::Error> {
    use std::os::windows::process::CommandExt;
    std::process::Command::new("taskkill")
        .args(["/T", "/F", "/PID", &pid.to_string()])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output()?;
    Ok(())
}
