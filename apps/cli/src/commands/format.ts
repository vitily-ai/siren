import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Resource } from '@sirenpm/core';
import {
  createIRContextFromParseResult,
  renderSyntaxDocument,
  type SourceDocument,
} from '@sirenpm/language';
import { getParser } from '../parser';
import { loadProject } from '../project';

export interface FormatOptions {
  dryRun?: boolean;
  verbose?: boolean;
}

// TODO move to helper - this is duplicated a lot
/** Helper to wrap a source string as a SourceDocument array */
function doc(content: string, name: string): SourceDocument[] {
  return [{ name, content }];
}

function resourcesEqual(a: readonly Resource[], b: readonly Resource[]): boolean {
  try {
    // Compare semantics only, ignoring origin field (which may differ between parses)
    const stripOrigin = (r: Resource) => {
      const { origin, ...rest } = r;
      return {
        ...rest,
        attributes: r.attributes.map((attr) => {
          const { raw, origin: attrOrigin, ...attrRest } = attr;
          return attrRest;
        }),
      };
    };
    // NOTE: TODO[RT-COMPARE]
    // The current round-trip semantic comparison uses JSON.stringify after
    // stripping `origin` and other runtime fields. This approach is brittle:
    // - attribute ordering changes can break the equality
    // - IR shape changes may introduce transient fields
    // Consider replacing this with a deterministic comparator that ignores
    // origin/raw fields and compares semantics explicitly.
    // See task `runformat-roundtrip` in siren/debt.siren.
    return JSON.stringify(a.map(stripOrigin)) === JSON.stringify(b.map(stripOrigin));
  } catch (_e) {
    return false;
  }
}

function debugStringifyResources(resources: readonly Resource[]): string {
  const stripOrigin = (r: Resource) => {
    const { origin, ...rest } = r;
    return {
      ...rest,
      attributes: r.attributes.map((attr) => {
        const { raw, ...attrRest } = attr;
        return attrRest;
      }),
    };
  };
  return JSON.stringify(resources.map(stripOrigin), null, 2);
}

export async function runFormat(opts: FormatOptions = {}): Promise<void> {
  // Reload project context to ensure files are discovered in test envs
  const ctx = await loadProject(process.cwd());
  if (!ctx) throw new Error('Project context not loaded');
  const parser = await getParser();

  const totalFiles = ctx.files.length;
  const updatedFiles: string[] = [];
  const updatedFilesWouldEdit: string[] = [];

  async function processFile(filePath: string) {
    const result = { filePath, updated: false, wouldEdit: false };
    try {
      const source = fs.readFileSync(filePath, 'utf-8');
      const relPath = path.relative(process.cwd(), filePath);
      const parseResult = await parser.parse(doc(source, relPath));
      const hasParseErrors = parseResult.errors.some(
        (error) => (error.severity ?? 'error') === 'error',
      );
      if (!parseResult.tree || hasParseErrors) {
        console.error(`Skipping ${relPath} (parse error)`);
        return result;
      }

      const syntaxDocument = parseResult.syntaxDocuments?.[0];
      if (!syntaxDocument) {
        console.error(`Skipping ${relPath} (parse error)`);
        return result;
      }

      const { context: perFileIR } = createIRContextFromParseResult(parseResult);
      const toWrite = renderSyntaxDocument(syntaxDocument);

      // Validate round-trip: parse formatted text and decode
      const parse2 = await parser.parse(doc(toWrite, relPath));
      const formattedHasParseErrors = parse2.errors.some(
        (error) => (error.severity ?? 'error') === 'error',
      );
      if (!parse2.tree || formattedHasParseErrors) {
        console.error(`Format produced unparsable output for ${filePath}`);
        return result;
      }
      const { context: decoded2 } = createIRContextFromParseResult(parse2);
      if (!resourcesEqual(perFileIR.resources, decoded2.resources)) {
        console.error(`Format round-trip changed semantics for ${filePath}; skipping`);
        if (process.env.SIREN_FORMAT_DEBUG === '1') {
          console.error('--- SIREN_FORMAT_DEBUG: original decoded resources ---');
          console.error(debugStringifyResources(perFileIR.resources));
          console.error('--- SIREN_FORMAT_DEBUG: re-decoded resources ---');
          console.error(debugStringifyResources(decoded2.resources));
          console.error('--- SIREN_FORMAT_DEBUG: formatted output ---');
          console.error(toWrite);
          console.error('--- /SIREN_FORMAT_DEBUG ---');
        }
        return result;
      }

      // If formatted output equals original source, do not write or count as updated.
      if (toWrite === source) {
        return result;
      }

      if (opts.dryRun) {
        // Preserve existing behavior: print exported content for dry-run
        const toPrint = toWrite.endsWith('\n') ? toWrite : `${toWrite}\n`;
        console.log(toPrint);
        result.wouldEdit = true;
        return result;
      }

      // TODO[RUNFORMAT-ATOMIC]
      // Currently the formatter writes files with `fs.writeFileSync` which is
      // not atomic and has no backup or rollback semantics. Implement an
      // atomic write (write to temp file + rename) and optionally expose a
      // documented `--backup` or safe-backup behavior. See task
      // `runformat-atomic-backup` in siren/debt.siren.
      fs.writeFileSync(filePath, toWrite, 'utf-8');
      result.updated = true;
      return result;
    } catch (e) {
      console.error(`Error formatting ${filePath}: ${(e as Error).message}`);
      return result;
    }
  }

  const results = await Promise.all(ctx.files.map((f) => processFile(f)));
  for (const r of results) {
    if (r.updated) updatedFiles.push(path.relative(process.cwd(), r.filePath));
    if (r.wouldEdit) updatedFilesWouldEdit.push(path.relative(process.cwd(), r.filePath));
  }
  // Print summary
  const updatedCount = opts.dryRun ? updatedFilesWouldEdit.length : updatedFiles.length;
  console.log(`Updated ${updatedCount} files out of ${totalFiles}`);
  if (opts.verbose) {
    const list = opts.dryRun ? updatedFilesWouldEdit : updatedFiles;
    for (const p of list) console.log(`- ${p}`);
  }
}
