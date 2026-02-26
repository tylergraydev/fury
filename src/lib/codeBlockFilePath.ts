import { type ReactNode, isValidElement, Children } from "react";

/**
 * Detects a file path from a code block's className and surrounding context.
 *
 * Checks (in order):
 * 1. Colon-delimited className: "language-typescript:src/app.ts" → "src/app.ts"
 * 2. First line comment: "// src/app.ts" or "# src/app.ts"
 * 3. Preceding markdown text for backtick-quoted file paths
 */
export function detectFilePath(
  className: string | undefined,
  codeText: string,
  markdownContent: string,
): string | null {
  // Tier 1: Colon-delimited language tag
  if (className) {
    const colonMatch = className.match(/^language-[^:]+:(.+)$/);
    if (colonMatch) {
      const candidate = colonMatch[1].trim();
      if (looksLikeFilePath(candidate)) return candidate;
    }
  }

  // Tier 2: First line of code is a file path comment
  const firstLine = codeText.split("\n")[0]?.trim() ?? "";
  const commentMatch = firstLine.match(/^(?:\/\/|#|\/\*)\s*(.+?)(?:\s*\*\/)?$/);
  if (commentMatch) {
    const candidate = commentMatch[1].trim();
    if (looksLikeFilePath(candidate)) return candidate;
  }

  // Tier 3: Look for backtick-quoted paths in the preceding markdown text
  // Find where this code block starts in the full markdown
  const codeBlockIndex = markdownContent.indexOf(codeText);
  if (codeBlockIndex > 0) {
    const preceding = markdownContent.slice(
      Math.max(0, codeBlockIndex - 300),
      codeBlockIndex,
    );
    // Match backtick-quoted paths like `src/app.ts`
    const backtickPaths = [...preceding.matchAll(/`([^`]+)`/g)]
      .map((m) => m[1])
      .filter(looksLikeFilePath);
    if (backtickPaths.length > 0) {
      return backtickPaths[backtickPaths.length - 1];
    }
  }

  return null;
}

/**
 * Heuristic: does this string look like a file path?
 * Must contain a dot (for extension) and a slash or be a simple filename with extension.
 */
export function looksLikeFilePath(candidate: string): boolean {
  if (!candidate || candidate.length > 200) return false;
  // Must have a file extension
  if (!/\.\w+$/.test(candidate)) return false;
  // Should not contain spaces (except escaped), quotes, or special markdown chars
  if (/["`<>|*?]/.test(candidate)) return false;
  // Should look like a path (has slash) or a simple filename
  return /^[\w./\\@-]+$/.test(candidate);
}

/**
 * Extracts raw code text, language, and file path from react-markdown's
 * <pre> children (which is a <code> React element).
 */
export function extractCodeBlockInfo(
  children: ReactNode,
  markdownContent: string,
): { codeText: string; language: string; filePath: string | null } {
  const defaultResult = { codeText: "", language: "", filePath: null };

  // react-markdown renders: <pre><code className="language-xxx">text</code></pre>
  // So children of <pre> is the <code> element
  const childArray = Children.toArray(children);
  const codeElement = childArray.find(
    (child) => isValidElement(child) && child.type === "code",
  );

  if (!isValidElement(codeElement)) return defaultResult;

  const props = codeElement.props as {
    className?: string;
    children?: ReactNode;
  };
  const className = props.className ?? "";
  const codeText = extractText(props.children);
  const language = className.replace(/^language-/, "").split(":")[0] || "";
  const filePath = detectFilePath(className, codeText, markdownContent);

  return { codeText, language, filePath };
}

/** Recursively extracts text content from React children. */
function extractText(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (!children) return "";
  if (Array.isArray(children)) return children.map(extractText).join("");
  if (isValidElement(children)) {
    const props = children.props as { children?: ReactNode };
    return extractText(props.children);
  }
  return "";
}
