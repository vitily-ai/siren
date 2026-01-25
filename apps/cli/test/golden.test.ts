import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { main } from '../src/index.js';
import { copyProjectFixture } from './helpers/fixture-utils.js';

const expectedDir = path.join(__dirname, 'expected');

function splitArgs(str: string): string[] {
  const re = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  const args: string[] = [];
  let m: RegExpExecArray | null;
  while (true) {
    m = re.exec(str);
    if (m === null) break;
    if (m[1] !== undefined) args.push(m[1]);
    else if (m[2] !== undefined) args.push(m[2]);
    else args.push(m[0]);
  }
  return args;
}

describe('golden CLI tests (expected/)', () => {
  const files = fs.readdirSync(expectedDir).filter((f) => f.endsWith('.txt'));

  files.forEach((file) => {
    // Derive fixture name from filename (strip .err.txt, .out.txt or .txt)
    const fixtureName = file.replace(/(\.err|\.out)?\.txt$/, '');

    it(`matches ${file} against fixture ${fixtureName}`, async () => {
      const full = path.join(expectedDir, file);
      const raw = fs.readFileSync(full, 'utf8');
      const lines = raw.split(/\r?\n/);

      // Require first line to be a comment starting with '# <command>'.
      // Tests should fail if no command is provided in the golden file.
      let cmdLine: string;
      let expectedContent: string;
      if (lines.length > 0 && lines[0].startsWith('#')) {
        cmdLine = lines[0].replace(/^#\s?/, '').trim();
        expectedContent = lines.slice(1).join('\n');
      } else {
        throw new Error(
          `Missing command in golden file ${file}: add a first-line comment like '# list'`,
        );
      }

      // Determine whether this is asserting stderr or stdout
      const isErr = file.includes('.err.');

      const sirenDir = await copyProjectFixture(fixtureName);
      const cwd = path.dirname(sirenDir);

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const originalCwd = process.cwd();
      try {
        process.chdir(cwd);

        const args = splitArgs(cmdLine);
        await main(args);

        const outCalls = logSpy.mock.calls
          .map((c) => (c[0] !== undefined ? String(c[0]) : ''))
          .join('\n');
        const errCalls = errSpy.mock.calls
          .map((c) => (c[0] !== undefined ? String(c[0]) : ''))
          .join('\n');

        const actual = isErr ? errCalls : outCalls;

        // Normalize trailing newlines for comparison (trim end only)
        const normActual = actual.replace(/\s+$/u, '');
        const normExpected = expectedContent.replace(/\s+$/u, '');

        expect(normActual).toBe(normExpected);
      } finally {
        process.chdir(originalCwd);
        logSpy.mockRestore();
        errSpy.mockRestore();
      }
    });
  });
});
