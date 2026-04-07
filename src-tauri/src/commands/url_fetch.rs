use crate::error::AppError;
use crate::models::url_content::UrlContent;
use std::net::IpAddr;

const MAX_CONTENT_LENGTH: usize = 10_000;
const MAX_RESPONSE_BYTES: usize = 5 * 1024 * 1024; // 5 MB hard cap

#[tauri::command]
#[specta::specta]
pub async fn fetch_url_content(url: String) -> Result<UrlContent, AppError> {
    // Parse URL up-front so we can validate every redirect hop through the
    // same host-check function.
    let parsed = url::Url::parse(&url)
        .map_err(|e| AppError::InternalError(format!("Invalid URL: {}", e)))?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(AppError::InternalError(
            "URL must start with http:// or https://".into(),
        ));
    }
    validate_public_host(&parsed).map_err(AppError::InternalError)?;

    // Custom redirect policy: re-validate the host on every hop. This prevents
    // an attacker from serving a 302 → http://127.0.0.1 or cloud metadata IP.
    let redirect_policy = reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= 5 {
            return attempt.error("too many redirects");
        }
        match validate_public_host(attempt.url()) {
            Ok(()) => attempt.follow(),
            Err(e) => attempt.error(e),
        }
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("Fury/1.0")
        .redirect(redirect_policy)
        .build()
        .map_err(|e| AppError::InternalError(format!("HTTP client error: {}", e)))?;

    let response = client
        .get(parsed.clone())
        .send()
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to fetch URL: {}", e)))?
        .error_for_status()
        .map_err(|e| AppError::InternalError(format!("HTTP error: {}", e)))?;

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("text/plain")
        .to_string();

    // Stream body with a hard byte cap so a malicious server can't OOM us.
    let body = read_capped_body(response).await?;

    let (title, content) = if content_type.contains("text/html") {
        extract_html_content(&body)
    } else {
        (None, body)
    };

    // Truncate on a char boundary, not a byte offset.
    let content = if content.chars().count() > MAX_CONTENT_LENGTH {
        let truncated: String = content.chars().take(MAX_CONTENT_LENGTH).collect();
        format!(
            "{}...\n[truncated — {} chars total]",
            truncated,
            content.chars().count()
        )
    } else {
        content
    };

    Ok(UrlContent {
        url,
        title,
        content,
        content_type,
    })
}

/// Reject URLs whose host resolves to a loopback, private, link-local, or
/// otherwise non-globally-routable address. This is a best-effort SSRF guard
/// that runs on every redirect hop.
fn validate_public_host(u: &url::Url) -> Result<(), String> {
    let host = u.host_str().ok_or_else(|| "URL has no host".to_string())?;

    // Reject literal IPs in unsafe ranges.
    if let Ok(ip) = host.parse::<IpAddr>() {
        if !is_public_ip(&ip) {
            return Err(format!("blocked internal address: {}", ip));
        }
        return Ok(());
    }

    // Resolve DNS and reject if any returned address is non-public. We use a
    // blocking resolver in spawn_blocking style — `to_socket_addrs` is sync,
    // but host resolution is fast enough that this is acceptable inside the
    // redirect policy closure (which is also sync).
    use std::net::ToSocketAddrs;
    let addrs = (host, 0u16)
        .to_socket_addrs()
        .map_err(|e| format!("DNS resolution failed: {}", e))?;
    for addr in addrs {
        if !is_public_ip(&addr.ip()) {
            return Err(format!(
                "blocked internal address for host {}: {}",
                host,
                addr.ip()
            ));
        }
    }
    Ok(())
}

