import { useState } from "react";
import { Copy, Check, FileDown } from "lucide-react";
import { writeWorkspaceFile, writeRepoFile } from "../../lib/tauri";
import { useFileViewerStore } from "../../stores/fileViewerStore";
import { useToastStore } from "../../stores/toastStore";

type ApplyStatus = "idle" | "applying" | "applied" | "error";

interface Props {
  code: string;
  filePath: string | null;
  contextId: string;
  contextType: "workspace" | "repo";
}

export function CodeBlockToolbar({
  code,
  filePath,
  contextId,
  contextType,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [applyStatus, setApplyStatus] = useState<ApplyStatus>("idle");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      useToastStore.getState().addToast("Copied to clipboard", "success");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      useToastStore.getState().addToast("Failed to copy", "error");
    }
  };

  const handleApply = async () => {
    if (!filePath || applyStatus === "applying") return;

    setApplyStatus("applying");
    try {
      if (contextType === "workspace") {
        await writeWorkspaceFile(contextId, filePath, code, false);
      } else {
        await writeRepoFile(contextId, filePath, code, false);
      }
      useFileViewerStore
        .getState()
        .openFile(contextId, contextType, filePath, true);
      useToastStore
        .getState()
        .addToast(`Applied to ${filePath}`, "success");
      setApplyStatus("applied");
      setTimeout(() => setApplyStatus("idle"), 1500);
    } catch (e) {
      useToastStore
        .getState()
        .addToast(`Failed to apply: ${String(e)}`, "error");
      setApplyStatus("error");
      setTimeout(() => setApplyStatus("idle"), 1500);
    }
  };

  return (
    <div
      className="absolute right-2 top-2 flex items-center gap-1 rounded-md border px-1 py-0.5 opacity-0 transition-opacity group-hover:opacity-100"
      style={{
        backgroundColor: "var(--bg-primary)",
        borderColor: "var(--border)",
      }}
    >
      <button
        onClick={handleCopy}
        className="flex h-7 w-7 items-center justify-center rounded transition-colors"
        style={{ color: copied ? "var(--success)" : "var(--text-muted)" }}
        title="Copy code"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>

      {filePath && (
        <button
          onClick={handleApply}
          disabled={applyStatus === "applying"}
          className="flex h-7 items-center gap-1 rounded px-1.5 text-[10px] font-medium transition-colors disabled:opacity-50"
          style={{
            color:
              applyStatus === "applied"
                ? "var(--success)"
                : applyStatus === "error"
                  ? "var(--error)"
                  : "var(--text-muted)",
          }}
          title={`Apply to ${filePath}`}
        >
          {applyStatus === "applied" ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <FileDown className="h-3.5 w-3.5" />
          )}
          <span>Apply</span>
        </button>
      )}
    </div>
  );
}
