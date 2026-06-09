import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliContext, DeepReadonly } from './context';

export interface WriteArtifact {
  originalFileContents: Map<string, string>;
}

/**
 * Persist source-preserving edits back to disk.
 *
 * The render path moved from core (`renderSirenDocument(document)`) to the
 * language `ParsedDocument` services (`format()` / `patchEntry` / `removeEntry`
 * mutate the document's source in place). Write-back now reads each parsed
 * document's current `.source` and flushes it when it diverges from the
 * original file content.
 *
 * NOTE (drift / open gap): mutations flow through the flat-entry `SirenBuilder`
 * (ADR-0005), but persistence flows through per-file `ParsedDocument`s. Bridging
 * the two — routing builder entry deltas back to the originating document via
 * `origin.document` and replaying them with `patchEntry`/`removeEntry` — is not
 * yet implemented. Until a mutation command exists, this phase only flushes
 * document-level source edits (e.g. `format()`), which is sufficient for the
 * current lifecycle where no command wires a `mutate` hook.
 */
export function runWrite({
  parsedDocuments,
  originalFileContents,
  rootDir,
}: DeepReadonly<CliContext>): WriteArtifact {
  const originalFileContentsMap = new Map<string, string>();
  for (const [key, value] of originalFileContents.entries()) {
    originalFileContentsMap.set(key, value as string);
  }

  for (const parsed of parsedDocuments) {
    const { name, content } = parsed.source;
    const absolutePath = path.join(rootDir, name);
    const original = originalFileContentsMap.get(absolutePath);
    if (original === undefined || content === original) {
      continue;
    }

    fs.writeFileSync(absolutePath, content, 'utf-8');
    originalFileContentsMap.set(absolutePath, content);
  }

  return { originalFileContents: originalFileContentsMap };
}
