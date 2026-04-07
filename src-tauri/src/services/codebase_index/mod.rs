pub mod chunker;
pub mod schema;
pub mod walker;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use tantivy::collector::TopDocs;
use tantivy::query::QueryParser;
use tantivy::schema::Value;
use tantivy::directory::MmapDirectory;
use tantivy::{doc, Index, IndexReader, TantivyDocument};

use crate::error::AppError;
use crate::models::codebase_search::CodeSearchResult;

/// A codebase search index backed by Tantivy.
pub struct CodebaseIndex {
    index: Index,
    reader: IndexReader,
    index_dir: PathBuf,
    /// Content hash per file for incremental indexing.
    file_hashes: HashMap<PathBuf, u64>,
}

// CodebaseIndex holds an IndexReader which is Send + Sync.
// The IndexWriter is created on demand and not stored.
unsafe impl Send for CodebaseIndex {}

impl CodebaseIndex {
    /// Open an existing index or create a new one at the given directory.
    pub fn open_or_create(index_dir: &Path) -> Result<Self, AppError> {
        let schema = schema::build_schema();

        std::fs::create_dir_all(index_dir)?;

        let index = if index_dir.join("meta.json").exists() {
            let mmap_dir = MmapDirectory::open(index_dir)
                .map_err(|e| AppError::InternalError(format!("Failed to open directory: {}", e)))?;
            match Index::open(mmap_dir) {
                Ok(idx) => idx,
                Err(e) => {
                    // Schema mismatch — recreate
                    eprintln!("Warning: failed to open existing index ({}), recreating...", e);
                    std::fs::remove_dir_all(index_dir)?;
                    std::fs::create_dir_all(index_dir)?;
                    let new_dir = MmapDirectory::open(index_dir)
                        .map_err(|e| AppError::InternalError(format!("Failed to open directory: {}", e)))?;
                    Index::create(new_dir, schema, tantivy::IndexSettings::default())
                        .map_err(|e| AppError::InternalError(format!("Failed to create index: {}", e)))?
                }
            }
        } else {
            let mmap_dir = MmapDirectory::open(index_dir)
                .map_err(|e| AppError::InternalError(format!("Failed to open directory: {}", e)))?;
            Index::create(mmap_dir, schema, tantivy::IndexSettings::default())
                .map_err(|e| AppError::InternalError(format!("Failed to create index: {}", e)))?
        };

        schema::register_tokenizers(&index);

        let reader = index
            .reader()
            .map_err(|e| AppError::InternalError(format!("Failed to create reader: {}", e)))?;

        Ok(Self {
            index,
            reader,
            index_dir: index_dir.to_path_buf(),
            file_hashes: HashMap::new(),
        })
    }

    /// Index all files in a repository.
    ///
    /// `progress_callback` is called periodically with (files_indexed, total_files, current_file).
    pub fn index_full<F>(
        &mut self,
        repo_path: &Path,
        mut progress_callback: F,
    ) -> Result<IndexStats, AppError>
    where
        F: FnMut(u32, u32, &str),
    {
        let files = walker::walk_repo(repo_path)?;
        let total = files.len() as u32;

        let mut writer = self
            .index
            .writer(50_000_000) // 50 MB heap
            .map_err(|e| AppError::InternalError(format!("Failed to create writer: {}", e)))?;

        // Clear the index first for a full reindex
        writer
            .delete_all_documents()
            .map_err(|e| AppError::InternalError(format!("Failed to clear index: {}", e)))?;

        self.file_hashes.clear();

        let schema = self.index.schema();
        let field_file_path = schema.get_field(schema::FIELD_FILE_PATH).unwrap();
        let field_chunk_id = schema.get_field(schema::FIELD_CHUNK_ID).unwrap();
        let field_content = schema.get_field(schema::FIELD_CONTENT).unwrap();
        let field_language = schema.get_field(schema::FIELD_LANGUAGE).unwrap();
        let field_kind = schema.get_field(schema::FIELD_KIND).unwrap();
        let field_start_line = schema.get_field(schema::FIELD_START_LINE).unwrap();
        let field_end_line = schema.get_field(schema::FIELD_END_LINE).unwrap();
        let field_file_modified = schema.get_field(schema::FIELD_FILE_MODIFIED).unwrap();
        let field_symbol_name = schema.get_field(schema::FIELD_SYMBOL_NAME).unwrap();

        let mut files_indexed = 0u32;
        let mut chunks_indexed = 0u32;

        for file_path in &files {
            let relative = file_path
                .strip_prefix(repo_path)
                .unwrap_or(file_path)
                .to_string_lossy()
                .to_string();

            // Read file content
            let content = match std::fs::read_to_string(file_path) {
                Ok(c) => c,
                Err(_) => continue, // Skip unreadable files (binary, permission, etc.)
            };

            // Compute content hash for incremental updates
            let hash = simple_hash(&content);
            self.file_hashes.insert(file_path.clone(), hash);

            // Get file modification time
            let mtime = file_mtime(file_path);

            // Detect language and chunk
            let language = walker::detect_language(file_path);
            let lang_str = language.unwrap_or("unknown");
            let chunks = chunker::chunk_file(file_path, &content, language);

            for chunk in &chunks {
                let chunk_id = format!("{}:{}:{}", relative, chunk.start_line, chunk.end_line);

                writer.add_document(doc!(
                    field_file_path => relative.clone(),
                    field_chunk_id => chunk_id,
                    field_content => chunk.content.clone(),
                    field_language => lang_str.to_string(),
                    field_kind => chunk.kind.as_str().to_string(),
                    field_start_line => chunk.start_line as u64,
                    field_end_line => chunk.end_line as u64,
                    field_file_modified => mtime,
                    field_symbol_name => chunk.symbol_name.clone().unwrap_or_default(),
                )).map_err(|e| AppError::InternalError(format!("Failed to add document: {}", e)))?;

                chunks_indexed += 1;
            }

            files_indexed += 1;
            if files_indexed % 50 == 0 || files_indexed == total {
                progress_callback(files_indexed, total, &relative);
            }
        }

        writer
            .commit()
            .map_err(|e| AppError::InternalError(format!("Failed to commit index: {}", e)))?;

        self.reader
            .reload()
            .map_err(|e| AppError::InternalError(format!("Failed to reload reader: {}", e)))?;

        Ok(IndexStats {
            files_indexed,
            chunks_indexed,
        })
    }

