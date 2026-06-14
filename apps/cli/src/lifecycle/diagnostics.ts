import type {
  EL001Diagnostic,
  EL002Diagnostic,
  EL003Diagnostic,
  Origin,
  SourcedEntry,
  WL001Diagnostic,
  WL002Diagnostic,
} from '@sirenpm/language';
import { formatDiagnostic, type OriginResolver } from '../format-diagnostics';
import type { CliContext, DeepReadonly } from './context';

/**
 * Discriminated union of all concrete language diagnostic types.
 *
 * The bare `LanguageDiagnostic` type (from `@sirenpm/language`) is only
 * `DiagnosticBase` — it carries just `code` and `severity`. Accessing
 * `documentName`, `origin`, or other concrete fields requires narrowing
 * to one of the known codes.
 */
type ConcreteLanguageDiagnostic =
  | EL001Diagnostic
  | EL002Diagnostic
  | EL003Diagnostic
  | WL001Diagnostic
  | WL002Diagnostic;

/** The set of diagnostic codes that have a `documentName` field. */
const LANGUAGE_DIAGNOSTIC_CODES = new Set(['EL001', 'EL002', 'EL003', 'WL001', 'WL002']);

export interface DiagnosticsArtifact {
  warnings: string[];
  errors: string[];
}

export function runDiagnosticsAccumulation(ctx: DeepReadonly<CliContext>): DiagnosticsArtifact {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Core diagnostics no longer carry source positions (ADR-0006). Build an
  // origin resolver from the project's origin-carrying entries so they can be
  // rendered with `file:line:col`.
  // FIXME don't build an origin map - pull origin off of the entry directly
  const originById = new Map<string, Origin>();
  for (const entry of (ctx.ir?.entries ?? []) as readonly SourcedEntry[]) {
    const origin = entry.origin;
    if (origin && !originById.has(entry.id)) {
      originById.set(entry.id, origin);
    }
  }
  const resolveOrigin: OriginResolver = (id) => originById.get(id);

  const sourceByName = new Map<string, string>();
  for (const doc of ctx.sourceDocuments) {
    sourceByName.set(doc.name, doc.content);
  }

  // All diagnostics (language + core) route through the single
  // formatDiagnostic() utility. Parse errors additionally receive the source
  // text so a caret-snippet block can be rendered below the header.
  for (const diagnostic of ctx.languageDiagnostics) {
    // Narrow the bare LanguageDiagnostic to the concrete union so we can
    // access fields like documentName and origin.
    if (!LANGUAGE_DIAGNOSTIC_CODES.has(diagnostic.code)) {
      // Unknown diagnostic code — skip. This arm exists to satisfy the
      // type checker; new codes should be added to the union above.
      continue;
    }
    const concrete = diagnostic as ConcreteLanguageDiagnostic;
    const source = sourceByName.get(concrete.documentName);
    const formatted = formatDiagnostic(concrete, resolveOrigin, source);
    if (concrete.severity === 'error') {
      errors.push(formatted);
    } else if (concrete.severity === 'warning') {
      warnings.push(formatted);
    }
  }

  // Core semantic diagnostics: W001/W002/W003.
  for (const diagnostic of ctx.ir?.diagnostics ?? []) {
    const formatted = formatDiagnostic(diagnostic, resolveOrigin);
    if (diagnostic.severity === 'warning') {
      warnings.push(formatted);
    } else if (diagnostic.severity === 'error') {
      errors.push(formatted);
    }
  }

  return { warnings, errors };
}
