import { FileText as FileIcon } from "lucide-react";
import type { DroppedFile } from "../../hooks/useFileDropHandler";

export function FileChipIcon({ file }: { file: DroppedFile }) {
  if (file.isImage && file.dataUrl && file.dataUrl !== "error") {
    return (
      <img
        src={file.dataUrl}
        alt={file.name}
        className="h-5 w-5 rounded object-cover"
      />
    );
  }
  if (file.isImage && !file.dataUrl) {
    // Still loading — only reachable via Tauri drag-drop which loads images async
    /* v8 ignore start */
    return (
      <div
        className="flex h-5 w-5 items-center justify-center rounded"
        style={{ backgroundColor: "var(--bg-surface)" }}
      >
        <div className="h-3 w-3 animate-pulse rounded-sm" style={{ backgroundColor: "var(--text-muted)" }} />
      </div>
    );
    /* v8 ignore stop */
  }
  // Non-image or failed image load
  return <FileIcon className="h-3 w-3 flex-shrink-0" style={{ color: "var(--text-muted)" }} />;
}
