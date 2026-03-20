import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "./test-helpers.test";
import { mockDetectCursorrules, mockImportCursorrules } from "./test-helpers.test";
import { AppSettingsPanel } from "../AppSettingsPanel";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useRepositoryStore } from "../../../stores/repositoryStore";

describe("MigrationTab", () => {
  const noopCheckCursor = vi.fn().mockResolvedValue(undefined);

  const goToMigrationTab = () => {
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Migration"));
  };

  it("shows Checking status when cursorDetected is null", () => {
    useSettingsStore.setState({ cursorDetected: null, checkCursorConfig: noopCheckCursor });
    goToMigrationTab();
    expect(screen.getByText("Checking...")).toBeInTheDocument();
  });

  it("shows detected when cursorDetected is true", () => {
    useSettingsStore.setState({ cursorDetected: true, checkCursorConfig: noopCheckCursor });
    goToMigrationTab();
    expect(screen.getByText(/Cursor config detected/)).toBeInTheDocument();
  });

  it("shows not found when cursorDetected is false", () => {
    useSettingsStore.setState({ cursorDetected: false });
    goToMigrationTab();
    expect(screen.getByText("No Cursor config found")).toBeInTheDocument();
  });

  it("Import button is disabled when cursorDetected is false", () => {
    useSettingsStore.setState({ cursorDetected: false });
    goToMigrationTab();
    const importBtn = screen.getByText("Import MCP Servers");
    expect(importBtn).toBeDisabled();
  });

  it("imports MCP servers when button is clicked", async () => {
    const importCursor = vi.fn().mockResolvedValue({
      mcpServersFound: 3,
      mcpServersImported: 2,
      rulesFound: false,
    });
    useSettingsStore.setState({
      cursorDetected: true,
      importCursor,
      checkCursorConfig: noopCheckCursor,
    });
    goToMigrationTab();
    await act(async () => {
      fireEvent.click(screen.getByText("Import MCP Servers"));
    });
    expect(importCursor).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText(/Imported 2 of 3 MCP servers/)).toBeInTheDocument();
    });
  });

  it("shows Importing... while importing", async () => {
    let resolverFn: (v: any) => void;
    const importPromise = new Promise((resolve) => {
      resolverFn = resolve;
    });
    const importCursor = vi.fn().mockReturnValue(importPromise);
    useSettingsStore.setState({
      cursorDetected: true,
      importCursor,
      checkCursorConfig: noopCheckCursor,
    });
    goToMigrationTab();
    fireEvent.click(screen.getByText("Import MCP Servers"));
    await waitFor(() => {
      expect(screen.getByText("Importing...")).toBeInTheDocument();
    });
    await act(async () => {
      resolverFn!({
        mcpServersFound: 1,
        mcpServersImported: 1,
        rulesFound: false,
      });
    });
  });

  it("shows error when import fails", async () => {
    const importCursor = vi
      .fn()
      .mockRejectedValue(new Error("Import failed"));
    useSettingsStore.setState({
      cursorDetected: true,
      importCursor,
      checkCursorConfig: noopCheckCursor,
    });
    goToMigrationTab();
    await act(async () => {
      fireEvent.click(screen.getByText("Import MCP Servers"));
    });
    await waitFor(() => {
      expect(screen.getByText("Error: Import failed")).toBeInTheDocument();
    });
  });

  it("shows repository selector for cursorrules", () => {
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "my-repo", path: "/path" } as any,
        { id: "repo2", name: "other-repo", path: "/other" } as any,
      ],
    });
    goToMigrationTab();
    expect(screen.getByText("Select a repository")).toBeInTheDocument();
    expect(screen.getByText("my-repo")).toBeInTheDocument();
    expect(screen.getByText("other-repo")).toBeInTheDocument();
  });

  it("detects cursorrules when repo is selected", async () => {
    mockDetectCursorrules.mockResolvedValue(true);
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "my-repo", path: "/path" } as any,
      ],
    });
    goToMigrationTab();
    const select = screen.getByDisplayValue("Select a repository");
    fireEvent.change(select, { target: { value: "repo1" } });
    await waitFor(() => {
      expect(mockDetectCursorrules).toHaveBeenCalledWith("repo1");
      expect(screen.getByText(".cursorrules found")).toBeInTheDocument();
    });
  });

  it("shows not found when cursorrules not detected", async () => {
    mockDetectCursorrules.mockResolvedValue(false);
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "my-repo", path: "/path" } as any,
      ],
    });
    goToMigrationTab();
    const select = screen.getByDisplayValue("Select a repository");
    fireEvent.change(select, { target: { value: "repo1" } });
    await waitFor(() => {
      expect(screen.getByText("No .cursorrules file in this repo")).toBeInTheDocument();
    });
  });

  it("shows Checking... while detecting cursorrules", async () => {
    let resolverFn: (v: boolean) => void;
    mockDetectCursorrules.mockImplementation(
      () => new Promise((resolve) => {
        resolverFn = resolve;
      }),
    );
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "my-repo", path: "/path" } as any,
      ],
    });
    goToMigrationTab();
    const select = screen.getByDisplayValue("Select a repository");
    fireEvent.change(select, { target: { value: "repo1" } });
    await waitFor(() => {
      const checkingTexts = screen.getAllByText("Checking...");
      expect(checkingTexts.length).toBeGreaterThanOrEqual(1);
    });
    await act(async () => {
      resolverFn!(true);
    });
  });

  it("handles detectCursorrules error by setting false", async () => {
    mockDetectCursorrules.mockRejectedValue(new Error("detect error"));
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "my-repo", path: "/path" } as any,
      ],
    });
    goToMigrationTab();
    const select = screen.getByDisplayValue("Select a repository");
    fireEvent.change(select, { target: { value: "repo1" } });
    await waitFor(() => {
      expect(screen.getByText("No .cursorrules file in this repo")).toBeInTheDocument();
    });
  });

  it("converts cursorrules to CLAUDE.md", async () => {
    mockDetectCursorrules.mockResolvedValue(true);
    mockImportCursorrules.mockResolvedValue({
      rulesFound: true,
      claudeMdExisted: false,
      written: true,
      claudeMdPath: "/repo/CLAUDE.md",
    });
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "my-repo", path: "/path" } as any,
      ],
    });
    goToMigrationTab();
    const select = screen.getByDisplayValue("Select a repository");
    fireEvent.change(select, { target: { value: "repo1" } });
    await waitFor(() => {
      expect(screen.getByText("Convert to CLAUDE.md")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Convert to CLAUDE.md"));
    });
    expect(mockImportCursorrules).toHaveBeenCalledWith("repo1", false);
    await waitFor(() => {
      expect(screen.getByText(/CLAUDE\.md created at \/repo\/CLAUDE\.md/)).toBeInTheDocument();
    });
  });

  it("shows merged message when claudeMdExisted is true and written", async () => {
    mockDetectCursorrules.mockResolvedValue(true);
    mockImportCursorrules.mockResolvedValue({
      rulesFound: true,
      claudeMdExisted: true,
      written: true,
      claudeMdPath: "/repo/CLAUDE.md",
    });
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "my-repo", path: "/path" } as any,
      ],
    });
    goToMigrationTab();
    const select = screen.getByDisplayValue("Select a repository");
    fireEvent.change(select, { target: { value: "repo1" } });
    await waitFor(() => {
      expect(screen.getByText("Convert to CLAUDE.md")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Convert to CLAUDE.md"));
    });
    await waitFor(() => {
      expect(screen.getByText(/CLAUDE\.md merged at \/repo\/CLAUDE\.md/)).toBeInTheDocument();
    });
  });

  it("shows existing CLAUDE.md warning and merge button", async () => {
    mockDetectCursorrules.mockResolvedValue(true);
    mockImportCursorrules.mockResolvedValue({
      rulesFound: true,
      claudeMdExisted: true,
      written: false,
      claudeMdPath: "/repo/CLAUDE.md",
    });
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "my-repo", path: "/path" } as any,
      ],
    });
    goToMigrationTab();
    const select = screen.getByDisplayValue("Select a repository");
    fireEvent.change(select, { target: { value: "repo1" } });
    await waitFor(() => {
      expect(screen.getByText("Convert to CLAUDE.md")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Convert to CLAUDE.md"));
    });
    await waitFor(() => {
      expect(screen.getByText(/CLAUDE\.md already exists/)).toBeInTheDocument();
      expect(screen.getByText("Merge into existing CLAUDE.md")).toBeInTheDocument();
    });
  });

  it("merge button calls importCursorrules with overwrite=true", async () => {
    mockDetectCursorrules.mockResolvedValue(true);
    mockImportCursorrules
      .mockResolvedValueOnce({
        rulesFound: true,
        claudeMdExisted: true,
        written: false,
        claudeMdPath: "/repo/CLAUDE.md",
      })
      .mockResolvedValueOnce({
        rulesFound: true,
        claudeMdExisted: true,
        written: true,
        claudeMdPath: "/repo/CLAUDE.md",
      });
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "my-repo", path: "/path" } as any,
      ],
    });
    goToMigrationTab();
    const select = screen.getByDisplayValue("Select a repository");
    fireEvent.change(select, { target: { value: "repo1" } });
    await waitFor(() => {
      expect(screen.getByText("Convert to CLAUDE.md")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Convert to CLAUDE.md"));
    });
    await waitFor(() => {
      expect(screen.getByText("Merge into existing CLAUDE.md")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Merge into existing CLAUDE.md"));
    });
    expect(mockImportCursorrules).toHaveBeenLastCalledWith("repo1", true);
  });

  it("shows rules import error", async () => {
    mockDetectCursorrules.mockResolvedValue(true);
    mockImportCursorrules.mockRejectedValue(new Error("Import rules failed"));
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "my-repo", path: "/path" } as any,
      ],
    });
    goToMigrationTab();
    const select = screen.getByDisplayValue("Select a repository");
    fireEvent.change(select, { target: { value: "repo1" } });
    await waitFor(() => {
      expect(screen.getByText("Convert to CLAUDE.md")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Convert to CLAUDE.md"));
    });
    await waitFor(() => {
      expect(screen.getByText("Error: Import rules failed")).toBeInTheDocument();
    });
  });

  it("shows Converting... while rules import is in progress", async () => {
    mockDetectCursorrules.mockResolvedValue(true);
    let resolverFn: (v: any) => void;
    mockImportCursorrules.mockImplementation(
      () => new Promise((resolve) => {
        resolverFn = resolve;
      }),
    );
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "my-repo", path: "/path" } as any,
      ],
    });
    goToMigrationTab();
    const select = screen.getByDisplayValue("Select a repository");
    fireEvent.change(select, { target: { value: "repo1" } });
    await waitFor(() => {
      expect(screen.getByText("Convert to CLAUDE.md")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Convert to CLAUDE.md"));
    await waitFor(() => {
      expect(screen.getByText("Converting...")).toBeInTheDocument();
    });
    await act(async () => {
      resolverFn!({
        rulesFound: true,
        claudeMdExisted: false,
        written: true,
        claudeMdPath: "/repo/CLAUDE.md",
      });
    });
  });

  it("shows No .cursorrules found when result is not written and claudeMdExisted is false", async () => {
    mockDetectCursorrules.mockResolvedValue(true);
    mockImportCursorrules.mockResolvedValue({
      rulesFound: false,
      claudeMdExisted: false,
      written: false,
      claudeMdPath: "",
    });
    useRepositoryStore.setState({
      repositories: [
        { id: "repo1", name: "my-repo", path: "/path" } as any,
      ],
    });
    goToMigrationTab();
    const select = screen.getByDisplayValue("Select a repository");
    fireEvent.change(select, { target: { value: "repo1" } });
    await waitFor(() => {
      expect(screen.getByText("Convert to CLAUDE.md")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Convert to CLAUDE.md"));
    });
    await waitFor(() => {
      expect(screen.getByText("No .cursorrules found.")).toBeInTheDocument();
    });
  });

  it("does not call handleRulesImport when no repo is selected", async () => {
    mockDetectCursorrules.mockResolvedValue(true);
    goToMigrationTab();
    expect(screen.queryByText("Convert to CLAUDE.md")).not.toBeInTheDocument();
  });

  it("shows helper text at the bottom", () => {
    goToMigrationTab();
    expect(screen.getByText(/Import MCP servers from Cursor/)).toBeInTheDocument();
  });
});
