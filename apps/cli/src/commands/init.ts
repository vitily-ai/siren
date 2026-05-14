import * as fs from 'node:fs';
import * as path from 'node:path';
import { defineCommand } from 'citty';
import { surfaceDiagnostics } from '../lifecycle/presentation';
import { finalizeProject, getLoadedContext, loadProject } from '../project';

const SIREN_DIR = 'siren';
const CONFIG_FILE = 'siren.config.yaml';
const MAIN_FILE = 'main.siren';

const CONFIG_CONTENTS = `# project_name: Siren Project
`;

export interface InitResult {
  created: string[];
  skipped: string[];
}

export function init(cwd: string): InitResult {
  const result: InitResult = { created: [], skipped: [] };

  const sirenDir = path.join(cwd, SIREN_DIR);
  const configPath = path.join(sirenDir, CONFIG_FILE);
  const mainPath = path.join(sirenDir, MAIN_FILE);

  if (fs.existsSync(sirenDir)) {
    result.skipped.push(SIREN_DIR);
  } else {
    fs.mkdirSync(sirenDir, { recursive: true });
    result.created.push(SIREN_DIR);
  }

  const configRelPath = path.join(SIREN_DIR, CONFIG_FILE);
  if (fs.existsSync(configPath)) {
    result.skipped.push(configRelPath);
  } else {
    fs.writeFileSync(configPath, CONFIG_CONTENTS, 'utf-8');
    result.created.push(configRelPath);
  }

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

  for (const filePath of result.created) {
    console.log(`Created ${filePath}`);
  }
  for (const filePath of result.skipped) {
    console.log(`Skipped ${filePath} (already exists)`);
  }
}

export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description: 'Initialize a new Siren project in the current directory',
  },
  async run() {
    const cwd = process.cwd();
    const loaded = getLoadedContext();
    if (!loaded || loaded.cwd !== cwd) {
      await loadProject(cwd);
    }

    const ctx = await finalizeProject();
    surfaceDiagnostics(ctx);
    runInit(cwd);
  },
});
