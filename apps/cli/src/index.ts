import * as fs from 'node:fs';
import * as path from 'node:path';
import { version } from '@siren/core';

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

export function main(args: string[] = process.argv.slice(2)): void {
  const command = args[0];

  if (command === '--version') {
    console.log(`Siren CLI v${version}`);
    return;
  }

  if (command === 'init') {
    runInit(process.cwd());
    return;
  }

  printUsage();
}

import { realpathSync } from 'node:fs';
// Only run when executed directly, not when imported for testing.
// In ESM, we compare import.meta.url to the resolved real path of argv[1]
// to handle symlinks (e.g., npm global bin links).
import { fileURLToPath } from 'node:url';

function isMain(): boolean {
  if (typeof process === 'undefined' || !process.argv[1]) {
    return false;
  }
  try {
    const scriptPath = realpathSync(process.argv[1]);
    const modulePath = fileURLToPath(import.meta.url);
    return scriptPath === modulePath;
  } catch {
    return false;
  }
}

if (isMain()) {
  main();
}