    /// Re-index only the given changed file paths.
    pub fn update_files(
        &mut self,
        repo_path: &Path,
        changed_paths: &[PathBuf],
    ) -> Result<(), AppError> {
        if changed_paths.is_empty() {
            return Ok(());
        }

        let mut writer = self
            .index
            .writer(50_000_000)
            .map_err(|e| AppError::InternalError(format!("Failed to create writer: {}", e)))?;

        let schema = self.index.schema();
        let field_file_path = schema.get_field(schema::FIELD_FILE_PATH).unwrap();
        let field_chunk_id = schema.get_field(schema::FIELD_CHUNK_ID).unwrap();
        let field_content = schema.get_field(schema::FIELD_CONTENT).unwrap();
        let field_language = schema.get_field(schema::FIELD_LANGUAGE).unwrap();
        let field_kind = schema.get_field(schema::FIELD_KIND).unwrap();
        let field_start_line = schema.get_field(schema::FIELD_START_LINE).unwrap();
        let field_end_line = schema.get_field(schema::FIELD_END_LINE).unwrap();
        let field_file_modified = schema.get_field(schema::FIELD_FILE_MODIFIED).unwrap();
        let field_symbol_name = schema.get_field(schema::FIELD_SYMBOL_NAME).unwrap();

        for file_path in changed_paths {
            let relative = file_path
                .strip_prefix(repo_path)
                .unwrap_or(file_path)
                .to_string_lossy()
                .to_string();

            // Delete old documents for this file
            let term = tantivy::Term::from_field_text(field_file_path, &relative);
            writer.delete_term(term);

            // If file still exists, re-index it
            if file_path.exists() {
                let content = match std::fs::read_to_string(file_path) {
                    Ok(c) => c,
                    Err(_) => continue,
                };

                // Check if content actually changed
                let new_hash = simple_hash(&content);
                if let Some(old_hash) = self.file_hashes.get(file_path) {
                    if *old_hash == new_hash {
                        continue; // No actual content change
                    }
                }
                self.file_hashes.insert(file_path.clone(), new_hash);

                let mtime = file_mtime(file_path);
                let language = walker::detect_language(file_path);
                let lang_str = language.unwrap_or("unknown");
                let chunks = chunker::chunk_file(file_path, &content, language);

                for chunk in &chunks {
                    let chunk_id =
                        format!("{}:{}:{}", relative, chunk.start_line, chunk.end_line);
                    writer.add_document(doc!(
                        field_file_path => relative.clone(),
                        field_chunk_id => chunk_id,
                        field_content => chunk.content.clone(),
                        field_language => lang_str.to_string(),
                        field_kind => chunk.kind.as_str().to_string(),
                        field_start_line => chunk.start_line as u64,
                        field_end_line => chunk.end_line as u64,
                        field_file_modified => mtime,
                        field_symbol_name => chunk.symbol_name.clone().unwrap_or_default(),
                    )).map_err(|e| {
                        AppError::InternalError(format!("Failed to add document: {}", e))
                    })?;
                }
            } else {
                // File was deleted — remove from hash map
                self.file_hashes.remove(file_path);
            }
        }

        writer
            .commit()
            .map_err(|e| AppError::InternalError(format!("Failed to commit index: {}", e)))?;

        self.reader
            .reload()
            .map_err(|e| AppError::InternalError(format!("Failed to reload reader: {}", e)))?;

        Ok(())
    }

