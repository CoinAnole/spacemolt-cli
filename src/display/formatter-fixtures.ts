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
