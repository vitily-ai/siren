import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTasksByMilestone, version } from '@siren/core';
import { getLoadedContext, loadProject } from './project.js';

const SIREN_DIR = 'siren';
const CONFIG_FILE = 'siren.config.yaml';
const MAIN_FILE = 'main.siren';

const CONFIG_CONTENTS = `# project_name: Siren Project
`;

function printUsage(): void {
  console.log(`Siren CLI v${version}

Usage: siren <command>

Commands:
  init    Initialize a new Siren project in the current directory
  list    List all milestone IDs from .siren files
    -t, --tasks    Show incomplete tasks under each milestone

Options:
  --version    Show version number`);
}

interface InitResult {
  created: string[];
  skipped: string[];
}

export function init(cwd: string): InitResult {
  const result: InitResult = { created: [], skipped: [] };

  const sirenDir = path.join(cwd, SIREN_DIR);
  const configPath = path.join(sirenDir, CONFIG_FILE);
  const mainPath = path.join(sirenDir, MAIN_FILE);

  // Create siren/ directory
  if (fs.existsSync(sirenDir)) {
    result.skipped.push(SIREN_DIR);
  } else {
    fs.mkdirSync(sirenDir, { recursive: true });
    result.created.push(SIREN_DIR);
  }

  // Create siren/siren.config.yaml
  const configRelPath = path.join(SIREN_DIR, CONFIG_FILE);
  if (fs.existsSync(configPath)) {
    result.skipped.push(configRelPath);
  } else {
    fs.writeFileSync(configPath, CONFIG_CONTENTS, 'utf-8');
    result.created.push(configRelPath);
  }

  // Create siren/main.siren
  const mainRelPath = path.join(SIREN_DIR, MAIN_FILE);
  if (fs.existsSync(mainPath)) {
    result.skipped.push(mainRelPath);
  } else {
    fs.writeFileSync(mainPath, '', 'utf-8');
    result.created.push(mainRelPath);
  }

  return result;
}

export function runInit(cwd: string): void {
  const result = init(cwd);

  for (const p of result.created) {
    console.log(`Created ${p}`);
  }
  for (const p of result.skipped) {
    console.log(`Skipped ${p} (already exists)`);
  }
}

export interface ListResult {
  milestones: string[];
  tasksByMilestone?: Map<string, string[]>;
  warnings: string[];
}

/**
 * List all milestone IDs from .siren files in the siren/ directory
 */
export async function list(showTasks: boolean = false): Promise<ListResult> {
  const ctx = getLoadedContext();
  if (!ctx) {
    throw new Error('Project context not loaded');
  }
  const result: ListResult = { milestones: ctx.milestones, warnings: ctx.warnings };
  if (showTasks) {
    const tasksByMilestone = getTasksByMilestone(ctx.resources);
    result.tasksByMilestone = new Map(
      Array.from(tasksByMilestone.entries()).map(([milestoneId, tasks]) => [
        milestoneId,
        tasks.map((task) => task.id),
      ]),
    );
  }
  return result;
}

export async function runList(showTasks: boolean = false): Promise<void> {
  const result = await list(showTasks);

  // Print warnings to stderr
  for (const warning of result.warnings) {
    console.error(warning);
  }

  if (showTasks && result.tasksByMilestone) {
    // Print milestone IDs with tasks
    for (const milestoneId of result.milestones) {
      console.log(milestoneId);
      const tasks = result.tasksByMilestone.get(milestoneId) || [];
      for (const taskId of tasks) {
        console.log(`\t${taskId}`);
      }
    }
  } else {
    // Print milestone IDs to stdout
    for (const id of result.milestones) {
      console.log(id);
    }
  }
}

export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  const command = args[0];

  if (command === '--version') {
    console.log(`Siren CLI v${version}`);
    return;
  }

  // Preload project context
  const ctx = await loadProject(process.cwd());

  // Print warnings and errors to stderr
  for (const warning of ctx.warnings) {
    console.error(warning);
  }
  for (const error of ctx.errors) {
    console.error(error);
  }

  if (command === 'init') {
    runInit(process.cwd());
    return;
  }

  if (command === 'list') {
    const showTasks = args.includes('-t') || args.includes('--tasks');
    await runList(showTasks);
    return;
  }

  printUsage();
}

// Only run when executed directly, not when imported for testing
const isMainModule =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}
