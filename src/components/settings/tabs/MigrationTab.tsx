import { useEffect, useState } from "react";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useRepositoryStore } from "../../../stores/repositoryStore";
import type { CursorMigrationResult, CursorRulesImportResult } from "../../../lib/tauri";
import { detectCursorrules, importCursorrules } from "../../../lib/tauri";

export function MigrationTab() {
  const { cursorDetected, checkCursorConfig, importCursor } =
    useSettingsStore();
  const { repositories } = useRepositoryStore();
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<CursorMigrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cursorrules state
  const [selectedRepoId, setSelectedRepoId] = useState("");
  const [rulesDetected, setRulesDetected] = useState<boolean | null>(null);
  const [rulesImporting, setRulesImporting] = useState(false);
  const [rulesResult, setRulesResult] =
    useState<CursorRulesImportResult | null>(null);
  const [rulesError, setRulesError] = useState<string | null>(null);

  useEffect(() => {
    checkCursorConfig();
  }, [checkCursorConfig]);

  useEffect(() => {
    if (selectedRepoId) {
      setRulesDetected(null);
      setRulesResult(null);
      setRulesError(null);
      detectCursorrules(selectedRepoId)
        .then(setRulesDetected)
        .catch(() => setRulesDetected(false));
    }
  }, [selectedRepoId]);

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    try {
      const res = await importCursor();
      setResult(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setImporting(false);
    }
  };

  const handleRulesImport = async (overwrite: boolean) => {
    /* v8 ignore next -- @preserve: button only renders when selectedRepoId is set */
    if (!selectedRepoId) return;
    setRulesImporting(true);
    setRulesError(null);
    try {
      const res = await importCursorrules(selectedRepoId, overwrite);
      setRulesResult(res);
    } catch (e) {
      setRulesError(String(e));
    } finally {
      setRulesImporting(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {error && (
        <div className="text-xs" style={{ color: "var(--error)" }}>
          {error}
        </div>
      )}

      {/* Cursor MCP migration */}
      <div>
        <label
          className="mb-2 block text-xs font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          Import MCP Servers from Cursor
        </label>
        <div
          className="rounded p-3"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="mb-2 flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor:
                  cursorDetected === null
                    ? "var(--text-muted)"
                    : cursorDetected
                      ? "var(--success)"
                      : "var(--text-muted)",
              }}
            />
            <span style={{ color: "var(--text-primary)" }}>
              {cursorDetected === null
                ? "Checking..."
                : cursorDetected
                  ? "Cursor config detected at ~/.cursor/mcp.json"
                  : "No Cursor config found"}
            </span>
          </div>

          {result ? (
            <div className="text-xs" style={{ color: "var(--success)" }}>
              Imported {result.mcpServersImported} of{" "}
              {result.mcpServersFound} MCP servers.
            </div>
          ) : (
            <button
              onClick={handleImport}
              disabled={!cursorDetected || importing}
              className="rounded px-3 py-1.5 text-xs"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--bg-primary)",
                opacity: !cursorDetected || importing ? 0.5 : 1,
              }}
            >
              {importing ? "Importing..." : "Import MCP Servers"}
            </button>
          )}
        </div>
      </div>

      {/* .cursorrules to CLAUDE.md conversion */}
      <div>
        <label
          className="mb-2 block text-xs font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          Convert .cursorrules to CLAUDE.md
        </label>
        <div
          className="space-y-2 rounded p-3"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border)",
          }}
        >
          <select
            value={selectedRepoId}
            onChange={(e) => setSelectedRepoId(e.target.value)}
            className="w-full rounded px-2 py-1.5 text-xs"
            style={{
              backgroundColor: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          >
            <option value="">Select a repository</option>
            {repositories.map((repo) => (
              <option key={repo.id} value={repo.id}>
                {repo.name}
              </option>
            ))}
          </select>

          {selectedRepoId && (
            <div className="flex items-center gap-2 text-xs">
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor:
                    rulesDetected === null
                      ? "var(--text-muted)"
                      : rulesDetected
                        ? "var(--success)"
                        : "var(--text-muted)",
                }}
              />
              <span style={{ color: "var(--text-primary)" }}>
                {rulesDetected === null
                  ? "Checking..."
                  : rulesDetected
                    ? ".cursorrules found"
                    : "No .cursorrules file in this repo"}
              </span>
            </div>
          )}

          {rulesError && (
            <div className="text-xs" style={{ color: "var(--error)" }}>
              {rulesError}
            </div>
          )}

          {rulesResult ? (
            <div
              className="text-xs"
              style={{
                color: rulesResult.written
                  ? "var(--success)"
                  : "var(--text-muted)",
              }}
            >
              {rulesResult.written
                ? `CLAUDE.md ${rulesResult.claudeMdExisted ? "merged" : "created"} at ${rulesResult.claudeMdPath}`
                : rulesResult.claudeMdExisted
                  ? "CLAUDE.md already exists. Click Merge to prepend .cursorrules content."
                  : "No .cursorrules found."}
            </div>
          ) : null}

          {rulesDetected && !rulesResult?.written && (
            <div className="flex gap-2">
              <button
                onClick={() => handleRulesImport(false)}
                disabled={rulesImporting}
                className="rounded px-3 py-1.5 text-xs"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--bg-primary)",
                  opacity: rulesImporting ? 0.5 : 1,
                }}
              >
                {rulesImporting ? "Converting..." : "Convert to CLAUDE.md"}
              </button>
              {rulesResult?.claudeMdExisted && !rulesResult.written && (
                <button
                  onClick={() => handleRulesImport(true)}
                  disabled={rulesImporting}
                  className="rounded px-3 py-1.5 text-xs"
                  style={{
                    backgroundColor: "var(--bg-primary)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border)",
                    opacity: rulesImporting ? 0.5 : 1,
                  }}
                >
                  Merge into existing CLAUDE.md
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
        Import MCP servers from Cursor, or convert .cursorrules files to
        CLAUDE.md format for Claude Code compatibility.
      </div>
    </div>
  );
}
