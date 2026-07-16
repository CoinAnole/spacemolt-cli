import type { HighValueFixtureEntry } from './formatter-fixtures.ts';

export const inspectPackageFixture = {
  id: 'package:pkg_abc',
  kind: 'package',
  source: 'cargo',
  package: {
    package_id: 'pkg_abc',
    label: 'Main Belt Survey Supplies',
    size: 100,
    created_at: '2026-07-16T12:00:00Z',
    owner: { type: 'player', id: 'p1', name: 'PilotOne' },
    creator: {
      player_id: 'p1',
      username: 'PilotOne',
      faction: { type: 'player_faction', id: 'f1', name: 'Survey Corps', tag: 'SRV' },
    },
    contents: [
      { item_id: 'iron_ore', name: 'Iron Ore', quantity: 20, size: 20 },
      { item_id: 'copper_ore', name: 'Copper Ore', quantity: 10, size: 10 },
    ],
  },
};

export const inspectCatalogRecipeFixture = {
  id: 'pack_package',
  kind: 'catalog',
  catalog: {
    type: 'recipes',
    recipes: [
      {
        id: 'pack_package',
        name: 'Pack Package',
        category: 'logistics',
        crafting_time: 10,
        facility_only: true,
        package_operation: 'pack',
        description: 'Bundle mixed items into a labeled package.',
        inputs: [
          { item_id: 'cargo_container', name: 'Cargo Container', quantity: 1 },
          { item_id: 'iron_ore', name: 'Iron Ore', quantity: 20 },
        ],
        outputs: [{ item_id: 'package', name: 'Package', quantity: 1 }],
      },
    ],
  },
};

export const inspectBaseFixture = {
  id: 'earth_station',
  kind: 'base',
  base: {
    base: {
      id: 'earth_station',
      poi_id: 'earth_orbit',
      name: 'Earth Station',
      description: 'A busy trade hub.',
      empire: 'solarian',
      faction_id: 'sol_gov',
      fuel: 100,
      max_fuel: 500,
      hull: 900,
      max_hull: 1000,
      shield: 200,
      max_shield: 300,
      armor: 50,
      weapon_dps: 40,
      weapon_reach: 2,
      public_access: true,
      facilities: ['market', 'shipyard', 'logistics'],
    },
    condition: {
      condition: 'good',
      condition_text: 'Good',
      satisfaction_pct: 88,
      satisfied_count: 7,
      total_service_infra: 8,
    },
  },
};

export const inspectFixtureCases = {
  inspect_package: { command: 'inspect', fixture: inspectPackageFixture },
  inspect_catalog_recipe: { command: 'inspect', fixture: inspectCatalogRecipeFixture },
  inspect_base: { command: 'inspect', fixture: inspectBaseFixture },
};

export const inspectHighValueFixtures: Record<string, HighValueFixtureEntry> = {
  inspect_package: { command: 'inspect', fixture: inspectPackageFixture },
  inspect_catalog_recipe: { command: 'inspect', fixture: inspectCatalogRecipeFixture },
  inspect_base: { command: 'inspect', fixture: inspectBaseFixture },
};
