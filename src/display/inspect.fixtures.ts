import type { HighValueFixtureEntry } from './formatter-fixtures.ts';
import { baseRepairsFixture } from './ship.fixtures.ts';

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

export const inspectCatalogModuleFixture = {
  id: 'blood_reaver',
  kind: 'catalog',
  source: 'catalog',
  catalog: {
    type: 'items',
    items: [
      {
        id: 'blood_reaver',
        type_id: 'blood_reaver',
        type: 'weapon',
        slot: 'weapon',
        name: 'Blood Reaver',
        description:
          'Deals 45 kinetic damage and repairs its user for 20% of damage dealt. Fires every 2 ticks at reach 3.',
        size: 10,
        base_value: 8700,
        cpu_usage: 9,
        power_usage: 20,
        damage: 45,
        damage_type: 'kinetic',
        ammo_type: 'autocannon',
        reach: 3,
        cooldown: 2,
        magazine_size: 1000,
        special: 'lifesteal_20',
        combat_effects: { lifesteal_pct: 20 },
        required_skills: { weapons: 4 },
      },
    ],
    page: 1,
    page_size: 20,
    total: 1,
    total_pages: 1,
    message: 'Items: showing 1 of 1',
  },
};

export const inspectCatalogShipFixture = {
  id: 'comet',
  kind: 'catalog',
  source: 'catalog',
  catalog: {
    type: 'ships',
    items: [
      {
        id: 'comet',
        name: 'Comet',
        description:
          "Nebula's most exclusive liner — every berth a first-class suite, every crossing made at the fastest pace the galaxy allows. Built for passengers whose time is the most expensive thing aboard.",
        class: 'Liner',
        tier: 4,
        scale: 4,
        faction: 'nebula',
        category: 'Civilian',
        base_hull: 700,
        base_shield: 700,
        base_shield_recharge: 12,
        base_armor: 20,
        base_speed: 6,
        base_fuel: 900,
        cargo_capacity: 200,
        cpu_capacity: 55,
        power_capacity: 150,
        weapon_slots: 0,
        defense_slots: 4,
        utility_slots: 5,
        crew_capacity: 60,
        minimum_crew: 18,
        marine_capacity: 4,
        latch_resistance: 1,
        boarding_defense_bonus_pct: 10,
        default_modules: ['shield_booster_iii', 'shield_booster_iii', 'ship_scanner_ii'],
        required_achievement: 'galactic_concierge',
        prestige_lock:
          'Locked: prestige hull reserved for pilots who have earned the "Galactic Concierge" achievement.',
        inherent_capabilities: [
          { type: 'passenger_first_berths', value: 48 },
          { type: 'fuel_efficiency_bonus', value: 50 },
          { type: 'passenger_dining_points', value: 3 },
          { type: 'passenger_leisure_points', value: 8 },
          { type: 'passenger_comfort', value: 40 },
        ],
        shipyard_tier: 3,
        build_materials: [
          { item_id: 'jump_coil', quantity: 24 },
          { item_id: 'life_support_array', quantity: 12 },
          { item_id: 'titanium_alloy', quantity: 1200 },
          { item_id: 'durasteel_plate', quantity: 200 },
          { item_id: 'thruster_nozzle', quantity: 150 },
          { item_id: 'life_support_unit', quantity: 400 },
          { item_id: 'station_reactor_core', quantity: 12 },
          { item_id: 'fuel_tank', quantity: 300 },
          { item_id: 'capital_ship_frame', quantity: 30 },
          { item_id: 'engine_core', quantity: 60 },
          { item_id: 'navigation_core', quantity: 200 },
          { item_id: 'navigation_array', quantity: 16 },
          { item_id: 'prismatic_lens', quantity: 120 },
          { item_id: 'shield_emitter', quantity: 300 },
          { item_id: 'cargo_container', quantity: 150 },
        ],
        build_time: 16000,
      },
    ],
    page: 1,
    page_size: 20,
    total: 1,
    total_pages: 1,
    message: 'Ships: showing 1 of 1',
  },
};

export const inspectCatalogBoardingModuleFixture = {
  id: 'boarding_claws_ii',
  kind: 'catalog',
  source: 'catalog',
  catalog: {
    type: 'items',
    items: [
      {
        id: 'boarding_claws_ii',
        type_id: 'boarding_claws_ii',
        type: 'utility',
        slot: 'utility',
        name: 'Boarding Claws II',
        description: 'Latch onto a hostile hull and hold a corridor for marine teams.',
        size: 12,
        base_value: 18500,
        cpu_usage: 8,
        power_usage: 14,
        crew_capacity_bonus: 2,
        marine_capacity_bonus: 4,
        latch_strength: 3,
        latch_resistance: 1,
        boarding_defense_bonus_pct: 15,
        crew_combat_bonus_pct: 5,
        marine_combat_bonus_pct: 10,
        medical_treatment_rate: 2,
        fleet_triage_pct: 8,
        boarding_capability: true,
        boarding_contact_defense: true,
        remote_medical_treatment: true,
      },
    ],
    page: 1,
    page_size: 20,
    total: 1,
    total_pages: 1,
    message: 'Items: showing 1 of 1',
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

export const inspectBaseRepairsFixture = {
  id: 'frontier_cache',
  kind: 'base',
  source: 'station',
  base: baseRepairsFixture,
};

export const inspectFixtureCases = {
  inspect_package: { command: 'inspect', fixture: inspectPackageFixture },
  inspect_package_shipment: { command: 'inspect', fixture: inspectPackageShipmentFixture },
  inspect_catalog_module: { command: 'inspect', fixture: inspectCatalogModuleFixture },
  inspect_catalog_ship: { command: 'inspect', fixture: inspectCatalogShipFixture },
  inspect_catalog_recipe: { command: 'inspect', fixture: inspectCatalogRecipeFixture },
  inspect_base: { command: 'inspect', fixture: inspectBaseFixture },
};

export const inspectHighValueFixtures: Record<string, HighValueFixtureEntry> = {
  inspect_package: { command: 'inspect', fixture: inspectPackageFixture },
  inspect_package_shipment: { command: 'inspect', fixture: inspectPackageShipmentFixture },
  inspect_catalog_module: { command: 'inspect', fixture: inspectCatalogModuleFixture },
  inspect_catalog_ship: { command: 'inspect', fixture: inspectCatalogShipFixture },
  inspect_catalog_boarding_module: { command: 'inspect', fixture: inspectCatalogBoardingModuleFixture },
  inspect_catalog_recipe: { command: 'inspect', fixture: inspectCatalogRecipeFixture },
  inspect_base: { command: 'inspect', fixture: inspectBaseFixture },
  inspect_base_repairs: { command: 'inspect', fixture: inspectBaseRepairsFixture },
};
