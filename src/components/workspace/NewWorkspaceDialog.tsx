import { useEffect, useState } from "react";
import {
  Sparkles,
  X,
  GitFork,
  MessageSquare,
  ChevronDown,
  GitPullRequest,
  CircleDot,
  Search,
} from "lucide-react";
import {
  listBranches,
  listRepoPrs,
  listRepoIssues,
  type PrListItem,
  type IssueListItem,
} from "../../lib/tauri";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useAgentStore } from "../../stores/agentStore";

interface Props {
  repoId: string;
  repoName: string;
  onClose: () => void;
}

type WorkspaceMode = "branch" | "pr" | "issue";

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
];

export function NewWorkspaceDialog({ repoId, repoName, onClose }: Props) {
  const { createWs } = useWorkspaceStore();

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

  useEffect(() => {
    setLoadingBranches(true);
    listBranches(repoId)
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
  }, [repoId]);

  // Fetch PRs when switching to PR mode
  useEffect(() => {
    if (mode === "pr" && prs.length === 0 && !loadingPrs && !prError) {
      setLoadingPrs(true);
      setPrError(null);
      listRepoPrs(repoId)
        .then(setPrs)
        .catch((e) => {
          setPrs([]);
          setPrError(String(e));
        })
        .finally(() => setLoadingPrs(false));
    }
  }, [mode, repoId]);

  // Fetch issues when switching to issue mode
  useEffect(() => {
    if (mode === "issue" && issues.length === 0 && !loadingIssues && !issueError) {
      setLoadingIssues(true);
      setIssueError(null);
      listRepoIssues(repoId)
        .then(setIssues)
        .catch((e) => {
          setIssues([]);
          setIssueError(String(e));
        })
        .finally(() => setLoadingIssues(false));
    }
  }, [mode, repoId]);

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

  const handleCreate = async () => {
    if (mode === "pr") {
      if (!selectedPr || !worktreeName.trim()) return;
    } else {
      if (!worktreeName.trim() || !baseBranch.trim()) return;
    }
    setCreating(true);
    setError(null);
    try {
      const ws = await createWs(
        mode === "pr"
          ? {
              repoId,
              workspaceName: worktreeName.trim(),
              branchName: selectedPr!.headBranch,
              baseBranch: selectedPr!.baseBranch,
              autoCommit,
              fetchRemoteBranch: true,
            }
          : {
              repoId,
              workspaceName: worktreeName.trim(),
              branchName: worktreeName.trim(),
              baseBranch: baseBranch.trim(),
              autoCommit,
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

  const canCreate =
    mode === "pr"
      ? !!selectedPr && worktreeName.trim() && !creating
      : worktreeName.trim() && baseBranch.trim() && !creating;

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
      style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-[28rem] rounded-xl p-6"
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

        {/* Repository card */}
        <div
          className="mb-4 flex items-center gap-2 rounded-lg px-4 py-3"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border)",
          }}
        >
          <GitFork
            className="h-4 w-4"
            style={{ color: "var(--text-muted)" }}
          />
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Repository:
          </span>
          <span
            className="text-xs font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {repoName}
          </span>
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

        {/* Task description */}
        <div className="mb-4">
          <label
            className="mb-1.5 flex items-center gap-1.5 text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            What do you want to work on?
          </label>
          <textarea
            value={taskDescription}
            onChange={(e) => setTaskDescription(e.target.value)}
            placeholder="e.g., Add OAuth authentication, Refactor the API layer, Fix database migrations..."
            rows={3}
            className="w-full resize-none rounded-lg px-3 py-2.5 text-xs"
            style={inputStyle}
            autoFocus={mode === "branch"}
          />
          <p
            className="mt-1 text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            {mode === "pr" || mode === "issue"
              ? "Auto-filled from selection. Edit to customize the initial message."
              : "This helps the AI understand the context and will be used to name your worktree"}
          </p>
        </div>

        {/* Worktree Name */}
        <div className="mb-4">
          <label
            className="mb-1.5 block text-xs font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            Worktree Name
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={worktreeName}
              onChange={(e) => setWorktreeName(e.target.value)}
              placeholder="feature-auth"
              className="flex-1 rounded-lg px-3 py-2 text-xs"
              style={{
                ...inputStyle,
                ...(mode === "pr"
                  ? { opacity: 0.7, cursor: "default" }
                  : {}),
              }}
              readOnly={mode === "pr"}
            />
            {mode === "branch" && (
              <button
                onClick={() => {
                  /* v8 ignore next -- @preserve */
                  if (taskDescription.trim()) {
                    setWorktreeName(generateName(taskDescription));
                  }
                }}
                disabled={!taskDescription.trim()}
                className="rounded-lg px-4 py-2 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: taskDescription.trim()
                    ? "var(--accent)"
                    : "var(--bg-surface)",
                  color: taskDescription.trim()
                    ? "#1e1e2e"
                    : "var(--text-muted)",
                  border: "1px solid var(--border)",
                }}
              >
                Generate
              </button>
            )}
          </div>
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
              backgroundColor: "rgba(243, 139, 168, 0.1)",
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
