import type { CommandOverride } from './commands';

export const BATTLE_SHIPYARD_COMMAND_OVERRIDES: Record<string, CommandOverride> = {
  battle_engage: {
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_battle/engage',
    positionals: ['side_id'],
  },
  battle_advance: {
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_battle/advance',
  },
  battle_retreat: {
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_battle/retreat',
  },
  battle_stance: {
    usage: '<stance>',
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_battle/stance',
    positionals: ['stance'],
    aliases: {
      stance: 'id',
    },
  },
  battle_target: {
    usage: '<target_id>',
    description: 'Focus a target in the current battle.',
    example: 'spacemolt battle_target <target_id>',
    discoverWith: ['get_battle_status'],
    seeAlso: ['battle_stance', 'reload'],
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
    description: 'View the tick-by-tick combat replay of a battle by ID',
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
    usage: '<ship_class>',
    category: 'Shipyard',
    apiRoute: 'POST /api/v2/spacemolt_ship/commission_quote',
    positionals: ['ship_class'],
  },
  commission_status: {
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
  browse_ships: {
    category: 'Ship Exchange',
    apiRoute: 'POST /api/v2/spacemolt_ship/browse_ships',
    positionals: ['base_id', 'class_id', 'max_price'],
    schemaExtensions: {
      base_id: {
        type: 'string',
        description: 'Station to browse listings at (defaults to current station)',
      },
    },
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
