import type { HighValueFixtureEntry } from './formatter-fixtures.ts';

export const cargoFixture = {
  credits: 12345,
  cargo: [{ item_id: 'ore_iron', item_name: 'Iron Ore', quantity: 50 }],
  ship: {
    cargo_used: 50,
    cargo_capacity: 100,
  },
  bay_used: 1,
  bay_capacity: 2,
  carried_ships: [
    {
      ship_id: 'ship-carried-1',
      class_id: 'prospector',
      class_name: 'Prospector',
      name: 'Rock Skipper',
    },
  ],
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
    },
  ],
  ship: {
    armor: 18,
    berths: {
      economy: { total: 4, free: 3 },
      business: { total: 1, free: 1 },
      first: { total: 0, free: 0 },
    },
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
    armor: 400,
    description: 'A busy trade station.',
    empire: 'solarian',
    facilities: ['fuel_grid', 'trade_nexus', 'fleet_yards'],
    fuel: 290750,
    hull: 8000,
    id: 'nova_terra_central',
    max_fuel: 0,
    max_hull: 10000,
    max_shield: 3000,
    name: 'Nova Terra Central',
    poi_id: 'nova_terra_central',
    public_access: true,
    shield: 2500,
    type: 'outpost',
    weapon_dps: 120,
    weapon_reach: 2,
    wrecked: false,
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
  life_support: {
    supply: 40,
    demand: 35,
    plants: 2,
    maintenance_cycle_ticks: 100,
    maintenance: [
      { item_id: 'oxygen', name: 'Oxygen', quantity_per_cycle: 100 },
      { item_id: 'water_ice', name: 'Water Ice', quantity_per_cycle: 200 },
    ],
    starved: [{ item_id: 'oxygen', name: 'Oxygen', quantity_per_cycle: 100 }],
    remediation: 'Restock Oxygen to keep life support online.',
  },
  services: ['crafting', 'market', 'missions', 'refuel'],
};

const baseRepairsNextBlocked = {
  instance_id: 'fac-ls-1',
  definition_id: 'life_support_mk1',
  name: 'Life Support Mk I',
  category: 'infrastructure',
  status: 'waiting',
  materials: [
    {
      item_id: 'circuit_board',
      name: 'Circuit Board',
      quantity_required: 40,
      quantity_in_storage: 12,
      quantity_missing: 28,
    },
    {
      item_id: 'steel_plate',
      name: 'Steel Plate',
      quantity_required: 10,
      quantity_in_storage: 0,
      quantity_missing: 10,
    },
  ],
};

export const baseRepairsFixture = {
  base: {
    armor: 400,
    description: 'A raided frontier cache.',
    empire: 'solarian',
    facilities: ['fuel_grid', 'life_support_mk1'],
    fuel: 800,
    hull: 4200,
    id: 'frontier_cache',
    max_fuel: 2400,
    max_hull: 10000,
    max_shield: 3000,
    name: 'Frontier Cache',
    poi_id: 'frontier_cache',
    public_access: true,
    shield: 0,
    type: 'outpost',
    weapon_dps: 40,
    weapon_reach: 1,
    wrecked: true,
  },
  condition: {
    condition: 'critical',
    condition_text: 'Critical infrastructure failure.',
    satisfaction_pct: 16,
    satisfied_count: 2,
    total_service_infra: 12,
  },
  services: ['market', 'storage'],
  repairs: {
    wrecked: true,
    damaged_count: 3,
    repairing_count: 1,
    waiting_count: 2,
    supply_method: 'example',
    hull_current: 4200,
    hull_required: 10000,
    hull_missing: 5800,
    remediation: 'Sell Steel Plate into this station market to unblock the next repair.',
    next_blocked: baseRepairsNextBlocked,
    facilities: [
      baseRepairsNextBlocked,
      {
        instance_id: 'fac-fg-2',
        definition_id: 'fuel_grid',
        name: 'Fuel Grid',
        category: 'infrastructure',
        status: 'repairing',
        ticks_until_complete: 4,
      },
      {
        instance_id: 'fac-st-3',
        definition_id: 'storage_bay',
        name: 'Storage Bay',
        category: 'infrastructure',
        status: 'damaged',
      },
    ],
  },
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
        },
      ],
      salvage_value: 1250,
      created_at: '2026-05-29T00:00:00Z',
      expires_at: '2026-05-29T01:00:00Z',
      expire_tick: 12050,
    },
  ],
};

// Nested live-shaped SC (no schemaTarget): matches unit formatter envelopes and live V2 deltas.
// scrap details.materials uses OpenAPI shape { item, name, quantity }; outer cargo keeps item_id/item_name.
export const towWreckFixture = {
  details: {
    action: 'tow_wreck',
    wreck_id: 'wreck-1',
    message: 'Tow line attached.',
    insured: false,
    cargo_count: 2,
    module_count: 1,
    salvage_value: 1250,
    ship_class: 'skiff',
    speed_penalty: '25%',
  },
  ship: { fuel: 92, max_fuel: 100 },
  location: {
    system_id: 'sol',
    system_name: 'Sol',
    poi_id: 'sol_belt',
    poi_name: 'Belt',
  },
};

