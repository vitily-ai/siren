import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

// INVARIANT: this bundle MUST emit a single flat `dist/index.js` sitting at
// the same depth relative to `grammar/tree-sitter-siren.wasm` as
// `src/parser/factory.ts` (i.e. two directories up). The factory resolves the
// grammar via `new URL('../../grammar/tree-sitter-siren.wasm', import.meta.url)`,
// so any change that nests the entry (e.g. `dist/parser/factory.js`) or moves
// the WASM artifact will silently break package-relative resolution in
// consumers. If you must restructure the entry, update the URL in
// `src/parser/factory.ts` to match.
export default defineConfig({
  entry: ['src/index.ts'],
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
});
