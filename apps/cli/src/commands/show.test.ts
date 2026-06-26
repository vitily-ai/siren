import { SirenBuilder, type SirenEntry } from '@sirenpm/core';
import { describe, expect, it } from 'vitest';
import { showQuery } from './show';

/**
 * Build a SirenProject from raw SirenEntry descriptors (no file I/O, no WASM).
 */
function buildProject(entries: readonly SirenEntry[]) {
  return SirenBuilder.fromEntries(entries).build();
}

describe('showQuery', () => {
  it('handles long dependency IDs without crashing on alignment padding', () => {
    const longDepId = 'task-with-long-name-here';

    const project = buildProject([
      {
        type: 'task',
        id: 'parent-task',
        attributes: [
          {
            key: 'depends_on',
            value: [{ kind: 'reference', id: longDepId }],
          },
        ],
      },
      {
        type: 'task',
        id: longDepId,
        attributes: [],
      },
    ]);

    const queryFn = showQuery('parent-task');
    const artifact = queryFn(project);

    // Must not throw — should produce valid output with the entry header.
    expect(artifact.stdout).toBeDefined();
    const output = Array.isArray(artifact.stdout) ? artifact.stdout.join('\n') : artifact.stdout;
    expect(output).toContain('parent-task');
    expect(output).toContain(longDepId);
    // No error exit code from the query itself.
    expect(artifact.exitCode).toBeUndefined();
  });
});
