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
        cmd.creation_flags(0x00000200) // CREATE_NEW_PROCESS_GROUP
    }
}

pub fn app_data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.missoula.app")
}
