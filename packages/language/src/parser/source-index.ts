/**
 * NOT-TO-BE-USED: legacy comment-classification helper retained only for the
 * semantic IR export path.
 *
 * Prefer syntax trivia plus {@link renderSyntaxDocument} for new source
 * rendering work. Avoid introducing new callers of SourceIndex.
 *
 * SourceIndex: Comment Classification Engine
 *
 * Anchors comments to IR nodes using line-based heuristics.
 * Classifies comments as leading, trailing, or detached based on:
 * - Same-line detection (trailing vs leading)
 * - Blank line detection (detached vs leading)
 * - Byte offset relationships
 */

import type { CommentToken } from './adapter';

// TODO[SOURCEINDEX-ASSUME]: SourceIndex currently assumes `comments` are provided
// pre-sorted by byte offset and that `source` is UTF-8. Add defensive checks
// and normalization (sort comments, validate offsets) to avoid surprising
// behavior when callers feed unsorted or non-UTF8-aware offsets. See task
// `sourceindex-assumptions` in siren/debt.siren.
//
// TODO[ENCODING-MULTIBYTE]: The implementation uses JavaScript string indices
// (UTF-16 code units) vs. byte offsets in many places. Ensure offset
// calculations account for multi-byte UTF-8 characters and CRLF line endings.
// See task `encoding-multibyte` in siren/debt.siren.

/**
 * Classified comment attached to a source location
 */
export interface ClassifiedComment {
  readonly token: CommentToken;
  readonly classification: 'leading' | 'trailing' | 'detached';
  readonly blankLinesBefore?: number; // For detached: how many blank lines preceded this
}

/**
 * NOT-TO-BE-USED: compatibility class for legacy semantic export internals.
 *
 * Uses line-based heuristics to classify comments:
 * - Trailing: comment on same line as previous token end
 * - Leading: comment on different line from previous token (no blank lines)
 * - Detached: comment separated by one or more blank lines
 */
export class SourceIndex {
  private readonly comments: readonly CommentToken[];
  private readonly source: string;
  private readonly lineStarts: number[]; // Map row → byte offset

  /**
   * Create a source index from parsed comments and source text
   *
   * @param comments - Flat list of comment tokens from parser (assumed pre-sorted by byte)
   * @param source - Original source text (for line break detection)
   */
  constructor(comments: readonly CommentToken[], source: string) {
    // TODO: Consider normalizing/sorting comments here to be defensive.
    // See TODO[SOURCEINDEX-ASSUME] and task `sourceindex-assumptions`.
    this.comments = comments;
    this.source = source;
    this.lineStarts = this.buildLineStarts();
    this.lineEnds = this.buildLineEnds();
  }

  /**
   * Return the original flat list of comment tokens in source order.
   *
   * Exporters can use this to interleave comments between semantic nodes
   * while keeping core environment-agnostic.
   */
  getAllComments(): readonly CommentToken[] {
    return this.comments;
  }

  /**
   * Build a map of row numbers to byte offsets for O(1) line lookup
   * lineStarts[row] = byte offset where that row begins
   */
  private buildLineStarts(): number[] {
    const starts: number[] = [0]; // Row 0 starts at byte 0
    for (let i = 0; i < this.source.length; i++) {
      if (this.source[i] === '\n') {
        starts.push(i + 1); // Next row starts after newline
      }
    }
    return starts;
  }

  /**
   * Build a map of row numbers to byte offsets of line ends (before \n)
   */
  private buildLineEnds(): Map<number, number> {
    const map = new Map<number, number>();
    let currentRow = 0;
    for (let i = 0; i < this.source.length; i++) {
      if (this.source[i] === '\n') {
        map.set(currentRow, i); // Line ends at the newline position
        currentRow++;
      }
    }
    // Last line ends at end of source
    if (currentRow < this.lineStarts.length) {
      map.set(currentRow, this.source.length);
    }
    return map;
  }
}
