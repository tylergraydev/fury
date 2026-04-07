#!/usr/bin/env node
/**
 * Fury Browser MCP Server
 *
 * A standalone MCP server that provides browser automation tools
 * for Claude Code to interact with the embedded Fury browser panel.
 *
 * Communicates with the Fury Rust backend via a local HTTP bridge.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// --- Configuration ---

const args = process.argv.slice(2);
let port = "9747";
let token = "";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" && args[i + 1]) port = args[++i];
  if (args[i] === "--token" && args[i + 1]) token = args[++i];
}

const BRIDGE_URL = `http://127.0.0.1:${port}`;

function log(msg: string) {
  process.stderr.write(`[fury-browser-mcp] ${msg}\n`);
}

log(`Starting with bridge=${BRIDGE_URL} token=${token ? token.slice(0, 8) + "..." : "(empty)"}`);

// --- HTTP bridge helper ---

async function bridgeRequest(
  path: string,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  log(`→ ${body ? "POST" : "GET"} ${path} ${body ? JSON.stringify(body) : ""}`);
  try {
    const resp = await fetch(`${BRIDGE_URL}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        "x-fury-token": token,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      log(`← HTTP ${resp.status} ${resp.statusText}: ${text}`);
      return { ok: false, error: `HTTP ${resp.status}: ${resp.statusText} — ${text}` };
    }

    const result = (await resp.json()) as { ok: boolean; data?: unknown; error?: string };
    log(`← ${result.ok ? "OK" : "ERR"}: ${result.error ?? (result.data ? JSON.stringify(result.data).slice(0, 200) : "(no data)")}`);
    return result;
  } catch (e) {
    log(`← CONNECT FAILED: ${e}`);
    return {
      ok: false,
      error: `Cannot connect to Fury browser bridge at ${BRIDGE_URL}. Is Fury running? Error: ${e}`,
    };
  }
}

// --- Tool definitions ---

const TOOLS = [
  {
    name: "browser_open",
    description:
      "Open the Fury embedded browser panel and navigate to a URL. Use this when the user asks to open their app in the browser, preview their site, or view localhost. This will open the browser panel if it's not already visible.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "The URL to open (e.g. http://localhost:3000)",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_navigate",
    description:
      "Navigate the already-open embedded Fury browser to a different URL.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "The URL to navigate to (e.g. http://localhost:3000)",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_screenshot",
    description:
      "Take a screenshot of the current page in the embedded browser. Returns an HTML snapshot of the page.",
    inputSchema: {
      type: "object" as const,
      properties: {
        selector: {
          type: "string",
          description: "Optional CSS selector to capture a specific element",
        },
      },
    },
  },
  {
    name: "browser_console_logs",
    description:
      "Get recent console output (logs, warnings, errors) from the embedded browser. Useful for debugging the user's app.",
    inputSchema: {
      type: "object" as const,
      properties: {
        level: {
          type: "string",
          enum: ["error", "warn", "log", "all"],
          description: "Filter by log level. Defaults to 'all'.",
        },
      },
    },
  },
  {
    name: "browser_click",
    description:
      "Click a DOM element in the embedded browser by CSS selector.",
    inputSchema: {
      type: "object" as const,
      properties: {
        selector: {
          type: "string",
          description: "CSS selector of the element to click",
        },
      },
      required: ["selector"],
    },
  },
  {
    name: "browser_type",
    description:
      "Type text into an input element in the embedded browser.",
    inputSchema: {
      type: "object" as const,
      properties: {
        selector: {
          type: "string",
          description: "CSS selector of the input element",
        },
        text: {
          type: "string",
          description: "Text to type into the element",
        },
      },
      required: ["selector", "text"],
    },
  },
  {
    name: "browser_get_text",
    description:
      "Get the text content of a DOM element in the embedded browser.",
    inputSchema: {
      type: "object" as const,
      properties: {
        selector: {
          type: "string",
          description: "CSS selector of the element",
        },
      },
      required: ["selector"],
    },
  },
  {
    name: "browser_get_html",
    description:
      "Get the HTML content of the page or a specific element in the embedded browser.",
    inputSchema: {
      type: "object" as const,
      properties: {
        selector: {
          type: "string",
          description:
            "CSS selector. If omitted, returns the full page HTML.",
        },
      },
    },
  },
  {
    name: "browser_evaluate",
    description:
      "Execute arbitrary JavaScript in the embedded browser and return the result.",
    inputSchema: {
      type: "object" as const,
      properties: {
        script: {
          type: "string",
          description: "JavaScript code to execute",
        },
      },
      required: ["script"],
    },
  },
  {
    name: "browser_wait_for",
    description:
      "Wait for a DOM element to appear in the embedded browser.",
    inputSchema: {
      type: "object" as const,
      properties: {
        selector: {
          type: "string",
          description: "CSS selector to wait for",
        },
        timeout_ms: {
          type: "number",
          description: "Timeout in milliseconds (default: 5000)",
        },
      },
      required: ["selector"],
    },
  },
];

// --- MCP Server setup ---

const server = new Server(
  {
    name: "fury-browser",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
    instructions:
      "This is Fury's built-in embedded browser. ALWAYS prefer these tools over other browser/devtools MCPs when the user asks to open, preview, or interact with their app. These tools control a browser panel integrated directly into the Fury UI, visible right next to the chat.",
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const input = (args ?? {}) as Record<string, unknown>;
  log(`Tool call: ${name} args=${JSON.stringify(input)}`);

  let result: { ok: boolean; data?: unknown; error?: string };

  switch (name) {
    case "browser_open":
      result = await bridgeRequest("/browser/open", { url: input.url });
      break;
    case "browser_navigate":
      result = await bridgeRequest("/browser/navigate", { url: input.url });
      break;
    case "browser_screenshot":
      result = await bridgeRequest("/browser/screenshot", {
        selector: input.selector,
      });
      break;
    case "browser_console_logs":
      result = await bridgeRequest("/browser/console", {
        level: input.level,
      });
      break;
    case "browser_click":
      result = await bridgeRequest("/browser/click", {
        selector: input.selector,
      });
      break;
    case "browser_type":
      result = await bridgeRequest("/browser/type", {
        selector: input.selector,
        text: input.text,
      });
      break;
    case "browser_get_text": {
      // Get text via eval
      const script = `(function() {
        const el = document.querySelector(${JSON.stringify(input.selector)});
        if (!el) return JSON.stringify({ error: 'Element not found' });
        return JSON.stringify({ text: el.textContent });
      })()`;
      result = await bridgeRequest("/browser/eval", { script });
      break;
    }
    case "browser_get_html":
      result = await bridgeRequest("/browser/html", {
        selector: input.selector,
      });
      break;
    case "browser_evaluate":
      result = await bridgeRequest("/browser/eval", {
        script: input.script,
      });
      break;
    case "browser_wait_for":
      result = await bridgeRequest("/browser/wait", {
        selector: input.selector,
        timeout_ms: input.timeout_ms,
      });
      break;
    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }

  if (!result.ok) {
    return {
      content: [{ type: "text", text: result.error ?? "Unknown error" }],
      isError: true,
    };
  }

  const text =
    result.data != null
      ? typeof result.data === "string"
        ? result.data
        : JSON.stringify(result.data, null, 2)
      : "OK";

  return {
    content: [{ type: "text", text }],
  };
});

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server is now running and accepting stdio messages
}

main().catch((err) => {
  process.stderr.write(`fury-browser-mcp fatal: ${err}\n`);
  process.exit(1);
});
