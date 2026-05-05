import type { Envelope, Module } from './types';

/**
 * Linear forward-pass pipeline runner.
 *
 * Modules are appended via `.then(module)`. Each module's input type must be
 * a subset of the cumulative envelope. The runner:
 *
 *  1. Freezes the seed envelope.
 *  2. For each module: invokes `run(envelope)`, freezes the additions, and
 *     merges them into the envelope (`{ ...envelope, ...additions }`).
 *     Modules may return keys that already exist on the envelope; the new
 *     value shadows the prior one downstream (this is how "logical mutation"
 *     is encoded — for example, the implicit-completion module replaces
 *     `resources` with the completion-resolved list).
 *  3. Returns the terminal envelope (frozen).
 *
 * Type-level guarantees:
 *  - `.then(m)` requires `m`'s declared input type to be a structural subset
 *    of the carried envelope. TypeScript enforces this.
 *  - The terminal envelope type accumulates each module's `TAdd`.
 *
 * Single-direct-upstream rule:
 *   The pipeline is linear. A module's "direct upstream" is the immediately
 *   preceding module. Indirect dependencies are carried opaquely through the
 *   envelope without the module needing to know about them.
 */
export class Pipeline<TSeed extends Envelope, TEnv extends Envelope> {
  private constructor(private readonly modules: ReadonlyArray<Module<Envelope, Envelope>>) {}

  static start<TSeed extends Envelope>(): Pipeline<TSeed, TSeed> {
    return new Pipeline<TSeed, TSeed>([]);
  }

  // biome-ignore lint/suspicious/noThenProperty: temporary during review, determine if rename needed before merge
  then<TIn extends Envelope, TAdd extends Envelope>(
    this: TEnv extends TIn ? Pipeline<TSeed, TEnv> : never,
    module: Module<TIn, TAdd>,
  ): Pipeline<TSeed, Omit<TEnv, keyof TAdd> & TAdd> {
    return new Pipeline<TSeed, Omit<TEnv, keyof TAdd> & TAdd>([
      ...(this as unknown as Pipeline<TSeed, TEnv>).modules,
      module as unknown as Module<Envelope, Envelope>,
    ]);
  }

  run(seed: TSeed): TEnv {
    let envelope: Envelope = Object.freeze({ ...seed });
    for (const module of this.modules) {
      const additions = module.run(envelope);
      envelope = Object.freeze({ ...envelope, ...Object.freeze(additions) });
    }
    return envelope as TEnv;
  }
}
