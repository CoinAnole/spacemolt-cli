import { describe, expect, test } from 'bun:test';
import type { SpaceMoltClient } from './api';
import type { CliRuntimeContext } from './cli-context';
import { renderResponse, runCommand } from './response-renderer';
import type { GlobalOptions } from './types';

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

const baseOptions: GlobalOptions = {
  args: [],
  json: false,
  quiet: false,
  plain: true,
  allowUnknown: false,
  dryRun: false,
  noTimestamp: false,
  compact: false,
};

function fakeContext() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const context: CliRuntimeContext = {
    env: {},
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
        return new Date('2026-05-20T00:00:00.000Z');
      },
    },
    sleep() {
      return Promise.resolve();
    },
    output: { quiet: false, plain: true },
  };
  return {
    context,
    stdout,
    stderr,
    text() {
      return stdout.join('\n').replace(ANSI_PATTERN, '');
    },
  };
}

describe('response renderer', () => {
  test('runCommand uses server preview command for supported dry-run previews', async () => {
    const calls: Array<{ command: string; payload: Record<string, unknown> }> = [];
    const client = {
      async execute(command: string, payload: Record<string, unknown>) {
        calls.push({ command, payload });
        return { structuredContent: { preview: true } };
      },
    } as unknown as SpaceMoltClient;

    const result = await runCommand(
      'buy',
      { item_id: 'ore_iron', quantity: 2 },
      { ...baseOptions, dryRun: true },
      client,
    );

    expect(result.displayCommand).toBe('estimate_purchase');
    expect(result.response).toEqual({ structuredContent: { preview: true } });
    expect(calls).toEqual([{ command: 'estimate_purchase', payload: { item_id: 'ore_iron', quantity: 2 } }]);
  });

  test('renderResponse prints notifications before successful text output', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'get_status',
        displayCommand: 'get_status',
        response: {
          result: 'Status ready',
          notifications: [
            {
              type: 'system',
              data: { message: 'Tick complete' },
              timestamp: '2026-05-20T00:00:00.000Z',
            },
          ],
        },
      },
      { ...baseOptions, dryRun: true },
      { config: {} } as SpaceMoltClient,
      capture.context,
    );

    const output = capture.text();
    expect(exitCode).toBe(0);
    expect(output).toContain('Notifications (1)');
    expect(output).toContain('Tick complete');
    expect(output.indexOf('Notifications (1)')).toBeLessThan(output.indexOf('Status ready'));
  });

  test('renderResponse prints JSON error envelopes and exits nonzero', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'travel',
        displayCommand: 'travel',
        response: { error: { code: 'invalid_poi', message: 'Unknown POI' } },
      },
      { ...baseOptions, json: true },
      { config: {} } as SpaceMoltClient,
      capture.context,
    );

    expect(exitCode).toBe(1);
    expect(JSON.parse(capture.text())).toEqual({ error: { code: 'invalid_poi', message: 'Unknown POI' } });
  });

  test('renderResponse suppresses timestamp for projected output', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'get_status',
        displayCommand: 'get_status',
        response: { structuredContent: { player: { username: 'coin' } } },
      },
      { ...baseOptions, dryRun: true, fields: ['player.username'] },
      { config: {} } as SpaceMoltClient,
      capture.context,
    );

    const output = capture.text();
    expect(exitCode).toBe(0);
    expect(output).toContain('coin');
    expect(output).not.toContain('2026-05-20T00:00:00.000Z');
  });
});
