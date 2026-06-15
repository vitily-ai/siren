import * as path from 'node:path';
import type { SirenBuilder, SirenProject } from '@sirenpm/core';
import type {
  LanguageDiagnostic,
  ParsedDocument,
  SourceDocument,
  SourcedEntry,
} from '@sirenpm/language';

export const cliPhaseNames = [
  'discovery',
  'parsing',
  'decoding',
  'builder-construction',
  'builder-mutation',
  'project-build',
  'diagnostics',
  'diagnostics-presented',
  'query',
  'write',
  'query-presented',
] as const;

export type CliPhaseName = (typeof cliPhaseNames)[number];

export interface QueryArtifact {
  stdout?: string | string[];
  stderr?: string | string[];
  exitCode?: number;
}

// CliContext must contain ONLY the absolute minimum necessary for cross-phase handoff.
// It must not contain trivial or easily derived values
// biome-ignore lint/suspicious/noExplicitAny: `any` is fine here because it is not an assertion
export type DeepReadonly<T> = T extends (...args: any[]) => any
  ? T
  : T extends Map<infer K, infer V>
    ? ReadonlyMap<K, DeepReadonly<V>>
    : T extends Set<infer U>
      ? ReadonlySet<DeepReadonly<U>>
      : T extends ReadonlyArray<infer U>
        ? ReadonlyArray<DeepReadonly<U>>
        : T extends object
          ? {
              readonly [K in keyof T]: DeepReadonly<T[K]>;
            }
          : T;

export interface CliContext {
  cwd: string;
  rootDir: string;
  sirenDir: string;
  files: string[];
  sourceDocuments: SourceDocument[];
  /** Per-file parsed documents from `parser.parseBatch`. Own the CST-backed services. */
  parsedDocuments: ParsedDocument[];
  /** Structured language diagnostics (EL001/WL001/WL002) collected from parsed documents. */
  languageDiagnostics: readonly LanguageDiagnostic[];
  /** Flattened, origin-carrying entries decoded from every parsed document. */
  entries: readonly SourcedEntry[];
  builder?: SirenBuilder;
  ir?: SirenProject;
  warnings: string[];
  errors: string[];
  /** Absolute file paths whose content should be rewritten to disk. */
  rewriteSignal: Set<string>;
  /** Whether lifecycle was invoked in format mode. */
  format?: boolean;
  /** Whether to skip disk writes. */
  dryRun?: boolean;
  /** Whether to list changed files. */
  verbose?: boolean;
  query?: QueryArtifact;
  /** True once an error has caused downstream phases (query, write) to abort. */
  aborted: boolean;
  /** Count of `warnings` already flushed to stderr. */
  // FIXME: Unnecessary: Either we flush warnings as they are added (no need to track count), or we flush all at the end (no need to track at all).
  warningsFlushed: number;
  /** Count of `errors` already flushed to stderr. */
  // FIXME: Unnecessary: Either we flush errors as they are added (no need to track count), or we flush all at the end (no need to track at all).
  errorsFlushed: number;
  phasesRun: Set<CliPhaseName>;
}

export function createCliContext(cwd: string): CliContext {
  const rootDir = cwd;
  return {
    cwd,
    rootDir,
    sirenDir: path.join(rootDir, 'siren'),
    files: [],
    sourceDocuments: [],
    parsedDocuments: [],
    languageDiagnostics: [],
    entries: [],
    warnings: [],
    errors: [],
    rewriteSignal: new Set(),
    aborted: false,
    warningsFlushed: 0,
    errorsFlushed: 0,
    phasesRun: new Set(),
  };
}
