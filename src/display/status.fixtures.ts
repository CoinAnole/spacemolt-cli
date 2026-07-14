import type { HighValueFixtureEntry } from './formatter-fixtures.ts';

export const getLocationFixture = {
  message: 'Location retrieved',
  credits: 12345,
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

export const getStatusFixture = {
  player: {
    username: 'Marlowe',
    empire: 'Terran',
    citizenships: ['solarian', 'nebula'],
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

export const playerProfileFixture = {
  player: {
    username: 'Marlowe',
    credits: 4242,
    empire: 'Terran',
    citizenships: ['solarian', 'nebula'],
    faction_id: 'smc',
    clan_tag: 'SMC',
    home_base: 'earth_station',
    standings: {
      crimson: { baseline: 10, outstanding_bounty: 0, reputation: 94 },
      nebula: { baseline: 20, outstanding_bounty: 0, reputation: 20 },
      pirates: { baseline: 0, outstanding_bounty: 2500, reputation: -30 },
    },
    stats: {
      piloting: { level: 5, xp: 1200 },
      crafting: { level: 2, xp: 175 },
    },
  },
};

/** Public web profile from GET /api/players/{name} (bare JSON, not v2 get_player). */
export const publicPlayerProfileFixture = {
  username: 'Arbiter47',
  empire: 'voidborn',
  empire_name: 'Voidborn Collective',
  primary_color: '#FFFFFF',
  secondary_color: '#000000',
  created_at: '2026-07-11T23:34:42.753280018Z',
  online: true,
  faction: {
    name: 'Interstellar Continental',
    tag: 'NOIR',
    role: 'Officer',
    joined_at: '2026-07-11T23:51:36.899216109Z',
  },
  location: {
    system_id: 'traders_rest',
    system_name: "Trader's Rest",
    docked_station_id: 'traders_rest_resort_station',
    docked_station_name: "Trader's Rest Resort Station",
  },
  stats: {
    credits_earned: 385586,
    ships_destroyed: 0,
    ore_mined: 43638,
    systems_explored: 85,
    jumps_completed: 313,
    time_played: 163080,
  },
  ranks: [],
  ranks_top_n: 30,
  ranks_generated_at: '2026-07-14T19:23:26.2023986Z',
  achievements: {
    earned: 6,
    total: 62,
    points: 65,
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
      // API: 0 = full, 100 = empty (percent depleted); 750/1000 remaining → 25% depleted
      depletion_percent: 25,
      supported_power: 12,
    },
  ],
};

export const nearbyFixture = {
  nearby: [
    {
      username: 'Marlowe',
      faction_tag: 'SMC',
      ship_class: 'prospector',
      docked: false,
      in_combat: false,
    },
    {
      username: 'Ibis',
      faction_tag: 'SMC',
      ship_class: 'hauler',
      docked: true,
      offline: false,
      in_combat: false,
      status_message: 'refitting',
    },
  ],
  count: 2,
  pirates: [{ name: 'Raider', ship_class: 'skiff', status: 'hostile' }],
  pirate_count: 1,
  empire_npcs: [{ name: 'Patrol', ship_class: 'interceptor' }],
  empire_npc_count: 1,
  creatures: [
    {
      creature_id: 'creature_pilot_whale_1',
      species: 'pilot_whale',
      name: 'Pilot-Whale Pod',
      role: 'grazer',
      hull: 80,
      max_hull: 120,
      in_combat: false,
    },
  ],
  creature_count: 1,
  poi_id: 'sol_cloudbank',
};

export const arrivalFixture = {
  details: {
    action: 'travel',
    poi_id: 'sol_earth',
    poi: 'Earth',
    online_players: [{ username: 'Ibis' }],
    online_players_count: 1,
    online_players_truncated: false,
    offline_collapsed: 0,
    message: 'Arrived at Earth.',
  },
  ship: {
    fuel: 80,
    max_fuel: 100,
  },
  location: {
    system_id: 'sol',
    system_name: 'Sol',
    poi_id: 'sol_earth',
    poi_name: 'Earth',
  },
};

export const jumpFixture = {
  details: {
    action: 'jump',
    poi_id: 'procyon_a',
    poi: 'Procyon A',
    online_players: [],
    online_players_count: 0,
    online_players_truncated: false,
    offline_collapsed: 0,
    message: 'Jumped to Procyon.',
    xp_gained: {
      navigation: 3,
      piloting: 6,
    },
  },
  ship: {
    fuel: 72,
    max_fuel: 100,
  },
  location: {
    system_id: 'procyon',
    system_name: 'Procyon',
    poi_id: 'procyon_a',
    poi_name: 'Procyon A',
  },
};

export const scanFixture = {
  success: true,
  target_id: 'player-2',
  username: 'Ibis',
  faction_id: 'smc',
  ship_class: 'hauler',
  hull: 180,
  shield: 75,
  cloaked: false,
  revealed_info: ['Cargo: 20/200', 'Weapons: 1'],
};

export const completedMissionDetailFixture = {
  template_id: 'mission-ore-run',
  title: 'Ore Run',
  type: 'hauling',
  difficulty: 2,
  description: 'Deliver iron ore to Earth Station.',
  giver: { name: 'Vale', title: 'Dockmaster' },
  completion_time: '2026-05-29T18:00:00Z',
  repeatable: true,
  objectives: [
    {
      type: 'deliver_item',
      description: 'Deliver Iron Ore',
      item_id: 'ore_iron',
      quantity: 500,
    },
  ],
  rewards: {
    credits: 7500,
    items: { ore_iron: 25 },
    reputation: 3,
    pirate_rep: 1,
    skill_xp: { piloting: 25 },
  },
  dialog: { complete: 'Good work keeping the refineries supplied.' },
  chain_next: 'mission-refinery-check',
};

export const skillsFixture = {
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

export const getMapFixture = {
  systems: [
    {
      system_id: 'sol',
      name: 'Sol',
    },
    {
      system_id: 'alpha_centauri',
      name: 'Alpha Centauri',
    },
  ],
  total_count: 2,
};

export const getSystemAgentsFixture = {
  system_id: 'sol',
  count: 2,
  offline_collapsed: 4,
  agents: [
    {
      username: 'Marlowe',
      player_id: 'player-1',
      ship_class: 'prospector',
      ship_name: 'Surveyor',
      faction_tag: 'SMC',
      status_message: 'surveying routes',
      offline: false,
      in_combat: false,
    },
    {
      username: 'Ibis',
      player_id: 'player-2',
      ship_class: 'hauler',
      ship_name: 'Long Haul',
      faction_tag: 'SMC',
      status_message: 'hauling ore',
      offline: true,
      in_combat: true,
    },
  ],
};

export const getCommandsFixture = {
  actions: [
    {
      tool: 'spacemolt',
      action: 'get_status',
      endpoint: '/api/v2/spacemolt/get_status',
      description: 'Inspect player, ship, and location.',
    },
    {
      tool: 'spacemolt',
      action: 'travel',
      endpoint: '/api/v2/spacemolt/travel',
      description: 'Move to a POI.',
    },
  ],
};

export const statusFixtureCases = {
  arrival: { command: 'travel', fixture: arrivalFixture },
  nearby: { command: 'get_nearby', fixture: nearbyFixture },
  poi_info: { command: 'get_poi', fixture: poiInfoFixture },
  system_info: { command: 'get_system', fixture: systemInfoFixture },
};

export const statusHighValueFixtures: Record<string, HighValueFixtureEntry> = {
  get_status: { command: 'get_status', fixture: getStatusFixture },
  get_player: { command: 'get_player', fixture: playerProfileFixture },
  player_profile: { command: 'player_profile', fixture: publicPlayerProfileFixture },
  get_location: { command: 'get_location', fixture: getLocationFixture },
  get_system: { command: 'get_system', fixture: systemInfoFixture },
  get_poi: { command: 'get_poi', fixture: poiInfoFixture },
  get_nearby: { command: 'get_nearby', fixture: nearbyFixture },
  get_skills: { command: 'get_skills', fixture: skillsFixture },
  get_map: { command: 'get_map', fixture: getMapFixture },
  get_system_agents: { command: 'get_system_agents', fixture: getSystemAgentsFixture },
  get_commands: { command: 'get_commands', fixture: getCommandsFixture },
  scan: { command: 'scan', fixture: scanFixture, schemaTarget: 'details' },
  view_completed_mission: { command: 'view_completed_mission', fixture: completedMissionDetailFixture },
  travel: { command: 'travel', fixture: arrivalFixture },
  jump: { command: 'jump', fixture: jumpFixture },
  register: { command: 'register', fixture: { password: 's3cret', player_id: 'player-1' } },
};
