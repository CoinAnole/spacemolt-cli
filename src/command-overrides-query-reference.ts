import type { CommandOverride } from './commands';

export const NOTIFICATION_TYPE_ENUM = [
  'chat',
  'combat',
  'trade',
  'market',
  'crafting',
  'observation',
  'system',
] as const;

export const NOTIFICATION_TYPES_FIELD_DESCRIPTION =
  'Filter by notification types (chat, combat, trade, market, crafting, observation, system). Omit for all types. action_result, action_error, error, drone_adrift, server_restart_warning, battle_damage, drone_scan, drone_survey, pirate_radio, arena_challenge, arena_objective, personnel_update, refueled_by, and repaired_by fall back to system, not combat; types=combat does not include them. exchange_fill is under trade, so types=trade includes it. The exchange_fills channel starts muted and is sent on no transport, including this poll, until unmute_notifications channels=exchange_fills or all=true. order_id on that frame is the resting order; pass it to cancel_order or modify_order while a remainder remains. total is quantity times price_each and excludes sales tax. mission_objective_completed is the command on an action_result, not its own type. It uses that system fallback: omit types, or pass types=system; types=combat does not include it. pathfinder_arrival is the command on an action_result, not its own type. It uses that system fallback: omit types, or pass types=system; types=combat does not include it.';

