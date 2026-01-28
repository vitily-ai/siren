/**
 * @siren/core
 * Environment-agnostic core library for Siren PMaC framework
 */

export const version = '0.1.0';

export type { DecodeResult, Diagnostic } from './decoder/index.js';
// Decoder (CST → IR transformation)
export { decode } from './decoder/index.js';
// IR types (intermediate representation)
export * from './ir/index.js';
// Parser types and interfaces
export * from './parser/index.js';
// TODO should not export MAX_DEPTH - should be opaque
export { getIncompleteLeafDependencyChains, MAX_DEPTH } from './utilities/dependency-chains.js';
export { findResourceById } from './utilities/entry.js';
// Utilities
export { getMilestoneIds, getTasksByMilestone } from './utilities/milestone.js';
