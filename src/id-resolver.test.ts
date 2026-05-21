import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cargoFixture, systemInfoFixture } from './display/formatter-fixtures';
import { cacheIdsFromResponse, getIdCachePath } from './id-cache';
import { preparePayload } from './main';
import type { GlobalOptions } from './types';

const originalSession = process.env.SPACEMOLT_SESSION;

afterEach(() => {
  if (originalSession === undefined) delete process.env.SPACEMOLT_SESSION;
  else process.env.SPACEMOLT_SESSION = originalSession;
});

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

function useTempSession(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-id-resolver-'));
  process.env.SPACEMOLT_SESSION = path.join(tempDir, 'session.json');
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
    useTempSession();
    await cacheIdsFromResponse('get_system', { structuredContent: systemInfoFixture });

    const prepared = preparePayload('travel', { target_poi: 'earth' }, options());

    expect(prepared).toEqual({ type: 'payload', payload: { id: 'sol_earth' } });
  });

  test('resolves view_storage station_id from cached station POI prefix', () => {
    useTempSession();
    fs.writeFileSync(
      getIdCachePath(),
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

    const prepared = preparePayload('view_storage', { station_id: 'node_beta' }, options());

    expect(prepared).toEqual({
      type: 'payload',
      payload: { station_id: 'node_beta_industrial_station' },
    });
  });

  test('resolves sell item from cached item name before type conversion', async () => {
    useTempSession();
    await cacheIdsFromResponse('get_cargo', { structuredContent: cargoFixture });

    const prepared = preparePayload('sell', { item_id: 'iron', quantity: '50' }, options());

    expect(prepared).toEqual({ type: 'payload', payload: { id: 'ore_iron', quantity: 50 } });
  });

  test('stops before execution on ambiguous cached item matches', () => {
    useTempSession();
    fs.writeFileSync(
      getIdCachePath(),
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
      undefined,
      writer([], stderr),
    );

    expect(prepared).toEqual({ type: 'exit', exitCode: 1 });
    expect(stderr.join('\n')).toContain('Ambiguous cached item match for "iron"');
    expect(stderr.join('\n')).toContain('iron_plate');
    expect(stderr.join('\n')).toContain('ore_iron');
  });

  test('prints JSON error for ambiguous cached ID matches in JSON mode', () => {
    useTempSession();
    fs.writeFileSync(
      getIdCachePath(),
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
      undefined,
      writer(stdout),
    );

    expect(prepared).toEqual({ type: 'exit', exitCode: 1 });
    const parsed = JSON.parse(stdout.join('\n'));
    expect(parsed.error.code).toBe('ambiguous_cached_id');
    expect(parsed.error.message).toContain('ore_iron');
    expect(parsed.error.message).toContain('iron_plate');
  });
});
