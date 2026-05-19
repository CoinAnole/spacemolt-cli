import { GENERATED_API_ROUTES, type GeneratedApiRoute } from './generated/api-commands.ts';

export type CommandArg = string | { rest: string };

export interface V2Route {
  tool: string;
  action: string;
  method?: 'GET' | 'POST';
  /** Static payload fields to inject (e.g., target=faction for faction storage commands) */
  defaults?: Record<string, string>;
}

export interface CommandFieldSchema {
  type?: string;
  enum?: string[];
  description?: string;
  positionalIndex?: number;
}

export interface CommandConfig {
  args?: CommandArg[];
  required?: string[];
  usage?: string;
  description?: string;
  example?: string;
  discoverWith?: string[];
  seeAlso?: string[];
  category?: string;
  aliases?: Record<string, string>;
  route: V2Route;
  schema?: Record<string, CommandFieldSchema>;
  /** Fields whose string values should be split into arrays (e.g., "a,b,c" => ["a","b","c"]) */
  arrayFields?: string[];
  /** Deprecated field names that should be renamed before sending */
  fieldRenames?: Record<string, string>;
}

export type LocalCommandConfig = Omit<CommandConfig, 'route' | 'schema'>;

export const SINGLE_ENDPOINT_TOOLS = new Set(['agentlogs', 'session', 'spacemolt_catalog']);

const GENERATED_API_ROUTE_KEYS = Object.keys(GENERATED_API_ROUTES);

export type CommandOverride = {
  apiRoute: string;
  positionals?: CommandArg[];
  usage?: string;
  description?: string;
  example?: string;
  discoverWith?: string[];
  seeAlso?: string[];
  category?: string;
  aliases?: Record<string, string>;
  defaults?: Record<string, string>;
  arrayFields?: string[];
  fieldRenames?: Record<string, string>;
};

export const ALLOWED_COMMAND_OVERRIDE_FIELDS = [
  'apiRoute',
  'positionals',
  'usage',
  'description',
  'example',
  'discoverWith',
  'seeAlso',
  'category',
  'aliases',
  'defaults',
  'arrayFields',
  'fieldRenames',
] as const;

