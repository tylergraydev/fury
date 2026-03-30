import { useState } from "react";
import Editor from "@monaco-editor/react";
import { Sparkles } from "lucide-react";
import { MONACO_THEME, configureMonacoTheme } from "../../lib/monacoTheme";
import { useMergeStore } from "../../stores/mergeStore";
import { useChatStore } from "../../stores/chatStore";
import { useAgentStore } from "../../stores/agentStore";
import type { ConflictContent } from "../../lib/tauri";

interface Props {
  workspaceId: string;
  conflict: ConflictContent;
}

type ConflictTab = "base" | "ours" | "theirs" | "merged";

export function ConflictResolver({ workspaceId, conflict }: Props) {
  const [activeTab, setActiveTab] = useState<ConflictTab>("merged");

  const tabs: { id: ConflictTab; label: string }[] = [
    { id: "merged", label: "Current (with markers)" },
    { id: "base", label: "Base" },
    { id: "ours", label: "Ours" },
    { id: "theirs", label: "Theirs" },
  ];

  const contentMap: Record<ConflictTab, string> = {
    base: conflict.base,
    ours: conflict.ours,
    theirs: conflict.theirs,
    merged: conflict.merged,
  };

  const handleAcceptOurs = () => {
    useMergeStore
      .getState()
      .resolveConflict(workspaceId, conflict.path, "ours");
  };

  const handleAcceptTheirs = () => {
    useMergeStore
      .getState()
      .resolveConflict(workspaceId, conflict.path, "theirs");
  };

  const handleResolveWithAI = () => {
    const prompt = `The following file has a merge conflict. Please resolve it intelligently, preserving the intent of both changes.

File: ${conflict.path}

Base version (common ancestor):
\`\`\`
${conflict.base}
\`\`\`

Our version (current branch):
\`\`\`
${conflict.ours}
\`\`\`

Their version (incoming changes):
\`\`\`
${conflict.theirs}
\`\`\`

Please edit the file at ${conflict.path} to resolve the conflict, combining both sets of changes appropriately. Then run: git add ${conflict.path}`;

    useChatStore.getState().addUserMessage(workspaceId, prompt);
    useAgentStore
      .getState()
      .sendMessage(workspaceId, prompt, "workspace");
  };

  return (
    <div className="flex h-full flex-col">
      {/* File path */}
      <div
        className="flex items-center justify-between px-3 py-1.5 text-xs"
        style={{
          borderBottom: "1px solid var(--border)",
          backgroundColor: "var(--bg-secondary)",
        }}
      >
        <span
          className="font-mono"
          style={{ color: "var(--text-primary)" }}
        >
          {conflict.path}
        </span>
      </div>

      {/* Tab bar */}
      <div
        className="flex items-center gap-1 px-3 py-1"
        style={{
          borderBottom: "1px solid var(--border)",
          backgroundColor: "var(--bg-secondary)",
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="rounded px-2 py-0.5 text-[10px] transition-colors"
            style={{
              backgroundColor:
                activeTab === tab.id ? "var(--bg-surface)" : "transparent",
              color:
                activeTab === tab.id
                  ? "var(--text-primary)"
                  : "var(--text-muted)",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Editor */}
      <div className="flex-1">
        <Editor
          value={contentMap[activeTab]}
          language={conflict.language}
          theme={MONACO_THEME}
          beforeMount={configureMonacoTheme}
          options={{
            readOnly: true,
            scrollBeyondLastLine: false,
            minimap: { enabled: false },
            fontSize: 12,
            wordWrap: "on",
            automaticLayout: true,
          }}
        />
      </div>

      {/* Action buttons */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{
          borderTop: "1px solid var(--border)",
          backgroundColor: "var(--bg-secondary)",
        }}
      >
        <button
          onClick={handleAcceptOurs}
          className="rounded px-3 py-1 text-xs transition-opacity hover:opacity-80"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
          }}
        >
          Accept Ours
        </button>
        <button
          onClick={handleAcceptTheirs}
          className="rounded px-3 py-1 text-xs transition-opacity hover:opacity-80"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
          }}
        >
          Accept Theirs
        </button>
        <button
          onClick={handleResolveWithAI}
          className="ml-auto flex items-center gap-1.5 rounded px-3 py-1 text-xs transition-opacity hover:opacity-80"
          style={{
            backgroundColor: "var(--accent)",
            color: "var(--bg-primary)",
          }}
        >
          <Sparkles className="h-3 w-3" />
          Resolve with AI
        </button>
      </div>
    </div>
  );
}
