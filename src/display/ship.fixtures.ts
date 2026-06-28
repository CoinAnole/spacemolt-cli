import type { HighValueFixtureEntry } from './formatter-fixtures.ts';

export const cargoFixture = {
  credits: 12345,
  cargo: [{ item_id: 'ore_iron', item_name: 'Iron Ore', quantity: 50 }],
  ship: {
    cargo_used: 50,
    cargo_capacity: 100,
  },
};

export const emptyCargoFixture = {
  message: 'Cargo contents',
  credits: 12345,
  ship: {
    cargo_capacity: 385,
    cargo_used: 0,
  },
};

export const shipFixture = {
  message: 'Ship status',
  credits: 12345,
  modules: [
    {
      cpu_usage: 2,
      module_id: 'module-1',
      name: 'Cargo Expander III',
      power_usage: 2,
      size: 10,
      slot: 'utility',
      type: 'utility',
      type_id: 'cargo_expander_iii',
      wear: 0,
      wear_status: 'Pristine',
    },
    {
      cpu_usage: 3,
      module_id: 'module-2',
      name: 'Pulse Laser III',
      power_usage: 8,
      size: 10,
      slot: 'weapon',
      type: 'weapon',
      type_id: 'pulse_laser_iii',
      wear: 2,
      wear_status: 'Scuffed',
    },
  ],
  ship: {
    armor: 18,
    cargo_capacity: 1250,
    cargo_used: 0,
    class_id: 'deep_survey',
    class_name: 'Deep Survey',
    cpu_capacity: 34,
    cpu_used: 16,
    custom_name: 'Asteroid Accessory',
    defense_slots: 1,
    fuel: 240,
    hull: 420,
    id: 'ship-1',
    max_fuel: 240,
    max_hull: 420,
    max_shield: 300,
    name: 'Deep Survey',
    power_capacity: 75,
    power_used: 23,
    shield: 300,
    shield_recharge: 4,
    utility_slots: 5,
    weapon_slots: 1,
  },
};

export const baseFixture = {
  base: {
    defense_level: 55,
    description: 'A busy trade station.',
    empire: 'solarian',
    facilities: ['fuel_grid', 'trade_nexus', 'fleet_yards'],
    fuel: 290750,
    has_drones: true,
    id: 'nova_terra_central',
    max_fuel: 0,
    name: 'Nova Terra Central',
    poi_id: 'nova_terra_central',
    public_access: true,
  },
  condition: {
    condition: 'critical',
    condition_text: 'Critical infrastructure failure.',
    satisfaction_pct: 16,
    satisfied_count: 2,
    total_service_infra: 12,
  },
  construction: {
    pending: [
      {
        definition_id: 'life_support_mk2',
        name: 'Life Support Mk II',
        category: 'infrastructure',
        status: 'gathering_materials',
        materials: [
          {
            item_id: 'circuit_board',
            name: 'Circuit Board',
            quantity_required: 40,
            quantity_in_storage: 12,
            quantity_missing: 28,
          },
        ],
      },
    ],
    under_construction: [
      {
        definition_id: 'battery_bank_mk1',
        name: 'Battery Bank Mk I',
        category: 'infrastructure',
        status: 'building',
        ticks_until_complete: 9,
      },
    ],
  },
  fuel_price: 6,
  power: {
    supply: 120,
    current_draw: 95,
    battery_stored: 420,
    battery_capacity: 600,
    efficiency: 0.85,
  },
  services: ['crafting', 'market', 'missions', 'refuel'],
};

export const dronesFixture = {
  bay_count: 1,
  bay_capacity: 2,
  deployed_count: 1,
  bandwidth_used: 1,
  bandwidth_total: 4,
  drones: [
    {
      id: 'drone-1',
      name: 'Survey Drone',
      type: 'survey',
      status: 'deployed',
      hull: 90,
      max_hull: 100,
      poi_id: 'sol_asteroid_belt',
      cargo_pct: 40,
      has_script: true,
    },
  ],
};

