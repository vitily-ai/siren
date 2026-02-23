/**
 * Bridge module: convenience function to decode a CST and produce an IRContext.
 * Replaces the former `IRContext.fromCst()` coupling.
 */

import { IRContext } from '@siren/core';
import { decodeDocument, type ParseDiagnostic } from './decoder/index.js';
import type { DocumentNode } from './parser/cst.js';

/**
 * Result of decoding a CST into an IRContext
 */
export interface DecodeToIRResult {
  /** IRContext built from the decoded resources */
  readonly ir: IRContext;
  /** Parser-level diagnostics (grammar/syntax issues only) */
  readonly parseDiagnostics: readonly ParseDiagnostic[];
}

/**
 * Decode a parsed CST into an IRContext and collect parser diagnostics.
 *
 * This is the primary entry point for the parse → IR pipeline.
 * Parser diagnostics and IR diagnostics are kept separate; consumers
 * can use `DiagnosticBag` from `@siren/core` to merge them if needed.
 *
 * @param cst - The parsed concrete syntax tree
 * @returns IRContext and parser-level diagnostics
 */
export function decodeToIR(cst: DocumentNode): DecodeToIRResult {
  const { resources, diagnostics } = decodeDocument(cst);
  const ir = IRContext.fromResources(resources);
  return { ir, parseDiagnostics: diagnostics };
}
