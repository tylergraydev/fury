import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ContainerizePanel from "./ContainerizePanel";
import { useDevContainerStore } from "../../stores/devContainerStore";

vi.mock("../../stores/devContainerStore");

vi.mock("@monaco-editor/react", () => ({
  default: ({ value, onChange }: { value: string; onChange?: (v: string | undefined) => void }) => (
    <textarea
      data-testid="monaco-editor"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

describe("ContainerizePanel", () => {
  const workspaceId = "test-ws-id";
  const mockContainerize = vi.fn();
  const mockApplyConfig = vi.fn();
  const mockClearProposedConfig = vi.fn();

  const defaultState = {
    containerizing: {},
    proposedConfig: {},
    containerizeError: {},
    containerize: mockContainerize,
    applyConfig: mockApplyConfig,
    clearProposedConfig: mockClearProposedConfig,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDevContainerStore).mockImplementation((selector: any) =>
      selector(defaultState)
    );
    (useDevContainerStore as any).getState = () => defaultState;
  });

  it("renders Containerize button in idle state", () => {
    render(<ContainerizePanel workspaceId={workspaceId} />);
    expect(screen.getByText("Containerize")).toBeInTheDocument();
  });

  it("calls containerize on button click", () => {
    render(<ContainerizePanel workspaceId={workspaceId} />);
    fireEvent.click(screen.getByText("Containerize"));
    expect(mockContainerize).toHaveBeenCalledWith(workspaceId);
  });

  it("shows analyzing state when containerizing", () => {
    vi.mocked(useDevContainerStore).mockImplementation((selector: any) =>
      selector({ ...defaultState, containerizing: { [workspaceId]: true } })
    );
    render(<ContainerizePanel workspaceId={workspaceId} />);
    expect(screen.getByText(/Analyzing/i)).toBeInTheDocument();
  });

  it("shows review state with proposed config", () => {
    const config = '{"image": "node:20"}';
    vi.mocked(useDevContainerStore).mockImplementation((selector: any) =>
      selector({ ...defaultState, proposedConfig: { [workspaceId]: config } })
    );
    render(<ContainerizePanel workspaceId={workspaceId} />);
    expect(screen.getByTestId("monaco-editor")).toBeInTheDocument();
    expect(screen.getByText("Commit to repo")).toBeInTheDocument();
    expect(screen.getByText("Save to Fury only")).toBeInTheDocument();
  });

  it("calls applyConfig with commitToRepo=true", () => {
    const config = '{"image": "node:20"}';
    vi.mocked(useDevContainerStore).mockImplementation((selector: any) =>
      selector({ ...defaultState, proposedConfig: { [workspaceId]: config } })
    );
    render(<ContainerizePanel workspaceId={workspaceId} />);
    fireEvent.click(screen.getByText("Commit to repo"));
    expect(mockApplyConfig).toHaveBeenCalledWith(workspaceId, config, true);
  });

  it("calls applyConfig with commitToRepo=false", () => {
    const config = '{"image": "node:20"}';
    vi.mocked(useDevContainerStore).mockImplementation((selector: any) =>
      selector({ ...defaultState, proposedConfig: { [workspaceId]: config } })
    );
    render(<ContainerizePanel workspaceId={workspaceId} />);
    fireEvent.click(screen.getByText("Save to Fury only"));
    expect(mockApplyConfig).toHaveBeenCalledWith(workspaceId, config, false);
  });

  it("shows error state with retry button", () => {
    vi.mocked(useDevContainerStore).mockImplementation((selector: any) =>
      selector({ ...defaultState, containerizeError: { [workspaceId]: "CLI failed" } })
    );
    render(<ContainerizePanel workspaceId={workspaceId} />);
    expect(screen.getByText(/CLI failed/)).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("calls containerize on Retry click in error state", () => {
    vi.mocked(useDevContainerStore).mockImplementation((selector: any) =>
      selector({ ...defaultState, containerizeError: { [workspaceId]: "CLI failed" } })
    );
    render(<ContainerizePanel workspaceId={workspaceId} />);
    fireEvent.click(screen.getByText("Retry"));
    expect(mockContainerize).toHaveBeenCalledWith(workspaceId);
  });

  it("calls clearProposedConfig on Cancel click in review state", () => {
    const config = '{"image": "node:20"}';
    vi.mocked(useDevContainerStore).mockImplementation((selector: any) =>
      selector({ ...defaultState, proposedConfig: { [workspaceId]: config } })
    );
    render(<ContainerizePanel workspaceId={workspaceId} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(mockClearProposedConfig).toHaveBeenCalledWith(workspaceId);
  });

  it("shows Use existing devcontainer button when detected", () => {
    render(<ContainerizePanel workspaceId={workspaceId} existingDevcontainer=".devcontainer/devcontainer.json" />);
    expect(screen.getByText("Use existing devcontainer")).toBeInTheDocument();
  });

  it("calls applyConfig through store when using existing devcontainer", () => {
    render(<ContainerizePanel workspaceId={workspaceId} existingDevcontainer=".devcontainer/devcontainer.json" />);
    fireEvent.click(screen.getByText("Use existing devcontainer"));
    expect(mockApplyConfig).toHaveBeenCalledWith(workspaceId, "", false, ".devcontainer/devcontainer.json");
  });
});
