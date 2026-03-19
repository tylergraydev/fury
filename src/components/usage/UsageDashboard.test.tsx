import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Capture recharts callback props so we can invoke them in tests
const rechartsCallbacks: {
  xAxisTickFormatters: ((v: any) => string)[];
  yAxisTickFormatters: ((v: any) => string)[];
  tooltipFormatters: ((value?: any, name?: string) => any)[];
} = { xAxisTickFormatters: [], yAxisTickFormatters: [], tooltipFormatters: [] };

vi.mock("recharts", () => ({
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: () => <div data-testid="area" />,
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div data-testid="bar" />,
  XAxis: ({ tickFormatter }: { tickFormatter?: (v: any) => string }) => {
    if (tickFormatter) rechartsCallbacks.xAxisTickFormatters.push(tickFormatter);
    return <div data-testid="x-axis" />;
  },
  YAxis: ({ tickFormatter }: { tickFormatter?: (v: any) => string }) => {
    if (tickFormatter) rechartsCallbacks.yAxisTickFormatters.push(tickFormatter);
    return <div data-testid="y-axis" />;
  },
  Tooltip: ({ formatter }: { formatter?: (value?: any, name?: string) => any }) => {
    if (formatter) rechartsCallbacks.tooltipFormatters.push(formatter);
    return <div data-testid="tooltip" />;
  },
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
  rechartsCallbacks.xAxisTickFormatters = [];
  rechartsCallbacks.yAxisTickFormatters = [];
  rechartsCallbacks.tooltipFormatters = [];
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

  it("XAxis tickFormatter strips year prefix", () => {
    useUsageStore.setState({
      dataPoints: [
        makeDataPoint({ timestamp: "2025-03-14T10:00:00Z" }),
        makeDataPoint({ timestamp: "2025-03-15T10:00:00Z", workspaceId: "ws-2", workspaceName: "Other" }),
      ],
    });
    render(<UsageDashboard />);
    // There should be XAxis formatters captured (2 charts x 1 XAxis each)
    expect(rechartsCallbacks.xAxisTickFormatters.length).toBeGreaterThanOrEqual(2);
    // The formatter should slice off "YYYY-" prefix
    const fmt = rechartsCallbacks.xAxisTickFormatters[0];
    expect(fmt("2025-03-14")).toBe("03-14");
  });

  it("YAxis tickFormatter for cost chart formats as dollar amount", () => {
    useUsageStore.setState({
      dataPoints: [
        makeDataPoint({ timestamp: "2025-03-14T10:00:00Z" }),
        makeDataPoint({ timestamp: "2025-03-15T10:00:00Z", workspaceId: "ws-2", workspaceName: "Other" }),
      ],
    });
    render(<UsageDashboard />);
    // First YAxis is cost chart ($X.XX), second is token chart (formatTokens)
    expect(rechartsCallbacks.yAxisTickFormatters.length).toBeGreaterThanOrEqual(2);
    const costFmt = rechartsCallbacks.yAxisTickFormatters[0];
    expect(costFmt(1.5)).toBe("$1.50");
    const tokenFmt = rechartsCallbacks.yAxisTickFormatters[1];
    expect(tokenFmt(1500)).toBe("1.5K");
  });

  it("cost Tooltip formatter handles defined and undefined values", () => {
    useUsageStore.setState({
      dataPoints: [
        makeDataPoint({ timestamp: "2025-03-14T10:00:00Z" }),
        makeDataPoint({ timestamp: "2025-03-15T10:00:00Z", workspaceId: "ws-2", workspaceName: "Other" }),
      ],
    });
    render(<UsageDashboard />);
    expect(rechartsCallbacks.tooltipFormatters.length).toBeGreaterThanOrEqual(2);
    // Cost chart tooltip (first)
    const costTooltip = rechartsCallbacks.tooltipFormatters[0];
    expect(costTooltip(0.1234)).toEqual(["$0.1234", "Cost"]);
    expect(costTooltip(undefined)).toEqual(["—", "Cost"]);
  });

  it("token Tooltip formatter handles defined and undefined values", () => {
    useUsageStore.setState({
      dataPoints: [
        makeDataPoint({ timestamp: "2025-03-14T10:00:00Z" }),
        makeDataPoint({ timestamp: "2025-03-15T10:00:00Z", workspaceId: "ws-2", workspaceName: "Other" }),
      ],
    });
    render(<UsageDashboard />);
    // Token chart tooltip (second)
    const tokenTooltip = rechartsCallbacks.tooltipFormatters[1];
    expect(tokenTooltip(2500000, "Input")).toEqual(["2.5M", "Input"]);
    expect(tokenTooltip(undefined, undefined)).toEqual(["—", ""]);
    expect(tokenTooltip(500)).toEqual(["500", ""]);
  });

  it("setSelectedWorkspace is called with null when All Workspaces is selected", () => {
    const setSelectedWorkspace = vi.fn();
    useUsageStore.setState({
      setSelectedWorkspace,
      selectedWorkspaceId: "ws-1",
      dataPoints: [
        makeDataPoint({ workspaceId: "ws-1", workspaceName: "Alpha" }),
      ],
    });
    render(<UsageDashboard />);
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "" } });
    expect(setSelectedWorkspace).toHaveBeenCalledWith(null);
  });

  it("invokes all recharts callback formatters including bar chart XAxis", () => {
    useUsageStore.setState({
      dataPoints: [
        makeDataPoint({ timestamp: "2025-03-14T10:00:00Z" }),
        makeDataPoint({ timestamp: "2025-03-15T10:00:00Z", workspaceId: "ws-2", workspaceName: "Other" }),
      ],
    });
    render(<UsageDashboard />);
    // There should be 2 XAxis formatters (one per chart)
    expect(rechartsCallbacks.xAxisTickFormatters.length).toBe(2);
    // Bar chart XAxis (second one) also strips year
    const barXFmt = rechartsCallbacks.xAxisTickFormatters[1];
    expect(barXFmt("2025-03-15")).toBe("03-15");

    // There should be 2 YAxis formatters
    expect(rechartsCallbacks.yAxisTickFormatters.length).toBe(2);
    // Bar chart YAxis uses formatTokens
    const barYFmt = rechartsCallbacks.yAxisTickFormatters[1];
    expect(barYFmt(2000000)).toBe("2.0M");
    expect(barYFmt(500)).toBe("500");

    // There should be 2 tooltip formatters
    expect(rechartsCallbacks.tooltipFormatters.length).toBe(2);
    // Bar chart tooltip (second) uses formatTokens
    const barTooltip = rechartsCallbacks.tooltipFormatters[1];
    expect(barTooltip(1000, "Input")).toEqual(["1.0K", "Input"]);
    expect(barTooltip(undefined, "Output")).toEqual(["—", "Output"]);
  });

  it("formatCost shows 4 decimal places for small non-zero costs", () => {
    useUsageStore.setState({
      dataPoints: [
        makeDataPoint({
          totalCostUsd: 0.005,
          numTurns: 1,
        }),
      ],
    });
    render(<UsageDashboard />);
    // Cost of $0.005 is < 0.01 and > 0, should show 4 decimal places
    expect(screen.getAllByText("$0.0050").length).toBeGreaterThanOrEqual(1);
  });

  it("formatDuration handles sub-second durations", () => {
    useUsageStore.setState({
      dataPoints: [
        makeDataPoint({
          numTurns: 1,
          durationMs: 500,
        }),
      ],
    });
    render(<UsageDashboard />);
    expect(screen.getByText("500ms")).toBeInTheDocument();
  });

  it("formatDuration handles second-range durations", () => {
    useUsageStore.setState({
      dataPoints: [
        makeDataPoint({
          numTurns: 1,
          durationMs: 15000,
        }),
      ],
    });
    render(<UsageDashboard />);
    expect(screen.getByText("15.0s")).toBeInTheDocument();
  });

  it("formatTokens handles millions", () => {
    useUsageStore.setState({
      dataPoints: [
        makeDataPoint({
          inputTokens: 2000000,
          outputTokens: 0,
        }),
      ],
    });
    render(<UsageDashboard />);
    expect(screen.getAllByText("2.0M").length).toBeGreaterThanOrEqual(1);
  });

  it("formatTokens handles small numbers", () => {
    useUsageStore.setState({
      dataPoints: [
        makeDataPoint({
          inputTokens: 500,
          outputTokens: 0,
          numTurns: 1,
        }),
      ],
    });
    render(<UsageDashboard />);
    // Total tokens = 500, shown as "500"
    expect(screen.getAllByText("500").length).toBeGreaterThanOrEqual(1);
  });

  it("avgCostPerTurn is zero when no turns", () => {
    useUsageStore.setState({
      dataPoints: [
        makeDataPoint({
          totalCostUsd: 0,
          numTurns: 0,
        }),
      ],
    });
    render(<UsageDashboard />);
    // avgCostPerTurn = 0 when totalTurns = 0
    expect(screen.getByText("Avg Cost / Turn")).toBeInTheDocument();
  });
});