export const droneFixture = {
  id: 'drone-1',
  item_id: 'survey_drone',
  name: 'Survey Drone',
  type: 'survey',
  status: 'loaded',
  system_id: 'sol',
  poi_id: 'earth_station',
  hull: 100,
  max_hull: 100,
  cargo: [],
  cargo_used: 0,
  cargo_capacity: 20,
  script: 'scan()',
  memory: {},
  loaded_at: '2026-06-01T00:00:00Z',
};

export const wrecksFixture = {
  count: 1,
  wrecks: [
    {
      id: 'wreck-1',
      type: 'ship',
      poi_id: 'sol_asteroid_belt',
      system_id: 'sol',
      ship_class: 'skiff',
      ship_name: 'Lucky Strike',
      victim_id: 'player-ibis',
      victim_name: 'Ibis',
      cargo: [{ item_id: 'ore_iron', name: 'Iron Ore', quantity: 10, size: 1 }],
      modules: [
        {
          id: 'module-1',
          type_id: 'pulse_laser_i',
          name: 'Pulse Laser I',
          type: 'weapon',
          wear: 0.2,
        },
      ],
      salvage_value: 1250,
      created_at: '2026-05-29T00:00:00Z',
      expires_at: '2026-05-29T01:00:00Z',
      expire_tick: 12050,
    },
  ],
};

export const reloadFixture = {
  details: {
    action: 'reload',
    weapon_id: 'weapon-1',
    weapon_name: 'Pulse Laser',
    ammo_id: 'ammo-cell',
    ammo_name: 'Laser Cell',
    previous_ammo: 'empty',
    current_ammo: 8,
    magazine_size: 8,
    rounds_discarded: 0,
  },
  cargo: [{ item_id: 'ammo-cell', item_name: 'Laser Cell', quantity: 2 }],
  ship: {
    fuel: 80,
    max_fuel: 100,
    cargo_used: 2,
    cargo_capacity: 60,
  },
};

export const refuelFixture = {
  action: 'refuel',
  fuel: -697,
  fuel_max: 4000,
  fuel_now: 3046,
  source: 'ship_transfer',
  target_fuel_max: 700,
  target_fuel_now: 700,
  target_player_id: '9c8913b2cf825728a2404c9e4c4d7afb',
  target_player_name: 'Fabrini',
};

export const stationRefuelFixture = {
  action: 'refuel',
  source: 'station',
  fuel: 3998,
  fuel_now: 4000,
  fuel_max: 4000,
  market_cost: 7996,
  tax_amount: 7996,
  cost: 15992,
};

export const shipFixtureCases = {
  cargo: { command: 'get_cargo', fixture: cargoFixture },
  ship: { command: 'get_ship', fixture: shipFixture },
  base: { command: 'get_base', fixture: baseFixture },
  drone: { command: 'get_drone', fixture: droneFixture },
  drones: { command: 'list_drones', fixture: dronesFixture },
};

export const shipHighValueFixtures: Record<string, HighValueFixtureEntry> = {
  get_cargo: { command: 'get_cargo', fixture: cargoFixture },
  get_cargo_empty: { command: 'get_cargo', fixture: emptyCargoFixture },
  get_ship: { command: 'get_ship', fixture: shipFixture },
  get_base: { command: 'get_base', fixture: baseFixture },
  get_wrecks: { command: 'get_wrecks', fixture: wrecksFixture },
  refuel: { command: 'refuel', fixture: refuelFixture, schemaTarget: 'details' },
  refuel_station: { command: 'refuel', fixture: stationRefuelFixture, schemaTarget: 'details' },
  reload: { command: 'reload', fixture: reloadFixture },
  list_drones: { command: 'list_drones', fixture: dronesFixture },
  get_drone: { command: 'get_drone', fixture: droneFixture },
};
