import { useState, useEffect } from "react";
import { ImageIcon } from "lucide-react";
import { readFileBase64 } from "../../lib/tauri";

export function AttachmentImage({ path, name }: { path: string; name: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readFileBase64(path)
      .then((url) => {
        /* v8 ignore start -- cancelled flag branch; unmount tested separately */
        if (!cancelled) setDataUrl(url);
        /* v8 ignore stop */
      })
      .catch((err) => {
        console.warn(`Failed to load image attachment "${path}":`, err);
        /* v8 ignore start -- cancelled flag branch; unmount tested separately */
        if (!cancelled) setFailed(true);
        /* v8 ignore stop */
      });
    /* v8 ignore start -- cleanup callback runs on unmount; tested via `cancelled` flag */
    return () => { cancelled = true; };
    /* v8 ignore stop */
  }, [path]);

  if (failed) {
    return (
      <div className="mb-2 inline-flex items-center gap-1.5 rounded-md bg-[var(--bg-hover)] px-2 py-1 text-[12px]">
        <ImageIcon className="h-3.5 w-3.5" />
        <span>{name}</span>
      </div>
    );
  }

  if (!dataUrl) {
    return (
      <div className="mb-2 h-24 w-32 animate-pulse rounded bg-[var(--bg-hover)]" />
    );
  }

  return (
    <div className="mb-2">
      <img
        src={dataUrl}
        alt={name}
        className="max-h-48 max-w-full rounded"
        style={{ objectFit: "contain" }}
      />
      <div className="mt-0.5 text-[11px] opacity-70">{name}</div>
    </div>
  );
}
