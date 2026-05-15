import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ParseResult, SourceDocument } from '@sirenpm/language';
import { getParser } from '../parser';
import type { CliContext, DeepReadonly } from './context';

export interface ParsingArtifact {
  sourceDocuments: SourceDocument[];
  originalFileContents: Map<string, string>;
  parseResult?: ParseResult;
}

export async function runParsing(ctx: DeepReadonly<CliContext>): Promise<ParsingArtifact> {
  const originalFileContents = new Map<string, string>();

  if (ctx.files.length === 0) {
    return {
      sourceDocuments: [],
      originalFileContents,
    };
  }

  const parser = await getParser();
  const sourceDocuments: SourceDocument[] = ctx.files.map((filePath) => {
    const content = fs.readFileSync(filePath, 'utf-8');
    originalFileContents.set(filePath, content);
    return {
      name: path.relative(ctx.rootDir, filePath),
      content,
    };
  });

  const parseResult = await parser.parse(sourceDocuments);

  return {
    sourceDocuments,
    originalFileContents,
    parseResult,
  };
}
