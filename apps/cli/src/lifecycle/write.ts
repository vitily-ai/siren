import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderSirenDocument } from '@sirenpm/language';
import type { CliContext, DeepReadonly } from './context';

export interface WriteArtifact {
  originalFileContents: Map<string, string>;
}

export function runWrite({
  builder,
  originalFileContents,
  rootDir,
}: DeepReadonly<CliContext>): WriteArtifact {
  if (!builder) {
    throw new Error('Invariant: runWrite called without a builder on context');
  }

  const originalFileContentsMap = new Map<string, string>();
  for (const [key, value] of originalFileContents.entries()) {
    originalFileContentsMap.set(key, value as string);
  }

  for (const document of builder.documents) {
    const absolutePath = path.join(rootDir, document.id);
    const original = originalFileContentsMap.get(absolutePath);
    if (original === undefined) {
      continue;
    }

    const rendered = renderSirenDocument(document);
    if (rendered === original) continue;

    fs.writeFileSync(absolutePath, rendered, 'utf-8');
    originalFileContentsMap.set(absolutePath, rendered);
  }

  return { originalFileContents: originalFileContentsMap };
}
