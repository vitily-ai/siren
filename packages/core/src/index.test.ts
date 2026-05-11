import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isArray, isReference, type Resource, SirenBuilder, SirenProject, version } from './index';

function buildContext(resources: readonly Resource[]) {
  return SirenBuilder.fromResources(resources, 'adhoc').build();
}

type BuilderDocument = {
  id: string;
  resources: readonly Resource[];
};

type DocumentsBuilderSurface = {
  readonly documents: readonly BuilderDocument[];
  build(): SirenProject;
};

type SirenBuilderDocumentsApi = {
  fromDocuments?: (documents: readonly BuilderDocument[]) => DocumentsBuilderSurface;
};

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

function parseFixtureResources(source: string): Resource[] {
  const pattern =
    /(task|milestone)\s+("[^"]+"|[A-Za-z0-9_-]+)(?:\s+(complete|draft))?\s*\{([\s\S]*?)\}/g;
  const resources: Resource[] = [];
  let match: RegExpExecArray | null;

  // biome-ignore lint/suspicious/noAssignInExpressions: test file
  while ((match = pattern.exec(source)) !== null) {
    const type = match[1] as Resource['type'];
    const id = parseFixtureIdentifier(match[2] ?? '');
    const status = match[3] as Resource['status'] | undefined;
    const body = match[4] ?? '';
    const dependsOnIds = parseFixtureDependsOn(body);
    const attributes: Resource['attributes'] = [];

    if (dependsOnIds.length === 1) {
      attributes.push({ key: 'depends_on', value: { kind: 'reference', id: dependsOnIds[0]! } });
    } else if (dependsOnIds.length > 1) {
      attributes.push({
        key: 'depends_on',
        value: {
          kind: 'array',
          elements: dependsOnIds.map((dependencyId) => ({ kind: 'reference', id: dependencyId })),
        },
      });
    }

    resources.push({
      type,
      id,
      ...(status ? { status } : {}),
      attributes,
    });
  }

  return resources;
}

function loadFixtureDocuments(fixtureSlug: string): BuilderDocument[] {
  const fixtureDir = path.join(FIXTURE_PROJECTS_DIR, fixtureSlug);
  const nestedSirenDir = path.join(fixtureDir, 'siren');
  const sourceDir = fs.existsSync(nestedSirenDir) ? nestedSirenDir : fixtureDir;

  return collectSirenFiles(sourceDir).map((filePath) => ({
    id: path.basename(filePath, '.siren'),
    resources: parseFixtureResources(fs.readFileSync(filePath, 'utf8')),
  }));
}

function buildContextFromFixtureDocuments(fixtureSlug: string): SirenProject {
  const api = SirenBuilder as unknown as SirenBuilderDocumentsApi;
  expect(typeof api.fromDocuments).toBe('function');

  const builder = api.fromDocuments?.(loadFixtureDocuments(fixtureSlug));
  expect(builder).toBeDefined();
  if (!builder) throw new Error('expected builder');

  return builder.build();
}

function dependsOnIds(resource: Resource): string[] {
  const dependsOn = resource.attributes.find((attribute) => attribute.key === 'depends_on');
  if (!dependsOn) return [];
  if (isReference(dependsOn.value)) return [dependsOn.value.id];
  if (!isArray(dependsOn.value)) return [];
  return dependsOn.value.elements.flatMap((element) => (isReference(element) ? [element.id] : []));
}

function duplicateIdDiagnosticsFor(context: SirenProject, resourceId: string) {
  return context.diagnostics.filter(
    (diagnostic) =>
      diagnostic.code === 'W003' &&
      'resourceId' in diagnostic &&
      diagnostic.resourceId === resourceId,
  );
}

