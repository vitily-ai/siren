import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { version as coreVersion } from '@sirenpm/core';
import { defineCommand, runCommand } from 'citty';
import { buildMetadata } from './build-metadata';
import { formatCommand } from './commands/format';
import { listCommand } from './commands/list';
import { mvCommand } from './commands/mv';
import { showCommand } from './commands/show';
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
  mv      Change an entry's explicit completion status
  format  Format .siren files in-place or print formatted output
    --dry-run    Print formatted output to stdout without writing files
    --verbose    Print list of files that would be updated or were updated

Options:
  --version    Show version number`);
}

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
    mv: mvCommand,
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

const isMainModule =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}
