import type { SirenEntry } from './types';

export interface SirenDocumentDirective {
  readonly implicitMilestone?: boolean;
}

/**
 * Immutable pre-build document input for SirenBuilder.
 */
export interface SirenDocument {
  readonly id: string;
  readonly entries: readonly SirenEntry[];
  readonly directive?: SirenDocumentDirective;
}
