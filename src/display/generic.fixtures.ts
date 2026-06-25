import type { HighValueFixtureEntry } from './formatter-fixtures.ts';

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
      effect: {
        type: 'ammo',
        ammo: {
          damage_mod: 0.5,
          splash_pct: 0.6,
          hull_damage_mod: 1.0,
        },
      },
    },
    {
      base_value: 85,
      category: 'ammo',
      description: 'Ghost rounds are untraceable when used exclusively.',
      id: 'ghost_rounds_box',
      name: 'Ghost Rounds Box',
      rarity: 'rare',
      size: 1,
      stackable: true,
      tradeable: true,
      effect: {
        type: 'ammo',
        ammo: {
          damage_mod: 0.9,
          armor_bypass: 0.3,
          untraceable: true,
          wear_per_shot: 0.01,
        },
      },
    },
  ],
  message: 'Items: showing 2 of 537',
  page: 1,
  page_size: 20,
  total: 537,
  total_pages: 27,
  type: 'items',
};

export const catalogRecipesFixture = {
  items: [],
  message: 'Recipes: showing 1 of 24',
  page: 1,
  page_size: 20,
  recipes: [
    {
      category: 'refining',
      crafting_time: 3,
      description: 'Smelt iron ore into reinforced plates.',
      id: 'refine_iron_plates',
      inputs: [
        { item_id: 'ore_iron', quantity: 4 },
        { item_id: 'fuel_cell', quantity: 1 },
      ],
      name: 'Refine Iron Plates',
      outputs: [{ item_id: 'iron_plate', quantity: 2 }],
    },
  ],
  total: 24,
  total_pages: 2,
  type: 'recipes',
};

