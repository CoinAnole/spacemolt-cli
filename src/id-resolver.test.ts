import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { COMMANDS } from './commands';
import { cargoFixture, systemInfoFixture } from './display/formatter-fixtures';
import { cacheIdsFromResponse, getIdCachePath } from './id-cache';
import { preparePayload } from './main';
import type { GlobalOptions } from './types';

const internalCommandRegistry = { commands: COMMANDS };

function options(overrides: Partial<GlobalOptions> = {}): GlobalOptions {
  return {
    json: false,
    quiet: false,
    plain: false,
    allowUnknown: false,
    dryRun: false,
    fields: undefined,
    noTimestamp: false,
    compact: false,
    args: [],
    ...overrides,
  };
}

function useTempSession(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-id-resolver-'));
  const sessionPath = path.join(tempDir, 'sessions', 'pilot.json');
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  return sessionPath;
}

function writer(stdout: string[] = [], stderr: string[] = []) {
  return {
    out(message = '') {
      stdout.push(message);
    },
    err(message = '') {
      stderr.push(message);
    },
  };
}

function prepareInternalPayload(
  command: string,
  rawPayload: Record<string, unknown>,
  globalOptions: GlobalOptions,
  sessionPath?: string,
) {
  return preparePayload(command, rawPayload, globalOptions, sessionPath, undefined, internalCommandRegistry);
}

