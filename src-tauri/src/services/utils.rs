/// Safely truncate a string at a character boundary, appending "..." if truncated.
/// Unlike byte-index slicing (`&s[..N]`), this will never panic on multi-byte UTF-8.
pub fn safe_truncate(s: &str, max_chars: usize) -> String {
    if s.len() <= max_chars {
        return s.to_string();
    }
    match s.char_indices().nth(max_chars) {
        Some((idx, _)) => format!("{}...", &s[..idx]),
        None => s.to_string(),
    }
}

/// Safely truncate a string from the end, keeping the last `max_chars` characters
/// and prepending "..." if truncated.
pub fn safe_truncate_end(s: &str, max_chars: usize) -> String {
    if s.len() <= max_chars {
        return s.to_string();
    }
    // Walk from the end to find the right char boundary
    let char_count = s.chars().count();
    if char_count <= max_chars {
        return s.to_string();
    }
    let skip = char_count - max_chars;
    match s.char_indices().nth(skip) {
        Some((idx, _)) => format!("...{}", &s[idx..]),
        None => s.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_safe_truncate_short_string() {
        assert_eq!(safe_truncate("hello", 10), "hello");
    }

    #[test]
    fn test_safe_truncate_exact_length() {
        assert_eq!(safe_truncate("hello", 5), "hello");
    }

    #[test]
    fn test_safe_truncate_truncates() {
        assert_eq!(safe_truncate("hello world", 5), "hello...");
    }

    #[test]
    fn test_safe_truncate_multibyte_utf8() {
        // Each emoji is 4 bytes. Slicing at byte index 5 would panic.
        let s = "\u{1F600}\u{1F601}\u{1F602}\u{1F603}"; // 4 emoji, 16 bytes
        let result = safe_truncate(s, 2);
        assert_eq!(result, "\u{1F600}\u{1F601}...");
    }

    #[test]
    fn test_safe_truncate_empty() {
        assert_eq!(safe_truncate("", 10), "");
    }

    #[test]
    fn test_safe_truncate_end_short_string() {
        assert_eq!(safe_truncate_end("hello", 10), "hello");
    }

    #[test]
    fn test_safe_truncate_end_truncates() {
        assert_eq!(safe_truncate_end("hello world", 5), "...world");
    }

    #[test]
    fn test_safe_truncate_end_multibyte_utf8() {
        let s = "\u{1F600}\u{1F601}\u{1F602}\u{1F603}";
        let result = safe_truncate_end(s, 2);
        assert_eq!(result, "...\u{1F602}\u{1F603}");
    }
}
