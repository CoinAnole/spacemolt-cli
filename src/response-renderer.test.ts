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

function nearbyPlayers(count: number): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, index) => ({
    username: `Pilot ${index + 1}`,
    player_id: `player_${index + 1}`,
    ship_class: 'prospector',
  }));
}

function nearbyNpcs(count: number): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, index) => ({
    name: `Patrol ${index + 1}`,
    npc_id: `npc_${index + 1}`,
    ship_class: 'interceptor',
  }));
}

const getStatusSummaryFixture = {
  player: {
    username: 'Marlowe',
    credits: 1853248,
  },
  system: {
    name: 'Nova Terra',
  },
  station: {
    name: 'Nova Terra Central',
  },
  ship: {
    name: 'Wayfarer',
    class_name: 'Dust Devil',
  },
  skills: {
    crafting: { name: 'Crafting', level: 11, xp: 4000, next_level_xp: 5000 },
    engineering: { name: 'Engineering', level: 0, xp: 0, next_level_xp: 100 },
    mining: { name: 'Mining', level: 21, xp: 18000, next_level_xp: 20000 },
    piloting: { name: 'Piloting', level: 14, xp: 9000, next_level_xp: 10000 },
    trading: { name: 'Trading', level: 15, xp: 12000, next_level_xp: 13000 },
  },
};

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
      { top: '10', show_empty: 'true', items: 'ore_iron,fuel_cell' },
      baseOptions,
      client,
      BUNDLED_COMMAND_REGISTRY.commands.get_cargo,
    );

    expect(calls).toEqual([{ command: 'get_cargo', payload: {} }]);
  });

  test('runCommand strips get_status summary before API execution', async () => {
    const calls: Array<{ command: string; payload: Record<string, unknown> }> = [];
    const client = {
      async executeCommandConfig(command: string, _config: unknown, payload: Record<string, unknown>) {
        calls.push({ command, payload });
        return { structuredContent: getStatusSummaryFixture };
      },
    } as unknown as SpaceMoltClient;

    await runCommand(
      'get_status',
      { summary: true },
      baseOptions,
      client,
      BUNDLED_COMMAND_REGISTRY.commands.get_status,
    );

    expect(calls).toEqual([{ command: 'get_status', payload: {} }]);
  });

  test('runCommand strips view_market search before API execution', async () => {
    const calls: Array<{ command: string; payload: Record<string, unknown> }> = [];
    const client = {
      async executeCommandConfig(command: string, _config: unknown, payload: Record<string, unknown>) {
        calls.push({ command, payload });
        return { structuredContent: { items: [] } };
      },
    } as unknown as SpaceMoltClient;

    await runCommand(
      'view_market',
      { category: 'ore', search: 'iron' },
      baseOptions,
      client,
      BUNDLED_COMMAND_REGISTRY.commands.view_market,
    );

    expect(calls).toEqual([{ command: 'view_market', payload: { category: 'ore' } }]);
  });

  test('runCommand routes every storage action through its action endpoint', async () => {
    const calls: Array<{ command: string; routeAction: unknown; payload: Record<string, unknown> }> = [];
    const client = {
      async executeCommandConfig(
        command: string,
        config: { route?: { action?: string } },
        payload: Record<string, unknown>,
      ) {
        calls.push({ command, routeAction: config.route?.action, payload });
        return { structuredContent: { ok: true } };
      },
    } as unknown as SpaceMoltClient;

    for (const action of ['view', 'deposit', 'withdraw', 'loot', 'jettison']) {
      await runCommand(
        'storage',
        { action, item_id: 'ore_iron', quantity: '2' },
        baseOptions,
        client,
        BUNDLED_COMMAND_REGISTRY.commands.storage,
      );
    }

    expect(calls.map((call) => call.routeAction)).toEqual(['view', 'deposit', 'withdraw', 'loot', 'jettison']);
  });

  test('runCommand strips storage view filters before API execution', async () => {
    const calls: Array<{ command: string; routeAction: unknown; payload: Record<string, unknown> }> = [];
    const client = {
      async executeCommandConfig(
        command: string,
        config: { route?: { action?: string } },
        payload: Record<string, unknown>,
      ) {
        calls.push({ command, routeAction: config.route?.action, payload });
        return { structuredContent: { items: [] } };
      },
    } as unknown as SpaceMoltClient;

    await runCommand(
      'storage',
      {
        action: 'view',
        station_id: 'nexus_base',
        item_id: 'iron_ore',
        items: ['iron_ore', 'fuel_cell'],
        search: 'iron',
      },
      baseOptions,
      client,
      BUNDLED_COMMAND_REGISTRY.commands.storage,
    );

    expect(calls).toEqual([
      {
        command: 'storage',
        routeAction: 'view',
        payload: { action: 'view', station_id: 'nexus_base', target: 'self' },
      },
    ]);
  });

  test('runCommand preserves explicit storage view target before API execution', async () => {
    const calls: Array<{ command: string; routeAction: unknown; payload: Record<string, unknown> }> = [];
    const client = {
      async executeCommandConfig(
        command: string,
        config: { route?: { action?: string } },
        payload: Record<string, unknown>,
      ) {
        calls.push({ command, routeAction: config.route?.action, payload });
        return { structuredContent: { items: [] } };
      },
    } as unknown as SpaceMoltClient;

    await runCommand(
      'storage',
      { action: 'view', station_id: 'nexus_base', target: 'faction' },
      baseOptions,
      client,
      BUNDLED_COMMAND_REGISTRY.commands.storage,
    );

    expect(calls).toEqual([
      {
        command: 'storage',
        routeAction: 'view',
        payload: { action: 'view', station_id: 'nexus_base', target: 'faction' },
      },
    ]);
  });

  test('runCommand preserves storage bulk items arrays for API execution', async () => {
    const calls: Array<{ command: string; routeAction: unknown; payload: Record<string, unknown> }> = [];
    const client = {
      async executeCommandConfig(
        command: string,
        config: { route?: { action?: string } },
        payload: Record<string, unknown>,
      ) {
        calls.push({ command, routeAction: config.route?.action, payload });
        return { structuredContent: { ok: true } };
      },
    } as unknown as SpaceMoltClient;
    const items = [
      { item_id: 'ore_iron', quantity: 1 },
      { item_id: 'ore_copper', quantity: 2 },
    ];

    await runCommand(
      'storage',
      { action: 'deposit', target: 'faction', items },
      baseOptions,
      client,
      BUNDLED_COMMAND_REGISTRY.commands.storage,
    );

    await runCommand(
      'storage',
      { action: 'withdraw', target: 'self', source: 'faction', items },
      baseOptions,
      client,
      BUNDLED_COMMAND_REGISTRY.commands.storage,
    );

    expect(calls).toEqual([
      {
        command: 'storage',
        routeAction: 'deposit',
        payload: { action: 'deposit', target: 'faction', items },
      },
      {
        command: 'storage',
        routeAction: 'withdraw',
        payload: { action: 'withdraw', target: 'self', source: 'faction', items },
      },
    ]);
  });

  test('renderResponse prints compact get_status summary only for default human output', async () => {
    const summaryCapture = fakeContext();
    const summaryExitCode = await renderResponse(
      {
        command: 'get_status',
        displayCommand: 'get_status',
        payload: { summary: true },
        response: { structuredContent: getStatusSummaryFixture },
      },
      { ...baseOptions, format: 'table' },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      summaryCapture.context,
    );

    expect(summaryExitCode).toBe(0);
    expect(summaryCapture.text()).toBe(
      [
        'Player:    Marlowe',
        'Credits:   1,853,248',
        'System:    Nova Terra',
        'Docked:    Nova Terra Central',
        'Ship:      Dust Devil',
        'Skills:    Crafting 11 | Engineering 0 | Mining 21 | Piloting 14 | Trading 15',
      ].join('\n'),
    );

    const fieldCapture = fakeContext();
    const fieldExitCode = await renderResponse(
      {
        command: 'get_status',
        displayCommand: 'get_status',
        payload: { summary: true },
        response: { structuredContent: getStatusSummaryFixture },
      },
      { ...baseOptions, field: 'ship.class_name' },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      fieldCapture.context,
    );

    expect(fieldExitCode).toBe(0);
    expect(fieldCapture.text()).toBe('Dust Devil');
  });

  test('renderResponse prints top-level and nested keys from structured output', async () => {
    const response = {
      structuredContent: {
        player: {
          username: 'Marlowe',
          credits: 1853248,
        },
        location: {
          system_id: 'nova_terra',
          poi_id: 'nova_terra_central',
        },
        ship: {
          id: 'ship_123',
          class_name: 'Prospector',
        },
      },
    };

    const topLevelCapture = fakeContext();
    const topLevelExitCode = await renderResponse(
      {
        command: 'get_status',
        displayCommand: 'get_status',
        response,
      },
      { ...baseOptions, keys: '' },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      topLevelCapture.context,
    );

    expect(topLevelExitCode).toBe(0);
    expect(topLevelCapture.text()).toBe(['player', 'location', 'ship'].join('\n'));
    expect(topLevelCapture.stderr).toEqual([]);

    const nestedCapture = fakeContext();
    const nestedExitCode = await renderResponse(
      {
        command: 'get_status',
        displayCommand: 'get_status',
        response,
      },
      { ...baseOptions, keys: 'player' },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      nestedCapture.context,
    );

    expect(nestedExitCode).toBe(0);
    expect(nestedCapture.text()).toBe(['username', 'credits'].join('\n'));
    expect(nestedCapture.stderr).toEqual([]);
  });

  test('renderResponse supports structuredContent-prefixed keys paths for structured output', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'get_cargo',
        displayCommand: 'get_cargo',
        response: {
          structuredContent: {
            cargo: [],
            ship: {
              id: 'ship_123',
              cargo_capacity: 100,
            },
          },
        },
      },
      { ...baseOptions, keys: 'structuredContent.ship' },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    expect(exitCode).toBe(0);
    expect(capture.text()).toBe(['id', 'cargo_capacity'].join('\n'));
    expect(capture.stderr).toEqual([]);
  });

  test('renderResponse reports missing and scalar keys paths', async () => {
    const response = {
      structuredContent: {
        player: {
          username: 'Marlowe',
          credits: 1853248,
        },
        location: {
          system_id: 'nova_terra',
        },
      },
    };

    const missingCapture = fakeContext();
    const missingExitCode = await renderResponse(
      {
        command: 'get_status',
        displayCommand: 'get_status',
        response,
      },
      { ...baseOptions, keys: 'foo.bar' },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      missingCapture.context,
    );

    expect(missingExitCode).toBe(1);
    expect(missingCapture.text()).toBe('');
    expect(missingCapture.stderr.join('\n').replace(ANSI_PATTERN, '')).toBe(
      'Error: Path "foo.bar" not found. Available top-level keys: player, location',
    );

    const scalarCapture = fakeContext();
    const scalarExitCode = await renderResponse(
      {
        command: 'get_status',
        displayCommand: 'get_status',
        response,
      },
      { ...baseOptions, keys: 'player.credits' },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      scalarCapture.context,
    );

    expect(scalarExitCode).toBe(1);
    expect(scalarCapture.text()).toBe('');
    expect(scalarCapture.stderr.join('\n').replace(ANSI_PATTERN, '')).toBe(
      'Error: "player.credits" is a scalar (number), not an object.',
    );
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
    expect(capture.stdout.join('\n')).not.toContain('\x1b[');
  });

  test('renderResponse does not warn for legacy server help filter payloads', async () => {
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

    expect(exitCode).toBe(0);
    expect(capture.text()).toContain('All server commands');
    expect(capture.stderr.join('\n')).not.toContain('server help returns the full unfiltered list');
    expect(capture.stderr.join('\n')).not.toContain('topic/category/command filters are ignored');
  });

  test('renderResponse prints JSON error envelopes and exits nonzero', async () => {
    const capture = fakeContext();
    const expected = { error: { code: 'invalid_poi', message: 'Unknown POI' } };
    const exitCode = await renderResponse(
      {
        command: 'travel',
        displayCommand: 'travel',
        response: expected,
      },
      { ...baseOptions, json: true, compact: true },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    expect(exitCode).toBe(1);
    expect(capture.text()).toBe(JSON.stringify(expected));
    expect(JSON.parse(capture.text())).toEqual(expected);
  });

  test('renderResponse prints structured-mode error envelopes and exits nonzero', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'facility_upgrade',
        displayCommand: 'facility_upgrade',
        response: {
          error: {
            code: 'missing_materials',
            message: 'need 300 x optical_fiber_bundle, have 0 in faction storage + 0 in cargo',
          },
        },
      },
      { ...baseOptions, dryRun: true, structured: true },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    expect(exitCode).toBe(1);
    expect(capture.stderr).toEqual([]);
    expect(JSON.parse(capture.text())).toEqual({
      error: {
        code: 'missing_materials',
        message: 'need 300 x optical_fiber_bundle, have 0 in faction storage + 0 in cargo',
      },
    });
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
      expect(capture.stderr.join('\n')).not.toContain('\x1b[');
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

  test('renderResponse suggests sibling keys with previews for missing jq paths', async () => {
    const response = {
      structuredContent: {
        ship: {
          name: 'Wayfarer',
          fuel: 13,
          max_fuel: 700,
          cargo_capacity: 90,
          cpu_capacity: 20,
          power_capacity: 35,
          fuel_type: 'plasma',
          fuel_efficiency: 0.8,
        },
      },
    };

    const typoCapture = fakeContext();
    const typoExitCode = await renderResponse(
      {
        command: 'get_ship',
        displayCommand: 'get_ship',
        response,
      },
      { ...baseOptions, jq: '.ship.fule' },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      typoCapture.context,
    );

    expect(typoExitCode).toBe(1);
    expect(typoCapture.text()).toBe('');
    expect(typoCapture.stderr.join('\n').replace(ANSI_PATTERN, '')).toBe(
      'Error: Path not found: ".ship.fule"\nSimilar keys: .ship.fuel (13)\nAvailable keys: ship',
    );

    const capacityCapture = fakeContext();
    const capacityExitCode = await renderResponse(
      {
        command: 'get_ship',
        displayCommand: 'get_ship',
        response,
      },
      { ...baseOptions, jq: '.ship.fuel_capacity' },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capacityCapture.context,
    );

    expect(capacityExitCode).toBe(1);
    expect(capacityCapture.text()).toBe('');
    expect(capacityCapture.stderr.join('\n').replace(ANSI_PATTERN, '')).toBe(
      'Error: Path not found: ".ship.fuel_capacity"\nSimilar keys: .ship.fuel (13), .ship.max_fuel (700)\nAvailable keys: ship',
    );
  });

  test('renderResponse auto-resolves fuzzy jq capacity queries', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'get_ship',
        displayCommand: 'get_ship',
        response: {
          structuredContent: {
            ship: {
              name: 'Wayfarer',
              fuel: 13,
              max_fuel: 700,
              fuel_type: 'plasma',
              fuel_efficiency: 0.8,
            },
          },
        },
      },
      { ...baseOptions, fuzzy: true, jq: '.ship.fuel_cap' },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    expect(exitCode).toBe(0);
    expect(capture.text()).toBe('.fuel=13 .max_fuel=700');
    expect(capture.stderr).toEqual([]);
  });

  test('renderResponse unwraps fuzzy jq result sets under array traversal', async () => {
    const response = {
      structuredContent: {
        ships: [
          {
            name: 'Wayfarer',
            fuel: 13,
            max_fuel: 700,
          },
          {
            name: 'Courier',
            fuel: 22,
            max_fuel: 400,
          },
        ],
      },
    };

    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'list_ships',
        displayCommand: 'list_ships',
        response,
      },
      { ...baseOptions, fuzzy: true, jq: '.ships[].fuel_cap' },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    expect(exitCode).toBe(0);
    expect(capture.text()).toBe(
      '[\n  {\n    ".fuel": 13,\n    ".max_fuel": 700\n  },\n  {\n    ".fuel": 22,\n    ".max_fuel": 400\n  }\n]',
    );
    expect(capture.stderr).toEqual([]);
  });

  test('renderResponse auto-resolves fuzzy jq capacity queries for text output', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'get_ship',
        displayCommand: 'get_ship',
        response: {
          structuredContent: {
            ship: {
              name: 'Wayfarer',
              fuel: 13,
              max_fuel: 700,
            },
          },
        },
      },
      { ...baseOptions, fuzzy: true, jq: '.ship.fuel_cap', format: 'text' },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    expect(exitCode).toBe(0);
    expect(capture.text()).toBe('.fuel=13 .max_fuel=700');
    expect(capture.stderr).toEqual([]);
  });

  test('renderResponse formats fuzzy jq result sets for json and yaml output', async () => {
    const response = {
      structuredContent: {
        ship: {
          fuel: 13,
          max_fuel: 700,
        },
      },
    };

    const jsonCapture = fakeContext();
    const jsonExitCode = await renderResponse(
      {
        command: 'get_ship',
        displayCommand: 'get_ship',
        response,
      },
      { ...baseOptions, fuzzy: true, jq: '.ship.fuel_cap', format: 'json' },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      jsonCapture.context,
    );

    expect(jsonExitCode).toBe(0);
    expect(jsonCapture.text()).toBe('{\n  ".fuel": 13,\n  ".max_fuel": 700\n}');

    const yamlCapture = fakeContext();
    const yamlExitCode = await renderResponse(
      {
        command: 'get_ship',
        displayCommand: 'get_ship',
        response,
      },
      { ...baseOptions, fuzzy: true, jq: '.ship.fuel_cap', format: 'yaml' },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      yamlCapture.context,
    );

    expect(yamlExitCode).toBe(0);
    expect(yamlCapture.text()).toBe('\n.fuel: 13\n.max_fuel: 700');
  });

  test('renderResponse does not fuzzy-resolve jq object construction', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'get_ship',
        displayCommand: 'get_ship',
        response: {
          structuredContent: {
            ship: {
              fuel: 13,
            },
          },
        },
      },
      { ...baseOptions, fuzzy: true, jq: '{fuel: .ship.fule}' },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    expect(exitCode).toBe(1);
    expect(capture.text()).toBe('');
    expect(capture.stderr.join('\n').replace(ANSI_PATTERN, '')).toBe(
      'Error: Path not found: ".ship.fule"\nSimilar keys: .ship.fuel (13)\nAvailable keys: ship',
    );
  });

  test('renderResponse preserves structuredContent hint for missing jq paths', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'get_ship',
        displayCommand: 'get_ship',
        response: {
          structuredContent: {
            ship: {
              fuel: 13,
            },
          },
        },
      },
      { ...baseOptions, jq: '.structuredContent.ship.fule' },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    expect(exitCode).toBe(1);
    expect(capture.text()).toBe('');
    expect(capture.stderr.join('\n').replace(ANSI_PATTERN, '')).toBe(
      'Error: Path not found: ".structuredContent.ship.fule"\nHint: --jq operates on structuredContent (not the full API response). Try: .ship.fule\nAvailable keys: ship',
    );
  });

  test('renderResponse suggests sibling keys for missing jq paths under array iteration', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'list_ships',
        displayCommand: 'list_ships',
        response: {
          structuredContent: {
            ships: [
              {
                name: 'Wayfarer',
                fuel: 13,
              },
            ],
          },
        },
      },
      { ...baseOptions, jq: '.ships[].fule' },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    expect(exitCode).toBe(1);
    expect(capture.text()).toBe('');
    expect(capture.stderr.join('\n').replace(ANSI_PATTERN, '')).toBe(
      'Error: Path not found: ".ships[].fule"\nSimilar keys: .ships[].fuel (13)\nAvailable keys: ships',
    );
  });

  test('renderResponse suggests sibling keys for missing jq paths under array index traversal', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'list_ships',
        displayCommand: 'list_ships',
        response: {
          structuredContent: {
            ships: [
              {
                name: 'Wayfarer',
                fuel: 13,
              },
            ],
          },
        },
      },
      { ...baseOptions, jq: '.ships[0].fule' },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    expect(exitCode).toBe(1);
    expect(capture.text()).toBe('');
    expect(capture.stderr.join('\n').replace(ANSI_PATTERN, '')).toBe(
      'Error: Path not found: ".ships[0].fule"\nSimilar keys: .ships[0].fuel (13)\nAvailable keys: ships',
    );
  });

  test('renderResponse prints active ship combat effects in status tables', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'get_status',
        displayCommand: 'get_status',
        response: {
          structuredContent: {
            player: { username: 'Marlowe', empire: 'solarian', credits: 42 },
            ship: {
              name: 'Surveyor',
              class_id: 'prospector',
              hull: 90,
              max_hull: 100,
              shield: 35,
              max_shield: 50,
              shield_recharge: 5,
              armor: 10,
              fuel: 80,
              max_fuel: 100,
              cargo_used: 12,
              cargo_capacity: 60,
              cpu_used: 8,
              cpu_capacity: 20,
              power_used: 10,
              power_capacity: 25,
              burn_ticks_remaining: 3,
              burn_damage_per_tick: 4,
              armor_melt_pct: 0.25,
              armor_melt_ticks_remaining: 2,
              disruption_ticks_remaining: 1,
            },
            location: { system_name: 'Sol', poi_name: 'Earth' },
          },
        },
      },
      { ...baseOptions, dryRun: true, noTimestamp: true },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    const output = capture.text();
    expect(exitCode).toBe(0);
    expect(output).toContain('Effects:');
    expect(output).toContain('Burn: 3 ticks, 4 hull/tick');
    expect(output).toContain('Armor melt: 25% for 2 ticks');
    expect(output).toContain('Disruption: 1 tick');
  });

  test('renderResponse prints ammo effect summaries in catalog item tables', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'catalog',
        displayCommand: 'catalog',
        response: {
          structuredContent: {
            type: 'items',
            items: [
              {
                id: 'ghost_rounds_box',
                name: 'Ghost Rounds Box',
                category: 'ammo',
                rarity: 'rare',
                base_value: 85,
                size: 1,
                effect: {
                  type: 'ammo',
                  ammo: {
                    damage_mod: 0.9,
                    armor_bypass: 0.4,
                    untraceable: true,
                    wear_per_shot: 0.02,
                  },
                },
              },
              {
                id: 'corrosive_rounds_box',
                name: 'Corrosive Rounds Box',
                category: 'ammo',
                rarity: 'uncommon',
                base_value: 45,
                size: 1,
                effect: {
                  type: 'ammo',
                  ammo: {
                    armor_melt_pct: 0.2,
                    armor_melt_ticks: 4,
                    splash_pct: 0.15,
                  },
                },
              },
            ],
            page: 1,
            page_size: 20,
            total: 2,
            total_pages: 1,
          },
        },
      },
      { ...baseOptions, dryRun: true, noTimestamp: true },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    const output = capture.text();
    expect(exitCode).toBe(0);
    expect(output).toContain('Effects');
    expect(output).toContain('damage 90%');
    expect(output).toContain('armor bypass 40%');
    expect(output).toContain('untraceable');
    expect(output).toContain('armor melt 20%/4t');
    expect(output).toContain('splash 15%');
  });

  test('renderResponse prints dock arrival stories without raw JSON fallback', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'dock',
        displayCommand: 'dock',
        response: {
          structuredContent: {
            action: 'dock',
            base: 'Confederacy Central Command',
            story:
              'You dock at Confederacy Central Command.\n\nYou queue into Confederacy Central Command behind a wall of traffic, controllers barking over every channel.',
            station_condition: {
              condition: 'operational',
              condition_text: 'Most systems operational.',
              satisfaction_pct: 78,
              satisfied_count: 15,
              total_service_infra: 19,
            },
            open_orders: [{ order_id: 'order-1', item_name: 'Steel Plate', type: 'sell' }],
            open_orders_count: 2,
            trade_fills: [{ item_name: 'Iron Ore', quantity: 95040, type: 'buy_filled' }],
            trade_fills_count: 242,
            trade_fills_truncated: true,
            unread_chat: { system: 42, local: 79, faction: 0, private: 1 },
            unread_chat_note: 'You have 122 unread chat message(s).',
          },
        },
      },
      { ...baseOptions, dryRun: true, noTimestamp: true },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    const output = capture.text();
    expect(exitCode).toBe(0);
    expect(output).toContain('=== Docked: Confederacy Central Command ===');
    expect(output).toContain('behind a wall of traffic');
    expect(output).toContain('Station condition: Most systems operational. (78%)');
    expect(output).toContain('Open orders: 2');
    expect(output).toContain('Trade fills: 242 (showing recent, truncated)');
    expect(output).toContain('Unread chat: 122');
    expect(output).not.toContain('=== Response ===');
  });

  test('renderResponse preserves nearby collections in --structured output without mutating the response', async () => {
    const capture = fakeContext();
    const structuredContent = {
      nearby: nearbyPlayers(12),
      count: 12,
      empire_npcs: nearbyNpcs(13),
      empire_npc_count: 13,
    };

    const exitCode = await renderResponse(
      {
        command: 'get_nearby',
        displayCommand: 'get_nearby',
        response: { structuredContent },
      },
      { ...baseOptions, dryRun: true, structured: true },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(capture.text());
    expect(parsed.nearby).toHaveLength(12);
    expect(parsed.empire_npcs).toHaveLength(13);
    expect(parsed.nearby[11].username).toBe('Pilot 12');
    expect(parsed.empire_npcs[12].name).toBe('Patrol 13');
    expect(parsed.count).toBe(12);
    expect(parsed.empire_npc_count).toBe(13);
    expect(parsed.nearby_player_count).toBeUndefined();
    expect(parsed.nearby_empire_npc_count).toBeUndefined();
    expect(structuredContent.nearby).toHaveLength(12);
    expect(structuredContent.empire_npcs).toHaveLength(13);
  });

  test('renderResponse preserves list_ships --structured output fields exactly', async () => {
    const capture = fakeContext();
    const structuredContent = {
      ships: [
        {
          ship_id: 'ship-active',
          class_id: 'lithosphere',
          class_name: 'Lithosphere',
          custom_name: 'Burn-Rate Betty',
          is_active: true,
          location: 'active (with you)',
        },
        {
          ship_id: 'ship-stored',
          class_id: 'dust_devil',
          class_name: 'Dust Devil',
          is_active: false,
          location: 'stored at Nova Terra Central',
          location_base_id: 'nova_terra_central',
        },
      ],
      count: 2,
      active_ship_id: 'ship-active',
      active_ship_class: 'lithosphere',
    };

    const exitCode = await renderResponse(
      {
        command: 'list_ships',
        displayCommand: 'list_ships',
        response: { structuredContent },
      },
      { ...baseOptions, dryRun: true, structured: true },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(capture.text());
    expect(parsed).toEqual(structuredContent);
    expect(parsed.ships[0].location).toBe('active (with you)');
    expect(parsed.ships[1].location).toBe('stored at Nova Terra Central');
    expect(parsed.ships[0].ship_class).toBeUndefined();
    expect(parsed.ships[0].active).toBeUndefined();
  });

  test('renderResponse applies storage view item filter to --json output', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'storage',
        displayCommand: 'storage',
        payload: { action: 'view', item_id: 'iron_ore' },
        response: {
          structuredContent: {
            items: [
              { item_id: 'iron_ore', item_name: 'Iron Ore', quantity: 718 },
              { item_id: 'fuel_cell', item_name: 'Fuel Cell', quantity: 12 },
            ],
          },
        },
      },
      { ...baseOptions, dryRun: true, json: true },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(capture.text());
    expect(parsed.structuredContent.total_items).toBe(2);
    expect(parsed.structuredContent.items).toEqual([{ item_id: 'iron_ore', item_name: 'Iron Ore', quantity: 718 }]);
  });

  test('renderResponse applies storage view search filter to --structured output', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'storage',
        displayCommand: 'storage',
        payload: { action: 'view', search: 'fuel' },
        response: {
          structuredContent: {
            items: [
              { item_id: 'iron_ore', item_name: 'Iron Ore', quantity: 718 },
              { item_id: 'fuel_cell', item_name: 'Fuel Cell', quantity: 12 },
            ],
          },
        },
      },
      { ...baseOptions, dryRun: true, structured: true },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(capture.text());
    expect(parsed.total_items).toBe(2);
    expect(parsed.items).toEqual([{ item_id: 'fuel_cell', item_name: 'Fuel Cell', quantity: 12 }]);
  });

  test('renderResponse applies storage view items filter to --structured output', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'storage',
        displayCommand: 'storage',
        payload: { action: 'view', items: 'iron_ore,steel_plate' },
        response: {
          structuredContent: {
            items: [
              { item_id: 'iron_ore', item_name: 'Iron Ore', quantity: 718 },
              { item_id: 'fuel_cell', item_name: 'Fuel Cell', quantity: 12 },
              { item_id: 'steel_plate', item_name: 'Steel Plate', quantity: 7 },
            ],
          },
        },
      },
      { ...baseOptions, dryRun: true, structured: true },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(capture.text());
    expect(parsed.total_items).toBe(3);
    expect(parsed.items).toEqual([
      { item_id: 'iron_ore', item_name: 'Iron Ore', quantity: 718 },
      { item_id: 'steel_plate', item_name: 'Steel Plate', quantity: 7 },
    ]);
  });

  test('renderResponse applies storage view array items filter to --structured output', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'storage',
        displayCommand: 'storage',
        payload: { action: 'view', items: ['iron_ore', 'fuel_cell'] },
        response: {
          structuredContent: {
            items: [
              { item_id: 'iron_ore', item_name: 'Iron Ore', quantity: 718 },
              { item_id: 'fuel_cell', item_name: 'Fuel Cell', quantity: 12 },
              { item_id: 'steel_plate', item_name: 'Steel Plate', quantity: 7 },
            ],
          },
        },
      },
      { ...baseOptions, structured: true },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(capture.text());
    expect(parsed.total_items).toBe(3);
    expect(parsed.items).toEqual([
      { item_id: 'iron_ore', item_name: 'Iron Ore', quantity: 718 },
      { item_id: 'fuel_cell', item_name: 'Fuel Cell', quantity: 12 },
    ]);
  });

  test('renderResponse applies storage view items filter before jq projections', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'storage',
        displayCommand: 'storage',
        payload: { action: 'view', items: 'fuel_cell' },
        response: {
          structuredContent: {
            items: [
              { item_id: 'iron_ore', item_name: 'Iron Ore', quantity: 718 },
              { item_id: 'fuel_cell', item_name: 'Fuel Cell', quantity: 12 },
            ],
          },
        },
      },
      { ...baseOptions, dryRun: true, jq: '.items[].item_id', format: 'json' },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(capture.text())).toEqual(['fuel_cell']);
  });

  test('renderResponse applies storage view items filter for faction target table output', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'storage',
        displayCommand: 'storage',
        payload: { action: 'view', target: 'faction', items: 'fuel_cell,steel_plate' },
        response: {
          structuredContent: {
            base_id: 'nova_terra_central',
            target: 'faction',
            items: [
              { item_id: 'iron_ore', item_name: 'Iron Ore', quantity: 718 },
              { item_id: 'fuel_cell', item_name: 'Fuel Cell', quantity: 12 },
              { item_id: 'steel_plate', item_name: 'Steel Plate', quantity: 7 },
            ],
          },
        },
      },
      { ...baseOptions, dryRun: true, noTimestamp: true },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    const output = capture.text();
    expect(exitCode).toBe(0);
    expect(output).toContain('=== Faction Storage at nova_terra_central ===');
    expect(output).toContain('Items (2):');
    expect(output).toContain('Fuel Cell');
    expect(output).toContain('Steel Plate');
    expect(output).not.toContain('Iron Ore');
  });

  test('renderResponse treats comma-separated storage search terms as alternatives in table output', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'storage',
        displayCommand: 'storage',
        payload: { action: 'view', search: 'Copper Wiring,Steel Plate' },
        response: {
          structuredContent: {
            items: [
              { item_id: 'copper_wiring', item_name: 'Copper Wiring', quantity: 5 },
              { item_id: 'steel_plate', item_name: 'Steel Plate', quantity: 7 },
              { item_id: 'fuel_cell', item_name: 'Fuel Cell', quantity: 12 },
            ],
          },
        },
      },
      { ...baseOptions, dryRun: true, noTimestamp: true },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    const output = capture.text();
    expect(exitCode).toBe(0);
    expect(output).toContain('Copper Wiring');
    expect(output).toContain('Steel Plate');
    expect(output).not.toContain('Fuel Cell');
  });

  test('renderResponse normalizes storage search separators against item IDs in table output', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'storage',
        displayCommand: 'storage',
        payload: { action: 'view', search: 'copper wiring' },
        response: {
          structuredContent: {
            items: [
              { item_id: 'copper_wiring', quantity: 5 },
              { item_id: 'steel_plate', quantity: 7 },
            ],
          },
        },
      },
      { ...baseOptions, dryRun: true, noTimestamp: true },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    const output = capture.text();
    expect(exitCode).toBe(0);
    expect(output).toContain('copper_wiring');
    expect(output).not.toContain('steel_plate');
  });

  test('renderResponse keeps view_market item payload raw in --json output', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'view_market',
        displayCommand: 'view_market',
        payload: { item_id: 'fuel_cell' },
        response: {
          structuredContent: {
            items: [
              { item_id: 'iron_ore', item_name: 'Iron Ore', best_sell: 18 },
              { item_id: 'fuel_cell', item_name: 'Fuel Cell', best_sell: 0 },
            ],
          },
        },
      },
      { ...baseOptions, dryRun: true, json: true },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(capture.text());
    expect(parsed.structuredContent.total_items).toBeUndefined();
    expect(parsed.structuredContent.items).toEqual([
      { item_id: 'iron_ore', item_name: 'Iron Ore', best_sell: 18 },
      { item_id: 'fuel_cell', item_name: 'Fuel Cell', best_sell: 0 },
    ]);
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
    expect(output).toContain('Cargo (2):');
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
    expect(output).toContain('Cargo (3):');
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
    expect(output).toContain('Cargo (2):');
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
    expect(output).toContain('Cargo (1):');
    expect(output).toContain('Iron Ore');
    expect(output).not.toContain('Copper Ore');
  });

  test('renderResponse keeps get_cargo top payload raw in JSON output', async () => {
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
    expect(parsed.structuredContent.cargo).toEqual([
      { item_id: 'ore_copper', item_name: 'Copper Ore', quantity: 12, size: 1 },
      { item_id: 'ore_iron', item_name: 'Iron Ore', quantity: 718, size: 1 },
    ]);
  });

  test('renderResponse applies get_cargo items filter to table output', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'get_cargo',
        displayCommand: 'get_cargo',
        payload: { items: 'ore_copper,fuel_cell', show_empty: 'true' },
        response: {
          structuredContent: {
            cargo: [
              { item_id: 'ore_copper', item_name: 'Copper Ore', quantity: 12, size: 1 },
              { item_id: 'ore_iron', item_name: 'Iron Ore', quantity: 718, size: 1 },
              { item_id: 'fuel_cell', item_name: 'Fuel Cell', quantity: 0, size: 1 },
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
    expect(output).toContain('Cargo (2):');
    expect(output).toContain('Copper Ore');
    expect(output).toContain('Fuel Cell');
    expect(output).not.toContain('Iron Ore');
  });

  test('renderResponse keeps get_cargo items payload raw in JSON output', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'get_cargo',
        displayCommand: 'get_cargo',
        payload: { items: 'ore_copper,fuel_cell', show_empty: 'true' },
        response: {
          structuredContent: {
            cargo: [
              { item_id: 'ore_copper', item_name: 'Copper Ore', quantity: 12, size: 1 },
              { item_id: 'ore_iron', item_name: 'Iron Ore', quantity: 718, size: 1 },
              { item_id: 'fuel_cell', item_name: 'Fuel Cell', quantity: 0, size: 1 },
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
    expect(parsed.structuredContent.cargo).toEqual([
      { item_id: 'ore_copper', item_name: 'Copper Ore', quantity: 12, size: 1 },
      { item_id: 'ore_iron', item_name: 'Iron Ore', quantity: 718, size: 1 },
      { item_id: 'fuel_cell', item_name: 'Fuel Cell', quantity: 0, size: 1 },
    ]);
  });
});
