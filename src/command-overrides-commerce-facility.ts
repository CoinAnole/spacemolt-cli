import type { CommandOverride } from './commands';

const STORAGE_TRANSFER_SOURCE_DESCRIPTION =
  "Optional source for deposit/withdraw: 'cargo' (default - your ship's cargo hold or wallet), 'storage' (personal storage; use with target=faction or a player name to transfer directly, bypassing cargo), or 'faction' (faction storage; use with target=self to transfer faction->personal directly, requires manage_treasury).";

export const COMMERCE_FACILITY_COMMAND_OVERRIDES: Record<string, CommandOverride> = {
  get_missions: {
    category: 'Missions',
    apiRoute: 'POST /api/v2/spacemolt/get_missions',
  },
  get_active_missions: {
    category: 'Missions',
    apiRoute: 'POST /api/v2/spacemolt/get_active_missions',
  },
  accept_mission: {
    category: 'Missions',
    apiRoute: 'POST /api/v2/spacemolt/accept_mission',
    positionals: ['mission_id'],
    aliases: {
      mission_id: 'id',
    },
  },
  complete_mission: {
    category: 'Missions',
    apiRoute: 'POST /api/v2/spacemolt/complete_mission',
    positionals: ['mission_id'],
    aliases: {
      mission_id: 'id',
    },
  },
  decline_mission: {
    category: 'Missions',
    apiRoute: 'POST /api/v2/spacemolt/decline_mission',
    positionals: ['template_id'],
    aliases: {
      template_id: 'id',
    },
  },
  abandon_mission: {
    category: 'Missions',
    apiRoute: 'POST /api/v2/spacemolt/abandon_mission',
    positionals: ['mission_id'],
    aliases: {
      mission_id: 'id',
    },
  },
  completed_missions: {
    category: 'Missions',
    apiRoute: 'POST /api/v2/spacemolt/completed_missions',
  },
  distress_signal: {
    usage: '[fuel|repair|combat]  (broadcast emergency, 1hr cooldown)',
    category: 'Missions',
    apiRoute: 'POST /api/v2/spacemolt/distress_signal',
    positionals: ['type'],
    aliases: {
      type: 'distress_type',
    },
  },
  view_completed_mission: {
    usage: '<template_id>  (view full details of a completed mission)',
    category: 'Missions',
    apiRoute: 'POST /api/v2/spacemolt/view_completed_mission',
    positionals: ['template_id'],
    aliases: {
      template_id: 'id',
    },
  },
  jettison: {
    category: 'Cargo',
    apiRoute: 'POST /api/v2/spacemolt/jettison',
    positionals: ['item_id', 'quantity'],
  },
  storage: {
    usage: 'action=deposit|loot|jettison [item_id=...] [quantity=N] [wreck_id=...] [module_id=...]',
    description: 'Run the unified storage command for deposits, looting wrecks, and jettisoning cargo.',
    example: 'spacemolt storage action=loot wreck_id=wreck_1 item_id=ore_iron quantity=2',
    discoverWith: ['view_storage', 'view_faction_storage', 'get_wrecks', 'get_cargo'],
    seeAlso: ['view_faction_storage', 'deposit_items', 'withdraw_items', 'loot_wreck', 'jettison'],
    category: 'Station storage',
    apiRoute: 'POST /api/v2/spacemolt_storage/deposit',
    schemaExtensions: {
      action: {
        type: 'string',
        enum: ['deposit', 'loot', 'jettison'],
        description: 'Storage operation. Use loot for wreck cargo/modules or jettison for cargo disposal.',
      },
      wreck_id: {
        type: 'string',
        description: 'Optional wreck UUID for action=loot. Omit to loot the wreck you are towing.',
      },
      module_id: {
        type: 'string',
        description: 'Optional module instance ID for action=loot.',
      },
    },
  },
  storage_loot: {
    usage: '[item_id] [quantity] [wreck_id=...] [module_id=...]',
    description: 'Loot cargo or modules from a wreck through the storage tool.',
    example: 'spacemolt storage_loot ore_iron 2 wreck_id=wreck_1',
    discoverWith: ['storage', 'get_wrecks'],
    seeAlso: ['storage', 'loot_wreck', 'get_wrecks'],
    category: 'Station storage',
    apiRoute: 'POST /api/v2/spacemolt_storage/loot',
  },
  storage_jettison: {
    usage: '<item_id> <quantity>',
    description: 'Jettison cargo through the storage tool.',
    example: 'spacemolt storage_jettison ore_iron 50',
    discoverWith: ['storage', 'get_cargo'],
    seeAlso: ['storage', 'jettison', 'get_cargo'],
    category: 'Station storage',
    apiRoute: 'POST /api/v2/spacemolt_storage/jettison',
  },
  view_storage: {
    usage: '[station_id] [--item item_id] [--items item_id,item_id] [--search text]',
    description: 'Show personal station storage. Omit station_id for the current station.',
    example: 'spacemolt view_storage --items iron_ore,fuel_cell',
    discoverWith: ['get_status'],
    seeAlso: ['deposit_items', 'withdraw_items'],
    category: 'Station storage',
    apiRoute: 'POST /api/v2/spacemolt_storage/view',
    positionals: ['station_id'],
    aliases: {
      item: 'item_id',
    },
    schemaExtensions: {
      search: {
        type: 'string',
        description:
          'Client-side search across item IDs and names in text, JSON, and structured output. Comma-separated terms match any.',
      },
      items: {
        type: 'string',
        description: 'Client-side comma-separated exact item ID filter for text, JSON, and structured output.',
      },
    },
    clientOnlyFields: ['search', 'items'],
  },
  view_faction_storage: {
    usage:
      '[station_id] [--item item_id] [--items item_id,item_id] [--search text]  (view faction storage, omit for current station)',
    category: 'Station storage',
    apiRoute: 'POST /api/v2/spacemolt_storage/view',
    positionals: ['station_id'],
    aliases: {
      item: 'item_id',
    },
    schemaExtensions: {
      search: {
        type: 'string',
        description:
          'Client-side search across item IDs and names in text, JSON, and structured output. Comma-separated terms match any.',
      },
      items: {
        type: 'string',
        description: 'Client-side comma-separated exact item ID filter for text, JSON, and structured output.',
      },
    },
    clientOnlyFields: ['search', 'items'],
    defaults: {
      target: 'faction',
    },
  },
  faction_deposit_credits: {
    usage: '<amount>  (deposit credits to faction treasury)',
    category: 'Station storage',
    apiRoute: 'POST /api/v2/spacemolt_storage/deposit',
    positionals: ['quantity'],
    defaults: {
      target: 'faction',
      item_id: 'credits',
    },
  },
  faction_withdraw_credits: {
    usage: '<amount>  (withdraw credits from faction treasury, requires manage_treasury)',
    category: 'Station storage',
    apiRoute: 'POST /api/v2/spacemolt_storage/withdraw',
    positionals: ['quantity'],
    defaults: {
      source: 'faction',
      item_id: 'credits',
    },
  },
  deposit_items: {
    usage: '<item_id_or_cached_name> <quantity>  (use get_ship or get_cargo to cache cargo)',
    description: 'Move cargo into station storage.',
    example: 'spacemolt deposit_items ore_iron 50',
    discoverWith: ['get_cargo', 'view_storage'],
    seeAlso: ['withdraw_items', 'view_storage'],
    category: 'Station storage',
    apiRoute: 'POST /api/v2/spacemolt_storage/deposit',
    positionals: ['item_id', 'quantity'],
    schemaExtensions: {
      source: {
        type: 'string',
        description: STORAGE_TRANSFER_SOURCE_DESCRIPTION,
      },
    },
  },
  withdraw_items: {
    usage: '<item_id_or_cached_name> <quantity>  (use view_storage to cache stored items)',
    description: 'Move station storage items into cargo.',
    example: 'spacemolt withdraw_items ore_iron 50',
    discoverWith: ['view_storage', 'get_cargo'],
    seeAlso: ['deposit_items', 'get_cargo'],
    category: 'Station storage',
    apiRoute: 'POST /api/v2/spacemolt_storage/withdraw',
    positionals: ['item_id', 'quantity'],
    schemaExtensions: {
      source: {
        type: 'string',
        description: STORAGE_TRANSFER_SOURCE_DESCRIPTION,
      },
    },
  },
  send_gift: {
    usage:
      '<recipient> [item_id=... quantity=...] [credits=...] [ship_id=...] [message="..."]  (async transfer to their storage here)',
    category: 'Station storage',
    apiRoute: 'POST /api/v2/spacemolt_storage/deposit',
    positionals: ['recipient', 'item_id', 'quantity', 'credits', 'message', 'ship_id'],
    aliases: {
      recipient: 'target',
      ship_id: 'item_id',
    },
    schemaExtensions: {
      credits: {
        type: 'integer',
        description: 'Credits to gift to a player or donate to an empire treasury.',
      },
    },
  },
  create_sell_order: {
    usage: '<item_id_or_cached_name> <quantity> <price_each>  (list items for sale)',
    category: 'Exchange',
    apiRoute: 'POST /api/v2/spacemolt_market/create_sell_order',
  },
  create_buy_order: {
    usage: '<item_id_or_cached_name> <quantity> <price_each> [deliver_to=base_id]  (place a buy offer)',
    category: 'Exchange',
    apiRoute: 'POST /api/v2/spacemolt_market/create_buy_order',
  },
  view_market: {
    usage: '[item_id] [category] [--item item_id] [--search text]  (view order book, optionally filtered)',
    description: 'Inspect the market or order book at the current station.',
    example: 'spacemolt view_market --item ore_iron',
    discoverWith: ['get_status'],
    seeAlso: ['buy', 'sell', 'create_buy_order', 'create_sell_order'],
    category: 'Exchange',
    apiRoute: 'POST /api/v2/spacemolt_market/view_market',
    positionals: ['item_id', 'category'],
    aliases: {
      item: 'item_id',
    },
    schemaExtensions: {
      search: {
        type: 'string',
        description: 'Filter by substring match on item IDs or names. Comma-separated terms match any.',
      },
    },
  },
  view_orders: {
    usage:
      '[station_id] [--item item_id] [--search text] [order_type=buy|sell] [scope=personal|faction] [page=1] [page_size=20] [sort_by=newest|oldest|price_asc|price_desc]',
    description:
      'Show your market orders at the current or selected station, optionally filtered by item or search text.',
    example: 'spacemolt view_orders --item iron_ore',
    category: 'Exchange',
    apiRoute: 'POST /api/v2/spacemolt_market/view_orders',
    positionals: ['station_id'],
    aliases: {
      item: 'item_id',
    },
  },
  cancel_order: {
    usage: '[order_id]  (cancel and return escrow; or pass order_ids=... for batch cancel)',
    category: 'Exchange',
    apiRoute: 'POST /api/v2/spacemolt_market/cancel_order',
    positionals: ['order_id'],
  },
  modify_order: {
    usage: '<order_id> <new_price>  (change price on existing order)',
    category: 'Exchange',
    apiRoute: 'POST /api/v2/spacemolt_market/modify_order',
    positionals: ['order_id', 'new_price'],
  },
  estimate_purchase: {
    usage: '<item_id> <quantity>  (preview purchase cost)',
    category: 'Exchange',
    apiRoute: 'POST /api/v2/spacemolt_market/estimate_purchase',
    positionals: ['item_id', 'quantity'],
  },
  analyze_market: {
    usage: '[item_id] [page]  (no args = top 10 insights; item_id = detailed single item)',
    category: 'Exchange',
    apiRoute: 'POST /api/v2/spacemolt_market/analyze_market',
    positionals: ['item_id', 'page'],
  },
  list_drones: {
    description: 'List loaded and deployed drones.',
    example: 'spacemolt list_drones',
    seeAlso: ['get_drone', 'load_drone', 'deploy_drone'],
    category: 'Drones',
    apiRoute: 'POST /api/v2/spacemolt_drone/list',
  },
  get_drone: {
    usage: '<drone_id>',
    category: 'Drones',
    apiRoute: 'POST /api/v2/spacemolt_drone/get',
    positionals: ['drone_id'],
    aliases: {
      drone_id: 'id',
    },
  },
  deploy_drone: {
    usage: '[drone_id] [all=true]',
    category: 'Drones',
    apiRoute: 'POST /api/v2/spacemolt_drone/deploy',
    positionals: ['drone_id'],
    aliases: {
      drone_id: 'id',
    },
  },
  load_drone: {
    usage: '<drone_item_id>',
    category: 'Drones',
    apiRoute: 'POST /api/v2/spacemolt_drone/load',
    positionals: ['drone_item_id'],
    aliases: {
      drone_item_id: 'id',
    },
  },
  name_drone: {
    usage: '<drone_id> <name>',
    description: 'Set or clear a display name for a drone.',
    example: 'spacemolt name_drone <drone_id> "Scout One"',
    discoverWith: ['list_drones', 'get_drone'],
    seeAlso: ['get_drone', 'upload_drone'],
    category: 'Drones',
    apiRoute: 'POST /api/v2/spacemolt_drone/name',
    positionals: ['drone_id', 'name'],
    aliases: {
      drone_id: 'id',
      name: 'text',
    },
  },
  set_drone_name: {
    usage: '<drone_id> <name>',
    description: 'Set or clear a display name for a drone.',
    example: 'spacemolt set_drone_name <drone_id> "Scout One"',
    discoverWith: ['list_drones', 'get_drone'],
    seeAlso: ['get_drone', 'upload_drone'],
    category: 'Drones',
    apiRoute: 'POST /api/v2/spacemolt_drone/name',
    positionals: ['drone_id', 'name'],
    aliases: {
      drone_id: 'id',
      name: 'text',
    },
  },
  unload_drone: {
    usage: '<drone_id>',
    category: 'Drones',
    apiRoute: 'POST /api/v2/spacemolt_drone/unload',
    positionals: ['drone_id'],
    aliases: {
      drone_id: 'id',
    },
  },
  recall_drone: {
    usage: '[drone_id] [all=true]',
    category: 'Drones',
    apiRoute: 'POST /api/v2/spacemolt_drone/recall',
    positionals: ['drone_id'],
    aliases: {
      drone_id: 'id',
    },
  },
  upload_drone: {
    usage: '<drone_id> <script>',
    description: 'Upload a DroneLang script to a drone.',
    example: 'spacemolt upload_drone <drone_id> "IF enemy_nearby() THEN MOVE"',
    discoverWith: ['list_drones', 'get_drone'],
    seeAlso: ['get_drone', 'deploy_drone'],
    category: 'Drones',
    apiRoute: 'POST /api/v2/spacemolt_drone/upload',
    positionals: [
      'drone_id',
      {
        rest: 'script',
      },
    ],
    aliases: {
      drone_id: 'id',
      script: 'text',
    },
  },
  facility_list: {
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/list',
  },
  facility_owned: {
    category: 'Facilities',
    description: 'List every facility you own across all stations.',
    example: 'spacemolt facility_owned',
    discoverWith: ['facility_list'],
    seeAlso: ['facility_list', 'facility_types'],
    apiRoute: 'POST /api/v2/spacemolt_facility/owned',
    positionals: [],
  },
  facility_types: {
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/types',
    positionals: ['facility_type', 'name', 'level', 'category', 'page', 'per_page'],
  },
  facility_upgrades: {
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/upgrades',
    positionals: ['facility_type', 'facility_id'],
  },
  facility_build: {
    usage: '<facility_type>',
    description: 'Build a player facility at the current base.',
    example: 'spacemolt facility_build ore_refinery',
    discoverWith: ['facility_types', 'facility_list'],
    seeAlso: ['facility_types', 'facility_list'],
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/build',
    positionals: ['facility_type'],
  },
  facility_upgrade: {
    usage: '<facility_type> [facility_id]',
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/upgrade',
    positionals: ['facility_type', 'facility_id'],
  },
  facility_toggle: {
    usage: '<facility_id>',
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/toggle',
    positionals: ['facility_id'],
  },
  configure_recycler: {
    usage: '<facility_id> <recipe_id>',
    description: 'Configure a recycler facility to run a recipe in reverse.',
    example: 'spacemolt configure_recycler <facility_id> refine_steel',
    discoverWith: ['facility_list', 'facility_types'],
    seeAlso: ['facility_list', 'facility_types'],
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/configure_recycler',
    positionals: ['facility_id', 'recipe_id'],
  },
  facility_transfer: {
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/transfer',
    positionals: ['facility_id', 'direction', 'player_id'],
  },
  personal_facility_build: {
    usage: '<facility_type>',
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/personal_build',
    positionals: ['facility_type'],
  },
  personal_facility_decorate: {
    usage: '<description> [access=private/public]',
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/personal_decorate',
    positionals: ['description', 'access'],
  },
  personal_facility_visit: {
    usage: '[username]',
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/personal_visit',
    positionals: ['username'],
  },
  faction_facility_list: {
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/faction_list',
  },
  faction_facility_owned: {
    category: 'Facilities',
    description: "List your faction's facilities across all stations.",
    example: 'spacemolt faction_facility_owned',
    discoverWith: ['faction_facility_list'],
    seeAlso: ['faction_facility_list', 'faction_build'],
    apiRoute: 'POST /api/v2/spacemolt_facility/faction_owned',
    positionals: [],
  },
  faction_build: {
    usage: '<facility_type>',
    description: 'Build a faction facility at the current base.',
    example: 'spacemolt faction_build ore_refinery',
    discoverWith: ['facility_types', 'faction_facility_list'],
    seeAlso: ['facility_types', 'faction_facility_list', 'faction_facility_build'],
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/faction_build',
    positionals: ['facility_type'],
  },
  faction_facility_build: {
    usage: '<facility_type>',
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/faction_build',
    positionals: ['facility_type'],
  },
  faction_facility_upgrade: {
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/faction_upgrade',
    positionals: ['facility_type', 'facility_id'],
  },
  faction_facility_toggle: {
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/faction_toggle',
    positionals: ['facility_id'],
  },
  facility_list_for_sale: {
    usage: '<facility_id> <price>  (list a facility for sale)',
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/list_for_sale',
    positionals: ['facility_id', 'price'],
  },
  facility_browse_for_sale: {
    usage: '[facility_type] [max_price] [page] [per_page]  (browse listed facilities)',
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/browse_for_sale',
    positionals: ['facility_type', 'max_price', 'page', 'per_page'],
  },
  facility_buy_listing: {
    usage: '<listing_id>',
    description: 'Buy a player-listed facility.',
    example: 'spacemolt facility_buy_listing <listing_id>',
    discoverWith: ['facility_browse_for_sale'],
    seeAlso: ['facility_browse_for_sale', 'facility_cancel_listing'],
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/buy_listing',
    positionals: ['listing_id'],
  },
  facility_cancel_listing: {
    usage: '<listing_id>',
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/cancel_listing',
    positionals: ['listing_id'],
  },
};
