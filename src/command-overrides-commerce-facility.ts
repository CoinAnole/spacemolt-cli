import type { CommandOverride } from './commands';

const STORAGE_TRANSFER_SOURCE_DESCRIPTION =
  "Optional source for direct transfers. For the common paths, omit source and target: deposit moves cargo->personal storage, while withdraw moves personal storage->cargo. Use 'storage' with target=faction or a player name to transfer from personal storage, or 'faction' with target=self to transfer faction->personal; use source=faction target=faction to move items between faction compartments (both faction withdrawals require manage_treasury).";

const STORAGE_BUCKET_DESCRIPTION =
  'Optional (target=faction only): a Storage Extension bucket by name or id to deposit into / withdraw from instead of the main store. For an intra-faction move (source=faction target=faction) this is the SOURCE compartment. Empty means the main store. See bucket names via: spacemolt storage view target=faction.';

const STORAGE_DEST_BUCKET_DESCRIPTION =
  "Optional destination compartment by name or id for an intra-faction move (source=faction target=faction): items move from 'bucket' into 'dest_bucket'. Leave either empty to mean the main store (covers main↔bucket and bucket↔bucket). Requires manage_treasury.";

const FACTION_BUILD_BUCKET_DESCRIPTION =
  "For 'faction_build'/'faction_upgrade': a Storage Extension bucket (name or id) to source build/upgrade MATERIALS from, instead of the faction main store. Ship cargo backfills either way.";

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
  shipping_list: {
    usage:
      '[eligible_as=player|faction] [filter_destination=...] [filter_service_level=standard|priority] [filter_shipper=...] [sort=reward|distance|age] [page=...] [per_page=...]',
    description:
      'List freight contracts you can accept from the current station. You must be docked, and only contracts posted at that station are shown.',
    example:
      'spacemolt shipping_list filter_destination=sirius_observatory_station filter_service_level=priority sort=distance',
    discoverWith: ['get_status'],
    seeAlso: ['shipping_quote', 'shipping_accept', 'shipping_profile'],
    category: 'Missions',
    apiRoute: 'POST /api/v2/spacemolt_shipping/list',
  },
  shipping_post: {
    usage: '<package_id> <destination_base_id> <base_reward> [speed_bonus=...]',
    description: 'Post a sealed-package freight contract with a carrier reward you set.',
    example: 'spacemolt shipping_post package-1 nova-station 5000 speed_bonus=500',
    category: 'Missions',
    apiRoute: 'POST /api/v2/spacemolt_shipping/post',
    positionals: ['package_id', 'destination_base_id', 'base_reward'],
    required: ['package_id', 'destination_base_id', 'base_reward'],
    schemaExtensions: {
      base_reward: { minimum: 1 },
    },
  },
  jettison: {
    usage: '[item_id] [quantity] [items=JSON]  (bulk: pass items=[{item_id,quantity}, ...] and omit item_id/quantity)',
    description: 'Jettison one cargo item, or several cargo item types with items=JSON, into one container.',
    example: 'spacemolt jettison items=\'[{"item_id":"iron_ore","quantity":50}]\'',
    category: 'Cargo',
    apiRoute: 'POST /api/v2/spacemolt/jettison',
    positionals: ['item_id', 'quantity', 'items'],
  },
  storage_view: {
    usage: '[station_id] [target=self|faction] [--search text] [--item id] [--items id,id]',
    description:
      'View personal or faction station storage. Optional station_id views personal storage at a remote station without docking.',
    example: 'spacemolt storage_view target=faction',
    discoverWith: ['get_status', 'get_cargo'],
    seeAlso: ['storage_deposit', 'storage_withdraw', 'get_cargo'],
    category: 'Station storage',
    apiRoute: 'POST /api/v2/spacemolt_storage/view',
    positionals: ['station_id', 'target'],
    aliases: { item: 'item_id' },
    schemaExtensions: {
      search: {
        type: 'string',
        description:
          'Client-side search across item IDs and names in text, JSON, and structured output. Comma-separated terms match any.',
      },
      items: {
        type: 'string',
        description:
          'Client-side comma-separated exact item ID filter for view output (not sent to the server). Not a bulk transfer array.',
      },
      item_id: {
        type: 'string',
        description: 'Client-side exact item ID filter for view output (not sent to the server).',
      },
      station_id: {
        type: 'string',
        description: 'Optional station ID; view personal storage at a remote station without docking.',
      },
    },
    clientOnlyFields: ['search', 'items', 'item_id'],
  },
  storage_deposit: {
    usage:
      '[item_id] [quantity] [target=self|faction|player] [source=cargo|storage|faction] [bucket=…] [dest_bucket=…] [message=…] [items=JSON] [credits=…]  (item_id/quantity required unless items=JSON; ship tow: <ship_id> target=self)',
    description:
      'Deposit cargo into station/faction storage, gift items/credits/ships to players, move between faction compartments, or attach a tow line to one of your own ships of equal or smaller class scale. Plain deposit moves cargo→personal storage when source/target are omitted. With a tow rig fitted, pass a ship instance UUID and target=self while docked at the same station as that ship (class scale must not be larger than your active ship; same scale is allowed) to tow it; you can tow only one wreck or ship at a time. Gift a ship to a player with target=<player_name> instead.',
    example:
      'spacemolt storage_deposit ore_iron 50 target=PlayerName source=storage message="Enjoy"; tow own ship: storage deposit <ship_id> target=self',
    discoverWith: ['get_status', 'get_cargo', 'list_ships'],
    seeAlso: ['storage_view', 'storage_withdraw', 'get_cargo', 'list_ships', 'tow_wreck', 'get_status'],
    category: 'Station storage',
    apiRoute: 'POST /api/v2/spacemolt_storage/deposit',
    positionals: ['item_id', 'quantity', 'target', 'source', 'bucket', 'dest_bucket', 'message', 'items', 'credits'],
    aliases: { item: 'item_id', recipient: 'target', ship_id: 'item_id' },
    schemaExtensions: {
      source: { type: 'string', description: STORAGE_TRANSFER_SOURCE_DESCRIPTION },
      bucket: { type: 'string', description: STORAGE_BUCKET_DESCRIPTION },
      dest_bucket: { type: 'string', description: STORAGE_DEST_BUCKET_DESCRIPTION },
      item_id: {
        type: 'string',
        description:
          'Item ID for normal transfers, credits for treasury/gift credit ops, or a ship instance UUID: target=self attaches a tow (tow rig required; docked; class scale equal to or smaller than your active ship), while target=<player_name> gifts the ship. Use list_ships for ship instance IDs; ship_id is an alias.',
      },
      credits: {
        type: 'integer',
        description: 'Credits to gift to another player.',
      },
    },
  },
  storage_withdraw: {
    usage:
      '[item_id] [quantity] [target=self|faction] [source=cargo|storage|faction] [bucket=…] [dest_bucket=…] [items=JSON]  (item_id/quantity required unless items=JSON; release tow: <ship_id>)',
    description:
      'Withdraw from personal or faction storage into cargo (default personal→cargo when source/target omitted), move faction compartments, or release a towed own ship. Pass the towed ship instance UUID as item_id while docked to drop the tow (distinct from release_tow, which only drops a towed wreck).',
    example: 'spacemolt storage_withdraw ore_iron 10; release tow: storage withdraw <ship_id>',
    discoverWith: ['get_status', 'storage_view', 'list_ships'],
    seeAlso: ['storage_view', 'storage_deposit', 'get_cargo', 'list_ships', 'release_tow', 'get_status'],
    category: 'Station storage',
    apiRoute: 'POST /api/v2/spacemolt_storage/withdraw',
    positionals: ['item_id', 'quantity', 'target', 'source', 'bucket', 'dest_bucket', 'items'],
    aliases: { item: 'item_id', recipient: 'target', ship_id: 'item_id' },
    schemaExtensions: {
      source: { type: 'string', description: STORAGE_TRANSFER_SOURCE_DESCRIPTION },
      bucket: { type: 'string', description: STORAGE_BUCKET_DESCRIPTION },
      dest_bucket: { type: 'string', description: STORAGE_DEST_BUCKET_DESCRIPTION },
      item_id: {
        type: 'string',
        description:
          'Item ID for normal transfers, credits for treasury ops, or a ship instance UUID to release a ship you are towing once docked. ship_id is an alias. Use release_tow for a towed wreck.',
      },
    },
  },
  storage_loot: {
    usage: '[wreck_id] [item_id] [quantity] [module_id=…]',
    description:
      'Loot items and modules from a wreck into cargo via spacemolt_storage/loot. Omit wreck_id while towing. Distinct from loot_wreck (spacemolt_salvage/loot).',
    example: 'spacemolt storage_loot',
    category: 'Wrecks',
    apiRoute: 'POST /api/v2/spacemolt_storage/loot',
    positionals: ['wreck_id', 'item_id', 'quantity', 'module_id'],
    seeAlso: ['loot_wreck', 'get_wrecks', 'storage_view'],
    discoverWith: ['get_wrecks', 'loot_wreck'],
    schemaExtensions: {
      wreck_id: {
        type: 'string',
        description: 'Optional wreck UUID. Omit to loot the wreck you are towing.',
      },
      module_id: {
        type: 'string',
        description: 'Optional module instance ID to loot.',
      },
    },
  },
  storage_jettison: {
    usage:
      '[item_id] [quantity] [items=JSON]  (item_id/quantity required unless items=JSON; same style as cargo jettison)',
    description:
      'Jettison items via spacemolt_storage/jettison. Prefer top-level jettison (spacemolt/jettison) for ordinary cargo dumps unless you specifically need this path.',
    example: 'spacemolt storage_jettison items=\'[{"item_id":"ore_iron","quantity":50}]\'',
    category: 'Cargo',
    apiRoute: 'POST /api/v2/spacemolt_storage/jettison',
    positionals: ['item_id', 'quantity', 'items'],
    seeAlso: ['jettison', 'get_cargo', 'storage_view'],
    discoverWith: ['get_cargo', 'jettison'],
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
  create_sell_order: {
    usage: '<item_id_or_cached_name> <quantity> <price_each>  (list items for sale)',
    category: 'Exchange',
    apiRoute: 'POST /api/v2/spacemolt_market/create_sell_order',
  },
  create_buy_order: {
    usage: '<item_id_or_cached_name> <quantity> <price_each> [deliver_to=cargo|storage]  (place a buy offer)',
    category: 'Exchange',
    apiRoute: 'POST /api/v2/spacemolt_market/create_buy_order',
  },
  view_market: {
    usage:
      '[item_id] [category] [company_store=true] [since=...] [--item item_id] [--search text]  (company_store shows only faction private listings; since=<tick> polls changes)',
    description: 'Inspect the public market, or pass company_store=true to show faction Company Store listings.',
    example: 'spacemolt view_market --item ore_iron',
    discoverWith: ['get_status'],
    seeAlso: ['buy', 'sell', 'create_buy_order', 'create_sell_order'],
    category: 'Exchange',
    apiRoute: 'POST /api/v2/spacemolt_market/view_market',
    positionals: ['item_id', 'category', 'company_store', 'since'],
    aliases: {
      item: 'item_id',
    },
    schemaExtensions: {
      search: {
        type: 'string',
        description:
          'Filter by substring match on item IDs or names. Comma-separated terms match any. (client-side filter, not sent to server)',
      },
    },
    clientOnlyFields: ['search'],
  },
  subscribe_market: {
    category: 'Exchange',
    apiRoute: 'POST /api/v2/spacemolt_market/subscribe_market',
    discoverWith: ['view_market'],
    seeAlso: ['view_market', 'unsubscribe_market'],
  },
  unsubscribe_market: {
    category: 'Exchange',
    apiRoute: 'POST /api/v2/spacemolt_market/unsubscribe_market',
    discoverWith: ['view_market'],
    seeAlso: ['view_market', 'subscribe_market'],
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
    usage: '<order_id> <price_each>  (change price; aliases new_price=... and price=... also accepted)',
    category: 'Exchange',
    apiRoute: 'POST /api/v2/spacemolt_market/modify_order',
    positionals: ['order_id', 'price_each'],
    aliases: { new_price: 'price_each', price: 'price_each' },
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
  get_base_cost: {
    description: 'Preview the cost and eligibility requirements to found a faction station here.',
    example: 'spacemolt get_base_cost',
    discoverWith: ['get_poi', 'get_system', 'get_faction_tax_estimate'],
    seeAlso: ['build_base', 'build_outpost', 'buy_ship_license'],
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/base_cost',
  },
  build_base: {
    usage: '<name> [public_access=true/false]',
    description: 'Found a faction-owned station at the current eligible lawless point of interest.',
    example: 'spacemolt build_base "Aurora Freeport" public_access=true',
    discoverWith: ['get_base_cost', 'get_poi'],
    seeAlso: ['get_base_cost', 'station_info', 'faction_build'],
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/found_station',
    positionals: ['name', 'public_access'],
  },
  build_outpost: {
    usage: '<name>',
    description: 'Deploy a lightweight faction outpost at the current eligible lawless point of interest.',
    example: 'spacemolt build_outpost "Aurora Cache"',
    discoverWith: ['get_base_cost', 'get_poi'],
    seeAlso: ['get_base_cost', 'station_info'],
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/deploy_outpost',
    positionals: ['name'],
  },
  buy_ship_license: {
    usage: '<ship_class>',
    description:
      "License a specific ship design so your faction can build it at its own stations. Cost is paid from the faction treasury and scales with the design's tier.",
    example: 'spacemolt buy_ship_license solarian_frigate',
    seeAlso: ['station_info', 'commission_ship', 'catalog'],
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/buy_ship_license',
    positionals: ['ship_class'],
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
  },
  facility_build: {
    usage: '<facility_type> [package_ids=id[,id...]]',
    description:
      'Build a facility at the current station; faction facility types are accepted by the server. Optionally source materials from sealed packages with package_ids (each package must contain exactly what is still needed of an item; storage/cargo still backfill any shortfall).',
    example: 'spacemolt facility_build ore_refinery package_ids=pkg-tier1,pkg-tier2',
    discoverWith: ['facility_types', 'facility_list'],
    seeAlso: ['facility_types', 'facility_list', 'facility_dismantle'],
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/build',
    positionals: ['facility_type'],
    arrayFields: ['package_ids'],
  },
  facility_dismantle: {
    usage: '<facility_id>',
    description:
      'Dismantle a facility you own, returning 100% of build and upgrade materials as labeled packages — one package per upgrade tier so you can rebuild in stages. Requires one cargo_container in storage per package produced (rejected up front if short). Use facility build package_ids=… to consume those packages on rebuild.',
    example: 'spacemolt facility_dismantle facility-1',
    discoverWith: ['facility_owned'],
    seeAlso: ['facility_owned', 'facility_build', 'facility_repair'],
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/dismantle',
    positionals: ['facility_id'],
  },
  facility_repair: {
    usage: '<facility_id>',
    description:
      'Repair a damaged facility after a station is wrecked (costs ~30% of original materials and build time).',
    example: 'spacemolt facility_repair facility-1',
    discoverWith: ['facility_list', 'facility_owned'],
    seeAlso: ['facility_list', 'facility_owned', 'facility_dismantle'],
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/repair',
    positionals: ['facility_id'],
  },
  facility_upgrade: {
    usage: '<facility_type> [facility_id] [package_ids=id[,id...]]',
    description:
      'Upgrade a facility you own. Optionally source materials from sealed packages with package_ids (each package must contain exactly what is still needed of an item; storage/cargo still backfill any shortfall).',
    example: 'spacemolt facility_upgrade ore_refinery facility-1 package_ids=pkg-tier2',
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/upgrade',
    positionals: ['facility_type', 'facility_id'],
    arrayFields: ['package_ids'],
  },
  facility_job_add: {
    usage:
      '<facility_id> <recipe_id> <quantity> [direction=forward|reverse] [deliver_to=storage|faction|faction:<bucket>] [source=storage|faction|faction:<bucket>|cargo] [items=JSON] [label=...] [package_id=...] [target=storage|cargo|faction|faction:<bucket>]',
    description:
      'Queue production work on a facility you own (or a rental/logistics bay you can use). Ordinary jobs use source and deliver_to to pull inputs from one store and deposit outputs to another; faction:<bucket> targets a Storage Extension bucket. Package recipes pack_package and unpack_package also accept items/label or package_id with source/target (cargo allowed; target defaults to source). Empire stations offer a station-owned T1 Package Logistics Bay for 1 credit per package operation.',
    example:
      'spacemolt facility_job_add facility-1 pack_package 1 items=\'[{"item_id":"iron_ore","quantity":20}]\' label=\'Smelter Feedstock\' source=cargo target=storage',
    discoverWith: ['facility_list', 'facility_owned', 'catalog', 'inspect'],
    seeAlso: [
      'facility_job_list',
      'facility_job_cancel',
      'facility_job_reorder',
      'facility_set_access',
      'craft',
      'inspect',
    ],
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/job_add',
    positionals: ['facility_id', 'recipe_id', 'quantity', 'direction', 'deliver_to', 'source'],
    schemaExtensions: {
      deliver_to: {
        type: 'string',
        description:
          "Ordinary job output destination: 'storage' (default), 'faction', or 'faction:<bucket name or id>'. For package jobs, deliver_to is accepted as an alias for target.",
      },
      direction: {
        type: 'string',
        enum: ['forward', 'reverse'],
        description:
          "Job direction for facility production: 'forward' crafts outputs, 'reverse' recycles recipe outputs.",
      },
      source: {
        type: 'string',
        description:
          "Input source: where inputs and credits are pulled from. Ordinary jobs: same values as deliver_to (defaults to deliver_to). Package jobs also accept 'cargo'.",
      },
      items: {
        type: 'array',
        description: 'For pack_package job_add: selected manifest items as JSON [{item_id, quantity}, ...].',
      },
      label: {
        type: 'string',
        description: 'For pack_package job_add: player-visible package label.',
      },
      package_id: {
        type: 'string',
        description: 'For unpack_package job_add: package instance ID to open.',
      },
      target: {
        type: 'string',
        description:
          'Package job_add output destination (storage, cargo, faction, or faction:<bucket>); defaults to source.',
      },
    },
  },
  facility_job_list: {
    usage: '<facility_id>',
    description: 'List queued production jobs on a facility you own.',
    example: 'spacemolt facility_job_list facility-1',
    discoverWith: ['facility_list', 'facility_owned'],
    seeAlso: ['facility_job_add', 'facility_job_cancel', 'facility_job_reorder'],
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/job_list',
    positionals: ['facility_id'],
  },
  facility_job_cancel: {
    usage: '<job_id|job_ids=JSON>',
    description: 'Cancel queued facility jobs and refund unspent escrow.',
    example: 'spacemolt facility_job_cancel job-1',
    discoverWith: ['facility_job_list'],
    seeAlso: ['facility_job_list', 'facility_job_add'],
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/job_cancel',
    positionals: ['job_id'],
    schemaExtensions: {
      job_ids: {
        type: 'array',
        description: 'Queued facility job IDs to cancel in bulk.',
      },
    },
  },
  facility_job_reorder: {
    usage: '<facility_id> <job_id> <position>',
    description: 'Move a queued facility job to a new 1-based position.',
    example: 'spacemolt facility_job_reorder facility-1 job-1 1',
    discoverWith: ['facility_job_list'],
    seeAlso: ['facility_job_list', 'facility_job_add'],
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/job_reorder',
    positionals: ['facility_id', 'job_id', 'position'],
  },
  facility_set_output_price: {
    usage: '<facility_id> <price>',
    description:
      'Set the rental price renters pay on a facility you own. Ordinary production: per-produced-unit price × output quantity per run, rounded to a whole credit. Logistics package bays: a once-per-package-operation fee for each pack_package or unpack_package job (not multiplied by item counts). Use 0 for free (renters cover only their inputs/labor). Fractional allowed (e.g. 0.25).',
    example: 'spacemolt facility_set_output_price facility-1 0.25',
    discoverWith: ['facility_list', 'facility_owned'],
    seeAlso: ['facility_set_access', 'facility_job_list', 'facility_job_add'],
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/set_output_price',
    positionals: ['facility_id', 'price'],
  },
  facility_set_name: {
    usage: '<facility_id> <custom_name>',
    description: 'Set or clear a custom name on a facility you own.',
    example: 'spacemolt facility_set_name facility-1 "Frontier Smelter"',
    discoverWith: ['facility_owned', 'facility_list'],
    seeAlso: ['facility_owned', 'facility_set_access', 'facility_set_output_price', 'facility_set_description'],
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/set_name',
    positionals: [
      'facility_id',
      {
        rest: 'custom_name',
      },
    ],
  },
  facility_set_description: {
    usage: '<facility_id> [description]  (omit or pass empty description to clear)',
    description:
      'Set or clear a custom description (up to 4000 characters) on any facility you or your faction owns, overriding default flavor text in facility list.',
    example: 'spacemolt facility_set_description facility-1 "The crew\'s favorite stop between jumps."',
    discoverWith: ['facility_owned', 'facility_list', 'faction_facility_list'],
    seeAlso: ['facility_set_name', 'facility_list', 'station_set_description'],
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/facility_set_description',
    positionals: [
      'facility_id',
      {
        rest: 'description',
      },
    ],
  },
  facility_set_access: {
    usage: '<facility_id> <access>',
    description: 'Open or close a facility for public rental capacity.',
    example: 'spacemolt facility_set_access facility-1 public',
    discoverWith: ['facility_list', 'facility_owned'],
    seeAlso: ['facility_set_output_price', 'facility_job_list'],
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/set_access',
    positionals: ['facility_id', 'access'],
  },
  facility_transfer: {
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/transfer',
    positionals: ['facility_id', 'direction', 'player_id'],
    schemaExtensions: {
      direction: {
        type: 'string',
        enum: ['to_faction', 'to_player'],
        description:
          "Transfer direction: 'to_faction' moves ownership to your faction, 'to_player' transfers to another player.",
      },
    },
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
    usage: '<facility_type> [bucket=name-or-id] [package_ids=id[,id...]]',
    description:
      'Build a faction facility at the current station. Pass bucket to source build materials from a Storage Extension bucket instead of the faction main store. Optionally source materials from sealed packages with package_ids (each package must contain exactly what is still needed of an item; storage/cargo still backfill any shortfall).',
    example: 'spacemolt faction_build ore_refinery bucket=BuildMat package_ids=pkg-tier1',
    discoverWith: ['facility_types', 'faction_facility_list'],
    seeAlso: ['facility_types', 'faction_facility_list', 'faction_dismantle'],
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/faction_build',
    positionals: ['facility_type', 'bucket'],
    arrayFields: ['package_ids'],
    schemaExtensions: {
      bucket: {
        type: 'string',
        description: FACTION_BUILD_BUCKET_DESCRIPTION,
      },
    },
  },
  faction_dismantle: {
    usage: '<facility_id>',
    description:
      'Dismantle a faction facility, returning 100% of build and upgrade materials to faction storage as labeled packages — one package per upgrade tier so the faction can rebuild in stages. Requires one cargo_container in faction storage per package produced (rejected up front if short). Use faction build package_ids=… to consume those packages on rebuild.',
    example: 'spacemolt faction_dismantle facility-1',
    discoverWith: ['faction_facility_owned'],
    seeAlso: ['faction_facility_owned', 'faction_build', 'facility_repair'],
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/faction_dismantle',
    positionals: ['facility_id'],
  },
  faction_facility_upgrade: {
    usage: '<facility_type> <facility_id> [bucket=name-or-id] [package_ids=id[,id...]]',
    description:
      'Upgrade a faction facility. Pass bucket to source materials from a Storage Extension bucket. Optionally source materials from sealed packages with package_ids (each package must contain exactly what is still needed of an item; storage/cargo still backfill any shortfall).',
    example: 'spacemolt faction_facility_upgrade ore_refinery facility-1 package_ids=pkg-tier2',
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/faction_upgrade',
    positionals: ['facility_type', 'facility_id', 'bucket'],
    arrayFields: ['package_ids'],
    schemaExtensions: {
      bucket: {
        type: 'string',
        description: FACTION_BUILD_BUCKET_DESCRIPTION,
      },
    },
  },
  facility_list_for_sale: {
    usage: '<facility_id> <price>  (list a facility for sale)',
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/list_for_sale',
    positionals: ['facility_id', 'price'],
  },
  facility_browse_for_sale: {
    usage: '[facility_type] [max_price]  (browse listed facilities)',
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/browse_for_sale',
    positionals: ['facility_type', 'max_price'],
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
  station_info: {
    description: "Show the current configuration for your faction's station or outpost.",
    example: 'spacemolt station_info',
    discoverWith: ['get_status', 'get_base'],
    seeAlso: ['build_base', 'build_outpost', 'station_set_name', 'station_set_auto_buy_fuel'],
    category: 'Station management',
    apiRoute: 'POST /api/v2/spacemolt_facility/station_info',
    positionals: [],
  },
  station_set_name: {
    usage: '<name>',
    description: 'Rename your faction station or outpost.',
    example: 'spacemolt station_set_name "Aurora Freeport"',
    discoverWith: ['station_info'],
    seeAlso: ['station_info', 'station_set_description'],
    category: 'Station management',
    apiRoute: 'POST /api/v2/spacemolt_facility/station_set_name',
    positionals: [
      {
        rest: 'name',
      },
    ],
  },
  station_set_description: {
    usage: '<description>',
    description: 'Set the description for your faction station or outpost.',
    example: 'spacemolt station_set_description "A lawless trade hub"',
    discoverWith: ['station_info'],
    seeAlso: ['station_info', 'station_set_name', 'facility_set_description'],
    category: 'Station management',
    apiRoute: 'POST /api/v2/spacemolt_facility/set_description',
    positionals: [
      {
        rest: 'description',
      },
    ],
  },
  station_set_public: {
    usage: '<true|false>',
    description: 'Control whether any pilot may dock at your faction station.',
    example: 'spacemolt station_set_public true',
    discoverWith: ['station_info'],
    seeAlso: ['station_info', 'station_allow_player', 'station_allow_faction'],
    category: 'Station management',
    apiRoute: 'POST /api/v2/spacemolt_facility/set_public',
    positionals: ['public'],
  },
  station_set_build_policy: {
    usage: '<allow_outsiders=true|false>',
    description: 'Control whether outsiders may build facilities at your faction station.',
    example: 'spacemolt station_set_build_policy false',
    discoverWith: ['station_info'],
    seeAlso: ['station_info', 'faction_build'],
    category: 'Station management',
    apiRoute: 'POST /api/v2/spacemolt_facility/set_build_policy',
    positionals: ['allow_outsiders'],
  },
  station_set_service_access: {
    usage: '<service> <public|allies|faction>',
    description: 'Set access for one station service such as market, refuel, repair, shipyard, crafting, or salvage.',
    example: 'spacemolt station_set_service_access market allies',
    discoverWith: ['station_info'],
    seeAlso: ['station_info', 'station_set_public'],
    category: 'Station management',
    apiRoute: 'POST /api/v2/spacemolt_facility/set_service_access',
    positionals: ['service', 'access'],
  },
  station_set_market_fee: {
    usage: '<fee_percent>',
    description: 'Set the market listing fee percentage for outside traders at your faction station.',
    example: 'spacemolt station_set_market_fee 5',
    discoverWith: ['station_info'],
    seeAlso: ['station_info', 'view_market'],
    category: 'Station management',
    apiRoute: 'POST /api/v2/spacemolt_facility/set_market_fee',
    positionals: ['fee_percent'],
  },
  station_set_refuel_price: {
    usage: '<price>',
    description: 'Set the per-unit refuel price charged to outside pilots at your faction station.',
    example: 'spacemolt station_set_refuel_price 3',
    discoverWith: ['station_info'],
    seeAlso: ['station_info', 'refuel', 'station_set_auto_buy_fuel'],
    category: 'Station management',
    apiRoute: 'POST /api/v2/spacemolt_facility/set_refuel_price',
    positionals: ['price'],
  },
  station_set_auto_buy_fuel: {
    usage: '<true|false>',
    description:
      'Opt the faction station into auto-buying fuel from docked pilots at live scarcity prices (treasury-funded; off by default).',
    example: 'spacemolt station_set_auto_buy_fuel true',
    discoverWith: ['station_info'],
    seeAlso: ['station_info', 'station_set_refuel_price', 'refuel'],
    category: 'Station management',
    apiRoute: 'POST /api/v2/spacemolt_facility/set_auto_buy_fuel',
    positionals: ['auto_buy_fuel'],
  },
  station_set_repair_price: {
    usage: '<price>',
    description: 'Set the per-hull-point repair price charged to outside pilots at your faction station.',
    example: 'spacemolt station_set_repair_price 4',
    discoverWith: ['station_info'],
    seeAlso: ['station_info', 'repair'],
    category: 'Station management',
    apiRoute: 'POST /api/v2/spacemolt_facility/set_repair_price',
    positionals: ['price'],
  },
  station_allow_player: {
    usage: '<player_id_or_username>',
    description: 'Allow a player to dock at your private faction station.',
    example: 'spacemolt station_allow_player <player_id_or_username>',
    discoverWith: ['station_info'],
    seeAlso: ['station_remove_player', 'station_ban', 'station_set_public'],
    category: 'Station management',
    apiRoute: 'POST /api/v2/spacemolt_facility/allow_player',
    positionals: ['player'],
  },
  station_remove_player: {
    usage: '<player_id_or_username>',
    description: "Remove a player from your faction station's dock allow list.",
    example: 'spacemolt station_remove_player <player_id_or_username>',
    discoverWith: ['station_info'],
    seeAlso: ['station_allow_player', 'station_set_public'],
    category: 'Station management',
    apiRoute: 'POST /api/v2/spacemolt_facility/remove_player',
    positionals: ['player'],
  },
  station_ban: {
    usage: '<player_id_or_username>',
    description: 'Ban a player from docking at your faction station.',
    example: 'spacemolt station_ban <player_id_or_username>',
    discoverWith: ['station_info'],
    seeAlso: ['station_unban', 'station_allow_player'],
    category: 'Station management',
    apiRoute: 'POST /api/v2/spacemolt_facility/ban',
    positionals: ['player'],
  },
  station_unban: {
    usage: '<player_id_or_username>',
    description: 'Remove a player ban from your faction station.',
    example: 'spacemolt station_unban <player_id_or_username>',
    discoverWith: ['station_info'],
    seeAlso: ['station_ban', 'station_allow_player'],
    category: 'Station management',
    apiRoute: 'POST /api/v2/spacemolt_facility/unban',
    positionals: ['player'],
  },
  station_allow_faction: {
    usage: '<faction_id>',
    description: 'Allow another faction to dock at your private faction station.',
    example: 'spacemolt station_allow_faction <faction_id>',
    discoverWith: ['station_info', 'faction_list'],
    seeAlso: ['station_remove_faction', 'station_set_public'],
    category: 'Station management',
    apiRoute: 'POST /api/v2/spacemolt_facility/allow_faction',
    positionals: ['faction'],
  },
  station_remove_faction: {
    usage: '<faction_id>',
    description: "Remove a faction from your faction station's dock allow list.",
    example: 'spacemolt station_remove_faction <faction_id>',
    discoverWith: ['station_info', 'faction_list'],
    seeAlso: ['station_allow_faction', 'station_set_public'],
    category: 'Station management',
    apiRoute: 'POST /api/v2/spacemolt_facility/remove_faction',
    positionals: ['faction'],
  },
};
