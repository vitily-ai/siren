import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ParsedDocument, SourceDocument } from '@sirenpm/language';
import { getParser } from '../parser';
import type { CliContext, DeepReadonly } from './context';

export interface ParsingArtifact {
  sourceDocuments: SourceDocument[];
  parsedDocuments: ParsedDocument[];
}

export async function runParsing(ctx: DeepReadonly<CliContext>): Promise<ParsingArtifact> {
  const parser = await getParser();
  const sourceDocuments: SourceDocument[] = ctx.files.map((filePath) => {
    const content = fs.readFileSync(filePath, 'utf-8');
    return {
      name: path.relative(ctx.rootDir, filePath),
      content,
    };
  });

  const parsedDocuments = await parser.parseBatch(sourceDocuments);

  return {
    sourceDocuments,
    parsedDocuments,
  };
}
