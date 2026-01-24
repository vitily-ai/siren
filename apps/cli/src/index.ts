import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getIncompleteLeafDependencyChains, version } from '@siren/core';
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
  chainsByMilestone?: Map<string, string[][]>;
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
    const chainsByMilestone = new Map<string, string[][]>();
    for (const milestoneId of ctx.milestones) {
      const chains = getIncompleteLeafDependencyChains(milestoneId, ctx.resources, 10); // Use a high maxDepth to get all
      chainsByMilestone.set(milestoneId, chains);
    }
    result.chainsByMilestone = chainsByMilestone;
  }
  return result;
}

/**
 * Render dependency chains with ASCII tree characters, truncating chains longer than depth 2.
 */
export function renderDependencyChains(chains: string[][]): string[] {
  if (chains.length === 0) return [];

  // Process chains: remove milestone from start, truncate if too long
  const processedChains: string[][] = chains.map((chain) => {
    const deps = chain.slice(1); // Remove milestone
    if (deps.length <= 4) return deps; // No truncation if <=4 deps (intermediate <=2)
    // Truncate: keep first, replace middle with '... (N intermediate)', keep last
    const first = deps[0]!;
    const last = deps[deps.length - 1]!;
    const intermediateCount = deps.length - 2;
    return [first, `… (${intermediateCount} intermediate dependencies)`, last];
  });

  // Build a tree from the processed chains
  const tree: Record<string, Record<string, any>> = {};
  for (const chain of processedChains) {
    let current = tree;
    for (const id of chain) {
      if (!current[id]) current[id] = {};
      current = current[id];
    }
  }

  // Recursively render the tree
  function renderTree(node: Record<string, Record<string, any>>, prefix: string = ''): string[] {
    const lines: string[] = [];
    const keys = Object.keys(node).sort(); // Sort for consistent output
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const isLast = i === keys.length - 1;
      const connector = isLast ? '└─' : '├─';
      const extend = isLast ? '   ' : '│  ';
      lines.push(`${prefix}${connector} ${key}`);
      // @ts-expect-error
      const subNode = node[key];
      if (subNode && Object.keys(subNode).length > 0) {
        const subLines = renderTree(subNode, prefix + extend);
        lines.push(...subLines);
      }
    }
    return lines;
  }

  return renderTree(tree);
}

export async function runList(showTasks: boolean = false): Promise<void> {
  const result = await list(showTasks);

  // Note: warnings are already printed by main()

  if (showTasks && result.chainsByMilestone) {
    // Print milestone IDs with dependency chains
    for (const milestoneId of result.milestones) {
      console.log(milestoneId);
      const chains = result.chainsByMilestone.get(milestoneId) || [];
      const rendered = renderDependencyChains(chains);
      for (const line of rendered) {
        console.log(line);
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
