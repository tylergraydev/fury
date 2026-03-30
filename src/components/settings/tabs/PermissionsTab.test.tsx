import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PermissionsTab } from "./PermissionsTab";

vi.mock("lucide-react", () => ({
  ShieldCheck: () => <span data-testid="icon-shield-check" />,
  ShieldX: () => <span data-testid="icon-shield-x" />,
  Plus: () => <span data-testid="icon-plus" />,
  RotateCcw: () => <span data-testid="icon-rotate" />,
}));

const mockGetPermissions = vi.fn();
const mockAddPermissions = vi.fn();
const mockRemovePermissions = vi.fn();

vi.mock("../../../lib/tauri/agent", () => ({
  getClaudePermissions: (...args: unknown[]) => mockGetPermissions(...args),
  addClaudePermissions: (...args: unknown[]) => mockAddPermissions(...args),
  removeClaudePermissions: (...args: unknown[]) => mockRemovePermissions(...args),
}));

describe("PermissionsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPermissions.mockResolvedValue({
      permissions: { allow: [] },
      settingsPath: "/Users/test/.claude/settings.json",
    });
    mockAddPermissions.mockResolvedValue({ allow: [] });
    mockRemovePermissions.mockResolvedValue({ allow: [] });
  });

  it("shows loading state initially", () => {
    // Don't resolve the promise yet
    mockGetPermissions.mockReturnValue(new Promise(() => {}));
    render(<PermissionsTab />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders presets after loading", async () => {
    render(<PermissionsTab />);

    await waitFor(() => {
      expect(screen.getByText("Read-only tools")).toBeInTheDocument();
    });

    expect(screen.getByText("File editing")).toBeInTheDocument();
    expect(screen.getByText("Shell commands")).toBeInTheDocument();
    expect(screen.getByText("MCP tools")).toBeInTheDocument();
    expect(screen.getByText("Agent tools")).toBeInTheDocument();
  });

  it("shows settings path from backend", async () => {
    render(<PermissionsTab />);
    await waitFor(() => {
      expect(
        screen.getByText("/Users/test/.claude/settings.json"),
      ).toBeInTheDocument();
    });
  });

  it("shows Apply button for unapplied presets", async () => {
    render(<PermissionsTab />);
    await waitFor(() => {
      expect(screen.getByText("Read-only tools")).toBeInTheDocument();
    });

    // All presets should show "Apply" since no rules are active
    const applyButtons = screen.getAllByText("Apply");
    expect(applyButtons.length).toBe(5);
  });

  it("shows Remove button for fully applied presets", async () => {
    mockGetPermissions.mockResolvedValue({
      permissions: { allow: ["Read", "Glob", "Grep", "LS"] },
      settingsPath: "/test",
    });

    render(<PermissionsTab />);
    await waitFor(() => {
      expect(screen.getByText("Read-only tools")).toBeInTheDocument();
    });

    // Read-only tools preset should show "Remove" since all its rules are active
    expect(screen.getByText("Remove")).toBeInTheDocument();
  });

  it("shows 'partial' badge when some preset rules are applied", async () => {
    mockGetPermissions.mockResolvedValue({
      permissions: { allow: ["Read", "Glob"] }, // Only 2 of 4 read-only rules
      settingsPath: "/test",
    });

    render(<PermissionsTab />);
    await waitFor(() => {
      expect(screen.getByText("partial")).toBeInTheDocument();
    });
  });

  it("clicking Apply calls addClaudePermissions with preset rules", async () => {
    mockAddPermissions.mockResolvedValue({
      allow: ["Read", "Glob", "Grep", "LS"],
    });

    render(<PermissionsTab />);
    await waitFor(() => {
      expect(screen.getByText("Read-only tools")).toBeInTheDocument();
    });

    // Click the first "Apply" button (for Read-only tools)
    fireEvent.click(screen.getAllByText("Apply")[0]);

    await waitFor(() => {
      expect(mockAddPermissions).toHaveBeenCalledWith([
        "Read",
        "Glob",
        "Grep",
        "LS",
      ]);
    });
  });

  it("clicking Remove calls removeClaudePermissions with preset rules", async () => {
    mockGetPermissions.mockResolvedValue({
      permissions: { allow: ["Read", "Glob", "Grep", "LS"] },
      settingsPath: "/test",
    });
    mockRemovePermissions.mockResolvedValue({ allow: [] });

    render(<PermissionsTab />);
    await waitFor(() => {
      expect(screen.getByText("Remove")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Remove"));

    await waitFor(() => {
      expect(mockRemovePermissions).toHaveBeenCalledWith([
        "Read",
        "Glob",
        "Grep",
        "LS",
      ]);
    });
  });

  it("shows current rules list when rules exist", async () => {
    mockGetPermissions.mockResolvedValue({
      permissions: { allow: ["Write", "Bash(npm test)"] },
      settingsPath: "/test",
    });

    render(<PermissionsTab />);
    await waitFor(() => {
      expect(screen.getByText("Current Allow Rules")).toBeInTheDocument();
    });
    // Rules appear as code elements in the current rules section
    expect(screen.getByText("Bash(npm test)")).toBeInTheDocument();
  });

  it("shows empty state when no rules configured", async () => {
    render(<PermissionsTab />);
    await waitFor(() => {
      expect(
        screen.getByText(
          "No allow rules configured. The agent will prompt for every tool use.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("clicking remove on individual rule calls removeClaudePermissions", async () => {
    mockGetPermissions.mockResolvedValue({
      permissions: { allow: ["Bash(npm test)"] },
      settingsPath: "/test",
    });
    mockRemovePermissions.mockResolvedValue({ allow: [] });

    render(<PermissionsTab />);
    await waitFor(() => {
      expect(screen.getByText("Bash(npm test)")).toBeInTheDocument();
    });

    const removeBtn = screen.getByTitle("Remove rule");
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(mockRemovePermissions).toHaveBeenCalledWith(["Bash(npm test)"]);
    });
  });

  it("custom rule input and Add button work", async () => {
    mockAddPermissions.mockResolvedValue({ allow: ["MyCustomRule"] });

    render(<PermissionsTab />);
    await waitFor(() => {
      expect(screen.getByText("Add Custom Rule")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(
      "e.g. Bash(npm test), Write, mcp__github__*",
    );
    fireEvent.change(input, { target: { value: "MyCustomRule" } });
    fireEvent.click(screen.getByText("Add"));

    await waitFor(() => {
      expect(mockAddPermissions).toHaveBeenCalledWith(["MyCustomRule"]);
    });
  });

  it("Enter key submits custom rule", async () => {
    mockAddPermissions.mockResolvedValue({ allow: ["EnterRule"] });

    render(<PermissionsTab />);
    await waitFor(() => {
      expect(screen.getByText("Add Custom Rule")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(
      "e.g. Bash(npm test), Write, mcp__github__*",
    );
    fireEvent.change(input, { target: { value: "EnterRule" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(mockAddPermissions).toHaveBeenCalledWith(["EnterRule"]);
    });
  });

  it("Add button is disabled when custom rule is empty", async () => {
    render(<PermissionsTab />);
    await waitFor(() => {
      expect(screen.getByText("Add Custom Rule")).toBeInTheDocument();
    });

    const addBtn = screen.getByText("Add");
    expect(addBtn).toBeDisabled();
  });

  it("does not submit custom rule when text is whitespace only", async () => {
    render(<PermissionsTab />);
    await waitFor(() => {
      expect(screen.getByText("Add Custom Rule")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(
      "e.g. Bash(npm test), Write, mcp__github__*",
    );
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockAddPermissions).not.toHaveBeenCalled();
  });

  it("handles API error gracefully on load", async () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockGetPermissions.mockRejectedValue(new Error("Network error"));

    render(<PermissionsTab />);

    await waitFor(() => {
      // Should still render (not crash), loading should finish
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });

    consoleSpy.mockRestore();
  });

  it("handles API error gracefully on add", async () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockAddPermissions.mockRejectedValue(new Error("Save failed"));

    render(<PermissionsTab />);
    await waitFor(() => {
      expect(screen.getByText("Read-only tools")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText("Apply")[0]);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    });

    consoleSpy.mockRestore();
  });
});
