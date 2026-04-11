import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GitBranch, FilePlus, FolderPlus, File, Folder, FileText, Pin, Copy, ClipboardCopy, FolderOpen, Bookmark } from "lucide-react";
import { useFileTreeStore } from "../../stores/fileTreeStore";
import { useUIStore } from "../../stores/uiStore";
import { useRepositoryStore } from "../../stores/repositoryStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useToastStore } from "../../stores/toastStore";
import { BookmarksPanel } from "./BookmarksPanel";
import {
  initWorkspaceGit,
  createWorkspaceFile,
  createRepoFile,
  createWorkspaceDirectory,
  createRepoDirectory,
} from "../../lib/tauri";
import { getFileIcon, FolderIcon, FolderOpenIcon } from "../icons/FileIcons";
import type { SidebarContext } from "../../App";

const EMPTY_FILES: string[] = [];
const EMPTY_DIRS = new Set<string>();

interface Props {
  context: SidebarContext;
  onFileClick?: (filePath: string) => void;
  onFileDoubleClick?: (filePath: string) => void;
  onRunTestFile?: (filePath: string) => void;
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  const map = new Map<string, TreeNode>();

  for (const filePath of paths) {
    const parts = filePath.split("/");
    let currentChildren = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const currentPath = parts.slice(0, i + 1).join("/");
      const isLast = i === parts.length - 1;

      let existing = map.get(currentPath);
      if (!existing) {
        existing = {
          name: part,
          path: currentPath,
          isDir: !isLast,
          children: [],
        };
        map.set(currentPath, existing);
        currentChildren.push(existing);
      }
      currentChildren = existing.children;
    }
  }

  // Sort: directories first, then alphabetical
  function sortNodes(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      /* v8 ignore next -- @preserve */
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children.length > 0) sortNodes(node.children);
    }
  }
  sortNodes(root);
  return root;
}

