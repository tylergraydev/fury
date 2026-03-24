import { useEffect, useMemo, useState } from "react";
import { X, Plus, Pencil, Trash2, Scissors, Search, Tag, Copy, Check } from "lucide-react";
import { useSnippetStore } from "../../stores/snippetStore";
import type { Snippet, CreateSnippetRequest, UpdateSnippetRequest } from "../../lib/tauri";

interface Props {
  onClose: () => void;
  onInsert?: (content: string) => void;
}

const LANGUAGES = [
  "bash",
  "c",
  "cpp",
  "css",
  "go",
  "html",
  "java",
  "javascript",
  "json",
  "kotlin",
  "markdown",
  "python",
  "ruby",
  "rust",
  "sql",
  "swift",
  "typescript",
  "yaml",
];

export function SnippetManagerDialog({ onClose, onInsert }: Props) {
  const snippets = useSnippetStore((s) => s.snippets);
  const loading = useSnippetStore((s) => s.loading);
  const loadSnippets = useSnippetStore((s) => s.loadSnippets);
  const createSnippet = useSnippetStore((s) => s.createSnippet);
  const updateSnippet = useSnippetStore((s) => s.updateSnippet);
  const deleteSnippet = useSnippetStore((s) => s.deleteSnippet);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [editingSnippet, setEditingSnippet] = useState<Snippet | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Editor state
  const [editorTitle, setEditorTitle] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [editorLanguage, setEditorLanguage] = useState("");
  const [editorDescription, setEditorDescription] = useState("");
  const [editorTags, setEditorTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSnippets();
  }, [loadSnippets]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const s of snippets) {
      for (const t of s.tags) tags.add(t);
    }
    return Array.from(tags).sort();
  }, [snippets]);

  const filteredSnippets = useMemo(() => {
    let filtered = snippets;
    if (selectedTag) {
      filtered = filtered.filter((s) => s.tags.includes(selectedTag));
    }
    if (searchQuery) {
      const lower = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.title.toLowerCase().includes(lower) ||
          (s.description?.toLowerCase().includes(lower) ?? false) ||
          s.content.toLowerCase().includes(lower) ||
          (s.language?.toLowerCase().includes(lower) ?? false) ||
          s.tags.some((t) => t.toLowerCase().includes(lower)),
      );
    }
    return filtered;
  }, [snippets, selectedTag, searchQuery]);

  const resetEditor = () => {
    setEditorTitle("");
    setEditorContent("");
    setEditorLanguage("");
    setEditorDescription("");
    setEditorTags("");
    setError(null);
  };

  const startCreate = () => {
    resetEditor();
    setEditingSnippet(null);
    setIsCreating(true);
  };

  const startEdit = (snippet: Snippet) => {
    setEditorTitle(snippet.title);
    setEditorContent(snippet.content);
    setEditorLanguage(snippet.language ?? "");
    setEditorDescription(snippet.description ?? "");
    setEditorTags(snippet.tags.join(", "));
    setEditingSnippet(snippet);
    setIsCreating(true);
  };

  const handleSave = async () => {
    /* v8 ignore start -- defensive validation; button is disabled when fields are empty */
    if (!editorTitle.trim()) {
      setError("Title is required");
      return;
    }
    if (!editorContent.trim()) {
      setError("Content is required");
      return;
    }
    /* v8 ignore stop */
    setSaving(true);
    setError(null);
    try {
      const tags = editorTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      if (editingSnippet) {
        const request: UpdateSnippetRequest = {
          title: editorTitle.trim(),
          content: editorContent.trim(),
          language: editorLanguage.trim() || undefined,
          description: editorDescription.trim() || undefined,
          tags,
        };
        await updateSnippet(editingSnippet.id, request);
      } else {
        const request: CreateSnippetRequest = {
          title: editorTitle.trim(),
          content: editorContent.trim(),
          language: editorLanguage.trim() || undefined,
          description: editorDescription.trim() || undefined,
          tags: tags.length > 0 ? tags : undefined,
        };
        await createSnippet(request);
      }
      setIsCreating(false);
      resetEditor();
      setEditingSnippet(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (snippet: Snippet) => {
    try {
      await deleteSnippet(snippet.id);
    } catch {
      // Error is set in store
    }
  };

  const handleCopy = async (snippet: Snippet) => {
    try {
      await navigator.clipboard.writeText(snippet.content);
      setCopiedId(snippet.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard not available
    }
  };

  /* v8 ignore start -- onInsert is always truthy when handleInsert is called */
  const handleInsert = (snippet: Snippet) => {
    if (onInsert) {
      onInsert(snippet.content);
      onClose();
    }
  };
  /* v8 ignore stop */

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "var(--overlay)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex w-[640px] max-w-[90vw] max-h-[80vh] flex-col rounded-lg"
        role="dialog"
        aria-modal="true"
        aria-label="Snippet manager"
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2">
            <Scissors size={14} style={{ color: "var(--text-secondary)" }} />
            <h2
              className="text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {isCreating
                ? editingSnippet
                  ? "Edit Snippet"
                  : "New Snippet"
                : "Snippet Manager"}
            </h2>
          </div>
          <button onClick={onClose} style={{ color: "var(--text-muted)" }}>
            <X size={14} />
          </button>
        </div>

        {isCreating ? (
          /* Editor view */
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {error && (
                <div className="text-xs" style={{ color: "var(--error)" }}>
                  {error}
                </div>
              )}
              <div>
                <label
                  className="mb-1 block text-xs font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Title *
                </label>
                <input
                  value={editorTitle}
                  onChange={(e) => setEditorTitle(e.target.value)}
                  placeholder="e.g. fetch helper"
                  className="w-full rounded px-2 py-1.5 text-xs"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                  autoFocus
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Code *
                </label>
                <textarea
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  placeholder="Paste your code snippet here..."
                  rows={8}
                  className="w-full rounded px-2 py-1.5 font-mono text-xs"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                    resize: "vertical",
                  }}
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label
                    className="mb-1 block text-xs font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Language
                  </label>
                  <select
                    value={editorLanguage}
                    onChange={(e) => setEditorLanguage(e.target.value)}
                    className="w-full rounded px-2 py-1.5 text-xs"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <option value="">Auto-detect</option>
                    {LANGUAGES.map((lang) => (
                      <option key={lang} value={lang}>
                        {lang}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label
                    className="mb-1 block text-xs font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Tags
                  </label>
                  <input
                    value={editorTags}
                    onChange={(e) => setEditorTags(e.target.value)}
                    placeholder="http, utility (comma-separated)"
                    className="w-full rounded px-2 py-1.5 text-xs"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                    }}
                  />
                </div>
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Description
                </label>
                <input
                  value={editorDescription}
                  onChange={(e) => setEditorDescription(e.target.value)}
                  placeholder="Optional description"
                  className="w-full rounded px-2 py-1.5 text-xs"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                />
              </div>
            </div>
            <div
              className="flex justify-end gap-2 px-4 py-3"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <button
                onClick={() => {
                  setIsCreating(false);
                  resetEditor();
                  setEditingSnippet(null);
                }}
                className="rounded px-3 py-1.5 text-xs"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-secondary)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !editorTitle.trim() || !editorContent.trim()}
                className="rounded px-3 py-1.5 text-xs"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--bg-primary)",
                  opacity:
                    saving || !editorTitle.trim() || !editorContent.trim()
                      ? 0.5
                      : 1,
                }}
              >
                {saving
                  ? "Saving..."
                  : editingSnippet
                    ? "Update Snippet"
                    : "Create Snippet"}
              </button>
            </div>
          </>
        ) : (
          /* Library view */
          <>
            <div className="px-4 pt-3 space-y-2">
              {/* Search */}
              <div
                className="flex items-center gap-2 rounded px-2 py-1.5"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                }}
              >
                <Search size={12} style={{ color: "var(--text-muted)" }} />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search snippets..."
                  className="flex-1 bg-transparent text-xs outline-none"
                  style={{ color: "var(--text-primary)" }}
                  autoFocus
                />
              </div>

              {/* Tag filter */}
              {allTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setSelectedTag(null)}
                    className="rounded-full px-2 py-0.5 text-xs"
                    style={{
                      backgroundColor: !selectedTag
                        ? "var(--accent)"
                        : "var(--bg-surface)",
                      color: !selectedTag
                        ? "var(--bg-primary)"
                        : "var(--text-secondary)",
                    }}
                  >
                    All
                  </button>
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() =>
                        setSelectedTag(tag === selectedTag ? null : tag)
                      }
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{
                        backgroundColor:
                          tag === selectedTag
                            ? "var(--accent)"
                            : "var(--bg-surface)",
                        color:
                          tag === selectedTag
                            ? "var(--bg-primary)"
                            : "var(--text-secondary)",
                      }}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Snippet list */}
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {loading ? (
                <div
                  className="py-8 text-center text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  Loading...
                </div>
              ) : filteredSnippets.length === 0 ? (
                <div
                  className="py-8 text-center text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {snippets.length === 0
                    ? "No snippets saved yet. Create one to get started."
                    : "No snippets match your search."}
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredSnippets.map((snippet) => (
                    <div
                      key={snippet.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => { if (onInsert) { handleInsert(snippet); } else { handleCopy(snippet); } }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          if (onInsert) { handleInsert(snippet); } else { handleCopy(snippet); }
                        }
                      }}
                      className="group flex w-full cursor-pointer items-start gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-xs font-medium"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {snippet.title}
                          </span>
                          {snippet.language && (
                            <span
                              className="rounded-full px-1.5 py-0 text-[10px]"
                              style={{
                                backgroundColor: "var(--bg-surface)",
                                color: "var(--text-muted)",
                              }}
                            >
                              {snippet.language}
                            </span>
                          )}
                        </div>
                        {snippet.description && (
                          <div
                            className="mt-0.5 text-xs truncate"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {snippet.description}
                          </div>
                        )}
                        <div
                          className="mt-0.5 text-xs truncate font-mono"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {snippet.content}
                        </div>
                        {snippet.tags.length > 0 && (
                          <div className="mt-1 flex gap-1">
                            {snippet.tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-0.5 rounded px-1 py-0 text-[10px]"
                                style={{
                                  backgroundColor: "var(--bg-surface)",
                                  color: "var(--text-muted)",
                                }}
                              >
                                <Tag size={8} />
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(snippet);
                          }}
                          className="rounded p-1 hover:bg-[var(--bg-surface)]"
                          style={{ color: "var(--text-muted)" }}
                          title="Copy to clipboard"
                        >
                          {copiedId === snippet.id ? (
                            <Check size={12} style={{ color: "var(--success)" }} />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(snippet);
                          }}
                          className="rounded p-1 hover:bg-[var(--bg-surface)]"
                          style={{ color: "var(--text-muted)" }}
                          title="Edit"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(snippet);
                          }}
                          className="rounded p-1 hover:bg-[var(--bg-surface)]"
                          style={{ color: "var(--error)" }}
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              className="flex justify-between px-4 py-3"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <button
                onClick={startCreate}
                className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--bg-primary)",
                }}
              >
                <Plus size={12} />
                New Snippet
              </button>
              <button
                onClick={onClose}
                className="rounded px-3 py-1.5 text-xs"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-secondary)",
                }}
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
