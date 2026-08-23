use std::{
    collections::HashMap,
    ffi::OsString,
    path::{Path, PathBuf},
    process::Stdio,
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};

use futures_util::StreamExt;
use reqwest::{Client, Response};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use tokio::{
    fs,
    io::{AsyncReadExt, AsyncWriteExt},
    process::Command,
    sync::Mutex,
    time::timeout,
};

use crate::{
    error::{AppError, AppResult},
    models::{
        AiAction, AiContextEntry, AiCustomProcessRequest, AiLightContext, AiProcessRequest,
        AiProvider, AiTerminalResult, UserSettings,
    },
};

const CREDENTIAL_FILE: &str = "ai-credentials.json";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(180);
const CLI_TIMEOUT: Duration = Duration::from_secs(120);
const CLI_CHECK_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_INPUT_BYTES: usize = 2 * 1024 * 1024;
const MAX_RESPONSE_BYTES: usize = 8 * 1024 * 1024;
const MAX_CLI_ERROR_BYTES: usize = 16 * 1024;
static CREDENTIAL_SEQUENCE: AtomicU64 = AtomicU64::new(0);

const DEFAULT_GENERATE_PROMPT: &str = "You are a LaTeX document generator. Given markdown, plain text notes, or an outline, produce a complete, compilable LaTeX document. Output ONLY the LaTeX source code — no explanations, no commentary. The document must include \\documentclass, \\begin{document}, and \\end{document}. Use appropriate packages for the content. Structure the document with proper sections, subsections, and formatting.";
const DEFAULT_ACTION_SYSTEM: &str = "You are a helpful academic assistant expert in LaTeX.";
const DEFAULT_CUSTOM_SYSTEM: &str = "Apply the user instruction to the provided LaTeX text. Preserve LaTeX commands and structure unless the instruction explicitly asks to change them. Return ONLY the transformed text with no explanation.";
const DEFAULT_CONTEXT_SYSTEM: &str = "You create concise working summaries for LaTeX documents. Focus on purpose, structure, terminology, and writing style. Return ONLY the summary text.";

pub struct AiState {
    pub(crate) client: Client,
    credentials_lock: Mutex<()>,
}

impl Default for AiState {
    fn default() -> Self {
        Self {
            client: Client::builder()
                .connect_timeout(Duration::from_secs(15))
                .timeout(REQUEST_TIMEOUT)
                .build()
                .expect("static AI HTTP client configuration must be valid"),
            credentials_lock: Mutex::new(()),
        }
    }
}

#[derive(Default, Deserialize, Serialize)]
struct Credentials {
    #[serde(default)]
    providers: HashMap<String, String>,
}

#[derive(Clone, Copy)]
struct ThinkingConfig {
    enabled: bool,
    budget: u32,
}

pub fn parse_provider(provider: &str) -> AppResult<AiProvider> {
    match provider.trim() {
        "openai" => Ok(AiProvider::OpenAi),
        "anthropic" => Ok(AiProvider::Anthropic),
        "gemini" => Ok(AiProvider::Gemini),
        "claude-cli" => Ok(AiProvider::ClaudeCli),
        "codex-cli" => Ok(AiProvider::CodexCli),
        _ => Err(AppError::Ai("unsupported AI provider".to_owned())),
    }
}

pub fn credential_path(app: &AppHandle) -> AppResult<PathBuf> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join(CREDENTIAL_FILE))
        .map_err(|error| AppError::RuntimePath(error.to_string()))
}

pub fn cli_work_dir(app: &AppHandle) -> AppResult<PathBuf> {
    app.path()
        .app_cache_dir()
        .map(|directory| directory.join("ai-cli"))
        .map_err(|error| AppError::RuntimePath(error.to_string()))
}

pub async fn save_api_key(
    state: &AiState,
    path: &Path,
    provider: AiProvider,
    api_key: &str,
) -> AppResult<()> {
    if !provider.uses_api_key() {
        return Err(AppError::Ai(
            "CLI providers do not accept an API key".to_owned(),
        ));
    }
    let key = api_key.trim();
    if key.is_empty() || key.len() > 16 * 1024 || key.contains('\0') {
        return Err(AppError::Ai("invalid API key".to_owned()));
    }

    let _guard = state.credentials_lock.lock().await;
    let mut credentials = load_credentials(path).await?;
    credentials
        .providers
        .insert(provider.as_str().to_owned(), key.to_owned());
    write_credentials(path, &credentials).await
}

