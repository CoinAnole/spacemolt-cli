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

/** Package under an on-time freight contract (OpenAPI InspectPackageShipment). */
export const inspectPackageShipmentFixture = {
  id: 'package:pkg_freight',
  kind: 'package',
  source: 'cargo',
  package: {
    package_id: 'pkg_freight',
    label: 'Sealed Reactor Parts',
    size: 50,
    created_at: '2026-07-26T12:00:00Z',
    owner: { type: 'player', id: 'p1', name: 'PilotOne' },
    creator: {
      player_id: 'p1',
      username: 'PilotOne',
      faction: { type: 'player_faction', id: 'f1', name: 'Survey Corps', tag: 'SRV' },
    },
    contents: [{ item_id: 'reactor_parts', name: 'Reactor Parts', quantity: 1, size: 50 }],
    shipment: {
      shipment_id: 'shipment-transit-1',
      status: 'in_transit',
      role: 'carrier',
      destination_base_id: 'nova_central',
      destination_name: 'Nova Central',
      destination_system: 'centauri',
      base_reward: 12500,
      payout_if_delivered_now: 12500,
      failure_debt: 33000,
      ticks_to_deadline: 40,
      ticks_to_recovery_deadline: 2920,
      late: false,
      // late_fee_if_delivered_now intentionally omitted when not late
    },
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
  inspect_package_shipment: { command: 'inspect', fixture: inspectPackageShipmentFixture },
  inspect_catalog_recipe: { command: 'inspect', fixture: inspectCatalogRecipeFixture },
  inspect_base: { command: 'inspect', fixture: inspectBaseFixture },
};

export const inspectHighValueFixtures: Record<string, HighValueFixtureEntry> = {
  inspect_package: { command: 'inspect', fixture: inspectPackageFixture },
  inspect_package_shipment: { command: 'inspect', fixture: inspectPackageShipmentFixture },
  inspect_catalog_recipe: { command: 'inspect', fixture: inspectCatalogRecipeFixture },
  inspect_base: { command: 'inspect', fixture: inspectBaseFixture },
};
