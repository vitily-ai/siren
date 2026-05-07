/**
 * Document-level exporter interface.
 *
 * Exporters serialize an entire {@link SirenProject} into a textual
 * representation (Siren source, JSON, Mermaid, etc.). Concrete
 * implementations live in downstream packages (e.g. `@sirenpm/language`).
 */

import type { SirenProject } from './context';

export interface IRExporter {
  export(ctx: SirenProject): string;
}
