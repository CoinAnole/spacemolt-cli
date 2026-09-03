import type { HighValueFixtureEntry } from './formatter-fixtures.ts';

export const chatSentFixture = {
  // Client-oriented aliases accepted by the chat_sent formatter (allowed extras vs ChatResponse).
  action: 'chat',
  target: 'local',
  content: 'Clear skies.',
  // Schema-required ChatResponse fields.
  channel: 'local',
  message: 'Clear skies.',
  // Unix seconds (ChatResponse.sent_at is integer).
  sent_at: 1748012645,
};

/** Flat facilities array for the `facilities` named formatter (not the /list response shape). */
export const facilitiesFixture = {
  facilities: [
    {
      facility_id: 'facility-1',
      name: 'Fuel Bunker',
      level: 2,
      status: 'online',
      owner_name: 'Marlowe',
      is_recycler: false,
      idle_reason: 'fuel_tank_full',
    },
  ],
};

export const facilityOwnedFixture = {
  action: 'owned',
  facilities: [
    {
      facility_id: 'player-refinery',
      type: 'ore_refinery',
      name: 'Ore Refinery',
      custom_name: 'Frontier Smelter',
      base_id: 'earth_station',
      base_name: 'Earth Station',
      rent_per_cycle: 120,
    },
  ],
  rent: { facilities: 1, total_rent_per_cycle: 120, est_rent_per_day: 720 },
};

/**
 * Minimal FacilityResponse list branch (action=list) for high-value facility_list.
 * Required top-level: action, base_id, station_facilities, player_facilities, faction_facilities.
 */
export const facilityListSimpleFixture = {
  action: 'list',
  base_id: 'earth_station',
  station_facilities: [
    {
      facility_id: 'facility-1',
      type: 'fuel_bunker',
      name: 'Fuel Bunker',
      description: 'Bulk refined-fuel storage for dockside resupply.',
      category: 'service',
      level: 2,
      maintenance_level: 1,
      maintenance_satisfied: true,
      is_recycler: false,
      owner_id: 'player-marlowe',
    },
  ],
  player_facilities: [] as Array<Record<string, unknown>>,
  faction_facilities: [] as Array<Record<string, unknown>>,
};

/**
 * Detailed FacilityResponse list branch (action=list) with station systems, groups, and rent.
 * Matches OpenAPI FacilityResponse oneOf branch 0 / list path example structure.
 */
export const facilityListFixture = {
  action: 'list',
  base_id: 'earth_station',
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
      description: 'Station fuel storage and bunkering service.',
      category: 'service',
      level: 3,
      maintenance_level: 1,
      maintenance_satisfied: true,
      is_recycler: false,
    },
    {
      facility_id: 'station-depot',
      type: 'confederacy_fleet_depot',
      name: 'Confederacy Fleet Depot',
      description: 'Empire logistics depot for fleet resupply.',
      category: 'infrastructure',
      level: 3,
      maintenance_level: 0.6,
      maintenance_satisfied: false,
      maintenance_per_cycle: [
        { item_id: 'fuel_cell', name: 'Fuel Cell', quantity: 12 },
        { item_id: 'plasma_cell_pack', name: 'Plasma Cell Pack', quantity: 4 },
      ],
      labor_per_cycle: 320,
    },
    {
      facility_id: 'station-diner',
      type: 'dockside_diner',
      name: 'Dockside Diner',
      description: 'Cheap meals and shore leave for dock workers.',
      category: 'infrastructure',
      level: 1,
      maintenance_satisfied: true,
      dining_points: 2,
      tourism_upkeep: true,
      labor_per_cycle: 80,
    },
  ],
  service_pools: {
    personnel: {
      remaining: 12,
      capacity: 20,
      refill_per_cycle: 4,
      supply_item: 'crew_rations',
    },
    medical: {
      remaining: 3,
      capacity: 10,
      refill_per_cycle: 1,
    },
    marine_training: {
      remaining: 8,
      capacity: 8,
      refill_per_cycle: 2,
      supply_item: 'marine_rations',
    },
  },
  player_facilities: [
    {
      facility_id: 'player-refinery',
      type: 'ore_refinery',
      name: 'Ore Refinery',
      description: 'Player-owned ore refining plant.',
      category: 'production',
      level: 2,
      maintenance_satisfied: true,
      is_recycler: true,
      recipe_id: 'iron_ore_reverse',
      damaged: true,
      production: {
        queued_runs: 0,
        queued_items: 0,
        backlog_ticks: 0,
        output_price_per_unit: 0.25,
      },
    },
  ],
  faction_facilities: [
    {
      facility_id: 'faction-smelter',
      type: 'alloy_smelter',
      name: 'Alloy Smelter',
      description: 'Faction alloy production line.',
      category: 'production',
      level: 1,
      maintenance_satisfied: true,
      production: {
        queued_runs: 0,
        queued_items: 0,
        backlog_ticks: 0,
        output_price_per_unit: 0,
      },
      rent_per_cycle: 1200,
    },
  ],
  faction_rent: {
    facilities: 1,
    total_rent_per_cycle: 1200,
    arrears_owed: 2400,
    grace_cycles: 1,
    est_rent_per_day: 7200,
    note: 'Faction facilities pay rent from the treasury each cycle.',
  },
};

