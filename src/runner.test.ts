import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { SpaceMoltClient } from './api';
import type { CliEnv, CliRuntimeContext } from './cli-context';
import { cargoFixture } from './display/formatter-fixtures';
import { runInvocation } from './main';
import { COMPACT, DEBUG, FORMAT, JSON_OUTPUT, PLAIN, setOutputMode } from './runtime';
import { ACTIVE_PROFILE, setActiveProfile } from './session';

async function captureInvocation(argv: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const context = fakeContext(stdout, stderr);
  const exitCode = await runInvocation(argv, undefined, context);
  return {
    exitCode,
    stdout: stdout.join('\n'),
    stderr: stderr.join('\n'),
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
    const cacheDir = path.join(configHome, 'spacemolt');
    const sessionPath = path.join(tempDir, 'session.json');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, 'openapi-cache.json'),
      `${JSON.stringify({
        fetchedAt: '2026-05-20T00:00:00.000Z',
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
      config: { sessionPath },
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
        SPACEMOLT_SESSION: sessionPath,
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

  test('repeated direct invocations do not leak --json', async () => {
    const jsonResult = await captureInvocation(['--json', 'trvel']);
    expect(jsonResult.exitCode).toBe(1);
    expect(jsonResult.stdout).toContain('"unknown_command"');
    expect(JSON_OUTPUT).toBe(true);
    expect(FORMAT).toBe('json');

    const textResult = await captureInvocation(['trvel']);
    expect(textResult.exitCode).toBe(1);
    expect(textResult.stderr).toContain('Unknown command "trvel"');
    expect(textResult.stdout).not.toContain('"unknown_command"');
    expect(JSON_OUTPUT).toBe(process.env.SPACEMOLT_OUTPUT === 'json');
    expect(FORMAT).toBe('table');
  });

  test('repeated direct invocations do not leak --plain or --compact', async () => {
    await captureInvocation(['--plain', '--compact', '--json', 'trvel']);
    expect(PLAIN).toBe(true);
    expect(COMPACT).toBe(true);

    await captureInvocation(['trvel']);
    expect(PLAIN).toBe(false);
    expect(COMPACT).toBe(false);
  });

  test('repeated direct invocations do not leak --debug', async () => {
    await captureInvocation(['--debug', '--help']);
    expect(DEBUG).toBe(true);

    await captureInvocation(['--help']);
    expect(DEBUG).toBe(process.env.DEBUG === 'true');
  });

  test('repeated direct invocations do not leak --profile', async () => {
    await captureInvocation(['--profile', 'pilot', '--help', 'travel']);
    expect(ACTIVE_PROFILE).toBe('pilot');

    await captureInvocation(['--help', 'travel']);
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
    expect(JSON_OUTPUT).toBe(process.env.SPACEMOLT_OUTPUT === 'json');
    expect(FORMAT).toBe('table');
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

  test('context env resolves output mode and session config', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const env = {
      SPACEMOLT_OUTPUT: 'json',
      SPACEMOLT_SESSION: '/tmp/spacemolt-context-session.json',
      SPACEMOLT_URL: 'https://context.example/api/v2',
    };

    const exitCode = await runInvocation(['trvel'], undefined, fakeContext(stdout, stderr, env));

    expect(exitCode).toBe(1);
    expect(stdout.join('\n')).toContain('"unknown_command"');
    expect(stderr).toEqual([]);
    expect(JSON_OUTPUT).toBe(true);
  });

  test('context session path is used for API payload preparation', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-context-'));
    const sessionPath = path.join(tempDir, 'pilot.json');
    fs.writeFileSync(
      path.join(tempDir, 'pilot.ids.json'),
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
      config: { sessionPath },
      async execute(command: string, payload: Record<string, unknown>) {
        calls.push({ command, payload });
        return { structuredContent: { ok: true } };
      },
    } as unknown as SpaceMoltClient;

    const exitCode = await runInvocation(
      ['--quiet', 'travel', 'earth'],
      client,
      fakeContext(stdout, stderr, { SPACEMOLT_SESSION: sessionPath }),
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
      config: { sessionPath: '/tmp/runner-deps-session.json' },
      async executeCommandConfig(command: string, config: { route: unknown }, payload: Record<string, unknown>) {
        return { structuredContent: { command, route: config.route, payload } };
      },
    } as unknown as SpaceMoltClient;

    const exitCode = await runInvocation(['--json', 'deps_dynamic', 'target_1'], client, fakeContext(stdout, stderr), {
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
    });

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
      config: { sessionPath: '/tmp/runner-watch-deps-session.json' },
      async execute() {
        return { structuredContent: { ok: true } };
      },
    } as unknown as SpaceMoltClient;
    const context = fakeContext(stdout, stderr);
    context.sleep = async () => {
      registered[0]?.();
    };

    const exitCode = await runInvocation(['--watch=1', '--quiet', 'get_status'], client, context, {
      onSigint(listener) {
        registered.push(listener);
        return () => removed.push(listener);
      },
    });

    expect(exitCode).toBe(0);
    expect(registered).toHaveLength(1);
    expect(removed).toEqual(registered);
  });

  test('removes SIGINT listener on normal stop', async () => {
    const before = process.listenerCount('SIGINT');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-watch-normal-'));
    const client = {
      config: { sessionPath: path.join(tempDir, 'session.json') },
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

    const exitCode = await runInvocation(['--watch=1', '--quiet', 'get_status'], client, context);

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
    const fileAsParent = path.join(tempDir, 'not-a-directory');
    fs.writeFileSync(fileAsParent, '');
    const client = {
      config: { sessionPath: path.join(fileAsParent, 'session.json') },
      async execute() {
        return { structuredContent: cargoFixture };
      },
    } as unknown as SpaceMoltClient;
    const exitCode = await runInvocation(['--watch=1', '--quiet', 'get_cargo'], client, fakeContext([], []));

    expect(exitCode).toBe(1);
    expect(process.listenerCount('SIGINT')).toBe(before);
  });
});
