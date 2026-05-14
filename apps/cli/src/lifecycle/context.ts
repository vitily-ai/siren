import * as path from 'node:path';
import type { Resource, SirenBuilder, SirenDocument, SirenProject } from '@sirenpm/core';
import type {
  ParseDiagnostic,
  ParseError,
  ParseResult,
  SourceDocument,
  SyntaxDocument,
} from '@sirenpm/language';

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

export interface CliContext {
  cwd: string;
  rootDir: string;
  sirenDir: string;
  files: string[];
  sourceDocuments: SourceDocument[];
  contentByDocument: Map<string, string>;
  parseResult?: ParseResult;
  syntaxDocuments: readonly SyntaxDocument[];
  decodableSyntaxDocuments: readonly SyntaxDocument[];
  errorsByDocument: Map<string, ParseError[]>;
  skippedDocuments: Set<string>;
  retainedParseWarnings: readonly ParseError[];
  parseDiagnostics: readonly ParseDiagnostic[];
  decodeDiagnostics: readonly ParseDiagnostic[];
  sirenDocuments: readonly SirenDocument[];
  builder?: SirenBuilder;
  resources: Resource[];
  milestones: string[];
  ir?: SirenProject;
  warnings: string[];
  errors: string[];
  parseTreeMissing: boolean;
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
    contentByDocument: new Map(),
    syntaxDocuments: [],
    decodableSyntaxDocuments: [],
    errorsByDocument: new Map(),
    skippedDocuments: new Set(),
    retainedParseWarnings: [],
    parseDiagnostics: [],
    decodeDiagnostics: [],
    sirenDocuments: [],
    resources: [],
    milestones: [],
    warnings: [],
    errors: [],
    parseTreeMissing: false,
    phasesRun: new Set(),
  };
}