function InlineNewInput({
  depth,
  type,
  context,
  parentPath,
  onComplete,
  onCancel,
  onFileClick,
}: {
  depth: number;
  type: "file" | "directory";
  context: SidebarContext;
  parentPath: string;
  onComplete: () => void;
  onCancel: () => void;
  onFileClick?: (filePath: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    // Auto-focus on mount
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(
    async (name: string) => {
      if (submittedRef.current) return;
      const trimmed = name.trim();
      if (!trimmed || trimmed.includes("/") || trimmed.includes("\\")) {
        onCancel();
        return;
      }
      submittedRef.current = true;
      const relativePath = parentPath ? `${parentPath}/${trimmed}` : trimmed;
      try {
        if (type === "file") {
          if (context.type === "workspace") {
            await createWorkspaceFile(context.id, relativePath);
          } else {
            await createRepoFile(context.id, relativePath);
          }
        } else {
          if (context.type === "workspace") {
            await createWorkspaceDirectory(context.id, relativePath);
          } else {
            await createRepoDirectory(context.id, relativePath);
          }
        }
        // Refresh file tree
        const store = useFileTreeStore.getState();
        if (context.type === "workspace") {
          store.loadFiles(context.id);
        } else {
          store.loadRepoFiles(context.id);
        }
        // Open the file if it was a file creation
        if (type === "file" && onFileClick) {
          onFileClick(relativePath);
        }
        onComplete();
      } catch (err) {
        console.error("Failed to create:", err);
        useToastStore.getState().addToast(
          `Failed to create ${type}: ${err instanceof Error ? err.message : String(err)}`,
          "error",
        );
        submittedRef.current = false;
      }
    },
    [parentPath, type, context, onComplete, onCancel, onFileClick],
  );

  return (
    <div
      className="flex w-full items-center gap-1 py-0.5"
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <span className="flex w-4 flex-shrink-0 items-center justify-center">
        {type === "file" ? (
          <File className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
        ) : (
          <Folder className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
        )}
      </span>
      <input
        ref={inputRef}
        data-testid="inline-new-input"
        className="min-w-0 flex-1 rounded-sm px-1 text-sm outline-none"
        style={{
          backgroundColor: "var(--bg-surface)",
          color: "var(--text-primary)",
          border: "1px solid var(--accent)",
          caretColor: "var(--accent)",
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSubmit((e.target as HTMLInputElement).value);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={(e) => {
          if (!submittedRef.current) {
            // If name is non-empty, try to submit; otherwise cancel
            const val = e.target.value.trim();
            if (val) {
              handleSubmit(val);
            } else {
              onCancel();
            }
          }
        }}
      />
    </div>
  );
}

const TreeItem = memo(function TreeItem({
  node,
  depth,
  expanded,
  onToggle,
  onFileClick,
  onFileDoubleClick,
  onContextMenu,
  pendingNewHere,
  pendingNewType,
  onSubmitNew,
  onCancelNew,
  context,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onFileClick?: (path: string) => void;
  onFileDoubleClick?: (path: string) => void;
  onContextMenu?: (path: string, isDir: boolean, e: React.MouseEvent) => void;
  pendingNewHere: boolean;
  pendingNewType?: "file" | "directory";
  onSubmitNew?: () => void;
  onCancelNew?: () => void;
  context?: SidebarContext;
}) {
  const isExpanded = expanded.has(node.path);

  return (
    <>
      <button
        onClick={() => {
          if (node.isDir) {
            onToggle(node.path);
          } else if (onFileClick) {
            onFileClick(node.path);
          }
        }}
        onDoubleClick={() => {
          if (!node.isDir && onFileDoubleClick) {
            onFileDoubleClick(node.path);
          }
        }}
        onContextMenu={(e) => {
          if (onContextMenu) {
            e.preventDefault();
            onContextMenu(node.path, node.isDir, e);
          }
        }}
        className="flex w-full items-center gap-1 py-0.5 text-left text-sm hover:bg-[var(--bg-hover)]"
        style={{
          paddingLeft: `${depth * 12 + 8}px`,
          color: node.isDir ? "var(--text-secondary)" : "var(--text-primary)",
        }}
      >
        <span className="flex w-4 flex-shrink-0 items-center justify-center">
          {node.isDir ? (
            isExpanded ? <FolderOpenIcon /> : <FolderIcon />
          ) : (
            (() => { const Icon = getFileIcon(node.name); return <Icon />; })()
          )}
        </span>
        <span className="truncate">{node.name}</span>
      </button>
      {node.isDir && isExpanded && (
        <>
          {pendingNewHere && pendingNewType && onSubmitNew && onCancelNew && context && (
            <InlineNewInput
              depth={depth + 1}
              type={pendingNewType}
              context={context}
              parentPath={node.path}
              onComplete={onSubmitNew}
              onCancel={onCancelNew}
              onFileClick={onFileClick}
            />
          )}
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onFileClick={onFileClick}
              onFileDoubleClick={onFileDoubleClick}
              onContextMenu={onContextMenu}
              pendingNewHere={false}
              pendingNewType={undefined}
              context={context}
            />
          ))}
        </>
      )}
    </>
  );
}, /* v8 ignore start -- React.memo comparator is not reliably testable */ (prev, next) => {
  // Skip re-render if this node's state hasn't changed
  if (prev.node !== next.node || prev.depth !== next.depth) return false;
  if (prev.onToggle !== next.onToggle) return false;
  if (prev.onFileClick !== next.onFileClick) return false;
  if (prev.onFileDoubleClick !== next.onFileDoubleClick) return false;
  if (prev.onContextMenu !== next.onContextMenu) return false;
  if (prev.pendingNewHere !== next.pendingNewHere) return false;
  if (prev.pendingNewType !== next.pendingNewType) return false;
  // For files, only the above props matter
  if (!prev.node.isDir) return true;
  // For directories, re-render if our own expansion state changed
  const wasExpanded = prev.expanded.has(prev.node.path);
  const isExpanded = next.expanded.has(next.node.path);
  if (wasExpanded !== isExpanded) return false;
  // If collapsed, children aren't rendered so expansion changes below don't matter
  if (!isExpanded) return true;
  // If expanded, we must re-render because a child's expansion state may have changed
  return prev.expanded === next.expanded;
} /* v8 ignore stop */);

function getRepoPath(context: SidebarContext): string | null {
  if (context.type === "repo") {
    return useRepositoryStore.getState().repositories.find((r) => r.id === context.id)?.path ?? null;
  }
  const ws = useWorkspaceStore.getState().workspaces.find((w) => w.id === context.id);
  if (!ws) return null;
  return useRepositoryStore.getState().repositories.find((r) => r.id === ws.repoId)?.path ?? null;
}

function ContextMenuItem({
  icon: Icon,
  label,
  onClick,
  iconColor,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  onClick: () => void;
  iconColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--bg-hover)]"
      style={{ color: "var(--text-primary)" }}
    >
      <Icon className="h-3 w-3" style={{ color: iconColor ?? "var(--text-muted)" }} />
      {label}
    </button>
  );
}

function ContextMenuSeparator() {
  return <div className="my-1" style={{ borderTop: "1px solid var(--border)" }} />;
}

