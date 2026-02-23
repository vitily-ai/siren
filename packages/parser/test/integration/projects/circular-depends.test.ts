import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSourceAddress } from '@siren/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeToIR } from '../../../src/bridge.js';
import type { SourceDocument } from '../../../src/parser/adapter.js';
import { getTestAdapter } from '../../helpers/parser.js';
import { getAdapter, parseAndDecodeAll } from './helper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectsDir = join(__dirname, '..', '..', 'fixtures', 'projects');

// TODO move to helper - this is duplicated a lot
/** Helper to wrap a source string as a SourceDocument array */
function doc(content: string, name = 'test.siren'): SourceDocument[] {
  return [{ name, content }];
}

describe('project:circular-depends', () => {
  let adapter: any;
  beforeAll(async () => {
    adapter = await getAdapter();
  });

  it('detects circular dependencies and emits warnings', async () => {
    const { diagnostics } = await parseAndDecodeAll(adapter, 'circular-depends');
    const cycleWarnings = diagnostics.filter(
      (d) => d.code === 'WC-001' && d.severity === 'warning',
    );
    expect(cycleWarnings).toHaveLength(1);

    // PRESCRIPTIVE: Core MUST provide structured diagnostic data
    // WC-001 diagnostics must have: code, severity, nodes (array of resource IDs in cycle), source
    const cycleDiag: any = cycleWarnings[0];
    expect(cycleDiag.code).toBe('WC-001');
    expect(cycleDiag.severity).toBe('warning');
    expect(cycleDiag.nodes).toEqual(['task1', 'task2', 'task3', 'task1']);
    // PRESCRIPTIVE: Integration tests with real files MUST include position info
    const addr = parseSourceAddress(cycleDiag.source);
    expect(addr.file).toBe('siren/main.siren');
    expect(addr.line).toBeGreaterThan(0);
    expect(addr.column).toBeGreaterThanOrEqual(0);
  });

  it('includes cycles in the IR', async () => {
    const adapterLocal = await getTestAdapter();
    const projectDir = join(projectsDir, 'circular-depends', 'siren');
    const src = readFileSync(join(projectDir, 'main.siren'), 'utf-8');
    const parseResult = await adapterLocal.parse(doc(src));
    const { ir } = decodeToIR(parseResult.tree!);
    expect(ir.cycles).toHaveLength(1);
    expect(ir.cycles[0].nodes).toEqual(['task1', 'task2', 'task3', 'task1']);
  });
});
