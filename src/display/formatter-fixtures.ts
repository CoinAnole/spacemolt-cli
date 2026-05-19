export const getLocationFixture = {
  message: 'Location retrieved',
  location: {
    system_id: 'sol',
    system_name: 'Sol',
    empire: 'Terran',
    security_status: 'high security',
    connections: ['alpha_centauri'],
    poi_id: 'sol_earth',
    poi_name: 'Earth',
    poi_type: 'planet',
    docked_at: 'earth_station',
    nearby_player_count: 1,
    nearby_players: [{ username: 'Marlowe', faction_tag: 'SMC', ship_class: 'prospector' }],
    nearby_pirate_count: 2,
    nearby_pirates: [{ name: 'Raider' }],
    nearby_empire_npc_count: 1,
    nearby_empire_npcs: [{ name: 'Patrol' }],
  },
};

export const browseShipsFixture = {
  base_name: 'Earth Station',
  listings: [
    {
      listing_id: 'listing-1',
      ship_id: 'ship-1',
      ship_name: 'Lucky Strike',
      class_id: 'prospector',
      price: 125000,
      scale: 1,
      tier: 2,
      category: 'Mining',
      hull: 80,
      max_hull: 100,
      shield: 20,
      seller_name: 'Marlowe',
    },
  ],
};

export const viewMarketFixture = {
  action: 'view_market',
  base_id: 'earth_station',
  items: [
    {
      item_id: 'ore_iron',
      item_name: 'Iron Ore',
      buy_orders: [{ price_each: 15, quantity: 500, source: 'station' }],
      sell_orders: [{ price_each: 18, quantity: 125 }],
    },
    {
      item_id: 'fuel_cell',
      item_name: 'Fuel Cell',
      buy_orders: [],
      sell_orders: [],
    },
  ],
};

export const getStatusFixture = {
  player: {
    username: 'Marlowe',
    empire: 'Terran',
    credits: 4242,
    faction_id: 'smc',
    faction_rank: 'captain',
  },
  ship: {
    name: 'Surveyor',
    class_id: 'prospector',
    hull: 90,
    max_hull: 100,
    shield: 35,
    max_shield: 50,
    shield_recharge: 5,
    armor: 10,
    fuel: 80,
    max_fuel: 100,
    cargo_used: 12,
    cargo_capacity: 60,
    cpu_used: 8,
    cpu_capacity: 20,
    power_used: 10,
    power_capacity: 25,
  },
  location: {
    system_id: 'sol',
    system_name: 'Sol',
    poi_id: 'sol_earth',
    poi_name: 'Earth',
    docked_at: 'earth_station',
    nearby_players: [{ username: 'Ibis', ship_class: 'hauler' }],
  },
};

export const systemInfoFixture = {
  system: {
    id: 'sol',
    name: 'Sol',
    empire: 'Terran',
    police_level: 5,
    description: 'Birthplace system',
    pois: [
      {
        id: 'sol_earth',
        name: 'Earth',
        type: 'planet',
        has_base: true,
        online: 2,
      },
    ],
    connections: [{ system_id: 'alpha_centauri', name: 'Alpha Centauri', distance: 4.3 }],
  },
  security_status: 'high security',
  poi: { id: 'sol_earth', name: 'Earth', type: 'planet' },
};

export const poiInfoFixture = {
  poi: {
    id: 'sol_asteroid_belt',
    name: 'Sol Asteroid Belt',
    type: 'asteroid_belt',
    system_id: 'sol',
    description: 'Dense mining field',
    class: 'common',
  },
  resources: [
    {
      resource_id: 'ore_iron',
      name: 'Iron Ore',
      richness: 3,
      remaining: 750,
      max_remaining: 1000,
      depletion_percent: 75,
    },
  ],
};

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
  fuel_price: 6,
  services: ['crafting', 'market', 'missions', 'refuel'],
};

export const nearbyFixture = {
  nearby: [{ username: 'Marlowe', faction_tag: 'SMC', ship_class: 'prospector' }],
  count: 1,
  pirates: [{ name: 'Raider', ship_class: 'skiff', status: 'hostile' }],
  pirate_count: 1,
  empire_npcs: [{ name: 'Patrol', ship_class: 'interceptor' }],
  empire_npc_count: 1,
};

export const arrivalFixture = {
  poi_id: 'sol_earth',
  poi: 'Earth',
  online_players: [{ username: 'Ibis', ship_class: 'hauler' }],
  online_players_count: 1,
};

