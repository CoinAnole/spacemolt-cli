export const cargoFixture = {
  cargo: [{ item_id: 'ore_iron', item_name: 'Iron Ore', quantity: 50 }],
  used: 50,
  capacity: 100,
  available: 50,
};

export const emptyCargoFixture = {
  message: 'Cargo contents',
  ship: {
    cargo_capacity: 385,
    cargo_used: 0,
  },
};

export const shipFixture = {
  message: 'Ship status',
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
    structural_draw: 95,
    battery_stored: 420,
    battery_capacity: 600,
    efficiency: 0.85,
  },
  services: ['crafting', 'market', 'missions', 'refuel'],
};

export const dronesFixture = {
  drones: [
    {
      drone_id: 'drone-1',
      name: 'Survey Drone',
      status: 'deployed',
      poi_name: 'Sol Asteroid Belt',
      cargo_used: 4,
    },
  ],
};

export const droneFixture = {
  drone: {
    drone_id: 'drone-1',
    name: 'Survey Drone',
    status: 'loaded',
    base_id: 'earth_station',
    script: 'scan()',
  },
};

export const wrecksFixture = {
  wrecks: [
    {
      wreck_id: 'wreck-1',
      ship_class: 'skiff',
      ticks_remaining: 5,
      items: [{ item_id: 'ore_iron', quantity: 10 }],
    },
  ],
};

export const reloadFixture = {
  action: 'reload',
  weapon_id: 'weapon-1',
  weapon_name: 'Pulse Laser',
  ammo_id: 'ammo-cell',
  ammo_name: 'Laser Cell',
  previous_ammo: 'empty',
  current_ammo: 'Laser Cell',
  magazine_size: 8,
  rounds_discarded: 0,
};

export const salvageWreckFixture = {
  metal_scrap: 14,
  rare_materials: 2,
  components: 3,
  total_value: 1250,
  xp_gained: 18,
};

export const shipFixtureCases = {
  cargo: { command: 'get_cargo', fixture: cargoFixture },
  ship: { command: 'get_ship', fixture: shipFixture },
  base: { command: 'get_base', fixture: baseFixture },
  drone: { command: 'get_drone', fixture: droneFixture },
  drones: { command: 'list_drones', fixture: dronesFixture },
};

export const shipHighValueFixtures = {
  get_cargo: { command: 'get_cargo', fixture: cargoFixture },
  get_cargo_empty: { command: 'get_cargo', fixture: emptyCargoFixture },
  get_ship: { command: 'get_ship', fixture: shipFixture },
  get_base: { command: 'get_base', fixture: baseFixture },
  get_wrecks: { command: 'get_wrecks', fixture: wrecksFixture },
  reload: { command: 'reload', fixture: reloadFixture },
  salvage_wreck: { command: 'salvage_wreck', fixture: salvageWreckFixture },
  list_drones: { command: 'list_drones', fixture: dronesFixture },
  get_drone: { command: 'get_drone', fixture: droneFixture },
};
