import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { SpaceMoltClient } from './api';
import { SpaceMoltClient as RealSpaceMoltClient } from './api';
import type { CliEnv, CliRuntimeContext } from './cli-context';
import { cargoFixture } from './display/formatter-fixtures';
import { runInvocation } from './main';
import { COMPACT, DEBUG, FORMAT, JSON_OUTPUT, PLAIN, setOutputMode } from './runtime';
import { ACTIVE_PROFILE, SessionManager, setActiveProfile, setDefaultProfile } from './session';

async function captureInvocation(
  argv: string[],
  env: CliEnv = process.env,
  dependencies: Parameters<typeof runInvocation>[3] = {},
): Promise<{ exitCode: number; stdout: string; stderr: string; config?: SpaceMoltClient['config'] }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const context = fakeContext(stdout, stderr, env);
  let config: SpaceMoltClient['config'] | undefined;
  const exitCode = await runInvocation(argv, undefined, context, {
    ...dependencies,
    createClient(clientConfig) {
      config = clientConfig;
      return (
        dependencies.createClient?.(clientConfig) ??
        ({
          config: clientConfig,
          async execute() {
            return { structuredContent: { ok: true } };
          },
        } as unknown as SpaceMoltClient)
      );
    },
  });
  return {
    exitCode,
    stdout: stdout.join('\n'),
    stderr: stderr.join('\n'),
    config,
  };
}

