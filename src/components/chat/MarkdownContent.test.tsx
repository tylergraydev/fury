import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownContent } from "./MarkdownContent";

describe("MarkdownContent", () => {
  it("renders plain text as a paragraph", () => {
    render(<MarkdownContent content="Hello world" />);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders bold text", () => {
    const { container } = render(<MarkdownContent content="**bold text**" />);
    expect(container.querySelector("strong")).toHaveTextContent("bold text");
  });

  it("renders inline code", () => {
    const { container } = render(<MarkdownContent content="Use `const x = 1`" />);
    const code = container.querySelector("code");
    expect(code).toHaveTextContent("const x = 1");
  });

  it("renders fenced code blocks", () => {
    const content = "```js\nconst x = 1;\n```";
    const { container } = render(<MarkdownContent content={content} />);
    const pre = container.querySelector("pre");
    expect(pre).toBeInTheDocument();
  });

  it("renders links with target _blank", () => {
    render(<MarkdownContent content="[click](https://example.com)" />);
    const link = screen.getByText("click");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("renders tables with GFM", () => {
    const content = "| A | B |\n|---|---|\n| 1 | 2 |";
    const { container } = render(<MarkdownContent content={content} />);
    expect(container.querySelector("table")).toBeInTheDocument();
  });

  it("renders lists", () => {
    const content = "- item one\n- item two";
    const { container } = render(<MarkdownContent content={content} />);
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("renders blockquotes", () => {
    const content = "> quoted text";
    const { container } = render(<MarkdownContent content={content} />);
    expect(container.querySelector("blockquote")).toBeInTheDocument();
  });
});
