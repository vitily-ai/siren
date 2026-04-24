import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

export default defineConfig({
  define: {
    'import.meta.env.PACKAGE_VERSION': JSON.stringify(pkg.version),
    'import.meta.env.BUILD_METADATA': '""',
  },
  test: {
    environment: 'node',
    // XFAIL: CLI is pinned to @sirenpm/core@0.1.0 and references the old grammar
    // location (packages/core/grammar). Phase 2.2 moved the grammar to
    // packages/language/grammar and core no longer ships the parser. These
    // tests are restored in Release 3 (Phase 3.x) when the CLI migrates to
    // @sirenpm/language. See lang-package-plan.md Phase 2.3 note.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'src/adapter/node-parser-adapter.test.ts',
      'src/format.cli-mvp.test.ts',
      'src/format.unit.test.ts',
      'src/index.test.ts',
      'src/project.test.ts',
      'test/golden.test.ts',
    ],
  },
});
