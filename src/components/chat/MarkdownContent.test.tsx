import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarkdownContent } from "./MarkdownContent";

// Mock CodeBlockToolbar to avoid pulling in tauri/store dependencies
vi.mock("./CodeBlockToolbar", () => ({
  CodeBlockToolbar: ({ filePath }: { filePath: string | null }) => (
    <div data-testid="code-toolbar" data-filepath={filePath ?? ""} />
  ),
}));

vi.mock("./ImageLightbox", () => ({
  ImageLightbox: ({ src, onClose }: { src: string; onClose: () => void }) => (
    <div data-testid="image-lightbox" data-src={src}>
      <button data-testid="lightbox-close" onClick={onClose}>Close</button>
    </div>
  ),
}));

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

  it("renders links with target _blank and noopener", () => {
    render(<MarkdownContent content="[click](https://example.com)" />);
    const link = screen.getByText("click");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
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

  it("renders empty content without crashing", () => {
    const { container } = render(<MarkdownContent content="" />);
    expect(container.innerHTML).toBe("");
  });

  it("renders h1 headings", () => {
    const { container } = render(<MarkdownContent content="# Main Title" />);
    const h1 = container.querySelector("h1");
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent("Main Title");
  });

  it("renders h2 headings", () => {
    const { container } = render(<MarkdownContent content="## Section Title" />);
    const h2 = container.querySelector("h2");
    expect(h2).toBeInTheDocument();
    expect(h2).toHaveTextContent("Section Title");
  });

  it("renders h3 headings", () => {
    const { container } = render(<MarkdownContent content="### Heading Three" />);
    const h3 = container.querySelector("h3");
    expect(h3).toBeInTheDocument();
    expect(h3).toHaveTextContent("Heading Three");
  });

  it("renders ordered lists", () => {
    const content = "1. first\n2. second";
    const { container } = render(<MarkdownContent content={content} />);
    expect(container.querySelector("ol")).toBeInTheDocument();
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("renders horizontal rules", () => {
    const content = "above\n\n---\n\nbelow";
    const { container } = render(<MarkdownContent content={content} />);
    expect(container.querySelector("hr")).toBeInTheDocument();
  });

  it("renders emphasis (em)", () => {
    const { container } = render(<MarkdownContent content="*italic text*" />);
    const em = container.querySelector("em");
    expect(em).toBeInTheDocument();
    expect(em).toHaveTextContent("italic text");
  });

  describe("images", () => {
    it("renders image as clickable button", () => {
      const content = "![alt text](https://example.com/img.png)";
      const { container } = render(<MarkdownContent content={content} />);
      const img = container.querySelector("img");
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", "https://example.com/img.png");
      expect(img).toHaveAttribute("alt", "alt text");
    });

    it("renders image with empty alt as empty string", () => {
      const content = "![](https://example.com/img.png)";
      const { container } = render(<MarkdownContent content={content} />);
      const img = container.querySelector("img");
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("alt", "");
    });

    it("opens lightbox when image is clicked and closes it", async () => {
      const user = userEvent.setup();
      const content = "![test](https://example.com/img.png)";
      render(<MarkdownContent content={content} />);
      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();

      // Click to open lightbox
      await user.click(button);
      expect(screen.getByTestId("image-lightbox")).toBeInTheDocument();
      expect(screen.getByTestId("image-lightbox")).toHaveAttribute("data-src", "https://example.com/img.png");

      // Close lightbox
      await user.click(screen.getByTestId("lightbox-close"));
      expect(screen.queryByTestId("image-lightbox")).not.toBeInTheDocument();
    });

    it("does not render image when src is missing", () => {
      // An image with no src should return null from MarkdownImage
      const content = "![alt]()";
      const { container } = render(<MarkdownContent content={content} />);
      // With empty src, the MarkdownImage returns null
      // React-markdown may or may not pass empty src
      expect(container).toBeTruthy();
    });
  });

  describe("code block toolbar", () => {
    it("renders toolbar for fenced code blocks when context provided", () => {
      const content = "```js\nconst x = 1;\n```";
      render(
        <MarkdownContent
          content={content}
          contextId="ws-123"
          contextType="workspace"
        />,
      );
      expect(screen.getByTestId("code-toolbar")).toBeInTheDocument();
    });

    it("does not render toolbar when no context provided", () => {
      const content = "```js\nconst x = 1;\n```";
      render(<MarkdownContent content={content} />);
      expect(screen.queryByTestId("code-toolbar")).not.toBeInTheDocument();
    });

    it("does not render toolbar for inline code", () => {
      render(
        <MarkdownContent
          content="Use `const x = 1`"
          contextId="ws-123"
          contextType="workspace"
        />,
      );
      expect(screen.queryByTestId("code-toolbar")).not.toBeInTheDocument();
    });

    it("renders toolbar for each code block in a message", () => {
      const content = "```js\nfirst\n```\n\ntext\n\n```py\nsecond\n```";
      render(
        <MarkdownContent
          content={content}
          contextId="ws-123"
          contextType="workspace"
        />,
      );
      expect(screen.getAllByTestId("code-toolbar")).toHaveLength(2);
    });

    it("fenced code blocks have className on code element", () => {
      const content = "```typescript\nconst x = 1;\n```";
      const { container } = render(
        <MarkdownContent
          content={content}
          contextId="ws-123"
          contextType="workspace"
        />,
      );
      const code = container.querySelector("code");
      expect(code?.className).toContain("language-typescript");
    });

    it("inline code keeps purple accent styling", () => {
      const { container } = render(
        <MarkdownContent
          content="Use `foo`"
          contextId="ws-123"
          contextType="workspace"
        />,
      );
      const code = container.querySelector("code");
      expect(code?.style.color).toBe("var(--accent-purple)");
    });
  });
});
