import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { main } from '../src/index.js';
import { copyProjectFixture } from './helpers/fixture-utils.js';
import { assertDirMatchesExpected } from './helpers/fs-assert.js';

const expectedDir = path.join(__dirname, 'expected');

/**
 * Parse golden file frontmatter (metadata) delimited by a line of 3+ hyphens (---).
 * Returns { metadata, content } or throws if not found/invalid.
 */
function parseGoldenFileWithMetadata(
  raw: string,
  file: string,
): { metadata: any; content: string } {
  const lines = raw.split(/\r?\n/);
  let metaEnd = -1;
  // Find the first line that is only hyphens (--- or more)
  for (let i = 0; i < lines.length; ++i) {
    if (/^---+$/.test(lines?.[i]?.trim() ?? '')) {
      metaEnd = i;
      break;
    }
  }
  if (metaEnd === -1) {
    throw new Error(`could not locate golden file metadata in ${file}`);
  }
  const metaRaw = lines.slice(0, metaEnd).join('\n');
  let metadata: any;
  try {
    metadata = JSON.parse(metaRaw);
  } catch (e) {
    throw new Error(`invalid JSON metadata in ${file}: ${(e as Error).message}`);
  }
  const content = lines.slice(metaEnd + 1).join('\n');
  return { metadata, content };
}

function parseOutWithStdErr(
  raw: string,
  file: string,
): { metadata: any; stdout: string; stderr: string } {
  // Expect: <json-meta>\n---\n<stdout>\n---\n<stderr>
  const parts = raw.split(/\r?\n---\r?\n/);
  if (parts.length < 2) throw new Error(`invalid .out.txt in ${file}`);
  const metaRaw = parts[0];
  let metadata: any;
  try {
    metadata = JSON.parse(metaRaw);
  } catch (e) {
    throw new Error(`invalid JSON metadata in ${file}: ${(e as Error).message}`);
  }
  const stdout = parts[1] ?? '';
  const stderr = parts[2] ?? '';
  return { metadata, stdout, stderr };
}

// Recursively find all .txt files under a directory
function findAllTxtFiles(dir: string): string[] {
  let results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findAllTxtFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.txt')) {
      results.push(full);
    }
  }
  return results;
}

