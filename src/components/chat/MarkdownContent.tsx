import { Component, type ErrorInfo, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface Props {
  content: string;
}

/** Falls back to plain text when markdown parsing throws. */
class MarkdownErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  /* v8 ignore next 3 -- React error boundary lifecycle, requires render-time throw */
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  /* v8 ignore next 3 -- React error boundary lifecycle, requires render-time throw */
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[MarkdownContent] Render error:", error, info.componentStack);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

const components: Components = {
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
  code: ({ children, ...props }) => (
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
  ),
  pre: ({ children }) => (
    <pre
      className="mb-2 overflow-x-auto rounded-md px-4 py-3 font-mono text-[13px]"
      style={{
        backgroundColor: "var(--bg-surface)",
        color: "var(--text-secondary)",
        border: "1px solid var(--border)",
      }}
    >
      {children}
    </pre>
  ),
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
};

export function MarkdownContent({ content }: Props) {
  if (!content) return null;

  return (
    <MarkdownErrorBoundary
      fallback={<div className="whitespace-pre-wrap">{content}</div>}
    >
      <div className="markdown-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {content}
        </ReactMarkdown>
      </div>
    </MarkdownErrorBoundary>
  );
}