pub async fn migrate_legacy_api_key(
    state: &AiState,
    path: &Path,
    settings: &mut UserSettings,
) -> AppResult<bool> {
    let legacy_key = std::mem::take(&mut settings.ai_api_key);
    if legacy_key.trim().is_empty() {
        return Ok(false);
    }
    if settings.ai_provider.uses_api_key() {
        save_api_key(state, path, settings.ai_provider, &legacy_key).await?;
    }
    Ok(true)
}

pub async fn has_api_key(state: &AiState, path: &Path, provider: AiProvider) -> AppResult<bool> {
    if !provider.uses_api_key() {
        return Ok(false);
    }
    let _guard = state.credentials_lock.lock().await;
    let credentials = load_credentials(path).await?;
    Ok(credentials
        .providers
        .get(provider.as_str())
        .is_some_and(|key| !key.trim().is_empty()))
}

pub async fn generate(
    state: &AiState,
    credential_path: &Path,
    cli_work_dir: &Path,
    settings: &UserSettings,
    input: &str,
    provider: AiProvider,
    model: &str,
) -> AppResult<String> {
    validate_input(input, "input text")?;
    let system = non_empty_or(&settings.ai_prompt_generate, DEFAULT_GENERATE_PROMPT);
    call_provider(
        state,
        credential_path,
        cli_work_dir,
        settings,
        provider,
        input,
        model,
        system,
    )
    .await
}

pub async fn process(
    state: &AiState,
    credential_path: &Path,
    cli_work_dir: &Path,
    settings: &UserSettings,
    request: &AiProcessRequest,
) -> AppResult<String> {
    validate_input(&request.selected_text, "selected text")?;
    validate_context(&request.light_context)?;
    let instruction = action_prompt(request.action, settings);
    let prompt = build_selection_prompt(
        instruction,
        &request.selected_text,
        &request.light_context,
        request.summary_context.as_ref(),
    );
    call_configured_provider(
        state,
        credential_path,
        cli_work_dir,
        settings,
        &prompt,
        DEFAULT_ACTION_SYSTEM,
    )
    .await
}

pub async fn process_custom(
    state: &AiState,
    credential_path: &Path,
    cli_work_dir: &Path,
    settings: &UserSettings,
    request: &AiCustomProcessRequest,
) -> AppResult<String> {
    validate_input(&request.selected_text, "selected text")?;
    validate_input(&request.command, "AI command")?;
    validate_context(&request.light_context)?;
    let instruction = format!("Instruction: {}", request.command.trim());
    let prompt = build_selection_prompt(
        &instruction,
        &request.selected_text,
        &request.light_context,
        request.summary_context.as_ref(),
    );
    call_configured_provider(
        state,
        credential_path,
        cli_work_dir,
        settings,
        &prompt,
        DEFAULT_CUSTOM_SYSTEM,
    )
    .await
}

pub async fn update_context(
    state: &AiState,
    credential_path: &Path,
    cli_work_dir: &Path,
    settings: &UserSettings,
    file_path: String,
    content: &str,
) -> AppResult<AiContextEntry> {
    validate_input(content, "document content")?;
    let prompt = [
        "Create a compact working summary for future selection-level editing.",
        "Capture the document purpose, major sections, terminology, notation, tone, and any important local conventions.",
        "Do not quote long passages. Keep it concise and practical.",
        &format!("File: {file_path}"),
        "Document content:",
        content,
    ]
    .join("\n\n");
    let summary = call_configured_provider(
        state,
        credential_path,
        cli_work_dir,
        settings,
        &prompt,
        DEFAULT_CONTEXT_SYSTEM,
    )
    .await?;
    Ok(AiContextEntry {
        file_path,
        content_hash: hash_text_content(content),
        generated_at: OffsetDateTime::now_utc()
            .format(&Rfc3339)
            .map_err(|error| AppError::Ai(error.to_string()))?,
        summary,
    })
}

async fn call_configured_provider(
    state: &AiState,
    credential_path: &Path,
    cli_work_dir: &Path,
    settings: &UserSettings,
    input: &str,
    system_prompt: &str,
) -> AppResult<String> {
    if settings.ai_provider == AiProvider::None {
        return Err(AppError::Ai("no AI provider configured".to_owned()));
    }
    call_provider(
        state,
        credential_path,
        cli_work_dir,
        settings,
        settings.ai_provider,
        input,
        &settings.ai_model,
        system_prompt,
    )
    .await
}

