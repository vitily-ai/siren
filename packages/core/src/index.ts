/**
 * @siren/core
 * Environment-agnostic core library for Siren PMaC framework
 */

export const version = '0.1.0';

export type { DecodeResult, Diagnostic } from './decoder/index.js';
// Decoder (CST → IR transformation)
export { decode } from './decoder/index.js';
// Export text exporter utilities
export * from './export/index.js';
// IR types (intermediate representation)
export * from './ir/index.js';
// Parser types and interfaces
// NOTE: parser types and internal utilities are intentionally not re-exported
// here. Consumers should interact with the library via `IRContext` and the
// exported IR types.
