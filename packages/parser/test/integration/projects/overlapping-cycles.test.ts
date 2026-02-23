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

describe('project:overlapping-cycles', () => {
  let adapter: any;
  beforeAll(async () => {
    adapter = await getAdapter();
  });

  it('detects overlapping circular dependencies and emits warnings', async () => {
    const { diagnostics } = await parseAndDecodeAll(adapter, 'overlapping-cycles');
    const cycleWarnings = diagnostics.filter(
      (d) => d.code === 'WC-001' && d.severity === 'warning',
    );
    expect(cycleWarnings).toHaveLength(2);

    // PRESCRIPTIVE: Core MUST provide structured diagnostic data
    // WC-001 diagnostics must have: code, severity, nodes (cycle chain), source
    const cycles: any[] = cycleWarnings;

    // Find the a -> b -> c -> a cycle
    const longCycle = cycles.find((c) => c.nodes?.length === 4);
    expect(longCycle).toBeDefined();
    expect(longCycle.code).toBe('WC-001');
    expect(longCycle.severity).toBe('warning');
    expect(longCycle.nodes).toEqual(['a', 'b', 'c', 'a']);
    // PRESCRIPTIVE: Integration tests with real files MUST include position info
    const longCycleAddr = parseSourceAddress(longCycle.source);
    expect(longCycleAddr.file).toBe('siren/main.siren');
    expect(longCycleAddr.line).toBeGreaterThan(0);
    expect(longCycleAddr.column).toBeGreaterThanOrEqual(0);

    // Find the a -> c -> a cycle
    const shortCycle = cycles.find((c) => c.nodes?.length === 3);
    expect(shortCycle).toBeDefined();
    expect(shortCycle.code).toBe('WC-001');
    expect(shortCycle.severity).toBe('warning');
    expect(shortCycle.nodes).toEqual(['a', 'c', 'a']);
    const shortCycleAddr = parseSourceAddress(shortCycle.source);
    expect(shortCycleAddr.file).toBe('siren/main.siren');
    expect(shortCycleAddr.line).toBeGreaterThan(0);
    expect(shortCycleAddr.column).toBeGreaterThanOrEqual(0);
  });

  it('includes cycles in the IR', async () => {
    const adapterLocal = await getTestAdapter();
    const projectDir = join(projectsDir, 'overlapping-cycles', 'siren');
    const src = readFileSync(join(projectDir, 'main.siren'), 'utf-8');
    const parseResult = await adapterLocal.parse(doc(src));
    expect(parseResult.success).toBe(true);
    const { ir } = decodeToIR(parseResult.tree!);
    expect(ir.cycles).toHaveLength(2);
    const cycleNodes = ir.cycles.map((c) => c.nodes);
    expect(cycleNodes).toContainEqual(['a', 'b', 'c', 'a']);
    expect(cycleNodes).toContainEqual(['a', 'c', 'a']);
  });
});
