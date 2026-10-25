import { spawnSync } from 'node:child_process';

const args = ['build', 'src/client.ts', '--compile', '--outfile', 'spacemolt'];
const gitResult = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
  timeout: 1_000,
  windowsHide: true,
});
const commit = gitResult.status !== 0 ? undefined : gitResult.stdout.trim() || undefined;
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
