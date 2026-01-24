import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { decode } from '../../../src/decoder/index.js';
import { getTestAdapter } from '../../helpers/parser.js';
import { getAdapter, parseAndDecodeAll } from './helper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectsDir = join(__dirname, '..', '..', 'fixtures', 'projects');

describe('project:circular-depends', () => {
  let adapter: any;
  beforeAll(async () => {
    adapter = await getAdapter();
  });

  it('detects circular dependencies and emits warnings', async () => {
    const { diagnostics } = await parseAndDecodeAll(adapter, 'circular-depends');
    const cycleWarnings = diagnostics.filter((d) => d.code === 'W004' && d.severity === 'warning');
    expect(cycleWarnings).toHaveLength(1);
    expect(cycleWarnings[0].message).toContain('task1 -> task2 -> task3 -> task1');
  });

  it('includes cycles in the IR', async () => {
    const adapterLocal = await getTestAdapter();
    const projectDir = join(projectsDir, 'circular-depends', 'siren');
    const src = readFileSync(join(projectDir, 'main.siren'), 'utf-8');
    const parseResult = await adapterLocal.parse(src);
    const decodeResult = decode(parseResult.tree!);
    expect(decodeResult.document!.cycles).toHaveLength(1);
    expect(decodeResult.document!.cycles[0].nodes).toEqual(['task1', 'task2', 'task3', 'task1']);
  });
});