async fn call_provider(
    state: &AiState,
    credential_path: &Path,
    cli_work_dir: &Path,
    settings: &UserSettings,
    provider: AiProvider,
    input: &str,
    model: &str,
    system_prompt: &str,
) -> AppResult<String> {
    validate_input(input, "AI request")?;
    validate_input(system_prompt, "system prompt")?;
    if !valid_model_identifier(model) {
        return Err(AppError::Ai("invalid AI model identifier".to_owned()));
    }
    let thinking = ThinkingConfig {
        enabled: settings.ai_thinking_enabled,
        budget: settings.ai_thinking_budget,
    };
    match provider {
        AiProvider::OpenAi => {
            let key = api_key(state, credential_path, provider).await?;
            call_openai(&state.client, input, model, &key, system_prompt, thinking).await
        }
        AiProvider::Anthropic => {
            let key = api_key(state, credential_path, provider).await?;
            call_anthropic(&state.client, input, model, &key, system_prompt, thinking).await
        }
        AiProvider::Gemini => {
            let key = api_key(state, credential_path, provider).await?;
            call_gemini(&state.client, input, model, &key, system_prompt, thinking).await
        }
        AiProvider::ClaudeCli => {
            call_cli(
                "claude",
                claude_args(model),
                input,
                system_prompt,
                cli_work_dir,
            )
            .await
        }
        AiProvider::CodexCli => call_codex_cli(model, input, system_prompt, cli_work_dir).await,
        AiProvider::None => Err(AppError::Ai("no AI provider configured".to_owned())),
    }
}

async fn api_key(state: &AiState, path: &Path, provider: AiProvider) -> AppResult<String> {
    let _guard = state.credentials_lock.lock().await;
    let credentials = load_credentials(path).await?;
    if let Some(key) = credentials.providers.get(provider.as_str()) {
        if !key.trim().is_empty() {
            return Ok(key.clone());
        }
    }
    Err(AppError::Ai(format!(
        "no API key configured for {}",
        provider.as_str()
    )))
}

async fn call_openai(
    client: &Client,
    input: &str,
    model: &str,
    key: &str,
    system: &str,
    thinking: ThinkingConfig,
) -> AppResult<String> {
    let model = non_empty_or(model, "gpt-5.4");
    let mut body = json!({
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": input}
        ]
    });
    if thinking.enabled && is_openai_reasoning_model(model) {
        body["reasoning_effort"] = json!("high");
    } else {
        body["temperature"] = json!(0.3);
    }
    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(key)
        .json(&body)
        .send()
        .await
        .map_err(|_| AppError::Ai("OpenAI request failed".to_owned()))?;
    let data = read_json(response, "OpenAI").await?;
    extract_text(
        data.pointer("/choices/0/message/content")
            .and_then(Value::as_str),
        "OpenAI",
    )
}

async fn call_anthropic(
    client: &Client,
    input: &str,
    model: &str,
    key: &str,
    system: &str,
    thinking: ThinkingConfig,
) -> AppResult<String> {
    let mut body = json!({
        "model": non_empty_or(model, "claude-sonnet-4-6"),
        "system": system,
        "messages": [{"role": "user", "content": input}]
    });
    if thinking.enabled {
        let budget = if thinking.budget == 0 {
            10_240
        } else {
            thinking.budget
        };
        body["thinking"] = json!({"type": "enabled", "budget_tokens": budget});
        body["max_tokens"] = json!(u64::from(budget) + 8_192);
    } else {
        body["max_tokens"] = json!(4_096);
        body["temperature"] = json!(0.3);
    }
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", key)
        .header("anthropic-version", "2025-04-15")
        .json(&body)
        .send()
        .await
        .map_err(|_| AppError::Ai("Anthropic request failed".to_owned()))?;
    let data = read_json(response, "Anthropic").await?;
    let text = data
        .get("content")
        .and_then(Value::as_array)
        .and_then(|items| {
            items.iter().find_map(|item| {
                (item.get("type").and_then(Value::as_str) == Some("text"))
                    .then(|| item.get("text").and_then(Value::as_str))
                    .flatten()
            })
        });
    extract_text(text, "Anthropic")
}

async fn call_gemini(
    client: &Client,
    input: &str,
    model: &str,
    key: &str,
    system: &str,
    thinking: ThinkingConfig,
) -> AppResult<String> {
    let model = non_empty_or(model, "gemini-3.1-pro-preview");
    if !model
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
    {
        return Err(AppError::Ai("invalid Gemini model identifier".to_owned()));
    }
    let mut generation = json!({"temperature": 0.3});
    if thinking.enabled {
        generation["thinkingConfig"] = json!({
            "thinkingBudget": if thinking.budget == 0 { 8_192 } else { thinking.budget }
        });
    }
    let response = client
        .post(format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        ))
        .query(&[("key", key)])
        .json(&json!({
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": input}]}],
            "generationConfig": generation
        }))
        .send()
        .await
        .map_err(|_| AppError::Ai("Gemini request failed".to_owned()))?;
    let data = read_json(response, "Gemini").await?;
    extract_text(
        data.pointer("/candidates/0/content/parts/0/text")
            .and_then(Value::as_str),
        "Gemini",
    )
}