export const catalogShipsFixture = {
  items: [
    {
      class: 'capital_refinery',
      empire: 'outerrim',
      id: 'money_pit',
      name: 'Money Pit',
      passive_recipes: ['refine_ore_iron'],
      piloting_required: 5,
      required_reputation: 60,
      shipyard_tier: 5,
      tier: 5,
    },
    {
      class: 'luxury_liner',
      empire: 'solarian',
      id: 'concierge_liner',
      name: 'Concierge Liner',
      piloting_required: 8,
      prestige_lock: 'Locked: prestige hull reserved for pilots who have earned the "Galactic Concierge" achievement.',
      required_achievement: 'galactic_concierge',
      shipyard_tier: 3,
      tier: 4,
    },
  ],
  message: 'Ships: showing 2 of 22',
  page: 1,
  page_size: 20,
  total: 22,
  total_pages: 1,
  type: 'ships',
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

export const activeMissionsFixture = {
  message: 'Active missions',
  missions: {
    active: [
      {
        difficulty: 2,
        expires_in_ticks: 17,
        mission_id: 'mission-distress-combatdummy6',
        objectives: [
          {
            description: 'Rescue CombatDummy6',
            progress: { current: 0, required: 1 },
            target: { name: 'CombatDummy6', system_id: 'markab' },
            type: 'distress_rescue',
          },
        ],
        rewards: {
          credits: 0,
          skill_xp: { piloting: 25 },
        },
        title: 'Distress Call: CombatDummy6',
        type: 'distress',
      },
      {
        difficulty: 3,
        expires_in_ticks: 22,
        mission_id: 'mission-distress-wealthyminer2023',
        objectives: [
          {
            description: 'Rescue WealthyMiner2023',
            progress: { current: 0, required: 1 },
            target: { name: 'WealthyMiner2023', system_id: 'electra' },
            type: 'distress_rescue',
          },
        ],
        rewards: {
          skill_xp: { piloting: 50 },
        },
        title: 'Distress Call: WealthyMiner2023',
        type: 'distress',
      },
    ],
    max_missions: 5,
  },
};

export const acceptMissionPostActionFixture = {
  details: {
    mission_id: 'mission-delivery-1',
    template_id: 'delivery-food',
    title: 'Food Delivery',
    type: 'delivery',
    expires_at: '2026-06-16T18:00:00Z',
    message: 'Mission accepted.',
  },
  player: { credits: 975 },
  cargo: [{ item_id: 'food_rations', item_name: 'Food Rations', quantity: 5 }],
  missions: {
    active: [
      {
        mission_id: 'mission-delivery-1',
        title: 'Food Delivery',
        type: 'delivery',
        objectives: [{ description: 'Deliver Food Rations', item_id: 'food_rations', quantity: 5 }],
      },
    ],
    max_missions: 5,
  },
};

export const abandonMissionPostActionFixture = {
  details: {
    mission_id: 'mission-delivery-1',
    title: 'Food Delivery',
    message: 'Mission abandoned.',
  },
  missions: {
    active: [
      {
        mission_id: 'mission-survey-2',
        title: 'Survey Run',
        type: 'survey',
      },
    ],
    max_missions: 5,
  },
  queue: { has_pending: false },
};

export const craftQueuedFixture = {
  details: {
    action: 'craft',
    effective_time_per_run: 3.5,
    escrowed: {
      inputs: [
        { item_id: 'circuit_board', name: 'Circuit Board', quantity: 2 },
        { item_id: 'energy_crystal', name: 'Energy Crystal', quantity: 3 },
        { item_id: 'copper_wiring', name: 'Copper Wiring', quantity: 2 },
      ],
    },
    est_completion_tick: 1131729,
    facility_id: 'workshop:player-1:nova_terra_central',
    job_id: 'craft-job-1',
    message: 'Crafting queued: 1 run(s) of Build Power Cell at Station Workshop, making 1 Power Cell.',
    mode: 'craft',
    produces: [{ item_id: 'power_cell', name: 'Power Cell', quantity: 1 }],
    recipe: 'Build Power Cell',
    runs: 1,
    venue: 'Station Workshop',
    venue_type: 'workshop',
  },
};

export const recycleQuoteFixture = {
  details: {
    action: 'recycle',
    cost: {
      inputs: [{ item_id: 'power_cell', name: 'Power Cell', quantity: 1 }],
    },
    credits_total: 0,
    dry_run: true,
    effective_time_per_run: 4,
    est_completion_tick: 1131730,
    facility_id: 'recycler-facility-1',
    have_credits: true,
    have_inputs: true,
    message: 'Quote only — nothing queued. Recycling 1 run(s) of Build Power Cell at Public Recycler.',
    mode: 'recycle',
    produces: [
      { item_id: 'circuit_board', name: 'Circuit Board', quantity: 1 },
      { item_id: 'copper_wiring', name: 'Copper Wiring', quantity: 1 },
    ],
    quantity: 1,
    recipe: 'Build Power Cell',
    runs: 1,
    venue: 'Public Recycler',
    venue_type: 'facility',
  },
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

export const empireInfoFixture = {
  action: 'get_empire_info',
  empires: [
    {
      bounty_attack: 500,
      bounty_kill: 2000,
      bounty_rep_restoration_bps: 5000,
      bounty_rep_restoration_cap: 10,
      citizenship_auto_approve: false,
      citizenship_exclusive: false,
      citizenship_fee: 5000,
      citizenship_min_balance: 25000,
      citizenship_min_reputation: 40,
      citizenship_open: true,
      contraband_items: [],
      customs_fine_multiplier_bps: 20000,
      default_foreign_sales_tax_bps: 300,
      empire_id: 'solarian',
      eviction_grace_cycles: 2,
      facility_rent_multiplier_bps: 20000,
      foreign_sales_tax_bps: {
        crimson: 200,
        nebula: 200,
        outerrim: 200,
      },
      fuel_tax_per_unit: 6,
      income_tax_bps: 500,
      jail_duration_hours: 24,
      listing_fee_bps: 200,
      policy_updated_at: 1778968093,
      property_tax_bps: 50,
      rep_baseline_citizen: 20,
      rep_baseline_outsider: 10,
      rep_decay_amount: 1,
      rep_penalty_attack: 5,
      rep_penalty_kill: 10,
      rep_trade_fill_cap: 2,
      rep_trade_fill_divisor: 200,
      repair_cost_per_hull: 5,
      sales_tax_bps: 100,
      ship_listing_fee_bps: 100,
      shoot_on_sight_threshold: -20,
      starting_credits: 500,
      stateless_sales_tax_bps: 300,
      tax_delinquency_bounty_per_credit: 10000,
    },
    {
      bounty_attack: 500,
      bounty_kill: 2000,
      bounty_rep_restoration_bps: 5000,
      bounty_rep_restoration_cap: 10,
      citizenship_auto_approve: true,
      citizenship_exclusive: false,
      citizenship_fee: 0,
      citizenship_min_balance: 0,
      citizenship_min_reputation: 0,
      citizenship_open: true,
      contraband_items: ['unstable_core'],
      customs_fine_multiplier_bps: 20000,
      default_foreign_sales_tax_bps: 0,
      empire_id: 'voidborn',
      eviction_grace_cycles: 2,
      facility_rent_multiplier_bps: 10000,
      fuel_tax_per_unit: 2,
      income_tax_bps: 200,
      jail_duration_hours: 24,
      listing_fee_bps: 100,
      policy_updated_at: 1778967713,
      property_tax_bps: 50,
      rep_baseline_citizen: 20,
      rep_baseline_outsider: 10,
      rep_decay_amount: 1,
      rep_penalty_attack: 5,
      rep_penalty_kill: 10,
      rep_trade_fill_cap: 2,
      rep_trade_fill_divisor: 200,
      repair_cost_per_hull: 5,
      sales_tax_bps: 100,
      ship_listing_fee_bps: 100,
      shoot_on_sight_threshold: -20,
      starting_credits: 100,
      stateless_sales_tax_bps: 0,
      tax_delinquency_bounty_per_credit: 0,
    },
  ],
};

export const taxEstimateFixture = {
  action: 'get_tax_estimate',
  sales_tax_rates: [
    { empire: 'solarian', rate_bps: 100, reason: 'citizen rate' },
    { empire: 'voidborn', rate_bps: 250, reason: 'foreign rate' },
  ],
  taxable_income_to_date: 42000,
  market_sales_to_date: 30000,
  market_cost_of_goods_deducted: 18000,
  taxable_market_income: 12000,
  market_loss_carryforward: 2500,
  taxable_income_by_source: [
    { category: 'market', amount: 30000 },
    { category: 'missions', amount: 12000 },
  ],
  income_tax: [
    {
      empire: 'solarian',
      rate_bps: 500,
      gross: 210,
      credit: 0,
      owed: 210,
      brackets: [
        { lower_bound: 0, upper_bound: 50000, rate_bps: 500, income_in_bracket: 42000, tax_from_bracket: 210 },
      ],
    },
  ],
  income_tax_total: 210,
  assessed_property_value: 125000,
  assessed_property_by_ship: [{ ship_id: 'ship-1', value: 125000 }],
  property_tax: [{ empire: 'solarian', rate_bps: 50, assessed_value: 125000, owed: 625 }],
  property_tax_total: 625,
  tax_prepaid: 150,
  tax_collection_active: true,
  last_assessed_at: 1779926400,
  last_property_assessed_at: 1779926400,
  next_assessment_approx_seconds: 3600,
  note: 'Estimate only.',
};

export const createFactionFixture = {
  action: 'create_faction',
  faction_id: 'faction-smc',
  name: 'Surveyor Mining Collective',
};

export const setColorsFixture = {
  action: 'set_colors',
};

export const setStatusFixture = {
  action: 'set_status',
};

export const undockFixture = {
  action: 'undock',
};

export const genericFixtureCases = {};

export const genericHighValueFixtures: Record<string, HighValueFixtureEntry> = {
  get_active_missions: { command: 'get_active_missions', fixture: activeMissionsFixture },
  accept_mission: { command: 'accept_mission', fixture: acceptMissionPostActionFixture },
  abandon_mission: { command: 'abandon_mission', fixture: abandonMissionPostActionFixture },
  craft: { command: 'craft', fixture: craftQueuedFixture },
  recycle: { command: 'recycle', fixture: recycleQuoteFixture },
  catalog_items: { command: 'catalog', fixture: catalogItemsFixture },
  catalog_recipes: { command: 'catalog', fixture: catalogRecipesFixture },
  catalog_ships: { command: 'catalog', fixture: catalogShipsFixture },
  get_missions: { command: 'get_missions', fixture: missionsFixture },
  faction_list: { command: 'faction_list', fixture: factionsFixture },
  get_empire_info: { command: 'get_empire_info', fixture: empireInfoFixture },
  get_tax_estimate: { command: 'get_tax_estimate', fixture: taxEstimateFixture },
  create_faction: { command: 'create_faction', fixture: createFactionFixture, schemaTarget: 'details' },
  set_colors: { command: 'set_colors', fixture: setColorsFixture, schemaTarget: 'details' },
  set_status: { command: 'set_status', fixture: setStatusFixture, schemaTarget: 'details' },
  undock: { command: 'undock', fixture: undockFixture, schemaTarget: 'details' },
};
