import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isReference, SirenBuilder, type SirenEntry, SirenProject, version } from './index';

function buildContext(entries: readonly SirenEntry[]) {
  return SirenBuilder.fromEntries(entries).build();
}

const FIXTURE_PROJECTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../test/fixtures/projects',
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

function parseFixtureIdentifier(raw: string): string {
  const trimmed = raw.trim().replace(/,$/, '');
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFixtureDependsOn(body: string): string[] {
  const dependsMatch = body.match(/depends_on\s*=\s*(\[[^\]]*\]|"[^"]+"|[A-Za-z0-9_-]+)/);
  if (!dependsMatch?.[1]) return [];

  const rawValue = dependsMatch[1].trim();
  if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
    const inside = rawValue.slice(1, -1).trim();
    if (inside.length === 0) return [];
    return inside
      .split(',')
      .map((item) => parseFixtureIdentifier(item))
      .filter((item) => item.length > 0);
  }

  return [parseFixtureIdentifier(rawValue)];
}

function parseFixtureEntries(source: string): SirenEntry[] {
  const pattern =
    /(task|milestone)\s+("[^"]+"|[A-Za-z0-9_-]+)(?:\s+(complete|draft))?\s*\{([\s\S]*?)\}/g;
  const entries: SirenEntry[] = [];
  let match: RegExpExecArray | null;

  // biome-ignore lint/suspicious/noAssignInExpressions: test file
  while ((match = pattern.exec(source)) !== null) {
    const type = match[1] as SirenEntry['type'];
    const id = parseFixtureIdentifier(match[2] ?? '');
    const status = match[3] as SirenEntry['status'] | undefined;
    const body = match[4] ?? '';
    const dependsOnIds = parseFixtureDependsOn(body);
    const attributes: SirenEntry['attributes'] = [];

    if (dependsOnIds.length > 0) {
      attributes.push({
        key: 'depends_on',
        value: dependsOnIds.map((dependencyId) => ({
          kind: 'reference' as const,
          id: dependencyId,
        })),
      });
    }

    entries.push({
      type,
      id,
      ...(status ? { status } : {}),
      attributes,
    });
  }

  return entries;
}

function loadFixtureEntries(fixtureSlug: string): SirenEntry[] {
  const fixtureDir = path.join(FIXTURE_PROJECTS_DIR, fixtureSlug);
  const nestedSirenDir = path.join(fixtureDir, 'siren');
  const sourceDir = fs.existsSync(nestedSirenDir) ? nestedSirenDir : fixtureDir;

  return collectSirenFiles(sourceDir).flatMap((filePath) =>
    parseFixtureEntries(fs.readFileSync(filePath, 'utf8')),
  );
}

function buildContextFromFixtureEntries(fixtureSlug: string): SirenProject {
  return SirenBuilder.fromEntries(loadFixtureEntries(fixtureSlug)).build();
}

function dependsOnIds(entry: SirenEntry): string[] {
  const dependsOn = entry.attributes.find((attribute) => attribute.key === 'depends_on');
  if (!dependsOn) return [];
  return dependsOn.value.flatMap((atom) => (isReference(atom) ? [atom.id] : []));
}

function duplicateIdDiagnosticsFor(context: SirenProject, entryId: string) {
  return context.diagnostics.filter(
    (diagnostic) =>
      diagnostic.code === 'W003' && 'entryId' in diagnostic && diagnostic.entryId === entryId,
  );
}