describe('@sirenpm/core', () => {
  it('exports version', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('exports SirenBuilder', () => {
    expect(SirenBuilder.fromResources([], 'adhoc').documents[0]?.resources).toEqual([]);
  });

  it('exports SirenProject and builds it through SirenBuilder', () => {
    const context = buildContext([]);
    expect(context).toBeInstanceOf(SirenProject);
  });

  describe('getMilestoneIds', () => {
    it('returns empty array for no resources', () => {
      const ir = buildContext([]);
      expect(ir.getMilestoneIds()).toEqual([]);
    });

    it('returns empty array for only tasks', () => {
      const resources: Resource[] = [
        { type: 'task', id: 'task1', attributes: [] },
        { type: 'task', id: 'task2', status: 'complete', attributes: [] },
      ];
      const ir = buildContext(resources);
      expect(ir.getMilestoneIds()).toEqual([]);
    });

    it('returns milestone IDs', () => {
      const resources: Resource[] = [
        { type: 'task', id: 'task1', attributes: [] },
        { type: 'milestone', id: 'milestone1', attributes: [] },
        { type: 'task', id: 'task2', status: 'complete', attributes: [] },
        { type: 'milestone', id: 'milestone2', status: 'complete', attributes: [] },
      ];
      const ir = buildContext(resources);
      expect(ir.getMilestoneIds()).toEqual(['milestone1', 'milestone2']);
    });
  });
  it('returns empty map for no resources', () => {
    const ir = buildContext([]);
    expect(ir.getTasksByMilestone()).toEqual(new Map());
  });

  it('returns empty arrays for milestones with no tasks', () => {
    const resources: Resource[] = [{ type: 'milestone', id: 'milestone1', attributes: [] }];
    const ir = buildContext(resources);
    const result = ir.getTasksByMilestone();
    expect(result.get('milestone1')).toEqual([]);
  });

  it('ignores complete tasks', () => {
    const resources: Resource[] = [
      {
        type: 'milestone',
        id: 'milestone1',
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'task1' } }],
      },
      {
        type: 'task',
        id: 'task1',
        status: 'complete',
        attributes: [],
      },
    ];
    const ir = buildContext(resources);
    const result = ir.getTasksByMilestone();
    expect(result.get('milestone1')).toEqual([]);
  });

  it('includes incomplete tasks that the milestone depends on', () => {
    const task: Resource = {
      type: 'task',
      id: 'task1',
      attributes: [],
    };
    const resources: Resource[] = [
      {
        type: 'milestone',
        id: 'milestone1',
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'task1' } }],
      },
      task,
    ];
    const ir = buildContext(resources);
    const result = ir.getTasksByMilestone();
    expect(result.get('milestone1')).toEqual([task]);
  });

  it('handles array depends_on', () => {
    const task: Resource = {
      type: 'task',
      id: 'task1',
      attributes: [],
    };
    const resources: Resource[] = [
      {
        type: 'milestone',
        id: 'milestone1',
        attributes: [
          {
            key: 'depends_on',
            value: {
              kind: 'array',
              elements: [
                { kind: 'reference', id: 'task1' },
                { kind: 'reference', id: 'other' },
              ],
            },
          },
        ],
      },
      task,
    ];
    const ir = buildContext(resources);
    const result = ir.getTasksByMilestone();
    expect(result.get('milestone1')).toEqual([task]);
  });

  it('ignores dependencies that are not tasks', () => {
    const resources: Resource[] = [
      {
        type: 'milestone',
        id: 'milestone1',
        attributes: [{ key: 'depends_on', value: { kind: 'reference', id: 'other_milestone' } }],
      },
      {
        type: 'task',
        id: 'task1',
        attributes: [],
      },
    ];
    const ir = buildContext(resources);
    const result = ir.getTasksByMilestone();
    expect(result.get('milestone1')).toEqual([]);
  });

  describe('document milestone synthesis fixtures (red)', () => {
    it('document-milestone-roots synthesizes document milestone dependencies from roots only', () => {
      const context = buildContextFromFixtureDocuments('document-milestone-roots');
      const authMilestone = context.findResourceById('auth');

      expect(authMilestone.type).toBe('milestone');
      expect(dependsOnIds(authMilestone)).toEqual(['login']);
    });

    it('document-milestone-empty-doc synthesizes an orphan milestone for empty documents', () => {
      const context = buildContextFromFixtureDocuments('document-milestone-empty-doc');
      const billingMilestone = context.findResourceById('billing');

      expect(billingMilestone.type).toBe('milestone');
      expect(dependsOnIds(billingMilestone)).toEqual([]);
    });

    it('document-milestone-explicit-takeover suppresses synthesis on same-document explicit milestone', () => {
      const context = buildContextFromFixtureDocuments('document-milestone-explicit-takeover');
      const authMilestones = context.resources.filter(
        (resource) => resource.type === 'milestone' && resource.id === 'auth',
      );

      expect(authMilestones).toHaveLength(1);
      expect(duplicateIdDiagnosticsFor(context, 'auth')).toHaveLength(0);
    });

    it('document-milestone-cross-doc-duplicate reports W003 for explicit and synthetic milestone collisions', () => {
      const context = buildContextFromFixtureDocuments('document-milestone-cross-doc-duplicate');
      const authMilestones = context.resources.filter(
        (resource) => resource.type === 'milestone' && resource.id === 'auth',
      );

      expect(authMilestones).toHaveLength(1);
      expect(dependsOnIds(authMilestones[0]!)).toEqual(['login']);
      expect(duplicateIdDiagnosticsFor(context, 'auth')).toHaveLength(1);
    });
  });
});
