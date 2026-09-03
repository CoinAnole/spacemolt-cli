import type { HighValueFixtureEntry } from './formatter-fixtures.ts';

const intactPrizeInfo = {
  prize_id: 'prize-dust-1',
  actor_id: 'actor-prize-1',
  ship_id: 'ship-prize-1',
  ship_class: 'frigate',
  ship_name: 'Dust Devil',
  status: 'available',
  hull: 40,
  max_hull: 80,
  shield: 10,
  max_shield: 20,
  in_combat: false,
};

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
    nearby_prizes: [intactPrizeInfo],
    nearby_prize_count: 1,
    nearby_pirate_count: 2,
    nearby_pirates: [{ name: 'Raider', faction: 'pirate_kael', faction_name: 'Admiral Kael' }],
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
    trading_restricted_until: '2026-07-18T12:34:56Z',
    // Empires + pirate strongholds (0.548+; no legacy `pirates` key)
    standings: {
      solarian: { baseline: 0, outstanding_bounty: 0, reputation: 12 },
      crimson: { baseline: 10, outstanding_bounty: 0, reputation: 94 },
      pirate_voss: { baseline: 0, outstanding_bounty: 500, reputation: -10 },
      pirate_kael: { baseline: 0, outstanding_bounty: 0, reputation: 5 },
    },
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
    personnel: {
      fit_crew: 4,
      injured_crew: 0,
      fit_marines: 2,
      injured_marines: 0,
    },
    effective_crew_capacity: 6,
    effective_marine_capacity: 4,
    minimum_crew: 3,
    crew_efficiency: 0.67,
    operational_speed: 8,
    incapacitated: false,
  },
  prize_recoveries: [
    {
      prize_id: 'prize-recover-1',
      actor_id: 'actor-recover-1',
      ship_id: 'ship-recover-1',
      ship_class: 'frigate',
      ship_name: 'Captured Lark',
      status: 'in_transit',
      destination_base_id: 'earth_station',
      prize_crew_fit: 3,
      crew_disposition: 'aboard',
      hull: 40,
      max_hull: 80,
      fuel: 20,
      max_fuel: 50,
      transit_kind: 'jump',
      transit_from_system_id: 'sol',
      transit_to_system_id: 'alpha_centauri',
      transit_arrival_tick: 12500,
      wait_reason: 'no_fuel',
      return_crew_faction_id: 'other_faction',
    },
  ],
  location: {
    system_id: 'sol',
    system_name: 'Sol',
    poi_id: 'sol_earth',
    poi_name: 'Earth',
    docked_at: 'earth_station',
    nearby_players: [{ username: 'Ibis', ship_class: 'hauler' }],
    nearby_prizes: [intactPrizeInfo],
    nearby_prize_count: 1,
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
    trading_restricted_until: '2026-07-18T12:34:56Z',
    standings: {
      crimson: { baseline: 10, outstanding_bounty: 0, reputation: 94 },
      nebula: { baseline: 20, outstanding_bounty: 0, reputation: 20 },
      pirate_voss: { baseline: 0, outstanding_bounty: 2500, reputation: -30 },
      pirate_kael: { baseline: 0, outstanding_bounty: 0, reputation: 5 },
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
  action: 'get_system',
  kind: 'normal',
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
        class: 'garden',
        has_base: true,
        online: 2,
      },
    ],
    connections: [{ system_id: 'alpha_centauri', name: 'Alpha Centauri', distance: 4.3 }],
  },
  security_status: 'high security',
  poi: { id: 'sol_earth', name: 'Earth', type: 'planet', class: 'garden' },
};