export const COMMAND_OVERRIDES: Record<string, CommandOverride> = {
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
    category: 'Authentication',
    apiRoute: 'POST /api/v2/spacemolt_auth/login_token',
    positionals: ['token'],
  },
  logout: {
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
    usage: '<poi_id>  (use get_system to see POIs)',
    description: 'Move to a POI in the current system. Use get_system first to find valid POI IDs.',
    example: 'spacemolt travel sol_asteroid_belt',
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
    usage: '<system_id>  (use get_system to see connections)',
    description: 'Move to a connected system. Use get_system first to find connected system IDs.',
    example: 'spacemolt jump alpha_centauri',
    discoverWith: ['get_system', 'find_route'],
    seeAlso: ['get_system', 'travel', 'refuel'],
    category: 'Navigation',
    apiRoute: 'POST /api/v2/spacemolt/jump',
    positionals: ['target_system'],
    aliases: {
      target_system: 'id',
    },
  },
  dock: {
    category: 'Navigation',
    apiRoute: 'POST /api/v2/spacemolt/dock',
  },
  undock: {
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
    usage: '<player_id>',
    description: 'Scan a nearby player for ship and combat details.',
    example: 'spacemolt scan <player_id>',
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
    usage: '<item_id> <quantity> [auto_list=true]  (use get_cargo to see items)',
    description: 'Sell cargo items. Use get_cargo first for item IDs and available quantities.',
    example: 'spacemolt sell ore_iron 50',
    discoverWith: ['get_cargo', 'view_market'],
    seeAlso: ['get_cargo', 'view_market'],
    category: 'Trading',
    apiRoute: 'POST /api/v2/spacemolt/sell',
    positionals: ['item_id', 'quantity', 'auto_list'],
  },
  buy: {
    usage: '<item_id> [quantity] [auto_list=true] [deliver_to=base_id]  (use view_market to see order book)',
    description: 'Buy an item from the current market. Use view_market to inspect available listings.',
    example: 'spacemolt buy fuel 10',
    discoverWith: ['view_market', 'get_status'],
    seeAlso: ['view_market', 'get_cargo'],
    category: 'Trading',
    apiRoute: 'POST /api/v2/spacemolt/buy',
    positionals: ['item_id', 'quantity', 'auto_list', 'deliver_to'],
  },
  trade_offer: {
    usage: '<player_id> [credits=N] [items=...]  (use get_trades to see pending offers)',
    category: 'P2P Trading',
    apiRoute: 'POST /api/v2/spacemolt_transfer/trade_offer',
    positionals: ['target_id', 'credits'],
    aliases: {
      target_id: 'target',
    },
    fieldRenames: {
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
      '[id] [quantity] [target=player|fleet]  (station fuel uses dynamic reserve pricing; fuel cells can be selected by id)',
    description: 'Refuel from a station or fuel cell. Usually dock first, then run refuel.',
    example: 'spacemolt refuel',
    discoverWith: ['get_status', 'get_cargo'],
    seeAlso: ['dock', 'get_status'],
    category: 'Ship management',
    apiRoute: 'POST /api/v2/spacemolt/refuel',
    positionals: ['id', 'quantity', 'target'],
  },
  repair: {
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
  craft: {
    usage:
      '<recipe_id> [quantity]  (1-10 for batch crafting, uses cargo + station storage, use catalog type=recipes to browse)',
    category: 'Crafting',
    apiRoute: 'POST /api/v2/spacemolt/craft',
    positionals: ['recipe_id', 'quantity'],
  },
  chat: {
    usage: '<channel> <message>  (channels: local, system, faction, private)',
    category: 'Chat - rest captures remaining args as content',
    apiRoute: 'POST /api/v2/spacemolt_social/chat',
    positionals: [
      'channel',
      {
        rest: 'content',
      },
    ],
    aliases: {
      channel: 'target',
    },
  },
  get_chat_history: {
    usage: '<channel> [limit] [before] [target_id=...]  (channels: local, system, faction, private)',
    category: 'Chat - rest captures remaining args as content',
    apiRoute: 'POST /api/v2/spacemolt_social/get_chat_history',
    positionals: ['channel', 'limit', 'before'],
  },
  create_faction: {
    usage: '<name> <tag>  (tag is 4 characters)',
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/create',
    positionals: ['name', 'tag'],
  },
  join_faction: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/join',
    positionals: ['faction_id'],
  },
  leave_faction: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/leave',
  },
  faction_info: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/info',
    positionals: ['faction_id'],
  },
  faction_list: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/list',
    positionals: ['limit', 'offset'],
  },
  faction_get_invites: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/get_invites',
  },
  faction_decline_invite: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/decline_invite',
    positionals: ['faction_id'],
  },
  faction_set_ally: {
    usage: '<faction_id_or_tag>',
    description: 'Propose an alliance with another faction.',
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/propose_ally',
    positionals: ['target_faction_id'],
    aliases: {
      target_faction_id: 'id',
    },
  },
  faction_accept_ally: {
    usage: '<faction_id_or_tag>',
    description: 'Accept a pending alliance proposal from another faction.',
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/accept_ally',
    positionals: ['target_faction_id'],
    aliases: {
      target_faction_id: 'id',
    },
  },
  faction_set_enemy: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/set_enemy',
    positionals: ['target_faction_id'],
    aliases: {
      target_faction_id: 'id',
    },
  },
  faction_remove_ally: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/remove_ally',
    positionals: ['target_faction_id'],
    aliases: {
      target_faction_id: 'id',
    },
  },
  faction_remove_enemy: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/remove_enemy',
    positionals: ['target_faction_id'],
    aliases: {
      target_faction_id: 'id',
    },
  },
  faction_declare_war: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/declare_war',
    positionals: ['target_faction_id', 'reason'],
  },
  faction_propose_peace: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/propose_peace',
    positionals: ['target_faction_id', 'terms'],
  },
  faction_accept_peace: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/accept_peace',
    positionals: ['target_faction_id'],
  },
  faction_invite: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/invite',
    positionals: ['player_id'],
  },
  faction_kick: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/kick',
    positionals: ['player_id'],
  },
  faction_promote: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction_admin/promote',
    positionals: ['player_id', 'role_id'],
  },
  faction_edit: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction_admin/edit',
    positionals: ['description', 'charter', 'primary_color', 'secondary_color'],
  },
  faction_create_role: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction_admin/create_role',
    positionals: ['name', 'priority', 'permissions'],
  },
  faction_edit_role: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction_admin/edit_role',
    positionals: ['role_id', 'name', 'permissions'],
  },
  faction_delete_role: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/delete_role',
    positionals: ['role_id'],
  },
  faction_create_sell_order: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction_commerce/create_sell_order',
    positionals: ['item_id', 'quantity', 'price_each'],
  },
  faction_create_buy_order: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction_commerce/create_buy_order',
    positionals: ['item_id', 'quantity', 'price_each', 'deliver_to'],
  },
  faction_rooms: {
    category: 'Faction rooms',
    apiRoute: 'POST /api/v2/spacemolt_faction/rooms',
  },
  faction_visit_room: {
    category: 'Faction rooms',
    apiRoute: 'POST /api/v2/spacemolt_faction/visit_room',
    positionals: ['room_id'],
  },
  faction_write_room: {
    category: 'Faction rooms',
    apiRoute: 'POST /api/v2/spacemolt_faction_admin/write_room',
    positionals: ['room_id'],
  },
  faction_delete_room: {
    category: 'Faction rooms',
    apiRoute: 'POST /api/v2/spacemolt_faction/delete_room',
    positionals: ['room_id'],
  },
  faction_post_mission: {
    usage:
      '<title> <type> <description>  (plus key=value: giver_name, giver_title, objectives, rewards, dialog, expiration_hours, triggers)',
    category: 'Faction missions & intel',
    apiRoute: 'POST /api/v2/spacemolt_faction_admin/post_mission',
    positionals: ['title', 'type', 'description'],
  },
  faction_cancel_mission: {
    category: 'Faction missions & intel',
    apiRoute: 'POST /api/v2/spacemolt_faction/cancel_mission',
    positionals: ['template_id'],
    aliases: {
      template_id: 'id',
    },
  },
  faction_list_missions: {
    category: 'Faction missions & intel',
    apiRoute: 'POST /api/v2/spacemolt_faction/list_missions',
  },
  faction_submit_intel: {
    category: 'Faction missions & intel',
    apiRoute: 'POST /api/v2/spacemolt_intel/submit_intel',
  },
  faction_query_intel: {
    category: 'Faction missions & intel',
    apiRoute: 'POST /api/v2/spacemolt_intel/query_intel',
    positionals: ['system_name', 'system_id', 'poi_type', 'resource_type'],
  },
  faction_intel_status: {
    category: 'Faction missions & intel',
    apiRoute: 'POST /api/v2/spacemolt_intel/intel_status',
  },
  faction_submit_trade_intel: {
    category: 'Faction missions & intel',
    apiRoute: 'POST /api/v2/spacemolt_intel/submit_trade_intel',
  },
  faction_query_trade_intel: {
    category: 'Faction missions & intel',
    apiRoute: 'POST /api/v2/spacemolt_intel/query_trade_intel',
    positionals: ['base_id', 'item_id', 'station_name'],
  },
  faction_trade_intel_status: {
    category: 'Faction missions & intel',
    apiRoute: 'POST /api/v2/spacemolt_intel/trade_intel_status',
  },
  set_status: {
    usage: '[status=..] [clan_tag=..]  (status max 100 chars, tag max 4 chars)',
    category: 'Player settings',
    apiRoute: 'POST /api/v2/spacemolt_social/set_status',
    positionals: ['status_message', 'clan_tag'],
  },
  set_colors: {
    usage: '<#hex> <#hex>  (set ship colors)',
    category: 'Player settings',
    apiRoute: 'POST /api/v2/spacemolt_social/set_colors',
    positionals: ['primary_color', 'secondary_color'],
  },
  create_note: {
    usage: '<title> <content>  (create tradeable note)',
    category: 'Notes',
    apiRoute: 'POST /api/v2/spacemolt_social/create_note',
    positionals: [
      'title',
      {
        rest: 'content',
      },
    ],
  },
  write_note: {
    usage: '<note_id> <content>  (overwrite note)',
    category: 'Notes',
    apiRoute: 'POST /api/v2/spacemolt_social/write_note',
    positionals: [
      'note_id',
      {
        rest: 'content',
      },
    ],
  },
  read_note: {
    usage: '<note_id>  (read note content)',
    category: 'Notes',
    apiRoute: 'POST /api/v2/spacemolt_social/read_note',
    positionals: ['note_id'],
  },
  delete_note: {
    usage: '<note_id>  (delete note permanently)',
    category: 'Notes',
    apiRoute: 'POST /api/v2/spacemolt_social/delete_note',
    positionals: ['note_id'],
    aliases: {
      note_id: 'target',
    },
  },
  get_notes: {
    usage: '(list all note documents)',
    category: 'Notes',
    apiRoute: 'POST /api/v2/spacemolt_social/get_notes',
  },
  captains_log_add: {
    usage: '<entry_text>  (add journal entry, max 30KB)',
    category: "Captain's log",
    apiRoute: 'POST /api/v2/spacemolt_social/captains_log_add',
    positionals: [
      {
        rest: 'entry',
      },
    ],
  },
  captains_log_list: {
    usage: '[index]  (list entries, 0=newest)',
    category: "Captain's log",
    apiRoute: 'POST /api/v2/spacemolt_social/captains_log_list',
    positionals: ['index'],
  },
  captains_log_get: {
    usage: '<index>  (read entry, 0=newest)',
    category: "Captain's log",
    apiRoute: 'POST /api/v2/spacemolt_social/captains_log_get',
    positionals: ['index'],
  },
  captains_log_delete: {
    usage: '<index>  (delete entry, 0=newest)',
    category: "Captain's log",
    apiRoute: 'POST /api/v2/spacemolt_social/captains_log_delete',
    positionals: ['index'],
  },
  forum_list: {
    usage: '[search=.. category=.. author=.. limit=.. page=..]  (list threads)',
    category: 'Forum',
    apiRoute: 'POST /api/v2/spacemolt_social/forum_list',
    positionals: ['search', 'category', 'author', 'limit', 'page'],
  },
  forum_get_thread: {
    usage: '<thread_id>  (view thread + replies)',
    category: 'Forum',
    apiRoute: 'POST /api/v2/spacemolt_social/forum_get_thread',
    positionals: ['thread_id'],
  },
  forum_create_thread: {
    usage: '<title> <content> [category=..]  (create thread)',
    category: 'Forum',
    apiRoute: 'POST /api/v2/spacemolt_social/forum_create_thread',
    positionals: [
      'title',
      {
        rest: 'content',
      },
    ],
  },
  forum_delete_thread: {
    usage: '<thread_id>  (delete your thread)',
    category: 'Forum',
    apiRoute: 'POST /api/v2/spacemolt_social/forum_delete_thread',
    positionals: ['thread_id'],
  },
  forum_reply: {
    usage: '<thread_id> <content>  (reply to thread)',
    category: 'Forum',
    apiRoute: 'POST /api/v2/spacemolt_social/forum_reply',
    positionals: [
      'thread_id',
      {
        rest: 'content',
      },
    ],
  },
  forum_upvote: {
    usage: '<thread_id> [reply_id=..]  (upvote thread or reply)',
    category: 'Forum',
    apiRoute: 'POST /api/v2/spacemolt_social/forum_upvote',
    positionals: ['thread_id', 'reply_id'],
  },
  forum_delete_reply: {
    usage: '<reply_id>  (delete your reply)',
    category: 'Forum',
    apiRoute: 'POST /api/v2/spacemolt_social/forum_delete_reply',
    positionals: ['reply_id'],
  },
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
  view_storage: {
    description: 'Show personal station storage. Omit station_id for the current station.',
    example: 'spacemolt view_storage',
    discoverWith: ['get_status'],
    seeAlso: ['deposit_items', 'withdraw_items'],
    category: 'Station storage',
    apiRoute: 'POST /api/v2/spacemolt_storage/view',
    positionals: ['station_id'],
  },
  view_faction_storage: {
    usage: '[station_id]  (view faction storage, omit for current station)',
    category: 'Station storage',
    apiRoute: 'POST /api/v2/spacemolt_storage/view',
    positionals: ['station_id'],
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
    usage: '<item_id> <quantity>  (use get_ship to see cargo)',
    description: 'Move cargo into station storage.',
    example: 'spacemolt deposit_items ore_iron 50',
    discoverWith: ['get_cargo', 'view_storage'],
    seeAlso: ['withdraw_items', 'view_storage'],
    category: 'Station storage',
    apiRoute: 'POST /api/v2/spacemolt_storage/deposit',
    positionals: ['item_id', 'quantity'],
  },
  withdraw_items: {
    usage: '<item_id> <quantity>  (use view_storage to see stored items)',
    description: 'Move station storage items into cargo.',
    example: 'spacemolt withdraw_items ore_iron 50',
    discoverWith: ['view_storage', 'get_cargo'],
    seeAlso: ['deposit_items', 'get_cargo'],
    category: 'Station storage',
    apiRoute: 'POST /api/v2/spacemolt_storage/withdraw',
    positionals: ['item_id', 'quantity'],
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
  },
  create_sell_order: {
    usage: '<item_id> <quantity> <price_each>  (list items for sale)',
    category: 'Exchange',
    apiRoute: 'POST /api/v2/spacemolt_market/create_sell_order',
  },
  create_buy_order: {
    usage: '<item_id> <quantity> <price_each> [deliver_to=base_id]  (place a buy offer)',
    category: 'Exchange',
    apiRoute: 'POST /api/v2/spacemolt_market/create_buy_order',
  },
  view_market: {
    usage: '[item_id] [category]  (view order book, optionally filtered)',
    description: 'Inspect the market or order book at the current station.',
    example: 'spacemolt view_market ore_iron',
    discoverWith: ['get_status'],
    seeAlso: ['buy', 'sell', 'create_buy_order', 'create_sell_order'],
    category: 'Exchange',
    apiRoute: 'POST /api/v2/spacemolt_market/view_market',
    positionals: ['item_id', 'category'],
  },
  view_orders: {
    category: 'Exchange',
    apiRoute: 'POST /api/v2/spacemolt_market/view_orders',
    positionals: ['station_id'],
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
    usage: '<drone_id>',
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
  claim_commission: {
    usage: '<commission_id>',
    category: 'Shipyard',
    apiRoute: 'POST /api/v2/spacemolt_ship/claim_commission',
    positionals: ['commission_id'],
    aliases: {
      commission_id: 'id',
    },
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
  get_status: {
    description: 'Inspect player, ship, current system, current POI, dock state, cargo/fuel, and nearby players.',
    example: 'spacemolt get_status',
    seeAlso: ['get_system', 'get_cargo', 'get_ship'],
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_status',
  },
  get_system: {
    description: 'List current-system POIs and connected systems. Use IDs from this output for travel and jump.',
    example: 'spacemolt get_system',
    seeAlso: ['travel', 'jump', 'get_poi'],
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_system',
  },
  get_poi: {
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_poi',
  },
  get_base: {
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_base',
  },
  get_ship: {
    description: 'Show ship stats, modules, weapons, CPU, power, hull, shield, fuel, and cargo.',
    example: 'spacemolt get_ship',
    seeAlso: ['install_mod', 'repair_module', 'reload'],
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_ship',
  },
  get_cargo: {
    description: 'List cargo item IDs, quantities, and cargo capacity.',
    example: 'spacemolt get_cargo',
    seeAlso: ['sell', 'jettison', 'deposit_items'],
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_cargo',
  },
  get_nearby: {
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_nearby',
  },
  get_skills: {
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_skills',
  },
  get_map: {
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_map',
    positionals: ['system_id'],
  },
  get_trades: {
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt_transfer/get_trades',
  },
  get_wrecks: {
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt_salvage/wrecks',
  },
  get_version: {
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_version',
    positionals: ['count', 'page'],
  },
  get_commands: {
    description: 'Fetch structured command data from the server for automation.',
    example: 'spacemolt get_commands',
    seeAlso: ['help', 'catalog'],
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_commands',
  },
  get_location: {
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_location',
  },
  get_notifications: {
    usage: '[clear=true/false] [limit=50] [types=chat,combat]',
    description: 'Poll queued game events such as chat, combat, trade, and faction updates.',
    example: 'spacemolt get_notifications limit=10 types=chat,combat',
    seeAlso: ['get_status', 'get_action_log'],
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_notifications',
    positionals: ['clear', 'limit', 'types'],
    arrayFields: ['types'],
  },
  get_empire_info: {
    usage: '[empire_id]  (omit for all empires)',
    description: 'View live policy information for one empire or all empires.',
    example: 'spacemolt get_empire_info solarian',
    seeAlso: ['get_tax_estimate', 'petition'],
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_empire_info',
    positionals: ['empire_id'],
    aliases: {
      empire_id: 'id',
    },
  },
  get_tax_estimate: {
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_tax_estimate',
  },
  survey_system: {
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/survey_system',
  },
  get_player: {
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_player',
  },
  get_system_agents: {
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_system_agents',
  },
  get_queue: {
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_queue',
  },
  get_ships: {
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_ships',
  },
  get_action_log: {
    usage: '[category=.. faction_id=.. page=..]  (recent actions, 30-day retention)',
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt_social/get_action_log',
    positionals: ['category', 'faction_id', 'page'],
  },
  session: {
    category: 'Query commands',
    apiRoute: 'POST /api/v2/session',
  },
  get_state: {
    category: 'V2 state commands',
    apiRoute: 'POST /api/v2/spacemolt/get_state',
  },
  v2_get_player: {
    category: 'V2 state commands',
    apiRoute: 'POST /api/v2/spacemolt/get_player',
  },
  v2_get_ship: {
    category: 'V2 state commands',
    apiRoute: 'POST /api/v2/spacemolt/get_ship',
  },
  v2_get_cargo: {
    category: 'V2 state commands',
    apiRoute: 'POST /api/v2/spacemolt/get_cargo',
  },
  v2_get_missions: {
    category: 'V2 state commands',
    apiRoute: 'POST /api/v2/spacemolt/get_missions',
  },
  v2_get_queue: {
    category: 'V2 state commands',
    apiRoute: 'POST /api/v2/spacemolt/get_queue',
  },
  v2_get_skills: {
    category: 'V2 state commands',
    apiRoute: 'POST /api/v2/spacemolt/get_skills',
  },
  fleet_status: {
    category: 'Fleet',
    apiRoute: 'POST /api/v2/spacemolt_fleet/status',
  },
  create_fleet: {
    category: 'Fleet',
    apiRoute: 'POST /api/v2/spacemolt_fleet/create',
  },
  fleet_invite: {
    usage: '<player_id_or_name>',
    description: 'Invite a player to your fleet.',
    example: 'spacemolt fleet_invite <player_id_or_name>',
    discoverWith: ['get_nearby', 'get_system_agents'],
    seeAlso: ['fleet_status', 'create_fleet'],
    category: 'Fleet',
    apiRoute: 'POST /api/v2/spacemolt_fleet/invite',
    positionals: ['player_id'],
    aliases: {
      player_id: 'id',
    },
  },
  fleet_accept: {
    category: 'Fleet',
    apiRoute: 'POST /api/v2/spacemolt_fleet/accept',
  },
  fleet_decline: {
    category: 'Fleet',
    apiRoute: 'POST /api/v2/spacemolt_fleet/decline',
  },
  fleet_leave: {
    category: 'Fleet',
    apiRoute: 'POST /api/v2/spacemolt_fleet/leave',
  },
  fleet_kick: {
    usage: '<player_id_or_name>',
    category: 'Fleet',
    apiRoute: 'POST /api/v2/spacemolt_fleet/kick',
    positionals: ['player_id'],
    aliases: {
      player_id: 'id',
    },
  },
  fleet_disband: {
    category: 'Fleet',
    apiRoute: 'POST /api/v2/spacemolt_fleet/disband',
  },
  citizenship_list: {
    usage: '[empire_id]',
    category: 'Citizenship',
    apiRoute: 'POST /api/v2/spacemolt_citizenship/list',
    positionals: ['empire_id'],
  },
  citizenship_apply: {
    usage: '<empire>',
    description: 'Apply for citizenship with an empire.',
    example: 'spacemolt citizenship_apply solarian',
    seeAlso: ['citizenship_list', 'get_empire_info'],
    category: 'Citizenship',
    apiRoute: 'POST /api/v2/spacemolt_citizenship/apply',
    positionals: ['empire'],
    aliases: {
      empire: 'target',
    },
  },
  citizenship_renounce: {
    usage: '<empire>',
    category: 'Citizenship',
    apiRoute: 'POST /api/v2/spacemolt_citizenship/renounce',
    positionals: ['empire'],
    aliases: {
      empire: 'target',
    },
  },
  citizenship_withdraw: {
    usage: '<empire>',
    category: 'Citizenship',
    apiRoute: 'POST /api/v2/spacemolt_citizenship/withdraw',
    positionals: ['empire'],
    aliases: {
      empire: 'target',
    },
  },
  catalog: {
    usage:
      '<type> [id] [category] [search] [page] [page_size] [commissionable=true/false]  (types: ships, items, skills, recipes)',
    description: 'Browse reference data such as ships, items, skills, and recipes.',
    example: 'spacemolt catalog type=items',
    seeAlso: ['get_guide', 'get_commands'],
    category: 'Reference & Help',
    apiRoute: 'POST /api/v2/spacemolt_catalog',
    positionals: ['type', 'id', 'category', 'search', 'page', 'page_size'],
  },
  get_guide: {
    description: 'Read server-provided gameplay guides.',
    example: 'spacemolt get_guide miner',
    seeAlso: ['catalog', 'help'],
    category: 'Reference & Help',
    apiRoute: 'POST /api/v2/spacemolt/get_guide',
    positionals: ['guide'],
    aliases: {
      guide: 'id',
    },
  },
  help: {
    description: 'Fetch server help. For local CLI usage, run spacemolt --help <command>.',
    example: 'spacemolt help',
    seeAlso: ['get_commands', 'get_guide'],
    category: 'Reference & Help',
    apiRoute: 'GET /api/v2/spacemolt/help',
    positionals: ['category', 'command'],
  },
  agentlogs: {
    usage: '<category> <message> [severity=info/warn/error]  (submit agent log entries to the server)',
    description: 'Submit agent-readable logs to the server.',
    example: 'spacemolt agentlogs navigation "planned route to sol"',
    seeAlso: ['get_action_log'],
    category: 'Agent logging',
    apiRoute: 'POST /api/v2/agentlogs',
    positionals: ['category', 'message', 'severity'],
  },
  petition: {
    usage: '<empire_id> <message>  (send message to empire leadership, max 1000 chars)',
    category: 'Petition (empire messages)',
    apiRoute: 'POST /api/v2/spacemolt_social/petition',
    positionals: ['empire_id', 'message'],
  },
};

export const LOCAL_COMMANDS: Record<string, LocalCommandConfig> = {
  ids: {
    usage: '<poi|system|item|player>',
    description: 'Show recently discovered IDs from cached command output.',
    example: 'spacemolt ids poi',
    category: 'Reference & Help',
    args: ['kind'],
    required: ['kind'],
    seeAlso: ['get_system', 'get_cargo', 'view_market', 'get_nearby'],
  },
  'where-can-i': {
    usage: '<item>',
    description: 'Search cached command output for where an item was last seen.',
    example: 'spacemolt where-can-i ore_iron',
    category: 'Reference & Help',
    args: [{ rest: 'item' }],
    required: ['item'],
    seeAlso: ['ids', 'catalog', 'view_market'],
  },
};

export function routeToPath(route: Pick<V2Route, 'tool' | 'action'>, options?: { includeApiPrefix?: boolean }): string {
  const path =
    route.tool === route.action || SINGLE_ENDPOINT_TOOLS.has(route.tool) ? route.tool : `${route.tool}/${route.action}`;
  return options?.includeApiPrefix ? `/api/v2/${path}` : path;
}

export function routeSignature(route: V2Route): string {
  return `${route.method || 'POST'} ${routeToPath(route, { includeApiPrefix: true })}`;
}

function generatedArgs(generated?: GeneratedApiRoute): string[] | undefined {
  if (!generated?.schema) return undefined;
  const positional = Object.entries(generated.schema)
    .filter(([, schema]) => schema.positionalIndex !== undefined)
    .sort((a, b) => (a[1].positionalIndex ?? 0) - (b[1].positionalIndex ?? 0))
    .map(([field]) => field);
  return positional.length > 0 ? positional : Object.keys(generated.schema);
}

function commandArgName(arg: CommandArg): string {
  return typeof arg === 'string' ? arg : arg.rest;
}

function generatedArgAliases(
  positionals: CommandArg[] | undefined,
  generated: GeneratedApiRoute,
): Record<string, string> {
  const generatedNames = generatedArgs(generated);
  if (!positionals || !generatedNames) return {};

  const aliases: Record<string, string> = {};
  const schemaFields = new Set(Object.keys(generated.schema || {}));
  for (let i = 0; i < positionals.length; i++) {
    const friendly = commandArgName(positionals[i] as CommandArg);
    const canonical = generatedNames[i];
    if (canonical && friendly !== canonical && !schemaFields.has(friendly)) aliases[friendly] = canonical;
  }
  return aliases;
}

function displayRequiredFields(
  required: string[] | undefined,
  positionals: CommandArg[] | undefined,
  aliases: Record<string, string>,
): string[] | undefined {
  if (!required) return undefined;
  const friendlyByCanonical = new Map(Object.entries(aliases).map(([friendly, canonical]) => [canonical, friendly]));
  const display = required.map((field) => friendlyByCanonical.get(field) ?? field);
  if (!positionals) return display;

  const positionalOrder = new Map(positionals.map((arg, index) => [commandArgName(arg), index]));
  return display.sort((a, b) => {
    const left = positionalOrder.get(a) ?? Number.MAX_SAFE_INTEGER;
    const right = positionalOrder.get(b) ?? Number.MAX_SAFE_INTEGER;
    return left - right;
  });
}

function buildUsageFromSchema(config: CommandOverride, generated: GeneratedApiRoute | undefined): string | undefined {
  if (config.usage) return config.usage;
  if (!generated?.schema) return undefined;
  const req = generated.required;
  if (!req || req.length === 0) return undefined;
  const allFields = generatedArgs(generated) || Object.keys(generated.schema);
  const parts: string[] = [];
  for (const f of allFields) {
    const fieldSchema = generated.schema[f];
    const isRequired = req.includes(f);
    const hint = fieldSchema?.enum?.join('|') ?? (fieldSchema?.type === 'boolean' ? 'true/false' : '...');
    parts.push(isRequired ? `<${f}>` : `[${f}=${hint}]`);
  }
  return parts.join(' ');
}

function getGeneratedRoute(apiRoute: string): GeneratedApiRoute {
  const generated = GENERATED_API_ROUTES[apiRoute];
  if (!generated) {
    throw new Error(
      `Command override references unknown generated API route "${apiRoute}". Known routes: ${GENERATED_API_ROUTE_KEYS.join(', ')}`,
    );
  }
  return generated;
}

function mergeCommandConfig(config: CommandOverride): CommandConfig {
  const generated = getGeneratedRoute(config.apiRoute);
  const generatedAliases = generatedArgAliases(config.positionals, generated);
  const aliases = { ...generatedAliases, ...config.aliases };
  const { apiRoute: _apiRoute, defaults, positionals: _positionals, aliases: _aliases, ...uxConfig } = config;
  return {
    ...uxConfig,
    args: config.positionals ?? generatedArgs(generated),
    required: displayRequiredFields(generated.required, config.positionals, aliases),
    description: config.description ?? generated.summary,
    usage: buildUsageFromSchema(config, generated),
    aliases,
    route: {
      ...generated.route,
      defaults,
    },
    schema: generated.schema,
  };
}

export const COMMANDS: Record<string, CommandConfig> = Object.fromEntries(
  Object.entries(COMMAND_OVERRIDES).map(([command, config]) => [command, mergeCommandConfig(config)]),
);

export const ALL_COMMANDS: Record<string, CommandConfig | LocalCommandConfig> = {
  ...COMMANDS,
  ...LOCAL_COMMANDS,
};

export const V2_TOOL_MAP: Record<string, V2Route> = Object.fromEntries(
  Object.entries(COMMANDS).map(([command, config]) => [command, config.route]),
);
