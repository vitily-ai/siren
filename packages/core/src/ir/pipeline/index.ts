import type { Diagnostic } from '../diagnostics';
import type { EntryGraph } from '../entry-graph';
import type { SirenEntry } from '../types';
import { ImplicitCompletionModule } from './modules/completion';
import { CyclesModule } from './modules/cycles';
import { DanglingModule } from './modules/dangling';
import { DedupModule } from './modules/dedup';
import { FinalizeModule } from './modules/finalize';
import { GraphModule } from './modules/graph';
import { ImplicitDraftMilestoneModule } from './modules/implicit-draft-milestone';
import { Pipeline } from './runner';

/**
 * Final shape of the IR build pipeline envelope after running every module.
 *
 * This is the internal projection consumed by `SirenProject`. It is not part of
 * the public core surface — `SirenProject` exposes only what callers need
 * (`entries`, `diagnostics`, `graph`, query helpers).
 *
 * Pipeline topology (single direct upstream is the immediately preceding
 * module in the chain; indirect dependencies are carried opaquely through
 * the envelope):
 *
 *   seed { rawEntries }
 *     → Dedup                  adds     { entries, duplicateDiagnostics }
 *     → Graph                  adds     { graph }
 *     → ImplicitDraftMilestone rewrites { graph }
 *     → Completion             rewrites { graph }
 *     → Cycles                 adds     { cycles, cycleDiagnostics }
 *     → Dangling               adds     { danglingDiagnostics }
 *     → Finalize               adds     { diagnostics }
 */
export interface IRBuildEnvelope {
  readonly rawEntries: readonly SirenEntry[];
  readonly graph: EntryGraph;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Build the IR pipeline envelope for a frozen flat entry list. This is the
 * only path used to construct a `SirenProject`.
 */
export function runIRBuildPipeline(rawEntries: readonly SirenEntry[]): IRBuildEnvelope {
  const pipeline = Pipeline.start<{ readonly rawEntries: readonly SirenEntry[] }>()
    .pipe(DedupModule)
    .pipe(GraphModule)
    .pipe(ImplicitDraftMilestoneModule)
    .pipe(ImplicitCompletionModule)
    .pipe(CyclesModule)
    .pipe(DanglingModule)
    .pipe(FinalizeModule);

  const env = pipeline.run({ rawEntries });
  return {
    rawEntries: env.rawEntries,
    graph: env.graph,
    diagnostics: env.diagnostics,
  };
}
