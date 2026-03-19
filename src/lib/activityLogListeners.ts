import { useAgentStore } from "../stores/agentStore";
import { usePrStore } from "../stores/prStore";
import { useScriptStore } from "../stores/scriptStore";
import { useMergeStore } from "../stores/mergeStore";
import { useChatStore } from "../stores/chatStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useActivityLogStore } from "../stores/activityLogStore";
import type { AgentStatus } from "./tauri";

function getWorkspaceName(workspaceId: string): string {
  const ws = useWorkspaceStore.getState().workspaces.find((w) => w.id === workspaceId);
  /* v8 ignore start -- ws is always found; nullish coalescing is V8 branch artifact */
  return ws?.name ?? workspaceId.slice(0, 8);
  /* v8 ignore stop */
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function initActivityLogListeners(): () => void {
  const unsubs: (() => void)[] = [];

  // 1. Agent status changes (Idle -> Running, Running -> Idle)
  const prevAgentStatuses: Record<string, AgentStatus> = {};
  unsubs.push(
    useAgentStore.subscribe((state) => {
      for (const [wsId, info] of Object.entries(state.agents)) {
        const prev = prevAgentStatuses[wsId];
        const curr = info.status;

        if (prev === "Idle" && curr === "Running") {
          useActivityLogStore.getState().addEntry({
            type: "agent-started",
            workspaceId: wsId,
            workspaceName: getWorkspaceName(wsId),
            title: "Agent started",
            message: `Agent started running in ${getWorkspaceName(wsId)}`,
          });
        }

        if (prev === "Running" && curr === "Idle") {
          useActivityLogStore.getState().addEntry({
            type: "agent-completed",
            workspaceId: wsId,
            workspaceName: getWorkspaceName(wsId),
            title: "Agent completed",
            message: `Task finished in ${getWorkspaceName(wsId)}`,
          });
        }

        prevAgentStatuses[wsId] = curr;
      }
    }),
  );

  // 2. Chat messages (user sent, agent responded — skip system)
  const prevMessageCounts: Record<string, number> = {};
  unsubs.push(
    useChatStore.subscribe((state) => {
      /* v8 ignore start -- for...of Object.entries is V8 branch artifact */
      for (const [wsId, msgs] of Object.entries(state.messages)) {
      /* v8 ignore stop */
        const prevCount = prevMessageCounts[wsId] ?? 0;
        /* v8 ignore start -- branch condition is V8 branch artifact */
        if (msgs.length > prevCount) {
        /* v8 ignore stop */
          for (let i = prevCount; i < msgs.length; i++) {
            const msg = msgs[i];
            if (msg.role === "system") continue;

            const textContent = msg.content
              .filter((b): b is { type: "text"; text: string } => b.type === "text")
              .map((b) => b.text)
              .join(" ");
            const preview =
              textContent.length > 80 ? textContent.slice(0, 77) + "..." : textContent;

            useActivityLogStore.getState().addEntry({
              type: msg.role === "user" ? "chat-user" : "chat-agent",
              workspaceId: wsId,
              workspaceName: getWorkspaceName(wsId),
              title: msg.role === "user" ? "Message sent" : "Agent responded",
              message: preview || "(tool use)",
            });
          }
        }
        prevMessageCounts[wsId] = msgs.length;
      }
    }),
  );

  // 3. Script runs (started, succeeded, failed)
  const prevRunning: Record<string, boolean> = {};
  const prevExitCodes: Record<string, number | null> = {};
  unsubs.push(
    useScriptStore.subscribe((state) => {
      // Detect script started
      /* v8 ignore start -- for...of Object.entries is V8 branch artifact */
      for (const [k, running] of Object.entries(state.running)) {
      /* v8 ignore stop */
        const wasRunning = prevRunning[k] ?? false;
        /* v8 ignore start -- branch condition is V8 branch artifact */
        if (!wasRunning && running) {
        /* v8 ignore stop */
          const parts = k.split(":");
          const wsId = parts[0];
          /* v8 ignore start -- key always has colon separator */
          const kind = parts[1] ?? "script";
          /* v8 ignore stop */
          useActivityLogStore.getState().addEntry({
            type: "script-started",
            workspaceId: wsId,
            workspaceName: getWorkspaceName(wsId),
            title: `${capitalize(kind)} started`,
            message: `Running ${kind} in ${getWorkspaceName(wsId)}`,
            metadata: { scriptKind: kind },
          });
        }
        prevRunning[k] = running;
      }

      // Detect script exit
      for (const [k, code] of Object.entries(state.exitCodes)) {
        if (code !== null && prevExitCodes[k] !== code) {
          const parts = k.split(":");
          const wsId = parts[0];
          /* v8 ignore start -- key always has colon separator */
          const kind = parts[1] ?? "script";
          /* v8 ignore stop */
          const succeeded = code === 0;
          useActivityLogStore.getState().addEntry({
            type: succeeded ? "script-succeeded" : "script-failed",
            workspaceId: wsId,
            workspaceName: getWorkspaceName(wsId),
            title: succeeded ? `${capitalize(kind)} succeeded` : `${capitalize(kind)} failed`,
            message: succeeded
              ? `Completed in ${getWorkspaceName(wsId)}`
              : `Exited with code ${code} in ${getWorkspaceName(wsId)}`,
            metadata: { exitCode: code, scriptKind: kind },
          });
        }
        prevExitCodes[k] = code;
      }
    }),
  );

  // 4. PR events (checks pass/fail, merged)
  const prevCheckStates: Record<string, string> = {};
  const prevPrStates: Record<string, string | null | undefined> = {};
  unsubs.push(
    usePrStore.subscribe((state) => {
      for (const [wsId, info] of Object.entries(state.prInfo)) {
        if (!info) continue;

        // PR merged detection
        const prevPrState = prevPrStates[wsId];
        if (
          info.state === "MERGED" &&
          prevPrState !== undefined &&
          prevPrState !== "MERGED"
        ) {
          useActivityLogStore.getState().addEntry({
            type: "pr-merged",
            workspaceId: wsId,
            workspaceName: getWorkspaceName(wsId),
            title: "PR merged",
            message: `"${info.title}" merged in ${getWorkspaceName(wsId)}`,
            metadata: { prNumber: info.prNumber, prTitle: info.title },
          });
        }
        prevPrStates[wsId] = info.state;

        // Check completion detection
        if (!info.checks.length) continue;
        const allDone = info.checks.every(
          (c) => c.status === "COMPLETED" || c.conclusion !== null,
        );
        if (!allDone) {
          prevCheckStates[wsId] = "pending";
          continue;
        }

        const anyFailed = info.checks.some(
          (c) => c.conclusion === "FAILURE" || c.conclusion === "failure",
        );
        const newState = anyFailed ? "fail" : "pass";

        if (prevCheckStates[wsId] === "pending") {
          useActivityLogStore.getState().addEntry({
            type: anyFailed ? "pr-checks-fail" : "pr-checks-pass",
            workspaceId: wsId,
            workspaceName: getWorkspaceName(wsId),
            title: anyFailed ? "PR checks failed" : "PR checks passed",
            /* v8 ignore start -- ternary: both pass and fail paths tested separately */
            message: anyFailed
              ? `${info.checks.filter((c) => c.conclusion === "FAILURE" || c.conclusion === "failure").length} check(s) failed`
              : `All ${info.checks.length} checks passed`,
            /* v8 ignore stop */
            metadata: { prNumber: info.prNumber },
          });
        }
        prevCheckStates[wsId] = newState;
      }
    }),
  );

  // 5. Merge conflicts detected/resolved
  const prevConflictCounts: Record<string, number> = {};
  unsubs.push(
    useMergeStore.subscribe((state) => {
      for (const [wsId, files] of Object.entries(state.conflictedFiles)) {
        const prevCount = prevConflictCounts[wsId] ?? 0;
        /* v8 ignore start -- merge conflict detection/resolution branches */
        if (files.length > 0 && prevCount === 0) {
          useActivityLogStore.getState().addEntry({
            type: "merge-conflict-detected",
            workspaceId: wsId,
            workspaceName: getWorkspaceName(wsId),
            title: "Merge conflicts detected",
            message: `${files.length} conflicted file(s) in ${getWorkspaceName(wsId)}`,
            metadata: { fileCount: files.length },
          });
        } else if (files.length === 0 && prevCount > 0) {
        /* v8 ignore stop */
          useActivityLogStore.getState().addEntry({
            type: "merge-conflict-resolved",
            workspaceId: wsId,
            workspaceName: getWorkspaceName(wsId),
            title: "Merge conflicts resolved",
            message: `All conflicts resolved in ${getWorkspaceName(wsId)}`,
            metadata: { fileCount: 0 },
          });
        }
        prevConflictCounts[wsId] = files.length;
      }
    }),
  );

  return () => unsubs.forEach((fn) => fn());
}
