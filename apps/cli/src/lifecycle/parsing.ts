import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SourceDocument } from '@sirenpm/language';
import { getParser } from '../parser';
import type { CliContext } from './context';

export async function runParsing(ctx: CliContext): Promise<void> {
  if (ctx.files.length === 0) {
    ctx.phasesRun.add('parsing');
    return;
  }

  const parser = await getParser();
  const sourceDocuments: SourceDocument[] = ctx.files.map((filePath) => ({
    name: path.relative(ctx.rootDir, filePath),
    content: fs.readFileSync(filePath, 'utf-8'),
  }));

  ctx.sourceDocuments = sourceDocuments;
  ctx.parseResult = await parser.parse(sourceDocuments);
  ctx.phasesRun.add('parsing');
}
