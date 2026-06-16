import { spawnSync } from 'node:child_process';

function readGitCommit(): string | undefined {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 1_000,
    windowsHide: true,
  });
  if (result.status !== 0) return undefined;

  const commit = result.stdout.trim();
  return commit || undefined;
}

const args = ['build', 'src/client.ts', '--compile', '--outfile', 'spacemolt'];
const commit = readGitCommit();
if (commit) {
  args.push('--define', `process.env.SPACEMOLT_BUILD_COMMIT=${JSON.stringify(commit)}`);
}

const result = spawnSync(process.execPath, args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
});

process.exit(result.status ?? 1);
