import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  shims: true,
  external: ['@siren/core'],
  banner: {
    js: '#!/usr/bin/env node',
  },
});
