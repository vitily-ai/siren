// xfail utility for Vitest

// xfailIf: pass the 'it' function from Vitest as the first argument
export function xfailIf(itFn: any, condition: boolean) {
  return condition ? itFn.skip : itFn;
}
