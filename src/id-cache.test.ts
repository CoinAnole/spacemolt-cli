import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cargoFixture, nearbyFixture, systemInfoFixture, viewMarketFixture } from './display/formatter-fixtures';
import { cacheIdsFromResponse, extractIdHints, hintsForKind, resolveCachedId, searchItemHints } from './id-cache';

const originalSession = process.env.SPACEMOLT_SESSION;

afterEach(() => {
  if (originalSession === undefined) delete process.env.SPACEMOLT_SESSION;
  else process.env.SPACEMOLT_SESSION = originalSession;
});

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
    process.env.SPACEMOLT_SESSION = path.join(tempDir, 'session.json');

    await cacheIdsFromResponse('get_cargo', { structuredContent: cargoFixture });

    expect(hintsForKind('item')).toContainEqual(expect.objectContaining({ id: 'ore_iron' }));
    expect(searchItemHints('iron')).toContainEqual(expect.objectContaining({ id: 'ore_iron' }));
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
