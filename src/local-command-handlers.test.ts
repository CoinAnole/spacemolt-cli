import { describe, expect, test } from 'bun:test';
import type { CliRuntimeContext } from './cli-context';
import type { CommandHandler } from './command-types';
import { resolveHandler } from './local-command-handlers';
import type { GlobalOptions } from './types';

const options: GlobalOptions = {
  json: false,
  dryRun: false,
  allowUnknown: false,
  plain: false,
  compact: false,
  quiet: false,
  format: 'table',
  noTimestamp: false,
  args: [],
};

function localHandler(args: string[]): CommandHandler {
  const handler = resolveHandler(args, options);
  expect(handler).toBeDefined();
  return handler as CommandHandler;
}

function captureContext(): { context: CliRuntimeContext; stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    context: {
      env: { HOME: '/tmp/spacemolt-test-home' },
      writer: {
        out(message = '') {
          stdout.push(message);
        },
        err(message = '') {
          stderr.push(message);
        },
      },
      clock: { now: () => new Date('2026-05-18T12:00:00.000Z') },
      sleep: async () => {},
    },
  };
}

describe('local command handlers', () => {
  test('completion renders through CliRuntimeContext writer', async () => {
    const handler = localHandler(['completion', 'fish']);
    expect(handler.name).toBe('completion');
    const parsed = handler.parse(['completion', 'fish'], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, options);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, options, undefined, context);

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toContain('complete -c spacemolt');
  });

  test('version renders through CliRuntimeContext writer', async () => {
    const handler = localHandler(['version']);
    expect(handler.name).toBe('version');
    const parsed = handler.parse(['version'], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, options);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, options, undefined, context);

    expect(exitCode).toBe(0);
    expect(stdout[0]).toMatch(/^SpaceMolt Client v/);
    expect(stdout[1]).toMatch(/^API: /);
  });

  test('explain unknown command emits JSON error for json mode', async () => {
    const handler = localHandler(['explain']);
    expect(handler.name).toBe('explain');
    const parsed = handler.parse(['explain', 'nope_nope'], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, options);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, { ...options, json: true }, undefined, context);

    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout.join('\n'))).toEqual({
      error: { code: 'unknown_command', message: 'Unknown command: nope_nope' },
    });
  });
});
