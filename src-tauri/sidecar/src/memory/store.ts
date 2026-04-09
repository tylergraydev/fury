/**
 * Memory Store
 *
 * Manages in-memory observation buffer and emits events to the Rust backend
 * for SQLite persistence. The sidecar is stateless across restarts —
 * all durable storage goes through Rust via NDJSON events.
 */

import type { Observation } from "./extractor.js";
import { compressObservations, type CompressedSnapshot } from "./compressor.js";

export interface StoredObservation extends Observation {
  id: string;
  createdAt: string;
  sessionId: string | null;
}

export interface SearchResult {
  observationType: string;
  content: string;
  filePaths: string[];
  createdAt: string;
}

type EmitFn = (event: Record<string, unknown>) => void;

/**
 * In-memory observation buffer that emits to Rust for persistence.
 * Each workspace gets its own store instance.
 */
export class MemoryStore {
  private observations: StoredObservation[] = [];
  private workspaceId: string;
  private repoId: string;
  private sessionId: string | null = null;
  private emit: EmitFn;

  constructor(workspaceId: string, repoId: string, emit: EmitFn) {
    this.workspaceId = workspaceId;
    this.repoId = repoId;
    this.emit = emit;
  }

  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /**
   * Add an observation (from PostToolUse hook).
   * Immediately emits to Rust for SQLite persistence.
   */
  addObservation(obs: Observation): void {
    const stored: StoredObservation = {
      ...obs,
      id: generateId(),
      createdAt: new Date().toISOString(),
      sessionId: this.sessionId,
    };
    this.observations.push(stored);

    // Emit to Rust for persistence
    this.emit({
      id: this.workspaceId,
      type: "memory_observation",
      repo_id: this.repoId,
      observation: {
        observationType: obs.observationType,
        content: obs.content,
        sourceTool: obs.sourceTool,
        filePaths: obs.filePaths,
        sessionId: this.sessionId,
      },
    });
  }

  /**
   * Search observations in the local buffer.
   * For cross-session search, the MCP tool should query Rust via a command,
   * but for in-session search, the buffer is sufficient.
   */
  async search(
    query: string,
    _scope: string,
    limit: number,
  ): Promise<SearchResult[]> {
    const lowerQuery = query.toLowerCase();
    const words = lowerQuery.split(/\s+/).filter(Boolean);

    return this.observations
      .filter((obs) => {
        const text = obs.content.toLowerCase();
        return words.some((w) => text.includes(w));
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((obs) => ({
        observationType: obs.observationType,
        content: obs.content,
        filePaths: obs.filePaths,
        createdAt: obs.createdAt,
      }));
  }

  /**
   * Save a learning (from the MCP save_learning tool).
   * Emits as a snapshot event to Rust.
   */
  async saveLearning(
    content: string,
    category: string,
    scope: string,
  ): Promise<void> {
    const scopeId =
      scope === "global"
        ? null
        : scope === "repo"
          ? this.repoId
          : this.workspaceId;

    this.emit({
      id: this.workspaceId,
      type: "memory_snapshot",
      snapshot: {
        id: generateId(),
        scope,
        scopeId,
        category,
        content: `- ${content}`,
        observationIds: [],
        createdAt: new Date().toISOString(),
        supersedes: null,
      },
    });
  }

  /**
   * Get file-related observations for context.
   */
  async getFileContext(filePaths: string[]): Promise<string | null> {
    const relevant = this.observations.filter((obs) =>
      obs.filePaths.some((fp) => filePaths.some((target) => fp.includes(target) || target.includes(fp))),
    );

    if (relevant.length === 0) return null;

    return relevant
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10)
      .map(
        (obs) =>
          `[${obs.observationType}] ${obs.content} (${new Date(obs.createdAt).toLocaleDateString()})`,
      )
      .join("\n");
  }

  /**
   * Compress observations into snapshots (called on SessionEnd).
   * Emits compressed snapshots to Rust for persistence.
   */
  compressAndEmit(): void {
    if (this.observations.length < 3) return; // Not enough to compress

    const snapshots = compressObservations(
      this.observations,
      "workspace",
      this.workspaceId,
    );

    for (const snapshot of snapshots) {
      this.emit({
        id: this.workspaceId,
        type: "memory_snapshot",
        snapshot: {
          id: generateId(),
          scope: snapshot.scope,
          scopeId: snapshot.scopeId,
          category: snapshot.category,
          content: snapshot.content,
          observationIds: snapshot.observationIds,
          createdAt: new Date().toISOString(),
          supersedes: null,
        },
      });
    }
  }

  /**
   * Get observation count (for diagnostics).
   */
  get observationCount(): number {
    return this.observations.length;
  }
}

function generateId(): string {
  return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
