import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Language, Parser as TsParser } from 'web-tree-sitter';
import { getWasmUrl } from '../../src/grammar/loadHandle';
import { createParser } from '../../src/index';

// ---------------------------------------------------------------------------
// Module-level cached tree-sitter initialisation (shared by all tests)
// ---------------------------------------------------------------------------
let initPromise: Promise<void> | undefined;
async function ensureRuntimeInit(): Promise<void> {
  if (!initPromise) {
    initPromise = TsParser.init();
  }
  await initPromise;
}

let langPromise: Promise<Language> | undefined;
async function _getSirenLanguage(): Promise<Language> {
  if (!langPromise) {
    langPromise = (async () => {
      await ensureRuntimeInit();
      return Language.load(getWasmUrl().pathname);
    })();
  }
  return langPromise;
}

const FIXTURE_PROJECTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/projects',
);

function collectSirenFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSirenFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.siren')) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

describe('Language Package Projects Integration', async () => {
  const parser = await createParser();

  const fixtureSlugs = fs
    .readdirSync(FIXTURE_PROJECTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  describe.each(fixtureSlugs)('project fixture: %s', (slug) => {
    const projectDir = path.join(FIXTURE_PROJECTS_DIR, slug);
    const nestedSirenDir = path.join(projectDir, 'siren');
    const sourceDir = fs.existsSync(nestedSirenDir) ? nestedSirenDir : projectDir;
    const sirenFiles = collectSirenFiles(sourceDir);

    it('collects and parses the project files successfully', async () => {
      expect(sirenFiles.length).toBeGreaterThan(0);

      for (const filePath of sirenFiles) {
        const content = fs.readFileSync(filePath, 'utf8');

        // Parse through createParser()
        // biome-ignore lint/performance/noAwaitInLoops: test
        const parsed = await parser.parse({ name: path.basename(filePath), content });
        expect(parsed).toBeDefined();

        // Ensure CST compiles successfully
        expect(parsed.ast).toBeDefined();

        // Convert parsed CST to entries (runs decoder)
        const entries = parsed.toEntries();
        expect(entries).toBeDefined();
        expect(Array.isArray(entries)).toBe(true);

        // Check each entry is decoded with basic structure
        for (const entry of entries) {
          expect(entry.type).toMatch(/^(task|milestone)$/);
          expect(entry.id).toBeTypeOf('string');
          expect(entry.id.length).toBeGreaterThan(0);
          expect(Array.isArray(entry.attributes)).toBe(true);
          expect(entry.origin).toBeDefined();
        }
      }
    });
  });
});
