import { decodeSyntaxDocuments, type ParseDiagnostic, type ParseError } from '@sirenpm/language';
import type { CliContext } from './context';

function toDiagnosticColumn(column: number | undefined): number | undefined {
  if (column === undefined) return undefined;
  return Math.max(0, column - 1);
}

function isDuplicateCompleteParseError(error: ParseError): boolean {
  return (
    (error.severity ?? 'error') === 'warning' &&
    error.kind === 'unexpected_token' &&
    error.found === 'complete' &&
    (error.expected ?? []).includes('{') &&
    error.message.includes("duplicate 'complete' keyword")
  );
}

function findResourceForParseError(
  error: ParseError,
  ctx: CliContext,
): CliContext['syntaxDocuments'][number]['resources'][number] | undefined {
  const documentName = error.document;
  const startByte = error.startByte;

  for (const syntaxDocument of ctx.decodableSyntaxDocuments) {
    if (documentName && syntaxDocument.source.name !== documentName) continue;

    for (const resource of syntaxDocument.resources) {
      if (startByte !== undefined) {
        if (startByte >= resource.span.startByte && startByte <= resource.span.endByte) {
          return resource;
        }
      } else if (
        error.line >= resource.span.startRow + 1 &&
        error.line <= resource.span.endRow + 1
      ) {
        return resource;
      }
    }
  }

  return undefined;
}

function parseErrorsToDiagnostics(
  errors: readonly ParseError[],
  ctx: CliContext,
): readonly ParseDiagnostic[] {
  const diagnostics: ParseDiagnostic[] = [];

  for (const error of errors) {
    if (isDuplicateCompleteParseError(error)) {
      const resource = findResourceForParseError(error, ctx);
      const resourceId = resource?.identifier.value ?? 'unknown';
      diagnostics.push({
        code: 'WL002',
        message: `Resource '${resourceId}' has 'complete' keyword specified more than once. Only one is allowed; resource will be treated as complete: true.`,
        severity: 'warning',
        file: resource?.span.document ?? error.document,
        line: resource ? resource.span.startRow + 1 : error.line,
        column: resource ? 0 : toDiagnosticColumn(error.column),
      });
      continue;
    }

    if ((error.severity ?? 'error') === 'error') {
      diagnostics.push({
        code: 'EL001',
        message: `Invalid syntax: ${error.message}`,
        severity: 'error',
        file: error.document,
        line: error.line,
        column: toDiagnosticColumn(error.column),
      });
    }
  }

  return diagnostics;
}

export function runDecoding(ctx: CliContext): void {
  if (!ctx.parseResult?.tree) {
    ctx.phasesRun.add('decoding');
    return;
  }

  const errorsByDocument = new Map<string, ParseError[]>();
  for (const error of ctx.parseResult.errors) {
    const document = error.document ?? 'unknown';
    const errors = errorsByDocument.get(document) ?? [];
    errors.push(error);
    errorsByDocument.set(document, errors);
  }

  const skippedDocuments = new Set<string>();
  for (const [document, errors] of errorsByDocument) {
    if (errors.some((error) => (error.severity ?? 'error') === 'error')) {
      skippedDocuments.add(document);
    }
  }

  ctx.errorsByDocument = errorsByDocument;
  ctx.skippedDocuments = skippedDocuments;
  ctx.decodableSyntaxDocuments = ctx.syntaxDocuments.filter(
    (syntaxDocument) => !skippedDocuments.has(syntaxDocument.source.name),
  );
  ctx.retainedParseWarnings = ctx.parseResult.errors.filter((error) => {
    const severity = error.severity ?? 'error';
    const document = error.document ?? 'unknown';
    return severity === 'warning' && !skippedDocuments.has(document);
  });

  const { documents, diagnostics } = decodeSyntaxDocuments(ctx.decodableSyntaxDocuments);
  ctx.sirenDocuments = documents ?? [];
  ctx.decodeDiagnostics = diagnostics;
  ctx.parseDiagnostics = [
    ...parseErrorsToDiagnostics(ctx.retainedParseWarnings, ctx),
    ...diagnostics,
  ];
  ctx.phasesRun.add('decoding');
}
