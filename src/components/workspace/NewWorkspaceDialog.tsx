import { useEffect, useState } from "react";
import {
  Sparkles,
  X,
  GitFork,
  ChevronDown,
  GitPullRequest,
  CircleDot,
  Search,
} from "lucide-react";
import {
  listBranches,
  listRepoPrs,
  listRepoIssues,
  searchLinearIssues,
  type PrListItem,
  type IssueListItem,
  type LinearIssue,
  type WorkspaceTemplate,
} from "../../lib/tauri";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useRepositoryStore } from "../../stores/repositoryStore";
import { formatGhError } from "../../lib/ghErrors";
import { useAgentStore } from "../../stores/agentStore";
import { useWorkspaceTemplateStore } from "../../stores/workspaceTemplateStore";

interface Props {
  repoId: string;
  repoName: string;
  onClose: () => void;
}

type WorkspaceMode = "branch" | "pr" | "issue" | "linear" | "template";

function generateName(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 50)
    .replace(/-$/, "");
}

const MODES: { key: WorkspaceMode; label: string }[] = [
  { key: "branch", label: "New Branch" },
  { key: "pr", label: "From PR" },
  { key: "issue", label: "From Issue" },
  { key: "linear", label: "From Linear" },
  { key: "template", label: "From Template" },
];

