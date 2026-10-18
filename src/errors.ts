import type { APIResponse } from './types.ts';

export interface ErrorCodeEntry {
  code: string;
  message: string;
  suggestion: string;
  retryable: boolean;
  auth: boolean;
  relatedCommands: string[];
  commandSuggestions?: Record<string, string>;
}

export const ERROR_REGISTRY: Record<string, ErrorCodeEntry> = {
  not_authenticated: {
    code: 'not_authenticated',
    message: 'Authentication required.',
    suggestion: 'Run "spacemolt login <username> <password>" first.',
    retryable: true,
    auth: true,
    relatedCommands: ['login', 'register'],
  },
  invalid_credentials: {
    code: 'invalid_credentials',
    message: 'Invalid username or password.',
    suggestion: 'Check your username and password. Passwords are case-sensitive.',
    retryable: true,
    auth: true,
    relatedCommands: ['login'],
  },
  session_expired: {
    code: 'session_expired',
    message: 'Session expired.',
    suggestion: 'Your session expired. Run the command again to auto-create a new session.',
    retryable: true,
    auth: true,
    relatedCommands: ['login', 'get_status'],
  },
  session_invalid: {
    code: 'session_invalid',
    message: 'Session is invalid.',
    suggestion: 'Run "spacemolt login <username> <password>" to re-authenticate.',
    retryable: true,
    auth: true,
    relatedCommands: ['login'],
  },
  invalid_session: {
    code: 'invalid_session',
    message: 'Session is invalid.',
    suggestion: 'Run "spacemolt login <username> <password>" to re-authenticate.',
    retryable: true,
    auth: true,
    relatedCommands: ['login'],
  },
  rate_limited: {
    code: 'rate_limited',
    message: 'Rate limited.',
    suggestion:
      'Session limits are 30 mutations and 300 queries per minute. Wait the stated time, then retry. 50 rejections/min from this IP (all accounts) trigger an IP-wide timeout starting at 2 minutes.',
    retryable: true,
    auth: false,
    relatedCommands: [],
  },
  action_pending: {
    code: 'action_pending',
    message: 'An action is already queued for this tick.',
    suggestion:
      'One mutation per tick (~10 seconds). Wait for the queued action to finish, then retry. Do not resubmit immediately — that queues a second action after the current one.',
    retryable: true,
    auth: false,
    relatedCommands: ['get_status'],
  },
  ip_timed_out: {
    code: 'ip_timed_out',
    message: 'This IP is temporarily blocked.',
    suggestion:
      'This IP hit timeout after repeated rate-limit rejections (50/min, pooled across every account on the IP). Timeouts start at 2 minutes and double to 30. Wait the stated time (retry_after when present); do not keep retrying.',
    retryable: false,
    auth: false,
    relatedCommands: [],
  },
  service_unavailable: {
    code: 'service_unavailable',
    message: 'Service temporarily unavailable.',
    suggestion:
      'The authentication provider is temporarily unreachable. Wait and retry the same command. Do not change your password — this is not an invalid-credentials error.',
    retryable: true,
    auth: false,
    relatedCommands: ['login'],
  },
  persist_failed: {
    code: 'persist_failed',
    message: 'Persistence confirmation failed.',
    suggestion:
      'The server could not save the change. Nothing was charged, moved or changed. Check your state with "spacemolt get_status", then retry.',
    retryable: true,
    auth: false,
    relatedCommands: ['get_status'],
  },
  persist_timeout: {
    code: 'persist_timeout',
    message: 'Persistence confirmation timed out.',
    suggestion: 'Verify your state with "spacemolt get_status" before retrying the transaction.',
    retryable: true,
    auth: false,
    relatedCommands: ['get_status'],
  },
  cannot_upvote_own: {
    code: 'cannot_upvote_own',
    message: 'You cannot upvote your own post.',
    suggestion:
      'You cannot upvote your own thread or reply. Nothing changes. Do not retry "spacemolt forum upvote" on that post. Open the thread with "spacemolt forum get_thread" and upvote a different one.',
    retryable: false,
    auth: false,
    relatedCommands: ['forum_get_thread'],
  },
  reply_not_in_thread: {
    code: 'reply_not_in_thread',
    message: 'That reply is not in this thread.',
    suggestion:
      'That reply_id is not in this thread. Nothing was voted. thread_id must be the reply\'s thread. It is sent as target and is required. Do not omit thread_id, and do not retry the same pair. There is no reply lookup. "spacemolt forum get_thread" only opens a thread id from the page where the reply was read. Do not pass reply_id to it, and do not pass the thread_id that was just rejected. Retry "spacemolt forum upvote" with that page\'s thread id and the same reply_id.',
    retryable: false,
    auth: false,
    relatedCommands: [],
  },
  invalid_payload: {
    code: 'invalid_payload',
    message: 'Invalid command payload.',
    suggestion:
      'Check parameter names and spelling. Run "spacemolt help <command>" for local command arguments, or "spacemolt get_commands" for the server command list.',
    retryable: false,
    auth: false,
    relatedCommands: ['help', 'get_commands'],
  },
  docked: {
    code: 'docked',
    message: 'Ship is docked.',
    suggestion: 'You are docked. Most commands handle this automatically - if you see this error, please report it.',
    retryable: false,
    auth: false,
    relatedCommands: ['undock', 'get_status'],
  },
  not_docked: {
    code: 'not_docked',
    message: 'Ship is not docked.',
    suggestion:
      'You must be docked. Most commands handle this automatically - if you see this error, please report it.',
    retryable: false,
    auth: false,
    relatedCommands: ['dock', 'get_status'],
  },
  station_under_attack: {
    code: 'station_under_attack',
    message: 'Station is under attack.',
    suggestion:
      'The station shut its blast doors. Wait for the battle to end, then retry the same command. Common when a faction-mate fights in that system. Use "spacemolt get_status" to check location. If you are in the fight, "spacemolt get_battle_status" shows your battle.',
    retryable: true,
    auth: false,
    relatedCommands: ['get_status', 'dock'],
  },
  already_traveling: {
    code: 'already_traveling',
    message: 'Already traveling.',
    suggestion: 'You are already traveling. Wait for arrival or check with "get_status".',
    retryable: true,
    auth: false,
    relatedCommands: ['get_status'],
  },
  already_jumping: {
    code: 'already_jumping',
    message: 'Already jumping.',
    suggestion: 'You are already jumping between systems. Wait for arrival.',
    retryable: true,
    auth: false,
    relatedCommands: ['get_status'],
  },
  in_transit: {
    code: 'in_transit',
    message: 'Ship is in transit.',
    suggestion: 'Wait for arrival, then rerun the command. Use "spacemolt get_status" to check movement progress.',
    retryable: true,
    auth: false,
    relatedCommands: ['get_status'],
  },
  fleet_moved: {
    code: 'fleet_moved',
    message: 'Fleet moved.',
    suggestion: 'Your fleet moved while the command was pending. Run "spacemolt get_status" before retrying.',
    retryable: true,
    auth: false,
    relatedCommands: ['get_status'],
  },
  invalid_poi: {
    code: 'invalid_poi',
    message: 'Invalid POI.',
    suggestion:
      'POI not found. An uncharted hidden POI returns the same error as an id that does not exist. Run "spacemolt get_system" for charted POIs. Chart a hidden POI with "spacemolt survey_system", by arriving, or through faction intel.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_system', 'survey_system'],
  },
  unknown_system: {
    code: 'unknown_system',
    message: 'Unknown system.',
    suggestion:
      'Unknown system. An uncharted wormhole entrance returns unknown_system, the same as an unknown system id. Chart it with "spacemolt survey_system", by arriving, or through faction intel. Run "spacemolt get_system" for connected systems you already know.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_system', 'jump', 'survey_system'],
  },
  system_not_found: {
    code: 'system_not_found',
    message: 'System not found.',
    suggestion:
      'Not found. An uncharted hidden POI returns system_not_found from find_route, the same as an unknown id. Chart it with "spacemolt survey_system", by arriving, or through faction intel, then run "spacemolt find_route" again.',
    retryable: false,
    auth: false,
    relatedCommands: ['find_route', 'survey_system', 'get_system'],
  },
  poi_not_found: {
    code: 'poi_not_found',
    message: 'POI not found.',
    suggestion:
      'POI not found. A hidden POI your faction has not charted returns poi_not_found, the same as an unknown id. Chart it with "spacemolt survey_system", by arriving, or through faction intel, then run "spacemolt faction scan_poi".',
    retryable: false,
    auth: false,
    relatedCommands: ['faction_scan_poi', 'survey_system'],
  },
  wrong_system: {
    code: 'wrong_system',
    message: 'POI is in a different system.',
    suggestion: 'That POI is in a different system. Use "jump" to change systems first.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_system', 'jump'],
  },
  not_connected: {
    code: 'not_connected',
    message: 'Systems are not connected.',
    suggestion: 'Systems are not connected. Run "spacemolt get_system" to see connections.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_system', 'jump'],
  },
  no_fuel: {
    code: 'no_fuel',
    message: 'Insufficient fuel.',
    suggestion:
      'Insufficient fuel. Dock at a station and run "spacemolt refuel"; if station reserves are depleted, use fuel cells or try another supplied station.',
    retryable: true,
    auth: false,
    relatedCommands: ['refuel', 'dock', 'get_status'],
  },
  no_station_fuel: {
    code: 'no_station_fuel',
    message: 'Station has no fuel.',
    suggestion:
      'This station has insufficient fuel reserves. Try another supplied station, haul fuel here, or use fuel cells.',
    retryable: true,
    auth: false,
    relatedCommands: ['refuel', 'get_system'],
  },
  station_fuel_depleted: {
    code: 'station_fuel_depleted',
    message: 'Station fuel depleted.',
    suggestion:
      'This station has insufficient fuel reserves. Try another supplied station, haul fuel here, or use fuel cells.',
    retryable: true,
    auth: false,
    relatedCommands: ['refuel', 'get_system'],
  },
  no_credits: {
    code: 'no_credits',
    message: 'Insufficient credits.',
    suggestion: 'Insufficient credits. Mine and sell resources to earn credits.',
    retryable: true,
    auth: false,
    relatedCommands: ['mine', 'sell', 'get_cargo'],
  },
  insufficient_credits: {
    code: 'insufficient_credits',
    message: 'Not enough credits for this action.',
    suggestion:
      'Not enough credits for this action. Check the server message for which wallet was short (your credits or a faction treasury). This is not a materials shortage — do not deposit items unless the error code is missing_materials or missing_faction_materials. Check "spacemolt get_status" for your wallet. If the server message names the faction treasury, fund it with "spacemolt faction_deposit_credits".',
    retryable: true,
    auth: false,
    relatedCommands: ['get_status', 'faction_deposit_credits'],
    commandSuggestions: {
      craft:
        'Credits (labor or a rental fee) blocked this craft, not missing recipe inputs. Do not deposit items unless the error code is missing_materials or missing_faction_materials. If the server message names the faction treasury, fund it with "spacemolt faction_deposit_credits"; otherwise check "spacemolt get_status" for your wallet. Quote first with "spacemolt craft … dry_run=true". preset=cheap picks the lowest fee you would actually pay (own and faction facilities are free to you); preset=prefer_own keeps ownership-order routing and still rents a public facility when no own/faction/ally venue can run the job.',
      faction_declare_war:
        'Declaring war costs 50,000 credits from your wallet, not the faction treasury. Check "spacemolt get_status" for your credits. Earn credits, then retry, or do not declare. Do not run "spacemolt faction_deposit_credits" — that moves credits out of the wallet that is short.',
      citizenship_apply:
        'Applying for citizenship deducts the fee from your player wallet (you must hold the minimum balance plus the fee). Check "spacemolt get_status" for your credits. Do not run "spacemolt faction_deposit_credits" — that moves credits out of the wallet that is short.',
    },
  },
  no_cargo_space: {
    code: 'no_cargo_space',
    message: 'Cargo hold is full.',
    suggestion: 'Cargo hold is full. Sell or jettison items to make space.',
    retryable: true,
    auth: false,
    relatedCommands: ['sell', 'get_cargo'],
  },
  invalid_target: {
    code: 'invalid_target',
    message: 'Invalid target.',
    suggestion:
      'Target not found. A missing id and a target you cannot see use this same error. Run "spacemolt get_nearby" for ships at your POI.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_nearby'],
    commandSuggestions: {
      attack:
        'Target not found. attack and hunt return this for a missing id and for a target you cannot see (another POI, in transit, or cloaked). Run "spacemolt get_nearby" for ships at your POI. Joining a battle already running in this system uses a participant from "spacemolt get_battle_status" and does not return this error.',
      hunt: 'Target not found. attack and hunt return this for a missing id and for a target you cannot see (another POI, in transit, or cloaked). Run "spacemolt get_nearby" for ships at your POI. Joining a battle already running in this system uses a participant from "spacemolt get_battle_status" and does not return this error.',
    },
  },
  own_faction_station: {
    code: 'own_faction_station',
    message: 'You cannot fight a station your own faction owns.',
    suggestion:
      'You cannot fight a station your own faction owns. Do not attack that station. On battle_engage, omit side_id to join your station\'s side. On join_faction, leave the battle first, then retry. Run "spacemolt get_battle_status" to see the fight.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_battle_status'],
    commandSuggestions: {
      attack:
        'A station owned by your own faction cannot be attacked. Do not retry "spacemolt attack" on that station. Run "spacemolt get_battle_status" if a fight is already running.',
      battle_engage:
        'That side_id opposes a station your own faction owns. Omit side_id so "spacemolt battle_engage" joins your station\'s side. Do not pass a side that fights it.',
      join_faction:
        'You are fighting a station this faction owns. Leave the battle first, then retry "spacemolt join_faction". Run "spacemolt get_battle_status" to see the fight.',
    },
  },
  player_not_found: {
    code: 'player_not_found',
    message: 'Player not found.',
    suggestion:
      'No pilot by that name, or that pilot is not visible. A pilot at another POI, in transit, or cloaked returns the same error as an unknown name. Meet at the same POI. Run "spacemolt get_nearby" for pilots at your POI.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_nearby'],
    commandSuggestions: {
      get_player_profile:
        'No pilot by that username. The match ignores case. This lookup never returns a system, POI, or docked station. Check the spelling. Pilots at your POI are listed by "spacemolt get_nearby". A cloaked ship at your POI is revealed by "spacemolt scan".',
    },
  },
  in_battle: {
    code: 'in_battle',
    message: 'You are in a battle.',
    suggestion:
      'You are in a battle, so the cloak stays off. Attacking or engaging also drops an active cloak. Leave the battle, then retry "spacemolt cloak". Run "spacemolt get_battle_status" to see the fight.',
    retryable: true,
    auth: false,
    relatedCommands: ['get_battle_status', 'cloak'],
  },
  wreck_not_found: {
    code: 'wreck_not_found',
    message: 'Wreck not found.',
    suggestion:
      'That wreck was not found. It must be at your POI; a wreck elsewhere returns wreck_not_found. Run "spacemolt get_wrecks" for wrecks at your POI.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_wrecks', 'tow_wreck'],
  },
  not_found: {
    code: 'not_found',
    message: 'Not found.',
    suggestion: 'Not found. Check the id. This code does not say whether the id is missing or not visible to you.',
    retryable: false,
    auth: false,
    relatedCommands: [],
    commandSuggestions: {
      loot_wreck:
        'That wreck was not found. A wreck at another POI returns not_found, the same as a wreck that is already gone. Run "spacemolt get_wrecks" for wrecks at your POI. Omit wreck_id while you are towing.',
      storage_loot:
        'That wreck was not found. A wreck at another POI returns not_found, the same as a wreck that is already gone. Run "spacemolt get_wrecks" for wrecks at your POI. Omit wreck_id while you are towing.',
      inspect:
        'Not found. An uncharted hidden POI looks like an unknown id (not_found). Chart it with "spacemolt survey_system", by arriving, or through faction intel, then inspect again.',
    },
  },
  no_scanner: {
    code: 'no_scanner',
    message: 'A scanner is required. The server message is what the user sees; this string is the registry label.',
    suggestion:
      'This action needs a scanner. A remote POI scan or an active observation sweep needs a ship scanner. survey_system needs survey power. Check the fit with "spacemolt get_ship".',
    retryable: false,
    auth: false,
    relatedCommands: ['get_ship', 'install_mod', 'catalog'],
    commandSuggestions: {
      scan: 'A remote POI scan needs a ship scanner (sensor rating above 0). Fit ship_scanner_i, ship_scanner_ii, or ship_scanner_iii and install it with "spacemolt install_mod". See the fit with "spacemolt get_ship" and the module with "spacemolt catalog type=items id=ship_scanner_i".',
      subscribe_observation:
        'active_scan needs a ship scanner. Fit ship_scanner_i, ship_scanner_ii, or ship_scanner_iii. Check the fit with "spacemolt get_ship".',
      survey_system:
        'survey_system needs survey power. It requires a survey scanner module, an integrated survey scanner, or an anomaly detector (module, hull, or consumable). Check the fit with "spacemolt get_ship". This is not the ship scanner a remote POI scan uses.',
    },
  },
  no_cloak: {
    code: 'no_cloak',
    message: 'No cloaking device.',
    suggestion: 'No cloaking device installed on your ship.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_ship'],
  },
  username_taken: {
    code: 'username_taken',
    message: 'Username is taken.',
    suggestion: 'That username is already taken. Try a different username.',
    retryable: true,
    auth: false,
    relatedCommands: ['register'],
  },
  invalid_username: {
    code: 'invalid_username',
    message: 'Invalid username.',
    suggestion: 'Username must be 3-20 alphanumeric characters.',
    retryable: true,
    auth: false,
    relatedCommands: ['register'],
  },
  empire_restricted: {
    code: 'empire_restricted',
    message: 'Invalid empire.',
    suggestion: 'Invalid empire. Valid empires: solarian, voidborn, crimson, nebula, outerrim.',
    retryable: true,
    auth: false,
    relatedCommands: ['register'],
  },
  not_weapon: {
    code: 'not_weapon',
    message: 'Module is not a weapon.',
    suggestion: 'The module at that slot index is not a weapon. Use "get_ship" to see modules.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_ship'],
  },
  invalid_weapon: {
    code: 'invalid_weapon',
    message: 'Invalid weapon index.',
    suggestion: 'Invalid weapon index. Use "get_ship" to see your installed weapons.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_ship'],
  },
  no_mining_laser: {
    code: 'no_mining_laser',
    message: 'No mining laser installed.',
    suggestion: 'No mining laser installed. Buy one from a station market.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_ship', 'view_market'],
  },
  not_asteroid: {
    code: 'not_asteroid',
    message: 'Not at an asteroid belt.',
    suggestion: 'You can only mine at asteroid belts. Travel to one first.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_system', 'travel'],
  },
  in_fleet: {
    code: 'in_fleet',
    message: 'Ship is in a fleet.',
    suggestion:
      'Only the fleet leader controls dock state (including auto-dock/undock). Use "spacemolt fleet leave" to act alone.',
    retryable: false,
    auth: false,
    relatedCommands: ['fleet_leave', 'fleet_status'],
  },
  challenge_locked: {
    code: 'challenge_locked',
    message: 'Arena trial is locked.',
    suggestion:
      'This trial is locked until you win a required prior trial (the error names it). Run "spacemolt arena challenges" and start a READY trial.',
    retryable: false,
    auth: false,
    relatedCommands: ['arena_challenges', 'arena_fight'],
  },
  arena_rule: {
    code: 'arena_rule',
    message: 'Consumable is banned in this arena trial.',
    suggestion: 'That consumable is banned for this trial. Run "spacemolt arena challenges" to see the loadout rules.',
    retryable: false,
    auth: false,
    relatedCommands: ['arena_challenges', 'use_item'],
  },
  boarding_locked: {
    code: 'boarding_locked',
    message: 'Boarding party attached; emergency jump refused.',
    suggestion:
      'Marines are attached to your ship or to the ship you are boarding. emergency_warp_device cannot jump until the latch clears. Flee makes no progress; the emergency warp stabilizer and emergency cloak are skipped silently. Run "spacemolt get_battle_status" to inspect boarding. If you are the boarder, "spacemolt battle_stance fire" starts a non-instant withdrawal. Retry "spacemolt use_item" after the latch clears.',
    retryable: true,
    auth: false,
    relatedCommands: ['get_battle_status', 'battle_stance', 'use_item'],
  },
  deposit_too_sparse: {
    code: 'deposit_too_sparse',
    message: 'Deposit is too sparse for this mining array.',
    suggestion:
      'This deposit is too sparse for your fitted mining array. Run "spacemolt get_poi" and look for too sparse / lock min / supports power. Move to a healthier node, or unfit a miner / fit a finer one with "spacemolt uninstall_mod" — do not add another mining module.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_poi', 'get_ship', 'uninstall_mod', 'install_mod'],
  },
  cpu_exceeded: {
    code: 'cpu_exceeded',
    message: 'Fit needs more CPU than the ship has.',
    suggestion:
      'This fit needs more CPU than the hull has (the error names the shortfall). Run "spacemolt get_ship" — CPU used can exceed capacity — then "spacemolt uninstall_mod" a CPU consumer. A module that costs CPU can always be removed.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_ship', 'uninstall_mod', 'install_mod'],
  },
  power_exceeded: {
    code: 'power_exceeded',
    message: 'Fit needs more power than the ship has.',
    suggestion:
      'This fit needs more power than the hull has (the error names the shortfall). Run "spacemolt get_ship" — power used can exceed capacity — then "spacemolt uninstall_mod" a power consumer. A module that costs power can always be removed.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_ship', 'uninstall_mod', 'install_mod'],
  },
  cargo_capacity_exceeded: {
    code: 'cargo_capacity_exceeded',
    message: 'Hold carries more than the cargo capacity this change would leave.',
    suggestion:
      'This change would leave cargo capacity below what the hold carries (the error names the shortfall). Run "spacemolt get_ship" to inspect cargo. If fitting via "spacemolt install_mod", sell or jettison first; if removing a cargo expander, "spacemolt uninstall_mod" a consumer first.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_ship', 'uninstall_mod', 'install_mod'],
  },
  cargo_full: {
    code: 'cargo_full',
    message: 'No room in the hold.',
    suggestion:
      'No room in the hold. Run "spacemolt get_ship" to inspect cargo, then "spacemolt sell" or "spacemolt jettison". For a market buy, retry "spacemolt buy" with delivery=storage where the station has storage.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_ship', 'sell', 'jettison', 'buy', 'uninstall_mod'],
  },
  no_space: {
    code: 'no_space',
    message: 'No room in the hold.',
    suggestion:
      'No room in the hold; the wreck was left untouched. Run "spacemolt get_ship" to inspect cargo, then "spacemolt sell" or "spacemolt jettison". Retry "spacemolt loot_wreck". module_id= loots into cargo unfitted; fit later with "spacemolt install_mod".',
    retryable: false,
    auth: false,
    relatedCommands: ['get_ship', 'sell', 'jettison', 'loot_wreck', 'install_mod'],
  },
  trade_in_progress: {
    code: 'trade_in_progress',
    message: "The other side's accept is already committing.",
    suggestion:
      'The other side\'s accept is already committing, so the trade will complete. Do not retry "spacemolt trade_cancel" or "spacemolt trade_decline".',
    retryable: false,
    auth: false,
    relatedCommands: ['get_trades'],
  },
  trade_not_found: {
    code: 'trade_not_found',
    message: 'That trade is already gone.',
    suggestion: 'That trade is already gone. Run "spacemolt get_trades" to list offers that are still pending.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_trades'],
  },
  transaction_uncertain: {
    code: 'transaction_uncertain',
    message: 'The transfer may already be committed.',
    suggestion:
      'This transfer may already be committed. Do not retry it. The server pauses gameplay mutations and reconciles the exact action-log receipt. Mutations resume automatically. After they resume, run "spacemolt get_action_log" for that receipt (pass faction_id= for a faction transfer). Do not send the transfer again.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_action_log'],
  },
  accounting_pending: {
    code: 'accounting_pending',
    message: 'Gameplay mutations are paused during transfer reconciliation.',
    suggestion:
      'Gameplay mutations are paused while a transfer is reconciled. Do not retry the original uncertain transfer. Mutations resume automatically. After they resume, run "spacemolt get_action_log" to read the receipt (pass faction_id= for a faction transfer).',
    retryable: false,
    auth: false,
    relatedCommands: ['get_action_log'],
  },
};

