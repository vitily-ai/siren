import type { Diagnostic } from '../diagnostics';
import type { SirenDocument } from '../document';
import type { ResourceGraph } from '../resource-graph';
import type { Resource } from '../types';
import { ImplicitCompletionModule } from './modules/completion';
import { CyclesModule } from './modules/cycles';
import { DanglingModule } from './modules/dangling';
import { DedupModule } from './modules/dedup';
import { FinalizeModule } from './modules/finalize';
import { GraphModule } from './modules/graph';
import { ImplicitDraftMilestoneModule } from './modules/implicit-draft-milestone';
import { SynthesisModule } from './modules/synthesis';
import { Pipeline } from './runner';

/**
 * Final shape of the IR build pipeline envelope after running every module.
 *
 * This is the internal projection consumed by `SirenProject`. It is not part of
 * the public core surface — `SirenProject` exposes only what callers need
 * (`resources`, `diagnostics`, `graph`, query helpers).
 *
 * Pipeline topology (single direct upstream is the immediately preceding
 * module in the chain; indirect dependencies are carried opaquely through
 * the envelope):
 *
 *   seed { documents }
 *     → Synthesis              adds   { rawResources }
 *     → Dedup                  adds   { resources, duplicateDiagnostics }
 *     → Graph                  adds   { graph }
 *     → ImplicitDraftMilestone rewrites { graph }
 *     → Completion             rewrites { graph }
 *     → Cycles                 adds   { cycles, cycleDiagnostics }
 *     → Dangling               adds   { danglingDiagnostics }
 *     → Finalize               adds   { diagnostics }
 */
export interface IRBuildEnvelope {
  readonly rawResources: readonly Resource[];
  readonly graph: ResourceGraph;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Build the IR pipeline envelope for frozen pre-build documents. This is the
 * only path used to construct a `SirenProject`.
 */
export function runIRBuildPipeline(documents: readonly SirenDocument[]): IRBuildEnvelope {
  const pipeline = Pipeline.start<{ readonly documents: readonly SirenDocument[] }>()
    .pipe(SynthesisModule)
    .pipe(DedupModule)
    .pipe(GraphModule)
    .pipe(ImplicitDraftMilestoneModule)
    .pipe(ImplicitCompletionModule)
    .pipe(CyclesModule)
    .pipe(DanglingModule)
    .pipe(FinalizeModule);

  const env = pipeline.run({ documents });
  return {
    rawResources: env.rawResources,
    graph: env.graph,
    diagnostics: env.diagnostics,
  };
}
