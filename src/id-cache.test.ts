import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cargoFixture, nearbyFixture, systemInfoFixture, viewMarketFixture } from './display/formatter-fixtures';
import {
  cacheIdsFromResponse,
  commandResolverFields,
  extractIdHints,
  formatCachedIdAmbiguity,
  getIdCachePath,
  hintsForKind,
  idKindForCommandField,
  loadIdCacheSync,
  printCachedIdSuggestions,
  printIds,
  printWhereCanI,
  resolveCachedId,
  saveIdCache,
  searchItemHints,
} from './id-cache';

describe('id cache', () => {
  test('extracts POI and system IDs from get_system output', () => {
    const hints = extractIdHints('get_system', systemInfoFixture, '2026-05-18T00:00:00.000Z');

    expect(hints).toContainEqual(
      expect.objectContaining({ kind: 'poi', id: 'sol_earth', name: 'Earth', sourceCommand: 'get_system' }),
    );
    expect(hints).toContainEqual(
      expect.objectContaining({ kind: 'system', id: 'alpha_centauri', name: 'Alpha Centauri' }),
    );
  });

  test('extracts item and player IDs from common query outputs', () => {
    const cargoHints = extractIdHints('get_cargo', cargoFixture, '2026-05-18T00:00:00.000Z');
    const marketHints = extractIdHints('view_market', viewMarketFixture, '2026-05-18T00:00:00.000Z');
    const nearbyHints = extractIdHints('get_nearby', nearbyFixture, '2026-05-18T00:00:00.000Z');

    expect(cargoHints).toContainEqual(expect.objectContaining({ kind: 'item', id: 'ore_iron', name: 'Iron Ore' }));
    expect(marketHints).toContainEqual(expect.objectContaining({ kind: 'item', id: 'fuel_cell', name: 'Fuel Cell' }));
    expect(nearbyHints).toContainEqual(expect.objectContaining({ kind: 'player', id: 'Marlowe', name: 'Marlowe' }));
  });

  test('extracts ship IDs from stored ship listings', () => {
    const hints = extractIdHints(
      'list_ships',
      {
        ships: [
          {
            ship_id: 'ship-1',
            class_id: 'dust_devil',
            class_name: 'Dust Devil',
            location_base_id: 'earth_station',
            is_active: false,
          },
        ],
        count: 1,
      },
      '2026-05-18T00:00:00.000Z',
    );

    expect(hints).toContainEqual(
      expect.objectContaining({
        kind: 'ship',
        id: 'ship-1',
        name: 'dust_devil',
        context: expect.objectContaining({ class_name: 'Dust Devil', location_base_id: 'earth_station' }),
      }),
    );
  });

  test('extracts faction IDs from faction-shaped responses', () => {
    const hints = extractIdHints(
      'faction_list',
      {
        factions: [
          {
            faction_id: 'smc',
            tag: 'SMC',
            name: 'Space Mining Collective',
          },
        ],
      },
      '2026-05-18T00:00:00.000Z',
    );

    expect(hints).toContainEqual(
      expect.objectContaining({
        kind: 'faction',
        id: 'smc',
        name: 'SMC',
      }),
    );
  });

  test('extracts drone and wreck IDs from common responses', () => {
    const droneHints = extractIdHints(
      'list_drones',
      { drones: [{ drone_id: 'drone-1', name: 'Survey Drone', status: 'loaded' }] },
      '2026-05-18T00:00:00.000Z',
    );
    const wreckHints = extractIdHints(
      'get_wrecks',
      { wrecks: [{ wreck_id: 'wreck-1', ship_class: 'Skiff', ticks_remaining: 5 }] },
      '2026-05-18T00:00:00.000Z',
    );

    expect(droneHints).toContainEqual(expect.objectContaining({ kind: 'drone', id: 'drone-1', name: 'Survey Drone' }));
    expect(wreckHints).toContainEqual(expect.objectContaining({ kind: 'wreck', id: 'wreck-1', name: 'Skiff' }));
  });

  test('extracts facility and listing IDs from facility responses', () => {
    const hints = extractIdHints(
      'facility_list',
      {
        facilities: [{ facility_id: 'facility-1', name: 'Fuel Bunker', facility_type: 'fuel_bunker' }],
        listings: [{ listing_id: 'listing-1', facility_id: 'facility-1', name: 'Fuel Bunker' }],
      },
      '2026-05-18T00:00:00.000Z',
    );

    expect(hints).toContainEqual(expect.objectContaining({ kind: 'facility', id: 'facility-1', name: 'Fuel Bunker' }));
    expect(hints).toContainEqual(expect.objectContaining({ kind: 'listing', id: 'listing-1', name: 'Fuel Bunker' }));
  });

  test('extracts package IDs from inspect and cargo package: items', () => {
    const inspectHints = extractIdHints(
      'inspect',
      {
        id: 'package:pkg_abc',
        kind: 'package',
        package: {
          package_id: 'pkg_abc',
          label: 'Main Belt Survey Supplies',
          size: 100,
          created_at: '2026-07-16T12:00:00Z',
        },
      },
      '2026-05-18T00:00:00.000Z',
    );
    const cargoHints = extractIdHints(
      'get_cargo',
      {
        cargo: [
          { item_id: 'package:pkg_xyz', item_name: 'Smelter Feedstock', quantity: 1, size: 100 },
          { item_id: 'ore_iron', item_name: 'Iron Ore', quantity: 5, size: 5 },
        ],
      },
      '2026-05-18T00:00:00.000Z',
    );

    expect(inspectHints).toContainEqual(
      expect.objectContaining({
        kind: 'package',
        id: 'pkg_abc',
        name: 'Main Belt Survey Supplies',
        context: expect.objectContaining({ size: 100, created_at: '2026-07-16T12:00:00Z' }),
      }),
    );
    // Nested package payload should win; no thin top-level overwrite dropping context.
    expect(inspectHints.filter((hint) => hint.kind === 'package' && hint.id === 'pkg_abc')).toHaveLength(1);
    expect(cargoHints).toContainEqual(
      expect.objectContaining({ kind: 'package', id: 'pkg_xyz', name: 'Smelter Feedstock' }),
    );
    expect(cargoHints).toContainEqual(expect.objectContaining({ kind: 'item', id: 'package:pkg_xyz' }));
    expect(cargoHints).toContainEqual(expect.objectContaining({ kind: 'item', id: 'ore_iron' }));
  });

  test('resolves package: inspect form to bare cached package_id', () => {
    const hints = [
      {
        kind: 'package' as const,
        id: 'pkg_abc',
        name: 'Main Belt Survey Supplies',
        sourceCommand: 'inspect',
        seenAt: '2026-05-18T00:00:00.000Z',
        context: { size: 100 },
      },
    ];

    expect(resolveCachedId('package', 'package:pkg_abc', hints)).toEqual(
      expect.objectContaining({ type: 'resolved', value: 'pkg_abc', match: 'exact' }),
    );
    expect(resolveCachedId('package', 'pkg_abc', hints)).toEqual(
      expect.objectContaining({ type: 'resolved', value: 'pkg_abc', match: 'exact' }),
    );
    // Uncached package: form still normalizes to the bare instance id for API fields.
    expect(resolveCachedId('package', 'package:unknown_pkg', hints)).toEqual({
      type: 'unresolved',
      value: 'unknown_pkg',
    });
  });

  test('persists hints next to the active session path', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-id-cache-'));
    const sessionPath = path.join(tempDir, 'sessions', 'pilot.json');

    await cacheIdsFromResponse('get_cargo', { structuredContent: cargoFixture }, sessionPath);

    const hints = loadIdCacheSync(sessionPath);
    expect(hintsForKind('item', hints)).toContainEqual(expect.objectContaining({ id: 'ore_iron' }));
    expect(searchItemHints('iron', hints)).toContainEqual(expect.objectContaining({ id: 'ore_iron' }));
  });

  test('cache writes preserve existing valid cache contents', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-id-cache-'));
    const sessionPath = path.join(tempDir, 'sessions', 'pilot.json');
    const cachePath = getIdCachePath(sessionPath);
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(
      cachePath,
      `${JSON.stringify(
        {
          version: 1,
          hints: [
            {
              kind: 'system',
              id: 'alpha_centauri',
              name: 'Alpha Centauri',
              sourceCommand: 'get_system',
              seenAt: '2026-05-18T00:00:00.000Z',
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    await cacheIdsFromResponse('get_cargo', { structuredContent: cargoFixture }, sessionPath);

    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as {
      hints: Array<{ kind: string; id: string }>;
    };
    expect(cache.hints).toContainEqual(expect.objectContaining({ kind: 'system', id: 'alpha_centauri' }));
    expect(cache.hints).toContainEqual(expect.objectContaining({ kind: 'item', id: 'ore_iron' }));
  });

  test('cacheIdsFromResponse accepts a deterministic clock for seenAt', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-id-cache-'));
    const sessionPath = path.join(tempDir, 'pilot.json');

    await cacheIdsFromResponse('get_cargo', { structuredContent: cargoFixture }, sessionPath, {
      now: () => new Date('2026-05-20T12:34:56.000Z'),
    });

    const hints = loadIdCacheSync(sessionPath);
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.every((hint) => hint.seenAt === '2026-05-20T12:34:56.000Z')).toBe(true);
  });

  test('saveIdCache writes through a cleaned-up 0600 cache file', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-id-cache-'));
    const sessionPath = path.join(tempDir, 'pilot.json');

    await saveIdCache(
      [
        {
          kind: 'item',
          id: 'ore_iron',
          name: 'Iron Ore',
          sourceCommand: 'get_cargo',
          seenAt: '2026-05-18T00:00:00.000Z',
        },
      ],
      sessionPath,
    );

    const cachePath = getIdCachePath(sessionPath);
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as {
      version: number;
      hints: Array<{ id: string }>;
    };
    expect(cache.version).toBe(1);
    expect(cache.hints).toContainEqual(expect.objectContaining({ id: 'ore_iron' }));
    if (process.platform !== 'win32') {
      expect(fs.statSync(cachePath).mode & 0o777).toBe(0o600);
    }
    expect(fs.readdirSync(tempDir).filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
  });

  test('resolves exact, prefix, and substring matches conservatively', () => {
    const hints = [
      {
        kind: 'item' as const,
        id: 'ore_iron',
        name: 'Iron Ore',
        sourceCommand: 'get_cargo',
        seenAt: '2026-05-18T00:00:00.000Z',
      },
      {
        kind: 'item' as const,
        id: 'fuel_cell',
        name: 'Fuel Cell',
        sourceCommand: 'view_market',
        seenAt: '2026-05-18T00:01:00.000Z',
      },
    ];

    expect(resolveCachedId('item', 'ORE_IRON', hints)).toEqual(
      expect.objectContaining({ type: 'resolved', value: 'ore_iron', match: 'exact' }),
    );
    expect(resolveCachedId('item', 'fuel', hints)).toEqual(
      expect.objectContaining({ type: 'resolved', value: 'fuel_cell', match: 'prefix' }),
    );
    expect(resolveCachedId('item', 'cell', hints)).toEqual(
      expect.objectContaining({ type: 'resolved', value: 'fuel_cell', match: 'substring' }),
    );
    expect(resolveCachedId('item', 'gold', hints)).toEqual({ type: 'unresolved', value: 'gold' });
  });

  test('reports ambiguity for partial matches across multiple cached IDs', () => {
    const hints = [
      {
        kind: 'item' as const,
        id: 'ore_iron',
        name: 'Iron Ore',
        sourceCommand: 'get_cargo',
        seenAt: '2026-05-18T00:00:00.000Z',
      },
      {
        kind: 'item' as const,
        id: 'iron_plate',
        name: 'Iron Plate',
        sourceCommand: 'catalog',
        seenAt: '2026-05-18T00:01:00.000Z',
      },
    ];

    const result = resolveCachedId('item', 'iron', hints);

    expect(result.type).toBe('ambiguous');
    if (result.type !== 'ambiguous') throw new Error('expected ambiguity');
    expect(result.matches.map((hint) => hint.id)).toEqual(['iron_plate', 'ore_iron']);
  });

  test('formatCachedIdAmbiguity truncates long match lists', () => {
    const matches = Array.from({ length: 10 }, (_, index) => ({
      kind: 'item' as const,
      id: `ore_${index + 1}`,
      name: `Ore ${index + 1}`,
      sourceCommand: 'catalog',
      seenAt: `2026-05-18T00:0${index}:00.000Z`,
    }));

    const lines = formatCachedIdAmbiguity('sell', 'item_id', {
      type: 'ambiguous',
      kind: 'item',
      query: 'ore',
      matches,
    });

    expect(lines.filter((line) => line.includes('ore_'))).toHaveLength(8);
    expect(lines.join('\n')).toContain('...and 2 more');
  });

  test('formatCachedIdAmbiguity supports explicit plain output', () => {
    const lines = formatCachedIdAmbiguity(
      'sell',
      'item_id',
      {
        type: 'ambiguous',
        kind: 'item',
        query: 'ore',
        matches: [
          {
            kind: 'item',
            id: 'ore_iron',
            name: 'Iron Ore',
            sourceCommand: 'catalog',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      },
      { plain: true },
    );

    expect(lines.join('\n')).toContain('Ambiguous cached item match');
    expect(lines.join('\n')).not.toContain('\x1b[');
  });

  test('printCachedIdSuggestions respects explicit quiet output', async () => {
    const sessionPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-id-cache-quiet-test-')),
      'pilot.json',
    );
    await saveIdCache(
      [
        {
          kind: 'item',
          id: 'ore_iron',
          name: 'Iron Ore',
          sourceCommand: 'get_cargo',
          seenAt: '2026-05-18T00:00:00.000Z',
        },
      ],
      sessionPath,
    );
    const stderr: string[] = [];

    printCachedIdSuggestions(
      'sell',
      'item_id',
      sessionPath,
      { out() {}, err: (message = '') => stderr.push(message) },
      {
        quiet: true,
      },
    );

    expect(stderr).toEqual([]);
  });

  test('printIds supports explicit plain output', async () => {
    const sessionPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-id-cache-ids-test-')), 'pilot.json');
    await saveIdCache(
      [
        {
          kind: 'item',
          id: 'ore_iron',
          name: 'Iron Ore',
          sourceCommand: 'get_cargo',
          seenAt: '2026-05-18T00:00:00.000Z',
        },
      ],
      sessionPath,
    );
    const stdout: string[] = [];

    printIds('item', sessionPath, { out: (message = '') => stdout.push(message), err() {} }, undefined, {
      plain: true,
    });

    expect(stdout.join('\n')).toContain('item IDs');
    expect(stdout.join('\n')).not.toContain('\x1b[');
  });

  test('printWhereCanI supports explicit plain output', async () => {
    const sessionPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-id-cache-where-test-')),
      'pilot.json',
    );
    await saveIdCache(
      [
        {
          kind: 'item',
          id: 'ore_iron',
          name: 'Iron Ore',
          sourceCommand: 'view_market',
          seenAt: '2026-05-18T00:00:00.000Z',
        },
      ],
      sessionPath,
    );
    const stdout: string[] = [];

    printWhereCanI('iron', sessionPath, { out: (message = '') => stdout.push(message), err() {} }, { plain: true });

    expect(stdout.join('\n')).toContain('Cached locations for "iron"');
    expect(stdout.join('\n')).not.toContain('\x1b[');
  });

  test('idKindForCommandField uses explicit command resolver rules before heuristics', () => {
    expect(idKindForCommandField('travel', 'id')).toBe('poi');
    expect(idKindForCommandField('jump', 'id')).toBe('system');
    expect(idKindForCommandField('sell', 'id')).toBe('item');
    expect(idKindForCommandField('fleet_invite', 'id')).toBe('player');
    expect(idKindForCommandField('switch_ship', 'id')).toBe('ship');
    expect(idKindForCommandField('craft', 'package_id')).toBe('package');
    expect(idKindForCommandField('facility_job_add', 'package_id')).toBe('package');
    expect(idKindForCommandField('unknown_command', 'target_system_id')).toBe('system');
    expect(idKindForCommandField('unknown_command', 'ship_id')).toBe('ship');
    expect(idKindForCommandField('unknown_command', 'package_id')).toBe('package');
    expect(idKindForCommandField('travel', 'target_system_id')).toBeUndefined();
  });

  test('resolver rules cover alias-normalized target fields for commands with friendly ID fields', () => {
    const resolvableAliases = [
      ['switch_ship', 'ship_id', 'id', 'ship'],
      ['scrap_ship', 'ship_id', 'id', 'ship'],
      ['list_ship_for_sale', 'ship_id', 'id', 'ship'],
      ['buy_listed_ship', 'listing_id', 'id', 'listing'],
      ['cancel_ship_listing', 'listing_id', 'id', 'listing'],
      ['faction_invite', 'player_id', 'id', 'player'],
      ['faction_withdraw_invite', 'player_id', 'id', 'player'],
      ['faction_kick', 'player_id', 'id', 'player'],
      ['faction_promote', 'player_id', 'id', 'player'],
      ['faction_propose_ally', 'target_faction_id', 'id', 'faction'],
      ['battle_target', 'target_id', 'id', 'player'],
      ['load_drone', 'drone_item_id', 'id', 'item'],
      ['reload', 'ammo_item_id', 'target', 'item'],
      ['craft', 'package_id', 'package_id', 'package'],
      ['facility_job_add', 'package_id', 'package_id', 'package'],
    ] as const;

    for (const [command, _friendlyField, normalizedField, kind] of resolvableAliases) {
      const rules = commandResolverFields(command);
      expect(rules?.[kind]).toContain(normalizedField);
    }
  });

  test('hintsForKind returns only cached IDs for the inferred command field kind', () => {
    const hints = [
      {
        kind: 'item' as const,
        id: 'ore_iron',
        name: 'Iron Ore',
        sourceCommand: 'get_cargo',
        seenAt: '2026-05-18T00:00:00.000Z',
      },
      {
        kind: 'poi' as const,
        id: 'sol_earth',
        name: 'Earth',
        sourceCommand: 'get_system',
        seenAt: '2026-05-18T00:01:00.000Z',
      },
    ];
    const kind = idKindForCommandField('sell', 'item_id');

    expect(kind).toBe('item');
    expect(kind ? hintsForKind(kind, hints).map((hint) => hint.id) : []).toEqual(['ore_iron']);
  });

  test('does not treat duplicate sightings of the same ID as ambiguous', () => {
    const hints = [
      {
        kind: 'poi' as const,
        id: 'sol_earth',
        name: 'Earth',
        sourceCommand: 'get_system',
        seenAt: '2026-05-18T00:00:00.000Z',
      },
      {
        kind: 'poi' as const,
        id: 'sol_earth',
        name: 'Earth',
        sourceCommand: 'get_status',
        seenAt: '2026-05-18T00:01:00.000Z',
      },
    ];

    expect(resolveCachedId('poi', 'earth', hints)).toEqual(
      expect.objectContaining({ type: 'resolved', value: 'sol_earth' }),
    );
  });
});
