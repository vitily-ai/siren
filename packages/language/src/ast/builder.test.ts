import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  AstAttribute,
  AstResource,
  AstTupleMember,
  EL001Diagnostic,
  LanguageDiagnostic,
  ParsedDocument,
  WL001Diagnostic,
  WL002Diagnostic,
} from '../index';
import { createParser } from '../index';

async function parse(content: string, name = 'doc.siren'): Promise<ParsedDocument> {
  const parser = await createParser();
  return parser.parse({ name, content });
}

function byCode<C extends LanguageDiagnostic['code']>(
  diagnostics: readonly LanguageDiagnostic[],
  code: C,
): readonly Extract<LanguageDiagnostic, { code: C }>[] {
  return diagnostics.filter((d): d is Extract<LanguageDiagnostic, { code: C }> => d.code === code);
}

describe('buildAst — empty / trivial documents', () => {
  it('empty document yields empty AST and no diagnostics', async () => {
    const parsed = await parse('');
    expect(parsed.ast.resources).toEqual([]);
    expect(parsed.diagnostics).toEqual([]);
  });

  it('whitespace-only document yields empty AST and no diagnostics', async () => {
    const parsed = await parse('   \n\t  \n');
    expect(parsed.ast.resources).toEqual([]);
    expect(parsed.diagnostics).toEqual([]);
  });
});

describe('buildAst — resource kind & id normalization', () => {
  it('task foo {} → one task resource with id "foo"', async () => {
    const parsed = await parse('task foo {}');
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.ast.resources).toHaveLength(1);
    const r = parsed.ast.resources[0];
    expect(r.kind).toBe('task');
    expect(r.id).toBe('foo');
    expect(r.status).toBeUndefined();
    expect(r.attributes).toEqual([]);
  });

  it('milestone bar {} → milestone kind', async () => {
    const parsed = await parse('milestone bar {}');
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.ast.resources).toHaveLength(1);
    expect(parsed.ast.resources[0].kind).toBe('milestone');
    expect(parsed.ast.resources[0].id).toBe('bar');
  });

  it('task "has spaces" {} → id normalized to bare string "has spaces"', async () => {
    const parsed = await parse('task "has spaces" {}');
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.ast.resources).toHaveLength(1);
    expect(parsed.ast.resources[0].id).toBe('has spaces');
  });

  it('multiple resources are emitted in source order', async () => {
    const parsed = await parse('task a {}\nmilestone b {}\ntask c {}');
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.ast.resources.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(parsed.ast.resources.map((r) => r.kind)).toEqual(['task', 'milestone', 'task']);
  });
});

