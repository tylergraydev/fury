/**
 * WebSocket client for the tauri-plugin-mcp-bridge.
 *
 * Connects to the MCP bridge WebSocket server (port 9223 by default)
 * running inside a `tauri dev` instance. Provides methods to execute
 * real IPC commands against the Rust backend and run JS in the webview.
 *
 * Protocol: JSON messages over WebSocket
 *   Request:  { id, command, args }
 *   Response: { id, success, data?, error? }
 */

import { test as base, expect } from "@playwright/test";
import WebSocket from "ws";

let requestCounter = 0;

export class TauriBridge {
  private ws: WebSocket | null = null;
  private pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private port: number;

  constructor(port = 9223) {
    this.port = port;
  }

  /** Connect to the MCP bridge WebSocket server. */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `ws://localhost:${this.port}`;
      this.ws = new WebSocket(url);

      this.ws.on("open", () => resolve());
      this.ws.on("error", (err) => reject(err));

      this.ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        const id = msg.id;
        const handler = this.pending.get(id);
        if (handler) {
          this.pending.delete(id);
          if (msg.success === false) {
            handler.reject(new Error(msg.error ?? "Unknown bridge error"));
          } else {
            handler.resolve(msg.data);
          }
        }
        // Ignore broadcast events (no pending handler)
      });

      this.ws.on("close", () => {
        // Reject any pending requests
        for (const [, handler] of this.pending) {
          handler.reject(new Error("WebSocket closed"));
        }
        this.pending.clear();
      });
    });
  }

  /** Send a raw command to the bridge and await the response. */
  private async send(
    command: string,
    args?: Record<string, unknown>,
    timeout = 30000,
  ): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Bridge not connected");
    }

    const id = `req-${++requestCounter}`;
    const msg = JSON.stringify({ id, command, args });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Bridge request timed out after ${timeout}ms: ${command}`));
      }, timeout);

      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });

      this.ws!.send(msg);
    });
  }

  /**
   * Execute JavaScript in the Tauri webview context.
   * The script runs inside an async IIFE and can return JSON-serializable values.
   */
  async executeJs(script: string, timeout = 15000): Promise<unknown> {
    return this.send("execute_js", { script }, timeout);
  }

  /**
   * Invoke a real Tauri IPC command through the webview.
   * This calls window.__TAURI_INTERNALS__.invoke() in the webview context,
   * which goes through the real Rust backend.
   */
  /**
   * Invoke a real Tauri IPC command through the webview.
   * For fast commands (< 5s), uses direct executeJs.
   * For slow commands, uses fire-and-poll to avoid the 5s bridge timeout.
   */
  async invoke(command: string, args: Record<string, unknown> = {}, options?: { slow?: boolean }): Promise<unknown> {
    const argsJson = JSON.stringify(args);

    if (options?.slow) {
      // Fire-and-poll pattern for commands that may take > 5 seconds
      const key = `__bridge_result_${Date.now()}`;
      const fireScript = `
        (async () => {
          window['${key}'] = { pending: true };
          try {
            const result = await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)}, ${argsJson});
            window['${key}'] = { done: true, data: result };
          } catch (e) {
            window['${key}'] = { done: true, error: e.message || String(e) };
          }
        })();
        return "fired";
      `;
      await this.executeJs(fireScript);

      // Poll for result
      const startTime = Date.now();
      const maxWait = 60_000;
      while (Date.now() - startTime < maxWait) {
        await new Promise((r) => setTimeout(r, 1000));
        const pollScript = `return window['${key}']`;
        const status = (await this.executeJs(pollScript)) as Record<string, unknown> | null;
        if (status && status.done) {
          // Clean up
          await this.executeJs(`delete window['${key}']`).catch(() => {});
          if (status.error) {
            throw new Error(status.error as string);
          }
          return status.data;
        }
      }
      throw new Error(`Slow invoke timed out after ${maxWait}ms: ${command}`);
    }

    // Fast path: direct executeJs (must complete within 5s bridge timeout)
    const script = `
      (async () => {
        const result = await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)}, ${argsJson});
        return result;
      })()
    `;
    return this.executeJs(script);
  }

  /** Disconnect from the bridge. */
  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

/**
 * Playwright test fixture that provides a connected TauriBridge.
 * Usage:
 *   import { test, expect } from "../helpers/bridge";
 *   test("my test", async ({ bridge }) => {
 *     const repos = await bridge.invoke("list_repositories");
 *   });
 */
export const test = base.extend<{ bridge: TauriBridge }>({
  bridge: async ({}, use) => {
    const bridge = new TauriBridge();
    await bridge.connect();
    await use(bridge);
    await bridge.disconnect();
  },
});

export { expect };
