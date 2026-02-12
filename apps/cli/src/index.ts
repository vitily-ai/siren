import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type DependencyTree, version } from '@siren/core';
import { runFormat } from './commands/format.js';
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
  show    Show a single entry's dependency tree (milestone or task)
  format  Format .siren files in-place or print formatted output
    --dry-run    Print formatted output to stdout without writing files
    --verbose    Print list of files that would be updated or were updated

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
  warnings: string[];
}

/**
 * Check if a dependency tree contains a cycle anywhere in its subtree
 */
function hasCycleInTree(tree: DependencyTree): boolean {
  if (tree.cycle) return true;
  for (const dep of tree.dependencies) {
    if (hasCycleInTree(dep)) return true;
  }
  return false;
}

/**
 * Render a dependency tree as an array of indented lines using Unicode box-drawing characters.
 * Handles cycles, missing dependencies, and deep trees with truncation.
 *
 * @param tree - The dependency tree to render
 * @param prefix - Current indentation prefix (for recursion)
 * @param isLast - Whether this node is the last child of its parent
 * @param depth - Current depth (for truncation)
 * @param maxDepth - Maximum depth before truncating intermediate dependencies
 * @returns Array of formatted tree lines
 */
function renderDependencyTree(
  tree: DependencyTree,
  prefix: string = '',
  _isLast: boolean = true,
  depth: number = 0,
  maxDepth: number = 2,
): string[] {
  const lines: string[] = [];

  // Filter out complete tasks from dependencies
  const deps = tree.dependencies.filter((d) => !d.resource.complete);

  // If no dependencies (after filtering), return empty (leaf node)
  if (deps.length === 0) {
    return lines;
  }

  // Check if we need to truncate due to depth
  if (depth >= maxDepth - 1 && deps.length > 0) {
    // Check if any dependencies have their own dependencies (i.e., would we go deeper?)
    const hasGrandchildren = deps.some(
      (d) => d.dependencies.filter((dd) => !dd.resource.complete).length > 0,
    );
    if (hasGrandchildren) {
      // Count all dependencies in the subtree (excluding complete ones)
      const countAllDeps = (node: DependencyTree): number => {
        const childDeps = node.dependencies.filter((d) => !d.resource.complete);
        if (childDeps.length === 0) {
          return 0;
        }
        let count = childDeps.length; // Count immediate children
        for (const child of childDeps) {
          count += countAllDeps(child); // Recursively count their descendants
        }
        return count;
      };

      // For multiple dependencies, check if we should show "multiple dependency branches"
      // or expand each branch individually
      if (deps.length > 1) {
        // Check if any dep has descendants (would create branches)
        const hasDescendants = deps.some((d) => countAllDeps(d) > 0);

        if (hasDescendants) {
          // Show "… (multiple dependency branches)" instead of expanding
          const connector = '└─';
          lines.push(`${prefix}${connector} … (multiple dependency branches)`);
          return lines;
        }

        // Otherwise, all deps are leaves - show them normally
        for (let i = 0; i < deps.length; i++) {
          const dep = deps[i];
          if (!dep) continue;
          const isLastDep = i === deps.length - 1;
          const connector = isLastDep ? '└─' : '├─';
          lines.push(`${prefix}${connector} ${dep.resource.id}`);
        }
        return lines;
      }

      // For a single dependency, handle truncation
      const firstDep = deps[0];
      if (!firstDep) return lines;

      // Count all deps starting from current level (deps itself + all descendants)
      const totalDeps = 1 + countAllDeps(firstDep); // +1 for firstDep itself

      // All deps except the deepest leaf are intermediate
      const intermediateCount = totalDeps - 1;

      const connector = '└─';
      const childPrefix = `${prefix}   `;

      if (intermediateCount > 0) {
        lines.push(
          `${prefix}${connector} … (${intermediateCount} intermediate ${intermediateCount === 1 ? 'dependency' : 'dependencies'})`,
        );

        // Find the deepest leaf to show
        let current: DependencyTree | undefined = firstDep;
        while (current && current.dependencies.filter((d) => !d.resource.complete).length > 0) {
          current = current.dependencies.filter((d) => !d.resource.complete)[0];
        }
        if (current && current !== firstDep) {
          lines.push(`${childPrefix}└─ ${current.resource.id}`);
        }
      } else {
        // Only one dependency total, just show it
        lines.push(`${prefix}${connector} ${firstDep.resource.id}`);
      }
      return lines;
    }
  }

  // Render all dependencies
  for (let i = 0; i < deps.length; i++) {
    // TODO type system forces handling undefined `dep` - can we get better guarantees here?
    const dep = deps[i]!;
    const isLastDep = i === deps.length - 1;
    const connector = isLastDep ? '└─' : '├─';

    lines.push(`${prefix}${connector} ${dep.resource.id}`);

    // Check if this dependency's subtree contains a cycle
    // If so, show ellipsis instead of recursing
    if (hasCycleInTree(dep)) {
      const childPrefix = prefix + (isLastDep ? '   ' : '│  ');
      lines.push(`${childPrefix}└─ … (dependency loop - check warnings)`);
      continue;
    }

    // Recursively render child dependencies
    const childPrefix = prefix + (isLastDep ? '   ' : '│  ');
    const childLines = renderDependencyTree(dep, childPrefix, isLastDep, depth + 1, maxDepth);
    lines.push(...childLines);
  }

  return lines;
}

/**
 * List all milestone IDs from .siren files in the siren/ directory
 */
export async function list(_showTasks: boolean = false): Promise<ListResult> {
  const ctx = getLoadedContext();
  if (!ctx) {
    throw new Error('Project context not loaded');
  }
  const result: ListResult = { milestones: ctx.milestones, warnings: ctx.warnings };
  return result;
}

export async function runList(showTasks: boolean = false): Promise<void> {
  const result = await list(showTasks);
  const ctx = getLoadedContext();

  // Note: warnings are already printed by main()

  if (showTasks && ctx?.ir) {
    // Print each milestone with its dependency tree
    for (const milestoneId of result.milestones) {
      console.log(milestoneId);
      const tree = ctx.ir.getDependencyTree(milestoneId);
      const lines = renderDependencyTree(tree);
      for (const line of lines) {
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

/**
 * Show a single entry's dependency tree (tasks or milestone) using the same
 * rendering logic as `list -t`.
 */
export async function runShow(entryId: string): Promise<void> {
  const ctx = getLoadedContext();
  if (!ctx) throw new Error('Project context not loaded');
  if (!ctx.ir) throw new Error('IR context not available');

  // Get the dependency tree for this entry
  const tree = ctx.ir.getDependencyTree(entryId);

  // Print the entry ID
  console.log(entryId);

  // Render and print the dependency tree
  const lines = renderDependencyTree(tree);
  for (const line of lines) {
    console.log(line);
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

  if (command === 'show') {
    const entryId = args[1];
    if (!entryId) {
      // TODO error looks juvenile
      console.error('missing entry id — usage: siren show <entry-id>');
      return;
    }
    try {
      await runShow(entryId);
    } catch (e) {
      console.error((e as Error).message);
    }
    return;
  }

  if (command === 'format') {
    const dryRun = args.includes('--dry-run');
    const verbose = args.includes('--verbose');
    try {
      await runFormat({ dryRun, verbose });
    } catch (e) {
      console.error((e as Error).message);
    }
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
