import type { HighValueFixtureEntry } from './formatter-fixtures.ts';

export const mineYieldDetails = {
  kind: 'yield',
  resource_id: 'ore_iron',
  resource_name: 'Iron Ore',
  quantity: 42,
  remaining: 120,
  remaining_display: '120 units',
  max_remaining: 300,
  depletion_percent: 60, // 40.00% remaining via formatDepletionRemainingSuffix
  xp_gained: { mining: 8 },
};

export const mineFilteredDetails = {
  kind: 'filtered',
  filtered: true,
  message:
    'Extraction filter rejected every workable deposit at this POI. Unfit the filter, or move to a field carrying an ore the filter accepts.',
};

export const mineYieldFixture = {
  details: mineYieldDetails,
  location: {
    system_id: 'sol',
    system_name: 'Sol',
    poi_id: 'sol_asteroid_belt', // must not equal resource_id
    poi_name: 'Sol Asteroid Belt',
    // no docked_at
  },
  skills: {
    mining: { name: 'Mining', category: 'Industry', level: 21, max_level: 100, xp: 18008 },
  },
};

export const mineFilteredFixture = {
  details: mineFilteredDetails,
};

export const mineFixtureCases = {
  mine: { command: 'mine', fixture: mineYieldFixture },
};

export const mineHighValueFixtures: Record<string, HighValueFixtureEntry> = {
  mine: { command: 'mine', fixture: mineYieldFixture, schemaTarget: 'details' },
  mine_filtered: { command: 'mine', fixture: mineFilteredFixture, schemaTarget: 'details' },
};
