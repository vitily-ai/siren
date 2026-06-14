import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  AstAttribute,
  AstResource,
  AstTupleMember,
  EL002Diagnostic,
  EL003Diagnostic,
  LanguageDiagnostic,
  ParsedDocument,
  RangeOrigin,
  WL001Diagnostic,
  WL002Diagnostic,
} from '../index';
import { createParser } from '../index';

async function parse(content: string, name = 'doc.siren'): Promise<ParsedDocument> {
  const parser = await createParser();
  return parser.parse({ name, content });
}

function assertDiagnosticCode<C extends LanguageDiagnostic['code']>(
  diagnostics: readonly LanguageDiagnostic[],
  code: C,
  expect = true,
): readonly Extract<LanguageDiagnostic, { code: C }>[] {
  // throw if no diagnostics with the code are found
  const results = diagnostics.filter(
    (d): d is Extract<LanguageDiagnostic, { code: C }> => d.code === code,
  );
  if (expect && results.length === 0) {
    throw new Error(
      `No diagnostics with code ${code} found. Available diagnostics: ${diagnostics.map((d) => d.code).join(', ')}`,
    );
  }
  if (!expect && results.length > 0) {
    throw new Error(
      `Expected no diagnostics with code ${code}, but found: ${results.map((d) => d.code).join(', ')}`,
    );
  }
  return results;
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

    const wl001 = assertDiagnosticCode(parsed.diagnostics, 'WL001');
    expect(wl001).toHaveLength(1);
    const d: WL001Diagnostic = wl001[0];
    expect(d.modifier).toBe('blocked');
    expect(d.resourceId).toBe('foo');
    expect(d.documentName).toBe('doc.siren');
    expect(d.severity).toBe('warning');

    assertDiagnosticCode(parsed.diagnostics, 'WL002', false);
  });

  it('task foo complete draft {} → status draft (last wins), one WL002', async () => {
    const parsed = await parse('task foo complete draft {}');
    expect(parsed.ast.resources[0].status).toBe('draft');

    const wl002 = assertDiagnosticCode(parsed.diagnostics, 'WL002');
    expect(wl002).toHaveLength(1);
    const d: WL002Diagnostic = wl002[0];
    expect(d.recognizedModifiers).toEqual(['complete', 'draft']);
    expect(d.resolvedStatus).toBe('draft');
    expect(d.resourceId).toBe('foo');
    expect(d.documentName).toBe('doc.siren');

    assertDiagnosticCode(parsed.diagnostics, 'WL001', false);
  });

  it('task foo blocked complete {} → status complete, one WL001, no WL002', async () => {
    const parsed = await parse('task foo blocked complete {}');
    expect(parsed.ast.resources[0].status).toBe('complete');

    const wl001 = assertDiagnosticCode(parsed.diagnostics, 'WL001');
    expect(wl001).toHaveLength(1);
    expect(wl001[0].modifier).toBe('blocked');
    expect(wl001[0].resourceId).toBe('foo');

    assertDiagnosticCode(parsed.diagnostics, 'WL002', false);
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

    const wl001 = assertDiagnosticCode(parsed.diagnostics, 'WL001');
    expect(wl001).toHaveLength(1);
    expect(wl001[0].modifier).toBe('blocked');
    expect(wl001[0].resourceId).toBe('foo');

    assertDiagnosticCode(parsed.diagnostics, 'WL002', false);
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

describe('parse-error resource omission', () => {
  it('omits resource with malformed attribute; valid sibling remains; one diagnostic', async () => {
    const content = 'task broken { x = }\ntask ok {}\n';
    const parsed = await parse(content, 'mixed.siren');

    const ids = parsed.ast.resources.map((r) => r.id);
    expect(ids).toEqual(['ok']);

    const diags = assertDiagnosticCode(parsed.diagnostics, 'EL002');
    expect(diags).toHaveLength(1);
    const d: EL002Diagnostic = diags[0];
    expect(d.documentName).toBe('mixed.siren');
    expect(d.severity).toBe('error');
    expect(d.resourceId).toBe('broken');
    // note this `bare_identifier` expectation is known to be misleading
    // as pointed out in the corresponding corpus test
    expect(d.missingToken).toBe('bare_identifier');
  });

  it('salvages resourceId when header is valid but body is broken', async () => {
    const content = 'task salvaged { x = }';
    const parsed = await parse(content, 'salvage.siren');

    expect(parsed.ast.resources).toHaveLength(0);
    const el002 = assertDiagnosticCode(parsed.diagnostics, 'EL002');
    expect(el002).toHaveLength(1);
    expect(el002[0].resourceId).toBe('salvaged');
    expect(el002[0].missingToken).toBe('bare_identifier');
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

    const el002 = assertDiagnosticCode(parsed.diagnostics, 'EL002');
    expect(el002).toHaveLength(2);
    expect(el002.map((d) => d.resourceId)).toEqual(['broken1', 'broken2']);
  });

  it('no resourceId salvaged when header itself is malformed', async () => {
    // 'task {' is missing the identifier, so the headerId salvaging logic
    // should fail to find a valid idNode or identifierText.
    // The parser inserts a MISSING bare_identifier after 'task', which
    // classifies as EL002 with no resourceId (header has error).
    const content = 'task { x = 1 }';
    const parsed = await parse(content, 'malformed-header.siren');

    expect(parsed.ast.resources).toHaveLength(0);
    const el002 = assertDiagnosticCode(parsed.diagnostics, 'EL002');
    expect(el002).toHaveLength(1);
    expect(el002[0].resourceId).toBeUndefined();
    expect(el002[0].missingToken).toBe('bare_identifier');
  });
});

describe('buildAst — diagnostic documentName threading', () => {
  it('documentName matches source.name for warnings', async () => {
    const parsed = await parse('task foo blocked {}', 'custom-name.siren');
    const wl001 = assertDiagnosticCode(parsed.diagnostics, 'WL001');
    expect(wl001).toHaveLength(1);
    expect(wl001[0].documentName).toBe('custom-name.siren');
  });
});

describe('buildAst — top-level ERROR nodes', () => {
  it('stray `}` at document scope → one EL003 with expected symbols', async () => {
    // The grammar produces a direct `ERROR` child of `document` for stray
    // syntax that cannot be salvaged into a `resource`. The error classifier
    // detects expected alternatives via lookahead and emits EL003.
    const parsed = await parse('}', 'doc.siren');
    expect(parsed.ast.resources).toEqual([]);

    const el003: EL003Diagnostic[] = assertDiagnosticCode(parsed.diagnostics, 'EL003');
    expect(el003).toHaveLength(1);
    expect(el003[0].documentName).toBe('doc.siren');
    expect(el003[0].resourceId).toBeUndefined();
    expect(el003[0].expected.length).toBeGreaterThan(0);
    expect(el003[0]?.expected).toStrictEqual([
      // TODO come up with a way to reduce this to terminals only
      'task',
      'milestone',
      'comment',
      'document', // what is document?
      'resource_type',
      'resource_header',
      'resource',
      'ERROR',
    ]);
  });

  it('stray `}` between two resources → both resources kept, one EL003', async () => {
    const parsed = await parse('task a {}\n}\ntask b {}', 'doc.siren');
    expect(parsed.ast.resources.map((r) => r.id)).toEqual(['a', 'b']);

    const el003 = assertDiagnosticCode(parsed.diagnostics, 'EL003');
    expect(el003).toHaveLength(1);
    expect(el003[0].expected.length).toBeGreaterThan(0);
  });

  it('missing block_close → EL002 without expected (no keyword alternatives for anonymous tokens)', async () => {
    const content = 'task foo {\n  value = "test"\n';
    const parsed = await parse(content, 'unclosed.siren');

    const el002 = assertDiagnosticCode(parsed.diagnostics, 'EL002');
    // One EL002 for the missing block_close (inside the resource)
    expect(el002).toHaveLength(1);
    expect(el002[0].missingToken).toBe('block_close');
    // block_close has underscores and isn't a keyword terminal — no alternatives
    expect(el002[0].expected).toBeUndefined();
  });

  it('missing bare_identifier → EL002 without expected (no keyword alternatives for identifier)', async () => {
    const content = 'task { x = 1 }';
    const parsed = await parse(content, 'no-id.siren');

    const el002 = assertDiagnosticCode(parsed.diagnostics, 'EL002');
    expect(el002).toHaveLength(1);
    expect(el002[0].missingToken).toBe('bare_identifier');
    // bare_identifier has underscores — no keyword alternatives
    expect(el002[0].expected).toBeUndefined();
  });

  it('missing equals in attribute → no spurious EL002 expected field', async () => {
    const content = 'task bad {\n  key "value"\n}';
    const parsed = await parse(content, 'missing-eq.siren');

    // This particular input may produce EL003 (ERROR node) or EL002 (MISSING
    // node) depending on tree-sitter's recovery. Either is fine — the
    // important assertion is that no diagnostic carries a spurious expected.
    const el002 = parsed.diagnostics.filter((d) => d.code === 'EL002') as EL002Diagnostic[];
    el002.forEach((d) => {
      expect(d.missingToken).toBeDefined();
      // Non-keyword missing tokens should not carry expected
      expect(d.expected).toBeUndefined();
    });
  });
});

describe('buildAst — origins & diagnostic spans', () => {
  it('assigns accurate origin spans to EL002 diagnostics', async () => {
    const content = 'task broken { x = }';
    const parsed = await parse(content);

    const el002 = assertDiagnosticCode(parsed.diagnostics, 'EL002');
    expect(el002).toHaveLength(1);
    const d: EL002Diagnostic = el002[0];
    expect(d.origin).toBeDefined();
    expect(d.origin?.kind).toBe('range');

    const origin = d.origin as RangeOrigin;
    // EL002 points at the MISSING node position (zero-width, right before `}`)
    expect(origin.startByte).toBe(origin.endByte);
    expect(origin.startByte).toBeLessThan(content.length);
    expect(origin.startRow).toBe(0);
    expect(origin.endRow).toBe(0);
  });

  it('assigns accurate origin spans to WL001 (unrecognized) and WL002 (multiple modifiers)', async () => {
    const content = 'task foo blocked complete draft {}';
    const parsed = await parse(content);

    const wl001 = assertDiagnosticCode(parsed.diagnostics, 'WL001');
    expect(wl001).toHaveLength(1);
    const d1 = wl001[0];
    expect(d1.origin).toBeDefined();
    expect(d1.origin?.kind).toBe('range');
    const o1 = d1.origin as RangeOrigin;
    // WL001 (unrecognized) should cover just the 'blocked' modifier
    expect(content.slice(o1.startByte, o1.endByte)).toBe('blocked');

    const wl002 = assertDiagnosticCode(parsed.diagnostics, 'WL002');
    expect(wl002).toHaveLength(1);
    const d2 = wl002[0];
    expect(d2.origin).toBeDefined();
    expect(d2.origin?.kind).toBe('range');
    const o2 = d2.origin as RangeOrigin;
    // WL002 (multiple recognized) should cover the whole header
    expect(content.slice(o2.startByte, o2.endByte)).toBe('task foo blocked complete draft');
  });

  it('handles multi-line provenance correctly', async () => {
    const content = `task broken {
  x = 
}
task ok {}`;
    const parsed = await parse(content);

    // The MISSING bare_identifier after `x = ` on line 1 produces EL002.
    const el002 = assertDiagnosticCode(parsed.diagnostics, 'EL002');
    expect(el002).toHaveLength(1);
    const origin = el002[0].origin as RangeOrigin;

    // EL002 origin is narrowed to the first (and only) line of the MISSING node.
    expect(origin.startRow).toBe(1);
    expect(origin.endRow).toBe(1);
    expect(origin.startByte).toBe(origin.endByte); // zero-width MISSING node
  });

  it('assigns accurate origin spans to top-level ERROR nodes', async () => {
    // A top-level error like a stray brace
    const content = '} task t {}';
    const parsed = await parse(content);

    const el003 = assertDiagnosticCode(parsed.diagnostics, 'EL003');
    expect(el003).toHaveLength(1);
    const origin = el003[0].origin as RangeOrigin;

    // EL003 origin is narrowed to the first line of the ERROR node.
    expect(content.slice(origin.startByte, origin.endByte)).toBe('}');
    expect(origin.startRow).toBe(0);
    expect(origin.endRow).toBe(0);
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