export const poiInfoFixture = {
  kind: 'normal',
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

/** Station POI with nested TrimmedBase (canonical Base ID + station POI ID, 0.562+ combat stats). */
export const stationPoiInfoFixture = {
  kind: 'normal',
  poi: {
    id: 'sol_earth',
    name: 'Earth',
    type: 'station',
    system_id: 'sol',
    description: 'Orbital station above Earth',
    class: 'major',
    base_id: 'earth_station',
  },
  base: {
    id: 'earth_station',
    poi_id: 'sol_earth',
    name: 'Earth Station',
    type: 'station',
    description: 'A busy trade hub.',
    empire: 'Terran',
    fuel: 500,
    max_fuel: 1000,
    hull: 900,
    max_hull: 1000,
    shield: 200,
    max_shield: 300,
    armor: 50,
    weapon_dps: 40,
    weapon_reach: 2,
    public_access: true,
  },
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
  pirates: [
    {
      pirate_id: 'pirate-raider-1',
      name: 'Raider',
      tier: 'skiff',
      is_boss: false,
      status: 'hostile',
      hull: 40,
      max_hull: 50,
      shield: 10,
      max_shield: 20,
      faction: 'pirate_kael',
      faction_name: 'Admiral Kael',
    },
  ],
  pirate_count: 1,
  empire_npcs: [
    {
      npc_id: 'npc-patrol-1',
      name: 'Patrol',
      role: 'patrol',
      empire: 'solarian',
      in_combat: false,
      ship_class: 'interceptor',
    },
  ],
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
  prizes: [intactPrizeInfo],
  prize_count: 1,
  poi_id: 'sol_cloudbank',
};

export const nearbyBossFixture = {
  ...nearbyFixture,
  pirate_count: 2,
  pirates: [
    ...nearbyFixture.pirates,
    {
      pirate_id: 'pirate-dread-1',
      name: 'Dreadnought',
      tier: 'battleship',
      is_boss: true,
      status: 'hostile',
      hull: 200,
      max_hull: 200,
      shield: 80,
      max_shield: 80,
      faction: 'pirate_kael',
      faction_name: 'Admiral Kael',
    },
  ],
};

/** Full observation baseline; pirate_count is intentionally absent in the v0.554 response schema. */
export const subscribeObservationFixture = {
  action: 'subscribe_observation',
  active_scan: true,
  cloaked_contacts: [
    {
      target_id: 'player-cloaked-1',
      revealed_info: ['username', 'ship_class', 'hull', 'shield', 'cloaked'],
      cloaked: true,
      faction_id: 'smc',
      hull: 72,
      shield: 18,
      ship_class: 'scout',
      ship_name: 'Quiet Current',
      username: 'Wisp',
    },
  ],
  creatures: [
    {
      creature_id: 'creature-pilot-whale-7',
      species: 'pilot_whale',
      name: 'Pilot-Whale Pod',
      role: 'grazer',
      hull: 80,
      max_hull: 120,
      in_combat: false,
      brand_faction: 'smc',
      brand_ranch: 'cloudbank-ranch',
      branded: true,
    },
  ],
  prizes: [intactPrizeInfo],
  empire_npcs: [
    {
      npc_id: 'npc-patrol-7',
      name: 'Solarian Patrol',
      role: 'patrol',
      empire: 'solarian',
      in_combat: false,
      fleet_name: 'Seventh Watch',
      ship_class: 'interceptor',
      ship_name: 'Vigilant',
    },
  ],
  message: 'Observation watch established.',
  nearby: [
    {
      clan_tag: 'SMC',
      docked: false,
      faction_id: 'smc',
      faction_tag: 'SMC',
      in_combat: false,
      offline: false,
      player_id: 'player-marlowe',
      primary_color: '#335577',
      secondary_color: '#88aacc',
      ship_class: 'prospector',
      ship_name: 'Long Survey',
      status_message: 'mapping Cloudbank',
      username: 'Marlowe',
    },
  ],
  pirates: [
    {
      pirate_id: 'pirate-corsair-7',
      name: 'Corsair',
      tier: 'skiff',
      is_boss: false,
      status: 'hostile',
      faction: 'pirate_kael',
      faction_name: 'Admiral Kael',
      hull: 40,
      max_hull: 50,
      shield: 10,
      max_shield: 20,
    },
  ],
  poi_id: 'sol_cloudbank',
  system_agents: [
    {
      clan_tag: 'FREE',
      docked: true,
      faction_id: 'free-captains',
      faction_tag: 'FREE',
      in_combat: false,
      offline: false,
      player_id: 'player-ibis',
      primary_color: '#553355',
      secondary_color: '#aa88aa',
      ship_class: 'hauler',
      ship_name: 'Wide Arc',
      status_message: 'loading freight',
      username: 'Ibis',
    },
  ],
  system_id: 'sol',
  unknown_signature: true,
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

export const scanCreatureFixture = {
  success: true,
  target_id: 'creature-ember-grazer-1',
  hull: 80,
  description: 'Heat-tolerant grazers that drift between vent plumes, skittish unless the herd is boxed in.',
  revealed_info: ['Species: Ember Grazer', 'Role: grazer', 'Danger: low', 'Ranchable: yes'],
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
    pirate_faction: 'pirate_kael',
    skill_xp: { piloting: 25 },
  },
  dialog: { complete: 'Good work keeping the refineries supplied.' },
  chain_next: 'mission-refinery-check',
};

/** Live-shaped nested SC for complete_mission (P1 envelope: details only, no schemaTarget). */
export const completeMissionFixture = {
  details: {
    mission_id: 'mission-delivery-1',
    title: 'Food Delivery',
    credits_earned: 2500,
    message: 'Mission complete. Rewards claimed.',
    items_received: { food_rations: 5, repair_patch: 1 },
    reputation_changes: { solarian: 3, pirate_voss: -1 },
    skill_xp_gained: { piloting: 25, hauling: 10 },
    chain_next: 'mission-refinery-check',
  },
};

/** Treasury underpay: credits_promised / credits_shortfall are omitted on a full payout. */
export const completeMissionShortfallFixture = {
  details: {
    mission_id: 'mission-empire-1',
    title: 'Empire Escort',
    credits_earned: 1000,
    credits_promised: 2500,
    credits_shortfall: 1500,
    message: 'Mission complete. Empire treasury could not cover the full reward; you were paid 1000 of 2500 credits.',
    items_received: { repair_patch: 1 },
  },
};

/** Flat CompletedMissionsResponse (P3). Sample IDs pair with view_completed_mission. */
export const completedMissionsFixture = {
  total_count: 2,
  missions: [
    {
      template_id: 'mission-ore-run',
      title: 'Ore Run',
      type: 'hauling',
      difficulty: 2,
      completion_time: '2026-05-29T18:00:00Z',
      giver: { name: 'Vale', title: 'Dockmaster' },
    },
    {
      template_id: 'mission-pirate-sweep',
      title: 'Pirate Sweep',
      type: 'combat',
      difficulty: 3,
      completion_time: '2026-05-28T12:00:00Z',
    },
  ],
};

/** Flat DeclineMissionResponse (P3). No outer details / no schemaTarget. */
export const declineMissionFixture = {
  template_id: 'pirate_sweep',
  title: 'Pirate Sweep',
  message: 'Perhaps another time, captain.',
  giver: { name: 'Vale', title: 'Dockmaster' },
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

export const getMapStarlessFixture = {
  systems: [
    { system_id: 'sol', name: 'Sol' },
    {
      system_id: 'veiled_reach',
      name: 'Veiled Reach',
      description:
        'No star lights this waypoint, but the dust lane still feeds three jump beacons, so navigators keep it on the chart.',
    },
  ],
  total_count: 2,
};

export const getMapSystemFixture = {
  system_id: 'veiled_reach',
  name: 'Veiled Reach',
  empire: '',
  is_stronghold: false,
  online: 0,
  poi_count: 1,
  position: { x: 120.5, y: -44 },
  visited: false,
  visited_at: '2026-01-01T00:00:00Z',
  connections: ['sol', 'barnards_star'],
  description:
    'No star lights this waypoint, but the dust lane still feeds three jump beacons, so navigators keep it on the chart.',
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

/** Pending action queue status (V2GameState.queue subset for get_queue). */
export const getQueueFixture = {
  queue: { has_pending: true },
};

export const getQueueEmptyFixture = {
  queue: { has_pending: false },
};

export const payBountyFixture = {
  action: 'pay_bounty',
  empire: 'solarian',
  amount_paid: 2500,
  paid_from: 'self',
  credits: 1742,
  reputation_after: 12,
  released_from_detention: true,
  outstanding_bounties: [{ empire: 'crimson', bounty: 400 }],
  message: 'Bounty settled with Solarian.',
};

export const getStatusDetainedFixture = {
  ...getStatusFixture,
  player: {
    ...getStatusFixture.player,
    standings: {
      ...getStatusFixture.player.standings,
      solarian: {
        baseline: 0,
        outstanding_bounty: 2500,
        reputation: 12,
        jailed_until: '2026-07-18T12:34:56Z',
      },
    },
  },
};

export const statusHighValueFixtures: Record<string, HighValueFixtureEntry> = {
  get_status: { command: 'get_status', fixture: getStatusFixture },
  // Covers get_state on the shared status formatter
  // (OpenAPI: get_status is an alias of get_state; both → V2GameState).
  get_state: {
    command: 'get_state',
    fixture: getStatusFixture,
  },
  get_status_detained: { command: 'get_status', fixture: getStatusDetainedFixture },
  get_player: { command: 'get_player', fixture: playerProfileFixture },
  pay_bounty: {
    command: 'pay_bounty',
    fixture: payBountyFixture,
    schemaTarget: 'details',
  },
  player_profile: { command: 'player_profile', fixture: publicPlayerProfileFixture },
  get_location: { command: 'get_location', fixture: getLocationFixture },
  get_system: { command: 'get_system', fixture: systemInfoFixture },
  get_poi: { command: 'get_poi', fixture: poiInfoFixture },
  get_poi_station: { command: 'get_poi', fixture: stationPoiInfoFixture },
  get_nearby: { command: 'get_nearby', fixture: nearbyFixture },
  get_nearby_boss: { command: 'get_nearby', fixture: nearbyBossFixture },
  subscribe_observation: { command: 'subscribe_observation', fixture: subscribeObservationFixture },
  get_skills: { command: 'get_skills', fixture: skillsFixture },
  get_map: { command: 'get_map', fixture: getMapFixture },
  get_map_starless: { command: 'get_map', fixture: getMapStarlessFixture },
  get_map_system: { command: 'get_map', fixture: getMapSystemFixture },
  get_system_agents: { command: 'get_system_agents', fixture: getSystemAgentsFixture },
  get_commands: { command: 'get_commands', fixture: getCommandsFixture },
  get_queue: { command: 'get_queue', fixture: getQueueFixture },
  get_queue_empty: { command: 'get_queue', fixture: getQueueEmptyFixture },
  scan: { command: 'scan', fixture: scanFixture, schemaTarget: 'details' },
  scan_creature: { command: 'scan', fixture: scanCreatureFixture, schemaTarget: 'details' },
  view_completed_mission: { command: 'view_completed_mission', fixture: completedMissionDetailFixture },
  complete_mission: { command: 'complete_mission', fixture: completeMissionFixture },
  complete_mission_shortfall: { command: 'complete_mission', fixture: completeMissionShortfallFixture },
  completed_missions: { command: 'completed_missions', fixture: completedMissionsFixture },
  decline_mission: { command: 'decline_mission', fixture: declineMissionFixture },
  travel: { command: 'travel', fixture: arrivalFixture },
  jump: { command: 'jump', fixture: jumpFixture },
  register: { command: 'register', fixture: { password: 's3cret', player_id: 'player-1' } },
};
