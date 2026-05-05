/**
 * IR pipeline primitives.
 *
 * The IR pipeline is a strict, strongly-typed forward-pass composition of
 * pure modules used internally by IRAssembly to build an IRContext.
 *
 * Module rules:
 * - A module is a pure function `(input) => additions`.
 * - Inputs are deeply frozen and never mutated.
 * - Outputs are deeply frozen by the runner before being merged into the
 *   carried envelope.
 * - A module declares only the keys it directly needs in its input type.
 *   Unrelated keys are pass-through, carried by the runner.
 * - "Logical mutation" is achieved by returning a key that already exists on
 *   the envelope; the new value shadows the old one downstream.
 */

/** An envelope is a readonly record of named derivations. */
export type Envelope = Readonly<Record<string, unknown>>;

/**
 * A pipeline module: a pure function that reads a subset of the envelope
 * (`TIn`) and returns additions (`TAdd`) to merge back in.
 *
 * Modules must not mutate `input`. Returned values may be new or replace
 * existing keys; the runner spreads them onto the envelope.
 */
export interface Module<TIn extends Envelope, TAdd extends Envelope> {
  readonly name: string;
  run(input: TIn): TAdd;
}

/**
 * Helper to declare a module without losing inference on `TAdd`.
 */
export function defineModule<TIn extends Envelope, TAdd extends Envelope>(
  name: string,
  run: (input: TIn) => TAdd,
): Module<TIn, TAdd> {
  return { name, run };
}
