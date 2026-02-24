import { Download, X, RotateCcw } from "lucide-react";
import { relaunch } from "@tauri-apps/plugin-process";

interface UpdateBannerProps {
  version: string;
  installing: boolean;
  installed: boolean;
  error: string | null;
  onInstall: () => void;
  onDismiss: () => void;
}

export function UpdateBanner({
  version,
  installing,
  installed,
  error,
  onInstall,
  onDismiss,
}: UpdateBannerProps) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2 text-xs"
      style={{
        backgroundColor: "var(--accent)",
        color: "var(--bg-primary)",
      }}
    >
      <Download className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="flex-1">
        {error
          ? error
          : installed
            ? `Update v${version} installed. Restart to apply.`
            : installing
              ? "Downloading update..."
              : `Update v${version} is available.`}
      </span>

      {installed ? (
        <button
          onClick={() => relaunch()}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80"
          style={{
            backgroundColor: "var(--bg-primary)",
            color: "var(--accent)",
          }}
        >
          <RotateCcw className="h-3 w-3" />
          Restart
        </button>
      ) : !installing && !error ? (
        <button
          onClick={onInstall}
          className="rounded px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80"
          style={{
            backgroundColor: "var(--bg-primary)",
            color: "var(--accent)",
          }}
        >
          Install
        </button>
      ) : null}

      {!installing && (
        <button
          onClick={onDismiss}
          className="flex-shrink-0 rounded p-0.5 transition-opacity hover:opacity-70"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
