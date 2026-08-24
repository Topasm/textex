//! Shared persistence and Research Chat limits. Keeping these values in one
//! place guarantees that a profile accepted on save can be assembled into a
//! bounded native Chat request.

pub const MAX_CHAT_RESOURCES: usize = 24;
pub const MAX_CHAT_REFERENCE_CONTEXTS: usize = 12;
pub const MAX_CHAT_CONTEXTS: usize = MAX_CHAT_RESOURCES + MAX_CHAT_REFERENCE_CONTEXTS + 3; // paper, authors, unsaved document
pub const MAX_CHAT_MESSAGE_BYTES: usize = 64 * 1024;
pub const MAX_CHAT_HISTORY_MESSAGES: usize = 40;
pub const MAX_CHAT_HISTORY_TOTAL_BYTES: usize = 512 * 1024;
pub const MAX_CHAT_CONTEXT_LABEL_BYTES: usize = 16 * 1024;
pub const MAX_CHAT_CONTEXT_SOURCE_BYTES: usize = 16 * 1024;
pub const MAX_CHAT_CONTEXT_BYTES: usize = 320 * 1024;
pub const MAX_CHAT_CONTEXT_TOTAL_BYTES: usize = 1024 * 1024;
pub const MAX_CHAT_INSTRUCTIONS: usize = 32;
pub const MAX_CHAT_INSTRUCTION_BYTES: usize = 16 * 1024;
pub const MAX_CHAT_INSTRUCTIONS_TOTAL_BYTES: usize = 128 * 1024;
pub const MAX_CITATION_KEY_BYTES: usize = 512;

pub fn is_safe_citation_key(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_CITATION_KEY_BYTES
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b':' | b'-' | b'_'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn citation_key_policy_rejects_markup_and_non_ascii_characters() {
        assert!(is_safe_citation_key("Smith_2026:Paper-1"));
        assert!(!is_safe_citation_key("Smith.2026"));
        assert!(!is_safe_citation_key("bad}\\input{secrets"));
        assert!(!is_safe_citation_key("논문2026"));
        assert!(!is_safe_citation_key(
            &"a".repeat(MAX_CITATION_KEY_BYTES + 1)
        ));
    }
}
