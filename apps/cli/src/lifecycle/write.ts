import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderSirenDocument } from '@sirenpm/language';
import type { CliContext, DeepReadonly } from './context';

export interface WriteArtifact {
  originalFileContents: Map<string, string>;
}

export function runWrite(ctx: DeepReadonly<CliContext>): WriteArtifact {
  if (!ctx.builder) {
    throw new Error('Invariant: runWrite called without a builder on context');
  }

  const originalFileContents = new Map<string, string>();
  for (const [key, value] of ctx.originalFileContents.entries()) {
    originalFileContents.set(key, value as string);
  }

  for (const document of ctx.builder.documents) {
    const absolutePath = path.join(ctx.rootDir, document.id);
    const original = ctx.originalFileContents.get(absolutePath);
    if (original === undefined) {
      continue;
    }

    const rendered = renderSirenDocument(document);
    if (rendered === original) continue;

    fs.writeFileSync(absolutePath, rendered, 'utf-8');
    originalFileContents.set(absolutePath, rendered);
  }

  return { originalFileContents };
}
