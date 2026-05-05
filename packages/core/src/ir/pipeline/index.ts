import type { DirectedGraph } from '../../utilities/graph';
import type { Diagnostic } from '../diagnostics';
import type { Resource } from '../types';
import { ImplicitCompletionModule } from './modules/completion';
import { CyclesModule } from './modules/cycles';
import { DanglingModule } from './modules/dangling';
import { DedupModule } from './modules/dedup';
import { FinalizeModule } from './modules/finalize';
import { GraphModule } from './modules/graph';
import { IndexModule } from './modules/index-by-id';
import { Pipeline } from './runner';

/**
 * Final shape of the IR build pipeline envelope after running every module.
 *
 * This is the internal projection consumed by `IRContext`. It is not part of
 * the public core surface — `IRContext` exposes only what callers need
 * (`resources`, `diagnostics`, `graph`, query helpers).
 *
 * Pipeline topology (single direct upstream is the immediately preceding
 * module in the chain; indirect dependencies are carried opaquely through
 * the envelope):
 *
 *   seed { rawResources }
 *     → Dedup       adds   { resources, duplicateDiagnostics }
 *     → Index       adds   { resourcesById }
 *     → Graph       adds   { graph }
 *     → Completion  rewrites { resources, resourcesById }   (graph stays valid)
 *     → Cycles      adds   { cycles, cycleDiagnostics }
 *     → Dangling    adds   { danglingDiagnostics }
 *     → Finalize    adds   { diagnostics }
 */
export interface IRBuildEnvelope {
  readonly rawResources: readonly Resource[];
  readonly resources: readonly Resource[];
  readonly resourcesById: ReadonlyMap<string, Resource>;
  readonly graph: DirectedGraph;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Build the IR pipeline envelope for a frozen raw resource snapshot. This is
 * the only path used to construct an `IRContext`.
 */
export function runIRBuildPipeline(rawResources: readonly Resource[]): IRBuildEnvelope {
  const pipeline = Pipeline.start<{ readonly rawResources: readonly Resource[] }>()
    .then(DedupModule)
    .then(IndexModule)
    .then(GraphModule)
    .then(ImplicitCompletionModule)
    .then(CyclesModule)
    .then(DanglingModule)
    .then(FinalizeModule);

  const env = pipeline.run({ rawResources });
  return {
    rawResources: env.rawResources,
    resources: env.resources,
    resourcesById: env.resourcesById,
    graph: env.graph,
    diagnostics: env.diagnostics,
  };
}
