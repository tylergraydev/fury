import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UpdateBanner } from "./UpdateBanner";
import { relaunch } from "@tauri-apps/plugin-process";

vi.mock("lucide-react", () => ({
  Download: (props: any) => <span data-testid="download-icon" {...props} />,
  X: (props: any) => <span data-testid="x-icon" {...props} />,
  RotateCcw: (props: any) => <span data-testid="rotate-icon" {...props} />,
}));

const defaultProps = {
  version: "2.0.0",
  installing: false,
  installed: false,
  error: null,
  onInstall: vi.fn(),
  onDismiss: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("UpdateBanner", () => {
  it("renders the available state with version and Install button", () => {
    render(<UpdateBanner {...defaultProps} />);
    expect(screen.getByText("Update v2.0.0 is available.")).toBeInTheDocument();
    expect(screen.getByText("Install")).toBeInTheDocument();
    expect(screen.getByTestId("download-icon")).toBeInTheDocument();
  });

  it("calls onInstall when the Install button is clicked", () => {
    const onInstall = vi.fn();
    render(<UpdateBanner {...defaultProps} onInstall={onInstall} />);
    fireEvent.click(screen.getByText("Install"));
    expect(onInstall).toHaveBeenCalledOnce();
  });

  it("renders the installing state with downloading message and no Install button", () => {
    render(<UpdateBanner {...defaultProps} installing={true} />);
    expect(screen.getByText("Downloading update...")).toBeInTheDocument();
    expect(screen.queryByText("Install")).not.toBeInTheDocument();
  });

  it("hides the dismiss button during install", () => {
    render(<UpdateBanner {...defaultProps} installing={true} />);
    expect(screen.queryByTestId("x-icon")).not.toBeInTheDocument();
  });

  it("renders the installed state with restart message and Restart button", () => {
    render(<UpdateBanner {...defaultProps} installed={true} />);
    expect(
      screen.getByText("Update v2.0.0 installed. Restart to apply."),
    ).toBeInTheDocument();
    expect(screen.getByText("Restart")).toBeInTheDocument();
    expect(screen.getByTestId("rotate-icon")).toBeInTheDocument();
  });

  it("calls relaunch when the Restart button is clicked", () => {
    render(<UpdateBanner {...defaultProps} installed={true} />);
    fireEvent.click(screen.getByText("Restart"));
    expect(relaunch).toHaveBeenCalledOnce();
  });

  it("does not show Install button when installed", () => {
    render(<UpdateBanner {...defaultProps} installed={true} />);
    expect(screen.queryByText("Install")).not.toBeInTheDocument();
  });

  it("renders the error state with error message", () => {
    render(
      <UpdateBanner {...defaultProps} error="Download failed: network error" />,
    );
    expect(
      screen.getByText("Download failed: network error"),
    ).toBeInTheDocument();
  });

  it("does not show Install button when there is an error", () => {
    render(<UpdateBanner {...defaultProps} error="Some error" />);
    expect(screen.queryByText("Install")).not.toBeInTheDocument();
  });

  it("shows dismiss button when not installing", () => {
    render(<UpdateBanner {...defaultProps} />);
    expect(screen.getByTestId("x-icon")).toBeInTheDocument();
  });

  it("calls onDismiss when the dismiss button is clicked", () => {
    const onDismiss = vi.fn();
    render(<UpdateBanner {...defaultProps} onDismiss={onDismiss} />);
    const dismissBtn = screen.getByTestId("x-icon").closest("button")!;
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("shows dismiss button in error state", () => {
    render(<UpdateBanner {...defaultProps} error="fail" />);
    expect(screen.getByTestId("x-icon")).toBeInTheDocument();
  });

  it("shows dismiss button in installed state", () => {
    render(<UpdateBanner {...defaultProps} installed={true} />);
    expect(screen.getByTestId("x-icon")).toBeInTheDocument();
  });
});
