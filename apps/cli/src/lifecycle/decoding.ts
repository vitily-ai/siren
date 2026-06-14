import type { LanguageDiagnostic, ParsedDocument, SourcedEntry } from '@sirenpm/language';
import type { DeepReadonly } from './context';

export interface DecodingArtifact {
  entries: readonly SourcedEntry[];
  languageDiagnostics: readonly LanguageDiagnostic[];
}

/**
 * Flatten parsed documents into core-facing entries and collect language
 * diagnostics.
 *
 * Under the ADR-0004 boundary the language package owns parse-error handling:
 * resources whose subtree failed to parse are excluded from each document's
 * AST and reported as `EL001`, so `toEntries()` already yields only decodable
 * entries. Decoding therefore reduces to a flatten over the parsed documents.
 */
export function runDecoding(parsedDocuments: DeepReadonly<ParsedDocument[]>): DecodingArtifact {
  const entries: SourcedEntry[] = [];
  const languageDiagnostics: LanguageDiagnostic[] = [];

  for (const parsed of parsedDocuments as readonly ParsedDocument[]) {
    entries.push(...parsed.toEntries());
    languageDiagnostics.push(...parsed.diagnostics);
  }

  return { entries, languageDiagnostics };
}
