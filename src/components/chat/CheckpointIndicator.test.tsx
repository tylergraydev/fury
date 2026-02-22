import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CheckpointIndicator } from "./CheckpointIndicator";
import type { Checkpoint } from "../../lib/tauri";

function makeCheckpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    id: "cp-1",
    turnIndex: 2,
    createdAt: "2025-01-01T00:00:00Z",
    ...overrides,
  } as Checkpoint;
}

describe("CheckpointIndicator", () => {
  it("displays the turn index", () => {
    render(
      <CheckpointIndicator
        checkpoint={makeCheckpoint({ turnIndex: 5 })}
        isLatest={false}
        onRevert={vi.fn()}
      />,
    );
    expect(screen.getByText("Turn 5")).toBeInTheDocument();
  });

  it("shows Revert button when not latest", () => {
    render(
      <CheckpointIndicator
        checkpoint={makeCheckpoint()}
        isLatest={false}
        onRevert={vi.fn()}
      />,
    );
    expect(screen.getByText("Revert")).toBeInTheDocument();
  });

  it("hides Revert button when latest", () => {
    render(
      <CheckpointIndicator
        checkpoint={makeCheckpoint()}
        isLatest={true}
        onRevert={vi.fn()}
      />,
    );
    expect(screen.queryByText("Revert")).not.toBeInTheDocument();
  });

  it("shows confirmation on Revert click", () => {
    render(
      <CheckpointIndicator
        checkpoint={makeCheckpoint()}
        isLatest={false}
        onRevert={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Revert"));
    expect(screen.getByText("Revert to here?")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("calls onRevert with checkpoint id when confirmed", () => {
    const onRevert = vi.fn();
    render(
      <CheckpointIndicator
        checkpoint={makeCheckpoint({ id: "cp-42" })}
        isLatest={false}
        onRevert={onRevert}
      />,
    );
    fireEvent.click(screen.getByText("Revert"));
    fireEvent.click(screen.getByText("Yes"));
    expect(onRevert).toHaveBeenCalledWith("cp-42");
  });

  it("cancels confirmation when No is clicked", () => {
    render(
      <CheckpointIndicator
        checkpoint={makeCheckpoint()}
        isLatest={false}
        onRevert={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Revert"));
    fireEvent.click(screen.getByText("No"));
    // Should go back to showing just the Revert button
    expect(screen.getByText("Revert")).toBeInTheDocument();
    expect(screen.queryByText("Revert to here?")).not.toBeInTheDocument();
  });
});
