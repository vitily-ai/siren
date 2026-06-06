import { getDependsOn } from '../utilities/entry';
import type {
  CircularDependencyDiagnostic,
  DanglingDependencyDiagnostic,
  DependencyCycle,
  Diagnostic,
  DuplicateIdDiagnostic,
} from './diagnostics';
import type { EntryGraph } from './entry-graph';
import type { SirenEntry } from './types';

export interface SemanticAnalysisInput {
  readonly rawEntries: readonly SirenEntry[];
  readonly graph: EntryGraph;
}

export interface SemanticAnalysisSnapshot {
  readonly cycles: readonly DependencyCycle[];
  readonly diagnostics: readonly Diagnostic[];
  readonly danglingDiagnostics: readonly DanglingDependencyDiagnostic[];
  readonly duplicateDiagnostics: readonly DuplicateIdDiagnostic[];
}

export function diagnoseCycles(
  cycles: readonly DependencyCycle[],
): readonly CircularDependencyDiagnostic[] {
  const diagnostics: CircularDependencyDiagnostic[] = [];

  for (const cycle of cycles) {
    diagnostics.push(
      freezeDiagnostic({
        code: 'W001',
        severity: 'warning',
        nodes: cycle.nodes,
      }),
    );
  }

  return Object.freeze(diagnostics);
}

export function diagnoseDanglingDependencies(
  graph: EntryGraph,
): readonly DanglingDependencyDiagnostic[] {
  const diagnostics: DanglingDependencyDiagnostic[] = [];
  const entries = graph.entries;

  for (const entry of entries) {
    const dependsOn = getDependsOn(entry);
    for (const dependencyId of dependsOn) {
      if (!graph.hasEntry(dependencyId)) {
        diagnostics.push(
          freezeDiagnostic({
            code: 'W002',
            severity: 'warning',
            entryId: entry.id,
            entryType: entry.type,
            dependencyId,
          }),
        );
      }
    }
  }

  return Object.freeze(diagnostics);
}

export function diagnoseDuplicateEntries(
  rawEntries: readonly SirenEntry[],
): readonly DuplicateIdDiagnostic[] {
  const diagnostics: DuplicateIdDiagnostic[] = [];
  const firstEntriesById = new Map<string, SirenEntry>();

  for (const entry of rawEntries) {
    const firstEntry = firstEntriesById.get(entry.id);
    if (firstEntry !== undefined) {
      diagnostics.push(
        freezeDiagnostic({
          code: 'W003',
          severity: 'warning',
          entryId: entry.id,
          entryType: entry.type,
        }),
      );
    } else {
      firstEntriesById.set(entry.id, entry);
    }
  }

  return Object.freeze(diagnostics);
}

function freezeDiagnostic<TDiagnostic extends Diagnostic>(diagnostic: TDiagnostic): TDiagnostic {
  return Object.freeze(diagnostic);
}
