import * as path from 'node:path';
import type { EntryChange } from '@sirenpm/core';
import type { CliContext, DeepReadonly } from './context';

export interface SourceBridgeArtifact {
  errors: string[];
  /** Absolute file paths whose content was patched and should be rewritten. */
  touchedPaths: string[];
}

/**
 * Route core patch deltas back to per-file ParsedDocument source edits.
 *
 * For each 'updated' EntryChange:
 *   - Look up the original SourcedEntry in ctx.entries to find its
 *     origin.document (the file it came from).
 *   - If the same entryId appears in multiple originating documents,
 *     push an error and skip (deferred to cli-mutations-mv-duplicate-id).
 *     - FIXME: it is simpler to just validate that the entry is unique in the builder
 *       Introduce a hookable validation phase?
 *   - Find the new entry value from the post-mutation builder.entries.
 *   - Call parsedDoc.patchEntry(id, newEntry) to surgically update source.
 *   - Add the absolute file path to ctx.rewriteSignal so the write phase
 *     flushes it to disk.
 *
 * 'deleted' and 'created' changes are logged and dropped (no command
 * produces them yet — base mv only emits 'updated').
 */
export function runSourceBridge(
  ctx: DeepReadonly<CliContext>,
  changes: readonly EntryChange[],
): SourceBridgeArtifact {
  const errors: string[] = [];
  const touchedPaths: string[] = [];

  for (const change of changes) {
    if (change.mode !== 'updated') {
      console.log(`[source-bridge] dropping ${change.mode} entry: ${change.entryId}`);
      continue;
    }

    // Find originating document(s) from the original entries
    const originals = ctx.entries.filter((e) => e.id === change.entryId);

    if (originals.length === 0) {
      errors.push(`Entry "${change.entryId}" not found in decoded entries`);
      continue;
    }

    if (originals.length > 1) {
      errors.push(`Entry "${change.entryId}" declared in multiple documents — refusing to patch.`);
      continue;
    }

    const origin = originals[0]!.origin;
    const documentName = origin.document;

    // Find the new entry from the post-mutation builder
    const builder = ctx.builder;
    if (!builder) {
      errors.push('No builder available for bridge');
      continue;
    }
    const newEntry = builder.entries.find((e) => e.id === change.entryId);
    if (!newEntry) {
      errors.push(`Entry "${change.entryId}" not found in post-mutation builder`);
      continue;
    }

    // Find the ParsedDocument for this file
    const parsedDoc = ctx.parsedDocuments.find((p) => p.source.name === documentName);
    if (!parsedDoc) {
      errors.push(`ParsedDocument not found for document "${documentName}"`);
      continue;
    }

    // Surgical source update
    parsedDoc.patchEntry(change.entryId, newEntry);

    // Collect the touched path for the lifecycle to merge into rewriteSignal
    const absolutePath = path.join(ctx.rootDir, documentName);
    touchedPaths.push(absolutePath);
  }

  return { errors, touchedPaths };
}