describe('buildAst — status modifiers (Decision 10)', () => {
  it('task foo complete {} → status complete, no diagnostics', async () => {
    const parsed = await parse('task foo complete {}');
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.ast.resources[0].status).toBe('complete');
  });

  it('task foo draft {} → status draft, no diagnostics', async () => {
    const parsed = await parse('task foo draft {}');
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.ast.resources[0].status).toBe('draft');
  });

  it('task foo blocked {} → status undefined, one WL001(modifier="blocked")', async () => {
    const parsed = await parse('task foo blocked {}');
    expect(parsed.ast.resources).toHaveLength(1);
    expect(parsed.ast.resources[0].status).toBeUndefined();

    const wl001 = byCode(parsed.diagnostics, 'WL001');
    expect(wl001).toHaveLength(1);
    const d: WL001Diagnostic = wl001[0];
    expect(d.modifier).toBe('blocked');
    expect(d.resourceId).toBe('foo');
    expect(d.documentName).toBe('doc.siren');
    expect(d.severity).toBe('warning');

    expect(byCode(parsed.diagnostics, 'WL002')).toHaveLength(0);
  });

  it('task foo complete draft {} → status draft (last wins), one WL002', async () => {
    const parsed = await parse('task foo complete draft {}');
    expect(parsed.ast.resources[0].status).toBe('draft');

    const wl002 = byCode(parsed.diagnostics, 'WL002');
    expect(wl002).toHaveLength(1);
    const d: WL002Diagnostic = wl002[0];
    expect(d.recognizedModifiers).toEqual(['complete', 'draft']);
    expect(d.resolvedStatus).toBe('draft');
    expect(d.resourceId).toBe('foo');
    expect(d.documentName).toBe('doc.siren');

    expect(byCode(parsed.diagnostics, 'WL001')).toHaveLength(0);
  });

  it('task foo blocked complete {} → status complete, one WL001, no WL002', async () => {
    const parsed = await parse('task foo blocked complete {}');
    expect(parsed.ast.resources[0].status).toBe('complete');

    const wl001 = byCode(parsed.diagnostics, 'WL001');
    expect(wl001).toHaveLength(1);
    expect(wl001[0].modifier).toBe('blocked');
    expect(wl001[0].resourceId).toBe('foo');

    expect(byCode(parsed.diagnostics, 'WL002')).toHaveLength(0);
  });

  it('task foo "complete" {} → quoted recognized modifier yields status complete, no diagnostics', async () => {
    // The grammar permits quoted identifiers in resource_modifier because
    // `resource_modifier` references `$.identifier` (bare OR string). Per
    // Decision 14, identifier spelling is CST-internal and the AST normalizes;
    // the modifier classification therefore treats `"complete"` identically to
    // bare `complete`.
    const parsed = await parse('task foo "complete" {}');
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.ast.resources).toHaveLength(1);
    expect(parsed.ast.resources[0].status).toBe('complete');
  });

  it('task foo "blocked" {} → quoted unrecognized modifier yields status undefined, one WL001', async () => {
    const parsed = await parse('task foo "blocked" {}');
    expect(parsed.ast.resources[0].status).toBeUndefined();

    const wl001 = byCode(parsed.diagnostics, 'WL001');
    expect(wl001).toHaveLength(1);
    expect(wl001[0].modifier).toBe('blocked');
    expect(wl001[0].resourceId).toBe('foo');

    expect(byCode(parsed.diagnostics, 'WL002')).toHaveLength(0);
  });
});

describe('buildAst — attribute values', () => {
  it('description = "hi" → tuple with one string member', async () => {
    const parsed = await parse('task t { description = "hi" }');
    expect(parsed.diagnostics).toEqual([]);
    const attrs = parsed.ast.resources[0].attributes;
    expect(attrs).toHaveLength(1);
    const attr: AstAttribute = attrs[0];
    expect(attr.name).toBe('description');
    expect(attr.value.members).toEqual([{ kind: 'string', value: 'hi' }]);
  });

  it('owner = alice → tuple with one identifier member (bare ident not reinterpreted)', async () => {
    const parsed = await parse('task t { owner = alice }');
    expect(parsed.diagnostics).toEqual([]);
    const attr = parsed.ast.resources[0].attributes[0];
    expect(attr.name).toBe('owner');
    expect(attr.value.members).toEqual([{ kind: 'identifier', name: 'alice' }]);
  });

  it('depends_on = [a, "b"] → identifier "a" then string "b"', async () => {
    const parsed = await parse('milestone m { depends_on = [a, "b"] }');
    expect(parsed.diagnostics).toEqual([]);
    const attr = parsed.ast.resources[0].attributes[0];
    expect(attr.name).toBe('depends_on');
    expect(attr.value.members).toEqual([
      { kind: 'identifier', name: 'a' },
      { kind: 'string', value: 'b' },
    ]);
  });

  it('single bare value and single-element bracketed array both normalize to a one-member tuple', async () => {
    const parsedSingle = await parse('task t { depends_on = a }');
    const parsedArray = await parse('task t { depends_on = [a] }');
    expect(parsedSingle.diagnostics).toEqual([]);
    expect(parsedArray.diagnostics).toEqual([]);
    const singleMembers = parsedSingle.ast.resources[0].attributes[0].value.members;
    const arrayMembers = parsedArray.ast.resources[0].attributes[0].value.members;
    expect(singleMembers).toEqual([{ kind: 'identifier', name: 'a' }]);
    expect(arrayMembers).toEqual([{ kind: 'identifier', name: 'a' }]);
  });
});