export const facilityUpgradesFixture = {
  upgrades: [
    {
      current_level: 1,
      requires: 'Engineering 10',
      upgrade_to: {
        build_cost: 48_000,
        build_time: 96,
        labor_cost: 180,
        level: 2,
        name: 'Ore Refinery II',
        type_id: 'ore_refinery_ii',
      },
    },
  ],
  hint: 'Dock at the facility to start an upgrade.',
};

export const facilityTypesFixture = {
  action: 'types',
  kind: 'discovery',
  filters: { category: '', name: '', level: '' },
  pagination: { page: '1', per_page: '20' },
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

export const facilityTypesDetailFixture = {
  action: 'types',
  kind: 'detail',
  type_id: 'crew_office',
  name: 'Crew Office',
  description: 'Recruits fit crew from the station pool.',
  category: 'service',
  level: 1,
  build_cost: 12000,
  build_time: 40,
  labor_cost: 80,
  rent_per_cycle: 200,
  buildable: true,
  service_pool_capacity: 20,
  service_pool_refill_per_cycle: 4,
  service_pool_supply_item: 'crew_rations',
  service_pool_units_per_item: 1,
};

export const factionFacilityOwnedFixture = {
  action: 'faction_owned',
  faction_id: 'faction-1',
  facilities: [
    {
      facility_id: 'faction-yard-1',
      type: 'faction_shipyard_berth',
      name: 'Faction Shipyard Berth',
      base_id: 'earth_station',
      base_name: 'Earth Station',
      system_id: 'sol',
      rent_per_cycle: 1200,
      missed_rent_cycles: 2,
      arrears_owed: 2400,
      labor_per_run: 60,
    },
  ],
  total_rent_per_cycle: 1200,
  arrears_owed: 2400,
  grace_cycles: 1,
  note: 'Faction facilities pay rent from the treasury each cycle.',
  hint: "Use action 'faction_list' while docked for full per-facility detail at that station.",
};

/** FacilityFactionListResponse — covers active, damaged, under_construction, and dismantling statuses. */
export const factionFacilityListFixture = {
  action: 'faction_list',
  base_id: 'earth_station',
  faction_id: 'faction-1',
  faction_facilities: [
    {
      facility_id: 'faction-smelter',
      type: 'alloy_smelter',
      name: 'Alloy Smelter',
      custom_name: 'Alloy One',
      level: 1,
      faction_service: 'production',
      rent_per_cycle: 1200,
      status: 'active',
      damaged: false,
    },
    {
      facility_id: 'faction-bunker',
      type: 'fuel_bunker',
      name: 'Faction Fuel Bunker',
      level: 2,
      faction_service: 'fuel',
      rent_per_cycle: 800,
      status: 'damaged',
      damaged: true,
      repair_complete_tick: 901412,
    },
    {
      facility_id: 'faction-yard',
      type: 'faction_shipyard_berth',
      name: 'Shipyard Berth',
      level: 1,
      faction_service: 'shipyard',
      rent_per_cycle: 1200,
      status: 'under_construction',
      ticks_until_complete: 12,
    },
    {
      facility_id: 'faction-hangar',
      type: 'faction_hangar',
      name: 'Faction Hangar',
      level: 1,
      faction_service: 'hangar',
      rent_per_cycle: 600,
      status: 'dismantling',
    },
  ],
  faction_storage: {
    credits: 50_000,
    item_types: 14,
    rooms: 3,
  },
  hint: "Damaged facilities produce nothing. A station rebuilds its own faction's facilities automatically from that faction's storage at the station; use facility repair for a facility it will not rebuild, or to jump the queue.",
};

export const fleetFixture = {
  action: 'status',
  in_fleet: true,
  fleet_id: 'fleet-1',
  leader: 'Marlowe',
  is_leader: true,
  max_size: 5,
  system_id: 'sol',
  poi_id: 'earth_station',
  invites: [{ player_id: 'player-3', username: 'Ibis' }],
  members: [
    {
      player_id: 'player-1',
      username: 'Marlowe',
      is_leader: true,
      ship: 'Prospector',
      fuel_per_jump: 12,
    },
    {
      player_id: 'player-2',
      username: 'Rook',
      is_leader: false,
      passenger: true,
      riding_ship_id: 'ship-marlowe-1',
      // ship intentionally omitted: deadhead passenger — Ship column blank in table
    },
  ],
};

export const battleStatusFixture = {
  battle_id: 'battle-1',
  system_id: 'sol',
  is_participant: true,
  tick_duration: 30,
  sides: [
    {
      side_id: 1,
      faction_id: 'faction-smc',
      faction_name: 'SpaceMolt Co',
      faction_tag: 'SMC',
      player_count: 1, // human players only (Marlowe); station does not increment
    },
    { side_id: 2, player_count: 0 }, // pirate + creature are NPCs
  ],
  participants: [
    {
      player_id: 'player-1',
      username: 'Marlowe',
      side_id: 1,
      kind: 'player',
      is_npc: false,
      auto_pilot: false,
      stance: 'fire',
      target_id: 'pirate-1',
      ship_name: 'Prospector',
      ship_class: 'prospector',
      zone: 'outer',
      zone_distance: 0,
      hull_pct: 82,
      shield_pct: 40,
    },
    {
      player_id: 'pirate-1',
      username: 'Pirate Skiff',
      side_id: 2,
      kind: 'pirate',
      is_npc: true,
      auto_pilot: true,
      ship_class: 'skiff',
      zone: 'inner',
      zone_distance: 3,
      // no hull/shield/stance/target — lean matrix
    },
    {
      player_id: 'creature-1',
      username: 'Pilot Whale',
      side_id: 2,
      kind: 'creature',
      is_npc: true,
      auto_pilot: true,
      // kind/is_npc only (+ required fields) — keeps row short
    },
    {
      player_id: 'station-earth',
      username: 'Earth Station',
      side_id: 1,
      kind: 'station',
      is_npc: true,
      auto_pilot: true,
      zone: 'engaged',
      hull_pct: 97,
      shield_pct: 80,
    },
  ],
};

export const battleSummaryFixture = {
  battle_id: 'battle-42',
  system_id: 'sol',
  system_name: 'Sol',
  status: 'completed',
  category: 'pvp',
  has_station: true,
  start_tick: 900100,
  duration_ticks: 14,
  participant_count: 3,
  total_damage: 8420,
  ships_destroyed: 1,
  outcome: 'side_1_victory',
  winning_side: 1,
  player_names: ['Marlowe', 'Ibis'],
  destroyed_names: ['Rust Bucket'],
  top_damage: { username: 'Marlowe', damage: 5100 },
  sides: [
    {
      side_id: 1,
      faction_id: 'faction-smc',
      faction_tag: 'SMC',
      participants: ['Marlowe', 'Ibis'],
    },
    {
      side_id: 2,
      participants: ['Corsair-7'],
    },
  ],
  ships_captured: 0,
};

export const battleStatusBoardingFixture = {
  ...battleStatusFixture,
  boarding: [
    {
      operation_id: 'board-1',
      phase: 'breach',
      progress: '40%',
      attacker_id: 'player-1',
      target_id: 'pirate-1',
      self_destruct_countdown: 3,
    },
  ],
};

export const battleSummaryCapturesFixture = {
  ...battleSummaryFixture,
  ships_captured: 1,
  captures: [
    {
      ship_id: 'ship-skiff-1',
      ship_class: 'skiff',
      captor_username: 'Marlowe',
      captor_id: 'player-1',
      former_owner_username: 'Corsair-7',
      former_owner_id: 'pirate-1',
      boarding_operation_id: 'board-1',
    },
  ],
};

export const battleSummaryCapturesKindFixture = {
  ...battleSummaryCapturesFixture,
  ships_captured: 4,
  captures: [
    {
      ship_id: 'ship-skiff-1',
      ship_class: 'skiff',
      captor_username: 'Marlowe',
      captor_id: 'player-1',
      former_owner_username: 'Corsair-7',
      former_owner_id: 'pirate-1',
      boarding_operation_id: 'board-1',
      captor_kind: 'player',
    },
    {
      ship_id: 'ship-skiff-2',
      ship_class: 'skiff',
      captor_username: 'Corsair',
      captor_id: 'pirate-1',
      former_owner_username: 'Marlowe',
      former_owner_id: 'player-1',
      boarding_operation_id: 'board-2',
      captor_kind: 'pirate',
    },
    {
      ship_id: 'ship-skiff-3',
      ship_class: 'skiff',
      captor_username: 'Sentinel',
      captor_id: 'npc-1',
      former_owner_username: 'Marlowe',
      former_owner_id: 'player-1',
      boarding_operation_id: 'board-3',
      captor_kind: 'npc',
    },
    {
      ship_id: 'ship-skiff-4',
      ship_class: 'skiff',
      captor_username: 'Marlowe',
      captor_id: 'player-1',
      former_owner_username: 'Corsair-7',
      former_owner_id: 'pirate-1',
      boarding_operation_id: 'board-4',
    },
  ],
};

export const battleLogPlunderedFixture = {
  battle_id: 'battle-42',
  status: 'completed',
  total_ticks: 1,
  has_more: false,
  entries: [
    {
      tick: 3,
      boarding: [
        {
          operation_id: 'board-1',
          event: 'plundered',
          phase: 'hold',
        },
      ],
    },
  ],
};

export const battleLogBoardingFixture = {
  battle_id: 'battle-42',
  status: 'completed',
  total_ticks: 1,
  has_more: false,
  entries: [
    {
      tick: 3,
      boarding: [
        {
          operation_id: 'board-1',
          event: 'progress',
          phase: 'breach',
          actor_id: 'player-1',
          target_id: 'pirate-1',
          reason: 'marines_committed',
          destroyed: true,
          casualties_occurred: true,
          attacker_casualties: true,
          defender_casualties: true,
          self_destruct_countdown: 2,
          hull_damage: 12,
        },
      ],
      captures: [
        {
          ship_id: 'ship-skiff-1',
          ship_class: 'skiff',
          captor_username: 'Marlowe',
          captor_id: 'player-1',
          former_owner_username: 'Corsair-7',
          former_owner_id: 'pirate-1',
          boarding_operation_id: 'board-1',
        },
      ],
      personnel_casualties: [
        {
          target_id: 'pirate-1',
          casualties_occurred: true,
          incapacitated: true,
          triage_applied: true,
          triage_converted: false,
          triage_provider_id: 'player-1',
          triage_provider_ship_id: 'ship-marlowe-1',
        },
      ],
    },
  ],
};

export const battleLogFixture = {
  battle_id: 'battle-42',
  status: 'completed',
  total_ticks: 14,
  has_more: false,
  entries: [
    {
      tick: 0,
      attacks: [
        {
          attacker_id: 'player-1',
          target_id: 'pirate-1',
          hit_success: true,
          final_damage: 420,
          hull_damage: 120,
          shield_damage: 300,
          damage_type: 'kinetic',
          defense_components: [
            {
              weapon_instance_id: 'w-pulse',
              weapon_name: 'Pulse Laser',
              damage_type: 'kinetic',
              incoming_damage: 500,
              shield_resist_pct: 6,
              after_shield_resist: 470,
              type_resist_pct: 3,
              after_type_resist: 455,
              flat_reduction_pct: 3,
              after_flat_reduction: 440,
              shield_bypass_pct: 0,
              armor_bypass_pct: 0,
              ignore_all_defense: false,
              final_damage: 440,
              shield_damage: 300,
              hull_damage: 120,
            },
          ],
        },
      ],
      burns: [],
      flee: [],
    },
    {
      tick: 1,
      attacks: [
        {
          attacker_id: 'pirate-1',
          target_id: 'player-1',
          hit_success: false,
          final_damage: 0,
          hit_chance: 12,
          hit_roll: 81,
        },
        {
          attacker_id: 'player-1',
          target_id: 'pirate-1',
          hit_success: true,
          final_damage: 520,
          shield_damage: 340,
          hull_damage: 180,
          defense_components: [
            {
              weapon_instance_id: 'w-rail',
              weapon_name: 'Railgun',
              damage_type: 'energy',
              incoming_damage: 400,
              shield_resist_pct: 5,
              after_shield_resist: 380,
              type_resist_pct: 5,
              after_type_resist: 360,
              flat_reduction_pct: 3,
              after_flat_reduction: 350,
              shield_bypass_pct: 0,
              armor_bypass_pct: 0,
              ignore_all_defense: false,
              final_damage: 350,
              shield_damage: 200,
              hull_damage: 150,
            },
            {
              weapon_instance_id: 'w-cannon',
              weapon_name: 'Pulse Cannon',
              damage_type: 'kinetic',
              incoming_damage: 200,
              shield_resist_pct: 5,
              after_shield_resist: 190,
              type_resist_pct: 5,
              after_type_resist: 180,
              flat_reduction_pct: 6,
              after_flat_reduction: 170,
              shield_bypass_pct: 0,
              armor_bypass_pct: 0,
              ignore_all_defense: false,
              final_damage: 170,
              shield_damage: 140,
              hull_damage: 30,
            },
          ],
        },
      ],
      burns: [{ target_id: 'pirate-1', damage: 20, ticks_remaining: 2 }],
      flee: [],
      kills: [{ victim_id: 'pirate-1', killer_id: 'player-1' }],
      battle_ended: {
        outcome: 'side_1_victory',
        winning_side: 1,
        total_damage: 8420,
      },
    },
  ],
};

function participantSnapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    player_id: 'player-1',
    username: 'Marlowe',
    side_id: 1,
    zone: 'outer',
    stance: 'fire',
    auto_pilot: false,
    flee_counter: 0,
    ship_class: 'prospector',
    hull: 80,
    max_hull: 100,
    shield: 40,
    max_shield: 50,
    fuel: 20,
    max_fuel: 30,
    damage_dealt: 0,
    damage_taken: 0,
    kill_count: 0,
    x: 0,
    y: 0,
    ...overrides,
  };
}

