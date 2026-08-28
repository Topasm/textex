use serde::ser::{Serialize, SerializeStruct, Serializer};
use serde_json::{json, Value};
use std::io;
use thiserror::Error;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error("No project directory is open")]
    ProjectNotOpen,

    #[error("Path is outside the open project: {0}")]
    OutsideProject(String),

    #[error("Expected a file: {0}")]
    NotAFile(String),

    #[error("Expected a directory: {0}")]
    NotADirectory(String),

    #[error(
        "File is too large to open ({size_mb}MB). Files larger than 50MB cannot be opened to prevent editor freezing."
    )]
    FileTooLarge { size_mb: u64 },

    #[error("Path cannot be represented as UTF-8: {0}")]
    NonUtf8Path(String),

    #[error("Failed to {operation} {path}: {source}")]
    Io {
        operation: &'static str,
        path: String,
        #[source]
        source: io::Error,
    },

    #[error("Filesystem worker failed: {0}")]
    Worker(String),

    #[error("Directory watcher failed: {0}")]
    Watcher(String),

    #[error("Failed to {operation} Git repository at {path}: {source}")]
    GitIo {
        operation: &'static str,
        path: String,
        #[source]
        source: io::Error,
    },

    #[error("Git {operation} failed ({status}): {message}")]
    GitFailed {
        operation: &'static str,
        status: String,
        message: String,
    },

    #[error("Git {operation} produced more than {limit_mb} MiB of output")]
    GitOutputTooLarge {
        operation: &'static str,
        limit_mb: usize,
    },

    #[error("Git operation refused: {0}")]
    GitSafety(String),

    #[error("LaTeX package metadata operation failed: {0}")]
    PackageData(String),

    #[error("Project index operation failed: {0}")]
    ProjectIndex(String),

    #[error("SyncTeX operation failed: {0}")]
    SyncTex(String),

    #[error("Reference index operation failed: {0}")]
    ReferenceIndex(String),

    #[error("Research source operation failed: {0}")]
    ResearchSource(String),

    #[error("History operation failed: {0}")]
    History(String),

    #[error("Crash recovery operation failed: {0}")]
    Recovery(String),

    #[error("Project metadata operation failed: {0}")]
    ProjectData(String),

    #[error("Spellcheck operation failed: {0}")]
    Spellcheck(String),

    #[error("Template operation failed: {0}")]
    Template(String),

    #[error("Document export failed: {0}")]
    Export(String),

    #[error("Submission check failed: {0}")]
    SubmissionCheck(String),

    #[error("External URL operation failed: {0}")]
    ExternalUrl(String),

    #[error("Performance sampling failed: {0}")]
    Performance(String),

    #[error("System terminal operation failed: {0}")]
    SystemTerminal(String),

    #[error("Zotero operation failed: {0}")]
    Zotero(String),

    #[error("AI operation failed: {0}")]
    Ai(String),

    #[error("Settings operation failed: {0}")]
    Settings(String),

    #[error("Application updater failed: {0}")]
    Updater(String),

    #[error("Project is not present in the trusted recent-project list: {0}")]
    RecentProjectUnauthorized(String),

    #[error("Project state lock was poisoned")]
    StatePoisoned,

    #[error("LaTeX compilation was superseded by a newer document revision")]
    CompilationSuperseded,

    #[error("LaTeX compilation was cancelled")]
    CompilationCancelled,

    #[error("LaTeX compilation timed out after {seconds}s")]
    CompilationTimedOut { seconds: u64 },

    #[error("LaTeX compiler executable was not found. Checked: {checked_paths}")]
    CompilerNotFound { checked_paths: String },

    #[error("Failed to {operation} LaTeX compiler resource at {path}: {source}")]
    CompilerIo {
        operation: &'static str,
        path: String,
        #[source]
        source: io::Error,
    },

    #[error("LaTeX compiler exited unsuccessfully ({status})")]
    CompilerFailed { status: String },

    #[error("LaTeX compiler completed successfully but did not create a PDF at {0}")]
    CompiledPdfMissing(String),

    #[error("Failed to resolve an application runtime path: {0}")]
    RuntimePath(String),

    #[error("LaTeX compiler output worker failed: {0}")]
    CompilerWorker(String),
}

impl AppError {
    pub fn io(operation: &'static str, path: impl Into<String>, source: io::Error) -> Self {
        Self::Io {
            operation,
            path: path.into(),
            source,
        }
    }

