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

export const genericFixtureCases = {};

export const genericHighValueFixtures = {
  get_active_missions: { command: 'get_active_missions', fixture: activeMissionsFixture },
  catalog_items: { command: 'catalog', fixture: catalogItemsFixture },
  catalog_recipes: { command: 'catalog', fixture: catalogRecipesFixture },
  get_missions: { command: 'get_missions', fixture: missionsFixture },
  faction_list: { command: 'faction_list', fixture: factionsFixture },
};