    /// Search the index for the given query, returning the top N results.
    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<CodeSearchResult>, AppError> {
        let schema = self.index.schema();
        let field_content = schema.get_field(schema::FIELD_CONTENT).unwrap();

        let query_parser = QueryParser::for_index(&self.index, vec![field_content]);
        let parsed_query = query_parser
            .parse_query(query)
            .map_err(|e| AppError::InternalError(format!("Failed to parse query: {}", e)))?;

        let searcher = self.reader.searcher();
        let top_docs = searcher
            .search(&parsed_query, &TopDocs::with_limit(limit))
            .map_err(|e| AppError::InternalError(format!("Search failed: {}", e)))?;

        self.extract_results(&searcher, &top_docs)
    }

    /// Search the index for symbols matching the given query.
    pub fn search_symbols(
        &self,
        query: &str,
        limit: usize,
    ) -> Result<Vec<CodeSearchResult>, AppError> {
        let schema = self.index.schema();
        let field_symbol_name = schema.get_field(schema::FIELD_SYMBOL_NAME).unwrap();

        let query_parser = QueryParser::for_index(&self.index, vec![field_symbol_name]);
        let parsed_query = query_parser
            .parse_query(query)
            .map_err(|e| AppError::InternalError(format!("Failed to parse query: {}", e)))?;

        let searcher = self.reader.searcher();
        let top_docs = searcher
            .search(&parsed_query, &TopDocs::with_limit(limit))
            .map_err(|e| AppError::InternalError(format!("Search failed: {}", e)))?;

        self.extract_results(&searcher, &top_docs)
    }

    fn extract_results(
        &self,
        searcher: &tantivy::Searcher,
        top_docs: &[(f32, tantivy::DocAddress)],
    ) -> Result<Vec<CodeSearchResult>, AppError> {
        let schema = self.index.schema();
        let field_file_path = schema.get_field(schema::FIELD_FILE_PATH).unwrap();
        let field_content = schema.get_field(schema::FIELD_CONTENT).unwrap();
        let field_kind = schema.get_field(schema::FIELD_KIND).unwrap();
        let field_language = schema.get_field(schema::FIELD_LANGUAGE).unwrap();
        let field_start_line = schema.get_field(schema::FIELD_START_LINE).unwrap();
        let field_end_line = schema.get_field(schema::FIELD_END_LINE).unwrap();
        let field_symbol_name = schema.get_field(schema::FIELD_SYMBOL_NAME).unwrap();

        let mut results = Vec::new();
        for (score, doc_address) in top_docs {
            let doc: TantivyDocument = searcher
                .doc(*doc_address)
                .map_err(|e| AppError::InternalError(format!("Failed to fetch doc: {}", e)))?;

            let file_path = doc.get_first(field_file_path).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let content = doc.get_first(field_content).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let kind = doc.get_first(field_kind).and_then(|v| v.as_str()).unwrap_or("block").to_string();
            let language = doc.get_first(field_language).and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
            let start_line = doc.get_first(field_start_line).and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let end_line = doc.get_first(field_end_line).and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let symbol_name_val = doc.get_first(field_symbol_name).and_then(|v| v.as_str()).unwrap_or("").to_string();

            results.push(CodeSearchResult {
                file_path,
                content,
                start_line,
                end_line,
                score: *score,
                kind,
                language,
                symbol_name: if symbol_name_val.is_empty() { None } else { Some(symbol_name_val) },
            });
        }

        Ok(results)
    }

    /// Delete the entire index from disk.
    pub fn delete(index_dir: &Path) -> Result<(), AppError> {
        if index_dir.exists() {
            std::fs::remove_dir_all(index_dir)?;
        }
        Ok(())
    }

    /// Get the index directory path.
    pub fn index_dir(&self) -> &Path {
        &self.index_dir
    }
}

/// Statistics from a full index operation.
pub struct IndexStats {
    pub files_indexed: u32,
    pub chunks_indexed: u32,
}

