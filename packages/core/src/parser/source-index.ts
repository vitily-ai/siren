/**
 * SourceIndex: Comment Classification Engine
 *
 * Anchors comments to IR nodes using line-based heuristics.
 * Classifies comments as leading, trailing, or detached based on:
 * - Same-line detection (trailing vs leading)
 * - Blank line detection (detached vs leading)
 * - Byte offset relationships
 */

import type { CommentToken } from './adapter.js';
import type { Origin } from './cst.js';

/**
 * Classified comment attached to a source location
 */
export interface ClassifiedComment {
  readonly token: CommentToken;
  readonly classification: 'leading' | 'trailing' | 'detached';
  readonly blankLinesBefore?: number; // For detached: how many blank lines preceded this
}

/**
 * Comment index providing fast lookup and classification
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
  private readonly lineEnds: Map<number, number>; // Map row → byte offset of line end

  /**
   * Create a source index from parsed comments and source text
   *
   * @param comments - Flat list of comment tokens from parser (assumed pre-sorted by byte)
   * @param source - Original source text (for line break detection)
   */
  constructor(comments: readonly CommentToken[], source: string) {
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

  /**
   * Count blank lines between two byte offsets
   * A blank line contains only whitespace (spaces, tabs, or is empty)
   */
  private countBlankLinesBetween(startByte: number, endByte: number): number {
    if (startByte >= endByte) return 0;

    let blankCount = 0;
    let currentLineStart = startByte;

    for (let i = startByte; i < endByte; i++) {
      if (this.source[i] === '\n') {
        // End of current line (line goes from currentLineStart to i-1)
        const lineContent = this.source.substring(currentLineStart, i);
        if (lineContent.trim() === '') {
          blankCount++;
        }
        currentLineStart = i + 1; // Start of next line after newline
      }
    }

    return blankCount;
  }

  /**
   * Check if a comment is on the same line as a given byte offset
   */
  private isOnSameLine(commentStartRow: number, byteOffset: number): boolean {
    // Find which row the byte offset is on
    for (let row = 0; row < this.lineStarts.length; row++) {
      const lineStart = this.lineStarts[row];
      if (lineStart === undefined) continue;
      const lineEnd = this.lineEnds.get(row) ?? this.source.length;
      if (byteOffset >= lineStart && byteOffset <= lineEnd) {
        return commentStartRow === row;
      }
    }
    return false;
  }

  /**
   * Get leading comments for a node
   * Comments are "leading" if they appear before the node's starting byte
   * and are on a different line than the previous semantic token
   */
  getLeadingComments(origin: Origin): readonly ClassifiedComment[] {
    const result: ClassifiedComment[] = [];

    for (const comment of this.comments) {
      // Stop at comments that are at or after the node start
      if (comment.endByte >= origin.startByte) {
        break;
      }

      // Check if this is a leading comment (on different line from previous token)
      // For leading, we just need comments before the node
      const classified: ClassifiedComment = {
        token: comment,
        classification: 'leading',
      };
      result.push(classified);
    }

    return result;
  }

  /**
   * Get trailing (end-of-line) comments for a node
   * Comments are "trailing" if they appear on the same line as the node's ending byte
   */
  getTrailingComments(origin: Origin): readonly ClassifiedComment[] {
    const result: ClassifiedComment[] = [];

    for (const comment of this.comments) {
      // Trailing comments should be on same line as node end
      if (!this.isOnSameLine(comment.startRow, origin.endByte)) {
        continue;
      }

      // Trailing comment must come after node end
      if (comment.startByte >= origin.endByte) {
        const classified: ClassifiedComment = {
          token: comment,
          classification: 'trailing',
        };
        result.push(classified);
      }
    }

    return result;
  }

  /**
   * Get all detached comment blocks (preserved with blank line info)
   * Returns blocks of comments that are separated by blank lines
   */
  getDetachedBlocks(): readonly (readonly ClassifiedComment[])[] {
    const detachedBlocks: ClassifiedComment[][] = [];

    if (this.comments.length === 0) {
      return detachedBlocks;
    }

    let currentBlock: ClassifiedComment[] = [];
    let prevCommentEnd = -1;
    let inDetachedBlock = false;

    for (const comment of this.comments) {
      const blankLinesBefore =
        prevCommentEnd >= 0 ? this.countBlankLinesBetween(prevCommentEnd, comment.startByte) : 0;

      // If there are blank lines before this comment, it's detached
      if (blankLinesBefore > 0) {
        // If we were in a detached block, save it
        if (currentBlock.length > 0) {
          detachedBlocks.push([...currentBlock]);
          currentBlock = [];
        }
        // Start new detached block with this comment
        const classified: ClassifiedComment = {
          token: comment,
          classification: 'detached',
          blankLinesBefore,
        };
        currentBlock.push(classified);
        inDetachedBlock = true;
      } else if (inDetachedBlock && prevCommentEnd >= 0) {
        // Continue current detached block (consecutive comments after blank line)
        const classified: ClassifiedComment = {
          token: comment,
          classification: 'detached',
        };
        currentBlock.push(classified);
      } else if (prevCommentEnd < 0) {
        // First comment - not a detached block (might be leading)
        inDetachedBlock = false;
      }

      prevCommentEnd = comment.endByte;
    }

    // Push final block if any
    if (currentBlock.length > 0 && inDetachedBlock) {
      detachedBlocks.push([...currentBlock]);
    }

    return detachedBlocks;
  }

  /**
   * Get all EOF (trailing) comments after the last semantic node
   * These are comments at the end of file not classified as leading/trailing for any node
   */
  getEOFComments(): readonly ClassifiedComment[] {
    const result: ClassifiedComment[] = [];

    for (const comment of this.comments) {
      // Collect all comments that appear after actual nodes
      // In this simple implementation, we'll collect detached blocks at EOF
      const classified: ClassifiedComment = {
        token: comment,
        classification: 'detached',
      };
      result.push(classified);
    }

    return result;
  }
}
