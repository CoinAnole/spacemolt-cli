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
    expect(capture.stdout.join('\n')).not.toContain('\x1b[');
  });

  test('renderResponse warns when old server help filters are ignored by the API', async () => {
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

    const rawStderr = capture.stderr.join('\n');
    const stderr = rawStderr.replace(ANSI_PATTERN, '');
    expect(exitCode).toBe(0);
    expect(capture.text()).toContain('All server commands');
    expect(stderr).toContain('server help accepts topic=<command|category|search>');
    expect(stderr).toContain('category/command filters are ignored');
    expect(stderr).toContain('spacemolt help <command>');
    expect(rawStderr).not.toContain('\x1b[');
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
      { ...baseOptions, structured: true },
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

  test('renderResponse truncates nearby collections in --structured output without mutating the response', async () => {
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
    expect(parsed.nearby).toHaveLength(10);
    expect(parsed.empire_npcs).toHaveLength(10);
    expect(parsed.nearby_player_count).toBe(12);
    expect(parsed.nearby_empire_npc_count).toBe(13);
    expect(parsed.nearby[9].username).toBe('Pilot 10');
    expect(parsed.empire_npcs[9].name).toBe('Patrol 10');
    expect(structuredContent.nearby).toHaveLength(12);
    expect(structuredContent.empire_npcs).toHaveLength(13);
  });

  test('renderResponse normalizes list_ships --structured output to canonical fields', async () => {
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
    expect(parsed.ships).toEqual([
      expect.objectContaining({
        ship_id: 'ship-active',
        ship_class: 'lithosphere',
        custom_name: 'Burn-Rate Betty',
        name: 'Burn-Rate Betty',
        active: true,
        location: {
          system_id: null,
          poi_id: null,
          docked: false,
          raw: 'active (with you)',
        },
      }),
      expect.objectContaining({
        ship_id: 'ship-stored',
        ship_class: 'dust_devil',
        custom_name: null,
        name: null,
        active: false,
        location: {
          system_id: null,
          poi_id: 'nova_terra_central',
          docked: true,
          raw: 'stored at Nova Terra Central',
        },
      }),
    ]);
    expect(parsed.ships[0].is_active).toBe(true);
    expect(parsed.ships[1].location).not.toBe('stored at Nova Terra Central');
    const originalStoredShip = structuredContent.ships[1];
    expect(originalStoredShip).toBeDefined();
    if (!originalStoredShip) throw new Error('missing stored ship fixture');
    expect(originalStoredShip.location).toBe('stored at Nova Terra Central');
  });

  test('renderResponse applies view_storage item filter to --json output', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'view_storage',
        displayCommand: 'view_storage',
        payload: { item_id: 'iron_ore' },
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
    expect(parsed.structuredContent.items).toEqual([expect.objectContaining({ item_id: 'iron_ore' })]);
  });

  test('renderResponse applies view_storage search filter to --structured output', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'view_storage',
        displayCommand: 'view_storage',
        payload: { search: 'fuel' },
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
    expect(parsed.items).toEqual([expect.objectContaining({ item_id: 'fuel_cell' })]);
  });

  test('renderResponse treats comma-separated storage search terms as alternatives', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'view_storage',
        displayCommand: 'view_storage',
        payload: { search: 'Copper Wiring,Steel Plate' },
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
      { ...baseOptions, dryRun: true, structured: true },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(capture.text());
    expect(parsed.items).toEqual([
      expect.objectContaining({ item_id: 'copper_wiring' }),
      expect.objectContaining({ item_id: 'steel_plate' }),
    ]);
  });

  test('renderResponse normalizes storage search separators against item IDs', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'view_storage',
        displayCommand: 'view_storage',
        payload: { search: 'copper wiring' },
        response: {
          structuredContent: {
            items: [
              { item_id: 'copper_wiring', quantity: 5 },
              { item_id: 'steel_plate', quantity: 7 },
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
    expect(parsed.items).toEqual([expect.objectContaining({ item_id: 'copper_wiring' })]);
  });

  test('renderResponse applies view_market item filter to --json output', async () => {
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
    expect(parsed.structuredContent.total_items).toBe(2);
    expect(parsed.structuredContent.items).toEqual([expect.objectContaining({ item_id: 'fuel_cell' })]);
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

  test('renderResponse applies get_cargo filters to JSON output', async () => {
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
    expect(parsed.structuredContent.cargo).toHaveLength(1);
    expect(parsed.structuredContent.cargo[0].item_id).toBe('ore_iron');
  });
});