/// Simple FNV-1a hash for quick content comparison.
fn simple_hash(content: &str) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in content.bytes() {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

/// Get file modification time as epoch seconds.
fn file_mtime(path: &Path) -> u64 {
    std::fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn create_test_repo(dir: &Path) {
        fs::write(
            dir.join("main.rs"),
            r#"use std::io;

pub fn hello_world() {
    println!("Hello, world!");
    let x = 1;
    let y = 2;
    let z = x + y;
    println!("{}", z);
}

pub fn process_data(input: &str) -> String {
    let trimmed = input.trim();
    let upper = trimmed.to_uppercase();
    let result = format!("Processed: {}", upper);
    println!("Done processing");
    result
}
"#,
        )
        .unwrap();

        fs::write(
            dir.join("lib.rs"),
            r#"pub mod utils;

pub fn add(a: i32, b: i32) -> i32 {
    let sum = a + b;
    println!("Sum: {}", sum);
    sum
}

pub fn multiply(a: i32, b: i32) -> i32 {
    let product = a * b;
    println!("Product: {}", product);
    product
}
"#,
        )
        .unwrap();
    }

    #[test]
    fn test_open_or_create_new_index() {
        let dir = tempfile::tempdir().unwrap();
        let index_dir = dir.path().join("index");
        let index = CodebaseIndex::open_or_create(&index_dir);
        assert!(index.is_ok());
    }

    #[test]
    fn test_open_or_create_existing_index() {
        let dir = tempfile::tempdir().unwrap();
        let index_dir = dir.path().join("index");

        // Create
        let _index = CodebaseIndex::open_or_create(&index_dir).unwrap();
        drop(_index);

        // Re-open
        let index = CodebaseIndex::open_or_create(&index_dir);
        assert!(index.is_ok());
    }

    #[test]
    fn test_full_index_and_search() {
        let dir = tempfile::tempdir().unwrap();
        let repo_dir = dir.path().join("repo");
        fs::create_dir(&repo_dir).unwrap();
        create_test_repo(&repo_dir);

        let index_dir = dir.path().join("index");
        let mut index = CodebaseIndex::open_or_create(&index_dir).unwrap();

        let stats = index.index_full(&repo_dir, |_, _, _| {}).unwrap();
        assert!(stats.files_indexed >= 2);
        assert!(stats.chunks_indexed > 0);

        // Search for "hello"
        let results = index.search("hello", 10).unwrap();
        assert!(!results.is_empty());
        assert!(results[0].file_path.contains("main.rs"));
    }

    #[test]
    fn test_search_no_results() {
        let dir = tempfile::tempdir().unwrap();
        let repo_dir = dir.path().join("repo");
        fs::create_dir(&repo_dir).unwrap();
        create_test_repo(&repo_dir);

        let index_dir = dir.path().join("index");
        let mut index = CodebaseIndex::open_or_create(&index_dir).unwrap();
        index.index_full(&repo_dir, |_, _, _| {}).unwrap();

        let results = index.search("xyznonexistent", 10).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_incremental_update() {
        let dir = tempfile::tempdir().unwrap();
        let repo_dir = dir.path().join("repo");
        fs::create_dir(&repo_dir).unwrap();
        create_test_repo(&repo_dir);

        let index_dir = dir.path().join("index");
        let mut index = CodebaseIndex::open_or_create(&index_dir).unwrap();
        index.index_full(&repo_dir, |_, _, _| {}).unwrap();

        // Add a new file
        fs::write(
            repo_dir.join("new_file.rs"),
            r#"pub fn brand_new_function() {
    let unique_value = 42;
    println!("unique: {}", unique_value);
    println!("this is brand new");
    println!("extra line");
}
"#,
        )
        .unwrap();

        // Update the index
        index
            .update_files(&repo_dir, &[repo_dir.join("new_file.rs")])
            .unwrap();

        // Search for the new content
        let results = index.search("brand_new_function", 10).unwrap();
        assert!(!results.is_empty());
    }

    #[test]
    fn test_delete_index() {
        let dir = tempfile::tempdir().unwrap();
        let index_dir = dir.path().join("index");
        let _index = CodebaseIndex::open_or_create(&index_dir).unwrap();
        drop(_index);

        assert!(index_dir.exists());
        CodebaseIndex::delete(&index_dir).unwrap();
        assert!(!index_dir.exists());
    }

    #[test]
    fn test_simple_hash() {
        let h1 = simple_hash("hello world");
        let h2 = simple_hash("hello world");
        let h3 = simple_hash("hello world!");
        assert_eq!(h1, h2);
        assert_ne!(h1, h3);
    }

    #[test]
    fn test_progress_callback() {
        let dir = tempfile::tempdir().unwrap();
        let repo_dir = dir.path().join("repo");
        fs::create_dir(&repo_dir).unwrap();
        create_test_repo(&repo_dir);

        let index_dir = dir.path().join("index");
        let mut index = CodebaseIndex::open_or_create(&index_dir).unwrap();

        let mut progress_calls = 0;
        index
            .index_full(&repo_dir, |_indexed, _total, _file| {
                progress_calls += 1;
            })
            .unwrap();
        assert!(progress_calls > 0);
    }
}
