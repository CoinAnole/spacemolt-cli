import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cargoFixture, nearbyFixture, systemInfoFixture, viewMarketFixture } from './display/formatter-fixtures';
import {
  cacheIdsFromResponse,
  extractIdHints,
  formatCachedIdAmbiguity,
  getIdCachePath,
  hintsForKind,
  idKindForCommandField,
  loadIdCacheSync,
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

  test('idKindForCommandField uses explicit command resolver rules before heuristics', () => {
    expect(idKindForCommandField('travel', 'id')).toBe('poi');
    expect(idKindForCommandField('jump', 'id')).toBe('system');
    expect(idKindForCommandField('sell', 'id')).toBe('item');
    expect(idKindForCommandField('fleet_invite', 'id')).toBe('player');
    expect(idKindForCommandField('unknown_command', 'target_system_id')).toBe('system');
    expect(idKindForCommandField('travel', 'target_system_id')).toBeUndefined();
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
