import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { IRContext } from '../../../src/ir/context.js';
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

    // PRESCRIPTIVE: Core MUST provide structured diagnostic data
    // W004 diagnostics must have: code, severity, nodes (array of resource IDs in cycle), file(s)
    const cycleDiag: any = cycleWarnings[0];
    expect(cycleDiag.code).toBe('W004');
    expect(cycleDiag.severity).toBe('warning');
    expect(cycleDiag.nodes).toEqual(['task1', 'task2', 'task3', 'task1']);
    expect(cycleDiag.file).toBe('siren/main.siren');
    // PRESCRIPTIVE: Integration tests with real files MUST include position info
    expect(cycleDiag.line).toBeGreaterThan(0);
    expect(cycleDiag.column).toBeGreaterThanOrEqual(0);
  });

  it('includes cycles in the IR', async () => {
    const adapterLocal = await getTestAdapter();
    const projectDir = join(projectsDir, 'circular-depends', 'siren');
    const src = readFileSync(join(projectDir, 'main.siren'), 'utf-8');
    const parseResult = await adapterLocal.parse(src);
    const ir = IRContext.fromCst(parseResult.tree!);
    expect(ir.cycles).toHaveLength(1);
    expect(ir.cycles[0].nodes).toEqual(['task1', 'task2', 'task3', 'task1']);
  });
});
