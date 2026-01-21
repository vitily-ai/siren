// xfail utility for Vitest

// xfailIf: pass the 'it' function from Vitest as the first argument
export function xfailIf(itFn: any, condition: boolean, reason: string) {
  return condition ? itFn.skip : itFn;
}
