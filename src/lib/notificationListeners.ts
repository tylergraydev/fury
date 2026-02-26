import { useAgentStore } from "../stores/agentStore";
import { usePrStore } from "../stores/prStore";
import { useScriptStore } from "../stores/scriptStore";
import { useMergeStore } from "../stores/mergeStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useNotificationStore } from "../stores/notificationStore";
import type { AgentStatus } from "./tauri";

function getWorkspaceName(workspaceId: string): string {
  const ws = useWorkspaceStore.getState().workspaces.find((w) => w.id === workspaceId);
  return ws?.name ?? workspaceId.slice(0, 8);
}

export function initNotificationListeners(): () => void {
  const unsubs: (() => void)[] = [];

  // 1. Agent completes: Running -> Idle
  const prevAgentStatuses: Record<string, AgentStatus> = {};
  unsubs.push(
    useAgentStore.subscribe((state) => {
      for (const [wsId, info] of Object.entries(state.agents)) {
        const prev = prevAgentStatuses[wsId];
        if (prev === "Running" && info.status === "Idle") {
          useNotificationStore.getState().addNotification({
            type: "agent-complete",
            title: "Agent completed",
            message: `Task finished in ${getWorkspaceName(wsId)}`,
            workspaceId: wsId,
            workspaceName: getWorkspaceName(wsId),
            navigateTo: { viewTab: "chat" },
          });
        }
        prevAgentStatuses[wsId] = info.status;
      }
    }),
  );

  // 2. PR checks complete (all pass or any fail) + PR merged
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
          useNotificationStore.getState().addNotification({
            type: "pr-merged",
            title: "PR merged",
            message: `"${info.title}" merged in ${getWorkspaceName(wsId)}`,
            workspaceId: wsId,
            workspaceName: getWorkspaceName(wsId),
            navigateTo: { rightSidebarTab: "checks" },
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
          (c) =>
            c.conclusion === "FAILURE" || c.conclusion === "failure",
        );
        const newState = anyFailed ? "fail" : "pass";

        if (prevCheckStates[wsId] === "pending") {
          useNotificationStore.getState().addNotification({
            type: anyFailed ? "pr-checks-fail" : "pr-checks-pass",
            title: anyFailed ? "PR checks failed" : "PR checks passed",
            message: anyFailed
              ? `${info.checks.filter((c) => c.conclusion === "FAILURE" || c.conclusion === "failure").length} check(s) failed in ${getWorkspaceName(wsId)}`
              : `All ${info.checks.length} checks passed in ${getWorkspaceName(wsId)}`,
            workspaceId: wsId,
            workspaceName: getWorkspaceName(wsId),
            navigateTo: { rightSidebarTab: "checks" },
          });
        }
        prevCheckStates[wsId] = newState;
      }
    }),
  );

  // 3. Script/build exits with error
  const prevExitCodes: Record<string, number | null> = {};
  unsubs.push(
    useScriptStore.subscribe((state) => {
      for (const [k, code] of Object.entries(state.exitCodes)) {
        if (code !== null && code !== 0 && prevExitCodes[k] !== code) {
          const parts = k.split(":");
          const wsId = parts[0];
          const kind = parts[1] ?? "Script";
          useNotificationStore.getState().addNotification({
            type: "build-error",
            title: `${kind.charAt(0).toUpperCase() + kind.slice(1)} failed`,
            message: `Exited with code ${code} in ${getWorkspaceName(wsId)}`,
            workspaceId: wsId,
            workspaceName: getWorkspaceName(wsId),
          });
        }
        prevExitCodes[k] = code;
      }
    }),
  );

  // 4. Merge conflicts detected
  const prevConflictCounts: Record<string, number> = {};
  unsubs.push(
    useMergeStore.subscribe((state) => {
      for (const [wsId, files] of Object.entries(state.conflictedFiles)) {
        const prevCount = prevConflictCounts[wsId] ?? 0;
        if (files.length > 0 && prevCount === 0) {
          useNotificationStore.getState().addNotification({
            type: "merge-conflict",
            title: "Merge conflicts",
            message: `${files.length} conflicted file(s) in ${getWorkspaceName(wsId)}`,
            workspaceId: wsId,
            workspaceName: getWorkspaceName(wsId),
            navigateTo: { viewTab: "merge" },
          });
        }
        prevConflictCounts[wsId] = files.length;
      }
    }),
  );

  return () => unsubs.forEach((fn) => fn());
}
