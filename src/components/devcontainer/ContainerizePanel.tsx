import { useState } from "react";
import Editor from "@monaco-editor/react";
import { useDevContainerStore } from "../../stores/devContainerStore";
import { applyDevcontainerConfig } from "../../lib/tauri";

const buttonStyle = {
  border: "1px solid var(--border)",
  backgroundColor: "var(--bg-surface)",
  color: "var(--text-primary)",
};

interface ContainerizePanelProps {
  workspaceId: string;
  existingDevcontainer?: string | null;
  onContainerized?: () => void;
}

export default function ContainerizePanel({
  workspaceId,
  existingDevcontainer,
  onContainerized,
}: ContainerizePanelProps) {
  const containerizing = useDevContainerStore(
    (s) => s.containerizing[workspaceId] ?? false,
  );
  const proposedConfig = useDevContainerStore(
    (s) => s.proposedConfig[workspaceId],
  );
  const containerizeError = useDevContainerStore(
    (s) => s.containerizeError[workspaceId],
  );
  const containerize = useDevContainerStore((s) => s.containerize);
  const applyConfig = useDevContainerStore((s) => s.applyConfig);
  const clearProposedConfig = useDevContainerStore(
    (s) => s.clearProposedConfig,
  );

  const [editedConfig, setEditedConfig] = useState<string | null>(null);
  const displayConfig = editedConfig ?? proposedConfig;

  const handleContainerize = () => {
    containerize(workspaceId);
  };

  const handleApply = async (commitToRepo: boolean) => {
    if (!displayConfig) return;
    await applyConfig(workspaceId, displayConfig, commitToRepo);
    setEditedConfig(null);
    onContainerized?.();
  };

  const handleUseExisting = async () => {
    await applyDevcontainerConfig(workspaceId, "", false, existingDevcontainer ?? undefined);
    onContainerized?.();
  };

  const handleCancel = () => {
    clearProposedConfig(workspaceId);
    setEditedConfig(null);
  };

  // Error state
  if (containerizeError && !containerizing && !proposedConfig) {
    return (
      <div className="flex flex-col gap-3 p-3">
        <div
          className="rounded px-3 py-2 text-xs break-words"
          style={{
            backgroundColor: "var(--error-bg)",
            color: "var(--error)",
            border: "1px solid var(--error-border)",
          }}
        >
          {containerizeError}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleContainerize}
            className="rounded px-3 py-1 text-xs"
            style={buttonStyle}
          >
            Retry
          </button>
          <button
            onClick={handleCancel}
            className="rounded px-3 py-1 text-xs"
            style={buttonStyle}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Analyzing state
  if (containerizing) {
    return (
      <div className="flex flex-col gap-2 p-3">
        <div
          className="flex items-center gap-2 text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          Analyzing repository...
        </div>
      </div>
    );
  }

  // Review state
  if (proposedConfig) {
    return (
      <div className="flex flex-col gap-3 p-3">
        <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          Review the generated devcontainer.json:
        </div>
        <div
          className="rounded overflow-hidden"
          style={{ border: "1px solid var(--border)", height: 300 }}
        >
          <Editor
            defaultLanguage="json"
            value={displayConfig}
            onChange={(v) => setEditedConfig(v ?? null)}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              fontSize: 12,
              tabSize: 2,
              wordWrap: "on",
            }}
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleApply(true)}
            className="rounded px-3 py-1 text-xs"
            style={buttonStyle}
          >
            Commit to repo
          </button>
          <button
            onClick={() => handleApply(false)}
            className="rounded px-3 py-1 text-xs"
            style={buttonStyle}
          >
            Save to Fury only
          </button>
          <button
            onClick={handleCancel}
            className="rounded px-3 py-1 text-xs"
            style={buttonStyle}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Idle state
  return (
    <div className="flex flex-col gap-3 p-3">
      {existingDevcontainer ? (
        <button
          onClick={handleUseExisting}
          className="rounded px-3 py-1 text-xs"
          style={buttonStyle}
        >
          Use existing devcontainer
        </button>
      ) : (
        <button
          onClick={handleContainerize}
          disabled={containerizing}
          className="rounded px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          style={buttonStyle}
        >
          Containerize
        </button>
      )}
      <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
        {existingDevcontainer
          ? `Found ${existingDevcontainer} — enable container mode for this workspace.`
          : "Analyze this repo and generate a devcontainer.json using AI."}
      </div>
    </div>
  );
}