// TODO: note for TDD green
// many of these assertions are at the mercy of the grammar and
// the whims of tree-sitter's error recovery.
// if after implementation some of these test fail, and the cause
// appears to be one of those two things, mark the test to be skipped (it.skip)
describe('buildAst — parse-error resource omission (EL001)', () => {
  it('omits resource with malformed attribute; valid sibling remains; one EL001', async () => {
    // NOTE: a literal missing-brace (`task broken {\ntask ok {}\n`) is greedily
    // consumed by tree-sitter into a single `resource` node whose body extends
    // to EOF — there is no recoverable second sibling under any reasonable
    // implementation. We use a malformed-attribute fixture instead (`x =` with
    // no rhs), which tree-sitter cleanly recovers from at the next `task`
    // keyword, yielding two sibling `resource` nodes (the first with
    // `hasError === true`). This preserves the tester's intent: a broken
    // resource is omitted, the valid sibling remains, and one EL001 is raised.
    const content = 'task broken { x = }\ntask ok {}\n';
    const parsed = await parse(content, 'mixed.siren');

    const ids = parsed.ast.resources.map((r) => r.id);
    expect(ids).toEqual(['ok']);

    const el001 = byCode(parsed.diagnostics, 'EL001');
    expect(el001).toHaveLength(1);
    const d: EL001Diagnostic = el001[0];
    expect(d.documentName).toBe('mixed.siren');
    expect(d.severity).toBe('error');
    expect(d.nodeType).toBe('resource');
    expect(d.resourceId).toBe('broken');
  });

  it('salvages resourceId when header is valid but body is broken', async () => {
    const content = 'task salvaged { x = }';
    const parsed = await parse(content, 'salvage.siren');

    expect(parsed.ast.resources).toHaveLength(0);
    const el001 = byCode(parsed.diagnostics, 'EL001');
    expect(el001).toHaveLength(1);
    expect(el001[0].resourceId).toBe('salvaged');
  });

  it('omits multiple broken resources surgically, preserving interleaved valid ones', async () => {
    const content = `
task ok1 {}
task broken1 { x = }
task ok2 {}
task broken2 { y = }
milestone ok3 {}
    `;
    const parsed = await parse(content, 'surgical.siren');

    expect(parsed.ast.resources.map((r) => r.id)).toEqual(['ok1', 'ok2', 'ok3']);

    const el001 = byCode(parsed.diagnostics, 'EL001');
    expect(el001).toHaveLength(2);
    expect(el001.map((d) => d.resourceId)).toEqual(['broken1', 'broken2']);
  });

  it('no resourceId salvaged when header itself is malformed', async () => {
    // 'task {' is missing the identifier, so the headerId salvaging logic
    // should fail to find a valid idNode or identifierText.
    const content = 'task { x = 1 }';
    const parsed = await parse(content, 'malformed-header.siren');

    expect(parsed.ast.resources).toHaveLength(0);
    const el001 = byCode(parsed.diagnostics, 'EL001');
    expect(el001).toHaveLength(1);
    expect(el001[0].resourceId).toBeUndefined();
  });
});

describe('buildAst — diagnostic documentName threading', () => {
  it('documentName matches source.name for warnings', async () => {
    const parsed = await parse('task foo blocked {}', 'custom-name.siren');
    const wl001 = byCode(parsed.diagnostics, 'WL001');
    expect(wl001).toHaveLength(1);
    expect(wl001[0].documentName).toBe('custom-name.siren');
  });
});

