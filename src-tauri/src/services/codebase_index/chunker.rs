use std::path::Path;

/// A chunk of source code extracted from a file.
#[derive(Debug, Clone)]
pub struct CodeChunk {
    pub content: String,
    pub kind: ChunkKind,
    pub start_line: usize,
    pub end_line: usize,
    pub symbol_name: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ChunkKind {
    Function,
    Class,
    Import,
    Block,
    FileHeader,
    Struct,
    Enum,
    Trait,
    Impl,
    Module,
}

impl ChunkKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            ChunkKind::Function => "function",
            ChunkKind::Class => "class",
            ChunkKind::Import => "import",
            ChunkKind::Block => "block",
            ChunkKind::FileHeader => "file_header",
            ChunkKind::Struct => "struct",
            ChunkKind::Enum => "enum",
            ChunkKind::Trait => "trait",
            ChunkKind::Impl => "impl",
            ChunkKind::Module => "module",
        }
    }
}

const MAX_CHUNK_LINES: usize = 500;
const MIN_CHUNK_LINES: usize = 5;
const WINDOW_SIZE: usize = 100;
const WINDOW_OVERLAP: usize = 20;
const HEADER_LINES: usize = 20;

pub fn chunk_file(_path: &Path, content: &str, language: Option<&str>) -> Vec<CodeChunk> {
    if content.is_empty() {
        return Vec::new();
    }

    let lines: Vec<&str> = content.lines().collect();

    if let Some(lang) = language {
        if let Some(ts_language) = get_tree_sitter_language(lang) {
            if let Some(chunks) = chunk_with_tree_sitter(content, &lines, ts_language, lang) {
                return chunks;
            }
        }
    }

    fallback_chunk(&lines)
}

fn get_tree_sitter_language(language: &str) -> Option<tree_sitter::Language> {
    match language {
        "rust" => Some(tree_sitter_rust::LANGUAGE.into()),
        "typescript" => Some(tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into()),
        "javascript" => Some(tree_sitter_javascript::LANGUAGE.into()),
        "python" => Some(tree_sitter_python::LANGUAGE.into()),
        "go" => Some(tree_sitter_go::LANGUAGE.into()),
        "java" => Some(tree_sitter_java::LANGUAGE.into()),
        "c" => Some(tree_sitter_c::LANGUAGE.into()),
        "cpp" => Some(tree_sitter_cpp::LANGUAGE.into()),
        "json" => Some(tree_sitter_json::LANGUAGE.into()),
        "css" => Some(tree_sitter_css::LANGUAGE.into()),
        "html" => Some(tree_sitter_html::LANGUAGE.into()),
        "bash" => Some(tree_sitter_bash::LANGUAGE.into()),
        _ => None,
    }
}

fn is_semantic_node(kind: &str, language: &str) -> Option<ChunkKind> {
    match language {
        "rust" => match kind {
            "function_item" => Some(ChunkKind::Function),
            "impl_item" => Some(ChunkKind::Impl),
            "struct_item" => Some(ChunkKind::Struct),
            "enum_item" => Some(ChunkKind::Enum),
            "trait_item" => Some(ChunkKind::Trait),
            "mod_item" => Some(ChunkKind::Module),
            "use_declaration" => Some(ChunkKind::Import),
            _ => None,
        },
        "typescript" | "javascript" => match kind {
            "function_declaration" | "arrow_function" | "method_definition"
            | "function" | "generator_function_declaration" => Some(ChunkKind::Function),
            "class_declaration" | "abstract_class_declaration" => Some(ChunkKind::Class),
            "export_statement" | "import_statement" => Some(ChunkKind::Import),
            "interface_declaration" | "type_alias_declaration" | "enum_declaration" => {
                Some(ChunkKind::Struct)
            }
            _ => None,
        },
        "python" => match kind {
            "function_definition" => Some(ChunkKind::Function),
            "class_definition" => Some(ChunkKind::Class),
            "import_statement" | "import_from_statement" => Some(ChunkKind::Import),
            _ => None,
        },
        "go" => match kind {
            "function_declaration" | "method_declaration" => Some(ChunkKind::Function),
            "type_declaration" => Some(ChunkKind::Struct),
            "import_declaration" => Some(ChunkKind::Import),
            _ => None,
        },
        "java" => match kind {
            "method_declaration" | "constructor_declaration" => Some(ChunkKind::Function),
            "class_declaration" | "interface_declaration" | "enum_declaration" => {
                Some(ChunkKind::Class)
            }
            "import_declaration" => Some(ChunkKind::Import),
            _ => None,
        },
        "c" | "cpp" => match kind {
            "function_definition" => Some(ChunkKind::Function),
            "struct_specifier" | "class_specifier" => Some(ChunkKind::Struct),
            "preproc_include" | "using_declaration" => Some(ChunkKind::Import),
            _ => None,
        },
        _ => None,
    }
}