function FileTreeContextMenu({
  x,
  y,
  filePath,
  isDir,
  context,
  onNewFile,
  onNewFolder,
  onOpenFile,
  onOpenFilePinned,
  onClose,
}: {
  x: number;
  y: number;
  filePath: string;
  isDir: boolean;
  context: SidebarContext;
  onNewFile: () => void;
  onNewFolder: () => void;
  onOpenFile?: () => void;
  onOpenFilePinned?: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const repoPath = getRepoPath(context);
  const absolutePath = repoPath ? `${repoPath}/${filePath}` : null;

  const handleCopyPath = () => {
    if (absolutePath) {
      navigator.clipboard.writeText(absolutePath).catch((e) => {
        console.error("Failed to copy path:", e);
      });
    }
    onClose();
  };

  const handleCopyRelativePath = () => {
    navigator.clipboard.writeText(filePath).catch((e) => {
      console.error("Failed to copy relative path:", e);
    });
    onClose();
  };

  const handleRevealInFinder = () => {
    if (!absolutePath) { onClose(); return; }
    const dir = isDir ? absolutePath : absolutePath.substring(0, absolutePath.lastIndexOf("/"));
    import("@tauri-apps/plugin-shell")
      .then(({ open }) => open(dir))
      .catch((e) => console.error("Failed to reveal in Finder:", e));
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] rounded-md py-1 shadow-lg"
      style={{
        left: x,
        top: y,
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Create actions */}
      <ContextMenuItem
        icon={FilePlus}
        label="New File..."
        iconColor="var(--accent)"
        onClick={() => { onNewFile(); onClose(); }}
      />
      <ContextMenuItem
        icon={FolderPlus}
        label="New Folder..."
        iconColor="var(--accent)"
        onClick={() => { onNewFolder(); onClose(); }}
      />

      {/* File open actions — files only */}
      {!isDir && (onOpenFile || onOpenFilePinned) && <ContextMenuSeparator />}
      {!isDir && onOpenFile && (
        <ContextMenuItem icon={FileText} label="Open File" onClick={() => { onOpenFile(); onClose(); }} />
      )}
      {!isDir && onOpenFilePinned && (
        <ContextMenuItem icon={Pin} label="Open in Editor" onClick={() => { onOpenFilePinned(); onClose(); }} />
      )}

      {/* Path actions — files and directories */}
      <ContextMenuSeparator />
      {absolutePath && (
        <ContextMenuItem icon={Copy} label="Copy Path" onClick={handleCopyPath} />
      )}
      <ContextMenuItem icon={ClipboardCopy} label="Copy Relative Path" onClick={handleCopyRelativePath} />
      {absolutePath && (
        <ContextMenuItem icon={FolderOpen} label="Reveal in Finder" onClick={handleRevealInFinder} />
      )}
    </div>
  );
}

export function FileTreePanel({ context, onFileClick, onFileDoubleClick, onRunTestFile: _onRunTestFile }: Props) {
  const contextId = context.id;
  const files = useFileTreeStore((s) => s.files[contextId] ?? EMPTY_FILES);
  const expandedDirs = useFileTreeStore(
    (s) => s.expandedDirs[contextId] ?? EMPTY_DIRS,
  );
  const loading = useFileTreeStore((s) => s.loading[contextId] ?? false);
  const error = useFileTreeStore((s) => s.error[contextId] ?? null);
  const showBookmarks = useUIStore((s) => s.showBookmarksInFiles);
  const toggleBookmarks = useUIStore((s) => s.toggleBookmarksInFiles);
  const [initing, setIniting] = useState(false);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    path: string;
    isDir: boolean;
  } | null>(null);

  const [pendingNew, setPendingNew] = useState<{
    parentPath: string; // "" for root
    type: "file" | "directory";
  } | null>(null);

  // Double-rAF: defer file tree loading to Tier 3 so chat data loads first.
  useEffect(() => {
    let inner: number;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        const store = useFileTreeStore.getState();
        if (store.files[contextId]) return;
        if (context.type === "workspace") {
          store.loadFiles(contextId);
        } else {
          store.loadRepoFiles(contextId);
        }
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [context.type, contextId]);

  const handleToggle = useCallback(
    (dir: string) => useFileTreeStore.getState().toggleDir(contextId, dir),
    [contextId],
  );

  const handleContextMenu = useCallback(
    (path: string, isDir: boolean, e: React.MouseEvent) => {
      setContextMenu({ x: e.clientX, y: e.clientY, path, isDir });
    },
    [],
  );

  const expandAncestors = useCallback(
    (dirPath: string) => {
      const store = useFileTreeStore.getState();
      // Expand all ancestors
      const parts = dirPath.split("/");
      for (let i = 1; i <= parts.length; i++) {
        const ancestor = parts.slice(0, i).join("/");
        store.expandDir(contextId, ancestor);
      }
    },
    [contextId],
  );

  const handleNewFile = useCallback(() => {
    if (!contextMenu) return;
    const parentPath = contextMenu.isDir
      ? contextMenu.path
      : (contextMenu.path.includes("/")
        ? contextMenu.path.substring(0, contextMenu.path.lastIndexOf("/"))
        : "");
    if (parentPath) {
      expandAncestors(parentPath);
    }
    setPendingNew({ parentPath, type: "file" });
  }, [contextMenu, expandAncestors]);

  const handleNewFolder = useCallback(() => {
    if (!contextMenu) return;
    const parentPath = contextMenu.isDir
      ? contextMenu.path
      : (contextMenu.path.includes("/")
        ? contextMenu.path.substring(0, contextMenu.path.lastIndexOf("/"))
        : "");
    if (parentPath) {
      expandAncestors(parentPath);
    }
    setPendingNew({ parentPath, type: "directory" });
  }, [contextMenu, expandAncestors]);

  const tree = useMemo(() => buildTree(files), [files]);

  if (loading && files.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center text-sm"
        style={{ color: "var(--text-muted)" }}
      >
        Loading files...
      </div>
    );
  }

  if (error) {
    if (error.includes("NOT_A_GIT_REPO") && context.type === "workspace") {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
          <GitBranch className="h-8 w-8" style={{ color: "var(--text-muted)" }} />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            No git repository detected.
          </p>
          <button
            disabled={initing}
            onClick={async () => {
              setIniting(true);
              try {
                await initWorkspaceGit(contextId);
                useFileTreeStore.getState().loadFiles(contextId);
              } catch (err) {
                console.error("Failed to initialize git:", err);
                useToastStore.getState().addToast(
                  `Failed to initialize git repository: ${err instanceof Error ? err.message : String(err)}`,
                  "error",
                );
                setIniting(false);
              }
            }}
            className="rounded-md px-4 py-2 text-sm font-medium"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--text-on-accent)",
              opacity: initing ? 0.6 : 1,
            }}
          >
            {initing ? "Initializing..." : "Initialize Git Repository"}
          </button>
        </div>
      );
    }

    return (
      <div className="p-3 text-sm" style={{ color: "var(--error)" }}>
        {error}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header toolbar */}
      <div
        className="flex shrink-0 items-center justify-between px-2 py-1"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {/* Left: Bookmark toggle */}
        <button
          title={showBookmarks ? "Show Files" : "Show Bookmarks"}
          aria-label={showBookmarks ? "Show Files" : "Show Bookmarks"}
          onClick={toggleBookmarks}
          className="rounded p-1 hover:bg-[var(--bg-hover)]"
          style={{ color: showBookmarks ? "var(--accent)" : "var(--text-muted)" }}
        >
          <Bookmark className="h-3.5 w-3.5" />
        </button>
        {/* Right: New File / New Folder (only when showing files) */}
        <div className="flex items-center gap-0.5">
          {!showBookmarks && (
            <>
              <button
                title="New File"
                aria-label="New File"
                onClick={() => setPendingNew({ parentPath: "", type: "file" })}
                className="rounded p-1 hover:bg-[var(--bg-hover)]"
                style={{ color: "var(--text-muted)" }}
              >
                <FilePlus className="h-3.5 w-3.5" />
              </button>
              <button
                title="New Folder"
                aria-label="New Folder"
                onClick={() => setPendingNew({ parentPath: "", type: "directory" })}
                className="rounded p-1 hover:bg-[var(--bg-hover)]"
                style={{ color: "var(--text-muted)" }}
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {showBookmarks ? (
        <BookmarksPanel context={context} />
      ) : (
      <div className="flex-1 overflow-y-auto py-1">
        {pendingNew && pendingNew.parentPath === "" && (
          <InlineNewInput
            depth={0}
            type={pendingNew.type}
            context={context}
            parentPath=""
            onComplete={() => setPendingNew(null)}
            onCancel={() => setPendingNew(null)}
            onFileClick={onFileClick}
          />
        )}
        {tree.map((node) => (
          <TreeItem
            key={node.path}
            node={node}
            depth={0}
            expanded={expandedDirs}
            onToggle={handleToggle}
            onFileClick={onFileClick}
            onFileDoubleClick={onFileDoubleClick}
            onContextMenu={handleContextMenu}
            pendingNewHere={pendingNew?.parentPath === node.path}
            pendingNewType={pendingNew?.type}
            onSubmitNew={() => setPendingNew(null)}
            onCancelNew={() => setPendingNew(null)}
            context={context}
          />
        ))}

        {contextMenu && (
          <FileTreeContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            filePath={contextMenu.path}
            isDir={contextMenu.isDir}
            context={context}
            onNewFile={handleNewFile}
            onNewFolder={handleNewFolder}
            onOpenFile={!contextMenu.isDir && onFileClick ? () => onFileClick(contextMenu.path) : undefined}
            onOpenFilePinned={!contextMenu.isDir && onFileDoubleClick ? () => onFileDoubleClick(contextMenu.path) : undefined}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
      )}
    </div>
  );
}
