import { afterEach, describe, expect, test } from 'bun:test';
import { runInvocation } from './main';
import { COMPACT, FORMAT, JSON_OUTPUT, PLAIN, setOutputMode } from './runtime';
import { ACTIVE_PROFILE, setActiveProfile } from './session';

async function captureInvocation(argv: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    stdout.push(args.map(String).join(' '));
  };
  console.error = (...args: unknown[]) => {
    stderr.push(args.map(String).join(' '));
  };

  try {
    const exitCode = await runInvocation(argv);
    return {
      exitCode,
      stdout: stdout.join('\n'),
      stderr: stderr.join('\n'),
    };
  } finally {
    console.log = originalLog;
    console.error = originalError;
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
});
