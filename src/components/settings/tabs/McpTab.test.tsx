import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "./test-helpers";
import { AppSettingsPanel } from "../AppSettingsPanel";
import { useSettingsStore } from "../../../stores/settingsStore";

describe("McpTab", () => {
  const noopLoadMcp = vi.fn().mockResolvedValue(undefined);

  const goToMcpTab = () => {
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("MCP Servers"));
  };

  it("shows loading state", () => {
    useSettingsStore.setState({ loading: true, mcpServers: [], loadMcpServers: noopLoadMcp });
    goToMcpTab();
    expect(screen.getByText(/Loading MCP servers/)).toBeInTheDocument();
  });

  it("shows empty state when no servers", () => {
    useSettingsStore.setState({ loading: false, mcpServers: [], loadMcpServers: noopLoadMcp });
    goToMcpTab();
    expect(
      screen.getByText("No MCP servers configured."),
    ).toBeInTheDocument();
  });

  it("shows server list when servers exist", () => {
    useSettingsStore.setState({
      loading: false,
      mcpServers: [
        {
          name: "my-server",
          command: "npx",
          args: ["-y", "mcp-server"],
          env: {},
          scope: "user" as const,
        },
      ],
      loadMcpServers: noopLoadMcp,
    });
    goToMcpTab();
    expect(screen.getByText("my-server")).toBeInTheDocument();
    expect(screen.getByText("user")).toBeInTheDocument();
    expect(screen.getByText(/npx -y mcp-server/)).toBeInTheDocument();
  });

  it("removes a server when X button is clicked", async () => {
    const removeMcpServer = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({
      loading: false,
      mcpServers: [
        {
          name: "my-server",
          command: "npx",
          args: [],
          env: {},
          scope: "user" as const,
        },
      ],
      removeMcpServer,
      loadMcpServers: noopLoadMcp,
    });
    goToMcpTab();
    const serverRow = screen.getByText("my-server").closest("div");
    const removeBtn = serverRow!.querySelector("button");
    await act(async () => {
      fireEvent.click(removeBtn!);
    });
    expect(removeMcpServer).toHaveBeenCalledWith({
      name: "my-server",
      scope: "user",
    });
  });

  it("shows error when remove fails", async () => {
    const removeMcpServer = vi
      .fn()
      .mockRejectedValue(new Error("Remove failed"));
    useSettingsStore.setState({
      loading: false,
      mcpServers: [
        {
          name: "my-server",
          command: "npx",
          args: [],
          env: {},
          scope: "user" as const,
        },
      ],
      removeMcpServer,
      loadMcpServers: noopLoadMcp,
    });
    goToMcpTab();
    const serverRow = screen.getByText("my-server").closest("div");
    const removeBtn = serverRow!.querySelector("button");
    await act(async () => {
      fireEvent.click(removeBtn!);
    });
    await waitFor(() => {
      expect(screen.getByText("Error: Remove failed")).toBeInTheDocument();
    });
  });

  it("shows store error", () => {
    useSettingsStore.setState({
      loading: false,
      mcpServers: [],
      error: "Store error message",
      loadMcpServers: noopLoadMcp,
    });
    goToMcpTab();
    expect(screen.getByText("Store error message")).toBeInTheDocument();
  });

  it("shows add form when Add MCP Server is clicked", () => {
    goToMcpTab();
    fireEvent.click(screen.getByText("Add MCP Server"));
    expect(
      screen.getByPlaceholderText("Server name"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Command (e.g. npx, node)"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Arguments (space-separated)"),
    ).toBeInTheDocument();
  });

  it("hides add form when Cancel is clicked", () => {
    goToMcpTab();
    fireEvent.click(screen.getByText("Add MCP Server"));
    expect(
      screen.getByPlaceholderText("Server name"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Cancel"));
    expect(
      screen.queryByPlaceholderText("Server name"),
    ).not.toBeInTheDocument();
  });

  it("adds server successfully", async () => {
    const addMcpServer = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({
      loading: false,
      mcpServers: [],
      addMcpServer,
    });
    goToMcpTab();
    fireEvent.click(screen.getByText("Add MCP Server"));
    fireEvent.change(screen.getByPlaceholderText("Server name"), {
      target: { value: "new-server" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Command (e.g. npx, node)"),
      { target: { value: "npx" } },
    );
    fireEvent.change(
      screen.getByPlaceholderText("Arguments (space-separated)"),
      { target: { value: "-y @server/pkg" } },
    );
    await act(async () => {
      fireEvent.click(screen.getByText("Add Server"));
    });
    expect(addMcpServer).toHaveBeenCalledWith({
      name: "new-server",
      command: "npx",
      args: ["-y", "@server/pkg"],
      env: {},
      scope: "user",
    });
    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText("Server name"),
      ).not.toBeInTheDocument();
    });
  });

  it("does not add server with empty name and command", async () => {
    const addMcpServer = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({
      loading: false,
      mcpServers: [],
      addMcpServer,
    });
    goToMcpTab();
    fireEvent.click(screen.getByText("Add MCP Server"));
    await act(async () => {
      fireEvent.click(screen.getByText("Add Server"));
    });
    expect(addMcpServer).not.toHaveBeenCalled();
  });

  it("does not add server with name but empty command", async () => {
    const addMcpServer = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({
      loading: false,
      mcpServers: [],
      addMcpServer,
    });
    goToMcpTab();
    fireEvent.click(screen.getByText("Add MCP Server"));
    fireEvent.change(screen.getByPlaceholderText("Server name"), {
      target: { value: "has-name" },
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Add Server"));
    });
    expect(addMcpServer).not.toHaveBeenCalled();
  });

  it("shows error when add server fails", async () => {
    const addMcpServer = vi
      .fn()
      .mockRejectedValue(new Error("Add failed"));
    useSettingsStore.setState({
      loading: false,
      mcpServers: [],
      addMcpServer,
    });
    goToMcpTab();
    fireEvent.click(screen.getByText("Add MCP Server"));
    fireEvent.change(screen.getByPlaceholderText("Server name"), {
      target: { value: "bad-server" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Command (e.g. npx, node)"),
      { target: { value: "npx" } },
    );
    await act(async () => {
      fireEvent.click(screen.getByText("Add Server"));
    });
    await waitFor(() => {
      expect(screen.getByText("Error: Add failed")).toBeInTheDocument();
    });
  });

  it("switches scope via radio buttons", () => {
    goToMcpTab();
    fireEvent.click(screen.getByText("Add MCP Server"));
    const userRadio = screen.getByLabelText("User");
    const projectRadio = screen.getByLabelText("Project");
    expect(userRadio).toBeChecked();
    expect(projectRadio).not.toBeChecked();
    fireEvent.click(projectRadio);
    expect(projectRadio).toBeChecked();
  });

  it("shows Adding... while server is being added", async () => {
    let resolverFn: () => void;
    const addPromise = new Promise<void>((resolve) => {
      resolverFn = resolve;
    });
    const addMcpServer = vi.fn().mockReturnValue(addPromise);
    useSettingsStore.setState({
      loading: false,
      mcpServers: [],
      addMcpServer,
    });
    goToMcpTab();
    fireEvent.click(screen.getByText("Add MCP Server"));
    fireEvent.change(screen.getByPlaceholderText("Server name"), {
      target: { value: "test" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Command (e.g. npx, node)"),
      { target: { value: "npx" } },
    );
    fireEvent.click(screen.getByText("Add Server"));
    await waitFor(() => {
      expect(screen.getByText("Adding...")).toBeInTheDocument();
    });
    await act(async () => {
      resolverFn!();
    });
  });

  it("adds env vars to new server form", () => {
    goToMcpTab();
    fireEvent.click(screen.getByText("Add MCP Server"));
    const keyInputs = screen.getAllByPlaceholderText("KEY");
    const valueInputs = screen.getAllByPlaceholderText("value");
    const keyInput = keyInputs[keyInputs.length - 1];
    const valueInput = valueInputs[valueInputs.length - 1];
    fireEvent.change(keyInput, { target: { value: "SERVER_TOKEN" } });
    fireEvent.change(valueInput, { target: { value: "abc123" } });
    const addButtons = screen.getAllByText("Add");
    fireEvent.click(addButtons[addButtons.length - 1]);
    expect(screen.getByText("SERVER_TOKEN")).toBeInTheDocument();
    expect(screen.getByText("abc123")).toBeInTheDocument();
  });

  it("removes env var from new server form", () => {
    goToMcpTab();
    fireEvent.click(screen.getByText("Add MCP Server"));
    const keyInputs = screen.getAllByPlaceholderText("KEY");
    const valueInputs = screen.getAllByPlaceholderText("value");
    const keyInput = keyInputs[keyInputs.length - 1];
    const valueInput = valueInputs[valueInputs.length - 1];
    fireEvent.change(keyInput, { target: { value: "REMOVE_ME" } });
    fireEvent.change(valueInput, { target: { value: "val" } });
    const addButtons = screen.getAllByText("Add");
    fireEvent.click(addButtons[addButtons.length - 1]);
    expect(screen.getByText("REMOVE_ME")).toBeInTheDocument();
    const envRow = screen.getByText("REMOVE_ME").closest("div");
    const removeBtn = envRow!.querySelector("button");
    fireEvent.click(removeBtn!);
    expect(screen.queryByText("REMOVE_ME")).not.toBeInTheDocument();
  });

  it("adds server with env vars", async () => {
    const addMcpServer = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({
      loading: false,
      mcpServers: [],
      addMcpServer,
    });
    goToMcpTab();
    fireEvent.click(screen.getByText("Add MCP Server"));
    fireEvent.change(screen.getByPlaceholderText("Server name"), {
      target: { value: "env-server" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Command (e.g. npx, node)"),
      { target: { value: "node" } },
    );
    const keyInputs = screen.getAllByPlaceholderText("KEY");
    const valueInputs = screen.getAllByPlaceholderText("value");
    fireEvent.change(keyInputs[keyInputs.length - 1], {
      target: { value: "API_KEY" },
    });
    fireEvent.change(valueInputs[valueInputs.length - 1], {
      target: { value: "secret" },
    });
    const addBtns = screen.getAllByText("Add");
    fireEvent.click(addBtns[addBtns.length - 1]);
    await act(async () => {
      fireEvent.click(screen.getByText("Add Server"));
    });
    expect(addMcpServer).toHaveBeenCalledWith(
      expect.objectContaining({
        env: { API_KEY: "secret" },
      }),
    );
  });
});