// empty weapons satisfies required AttackLogEntry.weapons
function attackLogEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    attacker_id: 'pirate-boss-1',
    target_id: 'player-1',
    zone_distance: 3,
    weapons: [],
    raw_damage: 12,
    weapon_skill_pct: 0,
    pre_hit_damage: 12,
    hit_chance: 0.65,
    hit_roll: 0.2,
    hit_success: true,
    final_damage: 10,
    shield_damage: 7,
    hull_damage: 3,
    damage_type: 'kinetic',
    ...overrides,
  };
}

function participantSummary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    player_id: 'player-1',
    username: 'Marlowe',
    side_id: 1,
    damage_dealt: 0,
    damage_taken: 0,
    kill_count: 0,
    survived: true,
    ...overrides,
  };
}

function captureLogEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ship_id: 'ship-skiff-1',
    ship_class: 'skiff',
    captor_id: 'player-1',
    captor_username: 'Marlowe',
    former_owner_id: 'pirate-1',
    former_owner_username: 'Corsair',
    boarding_operation_id: 'board-1',
    ...overrides,
  };
}

export const battleLogSnapshotsFixture = {
  battle_id: 'battle-42',
  status: 'active',
  total_ticks: 1,
  has_more: false,
  entries: [
    {
      battle_id: 'battle-42',
      system_id: 'sol',
      tick: 0,
      snapshots: [
        participantSnapshot({
          player_id: 'player-1',
          username: 'Marlowe',
          kind: 'player',
          is_npc: false,
          is_boss: false,
        }),
        participantSnapshot({
          player_id: 'pirate-1',
          username: 'Corsair',
          side_id: 2,
          kind: 'pirate',
          is_npc: true,
          is_boss: false,
          ship_class: 'skiff',
        }),
        participantSnapshot({
          player_id: 'pirate-boss-1',
          username: 'Dreadnought',
          side_id: 2,
          kind: 'pirate',
          is_npc: true,
          is_boss: true,
          ship_class: 'dreadnought',
        }),
        participantSnapshot({
          player_id: 'pirate-old-1',
          username: 'Legacy Raider',
          side_id: 2,
          kind: 'pirate',
          ship_class: 'skiff',
          // is_npc / is_boss omitted (historical)
        }),
      ],
      attacks: [
        attackLogEntry({
          attacker_id: 'pirate-boss-1',
          target_id: 'player-1',
          hit_success: true,
        }),
      ],
    },
  ],
};