async fn read_json(response: Response, provider: &str) -> AppResult<Value> {
    let status = response.status();
    if !status.is_success() {
        return Err(AppError::Ai(format!(
            "{provider} API returned status {}",
            status.as_u16()
        )));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err(AppError::Ai(format!(
            "{provider} response exceeded the size limit"
        )));
    }
    let mut stream = response.bytes_stream();
    let mut bytes = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| AppError::Ai(format!("{provider} response failed")))?;
        if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
            return Err(AppError::Ai(format!(
                "{provider} response exceeded the size limit"
            )));
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes)
        .map_err(|_| AppError::Ai(format!("{provider} returned an invalid response")))
}

fn extract_text(text: Option<&str>, provider: &str) -> AppResult<String> {
    let text = text.ok_or_else(|| AppError::Ai(format!("no text in {provider} response")))?;
    let stripped = strip_code_fences(text);
    if stripped.is_empty() {
        return Err(AppError::Ai(format!("no text in {provider} response")));
    }
    Ok(stripped)
}

fn claude_args(model: &str) -> Vec<String> {
    vec![
        "-p".to_owned(),
        "--model".to_owned(),
        non_empty_or(model, "sonnet").to_owned(),
        "--tools".to_owned(),
        String::new(),
    ]
}

async fn call_codex_cli(
    model: &str,
    input: &str,
    system: &str,
    cli_work_dir: &Path,
) -> AppResult<String> {
    let args = codex_args(model);
    call_cli("codex", args, input, system, cli_work_dir).await
}

fn codex_args(model: &str) -> Vec<String> {
    let mut args = vec![
        "--ask-for-approval".to_owned(),
        "never".to_owned(),
        "--sandbox".to_owned(),
        "read-only".to_owned(),
        "exec".to_owned(),
    ];
    if !model.trim().is_empty() {
        args.extend(["--model".to_owned(), model.trim().to_owned()]);
    }
    args.extend([
        "--skip-git-repo-check".to_owned(),
        "--ephemeral".to_owned(),
        "--ignore-rules".to_owned(),
        "--ignore-user-config".to_owned(),
        "--color".to_owned(),
        "never".to_owned(),
        "-".to_owned(),
    ]);
    args
}

async fn call_cli(
    executable: &str,
    args: Vec<String>,
    input: &str,
    system: &str,
    cli_work_dir: &Path,
) -> AppResult<String> {
    fs::create_dir_all(cli_work_dir)
        .await
        .map_err(|_| AppError::Ai("AI CLI workspace could not be created".to_owned()))?;
    let prompt = format!("{system}\n\n{input}");
    let output = run_bounded(
        executable,
        &args,
        Some(prompt.as_bytes()),
        Some(cli_work_dir),
        CLI_TIMEOUT,
    )
    .await?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let message = stderr.trim();
        return Err(AppError::Ai(if message.is_empty() {
            format!("{executable} CLI exited unsuccessfully")
        } else {
            format!("{executable} CLI failed: {message}")
        }));
    }
    extract_text(
        std::str::from_utf8(&output.stdout).ok(),
        &format!("{executable} CLI"),
    )
}

pub async fn check_cli(executable: &str) -> bool {
    run_bounded(
        executable,
        &["--version".to_owned()],
        None,
        None,
        CLI_CHECK_TIMEOUT,
    )
    .await
    .is_ok_and(|output| output.status.success())
}

