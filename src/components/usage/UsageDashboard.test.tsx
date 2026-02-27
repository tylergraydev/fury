import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("recharts", () => ({
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: () => <div data-testid="area" />,
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  Tooltip: () => <div data-testid="tooltip" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  Legend: () => <div data-testid="legend" />,
}));

vi.mock("lucide-react", () => ({
  RefreshCw: ({ className }: { className?: string }) => (
    <span data-testid="refresh-icon" className={className} />
  ),
}));

vi.mock("../../lib/tauri", () => ({
  getUsageData: vi.fn().mockResolvedValue([]),
}));

import { UsageDashboard } from "./UsageDashboard";
import { useUsageStore } from "../../stores/usageStore";
import type { UsageDataPoint } from "../../lib/tauri";

function makeDataPoint(overrides: Partial<UsageDataPoint> = {}): UsageDataPoint {
  return {
    workspaceId: "ws-1",
    workspaceName: "My Workspace",
    timestamp: "2025-03-15T10:00:00Z",
    totalCostUsd: 0.05,
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 200,
    cacheCreationTokens: 100,
    numTurns: 3,
    durationMs: 5000,
    ...overrides,
  };
}

// Override fetchUsageData to a no-op so the useEffect on mount doesn't reset state
const noopFetch = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  useUsageStore.setState({
    dataPoints: [],
    loading: false,
    error: null,
    timePeriod: "30d",
    selectedWorkspaceId: null,
    fetchUsageData: noopFetch,
  });
  vi.clearAllMocks();
});

describe("UsageDashboard", () => {
  it("renders time period filter buttons", () => {
    render(<UsageDashboard />);
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("7 days")).toBeInTheDocument();
    expect(screen.getByText("30 days")).toBeInTheDocument();
    expect(screen.getByText("All time")).toBeInTheDocument();
  });

  it("renders workspace filter dropdown", () => {
    render(<UsageDashboard />);
    expect(screen.getByText("All Workspaces")).toBeInTheDocument();
  });

  it("renders refresh button", () => {
    render(<UsageDashboard />);
    expect(screen.getByTitle("Refresh")).toBeInTheDocument();
  });

  it("shows loading indicator when loading", () => {
    useUsageStore.setState({ loading: true });
    render(<UsageDashboard />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows error banner when error is set", () => {
    useUsageStore.setState({ error: "Something went wrong" });
    render(<UsageDashboard />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("shows empty state when no data and not loading", () => {
    render(<UsageDashboard />);
    expect(screen.getByText("No usage data found")).toBeInTheDocument();
  });

  it("does not show empty state when loading", () => {
    useUsageStore.setState({ loading: true });
    render(<UsageDashboard />);
    expect(screen.queryByText("No usage data found")).not.toBeInTheDocument();
  });

  it("renders summary cards with data", () => {
    useUsageStore.setState({
      dataPoints: [
        makeDataPoint({
          totalCostUsd: 1.25,
          inputTokens: 50000,
          outputTokens: 25000,
          numTurns: 10,
          durationMs: 60000,
        }),
      ],
    });
    render(<UsageDashboard />);
    expect(screen.getByText("Total Cost")).toBeInTheDocument();
    // "$1.25" appears in both summary card and table row; verify at least one
    expect(screen.getAllByText("$1.25").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Total Tokens")).toBeInTheDocument();
    expect(screen.getByText("75.0K")).toBeInTheDocument();
    expect(screen.getByText("Total Turns")).toBeInTheDocument();
    // "10" appears in summary card and table row
    expect(screen.getAllByText("10").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Avg Cost / Turn")).toBeInTheDocument();
  });

  it("renders charts when time series data is available", () => {
    useUsageStore.setState({
      dataPoints: [
        makeDataPoint({ timestamp: "2025-03-14T10:00:00Z", totalCostUsd: 0.05 }),
        makeDataPoint({ timestamp: "2025-03-15T10:00:00Z", totalCostUsd: 0.10 }),
      ],
    });
    render(<UsageDashboard />);
    expect(screen.getByText("Cost Over Time")).toBeInTheDocument();
    expect(screen.getByText("Token Usage by Day")).toBeInTheDocument();
  });

  it("renders workspace breakdown table with data", () => {
    useUsageStore.setState({
      dataPoints: [
        makeDataPoint({
          workspaceId: "ws-1",
          workspaceName: "Alpha",
          totalCostUsd: 0.50,
        }),
        makeDataPoint({
          workspaceId: "ws-2",
          workspaceName: "Beta",
          totalCostUsd: 0.25,
        }),
      ],
    });
    render(<UsageDashboard />);
    expect(screen.getByText("Per-Workspace Breakdown")).toBeInTheDocument();
    // "Alpha"/"Beta" appear in both the filter dropdown and table; verify at least both exist
    expect(screen.getAllByText("Alpha").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Beta").length).toBeGreaterThanOrEqual(1);
  });

  it("populates workspace filter dropdown from data", () => {
    useUsageStore.setState({
      dataPoints: [
        makeDataPoint({ workspaceId: "ws-1", workspaceName: "Alpha" }),
        makeDataPoint({ workspaceId: "ws-2", workspaceName: "Beta" }),
      ],
    });
    render(<UsageDashboard />);
    const select = screen.getByRole("combobox");
    const options = select.querySelectorAll("option");
    // "All Workspaces" + 2 workspace options
    expect(options).toHaveLength(3);
    expect(options[1].textContent).toBe("Alpha");
    expect(options[2].textContent).toBe("Beta");
  });

  it("clicking time period button calls setTimePeriod", () => {
    const setTimePeriod = vi.fn();
    useUsageStore.setState({ setTimePeriod });
    render(<UsageDashboard />);
    fireEvent.click(screen.getByText("Today"));
    expect(setTimePeriod).toHaveBeenCalledWith("today");
  });

  it("clicking refresh calls fetchUsageData", () => {
    const fetchUsageData = vi.fn();
    useUsageStore.setState({ fetchUsageData });
    render(<UsageDashboard />);
    fireEvent.click(screen.getByTitle("Refresh"));
    expect(fetchUsageData).toHaveBeenCalled();
  });

  it("changing workspace filter calls setSelectedWorkspace", () => {
    const setSelectedWorkspace = vi.fn();
    useUsageStore.setState({
      setSelectedWorkspace,
      dataPoints: [
        makeDataPoint({ workspaceId: "ws-1", workspaceName: "Alpha" }),
      ],
    });
    render(<UsageDashboard />);
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "ws-1" } });
    expect(setSelectedWorkspace).toHaveBeenCalledWith("ws-1");
  });

  it("renders subtitle on summary cards", () => {
    useUsageStore.setState({
      dataPoints: [
        makeDataPoint({
          inputTokens: 50000,
          outputTokens: 25000,
          numTurns: 5,
          durationMs: 120000,
        }),
      ],
    });
    render(<UsageDashboard />);
    // Token subtitle shows "in / out"
    expect(screen.getByText("50.0K in / 25.0K out")).toBeInTheDocument();
    // Turns subtitle shows formatted duration
    expect(screen.getByText("2.0m")).toBeInTheDocument();
  });
});
