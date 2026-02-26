import { useEffect, useMemo, useState } from "react";
import { X, Plus, Pencil, Trash2, BookOpen, Search, Tag } from "lucide-react";
import { usePromptLibraryStore } from "../../stores/promptLibraryStore";
import type { Prompt, CreatePromptRequest, UpdatePromptRequest } from "../../lib/tauri";
import { extractVariables, isAutoFillVariable } from "../../lib/promptVariables";
import { VariableSubstitutionDialog } from "./VariableSubstitutionDialog";

interface Props {
  onClose: () => void;
  onInsert: (resolvedContent: string, displayName: string) => void;
  currentFilePath?: string | null;
  currentSelection?: string | null;
  currentBranch?: string | null;
  currentWorkspace?: string | null;
}

export function PromptLibraryDialog({
  onClose,
  onInsert,
  currentFilePath,
  currentSelection,
  currentBranch,
  currentWorkspace,
}: Props) {
  const { prompts, loading, loadPrompts, createPrompt, updatePrompt, deletePrompt } =
    usePromptLibraryStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingInsert, setPendingInsert] = useState<Prompt | null>(null);

  // Editor state
  const [editorName, setEditorName] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [editorDescription, setEditorDescription] = useState("");
  const [editorCategory, setEditorCategory] = useState("");
  const [editorTags, setEditorTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPrompts();
  }, [loadPrompts]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const p of prompts) {
      if (p.category) cats.add(p.category);
    }
    return Array.from(cats).sort();
  }, [prompts]);

  const filteredPrompts = useMemo(() => {
    let filtered = prompts;
    if (selectedCategory) {
      filtered = filtered.filter((p) => p.category === selectedCategory);
    }
    if (searchQuery) {
      const lower = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(lower) ||
          (p.description?.toLowerCase().includes(lower) ?? false) ||
          p.content.toLowerCase().includes(lower) ||
          p.tags.some((t) => t.toLowerCase().includes(lower)),
      );
    }
    return filtered;
  }, [prompts, selectedCategory, searchQuery]);

  const resetEditor = () => {
    setEditorName("");
    setEditorContent("");
    setEditorDescription("");
    setEditorCategory("");
    setEditorTags("");
    setError(null);
  };

  const startCreate = () => {
    resetEditor();
    setEditingPrompt(null);
    setIsCreating(true);
  };

  const startEdit = (prompt: Prompt) => {
    setEditorName(prompt.name);
    setEditorContent(prompt.content);
    setEditorDescription(prompt.description ?? "");
    setEditorCategory(prompt.category ?? "");
    setEditorTags(prompt.tags.join(", "));
    setEditingPrompt(prompt);
    setIsCreating(true);
  };

  const handleSave = async () => {
    if (!editorName.trim()) {
      setError("Prompt name is required");
      return;
    }
    if (!editorContent.trim()) {
      setError("Prompt content is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const tags = editorTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      if (editingPrompt) {
        const request: UpdatePromptRequest = {
          name: editorName.trim(),
          content: editorContent.trim(),
          description: editorDescription.trim() || undefined,
          category: editorCategory.trim() || undefined,
          tags,
        };
        await updatePrompt(editingPrompt.id, request);
      } else {
        const request: CreatePromptRequest = {
          name: editorName.trim(),
          content: editorContent.trim(),
          description: editorDescription.trim() || undefined,
          category: editorCategory.trim() || undefined,
          tags: tags.length > 0 ? tags : undefined,
        };
        await createPrompt(request);
      }
      setIsCreating(false);
      resetEditor();
      setEditingPrompt(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (prompt: Prompt) => {
    try {
      await deletePrompt(prompt.id);
    } catch {
      // Error is set in store
    }
  };

  const handleInsert = (prompt: Prompt) => {
    const variables = extractVariables(prompt.content);
    const hasCustomVars = variables.some((v) => !isAutoFillVariable(v));
    if (hasCustomVars) {
      setPendingInsert(prompt);
    } else {
      // Auto-fill and insert directly
      let resolved = prompt.content;
      if (currentFilePath) resolved = resolved.replace(/\{\{file\}\}/g, currentFilePath);
      if (currentSelection) resolved = resolved.replace(/\{\{selection\}\}/g, currentSelection);
      if (currentBranch) resolved = resolved.replace(/\{\{branch\}\}/g, currentBranch);
      if (currentWorkspace) resolved = resolved.replace(/\{\{workspace\}\}/g, currentWorkspace);
      onInsert(resolved, prompt.name);
      onClose();
    }
  };

  if (pendingInsert) {
    return (
      <VariableSubstitutionDialog
        prompt={pendingInsert}
        onClose={() => setPendingInsert(null)}
        onInsert={(resolved) => {
          onInsert(resolved, pendingInsert.name);
          setPendingInsert(null);
          onClose();
        }}
        currentFilePath={currentFilePath}
        currentSelection={currentSelection}
        currentBranch={currentBranch}
        currentWorkspace={currentWorkspace}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex w-[600px] max-h-[80vh] flex-col rounded-lg"
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
            <BookOpen size={14} style={{ color: "var(--text-secondary)" }} />
            <h2
              className="text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {isCreating
                ? editingPrompt
                  ? "Edit Prompt"
                  : "New Prompt"
                : "Prompt Library"}
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
                  Name *
                </label>
                <input
                  value={editorName}
                  onChange={(e) => setEditorName(e.target.value)}
                  placeholder="e.g. code-review"
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
                  Content *
                  <span className="ml-2 font-normal" style={{ color: "var(--text-muted)" }}>
                    Use {"{{variable}}"} for placeholders
                  </span>
                </label>
                <textarea
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  placeholder="Review {{file}} for security vulnerabilities and suggest fixes."
                  rows={5}
                  className="w-full rounded px-2 py-1.5 font-mono text-xs"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                    resize: "vertical",
                  }}
                />
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
              <div className="flex gap-3">
                <div className="flex-1">
                  <label
                    className="mb-1 block text-xs font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Category
                  </label>
                  <input
                    value={editorCategory}
                    onChange={(e) => setEditorCategory(e.target.value)}
                    placeholder="e.g. Code Review"
                    list="prompt-categories"
                    className="w-full rounded px-2 py-1.5 text-xs"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                    }}
                  />
                  <datalist id="prompt-categories">
                    {categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
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
                    placeholder="review, security (comma-separated)"
                    className="w-full rounded px-2 py-1.5 text-xs"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                    }}
                  />
                </div>
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
                  setEditingPrompt(null);
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
                disabled={saving || !editorName.trim() || !editorContent.trim()}
                className="rounded px-3 py-1.5 text-xs"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--bg-primary)",
                  opacity:
                    saving || !editorName.trim() || !editorContent.trim()
                      ? 0.5
                      : 1,
                }}
              >
                {saving
                  ? "Saving..."
                  : editingPrompt
                    ? "Update Prompt"
                    : "Create Prompt"}
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
                  placeholder="Search prompts..."
                  className="flex-1 bg-transparent text-xs outline-none"
                  style={{ color: "var(--text-primary)" }}
                  autoFocus
                />
              </div>

              {/* Category filter */}
              {categories.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className="rounded-full px-2 py-0.5 text-xs"
                    style={{
                      backgroundColor: !selectedCategory
                        ? "var(--accent)"
                        : "var(--bg-surface)",
                      color: !selectedCategory
                        ? "var(--bg-primary)"
                        : "var(--text-secondary)",
                    }}
                  >
                    All
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() =>
                        setSelectedCategory(cat === selectedCategory ? null : cat)
                      }
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{
                        backgroundColor:
                          cat === selectedCategory
                            ? "var(--accent)"
                            : "var(--bg-surface)",
                        color:
                          cat === selectedCategory
                            ? "var(--bg-primary)"
                            : "var(--text-secondary)",
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Prompt list */}
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {loading ? (
                <div
                  className="py-8 text-center text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  Loading...
                </div>
              ) : filteredPrompts.length === 0 ? (
                <div
                  className="py-8 text-center text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {prompts.length === 0
                    ? "No prompts saved yet. Create one to get started."
                    : "No prompts match your search."}
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredPrompts.map((prompt) => (
                    <div
                      key={prompt.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleInsert(prompt)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") handleInsert(prompt);
                      }}
                      className="group flex w-full cursor-pointer items-start gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-xs font-medium"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {prompt.name}
                          </span>
                          {prompt.category && (
                            <span
                              className="rounded-full px-1.5 py-0 text-[10px]"
                              style={{
                                backgroundColor: "var(--bg-surface)",
                                color: "var(--text-muted)",
                              }}
                            >
                              {prompt.category}
                            </span>
                          )}
                        </div>
                        {prompt.description && (
                          <div
                            className="mt-0.5 text-xs truncate"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {prompt.description}
                          </div>
                        )}
                        <div
                          className="mt-0.5 text-xs truncate font-mono"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {prompt.content}
                        </div>
                        {prompt.tags.length > 0 && (
                          <div className="mt-1 flex gap-1">
                            {prompt.tags.map((tag) => (
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
                            startEdit(prompt);
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
                            handleDelete(prompt);
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
                New Prompt
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
