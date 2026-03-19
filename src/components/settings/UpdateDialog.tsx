import { useEffect, useState } from "react";
import { X, Download, RotateCcw, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { relaunch } from "@tauri-apps/plugin-process";
import { checkForAppUpdate, getAppVersion } from "../../lib/autoUpdate";
import type { Update } from "@tauri-apps/plugin-updater";

type UpdatePhase =
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "installed"
  | "error";

interface Props {
  onClose: () => void;
}

export function UpdateDialog({ onClose }: Props) {
  const [phase, setPhase] = useState<UpdatePhase>("checking");
  const [update, setUpdate] = useState<Update | null>(null);
  const [appVersion, setAppVersion] = useState("...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAppVersion().then(setAppVersion);
    performCheck();
  }, []);

  const performCheck = async () => {
    setPhase("checking");
    setError(null);
    try {
      const result = await checkForAppUpdate();
      if (result) {
        setUpdate(result);
        setPhase("available");
      } else {
        setPhase("up-to-date");
      }
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  };

  const handleInstall = async () => {
    /* v8 ignore start -- button disabled when update is null */
    if (!update) return;
    /* v8 ignore stop */
    setPhase("downloading");
    try {
      await update.downloadAndInstall();
      setPhase("installed");
    } catch (e) {
      setError(`Install failed: ${e}`);
      setPhase("error");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="fixed inset-0 bg-black/50" />
      <div
        className="relative z-50 w-80 rounded-lg p-4"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <span
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            Software Update
          </span>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-[var(--bg-hover)]"
          >
            <X
              className="h-3.5 w-3.5"
              style={{ color: "var(--text-muted)" }}
            />
          </button>
        </div>

        {/* Current version */}
        <div
          className="mb-3 text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          Current version: v{appVersion}
        </div>

        {/* Content by phase */}
        <div className="mb-4">
          {phase === "checking" && (
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Checking for updates...
            </div>
          )}

          {phase === "up-to-date" && (
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--success)" }}>
              <CheckCircle className="h-3.5 w-3.5" />
              You're on the latest version.
            </div>
          )}

          {phase === "available" && update && (
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--accent)" }}>
              <Download className="h-3.5 w-3.5" />
              Version {update.version} is available.
            </div>
          )}

          {phase === "downloading" && (
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Downloading and installing...
            </div>
          )}

          {phase === "installed" && (
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--success)" }}>
              <CheckCircle className="h-3.5 w-3.5" />
              Update installed. Restart to apply.
            </div>
          )}

          {phase === "error" && (
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--error)" }}>
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          {phase === "available" && (
            <button
              onClick={handleInstall}
              className="rounded px-3 py-1.5 text-xs transition-colors"
              style={{
                backgroundColor: "var(--accent)",
                color: "white",
              }}
            >
              Download & Install
            </button>
          )}

          {phase === "installed" && (
            <button
              onClick={() => relaunch()}
              className="rounded px-3 py-1.5 text-xs transition-colors"
              style={{
                backgroundColor: "var(--accent)",
                color: "white",
              }}
            >
              <span className="flex items-center gap-1">
                <RotateCcw className="h-3 w-3" />
                Restart Now
              </span>
            </button>
          )}

          {phase === "error" && (
            <button
              onClick={performCheck}
              className="rounded px-3 py-1.5 text-xs transition-colors"
              style={{
                backgroundColor: "var(--accent)",
                color: "white",
              }}
            >
              Retry
            </button>
          )}

          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--text-muted)" }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
