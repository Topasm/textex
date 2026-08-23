//! Shared persistence and Research Chat limits. Keeping these values in one
//! place guarantees that a profile accepted on save can be assembled into a
//! bounded native Chat request.

pub const MAX_CHAT_RESOURCES: usize = 24;
pub const MAX_CHAT_CONTEXTS: usize = MAX_CHAT_RESOURCES + 3; // paper, authors, unsaved document
pub const MAX_CHAT_CONTEXT_BYTES: usize = 320 * 1024;
pub const MAX_CHAT_CONTEXT_TOTAL_BYTES: usize = 1024 * 1024;
pub const MAX_CHAT_INSTRUCTIONS: usize = 32;
pub const MAX_CHAT_INSTRUCTION_BYTES: usize = 16 * 1024;
pub const MAX_CHAT_INSTRUCTIONS_TOTAL_BYTES: usize = 128 * 1024;
