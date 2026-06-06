import { describe, expect, expectTypeOf, it } from 'vitest';
import * as languageRoot from '../index';
import type { Origin } from '../origin';
import type {
  EL001Diagnostic,
  LanguageDiagnostic,
  WL001Diagnostic,
  WL002Diagnostic,
} from './types';
import { createEL001, createWL001, createWL002 } from './types';

describe('language diagnostic types', () => {
  it('re-exports the diagnostic types and factories from the package root', () => {
    expect(typeof languageRoot.createEL001).toBe('function');
    expect(typeof languageRoot.createWL001).toBe('function');
    expect(typeof languageRoot.createWL002).toBe('function');
  });

  it('type-only: variant interfaces are exported and discriminated by code', () => {
    expectTypeOf<EL001Diagnostic['code']>().toEqualTypeOf<'EL001'>();
    expectTypeOf<EL001Diagnostic['severity']>().toEqualTypeOf<'error'>();
    expectTypeOf<WL001Diagnostic['code']>().toEqualTypeOf<'WL001'>();
    expectTypeOf<WL001Diagnostic['severity']>().toEqualTypeOf<'warning'>();
    expectTypeOf<WL002Diagnostic['code']>().toEqualTypeOf<'WL002'>();
    expectTypeOf<WL002Diagnostic['severity']>().toEqualTypeOf<'warning'>();
  });

  it('LanguageDiagnostic union narrows correctly by code', () => {
    const d = {} as LanguageDiagnostic;
    switch (d.code) {
      case 'EL001':
        expectTypeOf(d).toEqualTypeOf<EL001Diagnostic>();
        expectTypeOf(d.nodeType).toEqualTypeOf<string>();
        expectTypeOf(d.documentName).toEqualTypeOf<string>();
        break;
      case 'WL001':
        expectTypeOf(d).toEqualTypeOf<WL001Diagnostic>();
        expectTypeOf(d.modifier).toEqualTypeOf<string>();
        expectTypeOf(d.resourceId).toEqualTypeOf<string>();
        break;
      case 'WL002':
        expectTypeOf(d).toEqualTypeOf<WL002Diagnostic>();
        expectTypeOf(d.recognizedModifiers).toEqualTypeOf<readonly string[]>();
        expectTypeOf(d.resolvedStatus).toEqualTypeOf<string>();
        break;
    }
  });
});

describe('createEL001', () => {
  it('produces an EL001 diagnostic with structured fields and no message', () => {
    const d = createEL001({
      resourceId: 'broken',
      documentName: 'a.siren',
      nodeType: 'task',
    });
    expect(d.code).toBe('EL001');
    expect(d.severity).toBe('error');
    expect(d.resourceId).toBe('broken');
    expect(d.documentName).toBe('a.siren');
    expect(d.nodeType).toBe('task');
    expect('message' in (d as object)).toBe(false);
  });

  it('allows resourceId to be omitted', () => {
    const d = createEL001({ documentName: 'a.siren', nodeType: 'task' });
    expect(d.code).toBe('EL001');
    expect(d.resourceId).toBeUndefined();
  });

  it('passes through optional origin', () => {
    const origin: Origin = {
      kind: 'range',
      startByte: 0,
      endByte: 5,
      startRow: 0,
      endRow: 0,
      document: 'a.siren',
    };
    const d = createEL001({
      documentName: 'a.siren',
      nodeType: 'task',
      origin,
    });
    expect(d.origin).toBe(origin);
  });
});

describe('createWL001', () => {
  it('produces a WL001 diagnostic with structured fields and no message', () => {
    const d = createWL001({
      resourceId: 'task-a',
      modifier: 'bogus',
      documentName: 'a.siren',
    });
    expect(d.code).toBe('WL001');
    expect(d.severity).toBe('warning');
    expect(d.resourceId).toBe('task-a');
    expect(d.modifier).toBe('bogus');
    expect(d.documentName).toBe('a.siren');
    expect('message' in (d as object)).toBe(false);
  });

  it('passes through optional origin', () => {
    const origin: Origin = { kind: 'synthetic', document: 'a.siren' };
    const d = createWL001({
      resourceId: 'task-a',
      modifier: 'bogus',
      documentName: 'a.siren',
      origin,
    });
    expect(d.origin).toBe(origin);
  });
});

describe('createWL002', () => {
  it('produces a WL002 diagnostic with structured fields and no message', () => {
    const d = createWL002({
      resourceId: 'task-a',
      recognizedModifiers: ['complete', 'draft'],
      resolvedStatus: 'draft',
      documentName: 'a.siren',
    });
    expect(d.code).toBe('WL002');
    expect(d.severity).toBe('warning');
    expect(d.resourceId).toBe('task-a');
    expect(d.recognizedModifiers).toEqual(['complete', 'draft']);
    expect(d.resolvedStatus).toBe('draft');
    expect(d.documentName).toBe('a.siren');
    expect('message' in (d as object)).toBe(false);
  });
});
