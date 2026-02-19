pub const DEFAULT_SHELL: &str = "powershell.exe";
pub const SHELL_EXEC_FLAG: &str = "-Command";

pub fn kill_process_group(pid: u32) -> Result<(), std::io::Error> {
    std::process::Command::new("taskkill")
        .args(["/T", "/F", "/PID", &pid.to_string()])
        .output()?;
    Ok(())
}
