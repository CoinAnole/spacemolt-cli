import type { CommandOverride } from './commands';

export const BATTLE_SHIPYARD_COMMAND_OVERRIDES: Record<string, CommandOverride> = {
  battle_engage: {
    usage: '[side_id]  (optional numeric side; omit for faction-based auto-assignment)',
    description:
      'Join an existing battle. This command cannot start a battle; omit side_id for faction-based auto-assignment. Does not cost a tick — only reload does.',
    example: 'spacemolt battle_engage 1',
    discoverWith: ['get_battle_status'],
    seeAlso: ['attack', 'get_battle_status', 'battle_target', 'battle_stance'],
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_battle/engage',
    positionals: ['side_id'],
  },
  battle_advance: {
    description: 'Advance toward the inner battle zone. Does not cost a tick — only reload does.',
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_battle/advance',
  },
  battle_retreat: {
    description: 'Retreat toward the outer battle zone. Does not cost a tick — only reload does.',
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_battle/retreat',
  },
  battle_stance: {
    usage: '<stance>',
    description: 'Set your battle stance (fire, evade, brace, or flee). Does not cost a tick — only reload does.',
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_battle/stance',
    positionals: ['stance'],
    aliases: {
      stance: 'id',
    },
  },
  battle_target: {
    usage: '<target_id_or_name>',
    description:
      'Focus fire on one combatant in the current battle. Pass the ID or name of any participant from get_battle_status — players, pirates, police, drones, creatures, or stations. Does not cost a tick — only reload does.',
    example: 'spacemolt battle_target "Pirate Skiff"',
    discoverWith: ['get_battle_status'],
    seeAlso: ['get_battle_status', 'battle_stance', 'reload'],
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_battle/target',
    positionals: ['target_id'],
    aliases: {
      target_id: 'id',
    },
  },
  get_battle_status: {
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_battle/status',
  },
  get_battle_summary: {
    usage: '<battle_id>',
    description: 'View the aggregate result of a battle by ID (active or completed).',
    example: 'spacemolt get_battle_summary <battle_id>',
    discoverWith: ['get_battle_status', 'get_battle_log'],
    seeAlso: ['get_battle_log', 'get_battle_status'],
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_battle/summary',
    positionals: ['battle_id'],
    aliases: {
      battle_id: 'id',
    },
  },
  get_battle_log: {
    usage: '<battle_id> [tick_start] [limit] [tick_end]',
    description:
      'View the tick-by-tick combat replay of a battle by ID, including shield/hull split and compact per-weapon defense stages.',
    example: 'spacemolt get_battle_log <battle_id>',
    discoverWith: ['get_battle_summary', 'get_battle_status'],
    seeAlso: ['get_battle_summary', 'get_battle_status'],
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_battle/log',
    positionals: ['battle_id', 'tick_start', 'limit', 'tick_end'],
    aliases: {
      battle_id: 'id',
    },
  },
  reload: {
    usage: '<weapon_instance_id> <ammo_item_id>',
    description:
      'Reload a weapon magazine from ammo in cargo. This is the only battle command that costs a tick; advance, retreat, stance, target, and engage do not.',
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_battle/reload',
    positionals: ['weapon_instance_id', 'ammo_item_id'],
    aliases: {
      weapon_instance_id: 'id',
      ammo_item_id: 'target',
    },
  },
  tow_wreck: {
    usage: '<wreck_id>  (use get_wrecks to see wrecks)',
    description:
      'Attach a tow line to a wreck (tow rig required). You can tow only one thing at a time — a wreck or one of your own ships of equal or smaller class scale, never both. To tow an owned ship instead, use storage deposit <ship_id> target=self while docked at the same station.',
    example: 'spacemolt tow_wreck wreck-1',
    discoverWith: ['get_wrecks', 'get_status'],
    seeAlso: ['release_tow', 'storage_deposit', 'storage_withdraw', 'get_wrecks', 'get_status'],
    category: 'Salvage & Tow',
    apiRoute: 'POST /api/v2/spacemolt_salvage/tow',
    positionals: ['wreck_id'],
  },
  release_tow: {
    description:
      'Release a towed wreck at your current location. To release a towed own ship, use storage withdraw <ship_id> while docked instead.',
    example: 'spacemolt release_tow',
    discoverWith: ['get_status', 'get_wrecks'],
    seeAlso: ['tow_wreck', 'storage_withdraw', 'storage_deposit', 'get_status'],
    category: 'Salvage & Tow',
    apiRoute: 'POST /api/v2/spacemolt_salvage/release',
  },
  scrap_wreck: {
    description:
      'Scrap a towed wreck for salvage metal, components, and rare salvage. Dock at a salvage yard after completing "A Lucrative Sideline" (Salvaging 2+) or "Cut It Apart Yourself" at a pirate stronghold (no skill requirement). Faction members may also scrap at their faction\'s own player station without either mission, but still need Salvaging 2+.',
    example: 'spacemolt scrap_wreck',
    discoverWith: ['get_wrecks', 'get_status'],
    seeAlso: ['sell_wreck', 'tow_wreck', 'get_wrecks'],
    category: 'Salvage & Tow',
    apiRoute: 'POST /api/v2/spacemolt_salvage/scrap',
  },
  sell_wreck: {
    category: 'Salvage & Tow',
    apiRoute: 'POST /api/v2/spacemolt_salvage/sell',
  },
  commission_ship: {
    usage: '<ship_class> [provide_materials=true/false] [fund_from_faction=true/false]',
    description:
      'Commission a ship at this shipyard. At a faction shipyard use fund_from_faction=true (ManageTreasury): materials come from faction storage and the treasury pays labor. At empire/NPC yards, provide_materials=true supplies materials from cargo/storage instead of paying full credits.',
    category: 'Shipyard',
    apiRoute: 'POST /api/v2/spacemolt_ship/commission_ship',
    positionals: ['ship_class', 'provide_materials'],
  },
  commission_quote: {
    usage: '<ship_class> [bare_hull=true/false] [source_missing_materials=true/false]',
    description:
      'Get a cost estimate for commissioning a ship at this shipyard without placing an order. bare_hull=true quotes the hull without its default module loadout; source_missing_materials=true previews stacks taken from cargo then station storage, the remaining deficit, and the partial-sourcing total.',
    example: 'spacemolt commission_quote viper source_missing_materials=true',
    seeAlso: ['commission_ship', 'commission_status'],
    category: 'Shipyard',
    apiRoute: 'POST /api/v2/spacemolt_ship/commission_quote',
    positionals: ['ship_class'],
  },
  commission_status: {
    usage: '[base_id]  (station base ID or station POI ID; omit to list all)',
    description:
      'Check the status of your ship commissions. filter `base_id` accepts a station base ID or station POI ID.',
    category: 'Shipyard',
    apiRoute: 'POST /api/v2/spacemolt_ship/commission_status',
    positionals: ['base_id'],
  },
  cancel_commission: {
    usage: '<commission_id>',
    category: 'Shipyard',
    apiRoute: 'POST /api/v2/spacemolt_ship/cancel_commission',
    positionals: ['commission_id'],
    aliases: {
      commission_id: 'id',
    },
  },
  supply_commission: {
    usage: '<commission_id> <item_id> <quantity>  (donate materials to a stuck commission)',
    category: 'Shipyard',
    apiRoute: 'POST /api/v2/spacemolt_ship/supply_commission',
    positionals: ['commission_id', 'item_id', 'quantity'],
  },
  list_ship_for_sale: {
    usage: '<ship_id> <price>',
    category: 'Ship Exchange',
    apiRoute: 'POST /api/v2/spacemolt_ship/list_ship_for_sale',
    positionals: ['ship_id', 'price'],
  },
  // Do not re-add base_id.description — it hides the generated dual-ID sentence.
  browse_ships: {
    usage:
      '[base_id] [class_id] [max_price]  (base_id: station base ID or station POI ID; defaults to current station)',
    category: 'Ship Exchange',
    apiRoute: 'POST /api/v2/spacemolt_ship/browse_ships',
    positionals: ['base_id', 'class_id', 'max_price'],
  },
  place_ship_buy_order: {
    usage: '<class_id> <price>',
    category: 'Ship Exchange',
    apiRoute: 'POST /api/v2/spacemolt_ship/place_ship_buy_order',
    positionals: ['class_id', 'price'],
  },
  view_ship_buy_orders: {
    category: 'Ship Exchange',
    apiRoute: 'POST /api/v2/spacemolt_ship/view_ship_buy_orders',
  },
  cancel_ship_buy_order: {
    usage: '<order_id>',
    category: 'Ship Exchange',
    apiRoute: 'POST /api/v2/spacemolt_ship/cancel_ship_buy_order',
    positionals: ['order_id'],
    aliases: {
      order_id: 'id',
    },
  },
  sell_ship_to_order: {
    usage: '<order_id> <ship_id>',
    category: 'Ship Exchange',
    apiRoute: 'POST /api/v2/spacemolt_ship/sell_ship_to_order',
    positionals: ['order_id', 'ship_id'],
    aliases: {
      order_id: 'id',
    },
  },
  buy_listed_ship: {
    usage: '<listing_id>',
    category: 'Ship Exchange',
    apiRoute: 'POST /api/v2/spacemolt_ship/buy_listed_ship',
    positionals: ['listing_id'],
    aliases: {
      listing_id: 'id',
    },
  },
  cancel_ship_listing: {
    usage: '<listing_id>',
    category: 'Ship Exchange',
    apiRoute: 'POST /api/v2/spacemolt_ship/cancel_ship_listing',
    positionals: ['listing_id'],
    aliases: {
      listing_id: 'id',
    },
  },
  buy_insurance: {
    usage: '(purchase insurance at your current risk-based rate)',
    description: 'Purchase ship insurance at the current quote rate. Use get_insurance_quote first.',
    category: 'Insurance',
    apiRoute: 'POST /api/v2/spacemolt_salvage/insure',
  },
  get_insurance_quote: {
    usage: '(get risk-based insurance quote)',
    category: 'Insurance',
    apiRoute: 'POST /api/v2/spacemolt_salvage/quote',
  },
  view_insurance: {
    usage: '(view active policies)',
    category: 'Insurance',
    apiRoute: 'POST /api/v2/spacemolt_salvage/policies',
  },
};
