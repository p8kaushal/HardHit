import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const profile = await mkdtemp(join(tmpdir(), 'hardhit-repeat-match-'));
const commonArgs = ['--swing', '--loft', '--square', '--require-six', '--require-four', '--verify-replay'];

function runMatch(index) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/browser-match.mjs', ...commonArgs], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, HARDHIT_BROWSER_PROFILE: profile },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; process.stdout.write(`[match ${index}] ${chunk}`); });
    child.stderr.on('data', chunk => { stderr += chunk; process.stderr.write(`[match ${index}] ${chunk}`); });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`Match ${index} exited ${code}: ${stderr}`));
      const leaderboard = Number(stdout.match(/Persistent leaderboard entries: (\d+)/)?.[1]);
      const history = Number(stdout.match(/Persistent match-history entries: (\d+)/)?.[1]);
      if (!Number.isInteger(leaderboard) || !Number.isInteger(history)) return reject(new Error(`Match ${index} did not report persisted result counts`));
      resolve({ leaderboard, history });
    });
  });
}

try {
  const first = await runMatch(1);
  const second = await runMatch(2);
  if (second.leaderboard !== first.leaderboard + 1 || second.history !== first.history + 1) {
    throw new Error(`Expected second match to add one leaderboard and history entry; counts were ${JSON.stringify(first)} then ${JSON.stringify(second)}`);
  }
  console.log(`Repeated-match persistence passed: leaderboard ${first.leaderboard} → ${second.leaderboard}, history ${first.history} → ${second.history}.`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
