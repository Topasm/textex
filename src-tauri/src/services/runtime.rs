use std::{
    collections::HashSet,
    ffi::OsString,
    path::Path,
    process::Command as ProcessCommand,
    process::Stdio,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
use tokio::{process::Command, time::timeout};

use crate::{
    error::{AppError, AppResult},
    models::{PerformanceMemorySample, ProcessMemoryMetric, SuccessResult},
};

#[derive(Clone)]
pub struct PerformanceState {
    system: Arc<Mutex<System>>,
}

impl Default for PerformanceState {
    fn default() -> Self {
        Self {
            system: Arc::new(Mutex::new(System::new())),
        }
    }
}

const OPEN_TIMEOUT: Duration = Duration::from_secs(15);

struct TerminalCommandSpec {
    program: &'static str,
    args: Vec<OsString>,
    env: Vec<(&'static str, OsString)>,
}

pub async fn open_external(url: &str) -> AppResult<SuccessResult> {
    let parsed = validate_external_url(url)?;
    launch_uri(parsed.as_str()).await
}

/// Hands an already-validated URI to the platform opener. Callers own the
/// scheme decision: the renderer may never pass a raw URI here, so every entry
/// point either validates against the external allowlist or builds the URI
/// itself from validated parts.
pub(crate) async fn launch_uri(uri: &str) -> AppResult<SuccessResult> {
    let mut command = external_open_command(uri);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    let status = timeout(OPEN_TIMEOUT, command.status())
        .await
        .map_err(|_| AppError::ExternalUrl("URL opener timed out after 15 seconds".to_owned()))?
        .map_err(|error| {
            AppError::ExternalUrl(format!("could not start the platform URL opener: {error}"))
        })?;
    if !status.success() {
        return Err(AppError::ExternalUrl(format!(
            "platform URL opener exited unsuccessfully ({status})"
        )));
    }
    Ok(SuccessResult::ok())
}

pub fn open_project_terminal(project_root: &Path) -> AppResult<SuccessResult> {
    if !project_root.is_dir() {
        return Err(AppError::NotADirectory(
            project_root.to_string_lossy().into_owned(),
        ));
    }

    let mut missing = Vec::new();
    for spec in platform_terminal_commands(project_root) {
        let mut command = ProcessCommand::new(spec.program);
        command
            .args(spec.args)
            .envs(spec.env)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        match command.spawn() {
            Ok(mut child) => {
                let _reaper = std::thread::spawn(move || {
                    let _ = child.wait();
                });
                return Ok(SuccessResult::ok());
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                missing.push(spec.program);
            }
            Err(error) => {
                return Err(AppError::SystemTerminal(format!(
                    "could not start {} for {}: {error}",
                    spec.program,
                    project_root.to_string_lossy()
                )));
            }
        }
    }

    Err(AppError::SystemTerminal(format!(
        "no supported terminal application was found (checked: {})",
        missing.join(", ")
    )))
}

#[cfg(target_os = "macos")]
fn platform_terminal_commands(project_root: &Path) -> Vec<TerminalCommandSpec> {
    vec![TerminalCommandSpec {
        program: "open",
        args: vec![
            OsString::from("-a"),
            OsString::from("Terminal"),
            project_root.as_os_str().to_owned(),
        ],
        env: Vec::new(),
    }]
}

#[cfg(target_os = "windows")]
fn platform_terminal_commands(project_root: &Path) -> Vec<TerminalCommandSpec> {
    vec![
        TerminalCommandSpec {
            program: "wt.exe",
            args: vec![OsString::from("-d"), project_root.as_os_str().to_owned()],
            env: Vec::new(),
        },
        TerminalCommandSpec {
            program: "powershell.exe",
            args: vec![
                OsString::from("-NoExit"),
                OsString::from("-NoProfile"),
                OsString::from("-Command"),
                OsString::from("Set-Location -LiteralPath $env:TEXTEX_PROJECT_ROOT"),
            ],
            env: vec![("TEXTEX_PROJECT_ROOT", project_root.as_os_str().to_owned())],
        },
    ]
}

#[cfg(all(unix, not(target_os = "macos")))]
fn platform_terminal_commands(project_root: &Path) -> Vec<TerminalCommandSpec> {
    let root = || project_root.as_os_str().to_owned();
    vec![
        TerminalCommandSpec {
            program: "x-terminal-emulator",
            args: vec![OsString::from("--working-directory"), root()],
            env: Vec::new(),
        },
        TerminalCommandSpec {
            program: "gnome-terminal",
            args: vec![OsString::from("--working-directory"), root()],
            env: Vec::new(),
        },
        TerminalCommandSpec {
            program: "konsole",
            args: vec![OsString::from("--workdir"), root()],
            env: Vec::new(),
        },
        TerminalCommandSpec {
            program: "xfce4-terminal",
            args: vec![OsString::from("--working-directory"), root()],
            env: Vec::new(),
        },
        TerminalCommandSpec {
            program: "kitty",
            args: vec![OsString::from("--directory"), root()],
            env: Vec::new(),
        },
        TerminalCommandSpec {
            program: "alacritty",
            args: vec![OsString::from("--working-directory"), root()],
            env: Vec::new(),
        },
    ]
}

fn external_open_command(url: &str) -> Command {
    #[cfg(target_os = "macos")]
    {
        let mut command = Command::new("open");
        command.arg(url);
        command
    }
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("rundll32.exe");
        command.arg("url.dll,FileProtocolHandler").arg(url);
        command
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let mut command = Command::new("xdg-open");
        command.arg(url);
        command
    }
}

fn validate_external_url(url: &str) -> AppResult<reqwest::Url> {
    let parsed = reqwest::Url::parse(url)
        .map_err(|error| AppError::ExternalUrl(format!("invalid URL: {error}")))?;
    if matches!(parsed.scheme(), "https" | "http" | "mailto") {
        Ok(parsed)
    } else {
        Err(AppError::ExternalUrl(
            "only https, http, and mailto URLs may be opened".to_owned(),
        ))
    }
}

pub async fn performance_memory(state: &PerformanceState) -> AppResult<PerformanceMemorySample> {
    let system = Arc::clone(&state.system);
    tauri::async_runtime::spawn_blocking(move || {
        let mut system = system
            .lock()
            .map_err(|_| AppError::Performance("process sampler lock was poisoned".to_owned()))?;
        sample_process_tree(&mut system)
    })
    .await
    .map_err(|error| AppError::Worker(error.to_string()))?
}

fn sample_process_tree(system: &mut System) -> AppResult<PerformanceMemorySample> {
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing()
            .with_memory()
            .with_cpu()
            .without_tasks(),
    );
    let root = sysinfo::get_current_pid()
        .map_err(|error| AppError::Performance(format!("could not resolve process ID: {error}")))?;
    if system.process(root).is_none() {
        return Err(AppError::Performance(
            "application process was not found by the sampler".to_owned(),
        ));
    }

    let mut included = HashSet::from([root]);
    loop {
        let previous_len = included.len();
        for (pid, process) in system.processes() {
            if process
                .parent()
                .is_some_and(|parent| included.contains(&parent))
            {
                included.insert(*pid);
            }
        }
        if included.len() == previous_len {
            break;
        }
    }

    let mut processes = included
        .into_iter()
        .filter_map(|pid| {
            system
                .process(pid)
                .map(|process| metric(pid, root, process))
        })
        .collect::<Vec<_>>();
    processes.sort_unstable_by_key(|process| process.pid);
    let total_working_set_ki_b = processes
        .iter()
        .map(|process| process.working_set_ki_b)
        .sum();
    let total_private_ki_b = processes.iter().map(|process| process.private_ki_b).sum();

    Ok(PerformanceMemorySample {
        sampled_at_epoch_ms: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| AppError::Performance(error.to_string()))?
            .as_millis()
            .try_into()
            .unwrap_or(u64::MAX),
        total_working_set_ki_b,
        total_private_ki_b,
        processes,
    })
}