export const QUERY_REFERENCE_COMMAND_OVERRIDES: Record<string, CommandOverride> = {
  get_status: {
    usage: '[--summary]',
    description:
      'Inspect player, ship, current system, current POI, dock state, cargo/fuel, and nearby players. When location.unknown_signature is true, table output prints "Unknown cloaked signature (not identified)." The server calls that presence only, near your sensor threshold. An area scan with no target_id is how a ship is resolved. A creature resolves only when your sensor rating is a full level above its cloak. The line does not name the contact. --summary does not print it. Passengers delivered prints when player.stats.passengers_delivered is a number or bigint, including 0. Each delivery counts once. Stranded and expired passengers do not count. The counter started at zero in gameserver 0.653.0. An omitted key prints nothing. --summary does not print this count.',
    example: 'spacemolt get_status --summary',
    seeAlso: ['get_system', 'get_cargo', 'get_ship'],
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_status',
    schemaExtensions: {
      summary: {
        type: 'boolean',
        description: 'Client-side display flag to print a compact player summary in default text output.',
      },
    },
    clientOnlyFields: ['summary'],
  },
  get_system: {
    description:
      'List current-system POIs and connected systems. Use IDs from this output for travel and jump. Each POI includes a ship count when your ship has a ship scanner: other uncloaked players (online, offline, and docked), pirates, empire NPCs, and leviathans. Your own ship and wildlife are not counted. It is a count, not a roster; ships at your POI are on get_nearby. Fuel and services are on get_poi.',
    example: 'spacemolt get_system',
    seeAlso: ['travel', 'jump', 'get_poi'],
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_system',
  },
  get_poi: {
    description:
      'Current POI details, resources, station services/fuel (when docked), wormhole prediction, hidden deposit reveal difficulty. Use get_system / get_location / get_base for consolidated views. When a station is present, table output prints the same Contraband mode and Contraband items lines as get_base. Smuggling skill still bypasses listed items.',
    seeAlso: ['arena_status'],
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_poi',
  },
  get_base: {
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_base',
    seeAlso: ['facility_repair', 'facility_list', 'view_market', 'storage'],
  },
  inspect: {
    usage: '<id>  (package:<id>, item, module, ship class, system, POI, or docked base)',
    description:
      'Look up a visible package, item, module, ship class, known system, current-system POI, or docked base by ID. A catalog block on this response uses type items for an item or module, and type ships for a ship class. Look up skills, recipes, and facilities with catalog, not inspect: spacemolt catalog type=skills id=refining, spacemolt catalog type=recipes, or spacemolt catalog type=facilities. Package instances use the package:<id> form (for example package:pkg_abc). Packages show contents, custodial owner, creator, and creator faction; systems/POIs include matching faction intel when available. Docked-base inspect prints the same repair queue, pirate replacement list, and sovereign mint report as get_base, including per-input buy order: yes or no and Price limits rows (station public buy and lowest public sell). Status price_limited is printed as sent and can appear while production continues. Those prices are a snapshot and are not a private spending ceiling. Sell only buy order: yes rows through the public market; check view_market for depth. An omitted pirate_recovery prints nothing. A shortage on that list is not a promise of payment. Check view_market and sell into public station buy orders. An uncharted hidden POI in this system is not found (not_found), the same as an unknown id. Docked-base inspect prints the same Contraband mode and Contraband items lines as get_base. Smuggling skill still bypasses listed items.',
    example: 'spacemolt inspect iron_ore',
    discoverWith: ['get_cargo', 'get_system', 'catalog', 'get_base'],
    seeAlso: ['get_cargo', 'get_system', 'get_poi', 'get_base', 'catalog', 'craft'],
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/inspect',
    positionals: ['id'],
  },
  get_ship: {
    usage: '[ship_id]  (omit for the hull you are flying; ID from list_ships or faction garages)',
    description:
      'Show stats, modules, weapons, CPU, power, hull, shield, fuel, and cargo for the ship you are flying, or for any other ship you own (parked, faction-garaged, or in a carrier bay) or any hull in your faction garage pool. Remote reads work from anywhere — no docking or travel. A remote hull names its location and omits drone_bay (drones stay with you). Current-ship output includes drone bay counters and racked drones when present.',
    example: 'spacemolt get_ship; spacemolt get_ship ship-abc; spacemolt get_ship ship_id=ship-abc',
    discoverWith: ['list_ships', 'faction_garages'],
    seeAlso: [
      'list_ships',
      'faction_garages',
      'switch_ship',
      'install_mod',
      'uninstall_mod',
      'reload',
      'list_drones',
      'get_drone',
    ],
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_ship',
    positionals: ['ship_id'],
    aliases: {
      ship_id: 'id',
    },
  },
  get_cargo: {
    usage: '[--items item_id,item_id] [--top N|--limit N] [--show-empty]',
    description:
      'List cargo item IDs, quantities, and cargo capacity. Table output hides empty stacks and sorts by quantity.',
    example: 'spacemolt get_cargo --items aluminum_ore,steel_plate --top 10',
    seeAlso: ['sell', 'jettison', 'storage'],
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
      items: {
        type: 'string',
        description: 'Client-side comma-separated exact item ID filter for text, JSON, and structured output.',
      },
    },
    clientOnlyFields: ['top', 'show_empty', 'items'],
  },
  get_nearby: {
    description:
      'Show visible nearby players, pirates, empire NPCs, wildlife creatures, and intact prizes at your current POI. Every animal in a wildlife herd is its own creature_id you can hunt. The list stops at 30 creatures; creature_count is the full number at this POI, including animals that are present but not listed. Prize rows provide actor_id for attack or scan and prize_id for claim_prize. Pirate names use crew primary_color / secondary_color (#RRGGBB) when the server sends them. Wild creatures are listed before branded livestock. A branded row keeps the server name, which already includes the faction tag, and adds the owner and ranch. When unknown_signature is true, table output prints "Unknown cloaked signature (not identified)." That line does not name a ship or a creature, and it does not mean scan will identify the contact.',
    example: 'spacemolt get_nearby',
    seeAlso: ['scan', 'hunt', 'survey_system', 'attack', 'claim_prize'],
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_nearby',
  },
  list_passengers: {
    description: 'List passengers currently aboard your ship.',
    category: 'Passenger Transport',
    apiRoute: 'POST /api/v2/spacemolt/list_passengers',
  },
  list_station_passengers: {
    description: 'List citizens waiting for transport at your current docked station.',
    category: 'Passenger Transport',
    apiRoute: 'POST /api/v2/spacemolt/list_station_passengers',
  },
  load_passenger: {
    usage: '<destination_station_id_or_name>  (station base ID, station POI ID, or name)',
    description:
      'Load waiting passengers bound for a destination into your passenger berths. Destination is a station base ID, station POI ID, or name.',
    category: 'Passenger Transport',
    apiRoute: 'POST /api/v2/spacemolt/load_passenger',
    positionals: ['destination'],
    aliases: {
      destination: 'id',
    },
  },
  unload_passenger: {
    usage: '<passenger_name_or_id_or_all> [target=lounge|<ship>]',
    description:
      'Put a passenger off the ship at the current station. Pass "all" to put every passenger off at once. For connecting flights, pass target=lounge to check them into your faction Transit Lounge, or target=<ship id or name> to transfer them to a docked ship (yours or a faction mate); fares and deadlines continue unchanged.',
    category: 'Passenger Transport',
    apiRoute: 'POST /api/v2/spacemolt/unload_passenger',
    positionals: ['id'],
  },
  get_skills: {
    seeAlso: ['catalog'],
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_skills',
  },
  get_achievements: {
    description: 'Show personal achievement progress, earned entries, points, titles, emblems, and share URLs.',
    example: 'spacemolt get_achievements',
    seeAlso: ['get_faction_achievements', 'get_player'],
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_achievements',
  },
  get_faction_achievements: {
    description:
      'Show faction achievement progress and earned faction entries. Human output prints a table. When an entry includes progress, the cell is current/target. The server sends counts only, not alcohol or dish names. The Whole Bar and House of Plenty are examples; any entry that includes progress prints the same way. An omitted progress object leaves that cell blank. JSON, YAML, and structured output are unchanged.',
    example: 'spacemolt get_faction_achievements',
    seeAlso: ['get_achievements', 'faction_info'],
    category: 'Faction',
    apiRoute: 'POST /api/v2/spacemolt/get_faction_achievements',
  },
  get_map: {
    usage: '[system_id]  (omit for all systems)',
    description:
      "View the galaxy chart: all systems, or one system's coordinates, connections, visit state, and chart description.",
    example: 'spacemolt get_map; spacemolt get_map sol',
    seeAlso: ['get_system', 'search_systems', 'find_route', 'get_location'],
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_map',
    positionals: ['system_id'],
  },
  get_trades: {
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt_transfer/get_trades',
  },
  get_wrecks: {
    description:
      'List wrecks and jettison containers at the current POI, including cargo and modules (name, type, instance ID). Ship and pirate wrecks persist until looted or salvaged. Jettison containers despawn after 10 minutes; matching cargo settles back into the POI\'s deposits. A leviathan that died of age can leave a body you still loot with loot_wreck; a Cloudwhale age-death body lasts about a day, and Expires tick / Expires at on that wreck are the lifetime. When carrion is present, table output prints Carrion: N (the amount that body adds to the system every wildlife pass, about 1 minute, while it lasts; it feeds the scavengers there). The line is omitted when carrion is absent. An explicit 0 prints Carrion: 0. Loot grammar is unchanged. A wreck or carcass stays at the POI where it died, including a hidden POI; pirate salvagers do not get a report for a hidden-POI wreck; until that POI is charted the kill text says "an uncharted location", and that phrase is the server message, so the CLI does not synthesize, rewrite, or special-case it in a formatter.',
    discoverWith: ['get_status'],
    seeAlso: ['loot_wreck', 'jettison', 'tow_wreck'],
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
    description:
      'Show current system, current POI, docking state, nearby players, nearby NPCs, and leviathans at this POI (name, id, species, stage, hull). aggressive means that stage attacks ships here and does not join a fight already in progress. The id is the creature_id for hunt while you are at its POI. When location.unknown_signature is true, table output prints "Unknown cloaked signature (not identified)." The server calls that presence only, near your sensor threshold. An area scan with no target_id is how a ship is resolved. A creature resolves only when your sensor rating is a full level above its cloak. The line does not name the contact.',
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_location',
  },
  get_mobile_base: {
    description:
      'Show the current system of the Frontier mobile capital base. Public endpoint — no login or profile required.',
    example: 'spacemolt get_mobile_base',
    seeAlso: ['get_location', 'get_system', 'faction_get_mobile_base'],
    category: 'Query commands',
    // Not present in the v2 OpenAPI; uses a standalone public root endpoint.
    route: {
      tool: 'public',
      action: 'mobile-base',
      method: 'GET',
      rootPath: 'wheres-mobile-base',
      publicUnauthenticated: true,
      bareResponse: true,
    },
  },
  get_player_profile: {
    description:
      "Look up another pilot's public profile by username. The server match ignores case and the response username keeps its registered capitalization. Table output shows empire, clan tag, status message, colors, join date, online (yes or no), titles, faction and role, a leaderboard snapshot time, lifetime stats, leaderboard placements, and an achievement summary. An omitted key prints nothing. An explicit 0 prints 0. An empty ranks array prints No top-N leaderboard placements using ranks_top_n. Never returns a system, POI, or docked station, cloaked or not, and table output does not print a location block even if a later payload includes one. Finding a pilot uses get_nearby or scan. An unknown username is player_not_found. Requires a logged-in profile. The argument is username, not name. This is not player_profile, which takes name, needs no session, and may include a location when the server sends one. Gameserver 0.636.0.",
    example: 'spacemolt get_player_profile "Vex Caldera"',
    seeAlso: ['player_profile', 'get_player', 'get_nearby', 'scan', 'faction_info'],
    category: 'Query commands',
    required: ['username'],
    positionals: ['username'],
    usage: '<username>',
    apiRoute: 'POST /api/v2/spacemolt/get_player_profile',
  },
  player_profile: {
    description:
      'Show a public pilot profile by username from GET /api/players/{name}: identity, stats, ranks, achievements, and location when the server sends it. No login required. The argument is name, not username. Cloaked location and hidden pilots follow server rules. This is not get_player_profile, which takes username.',
    example: 'spacemolt player_profile Arbiter47',
    seeAlso: ['get_player', 'faction_profile', 'get_achievements', 'get_player_profile'],
    category: 'Query commands',
    required: ['name'],
    positionals: ['name'],
    usage: '<name>',
    // Not present in the v2 OpenAPI; public web profile endpoint.
    route: {
      tool: 'public',
      action: 'player-profile',
      method: 'GET',
      rootPath: 'api/players/{name}',
      pathParams: ['name'],
      publicUnauthenticated: true,
      bareResponse: true,
    },
    schemaExtensions: {
      name: { type: 'string', description: 'Pilot username (public profile name).' },
    },
  },
  get_notifications: {
    usage: '[clear=true/false] [limit=50] [types=chat,combat,market,observation]',
    description:
      'Poll queued game events across chat, combat, trade, market, crafting, observation, and system categories. An exchange_fill frame is type trade and is omitted until the exchange_fills channel is unmuted. When an action_result in this response has command mission_objective_completed, table output prints the tick headline Mission objective completed (tick N). Objective lines are printed when result.missions is a V2 envelope. Partial progress does not use that command. It can sit immediately before another action_result. Both stay separate lines. Cached gameserver text sends that unsolicited frame on a v2 WebSocket. This CLI does not open a WebSocket. When an action_result in this response has command pathfinder_arrival, table output prints the tick headline Pathfinder arrival (tick N). The CLI prints that frame when a notifications array already contains it. Cached gameserver text describes that unsolicited frame as a WebSocket v2 push. This CLI does not open a WebSocket. An ok frame with action arrived, jumped, or pathfinder_arrival prints system, POI, from_system, and XP in the table message instead of a generic OK line.',
    example: 'spacemolt get_notifications limit=10 types=chat,market,observation',
    seeAlso: ['get_status', 'get_action_log', 'notifications', 'unmute_notifications', 'get_notification_settings'],
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_notifications',
    positionals: ['clear', 'limit', 'types'],
    arrayFields: ['types'],
    schemaExtensions: {
      types: {
        description: NOTIFICATION_TYPES_FIELD_DESCRIPTION,
      },
    },
  },
  notifications: {
    usage: '[clear=true/false] [limit=50] [types=chat,combat,market,observation]',
    description:
      'Poll pending game events via GET query parameters. Prefer get_notifications for the primary poll UX. An exchange_fill frame is type trade and is omitted until the exchange_fills channel is unmuted. When an action_result has command mission_objective_completed, it is formatted the same way as on get_notifications. When an action_result has command pathfinder_arrival, it is formatted the same way as on get_notifications. An ok frame with action arrived, jumped, or pathfinder_arrival is formatted the same way as on get_notifications. This CLI does not open a WebSocket.',
    example: 'spacemolt notifications limit=10 clear=false types=chat,observation',
    seeAlso: ['get_notifications', 'get_status', 'get_action_log', 'unmute_notifications', 'get_notification_settings'],
    category: 'Query commands',
    apiRoute: 'GET /api/v2/notifications',
    positionals: ['clear', 'limit', 'types'],
    arrayFields: ['types'],
    schemaExtensions: {
      limit: {
        type: 'integer',
        description: 'Max notifications to return (default: 50, max: 100).',
      },
      clear: {
        type: 'boolean',
        description: 'Remove returned notifications from queue (default: true). Set to false to peek without clearing.',
      },
      types: {
        type: 'array',
        enum: [...NOTIFICATION_TYPE_ENUM],
        description: NOTIFICATION_TYPES_FIELD_DESCRIPTION,
      },
    },
  },
  get_empire_info: {
    usage: '[empire_id]  (omit for all empires)',
    description: 'View live policy information for one empire or all empires.',
    example: 'spacemolt get_empire_info solarian',
    seeAlso: ['get_tax_estimate', 'get_faction_tax_estimate', 'petition', 'pay_bounty'],
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_empire_info',
    positionals: ['empire_id'],
    aliases: {
      empire_id: 'id',
    },
  },
  get_tax_estimate: {
    example: 'spacemolt get_tax_estimate',
    seeAlso: ['pay_bounty', 'prepay_tax', 'get_empire_info', 'get_guide'],
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_tax_estimate',
  },
  get_faction_tax_estimate: {
    description: "Preview your faction's corporate income tax bill, prepaid balance, and deductible expenses.",
    example: 'spacemolt get_faction_tax_estimate',
    seeAlso: ['get_tax_estimate', 'get_empire_info', 'faction_prepay_tax'],
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt_faction/tax_estimate',
  },
  survey_system: {
    description:
      "Scan the current system for hidden POIs, ore at every charted POI, a wildlife species census, and bloom status. Table output prints Deposits before Newly Revealed. With survey power above 0, deposits is the ore at every charted POI that has deposits, using the same resource lines as an already-known hidden POI and get_poi. Hidden POIs stay in Newly Revealed and Already Known. An empty deposits array prints Deposits: (none), or Deposits: (none — survey power 0 reads no ore) when survey power is 0. Rows still print when the server sends them. An anomaly detector alone (survey power 0) finds wormholes only: no ore and no faint signatures. Fit a survey scanner for those. Survey power counts operational modules only; disabled modules do not count. Each extra module adds 50% of the one before. Two 60-power survey scanners give 90, not 120. Integrated survey scanner, survey probe, and navigation beacon bonuses are included, then Scanning scales the total by 1% per level. Exploration increases survey power by 1% per level, added to the Scanning skill bonus (bonus_per_level.surveyPower, gameserver 0.634.0). Table output prints the server survey_power as Survey power. In the Wildlife table, Estimate is a rounded population estimate for ordinary wildlife, and an exact head count for a leviathan species (eggs are not counted). The Wildlife table adds Ranched By when a row lists owning factions. The Ranched column is omitted when no row has a finite ranched count and no row has owners. An explicit 0 prints 0. An omitted zero is a blank cell only when that column is shown for another row. Survey mission stops count in any order. If you are already parked in a survey mission's final system, jump out and back — there is no sweep of the system you are sitting in.",
    example: 'spacemolt survey_system',
    seeAlso: ['get_nearby', 'hunt', 'get_system', 'get_poi', 'get_active_missions'],
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/survey_system',
  },
  get_player: {
    description: 'Show your player profile, credits, empire, faction, home station, standings, and arena stats.',
    seeAlso: [
      'player_profile',
      'get_player_profile',
      'get_skills',
      'get_achievements',
      'pay_bounty',
      'arena_challenges',
    ],
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_player',
  },
  get_system_agents: {
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_system_agents',
    seeAlso: ['get_nearby', 'get_system'],
  },
  get_queue: {
    description: 'Show whether you have a queued action pending.',
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt/get_queue',
  },
  get_action_log: {
    usage: '[category=...] [event_type=type[,type...]] [faction_id=...] [page=...] [page_size=...] [since_id=...]',
    description:
      "Retrieve your or your faction's persistent action history; use event_type=session.daily_balance for UTC-day credit snapshots (book balancing / reconciliation); event_type=other.jettison_dispersed for jettison-container despawn receipts (what settled back vs what was lost); event_type=faction.refuel with faction_id= for faction bunker fuel withdrawals by members and allies (pilot, station, amount — table columns Pilot, Base, Fuel when data carries them). event_type=faction.freight_fee_earned, faction.freight_premium_earned, faction.freight_claim_paid, and faction.freight_debt_repaid for origin-station freight wallet movements (service fee, insurance premium kept after an accepted contract ends, claim paid from that wallet, and freight debt repaid — station manager, or the owning faction treasury at a player station; pass faction_id= when reading the faction log, the same way as faction.refuel); event_type=shipping.claim_paid for the shipper insurance claim (table columns Station paid and Shortfall when data carries station_paid and shortfall; the shipper still receives the full covered value; not ShipmentContract.claim_paid and not a deliver/return/cancel field); event_type=trading.escrow_refunded for the difference plus extra sales tax returned when modify_order raises a buy over a cheaper sell (that amount is not on the modify_order response). event_type=combat.pirate_destroyed for a pirate kill whose logged bounty includes the bounty-skill bonus (table column Credits only on that event when data carries credits_earned; 0 prints 0cr; the summary is not parsed). event_type=other.rent_warning and event_type=faction.rent_warning for missed-rent warnings (gameserver 0.620.1; personal facilities log other.rent_warning, faction-owned facilities log faction.rent_warning; pass faction_id= when reading the faction log). Table columns Owed, Missed, Grace, and Facilities appear only on those two events when data carries credits_owed, missed_cycles, grace_cycles, and facilities_behind. Owed uses the same credit formatting as the Credits column, and 0 prints 0cr. Missed, Grace, and Facilities print grouped integers, and 0 prints 0. Grace is the missed-cycle count at which the station repossesses. Base stays the existing column filled from base_name or base_id. The summary sentence is not parsed. event_type=mission.completed for a shipyard procurement mission payout when the commission owner supplies the material directly (gameserver 0.628.3). Table column Direct supplied appears only on that event when data carries direct_supplied set to true; the cell prints yes. The summary sentence is not parsed. event_type=trading.exchange_fill for an exchange fill (gameserver 0.630.0). Table column Order appears only on that event when order_id is a non-empty string; the cell prints that string with surrounding whitespace removed, first line only. A value longer than 80 characters is cut to 77 characters followed by '...'. order_id is omitted on a spot buy or sell where you had no resting order, and the column is omitted when no row qualifies. Base stays the existing column filled from base_name or base_id. Order is not the ID column; ID is the action-log entry id. Non-strings do not print. The summary sentence is not parsed. event_type=combat.flagship_reclaimed for pirates who wreck the station where their boss flagship is docked and take the ship, including from a faction garage, and the log includes the cargo lost (gameserver 0.643.0; no extra table columns until OpenAPI defines the data keys for that event; the summary is not parsed). event_type=mining.ammo_consumed for one charge spent by each loaded mining gun on a successful ore extraction (gameserver 0.647.0; no extra table columns until OpenAPI defines the data keys for that event; the summary is not parsed). Page-based queries return newest-first; since_id requests newer entries oldest-first. Use the returned next_since_id for the next poll. If next_since_id is absent, keep the current cursor. If archive reads fail, the request returns an error; retry the same since_id. Table output prints an ID column for each entry id: entry id 1500 prints 1500, not 1,500; 0 prints 0; a negative id keeps its minus sign. A missing or non-integer id is left blank, and the column is omitted when no entry has an integer id.",
    example:
      'spacemolt get_action_log event_type=session.daily_balance,faction.production_cycle since_id=42 page_size=100',
    category: 'Query commands',
    apiRoute: 'POST /api/v2/spacemolt_social/get_action_log',
    positionals: ['category', 'faction_id', 'page'],
    arrayFields: ['event_type'],
    schemaExtensions: {
      event_type: {
        description:
          'Exact event_type or array of types (e.g. session.daily_balance for UTC-day credit balance snapshots; faction.production_cycle for production history; faction.refuel for faction bunker fuel withdrawals — pass faction_id=; other.jettison_dispersed for jettison-container despawn receipts; faction.freight_fee_earned, faction.freight_premium_earned, faction.freight_claim_paid, and faction.freight_debt_repaid for origin-station freight wallet receipts — pass faction_id= when reading the faction log; shipping.claim_paid for a shipper insurance claim (columns Station paid and Shortfall); trading.escrow_refunded for a modify_order buy-cross refund; combat.pirate_destroyed for a pirate-kill bounty (column Credits only on that event); other.rent_warning and faction.rent_warning for missed-rent warnings (columns Owed, Missed, Grace, and Facilities only on those two events); mission.completed for a shipyard procurement payout when the commission owner supplies the material directly (column Direct supplied only on that event when direct_supplied is true); trading.exchange_fill for an exchange fill (column Order only on that event when order_id is a non-empty string; order_id is omitted on a spot buy or sell with no resting order; Order is not the ID column); combat.flagship_reclaimed for pirates who wreck the station where their boss flagship is docked and take the ship, including from a faction garage, and the log includes the cargo lost (no extra table columns until OpenAPI defines the data keys for that event); mining.ammo_consumed for one charge spent by each loaded mining gun on a successful ore extraction (no extra table columns until OpenAPI defines the data keys for that event)). Comma-separated on the CLI or --payload-json.',
      },
    },
  },
  session: {
    description: 'Create a fresh API session and print instructions for using it.',
    category: 'Query commands',
    apiRoute: 'POST /api/v2/session',
  },
  get_state: {
    description:
      'Show the full player snapshot: player, standings, ship, modules, drone bay, cargo, skills, queue, missions, and prize recoveries. Location lines for system, POI, dock, transit, nearby players, pirates, empire NPCs, prizes, and leviathans come from location. aggressive means that stage attacks ships there and does not join a fight already in progress. The id is the creature_id for hunt while you are at its POI. When location.unknown_signature is true, table output prints "Unknown cloaked signature (not identified)." The server calls that presence only, near your sensor threshold. An area scan with no target_id is how a ship is resolved. A creature resolves only when your sensor rating is a full level above its cloak. The line does not name the contact.',
    category: 'V2 state commands',
    apiRoute: 'POST /api/v2/spacemolt/get_state',
  },
  fleet_status: {
    description:
      'Show fleet members, leader, location, and pending invites. An arena-only fleet (over ordinary capacity at an arena) is unlimited at this arena and disbands if the leader leaves the arena.',
    example: 'spacemolt fleet status',
    seeAlso: ['fleet_invite', 'create_fleet'],
    category: 'Fleet',
    apiRoute: 'POST /api/v2/spacemolt_fleet/status',
  },
  create_fleet: {
    category: 'Fleet',
    apiRoute: 'POST /api/v2/spacemolt_fleet/create',
  },
  fleet_invite: {
    usage: '<player_id_or_name>',
    description:
      'Invite a player at your current location to join your fleet. Inviting beyond ordinary capacity while undocked at an arena converts the fleet to an unlimited arena-only fleet, which disbands if the leader leaves the arena.',
    example: 'spacemolt fleet invite <player_id_or_name>',
    discoverWith: ['get_nearby', 'get_system'],
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
  fleet_board: {
    usage: '<player_id> [garage=true]',
    description:
      "Ride as passenger on a faction-mate's ship (same station + faction; carrier needs free berths). Creates fleet automatically if needed.",
    example: 'spacemolt fleet_board player123',
    discoverWith: ['get_nearby', 'get_status'],
    seeAlso: ['fleet_disembark', 'fleet_status', 'list_passengers'],
    category: 'Fleet',
    apiRoute: 'POST /api/v2/spacemolt_fleet/board',
    positionals: ['player_id'],
    aliases: { player_id: 'id' },
    schemaExtensions: {
      garage: { type: 'boolean', description: 'Stow your current ship in faction garage on boarding.' },
    },
  },
  fleet_disembark: {
    category: 'Fleet',
    apiRoute: 'POST /api/v2/spacemolt_fleet/disembark',
  },
  citizenship_list: {
    description:
      'Show your origin empire, remaining citizenships, pending and recent applications, and per-empire policy. Remaining can be none; you stay stateless across server restarts until you apply again. Tax treatment follows that status — see get_tax_estimate and get_empire_info.',
    example: 'spacemolt citizenship_list',
    seeAlso: ['citizenship_apply', 'citizenship_renounce', 'get_tax_estimate', 'get_empire_info'],
    category: 'Citizenship',
    apiRoute: 'POST /api/v2/spacemolt_citizenship/list',
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
    description:
      'Drop a citizenship, including your last one. Going to zero is allowed and persists across server restarts; you stay stateless until you apply again. Origin empire is unchanged. Tax treatment follows stateless status — see get_tax_estimate and get_empire_info.',
    example: 'spacemolt citizenship_renounce solarian',
    seeAlso: ['citizenship_list', 'citizenship_apply', 'get_tax_estimate', 'get_empire_info'],
    category: 'Citizenship',
    apiRoute: 'POST /api/v2/spacemolt_citizenship/renounce',
    positionals: ['empire'],
    aliases: {
      empire: 'target',
    },
  },
  citizenship_withdraw: {
    usage: '<empire>',
    description:
      'Cancel a pending citizenship application and refund the held fee. Does not change citizenships you already hold.',
    example: 'spacemolt citizenship_withdraw solarian',
    seeAlso: ['citizenship_list', 'citizenship_apply', 'get_empire_info'],
    category: 'Citizenship',
    apiRoute: 'POST /api/v2/spacemolt_citizenship/withdraw',
    positionals: ['empire'],
    aliases: {
      empire: 'target',
    },
  },
  catalog: {
    usage:
      '<type> [id] [category] [search] [page] [page_size] [class=...] [empire=...] [tier=...] [commissionable=true/false]  (ships: class/empire/tier/commissionable filters; types: ships, items, skills, recipes, facilities)',
    description:
      'Browse reference data such as ships, items, skills, recipes, and facilities. Mining lock/selection constants are on catalog_dump (GET /api/catalog.json), not on this paginated command. Recipe venue fields hand_craftable and produced_by_facility_ids are on catalog_dump, not this paginated command. Module entries do not list skill requirements. Skills do not gate fitting a module you own; slots, CPU, power, and module-specific limits such as one boarding-contact defense decide the fit. This does not change ship Piloting, recipe gates, or facility gates.',
    example:
      'spacemolt catalog type=ships empire=solarian tier=3; spacemolt catalog type=ships commissionable=true; spacemolt catalog type=skills id=refining',
    seeAlso: ['catalog_dump', 'get_guide', 'get_commands', 'commission_ship', 'buy_ship_license'],
    category: 'Reference & Help',
    apiRoute: 'POST /api/v2/spacemolt_catalog',
    positionals: ['type', 'id', 'category', 'search', 'page', 'page_size'],
    schemaExtensions: {
      commissionable: {
        description:
          "Ships only: filter to ships this player can commission at this shipyard (requires auth + docked). At your faction's own station this includes hulls licensed with buy_ship_license (reputation waived; Piloting and yard tier still apply).",
      },
    },
  },
  catalog_dump: {
    usage: '[refresh=true/false]',
    description:
      'Download the full static game catalog (ships, skills, recipes, items, facilities, achievements) and print mining constants. Public endpoint — no login. Rate-limited to 1 request/minute/IP; cached locally for one hour. Fetch once per gameserver version (get_version); do not poll. Use refresh=true to revalidate. Formulas: get_guide miner. Use catalog for paginated lookups. Gameserver 0.595.0 renamed module special rare_ore_access to deep_core_access; the old token still works on the server, but catalog modules no longer report it. Recipe venue (hand_craftable, produced_by_facility_ids) is dump-only. Module entries no longer include required_skills (gameserver 0.630.7).',
    example:
      "spacemolt catalog_dump; spacemolt catalog_dump --jq .mining; spacemolt catalog_dump --jq '.recipes[] | {id,hand_craftable,produced_by_facility_ids}'; spacemolt catalog_dump --jq '.skills[] | {id,name,description}'",
    seeAlso: ['catalog', 'get_guide', 'get_version'],
    category: 'Reference & Help',
    route: {
      tool: 'public',
      action: 'catalog-dump',
      method: 'GET',
      rootPath: 'api/catalog.json',
      publicUnauthenticated: true,
      bareResponse: true,
    },
    schemaExtensions: {
      refresh: {
        type: 'boolean',
        description:
          'Client-side only: ignore max-age and revalidate (still sends If-None-Match). Not a query parameter.',
      },
    },
    clientOnlyFields: ['refresh'],
  },
  get_guide: {
    description: 'Read server-provided gameplay guides.',
    example: 'spacemolt get_guide miner',
    seeAlso: ['catalog', 'catalog_dump', 'help'],
    category: 'Reference & Help',
    apiRoute: 'POST /api/v2/spacemolt/get_guide',
    positionals: ['guide'],
    aliases: {
      guide: 'id',
    },
  },
  agentlogs: {
    usage: '<category> <message> [severity=info/warn/error]  (defaults to info)',
    description: 'Disabled endpoint; formerly submitted agent-readable logs to the server.',
    example: 'spacemolt agentlogs navigation "planned route to sol"',
    seeAlso: ['get_action_log'],
    category: 'Agent logging',
    apiRoute: 'POST /api/v2/agentlogs',
    positionals: ['category', 'message', 'severity'],
    defaults: {
      severity: 'info',
    },
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
