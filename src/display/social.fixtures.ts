export const chatSentFixture = {
  action: 'chat',
  target: 'local',
  content: 'Clear skies.',
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

export const facilityListFixture = {
  base_id: 'earth_station',
  station_facilities: [
    {
      facility_id: 'station-fuel',
      type: 'fuel_bunker',
      name: 'Fuel Bunker',
      category: 'service',
      active: true,
      maintenance_satisfied: true,
    },
  ],
  player_facilities: [
    {
      facility_id: 'player-refinery',
      type: 'ore_refinery',
      name: 'Ore Refinery',
      category: 'production',
      active: false,
      maintenance_satisfied: true,
    },
  ],
  faction_facilities: [],
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

export const socialFixtureCases = {
  chat_sent: { command: 'chat', fixture: chatSentFixture },
  facilities: { command: 'facility_list', fixture: facilitiesFixture },
  facility_list: { command: 'facility_list', fixture: facilityListFixture },
  facility_types: { command: 'facility_types', fixture: facilityTypesFixture },
  facility: { command: 'facility_get', fixture: facilityFixture },
  fleet: { command: 'fleet_status', fixture: fleetFixture },
  battle_status: { command: 'get_battle_status', fixture: battleStatusFixture },
};

export const socialHighValueFixtures = {
  chat: { command: 'chat', fixture: chatSentFixture },
  facility_list: { command: 'facility_list', fixture: facilitiesFixture },
  facility_list_detailed: { command: 'facility_list', fixture: facilityListFixture },
  facility_get: { command: 'facility_get', fixture: facilityFixture },
  fleet_status: { command: 'fleet_status', fixture: fleetFixture },
  get_battle_status: { command: 'get_battle_status', fixture: battleStatusFixture },
  facility_types: { command: 'facility_types', fixture: facilityTypesFixture },
};
