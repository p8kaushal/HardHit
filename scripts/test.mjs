import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = await mkdtemp(join(tmpdir(), 'hardhit-test-'));
try {
  const outfile = join(dir, 'game.test.cjs');
  await build({ entryPoints: ['tests/game.test.ts'], bundle: true, platform: 'node', format: 'cjs', outfile });
  const result = spawnSync(process.execPath, ['--test', outfile, 'tests/pose-reference.test.mjs'], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(dir, { recursive: true, force: true });
}