fn metric(pid: Pid, root: Pid, process: &sysinfo::Process) -> ProcessMemoryMetric {
    let working_set_ki_b = process.memory() / 1024;
    ProcessMemoryMetric {
        pid: pid.as_u32(),
        process_type: if pid == root {
            "Tauri".to_owned()
        } else {
            process.name().to_string_lossy().into_owned()
        },
        cpu_percent: process.cpu_usage(),
        working_set_ki_b,
        // sysinfo exposes current RSS portably but not a cross-platform peak
        // or private/shared split. Keep the report contract useful and honest
        // by treating current RSS as both the peak floor and private estimate.
        peak_working_set_ki_b: working_set_ki_b,
        private_ki_b: working_set_ki_b,
        shared_ki_b: 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_web_external_schemes() {
        assert!(validate_external_url("https://textex.app/docs").is_ok());
        assert!(validate_external_url("mailto:hello@example.com").is_ok());
        assert!(validate_external_url("file:///tmp/secret").is_err());
        assert!(validate_external_url("javascript:alert(1)").is_err());
    }

    #[test]
    fn terminal_candidates_preserve_the_project_path_as_an_os_argument() {
        let root = Path::new("/tmp/paper project_2027@lab");
        let commands = platform_terminal_commands(root);
        assert!(!commands.is_empty());
        assert!(commands.iter().all(|command| {
            command
                .args
                .iter()
                .any(|argument| argument == root.as_os_str())
                || command
                    .env
                    .iter()
                    .any(|(_, value)| value == root.as_os_str())
        }));
    }

    #[test]
    fn samples_the_current_process() {
        let mut system = System::new();
        let sample = sample_process_tree(&mut system).unwrap();
        assert!(sample.total_working_set_ki_b > 0);
        assert!(sample.processes.iter().any(|process| {
            process.pid == std::process::id() && process.process_type == "Tauri"
        }));
        let serialized = serde_json::to_value(sample).unwrap();
        assert!(serialized.get("sampledAtEpochMs").is_some());
        assert!(serialized["processes"][0].get("workingSetKiB").is_some());
    }
}