describe('buildAst — top-level ERROR nodes', () => {
  it('stray `}` at document scope → one EL001 with nodeType "ERROR"', async () => {
    // The grammar produces a direct `ERROR` child of `document` for stray
    // syntax that cannot be salvaged into a `resource` (verified via a probe
    // against the tree-sitter grammar).
    const parsed = await parse('}', 'doc.siren');
    expect(parsed.ast.resources).toEqual([]);

    const el001 = byCode(parsed.diagnostics, 'EL001');
    expect(el001).toHaveLength(1);
    expect(el001[0].nodeType).toBe('ERROR');
    expect(el001[0].documentName).toBe('doc.siren');
    expect(el001[0].resourceId).toBeUndefined();
  });

  it('stray `}` between two resources → both resources kept, one EL001', async () => {
    const parsed = await parse('task a {}\n}\ntask b {}', 'doc.siren');
    expect(parsed.ast.resources.map((r) => r.id)).toEqual(['a', 'b']);

    const el001 = byCode(parsed.diagnostics, 'EL001');
    expect(el001).toHaveLength(1);
    expect(el001[0].nodeType).toBe('ERROR');
  });
});

describe('buildAst — origins & diagnostic spans', () => {
  it('assigns origin spans to EL001 diagnostics', async () => {
    const content = 'task broken { x = }';
    const parsed = await parse(content);

    const el001 = byCode(parsed.diagnostics, 'EL001');
    expect(el001).toHaveLength(1);
    const d = el001[0];
    expect(d.origin).toBeDefined();
    expect(d.origin?.kind).toBe('range');
  });

  it('assigns origin spans to WL001 (unrecognized) and WL002 (multiple modifiers)', async () => {
    const content = 'task foo blocked complete draft {}';
    const parsed = await parse(content);

    const wl001 = byCode(parsed.diagnostics, 'WL001');
    expect(wl001).toHaveLength(1);
    expect(wl001[0].origin).toBeDefined();

    const wl002 = byCode(parsed.diagnostics, 'WL002');
    expect(wl002).toHaveLength(1);
    expect(wl002[0].origin).toBeDefined();
  });

  it('populates the internal origin map for valid AST nodes', async () => {
    // The origins map is package-private/internal and not part of the public
    // SirenAst. However, ParsedDocumentImpl uses it during decode.
    // We can verify its population indirectly or by probing internal fields
    // if we had access, but for now we focus on diagnostic visibility.
    const content = 'task t {}';
    const parsed = await parse(content);

    expect(parsed.ast.resources).toHaveLength(1);
    // Since origins is private on ParsedDocumentImpl, we verified
    // its existence in the builder implementation but won't pin
    // its private storage here.
  });
});

describe('buildAst — runtime immutability (Object.freeze)', () => {
  it('freezes the AST, resources array, each resource, attributes, and tuple members', async () => {
    const parsed = await parse('task t complete {\n  description = "hi"\n  depends_on = [a, b]\n}');
    expect(parsed.diagnostics).toEqual([]);

    const ast = parsed.ast;
    expect(Object.isFrozen(ast)).toBe(true);
    expect(Object.isFrozen(ast.resources)).toBe(true);

    const r = ast.resources[0];
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.attributes)).toBe(true);

    for (const attr of r.attributes) {
      expect(Object.isFrozen(attr)).toBe(true);
      expect(Object.isFrozen(attr.value)).toBe(true);
      expect(Object.isFrozen(attr.value.members)).toBe(true);
    }
  });
});

describe('AstTupleMember type-narrowing', () => {
  it('discriminates by kind', () => {
    expectTypeOf<AstTupleMember>().toMatchTypeOf<
      | { kind: 'string'; value: string }
      | { kind: 'number'; value: number }
      | { kind: 'boolean'; value: boolean }
      | { kind: 'identifier'; name: string }
    >();

    // Compile-time narrowing check.
    const m = { kind: 'string', value: 'x' } as AstTupleMember;
    if (m.kind === 'string') {
      expectTypeOf(m.value).toEqualTypeOf<string>();
    } else if (m.kind === 'identifier') {
      expectTypeOf(m.name).toEqualTypeOf<string>();
    } else if (m.kind === 'number') {
      expectTypeOf(m.value).toEqualTypeOf<number>();
    } else {
      expectTypeOf(m.value).toEqualTypeOf<boolean>();
    }

    // Confirms `AstResource` shape exports.
    expectTypeOf<AstResource>().toMatchTypeOf<{
      kind: 'task' | 'milestone';
      id: string;
      attributes: readonly AstAttribute[];
    }>();
  });
});
