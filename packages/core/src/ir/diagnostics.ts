/**
 * Shared base shape for all Siren diagnostics (semantic and, in future, parse/decode).
 *
 * `message` is intentionally absent: frontends (CLI, web, editors) assemble
 * display text from the structured fields of each concrete diagnostic variant.
 */
export interface DiagnosticBase {
  readonly code: string;
  readonly severity: 'warning' | 'error';
  /** Source file path (when available) */
  readonly file?: string;
  /** 1-based line number (when available) */
  readonly line?: number;
  /** 0-based column number (when available) */
  readonly column?: number;
}
