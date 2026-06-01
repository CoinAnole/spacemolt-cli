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

export const getStatusFixture = {
  player: {
    username: 'Marlowe',
    empire: 'Terran',
    citizenships: {
      solarian: { empire_id: 'solarian', granted_by: 'origin', granted_at: '2026-05-13T00:00:00.000Z' },
      nebula: { empire_id: 'nebula', granted_by: 'petition:cit-1', granted_at: '2026-05-14T00:00:00.000Z' },
    },
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

export const scanFixture = {
  success: true,
  target_id: 'player-2',
  username: 'Ibis',
  faction_id: 'smc',
  ship_class: 'hauler',
  hull: 180,
  shield: 75,
  cloaked: false,
  revealed_info: {
    cargo_used: 20,
    cargo_capacity: 200,
    weapons: 1,
  },
};

export const completedMissionDetailFixture = {
  template_id: 'mission-ore-run',
  title: 'Ore Run',
  type: 'hauling',
  difficulty: 2,
  description: 'Deliver iron ore to Earth Station.',
  giver: 'Dockmaster Vale',
  completion_time: '2026-05-29T18:00:00Z',
  repeatable: true,
  objectives: [
    {
      description: 'Deliver Iron Ore',
      progress: { current: 500, required: 500 },
    },
  ],
  rewards: {
    credits: 7500,
    skill_xp: { piloting: 25 },
  },
  dialog: 'Good work keeping the refineries supplied.',
  chain_next: 'mission-refinery-check',
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

export const getMapFixture = {
  systems: [
    {
      system_id: 'sol',
      name: 'Sol',
      x: 0,
      y: 0,
      empire: 'solarian',
      security_status: 'high security',
      connections: ['alpha_centauri'],
    },
    {
      system_id: 'alpha_centauri',
      name: 'Alpha Centauri',
      x: 4,
      y: 1,
      empire: 'solarian',
      security_status: 'medium security',
      connections: ['sol'],
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
      poi_name: 'Earth Station',
      offline: false,
    },
    {
      username: 'Ibis',
      player_id: 'player-2',
      ship_class: 'hauler',
      poi_name: 'Mars Depot',
      offline: true,
    },
  ],
};

export const getCommandsFixture = {
  commands: [
    {
      command: 'get_status',
      category: 'Query commands',
      description: 'Inspect player, ship, and location.',
      usage: '',
    },
    {
      command: 'travel',
      category: 'Navigation',
      description: 'Move to a POI.',
      usage: '<poi_id>',
    },
  ],
};

export const statusFixtureCases = {
  arrival: { command: 'travel', fixture: arrivalFixture },
  nearby: { command: 'get_nearby', fixture: nearbyFixture },
  poi_info: { command: 'get_poi', fixture: poiInfoFixture },
  system_info: { command: 'get_system', fixture: systemInfoFixture },
};

export const statusHighValueFixtures = {
  get_status: { command: 'get_status', fixture: getStatusFixture },
  get_location: { command: 'get_location', fixture: getLocationFixture },
  get_system: { command: 'get_system', fixture: systemInfoFixture },
  get_poi: { command: 'get_poi', fixture: poiInfoFixture },
  get_nearby: { command: 'get_nearby', fixture: nearbyFixture },
  get_skills: { command: 'get_skills', fixture: skillsV2Fixture },
  get_map: { command: 'get_map', fixture: getMapFixture },
  get_system_agents: { command: 'get_system_agents', fixture: getSystemAgentsFixture },
  get_commands: { command: 'get_commands', fixture: getCommandsFixture },
  scan: { command: 'scan', fixture: scanFixture },
  view_completed_mission: { command: 'view_completed_mission', fixture: completedMissionDetailFixture },
  travel: { command: 'travel', fixture: arrivalFixture },
  register: { command: 'register', fixture: { password: 's3cret', player_id: 'player-1' } },
  skills_v1: { command: 'get_skills', fixture: skillsV1Fixture },
};
