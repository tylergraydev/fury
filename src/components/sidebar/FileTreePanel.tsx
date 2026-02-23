import { useCallback, useEffect } from "react";
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

function TreeItem({
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
}

export function FileTreePanel({ context, onFileClick, onFileDoubleClick }: Props) {
  const contextId = context.id;
  const files = useFileTreeStore((s) => s.files[contextId] ?? EMPTY_FILES);
  const expandedDirs = useFileTreeStore(
    (s) => s.expandedDirs[contextId] ?? EMPTY_DIRS,
  );
  const loading = useFileTreeStore((s) => s.loading[contextId] ?? false);
  const error = useFileTreeStore((s) => s.error[contextId] ?? null);

  useEffect(() => {
    const store = useFileTreeStore.getState();
    if (context.type === "workspace") {
      store.loadFiles(contextId);
    } else {
      store.loadRepoFiles(contextId);
    }
  }, [context.type, contextId]);

  const handleToggle = useCallback(
    (dir: string) => useFileTreeStore.getState().toggleDir(contextId, dir),
    [contextId],
  );

  if (loading && files.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        Loading files...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 text-xs" style={{ color: "var(--error)" }}>
        {error}
      </div>
    );
  }

  const tree = buildTree(files);

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
