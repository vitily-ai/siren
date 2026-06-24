import type { SirenEntry, SirenProject } from '@sirenpm/core';
import { defineCommand } from 'citty';
import { type QueryArtifact, runLifecycle } from '../lifecycle';

/**
 * Extract the first string value of an `assignee` attribute, if present.
 */
function getAssignee(entry: SirenEntry): string | undefined {
  const attr = entry.attributes.find((a) => a.key === 'assignee');
  if (!attr) return undefined;
  const first = attr.value[0];
  return typeof first === 'string' ? first : undefined;
}

/**
 * Render a list of milestones with stats and optional assignee.
 * Columns are separated by 4 spaces, aligned to the longest text in the prior column.
 */
function renderMilestoneLines(
  milestones: readonly (SirenEntry & {
    readonly stats: { readonly deps: { readonly total: number; readonly closed: number } };
  })[],
): string[] {
  if (milestones.length === 0) return [];

  // Build rows: [id, statString, assignee?]
  const rows: [string, string, string | undefined][] = milestones.map((m) => [
    m.id,
    `${m.stats.deps.closed}/${m.stats.deps.total}`,
    getAssignee(m),
  ]);

  // Compute column widths
  const idWidth = Math.max(...rows.map((r) => r[0].length));
  const statsWidth = Math.max(...rows.map((r) => r[1].length));

  return rows.map(([id, stats, assignee]) => {
    // TODO debt.cli-wide-char-alignment
    const idPadded = id.padEnd(idWidth);
    const statsPadded = stats.padStart(statsWidth);
    let line = `  ${idPadded}    ${statsPadded}`;
    if (assignee) {
      line += `    ${assignee}`;
    }
    return line;
  });
}

function renderStatus(project: SirenProject, full: boolean): string[] {
  const status = project.getStatus();
  const lines: string[] = [];

  const sections = [
    { items: status.open, adjective: 'open', expanded: true, trailingBlank: true },
    { items: status.closed, adjective: 'closed', expanded: full, trailingBlank: full },
    { items: status.draft, adjective: 'draft', expanded: full, trailingBlank: false },
  ];

  for (const { items, adjective, expanded, trailingBlank } of sections) {
    const label = items.length === 1 ? 'milestone' : 'milestones';
    if (expanded && items.length > 0) {
      lines.push(`${items.length} ${adjective} ${label}:`);
      lines.push(...renderMilestoneLines(items));
      if (trailingBlank) lines.push('');
    } else {
      lines.push(`${items.length} ${adjective} ${label}`);
    }
  }

  return lines;
}

export function statusQuery(full: boolean) {
  return (project: SirenProject): QueryArtifact => ({
    stdout: renderStatus(project, full),
  });
}

export const statusCommand = defineCommand({
  meta: {
    name: 'status',
    description: 'Show milestone completion status overview',
  },
  args: {
    full: {
      type: 'boolean',
      alias: 'f',
      description: 'Show full details including closed and draft milestones',
    },
  },
  async run({ args }) {
    await runLifecycle(process.cwd(), { query: statusQuery(Boolean(args.full)) });
  },
});