fn is_public_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            !(v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_multicast()
                || v4.is_unspecified()
                || v4.is_documentation()
                // Carrier-grade NAT 100.64.0.0/10
                || (v4.octets()[0] == 100 && (v4.octets()[1] & 0xc0) == 64)
                // Cloud metadata endpoint 169.254.169.254 is link-local, already covered.
                // Benchmarking 198.18.0.0/15
                || (v4.octets()[0] == 198 && (v4.octets()[1] & 0xfe) == 18))
        }
        IpAddr::V6(v6) => {
            // Handle IPv4-mapped (::ffff:a.b.c.d) by delegating to v4 check.
            let segs = v6.segments();
            if segs[0] == 0
                && segs[1] == 0
                && segs[2] == 0
                && segs[3] == 0
                && segs[4] == 0
                && segs[5] == 0xffff
            {
                let v4 = std::net::Ipv4Addr::new(
                    (segs[6] >> 8) as u8,
                    (segs[6] & 0xff) as u8,
                    (segs[7] >> 8) as u8,
                    (segs[7] & 0xff) as u8,
                );
                return is_public_ip(&IpAddr::V4(v4));
            }
            !(v6.is_loopback()
                || v6.is_multicast()
                || v6.is_unspecified()
                // Unique-local fc00::/7
                || (segs[0] & 0xfe00) == 0xfc00
                // Link-local fe80::/10
                || (segs[0] & 0xffc0) == 0xfe80)
        }
    }
}

async fn read_capped_body(mut response: reqwest::Response) -> Result<String, AppError> {
    let mut buf: Vec<u8> = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to read response: {}", e)))?
    {
        if buf.len() + chunk.len() > MAX_RESPONSE_BYTES {
            // Truncate to cap and stop — any more is a DoS attempt.
            let remaining = MAX_RESPONSE_BYTES - buf.len();
            buf.extend_from_slice(&chunk[..remaining]);
            break;
        }
        buf.extend_from_slice(&chunk);
    }
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

fn extract_html_content(html: &str) -> (Option<String>, String) {
    let title = extract_tag_content(html, "title");

    // Single-pass strip of <script>, <style>, <noscript> blocks and all other
    // tags. We scan the original string byte-by-byte (well, char-by-char) so
    // there is no O(n²) to_lowercase in a loop.
    let stripped = strip_html_tags(html);

    let decoded = stripped
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ");

    let lines: Vec<&str> = decoded
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();
    (title, lines.join("\n"))
}

/// Strip HTML tags in a single pass. Within <script>, <style>, <noscript>
/// blocks, the body is discarded entirely. Block-level closing tags are
/// converted to newlines so the flattened text stays readable.
fn strip_html_tags(html: &str) -> String {
    let bytes = html.as_bytes();
    let mut out = String::with_capacity(html.len() / 2);
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b == b'<' {
            // Look at the tag name to decide what to do.
            let name_start = i + 1;
            let mut name_end = name_start;
            while name_end < bytes.len()
                && !bytes[name_end].is_ascii_whitespace()
                && bytes[name_end] != b'>'
                && bytes[name_end] != b'/'
            {
                name_end += 1;
            }
            let name = &html[name_start..name_end].to_ascii_lowercase();

            // Script/style/noscript: skip the entire block.
            if matches!(name.as_str(), "script" | "style" | "noscript") {
                let close = format!("</{}", name);
                if let Some(rel_end) = find_case_insensitive_ascii(&html[i..], &close) {
                    let after = i + rel_end;
                    // Advance past the closing tag's `>`.
                    if let Some(gt) = bytes[after..].iter().position(|&c| c == b'>') {
                        i = after + gt + 1;
                        continue;
                    }
                }
                // No closer found; drop the rest.
                break;
            }

            // For block-level closing tags, emit a newline in place of the tag.
            let is_block_close = html[name_start..name_end]
                .strip_prefix('/')
                .map(|tail| {
                    matches!(
                        tail.to_ascii_lowercase().as_str(),
                        "p" | "div" | "li" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "br"
                    )
                })
                .unwrap_or(false);

            // Advance past the whole tag.
            if let Some(gt) = bytes[i..].iter().position(|&c| c == b'>') {
                i += gt + 1;
            } else {
                break;
            }

            if is_block_close || name == "br" {
                out.push('\n');
            }
        } else {
            // Safe: `i` is at a char boundary because we only jump over ASCII
            // `<`, `>` and the tag-name bytes, which are all ASCII. Non-ASCII
            // content only appears in the body between tags.
            if let Some(ch) = html[i..].chars().next() {
                out.push(ch);
                i += ch.len_utf8();
            } else {
                break;
            }
        }
    }
    out
}

/// Case-insensitive ASCII substring search. Returns the byte offset into
/// `haystack` where `needle` (already lowercase, ASCII-only) starts.
fn find_case_insensitive_ascii(haystack: &str, needle: &str) -> Option<usize> {
    let hb = haystack.as_bytes();
    let nb = needle.as_bytes();
    if nb.is_empty() || hb.len() < nb.len() {
        return None;
    }
    'outer: for i in 0..=hb.len() - nb.len() {
        for j in 0..nb.len() {
            if hb[i + j].to_ascii_lowercase() != nb[j] {
                continue 'outer;
            }
        }
        return Some(i);
    }
    None
}

