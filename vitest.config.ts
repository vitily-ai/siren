import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const root = resolve(__dirname);

export default defineConfig({
  test: {
    // Run every package and app folder as a separate project for monorepos.
    // Resolve to absolute paths so running tests inside workspace folders
    // doesn't produce incorrect relative paths (e.g. apps/web/apps/cli).
    projects: [resolve(root, 'packages/*'), resolve(root, 'apps/cli')],
  },
});
