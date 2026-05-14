import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { version as coreVersion } from '@sirenpm/core';
import { defineCommand, runCommand } from 'citty';
import { buildMetadata } from './build-metadata';
import { formatCommand } from './commands/format';
import type { ListResult as CommandListResult } from './commands/list';
import { listCommand, list as listMilestones, runList as runListCommand } from './commands/list';
import { runShow as runShowCommand, showCommand } from './commands/show';
import { loadProject } from './project';
import { cliVersion } from './version';

const cliSuffix = buildMetadata ? `-${buildMetadata}` : '';
const cliVersionString = `${cliVersion}${cliSuffix}`;
const coreVersionString = coreVersion;

function printUsage(): void {
  console.log(`Siren CLI v${cliVersionString}

Usage: siren <command>

Commands:
  list    List all milestone IDs from .siren files
    -t, --tasks    Show incomplete tasks under each milestone
  show    Show a single entry's dependency tree (milestone or task)
  format  Format .siren files in-place or print formatted output
    --dry-run    Print formatted output to stdout without writing files
    --verbose    Print list of files that would be updated or were updated

Options:
  --version    Show version number`);
}

export type ListResult = CommandListResult;

export const mainCommand = defineCommand({
  meta: {
    name: 'siren',
    version: cliVersionString,
    description: 'Siren command-line interface',
  },
  subCommands: {
    list: listCommand,
    show: showCommand,
    format: formatCommand,
  },
  async setup() {
    await loadProject(process.cwd());
  },
});

function isUsageOnlyError(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  return code === 'E_UNKNOWN_COMMAND' || code === 'E_NO_COMMAND';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  const command = args[0];

  if (command === '--version') {
    console.log(`Siren CLI v${cliVersionString}`);
    console.log(`Siren Core v${coreVersionString}`);
    return;
  }

  try {
    await runCommand(mainCommand, { rawArgs: args });
  } catch (error) {
    if (isUsageOnlyError(error)) {
      printUsage();
      return;
    }

    console.error(getErrorMessage(error));
    process.exitCode = 1;
  }
}

export function list(showTasks = false) {
  return listMilestones(showTasks);
}

export function runList(showTasks = false): Promise<void> {
  return runListCommand(showTasks);
}

export function runShow(entryId: string): Promise<void> {
  return runShowCommand(entryId);
}

const isMainModule =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}