describe('golden CLI tests (expected/)', () => {
  const files = findAllTxtFiles(expectedDir);

  files.forEach((full) => {
    const relPath = path.relative(expectedDir, full);
    it(`matches ${relPath}`, async () => {
      // Two special golden patterns supported:
      // 1) Directory-level golden: expected/.../.out.txt — apply metadata and
      //    assert the *expected directory* matches the project directory.
      // 2) Top-level combined golden: expected/name.out.txt — assert stdout/stderr output.
      // Otherwise: regular per-file golden with JSON frontmatter.

      // Directory-level: a file literally named `.out.txt` inside a subdirectory.
      if (path.basename(relPath) === '.out.txt') {
        const outDir = path.dirname(full);
        const rawOut = fs.readFileSync(full, 'utf8');
        const {
          metadata,
          stdout: expectedStdout,
          stderr: expectedStderr,
        } = parseOutWithStdErr(rawOut, full);
        if (!metadata || typeof metadata !== 'object') {
          throw new Error(`missing or invalid metadata in ${relPath}`);
        }
        if (!metadata.fixture || typeof metadata.fixture !== 'string') {
          throw new Error(`missing or invalid 'fixture' in metadata for ${relPath}`);
        }
        if (!metadata.command || typeof metadata.command !== 'string') {
          throw new Error(`missing or invalid 'command' in metadata for ${relPath}`);
        }
        const args = metadata.command.trim().split(/\s+/);
        if (args.length === 0 || args[0].toLowerCase() !== 'siren') {
          throw new Error(`command must begin with 'siren' in ${relPath}`);
        }
        const sirenDir = await copyProjectFixture(metadata.fixture);
        const cwd = path.basename(sirenDir) === 'siren' ? path.dirname(sirenDir) : sirenDir;
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const originalCwd = process.cwd();
        try {
          process.chdir(cwd);
          await main(args.slice(1));
          const outCalls = logSpy.mock.calls
            .map((c) => (c[0] !== undefined ? String(c[0]) : ''))
            .join('\n');
          const errCalls = errSpy.mock.calls
            .map((c) => (c[0] !== undefined ? String(c[0]) : ''))
            .join('\n');
          function stripComments(s: string): string {
            return s
              .split(/\r?\n/)
              .filter((line) => !/^\s*#/.test(line))
              .join('\n')
              .replace(/\s+$/u, '');
          }
          const normOutCalls = outCalls.replace(/\s+$/u, '');
          const normErrCalls = errCalls.replace(/\s+$/u, '');
          const normExpectedStdout = stripComments(expectedStdout);
          const normExpectedStderr = stripComments(expectedStderr);
          if (normExpectedStdout.length > 0) {
            expect(normOutCalls).toBe(normExpectedStdout);
          }
          if (normExpectedStderr.length > 0) {
            expect(normErrCalls).toBe(normExpectedStderr);
          }
          // Assert filesystem state matches expected directory; ignore this .out.txt only
          await assertDirMatchesExpected(cwd, outDir, { ignoreGlobs: ['.out.txt'] });
        } finally {
          process.chdir(originalCwd);
          logSpy.mockRestore();
          errSpy.mockRestore();
        }
        return;
      }

      // Top-level combined out files: <name>.out.txt containing JSON meta, stdout, then stderr
      if (relPath.endsWith('.out.txt')) {
        const rawOut = fs.readFileSync(full, 'utf8');
        const {
          metadata,
          stdout: expectedStdout,
          stderr: expectedStderr,
        } = parseOutWithStdErr(rawOut, relPath);
        if (!metadata || typeof metadata !== 'object') {
          throw new Error(`missing or invalid metadata in ${relPath}`);
        }
        if (!metadata.fixture || typeof metadata.fixture !== 'string') {
          throw new Error(`missing or invalid 'fixture' in metadata for ${relPath}`);
        }
        if (!metadata.command || typeof metadata.command !== 'string') {
          throw new Error(`missing or invalid 'command' in metadata for ${relPath}`);
        }
        const args = metadata.command.trim().split(/\s+/);
        if (args.length === 0 || args[0].toLowerCase() !== 'siren') {
          throw new Error(`command must begin with 'siren' in ${relPath}`);
        }
        const sirenDir = await copyProjectFixture(metadata.fixture);
        const cwd = path.basename(sirenDir) === 'siren' ? path.dirname(sirenDir) : sirenDir;
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const originalCwd = process.cwd();
        try {
          process.chdir(cwd);
          await main(args.slice(1));
          const outCalls = logSpy.mock.calls
            .map((c) => (c[0] !== undefined ? String(c[0]) : ''))
            .join('\n');
          const errCalls = errSpy.mock.calls
            .map((c) => (c[0] !== undefined ? String(c[0]) : ''))
            .join('\n');
          function stripComments(s: string): string {
            return s
              .split(/\r?\n/)
              .filter((line) => !/^\s*#/.test(line))
              .join('\n')
              .replace(/\s+$/u, '');
          }
          const normOutCalls = outCalls.replace(/\s+$/u, '');
          const normErrCalls = errCalls.replace(/\s+$/u, '');
          const normExpectedStdout = stripComments(expectedStdout);
          const normExpectedStderr = stripComments(expectedStderr);
          if (normExpectedStdout.length > 0) {
            expect(normOutCalls).toBe(normExpectedStdout);
          }
          if (normExpectedStderr.length > 0) {
            expect(normErrCalls).toBe(normExpectedStderr);
          }
        } finally {
          process.chdir(originalCwd);
          logSpy.mockRestore();
          errSpy.mockRestore();
        }
        return;
      }

      const raw = fs.readFileSync(full, 'utf8');
      const { metadata, content: expectedContent } = parseGoldenFileWithMetadata(raw, relPath);
      if (!metadata || typeof metadata !== 'object') {
        throw new Error(`missing or invalid metadata in ${relPath}`);
      }
      if (!metadata.fixture || typeof metadata.fixture !== 'string') {
        throw new Error(`missing or invalid 'fixture' in metadata for ${relPath}`);
      }
      if (!metadata.command || typeof metadata.command !== 'string') {
        throw new Error(`missing or invalid 'command' in metadata for ${relPath}`);
      }
      // Validate fixture exists
      const fixturePath = path.join(
        __dirname,
        '../../../packages/core/test/fixtures/projects',
        metadata.fixture,
      );
      if (!fs.existsSync(fixturePath)) {
        throw new Error(`fixture not found: ${metadata.fixture} (from ${relPath})`);
      }
      const args = metadata.command.trim().split(/\s+/);
      if (args.length === 0 || args[0].toLowerCase() !== 'siren') {
        throw new Error(`command must begin with 'siren' in ${relPath}`);
      }
      const isErr = relPath.includes('.err.');
      const sirenDir = await copyProjectFixture(metadata.fixture);
      const cwd = path.basename(sirenDir) === 'siren' ? path.dirname(sirenDir) : sirenDir;
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const originalCwd = process.cwd();
      try {
        process.chdir(cwd);
        await main(args.slice(1));
        const outCalls = logSpy.mock.calls
          .map((c) => (c[0] !== undefined ? String(c[0]) : ''))
          .join('\n');
        const errCalls = errSpy.mock.calls
          .map((c) => (c[0] !== undefined ? String(c[0]) : ''))
          .join('\n');
        const actual = isErr ? errCalls : outCalls;
        // Support comments in expected output: ignore lines starting with #
        function stripComments(s: string): string {
          return s
            .split(/\r?\n/)
            .filter((line) => !/^\s*#/.test(line))
            .join('\n')
            .replace(/\s+$/u, '');
        }
        const normActual = actual.replace(/\s+$/u, '');
        const normExpected = stripComments(expectedContent);
        expect(normActual).toBe(normExpected);
      } finally {
        process.chdir(originalCwd);
        logSpy.mockRestore();
        errSpy.mockRestore();
      }
    });
  });
});
