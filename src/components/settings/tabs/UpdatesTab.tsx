import { useEffect, useState } from "react";
import { UpdateDialog } from "../UpdateDialog";

export function UpdatesTab() {
  const [showDialog, setShowDialog] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    import("@tauri-apps/api/app")
      .then((mod) => mod.getVersion())
      .then((v) => setAppVersion(v))
      .catch(() => {});
  }, []);

  return (
    <div className="p-4 space-y-4">
      <div>
        <label
          className="mb-2 block text-xs font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          Application Updates
        </label>
        <div
          className="rounded p-3"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="mb-2 text-xs" style={{ color: "var(--text-primary)" }}>
            Current version: v{appVersion ?? "..."}
          </div>
          <button
            onClick={() => setShowDialog(true)}
            className="rounded px-3 py-1.5 text-xs"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--bg-primary)",
            }}
          >
            Check for Updates
          </button>
        </div>
      </div>
      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
        Updates are downloaded from GitHub Releases.
      </div>
      {showDialog && <UpdateDialog onClose={() => setShowDialog(false)} />}
    </div>
  );
}
