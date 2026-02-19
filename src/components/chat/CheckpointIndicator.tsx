import { useState } from "react";
import type { Checkpoint } from "../../lib/tauri";

interface Props {
  checkpoint: Checkpoint;
  isLatest: boolean;
  onRevert: (checkpointId: string) => void;
}

export function CheckpointIndicator({ checkpoint, isLatest, onRevert }: Props) {
  const [confirming, setConfirming] = useState(false);

  const handleRevert = () => {
    onRevert(checkpoint.id);
    setConfirming(false);
  };

  return (
    <div
      className="my-2 flex items-center gap-2"
      style={{ color: "var(--text-muted)" }}
    >
      <div
        className="flex-1"
        style={{ borderTop: "1px dashed var(--border)" }}
      />
      <span
        className="rounded-full px-2 py-0.5 text-[10px]"
        style={{ backgroundColor: "var(--bg-surface)" }}
      >
        Turn {checkpoint.turnIndex}
      </span>
      {!isLatest && !confirming && (
        <button
          onClick={() => setConfirming(true)}
          className="rounded px-1.5 py-0.5 text-[10px] transition-colors hover:opacity-80"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--warning, var(--text-muted))",
          }}
        >
          Revert
        </button>
      )}
      {confirming && (
        <span className="flex items-center gap-1 text-[10px]">
          <span>Revert to here?</span>
          <button
            onClick={handleRevert}
            className="rounded px-1.5 py-0.5 transition-colors hover:opacity-80"
            style={{
              backgroundColor: "var(--error)",
              color: "var(--bg-primary)",
            }}
          >
            Yes
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="rounded px-1.5 py-0.5 transition-colors hover:opacity-80"
            style={{ backgroundColor: "var(--bg-surface)" }}
          >
            No
          </button>
        </span>
      )}
      <div
        className="flex-1"
        style={{ borderTop: "1px dashed var(--border)" }}
      />
    </div>
  );
}
