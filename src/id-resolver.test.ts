import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cargoFixture, systemInfoFixture } from './display/formatter-fixtures';
import { cacheIdsFromResponse, getIdCachePath } from './id-cache';
import { preparePayload } from './main';
import type { GlobalOptions } from './types';

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

describe('cached ID payload resolver', () => {
  test('resolves travel target from cached POI name', async () => {
    const sessionPath = useTempSession();
    await cacheIdsFromResponse('get_system', { structuredContent: systemInfoFixture }, sessionPath);

    const prepared = preparePayload('travel', { target_poi: 'earth' }, options(), sessionPath);

    expect(prepared).toEqual({ type: 'payload', payload: { id: 'sol_earth' } });
  });

  test('resolves view_storage station_id from cached station POI prefix', () => {
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

    const prepared = preparePayload('view_storage', { station_id: 'node_beta' }, options(), sessionPath);

    expect(prepared).toEqual({
      type: 'payload',
      payload: { station_id: 'node_beta_industrial_station' },
    });
  });

  test('resolves sell item from cached item name before type conversion', async () => {
    const sessionPath = useTempSession();
    await cacheIdsFromResponse('get_cargo', { structuredContent: cargoFixture }, sessionPath);

    const prepared = preparePayload('sell', { item_id: 'iron', quantity: '50' }, options(), sessionPath);

    expect(prepared).toEqual({ type: 'payload', payload: { id: 'ore_iron', quantity: 50 } });
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

    const prepared = preparePayload('faction_invite', { player_id: 'marlowe' }, options(), sessionPath);

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

  test('resolves load_drone item names after drone_item_id alias normalizes to id', () => {
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

    const prepared = preparePayload('load_drone', { drone_item_id: 'combat' }, options(), sessionPath);

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
    expect(preparePayload('forum_get_thread', { thread_id: 'note-1' }, options(), sessionPath)).toEqual({
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
    expect(preparePayload('citizenship_apply', { empire: 'solarian' }, options(), sessionPath)).toEqual({
      type: 'payload',
      payload: { target: 'solarian' },
    });
  });

  test('stops before execution on ambiguous cached item matches', () => {
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

    const prepared = preparePayload(
      'sell',
      { item_id: 'iron', quantity: '50' },
      options(),
      sessionPath,
      writer([], stderr),
    );

    expect(prepared).toEqual({ type: 'exit', exitCode: 1 });
    expect(stderr.join('\n')).toContain('Ambiguous cached item match for "iron"');
    expect(stderr.join('\n')).toContain('iron_plate');
    expect(stderr.join('\n')).toContain('ore_iron');
  });

  test('prints JSON error for ambiguous cached ID matches in JSON mode', () => {
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

    const prepared = preparePayload(
      'sell',
      { item_id: 'iron', quantity: '50' },
      options({ json: true }),
      sessionPath,
      writer(stdout),
    );

    expect(prepared).toEqual({ type: 'exit', exitCode: 1 });
    const parsed = JSON.parse(stdout.join('\n'));
    expect(parsed.error.code).toBe('ambiguous_cached_id');
    expect(parsed.error.message).toContain('ore_iron');
    expect(parsed.error.message).toContain('iron_plate');
  });
});
