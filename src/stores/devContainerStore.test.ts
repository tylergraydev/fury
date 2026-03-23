import { describe, it, expect, vi, beforeEach } from "vitest";
import { useDevContainerStore } from "./devContainerStore";

vi.mock("../lib/tauri", () => ({
  getContainerStatus: vi.fn(),
  startContainer: vi.fn(),
  stopContainer: vi.fn(),
  rebuildContainer: vi.fn(),
  updateDevcontainerConfig: vi.fn(),
  containerizeRepo: vi.fn(),
  applyDevcontainerConfig: vi.fn(),
}));

import {
  getContainerStatus,
  startContainer,
  stopContainer,
  rebuildContainer,
  updateDevcontainerConfig,
  containerizeRepo,
  applyDevcontainerConfig,
} from "../lib/tauri";

function makeContainerState(workspaceId: string) {
  return {
    workspaceId,
    status: "running" as const,
    containerId: "abc123",
    containerName: "fury-test",
    logTail: [],
  };
}

describe("devContainerStore", () => {
  beforeEach(() => {
    useDevContainerStore.setState({
      containerStates: {},
      loading: {},
      error: {},
      containerizing: {},
      proposedConfig: {},
      containerizeError: {},
    });
    vi.clearAllMocks();
  });

  describe("fetchStatus", () => {
    it("fetches and stores container state", async () => {
      const state = makeContainerState("ws-1");
      vi.mocked(getContainerStatus).mockResolvedValue(state);

      await useDevContainerStore.getState().fetchStatus("ws-1");

      expect(getContainerStatus).toHaveBeenCalledWith("ws-1");
      expect(
        useDevContainerStore.getState().containerStates["ws-1"],
      ).toEqual(state);
    });

    it("stores error on failure", async () => {
      vi.mocked(getContainerStatus).mockRejectedValue(
        new Error("fetch failed"),
      );

      await useDevContainerStore.getState().fetchStatus("ws-1");

      expect(useDevContainerStore.getState().error["ws-1"]).toBe(
        "fetch failed",
      );
    });

    it("stores string error on failure with string rejection", async () => {
      vi.mocked(getContainerStatus).mockRejectedValue("string error");

      await useDevContainerStore.getState().fetchStatus("ws-1");

      expect(useDevContainerStore.getState().error["ws-1"]).toBe(
        "string error",
      );
    });

    it("stores fallback error for non-string non-Error rejection", async () => {
      vi.mocked(getContainerStatus).mockRejectedValue(42);

      await useDevContainerStore.getState().fetchStatus("ws-1");

      expect(useDevContainerStore.getState().error["ws-1"]).toBe(
        "An unexpected error occurred",
      );
    });
  });

  describe("start", () => {
    it("starts container and updates state", async () => {
      const state = makeContainerState("ws-1");
      vi.mocked(startContainer).mockResolvedValue(state);

      await useDevContainerStore.getState().start("ws-1");

      expect(startContainer).toHaveBeenCalledWith("ws-1");
      expect(
        useDevContainerStore.getState().containerStates["ws-1"],
      ).toEqual(state);
      expect(useDevContainerStore.getState().loading["ws-1"]).toBe(false);
    });

    it("sets loading state during start", async () => {
      let _resolve: (v: ReturnType<typeof makeContainerState>) => void;
      const promise = new Promise<ReturnType<typeof makeContainerState>>(
        (r) => {
          _resolve = r;
        },
      );
      vi.mocked(startContainer).mockImplementation(() => promise);

      const startPromise = useDevContainerStore.getState().start("ws-1");

      expect(useDevContainerStore.getState().loading["ws-1"]).toBe(true);

      _resolve!(makeContainerState("ws-1"));
      await startPromise;

      expect(useDevContainerStore.getState().loading["ws-1"]).toBe(false);
    });

    it("stores error on start failure", async () => {
      vi.mocked(startContainer).mockRejectedValue(
        new Error("start failed"),
      );

      await useDevContainerStore.getState().start("ws-1");

      expect(useDevContainerStore.getState().error["ws-1"]).toBe(
        "start failed",
      );
      expect(useDevContainerStore.getState().loading["ws-1"]).toBe(false);
    });
  });

  describe("stop", () => {
    it("stops container and updates status", async () => {
      useDevContainerStore.setState({
        containerStates: { "ws-1": makeContainerState("ws-1") },
      });
      vi.mocked(stopContainer).mockResolvedValue(undefined);

      await useDevContainerStore.getState().stop("ws-1");

      expect(stopContainer).toHaveBeenCalledWith("ws-1");
      expect(
        useDevContainerStore.getState().containerStates["ws-1"]?.status,
      ).toBe("stopped");
      expect(useDevContainerStore.getState().loading["ws-1"]).toBe(false);
    });

    it("creates fallback state when no current state exists", async () => {
      vi.mocked(stopContainer).mockResolvedValue(undefined);

      await useDevContainerStore.getState().stop("ws-1");

      const state =
        useDevContainerStore.getState().containerStates["ws-1"];
      expect(state?.status).toBe("stopped");
      expect(state?.containerId).toBeNull();
      expect(state?.containerName).toBeNull();
      expect(state?.logTail).toEqual([]);
    });

    it("stores error on stop failure", async () => {
      vi.mocked(stopContainer).mockRejectedValue(
        new Error("stop failed"),
      );

      await useDevContainerStore.getState().stop("ws-1");

      expect(useDevContainerStore.getState().error["ws-1"]).toBe(
        "stop failed",
      );
      expect(useDevContainerStore.getState().loading["ws-1"]).toBe(false);
    });
  });

  describe("rebuild", () => {
    it("rebuilds container and updates state", async () => {
      const state = makeContainerState("ws-1");
      vi.mocked(rebuildContainer).mockResolvedValue(state);

      await useDevContainerStore.getState().rebuild("ws-1");

      expect(rebuildContainer).toHaveBeenCalledWith("ws-1");
      expect(
        useDevContainerStore.getState().containerStates["ws-1"],
      ).toEqual(state);
    });

    it("stores error on rebuild failure", async () => {
      vi.mocked(rebuildContainer).mockRejectedValue(
        new Error("rebuild failed"),
      );

      await useDevContainerStore.getState().rebuild("ws-1");

      expect(useDevContainerStore.getState().error["ws-1"]).toBe(
        "rebuild failed",
      );
      expect(useDevContainerStore.getState().loading["ws-1"]).toBe(false);
    });
  });

  describe("updateConfig", () => {
    it("calls updateDevcontainerConfig", async () => {
      vi.mocked(updateDevcontainerConfig).mockResolvedValue(undefined);

      const config = {
        enabled: true,
        backend: "devcontainerCli" as const,
        agentExecMode: "host" as const,
        image: null,
        composeFile: null,
        composeService: null,
        devcontainerPath: null,
        containerWorkspacePath: null,
        extraDockerArgs: [],
        containerEnvVars: {},
      };

      await useDevContainerStore.getState().updateConfig("ws-1", config);

      expect(updateDevcontainerConfig).toHaveBeenCalledWith("ws-1", config);
    });

    it("stores error and re-throws on failure", async () => {
      vi.mocked(updateDevcontainerConfig).mockRejectedValue(
        new Error("update failed"),
      );

      await expect(
        useDevContainerStore.getState().updateConfig("ws-1", {
          enabled: true,
          backend: "devcontainerCli",
          agentExecMode: "host",
          image: null,
          composeFile: null,
          composeService: null,
          devcontainerPath: null,
          containerWorkspacePath: null,
          extraDockerArgs: [],
          containerEnvVars: {},
        }),
      ).rejects.toThrow("update failed");

      expect(useDevContainerStore.getState().error["ws-1"]).toBe(
        "update failed",
      );
    });
  });

  describe("handleStatusEvent", () => {
    it("updates container state from event", () => {
      useDevContainerStore
        .getState()
        .handleStatusEvent("ws-1", "running", "container-abc");

      const state =
        useDevContainerStore.getState().containerStates["ws-1"];
      expect(state?.status).toBe("running");
      expect(state?.containerId).toBe("container-abc");
    });

    it("preserves existing state fields not in event", () => {
      useDevContainerStore.setState({
        containerStates: {
          "ws-1": {
            workspaceId: "ws-1",
            status: "running",
            containerId: "old-id",
            containerName: "my-container",
            logTail: ["line1"],
          },
        },
      });

      useDevContainerStore
        .getState()
        .handleStatusEvent("ws-1", "stopped", null);

      const state =
        useDevContainerStore.getState().containerStates["ws-1"];
      expect(state?.status).toBe("stopped");
      expect(state?.containerId).toBe("old-id");
      expect(state?.containerName).toBe("my-container");
    });
  });

  describe("containerize actions", () => {
    const workspaceId = "test-ws-id";

    it("containerize sets containerizing flag and stores proposed config on success", async () => {
      const mockJson = '{"image":"node:18"}';
      vi.mocked(containerizeRepo).mockResolvedValue(mockJson);

      await useDevContainerStore.getState().containerize(workspaceId);

      expect(containerizeRepo).toHaveBeenCalledWith(workspaceId);
      expect(
        useDevContainerStore.getState().containerizing[workspaceId],
      ).toBe(false);
      expect(
        useDevContainerStore.getState().proposedConfig[workspaceId],
      ).toBe(mockJson);
      expect(
        useDevContainerStore.getState().containerizeError[workspaceId],
      ).toBeNull();
    });

    it("containerize sets error on failure", async () => {
      vi.mocked(containerizeRepo).mockRejectedValue(
        new Error("analysis failed"),
      );

      await useDevContainerStore.getState().containerize(workspaceId);

      expect(
        useDevContainerStore.getState().containerizing[workspaceId],
      ).toBe(false);
      expect(
        useDevContainerStore.getState().containerizeError[workspaceId],
      ).toBe("analysis failed");
    });

    it("applyConfig calls IPC and clears proposed config", async () => {
      const configJson = '{"image":"node:18"}';
      useDevContainerStore.setState({
        proposedConfig: { [workspaceId]: configJson },
      });
      vi.mocked(applyDevcontainerConfig).mockResolvedValue(undefined);

      await useDevContainerStore
        .getState()
        .applyConfig(workspaceId, configJson, true);

      expect(applyDevcontainerConfig).toHaveBeenCalledWith(
        workspaceId,
        configJson,
        true,
        undefined,
      );
      expect(
        useDevContainerStore.getState().proposedConfig[workspaceId],
      ).toBeUndefined();
    });

    it("clearProposedConfig removes config for workspace", () => {
      const configJson = '{"image":"node:18"}';
      useDevContainerStore.setState({
        proposedConfig: { [workspaceId]: configJson },
      });

      useDevContainerStore.getState().clearProposedConfig(workspaceId);

      expect(
        useDevContainerStore.getState().proposedConfig[workspaceId],
      ).toBeUndefined();
    });
  });
});
