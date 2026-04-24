import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    'import.meta.env.BUILD_METADATA': '""',
  },
  test: {
    environment: 'node',
  },
});