export const storageFixture = {
  base_id: 'earth_station',
  items: [{ item_id: 'fuel_cell', item_name: 'Fuel Cell', quantity: 12 }],
  ships: [
    {
      ship_id: 'ship-1',
      class_id: 'prospector',
      class_name: 'Prospector',
      modules: 3,
      cargo_used: 10,
    },
  ],
};

export const chatSentFixture = {
  action: 'chat',
  target: 'local',
  content: 'Clear skies.',
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

export const facilitiesFixture = {
  facilities: [
    {
      facility_id: 'facility-1',
      name: 'Fuel Bunker',
      level: 2,
      status: 'online',
      owner_name: 'Marlowe',
    },
  ],
};

export const facilityTypesFixture = {
  categories: {
    infrastructure: {
      count: 55,
      description: 'Power and life support systems',
    },
    personal: {
      buildable: 4,
      count: 13,
      description: 'Personal facilities',
    },
    production: {
      buildable: 427,
      count: 1589,
      description: 'Manufacturing facilities',
    },
  },
  hint: 'Use filters to browse.',
  total: 1753,
};

export const facilityFixture = {
  facility: {
    facility_id: 'facility-1',
    name: 'Fuel Bunker',
    level: 2,
    enabled: true,
    owner_name: 'Marlowe',
  },
};

export const fleetFixture = {
  fleet: {
    fleet_id: 'fleet-1',
    leader_name: 'Marlowe',
    members: [
      {
        player_id: 'player-1',
        username: 'Marlowe',
        ship_class: 'prospector',
        system_name: 'Sol',
        status: 'ready',
      },
    ],
  },
};

export const battleStatusFixture = {
  battle: {
    battle_id: 'battle-1',
    status: 'active',
    range_band: 'medium',
    participants: [
      {
        player_id: 'player-1',
        username: 'Marlowe',
        side_id: 1,
        stance: 'fire',
        target_id: 'pirate-1',
      },
    ],
  },
};

export const marketOrdersFixture = {
  orders: [
    {
      order_id: 'order-1',
      item_id: 'ore_iron',
      side: 'buy',
      quantity: 100,
      price_each: 12,
    },
  ],
};

export const commissionStatusFixture = {
  commissions: [
    {
      commission_id: 'commission-1',
      ship_class_id: 'prospector',
      ship_name: 'Lucky Strike',
      status: 'building',
      base_name: 'Earth Station',
      ticks_remaining: 12,
    },
  ],
  count: 1,
};

export const emptyCommissionStatusFixture = {
  commissions: [],
  count: 0,
};

export const intelFixture = {
  intel: [
    {
      system_name: 'Sol',
      poi_name: 'Earth',
      item_id: 'fuel_cell',
      price_each: 25,
      updated_at: '2026-05-17T00:00:00Z',
    },
  ],
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

export const skillsV2Fixture = {
  skills: [{ skill_id: 'mining', name: 'Mining', category: 'Industry' }],
  player_skills: [
    {
      skill_id: 'mining',
      name: 'Mining',
      category: 'Industry',
      level: 3,
      max_level: 10,
      current_xp: 450,
      next_level_xp: 600,
    },
  ],
  player_skill_count: 1,
};

export const skillsV1Fixture = {
  skills: {
    mining: {
      name: 'Mining',
      category: 'Industry',
      level: 3,
      max_level: 10,
      xp: 450,
      next_level_xp: 600,
    },
  },
};

export const marketListingsFixture = {
  listings: [
    {
      listing_id: 'listing-1',
      item_id: 'ore_iron',
      quantity: 100,
      price_each: 15,
      seller_name: 'Marlowe',
    },
  ],
};

export const catalogItemsFixture = {
  items: [
    {
      base_value: 500,
      category: 'ammo',
      description: 'The most destructive single projectile in known space.',
      id: 'antimatter_torpedoes',
      name: 'Antimatter Torpedoes',
      rarity: 'exotic',
      size: 1,
      stackable: true,
      tradeable: true,
    },
    {
      base_value: 15,
      category: 'ammo',
      description: 'Hardened penetrator tips packed in a sealed magazine.',
      id: 'armor_piercing_rounds_box',
      name: 'Armor Piercing Rounds Box',
      rarity: 'uncommon',
      size: 1,
      stackable: true,
      tradeable: true,
    },
  ],
  message: 'Items: showing 2 of 537',
  page: 1,
  page_size: 20,
  total: 537,
  total_pages: 27,
  type: 'items',
};

export const missionsFixture = {
  base_id: 'nova_terra_central',
  base_name: 'Nova Terra Central',
  missions: [
    {
      difficulty: 3,
      mission_id: 'pirate_sweep',
      title: 'Pirate Sweep',
      type: 'combat',
    },
    {
      difficulty: 5,
      mission_id: 'deep_core_prospecting',
      title: 'Deep Core Prospecting',
      type: 'mining',
    },
  ],
};

export const factionsFixture = {
  factions: [
    {
      id: 'faction-1',
      leader_username: 'DriftMiner-7',
      member_count: 20,
      name: 'Drift Matrix',
      owned_bases: 0,
      tag: 'DMX7',
    },
    {
      id: 'faction-2',
      leader_username: 'Mercator',
      member_count: 1,
      name: 'Mercs United',
      owned_bases: 0,
      tag: 'MERC',
    },
  ],
  limit: 50,
  offset: 0,
  total_count: 129,
};

export const formatterFixtureCases = {
  arrival: { command: 'travel', fixture: arrivalFixture },
  base: { command: 'get_base', fixture: baseFixture },
  battle_status: { command: 'get_battle_status', fixture: battleStatusFixture },
  cargo: { command: 'get_cargo', fixture: cargoFixture },
  chat_sent: { command: 'chat', fixture: chatSentFixture },
  drone: { command: 'get_drone', fixture: droneFixture },
  drones: { command: 'list_drones', fixture: dronesFixture },
  facilities: { command: 'facility_list', fixture: facilitiesFixture },
  facility_types: { command: 'facility_types', fixture: facilityTypesFixture },
  facility: { command: 'facility_get', fixture: facilityFixture },
  fleet: { command: 'fleet_status', fixture: fleetFixture },
  intel: { command: 'faction_trade_intel', fixture: intelFixture },
  market_orders: { command: 'view_orders', fixture: marketOrdersFixture },
  nearby: { command: 'get_nearby', fixture: nearbyFixture },
  poi_info: { command: 'get_poi', fixture: poiInfoFixture },
  ship: { command: 'get_ship', fixture: shipFixture },
  storage: { command: 'storage', fixture: storageFixture },
  system_info: { command: 'get_system', fixture: systemInfoFixture },
  view_market: { command: 'view_market', fixture: viewMarketFixture },
} satisfies Record<string, { command: string; fixture: Record<string, unknown> }>;

export const highValueCommandFixtures: Record<string, { command: string; fixture: Record<string, unknown> }> = {
  get_status: { command: 'get_status', fixture: getStatusFixture },
  get_location: { command: 'get_location', fixture: getLocationFixture },
  get_system: { command: 'get_system', fixture: systemInfoFixture },
  get_poi: { command: 'get_poi', fixture: poiInfoFixture },
  get_cargo: { command: 'get_cargo', fixture: cargoFixture },
  get_cargo_empty: { command: 'get_cargo', fixture: emptyCargoFixture },
  get_ship: { command: 'get_ship', fixture: shipFixture },
  get_base: { command: 'get_base', fixture: baseFixture },
  get_nearby: { command: 'get_nearby', fixture: nearbyFixture },
  get_skills: { command: 'get_skills', fixture: skillsV2Fixture },
  get_wrecks: { command: 'get_wrecks', fixture: wrecksFixture },
  catalog_items: { command: 'catalog', fixture: catalogItemsFixture },
  get_missions: { command: 'get_missions', fixture: missionsFixture },
  faction_list: { command: 'faction_list', fixture: factionsFixture },
  facility_types: { command: 'facility_types', fixture: facilityTypesFixture },
  browse_ships: { command: 'browse_ships', fixture: browseShipsFixture },
  view_market: { command: 'view_market', fixture: viewMarketFixture },
  travel: { command: 'travel', fixture: arrivalFixture },
  register: { command: 'register', fixture: { password: 's3cret', player_id: 'player-1' } },
  chat: { command: 'chat', fixture: chatSentFixture },
  list_drones: { command: 'list_drones', fixture: dronesFixture },
  get_drone: { command: 'get_drone', fixture: droneFixture },
  facility_list: { command: 'facility_list', fixture: facilitiesFixture },
  fleet_status: { command: 'fleet_status', fixture: fleetFixture },
  get_battle_status: { command: 'get_battle_status', fixture: battleStatusFixture },
  view_orders: { command: 'view_orders', fixture: marketOrdersFixture },
  commission_status: { command: 'commission_status', fixture: commissionStatusFixture },
  commission_status_empty: { command: 'commission_status', fixture: emptyCommissionStatusFixture },
  view_storage: { command: 'view_storage', fixture: storageFixture },
  faction_query_trade_intel: { command: 'faction_query_trade_intel', fixture: intelFixture },
  get_trades: { command: 'get_trades', fixture: marketListingsFixture },
  skills_v1: { command: 'get_skills', fixture: skillsV1Fixture },
};
