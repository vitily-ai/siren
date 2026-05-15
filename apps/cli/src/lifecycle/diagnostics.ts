import type { ParseError } from '@sirenpm/language';
import { formatDiagnostic } from '../format-diagnostics';
import { formatParseError } from '../format-parse-error';
import type { CliContext, DeepReadonly } from './context';

export interface DiagnosticsArtifact {
  warnings: string[];
  errors: string[];
}

export function runDiagnosticsAccumulation(ctx: DeepReadonly<CliContext>): DiagnosticsArtifact {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (ctx.files.length > 0 && !ctx.parseResult?.tree) {
    warnings.push('Warning: no valid parse tree could be produced');
    return { warnings, errors };
  }

  const errorsByDocument = new Map<string, ParseError[]>();
  if (ctx.parseResult) {
    for (const error of ctx.parseResult.errors) {
      const document = error.document ?? 'unknown';
      const docErrors = errorsByDocument.get(document) ?? [];
      docErrors.push(error);
      errorsByDocument.set(document, docErrors);
    }
  }

  for (const [document, docErrors] of errorsByDocument) {
    docErrors.sort((a, b) => a.line - b.line || a.column - b.column);
    const source = ctx.sourceDocuments.find((d) => d.name === document)?.content ?? '';

    for (const error of docErrors) {
      if ((error.severity ?? 'error') === 'warning') continue;

      errors.push(formatParseError(error, source));
    }

    if (docErrors.some((error) => (error.severity ?? 'error') === 'error')) {
      errors.push(`note: skipping ${document} due to syntax errors`);
    }
  }

  for (const diagnostic of ctx.parseDiagnostics) {
    const formatted = formatDiagnostic(diagnostic);
    if (diagnostic.severity === 'warning') {
      warnings.push(formatted);
    } else if (diagnostic.severity === 'error') {
      errors.push(formatted);
    }
  }

  for (const diagnostic of ctx.ir?.diagnostics ?? []) {
    const formatted = formatDiagnostic(diagnostic);
    if (diagnostic.severity === 'warning') {
      warnings.push(formatted);
    } else if (diagnostic.severity === 'error') {
      errors.push(formatted);
    }
  }

  return { warnings, errors };
}
