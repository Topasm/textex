use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub type PackageDataMap = HashMap<String, PackageData>;

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
            bracket_pair_colorization: false,
            sticky_scroll_enabled: false,
            smooth_scrolling: false,
            font_ligatures: false,
            minimap_enabled: false,
        }
    }
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

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
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
#[serde(rename_all = "camelCase")]
pub struct BinaryFileResult {
    pub data: Vec<u8>,
    pub mime_type: String,
}

#[derive(Debug, Serialize)]
pub struct SuccessResult {
    pub success: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct DirectoryChangeEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub filename: String,
}

impl SuccessResult {
    pub const fn ok() -> Self {
        Self { success: true }
    }
}

#[derive(Debug, Serialize)]
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
    use super::{CompileEvent, CompileIdentity, CompilePriority, CompileRequest, CompileResponse};

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
    }
}
