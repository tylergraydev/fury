import { useState } from "react";
import type { ContentBlock } from "../../lib/tauri";
import { ImageLightbox } from "./ImageLightbox";

export function InlineImageGroup({ blocks }: { blocks: Array<ContentBlock & { type: "image" }> }) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  return (
    <>
      <div className="my-2 flex flex-wrap gap-2">
        {blocks.map((block, i) => {
          const src = block.data.startsWith("data:")
            ? block.data
            : block.data.startsWith("http")
              ? block.data
              : `data:${block.mediaType};base64,${block.data}`;
          return (
            <button
              key={i}
              type="button"
              className="cursor-pointer overflow-hidden rounded-md border transition-opacity hover:opacity-80"
              style={{ borderColor: "var(--border)" }}
              onClick={() => setLightboxSrc(src)}
            >
              <img
                src={src}
                alt={`Image ${i + 1}`}
                className="max-h-64 max-w-full object-contain"
                draggable={false}
              />
            </button>
          );
        })}
      </div>
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </>
  );
}