struct BoundedOutput {
    status: std::process::ExitStatus,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

async fn run_bounded(
    executable: &str,
    args: &[String],
    stdin: Option<&[u8]>,
    cwd: Option<&Path>,
    duration: Duration,
) -> AppResult<BoundedOutput> {
    let mut command = cli_command(executable)?;
    command
        .args(args)
        .stdin(if stdin.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    apply_cli_path(&mut command);
    let mut child = command
        .spawn()
        .map_err(|_| AppError::Ai(format!("{executable} CLI could not be started")))?;
    if let (Some(data), Some(mut child_stdin)) = (stdin, child.stdin.take()) {
        child_stdin
            .write_all(data)
            .await
            .map_err(|_| AppError::Ai(format!("{executable} CLI input failed")))?;
    }
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Ai("AI CLI stdout unavailable".to_owned()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::Ai("AI CLI stderr unavailable".to_owned()))?;
    let stdout_task = tokio::spawn(read_limited(stdout, MAX_RESPONSE_BYTES));
    let stderr_task = tokio::spawn(read_limited(stderr, MAX_CLI_ERROR_BYTES));
    let status = match timeout(duration, child.wait()).await {
        Ok(result) => result.map_err(|_| AppError::Ai(format!("{executable} CLI wait failed")))?,
        Err(_) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            return Err(AppError::Ai(format!("{executable} CLI timed out")));
        }
    };
    let stdout = stdout_task
        .await
        .map_err(|_| AppError::Ai("AI CLI output worker failed".to_owned()))??;
    let stderr = stderr_task
        .await
        .map_err(|_| AppError::Ai("AI CLI error worker failed".to_owned()))??;
    Ok(BoundedOutput {
        status,
        stdout,
        stderr,
    })
}

fn cli_command(executable: &str) -> AppResult<Command> {
    if !matches!(executable, "claude" | "codex") {
        return Err(AppError::Ai("unsupported AI CLI executable".to_owned()));
    }
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("cmd.exe");
        command.args(["/D", "/S", "/C", executable]);
        Ok(command)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(Command::new(executable))
    }
}

async fn read_limited<R>(reader: R, limit: usize) -> AppResult<Vec<u8>>
where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut bytes = Vec::new();
    reader
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .await
        .map_err(|_| AppError::Ai("AI CLI output read failed".to_owned()))?;
    if bytes.len() > limit {
        return Err(AppError::Ai(
            "AI CLI output exceeded the size limit".to_owned(),
        ));
    }
    Ok(bytes)
}

pub async fn open_terminal(
    executable: &str,
    work_dir: &Path,
    resume: bool,
) -> AppResult<AiTerminalResult> {
    if !check_cli(executable).await {
        return Err(AppError::Ai(format!(
            "{executable} CLI was not found or is unavailable"
        )));
    }
    let command_label = match (executable, resume) {
        ("claude", true) => "claude --resume",
        ("codex", true) => "codex resume",
        _ => executable,
    };
    launch_terminal(executable, work_dir, resume).await?;
    Ok(AiTerminalResult {
        success: true,
        work_dir: work_dir.to_string_lossy().into_owned(),
        command: command_label.to_owned(),
    })
}

#[cfg(target_os = "linux")]
async fn launch_terminal(executable: &str, work_dir: &Path, resume: bool) -> AppResult<()> {
    let cli_args: Vec<&str> = match (executable, resume) {
        ("claude", true) => vec!["--resume"],
        ("codex", true) => vec!["resume"],
        _ => Vec::new(),
    };
    let candidates = [
        ("x-terminal-emulator", vec!["-e"]),
        ("gnome-terminal", vec!["--"]),
        ("konsole", vec!["-e"]),
        ("xfce4-terminal", vec!["-x"]),
    ];
    for (terminal, prefix) in candidates {
        let mut command = Command::new(terminal);
        command
            .args(prefix)
            .arg(executable)
            .args(&cli_args)
            .current_dir(work_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(false);
        apply_cli_path(&mut command);
        if command.spawn().is_ok() {
            return Ok(());
        }
    }
    Err(AppError::Ai("could not open a terminal".to_owned()))
}

#[cfg(target_os = "macos")]
async fn launch_terminal(executable: &str, work_dir: &Path, resume: bool) -> AppResult<()> {
    let directory = shell_quote(&work_dir.to_string_lossy());
    let suffix = match (executable, resume) {
        ("claude", true) => " --resume",
        ("codex", true) => " resume",
        _ => "",
    };
    let shell_command = format!("cd {directory} && {executable}{suffix}");
    let script = format!(
        "tell application \"Terminal\" to do script {}",
        apple_script_string(&shell_command)
    );
    spawn_detached(
        "/usr/bin/osascript",
        &[
            "-e".to_owned(),
            "tell application \"Terminal\" to activate".to_owned(),
            "-e".to_owned(),
            script,
        ],
        work_dir,
    )
    .await
}

#[cfg(target_os = "windows")]
async fn launch_terminal(executable: &str, work_dir: &Path, resume: bool) -> AppResult<()> {
    let mut args = vec![
        "new-tab".to_owned(),
        "-d".to_owned(),
        work_dir.to_string_lossy().into_owned(),
        executable.to_owned(),
    ];
    match (executable, resume) {
        ("claude", true) => args.push("--resume".to_owned()),
        ("codex", true) => args.push("resume".to_owned()),
        _ => {}
    }
    spawn_detached("wt.exe", &args, work_dir).await
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
async fn spawn_detached(executable: &str, args: &[String], cwd: &Path) -> AppResult<()> {
    let mut command = Command::new(executable);
    command
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(false);
    apply_cli_path(&mut command);
    command
        .spawn()
        .map(|_| ())
        .map_err(|_| AppError::Ai("could not open a terminal".to_owned()))
}

fn apply_cli_path(command: &mut Command) {
    if let Some(path) = expanded_cli_path() {
        command.env("PATH", path);
    }
}

fn expanded_cli_path() -> Option<OsString> {
    let mut paths = std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).collect::<Vec<_>>())
        .unwrap_or_default();
    if let Some(home) = user_home_directory() {
        for candidate in user_cli_path_candidates(&home) {
            push_unique_path(&mut paths, candidate);
        }
    }
    for candidate in [
        std::env::var_os("APPDATA").map(|path| PathBuf::from(path).join("npm")),
        std::env::var_os("LOCALAPPDATA").map(|path| PathBuf::from(path).join("pnpm")),
        std::env::var_os("NVM_HOME").map(PathBuf::from),
        std::env::var_os("PNPM_HOME").map(PathBuf::from),
    ]
    .into_iter()
    .flatten()
    {
        push_unique_path(&mut paths, candidate);
    }
    for candidate in [
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/home/linuxbrew/.linuxbrew/bin"),
        PathBuf::from("/Applications/Codex.app/Contents/Resources"),
        PathBuf::from("/Applications/ChatGPT.app/Contents/Resources"),
    ] {
        push_unique_path(&mut paths, candidate);
    }
    std::env::join_paths(paths).ok()
}

