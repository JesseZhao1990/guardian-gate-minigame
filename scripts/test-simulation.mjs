import { execFileSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryDirectory = resolve(root, '.tmp', 'simulation-smoke');
const output = resolve(temporaryDirectory, 'simulation-smoke.mjs');

await rm(temporaryDirectory, { recursive: true, force: true });
await mkdir(temporaryDirectory, { recursive: true });
await build({
  entryPoints: [resolve(root, 'scripts/simulation-smoke.ts')],
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: ['node20'],
  sourcemap: false,
});

execFileSync(process.execPath, [output], { stdio: 'inherit' });
await rm(temporaryDirectory, { recursive: true, force: true });
