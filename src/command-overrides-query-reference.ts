import type { CommandOverride } from './commands';

export const QUERY_REFERENCE_COMMAND_OVERRIDES: Record<string, CommandOverride> = {
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
    usage: '[--top N|--limit N] [--show-empty]',
    description:
      'List cargo item IDs, quantities, and cargo capacity. Table output hides empty stacks and sorts by quantity.',
    example: 'spacemolt get_cargo --top 10',
    seeAlso: ['sell', 'jettison', 'deposit_items'],
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_cargo',
    aliases: {
      limit: 'top',
    },
    schemaExtensions: {
      top: {
        type: 'integer',
        description: 'Client-side display limit for the largest cargo stacks.',
      },
      show_empty: {
        type: 'boolean',
        description: 'Client-side display flag to include zero-quantity cargo stacks.',
      },
    },
    clientOnlyFields: ['top', 'show_empty'],
  },
  get_nearby: {
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_nearby',
  },
  list_passengers: {
    description: 'List passengers currently aboard your ship.',
    category: 'Passenger Transport',
    apiRoute: 'POST /api/v2/spacemolt/list_passengers',
  },
  list_station_passengers: {
    usage: '[station_id_or_name]',
    description: 'List citizens waiting for transport at a station',
    category: 'Passenger Transport',
    apiRoute: 'POST /api/v2/spacemolt/list_station_passengers',
    positionals: ['station_id'],
    aliases: {
      station_id: 'id',
    },
  },
  load_passenger: {
    usage: '<destination_station_id_or_name>',
    description: 'Load waiting passengers bound for a destination into your passenger berths.',
    category: 'Passenger Transport',
    apiRoute: 'POST /api/v2/spacemolt/load_passenger',
    positionals: ['destination'],
    aliases: {
      destination: 'id',
    },
  },
  unload_passenger: {
    usage: '<passenger_name_or_id_or_all>',
    description: 'Put one passenger, or every passenger with "all", off the ship at the current station.',
    category: 'Passenger Transport',
    apiRoute: 'POST /api/v2/spacemolt/unload_passenger',
    positionals: ['id'],
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
    description: 'Show current system, current POI, docking state, nearby players, and nearby NPCs.',
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
  notifications: {
    description: 'Poll pending notifications',
    example: 'spacemolt notifications',
    seeAlso: ['get_notifications', 'get_status'],
    category: 'Query commands',
    apiRoute: 'GET /api/v2/notifications',
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
    description: 'Show your player profile, credits, empire, faction, home base, and standings.',
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_player',
  },
  get_system_agents: {
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_system_agents',
  },
  get_queue: {
    description: 'Show whether you have a queued action pending.',
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_queue',
  },
  get_ships: {
    description: 'Unavailable; use browse_ships for station listings or commission_ship to order a custom build.',
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_ships',
  },
  get_action_log: {
    usage: '[category=.. event_type=.. faction_id=.. page=..]  (recent actions, 30-day retention)',
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt_social/get_action_log',
    positionals: ['category', 'faction_id', 'page'],
  },
  session: {
    description: 'Create a fresh API session and print instructions for using it.',
    category: 'Query commands',
    apiRoute: 'POST /api/v2/session',
  },
  get_state: {
    description: 'Show a full player status snapshot with location, ship, cargo, and nearby players.',
    category: 'V2 state commands',
    apiRoute: 'POST /api/v2/spacemolt/get_state',
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
  agentlogs: {
    usage: '<category> <message> [severity=info/warn/error]  (submit agent log entries to the server)',
    description: 'Disabled endpoint; formerly submitted agent-readable logs to the server.',
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
    positionals: [
      'empire_id',
      {
        rest: 'message',
      },
    ],
  },
};
