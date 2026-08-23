use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CitationGroup {
    pub id: String,
    pub name: String,
    pub citekeys: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessMemoryMetric {
    pub pid: u32,
    #[serde(rename = "type")]
    pub process_type: String,
    pub cpu_percent: f32,
    pub working_set_ki_b: u64,
    pub peak_working_set_ki_b: u64,
    pub private_ki_b: u64,
    pub shared_ki_b: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceMemorySample {
    pub sampled_at_epoch_ms: u64,
    pub total_working_set_ki_b: u64,
    pub total_private_ki_b: u64,
    pub processes: Vec<ProcessMemoryMetric>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyCreateOptions {
    pub cwd: String,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
    pub shell: Option<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct PtyCreateResult {
    pub id: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "event", rename_all = "lowercase")]
pub enum PtyEvent {
    Data {
        id: String,
        data: String,
    },
    Exit {
        id: String,
        #[serde(rename = "exitCode")]
        exit_code: u32,
        signal: Option<i32>,
    },
    Overflow {
        id: String,
        #[serde(rename = "droppedBytes")]
        dropped_bytes: u64,
    },
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LspStatus {
    #[default]
    Stopped,
    Starting,
    Running,
    Error,
}

impl LspStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Stopped => "stopped",
            Self::Starting => "starting",
            Self::Running => "running",
            Self::Error => "error",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "event", rename_all = "lowercase")]
pub enum LspEvent {
    Message {
        message: serde_json::Value,
    },
    Status {
        status: LspStatus,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct LspStatusResult {
    pub status: &'static str,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Template {
    pub id: String,
    pub name: String,
    pub description: String,
    pub content: String,
    pub built_in: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub files: Option<HashMap<String, String>>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateProjectResult {
    pub project_path: String,
    pub file_path: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct ExportFormat {
    pub name: &'static str,
    pub ext: &'static str,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub success: bool,
    pub output_path: String,
}

pub type PackageDataMap = HashMap<String, PackageData>;

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncTexForwardResult {
    pub page: u32,
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncTexInverseResult {
    pub file: String,
    pub line: u32,
    pub column: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncTexLineMapEntry {
    pub line: u32,
    pub page: u32,
    pub y: f64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BibEntry {
    pub key: String,
    #[serde(rename = "type")]
    pub entry_type: String,
    pub title: String,
    pub author: String,
    pub year: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub journal: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelInfo {
    pub label: String,
    pub file: String,
    pub line: u32,
    pub context: String,
}

#[derive(Clone, Debug, Default)]
pub struct ReferenceIndex {
    pub bib_entries: Vec<BibEntry>,
    pub labels: Vec<LabelInfo>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroSearchResult {
    pub citekey: String,
    pub title: String,
    pub author: String,
    pub year: String,
    #[serde(rename = "type")]
    pub item_type: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroSyncResult {
    pub file_path: String,
    pub bytes_written: u64,
    pub entry_count: u32,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroCollection {
    pub key: String,
    pub name: String,
    pub parent_key: Option<String>,
    pub item_count: u32,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineReference {
    pub source: String,
    pub id: String,
    pub title: String,
    pub authors: Vec<String>,
    pub year: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
    pub url: Option<String>,
    pub r#abstract: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceAddResult {
    pub file_path: String,
    pub citekey: String,
    pub inserted: bool,
    pub duplicate: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroSaveResult {
    pub item_key: String,
    pub citekey: Option<String>,
    pub duplicate: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchConfig {
    pub version: u8,
    pub references_file: String,
    pub zotero_file: String,
    pub zotero_collection: Option<String>,
    pub sync_on_open: bool,
}

impl Default for ResearchConfig {
    fn default() -> Self {
        Self {
            version: 1,
            references_file: "references.bib".to_owned(),
            zotero_file: "zotero.bib".to_owned(),
            zotero_collection: None,
            sync_on_open: false,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryItem {
    pub timestamp: u64,
    pub size: u64,
    pub path: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDatabase {
    pub version: u32,
    pub name: String,
    pub main_file: String,
    pub created: String,
    pub last_opened: String,
    pub document_class: String,
    pub description: String,
    pub tags: Vec<String>,
    pub authors: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileRecord {
    pub file_path: String,
    pub last_compiled: String,
    pub duration: f64,
    pub exit_code: i32,
    pub pdf_path: String,
    pub error_count: u32,
    pub warning_count: u32,
    pub hash: String,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileDatabase {
    pub version: u32,
    pub total_compiles: u64,
    pub last_compiled: Option<String>,
    pub records: HashMap<String, CompileRecord>,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
pub struct ProjectSnippet {
    pub id: String,
    pub prefix: String,
    pub label: String,
    pub body: String,
    pub description: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize)]
pub struct NewProjectSnippet {
    pub prefix: String,
    pub label: String,
    pub body: String,
    pub description: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
pub struct ProjectBookmark {
    pub id: String,
    pub file: String,
    pub line: u32,
    pub column: u32,
    pub label: String,
    pub created: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize)]
pub struct NewProjectBookmark {
    pub file: String,
    pub line: u32,
    pub column: u32,
    pub label: String,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageData {
    pub macros: Vec<PackageMacro>,
    pub envs: Vec<PackageEnvironment>,
    pub deps: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageMacro {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snippet: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageEnvironment {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arg_snippet: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct GitFileStatus {
    pub path: String,
    pub index: String,
    pub working_dir: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct GitStatusResult {
    pub branch: String,
    pub files: Vec<GitFileStatus>,
    pub staged: Vec<String>,
    pub modified: Vec<String>,
    pub not_added: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct GitLogEntry {
    pub hash: String,
    pub date: String,
    pub message: String,
    pub author: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct UserSettings {
    pub theme: Theme,
    pub font_size: u16,
    pub auto_compile: bool,
    pub watch_open_files: bool,
    pub spell_check_enabled: bool,
    pub spell_check_language: String,
    pub git_enabled: bool,
    pub auto_update_enabled: bool,
    pub lsp_enabled: bool,
    pub zotero_enabled: bool,
    pub zotero_port: u16,
    pub zotero_collection: String,
    pub cite_online_to_zotero: bool,
    pub ai_enabled: bool,
    pub ai_provider: AiProvider,
    pub ai_model: String,
    pub ai_api_key: String,
    pub ai_thinking_enabled: bool,
    pub ai_thinking_budget: u32,
    pub ai_prompt_generate: String,
    pub ai_prompt_fix: String,
    pub ai_prompt_academic: String,
    pub ai_prompt_summarize: String,
    pub ai_prompt_longer: String,
    pub ai_prompt_shorter: String,
    pub name: String,
    pub email: String,
    pub affiliation: String,
    pub word_wrap: bool,
    pub vim_mode: bool,
    pub format_on_save: bool,
    pub math_preview_enabled: bool,
    pub pdf_invert_mode: bool,
    pub auto_hide_sidebar: bool,
    pub sidebar_position: SidebarPosition,
    pub show_status_bar: bool,
    pub section_highlight_enabled: bool,
    pub section_highlight_colors: Vec<String>,
    pub bib_group_mode: BibGroupMode,
    pub line_numbers: bool,
    pub tab_size: u8,
    pub recent_projects: Vec<RecentProject>,
    pub language: String,
    pub pdf_view_mode: PdfViewMode,
    pub show_pdf_toolbar_controls: bool,
    pub scroll_sync_enabled: bool,
    pub bracket_pair_colorization: bool,
    pub sticky_scroll_enabled: bool,
    pub smooth_scrolling: bool,
    pub font_ligatures: bool,
    pub minimap_enabled: bool,
    pub renderer_session: Option<RendererSessionSnapshot>,
}

impl Default for UserSettings {
    fn default() -> Self {
        Self {
            theme: Theme::System,
            font_size: 14,
            auto_compile: true,
            watch_open_files: true,
            spell_check_enabled: false,
            spell_check_language: "en-US".to_owned(),
            git_enabled: true,
            auto_update_enabled: true,
            lsp_enabled: true,
            zotero_enabled: false,
            zotero_port: 23119,
            zotero_collection: String::new(),
            cite_online_to_zotero: false,
            ai_enabled: false,
            ai_provider: AiProvider::None,
            ai_model: String::new(),
            ai_api_key: String::new(),
            ai_thinking_enabled: false,
            ai_thinking_budget: 0,
            ai_prompt_generate: String::new(),
            ai_prompt_fix: String::new(),
            ai_prompt_academic: String::new(),
            ai_prompt_summarize: String::new(),
            ai_prompt_longer: String::new(),
            ai_prompt_shorter: String::new(),
            name: String::new(),
            email: String::new(),
            affiliation: String::new(),
            word_wrap: true,
            vim_mode: false,
            format_on_save: true,
            math_preview_enabled: true,
            pdf_invert_mode: false,
            auto_hide_sidebar: false,
            sidebar_position: SidebarPosition::Left,
            show_status_bar: true,
            section_highlight_enabled: false,
            section_highlight_colors: vec![
                "#e06c75".to_owned(),
                "#e5c07b".to_owned(),
                "#98c379".to_owned(),
                "#61afef".to_owned(),
                "#c678dd".to_owned(),
                "#56b6c2".to_owned(),
                "#d19a66".to_owned(),
            ],
            bib_group_mode: BibGroupMode::Flat,
            line_numbers: true,
            tab_size: 4,
            recent_projects: Vec::new(),
            language: "en".to_owned(),
            pdf_view_mode: PdfViewMode::Continuous,
            show_pdf_toolbar_controls: true,
            scroll_sync_enabled: false,
            bracket_pair_colorization: true,
            sticky_scroll_enabled: true,
            smooth_scrolling: true,
            font_ligatures: false,
            minimap_enabled: false,
            renderer_session: None,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RendererSessionSnapshot {
    pub version: u8,
    pub editor: Option<String>,
    pub project: Option<String>,
    pub pdf: Option<String>,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Theme {
    #[default]
    System,
    Dark,
    Light,
    HighContrast,
    Glass,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Deserialize, Serialize)]
pub enum AiProvider {
    #[default]
    #[serde(rename = "")]
    None,
    #[serde(rename = "openai")]
    OpenAi,
    #[serde(rename = "anthropic")]
    Anthropic,
    #[serde(rename = "gemini")]
    Gemini,
    #[serde(rename = "claude-cli")]
    ClaudeCli,
    #[serde(rename = "codex-cli")]
    CodexCli,
}

impl AiProvider {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::None => "",
            Self::OpenAi => "openai",
            Self::Anthropic => "anthropic",
            Self::Gemini => "gemini",
            Self::ClaudeCli => "claude-cli",
            Self::CodexCli => "codex-cli",
        }
    }

    pub fn uses_api_key(self) -> bool {
        matches!(self, Self::OpenAi | Self::Anthropic | Self::Gemini)
    }
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AiAction {
    Fix,
    Academic,
    Summarize,
    Longer,
    Shorter,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiLightContext {
    pub file_path: String,
    pub section_path: Vec<String>,
    pub outline: Vec<String>,
    pub before_selection: String,
    pub after_selection: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiContextEntry {
    pub file_path: String,
    pub content_hash: String,
    pub generated_at: String,
    pub summary: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProcessRequest {
    pub action: AiAction,
    pub selected_text: String,
    pub file_path: String,
    pub light_context: AiLightContext,
    pub summary_context: Option<AiContextEntry>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCustomProcessRequest {
    pub command: String,
    pub selected_text: String,
    pub file_path: String,
    pub light_context: AiLightContext,
    pub summary_context: Option<AiContextEntry>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTerminalRequest {
    pub work_dir: String,
    #[serde(default)]
    pub resume: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTerminalResult {
    pub success: bool,
    pub work_dir: String,
    pub command: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct AiGenerateResult {
    pub latex: String,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SidebarPosition {
    #[default]
    Left,
    Right,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BibGroupMode {
    #[default]
    Flat,
    Author,
    Year,
    Type,
    Custom,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PdfViewMode {
    #[default]
    Continuous,
    Single,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentProject {
    pub path: String,
    pub name: String,
    pub last_opened: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pinned: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecentProjectUpdates {
    pub path: Option<String>,
    pub tag: Option<String>,
    pub pinned: Option<bool>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileIdentity {
    pub request_id: u64,
    pub document_id: String,
    pub document_revision: u64,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CompilePriority {
    High,
    Normal,
    Background,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileRequest {
    pub request_id: u64,
    pub document_id: String,
    pub document_revision: u64,
    pub file_path: String,
    pub priority: CompilePriority,
}

impl CompileRequest {
    pub fn identity(&self) -> CompileIdentity {
        CompileIdentity {
            request_id: self.request_id,
            document_id: self.document_id.clone(),
            document_revision: self.document_revision,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "event",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum CompileEvent {
    Log {
        #[serde(flatten)]
        identity: CompileIdentity,
        text: String,
    },
    Progress {
        #[serde(flatten)]
        identity: CompileIdentity,
        stage: CompileStage,
        file_path: String,
    },
    Diagnostics {
        #[serde(flatten)]
        identity: CompileIdentity,
        diagnostics: Vec<CompileDiagnostic>,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CompileDiagnosticSeverity {
    Error,
    Warning,
    Info,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileDiagnostic {
    pub file: String,
    pub line: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub column: Option<u64>,
    pub severity: CompileDiagnosticSeverity,
    pub message: String,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CompileStage {
    Compiling,
    Done,
    Cancelled,
    TimedOut,
    Failed,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileResponse {
    #[serde(flatten)]
    pub identity: CompileIdentity,
    pub pdf_path: String,
    pub compiled_file_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenFileResult {
    pub content: String,
    pub file_path: String,
    pub warn_large_file: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFileInput {
    pub content: String,
    pub file_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFileAsResult {
    pub file_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Base64FileResult {
    pub data: String,
    pub mime_type: String,
}

#[derive(Debug, Serialize)]
pub struct SuccessResult {
    pub success: bool,
}

#[derive(Debug, Serialize)]
pub struct SpellInitResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct DirectoryChangeEvent {
    #[serde(rename = "type")]
    pub event_type: DirectoryChangeType,
    pub filename: String,
    #[serde(rename = "indexDelta", skip_serializing_if = "Option::is_none")]
    pub index_delta: Option<ProjectIndexDelta>,
    #[serde(
        rename = "indexInvalidated",
        skip_serializing_if = "std::ops::Not::not"
    )]
    pub index_invalidated: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DirectoryChangeType {
    Change,
    Rename,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectIndexEntry {
    pub path: String,
    pub relative_path: String,
    pub parent_relative_path: String,
    pub name: String,
    #[serde(rename = "type")]
    pub entry_type: DirectoryEntryType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_ms: Option<u64>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectIndexSnapshot {
    pub root: String,
    pub generation: u64,
    pub entries: Vec<ProjectIndexEntry>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectIndexDelta {
    pub generation: u64,
    pub upserted: Vec<ProjectIndexEntry>,
    pub removed_paths: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMetadata {
    pub current_version: String,
    pub version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(
    tag = "event",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum UpdateDownloadEvent {
    Started {
        content_length: Option<u64>,
    },
    Progress {
        chunk_length: u64,
        downloaded: u64,
        content_length: Option<u64>,
    },
    Finished,
}

impl SuccessResult {
    pub const fn ok() -> Self {
        Self { success: true }
    }
}

impl SpellInitResult {
    pub const fn ok() -> Self {
        Self {
            success: true,
            error: None,
        }
    }

    pub fn failed(error: impl Into<String>) -> Self {
        Self {
            success: false,
            error: Some(error.into()),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DirectoryEntryType {
    File,
    Directory,
}

#[derive(Debug, Serialize)]
pub struct DirectoryEntry {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub entry_type: DirectoryEntryType,
}

#[cfg(test)]
mod tests {
    use super::{
        CompileDiagnostic, CompileDiagnosticSeverity, CompileEvent, CompileIdentity,
        CompilePriority, CompileRequest, CompileResponse, DirectoryChangeEvent,
        DirectoryChangeType, DirectoryEntryType, ProjectIndexDelta, ProjectIndexEntry,
    };

    #[test]
    fn compile_request_matches_the_shared_camel_case_contract() {
        let request: CompileRequest = serde_json::from_value(serde_json::json!({
            "requestId": 14,
            "documentId": "paper.tex",
            "documentRevision": 9,
            "filePath": "/project/paper.tex",
            "priority": "normal"
        }))
        .expect("deserialize compile request");

        assert_eq!(request.request_id, 14);
        assert_eq!(request.document_revision, 9);
        assert!(matches!(request.priority, CompilePriority::Normal));
    }

    #[test]
    fn compile_response_flattens_identity_fields() {
        let identity = CompileIdentity {
            request_id: 14,
            document_id: "paper.tex".to_owned(),
            document_revision: 9,
        };
        let response = CompileResponse {
            identity: identity.clone(),
            pdf_path: "/project/paper.pdf".to_owned(),
            compiled_file_path: "/project/paper.tex".to_owned(),
        };
        assert_eq!(
            serde_json::to_value(response).expect("serialize compile response"),
            serde_json::json!({
                "requestId": 14,
                "documentId": "paper.tex",
                "documentRevision": 9,
                "pdfPath": "/project/paper.pdf",
                "compiledFilePath": "/project/paper.tex"
            })
        );

        let event = CompileEvent::Log {
            identity,
            text: "Running TeX ...\n".to_owned(),
        };
        assert_eq!(
            serde_json::to_value(event).expect("serialize compile event"),
            serde_json::json!({
                "event": "log",
                "requestId": 14,
                "documentId": "paper.tex",
                "documentRevision": 9,
                "text": "Running TeX ...\n"
            })
        );

        let diagnostics_event = CompileEvent::Diagnostics {
            identity: CompileIdentity {
                request_id: 14,
                document_id: "paper.tex".to_owned(),
                document_revision: 9,
            },
            diagnostics: vec![CompileDiagnostic {
                file: "/project/paper.tex".to_owned(),
                line: 7,
                column: Some(3),
                severity: CompileDiagnosticSeverity::Error,
                message: "Undefined control sequence".to_owned(),
            }],
        };
        assert_eq!(
            serde_json::to_value(diagnostics_event).expect("serialize diagnostics event"),
            serde_json::json!({
                "event": "diagnostics",
                "requestId": 14,
                "documentId": "paper.tex",
                "documentRevision": 9,
                "diagnostics": [{
                    "file": "/project/paper.tex",
                    "line": 7,
                    "column": 3,
                    "severity": "error",
                    "message": "Undefined control sequence"
                }]
            })
        );
    }

    #[test]
    fn directory_change_matches_the_shared_contract() {
        let event = DirectoryChangeEvent {
            event_type: DirectoryChangeType::Rename,
            filename: "chapters/intro.tex".to_owned(),
            index_delta: None,
            index_invalidated: false,
        };

        assert_eq!(
            serde_json::to_value(event).expect("serialize directory change"),
            serde_json::json!({
                "type": "rename",
                "filename": "chapters/intro.tex"
            })
        );

        let indexed_event = DirectoryChangeEvent {
            event_type: DirectoryChangeType::Change,
            filename: "main.tex".to_owned(),
            index_delta: Some(ProjectIndexDelta {
                generation: 2,
                upserted: vec![ProjectIndexEntry {
                    path: "/project/main.tex".to_owned(),
                    relative_path: "main.tex".to_owned(),
                    parent_relative_path: String::new(),
                    name: "main.tex".to_owned(),
                    entry_type: DirectoryEntryType::File,
                    size: Some(12),
                    modified_ms: Some(123),
                }],
                removed_paths: Vec::new(),
            }),
            index_invalidated: false,
        };
        assert_eq!(
            serde_json::to_value(indexed_event).expect("serialize indexed directory change"),
            serde_json::json!({
                "type": "change",
                "filename": "main.tex",
                "indexDelta": {
                    "generation": 2,
                    "upserted": [{
                        "path": "/project/main.tex",
                        "relativePath": "main.tex",
                        "parentRelativePath": "",
                        "name": "main.tex",
                        "type": "file",
                        "size": 12,
                        "modifiedMs": 123
                    }],
                    "removedPaths": []
                }
            })
        );
    }
}
