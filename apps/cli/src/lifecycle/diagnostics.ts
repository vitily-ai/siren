import type { EL001Diagnostic, Origin, SourcedEntry } from '@sirenpm/language';
import { formatDiagnostic, type OriginResolver } from '../format-diagnostics';
import { formatSyntaxError } from '../format-parse-error';
import type { CliContext, DeepReadonly } from './context';

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

  // Language diagnostics: EL001 (syntax errors) and WL001/WL002 (status warnings).
  for (const diagnostic of ctx.languageDiagnostics) {
    if (diagnostic.severity === 'error') {
      const el001 = diagnostic as EL001Diagnostic;
      const source = sourceByName.get(el001.documentName) ?? '';
      errors.push(formatSyntaxError(el001, source));
    } else if (diagnostic.severity === 'warning') {
      warnings.push(formatDiagnostic(diagnostic, resolveOrigin));
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
