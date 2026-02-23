/**
 * DiagnosticBag: immutable collector for bundling diagnostics from
 * multiple sources (parser, IR, etc.).
 *
 * Each mutation method returns a new bag instance.
 */

import type { BaseDiagnostic } from './types.js';

export class DiagnosticBag<T extends BaseDiagnostic = BaseDiagnostic> {
  private readonly _items: readonly T[];

  private constructor(items: readonly T[]) {
    this._items = Object.freeze(items.slice());
  }

  static empty<T extends BaseDiagnostic = BaseDiagnostic>(): DiagnosticBag<T> {
    return new DiagnosticBag<T>([]);
  }

  static from<T extends BaseDiagnostic>(items: readonly T[]): DiagnosticBag<T> {
    return new DiagnosticBag(items);
  }

  /** Return a new bag with additional diagnostics appended. */
  add(...items: T[]): DiagnosticBag<T> {
    return new DiagnosticBag([...this._items, ...items]);
  }

  /** Merge another bag into this one, returning a new bag. */
  merge<U extends BaseDiagnostic>(other: DiagnosticBag<U>): DiagnosticBag<T | U> {
    return new DiagnosticBag<T | U>([...this._items, ...other.all]);
  }

  get all(): readonly T[] {
    return this._items;
  }

  get errors(): readonly T[] {
    return this._items.filter((d) => d.severity === 'error');
  }

  get warnings(): readonly T[] {
    return this._items.filter((d) => d.severity === 'warning');
  }

  get hasErrors(): boolean {
    return this._items.some((d) => d.severity === 'error');
  }

  get isEmpty(): boolean {
    return this._items.length === 0;
  }

  /** Filter diagnostics by code prefix (e.g., 'WP' for parser warnings). */
  byPrefix(prefix: string): readonly T[] {
    return this._items.filter((d) => d.code.startsWith(prefix));
  }
}
