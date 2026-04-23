/**
 * Build metadata (e.g. short git SHA for prereleases, empty for releases).
 *
 * The value is injected at build time via a `define` macro
 * (`import.meta.env.BUILD_METADATA`). In plain Node runtimes where
 * `import.meta.env` is undefined, this falls back to an empty string.
 */
const env = (import.meta as { env?: { BUILD_METADATA?: string } }).env;
export const buildMetadata: string = env?.BUILD_METADATA ?? '';
