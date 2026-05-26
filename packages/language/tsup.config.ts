import { copyFileSync, readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

export default defineConfig({
  entry: ['src/index.ts'],
  loader: {
    '.wasm': 'copy',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  platform: 'neutral',
  define: {
    'import.meta.env.PACKAGE_VERSION': JSON.stringify(pkg.version),
    'import.meta.env.BUILD_METADATA': '""',
  },
  async onSuccess() {
    // copy wasm to dist/tree-sitter-siren.wasm
    const wasmSrc = new URL('./src/grammar/tree-sitter-siren.wasm', import.meta.url);
    const wasmDest = new URL('./dist/tree-sitter-siren.wasm', import.meta.url);
    copyFileSync(wasmSrc, wasmDest);
  },
});
