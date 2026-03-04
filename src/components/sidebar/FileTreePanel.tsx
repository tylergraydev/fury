import { memo, useCallback, useEffect, useMemo } from "react";
import { useFileTreeStore } from "../../stores/fileTreeStore";
import { getFileIcon, FolderIcon, FolderOpenIcon } from "../icons/FileIcons";
import type { SidebarContext } from "../../App";

const EMPTY_FILES: string[] = [];
const EMPTY_DIRS = new Set<string>();

interface Props {
  context: SidebarContext;
  onFileClick?: (filePath: string) => void;
  onFileDoubleClick?: (filePath: string) => void;
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

const TreeItem = memo(function TreeItem({
  node,
  depth,
  expanded,
  onToggle,
  onFileClick,
  onFileDoubleClick,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onFileClick?: (path: string) => void;
  onFileDoubleClick?: (path: string) => void;
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
      {node.isDir && isExpanded &&
        node.children.map((child) => (
          <TreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            onToggle={onToggle}
            onFileClick={onFileClick}
            onFileDoubleClick={onFileDoubleClick}
          />
        ))}
    </>
  );
}, (prev, next) => {
  // Skip re-render if this node's state hasn't changed
  if (prev.node !== next.node || prev.depth !== next.depth) return false;
  if (prev.onToggle !== next.onToggle) return false;
  if (prev.onFileClick !== next.onFileClick) return false;
  if (prev.onFileDoubleClick !== next.onFileDoubleClick) return false;
  // For files, only the above props matter
  if (!prev.node.isDir) return true;
  // For directories, re-render if our own expansion state changed
  const wasExpanded = prev.expanded.has(prev.node.path);
  const isExpanded = next.expanded.has(next.node.path);
  if (wasExpanded !== isExpanded) return false;
  // If collapsed, children aren't rendered so expansion changes below don't matter
  /* v8 ignore start -- React.memo comparator is not reliably testable */
  if (!isExpanded) return true;
  // If expanded, we must re-render because a child's expansion state may have changed
  return prev.expanded === next.expanded;
  /* v8 ignore stop */
});

export function FileTreePanel({ context, onFileClick, onFileDoubleClick }: Props) {
  const contextId = context.id;
  const files = useFileTreeStore((s) => s.files[contextId] ?? EMPTY_FILES);
  const expandedDirs = useFileTreeStore(
    (s) => s.expandedDirs[contextId] ?? EMPTY_DIRS,
  );
  const loading = useFileTreeStore((s) => s.loading[contextId] ?? false);
  const error = useFileTreeStore((s) => s.error[contextId] ?? null);

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
    return (
      <div className="p-3 text-sm" style={{ color: "var(--error)" }}>
        {error}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto py-1">
      {tree.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          depth={0}
          expanded={expandedDirs}
          onToggle={handleToggle}
          onFileClick={onFileClick}
          onFileDoubleClick={onFileDoubleClick}
        />
      ))}
    </div>
  );
}
