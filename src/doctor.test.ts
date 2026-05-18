import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runDoctor } from './doctor';

function runClient(
  args: string[],
  env: Record<string, string> = {},
): { stdout: string; stderr: string; exitCode: number | null } {
  const result = Bun.spawnSync({
    cmd: [process.execPath, 'run', 'src/client.ts', ...args],
    cwd: path.join(import.meta.dir, '..'),
    env: { ...process.env, ...env, SPACEMOLT_NO_UPDATE_CHECK: 'true' },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  return {
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
    exitCode: result.exitCode,
  };
}

describe('doctor', () => {
  test('returns all expected check names', async () => {
    const result = await runDoctor();
    const names = result.checks.map((c) => c.name);
    expect(names).toEqual(['api', 'session', 'profile', 'auth', 'version', 'drift']);
  });

  test('version check reports current version', async () => {
    const result = await runDoctor();
    const versionCheck = result.checks.find((c) => c.name === 'version');
    expect(versionCheck).toBeDefined();
    expect(versionCheck?.ok).toBe(true);
    expect(versionCheck?.message).toContain('v');
  });

  test('session path check reports a valid path', async () => {
    const result = await runDoctor();
    const sessionCheck = result.checks.find((c) => c.name === 'session');
    expect(sessionCheck).toBeDefined();
    expect(sessionCheck?.ok).toBe(true);
    expect(sessionCheck?.message).toContain('spacemolt');
  });

  test('profile check reports default when no profile set', async () => {
    const result = await runDoctor();
    const profileCheck = result.checks.find((c) => c.name === 'profile');
    expect(profileCheck).toBeDefined();
    expect(profileCheck?.ok).toBe(true);
    expect(profileCheck?.message).toBe('default');
  });

  test('drift check skipped when no local OpenAPI spec', async () => {
    const specPath = path.join(import.meta.dir, '..', 'spacemolt-docs', 'openapi.json');
    const hasSpec = fs.existsSync(specPath);
    const result = await runDoctor();
    const driftCheck = result.checks.find((c) => c.name === 'drift');
    expect(driftCheck).toBeDefined();
    if (!hasSpec) {
      expect(driftCheck?.message).toContain('skipped');
    }
  });

  test('CLI doctor command runs and produces output', () => {
    const result = runClient(['doctor'], { SPACEMOLT_NO_UPDATE_CHECK: 'true' });
    expect(result.exitCode).not.toBeNull();
    expect(result.stdout).toContain('SpaceMolt Doctor');
  });

  test('CLI doctor --json produces valid JSON', () => {
    const result = runClient(['--json', 'doctor'], { SPACEMOLT_NO_UPDATE_CHECK: 'true' });
    expect(result.exitCode).not.toBeNull();
    const parsed = JSON.parse(result.stdout);
    expect(parsed.structuredContent).toBeDefined();
    expect(parsed.structuredContent.checks).toBeArray();
    expect(parsed.structuredContent.checks.length).toBe(6);
  });

  test('CLI doctor exit code reflects check results', () => {
    const result = runClient(['doctor'], { SPACEMOLT_NO_UPDATE_CHECK: 'true' });
    expect(result.exitCode).not.toBeNull();
    expect(result.exitCode).toBeGreaterThanOrEqual(0);
    expect(result.exitCode).toBeLessThanOrEqual(1);
  });
});
