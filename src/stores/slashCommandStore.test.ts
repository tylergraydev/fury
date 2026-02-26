import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../lib/tauri", () => ({
  listSlashCommands: vi.fn(),
}));

import { useSlashCommandStore } from "./slashCommandStore";
import { listSlashCommands } from "../lib/tauri";

const makeCmd = (name: string) => ({
  name,
  description: `Description for ${name}`,
});

beforeEach(() => {
  useSlashCommandStore.setState(
    { commands: {}, loading: {}, error: {} },
  );
  vi.clearAllMocks();
});

describe("slashCommandStore - loadCommands", () => {
  it("loads commands for a context", async () => {
    const cmds = [makeCmd("/help"), makeCmd("/clear")];
    vi.mocked(listSlashCommands).mockResolvedValue(cmds as any);
    await useSlashCommandStore.getState().loadCommands("ws-1");
    expect(useSlashCommandStore.getState().commands["ws-1"]).toEqual(cmds);
    expect(useSlashCommandStore.getState().loading["ws-1"]).toBe(false);
  });

  it("deduplicates concurrent calls", async () => {
    let resolve: (v: any) => void;
    vi.mocked(listSlashCommands).mockImplementation(
      () => new Promise((r) => { resolve = r; }),
    );
    const p1 = useSlashCommandStore.getState().loadCommands("ws-1");
    const p2 = useSlashCommandStore.getState().loadCommands("ws-1");
    resolve!([makeCmd("/help")] as any);
    await Promise.all([p1, p2]);
    expect(listSlashCommands).toHaveBeenCalledTimes(1);
  });

  it("sets error on failure", async () => {
    vi.mocked(listSlashCommands).mockRejectedValue(new Error("fail"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await useSlashCommandStore.getState().loadCommands("ws-1");
    expect(useSlashCommandStore.getState().error["ws-1"]).toBe("Error: fail");
  });
});

describe("slashCommandStore - getCommands", () => {
  it("returns commands for a known context", () => {
    const cmds = [makeCmd("/help")];
    useSlashCommandStore.setState({ commands: { "ws-1": cmds as any } });
    expect(useSlashCommandStore.getState().getCommands("ws-1")).toEqual(cmds);
  });

  it("returns empty array for unknown context", () => {
    expect(useSlashCommandStore.getState().getCommands("unknown")).toEqual([]);
  });
});

describe("slashCommandStore - findMatching", () => {
  it("filters commands by case-insensitive prefix", () => {
    const cmds = [makeCmd("/help"), makeCmd("/history"), makeCmd("/clear")];
    useSlashCommandStore.setState({ commands: { "ws-1": cmds as any } });
    const result = useSlashCommandStore.getState().findMatching("ws-1", "/h");
    expect(result).toHaveLength(2);
    expect(result.map((c: any) => c.name)).toEqual(["/help", "/history"]);
  });

  it("returns all commands when prefix is empty", () => {
    const cmds = [makeCmd("/help"), makeCmd("/clear")];
    useSlashCommandStore.setState({ commands: { "ws-1": cmds as any } });
    const result = useSlashCommandStore.getState().findMatching("ws-1", "");
    expect(result).toHaveLength(2);
  });

  it("returns empty array for no matches", () => {
    const cmds = [makeCmd("/help")];
    useSlashCommandStore.setState({ commands: { "ws-1": cmds as any } });
    const result = useSlashCommandStore.getState().findMatching("ws-1", "/z");
    expect(result).toHaveLength(0);
  });

  it("returns empty array for unknown context", () => {
    const result = useSlashCommandStore.getState().findMatching("unknown", "/h");
    expect(result).toEqual([]);
  });
});

describe("slashCommandStore - addDiscoveredSkills", () => {
  it("stores discovered skills for a context", () => {
    const skills = [
      { name: "commit", source: "plugin" as const, description: "Create commit", content: "/commit" },
    ];
    useSlashCommandStore.getState().addDiscoveredSkills("ctx-1", skills as any);
    expect(useSlashCommandStore.getState().discoveredSkills["ctx-1"]).toEqual(skills);
  });
});
