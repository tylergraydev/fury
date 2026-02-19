import { useEffect, useState } from "react";
import { listRepoDirectories } from "../../lib/tauri";

interface SparseDirsEditorProps {
  repoId: string;
  selectedDirs: string[];
  onChange: (dirs: string[]) => void;
}

export function SparseDirsEditor({
  repoId,
  selectedDirs,
  onChange,
}: SparseDirsEditorProps) {
  const [dirs, setDirs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listRepoDirectories(repoId)
      .then((d) => setDirs(d))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [repoId]);

  const toggle = (dir: string) => {
    if (selectedDirs.includes(dir)) {
      onChange(selectedDirs.filter((d) => d !== dir));
    } else {
      onChange([...selectedDirs, dir]);
    }
  };

  if (loading) {
    return (
      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
        Loading directories...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-[10px]" style={{ color: "var(--error)" }}>
        {error}
      </div>
    );
  }

  if (dirs.length === 0) {
    return (
      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
        No directories found at repo root.
      </div>
    );
  }

  return (
    <div
      className="max-h-40 overflow-y-auto rounded p-2"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border)",
      }}
    >
      {dirs.map((dir) => (
        <label
          key={dir}
          className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-[var(--bg-hover)]"
          style={{ color: "var(--text-primary)" }}
        >
          <input
            type="checkbox"
            checked={selectedDirs.includes(dir)}
            onChange={() => toggle(dir)}
            className="accent-[var(--accent)]"
          />
          <span className="font-mono text-[11px]">{dir}/</span>
        </label>
      ))}
    </div>
  );
}
