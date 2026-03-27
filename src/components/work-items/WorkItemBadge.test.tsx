import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkItemBadge } from "./WorkItemBadge";

describe("WorkItemBadge", () => {
  it("renders the type text", () => {
    render(<WorkItemBadge type="Bug" />);
    expect(screen.getByText("Bug")).toBeInTheDocument();
  });

  it("renders unknown types with muted color", () => {
    render(<WorkItemBadge type="Custom Type" />);
    expect(screen.getByText("Custom Type")).toBeInTheDocument();
  });

  it.each(["Bug", "Task", "User Story", "Feature", "Epic"])(
    "renders known type: %s",
    (type) => {
      render(<WorkItemBadge type={type} />);
      expect(screen.getByText(type)).toBeInTheDocument();
    },
  );
});
