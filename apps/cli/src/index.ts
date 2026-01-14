import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, version } from '@siren/core';
import { getParser } from './parser.js';

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

/**
 * Recursively find all .siren files in a directory
 */
function findSirenFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findSirenFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.siren')) {
      results.push(fullPath);
    }
  }

  return results;
}

export interface ListResult {
  milestones: string[];
  warnings: string[];
}

/**
 * List all milestone IDs from .siren files in the siren/ directory
 */
export async function list(cwd: string): Promise<ListResult> {
  const result: ListResult = { milestones: [], warnings: [] };
  const sirenDir = path.join(cwd, SIREN_DIR);

  const files = findSirenFiles(sirenDir);
  if (files.length === 0) {
    return result;
  }

  const parser = await getParser();

  for (const filePath of files) {
    const source = fs.readFileSync(filePath, 'utf-8');
    const parseResult = await parser.parse(source);

    if (!parseResult.success || !parseResult.tree) {
      // Compute relative path for warning message
      const relPath = path.relative(cwd, filePath);
      result.warnings.push(`Warning: skipping ${relPath} (parse error)`);
      continue;
    }

    const decodeResult = decode(parseResult.tree);
    if (!decodeResult.document) {
      continue;
    }

    for (const resource of decodeResult.document.resources) {
      if (resource.type === 'milestone') {
        result.milestones.push(resource.id);
      }
    }
  }

  return result;
}

export async function runList(cwd: string): Promise<void> {
  const result = await list(cwd);

  // Print warnings to stderr
  for (const warning of result.warnings) {
    console.error(warning);
  }

  // Print milestone IDs to stdout
  for (const id of result.milestones) {
    console.log(id);
  }
}

export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  const command = args[0];

  if (command === '--version') {
    console.log(`Siren CLI v${version}`);
    return;
  }

  if (command === 'init') {
    runInit(process.cwd());
    return;
  }

  if (command === 'list') {
    await runList(process.cwd());
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
