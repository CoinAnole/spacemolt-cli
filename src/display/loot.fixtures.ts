import type { HighValueFixtureEntry } from './formatter-fixtures.ts';

export const lootWreckAllCargoFixture = {
  details: {
    action: 'loot_wreck_all',
    looted: [
      { item_id: 'ore_iron', quantity: 40 },
      { item_id: 'adamant_tooth', quantity: 2 },
    ],
    wreck_empty: false,
    message: 'Looted 2 cargo stacks.',
  },
};

export const lootWreckAllEmptyFixture = {
  details: {
    action: 'loot_wreck_all',
    looted: [],
    looted_modules: [],
    skipped: [],
    wreck_empty: true,
    message: 'The wreck is empty.',
  },
};

export const lootWreckAllXpFixture = {
  details: {
    action: 'loot_wreck_all',
    looted: [{ item_id: 'ore_iron', quantity: 1500 }],
    wreck_empty: false,
    message: 'Looted 1 cargo stack.',
    xp_gained: { armor: 1200, scanning: 0 },
  },
};

export const lootWreckAllModulesFixture = {
  details: {
    action: 'loot_wreck_all',
    looted: [{ item_id: 'ore_iron', quantity: 12 }],
    looted_modules: [
      {
        id: 'mod-shield-1',
        name: 'Adaptive Shield I',
        type: 'shield',
        type_id: 'adaptive_shield_i',
      },
    ],
    skipped: [
      {
        id: 'mod-laser-9',
        name: 'Pulse Laser',
        type: 'weapon',
        type_id: 'pulse_laser_i',
        reason: 'no_space',
      },
    ],
    wreck_empty: false,
    message: 'Some modules did not fit.',
  },
};

export const lootFixtureCases = {
  loot_wreck_all: { command: 'loot_wreck', fixture: lootWreckAllCargoFixture },
};

export const lootHighValueFixtures: Record<string, HighValueFixtureEntry> = {
  loot_wreck: { command: 'loot_wreck', fixture: lootWreckAllCargoFixture, schemaTarget: 'details' },
  loot_wreck_empty: { command: 'loot_wreck', fixture: lootWreckAllEmptyFixture, schemaTarget: 'details' },
  loot_wreck_xp: { command: 'loot_wreck', fixture: lootWreckAllXpFixture, schemaTarget: 'details' },
  storage_loot: {
    command: 'storage loot',
    fixture: lootWreckAllModulesFixture,
    apiRoute: 'POST /api/v2/spacemolt_storage/loot',
    schemaTarget: 'details',
  },
};
