import * as path from 'node:path';
import type { SirenBuilder, SirenDocument, SirenProject } from '@sirenpm/core';
import type { ParseDiagnostic, ParseResult, SourceDocument } from '@sirenpm/language';

export const cliPhaseNames = [
  'discovery',
  'parsing',
  'decoding',
  'builder-construction',
  'builder-mutation',
  'project-build',
  'diagnostics',
  'presentation',
] as const;

export type CliPhaseName = (typeof cliPhaseNames)[number];

export interface PresentationArtifact {
  diagnosticsSurfaced: boolean;
  warningCount: number;
  errorCount: number;
  exitCode?: number | string | null;
}

// CliContext must contain ONLY the absolute minimum necessary for cross-phase handoff.
// It must not contain trivial or easily derived values
export interface CliContext {
  cwd: string;
  rootDir: string;
  sirenDir: string;
  files: string[];
  sourceDocuments: SourceDocument[];
  parseResult?: ParseResult;
  parseDiagnostics: readonly ParseDiagnostic[];
  sirenDocuments: readonly SirenDocument[];
  builder?: SirenBuilder;
  ir?: SirenProject;
  warnings: string[];
  errors: string[];
  presentation?: PresentationArtifact;
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
    parseDiagnostics: [],
    sirenDocuments: [],
    warnings: [],
    errors: [],
    phasesRun: new Set(),
  };
}