export function NewWorkspaceDialog({ repoId, repoName, onClose }: Props) {
  const { createWs } = useWorkspaceStore();
  const repositories = useRepositoryStore((s) => s.repositories);
  const [selectedRepoId, setSelectedRepoId] = useState(repoId);
  const selectedRepoName =
    repositories.find((r) => r.id === selectedRepoId)?.name ?? repoName;

  const [mode, setMode] = useState<WorkspaceMode>("branch");
  const [taskDescription, setTaskDescription] = useState("");
  const [worktreeName, setWorktreeName] = useState("");
  const [baseBranch, setBaseBranch] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [autoCommit, setAutoCommit] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // PR mode state
  const [prs, setPrs] = useState<PrListItem[]>([]);
  const [loadingPrs, setLoadingPrs] = useState(false);
  const [selectedPr, setSelectedPr] = useState<PrListItem | null>(null);
  const [prSearch, setPrSearch] = useState("");
  const [prError, setPrError] = useState<string | null>(null);

  // Issue mode state
  const [issues, setIssues] = useState<IssueListItem[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<IssueListItem | null>(
    null,
  );
  const [issueSearch, setIssueSearch] = useState("");
  const [issueError, setIssueError] = useState<string | null>(null);

  // Linear mode state
  const [linearIssues, setLinearIssues] = useState<LinearIssue[]>([]);
  const [linearSearch, setLinearSearch] = useState("");
  const [linearSearching, setLinearSearching] = useState(false);
  const [selectedLinearIssue, setSelectedLinearIssue] =
    useState<LinearIssue | null>(null);
  const [linearError, setLinearError] = useState<string | null>(null);

  // Template mode state
  const { templates, loadTemplates, loading: loadingTemplates } = useWorkspaceTemplateStore();
  const [selectedTemplate, setSelectedTemplate] = useState<WorkspaceTemplate | null>(null);

  // Reset mode-specific data when repo changes
  useEffect(() => {
    setPrs([]);
    setPrError(null);
    setSelectedPr(null);
    setIssues([]);
    setIssueError(null);
    setSelectedIssue(null);
  }, [selectedRepoId]);

  useEffect(() => {
    setLoadingBranches(true);
    listBranches(selectedRepoId)
      .then((b) => {
        setBranches(b);
        if (b.length > 0) {
          // Prefer "main" or "master", otherwise first branch
          const defaultBranch =
            b.find((br) => br === "main") ??
            b.find((br) => br === "master") ??
            b[0];
          setBaseBranch(defaultBranch);
        }
      })
      .catch((e) => {
        setBranches([]);
        setError(String(e));
      })
      .finally(() => setLoadingBranches(false));
  }, [selectedRepoId]);

  // Fetch PRs when switching to PR mode
  useEffect(() => {
    if (mode === "pr" && prs.length === 0 && !loadingPrs && !prError) {
      setLoadingPrs(true);
      setPrError(null);
      listRepoPrs(selectedRepoId)
        .then(setPrs)
        .catch((e) => {
          setPrs([]);
          const raw = String(e);
          setPrError(formatGhError(raw) ?? raw);
        })
        .finally(() => setLoadingPrs(false));
    }
  }, [mode, selectedRepoId]);

  // Fetch issues when switching to issue mode
  useEffect(() => {
    if (mode === "issue" && issues.length === 0 && !loadingIssues && !issueError) {
      setLoadingIssues(true);
      setIssueError(null);
      listRepoIssues(selectedRepoId)
        .then(setIssues)
        .catch((e) => {
          setIssues([]);
          const raw = String(e);
          setIssueError(formatGhError(raw) ?? raw);
        })
        .finally(() => setLoadingIssues(false));
    }
  }, [mode, selectedRepoId]);

  // Load templates when switching to template mode
  useEffect(() => {
    if (mode === "template" && templates.length === 0 && !loadingTemplates) {
      loadTemplates(selectedRepoId);
    }
  }, [mode, selectedRepoId]);

  // Debounced Linear search
  useEffect(() => {
    if (mode !== "linear" || !linearSearch.trim()) {
      if (mode === "linear" && !linearSearch.trim()) {
        setLinearIssues([]);
        setLinearError(null);
      }
      return;
    }
    const timeout = setTimeout(() => {
      setLinearSearching(true);
      setLinearError(null);
      searchLinearIssues(linearSearch)
        .then(setLinearIssues)
        .catch((e) => setLinearError(String(e)))
        .finally(() => setLinearSearching(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [mode, linearSearch]);

  const handleSelectPr = (pr: PrListItem) => {
    setSelectedPr(pr);
    setWorktreeName(pr.headBranch);
    setBaseBranch(pr.baseBranch);
    setTaskDescription(`PR #${pr.number}: ${pr.title}`);
  };

  const handleSelectIssue = (issue: IssueListItem) => {
    setSelectedIssue(issue);
    const shortTitle = issue.title.slice(0, 40);
    setWorktreeName(generateName(`issue-${issue.number}-${shortTitle}`));
    setTaskDescription(
      `Issue #${issue.number}: ${issue.title}${issue.body ? `\n\n${issue.body}` : ""}`,
    );
  };

  const handleSelectLinearIssue = (issue: LinearIssue) => {
    setSelectedLinearIssue(issue);
    const shortTitle = issue.title.slice(0, 30);
    setWorktreeName(generateName(`${issue.identifier}-${shortTitle}`));
    setTaskDescription(
      `${issue.identifier}: ${issue.title}${issue.description ? `\n\n${issue.description}` : ""}`,
    );
  };

  const handleSelectTemplate = (template: WorkspaceTemplate) => {
    setSelectedTemplate(template);
    setAutoCommit(template.autoCommit);
  };

  const handleCreate = async () => {
    if (mode === "pr") {
      if (!selectedPr || !worktreeName.trim()) return;
    } else if (mode === "template") {
      if (!selectedTemplate || !worktreeName.trim() || !baseBranch.trim()) return;
    } else {
      if (!worktreeName.trim() || !baseBranch.trim()) return;
    }
    setCreating(true);
    setError(null);
    try {
      const ws = await createWs(
        mode === "pr"
          ? {
              repoId: selectedRepoId,
              workspaceName: worktreeName.trim(),
              branchName: selectedPr!.headBranch,
              baseBranch: selectedPr!.baseBranch,
              autoCommit,
              fetchRemoteBranch: true,
            }
          : {
              repoId: selectedRepoId,
              workspaceName: worktreeName.trim(),
              branchName: worktreeName.trim(),
              baseBranch: baseBranch.trim(),
              autoCommit,
              sparseDirs: selectedTemplate?.sparseDirs ?? undefined,
            },
      );
      if (taskDescription.trim()) {
        useAgentStore
          .getState()
          .sendMessage(ws.id, taskDescription.trim())
          .catch(console.error);
      }
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  const inputStyle = {
    backgroundColor: "var(--bg-surface)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
    outline: "none",
  };

  const canCreate = (() => {
    if (creating) return false;
    if (!worktreeName.trim()) return false;
    if (mode === "pr") return !!selectedPr;
    if (mode === "linear") return !!selectedLinearIssue && !!baseBranch.trim();
    if (mode === "template") return !!selectedTemplate && !!baseBranch.trim();
    return !!baseBranch.trim();
  })();

  const filteredPrs = prs.filter(
    (pr) =>
      !prSearch ||
      pr.title.toLowerCase().includes(prSearch.toLowerCase()) ||
      String(pr.number).includes(prSearch),
  );

  const filteredIssues = issues.filter(
    (issue) =>
      !issueSearch ||
      issue.title.toLowerCase().includes(issueSearch.toLowerCase()) ||
      String(issue.number).includes(issueSearch),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "var(--overlay)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-[28rem] max-w-[90vw] rounded-xl p-6"
        role="dialog"
        aria-modal="true"
        aria-label="New workspace"
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: "var(--accent)", opacity: 0.9 }}
            >
              <Sparkles className="h-5 w-5" style={{ color: "#1e1e2e" }} />
            </div>
            <div>
              <h2
                className="text-base font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                New Chat Worktree
              </h2>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Create an isolated workspace for AI conversations
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 transition-colors hover:opacity-70"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Repository selector */}
        <div
          className="mb-4 flex items-center gap-2 rounded-lg px-4 py-3"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border)",
          }}
        >
          <GitFork
            className="h-4 w-4 flex-shrink-0"
            style={{ color: "var(--text-muted)" }}
          />
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Repository:
          </span>
          {repositories.length > 1 ? (
            <div className="relative flex-1">
              <select
                value={selectedRepoId}
                onChange={(e) => setSelectedRepoId(e.target.value)}
                className="w-full appearance-none bg-transparent text-xs font-semibold outline-none"
                style={{ color: "var(--text-primary)" }}
              >
                {repositories.map((repo) => (
                  <option key={repo.id} value={repo.id}>
                    {repo.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2"
                style={{ color: "var(--text-muted)" }}
              />
            </div>
          ) : (
            <span
              className="text-xs font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {selectedRepoName}
            </span>
          )}
        </div>

        {/* Mode tabs */}
        <div
          className="mb-4 flex gap-1"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className="px-3 py-2 text-xs font-medium transition-colors"
              style={{
                color:
                  mode === m.key ? "var(--accent)" : "var(--text-muted)",
                borderBottom:
                  mode === m.key
                    ? "2px solid var(--accent)"
                    : "2px solid transparent",
                marginBottom: "-1px",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* PR selector */}
        {mode === "pr" && (
          <div className="mb-4">
            <div className="relative mb-2">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                type="text"
                value={prSearch}
                onChange={(e) => setPrSearch(e.target.value)}
                placeholder="Search pull requests..."
                className="w-full rounded-lg py-2 pl-8 pr-3 text-xs"
                style={inputStyle}
                autoFocus
              />
            </div>
            <div
              className="max-h-40 overflow-y-auto rounded-lg"
              style={{ border: "1px solid var(--border)" }}
            >
              {loadingPrs ? (
                <div
                  className="px-3 py-4 text-center text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  Loading pull requests...
                </div>
              ) : prError ? (
                <div
                  className="px-3 py-4 text-center text-xs"
                  style={{ color: "var(--error)" }}
                >
                  Failed to load pull requests: {prError}
                </div>
              ) : filteredPrs.length === 0 ? (
                <div
                  className="px-3 py-4 text-center text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {prs.length === 0
                    ? "No open pull requests"
                    : "No matching pull requests"}
                </div>
              ) : (
                filteredPrs.map((pr) => (
                  <button
                    key={pr.number}
                    onClick={() => handleSelectPr(pr)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors"
                    style={{
                      backgroundColor:
                        selectedPr?.number === pr.number
                          ? "var(--bg-hover)"
                          : "transparent",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <GitPullRequest
                      className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      style={{ color: "var(--accent-green)" }}
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate text-xs"
                        style={{ color: "var(--text-primary)" }}
                      >
                        <span style={{ color: "var(--text-muted)" }}>
                          #{pr.number}
                        </span>{" "}
                        {pr.title}
                      </div>
                      <div
                        className="text-[11px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {pr.headBranch} &larr; {pr.baseBranch}
                        {pr.author && ` by ${pr.author}`}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Issue selector */}
        {mode === "issue" && (
          <div className="mb-4">
            <div className="relative mb-2">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                type="text"
                value={issueSearch}
                onChange={(e) => setIssueSearch(e.target.value)}
                placeholder="Search issues..."
                className="w-full rounded-lg py-2 pl-8 pr-3 text-xs"
                style={inputStyle}
                autoFocus
              />
            </div>
            <div
              className="max-h-40 overflow-y-auto rounded-lg"
              style={{ border: "1px solid var(--border)" }}
            >
              {loadingIssues ? (
                <div
                  className="px-3 py-4 text-center text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  Loading issues...
                </div>
              ) : issueError ? (
                <div
                  className="px-3 py-4 text-center text-xs"
                  style={{ color: "var(--error)" }}
                >
                  Failed to load issues: {issueError}
                </div>
              ) : filteredIssues.length === 0 ? (
                <div
                  className="px-3 py-4 text-center text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {issues.length === 0
                    ? "No open issues"
                    : "No matching issues"}
                </div>
              ) : (
                filteredIssues.map((issue) => (
                  <button
                    key={issue.number}
                    onClick={() => handleSelectIssue(issue)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors"
                    style={{
                      backgroundColor:
                        selectedIssue?.number === issue.number
                          ? "var(--bg-hover)"
                          : "transparent",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <CircleDot
                      className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      style={{ color: "var(--accent-green)" }}
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate text-xs"
                        style={{ color: "var(--text-primary)" }}
                      >
                        <span style={{ color: "var(--text-muted)" }}>
                          #{issue.number}
                        </span>{" "}
                        {issue.title}
                      </div>
                      {issue.labels.length > 0 && (
                        <div className="mt-0.5 flex gap-1">
                          {issue.labels.slice(0, 3).map((label) => (
                            <span
                              key={label}
                              className="rounded px-1.5 py-0.5 text-[10px]"
                              style={{
                                backgroundColor: "var(--bg-surface)",
                                color: "var(--text-muted)",
                              }}
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Linear issue selector */}
        {mode === "linear" && (
          <div className="mb-4">
            <div className="relative mb-2">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                type="text"
                value={linearSearch}
                onChange={(e) => setLinearSearch(e.target.value)}
                placeholder="Search Linear issues..."
                className="w-full rounded-lg py-2 pl-8 pr-3 text-xs"
                style={inputStyle}
                autoFocus
              />
            </div>
            <div
              className="max-h-40 overflow-y-auto rounded-lg"
              style={{
                border: linearSearch
                  ? "1px solid var(--border)"
                  : "none",
              }}
            >
              {linearSearching ? (
                <div
                  className="px-3 py-4 text-center text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  Searching...
                </div>
              ) : linearError ? (
                <div
                  className="px-3 py-4 text-center text-xs"
                  style={{ color: "var(--error)" }}
                >
                  {linearError}
                </div>
              ) : !linearSearch.trim() ? (
                <div
                  className="px-3 py-4 text-center text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  Type to search Linear issues
                </div>
              ) : linearIssues.length === 0 ? (
                <div
                  className="px-3 py-4 text-center text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  No matching issues
                </div>
              ) : (
                linearIssues.map((issue) => (
                  <button
                    key={issue.id}
                    onClick={() => handleSelectLinearIssue(issue)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors"
                    style={{
                      backgroundColor:
                        selectedLinearIssue?.id === issue.id
                          ? "var(--bg-hover)"
                          : "transparent",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <CircleDot
                      className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      style={{ color: "var(--accent)" }}
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate text-xs"
                        style={{ color: "var(--text-primary)" }}
                      >
                        <span style={{ color: "var(--text-muted)" }}>
                          {issue.identifier}
                        </span>{" "}
                        {issue.title}
                      </div>
                      <div
                        className="text-[11px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {[issue.teamName, issue.stateName]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Template selector */}
        {mode === "template" && (
          <div className="mb-4">
            <div
              className="max-h-40 overflow-y-auto rounded-lg"
              style={{ border: "1px solid var(--border)" }}
            >
              {loadingTemplates ? (
                <div
                  className="px-3 py-4 text-center text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  Loading templates...
                </div>
              ) : templates.length === 0 ? (
                <div
                  className="px-3 py-4 text-center text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  No templates saved yet. Create one from Repo Settings.
                </div>
              ) : (
                templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleSelectTemplate(t)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors"
                    style={{
                      backgroundColor:
                        selectedTemplate?.id === t.id
                          ? "var(--bg-hover)"
                          : "transparent",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <Sparkles
                      className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      style={{ color: "var(--accent)" }}
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate text-xs font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {t.name}
                      </div>
                      {t.description && (
                        <div
                          className="truncate text-[11px]"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {t.description}
                        </div>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Worktree Name */}
        <div className="mb-4">
          <label
            className="mb-1.5 block text-xs font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            Worktree Name
          </label>
          <input
            type="text"
            value={worktreeName}
            onChange={(e) => setWorktreeName(e.target.value)}
            placeholder="feature-auth"
            className="w-full rounded-lg px-3 py-2 text-xs"
            style={{
              ...inputStyle,
              ...(mode === "pr"
                ? { opacity: 0.7, cursor: "default" }
                : {}),
            }}
            readOnly={mode === "pr"}
            autoFocus={mode === "branch"}
          />
        </div>

        {/* Base Branch */}
        <div className="mb-4">
          <label
            className="mb-1.5 block text-xs font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            Base Branch
          </label>
          <div className="relative">
            {mode === "pr" && selectedPr ? (
              <input
                type="text"
                value={selectedPr.baseBranch}
                readOnly
                className="w-full rounded-lg px-3 py-2.5 text-xs"
                style={{ ...inputStyle, opacity: 0.7, cursor: "default" }}
              />
            ) : (
              <select
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                className="w-full appearance-none rounded-lg px-3 py-2.5 text-xs"
                style={inputStyle}
                disabled={loadingBranches || branches.length === 0}
              >
                {loadingBranches ? (
                  <option>Loading...</option>
                ) : branches.length === 0 ? (
                  <option>No branches found</option>
                ) : (
                  branches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))
                )}
              </select>
            )}
            {mode !== "pr" && (
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
                style={{ color: "var(--text-muted)" }}
              />
            )}
          </div>
          <p
            className="mt-1 text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            {mode === "pr"
              ? "Set from the pull request's base branch"
              : "New worktree will be created from this branch"}
          </p>
        </div>

        {/* Auto-commit card */}
        <div
          className="mb-5 flex items-center justify-between rounded-lg px-4 py-3"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div>
            <div
              className="text-xs font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Auto-commit changes
            </div>
            <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Automatically commit AI changes with descriptive messages
            </div>
          </div>
          <input
            type="checkbox"
            checked={autoCommit}
            onChange={(e) => setAutoCommit(e.target.checked)}
            className="h-4 w-4 rounded"
            style={{ accentColor: "var(--accent)" }}
          />
        </div>

        {/* Error display */}
        {error && (
          <div
            className="mb-4 rounded-lg p-3 text-xs"
            style={{
              backgroundColor: "color-mix(in srgb, var(--error) 10%, transparent)",
              color: "var(--error)",
            }}
          >
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs"
            style={{
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium transition-colors"
            style={{
              backgroundColor: canCreate ? "var(--accent)" : "var(--bg-hover)",
              color: canCreate ? "#1e1e2e" : "var(--text-muted)",
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {creating ? "Creating..." : "Create & Start Chat"}
          </button>
        </div>
      </div>
    </div>
  );
}
