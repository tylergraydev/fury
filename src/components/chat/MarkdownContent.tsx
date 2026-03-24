import { Component, type ErrorInfo, memo, type ReactNode, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { extractCodeBlockInfo } from "../../lib/codeBlockFilePath";
import { CodeBlockToolbar } from "./CodeBlockToolbar";
import { ImageLightbox } from "./ImageLightbox";

interface Props {
  content: string;
  contextId?: string;
  contextType?: "workspace" | "repo";
}

/** Falls back to plain text when markdown parsing throws. */
class MarkdownErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  /* v8 ignore start -- React error boundary lifecycle, requires render-time throw */
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[MarkdownContent] Render error:", error, info.componentStack);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  /* v8 ignore stop */
  }
}

function MarkdownImage({ src, alt }: { src?: string; alt?: string }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (!src) return null;

  return (
    <>
      <button
        type="button"
        className="my-2 block cursor-pointer overflow-hidden rounded-md border transition-opacity hover:opacity-80"
        style={{ borderColor: "var(--border)" }}
        onClick={() => setLightboxOpen(true)}
      >
        <img
          src={src}
          /* v8 ignore start -- alt is always provided by markdown renderer */
          alt={alt ?? ""}
          /* v8 ignore stop */
          className="max-h-64 max-w-full object-contain"
          draggable={false}
        />
      </button>
      {lightboxOpen && (
        <ImageLightbox src={src} alt={alt} onClose={() => setLightboxOpen(false)} />
      )}
    </>
  );
}

/** Shared renderers that don't need context. */
const staticComponents: Partial<Components> = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-4 text-xl font-bold" style={{ color: "var(--text-primary)" }}>
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-3 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-3 text-base font-semibold" style={{ color: "var(--text-primary)" }}>
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="mb-2 leading-relaxed">{children}</p>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline"
      style={{ color: "var(--accent)" }}
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote
      className="my-2 pl-4"
      style={{
        borderLeft: "3px solid var(--border)",
        color: "var(--text-secondary)",
      }}
    >
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto">
      <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th
      className="px-3 py-1.5 text-left font-semibold"
      style={{
        borderBottom: "2px solid var(--border)",
        color: "var(--text-primary)",
      }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td
      className="px-3 py-1.5"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      {children}
    </td>
  ),
  hr: () => (
    <hr className="my-4" style={{ borderColor: "var(--border)" }} />
  ),
  strong: ({ children }) => (
    <strong className="font-semibold" style={{ color: "var(--text-primary)" }}>
      {children}
    </strong>
  ),
  em: ({ children }) => <em>{children}</em>,
  img: ({ src, alt }) => <MarkdownImage src={src} alt={alt} />,
};

const REMARK_PLUGINS = [remarkGfm];

function buildComponents(
  contentRef: React.RefObject<string>,
  contextId?: string,
  contextType?: "workspace" | "repo",
): Components {
  const showToolbar = Boolean(contextId && contextType);

  return {
    ...staticComponents,

    code: ({ children, className, ...props }) => {
      // Fenced code blocks have className like "language-xxx"
      if (className) {
        return (
          <code className={className} {...props}>
            {children}
          </code>
        );
      }
      // Inline code
      return (
        <code
          className="rounded px-1.5 py-0.5 font-mono text-[13px]"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--accent-purple)",
          }}
          {...props}
        >
          {children}
        </code>
      );
    },

    pre: ({ children }) => {
      const { codeText, filePath } = showToolbar
        ? extractCodeBlockInfo(children, contentRef.current)
        : { codeText: "", filePath: null };

      return (
        <pre
          className="group relative mb-2 overflow-x-auto rounded-md px-4 py-3 font-mono text-[13px]"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
          }}
        >
          {children}
          {showToolbar && (
            <CodeBlockToolbar
              code={codeText}
              filePath={filePath}
              contextId={contextId!}
              contextType={contextType!}
            />
          )}
        </pre>
      );
    },
  };
}

export const MarkdownContent = memo(function MarkdownContent({ content, contextId, contextType }: Props) {
  const contentRef = useRef(content);
  contentRef.current = content;

  const components = useMemo(
    () => buildComponents(contentRef, contextId, contextType),
    [contextId, contextType],
  );

  if (!content) return null;

  return (
    <MarkdownErrorBoundary
      fallback={<div className="whitespace-pre-wrap">{content}</div>}
    >
      <div className="markdown-content">
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
          {content}
        </ReactMarkdown>
      </div>
    </MarkdownErrorBoundary>
  );
});
