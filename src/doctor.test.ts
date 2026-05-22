import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliRuntimeContext } from './cli-context';
import { runDoctor } from './doctor';
import { runInvocation } from './main';

function fakeContext(stdout: string[], stderr: string[], env: Record<string, string> = {}): CliRuntimeContext {
  return {
    env: { ...process.env, SPACEMOLT_NO_UPDATE_CHECK: 'true', ...env },
    writer: {
      out(message = '') {
        stdout.push(message);
      },
      err(message = '') {
        stderr.push(message);
      },
      writeOut(chunk) {
        stdout.push(chunk);
      },
    },
    clock: {
      now() {
        return new Date('2026-01-01T00:00:00.000Z');
      },
    },
    sleep() {
      return Promise.resolve();
    },
  };
}

async function runDirect(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runInvocation(args, undefined, fakeContext(stdout, stderr, env));
  return { stdout: stdout.join('\n'), stderr: stderr.join('\n'), exitCode };
}

function tempDir(): string {
  return fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'spacemolt-doctor-test-'));
}

function writeOpenApiCache(configHome: string): void {
  const cacheDir = path.join(configHome, 'spacemolt-cli');
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(
    path.join(cacheDir, 'openapi-cache.json'),
    JSON.stringify({
      fetchedAt: '2026-05-20T00:00:00.000Z',
      routes: {
        'POST /api/v2/spacemolt_shipyard/repair': {
          operationId: 'spacemolt_shipyard_repair',
          summary: 'Repair a ship from cached OpenAPI metadata',
          route: { tool: 'spacemolt_shipyard', action: 'repair', method: 'POST' },
          cli: { category: 'Shipyard' },
          required: ['ship_id'],
          schema: {
            ship_id: { type: 'string', positionalIndex: 0 },
          },
        },
      },
    }),
  );
}

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
    expect(names).toEqual(['api', 'session', 'profile', 'auth', 'version', 'openapi-cache', 'drift']);
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

  test('CLI doctor command runs and produces output', async () => {
    const result = await runDirect(['doctor']);
    expect(result.stdout).toContain('SpaceMolt Doctor');
  });

  test('CLI doctor --json produces valid JSON', async () => {
    const result = await runDirect(['--json', 'doctor']);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.structuredContent).toBeDefined();
    expect(parsed.structuredContent.checks).toBeArray();
    expect(parsed.structuredContent.checks.length).toBe(7);
    expect(parsed.structuredContent.cachedOpenApiRoutes).toBeNumber();
    expect(parsed.structuredContent.dynamicCommands).toBeNumber();
  });

  test('doctor reports cached OpenAPI route and dynamic command counts', async () => {
    const configHome = tempDir();
    try {
      writeOpenApiCache(configHome);

      const result = await runDirect(['--json', 'doctor'], { XDG_CONFIG_HOME: configHome });
      const parsed = JSON.parse(result.stdout);
      const cacheCheck = parsed.structuredContent.checks.find(
        (check: { name: string }) => check.name === 'openapi-cache',
      );

      expect(parsed.structuredContent.cachedOpenApiRoutes).toBe(1);
      expect(parsed.structuredContent.dynamicCommands).toBe(1);
      expect(cacheCheck).toMatchObject({
        ok: true,
        message: '1 cached OpenAPI route',
        detail: '1 dynamic command',
      });
    } finally {
      fs.rmSync(configHome, { recursive: true, force: true });
    }
  });

  test('doctor text output includes cached OpenAPI route and dynamic command counts', async () => {
    const configHome = tempDir();
    try {
      writeOpenApiCache(configHome);

      const result = await runDirect(['doctor'], { XDG_CONFIG_HOME: configHome });

      expect(result.stdout).toContain('openapi-cache');
      expect(result.stdout).toContain('1 cached OpenAPI route');
      expect(result.stdout).toContain('1 dynamic command');
    } finally {
      fs.rmSync(configHome, { recursive: true, force: true });
    }
  });

  test('CLI doctor exit code reflects check results', async () => {
    const result = await runDirect(['doctor']);
    expect(result.exitCode).toBeGreaterThanOrEqual(0);
    expect(result.exitCode).toBeLessThanOrEqual(1);
  });

  test('doctor subprocess smoke exercises real process exit behavior', () => {
    const result = runClient(['doctor'], { SPACEMOLT_NO_UPDATE_CHECK: 'true' });
    expect(result.exitCode).not.toBeNull();
    expect(result.stdout).toContain('SpaceMolt Doctor');
  });
});
