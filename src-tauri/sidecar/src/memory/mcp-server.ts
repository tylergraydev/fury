/**
 * Layer 3: In-Process MCP Server for Memory
 *
 * Provides on-demand memory tools that Claude can call during a session.
 * Runs in the same process as the sidecar — zero startup latency.
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { MemoryStore } from "./store.js";

/**
 * Create the fury-memory MCP server with search and save tools.
 */
export function createMemoryMcpServer(store: MemoryStore) {
  return createSdkMcpServer({
    name: "fury-memory",
    version: "1.0.0",
    tools: [
      tool(
        "search_memory",
        "Search past observations and learnings from previous sessions in this project. Use when you need context about past decisions, error patterns, conventions, or what was previously tried. Returns compressed observations matching your query.",
        {
          query: z.string().describe("Natural language search query"),
          scope: z
            .enum(["workspace", "repo", "global"])
            .default("workspace")
            .describe("Scope to search: workspace (current branch), repo (all branches), or global (all projects)"),
          limit: z.number().default(5).describe("Max results to return"),
        },
        async ({ query, scope, limit }) => {
          const results = await store.search(query, scope, limit);
          if (results.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "No matching memories found.",
                },
              ],
            };
          }
          const formatted = results
            .map(
              (r) =>
                `[${r.observationType}] ${r.content}${r.filePaths.length > 0 ? ` (files: ${r.filePaths.join(", ")})` : ""}`,
            )
            .join("\n\n");
          return {
            content: [{ type: "text" as const, text: formatted }],
          };
        },
        { annotations: { readOnlyHint: true, openWorldHint: false } },
      ),

      tool(
        "save_learning",
        "Save an important learning, decision, or pattern for future sessions. Use when you discover something important about this project that should be remembered across sessions — architectural decisions, coding patterns, user preferences, or error fixes.",
        {
          content: z.string().describe("What was learned — be specific and concise"),
          category: z
            .enum(["decision", "pattern", "preference", "error_fix"])
            .describe("Type of learning"),
          scope: z
            .enum(["workspace", "repo", "global"])
            .default("workspace")
            .describe("Scope: workspace (this branch only), repo (all branches), or global (all projects)"),
        },
        async ({ content, category, scope }) => {
          await store.saveLearning(content, category, scope);
          return {
            content: [
              {
                type: "text" as const,
                text: `Saved to ${scope} memory: [${category}] ${content}`,
              },
            ],
          };
        },
        {
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            openWorldHint: false,
          },
        },
      ),

      tool(
        "get_file_context",
        "Get memory context related to specific files — what was changed, why, and any known issues. Use when you are about to modify a file and want to know its history.",
        {
          file_paths: z
            .array(z.string())
            .describe("File paths to look up history for"),
        },
        async ({ file_paths }) => {
          const context = await store.getFileContext(file_paths);
          if (!context) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "No history found for these files.",
                },
              ],
            };
          }
          return {
            content: [{ type: "text" as const, text: context }],
          };
        },
        { annotations: { readOnlyHint: true, openWorldHint: false } },
      ),
    ],
  });
}