describe('cached ID payload resolver', () => {
  test('resolves travel target from cached POI name', async () => {
    const sessionPath = useTempSession();
    await cacheIdsFromResponse('get_system', { structuredContent: systemInfoFixture }, sessionPath);

    const prepared = preparePayload('travel', { target_poi: 'earth' }, options(), sessionPath);

    expect(prepared).toEqual({ type: 'payload', payload: { id: 'sol_earth' } });
  });

  test('keeps numeric jump bearings instead of resolving cached system IDs', () => {
    const sessionPath = useTempSession();
    fs.writeFileSync(
      getIdCachePath(sessionPath),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'system',
            id: '90_eridani',
            name: '90 Eridani',
            sourceCommand: 'get_system',
            seenAt: '2026-05-30T00:00:00.000Z',
          },
        ],
      })}\n`,
    );

    const prepared = preparePayload('jump', { target_system: '90' }, options(), sessionPath);

    expect(prepared).toEqual({ type: 'payload', payload: { id: '90' } });
  });

  test('strict default does not expand storage view station_id prefix; soft opt-in does', () => {
    const sessionPath = useTempSession();
    fs.writeFileSync(
      getIdCachePath(sessionPath),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'poi',
            id: 'node_beta_industrial_station',
            name: 'Node Beta Industrial Station',
            sourceCommand: 'get_system',
            seenAt: '2026-05-21T00:00:00.000Z',
          },
        ],
      })}\n`,
    );

    expect(prepareInternalPayload('storage_view', { station_id: 'node_beta' }, options(), sessionPath)).toEqual({
      type: 'payload',
      payload: { station_id: 'node_beta', target: 'self' },
    });

    const stderr: string[] = [];
    const prepared = prepareInternalPayload(
      'storage_view',
      { station_id: 'node_beta' },
      options({ fuzzyIds: true }),
      sessionPath,
    );
    // prepareInternalPayload has no writer — re-run with writer for notice
    const preparedWithNotice = preparePayload(
      'storage_view',
      { station_id: 'node_beta' },
      options({ fuzzyIds: true, plain: true }),
      sessionPath,
      writer([], stderr),
      internalCommandRegistry,
    );

    expect(prepared).toEqual({
      type: 'payload',
      payload: { station_id: 'node_beta_industrial_station', target: 'self' },
    });
    expect(preparedWithNotice).toEqual(prepared);
    expect(stderr.join('\n')).toContain(
      'resolved storage_view.station_id "node_beta" → "node_beta_industrial_station" (prefix)',
    );
  });

  test('bare storage_view empty payload still materializes target=self', () => {
    expect(prepareInternalPayload('storage_view', {}, options())).toEqual({
      type: 'payload',
      payload: { target: 'self' },
    });
  });

  test('strict default passes short sell item fragments; soft opt-in rewrites with notice', async () => {
    const sessionPath = useTempSession();
    await cacheIdsFromResponse('get_cargo', { structuredContent: cargoFixture }, sessionPath);

    expect(preparePayload('sell', { item_id: 'iron', quantity: '50' }, options(), sessionPath)).toEqual({
      type: 'payload',
      payload: { id: 'iron', quantity: 50 },
    });

    const stderr: string[] = [];
    const prepared = preparePayload(
      'sell',
      { item_id: 'iron', quantity: '50' },
      options({ fuzzyIds: true, plain: true }),
      sessionPath,
      writer([], stderr),
    );

    expect(prepared).toEqual({ type: 'payload', payload: { id: 'ore_iron', quantity: 50 } });
    // Alias normalization maps item_id → id before cache resolution.
    expect(stderr.join('\n')).toContain('resolved sell.id "iron" → "ore_iron" (prefix)');
  });

  test('quiet suppresses soft-resolution notices but still rewrites', async () => {
    const sessionPath = useTempSession();
    await cacheIdsFromResponse('get_cargo', { structuredContent: cargoFixture }, sessionPath);
    const stderr: string[] = [];

    const prepared = preparePayload(
      'sell',
      { item_id: 'iron', quantity: '50' },
      options({ fuzzyIds: true, quiet: true }),
      sessionPath,
      writer([], stderr),
    );

    expect(prepared).toEqual({ type: 'payload', payload: { id: 'ore_iron', quantity: 50 } });
    expect(stderr).toEqual([]);
  });

  test('keeps sell fuel reserved for ship tank fuel even when fuel cells are cached', () => {
    const sessionPath = useTempSession();
    fs.writeFileSync(
      getIdCachePath(sessionPath),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'item',
            id: 'fuel_cell',
            name: 'Fuel Cell',
            sourceCommand: 'catalog',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      })}\n`,
    );

    const fuel = preparePayload('sell', { item_id: 'fuel', quantity: '100' }, options(), sessionPath);
    const tankFuel = preparePayload('sell', { item_id: 'tank_fuel', quantity: '100' }, options(), sessionPath);

    expect(fuel).toEqual({ type: 'payload', payload: { id: 'fuel', quantity: 100 } });
    expect(tankFuel).toEqual({ type: 'payload', payload: { id: 'fuel', quantity: 100 } });
  });

  test('keeps real fuel item IDs reserved for fuel market and storage gift commands', () => {
    const sessionPath = useTempSession();
    fs.writeFileSync(
      getIdCachePath(sessionPath),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'item',
            id: 'fuel_cell',
            name: 'Fuel Cell',
            sourceCommand: 'catalog',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      })}\n`,
    );

    expect(
      prepareInternalPayload(
        'faction_create_sell_order',
        { item_id: 'fuel', quantity: '100', price_each: '7' },
        options(),
        sessionPath,
      ),
    ).toEqual({
      type: 'payload',
      payload: { item_id: 'fuel', quantity: 100, price_each: 7 },
    });
    expect(
      prepareInternalPayload(
        'faction_create_buy_order',
        { item_id: 'fuel', quantity: '100', price_each: '6' },
        options(),
        sessionPath,
      ),
    ).toEqual({
      type: 'payload',
      payload: { item_id: 'fuel', quantity: 100, price_each: 6 },
    });
    expect(
      prepareInternalPayload(
        'storage_deposit',
        { target: 'empire:crimson', item_id: 'fuel', quantity: '50' },
        options(),
        sessionPath,
      ),
    ).toEqual({
      type: 'payload',
      payload: { target: 'empire:crimson', item_id: 'fuel', quantity: 50 },
    });
  });

  test('soft match resolves storage action item aliases from cached item names', () => {
    const sessionPath = useTempSession();
    fs.writeFileSync(
      getIdCachePath(sessionPath),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'item',
            id: 'ore_iron',
            name: 'Iron Ore',
            sourceCommand: 'get_cargo',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      })}\n`,
    );

    for (const action of ['deposit', 'withdraw', 'loot', 'jettison']) {
      expect(
        prepareInternalPayload(
          `storage_${action}`,
          { item_id: 'iron', quantity: '2' },
          options({ fuzzyIds: true }),
          sessionPath,
        ),
      ).toEqual({
        type: 'payload',
        payload: { item_id: 'ore_iron', quantity: 2 },
      });
      // Strict: fragment passes through.
      expect(
        prepareInternalPayload(`storage_${action}`, { item_id: 'iron', quantity: '2' }, options(), sessionPath),
      ).toEqual({
        type: 'payload',
        payload: { item_id: 'iron', quantity: 2 },
      });
    }
  });

  test('soft match resolves storage loot wreck aliases from cached wreck names', () => {
    const sessionPath = useTempSession();
    fs.writeFileSync(
      getIdCachePath(sessionPath),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'wreck',
            id: 'wreck_iron',
            name: 'Iron Wreck',
            sourceCommand: 'get_wrecks',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      })}\n`,
    );

    expect(
      prepareInternalPayload('storage_loot', { wreck_id: 'iron' }, options({ fuzzyIds: true }), sessionPath),
    ).toEqual({
      type: 'payload',
      payload: { wreck_id: 'wreck_iron' },
    });
  });

  test('resolves faction player commands after player_id aliases normalize to id', () => {
    const sessionPath = useTempSession();
    fs.writeFileSync(
      getIdCachePath(sessionPath),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'player',
            id: 'player-marlowe',
            name: 'Marlowe',
            sourceCommand: 'get_nearby',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      })}\n`,
    );

    const prepared = prepareInternalPayload('faction_invite', { player_id: 'marlowe' }, options(), sessionPath);

    expect(prepared).toEqual({ type: 'payload', payload: { id: 'player-marlowe' } });
  });

  test('resolves battle_target after target_id alias normalizes to id', () => {
    const sessionPath = useTempSession();
    fs.writeFileSync(
      getIdCachePath(sessionPath),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'player',
            id: 'player-raider',
            name: 'Raider',
            sourceCommand: 'get_nearby',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      })}\n`,
    );

    const prepared = preparePayload('battle_target', { target_id: 'raider' }, options(), sessionPath);

    expect(prepared).toEqual({ type: 'payload', payload: { id: 'player-raider' } });
  });

  test('soft match resolves load_drone item prefix after drone_item_id alias normalizes to id', () => {
    const sessionPath = useTempSession();
    fs.writeFileSync(
      getIdCachePath(sessionPath),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'item',
            id: 'combat_drone',
            name: 'Combat Drone',
            sourceCommand: 'get_cargo',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      })}\n`,
    );

    expect(preparePayload('load_drone', { drone_item_id: 'combat' }, options(), sessionPath)).toEqual({
      type: 'payload',
      payload: { id: 'combat' },
    });

    const prepared = preparePayload(
      'load_drone',
      { drone_item_id: 'combat' },
      options({ fuzzyIds: true }),
      sessionPath,
    );

    expect(prepared).toEqual({ type: 'payload', payload: { id: 'combat_drone' } });
  });

  test('resolves list_ship_for_sale after ship_id alias normalizes to id', () => {
    const sessionPath = useTempSession();
    fs.writeFileSync(
      getIdCachePath(sessionPath),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'ship',
            id: 'ship-dust-devil',
            name: 'dust_devil',
            sourceCommand: 'list_ships',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      })}\n`,
    );

    const prepared = preparePayload(
      'list_ship_for_sale',
      { ship_id: 'dust_devil', price: '1000' },
      options(),
      sessionPath,
    );

    expect(prepared).toEqual({ type: 'payload', payload: { id: 'ship-dust-devil', price: 1000 } });
  });

  test('resolves reload ammo as an item but leaves weapon instance id unchanged', () => {
    const sessionPath = useTempSession();
    fs.writeFileSync(
      getIdCachePath(sessionPath),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'item',
            id: 'laser_cell',
            name: 'Laser Cell',
            sourceCommand: 'get_cargo',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
          {
            kind: 'player',
            id: 'player-laser',
            name: 'Laser Cell',
            sourceCommand: 'get_nearby',
            seenAt: '2026-05-18T00:01:00.000Z',
          },
        ],
      })}\n`,
    );

    const prepared = preparePayload(
      'reload',
      { weapon_instance_id: 'weapon-1', ammo_item_id: 'laser cell' },
      options(),
      sessionPath,
    );

    expect(prepared).toEqual({ type: 'payload', payload: { id: 'weapon-1', target: 'laser_cell' } });
  });

  test('does not resolve chat channel target as a player', () => {
    const sessionPath = useTempSession();
    fs.writeFileSync(
      getIdCachePath(sessionPath),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'player',
            id: 'player-system',
            name: 'system',
            sourceCommand: 'get_nearby',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      })}\n`,
    );

    const prepared = preparePayload('chat', { channel: 'system', content: 'hello' }, options(), sessionPath);

    expect(prepared).toEqual({ type: 'payload', payload: { target: 'system', content: 'hello' } });
  });

  test('does not resolve social target ids as players for note and forum commands', () => {
    const sessionPath = useTempSession();
    fs.writeFileSync(
      getIdCachePath(sessionPath),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'player',
            id: 'player-note',
            name: 'note-1',
            sourceCommand: 'get_nearby',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      })}\n`,
    );

    expect(preparePayload('read_note', { note_id: 'note-1' }, options(), sessionPath)).toEqual({
      type: 'payload',
      payload: { target: 'note-1' },
    });
    expect(prepareInternalPayload('forum_get_thread', { thread_id: 'note-1' }, options(), sessionPath)).toEqual({
      type: 'payload',
      payload: { target: 'note-1' },
    });
  });

  test('does not resolve empire targets as players', () => {
    const sessionPath = useTempSession();
    fs.writeFileSync(
      getIdCachePath(sessionPath),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'player',
            id: 'player-solarian',
            name: 'solarian',
            sourceCommand: 'get_nearby',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      })}\n`,
    );

    expect(preparePayload('petition', { empire_id: 'solarian', message: 'hello' }, options(), sessionPath)).toEqual({
      type: 'payload',
      payload: { target: 'solarian', content: 'hello' },
    });
    expect(prepareInternalPayload('citizenship_apply', { empire: 'solarian' }, options(), sessionPath)).toEqual({
      type: 'payload',
      payload: { target: 'solarian' },
    });
    expect(
      prepareInternalPayload('storage_deposit', { target: 'solarian', credits: '200' }, options(), sessionPath),
    ).toEqual({
      type: 'payload',
      payload: { target: 'solarian', credits: 200 },
    });
  });

  test('preserves storage bulk gift item objects while resolving player target', () => {
    const sessionPath = useTempSession();
    fs.writeFileSync(
      getIdCachePath(sessionPath),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'player',
            id: 'player-marlowe',
            name: 'Marlowe',
            sourceCommand: 'get_nearby',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      })}\n`,
    );

    expect(
      prepareInternalPayload(
        'storage_deposit',
        {
          target: 'Marlowe',
          items: [
            { item_id: 'ore_iron', quantity: 1 },
            { item_id: 'ore_copper', quantity: 2 },
          ],
        },
        options(),
        sessionPath,
      ),
    ).toEqual({
      type: 'payload',
      payload: {
        target: 'player-marlowe',
        items: [
          { item_id: 'ore_iron', quantity: 1 },
          { item_id: 'ore_copper', quantity: 2 },
        ],
      },
    });
  });

  test('preserves storage reserved targets instead of resolving cached players', () => {
    const sessionPath = useTempSession();
    fs.writeFileSync(
      getIdCachePath(sessionPath),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'player',
            id: 'player-faction',
            name: 'faction',
            sourceCommand: 'get_nearby',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
          {
            kind: 'player',
            id: 'player-faction-smc',
            name: 'faction:smc',
            sourceCommand: 'get_nearby',
            seenAt: '2026-05-18T00:01:00.000Z',
          },
        ],
      })}\n`,
    );

    for (const target of ['self', 'faction', 'faction:smc']) {
      expect(prepareInternalPayload('storage_deposit', { target, credits: '200' }, options(), sessionPath)).toEqual({
        type: 'payload',
        payload: { target, credits: 200 },
      });
    }
  });

  test('resolves faction diplomacy targets from cached faction tags after alias normalization', () => {
    const sessionPath = useTempSession();
    fs.writeFileSync(
      getIdCachePath(sessionPath),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'faction',
            id: 'faction-smc',
            name: 'SMC',
            sourceCommand: 'faction_list',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      })}\n`,
    );

    const prepared = prepareInternalPayload(
      'faction_declare_war',
      { target_faction_id: 'smc' },
      options(),
      sessionPath,
    );

    expect(prepared).toEqual({ type: 'payload', payload: { id: 'faction-smc' } });
  });

  test('resolves drone soft-prefix and wreck exact-name IDs from cache', () => {
    const sessionPath = useTempSession();
    fs.writeFileSync(
      getIdCachePath(sessionPath),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'drone',
            id: 'drone-1',
            name: 'Survey Drone',
            sourceCommand: 'list_drones',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
          {
            kind: 'wreck',
            id: 'wreck-1',
            name: 'Skiff',
            sourceCommand: 'get_wrecks',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      })}\n`,
    );

    // "survey" is prefix of name "Survey Drone" — soft only.
    expect(preparePayload('deploy_drone', { drone_id: 'survey' }, options(), sessionPath)).toEqual({
      type: 'payload',
      payload: { id: 'survey' },
    });
    expect(preparePayload('deploy_drone', { drone_id: 'survey' }, options({ fuzzyIds: true }), sessionPath)).toEqual({
      type: 'payload',
      payload: { id: 'drone-1' },
    });
    // "skiff" is exact name — always on under strict.
    expect(preparePayload('tow_wreck', { wreck_id: 'skiff' }, options(), sessionPath)).toEqual({
      type: 'payload',
      payload: { id: 'wreck-1' },
    });
  });

  test('resolves facility and listing IDs from cache', () => {
    const sessionPath = useTempSession();
    fs.writeFileSync(
      getIdCachePath(sessionPath),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'facility',
            id: 'facility-1',
            name: 'Fuel Bunker',
            sourceCommand: 'facility_list',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
          {
            kind: 'listing',
            id: 'listing-1',
            name: 'Fuel Bunker Listing',
            sourceCommand: 'facility_browse_for_sale',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
          {
            kind: 'item',
            id: 'steel_plate',
            name: 'Steel Plate',
            sourceCommand: 'catalog',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      })}\n`,
    );

    expect(prepareInternalPayload('facility_job_list', { facility_id: 'fuel bunker' }, options(), sessionPath)).toEqual(
      {
        type: 'payload',
        payload: { facility_id: 'facility-1' },
      },
    );
    expect(
      prepareInternalPayload(
        'facility_set_access',
        { facility_id: 'fuel bunker', access: 'public' },
        options(),
        sessionPath,
      ),
    ).toEqual({
      type: 'payload',
      payload: { facility_id: 'facility-1', access: 'public' },
    });
    expect(
      prepareInternalPayload(
        'facility_set_output_price',
        { facility_id: 'fuel bunker', price: '25' },
        options(),
        sessionPath,
      ),
    ).toEqual({
      type: 'payload',
      payload: { facility_id: 'facility-1', price: 25 },
    });
    expect(
      prepareInternalPayload('facility_buy_listing', { listing_id: 'fuel bunker listing' }, options(), sessionPath),
    ).toEqual({
      type: 'payload',
      payload: { listing_id: 'listing-1' },
    });
  });

  test('stops before execution on ambiguous cached item matches under soft match', () => {
    const sessionPath = useTempSession();
    fs.writeFileSync(
      getIdCachePath(sessionPath),
      `${JSON.stringify(
        {
          version: 1,
          hints: [
            {
              kind: 'item',
              id: 'ore_iron',
              name: 'Iron Ore',
              sourceCommand: 'get_cargo',
              seenAt: '2026-05-18T00:00:00.000Z',
            },
            {
              kind: 'item',
              id: 'iron_plate',
              name: 'Iron Plate',
              sourceCommand: 'catalog',
              seenAt: '2026-05-18T00:01:00.000Z',
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    const stderr: string[] = [];

    // Strict: soft stages disabled → pass-through, no ambiguity.
    expect(
      preparePayload('sell', { item_id: 'iron', quantity: '50' }, options(), sessionPath, writer([], [])),
    ).toEqual({ type: 'payload', payload: { id: 'iron', quantity: 50 } });

    const prepared = preparePayload(
      'sell',
      { item_id: 'iron', quantity: '50' },
      options({ fuzzyIds: true }),
      sessionPath,
      writer([], stderr),
    );

    expect(prepared).toEqual({ type: 'exit', exitCode: 1 });
    expect(stderr.join('\n')).toContain('Ambiguous cached item match for "iron"');
    expect(stderr.join('\n')).toContain('iron_plate');
    expect(stderr.join('\n')).toContain('ore_iron');
  });

  test('prints JSON error for ambiguous cached ID matches in JSON mode under soft match', () => {
    const sessionPath = useTempSession();
    fs.writeFileSync(
      getIdCachePath(sessionPath),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'item',
            id: 'ore_iron',
            name: 'Iron Ore',
            sourceCommand: 'get_cargo',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
          {
            kind: 'item',
            id: 'iron_plate',
            name: 'Iron Plate',
            sourceCommand: 'catalog',
            seenAt: '2026-05-18T00:01:00.000Z',
          },
        ],
      })}\n`,
    );
    const stdout: string[] = [];
    const stderr: string[] = [];

    const prepared = preparePayload(
      'sell',
      { item_id: 'iron', quantity: '50' },
      options({ json: true, fuzzyIds: true }),
      sessionPath,
      writer(stdout, stderr),
    );

    expect(prepared).toEqual({ type: 'exit', exitCode: 1 });
    expect(stdout).toEqual([]);
    const parsed = JSON.parse(stderr.join('\n'));
    expect(parsed.error.code).toBe('ambiguous_cached_id');
    expect(parsed.error.message).toContain('ore_iron');
    expect(parsed.error.message).toContain('iron_plate');
  });

  test('incident regression: find_route/jump haven never rewrites to crosshaven', () => {
    const sessionPath = useTempSession();
    fs.writeFileSync(
      getIdCachePath(sessionPath),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'system',
            id: 'crosshaven',
            name: 'Crosshaven',
            sourceCommand: 'get_map',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      })}\n`,
    );

    for (const command of ['find_route', 'jump'] as const) {
      // Default strict
      expect(preparePayload(command, { target_system: 'haven' }, options(), sessionPath)).toEqual({
        type: 'payload',
        payload: { id: 'haven' },
      });
      // Soft opt-in still bans system substring
      expect(
        preparePayload(command, { target_system: 'haven' }, options({ fuzzyIds: true }), sessionPath),
      ).toEqual({
        type: 'payload',
        payload: { id: 'haven' },
      });
    }

    // Soft system prefix still works with notice.
    const stderr: string[] = [];
    expect(
      preparePayload(
        'find_route',
        { target_system: 'cro' },
        options({ fuzzyIds: true, plain: true }),
        sessionPath,
        writer([], stderr),
      ),
    ).toEqual({
      type: 'payload',
      payload: { id: 'crosshaven' },
    });
    expect(stderr.join('\n')).toContain('resolved find_route.id "cro" → "crosshaven" (prefix)');
  });

  test('exact name rewrites stay silent under strict (no soft notice)', async () => {
    const sessionPath = useTempSession();
    await cacheIdsFromResponse('get_system', { structuredContent: systemInfoFixture }, sessionPath);
    const stderr: string[] = [];

    const prepared = preparePayload(
      'travel',
      { target_poi: 'earth' },
      options(),
      sessionPath,
      writer([], stderr),
    );

    expect(prepared).toEqual({ type: 'payload', payload: { id: 'sol_earth' } });
    expect(stderr).toEqual([]);
  });

  test('array string elements apply reserved values and soft policy per element', () => {
    const sessionPath = useTempSession();
    fs.writeFileSync(
      getIdCachePath(sessionPath),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'item',
            id: 'ore_iron',
            name: 'Iron Ore',
            sourceCommand: 'get_cargo',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
          {
            kind: 'item',
            id: 'fuel_cell',
            name: 'Fuel Cell',
            sourceCommand: 'catalog',
            seenAt: '2026-05-18T00:01:00.000Z',
          },
        ],
      })}\n`,
    );

    // Synthetic command not in COMMAND_ID_RESOLVER_RULES → field-name heuristic (item_* → item).
    const syntheticRegistry = {
      commands: {
        batch_probe: {
          args: ['item_ids'],
          route: { tool: 'probe', action: 'batch', method: 'POST' as const },
          schema: { item_ids: { type: 'array' } },
        },
      },
    };
    const stderr: string[] = [];
    const prepared = preparePayload(
      'batch_probe',
      { item_ids: ['iron', 'fuel', 'tank_fuel', 'cell'] },
      options({ fuzzyIds: true, plain: true }),
      sessionPath,
      writer([], stderr),
      syntheticRegistry,
    );

    expect(prepared).toEqual({
      type: 'payload',
      payload: { item_ids: ['ore_iron', 'fuel', 'fuel', 'fuel_cell'] },
    });
    // Reserved fuel tokens never soft-rewrite or notice; soft rewrites notice once each.
    expect(stderr.filter((line) => line.includes('resolved'))).toHaveLength(2);
    expect(stderr.join('\n')).toContain('resolved batch_probe.item_ids "iron" → "ore_iron" (prefix)');
    expect(stderr.join('\n')).toContain('resolved batch_probe.item_ids "cell" → "fuel_cell" (substring)');
    expect(stderr.join('\n')).not.toContain('"fuel"');
  });

  test('heuristic id fields on unmapped commands use the same strict/soft policies', () => {
    const sessionPath = useTempSession();
    fs.writeFileSync(
      getIdCachePath(sessionPath),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'system',
            id: 'crosshaven',
            name: 'Crosshaven',
            sourceCommand: 'get_map',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
          {
            kind: 'ship',
            id: 'ship-1',
            name: 'Dust Devil',
            sourceCommand: 'list_ships',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      })}\n`,
    );
    const syntheticRegistry = {
      commands: {
        unknown_probe: {
          args: ['target_system_id', 'ship_id'],
          route: { tool: 'probe', action: 'unknown', method: 'POST' as const },
          schema: {
            target_system_id: { type: 'string' },
            ship_id: { type: 'string' },
          },
        },
      },
    };

    // Strict: no soft rewrite.
    expect(
      preparePayload(
        'unknown_probe',
        { target_system_id: 'haven', ship_id: 'dust' },
        options(),
        sessionPath,
        undefined,
        syntheticRegistry,
      ),
    ).toEqual({
      type: 'payload',
      payload: { target_system_id: 'haven', ship_id: 'dust' },
    });

    // Soft: system substring still blocked; ship prefix allowed.
    expect(
      preparePayload(
        'unknown_probe',
        { target_system_id: 'haven', ship_id: 'dust' },
        options({ fuzzyIds: true }),
        sessionPath,
        undefined,
        syntheticRegistry,
      ),
    ).toEqual({
      type: 'payload',
      payload: { target_system_id: 'haven', ship_id: 'ship-1' },
    });
  });
});
