/**
 * Layer 2: Observation Extractor
 *
 * Extracts high-signal observations from PostToolUse hook events.
 * Runs in the sidecar process — zero API token cost.
 */

export interface Observation {
  observationType: string;
  content: string;
  sourceTool: string | null;
  filePaths: string[];
}

interface PostToolUseInput {
  hook_event_name: "PostToolUse";
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: unknown;
  session_id: string;
  cwd: string;
}

/**
 * Extract an observation from a PostToolUse hook event.
 * Returns null for low-signal events (reads, successful simple commands).
 */
export function extractObservation(input: PostToolUseInput): Observation | null {
  const { tool_name, tool_input, tool_response } = input;

  switch (tool_name) {
    case "Write":
    case "Edit": {
      const filePath = (tool_input.file_path as string) || (tool_input.path as string) || "";
      if (!filePath) return null;

      const oldStr = tool_input.old_string as string | undefined;
      const newStr = tool_input.new_string as string | undefined;
      let description = `Modified ${relativePath(filePath, input.cwd)}`;
      if (oldStr && newStr) {
        description += ` (replaced ${truncate(oldStr, 50)} → ${truncate(newStr, 50)})`;
      }

      return {
        observationType: "file_change",
        content: description,
        sourceTool: tool_name,
        filePaths: [filePath],
      };
    }

    case "Bash": {
      const command = (tool_input.command as string) || "";
      const output = stringifyResponse(tool_response);

      // Check for errors
      const hasError =
        output.includes("error") ||
        output.includes("Error") ||
        output.includes("FAILED") ||
        output.includes("ENOENT") ||
        output.includes("Permission denied");

      if (hasError) {
        return {
          observationType: "error",
          content: `Command failed: ${truncate(command, 100)}\nOutput: ${truncate(output, 300)}`,
          sourceTool: "Bash",
          filePaths: extractFilePathsFromText(command),
        };
      }

      // Capture significant commands (installs, builds, test runs)
      if (isSignificantCommand(command)) {
        return {
          observationType: "pattern",
          content: `Ran: ${truncate(command, 200)}`,
          sourceTool: "Bash",
          filePaths: [],
        };
      }

      return null; // Skip ordinary successful commands
    }

    case "Read":
    case "Glob":
    case "Grep":
      // Read-only tools — too noisy to record
      return null;

    default:
      // MCP tools or unknown tools — record if they seem significant
      if (tool_name.startsWith("mcp__")) {
        return {
          observationType: "pattern",
          content: `Used MCP tool: ${tool_name}(${truncate(JSON.stringify(tool_input), 150)})`,
          sourceTool: tool_name,
          filePaths: [],
        };
      }
      return null;
  }
}

/**
 * Extract observations from assistant text (decisions, patterns).
 * Called on assistant messages to detect when Claude explains its reasoning.
 */
export function extractFromAssistantText(text: string): Observation | null {
  // Look for decision language
  const decisionPatterns = [
    /\b(?:decided|chose|choosing|picked|selected|going with|opted for)\b/i,
    /\b(?:because|reason is|rationale|trade-?off)\b/i,
  ];

  const patternIndicators = [
    /\b(?:convention|pattern|always|never|standard|best practice)\b/i,
    /\b(?:this codebase|in this project|we use|you use)\b/i,
  ];

  const isDecision = decisionPatterns.some((p) => p.test(text));
  const isPattern = patternIndicators.some((p) => p.test(text));

  if (isDecision && text.length > 50 && text.length < 500) {
    return {
      observationType: "decision",
      content: truncate(text, 300),
      sourceTool: null,
      filePaths: extractFilePathsFromText(text),
    };
  }

  if (isPattern && text.length > 30 && text.length < 300) {
    return {
      observationType: "pattern",
      content: truncate(text, 200),
      sourceTool: null,
      filePaths: extractFilePathsFromText(text),
    };
  }

  return null;
}

// --- Helpers ---

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

function relativePath(fullPath: string, cwd: string): string {
  if (fullPath.startsWith(cwd)) {
    return fullPath.slice(cwd.length).replace(/^[/\\]/, "");
  }
  return fullPath;
}

function stringifyResponse(response: unknown): string {
  if (typeof response === "string") return response;
  if (response == null) return "";
  try {
    return JSON.stringify(response);
  } catch {
    return String(response);
  }
}

function isSignificantCommand(command: string): boolean {
  const significant = [
    /\bnpm\s+(install|run|test|build)/,
    /\bcargo\s+(build|test|check|run)/,
    /\bgit\s+(commit|merge|rebase|checkout)/,
    /\bpip\s+install/,
    /\bdocker\b/,
    /\bmake\b/,
  ];
  return significant.some((p) => p.test(command));
}

function extractFilePathsFromText(text: string): string[] {
  // Match common file path patterns
  const pathRegex = /(?:^|\s)((?:\.\/|\/|src\/|lib\/)\S+\.\w{1,10})/g;
  const paths: string[] = [];
  let match;
  while ((match = pathRegex.exec(text)) !== null) {
    paths.push(match[1].trim());
  }
  return [...new Set(paths)].slice(0, 10); // Dedupe, limit to 10
}