export const releaseTowFixture = {
  details: {
    action: 'release_tow',
    wreck_id: 'wreck-1',
    message: 'Tow released.',
  },
  ship: { fuel: 92, max_fuel: 100 },
};

export const scrapWreckFixture = {
  details: {
    action: 'scrap_wreck',
    wreck_id: 'wreck-1',
    message: 'Scrapped wreck.',
    materials: [{ item: 'scrap_metal', name: 'Scrap Metal', quantity: 4 }],
    total_value: 1250,
    stored_at: 'sol_yard',
    ship_class: 'skiff',
  },
  cargo: [{ item_id: 'scrap_metal', item_name: 'Scrap Metal', quantity: 4 }],
  skills: { salvaging: { level: 2, xp: 140 } },
};

export const sellWreckFixture = {
  details: {
    action: 'sell_wreck',
    wreck_id: 'wreck-1',
    message: 'Sold wreck.',
    new_balance: 2400,
    total_payout: 500,
    salvage_value: 400,
    cargo_value: 100,
    ship_class: 'skiff',
  },
  player: { credits: 2400 },
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

export const shipDroneBayFixture = {
  ...shipFixture,
  drone_bay: {
    bay_count: 2,
    bay_capacity: 2,
    deployed_count: 1,
    bandwidth_used: 1,
    bandwidth_total: 4,
    in_bay: [{ id: 'drone-1', name: 'Survey Drone', type: 'survey' }],
  },
};

export const shipRemoteFixture = {
  message: 'Parked in your faction garage at Nova Terra Central.',
  credits: 12345,
  modules: shipFixture.modules,
  ship: {
    ...shipFixture.ship,
    id: 'ship-garaged-1',
    custom_name: 'Claim Candidate',
    location: 'Faction garage — Nova Terra Central',
  },
};

export const shipFixtureCases = {
  cargo: { command: 'get_cargo', fixture: cargoFixture },
  ship: { command: 'get_ship', fixture: shipFixture },
  base: { command: 'get_base', fixture: baseFixture },
  drone: { command: 'get_drone', fixture: droneFixture },
  drones: { command: 'list_drones', fixture: dronesFixture },
};

export const listShipsFixture = {
  count: 2,
  active_ship_id: 'ship-active',
  active_ship_class: 'lithosphere',
  ships: [
    {
      ship_id: 'ship-active',
      class_id: 'lithosphere',
      class_name: 'Lithosphere',
      custom_name: 'Burn-Rate Betty',
      is_active: true,
      location: 'active (with you)',
      hull: '420/420',
      fuel: '240/240',
      cargo_used: 12,
      modules: 3,
      module_type_ids: ['survey_scanner_ii', 'mining_laser_i', 'cargo_expander_iii'],
    },
    {
      ship_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      class_id: 'dust_devil',
      class_name: 'Dust Devil',
      is_active: false,
      location: 'stored at Nova Terra Central',
      location_base_id: 'nova_terra_central',
      hull: '80/100',
      fuel: '40/80',
      cargo_used: 0,
      modules: 1,
      module_type_ids: ['cargo_expander_i'],
      listing_id: 'listing-1',
      listing_price: 12500,
      listing_base_id: 'nova_terra_central',
    },
  ],
  faction_garage_used: 1,
  faction_garage_capacity: 4,
  faction_garage: [
    {
      ship_id: 'ship-garage',
      class_id: 'prospector',
      class_name: 'Prospector',
      custom_name: 'Rock Skipper',
      depositor_id: 'player-1',
      depositor_name: 'Ibis',
      deposited_tick: 12050,
    },
  ],
};

export const shipHighValueFixtures: Record<string, HighValueFixtureEntry> = {
  get_cargo: { command: 'get_cargo', fixture: cargoFixture },
  get_cargo_empty: { command: 'get_cargo', fixture: emptyCargoFixture },
  get_ship: { command: 'get_ship', fixture: shipFixture },
  get_ship_drone_bay: { command: 'get_ship', fixture: shipDroneBayFixture },
  get_ship_remote: { command: 'get_ship', fixture: shipRemoteFixture },
  get_base: { command: 'get_base', fixture: baseFixture },
  get_base_repairs: { command: 'get_base', fixture: baseRepairsFixture },
  get_wrecks: { command: 'get_wrecks', fixture: wrecksFixture },
  tow_wreck: { command: 'tow_wreck', fixture: towWreckFixture },
  release_tow: { command: 'release_tow', fixture: releaseTowFixture },
  scrap_wreck: { command: 'scrap_wreck', fixture: scrapWreckFixture },
  sell_wreck: { command: 'sell_wreck', fixture: sellWreckFixture },
  refuel: { command: 'refuel', fixture: refuelFixture, schemaTarget: 'details' },
  refuel_station: { command: 'refuel', fixture: stationRefuelFixture, schemaTarget: 'details' },
  reload: { command: 'reload', fixture: reloadFixture },
  list_drones: { command: 'list_drones', fixture: dronesFixture },
  get_drone: { command: 'get_drone', fixture: droneFixture },
  list_ships: { command: 'list_ships', fixture: listShipsFixture },
};
