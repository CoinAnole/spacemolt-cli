import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  formatDockStateLine,
  formatNameId,
  isAliasCopiedDumpKey,
  LOCATION_ALIAS_COPIES,
  LOCATION_ALIAS_DUMP_KEYS,
  locationFromAliasedDetails,
  rememberOriginalDetailKeys,
} from './dock-state.ts';

const storageAutoDockedLocation = {
  system_id: 'sol',
  system_name: 'Sol',
  empire: 'solarian',
  security_status: 'high',
  connections: ['alpha_centauri'],
  poi_id: 'earth_station',
  poi_name: 'Earth Station',
  poi_type: 'station',
  docked_at: 'earth_station',
  resources: [],
  nearby_players: [],
  nearby_player_count: 0,
  nearby_pirates: [],
  nearby_pirate_count: 0,
  nearby_empire_npcs: [],
  nearby_empire_npc_count: 0,
};

describe('formatDockStateLine', () => {
  test('docked string is name+id with no system', () => {
    const line = formatDockStateLine(storageAutoDockedLocation);
    expect(line).toBe('Docked at: Earth Station (earth_station)');
    expect(line).not.toContain('Sol');
    expect(line).not.toContain('nearby');
    expect(line).not.toContain('security');
    expect(line).not.toContain('connection');
  });

  test('null docked_at is undocked and never stringifies null', () => {
    const line = formatDockStateLine({
      docked_at: null,
      poi_name: 'Earth Station',
      poi_id: 'earth_station',
      system_name: 'Sol',
      system_id: 'sol',
    });
    expect(line).toBe('Undocked at: Earth Station (earth_station), Sol (sol)');
    expect(line).not.toContain('null');
  });

  test('missing docked_at is skipped', () => {
    expect(
      formatDockStateLine({
        poi_name: 'Earth Station',
        poi_id: 'earth_station',
        system_name: 'Sol',
        system_id: 'sol',
      }),
    ).toBeUndefined();
  });

  test('empty string docked_at is undocked', () => {
    expect(
      formatDockStateLine({
        docked_at: '',
        poi_name: 'Earth Station',
        poi_id: 'earth_station',
        system_name: 'Sol',
        system_id: 'sol',
      }),
    ).toBe('Undocked at: Earth Station (earth_station), Sol (sol)');
    expect(formatDockStateLine({ docked_at: '' })).toBe('Undocked');
  });

  test('collapses matching name and id, and uses id when name is missing', () => {
    expect(
      formatDockStateLine({
        docked_at: 'earth_station',
        poi_name: 'earth_station',
      }),
    ).toBe('Docked at: earth_station');
    expect(formatDockStateLine({ docked_at: 'earth_station' })).toBe('Docked at: earth_station');
    expect(
      formatDockStateLine({
        docked_at: null,
        poi_name: 'earth_station',
        poi_id: 'earth_station',
      }),
    ).toBe('Undocked at: earth_station');
    expect(
      formatDockStateLine({
        docked_at: null,
        poi_id: 'earth_station',
      }),
    ).toBe('Undocked at: earth_station');
  });

  test('non-record, numeric docked_at, and whitespace-only string are undocked or skipped', () => {
    expect(formatDockStateLine(undefined)).toBeUndefined();
    expect(formatDockStateLine(null)).toBeUndefined();
    expect(formatDockStateLine('earth_station')).toBeUndefined();
    expect(formatDockStateLine(['earth_station'])).toBeUndefined();
    expect(
      formatDockStateLine({
        docked_at: 1,
        poi_name: 'Earth Station',
        poi_id: 'earth_station',
      }),
    ).toBe('Undocked at: Earth Station (earth_station)');
    expect(
      formatDockStateLine({
        docked_at: '   ',
        poi_name: 'Earth Station',
        poi_id: 'earth_station',
      }),
    ).toBe('Undocked at: Earth Station (earth_station)');
  });

  test('covers docked name-only, docked id-only, undocked system-only, and bare undocked', () => {
    expect(
      formatDockStateLine({
        docked_at: 'earth_station',
        poi_name: 'Earth Station',
      }),
    ).toBe('Docked at: Earth Station (earth_station)');
    expect(formatDockStateLine({ docked_at: 'earth_station' })).toBe('Docked at: earth_station');
    expect(
      formatDockStateLine({
        docked_at: null,
        system_name: 'Sol',
        system_id: 'sol',
      }),
    ).toBe('Undocked at: Sol (sol)');
    expect(formatDockStateLine({ docked_at: null })).toBe('Undocked');
  });

  test('falls back to poi and station_name for the docked label', () => {
    expect(
      formatDockStateLine({
        docked_at: 'earth_station',
        poi: 'Earth Station',
      }),
    ).toBe('Docked at: Earth Station (earth_station)');
    expect(
      formatDockStateLine({
        docked_at: 'earth_station',
        station_name: 'Earth Station',
      }),
    ).toBe('Docked at: Earth Station (earth_station)');
  });
});

