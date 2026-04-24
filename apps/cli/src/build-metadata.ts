/**
 * Build metadata (e.g. short git SHA for prereleases, empty for releases).
 *
 * The value is injected at build time via a `define` macro
 * (`import.meta.env.BUILD_METADATA`).
 */
export const buildMetadata: string = import.meta.env.BUILD_METADATA ?? '';
