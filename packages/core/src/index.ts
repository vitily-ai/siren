/**
 * @siren/core
 * Environment-agnostic core library for Siren PMaC framework
 */

export const version = '0.1.0';

// IR types (intermediate representation)
export * from './ir/index.js';

// Parser types and interfaces
export * from './parser/index.js';

// Decoder (CST → IR transformation)
export { decode } from './decoder/index.js';
export type { DecodeResult, Diagnostic } from './decoder/index.js';
