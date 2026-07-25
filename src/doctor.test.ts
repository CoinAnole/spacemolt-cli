import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliRuntimeContext } from './cli-context';
import { runDoctor } from './doctor';
import { runInvocation } from './main';
import { createDefaultConfig } from './runtime';
import { setActiveProfile } from './session';

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

function defaultConfigWithoutEnvProfile() {
  return createDefaultConfig({}, { ...process.env, SPACEMOLT_PROFILE: undefined });
}

function writeOpenApiCache(
  configHome: string,
  routes: Record<string, unknown> = {
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
  gameserverVersion = 'v999.0.0',
): void {
  const cacheDir = path.join(configHome, 'spacemolt-cli');
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(
    path.join(cacheDir, 'openapi-cache.json'),
    JSON.stringify({
      fetchedAt: '2026-05-20T00:00:00.000Z',
      gameserverVersion,
      routes,
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
    expect(names).toEqual([
      'api',
      'session',
      'profile',
      'auth',
      'version',
      'fuzzy-ids',
      'openapi-cache',
      'drift',
    ]);
  });

  test('version check reports current version', async () => {
    const result = await runDoctor();
    const versionCheck = result.checks.find((c) => c.name === 'version');
    expect(versionCheck).toBeDefined();
    expect(versionCheck?.ok).toBe(true);
    expect(versionCheck?.message).toContain('v');
  });

  test('fuzzy-ids check reports default exact-only preference', async () => {
    const configHome = tempDir();
    try {
      const result = await runDoctor(defaultConfigWithoutEnvProfile(), {
        ...process.env,
        XDG_CONFIG_HOME: configHome,
        SPACEMOLT_FUZZY_IDS: undefined,
      });
      const check = result.checks.find((c) => c.name === 'fuzzy-ids');
      expect(check).toBeDefined();
      expect(check?.ok).toBe(true);
      expect(check?.message).toBe('exact only (default)');
      expect(check?.detail).toContain('CLI --fuzzy-ids');
    } finally {
      fs.rmSync(configHome, { recursive: true, force: true });
    }
  });

  test('fuzzy-ids check reports config, env, and cli sources', async () => {
    const configHome = tempDir();
    try {
      const configDir = path.join(configHome, 'spacemolt-cli');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, 'config.json'), `${JSON.stringify({ fuzzyIds: true })}\n`);

      const fromConfig = await runDoctor(defaultConfigWithoutEnvProfile(), {
        ...process.env,
        XDG_CONFIG_HOME: configHome,
        SPACEMOLT_FUZZY_IDS: undefined,
      });
      expect(fromConfig.checks.find((c) => c.name === 'fuzzy-ids')?.message).toBe('soft match on (config)');

      const fromEnv = await runDoctor(defaultConfigWithoutEnvProfile(), {
        ...process.env,
        XDG_CONFIG_HOME: configHome,
        SPACEMOLT_FUZZY_IDS: '0',
      });
      expect(fromEnv.checks.find((c) => c.name === 'fuzzy-ids')?.message).toBe('exact only (env)');

      const fromCli = await runDoctor(
        defaultConfigWithoutEnvProfile(),
        {
          ...process.env,
          XDG_CONFIG_HOME: configHome,
          SPACEMOLT_FUZZY_IDS: '0',
        },
        { fuzzyIds: true, fuzzyIdsCliExplicit: true },
      );
      expect(fromCli.checks.find((c) => c.name === 'fuzzy-ids')?.message).toBe('soft match on (cli)');

      const cliOff = await runDoctor(
        defaultConfigWithoutEnvProfile(),
        {
          ...process.env,
          XDG_CONFIG_HOME: configHome,
          SPACEMOLT_FUZZY_IDS: '1',
        },
        { fuzzyIds: false, fuzzyIdsCliExplicit: true },
      );
      expect(cliOff.checks.find((c) => c.name === 'fuzzy-ids')?.message).toBe('exact only (cli)');
    } finally {
      fs.rmSync(configHome, { recursive: true, force: true });
    }
  });

  test('CLI --fuzzy-ids doctor reports soft match from cli source', async () => {
    const configHome = tempDir();
    try {
      const result = await runDirect(['--fuzzy-ids', 'doctor'], {
        XDG_CONFIG_HOME: configHome,
        SPACEMOLT_FUZZY_IDS: '0',
      });
      expect(result.stdout).toContain('fuzzy-ids');
      expect(result.stdout).toContain('soft match on (cli)');
    } finally {
      fs.rmSync(configHome, { recursive: true, force: true });
    }
  });

  test('session path check tolerates no default profile', async () => {
    const configHome = tempDir();
    let result: Awaited<ReturnType<typeof runDoctor>>;
    try {
      result = await runDoctor(defaultConfigWithoutEnvProfile(), { ...process.env, XDG_CONFIG_HOME: configHome });
    } finally {
      fs.rmSync(configHome, { recursive: true, force: true });
    }
    const sessionCheck = result.checks.find((c) => c.name === 'session');
    expect(sessionCheck).toBeDefined();
    expect(sessionCheck?.ok).toBe(true);
    expect(sessionCheck?.message).toBe('not initialized');
    expect(sessionCheck?.detail).toContain('No default profile set.');
  });

  test('profile check reports no default profile when none is configured', async () => {
    const configHome = tempDir();
    let result: Awaited<ReturnType<typeof runDoctor>>;
    try {
      result = await runDoctor(defaultConfigWithoutEnvProfile(), { ...process.env, XDG_CONFIG_HOME: configHome });
    } finally {
      fs.rmSync(configHome, { recursive: true, force: true });
    }
    const profileCheck = result.checks.find((c) => c.name === 'profile');
    expect(profileCheck).toBeDefined();
    expect(profileCheck?.ok).toBe(true);
    expect(profileCheck?.message).toBe('No default profile set.');
  });

  test('profile check reports active profile before saved default profile', async () => {
    const configHome = tempDir();
    try {
      fs.mkdirSync(path.join(configHome, 'spacemolt-cli'), { recursive: true });
      fs.writeFileSync(path.join(configHome, 'spacemolt-cli', 'config.json'), '{"defaultProfile":"saved"}\n');

      const result = await runDoctor(createDefaultConfig({ profile: 'active' }), {
        ...process.env,
        XDG_CONFIG_HOME: configHome,
      });
      const profileCheck = result.checks.find((c) => c.name === 'profile');

      expect(profileCheck?.message).toBe('Active profile: active');
    } finally {
      fs.rmSync(configHome, { recursive: true, force: true });
    }
  });

  test('profile check reports saved default profile when no active profile is selected', async () => {
    const configHome = tempDir();
    try {
      fs.mkdirSync(path.join(configHome, 'spacemolt-cli'), { recursive: true });
      fs.writeFileSync(path.join(configHome, 'spacemolt-cli', 'config.json'), '{"defaultProfile":"saved"}\n');

      const result = await runDoctor(defaultConfigWithoutEnvProfile(), { ...process.env, XDG_CONFIG_HOME: configHome });
      const profileCheck = result.checks.find((c) => c.name === 'profile');

      expect(profileCheck?.message).toBe('Default profile: saved');
    } finally {
      fs.rmSync(configHome, { recursive: true, force: true });
    }
  });

  test('explicit config without profile does not read active profile fallback', async () => {
    const configHome = tempDir();
    try {
      setActiveProfile('leaked');
      const result = await runDoctor(defaultConfigWithoutEnvProfile(), { ...process.env, XDG_CONFIG_HOME: configHome });
      const profileCheck = result.checks.find((c) => c.name === 'profile');

      expect(profileCheck?.message).toBe('No default profile set.');
    } finally {
      setActiveProfile(undefined);
      fs.rmSync(configHome, { recursive: true, force: true });
    }
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

  test('CLI doctor --plain renders without ANSI', async () => {
    const result = await runDirect(['--plain', 'doctor']);
    expect(result.stdout).toContain('SpaceMolt Doctor');
    expect(result.stdout).not.toContain('\x1b[');
  });

  test('CLI doctor --json produces valid JSON', async () => {
    const result = await runDirect(['--json', 'doctor']);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.structuredContent).toBeDefined();
    expect(parsed.structuredContent.checks).toBeArray();
    expect(parsed.structuredContent.checks.length).toBe(8);
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
        detail: '1 cache-provided dynamic command',
      });
    } finally {
      fs.rmSync(configHome, { recursive: true, force: true });
    }
  });

  test('doctor counts grouped cached dynamic routes', async () => {
    const configHome = tempDir();
    try {
      writeOpenApiCache(configHome, {
        'POST /api/v2/spacemolt_faction/new_action': {
          operationId: 'spacemolt_faction_new_action',
          summary: 'Grouped faction action from cached OpenAPI metadata',
          route: { tool: 'spacemolt_faction', action: 'new_action', method: 'POST' },
          cli: { category: 'Factions' },
          required: ['target_id'],
          schema: {
            target_id: { type: 'string', positionalIndex: 0 },
          },
        },
      });

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
        detail: '1 cache-provided dynamic command',
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
      expect(result.stdout).toContain('1 cache-provided dynamic command');
    } finally {
      fs.rmSync(configHome, { recursive: true, force: true });
    }
  });

  test('doctor reports stale cached routes without counting them as cache-provided commands', async () => {
    const configHome = tempDir();
    try {
      writeOpenApiCache(
        configHome,
        {
          'POST /api/v2/spacemolt_ship/claim_commission': {
            summary: 'Removed cached route',
            route: { tool: 'spacemolt_ship', action: 'claim_commission', method: 'POST' },
          },
        },
        'v0.366.0',
      );

      const result = await runDirect(['--json', 'doctor'], { XDG_CONFIG_HOME: configHome });
      const parsed = JSON.parse(result.stdout);
      const cacheCheck = parsed.structuredContent.checks.find(
        (check: { name: string }) => check.name === 'openapi-cache',
      );

      expect(parsed.structuredContent.cachedOpenApiRoutes).toBe(1);
      expect(parsed.structuredContent.dynamicCommands).toBe(0);
      expect(cacheCheck).toMatchObject({
        ok: true,
        message: '1 cached OpenAPI route',
        detail: '0 cache-provided dynamic commands',
      });
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
    const result = runClient(['doctor'], {
      SPACEMOLT_NO_UPDATE_CHECK: 'true',
      SPACEMOLT_URL: 'http://127.0.0.1:9/api/v2',
    });
    expect(result.exitCode).not.toBeNull();
    expect(result.stdout).toContain('SpaceMolt Doctor');
  });
});
