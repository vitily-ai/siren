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

        // Convert parsed CST to SirenDocument (runs decoder)
        const sirenDoc = parsed.toSirenDocument();
        expect(sirenDoc).toBeDefined();
        expect(sirenDoc.id).toBe(path.basename(filePath, '.siren'));
        expect(Array.isArray(sirenDoc.resources)).toBe(true);

        // Check each resource is decoded with basic structure
        for (const resource of sirenDoc.resources) {
          expect(resource.type).toMatch(/^(task|milestone)$/);
          expect(resource.id).toBeTypeOf('string');
          expect(resource.id.length).toBeGreaterThan(0);
          expect(Array.isArray(resource.attributes)).toBe(true);
        }
      }
    });
  });
});
