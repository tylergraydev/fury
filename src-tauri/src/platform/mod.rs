use std::ffi::OsStr;
use std::path::PathBuf;
use std::process::Command;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

pub fn default_shell() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        macos::DEFAULT_SHELL
    }
    #[cfg(target_os = "linux")]
    {
        linux::DEFAULT_SHELL
    }
    #[cfg(target_os = "windows")]
    {
        windows::DEFAULT_SHELL
    }
}

pub fn shell_exec_flag() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        macos::SHELL_EXEC_FLAG
    }
    #[cfg(target_os = "linux")]
    {
        linux::SHELL_EXEC_FLAG
    }
    #[cfg(target_os = "windows")]
    {
        windows::SHELL_EXEC_FLAG
    }
}

pub fn kill_process_group(pid: u32) -> Result<(), std::io::Error> {
    #[cfg(target_os = "macos")]
    {
        macos::kill_process_group(pid)
    }
    #[cfg(target_os = "linux")]
    {
        linux::kill_process_group(pid)
    }
    #[cfg(target_os = "windows")]
    {
        windows::kill_process_group(pid)
    }
}

/// Check if a process with the given PID is still alive.
pub fn is_process_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        // kill(pid, 0) checks existence without sending a signal
        unsafe { libc::kill(pid as i32, 0) == 0 }
    }
    #[cfg(windows)]
    {
        extern "system" {
            fn OpenProcess(dwDesiredAccess: u32, bInheritHandle: i32, dwProcessId: u32) -> isize;
            fn CloseHandle(hObject: isize) -> i32;
        }
        const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if handle != 0 {
                CloseHandle(handle);
                true
            } else {
                false
            }
        }
    }
}

#[allow(dead_code)]
pub fn configure_process_group(cmd: &mut Command) -> &mut Command {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        unsafe {
            cmd.pre_exec(|| {
                libc::setpgid(0, 0);
                Ok(())
            })
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000200) // CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
    }
}

/// Create a `Command` that hides the console window on Windows.
/// Use this for all short-lived process spawns (git, formatters, etc.)
/// to prevent terminal windows from flashing on screen.
pub fn command(program: impl AsRef<OsStr>) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

pub fn app_data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.fury.app")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_shell_returns_non_empty() {
        let shell = default_shell();
        assert!(!shell.is_empty());
        #[cfg(target_os = "macos")]
        assert_eq!(shell, "/bin/zsh");
        #[cfg(target_os = "linux")]
        assert_eq!(shell, "/bin/bash");
    }

    #[test]
    fn test_shell_exec_flag() {
        let flag = shell_exec_flag();
        #[cfg(unix)]
        assert_eq!(flag, "-c");
        #[cfg(windows)]
        assert_eq!(flag, "-Command");
    }

    #[test]
    fn test_command_creates_valid_command() {
        let mut cmd = command("echo");
        // Command was created successfully — verify it can produce output
        let output = cmd.output();
        assert!(output.is_ok());
    }

    #[test]
    fn test_command_with_args() {
        let mut cmd = command("echo");
        cmd.arg("hello");
        let output = cmd.output().unwrap();
        assert!(output.status.success());
        let stdout = String::from_utf8_lossy(&output.stdout);
        assert!(stdout.contains("hello"));
    }

    #[test]
    fn test_app_data_dir_ends_with_fury() {
        let dir = app_data_dir();
        assert!(dir.ends_with("com.fury.app"));
    }

    #[test]
    fn test_configure_process_group() {
        let mut cmd = Command::new("echo");
        let result = configure_process_group(&mut cmd);
        // Just verify it returns a mutable reference without panicking
        result.arg("test");
    }

    #[test]
    fn test_kill_process_group_nonexistent_pid() {
        // Killing a non-existent process group should not panic
        // (on Unix, killpg with invalid PID returns error but we ignore it)
        let _ = kill_process_group(999999);
    }
}