function fakeContext(stdout: string[], stderr: string[], env: CliEnv = process.env): CliRuntimeContext {
  return {
    env,
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

async function withConfigHome<T>(configHome: string, fn: () => Promise<T>): Promise<T> {
  const originalConfigHome = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = configHome;
  try {
    return await fn();
  } finally {
    if (originalConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalConfigHome;
  }
}

afterEach(() => {
  setOutputMode({
    json: process.env.SPACEMOLT_OUTPUT === 'json',
    format: 'table',
    plain: false,
    compact: false,
    quiet: false,
  });
  setActiveProfile(undefined);
});

describe('runInvocation option isolation', () => {
  test('loads cached OpenAPI routes when resolving dynamic commands', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-openapi-cache-'));
    const configHome = path.join(tempDir, 'config');
    const cacheDir = path.join(configHome, 'spacemolt-cli');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, 'openapi-cache.json'),
      `${JSON.stringify({
        fetchedAt: '2026-05-20T00:00:00.000Z',
        gameserverVersion: 'v0.324.1',
        routes: {
          'POST /api/v2/runner_dynamic/invoke': {
            operationId: 'runnerDynamicInvoke',
            summary: 'Invoke runner dynamic command',
            route: {
              tool: 'runner_dynamic',
              action: 'invoke',
              method: 'POST',
            },
            required: ['target_id'],
            schema: {
              target_id: {
                type: 'string',
                positionalIndex: 0,
              },
            },
            cli: {
              command: 'runner_cached_dynamic',
            },
          },
        },
      })}\n`,
    );
    const calls: Array<{ command: string; route: unknown; payload: Record<string, unknown> }> = [];
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig(command: string, config: { route: unknown }, payload: Record<string, unknown>) {
        calls.push({ command, route: config.route, payload });
        return { structuredContent: { ok: true } };
      },
    } as unknown as SpaceMoltClient;
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runInvocation(
      ['--json', 'runner_cached_dynamic', 'ship_123'],
      client,
      fakeContext(stdout, stderr, {
        XDG_CONFIG_HOME: configHome,
        SPACEMOLT_PROFILE: 'pilot',
      }),
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(calls).toEqual([
      {
        command: 'runner_cached_dynamic',
        route: {
          tool: 'runner_dynamic',
          action: 'invoke',
          method: 'POST',
        },
        payload: { target_id: 'ship_123' },
      },
    ]);
  });

  test('facility_upgrade flag syntax prints structured API errors', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const calls: Array<{ command: string; payload: Record<string, unknown> }> = [];
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig(command: string, _config: unknown, payload: Record<string, unknown>) {
        calls.push({ command, payload });
        return {
          error: {
            code: 'missing_materials',
            message: 'need 300 x optical_fiber_bundle, have 0 in faction storage + 0 in cargo',
          },
        };
      },
    } as unknown as SpaceMoltClient;

    const exitCode = await runInvocation(
      ['facility_upgrade', '--facility-id', '3f67', '--facility-type', 'intel_center', '--structured'],
      client,
      fakeContext(stdout, stderr, { SPACEMOLT_PROFILE: 'pilot' }),
    );

    expect(exitCode).toBe(1);
    expect(stderr).toEqual([]);
    expect(calls).toEqual([
      {
        command: 'facility_upgrade',
        payload: { facility_id: '3f67', facility_type: 'intel_center' },
      },
    ]);
    expect(JSON.parse(stdout.join('\n'))).toEqual({
      error: {
        code: 'missing_materials',
        message: 'need 300 x optical_fiber_bundle, have 0 in faction storage + 0 in cargo',
      },
    });
  });

  test('buy accepts delivery alias for the market delivery target', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const calls: Array<{ command: string; payload: Record<string, unknown> }> = [];
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig(command: string, _config: unknown, payload: Record<string, unknown>) {
        calls.push({ command, payload });
        return { structuredContent: { ok: true } };
      },
    } as unknown as SpaceMoltClient;

    const exitCode = await runInvocation(
      ['--structured', 'buy', 'item_id=iron_ore', 'quantity=76270', 'delivery=cargo'],
      client,
      fakeContext(stdout, stderr, { SPACEMOLT_PROFILE: 'pilot' }),
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(calls).toEqual([
      {
        command: 'buy',
        payload: { id: 'iron_ore', quantity: 76270, deliver_to: 'cargo' },
      },
    ]);
  });

  test('public get_empire_info renders without a configured profile', async () => {
    const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-public-render-'));
    const stdout: string[] = [];
    const stderr: string[] = [];
    const calls: Array<{ command: string; payload: Record<string, unknown> }> = [];
    const client = {
      config: {
        apiBase: 'https://game.test/api/v2',
        jsonOutput: false,
        debug: false,
        plain: false,
        quiet: false,
        format: 'table',
        compact: false,
      },
      async executeCommandConfig(command: string, _config: unknown, payload: Record<string, unknown>) {
        calls.push({ command, payload });
        return { structuredContent: { empires: [{ id: 'solarian', sales_tax_bps: 500 }] } };
      },
    } as unknown as SpaceMoltClient;

    const exitCode = await runInvocation(
      ['--structured', 'get_empire_info', 'solarian'],
      client,
      fakeContext(stdout, stderr, { XDG_CONFIG_HOME: configHome }),
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(calls).toEqual([{ command: 'get_empire_info', payload: { id: 'solarian' } }]);
    expect(JSON.parse(stdout.join('\n'))).toEqual({ empires: [{ id: 'solarian', sales_tax_bps: 500 }] });
  });

  test('switch_ship resolves cached ship class names and prints API errors', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-ship-cache-'));
    const configHome = path.join(tempDir, 'config');
    const stdout: string[] = [];
    const stderr: string[] = [];
    const calls: Array<{ command: string; payload: Record<string, unknown> }> = [];
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig(command: string, _config: unknown, payload: Record<string, unknown>) {
        calls.push({ command, payload });
        if (command === 'list_ships') {
          return {
            structuredContent: {
              ships: [
                {
                  ship_id: '0ceb2c65cc4bf79727a8f0baec04dab0',
                  class_id: 'dust_devil',
                  class_name: 'Dust Devil',
                  is_active: false,
                },
              ],
              count: 1,
            },
          };
        }
        return {
          error: {
            code: 'ship_switch_failed',
            message: 'cargo must be unloaded before switching ships',
          },
        };
      },
    } as unknown as SpaceMoltClient;

    try {
      const env = { XDG_CONFIG_HOME: configHome, SPACEMOLT_PROFILE: 'pilot' };
      const listExitCode = await runInvocation(['--quiet', 'list_ships'], client, fakeContext(stdout, stderr, env));
      const switchExitCode = await runInvocation(
        ['--plain', 'switch_ship', 'dust_devil'],
        client,
        fakeContext(stdout, stderr, env),
      );

      expect(listExitCode).toBe(0);
      expect(switchExitCode).toBe(1);
      expect(calls).toEqual([
        { command: 'list_ships', payload: {} },
        { command: 'switch_ship', payload: { id: '0ceb2c65cc4bf79727a8f0baec04dab0' } },
      ]);
      expect(stderr.join('\n')).toContain('cargo must be unloaded before switching ships');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('repeated direct invocations do not leak --json', async () => {
    const jsonResult = await captureInvocation(['--json', 'trvel']);
    expect(jsonResult.exitCode).toBe(1);
    expect(jsonResult.stdout).toContain('"unknown_command"');
    expect(jsonResult.stderr).toBe('');
    expect(jsonResult.config).toMatchObject({ jsonOutput: true, format: 'table' });

    const textResult = await captureInvocation(['trvel']);
    expect(textResult.exitCode).toBe(1);
    expect(textResult.stderr).toContain('Unknown command "trvel"');
    expect(textResult.stdout).not.toContain('"unknown_command"');
    expect(textResult.config).toMatchObject({ jsonOutput: process.env.SPACEMOLT_OUTPUT === 'json', format: 'table' });
  });

  test('repeated direct invocations do not leak --plain or --compact', async () => {
    const plainResult = await captureInvocation(['--plain', '--compact', '--json', 'trvel']);
    expect(plainResult.config).toMatchObject({ plain: true, compact: true });

    const defaultResult = await captureInvocation(['trvel']);
    expect(defaultResult.config).toMatchObject({ plain: false, compact: false });
  });

  test('repeated direct invocations do not leak --debug', async () => {
    const debugResult = await captureInvocation(['--debug', '--help']);
    expect(debugResult.config).toMatchObject({ debug: true });

    const defaultResult = await captureInvocation(['--help']);
    expect(defaultResult.config).toMatchObject({ debug: process.env.DEBUG === 'true' });
  });

  test('successful global parsing temporarily seeds legacy output globals', async () => {
    const result = await captureInvocation(['--plain', '--compact', '--debug', '--format', 'json', 'trvel']);

    expect(result.exitCode).toBe(1);
    expect(JSON_OUTPUT).toBe(true);
    expect(FORMAT).toBe('json');
    expect(PLAIN).toBe(true);
    expect(COMPACT).toBe(true);
    expect(DEBUG).toBe(true);
  });

  test('repeated direct invocations do not leak --profile', async () => {
    await captureInvocation(['--profile', 'pilot', '--help', 'travel']);
    expect(ACTIVE_PROFILE).toBe('pilot');

    await captureInvocation(['--help', 'travel'], {}, { getDefaultProfile: () => undefined });
    expect(ACTIVE_PROFILE).toBeUndefined();
  });

  test('SPACEMOLT_PROFILE supplies the active profile when --profile is omitted', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runInvocation(
      ['--help', 'travel'],
      undefined,
      fakeContext(stdout, stderr, { SPACEMOLT_PROFILE: 'marlowe' }),
    );

    expect(exitCode).toBe(0);
    expect(ACTIVE_PROFILE).toBe('marlowe');
  });

  test('--profile overrides SPACEMOLT_PROFILE', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runInvocation(
      ['--profile', 'pilot', '--help', 'travel'],
      undefined,
      fakeContext(stdout, stderr, { SPACEMOLT_PROFILE: 'marlowe' }),
    );

    expect(exitCode).toBe(0);
    expect(ACTIVE_PROFILE).toBe('pilot');
  });

  test('saved default profile is used when --profile and SPACEMOLT_PROFILE are absent', async () => {
    const invocation = await captureInvocation(['--help', 'travel'], {}, { getDefaultProfile: () => 'marlowe' });

    expect(invocation.exitCode).toBe(0);
    expect(invocation.config?.profile).toBe('marlowe');
    expect(invocation.config?.profileIsExplicit).toBe(false);
    expect(ACTIVE_PROFILE).toBe('marlowe');
  });

  test('--profile overrides saved default profile', async () => {
    const invocation = await captureInvocation(
      ['--profile', 'pilot', '--help', 'travel'],
      {},
      { getDefaultProfile: () => 'marlowe' },
    );

    expect(invocation.exitCode).toBe(0);
    expect(invocation.config?.profile).toBe('pilot');
    expect(invocation.config?.profileIsExplicit).toBe(true);
    expect(ACTIVE_PROFILE).toBe('pilot');
  });

  test('SPACEMOLT_PROFILE overrides saved default profile', async () => {
    const invocation = await captureInvocation(
      ['--help', 'travel'],
      { SPACEMOLT_PROFILE: 'pilot' },
      { getDefaultProfile: () => 'marlowe' },
    );

    expect(invocation.exitCode).toBe(0);
    expect(invocation.config?.profile).toBe('pilot');
    expect(invocation.config?.profileIsExplicit).toBe(true);
    expect(ACTIVE_PROFILE).toBe('pilot');
  });

  test('non-login command with missing explicit profile does not create a session file', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-missing-profile-'));
    const configHome = path.join(tempDir, 'config');
    const sessionsDir = path.join(configHome, 'spacemolt-cli', 'sessions');
    const stdout: string[] = [];
    const stderr: string[] = [];
    let sessionCreated = false;
    let apiRequested = false;

    try {
      const exitCode = await withConfigHome(configHome, async () =>
        runInvocation(
          ['--profile', 'dummy', 'get_status'],
          undefined,
          fakeContext(stdout, stderr, { XDG_CONFIG_HOME: configHome }),
          {
            createClient(config) {
              return new RealSpaceMoltClient({
                config,
                sessionStore: new SessionManager({
                  apiBase: config.apiBase,
                  profile: config.profile,
                  profileIsExplicit: config.profileIsExplicit,
                  transport: async <T>() => {
                    sessionCreated = true;
                    return {
                      status: 200,
                      ok: true,
                      data: {
                        session: {
                          id: 'sess_dummy',
                          created_at: '2026-01-01T00:00:00.000Z',
                          expires_at: '2099-01-01T00:00:00.000Z',
                        },
                      } as T,
                    };
                  },
                }),
                transport: {
                  async requestJson<T>() {
                    apiRequested = true;
                    return { status: 200, data: { structuredContent: { ok: true } } as T };
                  },
                },
              });
            },
          },
        ),
      );

      expect(exitCode).toBe(1);
      expect(stdout).toEqual([]);
      expect(stderr.join('\n')).toContain('No saved session for profile "dummy"');
      expect(sessionCreated).toBe(false);
      expect(apiRequested).toBe(false);
      expect(fs.existsSync(path.join(sessionsDir, 'dummy.json'))).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('login with saved default uses username profile without overwriting default session', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-login-default-'));
    const configHome = path.join(tempDir, 'config');
    const sessionsDir = path.join(configHome, 'spacemolt-cli', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    const defaultSession = {
      id: 'sess_marlowe',
      username: 'marlowe',
      password: 'marlowe-secret',
      player_id: 'player_marlowe',
      created_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2099-01-01T00:00:00.000Z',
    };
    const defaultSessionPath = path.join(sessionsDir, 'marlowe.json');
    fs.writeFileSync(defaultSessionPath, `${JSON.stringify(defaultSession, null, 2)}\n`);
    const stdout: string[] = [];
    const stderr: string[] = [];

    try {
      const exitCode = await withConfigHome(configHome, async () => {
        setDefaultProfile('marlowe');
        return runInvocation(
          ['login', 'OtherUser', 'other-secret'],
          undefined,
          fakeContext(stdout, stderr, { XDG_CONFIG_HOME: configHome }),
          {
            createClient(config) {
              return new RealSpaceMoltClient({
                config,
                sessionStore: new SessionManager({
                  apiBase: config.apiBase,
                  profile: config.profile,
                  profileIsExplicit: config.profileIsExplicit,
                  transport: async <T>() => ({
                    status: 200,
                    ok: true,
                    data: {
                      session: {
                        id: 'sess_other_bootstrap',
                        created_at: '2026-01-01T00:00:00.000Z',
                        expires_at: '2099-01-01T00:00:00.000Z',
                      },
                    } as T,
                  }),
                }),
                transport: {
                  async requestJson<T>() {
                    return {
                      status: 200,
                      data: { structuredContent: { player: { id: 'player_other' } } } as T,
                    };
                  },
                },
              });
            },
          },
        );
      });

      expect(exitCode).toBe(0);
      expect(stderr).toEqual([]);
      expect(JSON.parse(fs.readFileSync(defaultSessionPath, 'utf-8'))).toEqual(defaultSession);
      expect(JSON.parse(fs.readFileSync(path.join(sessionsDir, 'otheruser.json'), 'utf-8'))).toMatchObject({
        id: 'sess_other_bootstrap',
        username: 'OtherUser',
        password: 'other-secret',
        player_id: 'player_other',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('direct invocation writes through CliWriter without console monkeypatching', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;

    const exitCode = await runInvocation(['--json', 'trvel'], undefined, fakeContext(stdout, stderr));

    expect(exitCode).toBe(1);
    expect(stdout.join('\n')).toContain('"unknown_command"');
    expect(stderr).toEqual([]);
    expect(console.log).toBe(originalLog);
    expect(console.error).toBe(originalError);
  });

  test('--plain removes ANSI codes from global parse errors', async () => {
    const result = await captureInvocation(['--plain', '--format', 'nope', 'get_status']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid format "nope"');
    expect(result.stderr).not.toContain('\x1b[');
  });

  test('parse errors render from explicit output state without setOutputMode', async () => {
    setOutputMode({ json: false, quiet: false, plain: false, debug: false, format: 'table', compact: false });
    const result = await captureInvocation(['--format=invalid'], { SPACEMOLT_OUTPUT: 'json', DEBUG: 'true' });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('');
    expect(DEBUG).toBe(false);
    expect(JSON.parse(result.stdout)).toMatchObject({
      error: {
        code: 'invalid_global_option',
      },
    });
  });

  test('plain parse errors use explicit plain state', async () => {
    const result = await captureInvocation(['--plain', '--format=invalid']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Error:');
    expect(result.stderr).not.toContain('\x1b[');
  });

  test('invalid env profile preserves parsed JSON output state', async () => {
    const result = await captureInvocation(['--json', 'help'], { SPACEMOLT_PROFILE: 'bad/name' });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout).error.code).toBe('invalid_global_option');
  });

  test('invalid env profile preserves parsed format json output state', async () => {
    const result = await captureInvocation(['--format=json', 'help'], { SPACEMOLT_PROFILE: 'bad/name' });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout).error.code).toBe('invalid_global_option');
  });

  test('invalid env profile preserves env JSON output state', async () => {
    const result = await captureInvocation(['help'], {
      SPACEMOLT_PROFILE: 'bad/name',
      SPACEMOLT_OUTPUT: 'json',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout).error.code).toBe('invalid_global_option');
  });

  test('invalid env profile preserves parsed plain output state', async () => {
    const result = await captureInvocation(['--plain', 'help'], { SPACEMOLT_PROFILE: 'bad/name' });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Profile names may only contain');
    expect(result.stderr).not.toContain('\x1b[');
  });

  test('invalid env profile preserves parsed quiet output state', async () => {
    const result = await captureInvocation(['--quiet', 'help'], { SPACEMOLT_PROFILE: 'bad/name' });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Profile names may only contain');
  });

  test('quiet parse errors still render diagnostics', async () => {
    const result = await captureInvocation(['--quiet', '--format=invalid']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Invalid format "invalid"');
  });

  test('--format json preserves JSON output for later global parse errors', async () => {
    const result = await captureInvocation(['--format', 'json', '--format', 'nope', 'get_status']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout).error.code).toBe('invalid_global_option');
  });

  test('repeated global parse failures do not leak output mode', async () => {
    const jsonResult = await captureInvocation(['--json', '--format', 'nope']);
    expect(jsonResult.exitCode).toBe(1);
    expect(JSON.parse(jsonResult.stdout).error.code).toBe('invalid_global_option');
    expect(jsonResult.stderr).toBe('');

    const textResult = await captureInvocation(['--format', 'nope']);
    expect(textResult.exitCode).toBe(1);
    expect(textResult.stdout).toBe('');
    expect(textResult.stderr).toContain('Invalid format "nope"');
  });

  test('env JSON output applies to global parse errors', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runInvocation(
      ['--format', 'nope'],
      undefined,
      fakeContext(stdout, stderr, { SPACEMOLT_OUTPUT: 'json' }),
    );

    expect(exitCode).toBe(1);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join('\n')).error.code).toBe('invalid_global_option');
  });

  test('context env resolves output mode and profile config', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const env = {
      SPACEMOLT_OUTPUT: 'json',
      SPACEMOLT_PROFILE: 'pilot',
      SPACEMOLT_URL: 'https://context.example/api/v2',
    };

    const exitCode = await runInvocation(['trvel'], undefined, fakeContext(stdout, stderr, env));

    expect(exitCode).toBe(1);
    expect(stdout.join('\n')).toContain('"unknown_command"');
    expect(stderr).toEqual([]);
  });

  test('connection errors use explicit output state after parsing', async () => {
    const result = await captureInvocation(
      ['--plain', '--debug', 'get_status'],
      { SPACEMOLT_URL: 'https://configured.test/api/v2' },
      {
        createClient(config) {
          return {
            config,
            async execute() {
              throw new Error('fetch failed');
            },
          } as unknown as SpaceMoltClient;
        },
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Connection Error: fetch failed');
    expect(result.stderr).toContain('Verify the API is reachable: https://configured.test/api/v2');
    expect(result.stderr).toContain('[DEBUG] Full error:');
    expect(result.stderr).not.toContain('\x1b[');
  });

  test('plain command parse errors use explicit output state', async () => {
    const result = await captureInvocation(['--plain', 'travel']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing required argument');
    expect(result.stderr).not.toContain('\x1b[');
  });

  test('quiet command parse errors suppress cached ID suggestions but keep required diagnostics', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-id-cache-'));
    const configHome = path.join(tempDir, 'config');
    const spacemoltHome = path.join(configHome, 'spacemolt-cli');
    const sessionsDir = path.join(spacemoltHome, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(path.join(spacemoltHome, 'config.json'), `${JSON.stringify({ defaultProfile: 'pilot' })}\n`);
    fs.writeFileSync(
      path.join(sessionsDir, 'pilot.ids.json'),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'poi',
            id: 'sol_earth',
            name: 'Earth',
            sourceCommand: 'get_system',
            seenAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      })}\n`,
    );

    try {
      const result = await withConfigHome(configHome, () =>
        captureInvocation(['--quiet', 'travel'], { XDG_CONFIG_HOME: configHome }),
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Missing required argument');
      expect(result.stderr).not.toContain('Cached poi IDs:');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('plain unknown command diagnostics use explicit output state', async () => {
    const result = await captureInvocation(['--plain', 'trvel']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown command "trvel"');
    expect(result.stderr).not.toContain('\x1b[');
  });

  test('plain local command parse diagnostics use explicit output state', async () => {
    const profileResult = await captureInvocation(['--plain', 'profile', 'nope']);
    const explainResult = await captureInvocation(['--plain', 'explain']);
    const completionResult = await captureInvocation(['--plain', 'completion', 'powershell']);

    expect(profileResult.exitCode).toBe(1);
    expect(explainResult.exitCode).toBe(1);
    expect(completionResult.exitCode).toBe(1);
    expect(`${profileResult.stderr}\n${explainResult.stderr}\n${completionResult.stderr}`).not.toContain('\x1b[');
  });

  test('context profile is used for API payload preparation', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-context-'));
    const configHome = path.join(tempDir, 'config');
    const sessionsDir = path.join(configHome, 'spacemolt-cli', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionsDir, 'pilot.ids.json'),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'poi',
            id: 'sol_earth',
            name: 'Earth',
            sourceCommand: 'get_system',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      })}\n`,
    );
    const stdout: string[] = [];
    const stderr: string[] = [];
    const calls: Array<{ command: string; payload: Record<string, unknown> }> = [];
    const client = {
      config: { profile: 'pilot' },
      async execute(command: string, payload: Record<string, unknown>) {
        calls.push({ command, payload });
        return { structuredContent: { ok: true } };
      },
    } as unknown as SpaceMoltClient;

    const exitCode = await runInvocation(
      ['--quiet', 'travel', 'earth'],
      client,
      fakeContext(stdout, stderr, { XDG_CONFIG_HOME: configHome, SPACEMOLT_PROFILE: 'pilot' }),
    );

    expect(exitCode).toBe(0);
    expect(calls).toEqual([{ command: 'travel', payload: { id: 'sol_earth' } }]);
  });
});

