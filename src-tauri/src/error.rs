use serde::ser::{Serialize, Serializer};
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

    #[error("LaTeX package metadata operation failed: {0}")]
    PackageData(String),

    #[error("Project index operation failed: {0}")]
    ProjectIndex(String),

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

    #[error("Tectonic executable was not found. Checked: {checked_paths}")]
    CompilerNotFound { checked_paths: String },

    #[error("Failed to {operation} Tectonic at {path}: {source}")]
    CompilerIo {
        operation: &'static str,
        path: String,
        #[source]
        source: io::Error,
    },

    #[error("Tectonic exited unsuccessfully ({status})")]
    CompilerFailed { status: String },

    #[error("Tectonic completed successfully but did not create a PDF at {0}")]
    CompiledPdfMissing(String),

    #[error("Failed to resolve an application runtime path: {0}")]
    RuntimePath(String),

    #[error("Tectonic output worker failed: {0}")]
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
}

// Tauri command errors must implement Serialize. A string payload preserves
// the renderer's existing Electron behavior, where rejected IPC calls expose
// a human-readable Error message.
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
