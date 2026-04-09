/**
 * Layer 2: Rule-Based Compressor
 *
 * Compresses raw observations into concise snapshots for Layer 1 context injection.
 * Zero API token cost — runs entirely in the sidecar process.
 */

import type { Observation } from "./extractor.js";

export interface CompressedSnapshot {
  scope: string;
  scopeId: string | null;
  category: string;
  content: string;
  observationIds: string[];
}

interface StoredObservation extends Observation {
  id: string;
  createdAt: string;
}

/**
 * Compress a set of observations into category-based snapshots.
 * Deduplicates, summarizes, and caps output to a token budget.
 */
export function compressObservations(
  observations: StoredObservation[],
  scope: string,
  scopeId: string | null,
  maxItemsPerCategory: number = 10,
): CompressedSnapshot[] {
  const snapshots: CompressedSnapshot[] = [];

  // Group by type
  const byType = new Map<string, StoredObservation[]>();
  for (const obs of observations) {
    const group = byType.get(obs.observationType) || [];
    group.push(obs);
    byType.set(obs.observationType, group);
  }

  // Decisions
  const decisions = byType.get("decision") || [];
  if (decisions.length > 0) {
    const deduped = deduplicateByContent(decisions, maxItemsPerCategory);
    snapshots.push({
      scope,
      scopeId,
      category: "decisions",
      content: deduped.map((d) => `- ${d.content}`).join("\n"),
      observationIds: deduped.map((d) => d.id),
    });
  }

  // Patterns & conventions
  const patterns = byType.get("pattern") || [];
  if (patterns.length > 0) {
    const deduped = deduplicateByContent(patterns, maxItemsPerCategory);
    snapshots.push({
      scope,
      scopeId,
      category: "patterns",
      content: deduped.map((p) => `- ${p.content}`).join("\n"),
      observationIds: deduped.map((p) => p.id),
    });
  }

  // Recent errors (keep only most recent per file)
  const errors = byType.get("error") || [];
  if (errors.length > 0) {
    const recentErrors = deduplicateErrorsByFile(errors, 5);
    snapshots.push({
      scope,
      scopeId,
      category: "errors",
      content: recentErrors.map((e) => `- ${e.content}`).join("\n"),
      observationIds: recentErrors.map((e) => e.id),
    });
  }

  // File changes — summarize as "recently modified files"
  const fileChanges = byType.get("file_change") || [];
  if (fileChanges.length > 0) {
    const recentFiles = summarizeFileChanges(fileChanges, maxItemsPerCategory);
    snapshots.push({
      scope,
      scopeId,
      category: "progress",
      content: recentFiles,
      observationIds: fileChanges.slice(0, maxItemsPerCategory).map((f) => f.id),
    });
  }

  // Preferences
  const preferences = byType.get("preference") || [];
  if (preferences.length > 0) {
    const deduped = deduplicateByContent(preferences, maxItemsPerCategory);
    snapshots.push({
      scope,
      scopeId,
      category: "preferences",
      content: deduped.map((p) => `- ${p.content}`).join("\n"),
      observationIds: deduped.map((p) => p.id),
    });
  }

  return snapshots;
}

/**
 * Deduplicate observations by content similarity.
 * Uses simple string overlap to detect near-duplicates.
 */
function deduplicateByContent(
  observations: StoredObservation[],
  maxItems: number,
): StoredObservation[] {
  // Sort by most recent first
  const sorted = [...observations].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt),
  );

  const kept: StoredObservation[] = [];
  for (const obs of sorted) {
    if (kept.length >= maxItems) break;

    // Check if we already have something very similar
    const isDuplicate = kept.some(
      (existing) => contentSimilarity(existing.content, obs.content) > 0.7,
    );

    if (!isDuplicate) {
      kept.push(obs);
    }
  }

  return kept;
}

/**
 * Deduplicate errors — keep only the most recent error per file path.
 */
function deduplicateErrorsByFile(
  errors: StoredObservation[],
  maxItems: number,
): StoredObservation[] {
  const byFile = new Map<string, StoredObservation>();

  // Sort by most recent first, then take first per file
  const sorted = [...errors].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt),
  );

  for (const err of sorted) {
    const key = err.filePaths.length > 0 ? err.filePaths[0] : err.content.slice(0, 50);
    if (!byFile.has(key)) {
      byFile.set(key, err);
    }
  }

  return [...byFile.values()].slice(0, maxItems);
}

/**
 * Summarize file changes into a concise list.
 */
function summarizeFileChanges(
  changes: StoredObservation[],
  maxItems: number,
): string {
  // Count modifications per file
  const fileCounts = new Map<string, number>();
  for (const change of changes) {
    for (const fp of change.filePaths) {
      fileCounts.set(fp, (fileCounts.get(fp) || 0) + 1);
    }
  }

  // Sort by most modified
  const sorted = [...fileCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxItems);

  return sorted.map(([file, count]) => `- ${file} (${count} changes)`).join("\n");
}

/**
 * Simple content similarity using word overlap (Jaccard index).
 */
function contentSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
