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
  formatCachedIdResolution,
  getIdCachePath,
  hintsForKind,
  idKindForCommandField,
  loadIdCacheSync,
  printCachedIdSuggestions,
  printIds,
  printWhereCanI,
  resolveCachedId,
  STRICT_ID_RESOLUTION_POLICY,
  saveIdCache,
  searchItemHints,
  softIdResolutionPolicy,
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

  test('records station base_id on a single poi hint from system.pois, get_poi, and get_base', () => {
    const systemHints = extractIdHints(
      'get_system',
      {
        ...systemInfoFixture,
        system: {
          ...systemInfoFixture.system,
          pois: [{ id: 'sol_earth', name: 'Earth', type: 'planet', has_base: true, base_id: 'earth_station' }],
        },
      },
      '2026-05-18T00:00:00.000Z',
    );
    const earthHints = systemHints.filter((hint) => hint.kind === 'poi' && hint.name === 'Earth');

    expect(new Set(earthHints.map((hint) => hint.id))).toEqual(new Set(['sol_earth']));
    expect(earthHints).toContainEqual(
      expect.objectContaining({
        kind: 'poi',
        id: 'sol_earth',
        name: 'Earth',
        context: expect.objectContaining({ base_id: 'earth_station', type: 'planet', has_base: true }),
      }),
    );

    const poiHints = extractIdHints(
      'get_poi',
      {
        poi: { id: 'sol_earth', name: 'Earth', type: 'planet', system_id: 'sol', base_id: 'earth_station' },
        base: { id: 'earth_station', poi_id: 'sol_earth', name: 'Earth Station' },
      },
      '2026-05-18T00:00:00.000Z',
    );
    expect(poiHints.filter((hint) => hint.kind === 'poi' && hint.id === 'sol_earth')).toHaveLength(1);
    expect(poiHints).toContainEqual(
      expect.objectContaining({
        kind: 'poi',
        id: 'sol_earth',
        name: 'Earth',
        context: expect.objectContaining({ base_id: 'earth_station' }),
      }),
    );

    const baseHints = extractIdHints(
      'get_base',
      { base: { id: 'earth_station', poi_id: 'sol_earth', name: 'Earth Station' } },
      '2026-05-18T00:00:00.000Z',
    );
    expect(baseHints.filter((hint) => hint.kind === 'poi')).toHaveLength(1);
    expect(baseHints).toContainEqual(
      expect.objectContaining({
        kind: 'poi',
        id: 'sol_earth',
        name: 'Earth Station',
        sourceCommand: 'get_base',
        context: { base_id: 'earth_station' },
      }),
    );
  });

  test('travel earth stays unique when the cached POI also has context.base_id', () => {
    const hints = extractIdHints(
      'get_system',
      {
        ...systemInfoFixture,
        system: {
          ...systemInfoFixture.system,
          pois: [{ id: 'sol_earth', name: 'Earth', type: 'planet', has_base: true, base_id: 'earth_station' }],
        },
      },
      '2026-05-18T00:00:00.000Z',
    );

    expect(
      new Set(
        hints
          .filter((hint) => hint.kind === 'poi' && (hint.name || '').toLowerCase() === 'earth')
          .map((hint) => hint.id),
      ),
    ).toEqual(new Set(['sol_earth']));
    expect(resolveCachedId('poi', 'earth', hints)).toEqual(
      expect.objectContaining({ type: 'resolved', value: 'sol_earth', match: 'exact' }),
    );
  });

  test('exact Base ID pass-through does not rewrite to the POI id', () => {
    const hints = [
      {
        kind: 'poi' as const,
        id: 'sol_earth',
        name: 'Earth',
        sourceCommand: 'get_system',
        seenAt: '2026-05-18T00:00:00.000Z',
        context: { type: 'planet', has_base: true, base_id: 'earth_station' },
      },
    ];

    expect(resolveCachedId('poi', 'earth_station', hints)).toEqual(
      expect.objectContaining({ type: 'resolved', value: 'earth_station', match: 'exact' }),
    );
    expect(resolveCachedId('poi', 'sol_earth', hints)).toEqual(
      expect.objectContaining({ type: 'resolved', value: 'sol_earth', match: 'exact' }),
    );
  });

  test('unique prefix of Base ID expands to the full context.base_id, never the typed prefix', () => {
    const hints = [
      {
        kind: 'poi' as const,
        id: 'sol_earth',
        name: 'Earth',
        sourceCommand: 'get_system',
        seenAt: '2026-05-18T00:00:00.000Z',
        context: { base_id: 'earth_station' },
      },
    ];
    const soft = softIdResolutionPolicy('poi');

    expect(resolveCachedId('poi', 'earth_st', hints, soft)).toEqual(
      expect.objectContaining({ type: 'resolved', value: 'earth_station', match: 'prefix' }),
    );
    expect(resolveCachedId('poi', 'earth_st', hints)).toEqual({ type: 'unresolved', value: 'earth_st' });
    // id/name win when the same prefix also matches the POI name.
    expect(resolveCachedId('poi', 'ear', hints, soft)).toEqual(
      expect.objectContaining({ type: 'resolved', value: 'sol_earth', match: 'prefix' }),
    );
    expect(resolveCachedId('poi', 'station', hints, soft)).toEqual({ type: 'unresolved', value: 'station' });
  });

  test('item and facility context.base_id are not ID-resolution candidates', () => {
    const itemHints = extractIdHints('view_market', viewMarketFixture, '2026-05-18T00:00:00.000Z');
    expect(itemHints.some((hint) => hint.kind === 'item' && hint.context?.base_id === 'earth_station')).toBe(true);
    expect(resolveCachedId('item', 'earth_station', itemHints)).toEqual({
      type: 'unresolved',
      value: 'earth_station',
    });
    expect(resolveCachedId('item', 'earth_st', itemHints, softIdResolutionPolicy('item'))).toEqual({
      type: 'unresolved',
      value: 'earth_st',
    });

    const facilityHints = extractIdHints(
      'facility_list',
      {
        facilities: [
          { facility_id: 'facility-1', name: 'Fuel Bunker', facility_type: 'fuel_bunker', base_id: 'earth_station' },
          { facility_id: 'facility-2', name: 'Shipyard', facility_type: 'shipyard', base_id: 'earth_station' },
        ],
      },
      '2026-05-18T00:00:00.000Z',
    );
    expect(
      facilityHints.filter((hint) => hint.kind === 'facility' && hint.context?.base_id === 'earth_station'),
    ).toHaveLength(2);
    expect(resolveCachedId('facility', 'earth_station', facilityHints)).toEqual({
      type: 'unresolved',
      value: 'earth_station',
    });
    expect(resolveCachedId('facility', 'earth_st', facilityHints, softIdResolutionPolicy('facility'))).toEqual({
      type: 'unresolved',
      value: 'earth_st',
    });
  });

  test('poi id of one hint wins over another hint whose context.base_id equals that id', () => {
    const hints = [
      {
        kind: 'poi' as const,
        id: 'sol_earth',
        name: 'Earth',
        sourceCommand: 'get_system',
        seenAt: '2026-05-18T00:00:00.000Z',
        context: { base_id: 'earth_station' },
      },
      {
        kind: 'poi' as const,
        id: 'sol_mars',
        name: 'Mars',
        sourceCommand: 'get_system',
        seenAt: '2026-05-18T00:01:00.000Z',
        context: { base_id: 'sol_earth' },
      },
    ];

    const result = resolveCachedId('poi', 'sol_earth', hints);
    expect(result).toEqual(expect.objectContaining({ type: 'resolved', value: 'sol_earth', match: 'exact' }));
    if (result.type !== 'resolved') throw new Error('expected resolved');
    expect(result.hint.id).toBe('sol_earth');
    expect(result.hint.name).toBe('Earth');
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

  test('get_base populates poi cache with context.base_id', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-id-cache-base-'));
    const sessionPath = path.join(tempDir, 'sessions', 'pilot.json');

    await cacheIdsFromResponse(
      'get_base',
      { structuredContent: { base: { id: 'earth_station', poi_id: 'sol_earth', name: 'Earth Station' } } },
      sessionPath,
    );

    expect(hintsForKind('poi', loadIdCacheSync(sessionPath))).toContainEqual(
      expect.objectContaining({
        kind: 'poi',
        id: 'sol_earth',
        name: 'Earth Station',
        sourceCommand: 'get_base',
        context: { base_id: 'earth_station' },
      }),
    );
  });

  test('get_system then get_base still resolves travel earth to the POI id', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-id-cache-earth-seq-'));
    const sessionPath = path.join(tempDir, 'sessions', 'pilot.json');

    await cacheIdsFromResponse(
      'get_system',
      {
        structuredContent: {
          ...systemInfoFixture,
          system: {
            ...systemInfoFixture.system,
            pois: [{ id: 'sol_earth', name: 'Earth', type: 'planet', has_base: true, base_id: 'earth_station' }],
          },
        },
      },
      sessionPath,
      { now: () => new Date('2026-05-18T00:00:00.000Z') },
    );
    await cacheIdsFromResponse(
      'get_base',
      { structuredContent: { base: { id: 'earth_station', poi_id: 'sol_earth', name: 'Earth Station' } } },
      sessionPath,
      { now: () => new Date('2026-05-18T00:01:00.000Z') },
    );

    expect(resolveCachedId('poi', 'earth', loadIdCacheSync(sessionPath))).toEqual(
      expect.objectContaining({ type: 'resolved', value: 'sol_earth', match: 'exact' }),
    );
  });

  test('mergeHints keeps prior context.base_id when a later same-key poi omits it', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-id-cache-merge-base-'));
    const sessionPath = path.join(tempDir, 'sessions', 'pilot.json');

    await cacheIdsFromResponse(
      'get_system',
      {
        structuredContent: {
          system: {
            id: 'sol',
            name: 'Sol',
            pois: [{ id: 'sol_earth', name: 'Earth', type: 'planet', has_base: true, base_id: 'earth_station' }],
          },
        },
      },
      sessionPath,
      { now: () => new Date('2026-05-18T00:00:00.000Z') },
    );
    await cacheIdsFromResponse(
      'get_system',
      {
        structuredContent: {
          system: {
            id: 'sol',
            name: 'Sol',
            pois: [{ id: 'sol_earth', name: 'Earth', type: 'planet' }],
          },
          poi: { id: 'sol_earth', name: 'Earth', type: 'planet' },
        },
      },
      sessionPath,
      { now: () => new Date('2026-05-18T00:01:00.000Z') },
    );

    expect(hintsForKind('poi', loadIdCacheSync(sessionPath))).toContainEqual(
      expect.objectContaining({
        kind: 'poi',
        id: 'sol_earth',
        sourceCommand: 'get_system',
        context: expect.objectContaining({ base_id: 'earth_station' }),
      }),
    );
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

  test('strict default resolves exact id/name only; soft opt-in enables prefix/substring', () => {
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
    const soft = softIdResolutionPolicy('item');

    // Exact id (case) and exact name always work under strict.
    expect(resolveCachedId('item', 'ORE_IRON', hints)).toEqual(
      expect.objectContaining({ type: 'resolved', value: 'ore_iron', match: 'exact' }),
    );
    expect(resolveCachedId('item', 'Iron Ore', hints)).toEqual(
      expect.objectContaining({ type: 'resolved', value: 'ore_iron', match: 'exact' }),
    );
    // Prefix/substring pass through under default strict policy.
    expect(resolveCachedId('item', 'fuel', hints)).toEqual({ type: 'unresolved', value: 'fuel' });
    expect(resolveCachedId('item', 'cell', hints)).toEqual({ type: 'unresolved', value: 'cell' });
    expect(resolveCachedId('item', 'gold', hints)).toEqual({ type: 'unresolved', value: 'gold' });
    // Soft policy restores prefix + substring for non-map kinds.
    expect(resolveCachedId('item', 'fuel', hints, soft)).toEqual(
      expect.objectContaining({ type: 'resolved', value: 'fuel_cell', match: 'prefix' }),
    );
    expect(resolveCachedId('item', 'cell', hints, soft)).toEqual(
      expect.objectContaining({ type: 'resolved', value: 'fuel_cell', match: 'substring' }),
    );
    expect(resolveCachedId('item', 'fuel', hints, STRICT_ID_RESOLUTION_POLICY)).toEqual({
      type: 'unresolved',
      value: 'fuel',
    });
  });

  test('soft system/poi policy allows unique prefix but never substring (haven/crosshaven)', () => {
    const systemHints = [
      {
        kind: 'system' as const,
        id: 'crosshaven',
        name: 'Crosshaven',
        sourceCommand: 'get_map',
        seenAt: '2026-05-18T00:00:00.000Z',
      },
    ];
    const softSystem = softIdResolutionPolicy('system');
    const softPoi = softIdResolutionPolicy('poi');

    // Incident class: substring must never rewrite haven → crosshaven.
    expect(resolveCachedId('system', 'haven', systemHints)).toEqual({ type: 'unresolved', value: 'haven' });
    expect(resolveCachedId('system', 'haven', systemHints, softSystem)).toEqual({
      type: 'unresolved',
      value: 'haven',
    });
    // Unique prefix still works when soft is on.
    expect(resolveCachedId('system', 'cro', systemHints, softSystem)).toEqual(
      expect.objectContaining({ type: 'resolved', value: 'crosshaven', match: 'prefix' }),
    );
    expect(resolveCachedId('system', 'cro', systemHints)).toEqual({ type: 'unresolved', value: 'cro' });

    const poiHints = [
      {
        kind: 'poi' as const,
        id: 'node_beta_industrial_station',
        name: 'Node Beta Industrial Station',
        sourceCommand: 'get_system',
        seenAt: '2026-05-18T00:00:00.000Z',
      },
    ];
    expect(resolveCachedId('poi', 'node_beta', poiHints, softPoi)).toEqual(
      expect.objectContaining({ type: 'resolved', value: 'node_beta_industrial_station', match: 'prefix' }),
    );
    // Substring of a longer id/name must not rewrite under soft poi policy.
    expect(resolveCachedId('poi', 'industrial', poiHints, softPoi)).toEqual({
      type: 'unresolved',
      value: 'industrial',
    });
  });

  test('reports ambiguity for partial matches across multiple cached IDs when soft is enabled', () => {
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
    const soft = softIdResolutionPolicy('item');

    // Under strict, unique soft would not run — iron is unresolved (not ambiguous).
    expect(resolveCachedId('item', 'iron', hints)).toEqual({ type: 'unresolved', value: 'iron' });

    const result = resolveCachedId('item', 'iron', hints, soft);

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

  test('printIds includes base_id on poi hints', async () => {
    const sessionPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-id-cache-poi-base-')), 'pilot.json');
    await saveIdCache(
      [
        {
          kind: 'poi',
          id: 'sol_earth',
          name: 'Earth',
          sourceCommand: 'get_system',
          seenAt: '2026-05-18T00:00:00.000Z',
          context: { type: 'planet', has_base: true, base_id: 'earth_station' },
        },
      ],
      sessionPath,
    );
    const stdout: string[] = [];

    printIds('poi', sessionPath, { out: (message = '') => stdout.push(message), err() {} }, undefined, {
      plain: true,
    });

    expect(stdout.join('\n')).toContain('sol_earth (Earth)');
    expect(stdout.join('\n')).toContain('base_id=earth_station');
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

  test('empty ship ID cache lists cache-populating commands only', () => {
    const sessionPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-id-cache-ship-empty-')),
      'pilot.json',
    );
    const stdout: string[] = [];

    printIds('ship', sessionPath, { out: (message = '') => stdout.push(message), err() {} });

    const output = stdout.join('\n');
    expect(output).toContain('list_ships');
    expect(output).toContain('storage view');
    expect(output).not.toContain('faction_garages');
    expect(output).not.toContain('faction garages');
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
    expect(idKindForCommandField('get_ship', 'id')).toBe('ship');
    expect(commandResolverFields('get_ship')?.ship).toEqual(expect.arrayContaining(['id', 'ship_id']));
    expect(idKindForCommandField('craft', 'package_id')).toBe('package');
    expect(idKindForCommandField('facility_job_add', 'package_id')).toBe('package');
    expect(idKindForCommandField('facility_ranch_set_cull', 'facility_id')).toBe('facility');
    expect(idKindForCommandField('facility_ranch_set_cull', 'cull_target')).toBeUndefined();
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
      ['get_ship', 'ship_id', 'id', 'ship'],
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
      expect.objectContaining({ type: 'resolved', value: 'sol_earth', match: 'exact' }),
    );
  });

  test('formatCachedIdResolution prints prefix and substring notices; plain mode strips color', () => {
    const prefixResolved = {
      type: 'resolved' as const,
      value: 'ore_iron',
      match: 'prefix' as const,
      hint: {
        kind: 'item' as const,
        id: 'ore_iron',
        name: 'Iron Ore',
        sourceCommand: 'get_cargo',
        seenAt: '2026-05-18T00:00:00.000Z',
      },
    };
    const substringResolved = {
      type: 'resolved' as const,
      value: 'fuel_cell',
      match: 'substring' as const,
      hint: {
        kind: 'item' as const,
        id: 'fuel_cell',
        name: 'Fuel Cell',
        sourceCommand: 'view_market',
        seenAt: '2026-05-18T00:00:00.000Z',
      },
    };

    const prefixLine = formatCachedIdResolution('sell', 'item_id', 'iron', prefixResolved, { plain: true });
    const substringLine = formatCachedIdResolution('buy', 'item_id', 'cell', substringResolved, { plain: true });
    const colored = formatCachedIdResolution('find_route', 'id', 'cro', {
      type: 'resolved',
      value: 'crosshaven',
      match: 'prefix',
      hint: {
        kind: 'system',
        id: 'crosshaven',
        sourceCommand: 'get_map',
        seenAt: '2026-05-18T00:00:00.000Z',
      },
    });

    expect(prefixLine).toBe('resolved sell.item_id "iron" → "ore_iron" (prefix)');
    expect(substringLine).toBe('resolved buy.item_id "cell" → "fuel_cell" (substring)');
    expect(colored).toContain('resolved');
    expect(colored).toContain('find_route.id "cro" → "crosshaven" (prefix)');
    expect(colored).not.toContain('Error:');
  });
});
