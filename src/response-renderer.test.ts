import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { SpaceMoltClient } from './api';
import type { CliRuntimeContext } from './cli-context';
import { BUNDLED_COMMAND_REGISTRY } from './command-registry';
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
  test('runCommand strips get_cargo display-only fields before API execution', async () => {
    const calls: Array<{ command: string; payload: Record<string, unknown> }> = [];
    const client = {
      async executeCommandConfig(command: string, _config: unknown, payload: Record<string, unknown>) {
        calls.push({ command, payload });
        return { structuredContent: { cargo: [] } };
      },
    } as unknown as SpaceMoltClient;

    await runCommand(
      'get_cargo',
      { top: '10', show_empty: 'true' },
      baseOptions,
      client,
      BUNDLED_COMMAND_REGISTRY.commands.get_cargo,
    );

    expect(calls).toEqual([{ command: 'get_cargo', payload: {} }]);
  });

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
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    const output = capture.text();
    expect(exitCode).toBe(0);
    expect(output).toContain('Notifications (1)');
    expect(output).toContain('Tick complete');
    expect(output.indexOf('Notifications (1)')).toBeLessThan(output.indexOf('Status ready'));
  });

  test('renderResponse warns when server help filters are ignored by the API', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'help',
        displayCommand: 'help',
        payload: { category: 'Navigation' },
        response: { result: 'All server commands' },
      },
      { ...baseOptions, noTimestamp: true, format: 'table' },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    const stderr = capture.stderr.join('\n').replace(ANSI_PATTERN, '');
    expect(exitCode).toBe(0);
    expect(capture.text()).toContain('All server commands');
    expect(stderr).toContain('server help does not currently support category/command filtering');
    expect(stderr).toContain('spacemolt help <command>');
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
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    expect(exitCode).toBe(1);
    expect(JSON.parse(capture.text())).toEqual({ error: { code: 'invalid_poi', message: 'Unknown POI' } });
  });

  test('renderResponse prints cached ID suggestions for ID-like errors', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-renderer-'));
    try {
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
              id: 'earth',
              name: 'Earth',
              sourceCommand: 'get_system',
              seenAt: '2026-05-20T00:00:00.000Z',
            },
          ],
        })}\n`,
      );
      const capture = fakeContext();
      const client = { config: { profile: 'pilot' } } as unknown as SpaceMoltClient;

      capture.context.env.XDG_CONFIG_HOME = configHome;
      const exitCode = await renderResponse(
        {
          command: 'travel',
          displayCommand: 'travel',
          response: { error: { code: 'not_found', message: 'unknown destination' } },
        },
        { ...baseOptions, noTimestamp: true, format: 'table' },
        client,
        capture.context,
      );

      const stderr = capture.stderr.join('\n').replace(ANSI_PATTERN, '');
      expect(exitCode).toBe(1);
      expect(stderr).toContain('Cached poi IDs');
      expect(stderr).toContain('earth (Earth)');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
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
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    const output = capture.text();
    expect(exitCode).toBe(0);
    expect(output).toContain('coin');
    expect(output).not.toContain('2026-05-20T00:00:00.000Z');
  });

  test('renderResponse hides empty cargo stacks and sorts non-empty stacks by quantity descending', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'get_cargo',
        displayCommand: 'get_cargo',
        payload: {},
        response: {
          structuredContent: {
            cargo: [
              { item_id: 'ore_copper', item_name: 'Copper Ore', quantity: 12, size: 1 },
              { item_id: 'ore_iron', item_name: 'Iron Ore', quantity: 718, size: 1 },
              { item_id: 'fuel_cell', item_name: 'Fuel Cell', quantity: 0, size: 1 },
            ],
            used: 730,
            capacity: 1000,
            available: 270,
          },
        },
      },
      { ...baseOptions, dryRun: true, noTimestamp: true },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    const output = capture.text();
    expect(exitCode).toBe(0);
    expect(output).toContain('Items (2):');
    expect(output).toContain('Iron Ore');
    expect(output).toContain('Copper Ore');
    expect(output).not.toContain('Fuel Cell');
    expect(output.indexOf('Iron Ore')).toBeLessThan(output.indexOf('Copper Ore'));
  });

  test('renderResponse --show-empty includes zero quantity cargo stacks after non-empty stacks', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'get_cargo',
        displayCommand: 'get_cargo',
        payload: { show_empty: 'true' },
        response: {
          structuredContent: {
            cargo: [
              { item_id: 'fuel_cell', item_name: 'Fuel Cell', quantity: 0, size: 1 },
              { item_id: 'ore_copper', item_name: 'Copper Ore', quantity: 12, size: 1 },
              { item_id: 'ore_iron', item_name: 'Iron Ore', quantity: 718, size: 1 },
            ],
            used: 730,
            capacity: 1000,
            available: 270,
          },
        },
      },
      { ...baseOptions, dryRun: true, noTimestamp: true },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    const output = capture.text();
    expect(exitCode).toBe(0);
    expect(output).toContain('Items (3):');
    expect(output).toContain('Fuel Cell');
    expect(output.indexOf('Iron Ore')).toBeLessThan(output.indexOf('Copper Ore'));
    expect(output.indexOf('Copper Ore')).toBeLessThan(output.indexOf('Fuel Cell'));
  });

  test('renderResponse limits get_cargo table output to the top stacks', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'get_cargo',
        displayCommand: 'get_cargo',
        payload: { top: '2' },
        response: {
          structuredContent: {
            cargo: [
              { item_id: 'ore_copper', item_name: 'Copper Ore', quantity: 12, size: 1 },
              { item_id: 'ore_iron', item_name: 'Iron Ore', quantity: 718, size: 1 },
              { item_id: 'fuel_cell', item_name: 'Fuel Cell', quantity: 5, size: 1 },
            ],
            used: 735,
            capacity: 1000,
          },
        },
      },
      { ...baseOptions, dryRun: true, noTimestamp: true },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    const output = capture.text();
    expect(exitCode).toBe(0);
    expect(output).toContain('Items (2):');
    expect(output).toContain('Iron Ore');
    expect(output).toContain('Copper Ore');
    expect(output).not.toContain('Fuel Cell');
  });

  test('renderResponse uses normalized limit payload as top', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'get_cargo',
        displayCommand: 'get_cargo',
        payload: { top: '1' },
        response: {
          structuredContent: {
            cargo: [
              { item_id: 'ore_copper', item_name: 'Copper Ore', quantity: 12, size: 1 },
              { item_id: 'ore_iron', item_name: 'Iron Ore', quantity: 718, size: 1 },
            ],
            used: 730,
            capacity: 1000,
          },
        },
      },
      { ...baseOptions, dryRun: true, noTimestamp: true },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    const output = capture.text();
    expect(exitCode).toBe(0);
    expect(output).toContain('Items (1):');
    expect(output).toContain('Iron Ore');
    expect(output).not.toContain('Copper Ore');
  });

  test('renderResponse leaves get_cargo JSON output unfiltered', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'get_cargo',
        displayCommand: 'get_cargo',
        payload: { top: '1' },
        response: {
          structuredContent: {
            cargo: [
              { item_id: 'ore_copper', item_name: 'Copper Ore', quantity: 12, size: 1 },
              { item_id: 'ore_iron', item_name: 'Iron Ore', quantity: 718, size: 1 },
            ],
            used: 730,
            capacity: 1000,
          },
        },
      },
      { ...baseOptions, dryRun: true, json: true },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(capture.text());
    expect(parsed.structuredContent.cargo).toHaveLength(2);
    expect(parsed.structuredContent.cargo[0].item_id).toBe('ore_copper');
  });
});
