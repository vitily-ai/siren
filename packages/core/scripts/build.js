#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function die(message) {
  console.error(message);
  process.exit(1);
}

const result = spawnSync('tsc', ['-b'], { stdio: 'inherit' });

if (result.error) {
  if (result.error.code === 'ENOENT') {
    die(
      'Do not run `yarn workspace @siren/core build` directly. Run `yarn build` from the repository root instead; the top-level build ensures workspace tooling and ordering are set up.',
    );
  }
  die(`Failed to run tsc: ${result.error.message}`);
}

process.exit(result.status ?? 0);
