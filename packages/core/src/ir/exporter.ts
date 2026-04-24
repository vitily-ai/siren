/**
 * Document-level exporter interface.
 *
 * Exporters serialize an entire {@link IRContext} into a textual
 * representation (Siren source, JSON, Mermaid, etc.). Concrete
 * implementations live in downstream packages (e.g. `@sirenpm/language`).
 */

import type { IRContext } from './context';

export interface IRExporter {
  export(ctx: IRContext): string;
}
