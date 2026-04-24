// TODO this shouldn't be in app code
// xfail utility for Vitest

// xfailIf: pass the 'it' function from Vitest as the first argument
type ItLike = ((name: string, fn: (done?: unknown) => void) => void) & {
  skip: (name: string, fn: (done?: unknown) => void) => void;
};

export function xfailIf(itFn: ItLike, condition: boolean): ItLike {
  return (condition ? (itFn.skip as unknown as ItLike) : itFn) as ItLike;
}