describe('@sirenpm/core', () => {
  it('exports version', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('exports SirenBuilder', () => {
    expect(SirenBuilder.fromEntries([]).entries).toEqual([]);
  });

  it('exports SirenProject and builds it through SirenBuilder', () => {
    const context = buildContext([]);
    expect(context).toBeInstanceOf(SirenProject);
  });

  describe('getMilestoneIds', () => {
    it('returns empty array for no entries', () => {
      const ir = buildContext([]);
      expect(ir.getMilestoneIds()).toEqual([]);
    });

    it('returns empty array for only tasks', () => {
      const entries: SirenEntry[] = [
        { type: 'task', id: 'task1', attributes: [] },
        { type: 'task', id: 'task2', status: 'complete', attributes: [] },
      ];
      const ir = buildContext(entries);
      expect(ir.getMilestoneIds()).toEqual([]);
    });

    it('returns milestone IDs', () => {
      const entries: SirenEntry[] = [
        { type: 'task', id: 'task1', attributes: [] },
        { type: 'milestone', id: 'milestone1', attributes: [] },
        { type: 'task', id: 'task2', status: 'complete', attributes: [] },
        { type: 'milestone', id: 'milestone2', status: 'complete', attributes: [] },
      ];
      const ir = buildContext(entries);
      expect(ir.getMilestoneIds()).toEqual(['milestone1', 'milestone2']);
    });
  });
  it('returns empty map for no entries', () => {
    const ir = buildContext([]);
    expect(ir.getTasksByMilestone()).toEqual(new Map());
  });

  it('returns empty arrays for milestones with no tasks', () => {
    const entries: SirenEntry[] = [{ type: 'milestone', id: 'milestone1', attributes: [] }];
    const ir = buildContext(entries);
    const result = ir.getTasksByMilestone();
    expect(result.get('milestone1')).toEqual([]);
  });

  it('ignores complete tasks', () => {
    const entries: SirenEntry[] = [
      {
        type: 'milestone',
        id: 'milestone1',
        attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'task1' }] }],
      },
      {
        type: 'task',
        id: 'task1',
        status: 'complete',
        attributes: [],
      },
    ];
    const ir = buildContext(entries);
    const result = ir.getTasksByMilestone();
    expect(result.get('milestone1')).toEqual([]);
  });

  it('includes incomplete tasks that the milestone depends on', () => {
    const task: SirenEntry = {
      type: 'task',
      id: 'task1',
      attributes: [],
    };
    const entries: SirenEntry[] = [
      {
        type: 'milestone',
        id: 'milestone1',
        attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'task1' }] }],
      },
      task,
    ];
    const ir = buildContext(entries);
    const result = ir.getTasksByMilestone();
    expect(result.get('milestone1')).toEqual([task]);
  });

  it('handles array depends_on', () => {
    const task: SirenEntry = {
      type: 'task',
      id: 'task1',
      attributes: [],
    };
    const entries: SirenEntry[] = [
      {
        type: 'milestone',
        id: 'milestone1',
        attributes: [
          {
            key: 'depends_on',
            value: [
              { kind: 'reference', id: 'task1' },
              { kind: 'reference', id: 'other' },
            ],
          },
        ],
      },
      task,
    ];
    const ir = buildContext(entries);
    const result = ir.getTasksByMilestone();
    expect(result.get('milestone1')).toEqual([task]);
  });

  it('ignores dependencies that are not tasks', () => {
    const entries: SirenEntry[] = [
      {
        type: 'milestone',
        id: 'milestone1',
        attributes: [{ key: 'depends_on', value: [{ kind: 'reference', id: 'other_milestone' }] }],
      },
      {
        type: 'task',
        id: 'task1',
        attributes: [],
      },
    ];
    const ir = buildContext(entries);
    const result = ir.getTasksByMilestone();
    expect(result.get('milestone1')).toEqual([]);
  });

  describe('flat entry fixture projects', () => {
    it('document-milestone-roots preserves dependencies without synthesizing a milestone', () => {
      const context = buildContextFromFixtureEntries('document-milestone-roots');

      expect(context.entries.map((entry) => entry.id)).toEqual([
        'hash-password',
        'validate-token',
        'login',
      ]);

      const login = context.findEntryById('login');
      expect(login.type).toBe('task');
      expect(dependsOnIds(login)).toEqual(['hash-password', 'validate-token']);
      expect(
        context.entries.some((entry) => entry.type === 'milestone' && entry.id === 'auth'),
      ).toBe(false);
    });

    it('document-milestone-empty-doc yields no entries', () => {
      const context = buildContextFromFixtureEntries('document-milestone-empty-doc');

      expect(context.entries).toEqual([]);
      expect(context.diagnostics).toEqual([]);
    });

    it('document-milestone-explicit-takeover preserves the explicit auth milestone', () => {
      const context = buildContextFromFixtureEntries('document-milestone-explicit-takeover');
      const authMilestones = context.entries.filter(
        (entry) => entry.type === 'milestone' && entry.id === 'auth',
      );

      expect(authMilestones).toHaveLength(1);
      expect(context.findEntryById('auth').type).toBe('milestone');
      expect(dependsOnIds(context.findEntryById('auth'))).toEqual(['login']);
      expect(duplicateIdDiagnosticsFor(context, 'auth')).toHaveLength(0);
    });

    it('document-milestone-cross-doc-duplicate preserves the explicit auth milestone without synthesizing a duplicate', () => {
      const context = buildContextFromFixtureEntries('document-milestone-cross-doc-duplicate');
      const authMilestones = context.entries.filter(
        (entry) => entry.type === 'milestone' && entry.id === 'auth',
      );

      expect(authMilestones).toHaveLength(1);
      expect(dependsOnIds(authMilestones[0]!)).toEqual([]);
      expect(duplicateIdDiagnosticsFor(context, 'auth')).toHaveLength(0);
    });
  });
});
