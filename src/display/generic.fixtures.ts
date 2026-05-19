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

export const genericFixtureCases = {};

export const genericHighValueFixtures = {
  catalog_items: { command: 'catalog', fixture: catalogItemsFixture },
  get_missions: { command: 'get_missions', fixture: missionsFixture },
  faction_list: { command: 'faction_list', fixture: factionsFixture },
};
