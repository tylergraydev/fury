import { useCallback, useEffect } from "react";
import { useFileTreeStore } from "../../stores/fileTreeStore";

const EMPTY_FILES: string[] = [];
const EMPTY_DIRS = new Set<string>();

interface Props {
  workspaceId: string;
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

function fileIcon(name: string): string {
  if (name.endsWith(".ts") || name.endsWith(".tsx")) return "\u{1F7E6}";
  if (name.endsWith(".rs")) return "\u{1F7E7}";
  if (name.endsWith(".json")) return "\u{1F7E1}";
  if (name.endsWith(".css")) return "\u{1F7EA}";
  if (name.endsWith(".html")) return "\u{1F7E2}";
  if (name.endsWith(".toml")) return "\u{2699}";
  if (name.startsWith(".")) return "\u{26AB}";
  return "\u{1F4C4}";
}

function TreeItem({
  node,
  depth,
  expanded,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
}) {
  const isExpanded = expanded.has(node.path);

  return (
    <>
      <button
        onClick={() => node.isDir && onToggle(node.path)}
        className="flex w-full items-center gap-1 py-0.5 text-left text-xs hover:bg-[var(--bg-hover)]"
        style={{
          paddingLeft: `${depth * 12 + 8}px`,
          color: node.isDir ? "var(--text-secondary)" : "var(--text-primary)",
        }}
      >
        {node.isDir ? (
          <span className="w-3 text-center text-[10px]" style={{ color: "var(--text-muted)" }}>
            {isExpanded ? "\u25BC" : "\u25B6"}
          </span>
        ) : (
          <span className="w-3 text-center text-[8px]">
            {fileIcon(node.name)}
          </span>
        )}
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
          />
        ))}
    </>
  );
}

export function FileTreePanel({ workspaceId }: Props) {
  const files = useFileTreeStore((s) => s.files[workspaceId] ?? EMPTY_FILES);
  const expandedDirs = useFileTreeStore(
    (s) => s.expandedDirs[workspaceId] ?? EMPTY_DIRS,
  );
  const loading = useFileTreeStore((s) => s.loading[workspaceId] ?? false);
  const error = useFileTreeStore((s) => s.error[workspaceId] ?? null);

  useEffect(() => {
    useFileTreeStore.getState().loadFiles(workspaceId);
  }, [workspaceId]);

  const handleToggle = useCallback(
    (dir: string) => useFileTreeStore.getState().toggleDir(workspaceId, dir),
    [workspaceId],
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
        />
      ))}
    </div>
  );
}
