import type { CommandOverride } from './commands';

export const CORE_COMMAND_OVERRIDES: Record<string, CommandOverride> = {
  register: {
    usage: '<username> <empire> <registration_code>  (get code from spacemolt.com/dashboard)',
    description: 'Create a player using a dashboard registration code.',
    example: 'spacemolt register myname solarian YOUR_REGISTRATION_CODE',
    seeAlso: ['login', 'get_status'],
    category: 'Authentication',
    apiRoute: 'POST /api/v2/spacemolt_auth/register',
    positionals: ['username', 'empire', 'registration_code'],
  },
  login: {
    usage: '<username> <password>',
    description: 'Authenticate and save credentials in the local session file.',
    example: 'spacemolt login myname <password>',
    seeAlso: ['session', 'get_status'],
    category: 'Authentication',
    apiRoute: 'POST /api/v2/spacemolt_auth/login',
    positionals: ['username', 'password'],
  },
  login_token: {
    usage: '<token>',
    description: 'Authenticate with a short-lived login token from the play client.',
    category: 'Authentication',
    apiRoute: 'POST /api/v2/spacemolt_auth/login_token',
    positionals: ['token'],
  },
  logout: {
    usage: '',
    description: 'Clear saved credentials from the local session file.',
    example: 'spacemolt logout',
    seeAlso: ['login', 'session'],
    category: 'Authentication',
    apiRoute: 'POST /api/v2/spacemolt_auth/logout',
  },
  claim: {
    usage: '<registration_code>  (link existing player to your account)',
    category: 'Authentication',
    apiRoute: 'POST /api/v2/spacemolt_auth/claim',
    positionals: ['registration_code'],
  },
  travel: {
    usage: '<poi_id_or_cached_name>  (use get_system to cache POIs)',
    description: 'Move to a POI in the current system. Use get_system first to cache valid POI IDs and names.',
    example: 'spacemolt travel earth',
    discoverWith: ['get_system', 'get_status'],
    seeAlso: ['get_system', 'get_poi', 'jump'],
    category: 'Navigation',
    apiRoute: 'POST /api/v2/spacemolt/travel',
    positionals: ['target_poi'],
    aliases: {
      target_poi: 'id',
    },
  },
  jump: {
    usage: '<system_id_or_bearing>  (connected system ID/name, or numeric Pathfinder bearing)',
    description:
      'Move to a connected system, or plot a numeric compass bearing with a Pathfinder Drive. Use get_system for lane jumps and get_map/get_location for coordinates.',
    example: 'spacemolt jump 90',
    discoverWith: ['get_system', 'get_map', 'get_location', 'find_route'],
    seeAlso: ['get_system', 'get_map', 'get_location', 'travel', 'refuel'],
    category: 'Navigation',
    apiRoute: 'POST /api/v2/spacemolt/jump',
    positionals: ['target_system'],
    aliases: {
      target_system: 'id',
    },
  },
  dock: {
    usage: '',
    description: 'Dock at the current station or base.',
    example: 'spacemolt dock',
    discoverWith: ['get_status', 'get_poi'],
    seeAlso: ['undock', 'get_status', 'view_market'],
    category: 'Navigation',
    apiRoute: 'POST /api/v2/spacemolt/dock',
  },
  undock: {
    usage: '',
    description: 'Leave the current station or base.',
    example: 'spacemolt undock',
    discoverWith: ['get_status'],
    seeAlso: ['dock', 'travel', 'get_system'],
    category: 'Navigation',
    apiRoute: 'POST /api/v2/spacemolt/undock',
  },
  search_systems: {
    usage: '<query>  (case-insensitive partial match on system names)',
    category: 'Navigation',
    apiRoute: 'POST /api/v2/spacemolt/search_systems',
    positionals: ['query'],
    aliases: {
      query: 'text',
    },
  },
  find_route: {
    usage: '<system_id>  (find shortest route from current system)',
    category: 'Navigation',
    apiRoute: 'POST /api/v2/spacemolt/find_route',
    positionals: ['target_system'],
    aliases: {
      target_system: 'id',
    },
  },
  mine: {
    description: 'Mine resources at an asteroid POI. Use get_poi to confirm the current POI has resources.',
    example: 'spacemolt mine',
    discoverWith: ['get_status', 'get_poi'],
    seeAlso: ['get_cargo', 'sell'],
    category: 'Mining',
    apiRoute: 'POST /api/v2/spacemolt/mine',
  },
  attack: {
    usage: '<player_id>  (use get_nearby to see players)',
    description: 'Attack a nearby target. Use get_nearby first for target IDs.',
    example: 'spacemolt attack <player_id>',
    discoverWith: ['get_nearby', 'get_status'],
    seeAlso: ['scan', 'get_battle_status'],
    category: 'Combat',
    apiRoute: 'POST /api/v2/spacemolt/attack',
    positionals: ['target_id'],
    aliases: {
      target_id: 'id',
    },
  },
  scan: {
    usage: '[target_id]  (omit target_id to sweep your location for cloaked ships)',
    description: 'Scan a nearby player or NPC for ship details. Omit the target to run an area sensor sweep.',
    example: 'spacemolt scan',
    discoverWith: ['get_nearby'],
    seeAlso: ['attack', 'get_ship'],
    category: 'Combat',
    apiRoute: 'POST /api/v2/spacemolt/scan',
    positionals: ['target_id'],
    aliases: {
      target_id: 'id',
    },
  },
  cloak: {
    category: 'Combat',
    apiRoute: 'POST /api/v2/spacemolt/cloak',
    positionals: ['enable'],
  },
  self_destruct: {
    usage: '(destroy ship, create wreck, respawn at home base)',
    category: 'Combat',
    apiRoute: 'POST /api/v2/spacemolt/self_destruct',
  },
  sell: {
    usage: '<item_id_or_cached_name> <quantity> [auto_list=true]  (use get_cargo to cache items)',
    description: 'Sell cargo items. Use get_cargo first for item IDs, cached names, and available quantities.',
    example: 'spacemolt sell iron 50',
    discoverWith: ['get_cargo', 'view_market'],
    seeAlso: ['get_cargo', 'view_market'],
    category: 'Trading',
    apiRoute: 'POST /api/v2/spacemolt/sell',
    positionals: ['item_id', 'quantity', 'auto_list'],
  },
  buy: {
    usage:
      '<item_id_or_cached_name> [quantity] [auto_list=true] [delivery=cargo|storage]  (defaults to station storage; use view_market to cache items)',
    description:
      'Buy an item from the current market. Purchases deliver to station storage by default; pass delivery=cargo to use ship cargo.',
    example: 'spacemolt buy fuel 10 delivery=cargo',
    discoverWith: ['view_market', 'get_status'],
    seeAlso: ['view_market', 'storage', 'get_cargo'],
    category: 'Trading',
    apiRoute: 'POST /api/v2/spacemolt/buy',
    positionals: ['item_id', 'quantity', 'auto_list', 'delivery'],
    defaults: {
      deliver_to: 'storage',
    },
    aliases: {
      delivery: 'deliver_to',
    },
    schemaExtensions: {
      deliver_to: {
        type: 'string',
        enum: ['cargo', 'storage'],
        description:
          'Where to deliver purchased items. CLI default is storage (station storage, useful for large buys); use delivery=cargo to put items in ship cargo.',
      },
    },
  },
  trade_offer: {
    usage: '<player_id> [credits=N] [items=...]  (use get_trades to see pending offers)',
    category: 'P2P Trading',
    apiRoute: 'POST /api/v2/spacemolt_transfer/trade_offer',
    positionals: ['target_id', 'credits'],
    aliases: {
      target_id: 'target',
      credits: 'offer_credits',
    },
  },
  trade_accept: {
    usage: '<trade_id>  (use get_trades to see offers)',
    category: 'P2P Trading',
    apiRoute: 'POST /api/v2/spacemolt_transfer/trade_accept',
    positionals: ['trade_id'],
  },
  trade_decline: {
    usage: '<trade_id>',
    category: 'P2P Trading',
    apiRoute: 'POST /api/v2/spacemolt_transfer/trade_decline',
    positionals: ['trade_id'],
  },
  trade_cancel: {
    usage: '<trade_id>',
    category: 'P2P Trading',
    apiRoute: 'POST /api/v2/spacemolt_transfer/trade_cancel',
    positionals: ['trade_id'],
  },
  loot_wreck: {
    usage: '<wreck_id> <item_id> [quantity]  (use get_wrecks to see wrecks)',
    category: 'Wrecks',
    apiRoute: 'POST /api/v2/spacemolt_salvage/loot',
    positionals: ['wreck_id', 'item_id', 'quantity'],
  },
  salvage_wreck: {
    usage: '<wreck_id>',
    category: 'Wrecks',
    apiRoute: 'POST /api/v2/spacemolt_salvage/salvage',
    positionals: ['wreck_id'],
  },
  name_ship: {
    usage: '<name>  (set ship name, empty to clear)',
    category: 'Ship management',
    apiRoute: 'POST /api/v2/spacemolt_ship/rename_ship',
    positionals: ['name'],
  },
  sell_ship: {
    usage: '<ship_id>  (sell stored ship at 50% base value)',
    category: 'Ship management',
    apiRoute: 'POST /api/v2/spacemolt_ship/sell_ship',
    positionals: ['ship_id'],
    aliases: {
      ship_id: 'id',
    },
  },
  list_ships: {
    usage: '(all owned ships with locations)',
    category: 'Ship management',
    apiRoute: 'POST /api/v2/spacemolt_ship/list_ships',
  },
  switch_ship: {
    usage: '<ship_id>  (swap active ship, cargo moved to station storage)',
    category: 'Ship management',
    apiRoute: 'POST /api/v2/spacemolt_ship/switch_ship',
    positionals: ['ship_id'],
    aliases: {
      ship_id: 'id',
    },
  },
  install_mod: {
    usage: '<module_id>  (module must be in cargo, use get_cargo to see)',
    category: 'Ship management',
    apiRoute: 'POST /api/v2/spacemolt/install_mod',
    positionals: ['module_id'],
    aliases: {
      module_id: 'id',
    },
  },
  uninstall_mod: {
    usage: '<module_id>  (use get_ship to see installed modules)',
    category: 'Ship management',
    apiRoute: 'POST /api/v2/spacemolt/uninstall_mod',
    positionals: ['module_id'],
    aliases: {
      module_id: 'id',
    },
  },
  repair_module: {
    usage: '<module_id>  (use get_ship to see modules, requires Repair Kit in cargo)',
    category: 'Ship management',
    apiRoute: 'POST /api/v2/spacemolt/repair_module',
    positionals: ['module_id'],
    aliases: {
      module_id: 'id',
    },
  },
  refit_ship: {
    usage: '(reset ship to class specs, strips modules)',
    category: 'Ship management',
    apiRoute: 'POST /api/v2/spacemolt_ship/refit_ship',
  },
  scrap_ship: {
    usage: '<ship_id>  (permanently destroy a stored ship)',
    category: 'Ship management',
    apiRoute: 'POST /api/v2/spacemolt_ship/scrap_ship',
    positionals: ['ship_id'],
    aliases: {
      ship_id: 'id',
    },
  },
  refuel: {
    usage:
      '[fuel_cell_id [cell_count] | target=player|fleet quantity=units]  (station credit refuel fills to full; quantity applies only to fuel cells and transfers)',
    description:
      'Refuel from a station, fuel cell, or tanker ship. A station credit refuel fills to full and ignores quantity.',
    example: 'spacemolt refuel',
    discoverWith: ['get_status', 'get_cargo'],
    seeAlso: ['dock', 'get_status'],
    category: 'Ship management',
    apiRoute: 'POST /api/v2/spacemolt/refuel',
    positionals: ['id', 'quantity', 'target'],
  },
  repair: {
    usage: '[quantity]',
    description: 'Repair hull damage using station services, repair kits, or repair equipment.',
    example: 'spacemolt repair',
    discoverWith: ['get_status', 'get_ship'],
    seeAlso: ['refuel', 'dock', 'get_ship'],
    category: 'Ship management',
    apiRoute: 'POST /api/v2/spacemolt/repair',
  },
  use_item: {
    usage: '<item_id> [quantity]  (consumables: repair_kit, shield_cell, emergency_warp, etc.)',
    category: 'Ship management',
    apiRoute: 'POST /api/v2/spacemolt/use_item',
    positionals: ['item_id', 'quantity'],
  },
  set_home_base: {
    usage: '<base_id>  (set respawn point, requires cloning service)',
    category: 'Insurance',
    apiRoute: 'POST /api/v2/spacemolt_salvage/set_home',
    positionals: ['base_id'],
  },
  prepay_tax: {
    usage: '<amount>',
    description: 'Move wallet credits into the prepaid pool for your next personal tax assessment.',
    example: 'spacemolt prepay_tax 5000',
    seeAlso: ['get_tax_estimate', 'get_empire_info'],
    category: 'Taxes',
    apiRoute: 'POST /api/v2/spacemolt/prepay_tax',
    positionals: ['amount'],
  },
  craft: {
    usage:
      '[recipe_id] [quantity] [action=queue] [job_id=<id>|job_ids=JSON] [dry_run=true] [preset=fast|cheap|workshop] [jobs=JSON]  (queues or cancels production from station storage)',
    description:
      'Queue crafting work or cancel queued jobs; inputs are escrowed from station storage and output returns to station storage.',
    example: 'spacemolt craft basic_iron_smelting 50 dry_run=true',
    discoverWith: ['catalog', 'storage', 'get_status'],
    seeAlso: ['recycle', 'catalog', 'storage', 'get_guide'],
    category: 'Crafting',
    apiRoute: 'POST /api/v2/spacemolt/craft',
    positionals: ['recipe_id', 'quantity'],
    schemaExtensions: {
      action: {
        type: 'string',
        enum: ['queue'],
        description: 'Use action=queue, or omit recipe_id, to view queued crafting work without starting a new job.',
      },
      deliver_to: {
        type: 'string',
        enum: ['storage', 'faction'],
        description: "Output destination: 'storage' (default) or 'faction'. Crafting never delivers to cargo.",
      },
      dry_run: {
        type: 'boolean',
        description: 'Return a cost, routing, and ETA quote without queuing work or spending escrow.',
      },
      facility_id: {
        type: 'string',
        description: 'Route the job to a specific owned or public rental facility.',
      },
      id: {
        type: 'string',
        description: 'Recipe ID to craft. Inputs are escrowed from station storage when the job is queued.',
      },
      jobs: {
        type: 'array',
        description:
          'Bulk mode JSON array of jobs, each with recipe_id, quantity, and optional facility_id, preset, or deliver_to.',
      },
      job_id: {
        type: 'string',
        description: 'Queued crafting job ID to cancel; use action=queue to list job IDs.',
      },
      job_ids: {
        type: 'array',
        description: 'Queued crafting job IDs to cancel in bulk; use action=queue to list job IDs.',
      },
      preset: {
        type: 'string',
        enum: ['fast', 'cheap', 'workshop'],
        description:
          "Auto-routing preset: 'fast' for quickest, 'cheap' for lowest fee, or 'workshop' to force hand-crafting.",
      },
      quantity: {
        type: 'integer',
        description: 'Number of output items to make. The server rounds up to whole production runs.',
      },
    },
  },
  recycle: {
    usage:
      '<recipe_id> [quantity] [job_id=<id>|job_ids=JSON] [dry_run=true] [jobs=JSON]  (queues or cancels lossy reverse production)',
    description:
      "Queue a recycling job or cancel queued jobs; recycling consumes a recipe's outputs from station storage and returns a lossy fraction of its inputs.",
    example: 'spacemolt recycle basic_iron_smelting 20 dry_run=true',
    discoverWith: ['catalog', 'facility_list', 'storage'],
    seeAlso: ['craft', 'catalog', 'storage', 'get_guide'],
    category: 'Crafting',
    apiRoute: 'POST /api/v2/spacemolt/recycle',
    positionals: ['recipe_id', 'quantity'],
    schemaExtensions: {
      deliver_to: {
        type: 'string',
        enum: ['storage', 'faction'],
        description: "Output destination for recovered inputs: 'storage' (default) or 'faction'.",
      },
      dry_run: {
        type: 'boolean',
        description: 'Return a feedstock, fee, venue, and ETA quote without queuing recycling work.',
      },
      facility_id: {
        type: 'string',
        description: 'Route the job to a specific recycler facility.',
      },
      id: {
        type: 'string',
        description: "Recipe ID to recycle. The recycler consumes the recipe's output items from station storage.",
      },
      jobs: {
        type: 'array',
        description:
          'Bulk mode JSON array of recycling jobs, each with recipe_id, quantity, and optional facility_id or deliver_to.',
      },
      job_id: {
        type: 'string',
        description:
          'Queued recycling job ID to cancel; use action=queue on craft or facility job list output to find IDs.',
      },
      job_ids: {
        type: 'array',
        description:
          'Queued recycling job IDs to cancel in bulk; use action=queue on craft or facility job list output to find IDs.',
      },
      quantity: {
        type: 'integer',
        description:
          "Number of the recipe's output items to feed into the recycler, rounded up to whole recycling runs.",
      },
    },
  },
};
