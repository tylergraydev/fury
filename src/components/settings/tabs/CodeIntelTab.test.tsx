import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "./test-helpers";
import { AppSettingsPanel } from "../AppSettingsPanel";
import { useLspStore } from "../../../stores/lspStore";

describe("CodeIntelTab", () => {
  function goToCodeIntelTab() {
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Code Intelligence"));
  }

  beforeEach(() => {
    useLspStore.setState({
      catalog: [],
      installedPlugins: [],
      loading: false,
      error: null,
      installingPlugins: [],
      loadCatalog: vi.fn(),
      loadInstalledPlugins: vi.fn(),
      installPlugin: vi.fn(),
      uninstallPlugin: vi.fn(),
    });
  });

  it("shows description text", () => {
    goToCodeIntelTab();
    expect(screen.getByText(/LSP plugins give Claude Code diagnostics/)).toBeInTheDocument();
  });

  it("shows loading state", () => {
    useLspStore.setState({ loading: true });
    goToCodeIntelTab();
    expect(screen.getByText(/Loading plugins/)).toBeInTheDocument();
  });

  it("shows empty state when no plugins installed", () => {
    goToCodeIntelTab();
    expect(screen.getByText("No LSP plugins installed.")).toBeInTheDocument();
  });

  it("shows installed plugins with Ready status when binary found", () => {
    useLspStore.setState({
      installedPlugins: [
        { name: "typescript-lsp", scope: "user", binaryFound: true, installHint: "npm i typescript-lsp", enabled: true, binaryName: "typescript-lsp" } as any,
      ],
    });
    goToCodeIntelTab();
    expect(screen.getByText("typescript-lsp")).toBeInTheDocument();
    expect(screen.getByText("user")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("shows binary not found warning when binary missing", () => {
    useLspStore.setState({
      installedPlugins: [
        { name: "rust-lsp", scope: "project", binaryFound: false, installHint: "cargo install rust-analyzer" } as any,
      ],
    });
    goToCodeIntelTab();
    expect(screen.getByText("rust-lsp")).toBeInTheDocument();
    expect(screen.getByText(/Binary not found/)).toBeInTheDocument();
    expect(screen.getByText(/cargo install rust-analyzer/)).toBeInTheDocument();
  });

  it("shows available plugins when catalog has uninstalled entries", () => {
    useLspStore.setState({
      catalog: [
        { pluginName: "python-lsp", language: "Python", binaryName: "pyright" } as any,
      ],
      installedPlugins: [],
    });
    goToCodeIntelTab();
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("python-lsp")).toBeInTheDocument();
    expect(screen.getByText(/requires: pyright/)).toBeInTheDocument();
    expect(screen.getByText("Install")).toBeInTheDocument();
  });

  it("does not show available section when all plugins are installed", () => {
    useLspStore.setState({
      catalog: [
        { pluginName: "ts-lsp", language: "TypeScript", binaryName: "tsc" } as any,
      ],
      installedPlugins: [
        { name: "ts-lsp", scope: "user", binaryFound: true, installHint: "" } as any,
      ],
    });
    goToCodeIntelTab();
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
  });

  it("calls installPlugin when Install button is clicked", async () => {
    const installPlugin = vi.fn().mockResolvedValue(undefined);
    useLspStore.setState({
      catalog: [
        { pluginName: "go-lsp", language: "Go", binaryName: "gopls" } as any,
      ],
      installedPlugins: [],
      installPlugin,
    });
    goToCodeIntelTab();
    await act(async () => {
      fireEvent.click(screen.getByText("Install"));
    });
    expect(installPlugin).toHaveBeenCalledWith("go-lsp", "user");
  });

  it("shows Installing... while install is in progress", () => {
    useLspStore.setState({
      catalog: [
        { pluginName: "go-lsp", language: "Go", binaryName: "gopls" } as any,
      ],
      installedPlugins: [],
      installingPlugins: ["go-lsp"],
    });
    goToCodeIntelTab();
    expect(screen.getByText(/Installing/)).toBeInTheDocument();
  });

  it("calls uninstallPlugin when remove button is clicked", async () => {
    const uninstallPlugin = vi.fn().mockResolvedValue(undefined);
    useLspStore.setState({
      installedPlugins: [
        { name: "ts-lsp", scope: "user", binaryFound: true, installHint: "" } as any,
      ],
      uninstallPlugin,
    });
    goToCodeIntelTab();
    const pluginRow = screen.getByText("ts-lsp").closest("div");
    const removeBtn = pluginRow!.querySelector("button");
    await act(async () => {
      fireEvent.click(removeBtn!);
    });
    expect(uninstallPlugin).toHaveBeenCalledWith("ts-lsp", "user");
  });

  it("shows store error", () => {
    useLspStore.setState({ error: "Store LSP error" });
    goToCodeIntelTab();
    expect(screen.getByText("Store LSP error")).toBeInTheDocument();
  });

  it("shows local error when install fails", async () => {
    const installPlugin = vi.fn().mockRejectedValue(new Error("Install failed"));
    useLspStore.setState({
      catalog: [
        { pluginName: "bad-lsp", language: "Bad", binaryName: "bad" } as any,
      ],
      installedPlugins: [],
      installPlugin,
    });
    goToCodeIntelTab();
    await act(async () => {
      fireEvent.click(screen.getByText("Install"));
    });
    await waitFor(() => {
      expect(screen.getByText(/Install failed/)).toBeInTheDocument();
    });
  });

  it("shows local error when uninstall fails", async () => {
    const uninstallPlugin = vi.fn().mockRejectedValue(new Error("Uninstall failed"));
    useLspStore.setState({
      installedPlugins: [
        { name: "fail-lsp", scope: "user", binaryFound: true, installHint: "" } as any,
      ],
      uninstallPlugin,
    });
    goToCodeIntelTab();
    const pluginRow = screen.getByText("fail-lsp").closest("div");
    const removeBtn = pluginRow!.querySelector("button");
    await act(async () => {
      fireEvent.click(removeBtn!);
    });
    await waitFor(() => {
      expect(screen.getByText(/Uninstall failed/)).toBeInTheDocument();
    });
  });

  it("switches install scope via radio buttons", () => {
    useLspStore.setState({
      catalog: [
        { pluginName: "py-lsp", language: "Python", binaryName: "pyright" } as any,
      ],
      installedPlugins: [],
    });
    goToCodeIntelTab();
    const userRadio = screen.getByLabelText("User");
    const projectRadio = screen.getByLabelText("Project");
    expect(userRadio).toBeChecked();
    fireEvent.click(projectRadio);
    expect(projectRadio).toBeChecked();
  });

  it("installs with project scope when selected", async () => {
    const installPlugin = vi.fn().mockResolvedValue(undefined);
    useLspStore.setState({
      catalog: [
        { pluginName: "py-lsp", language: "Python", binaryName: "pyright" } as any,
      ],
      installedPlugins: [],
      installPlugin,
    });
    goToCodeIntelTab();
    const projectRadio = screen.getByLabelText("Project");
    fireEvent.click(projectRadio);
    await act(async () => {
      fireEvent.click(screen.getByText("Install"));
    });
    expect(installPlugin).toHaveBeenCalledWith("py-lsp", "project");
  });
});
