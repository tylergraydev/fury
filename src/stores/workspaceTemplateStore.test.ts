import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../lib/tauri", () => ({
  listWorkspaceTemplates: vi.fn(),
  createWorkspaceTemplate: vi.fn(),
  updateWorkspaceTemplate: vi.fn(),
  deleteWorkspaceTemplate: vi.fn(),
}));

import { useWorkspaceTemplateStore } from "./workspaceTemplateStore";
import {
  listWorkspaceTemplates,
  createWorkspaceTemplate,
  updateWorkspaceTemplate,
  deleteWorkspaceTemplate,
} from "../lib/tauri";
import type { WorkspaceTemplate } from "../lib/tauri";

function makeTemplate(
  overrides: Partial<WorkspaceTemplate> = {},
): WorkspaceTemplate {
  return {
    id: "tmpl-1",
    repoId: "repo-1",
    name: "test-template",
    description: null,
    setupScript: null,
    runScript: null,
    archiveScript: null,
    runScriptMode: "nonconcurrent",
    envVars: {},
    sparseDirs: null,
    autoCommit: true,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  useWorkspaceTemplateStore.setState({
    templates: [],
    loading: false,
    error: null,
  });
  vi.clearAllMocks();
});

describe("workspaceTemplateStore - loadTemplates", () => {
  it("loads templates and sets loading state", async () => {
    const templates = [makeTemplate()];
    vi.mocked(listWorkspaceTemplates).mockResolvedValue(templates);

    await useWorkspaceTemplateStore.getState().loadTemplates("repo-1");

    expect(useWorkspaceTemplateStore.getState().templates).toEqual(templates);
    expect(useWorkspaceTemplateStore.getState().loading).toBe(false);
    expect(listWorkspaceTemplates).toHaveBeenCalledWith("repo-1");
  });

  it("sets error on failure", async () => {
    vi.mocked(listWorkspaceTemplates).mockRejectedValue(new Error("fail"));

    await useWorkspaceTemplateStore.getState().loadTemplates("repo-1");

    expect(useWorkspaceTemplateStore.getState().error).toBe("Error: fail");
    expect(useWorkspaceTemplateStore.getState().loading).toBe(false);
  });
});

describe("workspaceTemplateStore - createTemplate", () => {
  it("creates a template and adds it to the list", async () => {
    const template = makeTemplate({ id: "tmpl-new" });
    vi.mocked(createWorkspaceTemplate).mockResolvedValue(template);

    const result = await useWorkspaceTemplateStore
      .getState()
      .createTemplate({ repoId: "repo-1", name: "new-template" });

    expect(result).toEqual(template);
    expect(useWorkspaceTemplateStore.getState().templates).toEqual([template]);
    expect(createWorkspaceTemplate).toHaveBeenCalledWith({
      repoId: "repo-1",
      name: "new-template",
    });
  });

  it("sets error on failure", async () => {
    vi.mocked(createWorkspaceTemplate).mockRejectedValue(
      new Error("duplicate name"),
    );

    await expect(
      useWorkspaceTemplateStore
        .getState()
        .createTemplate({ repoId: "repo-1", name: "dup" }),
    ).rejects.toThrow("duplicate name");

    expect(useWorkspaceTemplateStore.getState().error).toBe(
      "Error: duplicate name",
    );
  });
});

describe("workspaceTemplateStore - updateTemplate", () => {
  it("updates a template in the list", async () => {
    const original = makeTemplate();
    const updated = makeTemplate({ name: "renamed" });
    useWorkspaceTemplateStore.setState({ templates: [original] });
    vi.mocked(updateWorkspaceTemplate).mockResolvedValue(updated);

    await useWorkspaceTemplateStore
      .getState()
      .updateTemplate("tmpl-1", { name: "renamed" });

    expect(useWorkspaceTemplateStore.getState().templates[0].name).toBe(
      "renamed",
    );
    expect(updateWorkspaceTemplate).toHaveBeenCalledWith("tmpl-1", {
      name: "renamed",
    });
  });

  it("leaves non-matching templates unchanged during update", async () => {
    const t1 = makeTemplate({ id: "tmpl-1", name: "first" });
    const t2 = makeTemplate({ id: "tmpl-2", name: "second" });
    useWorkspaceTemplateStore.setState({ templates: [t1, t2] });
    const updated = makeTemplate({ id: "tmpl-1", name: "renamed" });
    vi.mocked(updateWorkspaceTemplate).mockResolvedValue(updated);

    await useWorkspaceTemplateStore
      .getState()
      .updateTemplate("tmpl-1", { name: "renamed" });

    const templates = useWorkspaceTemplateStore.getState().templates;
    expect(templates[0].name).toBe("renamed");
    expect(templates[1].name).toBe("second");
  });

  it("sets error on failure", async () => {
    const original = makeTemplate();
    useWorkspaceTemplateStore.setState({ templates: [original] });
    vi.mocked(updateWorkspaceTemplate).mockRejectedValue(
      new Error("not found"),
    );

    await expect(
      useWorkspaceTemplateStore
        .getState()
        .updateTemplate("tmpl-1", { name: "x" }),
    ).rejects.toThrow("not found");

    expect(useWorkspaceTemplateStore.getState().error).toBe(
      "Error: not found",
    );
  });
});

describe("workspaceTemplateStore - deleteTemplate", () => {
  it("removes a template from the list", async () => {
    const t1 = makeTemplate({ id: "tmpl-1" });
    const t2 = makeTemplate({ id: "tmpl-2", name: "second" });
    useWorkspaceTemplateStore.setState({ templates: [t1, t2] });
    vi.mocked(deleteWorkspaceTemplate).mockResolvedValue(undefined);

    await useWorkspaceTemplateStore.getState().deleteTemplate("tmpl-1");

    expect(useWorkspaceTemplateStore.getState().templates).toEqual([t2]);
    expect(deleteWorkspaceTemplate).toHaveBeenCalledWith("tmpl-1");
  });

  it("sets error on failure", async () => {
    const t1 = makeTemplate();
    useWorkspaceTemplateStore.setState({ templates: [t1] });
    vi.mocked(deleteWorkspaceTemplate).mockRejectedValue(
      new Error("db error"),
    );

    await expect(
      useWorkspaceTemplateStore.getState().deleteTemplate("tmpl-1"),
    ).rejects.toThrow("db error");

    expect(useWorkspaceTemplateStore.getState().error).toBe(
      "Error: db error",
    );
    // Template should still be in list since delete failed
    expect(useWorkspaceTemplateStore.getState().templates).toEqual([t1]);
  });
});