/// Extract the symbol name from a tree-sitter node.
fn extract_symbol_name(node: tree_sitter::Node, source: &[u8], language: &str) -> Option<String> {
    let kind = node.kind();
    match language {
        "rust" => match kind {
            "function_item" | "struct_item" | "enum_item" | "trait_item" => {
                node.child_by_field_name("name")
                    .and_then(|n| n.utf8_text(source).ok())
                    .map(|s| s.to_string())
            }
            "impl_item" => {
                node.child_by_field_name("type")
                    .and_then(|n| n.utf8_text(source).ok())
                    .map(|s| s.to_string())
            }
            _ => None,
        },
        "typescript" | "javascript" => match kind {
            "function_declaration" | "class_declaration" | "method_definition"
            | "interface_declaration" | "type_alias_declaration" | "enum_declaration" => {
                node.child_by_field_name("name")
                    .and_then(|n| n.utf8_text(source).ok())
                    .map(|s| s.to_string())
            }
            _ => None,
        },
        "python" => match kind {
            "function_definition" | "class_definition" => {
                node.child_by_field_name("name")
                    .and_then(|n| n.utf8_text(source).ok())
                    .map(|s| s.to_string())
            }
            _ => None,
        },
        "go" => match kind {
            "function_declaration" | "method_declaration" => {
                node.child_by_field_name("name")
                    .and_then(|n| n.utf8_text(source).ok())
                    .map(|s| s.to_string())
            }
            _ => None,
        },
        "java" => match kind {
            "method_declaration" | "class_declaration" | "interface_declaration"
            | "constructor_declaration" => {
                node.child_by_field_name("name")
                    .and_then(|n| n.utf8_text(source).ok())
                    .map(|s| s.to_string())
            }
            _ => None,
        },
        "c" | "cpp" => match kind {
            "function_definition" => {
                node.child_by_field_name("declarator")
                    .and_then(|decl| find_first_identifier(decl, source))
            }
            _ => None,
        },
        _ => None,
    }
}

fn find_first_identifier(node: tree_sitter::Node, source: &[u8]) -> Option<String> {
    if node.kind() == "identifier" {
        return node.utf8_text(source).ok().map(|s| s.to_string());
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if let Some(name) = find_first_identifier(child, source) {
            return Some(name);
        }
    }
    None
}

fn chunk_with_tree_sitter(
    content: &str,
    lines: &[&str],
    ts_language: tree_sitter::Language,
    language: &str,
) -> Option<Vec<CodeChunk>> {
    let mut parser = tree_sitter::Parser::new();
    parser.set_language(&ts_language).ok()?;
    let tree = parser.parse(content, None)?;
    let root = tree.root_node();

    let mut chunks = Vec::new();
    let source = content.as_bytes();

    if lines.len() > 1 {
        let header_end = lines.len().min(HEADER_LINES);
        let header_content: String = lines[..header_end].join("\n");
        if !header_content.trim().is_empty() {
            chunks.push(CodeChunk {
                content: header_content,
                kind: ChunkKind::FileHeader,
                start_line: 1,
                end_line: header_end,
                symbol_name: None,
            });
        }
    }

    let mut cursor = root.walk();
    for child in root.children(&mut cursor) {
        extract_semantic_chunks(child, lines, source, language, &mut chunks);
    }

    if chunks.len() <= 1 {
        return None;
    }

    Some(chunks)
}

