/**
 * Integration test for the Claude Agent SDK sidecar.
 *
 * Spawns the actual sidecar process, sends a simple query,
 * and verifies that NDJSON events come back with the correct
 * workspace id and expected event types.
 *
 * Requires: ANTHROPIC_API_KEY in environment (or Claude Code configured)
 * Run: cd src-tauri/sidecar && npx tsx test/integration.test.ts
 */

import { spawn } from "child_process";
import * as path from "path";
import { fileURLToPath } from "url";
import * as readline from "readline";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIDECAR_PATH = path.join(__dirname, "../dist/claude-agent-sidecar.cjs");
const WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";
const TIMEOUT_MS = 60_000;

interface SidecarEvent {
  id: string;
  type: string;
  [key: string]: unknown;
}

function runTest(): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Test timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    const proc = spawn("node", [SIDECAR_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    const events: SidecarEvent[] = [];
    const seenTypes = new Set<string>();

    const rl = readline.createInterface({ input: proc.stdout! });
    rl.on("line", (line) => {
      try {
        const event = JSON.parse(line) as SidecarEvent;
        events.push(event);
        seenTypes.add(event.type);

        // Log for debugging
        const preview =
          event.type === "assistant"
            ? "(assistant message)"
            : JSON.stringify(event).slice(0, 120);
        console.log(`  [${event.type}] ${preview}`);

        // Once we see a result event, we can verify and exit
        if (event.type === "result") {
          clearTimeout(timer);
          verify();
        }
      } catch {
        // Non-JSON stderr output, ignore
      }
    });

    proc.stderr?.on("data", (data) => {
      const msg = data.toString().trim();
      if (msg) console.error(`  [stderr] ${msg}`);
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn sidecar: ${err.message}`));
    });

    proc.on("exit", (code) => {
      if (code !== 0 && events.length === 0) {
        clearTimeout(timer);
        reject(new Error(`Sidecar exited with code ${code} before producing events`));
      }
    });

    function verify() {
      try {
        // 1. All events should have the correct workspace id
        const wrongId = events.filter((e) => e.id !== WORKSPACE_ID);
        assert(
          wrongId.length === 0,
          `${wrongId.length} events had wrong workspace id`,
        );

        // 2. Should have received a system event (session init)
        assert(seenTypes.has("system"), "Missing 'system' event");

        // 3. Should have received at least one assistant event
        assert(seenTypes.has("assistant"), "Missing 'assistant' event");

        // 4. Should have received a result event
        assert(seenTypes.has("result"), "Missing 'result' event");

        // 5. Result event should have session_id for resume
        const resultEvent = events.find((e) => e.type === "result")!;
        assert(
          resultEvent.session_id != null || resultEvent.sessionId != null,
          "Result event missing session_id",
        );

        console.log(
          `\n✓ All checks passed (${events.length} events, types: ${[...seenTypes].join(", ")})`,
        );
        proc.kill();
        resolve();
      } catch (err) {
        proc.kill();
        reject(err);
      }
    }

    // Send a simple query that should produce a short response
    const query = JSON.stringify({
      type: "query",
      id: WORKSPACE_ID,
      prompt: "Respond with exactly: hello fury",
      cwd: process.cwd(),
      permissionMode: "bypassPermissions",
    });

    console.log("Sending query to sidecar...");
    proc.stdin!.write(query + "\n");
  });
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function runPermissionTest(): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Permission test timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    const proc = spawn("node", [SIDECAR_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    const events: SidecarEvent[] = [];
    let permissionRequestSeen = false;

    const rl = readline.createInterface({ input: proc.stdout! });
    rl.on("line", (line) => {
      try {
        const event = JSON.parse(line) as SidecarEvent;
        events.push(event);

        const preview = JSON.stringify(event).slice(0, 150);
        console.log(`  [${event.type}] ${preview}`);

        // When we see a permission request, approve it
        if (event.type === "input_request") {
          permissionRequestSeen = true;
          console.log("  -> Approving permission request");
          const response = JSON.stringify({
            type: "permission_response",
            id: WORKSPACE_ID,
            approved: true,
          });
          proc.stdin!.write(response + "\n");
        }

        if (event.type === "result") {
          clearTimeout(timer);
          verifyPermission();
        }
      } catch {
        // ignore
      }
    });

    proc.stderr?.on("data", (data) => {
      const msg = data.toString().trim();
      if (msg) console.error(`  [stderr] ${msg}`);
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn sidecar: ${err.message}`));
    });

    function verifyPermission() {
      try {
        assert(permissionRequestSeen, "Should have received an input_request event for file write");

        // Should have a tool_use for Write
        const toolUseEvents = events.filter(
          (e) => e.type === "assistant" && JSON.stringify(e).includes("Write"),
        );
        assert(toolUseEvents.length > 0, "Should have a Write tool_use event");

        console.log(
          `\n✓ Permission flow test passed (${events.length} events, permission request received and approved)`,
        );
        proc.kill();
        resolve();
      } catch (err) {
        proc.kill();
        reject(err);
      }
    }

    // Send a query that requires file write permission (in default/safe mode)
    const query = JSON.stringify({
      type: "query",
      id: WORKSPACE_ID,
      prompt: "Create a file at /tmp/fury-permission-test.txt containing 'test passed'",
      cwd: process.cwd(),
      permissionMode: "default", // This triggers permission prompts
    });

    console.log("Sending query that requires write permission...");
    proc.stdin!.write(query + "\n");
  });
}

// Run tests sequentially
async function main() {
  console.log("=== Sidecar Integration Tests ===\n");

  console.log("--- Test 1: Basic query flow ---");
  await runTest();

  console.log("\n--- Test 2: Permission flow ---");
  await runPermissionTest();

  console.log("\nAll tests passed!");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\nTest failed: ${err.message}`);
    process.exit(1);
  });
