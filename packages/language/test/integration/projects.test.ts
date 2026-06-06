import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createParser } from '../../src/index';

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

  describe('synthesis integration', () => {
    it('synthesizes a milestone for a fixture with no explicit matching milestone', async () => {
      // no-milestones-only-tasks contains only tasks (alpha, beta) in tasks.siren —
      // the document id "tasks" has no explicit milestone, so synthesis should
      // create one.
      const projectDir = path.join(FIXTURE_PROJECTS_DIR, 'no-milestones-only-tasks');
      const sourceDir = path.join(projectDir, 'siren');
      const sirenFiles = collectSirenFiles(sourceDir);
      expect(sirenFiles.length).toBeGreaterThan(0);

      for (const filePath of sirenFiles) {
        const content = fs.readFileSync(filePath, 'utf8');
        // biome-ignore lint/performance/noAwaitInLoops: test
        const parsed = await parser.parse({ name: path.basename(filePath), content });

        const withoutSynthesis = parsed.toEntries();
        const withSynthesis = parsed.toEntries({ synthesizeMilestones: true });

        // Synthesis should add exactly one entry (the synthetic milestone).
        expect(withSynthesis.length).toBe(withoutSynthesis.length + 1);

        // The last entry must be the synthetic milestone.
        const synthetic = withSynthesis[withSynthesis.length - 1];
        expect(synthetic.type).toBe('milestone');
        expect(synthetic.origin.kind).toBe('synthetic');
      }
    });
  });
});
