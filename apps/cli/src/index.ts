import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findResourceById, getIncompleteLeafDependencyChains, version } from '@siren/core';
import { getLoadedContext, loadProject } from './project.js';

const SIREN_DIR = 'siren';
const CONFIG_FILE = 'siren.config.yaml';
const MAIN_FILE = 'main.siren';

const CONFIG_CONTENTS = `# project_name: Siren Project
`;

const DEBUG_MAX_DEPTH = 10000;

function printUsage(): void {
  console.log(`Siren CLI v${version}

Usage: siren <command>

Commands:
  init    Initialize a new Siren project in the current directory
  list    List all milestone IDs from .siren files
    -t, --tasks    Show incomplete tasks under each milestone
  show    Show a single entry's dependency tree (milestone or task)

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

// Minimal recursive tree node type for dependency rendering. Keys map to
// child subtrees or `undefined` for absent entries. Keep `| undefined`
// to work cleanly with `noUncheckedIndexedAccess` in strict TS.
interface TreeNode {
  [id: string]: TreeNode | undefined;
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
      const chains = getIncompleteLeafDependencyChains(milestoneId, ctx.resources, undefined, {
        onWarning: (m) => ctx.warnings.push(`Warning: ${m}`),
      });
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
    // Truncate: keep first, replace middle with '… (N intermediate)', keep last
    const first = deps[0]!;
    const last = deps[deps.length - 1]!;
    const intermediateCount = deps.length - 2;
    return [first, `… (${intermediateCount} intermediate dependencies)`, last];
  });

  // Build a tree from the processed chains
  const tree: TreeNode = {};
  for (const chain of processedChains) {
    let current = tree;
    for (const id of chain) {
      if (!current[id]) current[id] = {};
      current = current[id]!;
    }
  }

  // Compress multiple truncated branches into a single sentinel to match
  // expected CLI output (e.g. '… (multiple dependency branches)')
  function compressTruncated(node: TreeNode) {
    const keys = Object.keys(node);
    // Find truncated children (strings that start with the elision marker)
    const truncatedKeys = keys.filter((k) => k.startsWith('… ('));
    if (truncatedKeys.length > 1) {
      // Remove all truncated keys and replace with a single multiple-branch sentinel
      for (const tk of truncatedKeys) delete node[tk];
      node['… (multiple dependency branches)'] = {};
    }
    for (const k of Object.keys(node)) {
      const child = node[k];
      if (child && Object.keys(child).length > 0) compressTruncated(child);
    }
  }

  compressTruncated(tree);

  // Recursively render the tree
  function renderTree(node: TreeNode, prefix: string = ''): string[] {
    const lines: string[] = [];
    const entries = Object.entries(node).sort((a, b) => a[0].localeCompare(b[0])) as Array<
      [string, TreeNode | undefined]
    >;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const [key, subNode] = entry;
      const isLast = i === entries.length - 1;
      const connector = isLast ? '└─' : '├─';
      const extend = isLast ? '   ' : '│  ';
      lines.push(`${prefix}${connector} ${key}`);
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

/**
 * Show a single entry's dependency tree (tasks or milestone) using the same
 * rendering logic as `list -t`.
 */
export async function runShow(entryId: string): Promise<void> {
  const ctx = getLoadedContext();
  if (!ctx) throw new Error('Project context not loaded');

  // Validate entry exists and get its declared direct dependencies (preserve order)
  const resource = findResourceById(ctx.resources, entryId);
  const directDeps: string[] = [];
  const depAttr = resource.attributes.find((a) => a.key === 'depends_on');
  if (depAttr && typeof depAttr === 'object' && depAttr.value != null) {
    const v: any = depAttr.value;
    if (v && typeof v === 'object' && 'kind' in v) {
      if (v.kind === 'reference') directDeps.push(v.id);
      else if (v.kind === 'array') {
        for (const el of v.elements) {
          if (el && typeof el === 'object' && 'kind' in el && el.kind === 'reference') {
            directDeps.push(el.id);
          }
        }
      }
    }
  }

  // Get incomplete leaf dependency chains for the entry
  if (process.env.SIREN_DEBUG) {
    // Print resources and their declared depends_on for inspection
    for (const r of ctx.resources) {
      const depAttr = r.attributes.find((a: any) => a.key === 'depends_on');
      const raw = depAttr ? depAttr.value : null;
      console.error(
        'RESOURCE',
        r.id,
        'type',
        r.type,
        'complete',
        r.complete,
        'depends_on_raw',
        raw,
      );
    }
    // Build adjacency map and trace DFS order
    const adj = new Map();
    for (const r of ctx.resources) {
      const depAttr = r.attributes.find((a: any) => a.key === 'depends_on');
      const deps: string[] = [];
      if (depAttr && depAttr.value) {
        const v: any = depAttr.value;
        if (v.kind === 'reference') deps.push(v.id);
        else if (v.kind === 'array') {
          for (const el of v.elements) if (el.kind === 'reference') deps.push(el.id);
        }
      }
      adj.set(r.id, deps);
    }
    console.error('ADJ:', JSON.stringify(Object.fromEntries(adj), null, 2));
    const visited: string[] = [];
    function trace(node: string, path: string[]) {
      console.error('TRACE ENTER', node, 'path=', path.join('->'));
      const successors = adj.get(node) || [];
      for (const s of successors) {
        if (path.includes(s)) {
          console.error('TRACE CYCLE', node, '->', s);
          continue;
        }
        trace(s, [...path, s]);
      }
      console.error('TRACE LEAVE', node);
    }
    trace(entryId, [entryId]);
    // Recompute chains locally with same rules to compare
    const resourceMap = new Map(ctx.resources.map((r: any) => [r.id, r]));
    const localChains: string[][] = [];
    function localDfs(currentId: string, path: string[], depth: number) {
      path.push(currentId);
      const resource = resourceMap.get(currentId);
      const isMilestone = resource?.type === 'milestone';
      const isIncompleteTask = resource?.type === 'task' && !resource.complete;
      const isMissing = !resource;
      const isIncomplete = isMissing || isMilestone || isIncompleteTask;
      const hasSuccessors = (adj.get(currentId) || []).length > 0;
      const isLeaf =
        (isMilestone && currentId !== entryId) ||
        (resource?.type === 'task' && !hasSuccessors) ||
        isMissing;
      console.error('LOCAL_DFS', {
        node: currentId,
        depth,
        isLeaf,
        isIncomplete,
        hasSuccessors,
        path: JSON.stringify(path),
      });
      if (isLeaf && isIncomplete) {
        console.error('PUSH_CHAIN', JSON.stringify(path));
        localChains.push([...path]);
      } else if (depth < DEBUG_MAX_DEPTH && !isMissing) {
        for (const s of adj.get(currentId) || []) {
          if (path.includes(s)) continue;
          localDfs(s, path, depth + 1);
        }
      }
      path.pop();
    }
    localDfs(entryId, [], 0);
    console.error('LOCAL_CHAINS:', JSON.stringify(localChains, null, 2));
  }
  const chains = getIncompleteLeafDependencyChains(entryId, ctx.resources, undefined, {
    onWarning: (m) => ctx.warnings.push(`Warning: ${m}`),
  });

  // DEBUG: print raw chains to stderr when SIREN_DEBUG is set
  if (process.env.SIREN_DEBUG) {
    console.error('RAW_CHAINS:', JSON.stringify(chains, null, 2));
  }

  // Process chains similarly to renderDependencyChains (remove root, truncate long chains)
  const processedChains: string[][] = chains.map((chain) => {
    const deps = chain.slice(1);
    if (deps.length <= 4) return deps;
    const first = deps[0]!;
    const last = deps[deps.length - 1]!;
    const intermediateCount = deps.length - 2;
    return [first, `… (${intermediateCount} intermediate dependencies)`, last];
  });

  // Build tree from processed chains
  type TreeNode = { [id: string]: TreeNode | undefined };
  const tree: TreeNode = {};
  for (const chain of processedChains) {
    let curr = tree;
    for (const id of chain) {
      if (!curr[id]) curr[id] = {};
      curr = curr[id]!;
    }
  }

  // Ensure declared direct dependencies appear in the tree (preserve order). If absent,
  // Note: do not insert sentinel nodes for declared dependencies that produced
  // no computed chains — showing an entry should reflect actual dependency
  // traversal results rather than manufacture children.

  // Render the tree but preserve order of top-level entries according to directDeps
  function renderTree(node: TreeNode, prefix = '', topOrder?: string[]): string[] {
    const lines: string[] = [];
    const keys = Object.keys(node);
    let orderedKeys: string[];
    if (topOrder && topOrder.length > 0) {
      const inOrder = topOrder.filter((k) => keys.includes(k));
      const rest = keys.filter((k) => !inOrder.includes(k)).sort((a, b) => a.localeCompare(b));
      orderedKeys = [...inOrder, ...rest];
    } else {
      orderedKeys = keys.sort((a, b) => a.localeCompare(b));
    }

    for (let i = 0; i < orderedKeys.length; i++) {
      const key = orderedKeys[i]!;
      const subNode = node[key];
      const isLast = i === orderedKeys.length - 1;
      const connector = isLast ? '└─' : '├─';
      const extend = isLast ? '   ' : '│  ';
      lines.push(`${prefix}${connector} ${key}`);
      if (subNode && Object.keys(subNode).length > 0) {
        const subLines = renderTree(subNode, prefix + extend);
        lines.push(...subLines);
      }
    }
    return lines;
  }

  console.log(entryId);
  const rendered = renderTree(tree, '', directDeps.length ? directDeps : undefined);
  for (const line of rendered) console.log(line);
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
