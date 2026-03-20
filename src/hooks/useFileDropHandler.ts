import { useState, useEffect, useCallback } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { readFileBase64, saveClipboardImage } from "../lib/tauri";

const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "tiff", "tif", "avif",
]);

export interface DroppedFile {
  id: string;
  path: string;
  name: string;
  isImage: boolean;
  dataUrl?: string; // undefined = loading, "error" = failed, string = loaded
}

let fileIdCounter = 0;

export function isImageFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
}

export function useFileDropHandler() {
  const [droppedFiles, setDroppedFiles] = useState<DroppedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  // Listen for Tauri drag-drop events
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    try {
      getCurrentWebview()
        .onDragDropEvent((event) => {
          /* v8 ignore start -- Tauri drag-drop events not available in jsdom */
          if (cancelled) return;
          if (event.payload.type === "over") {
            setIsDragOver(true);
          } else if (event.payload.type === "leave") {
            setIsDragOver(false);
          } else if (event.payload.type === "drop") {
            setIsDragOver(false);
            const paths = event.payload.paths;
            // Build files and load base64 for images
            const newFiles: DroppedFile[] = paths.map((p) => ({
              id: String(++fileIdCounter),
              path: p,
              name: p.split(/[/\\]/).pop() ?? p,
              isImage: isImageFile(p),
            }));
            setDroppedFiles((prev) => [...prev, ...newFiles]);
            // Async: load data URLs for image files
            for (const f of newFiles) {
              if (f.isImage) {
                readFileBase64(f.path)
                  .then((dataUrl) => {
                    if (cancelled) return;
                    setDroppedFiles((prev) =>
                      prev.map((df) =>
                        df.id === f.id ? { ...df, dataUrl } : df,
                      ),
                    );
                  })
                  .catch((err) => {
                    console.warn(`Failed to load image preview for ${f.name}:`, err);
                    if (cancelled) return;
                    setDroppedFiles((prev) =>
                      prev.map((df) =>
                        df.id === f.id ? { ...df, dataUrl: "error" } : df,
                      ),
                    );
                  });
              }
            }
          }
          /* v8 ignore stop */
        })
        .then((fn) => {
          /* v8 ignore start */
          if (cancelled) {
            fn();
          } else {
            unlisten = fn;
          }
          /* v8 ignore stop */
        })
        .catch((err) => {
          /* v8 ignore start */
          console.warn("Failed to register drag-drop event listener:", err);
          /* v8 ignore stop */
        });
    } catch {
      // getCurrentWebview() throws synchronously outside Tauri (e.g. browser/test)
    }

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const handleAddAttachment = useCallback(async (onMenuClose?: () => void) => {
    onMenuClose?.();
    let selected;
    try {
      selected = await openFileDialog({
        multiple: true,
        title: "Add attachment",
      });
    } catch (e) {
      console.error("Failed to open file dialog:", e);
      return;
    }
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    const newFiles: DroppedFile[] = paths.map((p) => {
      const name = p.split("/").pop() ?? p;
      return { id: `file-${++fileIdCounter}`, path: p, name, isImage: isImageFile(p) };
    });
    setDroppedFiles((prev) => [...prev, ...newFiles]);
    for (const f of newFiles) {
      if (f.isImage) {
        readFileBase64(f.path)
          .then((dataUrl) => {
            setDroppedFiles((prev) =>
              prev.map((df) => (df.id === f.id ? { ...df, dataUrl } : df)),
            );
          })
          .catch((err) => {
            console.warn(`Failed to load image preview for ${f.name}:`, err);
            setDroppedFiles((prev) =>
              prev.map((df) => (df.id === f.id ? { ...df, dataUrl: "error" } : df)),
            );
          });
      }
    }
  }, []);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (!item.type.startsWith("image/")) continue;

      const blob = item.getAsFile();
      if (!blob) continue;

      e.preventDefault();

      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          resolve(dataUrl.split(",")[1]);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      const mimeType = item.type;

      const ext = mimeType.split("/")[1]?.replace("svg+xml", "svg") ?? "png";
      const tempName = `paste-${Date.now()}.${ext}`;

      const fileId = `paste-${++fileIdCounter}`;
      setDroppedFiles((prev) => [...prev, {
        id: fileId,
        path: "",
        name: tempName,
        isImage: true,
      }]);

      try {
        const filePath = await saveClipboardImage(base64Data, mimeType);
        const dataUrl = `data:${mimeType};base64,${base64Data}`;
        setDroppedFiles((prev) =>
          prev.map((f) =>
            f.id === fileId
              /* v8 ignore start -- nullish coalesce: .pop() always returns a string on non-empty split */
              ? { ...f, path: filePath, name: filePath.split(/[/\\]/).pop() ?? tempName, dataUrl }
              /* v8 ignore stop */
              : f,
          ),
        );
      } catch (err) {
        console.warn("Failed to save pasted image:", err);
        setDroppedFiles((prev) => prev.filter((f) => f.id !== fileId));
      }

      break;
    }
  }, []);

  const removeDroppedFile = useCallback((index: number) => {
    setDroppedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearDroppedFiles = useCallback(() => {
    setDroppedFiles([]);
  }, []);

  return {
    droppedFiles,
    isDragOver,
    handleAddAttachment,
    handlePaste,
    removeDroppedFile,
    clearDroppedFiles,
  };
}
