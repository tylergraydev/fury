use tantivy::schema::{
    Schema, TextFieldIndexing, TextOptions, STORED, STRING,
};
use tantivy::tokenizer::TextAnalyzer;

/// Field names used in the Tantivy index.
pub const FIELD_FILE_PATH: &str = "file_path";
pub const FIELD_CHUNK_ID: &str = "chunk_id";
pub const FIELD_CONTENT: &str = "content";
pub const FIELD_LANGUAGE: &str = "language";
pub const FIELD_KIND: &str = "kind";
pub const FIELD_START_LINE: &str = "start_line";
pub const FIELD_END_LINE: &str = "end_line";
pub const FIELD_FILE_MODIFIED: &str = "file_modified";
pub const FIELD_SYMBOL_NAME: &str = "symbol_name";

/// Build the Tantivy schema for codebase search.
pub fn build_schema() -> Schema {
    let mut schema_builder = Schema::builder();

    schema_builder.add_text_field(FIELD_FILE_PATH, STRING | STORED);
    schema_builder.add_text_field(FIELD_CHUNK_ID, STORED);

    let text_options = TextOptions::default()
        .set_indexing_options(
            TextFieldIndexing::default()
                .set_tokenizer("default")
                .set_index_option(tantivy::schema::IndexRecordOption::WithFreqsAndPositions),
        )
        .set_stored();
    schema_builder.add_text_field(FIELD_CONTENT, text_options);

    schema_builder.add_text_field(FIELD_LANGUAGE, STRING | STORED);
    schema_builder.add_text_field(FIELD_KIND, STRING | STORED);
    schema_builder.add_u64_field(FIELD_START_LINE, STORED);
    schema_builder.add_u64_field(FIELD_END_LINE, STORED);
    schema_builder.add_u64_field(FIELD_FILE_MODIFIED, STORED);
    schema_builder.add_text_field(FIELD_SYMBOL_NAME, STRING | STORED);

    schema_builder.build()
}

/// Register custom tokenizers on a Tantivy index.
pub fn register_tokenizers(_index: &tantivy::Index) {
    let _ = TextAnalyzer::builder(tantivy::tokenizer::SimpleTokenizer::default())
        .filter(tantivy::tokenizer::LowerCaser)
        .build();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_schema_has_all_fields() {
        let schema = build_schema();
        assert!(schema.get_field(FIELD_FILE_PATH).is_ok());
        assert!(schema.get_field(FIELD_CHUNK_ID).is_ok());
        assert!(schema.get_field(FIELD_CONTENT).is_ok());
        assert!(schema.get_field(FIELD_LANGUAGE).is_ok());
        assert!(schema.get_field(FIELD_KIND).is_ok());
        assert!(schema.get_field(FIELD_START_LINE).is_ok());
        assert!(schema.get_field(FIELD_END_LINE).is_ok());
        assert!(schema.get_field(FIELD_FILE_MODIFIED).is_ok());
        assert!(schema.get_field(FIELD_SYMBOL_NAME).is_ok());
    }

    #[test]
    fn test_schema_field_count() {
        let schema = build_schema();
        assert_eq!(schema.fields().count(), 9);
    }
}