fn extract_tag_content(html: &str, tag: &str) -> Option<String> {
    let open = format!("<{}", tag);
    let close = format!("</{}>", tag);
    let open_pos = find_case_insensitive_ascii(html, &open)?;
    // Find the `>` closing the open tag (skipping attributes).
    let gt_rel = html[open_pos..].as_bytes().iter().position(|&c| c == b'>')?;
    let content_start = open_pos + gt_rel + 1;
    let close_rel = find_case_insensitive_ascii(&html[content_start..], &close)?;
    let content_end = content_start + close_rel;
    Some(html[content_start..content_end].trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_html_with_title() {
        let html = "<html><head><title>Test Page</title></head><body><p>Hello world</p></body></html>";
        let (title, content) = extract_html_content(html);
        assert_eq!(title.as_deref(), Some("Test Page"));
        assert!(content.contains("Hello world"));
    }

    #[test]
    fn test_extract_html_strips_scripts() {
        let html = "<p>Before</p><script>alert('x')</script><p>After</p>";
        let (_, content) = extract_html_content(html);
        assert!(content.contains("Before"));
        assert!(content.contains("After"));
        assert!(!content.contains("alert"));
    }

    #[test]
    fn test_extract_html_decodes_entities() {
        let html = "<p>A &amp; B &lt; C</p>";
        let (_, content) = extract_html_content(html);
        assert!(content.contains("A & B < C"));
    }

    #[test]
    fn test_extract_tag_content() {
        assert_eq!(extract_tag_content("<title>Hello</title>", "title"), Some("Hello".into()));
        assert_eq!(extract_tag_content("<p>no title</p>", "title"), None);
    }

    #[test]
    fn test_extract_html_handles_unicode() {
        // Previously a byte-slice at MAX_CONTENT_LENGTH would panic on multi-byte chars.
        let big_unicode: String = "日本語テスト".repeat(5000);
        let html = format!("<p>{}</p>", big_unicode);
        let (_, content) = extract_html_content(&html);
        assert!(content.contains("日本語テスト"));
    }

    #[test]
    fn test_extract_html_case_insensitive_scripts() {
        let html = "<P>Keep</P><SCRIPT>drop()</SCRIPT><P>Also</P>";
        let (_, content) = extract_html_content(html);
        assert!(content.contains("Keep"));
        assert!(content.contains("Also"));
        assert!(!content.contains("drop"));
    }

    #[test]
    fn test_is_public_ip_blocks_private() {
        assert!(!is_public_ip(&"127.0.0.1".parse().unwrap()));
        assert!(!is_public_ip(&"10.0.0.1".parse().unwrap()));
        assert!(!is_public_ip(&"192.168.1.1".parse().unwrap()));
        assert!(!is_public_ip(&"172.16.0.1".parse().unwrap()));
        assert!(!is_public_ip(&"169.254.169.254".parse().unwrap())); // AWS metadata
        assert!(!is_public_ip(&"100.64.0.1".parse().unwrap())); // CGNAT
        assert!(!is_public_ip(&"::1".parse().unwrap()));
        assert!(!is_public_ip(&"fe80::1".parse().unwrap()));
        assert!(!is_public_ip(&"fc00::1".parse().unwrap()));
    }

    #[test]
    fn test_is_public_ip_allows_public() {
        assert!(is_public_ip(&"1.1.1.1".parse().unwrap()));
        assert!(is_public_ip(&"8.8.8.8".parse().unwrap()));
        assert!(is_public_ip(&"2606:4700:4700::1111".parse().unwrap()));
    }

    #[test]
    fn test_validate_public_host_rejects_loopback_literal() {
        let u = url::Url::parse("http://127.0.0.1/").unwrap();
        assert!(validate_public_host(&u).is_err());
    }

    #[test]
    fn test_validate_public_host_rejects_metadata_literal() {
        let u = url::Url::parse("http://169.254.169.254/latest/meta-data/").unwrap();
        assert!(validate_public_host(&u).is_err());
    }
}
