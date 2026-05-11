import type { Resource } from './types';

export interface SirenDocumentDirective {
  readonly implicitMilestone?: boolean;
}

/**
 * Immutable pre-build document input for SirenBuilder.
 */
export interface SirenDocument {
  readonly id: string;
  readonly resources: readonly Resource[];
  readonly directive?: SirenDocumentDirective;
}