describe('formatNameId', () => {
  test('collapses matching name and id', () => {
    expect(formatNameId('Earth Station', 'earth_station')).toBe('Earth Station (earth_station)');
    expect(formatNameId('earth_station', 'earth_station')).toBe('earth_station');
    expect(formatNameId(undefined, 'earth_station')).toBe('earth_station');
    expect(formatNameId('Earth Station', undefined)).toBe('Earth Station');
    expect(formatNameId(undefined, undefined)).toBeUndefined();
  });
});

describe('locationFromAliasedDetails', () => {
  test('returns undefined when docked_at is missing', () => {
    expect(locationFromAliasedDetails({ poi_name: 'Earth Station' })).toBeUndefined();
  });

  test('maps poi, station_name, and base_name fallbacks', () => {
    expect(
      locationFromAliasedDetails({
        docked_at: 'earth_station',
        poi: 'Earth Station',
        station_id: 'earth_station',
        system_name: 'Sol',
        system_id: 'sol',
      }),
    ).toEqual({
      docked_at: 'earth_station',
      poi_name: 'Earth Station',
      poi_id: 'earth_station',
      system_name: 'Sol',
      system_id: 'sol',
    });
    expect(
      locationFromAliasedDetails({
        docked_at: null,
        station_name: 'Earth Station',
      }),
    ).toEqual({
      docked_at: null,
      poi_name: 'Earth Station',
      poi_id: undefined,
      system_name: undefined,
      system_id: undefined,
    });
    expect(
      locationFromAliasedDetails({
        docked_at: 'earth_station',
        base_name: 'Earth Station',
      }),
    ).toEqual({
      docked_at: 'earth_station',
      poi_name: 'Earth Station',
      poi_id: undefined,
      system_name: undefined,
      system_id: undefined,
    });
  });

  test('prefers poi_name over poi, station_name, and base_name', () => {
    expect(
      locationFromAliasedDetails({
        docked_at: 'earth_station',
        poi_name: 'Earth Station',
        poi: 'Alias Poi',
        station_name: 'Alias Station',
        base_name: 'Alias Base',
        poi_id: 'earth_station',
        station_id: 'alias_station',
      }),
    ).toEqual({
      docked_at: 'earth_station',
      poi_name: 'Earth Station',
      poi_id: 'earth_station',
      system_name: undefined,
      system_id: undefined,
    });
  });
});

describe('dock-state module contract', () => {
  test('does not import helpers, generic, or index', () => {
    const source = readFileSync(join(import.meta.dir, 'dock-state.ts'), 'utf-8');
    expect(source).not.toContain("from './helpers.ts'");
    expect(source).not.toContain("from './generic.ts'");
    expect(source).not.toContain("from './index.ts'");
  });

  test('LOCATION_ALIAS_DUMP_KEYS equals dest keys of LOCATION_ALIAS_COPIES', () => {
    expect(LOCATION_ALIAS_DUMP_KEYS).toEqual(new Set(LOCATION_ALIAS_COPIES.map((row) => row.dest)));
  });

  test('isAliasCopiedDumpKey keeps native dest keys and skips flattened aliases', () => {
    const details: Record<string, unknown> = { action: 'send_gift', base_id: 'earth_station' };
    rememberOriginalDetailKeys(details);
    details.system_id = 'sol';
    details.poi_name = 'Earth Station';
    expect(isAliasCopiedDumpKey(details, 'base_id')).toBe(false);
    expect(isAliasCopiedDumpKey(details, 'system_id')).toBe(true);
    expect(isAliasCopiedDumpKey(details, 'poi_name')).toBe(true);
    expect(isAliasCopiedDumpKey(details, 'action')).toBe(false);
    expect(isAliasCopiedDumpKey({ base_id: 'earth_station' }, 'base_id')).toBe(false);
  });
});
