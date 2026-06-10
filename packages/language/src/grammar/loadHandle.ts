//

const WASM_URL = new URL('./tree-sitter-siren.wasm', import.meta.url);

export function getWasmUrl(): URL {
  return WASM_URL;
}