fn user_home_directory() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .filter(|path| !path.is_empty())
        .map(PathBuf::from)
}

fn user_cli_path_candidates(home: &Path) -> Vec<PathBuf> {
    let mut candidates = vec![
        home.join(".local/bin"),
        home.join(".claude/local"),
        home.join(".codex/bin"),
        home.join(".local/share/mise/shims"),
        home.join(".asdf/shims"),
        home.join(".npm-global/bin"),
        home.join(".npm/bin"),
        home.join(".bun/bin"),
        home.join(".linuxbrew/bin"),
        home.join("AppData/Roaming/npm"),
        home.join("AppData/Local/pnpm"),
        home.join("scoop/shims"),
    ];
    if let Ok(entries) = std::fs::read_dir(home.join(".nvm/versions/node")) {
        let mut nvm_bins = entries
            .filter_map(Result::ok)
            .map(|entry| entry.path().join("bin"))
            .filter(|path| path.is_dir())
            .collect::<Vec<_>>();
        nvm_bins.sort_by(|left, right| right.cmp(left));
        candidates.extend(nvm_bins);
    }
    candidates
}

fn push_unique_path(paths: &mut Vec<PathBuf>, candidate: PathBuf) {
    let already_present = paths.iter().any(|path| {
        if cfg!(windows) {
            path.to_string_lossy()
                .eq_ignore_ascii_case(&candidate.to_string_lossy())
        } else {
            path == &candidate
        }
    });
    if !already_present {
        paths.push(candidate);
    }
}

#[cfg(target_os = "macos")]
fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(target_os = "macos")]
fn apple_script_string(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('\"', "\\\""))
}

async fn load_credentials(path: &Path) -> AppResult<Credentials> {
    match fs::read(path).await {
        Ok(bytes) if bytes.len() <= 64 * 1024 => serde_json::from_slice(&bytes)
            .map_err(|_| AppError::Ai("credential store is invalid".to_owned())),
        Ok(_) => Err(AppError::Ai("credential store is too large".to_owned())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Credentials::default()),
        Err(_) => Err(AppError::Ai(
            "credential store could not be read".to_owned(),
        )),
    }
}

async fn write_credentials(path: &Path, credentials: &Credentials) -> AppResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::Ai("credential path is invalid".to_owned()))?;
    fs::create_dir_all(parent)
        .await
        .map_err(|_| AppError::Ai("credential directory could not be created".to_owned()))?;
    let sequence = CREDENTIAL_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let temp = parent.join(format!(
        ".{CREDENTIAL_FILE}.{}.{}.tmp",
        std::process::id(),
        sequence
    ));
    let bytes = serde_json::to_vec(credentials)
        .map_err(|_| AppError::Ai("credential store could not be encoded".to_owned()))?;
    let result = async {
        let mut options = fs::OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            options.mode(0o600);
        }
        let mut file = options
            .open(&temp)
            .await
            .map_err(|_| AppError::Ai("credential store could not be created".to_owned()))?;
        file.write_all(&bytes)
            .await
            .map_err(|_| AppError::Ai("credential store could not be written".to_owned()))?;
        file.sync_all()
            .await
            .map_err(|_| AppError::Ai("credential store could not be synced".to_owned()))?;
        drop(file);
        install_credential_file(&temp, path).await
    }
    .await;
    if result.is_err() {
        let _ = fs::remove_file(&temp).await;
    }
    result
}