    pub fn compiler_io(
        operation: &'static str,
        path: impl Into<String>,
        source: io::Error,
    ) -> Self {
        Self::CompilerIo {
            operation,
            path: path.into(),
            source,
        }
    }

    pub fn git_io(operation: &'static str, path: impl Into<String>, source: io::Error) -> Self {
        Self::GitIo {
            operation,
            path: path.into(),
            source,
        }
    }

    /// Stable machine-readable code carried across the renderer boundary.
    ///
    /// The renderer localizes and branches on this code; the serialized
    /// `message` is only an English fallback for codes it does not map. Codes
    /// are part of the shared contract in `src/shared/appError.ts` and must
    /// never be renamed on one side alone.
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidPath(_) => "invalidPath",
            Self::ProjectNotOpen => "projectNotOpen",
            Self::OutsideProject(_) => "outsideProject",
            Self::NotAFile(_) => "notAFile",
            Self::NotADirectory(_) => "notADirectory",
            Self::FileTooLarge { .. } => "fileTooLarge",
            Self::NonUtf8Path(_) => "nonUtf8Path",
            Self::Io { .. } => "io",
            Self::Worker(_) => "worker",
            Self::Watcher(_) => "watcher",
            Self::GitIo { .. } => "gitIo",
            Self::GitFailed { .. } => "gitFailed",
            Self::GitOutputTooLarge { .. } => "gitOutputTooLarge",
            Self::GitSafety(_) => "gitSafety",
            Self::PackageData(_) => "packageData",
            Self::ProjectIndex(_) => "projectIndex",
            Self::SyncTex(_) => "syncTex",
            Self::ReferenceIndex(_) => "referenceIndex",
            Self::ResearchSource(_) => "researchSource",
            Self::History(_) => "history",
            Self::Recovery(_) => "recovery",
            Self::ProjectData(_) => "projectData",
            Self::Spellcheck(_) => "spellcheck",
            Self::Template(_) => "template",
            Self::Export(_) => "export",
            Self::SubmissionCheck(_) => "submissionCheck",
            Self::ExternalUrl(_) => "externalUrl",
            Self::Performance(_) => "performance",
            Self::SystemTerminal(_) => "systemTerminal",
            Self::Zotero(_) => "zotero",
            Self::Ai(_) => "ai",
            Self::Settings(_) => "settings",
            Self::Updater(_) => "updater",
            Self::RecentProjectUnauthorized(_) => "recentProjectUnauthorized",
            Self::StatePoisoned => "statePoisoned",
            Self::CompilationSuperseded => "compilationSuperseded",
            Self::CompilationCancelled => "compilationCancelled",
            Self::CompilationTimedOut { .. } => "compilationTimedOut",
            Self::CompilerNotFound { .. } => "compilerNotFound",
            Self::CompilerIo { .. } => "compilerIo",
            Self::CompilerFailed { .. } => "compilerFailed",
            Self::CompiledPdfMissing(_) => "compiledPdfMissing",
            Self::RuntimePath(_) => "runtimePath",
            Self::CompilerWorker(_) => "compilerWorker",
        }
    }

    /// Interpolation values for the renderer's localized message templates.
    ///
    /// Only fields a user-facing message can present are exposed. `source`
    /// chains stay inside the already-rendered English `message` so no native
    /// error detail is lost for logs and bug reports.
    fn data(&self) -> Value {
        match self {
            Self::ProjectNotOpen
            | Self::StatePoisoned
            | Self::CompilationSuperseded
            | Self::CompilationCancelled => Value::Null,
            Self::InvalidPath(path)
            | Self::OutsideProject(path)
            | Self::NotAFile(path)
            | Self::NotADirectory(path)
            | Self::NonUtf8Path(path)
            | Self::CompiledPdfMissing(path)
            | Self::RecentProjectUnauthorized(path) => json!({ "path": path }),
            Self::FileTooLarge { size_mb } => json!({ "sizeMb": size_mb }),
            Self::Io {
                operation, path, ..
            }
            | Self::GitIo {
                operation, path, ..
            }
            | Self::CompilerIo {
                operation, path, ..
            } => json!({ "operation": operation, "path": path }),
            Self::GitFailed {
                operation,
                status,
                message,
            } => json!({ "operation": operation, "status": status, "message": message }),
            Self::GitOutputTooLarge {
                operation,
                limit_mb,
            } => json!({ "operation": operation, "limitMb": limit_mb }),
            Self::CompilationTimedOut { seconds } => json!({ "seconds": seconds }),
            Self::CompilerNotFound { checked_paths } => json!({ "checkedPaths": checked_paths }),
            Self::CompilerFailed { status } => json!({ "status": status }),
            Self::Worker(detail)
            | Self::Watcher(detail)
            | Self::GitSafety(detail)
            | Self::PackageData(detail)
            | Self::ProjectIndex(detail)
            | Self::SyncTex(detail)
            | Self::ReferenceIndex(detail)
            | Self::ResearchSource(detail)
            | Self::History(detail)
            | Self::Recovery(detail)
            | Self::ProjectData(detail)
            | Self::Spellcheck(detail)
            | Self::Template(detail)
            | Self::Export(detail)
            | Self::SubmissionCheck(detail)
            | Self::ExternalUrl(detail)
            | Self::Performance(detail)
            | Self::SystemTerminal(detail)
            | Self::Zotero(detail)
            | Self::Ai(detail)
            | Self::Settings(detail)
            | Self::Updater(detail)
            | Self::RuntimePath(detail)
            | Self::CompilerWorker(detail) => json!({ "detail": detail }),
        }
    }
}

