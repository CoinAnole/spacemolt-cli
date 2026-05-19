import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cargoFixture, systemInfoFixture } from './display/formatter-fixtures';
import { cacheIdsFromResponse, getIdCachePath } from './id-cache';
import { preparePayload } from './main';
import type { GlobalOptions } from './types';

const originalSession = process.env.SPACEMOLT_SESSION;
const originalLog = console.log;
const originalError = console.error;

afterEach(() => {
  if (originalSession === undefined) delete process.env.SPACEMOLT_SESSION;
  else process.env.SPACEMOLT_SESSION = originalSession;
  console.log = originalLog;
  console.error = originalError;
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

describe('cached ID payload resolver', () => {
  test('resolves travel target from cached POI name', async () => {
    useTempSession();
    await cacheIdsFromResponse('get_system', { structuredContent: systemInfoFixture });

    const prepared = preparePayload('travel', { target_poi: 'earth' }, options());

    expect(prepared).toEqual({ type: 'payload', payload: { id: 'sol_earth' } });
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
    console.error = (...args: unknown[]) => stderr.push(args.map(String).join(' '));

    const prepared = preparePayload('sell', { item_id: 'iron', quantity: '50' }, options());

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
    console.log = (...args: unknown[]) => stdout.push(args.map(String).join(' '));

    const prepared = preparePayload('sell', { item_id: 'iron', quantity: '50' }, options({ json: true }));

    expect(prepared).toEqual({ type: 'exit', exitCode: 1 });
    const parsed = JSON.parse(stdout.join('\n'));
    expect(parsed.error.code).toBe('ambiguous_cached_id');
    expect(parsed.error.message).toContain('ore_iron');
    expect(parsed.error.message).toContain('iron_plate');
  });
});
