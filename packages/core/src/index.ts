/**
 * @siren/core
 * Environment-agnostic core library for Siren PMaC framework
 */

export const version = '0.1.0';

// Diagnostics (core diagnostic types, codes, bag, and source-address utilities)
export * from './diagnostics/index.js';
// IR types and context (intermediate representation)
export * from './ir/index.js';

// Export dependency tree utilities
export type { DependencyTree } from './utilities/dependency-tree.js';
