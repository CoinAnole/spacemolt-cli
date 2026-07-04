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
    category: 'Salvage & Tow',
    apiRoute: 'POST /api/v2/spacemolt_salvage/tow',
    positionals: ['wreck_id'],
  },
  release_tow: {
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
    usage: '<ship_class> [provide_materials=true/false]',
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
    usage: '<ticks>  (purchase ship insurance)',
    category: 'Insurance',
    apiRoute: 'POST /api/v2/spacemolt_salvage/insure',
    positionals: ['ticks'],
  },
  get_insurance_quote: {
    usage: '(get risk-based insurance quote)',
    category: 'Insurance',
    apiRoute: 'POST /api/v2/spacemolt_salvage/quote',
  },
  claim_insurance: {
    usage: '(file insurance claim)',
    category: 'Insurance',
    apiRoute: 'POST /api/v2/spacemolt_salvage/policies',
  },
  view_insurance: {
    usage: '(view active policies)',
    category: 'Insurance',
    apiRoute: 'POST /api/v2/spacemolt_salvage/policies',
  },
};
