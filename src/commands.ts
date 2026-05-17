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
}

export const SINGLE_ENDPOINT_TOOLS = new Set(['agentlogs', 'session', 'spacemolt_catalog']);

const COMMAND_OVERRIDES: Record<string, CommandConfig> = {
  register: {
    args: ['username', 'empire', 'registration_code'],
    required: ['username', 'empire', 'registration_code'],
    usage: '<username> <empire> <registration_code>  (get code from spacemolt.com/dashboard)',
    description: 'Create a player using a dashboard registration code.',
    example: 'spacemolt register myname solarian YOUR_REGISTRATION_CODE',
    seeAlso: ['login', 'get_status'],
    category: 'Authentication',
    route: {
      tool: 'spacemolt_auth',
      action: 'register',
    },
  },
  login: {
    args: ['username', 'password'],
    required: ['username', 'password'],
    usage: '<username> <password>',
    description: 'Authenticate and save credentials in the local session file.',
    example: 'spacemolt login myname <password>',
    seeAlso: ['session', 'get_status'],
    category: 'Authentication',
    route: {
      tool: 'spacemolt_auth',
      action: 'login',
    },
  },
  login_token: {
    args: ['token'],
    required: ['token'],
    usage: '<token>',
    category: 'Authentication',
    route: {
      tool: 'spacemolt_auth',
      action: 'login_token',
    },
  },
  logout: {
    category: 'Authentication',
    route: {
      tool: 'spacemolt_auth',
      action: 'logout',
    },
  },
  claim: {
    args: ['registration_code'],
    required: ['registration_code'],
    usage: '<registration_code>  (link existing player to your account)',
    category: 'Authentication',
    route: {
      tool: 'spacemolt_auth',
      action: 'claim',
    },
  },
  travel: {
    args: ['target_poi'],
    required: ['target_poi'],
    usage: '<poi_id>  (use get_system to see POIs)',
    description: 'Move to a POI in the current system. Use get_system first to find valid POI IDs.',
    example: 'spacemolt travel sol_asteroid_belt',
    discoverWith: ['get_system', 'get_status'],
    seeAlso: ['get_system', 'get_poi', 'jump'],
    category: 'Navigation',
    route: {
      tool: 'spacemolt',
      action: 'travel',
    },
    aliases: {
      target_poi: 'id',
    },
  },
  jump: {
    args: ['target_system'],
    required: ['target_system'],
    usage: '<system_id>  (use get_system to see connections)',
    description: 'Move to a connected system. Use get_system first to find connected system IDs.',
    example: 'spacemolt jump alpha_centauri',
    discoverWith: ['get_system', 'find_route'],
    seeAlso: ['get_system', 'travel', 'refuel'],
    category: 'Navigation',
    route: {
      tool: 'spacemolt',
      action: 'jump',
    },
    aliases: {
      target_system: 'id',
    },
  },
  dock: {
    category: 'Navigation',
    route: {
      tool: 'spacemolt',
      action: 'dock',
    },
  },
  undock: {
    category: 'Navigation',
    route: {
      tool: 'spacemolt',
      action: 'undock',
    },
  },
  search_systems: {
    args: ['query'],
    required: ['query'],
    usage: '<query>  (case-insensitive partial match on system names)',
    category: 'Navigation',
    route: {
      tool: 'spacemolt',
      action: 'search_systems',
    },
    aliases: {
      query: 'text',
    },
  },
  find_route: {
    args: ['target_system'],
    required: ['target_system'],
    usage: '<system_id>  (find shortest route from current system)',
    category: 'Navigation',
    route: {
      tool: 'spacemolt',
      action: 'find_route',
    },
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
    route: {
      tool: 'spacemolt',
      action: 'mine',
    },
  },
  attack: {
    args: ['target_id'],
    required: ['target_id'],
    usage: '<player_id>  (use get_nearby to see players)',
    description: 'Attack a nearby target. Use get_nearby first for target IDs.',
    example: 'spacemolt attack <player_id>',
    discoverWith: ['get_nearby', 'get_status'],
    seeAlso: ['scan', 'get_battle_status'],
    category: 'Combat',
    route: {
      tool: 'spacemolt',
      action: 'attack',
    },
    aliases: {
      target_id: 'id',
    },
  },
  scan: {
    args: ['target_id'],
    required: ['target_id'],
    usage: '<player_id>',
    description: 'Scan a nearby player for ship and combat details.',
    example: 'spacemolt scan <player_id>',
    discoverWith: ['get_nearby'],
    seeAlso: ['attack', 'get_ship'],
    category: 'Combat',
    route: {
      tool: 'spacemolt',
      action: 'scan',
    },
    aliases: {
      target_id: 'id',
    },
  },
  cloak: {
    args: ['enable'],
    category: 'Combat',
    route: {
      tool: 'spacemolt',
      action: 'cloak',
    },
  },
  self_destruct: {
    usage: '(destroy ship, create wreck, respawn at home base)',
    category: 'Combat',
    route: {
      tool: 'spacemolt',
      action: 'self_destruct',
    },
  },
  sell: {
    args: ['item_id', 'quantity', 'auto_list'],
    required: ['item_id', 'quantity'],
    usage: '<item_id> <quantity> [auto_list=true]  (use get_cargo to see items)',
    description: 'Sell cargo items. Use get_cargo first for item IDs and available quantities.',
    example: 'spacemolt sell ore_iron 50',
    discoverWith: ['get_cargo', 'view_market'],
    seeAlso: ['get_cargo', 'view_market'],
    category: 'Trading',
    route: {
      tool: 'spacemolt',
      action: 'sell',
    },
  },
  buy: {
    args: ['item_id', 'quantity', 'auto_list', 'deliver_to'],
    required: ['item_id'],
    usage: '<item_id> [quantity] [auto_list=true] [deliver_to=base_id]  (use view_market to see order book)',
    description: 'Buy an item from the current market. Use view_market to inspect available listings.',
    example: 'spacemolt buy fuel 10',
    discoverWith: ['view_market', 'get_status'],
    seeAlso: ['view_market', 'get_cargo'],
    category: 'Trading',
    route: {
      tool: 'spacemolt',
      action: 'buy',
    },
  },
  trade_offer: {
    args: ['target_id', 'credits'],
    required: ['target_id'],
    usage: '<player_id> [credits=N] [items=...]  (use get_trades to see pending offers)',
    category: 'P2P Trading',
    route: {
      tool: 'spacemolt_transfer',
      action: 'trade_offer',
    },
  },
  trade_accept: {
    args: ['trade_id'],
    required: ['trade_id'],
    usage: '<trade_id>  (use get_trades to see offers)',
    category: 'P2P Trading',
    route: {
      tool: 'spacemolt_transfer',
      action: 'trade_accept',
    },
  },
  trade_decline: {
    args: ['trade_id'],
    required: ['trade_id'],
    usage: '<trade_id>',
    category: 'P2P Trading',
    route: {
      tool: 'spacemolt_transfer',
      action: 'trade_decline',
    },
  },
  trade_cancel: {
    args: ['trade_id'],
    required: ['trade_id'],
    usage: '<trade_id>',
    category: 'P2P Trading',
    route: {
      tool: 'spacemolt_transfer',
      action: 'trade_cancel',
    },
  },
  loot_wreck: {
    args: ['wreck_id', 'item_id', 'quantity'],
    required: ['wreck_id', 'item_id'],
    usage: '<wreck_id> <item_id> [quantity]  (use get_wrecks to see wrecks)',
    category: 'Wrecks',
    route: {
      tool: 'spacemolt_salvage',
      action: 'loot',
    },
  },
  salvage_wreck: {
    args: ['wreck_id'],
    required: ['wreck_id'],
    usage: '<wreck_id>',
    category: 'Wrecks',
    route: {
      tool: 'spacemolt_salvage',
      action: 'salvage',
    },
  },
  name_ship: {
    args: ['name'],
    usage: '<name>  (set ship name, empty to clear)',
    category: 'Ship management',
    route: {
      tool: 'spacemolt_ship',
      action: 'rename_ship',
    },
  },
  sell_ship: {
    args: ['ship_id'],
    required: ['ship_id'],
    usage: '<ship_id>  (sell stored ship at 50% base value)',
    category: 'Ship management',
    route: {
      tool: 'spacemolt_ship',
      action: 'sell_ship',
    },
    aliases: {
      ship_id: 'id',
    },
  },
  list_ships: {
    usage: '(all owned ships with locations)',
    category: 'Ship management',
    route: {
      tool: 'spacemolt_ship',
      action: 'list_ships',
    },
  },
  switch_ship: {
    args: ['ship_id'],
    required: ['ship_id'],
    usage: '<ship_id>  (swap active ship, cargo moved to station storage)',
    category: 'Ship management',
    route: {
      tool: 'spacemolt_ship',
      action: 'switch_ship',
    },
    aliases: {
      ship_id: 'id',
    },
  },
  install_mod: {
    args: ['module_id'],
    required: ['module_id'],
    usage: '<module_id>  (module must be in cargo, use get_cargo to see)',
    category: 'Ship management',
    route: {
      tool: 'spacemolt',
      action: 'install_mod',
    },
    aliases: {
      module_id: 'id',
    },
  },
  uninstall_mod: {
    args: ['module_id'],
    required: ['module_id'],
    usage: '<module_id>  (use get_ship to see installed modules)',
    category: 'Ship management',
    route: {
      tool: 'spacemolt',
      action: 'uninstall_mod',
    },
    aliases: {
      module_id: 'id',
    },
  },
  repair_module: {
    args: ['module_id'],
    required: ['module_id'],
    usage: '<module_id>  (use get_ship to see modules, requires Repair Kit in cargo)',
    category: 'Ship management',
    route: {
      tool: 'spacemolt',
      action: 'repair_module',
    },
    aliases: {
      module_id: 'id',
    },
  },
  refit_ship: {
    usage: '(reset ship to class specs, strips modules)',
    category: 'Ship management',
    route: {
      tool: 'spacemolt_ship',
      action: 'refit_ship',
    },
  },
  scrap_ship: {
    args: ['ship_id'],
    required: ['ship_id'],
    usage: '<ship_id>  (permanently destroy a stored ship)',
    category: 'Ship management',
    route: {
      tool: 'spacemolt_ship',
      action: 'scrap_ship',
    },
    aliases: {
      ship_id: 'id',
    },
  },
  refuel: {
    args: ['id', 'quantity', 'target'],
    usage:
      '[id] [quantity] [target=player|fleet]  (station fuel uses dynamic reserve pricing; fuel cells can be selected by id)',
    description: 'Refuel from a station or fuel cell. Usually dock first, then run refuel.',
    example: 'spacemolt refuel',
    discoverWith: ['get_status', 'get_cargo'],
    seeAlso: ['dock', 'get_status'],
    category: 'Ship management',
    route: {
      tool: 'spacemolt',
      action: 'refuel',
    },
  },
  repair: {
    category: 'Ship management',
    route: {
      tool: 'spacemolt',
      action: 'repair',
    },
  },
  use_item: {
    args: ['item_id', 'quantity'],
    required: ['item_id'],
    usage: '<item_id> [quantity]  (consumables: repair_kit, shield_cell, emergency_warp, etc.)',
    category: 'Ship management',
    route: {
      tool: 'spacemolt',
      action: 'use_item',
    },
  },
  set_home_base: {
    args: ['base_id'],
    required: ['base_id'],
    usage: '<base_id>  (set respawn point, requires cloning service)',
    category: 'Insurance',
    route: {
      tool: 'spacemolt_salvage',
      action: 'set_home',
    },
  },
  craft: {
    args: ['recipe_id', 'quantity'],
    required: ['recipe_id'],
    usage:
      '<recipe_id> [quantity]  (1-10 for batch crafting, uses cargo + station storage, use catalog type=recipes to browse)',
    category: 'Crafting',
    route: {
      tool: 'spacemolt',
      action: 'craft',
    },
  },
  chat: {
    args: [
      'channel',
      {
        rest: 'content',
      },
    ],
    required: ['channel', 'content'],
    usage: '<channel> <message>  (channels: local, system, faction, private)',
    category: 'Chat - rest captures remaining args as content',
    route: {
      tool: 'spacemolt_social',
      action: 'chat',
    },
    aliases: {
      channel: 'target',
    },
  },
  get_chat_history: {
    args: ['channel', 'limit', 'before'],
    required: ['channel'],
    usage: '<channel> [limit] [before] [target_id=...]  (channels: local, system, faction, private)',
    category: 'Chat - rest captures remaining args as content',
    route: {
      tool: 'spacemolt_social',
      action: 'get_chat_history',
    },
  },
  create_faction: {
    args: ['name', 'tag'],
    required: ['name', 'tag'],
    usage: '<name> <tag>  (tag is 4 characters)',
    category: 'Factions',
    route: {
      tool: 'spacemolt_faction',
      action: 'create',
    },
  },
  join_faction: {
    args: ['faction_id'],
    category: 'Factions',
    route: {
      tool: 'spacemolt_faction',
      action: 'join',
    },
  },
  leave_faction: {
    category: 'Factions',
    route: {
      tool: 'spacemolt_faction',
      action: 'leave',
    },
  },
  faction_info: {
    args: ['faction_id'],
    category: 'Factions',
    route: {
      tool: 'spacemolt_faction',
      action: 'info',
    },
  },
  faction_list: {
    args: ['limit', 'offset'],
    category: 'Factions',
    route: {
      tool: 'spacemolt_faction',
      action: 'list',
    },
  },
  faction_get_invites: {
    category: 'Factions',
    route: {
      tool: 'spacemolt_faction',
      action: 'get_invites',
    },
  },
  faction_decline_invite: {
    args: ['faction_id'],
    category: 'Factions',
    route: {
      tool: 'spacemolt_faction',
      action: 'decline_invite',
    },
  },
  faction_set_ally: {
    args: ['target_faction_id'],
    category: 'Factions',
    route: {
      tool: 'spacemolt_faction',
      action: 'set_ally',
    },
    aliases: {
      target_faction_id: 'id',
    },
  },
  faction_set_enemy: {
    args: ['target_faction_id'],
    category: 'Factions',
    route: {
      tool: 'spacemolt_faction',
      action: 'set_enemy',
    },
    aliases: {
      target_faction_id: 'id',
    },
  },
  faction_remove_ally: {
    args: ['target_faction_id'],
    required: ['target_faction_id'],
    category: 'Factions',
    route: {
      tool: 'spacemolt_faction',
      action: 'remove_ally',
    },
    aliases: {
      target_faction_id: 'id',
    },
  },
  faction_remove_enemy: {
    args: ['target_faction_id'],
    required: ['target_faction_id'],
    category: 'Factions',
    route: {
      tool: 'spacemolt_faction',
      action: 'remove_enemy',
    },
    aliases: {
      target_faction_id: 'id',
    },
  },
  faction_declare_war: {
    args: ['target_faction_id', 'reason'],
    category: 'Factions',
    route: {
      tool: 'spacemolt_faction',
      action: 'declare_war',
    },
  },
  faction_propose_peace: {
    args: ['target_faction_id', 'terms'],
    category: 'Factions',
    route: {
      tool: 'spacemolt_faction',
      action: 'propose_peace',
    },
  },
  faction_accept_peace: {
    args: ['target_faction_id'],
    category: 'Factions',
    route: {
      tool: 'spacemolt_faction',
      action: 'accept_peace',
    },
  },
  faction_invite: {
    args: ['player_id'],
    category: 'Factions',
    route: {
      tool: 'spacemolt_faction',
      action: 'invite',
    },
  },
  faction_kick: {
    args: ['player_id'],
    category: 'Factions',
    route: {
      tool: 'spacemolt_faction',
      action: 'kick',
    },
  },
  faction_promote: {
    args: ['player_id', 'role_id'],
    category: 'Factions',
    route: {
      tool: 'spacemolt_faction_admin',
      action: 'promote',
    },
  },
  faction_edit: {
    args: ['description', 'charter', 'primary_color', 'secondary_color'],
    category: 'Factions',
    route: {
      tool: 'spacemolt_faction_admin',
      action: 'edit',
    },
  },
  faction_create_role: {
    args: ['name', 'priority', 'permissions'],
    category: 'Factions',
    route: {
      tool: 'spacemolt_faction_admin',
      action: 'create_role',
    },
  },
  faction_edit_role: {
    args: ['role_id', 'name', 'permissions'],
    category: 'Factions',
    route: {
      tool: 'spacemolt_faction_admin',
      action: 'edit_role',
    },
  },
  faction_delete_role: {
    args: ['role_id'],
    category: 'Factions',
    route: {
      tool: 'spacemolt_faction',
      action: 'delete_role',
    },
  },
  faction_create_sell_order: {
    args: ['item_id', 'quantity', 'price_each'],
    required: ['item_id', 'quantity', 'price_each'],
    category: 'Factions',
    route: {
      tool: 'spacemolt_faction_commerce',
      action: 'create_sell_order',
    },
  },
  faction_create_buy_order: {
    args: ['item_id', 'quantity', 'price_each'],
    required: ['item_id', 'quantity', 'price_each'],
    category: 'Factions',
    route: {
      tool: 'spacemolt_faction_commerce',
      action: 'create_buy_order',
    },
  },
  faction_rooms: {
    category: 'Faction rooms',
    route: {
      tool: 'spacemolt_faction',
      action: 'rooms',
    },
  },
  faction_visit_room: {
    args: ['room_id'],
    required: ['room_id'],
    category: 'Faction rooms',
    route: {
      tool: 'spacemolt_faction',
      action: 'visit_room',
    },
  },
  faction_write_room: {
    args: ['room_id'],
    category: 'Faction rooms',
    route: {
      tool: 'spacemolt_faction_admin',
      action: 'write_room',
    },
  },
  faction_delete_room: {
    args: ['room_id'],
    required: ['room_id'],
    category: 'Faction rooms',
    route: {
      tool: 'spacemolt_faction',
      action: 'delete_room',
    },
  },
  faction_post_mission: {
    args: ['title', 'type', 'description'],
    required: ['title', 'type', 'description'],
    usage:
      '<title> <type> <description>  (plus key=value: giver_name, giver_title, objectives, rewards, dialog, expiration_hours, triggers)',
    category: 'Faction missions & intel',
    route: {
      tool: 'spacemolt_faction_admin',
      action: 'post_mission',
    },
  },
  faction_cancel_mission: {
    args: ['template_id'],
    required: ['template_id'],
    category: 'Faction missions & intel',
    route: {
      tool: 'spacemolt_faction',
      action: 'cancel_mission',
    },
    aliases: {
      template_id: 'id',
    },
  },
  faction_list_missions: {
    category: 'Faction missions & intel',
    route: {
      tool: 'spacemolt_faction',
      action: 'list_missions',
    },
  },
  faction_submit_intel: {
    category: 'Faction missions & intel',
    route: {
      tool: 'spacemolt_intel',
      action: 'submit_intel',
    },
  },
  faction_query_intel: {
    args: ['system_name', 'system_id', 'poi_type', 'resource_type'],
    category: 'Faction missions & intel',
    route: {
      tool: 'spacemolt_intel',
      action: 'query_intel',
    },
  },
  faction_intel_status: {
    category: 'Faction missions & intel',
    route: {
      tool: 'spacemolt_intel',
      action: 'intel_status',
    },
  },
  faction_submit_trade_intel: {
    category: 'Faction missions & intel',
    route: {
      tool: 'spacemolt_intel',
      action: 'submit_trade_intel',
    },
  },
  faction_query_trade_intel: {
    args: ['base_id', 'item_id', 'station_name'],
    category: 'Faction missions & intel',
    route: {
      tool: 'spacemolt_intel',
      action: 'query_trade_intel',
    },
  },
  faction_trade_intel_status: {
    category: 'Faction missions & intel',
    route: {
      tool: 'spacemolt_intel',
      action: 'trade_intel_status',
    },
  },
  set_status: {
    args: ['status_message', 'clan_tag'],
    usage: '[status=..] [clan_tag=..]  (status max 100 chars, tag max 4 chars)',
    category: 'Player settings',
    route: {
      tool: 'spacemolt_social',
      action: 'set_status',
    },
  },
  set_colors: {
    args: ['primary_color', 'secondary_color'],
    required: ['primary_color', 'secondary_color'],
    usage: '<#hex> <#hex>  (set ship colors)',
    category: 'Player settings',
    route: {
      tool: 'spacemolt_social',
      action: 'set_colors',
    },
  },
  create_note: {
    args: [
      'title',
      {
        rest: 'content',
      },
    ],
    required: ['title', 'content'],
    usage: '<title> <content>  (create tradeable note)',
    category: 'Notes',
    route: {
      tool: 'spacemolt_social',
      action: 'create_note',
    },
  },
  write_note: {
    args: [
      'note_id',
      {
        rest: 'content',
      },
    ],
    required: ['note_id', 'content'],
    usage: '<note_id> <content>  (overwrite note)',
    category: 'Notes',
    route: {
      tool: 'spacemolt_social',
      action: 'write_note',
    },
  },
  read_note: {
    args: ['note_id'],
    required: ['note_id'],
    usage: '<note_id>  (read note content)',
    category: 'Notes',
    route: {
      tool: 'spacemolt_social',
      action: 'read_note',
    },
  },
  delete_note: {
    args: ['note_id'],
    required: ['note_id'],
    usage: '<note_id>  (delete note permanently)',
    category: 'Notes',
    route: {
      tool: 'spacemolt_social',
      action: 'delete_note',
    },
    aliases: {
      note_id: 'target',
    },
  },
  get_notes: {
    usage: '(list all note documents)',
    category: 'Notes',
    route: {
      tool: 'spacemolt_social',
      action: 'get_notes',
    },
  },
  captains_log_add: {
    args: [
      {
        rest: 'entry',
      },
    ],
    required: ['entry'],
    usage: '<entry_text>  (add journal entry, max 30KB)',
    category: "Captain's log",
    route: {
      tool: 'spacemolt_social',
      action: 'captains_log_add',
    },
  },
  captains_log_list: {
    args: ['index'],
    usage: '[index]  (list entries, 0=newest)',
    category: "Captain's log",
    route: {
      tool: 'spacemolt_social',
      action: 'captains_log_list',
    },
  },
  captains_log_get: {
    args: ['index'],
    required: ['index'],
    usage: '<index>  (read entry, 0=newest)',
    category: "Captain's log",
    route: {
      tool: 'spacemolt_social',
      action: 'captains_log_get',
    },
  },
  captains_log_delete: {
    args: ['index'],
    required: ['index'],
    usage: '<index>  (delete entry, 0=newest)',
    category: "Captain's log",
    route: {
      tool: 'spacemolt_social',
      action: 'captains_log_delete',
    },
  },
  forum_list: {
    args: ['search', 'category', 'author', 'limit', 'page'],
    usage: '[search=.. category=.. author=.. limit=.. page=..]  (list threads)',
    category: 'Forum',
    route: {
      tool: 'spacemolt_social',
      action: 'forum_list',
    },
  },
  forum_get_thread: {
    args: ['thread_id'],
    required: ['thread_id'],
    usage: '<thread_id>  (view thread + replies)',
    category: 'Forum',
    route: {
      tool: 'spacemolt_social',
      action: 'forum_get_thread',
    },
  },
  forum_create_thread: {
    args: [
      'title',
      {
        rest: 'content',
      },
    ],
    required: ['title', 'content'],
    usage: '<title> <content> [category=..]  (create thread)',
    category: 'Forum',
    route: {
      tool: 'spacemolt_social',
      action: 'forum_create_thread',
    },
  },
  forum_delete_thread: {
    args: ['thread_id'],
    required: ['thread_id'],
    usage: '<thread_id>  (delete your thread)',
    category: 'Forum',
    route: {
      tool: 'spacemolt_social',
      action: 'forum_delete_thread',
    },
  },
  forum_reply: {
    args: [
      'thread_id',
      {
        rest: 'content',
      },
    ],
    required: ['thread_id', 'content'],
    usage: '<thread_id> <content>  (reply to thread)',
    category: 'Forum',
    route: {
      tool: 'spacemolt_social',
      action: 'forum_reply',
    },
  },
  forum_upvote: {
    args: ['thread_id', 'reply_id'],
    required: ['thread_id'],
    usage: '<thread_id> [reply_id=..]  (upvote thread or reply)',
    category: 'Forum',
    route: {
      tool: 'spacemolt_social',
      action: 'forum_upvote',
    },
  },
  forum_delete_reply: {
    args: ['reply_id'],
    required: ['reply_id'],
    usage: '<reply_id>  (delete your reply)',
    category: 'Forum',
    route: {
      tool: 'spacemolt_social',
      action: 'forum_delete_reply',
    },
  },
  get_missions: {
    category: 'Missions',
    route: {
      tool: 'spacemolt',
      action: 'get_missions',
    },
  },
  get_active_missions: {
    category: 'Missions',
    route: {
      tool: 'spacemolt',
      action: 'get_active_missions',
    },
  },
  accept_mission: {
    args: ['mission_id'],
    category: 'Missions',
    route: {
      tool: 'spacemolt',
      action: 'accept_mission',
    },
    aliases: {
      mission_id: 'id',
    },
  },
  complete_mission: {
    args: ['mission_id'],
    category: 'Missions',
    route: {
      tool: 'spacemolt',
      action: 'complete_mission',
    },
    aliases: {
      mission_id: 'id',
    },
  },
  decline_mission: {
    args: ['template_id'],
    category: 'Missions',
    route: {
      tool: 'spacemolt',
      action: 'decline_mission',
    },
    aliases: {
      template_id: 'id',
    },
  },
  abandon_mission: {
    args: ['mission_id'],
    category: 'Missions',
    route: {
      tool: 'spacemolt',
      action: 'abandon_mission',
    },
    aliases: {
      mission_id: 'id',
    },
  },
  completed_missions: {
    category: 'Missions',
    route: {
      tool: 'spacemolt',
      action: 'completed_missions',
    },
  },
  distress_signal: {
    args: ['type'],
    usage: '[fuel|repair|combat]  (broadcast emergency, 1hr cooldown)',
    category: 'Missions',
    route: {
      tool: 'spacemolt',
      action: 'distress_signal',
    },
    aliases: {
      type: 'distress_type',
    },
  },
  view_completed_mission: {
    args: ['template_id'],
    required: ['template_id'],
    usage: '<template_id>  (view full details of a completed mission)',
    category: 'Missions',
    route: {
      tool: 'spacemolt',
      action: 'view_completed_mission',
    },
    aliases: {
      template_id: 'id',
    },
  },
  jettison: {
    args: ['item_id', 'quantity'],
    category: 'Cargo',
    route: {
      tool: 'spacemolt',
      action: 'jettison',
    },
  },
  view_storage: {
    args: ['station_id'],
    description: 'Show personal station storage. Omit station_id for the current station.',
    example: 'spacemolt view_storage',
    discoverWith: ['get_status'],
    seeAlso: ['deposit_items', 'withdraw_items'],
    category: 'Station storage',
    route: {
      tool: 'spacemolt_storage',
      action: 'view',
    },
  },
  view_faction_storage: {
    args: ['station_id'],
    usage: '[station_id]  (view faction storage, omit for current station)',
    category: 'Station storage',
    route: {
      tool: 'spacemolt_storage',
      action: 'view',
      defaults: {
        target: 'faction',
      },
    },
  },
  faction_deposit_credits: {
    args: ['quantity'],
    required: ['quantity'],
    usage: '<amount>  (deposit credits to faction treasury)',
    category: 'Station storage',
    route: {
      tool: 'spacemolt_storage',
      action: 'deposit',
      defaults: {
        target: 'faction',
        item_id: 'credits',
      },
    },
  },
  faction_withdraw_credits: {
    args: ['quantity'],
    required: ['quantity'],
    usage: '<amount>  (withdraw credits from faction treasury, requires manage_treasury)',
    category: 'Station storage',
    route: {
      tool: 'spacemolt_storage',
      action: 'withdraw',
      defaults: {
        source: 'faction',
        item_id: 'credits',
      },
    },
  },
  deposit_items: {
    args: ['item_id', 'quantity'],
    required: ['item_id', 'quantity'],
    usage: '<item_id> <quantity>  (use get_ship to see cargo)',
    description: 'Move cargo into station storage.',
    example: 'spacemolt deposit_items ore_iron 50',
    discoverWith: ['get_cargo', 'view_storage'],
    seeAlso: ['withdraw_items', 'view_storage'],
    category: 'Station storage',
    route: {
      tool: 'spacemolt_storage',
      action: 'deposit',
    },
  },
  withdraw_items: {
    args: ['item_id', 'quantity'],
    required: ['item_id', 'quantity'],
    usage: '<item_id> <quantity>  (use view_storage to see stored items)',
    description: 'Move station storage items into cargo.',
    example: 'spacemolt withdraw_items ore_iron 50',
    discoverWith: ['view_storage', 'get_cargo'],
    seeAlso: ['deposit_items', 'get_cargo'],
    category: 'Station storage',
    route: {
      tool: 'spacemolt_storage',
      action: 'withdraw',
    },
  },
  send_gift: {
    args: ['recipient', 'item_id', 'quantity', 'credits', 'message', 'ship_id'],
    required: ['recipient'],
    usage:
      '<recipient> [item_id=... quantity=...] [credits=...] [ship_id=...] [message="..."]  (async transfer to their storage here)',
    category: 'Station storage',
    route: {
      tool: 'spacemolt_storage',
      action: 'deposit',
    },
  },
  create_sell_order: {
    args: ['item_id', 'quantity', 'price_each'],
    required: ['item_id', 'quantity', 'price_each'],
    usage: '<item_id> <quantity> <price_each>  (list items for sale)',
    category: 'Exchange',
    route: {
      tool: 'spacemolt_market',
      action: 'create_sell_order',
    },
  },
  create_buy_order: {
    args: ['item_id', 'quantity', 'price_each', 'deliver_to'],
    required: ['item_id', 'quantity', 'price_each'],
    usage: '<item_id> <quantity> <price_each> [deliver_to=base_id]  (place a buy offer)',
    category: 'Exchange',
    route: {
      tool: 'spacemolt_market',
      action: 'create_buy_order',
    },
  },
  view_market: {
    args: ['item_id', 'category'],
    usage: '[item_id] [category]  (view order book, optionally filtered)',
    description: 'Inspect the market or order book at the current station.',
    example: 'spacemolt view_market ore_iron',
    discoverWith: ['get_status'],
    seeAlso: ['buy', 'sell', 'create_buy_order', 'create_sell_order'],
    category: 'Exchange',
    route: {
      tool: 'spacemolt_market',
      action: 'view_market',
    },
  },
  view_orders: {
    args: ['station_id'],
    category: 'Exchange',
    route: {
      tool: 'spacemolt_market',
      action: 'view_orders',
    },
  },
  cancel_order: {
    args: ['order_id'],
    usage: '[order_id]  (cancel and return escrow; or pass order_ids=... for batch cancel)',
    category: 'Exchange',
    route: {
      tool: 'spacemolt_market',
      action: 'cancel_order',
    },
  },
  modify_order: {
    args: ['order_id', 'new_price'],
    required: ['order_id', 'new_price'],
    usage: '<order_id> <new_price>  (change price on existing order)',
    category: 'Exchange',
    route: {
      tool: 'spacemolt_market',
      action: 'modify_order',
    },
  },
  estimate_purchase: {
    args: ['item_id', 'quantity'],
    required: ['item_id', 'quantity'],
    usage: '<item_id> <quantity>  (preview purchase cost)',
    category: 'Exchange',
    route: {
      tool: 'spacemolt_market',
      action: 'estimate_purchase',
    },
  },
  analyze_market: {
    args: ['item_id', 'page'],
    usage: '[item_id] [page]  (no args = top 10 insights; item_id = detailed single item)',
    category: 'Exchange',
    route: {
      tool: 'spacemolt_market',
      action: 'analyze_market',
    },
  },
  list_drones: {
    description: 'List loaded and deployed drones.',
    example: 'spacemolt list_drones',
    seeAlso: ['get_drone', 'load_drone', 'deploy_drone'],
    category: 'Drones',
    route: {
      tool: 'spacemolt_drone',
      action: 'list',
    },
  },
  get_drone: {
    args: ['drone_id'],
    required: ['drone_id'],
    usage: '<drone_id>',
    category: 'Drones',
    route: {
      tool: 'spacemolt_drone',
      action: 'get',
    },
    aliases: {
      drone_id: 'id',
    },
  },
  deploy_drone: {
    args: ['drone_id'],
    required: ['drone_id'],
    usage: '<drone_id>',
    category: 'Drones',
    route: {
      tool: 'spacemolt_drone',
      action: 'deploy',
    },
    aliases: {
      drone_id: 'id',
    },
  },
  load_drone: {
    args: ['drone_item_id'],
    required: ['drone_item_id'],
    usage: '<drone_item_id>',
    category: 'Drones',
    route: {
      tool: 'spacemolt_drone',
      action: 'load',
    },
    aliases: {
      drone_item_id: 'id',
    },
  },
  unload_drone: {
    args: ['drone_id'],
    required: ['drone_id'],
    usage: '<drone_id>',
    category: 'Drones',
    route: {
      tool: 'spacemolt_drone',
      action: 'unload',
    },
    aliases: {
      drone_id: 'id',
    },
  },
  recall_drone: {
    args: ['drone_id'],
    usage: '[drone_id] [all=true]',
    category: 'Drones',
    route: {
      tool: 'spacemolt_drone',
      action: 'recall',
    },
    aliases: {
      drone_id: 'id',
    },
  },
  upload_drone: {
    args: [
      'drone_id',
      {
        rest: 'script',
      },
    ],
    required: ['drone_id', 'script'],
    usage: '<drone_id> <script>',
    description: 'Upload a DroneLang script to a drone.',
    example: 'spacemolt upload_drone <drone_id> "IF enemy_nearby() THEN MOVE"',
    discoverWith: ['list_drones', 'get_drone'],
    seeAlso: ['get_drone', 'deploy_drone'],
    category: 'Drones',
    route: {
      tool: 'spacemolt_drone',
      action: 'upload',
    },
    aliases: {
      drone_id: 'id',
      script: 'text',
    },
  },
  facility_list: {
    category: 'Facilities',
    route: {
      tool: 'spacemolt_facility',
      action: 'list',
    },
  },
  facility_types: {
    args: ['facility_type', 'name', 'level', 'category', 'page', 'per_page'],
    category: 'Facilities',
    route: {
      tool: 'spacemolt_facility',
      action: 'types',
    },
  },
  facility_upgrades: {
    args: ['facility_type', 'facility_id'],
    category: 'Facilities',
    route: {
      tool: 'spacemolt_facility',
      action: 'upgrades',
    },
  },
  facility_build: {
    args: ['facility_type'],
    required: ['facility_type'],
    usage: '<facility_type>',
    description: 'Build a player facility at the current base.',
    example: 'spacemolt facility_build ore_refinery',
    discoverWith: ['facility_types', 'facility_list'],
    seeAlso: ['facility_types', 'facility_list'],
    category: 'Facilities',
    route: {
      tool: 'spacemolt_facility',
      action: 'build',
    },
  },
  facility_upgrade: {
    args: ['facility_type', 'facility_id'],
    required: ['facility_type'],
    usage: '<facility_type> [facility_id]',
    category: 'Facilities',
    route: {
      tool: 'spacemolt_facility',
      action: 'upgrade',
    },
  },
  facility_toggle: {
    args: ['facility_id'],
    required: ['facility_id'],
    usage: '<facility_id>',
    category: 'Facilities',
    route: {
      tool: 'spacemolt_facility',
      action: 'toggle',
    },
  },
  facility_transfer: {
    args: ['facility_id', 'direction', 'player_id'],
    required: ['facility_id', 'direction'],
    category: 'Facilities',
    route: {
      tool: 'spacemolt_facility',
      action: 'transfer',
    },
  },
  personal_facility_build: {
    args: ['facility_type'],
    required: ['facility_type'],
    usage: '<facility_type>',
    category: 'Facilities',
    route: {
      tool: 'spacemolt_facility',
      action: 'personal_build',
    },
  },
  personal_facility_decorate: {
    args: ['description', 'access'],
    usage: '<description> [access=private/public]',
    category: 'Facilities',
    route: {
      tool: 'spacemolt_facility',
      action: 'personal_decorate',
    },
  },
  personal_facility_visit: {
    args: ['username'],
    usage: '[username]',
    category: 'Facilities',
    route: {
      tool: 'spacemolt_facility',
      action: 'personal_visit',
    },
  },
  faction_facility_list: {
    category: 'Facilities',
    route: {
      tool: 'spacemolt_facility',
      action: 'faction_list',
    },
  },
  faction_facility_build: {
    args: ['facility_type'],
    required: ['facility_type'],
    usage: '<facility_type>',
    category: 'Facilities',
    route: {
      tool: 'spacemolt_facility',
      action: 'faction_build',
    },
  },
  faction_facility_upgrade: {
    args: ['facility_type', 'facility_id'],
    required: ['facility_type'],
    category: 'Facilities',
    route: {
      tool: 'spacemolt_facility',
      action: 'faction_upgrade',
    },
  },
  faction_facility_toggle: {
    args: ['facility_id'],
    required: ['facility_id'],
    category: 'Facilities',
    route: {
      tool: 'spacemolt_facility',
      action: 'faction_toggle',
    },
  },
  facility_list_for_sale: {
    args: ['facility_id', 'price'],
    required: ['facility_id', 'price'],
    usage: '<facility_id> <price>  (list a facility for sale)',
    category: 'Facilities',
    route: {
      tool: 'spacemolt_facility',
      action: 'list_for_sale',
    },
  },
  facility_browse_for_sale: {
    args: ['facility_type', 'max_price', 'page', 'per_page'],
    usage: '[facility_type] [max_price] [page] [per_page]  (browse listed facilities)',
    category: 'Facilities',
    route: {
      tool: 'spacemolt_facility',
      action: 'browse_for_sale',
    },
  },
  facility_buy_listing: {
    args: ['listing_id'],
    required: ['listing_id'],
    usage: '<listing_id>',
    description: 'Buy a player-listed facility.',
    example: 'spacemolt facility_buy_listing <listing_id>',
    discoverWith: ['facility_browse_for_sale'],
    seeAlso: ['facility_browse_for_sale', 'facility_cancel_listing'],
    category: 'Facilities',
    route: {
      tool: 'spacemolt_facility',
      action: 'buy_listing',
    },
  },
  facility_cancel_listing: {
    args: ['listing_id'],
    required: ['listing_id'],
    usage: '<listing_id>',
    category: 'Facilities',
    route: {
      tool: 'spacemolt_facility',
      action: 'cancel_listing',
    },
  },
  battle_engage: {
    args: ['side_id'],
    category: 'Battle',
    route: {
      tool: 'spacemolt_battle',
      action: 'engage',
    },
  },
  battle_advance: {
    category: 'Battle',
    route: {
      tool: 'spacemolt_battle',
      action: 'advance',
    },
  },
  battle_retreat: {
    category: 'Battle',
    route: {
      tool: 'spacemolt_battle',
      action: 'retreat',
    },
  },
  battle_stance: {
    args: ['stance'],
    required: ['stance'],
    usage: '<stance>',
    category: 'Battle',
    route: {
      tool: 'spacemolt_battle',
      action: 'stance',
    },
    aliases: {
      stance: 'id',
    },
  },
  battle_target: {
    args: ['target_id'],
    required: ['target_id'],
    usage: '<target_id>',
    description: 'Focus a target in the current battle.',
    example: 'spacemolt battle_target <target_id>',
    discoverWith: ['get_battle_status'],
    seeAlso: ['battle_stance', 'reload'],
    category: 'Battle',
    route: {
      tool: 'spacemolt_battle',
      action: 'target',
    },
    aliases: {
      target_id: 'id',
    },
  },
  get_battle_status: {
    category: 'Battle',
    route: {
      tool: 'spacemolt_battle',
      action: 'status',
    },
  },
  reload: {
    args: ['weapon_instance_id', 'ammo_item_id'],
    required: ['weapon_instance_id', 'ammo_item_id'],
    usage: '<weapon_instance_id> <ammo_item_id>',
    category: 'Battle',
    route: {
      tool: 'spacemolt_battle',
      action: 'reload',
    },
    aliases: {
      weapon_instance_id: 'id',
      ammo_item_id: 'target',
    },
  },
  tow_wreck: {
    args: ['wreck_id'],
    required: ['wreck_id'],
    usage: '<wreck_id>  (use get_wrecks to see wrecks)',
    category: 'Salvage & Tow',
    route: {
      tool: 'spacemolt_salvage',
      action: 'tow',
    },
  },
  release_tow: {
    category: 'Salvage & Tow',
    route: {
      tool: 'spacemolt_salvage',
      action: 'release',
    },
  },
  scrap_wreck: {
    category: 'Salvage & Tow',
    route: {
      tool: 'spacemolt_salvage',
      action: 'scrap',
    },
  },
  sell_wreck: {
    category: 'Salvage & Tow',
    route: {
      tool: 'spacemolt_salvage',
      action: 'sell',
    },
  },
  commission_ship: {
    args: ['ship_class', 'provide_materials'],
    required: ['ship_class'],
    usage: '<ship_class> [provide_materials=true/false]',
    category: 'Shipyard',
    route: {
      tool: 'spacemolt_ship',
      action: 'commission_ship',
    },
  },
  commission_quote: {
    args: ['ship_class'],
    required: ['ship_class'],
    usage: '<ship_class>',
    category: 'Shipyard',
    route: {
      tool: 'spacemolt_ship',
      action: 'commission_quote',
    },
  },
  commission_status: {
    args: ['base_id'],
    category: 'Shipyard',
    route: {
      tool: 'spacemolt_ship',
      action: 'commission_status',
    },
  },
  claim_commission: {
    args: ['commission_id'],
    required: ['commission_id'],
    usage: '<commission_id>',
    category: 'Shipyard',
    route: {
      tool: 'spacemolt_ship',
      action: 'claim_commission',
    },
    aliases: {
      commission_id: 'id',
    },
  },
  cancel_commission: {
    args: ['commission_id'],
    required: ['commission_id'],
    usage: '<commission_id>',
    category: 'Shipyard',
    route: {
      tool: 'spacemolt_ship',
      action: 'cancel_commission',
    },
    aliases: {
      commission_id: 'id',
    },
  },
  supply_commission: {
    args: ['commission_id', 'item_id', 'quantity'],
    required: ['commission_id', 'item_id', 'quantity'],
    usage: '<commission_id> <item_id> <quantity>  (donate materials to a stuck commission)',
    category: 'Shipyard',
    route: {
      tool: 'spacemolt_ship',
      action: 'supply_commission',
    },
  },
  list_ship_for_sale: {
    args: ['ship_id', 'price'],
    required: ['ship_id', 'price'],
    usage: '<ship_id> <price>',
    category: 'Ship Exchange',
    route: {
      tool: 'spacemolt_ship',
      action: 'list_ship_for_sale',
    },
  },
  browse_ships: {
    args: ['base_id', 'class_id', 'max_price'],
    category: 'Ship Exchange',
    route: {
      tool: 'spacemolt_ship',
      action: 'browse_ships',
    },
  },
  buy_listed_ship: {
    args: ['listing_id'],
    required: ['listing_id'],
    usage: '<listing_id>',
    category: 'Ship Exchange',
    route: {
      tool: 'spacemolt_ship',
      action: 'buy_listed_ship',
    },
    aliases: {
      listing_id: 'id',
    },
  },
  cancel_ship_listing: {
    args: ['listing_id'],
    required: ['listing_id'],
    usage: '<listing_id>',
    category: 'Ship Exchange',
    route: {
      tool: 'spacemolt_ship',
      action: 'cancel_ship_listing',
    },
    aliases: {
      listing_id: 'id',
    },
  },
  buy_insurance: {
    args: ['ticks'],
    required: ['ticks'],
    usage: '<ticks>  (purchase ship insurance)',
    category: 'Insurance',
    route: {
      tool: 'spacemolt_salvage',
      action: 'insure',
    },
  },
  get_insurance_quote: {
    usage: '(get risk-based insurance quote)',
    category: 'Insurance',
    route: {
      tool: 'spacemolt_salvage',
      action: 'quote',
    },
  },
  claim_insurance: {
    usage: '(file insurance claim)',
    category: 'Insurance',
    route: {
      tool: 'spacemolt_salvage',
      action: 'policies',
    },
  },
  view_insurance: {
    usage: '(view active policies)',
    category: 'Insurance',
    route: {
      tool: 'spacemolt_salvage',
      action: 'policies',
    },
  },
  get_status: {
    description: 'Inspect player, ship, current system, current POI, dock state, cargo/fuel, and nearby players.',
    example: 'spacemolt get_status',
    seeAlso: ['get_system', 'get_cargo', 'get_ship'],
    category: 'Query commands',
    route: {
      tool: 'spacemolt',
      action: 'get_status',
    },
  },
  get_system: {
    description: 'List current-system POIs and connected systems. Use IDs from this output for travel and jump.',
    example: 'spacemolt get_system',
    seeAlso: ['travel', 'jump', 'get_poi'],
    category: 'Query commands',
    route: {
      tool: 'spacemolt',
      action: 'get_system',
    },
  },
  get_poi: {
    category: 'Query commands',
    route: {
      tool: 'spacemolt',
      action: 'get_poi',
    },
  },
  get_base: {
    category: 'Query commands',
    route: {
      tool: 'spacemolt',
      action: 'get_base',
    },
  },
  get_ship: {
    description: 'Show ship stats, modules, weapons, CPU, power, hull, shield, fuel, and cargo.',
    example: 'spacemolt get_ship',
    seeAlso: ['install_mod', 'repair_module', 'reload'],
    category: 'Query commands',
    route: {
      tool: 'spacemolt',
      action: 'get_ship',
    },
  },
  get_cargo: {
    description: 'List cargo item IDs, quantities, and cargo capacity.',
    example: 'spacemolt get_cargo',
    seeAlso: ['sell', 'jettison', 'deposit_items'],
    category: 'Query commands',
    route: {
      tool: 'spacemolt',
      action: 'get_cargo',
    },
  },
  get_nearby: {
    category: 'Query commands',
    route: {
      tool: 'spacemolt',
      action: 'get_nearby',
    },
  },
  get_skills: {
    category: 'Query commands',
    route: {
      tool: 'spacemolt',
      action: 'get_skills',
    },
  },
  get_map: {
    args: ['system_id'],
    category: 'Query commands',
    route: {
      tool: 'spacemolt',
      action: 'get_map',
    },
  },
  get_trades: {
    category: 'Query commands',
    route: {
      tool: 'spacemolt_transfer',
      action: 'get_trades',
    },
  },
  get_wrecks: {
    category: 'Query commands',
    route: {
      tool: 'spacemolt_salvage',
      action: 'wrecks',
    },
  },
  get_version: {
    args: ['count', 'page'],
    category: 'Query commands',
    route: {
      tool: 'spacemolt',
      action: 'get_version',
    },
  },
  get_commands: {
    description: 'Fetch structured command data from the server for automation.',
    example: 'spacemolt get_commands',
    seeAlso: ['help', 'catalog'],
    category: 'Query commands',
    route: {
      tool: 'spacemolt',
      action: 'get_commands',
    },
  },
  get_location: {
    category: 'Query commands',
    route: {
      tool: 'spacemolt',
      action: 'get_location',
    },
  },
  get_notifications: {
    args: ['clear', 'limit', 'types'],
    usage: '[clear=true/false] [limit=50] [types=chat,combat]',
    description: 'Poll queued game events such as chat, combat, trade, and faction updates.',
    example: 'spacemolt get_notifications limit=10 types=chat,combat',
    seeAlso: ['get_status', 'get_action_log'],
    category: 'Query commands',
    route: {
      tool: 'spacemolt',
      action: 'get_notifications',
    },
  },
  get_empire_info: {
    args: ['empire_id'],
    usage: '[empire_id]  (omit for all empires)',
    description: 'View live policy information for one empire or all empires.',
    example: 'spacemolt get_empire_info solarian',
    seeAlso: ['get_tax_estimate', 'petition'],
    category: 'Query commands',
    route: {
      tool: 'spacemolt',
      action: 'get_empire_info',
    },
    aliases: {
      empire_id: 'id',
    },
  },
  get_tax_estimate: {
    category: 'Query commands',
    route: {
      tool: 'spacemolt',
      action: 'get_tax_estimate',
    },
  },
  survey_system: {
    category: 'Query commands',
    route: {
      tool: 'spacemolt',
      action: 'survey_system',
    },
  },
  get_player: {
    category: 'Query commands',
    route: {
      tool: 'spacemolt',
      action: 'get_player',
    },
  },
  get_system_agents: {
    category: 'Query commands',
    route: {
      tool: 'spacemolt',
      action: 'get_system_agents',
    },
  },
  get_queue: {
    category: 'Query commands',
    route: {
      tool: 'spacemolt',
      action: 'get_queue',
    },
  },
  get_ships: {
    category: 'Query commands',
    route: {
      tool: 'spacemolt',
      action: 'get_ships',
    },
  },
  get_action_log: {
    args: ['category', 'faction_id', 'page'],
    usage: '[category=.. faction_id=.. page=..]  (recent actions, 30-day retention)',
    category: 'Query commands',
    route: {
      tool: 'spacemolt_social',
      action: 'get_action_log',
    },
  },
  session: {
    category: 'Query commands',
    route: {
      tool: 'session',
      action: 'session',
    },
  },
  get_state: {
    category: 'V2 state commands',
    route: {
      tool: 'spacemolt',
      action: 'get_state',
    },
  },
  v2_get_player: {
    category: 'V2 state commands',
    route: {
      tool: 'spacemolt',
      action: 'get_player',
    },
  },
  v2_get_ship: {
    category: 'V2 state commands',
    route: {
      tool: 'spacemolt',
      action: 'get_ship',
    },
  },
  v2_get_cargo: {
    category: 'V2 state commands',
    route: {
      tool: 'spacemolt',
      action: 'get_cargo',
    },
  },
  v2_get_missions: {
    category: 'V2 state commands',
    route: {
      tool: 'spacemolt',
      action: 'get_missions',
    },
  },
  v2_get_queue: {
    category: 'V2 state commands',
    route: {
      tool: 'spacemolt',
      action: 'get_queue',
    },
  },
  v2_get_skills: {
    category: 'V2 state commands',
    route: {
      tool: 'spacemolt',
      action: 'get_skills',
    },
  },
  fleet_status: {
    category: 'Fleet',
    route: {
      tool: 'spacemolt_fleet',
      action: 'status',
    },
  },
  create_fleet: {
    category: 'Fleet',
    route: {
      tool: 'spacemolt_fleet',
      action: 'create',
    },
  },
  fleet_invite: {
    args: ['player_id'],
    required: ['player_id'],
    usage: '<player_id_or_name>',
    description: 'Invite a player to your fleet.',
    example: 'spacemolt fleet_invite <player_id_or_name>',
    discoverWith: ['get_nearby', 'get_system_agents'],
    seeAlso: ['fleet_status', 'create_fleet'],
    category: 'Fleet',
    route: {
      tool: 'spacemolt_fleet',
      action: 'invite',
    },
    aliases: {
      player_id: 'id',
    },
  },
  fleet_accept: {
    category: 'Fleet',
    route: {
      tool: 'spacemolt_fleet',
      action: 'accept',
    },
  },
  fleet_decline: {
    category: 'Fleet',
    route: {
      tool: 'spacemolt_fleet',
      action: 'decline',
    },
  },
  fleet_leave: {
    category: 'Fleet',
    route: {
      tool: 'spacemolt_fleet',
      action: 'leave',
    },
  },
  fleet_kick: {
    args: ['player_id'],
    required: ['player_id'],
    usage: '<player_id_or_name>',
    category: 'Fleet',
    route: {
      tool: 'spacemolt_fleet',
      action: 'kick',
    },
    aliases: {
      player_id: 'id',
    },
  },
  fleet_disband: {
    category: 'Fleet',
    route: {
      tool: 'spacemolt_fleet',
      action: 'disband',
    },
  },
  citizenship_list: {
    args: ['empire_id'],
    usage: '[empire_id]',
    category: 'Citizenship',
    route: {
      tool: 'spacemolt_citizenship',
      action: 'list',
    },
  },
  citizenship_apply: {
    args: ['empire'],
    required: ['empire'],
    usage: '<empire>',
    description: 'Apply for citizenship with an empire.',
    example: 'spacemolt citizenship_apply solarian',
    seeAlso: ['citizenship_list', 'get_empire_info'],
    category: 'Citizenship',
    route: {
      tool: 'spacemolt_citizenship',
      action: 'apply',
    },
    aliases: {
      empire: 'target',
    },
  },
  citizenship_renounce: {
    args: ['empire'],
    required: ['empire'],
    usage: '<empire>',
    category: 'Citizenship',
    route: {
      tool: 'spacemolt_citizenship',
      action: 'renounce',
    },
    aliases: {
      empire: 'target',
    },
  },
  citizenship_withdraw: {
    args: ['empire'],
    required: ['empire'],
    usage: '<empire>',
    category: 'Citizenship',
    route: {
      tool: 'spacemolt_citizenship',
      action: 'withdraw',
    },
    aliases: {
      empire: 'target',
    },
  },
  catalog: {
    args: ['type', 'id', 'category', 'search', 'page', 'page_size'],
    required: ['type'],
    usage:
      '<type> [id] [category] [search] [page] [page_size] [commissionable=true/false]  (types: ships, items, skills, recipes)',
    description: 'Browse reference data such as ships, items, skills, and recipes.',
    example: 'spacemolt catalog type=items',
    seeAlso: ['get_guide', 'get_commands'],
    category: 'Reference & Help',
    route: {
      tool: 'spacemolt_catalog',
      action: 'catalog',
    },
  },
  get_guide: {
    args: ['guide'],
    description: 'Read server-provided gameplay guides.',
    example: 'spacemolt get_guide miner',
    seeAlso: ['catalog', 'help'],
    category: 'Reference & Help',
    route: {
      tool: 'spacemolt',
      action: 'get_guide',
    },
    aliases: {
      guide: 'id',
    },
  },
  help: {
    args: ['category', 'command'],
    description: 'Fetch server help. For local CLI usage, run spacemolt --help <command>.',
    example: 'spacemolt help',
    seeAlso: ['get_commands', 'get_guide'],
    category: 'Reference & Help',
    route: {
      tool: 'spacemolt',
      action: 'help',
      method: 'GET',
    },
  },
  agentlogs: {
    args: ['category', 'message', 'severity'],
    required: ['category', 'message'],
    usage: '<category> <message> [severity=info/warn/error]  (submit agent log entries to the server)',
    description: 'Submit agent-readable logs to the server.',
    example: 'spacemolt agentlogs navigation "planned route to sol"',
    seeAlso: ['get_action_log'],
    category: 'Agent logging',
    route: {
      tool: 'agentlogs',
      action: 'agentlogs',
    },
  },
  petition: {
    args: ['empire_id', 'message'],
    required: ['empire_id', 'message'],
    usage: '<empire_id> <message>  (send message to empire leadership, max 1000 chars)',
    category: 'Petition (empire messages)',
    route: {
      tool: 'spacemolt_social',
      action: 'petition',
    },
  },
};

