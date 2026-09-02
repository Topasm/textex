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
    pub doi: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arxiv_id: Option<String>,
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

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CitationUsage {
    pub citekey: String,
    pub count: u32,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub locations: Vec<CitationLocation>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CitationLocation {
    pub file: String,
    pub line: u32,
}

#[derive(Clone, Debug, Default)]
pub struct ReferenceIndex {
    pub bib_entries: Vec<BibEntry>,
    pub labels: Vec<LabelInfo>,
    pub citations: Vec<CitationUsage>,
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
    pub item_count: Option<u32>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroLibrary {
    pub key: String,
    pub name: String,
    pub item_count: Option<u32>,
    pub collections: Vec<ZoteroCollection>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroCollectionItem {
    pub item_key: String,
    pub citekey: Option<String>,
    pub title: String,
    pub author: String,
    pub year: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroCollectionItemsPage {
    pub items: Vec<ZoteroCollectionItem>,
    pub total_results: u32,
    pub offset: u32,
    pub limit: u32,
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
    /// Mirrors the configured collection into the managed file whenever the
    /// Zotero panel observes the collection change. Older configs predate the
    /// field, so it defaults instead of failing the whole document.
    #[serde(default)]
    pub auto_sync: bool,
}

impl Default for ResearchConfig {
    fn default() -> Self {
        Self {
            version: 1,
            references_file: "references.bib".to_owned(),
            zotero_file: "zotero.bib".to_owned(),
            zotero_collection: None,
            sync_on_open: false,
            auto_sync: false,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchPerson {
    pub id: String,
    pub name: String,
    pub role: Option<String>,
    pub email: Option<String>,
    pub homepage: Option<String>,
    pub github: Option<String>,
    pub orcid: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchPaperMetadata {
    pub title: String,
    pub r#abstract: Option<String>,
    pub doi: Option<String>,
    pub arxiv: Option<String>,
    pub venue: Option<String>,
    pub website: Option<String>,
    pub authors: Vec<ResearchPerson>,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ResearchResourceKind {
    Git,
    Website,
    Dataset,
    Documentation,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ResearchChatAccess {
    None,
    Metadata,
    IndexedRead,
    Snapshot,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchResource {
    pub id: String,
    pub kind: ResearchResourceKind,
    pub label: String,
    pub url: Option<String>,
    pub ssh_url: Option<String>,
    pub local_path: Option<String>,
    pub branch: Option<String>,
    pub chat_access: ResearchChatAccess,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchProfile {
    pub version: u8,
    pub paper: ResearchPaperMetadata,
    pub resources: Vec<ResearchResource>,
    pub instructions: Vec<String>,
}

impl Default for ResearchProfile {
    fn default() -> Self {
        Self {
            version: 1,
            paper: ResearchPaperMetadata {
                title: String::new(),
                r#abstract: None,
                doi: None,
                arxiv: None,
                venue: None,
                website: None,
                authors: Vec::new(),
            },
            resources: Vec::new(),
            instructions: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchSourceFile {
    pub path: String,
    pub bytes: u64,
    pub language: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchSourceIndex {
    pub resource_id: String,
    pub root_path: String,
    pub branch: Option<String>,
    pub indexed_at: u64,
    pub files: Vec<ResearchSourceFile>,
    pub file_count: usize,
    pub total_bytes: u64,
    pub truncated: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchSourceSearchResult {
    pub resource_id: String,
    pub path: String,
    pub line: u32,
    pub start_line: u32,
    pub snippet: String,
    pub score: f32,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchResourceSnapshot {
    pub resource_id: String,
    pub url: String,
    pub fetched_at: u64,
    pub content: String,
    pub truncated: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ResearchSourceGitAction {
    Cloned,
    Fetched,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchSourceGitResult {
    pub success: bool,
    pub resource_id: String,
    pub local_path: String,
    pub action: ResearchSourceGitAction,
    pub output: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryItem {
    pub timestamp: u64,
    pub size: u64,
    pub path: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RecoveryDiskState {
    Modified,
    Missing,
    Unavailable,
    Unchanged,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryItem {
    pub id: String,
    pub file_path: String,
    pub captured_at_epoch_ms: u64,
    pub size: u64,
    pub disk_state: RecoveryDiskState,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverySnapshot {
    pub item: RecoveryItem,
    pub content: String,
    pub disk_content: Option<String>,
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
#[serde(rename_all = "camelCase")]
pub struct GitRemoteStatus {
    pub remote: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
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
    pub latex_engine: LatexEngine,
    pub auto_compile: bool,
    pub watch_open_files: bool,
    pub spell_check_enabled: bool,
    pub spell_check_language: String,
    pub git_enabled: bool,
    pub auto_update_enabled: bool,
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
    pub word_wrap: bool,
    pub vim_mode: bool,
    pub format_on_save: bool,
    pub math_preview_enabled: bool,
    pub pdf_invert_mode: bool,
    pub auto_hide_sidebar: bool,
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
            latex_engine: LatexEngine::Tectonic,
            auto_compile: true,
            watch_open_files: true,
            spell_check_enabled: false,
            spell_check_language: "en-US".to_owned(),
            git_enabled: true,
            auto_update_enabled: true,
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
            word_wrap: true,
            vim_mode: false,
            format_on_save: true,
            math_preview_enabled: true,
            pdf_invert_mode: false,
            auto_hide_sidebar: false,
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

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum LatexEngine {
    #[default]
    Tectonic,
    PdfLatex,
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

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ResearchChatRole {
    User,
    Assistant,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchChatMessage {
    pub role: ResearchChatRole,
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub execution: Option<ResearchChatExecution>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sources: Vec<ResearchChatSessionContext>,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchChatExecution {
    pub provider: AiProvider,
    pub model: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ResearchChatSessionContextKind {
    Paper,
    Document,
    Repository,
    Website,
    Author,
    Reference,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchChatSessionContext {
    pub id: String,
    pub kind: ResearchChatSessionContextKind,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resource_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub citekey: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reference_source: Option<ResearchReferenceSource>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub online_reference: Option<OnlineReference>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ResearchReferenceSource {
    Project,
    Zotero,
    Online,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchChatSession {
    pub version: u8,
    pub messages: Vec<ResearchChatMessage>,
    pub selected_contexts: Vec<ResearchChatSessionContext>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub execution: Option<ResearchChatExecution>,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchChatSessionScope {
    pub project_root: String,
    pub project_epoch: String,
    pub revision: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchChatSessionSnapshot {
    pub project_root: String,
    pub project_epoch: String,
    pub revision: String,
    pub session: ResearchChatSession,
}

impl Default for ResearchChatSession {
    fn default() -> Self {
        Self {
            version: 1,
            messages: Vec::new(),
            selected_contexts: Vec::new(),
            execution: None,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ResearchChatContextKind {
    Paper,
    Document,
    Repository,
    Website,
    Author,
    Reference,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchReferenceDescriptor {
    pub source: ResearchReferenceSource,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub citekey: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub online_reference: Option<OnlineReference>,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchChatContext {
    pub kind: ResearchChatContextKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resource_id: Option<String>,
    pub label: String,
    pub source: Option<String>,
    #[serde(default)]
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reference: Option<ResearchReferenceDescriptor>,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchChatRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    pub message: String,
    pub history: Vec<ResearchChatMessage>,
    pub contexts: Vec<ResearchChatContext>,
    pub instructions: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub execution: Option<ResearchChatExecution>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchChatResponse {
    pub content: String,
    pub execution: ResearchChatExecution,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroPlanRequest {
    pub message: String,
    pub history: Vec<ResearchChatMessage>,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroMutationDraft {
    pub summary: String,
    pub operations: Vec<ZoteroMutationDraftOperation>,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ZoteroMutationDraftOperation {
    CreateCollection {
        name: String,
        #[serde(default)]
        parent: Option<String>,
    },
    MoveCollection {
        collection: String,
        #[serde(default)]
        parent: Option<String>,
    },
    RenameCollection {
        collection: String,
        new_name: String,
    },
    UpdateItemTags {
        query: String,
        #[serde(default)]
        add_tags: Vec<String>,
        #[serde(default)]
        remove_tags: Vec<String>,
    },
    UpdateItemCollections {
        query: String,
        #[serde(default)]
        add_collections: Vec<String>,
        #[serde(default)]
        remove_collections: Vec<String>,
    },
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroMutationPlan {
    pub summary: String,
    pub server_id: String,
    pub port: u16,
    pub project_root: String,
    pub project_epoch: String,
    pub operations: Vec<ZoteroMutationOperation>,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ZoteroMutationOperation {
    CreateCollection {
        key: String,
        name: String,
        path: String,
        parent_key: Option<String>,
        parent_label: String,
    },
    MoveCollection {
        key: String,
        version: u64,
        name: String,
        path: String,
        parent_key: Option<String>,
        parent_label: String,
    },
    RenameCollection {
        key: String,
        version: u64,
        name: String,
        path: String,
        new_name: String,
    },
    UpdateItem {
        key: String,
        version: u64,
        title: String,
        current_tags: Vec<String>,
        add_tags: Vec<String>,
        remove_tags: Vec<String>,
        current_collections: Vec<String>,
        add_collections: Vec<ZoteroMutationCollectionRef>,
        remove_collections: Vec<ZoteroMutationCollectionRef>,
    },
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroMutationCollectionRef {
    pub key: String,
    pub path: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroMutationResult {
    pub summary: String,
    pub applied: usize,
    pub collection_changes: usize,
    pub item_changes: usize,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTerminalRequest {
    pub work_dir: String,
    #[serde(default)]
    pub resume: bool,
    #[serde(default)]
    pub prompt: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCliStatus {
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aux_content: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmissionCheckRequest {
    pub root_file: String,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SubmissionCheckSeverity {
    Error,
    Warning,
    Info,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmissionCheckFinding {
    pub severity: SubmissionCheckSeverity,
    pub code: String,
    pub message: String,
    pub file: String,
    pub line: u32,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmissionCheckSummary {
    pub errors: u32,
    pub warnings: u32,
    pub info: u32,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmissionCheckResult {
    pub root_file: String,
    pub scanned_files: u32,
    pub findings: Vec<SubmissionCheckFinding>,
    pub summary: SubmissionCheckSummary,
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
        DirectoryChangeType, DirectoryEntryType, LatexEngine, ProjectIndexDelta, ProjectIndexEntry,
        UserSettings,
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
    fn user_settings_default_to_the_bundled_compiler_and_accept_pdf_latex() {
        let defaults = serde_json::to_value(UserSettings::default()).expect("serialize settings");
        assert_eq!(defaults["latexEngine"], "tectonic");

        let settings: UserSettings = serde_json::from_value(serde_json::json!({
            "latexEngine": "pdf-latex",
            "name": "Legacy Author",
            "email": "legacy@example.com",
            "affiliation": "Legacy University"
        }))
        .expect("deserialize partial settings with defaults");
        assert_eq!(settings.latex_engine, LatexEngine::PdfLatex);
        let serialized = serde_json::to_value(settings).expect("serialize migrated settings");
        assert!(serialized.get("name").is_none());
        assert!(serialized.get("email").is_none());
        assert!(serialized.get("affiliation").is_none());
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
            aux_content: None,
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
