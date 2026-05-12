import { formatDiagnostic } from '../format-diagnostics';
import { formatParseError } from '../format-parse-error';
import type { CliContext } from './context';

export function runDiagnosticsAccumulation(ctx: CliContext): void {
  if (ctx.parseTreeMissing) {
    ctx.warnings.push('Warning: no valid parse tree could be produced');
    ctx.phasesRun.add('diagnostics');
    return;
  }

  for (const [document, errors] of ctx.errorsByDocument) {
    errors.sort((a, b) => a.line - b.line || a.column - b.column);
    const source = ctx.contentByDocument.get(document) ?? '';

    for (const error of errors) {
      if ((error.severity ?? 'error') === 'warning') continue;

      ctx.errors.push(formatParseError(error, source));
    }

    if (errors.some((error) => (error.severity ?? 'error') === 'error')) {
      ctx.errors.push(`note: skipping ${document} due to syntax errors`);
    }
  }

  for (const diagnostic of ctx.parseDiagnostics) {
    const formatted = formatDiagnostic(diagnostic);
    if (diagnostic.severity === 'warning') {
      ctx.warnings.push(formatted);
    } else if (diagnostic.severity === 'error') {
      ctx.errors.push(formatted);
    }
  }

  for (const diagnostic of ctx.ir?.diagnostics ?? []) {
    const formatted = formatDiagnostic(diagnostic);
    if (diagnostic.severity === 'warning') {
      ctx.warnings.push(formatted);
    } else if (diagnostic.severity === 'error') {
      ctx.errors.push(formatted);
    }
  }

  ctx.phasesRun.add('diagnostics');
}