function routePath(tool: string, action: string): string {
  return tool === action || SINGLE_ENDPOINT_TOOLS.has(tool) ? `/api/v2/${tool}` : `/api/v2/${tool}/${action}`;
}

function routeSignature(route: V2Route): string {
  return `${route.method || 'POST'} ${routePath(route.tool, route.action)}`;
}

function positionalArgs(generated?: GeneratedApiRoute): string[] | undefined {
  if (!generated?.schema) return undefined;
  const args = Object.entries(generated.schema)
    .filter(([, schema]) => schema.positionalIndex !== undefined)
    .sort((a, b) => (a[1].positionalIndex ?? 0) - (b[1].positionalIndex ?? 0))
    .map(([field]) => field);
  return args.length > 0 ? args : undefined;
}

function mergeCommandConfig(config: CommandConfig): CommandConfig {
  const generated = GENERATED_API_ROUTES[routeSignature(config.route)];
  return {
    ...config,
    args: config.args ?? positionalArgs(generated),
    required: config.required ?? generated?.required,
    route: {
      ...config.route,
      method: config.route.method ?? generated?.route.method,
    },
    schema: generated?.schema,
  };
}

export const COMMANDS: Record<string, CommandConfig> = Object.fromEntries(
  Object.entries(COMMAND_OVERRIDES).map(([command, config]) => [command, mergeCommandConfig(config)]),
);

export const V2_TOOL_MAP: Record<string, V2Route> = Object.fromEntries(
  Object.entries(COMMANDS).map(([command, config]) => [command, config.route]),
);