async fn install_credential_file(temp: &Path, path: &Path) -> AppResult<()> {
    match fs::rename(temp, path).await {
        Ok(()) => Ok(()),
        #[cfg(windows)]
        Err(_) if fs::try_exists(path).await.unwrap_or(false) => {
            fs::remove_file(path)
                .await
                .map_err(|_| AppError::Ai("credential store could not be replaced".to_owned()))?;
            fs::rename(temp, path)
                .await
                .map_err(|_| AppError::Ai("credential store could not be installed".to_owned()))
        }
        Err(_) => Err(AppError::Ai(
            "credential store could not be installed".to_owned(),
        )),
    }
}

fn validate_input(value: &str, label: &str) -> AppResult<()> {
    if value.trim().is_empty() {
        return Err(AppError::Ai(format!("{label} is required")));
    }
    if value.len() > MAX_INPUT_BYTES {
        return Err(AppError::Ai(format!("{label} exceeds the size limit")));
    }
    Ok(())
}

fn valid_model_identifier(model: &str) -> bool {
    model.len() <= 256
        && model.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.' | ':' | '/')
        })
}

fn validate_context(context: &AiLightContext) -> AppResult<()> {
    if context.outline.len() > 10_000 || context.section_path.len() > 1_000 {
        return Err(AppError::Ai("document context is too large".to_owned()));
    }
    validate_input(&context.file_path, "context file path")
}

fn action_prompt(action: AiAction, settings: &UserSettings) -> &str {
    match action {
        AiAction::Fix => non_empty_or(
            &settings.ai_prompt_fix,
            "Fix grammar and spelling in the following LaTeX text. Do not remove LaTeX commands. Return ONLY the fixed text.",
        ),
        AiAction::Academic => non_empty_or(
            &settings.ai_prompt_academic,
            "Rewrite the following text to be more formal and academic suitable for a research paper. Preserve LaTeX commands. Return ONLY the rewritten text.",
        ),
        AiAction::Summarize => non_empty_or(
            &settings.ai_prompt_summarize,
            "Summarize the following text briefly. Return ONLY the summary.",
        ),
        AiAction::Longer => non_empty_or(
            &settings.ai_prompt_longer,
            "Paraphrase the following text to be longer and more detailed, expanding on the key points. Preserve all LaTeX commands. Return ONLY the paraphrased text.",
        ),
        AiAction::Shorter => non_empty_or(
            &settings.ai_prompt_shorter,
            "Paraphrase the following text to be shorter and more concise, keeping only the essential points. Preserve all LaTeX commands. Return ONLY the paraphrased text.",
        ),
    }
}

fn build_selection_prompt(
    instruction: &str,
    selected_text: &str,
    context: &AiLightContext,
    summary: Option<&AiContextEntry>,
) -> String {
    let outline = if context.outline.is_empty() {
        "- (none)".to_owned()
    } else {
        context
            .outline
            .iter()
            .map(|item| format!("- {item}"))
            .collect::<Vec<_>>()
            .join("\n")
    };
    let section_path = if context.section_path.is_empty() {
        "(unknown)".to_owned()
    } else {
        context.section_path.join(" > ")
    };
    let mut prompt = format!(
        "{instruction}\n\nReturn ONLY the output for the selected text. Use document context only as supporting information.\n\nSelected text:\n{selected_text}\n\nDocument context:\nFile: {}\nCurrent section path: {section_path}\nOutline summary:\n{outline}\nContext before selection:\n{}\nContext after selection:\n{}",
        context.file_path,
        empty_marker(&context.before_selection),
        empty_marker(&context.after_selection)
    );
    if let Some(summary) = summary.filter(|entry| !entry.summary.trim().is_empty()) {
        prompt.push_str("\n\nDocument summary cache:\n");
        prompt.push_str(summary.summary.trim());
    }
    prompt
}

fn empty_marker(value: &str) -> &str {
    if value.trim().is_empty() {
        "(none)"
    } else {
        value
    }
}

