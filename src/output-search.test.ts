import { describe, expect, test } from 'bun:test';
import { filterStructuredOutputBySearch, findOutputSearchMatches, formatOutputSearchLine } from './output-search.ts';

const fixture = {
  ship: {
    fuel: 13,
    max_fuel: 700,
    hull: 480,
    max_hull: 480,
    armor: 0,
    name: 'Fuel Runner',
    modules: [{ slot: 'utility', item_id: 'fuel_scoop' }],
  },
  market: {
    items: [
      { item_id: 'ore_iron', quantity: 5 },
      { item_id: 'fuel_cell', quantity: 700 },
    ],
  },
};

describe('output search', () => {
  test('--search matches keys and scalar values case-insensitively', () => {
    const result = findOutputSearchMatches(fixture, { outputSearch: 'fuel' });

    expect(result).toEqual({
      ok: true,
      matches: [
        { path: '.ship.fuel', value: 13 },
        { path: '.ship.max_fuel', value: 700 },
        { path: '.ship.name', value: 'Fuel Runner' },
        { path: '.ship.modules[0].item_id', value: 'fuel_scoop' },
        { path: '.market.items[1].item_id', value: 'fuel_cell' },
      ],
    });
  });

  test('--search-keys only matches property names', () => {
    const result = findOutputSearchMatches(fixture, { outputSearchKeys: 'fuel' });

    expect(result).toEqual({
      ok: true,
      matches: [
        { path: '.ship.fuel', value: 13 },
        { path: '.ship.max_fuel', value: 700 },
      ],
    });
  });

  test('--search-values only matches scalar values', () => {
    const result = findOutputSearchMatches(fixture, { outputSearchValues: '700' });

    expect(result).toEqual({
      ok: true,
      matches: [
        { path: '.ship.max_fuel', value: 700 },
        { path: '.market.items[1].quantity', value: 700 },
      ],
    });
  });

  test('--search-regex matches keys and values with a regex', () => {
    const result = findOutputSearchMatches(fixture, { outputSearchRegex: '^(max_)?hull$|^armor$|^fuel runner$' });

    expect(result).toEqual({
      ok: true,
      matches: [
        { path: '.ship.hull', value: 480 },
        { path: '.ship.max_hull', value: 480 },
        { path: '.ship.armor', value: 0 },
        { path: '.ship.name', value: 'Fuel Runner' },
      ],
    });
  });

  test('invalid regex returns a structured error', () => {
    const result = findOutputSearchMatches(fixture, { outputSearchRegex: '[' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected regex failure');
    expect(result.message).toContain('Invalid --search-regex pattern');
  });

  test('key matches can print object or array values', () => {
    const result = findOutputSearchMatches(fixture, { outputSearchKeys: 'modules' });

    expect(result).toEqual({
      ok: true,
      matches: [{ path: '.ship.modules', value: [{ slot: 'utility', item_id: 'fuel_scoop' }] }],
    });
    if (!result.ok) throw new Error(result.message);
    const match = result.matches[0];
    if (!match) throw new Error('expected at least one match');
    expect(formatOutputSearchLine(match)).toBe('.ship.modules = [{"slot":"utility","item_id":"fuel_scoop"}]');
  });

  test('root scalar search emits dot path', () => {
    const result = findOutputSearchMatches('Fuel Runner', { outputSearch: 'fuel' });

    expect(result).toEqual({
      ok: true,
      matches: [{ path: '.', value: 'Fuel Runner' }],
    });
  });

  test('duplicate paths are emitted once when multiple modes match', () => {
    const result = findOutputSearchMatches({ fuel: 'fuel' }, { outputSearch: 'fuel', outputSearchKeys: 'fuel' });

    expect(result).toEqual({
      ok: true,
      matches: [{ path: '.fuel', value: 'fuel' }],
    });
  });

  test('filter keeps matching array elements and prunes non-matching siblings', () => {
    const fixture = {
      count: 2,
      entries: [
        {
          system_id: 'sol',
          name: 'Sol',
          pois: [
            {
              id: 'sol_gas_cloud',
              name: 'Sol Gas Cloud',
              resources: [
                { resource_id: 'hydrogen_gas', richness: 4, remaining: 500 },
                { resource_id: 'argon_gas', richness: 2, remaining: 200 },
              ],
            },
            { id: 'sol_station', name: 'Earth Station' },
          ],
        },
        { system_id: 'alpha', name: 'Alpha Centauri', pois: [] },
      ],
    };

    const result = filterStructuredOutputBySearch(fixture, { outputSearch: 'hydrogen' });
    if (!result.ok) throw new Error(result.message);

    expect(result.value).toEqual({
      count: 2,
      entries: [
        {
          system_id: 'sol',
          name: 'Sol',
          pois: [
            {
              id: 'sol_gas_cloud',
              name: 'Sol Gas Cloud',
              resources: [{ resource_id: 'hydrogen_gas', richness: 4, remaining: 500 }],
            },
          ],
        },
      ],
    });
  });

  test('filter matches normalized tokens across underscores and hyphens', () => {
    const result = filterStructuredOutputBySearch(
      {
        items: [
          { item_id: 'fuel_cell', quantity: 3 },
          { item_id: 'ore_iron', quantity: 1 },
        ],
      },
      { outputSearch: 'fuel cell' },
    );
    if (!result.ok) throw new Error(result.message);

    expect(result.value).toEqual({
      items: [{ item_id: 'fuel_cell', quantity: 3 }],
    });
  });
});
