import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cargoFixture, nearbyFixture, systemInfoFixture, viewMarketFixture } from './display/formatter-fixtures';
import { cacheIdsFromResponse, extractIdHints, hintsForKind, searchItemHints } from './id-cache';

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
});