fn non_empty_or<'a>(value: &'a str, fallback: &'a str) -> &'a str {
    if value.trim().is_empty() {
        fallback
    } else {
        value.trim()
    }
}

fn is_openai_reasoning_model(model: &str) -> bool {
    ["o1", "o3", "o4", "gpt-5"]
        .iter()
        .any(|prefix| model.starts_with(prefix))
}

pub fn strip_code_fences(value: &str) -> String {
    let trimmed = value.trim();
    let without_open = if let Some(rest) = trimmed.strip_prefix("```latex") {
        rest
    } else if let Some(rest) = trimmed.strip_prefix("```tex") {
        rest
    } else if let Some(rest) = trimmed.strip_prefix("```") {
        rest
    } else {
        trimmed
    };
    without_open
        .trim_start_matches(['\r', '\n', ' ', '\t'])
        .strip_suffix("```")
        .unwrap_or(without_open.trim_start_matches(['\r', '\n', ' ', '\t']))
        .trim()
        .to_owned()
}

pub fn hash_text_content(content: &str) -> String {
    let mut hash: u32 = 2_166_136_261;
    for unit in content.encode_utf16() {
        hash ^= u32::from(unit);
        hash = hash.wrapping_mul(16_777_619);
    }
    format!("{hash:08x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_supported_code_fences() {
        assert_eq!(
            strip_code_fences("```latex\n\\section{A}\n```"),
            "\\section{A}"
        );
        assert_eq!(strip_code_fences("  plain  "), "plain");
    }

    #[test]
    fn content_hash_matches_renderer_fnv_for_utf16() {
        assert_eq!(hash_text_content("hello"), "4f9f2cab");
        assert_eq!(hash_text_content("😀"), "cb31c4b8");
    }

    #[test]
    fn provider_validation_is_closed() {
        assert_eq!(parse_provider("openai").unwrap(), AiProvider::OpenAi);
        assert!(parse_provider("file://local").is_err());
    }

    #[test]
    fn cli_arguments_disable_tools_and_ignore_mutable_codex_configuration() {
        assert_eq!(
            claude_args("sonnet"),
            ["-p", "--model", "sonnet", "--tools", ""]
        );
        assert!(valid_model_identifier("gpt-5.6-sol"));
        assert!(valid_model_identifier("vendor/model:latest"));
        assert!(!valid_model_identifier("model & whoami"));
        assert!(!valid_model_identifier("model\n--yolo"));
        let codex = codex_args("gpt-5.6-sol");
        assert_eq!(
            &codex[..5],
            [
                "--ask-for-approval",
                "never",
                "--sandbox",
                "read-only",
                "exec"
            ]
        );
        assert!(codex.iter().any(|arg| arg == "--ignore-user-config"));
        assert!(codex.iter().any(|arg| arg == "--ignore-rules"));
    }

    #[tokio::test]
    async fn credentials_are_private_and_do_not_serialize_elsewhere() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join(CREDENTIAL_FILE);
        let state = AiState::default();
        save_api_key(&state, &path, AiProvider::OpenAi, "secret-value")
            .await
            .unwrap();
        save_api_key(&state, &path, AiProvider::OpenAi, "replacement-value")
            .await
            .unwrap();
        assert!(has_api_key(&state, &path, AiProvider::OpenAi)
            .await
            .unwrap());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
    }

    #[tokio::test]
    async fn migrates_legacy_settings_key_into_private_store() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join(CREDENTIAL_FILE);
        let state = AiState::default();
        let mut settings = UserSettings {
            ai_provider: AiProvider::OpenAi,
            ai_api_key: "legacy-secret".to_owned(),
            ..UserSettings::default()
        };

        assert!(migrate_legacy_api_key(&state, &path, &mut settings)
            .await
            .unwrap());
        assert!(settings.ai_api_key.is_empty());
        assert!(has_api_key(&state, &path, AiProvider::OpenAi)
            .await
            .unwrap());
    }

    #[test]
    fn cli_path_candidates_cover_gui_and_version_manager_installs() {
        let directory = tempfile::tempdir().unwrap();
        let nvm_bin = directory.path().join(".nvm/versions/node/v22.0.0/bin");
        std::fs::create_dir_all(&nvm_bin).unwrap();

        let candidates = user_cli_path_candidates(directory.path());

        assert!(candidates.contains(&directory.path().join(".local/bin")));
        assert!(candidates.contains(&directory.path().join(".local/share/mise/shims")));
        assert!(candidates.contains(&directory.path().join("AppData/Roaming/npm")));
        assert!(candidates.contains(&nvm_bin));
    }
}