export const ERROR_CODES = Object.keys(ERROR_REGISTRY);

export function isKnownErrorCode(code: string): code is keyof typeof ERROR_REGISTRY {
  return code in ERROR_REGISTRY;
}

const RULE_FAMILY_PREFIX = 'rule_';

const FIGHT_START_RULE_FALLBACK: ErrorCodeEntry = {
  code: 'rule_*',
  message: "A ship on your side breaks this arena trial's loadout rules.",
  suggestion:
    'A ship on your side breaks a loadout rule (the error names the pilot, hull, and rule). Run "spacemolt arena challenges" to see the trial rules, change that ship\'s loadout (hull, modules, or cargo) to satisfy the named rule, then retry "spacemolt arena fight".',
  retryable: false,
  auth: false,
  relatedCommands: ['arena_challenges', 'arena_fight'],
};

// Only prefix fallback in this module. Further families need a new design, not another startsWith.
function isFightStartRuleError(code: string): boolean {
  return code.startsWith(RULE_FAMILY_PREFIX) && code.length > RULE_FAMILY_PREFIX.length;
}

function lookupError(code: string): ErrorCodeEntry | undefined {
  return ERROR_REGISTRY[code] ?? (isFightStartRuleError(code) ? FIGHT_START_RULE_FALLBACK : undefined);
}