fn extract_semantic_chunks(
    node: tree_sitter::Node,
    lines: &[&str],
    source: &[u8],
    language: &str,
    chunks: &mut Vec<CodeChunk>,
) {
    let kind = node.kind();
    let start_line = node.start_position().row;
    let end_line = node.end_position().row;
    let line_count = end_line - start_line + 1;

    if let Some(chunk_kind) = is_semantic_node(kind, language) {
        if line_count > MAX_CHUNK_LINES {
            let mut child_cursor = node.walk();
            for child in node.children(&mut child_cursor) {
                extract_semantic_chunks(child, lines, source, language, chunks);
            }
        } else if line_count >= MIN_CHUNK_LINES {
            let end = (end_line + 1).min(lines.len());
            let chunk_content: String = lines[start_line..end].join("\n");
            chunks.push(CodeChunk {
                content: chunk_content,
                kind: chunk_kind,
                start_line: start_line + 1,
                end_line: end,
                symbol_name: extract_symbol_name(node, source, language),
            });
        }
    } else {
        let mut child_cursor = node.walk();
        for child in node.children(&mut child_cursor) {
            extract_semantic_chunks(child, lines, source, language, chunks);
        }
    }
}

fn fallback_chunk(lines: &[&str]) -> Vec<CodeChunk> {
    let mut chunks = Vec::new();
    let total = lines.len();

    if total == 0 {
        return chunks;
    }

    let header_end = total.min(HEADER_LINES);
    let header_content: String = lines[..header_end].join("\n");
    if !header_content.trim().is_empty() {
        chunks.push(CodeChunk {
            content: header_content,
            kind: ChunkKind::FileHeader,
            start_line: 1,
            end_line: header_end,
            symbol_name: None,
        });
    }

    if total > HEADER_LINES {
        let mut start = 0;
        while start < total {
            let end = (start + WINDOW_SIZE).min(total);
            let chunk_content: String = lines[start..end].join("\n");
            if !chunk_content.trim().is_empty() {
                chunks.push(CodeChunk {
                    content: chunk_content,
                    kind: ChunkKind::Block,
                    start_line: start + 1,
                    end_line: end,
                    symbol_name: None,
                });
            }
            if end >= total {
                break;
            }
            start += WINDOW_SIZE - WINDOW_OVERLAP;
        }
    }

    chunks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chunk_empty_file() {
        let chunks = chunk_file(Path::new("test.rs"), "", Some("rust"));
        assert!(chunks.is_empty());
    }

    #[test]
    fn test_chunk_rust_function_with_symbol_names() {
        let code = "use std::io;\n\npub fn hello_world() {\n    println!(\"Hello, world!\");\n    let x = 1;\n    let y = 2;\n    let z = x + y;\n    println!(\"{}\", z);\n}\n\npub fn another_function() {\n    let a = 10;\n    let b = 20;\n    let c = a + b;\n    println!(\"{}\", c);\n    println!(\"done\");\n}\n";
        let chunks = chunk_file(Path::new("test.rs"), code, Some("rust"));
        assert!(!chunks.is_empty());

        let fn_chunks: Vec<_> = chunks.iter().filter(|c| c.kind == ChunkKind::Function).collect();
        let names: Vec<_> = fn_chunks.iter().filter_map(|c| c.symbol_name.as_deref()).collect();
        assert!(names.contains(&"hello_world"));
        assert!(names.contains(&"another_function"));
    }

    #[test]
    fn test_fallback_chunks_have_no_symbol_name() {
        let lines: Vec<String> = (0..250).map(|i| format!("line {}", i)).collect();
        let content = lines.join("\n");
        let chunks = chunk_file(Path::new("test.xyz"), &content, None);
        assert!(chunks.iter().all(|c| c.symbol_name.is_none()));
    }

    #[test]
    fn test_chunk_kind_as_str() {
        assert_eq!(ChunkKind::Function.as_str(), "function");
        assert_eq!(ChunkKind::Class.as_str(), "class");
        assert_eq!(ChunkKind::Struct.as_str(), "struct");
    }
}