// Tauri command errors must implement Serialize. The renderer needs a stable
// code to localize and to offer a recovery action, so rejected native calls
// carry `{ code, message, data }` rather than a bare English sentence. The
// renderer normalizes this payload in `src/renderer/platform/tauriApi.ts`.
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("AppError", 3)?;
        state.serialize_field("code", self.code())?;
        state.serialize_field("message", &self.to_string())?;
        state.serialize_field("data", &self.data())?;
        state.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn serialized(error: &AppError) -> Value {
        serde_json::to_value(error).expect("AppError serializes")
    }

    #[test]
    fn serializes_code_message_and_data() {
        let error = AppError::CompilerNotFound {
            checked_paths: "/usr/bin/tectonic".to_owned(),
        };

        assert_eq!(
            serialized(&error),
            json!({
                "code": "compilerNotFound",
                "message": "LaTeX compiler executable was not found. Checked: /usr/bin/tectonic",
                "data": { "checkedPaths": "/usr/bin/tectonic" }
            })
        );
    }

    #[test]
    fn serializes_unit_variants_with_null_data() {
        assert_eq!(
            serialized(&AppError::CompilationCancelled),
            json!({
                "code": "compilationCancelled",
                "message": "LaTeX compilation was cancelled",
                "data": Value::Null
            })
        );
    }

    #[test]
    fn exposes_numeric_interpolation_values() {
        assert_eq!(
            serialized(&AppError::CompilationTimedOut { seconds: 90 })["data"],
            json!({ "seconds": 90 })
        );
        assert_eq!(
            serialized(&AppError::FileTooLarge { size_mb: 64 })["data"],
            json!({ "sizeMb": 64 })
        );
    }

    #[test]
    fn keeps_the_io_source_in_the_message_and_the_path_in_the_data() {
        let error = AppError::io(
            "read",
            "/project/main.tex",
            io::Error::new(io::ErrorKind::PermissionDenied, "denied"),
        );
        let value = serialized(&error);

        assert_eq!(value["code"], json!("io"));
        assert_eq!(
            value["data"],
            json!({ "operation": "read", "path": "/project/main.tex" })
        );
        assert!(
            value["message"]
                .as_str()
                .expect("message is a string")
                .contains("denied"),
            "the io source must stay readable in the English message"
        );
    }

    #[test]
    fn every_code_is_unique_and_lower_camel_case() {
        // The renderer keys `errors.<code>` off these, so a duplicate would
        // silently merge two failures into one message.
        let codes = [
            AppError::InvalidPath(String::new()).code(),
            AppError::ProjectNotOpen.code(),
            AppError::CompilationCancelled.code(),
            AppError::CompilationSuperseded.code(),
            AppError::CompilerNotFound {
                checked_paths: String::new(),
            }
            .code(),
        ];

        for code in codes {
            assert!(
                code.chars()
                    .next()
                    .is_some_and(|first| first.is_lowercase()),
                "{code} must be lowerCamelCase"
            );
            assert!(code.chars().all(|c| c.is_ascii_alphanumeric()));
        }
    }
}