export const battleLogInterruptedFixture = {
  battle_id: 'battle-42',
  status: 'completed',
  total_ticks: 8,
  has_more: false,
  entries: [
    {
      battle_id: 'battle-42',
      system_id: 'sol',
      tick: 8,
      snapshots: [],
      battle_ended: {
        outcome: 'interrupted',
        winning_side: -1,
        duration: 8,
        total_damage: 1200,
        ships_destroyed: 0,
        category: 'pvp',
        participants: [
          participantSummary({
            player_id: 'player-1',
            username: 'Marlowe',
            kind: 'player',
            is_npc: false,
            survived: true,
          }),
        ],
      },
      recovered_summary: {
        start_tick: 900100,
        duration: 8,
        total_damage: 1200,
        ships_destroyed: 0,
        ships_captured: 1,
        category: 'pvp',
        side_factions: { '1': 'SMC', '2': 'pirate_kael' },
        captures: [captureLogEntry()],
        participants: [
          participantSummary({
            player_id: 'player-1',
            username: 'Marlowe',
            kind: 'player',
            is_npc: false,
            is_boss: false,
            survived: true,
            damage_dealt: 800,
          }),
          participantSummary({
            player_id: 'pirate-boss-1',
            username: 'Dreadnought',
            side_id: 2,
            kind: 'pirate',
            is_npc: true,
            is_boss: true,
            survived: true,
            damage_dealt: 400,
          }),
        ],
      },
    },
  ],
};

