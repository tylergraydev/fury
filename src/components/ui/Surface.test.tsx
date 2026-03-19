import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Surface, SectionHeader } from "./Surface";

describe("Surface", () => {
  it("renders children with surface styling", () => {
    render(<Surface data-testid="s">content</Surface>);
    const el = screen.getByTestId("s");
    expect(el.style.backgroundColor).toBe("var(--bg-surface)");
    expect(el.style.border).toBe("1px solid var(--border)");
    expect(el.className).toContain("rounded-lg");
  });

  it("applies interactive variant", () => {
    render(
      <Surface variant="interactive" data-testid="s">
        click me
      </Surface>,
    );
    expect(screen.getByTestId("s").className).toContain("hover:bg-[var(--bg-hover)]");
  });

  it("supports custom rounded class", () => {
    render(
      <Surface rounded="rounded-xl" data-testid="s">
        card
      </Surface>,
    );
    expect(screen.getByTestId("s").className).toContain("rounded-xl");
  });

  it("passes through className", () => {
    render(
      <Surface className="px-4 py-3" data-testid="s">
        content
      </Surface>,
    );
    expect(screen.getByTestId("s").className).toContain("px-4");
  });
});

describe("SectionHeader", () => {
  it("renders text with accent bar", () => {
    render(<SectionHeader>Recent Repos</SectionHeader>);
    expect(screen.getByText("Recent Repos")).toBeInTheDocument();
    const h2 = screen.getByRole("heading", { level: 2 });
    expect(h2.className).toContain("uppercase");
    expect(h2.className).toContain("tracking-wider");
    // Accent bar is the first child span
    const bar = h2.querySelector("span");
    expect(bar).toBeTruthy();
    expect(bar!.style.backgroundColor).toBe("var(--accent)");
  });

  it("hides accent bar when accent=false", () => {
    render(<SectionHeader accent={false}>No Bar</SectionHeader>);
    const h2 = screen.getByRole("heading", { level: 2 });
    const bar = h2.querySelector("span");
    expect(bar).toBeNull();
  });
});
