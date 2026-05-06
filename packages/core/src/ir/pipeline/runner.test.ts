import { describe, expect, it } from 'vitest';
import { Pipeline } from './runner';
import { defineModule, type Envelope } from './types';

function expectReadOnlyCollectionMutation(callback: () => unknown, message: string): void {
  expect(callback).toThrow(message);
}

describe('Pipeline', () => {
  it('runs modules in order, accumulating envelope additions', () => {
    const A = defineModule('A', (_input: { readonly seed: number }) => ({ a: 1 }));
    const B = defineModule('B', (input: { readonly a: number }) => ({ b: input.a + 10 }));
    const C = defineModule('C', (input: { readonly a: number; readonly b: number }) => ({
      sum: input.a + input.b,
    }));

    const result = Pipeline.start<{ readonly seed: number }>()
      .pipe(A)
      .pipe(B)
      .pipe(C)
      .run({ seed: 0 });

    expect(result).toEqual({ seed: 0, a: 1, b: 11, sum: 12 });
  });

  it('passes through envelope keys not consumed by a module', () => {
    const Add = defineModule('Add', (input: { readonly x: number }) => ({ doubled: input.x * 2 }));

    const result = Pipeline.start<{ readonly x: number; readonly carryThrough: string }>()
      .pipe(Add)
      .run({ x: 5, carryThrough: 'opaque' });

    expect(result.carryThrough).toBe('opaque');
    expect(result.doubled).toBe(10);
  });

  it('lets a later module replace an envelope key (logical mutation)', () => {
    const Init = defineModule('Init', (_: Envelope) => ({ resources: [1, 2, 3] }));
    const Replace = defineModule('Replace', (input: { readonly resources: readonly number[] }) => ({
      resources: input.resources.map((n) => n * 10),
    }));
    const Read = defineModule('Read', (input: { readonly resources: readonly number[] }) => ({
      sum: input.resources.reduce((acc, n) => acc + n, 0),
    }));

    const result = Pipeline.start<Envelope>().pipe(Init).pipe(Replace).pipe(Read).run({});
    expect(result.resources).toEqual([10, 20, 30]);
    expect(result.sum).toBe(60);
  });

  it('freezes the seed and intermediate envelopes', () => {
    let observed: unknown = null;
    const Spy = defineModule('Spy', (input: Envelope) => {
      observed = input;
      return {};
    });
    Pipeline.start<{ readonly tag: string }>().pipe(Spy).run({ tag: 'frozen' });
    expect(Object.isFrozen(observed)).toBe(true);
  });

  it('does not mutate module return values seen by downstream modules', () => {
    const Producer = defineModule('Producer', (_: Envelope) => ({
      list: [1, 2] as readonly number[],
    }));
    let downstreamView: readonly number[] = [];
    const Consumer = defineModule('Consumer', (input: { readonly list: readonly number[] }) => {
      downstreamView = input.list;
      return {};
    });

    Pipeline.start<Envelope>().pipe(Producer).pipe(Consumer).run({});
    expect(downstreamView).toEqual([1, 2]);
    expect(Object.isFrozen(downstreamView)).toBe(true);
    expect(() => {
      (downstreamView as number[]).push(3);
    }).toThrow();
  });

  it('deep-freezes nested Map and Set additions before downstream modules observe them', () => {
    const steps = ['seed'];
    const tags = new Set(['core']);
    const Producer = defineModule('Producer', (_: Envelope) => ({
      metadata: new Map([
        ['steps', steps],
        ['tags', tags],
      ]),
    }));

    let downstreamMetadata: ReadonlyMap<string, unknown> | null = null;
    const Consumer = defineModule(
      'Consumer',
      (input: { readonly metadata: ReadonlyMap<string, unknown> }) => {
        downstreamMetadata = input.metadata;
        return {};
      },
    );

    Pipeline.start<Envelope>().pipe(Producer).pipe(Consumer).run({});

    expect(downstreamMetadata).not.toBeNull();
    expect(downstreamMetadata).toBeInstanceOf(Map);
    expectReadOnlyCollectionMutation(
      () => (downstreamMetadata as Map<string, unknown>).set('extra', true),
      'map is read-only',
    );

    const frozenSteps = downstreamMetadata?.get('steps');
    expect(frozenSteps).toBe(steps);
    expect(Object.isFrozen(frozenSteps)).toBe(true);
    expect(() => {
      (frozenSteps as string[]).push('done');
    }).toThrow();

    const frozenTags = downstreamMetadata?.get('tags');
    expect(frozenTags).toBe(tags);
    expect(frozenTags).toBeInstanceOf(Set);
    expectReadOnlyCollectionMutation(
      () => (frozenTags as Set<string>).add('lang'),
      'set is read-only',
    );
  });
});