export function isRetryableError(code: string): boolean {
  return lookupError(code)?.retryable ?? true;
}

export function isAuthError(code: string): boolean {
  return lookupError(code)?.auth ?? false;
}

// Grouped displayCommand uses spaces (e.g. "faction declare_war").
function errorCommandKey(command: string | undefined): string | undefined {
  if (!command) return undefined;
  const key = command.trim().replace(/\s+/g, '_');
  return key || undefined;
}

export function getErrorSuggestion(code: string, command?: string): string | undefined {
  const entry = lookupError(code);
  if (!entry) return undefined;
  const key = errorCommandKey(command);
  if (key) {
    const overlay = entry.commandSuggestions?.[key];
    if (overlay) return overlay;
  }
  return entry.suggestion;
}

export function getRelatedCommands(code: string): string[] {
  return lookupError(code)?.relatedCommands ?? [];
}

export class ServiceUnavailableError extends Error {
  readonly code = 'service_unavailable' as const;
  readonly retryAfter: number;

  constructor(message: string, retryAfter: number) {
    super(message);
    this.name = 'ServiceUnavailableError';
    this.retryAfter = retryAfter;
  }

  toAPIResponse(): APIResponse {
    return {
      error: { code: this.code, message: this.message, retry_after: this.retryAfter },
    };
  }
}
