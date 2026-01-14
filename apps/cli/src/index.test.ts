import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { init } from './index.js';

describe('siren init', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siren-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates all files on fresh init', () => {
    const result = init(tempDir);

    expect(result.created).toEqual(['siren', 'siren/siren.config.yaml', 'siren/main.siren']);
    expect(result.skipped).toEqual([]);

    // Verify files exist with correct contents
    const sirenDir = path.join(tempDir, 'siren');
    expect(fs.existsSync(sirenDir)).toBe(true);
    expect(fs.statSync(sirenDir).isDirectory()).toBe(true);

    const configPath = path.join(sirenDir, 'siren.config.yaml');
    expect(fs.existsSync(configPath)).toBe(true);
    expect(fs.readFileSync(configPath, 'utf-8')).toBe('# project_name: Siren Project\n');

    const mainPath = path.join(sirenDir, 'main.siren');
    expect(fs.existsSync(mainPath)).toBe(true);
    expect(fs.readFileSync(mainPath, 'utf-8')).toBe('');
  });

  it('skips existing directory but creates missing files', () => {
    // Pre-create the siren directory
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);

    const result = init(tempDir);

    expect(result.created).toEqual(['siren/siren.config.yaml', 'siren/main.siren']);
    expect(result.skipped).toEqual(['siren']);

    // Verify files were created
    expect(fs.existsSync(path.join(sirenDir, 'siren.config.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(sirenDir, 'main.siren'))).toBe(true);
  });

  it('skips existing config but creates missing main file', () => {
    // Pre-create siren directory and config
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'siren.config.yaml'), '# custom config\n');

    const result = init(tempDir);

    expect(result.created).toEqual(['siren/main.siren']);
    expect(result.skipped).toEqual(['siren', 'siren/siren.config.yaml']);

    // Verify original config is preserved
    expect(fs.readFileSync(path.join(sirenDir, 'siren.config.yaml'), 'utf-8')).toBe(
      '# custom config\n',
    );
  });

  it('skips everything when all files already exist', () => {
    // Pre-create everything
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'siren.config.yaml'), '# existing\n');
    fs.writeFileSync(path.join(sirenDir, 'main.siren'), 'milestone "existing" {}');

    const result = init(tempDir);

    expect(result.created).toEqual([]);
    expect(result.skipped).toEqual(['siren', 'siren/siren.config.yaml', 'siren/main.siren']);

    // Verify original contents are preserved
    expect(fs.readFileSync(path.join(sirenDir, 'siren.config.yaml'), 'utf-8')).toBe('# existing\n');
    expect(fs.readFileSync(path.join(sirenDir, 'main.siren'), 'utf-8')).toBe(
      'milestone "existing" {}',
    );
  });

  it('skips main.siren but creates config when only main exists', () => {
    // Pre-create siren directory and main file only
    const sirenDir = path.join(tempDir, 'siren');
    fs.mkdirSync(sirenDir);
    fs.writeFileSync(path.join(sirenDir, 'main.siren'), '');

    const result = init(tempDir);

    expect(result.created).toEqual(['siren/siren.config.yaml']);
    expect(result.skipped).toEqual(['siren', 'siren/main.siren']);
  });
});
