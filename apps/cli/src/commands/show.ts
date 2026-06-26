import type { Atom, SirenEntry, SirenProject } from '@sirenpm/core';
import { isComplete, isDraft, isReference } from '@sirenpm/core';
import { defineCommand } from 'citty';
import { type QueryArtifact, runLifecycle } from '../lifecycle';

const DIM = '\x1b[90m';
const ITALIC_DIM = '\x1b[3;90m';
const RESET = '\x1b[0m';

// ── Value formatting ────────────────────────────────────────────

function formatAtom(value: Atom): string {
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}

/**
 * Format an attribute tuple for inline display.
 *
 * - Empty tuple → dim "empty"
 * - Single value → formatted value
 * - Multiple values → first formatted + italic-dim "and N more"
 */
function formatAttributeValue(tuple: readonly Atom[]): string {
  // invert the above
  if (tuple.length > 0) {
    const [first, ...rest] = tuple;
    // TODO hate the non-null assertion, tsconfig `noUncheckedIndexedAccess` forces it
    const formattedFirst = formatAtom(first!);
    if (rest.length === 0) return formattedFirst;
    return `${formattedFirst} ${ITALIC_DIM}and ${rest.length} more${RESET}`;
  } else {
    return `${DIM}empty${RESET} `;
  }
}

/**
 * Extract the assignee string from an entry's attributes.
 */
function getAssignee(entry: SirenEntry): string | undefined {
  const attr = entry.attributes.find((a) => a.key === 'assignee');
  if (!attr) return undefined;
  const first = attr.value.find((v) => typeof v === 'string');
  return typeof first === 'string' ? first : undefined;
}

// ── Query builder ────────────────────────────────────────────────

export function showQuery(entryId: string) {
  return (project: SirenProject): QueryArtifact => {
    const entry = project.findEntryById(entryId);
    const lines: string[] = [];

    // ── Header ──────────────────────────────────────────────────
    lines.push(`${entry.type} ${entry.id}`);
    lines.push('  ');

    // ── Description ─────────────────────────────────────────────
    const descAttr = entry.attributes.find((a) => a.key === 'description');
    const description =
      descAttr && descAttr.value.length > 0 && typeof descAttr.value[0] === 'string'
        ? (descAttr.value[0] as string)
        : undefined;
    if (description && description.length > 0) {
      lines.push('  description:');
      for (const dl of description.split('\n')) {
        lines.push(`    ${dl}`);
      }
      lines.push('');
    } else {
      lines.push(`  description:  ${DIM}no description${RESET}`);
    }

    // ── Collect inline labels for alignment ─────────────────────
    const statusLabel = '  status:';
    const assigneeLabel = '  assigned to:';
    const customLabels = entry.attributes
      .filter((a) => !['description', 'assignee', 'depends_on'].includes(a.key))
      .map((a) => `  ${a.key}:`);
    const allInlineLabels = [statusLabel, assigneeLabel, ...customLabels];
    const maxLabelLen = Math.max(...allInlineLabels.map((l) => l.length));
    const valueColumn = maxLabelLen + 2;

    function padToValue(label: string): string {
      return ' '.repeat(Math.max(0, valueColumn - label.length));
    }

    // ── Status ──────────────────────────────────────────────────
    const statusValue = entry.status ?? '';
    lines.push(`${statusLabel}${padToValue(statusLabel)}${statusValue}`);

    // ── Assigned to ─────────────────────────────────────────────
    const assignee = getAssignee(entry);
    if (assignee) {
      lines.push(`${assigneeLabel}${padToValue(assigneeLabel)}${assignee}`);
    } else {
      lines.push(`${assigneeLabel}${padToValue(assigneeLabel)}${DIM}unassigned${RESET}`);
    }

    // ── Custom attributes ───────────────────────────────────────
    const customAttrs = entry.attributes.filter(
      (a) => !['description', 'assignee', 'depends_on'].includes(a.key),
    );
    if (customAttrs.length > 0) {
      lines.push('');
      for (const attr of customAttrs) {
        const label = `  ${attr.key}:`;
        // Filter out reference atoms (shouldn't appear in custom attrs, but be safe)
        const displayValues = attr.value.filter((v) => !isReference(v));
        const formatted = formatAttributeValue(displayValues);
        lines.push(`${label}${padToValue(label)}${formatted}`);
      }
    }

    // ── Dependency section ──────────────────────────────────────
    lines.push('');
    const depAttr = entry.attributes.find((a) => a.key === 'depends_on');
    const depIds = depAttr
      ? (depAttr.value
          .filter((v) => isReference(v))
          .map((v) => (v as { id: string }).id) as string[])
      : [];

    if (depIds.length === 0) {
      lines.push('  no dependencies');
    } else {
      const rootStats = project.getEntryStats(entry);

      // Partition immediate deps into open vs closed
      const open: { id: string; statsColumnText: string }[] = [];
      let closedCount = 0;

      for (const id of depIds) {
        const dep = project.findEntryById(id, { expect: false });
        if (!dep) {
          open.push({ id, statsColumnText: '' });
          continue;
        }
        if (isComplete(dep)) {
          closedCount++;
        } else if (isDraft(dep)) {
          open.push({ id, statsColumnText: '(draft)' });
        } else {
          const depStats = project.getEntryStats(dep);
          const hasDeps = depStats.deps.total > 0;
          open.push({
            id,
            statsColumnText: hasDeps ? `${depStats.deps.closed}/${depStats.deps.total}` : '',
          });
        }
      }

      // Compute stats column position (right-aligned, past all entry IDs)
      const maxIdPartLen =
        open.length > 0 ? Math.max(...open.map((o) => `  ├─ ${o.id}`.length)) : 0;
      const statsColumn = Math.max(valueColumn + 4, maxIdPartLen + 2);

      // "depends on" header with stats aligned
      const headerLabel = '  depends on';
      const headerStats = `${rootStats.deps.closed}/${rootStats.deps.total}`;
      const headerPad = ' '.repeat(Math.max(0, statsColumn - headerLabel.length));
      lines.push(`${headerLabel}${headerPad}${headerStats}`);

      // Tree entries (flat, depth=1)
      const openLines = open.map((o, i, arr) => {
        const isLast = i === arr.length - 1 && closedCount === 0;
        const connector = isLast ? '└─' : '├─';
        const prefix = `  ${connector} ${o.id}`;
        const pad = ' '.repeat(Math.max(0, statsColumn - prefix.length));
        return `${prefix}${pad}${o.statsColumnText}`;
      });

      lines.push(...openLines);

      // Collapsed closed summary
      if (closedCount > 0) {
        const label = closedCount === 1 ? 'closed entry' : 'closed entries';
        lines.push(`  └─ ${closedCount} ${label}`);
      }
    }

    return { stdout: lines };
  };
}

// ── CLI command definition ───────────────────────────────────────

export const showCommand = defineCommand({
  meta: {
    name: 'show',
    description: "Show a single entry's details and dependency list",
  },
  args: {
    entryId: {
      type: 'positional',
      required: false,
      description: 'Entry ID',
    },
  },
  async run({ args }) {
    const entryId = args.entryId;
    if (typeof entryId !== 'string' || entryId.length === 0) {
      throw new Error('missing entry id — usage: siren show <entry-id>');
    }

    await runLifecycle(process.cwd(), { query: showQuery(entryId) });
  },
});