describe('runInvocation watch cleanup', () => {
  test('runner dependencies can disable update checks and inject cache routes', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const updates: string[] = [];
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig(command: string, config: { route: unknown }, payload: Record<string, unknown>) {
        return { structuredContent: { command, route: config.route, payload } };
      },
    } as unknown as SpaceMoltClient;

    const exitCode = await runInvocation(
      ['--json', 'deps_dynamic', 'target_1'],
      client,
      fakeContext(stdout, stderr, { SPACEMOLT_PROFILE: 'pilot' }),
      {
        async checkForUpdates() {
          updates.push('called');
        },
        loadCachedGeneratedRoutes() {
          return {
            'POST /api/v2/deps/probe': {
              summary: 'Dependency route',
              route: { tool: 'deps', action: 'probe', method: 'POST' },
              required: ['id'],
              schema: { id: { type: 'string', positionalIndex: 0 } },
              cli: { command: 'deps_dynamic' },
            },
          };
        },
      },
    );

    expect(exitCode).toBe(0);
    expect(updates).toEqual([]);
    expect(stderr).toEqual([]);
    expect(stdout.join('\n')).toContain('deps_dynamic');
  });

  test('runner dependency signal hooks are cleaned up in watch mode', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const registered: Array<() => void> = [];
    const removed: Array<() => void> = [];
    const client = {
      config: { profile: 'pilot' },
      async execute() {
        return { structuredContent: { ok: true } };
      },
    } as unknown as SpaceMoltClient;
    const context = fakeContext(stdout, stderr);
    context.sleep = async () => {
      registered[0]?.();
    };

    const exitCode = await runInvocation(
      ['--profile', 'pilot', '--watch=1', '--quiet', 'get_status'],
      client,
      context,
      {
        onSigint(listener) {
          registered.push(listener);
          return () => removed.push(listener);
        },
      },
    );

    expect(exitCode).toBe(0);
    expect(registered).toHaveLength(1);
    expect(removed).toEqual(registered);
  });

  test('removes SIGINT listener on normal stop', async () => {
    const before = process.listenerCount('SIGINT');
    const client = {
      config: { profile: 'pilot' },
      async execute() {
        return { structuredContent: { ok: true } };
      },
    } as unknown as SpaceMoltClient;
    const stdout: string[] = [];
    const stderr: string[] = [];
    const context = fakeContext(stdout, stderr);
    context.sleep = async () => {
      process.emit('SIGINT');
    };

    const exitCode = await runInvocation(['--profile', 'pilot', '--watch=1', '--quiet', 'get_status'], client, context);

    expect(exitCode).toBe(0);
    expect(process.listenerCount('SIGINT')).toBe(before);
  });

  test('removes SIGINT listener after watch parse failure', async () => {
    const before = process.listenerCount('SIGINT');
    const exitCode = await runInvocation(['--watch=1', 'travel'], undefined, fakeContext([], []));

    expect(exitCode).toBe(1);
    expect(process.listenerCount('SIGINT')).toBe(before);
  });

  test('removes SIGINT listener after watch connection error', async () => {
    const before = process.listenerCount('SIGINT');
    const client = {
      config: {},
      async execute() {
        throw new Error('network down');
      },
    } as unknown as SpaceMoltClient;
    const exitCode = await runInvocation(['--watch=1', '--quiet', 'get_status'], client, fakeContext([], []));

    expect(exitCode).toBe(1);
    expect(process.listenerCount('SIGINT')).toBe(before);
  });

  test('removes SIGINT listener after watch render error', async () => {
    const before = process.listenerCount('SIGINT');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-watch-render-'));
    const configHome = path.join(tempDir, 'config');
    const configRoot = path.join(configHome, 'spacemolt-cli');
    fs.mkdirSync(configRoot, { recursive: true });
    fs.writeFileSync(path.join(configRoot, 'sessions'), '');
    const client = {
      config: { profile: 'pilot' },
      async execute() {
        return { structuredContent: cargoFixture };
      },
    } as unknown as SpaceMoltClient;
    const exitCode = await withConfigHome(configHome, () =>
      runInvocation(['--watch=1', '--quiet', 'get_cargo'], client, fakeContext([], [])),
    );

    expect(exitCode).toBe(1);
    expect(process.listenerCount('SIGINT')).toBe(before);
  });
});