export const battleSummaryInterruptedFixture: Record<string, unknown> = {
  ...battleSummaryFixture,
  outcome: 'interrupted',
  winning_side: -1,
  ships_destroyed: 0,
  ships_captured: 0,
};
delete battleSummaryInterruptedFixture.destroyed_names;

export const captainLogGetFixture = {
  index: 0,
  created_at: '2026-05-29T14:45:00Z',
  entry: 'Reached Earth Station.\nLoaded fuel and checked the market.',
};

export const captainsLogListFixture = {
  index: 0,
  total_count: 3,
  max_entries: 100,
  has_next: true,
  has_prev: false,
  entry: {
    index: 0,
    created_at: '2026-05-23T15:04:05.000Z',
    entry: 'Found an old beacon.\nThe signal repeats every seven ticks.',
  },
};

export const chatHistoryFixture = {
  channel: 'local',
  has_more: true,
  total_count: 2,
  messages: [
    {
      id: 'chat-1',
      channel: 'local',
      sender_id: 'player-ibis',
      sender: 'Ibis',
      content: 'Clear skies over Sol today.',
      timestamp_utc: '2026-05-23T15:04:05.000Z',
    },
    {
      id: 'chat-2',
      channel: 'local',
      sender: 'Solarian Confederacy',
      sender_id: 'solarian',
      empire_official: true,
      content: 'Treasury payment processed.',
      timestamp_utc: '2026-05-23T15:05:05.000Z',
    },
  ],
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

export const factionInfoFixture = {
  id: 'faction-1',
  name: 'Drift Matrix',
  tag: 'DMX7',
  leader_username: 'DriftMiner-7',
  member_count: 20,
  owned_bases: 2,
  treasury: 12345,
  is_member: true,
  ally_fuel_access: true,
  ally_facility_access: false,
  ally_intel_opt_out: false,
  facilities: [
    {
      facility_id: 'facility-1',
      base_id: 'earth_station',
      name: 'Faction Fuel Bunker',
      type: 'fuel_bunker',
      active: true,
      faction_service: 'fuel',
    },
  ],
};

/** Public web profile from GET /api/factions/{tag} (bare JSON, not v2 faction_info). */
export const publicFactionProfileFixture = {
  id: 'cb22dc89b36022a0beecea17d548b76b',
  name: 'Interstellar Continental',
  tag: 'NOIR',
  primary_color: '#0D0D0D',
  secondary_color: '#FFD700',
  created_at: '2026-04-30T00:36:56.053381041Z',
  leader: 'Marlowe',
  founder: 'Marlowe',
  treasury: 17265270,
  member_count: 3,
  members: [
    {
      username: 'Marlowe',
      role: 'Leader',
      role_priority: 100,
      joined_at: '2026-04-30T00:36:56.053381041Z',
      last_seen: '2026-04-30T00:36:56.053381041Z',
    },
    {
      username: 'Arbiter47',
      role: 'Officer',
      role_priority: 50,
      joined_at: '2026-07-11T23:51:36.899216109Z',
      last_seen: '2026-07-11T23:51:36.899216189Z',
    },
    {
      username: 'Fabrini',
      role: 'Officer',
      role_priority: 50,
      joined_at: '2026-04-30T00:40:48.658591923Z',
      last_seen: '2026-04-30T00:40:48.658592013Z',
    },
  ],
  allies: [],
  enemies: [],
  wars: [],
  stations: [],
  titles: ['Lean Operator', 'Old Guard', 'Surveyors'],
  emblems: ['ore_sample', 'star_chart', 'ledger'],
  ranks: [
    { category: 'total_wealth', label: 'Total Wealth', rank: 4, value: 822440818 },
    { category: 'member_count', label: 'Member Count', rank: 13, value: 25 },
  ],
  ranks_top_n: 30,
  ranks_generated_at: '2026-07-14T19:23:26.2023986Z',
  achievements: {
    earned: 10,
    total: 19,
    points: 345,
  },
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
  page: 1,
  per_page: 20,
  total_replies: 1,
  has_more: false,
};

export const guideFixture = {
  guide: 'miner',
  content: 'Mine at asteroid belts, then sell ore at a station market.',
  server_version: 'v0.461.0',
  hint: 'Use get_poi before mining.',
};

export const guideListFixture = {
  server_version: 'v0.461.0',
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
  facility_owned: { command: 'facility_owned', fixture: facilityOwnedFixture },
  facility_list: { command: 'facility_list', fixture: facilityListFixture },
  facility_types: { command: 'facility_types', fixture: facilityTypesFixture },
  facility_upgrades: { command: 'facility_upgrades', fixture: facilityUpgradesFixture },
  faction_facility_list: { command: 'faction_facility_list', fixture: factionFacilityListFixture },
  faction_facility_owned: { command: 'faction_facility_owned', fixture: factionFacilityOwnedFixture },
  fleet: { command: 'fleet_status', fixture: fleetFixture },
  battle_status: { command: 'get_battle_status', fixture: battleStatusFixture },
};

/**
 * Multi-entry GetActionLogResponse sample (schema-shaped).
 * Entry ids are integers; optional job/mode/runs/venue/storage live under `data`
 * so they do not create extra-in-fixture drift against additionalProperties: false.
 * Selected receipt IDs are projected into dedicated table columns while all action
 * data remains nested in machine formats.
 */
export const actionLogFixture = {
  category: 'crafting',
  has_more: true,
  page: 1,
  page_size: 50,
  total: 5,
  total_pages: 1,
  entries: [
    {
      id: 1,
      created_at: '2026-05-23T15:04:05.000Z',
      summary: 'Completed basic iron smelting.',
      category: 'crafting',
      event_type: 'crafting.completed',
      data: {
        job_id: 'job-craft-1',
        mode: 'craft',
        storage: 'faction',
      },
    },
    {
      id: 4,
      created_at: '2026-06-24T09:15:00.000Z',
      summary: 'Queued 10 runs of steel_plate at personal facility.',
      category: 'crafting',
      event_type: 'crafting.queued',
      data: {
        job_id: 'job-craft-42',
        mode: 'craft',
        runs: 10,
        venue: 'player-refinery',
        storage: 'storage',
      },
    },
    {
      id: 2,
      created_at: '2026-06-22T11:30:00.000Z',
      summary: 'Marlowe rented your Ore Refinery: 5 runs, 250 credits earned.',
      category: 'other',
      event_type: 'other.facility_rented',
    },
    {
      id: 3,
      created_at: '2026-06-22T12:00:00.000Z',
      summary: 'Drone Control reached level 15.',
      category: 'skill',
      event_type: 'skill.level_up',
    },
    {
      id: 5,
      created_at: '2026-07-17T20:00:01.000Z',
      summary: 'Prospector completed at Earth Station.',
      category: 'ship',
      event_type: 'ship.commission_completed',
      data: {
        commission_id: 'commission-1',
        ship_id: 'ship-42',
        ship_class: 'prospector',
        ship_name: 'Prospector',
        base_id: 'earth_station',
        base_name: 'Earth Station',
      },
    },
  ],
};

export const actionLogCursorFixture = {
  event_types: ['faction.production_cycle', 'ship.buy_order_filled'],
  since_id: 100,
  next_since_id: 105,
  has_more: true,
  page_size: 50,
  entries: [
    {
      id: 101,
      created_at: '2026-07-18T12:00:01.000Z',
      summary: 'Faction production cycle completed.',
      category: 'faction',
      event_type: 'faction.production_cycle',
      data: { runs: 4, venue: 'alloy-foundry' },
    },
    {
      id: 105,
      created_at: '2026-07-18T12:01:10.000Z',
      summary: 'Prospector buy order filled at Nova Terra Central.',
      category: 'ship',
      event_type: 'ship.buy_order_filled',
      data: { ship_id: 'ship-prospector-42', base_id: 'nova-terra-central' },
    },
  ],
};

export const ranchStatusFixture = {
  action: 'ranch_status',
  facility_id: 'ranch-ember-1',
  facility_name: 'Ember Grazer Corral',
  level: 2,
  base_id: 'cinder_outpost',
  base_name: 'Cinder Outpost',
  anchor_poi: 'cinder_iron_belt',
  anchor_name: 'Cinder Iron Belt',
  species: 'ember_grazer',
  species_name: 'Ember Grazer',
  herd: 18,
  capacity: 24,
  range_health: 0.75,
  fed_fraction: 0.5,
  supplies_ok: false,
  cull_target: 0,
  max_cull_per_cycle: 4,
  growth_per_cycle: 1.5,
  wild_population: 12,
  domestication_reserve: 0,
  domestication_active: false,
  feed: [{ resource: 'iron_ore', per_cycle: 2, stocked: 10, cycles_left: 5 }],
  produces: [
    { item: 'grazer_milk', per_cycle: 2.5 },
    { item: 'ember_grazer_meat', per_cycle: 0 },
  ],
  message: 'The herd is healthy, but worker supplies need attention.',
};

export const ranchSetCullFixture = {
  details: {
    action: 'ranch_set_cull',
    facility_id: 'ranch-ember-1',
    cull_target: 0,
    herd: 18,
    message: 'Automatic culling disabled.',
  },
  player: { username: 'Marlowe', credits: 198000 },
  ship: { id: 'ship-wayfarer', name: 'Wayfarer', cargo_used: 0, cargo_capacity: 500 },
  cargo: [],
};

export const factionScanPoiDetails = {
  poi_id: 'sol_central',
  poi_name: 'Sol Central',
  system_id: 'sol',
  facility_level: 2,
  facility_station: 'earth_station',
  scan_power: 36,
  hops: 1,
  signature_detected: true,
  message: 'Projected scan contested 2 cloaks.',
  contacts: [
    {
      target_id: 'player-1',
      username: 'Wisp',
      faction_id: 'smc',
      ship_class: 'scout',
      ship_name: 'Quiet Current',
      hull: 72,
      shield: 18,
      cloaked: true,
      revealed_info: ['username', 'ship_class', 'hull', 'cloaked'],
    },
    {
      target_id: 'player-2',
      cloaked: true,
      revealed_info: ['cloaked'],
    },
  ],
  npcs: [
    {
      id: 'npc-1',
      name: 'Patrol',
      empire: 'solarian',
      role: 'patrol',
      ship_class: 'interceptor',
    },
  ],
  pirates: [
    {
      id: 'pirate-1',
      name: 'Raider',
      role: 'raider',
      ship_class: 'skiff',
      faction: 'pirate_kael',
      faction_name: 'Admiral Kael',
      primary_color: '#112233',
      secondary_color: '#445566',
    },
  ],
};

export const factionScanPoiFixture = {
  details: factionScanPoiDetails,
};

export const factionScanPoiEmptyFixture = {
  details: {
    poi_id: 'sol_central',
    facility_level: 2,
    scan_power: 36,
    hops: 0,
    message: 'Scan complete.',
  },
};

export const factionScanPoiPartialFixture = {
  details: {
    poi_id: 'sol_central',
    facility_level: 1,
    scan_power: 12,
    hops: 2,
    message: 'Partial scan.',
    contacts: [
      {
        target_id: 'player-cloaked-1',
        cloaked: true,
        revealed_info: ['cloaked', 'ship_class'],
        ship_class: 'scout',
      },
    ],
    pirates: [
      {
        id: 'pirate-2',
        name: 'Corsair',
        role: 'raider',
        ship_class: 'skiff',
      },
    ],
  },
};

export const socialHighValueFixtures: Record<string, HighValueFixtureEntry> = {
  chat: { command: 'chat', fixture: chatSentFixture },
  facility_owned: { command: 'facility_owned', fixture: facilityOwnedFixture },
  facility_list: {
    command: 'facility_list',
    fixture: facilityListSimpleFixture,
    apiRoute: 'POST /api/v2/spacemolt_facility/list',
  },
  facility_list_detailed: {
    command: 'facility_list',
    fixture: facilityListFixture,
    apiRoute: 'POST /api/v2/spacemolt_facility/list',
  },
  facility_ranch_status: {
    command: 'facility_ranch_status',
    fixture: ranchStatusFixture,
    apiRoute: 'POST /api/v2/spacemolt_facility/ranch_status',
  },
  facility_ranch_set_cull: {
    command: 'facility_ranch_set_cull',
    fixture: ranchSetCullFixture,
    apiRoute: 'POST /api/v2/spacemolt_facility/ranch_set_cull',
    schemaTarget: 'details',
  },
  faction_facility_owned: { command: 'faction_facility_owned', fixture: factionFacilityOwnedFixture },
  faction_facility_list: {
    command: 'faction_facility_list',
    fixture: factionFacilityListFixture,
    apiRoute: 'POST /api/v2/spacemolt_facility/faction_list',
  },
  fleet_status: { command: 'fleet_status', fixture: fleetFixture },
  get_battle_status: { command: 'get_battle_status', fixture: battleStatusFixture },
  get_battle_status_boarding: { command: 'get_battle_status', fixture: battleStatusBoardingFixture },
  get_battle_summary: { command: 'get_battle_summary', fixture: battleSummaryFixture },
  get_battle_summary_captures: { command: 'get_battle_summary', fixture: battleSummaryCapturesFixture },
  get_battle_summary_captures_kind: { command: 'get_battle_summary', fixture: battleSummaryCapturesKindFixture },
  get_battle_summary_interrupted: { command: 'get_battle_summary', fixture: battleSummaryInterruptedFixture },
  get_battle_log: { command: 'get_battle_log', fixture: battleLogFixture },
  get_battle_log_boarding: { command: 'get_battle_log', fixture: battleLogBoardingFixture },
  get_battle_log_plundered: { command: 'get_battle_log', fixture: battleLogPlunderedFixture },
  get_battle_log_snapshots: { command: 'get_battle_log', fixture: battleLogSnapshotsFixture },
  get_battle_log_interrupted: { command: 'get_battle_log', fixture: battleLogInterruptedFixture },
  facility_types: { command: 'facility_types', fixture: facilityTypesFixture },
  facility_types_detail: {
    command: 'facility_types',
    fixture: facilityTypesDetailFixture,
    apiRoute: 'POST /api/v2/spacemolt_facility/types',
  },
  facility_upgrades: { command: 'facility_upgrades', fixture: facilityUpgradesFixture },
  captains_log_get: { command: 'captains_log_get', fixture: captainLogGetFixture },
  captains_log_list: { command: 'captains_log_list', fixture: captainsLogListFixture },
  get_chat_history: { command: 'get_chat_history', fixture: chatHistoryFixture },
  get_action_log: { command: 'get_action_log', fixture: actionLogFixture },
  get_action_log_cursor: { command: 'get_action_log', fixture: actionLogCursorFixture },
  read_note: { command: 'read_note', fixture: readNoteFixture },
  faction_visit_room: { command: 'faction_visit_room', fixture: factionVisitRoomFixture },
  faction_info: { command: 'faction_info', fixture: factionInfoFixture },
  faction_profile: { command: 'faction_profile', fixture: publicFactionProfileFixture },
  faction_get_invites: { command: 'faction_get_invites', fixture: factionInvitesFixture },
  faction_intel_status: { command: 'faction_intel_status', fixture: factionIntelStatusFixture },
  faction_scan_poi: {
    command: 'faction_scan_poi',
    fixture: factionScanPoiFixture,
    schemaTarget: 'details',
  },
  faction_scan_poi_empty: {
    command: 'faction_scan_poi',
    fixture: factionScanPoiEmptyFixture,
    schemaTarget: 'details',
  },
  faction_scan_poi_partial: {
    command: 'faction_scan_poi',
    fixture: factionScanPoiPartialFixture,
    schemaTarget: 'details',
  },
  faction_trade_intel_status: { command: 'faction_trade_intel_status', fixture: factionTradeIntelStatusFixture },
  faction_espionage: {
    command: 'faction_espionage',
    fixture: {
      action: 'espionage',
      outcome: 'intel',
      intel_type: 'facility_build',
      story: 'Your spy slips through a service hatch and overhears plans for a new smelter.',
    },
  },
  forum_get_thread: { command: 'forum_get_thread', fixture: forumThreadFixture },
  get_guide: { command: 'get_guide', fixture: guideFixture },
  get_guide_list: { command: 'get_guide', fixture: guideListFixture },
};
