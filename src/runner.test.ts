import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { SpaceMoltClient } from './api';
import type { CliEnv, CliRuntimeContext } from './cli-context';
import { cargoFixture } from './display/formatter-fixtures';
import { runInvocation } from './main';
import { COMPACT, FORMAT, JSON_OUTPUT, PLAIN, setOutputMode } from './runtime';
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

  test('repeated direct invocations do not leak --profile', async () => {
    await captureInvocation(['--profile', 'pilot', '--help', 'travel']);
    expect(ACTIVE_PROFILE).toBe('pilot');

    await captureInvocation(['--help', 'travel']);
    expect(ACTIVE_PROFILE).toBeUndefined();
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
