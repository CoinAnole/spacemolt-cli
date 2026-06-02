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
      is_recycler: false,
    },
  ],
};

export const facilityListFixture = {
  base_id: 'earth_station',
  power: {
    supply: 120,
    structural_draw: 95,
    battery_stored: 420,
    battery_capacity: 600,
    efficiency: 0.85,
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
  station_facilities: [
    {
      facility_id: 'station-fuel',
      type: 'fuel_bunker',
      name: 'Fuel Bunker',
      category: 'service',
      level: 3,
      active: true,
      maintenance_satisfied: true,
      is_recycler: false,
    },
  ],
  player_facilities: [
    {
      facility_id: 'player-refinery',
      type: 'ore_refinery',
      name: 'Ore Refinery',
      category: 'production',
      level: 2,
      active: false,
      maintenance_satisfied: true,
      is_recycler: true,
      configured_recipe_id: 'iron_ore_reverse',
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
    is_recycler: false,
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

export const captainLogGetFixture = {
  index: 0,
  created_at: '2026-05-29T14:45:00Z',
  entry: 'Reached Earth Station.\nLoaded fuel and checked the market.',
};

export const readNoteFixture = {
  note_id: 'note-1',
  title: 'Ore contract',
  content: 'Deliver 500 ore_iron to Earth Station.',
  created_by: 'Marlowe',
  created_at: '2026-05-28T12:00:00Z',
  updated_at: '2026-05-29T12:00:00Z',
  value: 250,
};

export const factionVisitRoomFixture = {
  action: 'visit_room',
  room_id: 'bridge',
  name: 'Bridge',
  description: 'Command deck for fleet operations.',
  access: 'members',
  author: 'Marlowe',
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-29T00:00:00Z',
};

export const factionInvitesFixture = {
  invites: [
    {
      faction_id: 'smc',
      faction_name: 'Surveyor Mining Collective',
      faction_tag: 'SMC',
      invited_by: 'Marlowe',
      invited_at: '2026-05-29T12:00:00Z',
    },
  ],
};

export const factionIntelStatusFixture = {
  intel_level: 3,
  coverage_pct: 42.5,
  systems_known: 17,
  pois_known: 68,
  total_systems: 40,
  contributors: 3,
  top_contributor: 'Marlowe',
  most_recent_tick: 12045,
  top_contributions: 12,
};

export const factionTradeIntelStatusFixture = {
  intel_level: 2,
  coverage_pct: 36.25,
  stations_known: 11,
  total_stations: 32,
  items_tracked: 19,
  contributors: 2,
  top_contributor: 'Ibis',
  most_recent_tick: 12050,
  top_contributions: 9,
};

export const forumThreadFixture = {
  thread: {
    id: 'thread-1',
    title: 'Fuel convoy',
    category: 'logistics',
    author_id: 'player-marlowe',
    author: 'Marlowe',
    author_empire: 'Sol Merchant Combine',
    author_faction_tag: 'SMC',
    created_at: '2026-05-27T09:30:00Z',
    updated_at: '2026-05-27T10:00:00Z',
    content: 'Coordinating fuel convoy departures.',
    upvotes: 4,
    reply_count: 1,
    pinned: false,
    locked: false,
    is_dev_team: false,
  },
  replies: [
    {
      id: 'reply-1',
      thread_id: 'thread-1',
      author_id: 'player-ibis',
      author: 'Ibis',
      author_empire: 'Sol Merchant Combine',
      author_faction_tag: 'SMC',
      created_at: '2026-05-27T10:00:00Z',
      content: 'I can cover the Sol leg.',
      upvotes: 2,
      is_dev_team: false,
    },
  ],
};

export const guideFixture = {
  guide: 'miner',
  content: 'Mine at asteroid belts, then sell ore at a station market.',
  hint: 'Use get_poi before mining.',
};

export const guideListFixture = {
  guides: [
    {
      id: 'miner',
      title: 'Miner',
      description: 'Mining progression from asteroid belts to station markets.',
    },
    {
      id: 'trader',
      title: 'Trader',
      description: 'Buying low, selling high, and watching market routes.',
    },
  ],
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
  fleet_status: { command: 'fleet_status', fixture: fleetFixture },
  get_battle_status: { command: 'get_battle_status', fixture: battleStatusFixture },
  facility_types: { command: 'facility_types', fixture: facilityTypesFixture },
  captains_log_get: { command: 'captains_log_get', fixture: captainLogGetFixture },
  read_note: { command: 'read_note', fixture: readNoteFixture },
  faction_visit_room: { command: 'faction_visit_room', fixture: factionVisitRoomFixture },
  faction_get_invites: { command: 'faction_get_invites', fixture: factionInvitesFixture },
  faction_intel_status: { command: 'faction_intel_status', fixture: factionIntelStatusFixture },
  faction_trade_intel_status: { command: 'faction_trade_intel_status', fixture: factionTradeIntelStatusFixture },
  forum_get_thread: { command: 'forum_get_thread', fixture: forumThreadFixture },
  get_guide: { command: 'get_guide', fixture: guideFixture },
  get_guide_list: { command: 'get_guide', fixture: guideListFixture },
};
