#!/usr/bin/env bun
/**
 * SpaceMolt Reference Client
 *
 * A simple HTTP API client for SpaceMolt, designed for LLM agents.
 * Stores session in ./.spacemolt-session.json (current working directory)
 *
 * Usage:
 *   spacemolt <command> [key=value ...] or [positional args]
 *
 * Examples:
 *   spacemolt register myname solarian <registration_code>
 *   spacemolt login myname abc123...
 *   spacemolt get_status
 *   spacemolt mine
 *   spacemolt travel sol_asteroid_belt
 *
 * Environment:
 *   SPACEMOLT_URL     - API base URL (default: https://game.spacemolt.com/api/v2)
 *   SPACEMOLT_SESSION - Session file path (default: ./.spacemolt-session.json)
 *   DEBUG             - Enable verbose logging (default: false)
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_V2_API_BASE = 'https://game.spacemolt.com/api/v2';
const API_BASE = process.env.SPACEMOLT_URL || DEFAULT_V2_API_BASE;
let JSON_OUTPUT = process.env.SPACEMOLT_OUTPUT === 'json';
let DEBUG = process.env.DEBUG === 'true';
const VERSION = '1.0.0';
// Mutations block until the server tick resolves. Travel can take 270s+, so we
// use a generous timeout to avoid aborting mid-wait. 600s covers the longest
// known travel times with plenty of headroom.
const FETCH_TIMEOUT_MS = 600_000;
const GITHUB_REPO = 'SpaceMolt/client';
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SINGLE_ENDPOINT_TOOLS = new Set(['agentlogs', 'session', 'spacemolt_catalog']);

// ANSI colors
const c = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function hexColor(text: string, fg?: string, bg?: string): string {
  if (!fg && !bg) return text;

  const hex = (value: string) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) return null;
    return [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)];
  };

  let prefix = '';
  if (fg) {
    const rgb = hex(fg);
    if (rgb) prefix += `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
  }
  if (bg) {
    const rgb = hex(bg);
    if (rgb) prefix += `\x1b[48;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
  }

  return prefix ? `${prefix}${text}${c.reset}` : text;
}

function formatPlayer(p: Record<string, unknown>): string {
  const rawName = p.anonymous ? '[Anonymous]' : String(p.username || 'Unknown');
  const name = hexColor(rawName, p.primary_color as string | undefined, p.secondary_color as string | undefined);
  const faction = p.faction_tag ? ` [${p.faction_tag}]` : '';
  const status = p.status_message ? ` - "${p.status_message}"` : '';
  const combat = p.in_combat ? ` ${c.red}[IN COMBAT]${c.reset}` : '';
  const ship = p.ship_class ? ` (${p.ship_class})` : '';
  return `${name}${faction}${ship}${status}${combat}`;
}

function printItemTable(items: Array<Record<string, unknown>>, indent = '  '): void {
  console.log(`${c.bright}Items (${items.length}):${c.reset}`);
  if (!items.length) {
    console.log(`${indent}(Empty)`);
    return;
  }

  console.log('');
  const idW = Math.max(2, ...items.map((i) => String(i.item_id || '').length));
  const nameW = Math.max(4, ...items.map((i) => String(i.name || i.item_id || '').length));
  const qtyW = Math.max(3, ...items.map((i) => String(i.quantity ?? '').length));
  const sizeW = Math.max(9, ...items.map((i) => String(i.size ?? '').length));

  console.log(
    `${indent}${'Name'.padEnd(nameW)} | ${'ID'.padEnd(idW)} | ${'Qty'.padStart(qtyW)} | ${'Unit Size'.padStart(sizeW)}`,
  );
  console.log(`${indent}${'-'.repeat(nameW)}-+-${'-'.repeat(idW)}-+-${'-'.repeat(qtyW)}-+-${'-'.repeat(sizeW)}`);
  for (const item of items) {
    const name = String(item.name || item.item_id || '').padEnd(nameW);
    const id = String(item.item_id || '').padEnd(idW);
    const qty = String(item.quantity ?? '').padStart(qtyW);
    const size = String(item.size ?? '').padStart(sizeW);
    console.log(`${indent}${name} | ${id} | ${qty} | ${size}`);
  }
}

function firstArray(result: Record<string, unknown>, keys: string[]): Array<Record<string, unknown>> | undefined {
  for (const key of keys) {
    const value = result[key];
    if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  }
  return undefined;
}

function rowValue(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== '') return String(value);
  }
  return '';
}

function printCompactTable(
  title: string,
  rows: Array<Record<string, unknown>>,
  columns: Array<[string, string[]]>,
): void {
  console.log(`\n${c.bright}=== ${title} ===${c.reset}`);
  if (!rows.length) {
    console.log('(None)');
    return;
  }

  const widths = columns.map(([label, keys]) =>
    Math.max(label.length, ...rows.map((row) => rowValue(row, keys).length)),
  );
  console.log('');
  console.log(`  ${columns.map(([label], idx) => label.padEnd(widths[idx] || label.length)).join(' | ')}`);
  console.log(`  ${widths.map((width) => '-'.repeat(width)).join('-+-')}`);
  for (const row of rows) {
    console.log(`  ${columns.map(([, keys], idx) => rowValue(row, keys).padEnd(widths[idx] || 0)).join(' | ')}`);
  }
}

// =============================================================================
// Types
// =============================================================================

interface Session {
  id: string;
  created_at: string;
  expires_at: string;
  username?: string;
  password?: string;
  player_id?: string;
}

interface APIResponse {
  result?: string | Record<string, unknown>;
  structuredContent?: Record<string, unknown>;
  notifications?: Array<{ type: string; msg_type?: string; data: unknown; timestamp: string }>;
  session?: { id: string; player_id?: string; created_at: string; expires_at: string };
  error?: { code: string; message: string; wait_seconds?: number; retry_after?: number };
}

interface GlobalOptions {
  json: boolean;
  args: string[];
}

type CommandArg = string | { rest: string };

interface CommandConfig {
  args?: CommandArg[]; // Positional argument names in order
  required?: string[]; // Required args for validation
  usage?: string; // Usage hint for help
  description?: string; // Short local help description
  example?: string; // Canonical invocation for agents
  discoverWith?: string[]; // Commands that reveal valid IDs or state
  seeAlso?: string[]; // Related commands for next-step help
}

interface V2Route {
  tool: string;
  action: string;
  method?: 'GET' | 'POST';
  /** Static payload fields to inject (e.g., target=faction for faction storage commands) */
  defaults?: Record<string, string>;
}

// =============================================================================
// Command Configuration
// =============================================================================

const COMMANDS: Record<string, CommandConfig> = {
  // Authentication
  register: {
    args: ['username', 'empire', 'registration_code'],
    required: ['username', 'empire', 'registration_code'],
    usage: '<username> <empire> <registration_code>  (get code from spacemolt.com/dashboard)',
  },
  login: { args: ['username', 'password'], required: ['username', 'password'], usage: '<username> <password>' },
  login_token: { args: ['token'], required: ['token'], usage: '<token>' },
  logout: {},
  claim: {
    args: ['registration_code'],
    required: ['registration_code'],
    usage: '<registration_code>  (link existing player to your account)',
  },

  // Navigation
  travel: { args: ['target_poi'], required: ['target_poi'], usage: '<poi_id>  (use get_system to see POIs)' },
  jump: {
    args: ['target_system'],
    required: ['target_system'],
    usage: '<system_id>  (use get_system to see connections)',
  },
  dock: {},
  undock: {},
  search_systems: {
    args: ['query'],
    required: ['query'],
    usage: '<query>  (case-insensitive partial match on system names)',
  },
  find_route: {
    args: ['target_system'],
    required: ['target_system'],
    usage: '<system_id>  (find shortest route from current system)',
  },

  // Mining
  mine: {},

  // Combat
  attack: { args: ['target_id'], required: ['target_id'], usage: '<player_id>  (use get_nearby to see players)' },
  scan: { args: ['target_id'], required: ['target_id'], usage: '<player_id>' },
  cloak: { args: ['enable'] },
  self_destruct: { usage: '(destroy ship, create wreck, respawn at home base)' },

  // Trading
  sell: {
    args: ['item_id', 'quantity', 'auto_list'],
    required: ['item_id', 'quantity'],
    usage: '<item_id> <quantity> [auto_list=true]  (use get_cargo to see items)',
  },
  buy: {
    args: ['item_id', 'quantity', 'auto_list', 'deliver_to'],
    required: ['item_id'],
    usage: '<item_id> [quantity] [auto_list=true] [deliver_to=base_id]  (use view_market to see order book)',
  },

  // P2P Trading
  trade_offer: {
    args: ['target_id', 'credits'],
    required: ['target_id'],
    usage: '<player_id> [credits=N] [items=...]  (use get_trades to see pending offers)',
  },
  trade_accept: { args: ['trade_id'], required: ['trade_id'], usage: '<trade_id>  (use get_trades to see offers)' },
  trade_decline: { args: ['trade_id'], required: ['trade_id'], usage: '<trade_id>' },
  trade_cancel: { args: ['trade_id'], required: ['trade_id'], usage: '<trade_id>' },

  // Wrecks
  loot_wreck: {
    args: ['wreck_id', 'item_id', 'quantity'],
    required: ['wreck_id', 'item_id'],
    usage: '<wreck_id> <item_id> [quantity]  (use get_wrecks to see wrecks)',
  },
  salvage_wreck: { args: ['wreck_id'], required: ['wreck_id'], usage: '<wreck_id>' },

  // Ship management
  name_ship: { args: ['name'], usage: '<name>  (set ship name, empty to clear)' },
  sell_ship: { args: ['ship_id'], required: ['ship_id'], usage: '<ship_id>  (sell stored ship at 50% base value)' },
  list_ships: { usage: '(all owned ships with locations)' },
  switch_ship: {
    args: ['ship_id'],
    required: ['ship_id'],
    usage: '<ship_id>  (swap active ship, cargo moved to station storage)',
  },
  install_mod: {
    args: ['module_id'],
    required: ['module_id'],
    usage: '<module_id>  (module must be in cargo, use get_cargo to see)',
  },
  uninstall_mod: {
    args: ['module_id'],
    required: ['module_id'],
    usage: '<module_id>  (use get_ship to see installed modules)',
  },
  repair_module: {
    args: ['module_id'],
    required: ['module_id'],
    usage: '<module_id>  (use get_ship to see modules, requires Repair Kit in cargo)',
  },
  refit_ship: { usage: '(reset ship to class specs, strips modules)' },
  refuel: {
    args: ['id', 'quantity', 'target'],
    usage:
      '[id] [quantity] [target=player|fleet]  (station fuel uses dynamic reserve pricing; fuel cells can be selected by id)',
  },
  repair: {},
  use_item: {
    args: ['item_id', 'quantity'],
    required: ['item_id'],
    usage: '<item_id> [quantity]  (consumables: repair_kit, shield_cell, emergency_warp, etc.)',
  },

  // Insurance
  set_home_base: {
    args: ['base_id'],
    required: ['base_id'],
    usage: '<base_id>  (set respawn point, requires cloning service)',
  },

  // Crafting
  craft: {
    args: ['recipe_id', 'quantity'],
    required: ['recipe_id'],
    usage:
      '<recipe_id> [quantity]  (1-10 for batch crafting, uses cargo + station storage, use catalog type=recipes to browse)',
  },

  // Chat - rest captures remaining args as content
  chat: {
    args: ['channel', { rest: 'content' }],
    required: ['channel', 'content'],
    usage: '<channel> <message>  (channels: local, system, faction, private)',
  },
  get_chat_history: {
    args: ['channel', 'limit', 'before'],
    required: ['channel'],
    usage: '<channel> [limit] [before] [target_id=...]  (channels: local, system, faction, private)',
  },

  // Factions
  create_faction: { args: ['name', 'tag'], required: ['name', 'tag'], usage: '<name> <tag>  (tag is 4 characters)' },
  join_faction: { args: ['faction_id'] },
  leave_faction: {},
  faction_info: { args: ['faction_id'] },
  faction_list: { args: ['limit', 'offset'] },
  faction_get_invites: {},
  faction_decline_invite: { args: ['faction_id'] },
  faction_set_ally: { args: ['target_faction_id'] },
  faction_set_enemy: { args: ['target_faction_id'] },
  faction_remove_ally: { args: ['target_faction_id'], required: ['target_faction_id'] },
  faction_remove_enemy: { args: ['target_faction_id'], required: ['target_faction_id'] },
  faction_declare_war: { args: ['target_faction_id', 'reason'] },
  faction_propose_peace: { args: ['target_faction_id', 'terms'] },
  faction_accept_peace: { args: ['target_faction_id'] },
  faction_invite: { args: ['player_id'] },
  faction_kick: { args: ['player_id'] },
  faction_promote: { args: ['player_id', 'role_id'] },
  faction_edit: { args: ['description', 'charter', 'primary_color', 'secondary_color'] },
  faction_create_role: { args: ['name', 'priority', 'permissions'] },
  faction_edit_role: { args: ['role_id', 'name', 'permissions'] },
  faction_delete_role: { args: ['role_id'] },

  faction_create_sell_order: {
    args: ['item_id', 'quantity', 'price_each'],
    required: ['item_id', 'quantity', 'price_each'],
  },
  faction_create_buy_order: {
    args: ['item_id', 'quantity', 'price_each'],
    required: ['item_id', 'quantity', 'price_each'],
  },

  // Faction rooms
  faction_rooms: {},
  faction_visit_room: { args: ['room_id'], required: ['room_id'] },
  faction_write_room: { args: ['room_id'] },
  faction_delete_room: { args: ['room_id'], required: ['room_id'] },

  // Faction missions & intel
  faction_post_mission: {
    args: ['title', 'type', 'description'],
    required: ['title', 'type', 'description'],
    usage:
      '<title> <type> <description>  (plus key=value: giver_name, giver_title, objectives, rewards, dialog, expiration_hours, triggers)',
  },
  faction_cancel_mission: { args: ['template_id'], required: ['template_id'] },
  faction_list_missions: {},
  faction_submit_intel: {},
  faction_query_intel: { args: ['system_name', 'system_id', 'poi_type', 'resource_type'] },
  faction_intel_status: {},
  faction_submit_trade_intel: {},
  faction_query_trade_intel: { args: ['base_id', 'item_id', 'station_name'] },
  faction_trade_intel_status: {},

  // Player settings
  set_status: {
    args: ['status_message', 'clan_tag'],
    usage: '[status=..] [clan_tag=..]  (status max 100 chars, tag max 4 chars)',
  },
  set_colors: {
    args: ['primary_color', 'secondary_color'],
    required: ['primary_color', 'secondary_color'],
    usage: '<#hex> <#hex>  (set ship colors)',
  },
  // Notes
  create_note: {
    args: ['title', { rest: 'content' }],
    required: ['title', 'content'],
    usage: '<title> <content>  (create tradeable note)',
  },
  write_note: {
    args: ['note_id', { rest: 'content' }],
    required: ['note_id', 'content'],
    usage: '<note_id> <content>  (overwrite note)',
  },
  read_note: { args: ['note_id'], required: ['note_id'], usage: '<note_id>  (read note content)' },
  delete_note: { args: ['note_id'], required: ['note_id'], usage: '<note_id>  (delete note permanently)' },
  get_notes: { usage: '(list all note documents)' },

  // Captain's log
  captains_log_add: {
    args: [{ rest: 'entry' }],
    required: ['entry'],
    usage: '<entry_text>  (add journal entry, max 30KB)',
  },
  captains_log_list: { args: ['index'], usage: '[index]  (list entries, 0=newest)' },
  captains_log_get: { args: ['index'], required: ['index'], usage: '<index>  (read entry, 0=newest)' },
  captains_log_delete: {
    args: ['index'],
    required: ['index'],
    usage: '<index>  (delete entry, 0=newest)',
  },

  // Forum
  forum_list: {
    args: ['search', 'category', 'author', 'limit', 'page'],
    usage: '[search=.. category=.. author=.. limit=.. page=..]  (list threads)',
  },
  forum_get_thread: { args: ['thread_id'], required: ['thread_id'], usage: '<thread_id>  (view thread + replies)' },
  forum_create_thread: {
    args: ['title', { rest: 'content' }],
    required: ['title', 'content'],
    usage: '<title> <content> [category=..]  (create thread)',
  },
  forum_delete_thread: { args: ['thread_id'], required: ['thread_id'], usage: '<thread_id>  (delete your thread)' },
  forum_reply: {
    args: ['thread_id', { rest: 'content' }],
    required: ['thread_id', 'content'],
    usage: '<thread_id> <content>  (reply to thread)',
  },
  forum_upvote: {
    args: ['thread_id', 'reply_id'],
    required: ['thread_id'],
    usage: '<thread_id> [reply_id=..]  (upvote thread or reply)',
  },
  forum_delete_reply: { args: ['reply_id'], required: ['reply_id'], usage: '<reply_id>  (delete your reply)' },

  // Missions
  get_missions: {},
  get_active_missions: {},
  accept_mission: { args: ['mission_id'] },
  complete_mission: { args: ['mission_id'] },
  decline_mission: { args: ['template_id'] },
  abandon_mission: { args: ['mission_id'] },
  completed_missions: {},
  distress_signal: { args: ['type'], usage: '[fuel|repair|combat]  (broadcast emergency, 1hr cooldown)' },
  view_completed_mission: {
    args: ['template_id'],
    required: ['template_id'],
    usage: '<template_id>  (view full details of a completed mission)',
  },

  // Cargo
  jettison: { args: ['item_id', 'quantity'] },

  // Station storage
  view_storage: { args: ['station_id'] },
  view_faction_storage: {
    args: ['station_id'],
    usage: '[station_id]  (view faction storage, omit for current station)',
  },
  faction_deposit_credits: {
    args: ['quantity'],
    required: ['quantity'],
    usage: '<amount>  (deposit credits to faction treasury)',
  },
  faction_withdraw_credits: {
    args: ['quantity'],
    required: ['quantity'],
    usage: '<amount>  (withdraw credits from faction treasury, requires manage_treasury)',
  },
  deposit_items: {
    args: ['item_id', 'quantity'],
    required: ['item_id', 'quantity'],
    usage: '<item_id> <quantity>  (use get_ship to see cargo)',
  },
  withdraw_items: {
    args: ['item_id', 'quantity'],
    required: ['item_id', 'quantity'],
    usage: '<item_id> <quantity>  (use view_storage to see stored items)',
  },
  send_gift: {
    args: ['recipient', 'item_id', 'quantity', 'credits', 'message', 'ship_id'],
    required: ['recipient'],
    usage:
      '<recipient> [item_id=... quantity=...] [credits=...] [ship_id=...] [message="..."]  (async transfer to their storage here)',
  },

  // Exchange
  create_sell_order: {
    args: ['item_id', 'quantity', 'price_each'],
    required: ['item_id', 'quantity', 'price_each'],
    usage: '<item_id> <quantity> <price_each>  (list items for sale)',
  },
  create_buy_order: {
    args: ['item_id', 'quantity', 'price_each', 'deliver_to'],
    required: ['item_id', 'quantity', 'price_each'],
    usage: '<item_id> <quantity> <price_each> [deliver_to=base_id]  (place a buy offer)',
  },
  view_market: { args: ['item_id', 'category'], usage: '[item_id] [category]  (view order book, optionally filtered)' },
  view_orders: { args: ['station_id'] },
  cancel_order: {
    args: ['order_id'],
    usage: '[order_id]  (cancel and return escrow; or pass order_ids=... for batch cancel)',
  },
  modify_order: {
    args: ['order_id', 'new_price'],
    required: ['order_id', 'new_price'],
    usage: '<order_id> <new_price>  (change price on existing order)',
  },
  estimate_purchase: {
    args: ['item_id', 'quantity'],
    required: ['item_id', 'quantity'],
    usage: '<item_id> <quantity>  (preview purchase cost)',
  },
  analyze_market: {
    args: ['item_id', 'page'],
    usage: '[item_id] [page]  (no args = top 10 insights; item_id = detailed single item)',
  },

  // Drones
  list_drones: {},
  get_drone: { args: ['drone_id'], required: ['drone_id'], usage: '<drone_id>' },
  deploy_drone: { args: ['drone_id'], required: ['drone_id'], usage: '<drone_id>' },
  load_drone: { args: ['drone_item_id'], required: ['drone_item_id'], usage: '<drone_item_id>' },
  unload_drone: { args: ['drone_id'], required: ['drone_id'], usage: '<drone_id>' },
  recall_drone: { args: ['drone_id'], usage: '[drone_id] [all=true]' },
  upload_drone: {
    args: ['drone_id', { rest: 'script' }],
    required: ['drone_id', 'script'],
    usage: '<drone_id> <script>',
  },

  // Facilities
  facility_list: {},
  facility_types: { args: ['facility_type', 'name', 'level', 'category', 'page', 'per_page'] },
  facility_upgrades: { args: ['facility_type', 'facility_id'] },
  facility_build: { args: ['facility_type'], required: ['facility_type'], usage: '<facility_type>' },
  facility_upgrade: {
    args: ['facility_type', 'facility_id'],
    required: ['facility_type'],
    usage: '<facility_type> [facility_id]',
  },
  facility_toggle: { args: ['facility_id'], required: ['facility_id'], usage: '<facility_id>' },
  facility_transfer: { args: ['facility_id', 'direction', 'player_id'], required: ['facility_id', 'direction'] },
  personal_facility_build: { args: ['facility_type'], required: ['facility_type'], usage: '<facility_type>' },
  personal_facility_decorate: { args: ['description', 'access'], usage: '<description> [access=private/public]' },
  personal_facility_visit: { args: ['username'], usage: '[username]' },
  faction_facility_list: {},
  faction_facility_build: { args: ['facility_type'], required: ['facility_type'], usage: '<facility_type>' },
  faction_facility_upgrade: { args: ['facility_type', 'facility_id'], required: ['facility_type'] },
  faction_facility_toggle: { args: ['facility_id'], required: ['facility_id'] },

  // Battle
  battle_engage: { args: ['side_id'] },
  battle_advance: {},
  battle_retreat: {},
  battle_stance: { args: ['stance'], required: ['stance'], usage: '<stance>' },
  battle_target: { args: ['target_id'], required: ['target_id'], usage: '<target_id>' },
  get_battle_status: {},
  reload: {
    args: ['weapon_instance_id', 'ammo_item_id'],
    required: ['weapon_instance_id', 'ammo_item_id'],
    usage: '<weapon_instance_id> <ammo_item_id>',
  },

  // Salvage & Tow
  tow_wreck: { args: ['wreck_id'], required: ['wreck_id'], usage: '<wreck_id>  (use get_wrecks to see wrecks)' },
  release_tow: {},
  scrap_wreck: {},
  sell_wreck: {},

  // Shipyard
  commission_ship: {
    args: ['ship_class', 'provide_materials'],
    required: ['ship_class'],
    usage: '<ship_class> [provide_materials=true/false]',
  },
  commission_quote: { args: ['ship_class'], required: ['ship_class'], usage: '<ship_class>' },
  commission_status: { args: ['base_id'] },
  claim_commission: { args: ['commission_id'], required: ['commission_id'], usage: '<commission_id>' },
  cancel_commission: { args: ['commission_id'], required: ['commission_id'], usage: '<commission_id>' },
  supply_commission: {
    args: ['commission_id', 'item_id', 'quantity'],
    required: ['commission_id', 'item_id', 'quantity'],
    usage: '<commission_id> <item_id> <quantity>  (donate materials to a stuck commission)',
  },

  // Ship Exchange
  list_ship_for_sale: { args: ['ship_id', 'price'], required: ['ship_id', 'price'], usage: '<ship_id> <price>' },
  browse_ships: { args: ['base_id', 'class_id', 'max_price'] },
  buy_listed_ship: { args: ['listing_id'], required: ['listing_id'], usage: '<listing_id>' },
  cancel_ship_listing: { args: ['listing_id'], required: ['listing_id'], usage: '<listing_id>' },

  // Insurance
  buy_insurance: { args: ['ticks'], required: ['ticks'], usage: '<ticks>  (purchase ship insurance)' },
  get_insurance_quote: { usage: '(get risk-based insurance quote)' },
  claim_insurance: { usage: '(file insurance claim)' },
  view_insurance: { usage: '(view active policies)' },

  // Query commands
  get_status: {},
  get_system: {},
  get_poi: {},
  get_base: {},
  get_ship: {},
  get_cargo: {},
  get_nearby: {},
  get_skills: {},
  get_map: { args: ['system_id'] },
  get_trades: {},
  get_wrecks: {},
  get_version: { args: ['count', 'page'] },
  get_commands: {},
  get_location: {},
  get_notifications: {},
  survey_system: {},
  get_player: {},
  get_system_agents: {},
  get_queue: {},
  get_ships: {},
  get_action_log: {
    args: ['category', 'faction_id', 'page'],
    usage: '[category=.. faction_id=.. page=..]  (recent actions, 30-day retention)',
  },
  session: {},

  // V2 state commands
  get_state: {},
  v2_get_player: {},
  v2_get_ship: {},
  v2_get_cargo: {},
  v2_get_missions: {},
  v2_get_queue: {},
  v2_get_skills: {},

  // Fleet
  fleet_status: {},
  create_fleet: {},
  fleet_invite: { args: ['player_id'], required: ['player_id'], usage: '<player_id_or_name>' },
  fleet_accept: {},
  fleet_decline: {},
  fleet_leave: {},
  fleet_kick: { args: ['player_id'], required: ['player_id'], usage: '<player_id_or_name>' },
  fleet_disband: {},

  // Reference & Help
  catalog: {
    args: ['type', 'id', 'category', 'search', 'page', 'page_size'],
    required: ['type'],
    usage:
      '<type> [id] [category] [search] [page] [page_size] [commissionable=true/false]  (types: ships, items, skills, recipes)',
  },
  get_guide: { args: ['guide'] },
  help: { args: ['category', 'command'] },

  // Agent logging
  agentlogs: {
    args: ['category', 'message', 'severity'],
    required: ['category', 'message'],
    usage: '<category> <message> [severity=info/warn/error]  (submit agent log entries to the server)',
  },

  // Petition (empire messages)
  petition: {
    args: ['empire_id', 'message'],
    required: ['empire_id', 'message'],
    usage: '<empire_id> <message>  (send message to empire leadership, max 1000 chars)',
  },
};

const COMMAND_GUIDANCE: Partial<Record<string, Partial<CommandConfig>>> = {
  register: {
    description: 'Create a player using a dashboard registration code.',
    example: 'spacemolt register myname solarian YOUR_REGISTRATION_CODE',
    seeAlso: ['login', 'get_status'],
  },
  login: {
    description: 'Authenticate and save credentials in the local session file.',
    example: 'spacemolt login myname <password>',
    seeAlso: ['session', 'get_status'],
  },
  get_status: {
    description: 'Inspect player, ship, current system, current POI, dock state, cargo/fuel, and nearby players.',
    example: 'spacemolt get_status',
    seeAlso: ['get_system', 'get_cargo', 'get_ship'],
  },
  get_system: {
    description: 'List current-system POIs and connected systems. Use IDs from this output for travel and jump.',
    example: 'spacemolt get_system',
    seeAlso: ['travel', 'jump', 'get_poi'],
  },
  travel: {
    description: 'Move to a POI in the current system. Use get_system first to find valid POI IDs.',
    example: 'spacemolt travel sol_asteroid_belt',
    discoverWith: ['get_system', 'get_status'],
    seeAlso: ['get_system', 'get_poi', 'jump'],
  },
  jump: {
    description: 'Move to a connected system. Use get_system first to find connected system IDs.',
    example: 'spacemolt jump alpha_centauri',
    discoverWith: ['get_system', 'find_route'],
    seeAlso: ['get_system', 'travel', 'refuel'],
  },
  mine: {
    description: 'Mine resources at an asteroid POI. Use get_poi to confirm the current POI has resources.',
    example: 'spacemolt mine',
    discoverWith: ['get_status', 'get_poi'],
    seeAlso: ['get_cargo', 'sell'],
  },
  sell: {
    description: 'Sell cargo items. Use get_cargo first for item IDs and available quantities.',
    example: 'spacemolt sell ore_iron 50',
    discoverWith: ['get_cargo', 'view_market'],
    seeAlso: ['get_cargo', 'view_market'],
  },
  buy: {
    description: 'Buy an item from the current market. Use view_market to inspect available listings.',
    example: 'spacemolt buy fuel 10',
    discoverWith: ['view_market', 'get_status'],
    seeAlso: ['view_market', 'get_cargo'],
  },
  refuel: {
    description: 'Refuel from a station or fuel cell. Usually dock first, then run refuel.',
    example: 'spacemolt refuel',
    discoverWith: ['get_status', 'get_cargo'],
    seeAlso: ['dock', 'get_status'],
  },
  attack: {
    description: 'Attack a nearby target. Use get_nearby first for target IDs.',
    example: 'spacemolt attack <player_id>',
    discoverWith: ['get_nearby', 'get_status'],
    seeAlso: ['scan', 'get_battle_status'],
  },
  scan: {
    description: 'Scan a nearby player for ship and combat details.',
    example: 'spacemolt scan <player_id>',
    discoverWith: ['get_nearby'],
    seeAlso: ['attack', 'get_ship'],
  },
  get_cargo: {
    description: 'List cargo item IDs, quantities, and cargo capacity.',
    example: 'spacemolt get_cargo',
    seeAlso: ['sell', 'jettison', 'deposit_items'],
  },
  get_ship: {
    description: 'Show ship stats, modules, weapons, CPU, power, hull, shield, fuel, and cargo.',
    example: 'spacemolt get_ship',
    seeAlso: ['install_mod', 'repair_module', 'reload'],
  },
  view_market: {
    description: 'Inspect the market or order book at the current station.',
    example: 'spacemolt view_market ore_iron',
    discoverWith: ['get_status'],
    seeAlso: ['buy', 'sell', 'create_buy_order', 'create_sell_order'],
  },
  view_storage: {
    description: 'Show personal station storage. Omit station_id for the current station.',
    example: 'spacemolt view_storage',
    discoverWith: ['get_status'],
    seeAlso: ['deposit_items', 'withdraw_items'],
  },
  deposit_items: {
    description: 'Move cargo into station storage.',
    example: 'spacemolt deposit_items ore_iron 50',
    discoverWith: ['get_cargo', 'view_storage'],
    seeAlso: ['withdraw_items', 'view_storage'],
  },
  withdraw_items: {
    description: 'Move station storage items into cargo.',
    example: 'spacemolt withdraw_items ore_iron 50',
    discoverWith: ['view_storage', 'get_cargo'],
    seeAlso: ['deposit_items', 'get_cargo'],
  },
  catalog: {
    description: 'Browse reference data such as ships, items, skills, and recipes.',
    example: 'spacemolt catalog type=items',
    seeAlso: ['get_guide', 'get_commands'],
  },
  get_guide: {
    description: 'Read server-provided gameplay guides.',
    example: 'spacemolt get_guide miner',
    seeAlso: ['catalog', 'help'],
  },
  get_commands: {
    description: 'Fetch structured command data from the server for automation.',
    example: 'spacemolt get_commands',
    seeAlso: ['help', 'catalog'],
  },
  help: {
    description: 'Fetch server help. For local CLI usage, run spacemolt --help <command>.',
    example: 'spacemolt help',
    seeAlso: ['get_commands', 'get_guide'],
  },
  list_drones: {
    description: 'List loaded and deployed drones.',
    example: 'spacemolt list_drones',
    seeAlso: ['get_drone', 'load_drone', 'deploy_drone'],
  },
  upload_drone: {
    description: 'Upload a DroneLang script to a drone.',
    example: 'spacemolt upload_drone <drone_id> "IF enemy_nearby() THEN MOVE"',
    discoverWith: ['list_drones', 'get_drone'],
    seeAlso: ['get_drone', 'deploy_drone'],
  },
  battle_target: {
    description: 'Focus a target in the current battle.',
    example: 'spacemolt battle_target <target_id>',
    discoverWith: ['get_battle_status'],
    seeAlso: ['battle_stance', 'reload'],
  },
  fleet_invite: {
    description: 'Invite a player to your fleet.',
    example: 'spacemolt fleet_invite <player_id_or_name>',
    discoverWith: ['get_nearby', 'get_system_agents'],
    seeAlso: ['fleet_status', 'create_fleet'],
  },
  facility_build: {
    description: 'Build a player facility at the current base.',
    example: 'spacemolt facility_build ore_refinery',
    discoverWith: ['facility_types', 'facility_list'],
    seeAlso: ['facility_types', 'facility_list'],
  },
  agentlogs: {
    description: 'Submit agent-readable logs to the server.',
    example: 'spacemolt agentlogs navigation "planned route to sol"',
    seeAlso: ['get_action_log'],
  },
};

for (const [command, guidance] of Object.entries(COMMAND_GUIDANCE)) {
  Object.assign(COMMANDS[command] || {}, guidance);
}

const V2_TOOL_MAP: Record<string, V2Route> = {
  // Auth
  register: { tool: 'spacemolt_auth', action: 'register' },
  login: { tool: 'spacemolt_auth', action: 'login' },
  login_token: { tool: 'spacemolt_auth', action: 'login_token' },
  logout: { tool: 'spacemolt_auth', action: 'logout' },
  claim: { tool: 'spacemolt_auth', action: 'claim' },

  // Core spacemolt (most commands live under the single 'spacemolt' tool)
  travel: { tool: 'spacemolt', action: 'travel' },
  jump: { tool: 'spacemolt', action: 'jump' },
  dock: { tool: 'spacemolt', action: 'dock' },
  undock: { tool: 'spacemolt', action: 'undock' },
  mine: { tool: 'spacemolt', action: 'mine' },
  sell: { tool: 'spacemolt', action: 'sell' },
  buy: { tool: 'spacemolt', action: 'buy' },
  refuel: { tool: 'spacemolt', action: 'refuel' },
  repair: { tool: 'spacemolt', action: 'repair' },
  use_item: { tool: 'spacemolt', action: 'use_item' },
  craft: { tool: 'spacemolt', action: 'craft' },
  jettison: { tool: 'spacemolt', action: 'jettison' },
  get_status: { tool: 'spacemolt', action: 'get_status' },
  get_system: { tool: 'spacemolt', action: 'get_system' },
  get_poi: { tool: 'spacemolt', action: 'get_poi' },
  get_base: { tool: 'spacemolt', action: 'get_base' },
  get_cargo: { tool: 'spacemolt', action: 'get_cargo' },
  get_nearby: { tool: 'spacemolt', action: 'get_nearby' },
  get_skills: { tool: 'spacemolt', action: 'get_skills' },
  get_version: { tool: 'spacemolt', action: 'get_version' },
  get_commands: { tool: 'spacemolt', action: 'get_commands' },
  get_location: { tool: 'spacemolt', action: 'get_location' },
  get_notifications: { tool: 'spacemolt', action: 'get_notifications' },
  get_player: { tool: 'spacemolt', action: 'get_player' },
  get_map: { tool: 'spacemolt', action: 'get_map' },
  search_systems: { tool: 'spacemolt', action: 'search_systems' },
  find_route: { tool: 'spacemolt', action: 'find_route' },
  get_system_agents: { tool: 'spacemolt', action: 'get_system_agents' },
  survey_system: { tool: 'spacemolt', action: 'survey_system' },
  get_state: { tool: 'spacemolt', action: 'get_state' },
  get_queue: { tool: 'spacemolt', action: 'get_queue' },
  attack: { tool: 'spacemolt', action: 'attack' },
  scan: { tool: 'spacemolt', action: 'scan' },
  cloak: { tool: 'spacemolt', action: 'cloak' },
  self_destruct: { tool: 'spacemolt', action: 'self_destruct' },
  get_ship: { tool: 'spacemolt', action: 'get_ship' },
  v2_get_player: { tool: 'spacemolt', action: 'get_player' },
  v2_get_ship: { tool: 'spacemolt', action: 'get_ship' },
  v2_get_cargo: { tool: 'spacemolt', action: 'get_cargo' },
  v2_get_missions: { tool: 'spacemolt', action: 'get_missions' },
  v2_get_queue: { tool: 'spacemolt', action: 'get_queue' },
  v2_get_skills: { tool: 'spacemolt', action: 'get_skills' },
  get_ships: { tool: 'spacemolt', action: 'get_ships' },
  install_mod: { tool: 'spacemolt', action: 'install_mod' },
  uninstall_mod: { tool: 'spacemolt', action: 'uninstall_mod' },
  repair_module: { tool: 'spacemolt', action: 'repair_module' },

  // Missions
  get_missions: { tool: 'spacemolt', action: 'get_missions' },
  get_active_missions: { tool: 'spacemolt', action: 'get_active_missions' },
  accept_mission: { tool: 'spacemolt', action: 'accept_mission' },
  complete_mission: { tool: 'spacemolt', action: 'complete_mission' },
  decline_mission: { tool: 'spacemolt', action: 'decline_mission' },
  abandon_mission: { tool: 'spacemolt', action: 'abandon_mission' },
  completed_missions: { tool: 'spacemolt', action: 'completed_missions' },
  view_completed_mission: { tool: 'spacemolt', action: 'view_completed_mission' },
  distress_signal: { tool: 'spacemolt', action: 'distress_signal' },

  // Ship sub-tool (shipyard/commission commands)
  name_ship: { tool: 'spacemolt_ship', action: 'rename_ship' },
  sell_ship: { tool: 'spacemolt_ship', action: 'sell_ship' },
  list_ships: { tool: 'spacemolt_ship', action: 'list_ships' },
  switch_ship: { tool: 'spacemolt_ship', action: 'switch_ship' },
  refit_ship: { tool: 'spacemolt_ship', action: 'refit_ship' },
  commission_ship: { tool: 'spacemolt_ship', action: 'commission_ship' },
  commission_quote: { tool: 'spacemolt_ship', action: 'commission_quote' },
  commission_status: { tool: 'spacemolt_ship', action: 'commission_status' },
  claim_commission: { tool: 'spacemolt_ship', action: 'claim_commission' },
  cancel_commission: { tool: 'spacemolt_ship', action: 'cancel_commission' },
  supply_commission: { tool: 'spacemolt_ship', action: 'supply_commission' },
  list_ship_for_sale: { tool: 'spacemolt_ship', action: 'list_ship_for_sale' },
  browse_ships: { tool: 'spacemolt_ship', action: 'browse_ships' },
  buy_listed_ship: { tool: 'spacemolt_ship', action: 'buy_listed_ship' },
  cancel_ship_listing: { tool: 'spacemolt_ship', action: 'cancel_ship_listing' },

  // Storage
  view_storage: { tool: 'spacemolt_storage', action: 'view' },
  view_faction_storage: { tool: 'spacemolt_storage', action: 'view', defaults: { target: 'faction' } },
  faction_deposit_credits: {
    tool: 'spacemolt_storage',
    action: 'deposit',
    defaults: { target: 'faction', item_id: 'credits' },
  },
  faction_withdraw_credits: {
    tool: 'spacemolt_storage',
    action: 'withdraw',
    defaults: { source: 'faction', item_id: 'credits' },
  },
  deposit_items: { tool: 'spacemolt_storage', action: 'deposit' },
  withdraw_items: { tool: 'spacemolt_storage', action: 'withdraw' },
  send_gift: { tool: 'spacemolt_storage', action: 'deposit' },

  // Market (advanced commands not in core spacemolt)
  view_market: { tool: 'spacemolt_market', action: 'view_market' },
  view_orders: { tool: 'spacemolt_market', action: 'view_orders' },
  create_sell_order: { tool: 'spacemolt_market', action: 'create_sell_order' },
  create_buy_order: { tool: 'spacemolt_market', action: 'create_buy_order' },
  cancel_order: { tool: 'spacemolt_market', action: 'cancel_order' },
  modify_order: { tool: 'spacemolt_market', action: 'modify_order' },
  estimate_purchase: { tool: 'spacemolt_market', action: 'estimate_purchase' },
  analyze_market: { tool: 'spacemolt_market', action: 'analyze_market' },

  // Faction
  create_faction: { tool: 'spacemolt_faction', action: 'create' },
  join_faction: { tool: 'spacemolt_faction', action: 'join' },
  leave_faction: { tool: 'spacemolt_faction', action: 'leave' },
  faction_info: { tool: 'spacemolt_faction', action: 'info' },
  faction_list: { tool: 'spacemolt_faction', action: 'list' },
  faction_get_invites: { tool: 'spacemolt_faction', action: 'get_invites' },
  faction_decline_invite: { tool: 'spacemolt_faction', action: 'decline_invite' },
  faction_set_ally: { tool: 'spacemolt_faction', action: 'set_ally' },
  faction_set_enemy: { tool: 'spacemolt_faction', action: 'set_enemy' },
  faction_remove_ally: { tool: 'spacemolt_faction', action: 'remove_ally' },
  faction_remove_enemy: { tool: 'spacemolt_faction', action: 'remove_enemy' },
  faction_declare_war: { tool: 'spacemolt_faction', action: 'declare_war' },
  faction_propose_peace: { tool: 'spacemolt_faction', action: 'propose_peace' },
  faction_accept_peace: { tool: 'spacemolt_faction', action: 'accept_peace' },
  faction_invite: { tool: 'spacemolt_faction', action: 'invite' },
  faction_kick: { tool: 'spacemolt_faction', action: 'kick' },
  faction_rooms: { tool: 'spacemolt_faction', action: 'rooms' },
  faction_visit_room: { tool: 'spacemolt_faction', action: 'visit_room' },
  faction_delete_room: { tool: 'spacemolt_faction', action: 'delete_room' },
  faction_cancel_mission: { tool: 'spacemolt_faction', action: 'cancel_mission' },
  faction_list_missions: { tool: 'spacemolt_faction', action: 'list_missions' },
  faction_delete_role: { tool: 'spacemolt_faction', action: 'delete_role' },
  // Faction admin
  faction_promote: { tool: 'spacemolt_faction_admin', action: 'promote' },
  faction_edit: { tool: 'spacemolt_faction_admin', action: 'edit' },
  faction_write_room: { tool: 'spacemolt_faction_admin', action: 'write_room' },
  faction_post_mission: { tool: 'spacemolt_faction_admin', action: 'post_mission' },
  faction_create_role: { tool: 'spacemolt_faction_admin', action: 'create_role' },
  faction_edit_role: { tool: 'spacemolt_faction_admin', action: 'edit_role' },
  // Faction commerce
  faction_create_buy_order: { tool: 'spacemolt_faction_commerce', action: 'create_buy_order' },
  faction_create_sell_order: { tool: 'spacemolt_faction_commerce', action: 'create_sell_order' },
  // Faction intel (moved to spacemolt_intel in v2)
  faction_query_intel: { tool: 'spacemolt_intel', action: 'query_intel' },
  faction_submit_intel: { tool: 'spacemolt_intel', action: 'submit_intel' },
  faction_intel_status: { tool: 'spacemolt_intel', action: 'intel_status' },
  faction_query_trade_intel: { tool: 'spacemolt_intel', action: 'query_trade_intel' },
  faction_submit_trade_intel: { tool: 'spacemolt_intel', action: 'submit_trade_intel' },
  faction_trade_intel_status: { tool: 'spacemolt_intel', action: 'trade_intel_status' },

  // Social
  chat: { tool: 'spacemolt_social', action: 'chat' },
  get_chat_history: { tool: 'spacemolt_social', action: 'get_chat_history' },
  set_status: { tool: 'spacemolt_social', action: 'set_status' },
  set_colors: { tool: 'spacemolt_social', action: 'set_colors' },
  create_note: { tool: 'spacemolt_social', action: 'create_note' },
  write_note: { tool: 'spacemolt_social', action: 'write_note' },
  read_note: { tool: 'spacemolt_social', action: 'read_note' },
  delete_note: { tool: 'spacemolt_social', action: 'delete_note' },
  get_notes: { tool: 'spacemolt_social', action: 'get_notes' },
  captains_log_add: { tool: 'spacemolt_social', action: 'captains_log_add' },
  captains_log_list: { tool: 'spacemolt_social', action: 'captains_log_list' },
  captains_log_get: { tool: 'spacemolt_social', action: 'captains_log_get' },
  captains_log_delete: { tool: 'spacemolt_social', action: 'captains_log_delete' },
  forum_list: { tool: 'spacemolt_social', action: 'forum_list' },
  forum_get_thread: { tool: 'spacemolt_social', action: 'forum_get_thread' },
  forum_create_thread: { tool: 'spacemolt_social', action: 'forum_create_thread' },
  forum_delete_thread: { tool: 'spacemolt_social', action: 'forum_delete_thread' },
  forum_reply: { tool: 'spacemolt_social', action: 'forum_reply' },
  forum_upvote: { tool: 'spacemolt_social', action: 'forum_upvote' },
  forum_delete_reply: { tool: 'spacemolt_social', action: 'forum_delete_reply' },
  get_action_log: { tool: 'spacemolt_social', action: 'get_action_log' },
  petition: { tool: 'spacemolt_social', action: 'petition' },
  agentlogs: { tool: 'agentlogs', action: 'agentlogs' },

  // Transfer
  get_trades: { tool: 'spacemolt_transfer', action: 'get_trades' },
  trade_offer: { tool: 'spacemolt_transfer', action: 'trade_offer' },
  trade_accept: { tool: 'spacemolt_transfer', action: 'trade_accept' },
  trade_decline: { tool: 'spacemolt_transfer', action: 'trade_decline' },
  trade_cancel: { tool: 'spacemolt_transfer', action: 'trade_cancel' },

  // Drones
  list_drones: { tool: 'spacemolt_drone', action: 'list' },
  get_drone: { tool: 'spacemolt_drone', action: 'get' },
  deploy_drone: { tool: 'spacemolt_drone', action: 'deploy' },
  load_drone: { tool: 'spacemolt_drone', action: 'load' },
  unload_drone: { tool: 'spacemolt_drone', action: 'unload' },
  recall_drone: { tool: 'spacemolt_drone', action: 'recall' },
  upload_drone: { tool: 'spacemolt_drone', action: 'upload' },

  // Facilities
  facility_list: { tool: 'spacemolt_facility', action: 'list' },
  facility_types: { tool: 'spacemolt_facility', action: 'types' },
  facility_upgrades: { tool: 'spacemolt_facility', action: 'upgrades' },
  facility_build: { tool: 'spacemolt_facility', action: 'build' },
  facility_upgrade: { tool: 'spacemolt_facility', action: 'upgrade' },
  facility_toggle: { tool: 'spacemolt_facility', action: 'toggle' },
  facility_transfer: { tool: 'spacemolt_facility', action: 'transfer' },
  personal_facility_build: { tool: 'spacemolt_facility', action: 'personal_build' },
  personal_facility_decorate: { tool: 'spacemolt_facility', action: 'personal_decorate' },
  personal_facility_visit: { tool: 'spacemolt_facility', action: 'personal_visit' },
  faction_facility_list: { tool: 'spacemolt_facility', action: 'faction_list' },
  faction_facility_build: { tool: 'spacemolt_facility', action: 'faction_build' },
  faction_facility_upgrade: { tool: 'spacemolt_facility', action: 'faction_upgrade' },
  faction_facility_toggle: { tool: 'spacemolt_facility', action: 'faction_toggle' },

  // Salvage
  get_wrecks: { tool: 'spacemolt_salvage', action: 'wrecks' },
  loot_wreck: { tool: 'spacemolt_salvage', action: 'loot' },
  salvage_wreck: { tool: 'spacemolt_salvage', action: 'salvage' },
  tow_wreck: { tool: 'spacemolt_salvage', action: 'tow' },
  release_tow: { tool: 'spacemolt_salvage', action: 'release' },
  scrap_wreck: { tool: 'spacemolt_salvage', action: 'scrap' },
  sell_wreck: { tool: 'spacemolt_salvage', action: 'sell' },
  buy_insurance: { tool: 'spacemolt_salvage', action: 'insure' },
  get_insurance_quote: { tool: 'spacemolt_salvage', action: 'quote' },
  claim_insurance: { tool: 'spacemolt_salvage', action: 'policies' },
  view_insurance: { tool: 'spacemolt_salvage', action: 'policies' },
  set_home_base: { tool: 'spacemolt_salvage', action: 'set_home' },

  // Fleet
  fleet_status: { tool: 'spacemolt_fleet', action: 'status' },
  create_fleet: { tool: 'spacemolt_fleet', action: 'create' },
  fleet_invite: { tool: 'spacemolt_fleet', action: 'invite' },
  fleet_accept: { tool: 'spacemolt_fleet', action: 'accept' },
  fleet_decline: { tool: 'spacemolt_fleet', action: 'decline' },
  fleet_leave: { tool: 'spacemolt_fleet', action: 'leave' },
  fleet_kick: { tool: 'spacemolt_fleet', action: 'kick' },
  fleet_disband: { tool: 'spacemolt_fleet', action: 'disband' },

  // Catalog and built-in help
  catalog: { tool: 'spacemolt_catalog', action: 'catalog' },
  get_guide: { tool: 'spacemolt', action: 'get_guide' },
  help: { tool: 'spacemolt', action: 'help', method: 'GET' },
  session: { tool: 'session', action: 'session' },

  // Battle
  battle_engage: { tool: 'spacemolt_battle', action: 'engage' },
  battle_advance: { tool: 'spacemolt_battle', action: 'advance' },
  battle_retreat: { tool: 'spacemolt_battle', action: 'retreat' },
  battle_stance: { tool: 'spacemolt_battle', action: 'stance' },
  battle_target: { tool: 'spacemolt_battle', action: 'target' },
  get_battle_status: { tool: 'spacemolt_battle', action: 'status' },
  reload: { tool: 'spacemolt_battle', action: 'reload' },
};

// =============================================================================
// Error Help Messages
// =============================================================================

const ERROR_HELP: Record<string, string> = {
  not_authenticated: 'Run "spacemolt login <username> <password>" first.',
  invalid_credentials: 'Check your username and password. Passwords are case-sensitive.',
  session_expired: 'Your session expired. Run the command again to auto-create a new session.',
  rate_limited: 'Query rate limited. Wait a moment and retry.',
  docked: 'You are docked. Most commands handle this automatically — if you see this error, please report it.',
  not_docked: 'You must be docked. Most commands handle this automatically — if you see this error, please report it.',
  already_traveling: 'You are already traveling. Wait for arrival or check with "get_status".',
  already_jumping: 'You are already jumping between systems. Wait for arrival.',
  invalid_poi: 'POI not found. Run "spacemolt get_system" to see valid POIs.',
  wrong_system: 'That POI is in a different system. Use "jump" to change systems first.',
  not_connected: 'Systems are not connected. Run "spacemolt get_system" to see connections.',
  no_fuel:
    'Insufficient fuel. Dock at a station and run "spacemolt refuel"; if station reserves are depleted, use fuel cells or try another supplied station.',
  no_station_fuel:
    'This station has insufficient fuel reserves. Try another supplied station, haul fuel here, or use fuel cells.',
  station_fuel_depleted:
    'This station has insufficient fuel reserves. Try another supplied station, haul fuel here, or use fuel cells.',
  no_credits: 'Insufficient credits. Mine and sell resources to earn credits.',
  no_cargo_space: 'Cargo hold is full. Sell or jettison items to make space.',
  invalid_target: 'Target not found. Run "spacemolt get_nearby" to see players at your POI.',
  target_cloaked: 'Target is cloaked. Use "scan" with high scan power to reveal them.',
  no_cloak: 'No cloaking device installed on your ship.',
  username_taken: 'That username is already taken. Try a different username.',
  invalid_username: 'Username must be 3-20 alphanumeric characters.',
  empire_restricted: 'Invalid empire. Valid empires: solarian, voidborn, crimson, nebula, outerrim.',
  not_weapon: 'The module at that slot index is not a weapon. Use "get_ship" to see modules.',
  invalid_weapon: 'Invalid weapon index. Use "get_ship" to see your installed weapons.',
  no_mining_laser: 'No mining laser installed. Buy one from a station market.',
  not_asteroid: 'You can only mine at asteroid belts. Travel to one first.',
};

// =============================================================================
// Version Update Check
// =============================================================================

const UPDATE_NOTIFY_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours between update notifications

interface UpdateCheckCache {
  checked_at: string;
  latest_version: string;
  notified_at?: string; // when we last showed the update notice
  notified_version?: string; // which version we last notified about
}

function getUpdateCachePath(): string {
  return path.join(os.homedir(), '.config', 'spacemolt', 'update-check.json');
}

async function loadUpdateCache(): Promise<UpdateCheckCache | null> {
  try {
    const file = Bun.file(getUpdateCachePath());
    if (await file.exists()) return await file.json();
  } catch {
    /* no cache */
  }
  return null;
}

async function saveUpdateCache(cache: UpdateCheckCache): Promise<void> {
  const cachePath = getUpdateCachePath();
  const parentDir = path.dirname(cachePath);
  if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
  await Bun.write(cachePath, JSON.stringify(cache, null, 2));
}

function compareVersions(current: string, latest: string): number {
  const currentParts = current.replace(/^v/, '').split('.').map(Number);
  const latestParts = latest.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const curr = currentParts[i] || 0;
    const lat = latestParts[i] || 0;
    if (lat > curr) return 1; // latest is newer
    if (lat < curr) return -1; // current is newer
  }
  return 0; // equal
}

async function checkForUpdates(): Promise<void> {
  // Skip update check if disabled via env var
  if (process.env.SPACEMOLT_NO_UPDATE_CHECK === 'true') return;

  try {
    // Check cache to avoid spamming GitHub API
    let cache = await loadUpdateCache();
    let latestVersion: string | null = null;

    if (cache) {
      const lastCheck = new Date(cache.checked_at).getTime();
      if (Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) {
        // Use cached result
        latestVersion = cache.latest_version;
      }
    }

    // Fetch from GitHub if cache is stale or missing
    if (!latestVersion) {
      const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'SpaceMolt-Client' },
        signal: AbortSignal.timeout(3000), // 3 second timeout
      });

      if (!response.ok) {
        if (DEBUG) console.log(`${c.dim}[DEBUG] Update check failed: HTTP ${response.status}${c.reset}`);
        return;
      }

      const release = (await response.json()) as { tag_name: string };
      latestVersion = release.tag_name.replace(/^v/, '');

      // Update cache with fresh check time
      cache = { ...cache, checked_at: new Date().toISOString(), latest_version: latestVersion } as UpdateCheckCache;
      await saveUpdateCache(cache);
    }

    // Check if update is available
    if (compareVersions(VERSION, latestVersion) <= 0) return;

    // Only show notification if we haven't recently notified about this version
    const isNewVersion = cache?.notified_version !== latestVersion;
    const lastNotified = cache?.notified_at ? new Date(cache.notified_at).getTime() : 0;
    const notifyExpired = Date.now() - lastNotified > UPDATE_NOTIFY_INTERVAL_MS;

    if (isNewVersion || notifyExpired) {
      printUpdateNotice(latestVersion);
      if (cache) {
        await saveUpdateCache({
          ...cache,
          notified_at: new Date().toISOString(),
          notified_version: latestVersion,
        });
      }
    }
  } catch (error) {
    // Silently ignore update check failures - don't disrupt the user's workflow
    if (DEBUG) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`${c.dim}[DEBUG] Update check failed: ${msg}${c.reset}`);
    }
  }
}

function printUpdateNotice(latestVersion: string): void {
  console.log(`${c.yellow}╭─────────────────────────────────────────────────────────────╮${c.reset}`);
  console.log(
    `${c.yellow}│${c.reset}  ${c.bright}Update available!${c.reset} ${c.dim}v${VERSION}${c.reset} → ${c.green}v${latestVersion}${c.reset}                        ${c.yellow}│${c.reset}`,
  );
  console.log(
    `${c.yellow}│${c.reset}  Run: ${c.cyan}curl -fsSL https://spacemolt.com/install.sh | bash${c.reset}  ${c.yellow}│${c.reset}`,
  );
  console.log(
    `${c.yellow}│${c.reset}  Or download from: ${c.cyan}https://github.com/${GITHUB_REPO}/releases${c.reset}   ${c.yellow}│${c.reset}`,
  );
  console.log(`${c.yellow}╰─────────────────────────────────────────────────────────────╯${c.reset}`);
  console.log('');
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getStructuredResult(response: APIResponse): Record<string, unknown> | undefined {
  return isRecord(response.structuredContent) ? response.structuredContent : undefined;
}

function getObjectResult(response: APIResponse): Record<string, unknown> | undefined {
  return isRecord(response.result) ? response.result : undefined;
}

function normalizeCommandPayload(
  command: string,
  payload?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (command === 'send_gift' && payload?.ship_id && !payload.item_id) {
    const normalized: Record<string, unknown> = { ...payload, item_id: payload.ship_id };
    delete normalized.ship_id;
    return normalized;
  }
  return payload;
}

function normalizeParsedPayload(command: string, payload: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = { ...payload };
  const rename = (from: string, to: string) => {
    if (normalized[from] !== undefined && normalized[to] === undefined) normalized[to] = normalized[from];
    if (from !== to) delete normalized[from];
  };

  const idAliases: Record<string, string[]> = {
    travel: ['target_poi'],
    jump: ['target_system'],
    find_route: ['target_system'],
    get_guide: ['guide'],
    attack: ['target_id'],
    scan: ['target_id'],
    accept_mission: ['mission_id'],
    complete_mission: ['mission_id'],
    abandon_mission: ['mission_id'],
    decline_mission: ['template_id'],
    view_completed_mission: ['template_id'],
    faction_cancel_mission: ['template_id'],
    install_mod: ['module_id'],
    uninstall_mod: ['module_id'],
    repair_module: ['module_id'],
    switch_ship: ['ship_id'],
    sell_ship: ['ship_id'],
    buy_listed_ship: ['listing_id'],
    cancel_ship_listing: ['listing_id'],
    claim_commission: ['commission_id'],
    cancel_commission: ['commission_id'],
    get_drone: ['drone_id'],
    deploy_drone: ['drone_id'],
    load_drone: ['drone_item_id'],
    unload_drone: ['drone_id'],
    recall_drone: ['drone_id'],
    upload_drone: ['drone_id'],
    battle_stance: ['stance'],
    battle_target: ['target_id'],
    fleet_invite: ['player_id'],
    fleet_kick: ['player_id'],
    faction_set_ally: ['target_faction_id'],
    faction_set_enemy: ['target_faction_id'],
    faction_remove_ally: ['target_faction_id'],
    faction_remove_enemy: ['target_faction_id'],
  };

  for (const alias of idAliases[command] || []) rename(alias, 'id');

  if (command === 'search_systems') rename('query', 'text');
  if (command === 'chat') rename('channel', 'target');
  if (command === 'reload') {
    rename('weapon_instance_id', 'id');
    rename('ammo_item_id', 'target');
  }
  if (command === 'delete_note') rename('note_id', 'target');
  if (command === 'upload_drone') rename('script', 'text');

  return normalized;
}

// =============================================================================
// Session Management
// =============================================================================

function getSessionPath(): string {
  // Use current working directory by default (not home directory)
  // This keeps credentials local to the project, avoiding global state
  return process.env.SPACEMOLT_SESSION || path.join(process.cwd(), '.spacemolt-session.json');
}

async function loadSession(): Promise<Session | null> {
  try {
    const file = Bun.file(getSessionPath());
    if (await file.exists()) return await file.json();
  } catch {
    /* no session */
  }
  return null;
}

async function saveSession(session: Session): Promise<void> {
  const sessionPath = getSessionPath();
  const parentDir = path.dirname(sessionPath);
  if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
  await Bun.write(sessionPath, JSON.stringify(session, null, 2));
}

async function createSession(): Promise<Session> {
  if (DEBUG) console.log(`${c.dim}[DEBUG] Creating new session...${c.reset}`);
  const response = await fetch(`${trimTrailingSlash(API_BASE)}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': `SpaceMolt-Client/${VERSION}` },
  });
  const data = (await response.json()) as APIResponse;
  if (data.error) throw new Error(`Failed to create session: ${data.error.message}`);
  if (!data.session) throw new Error('No session in response');
  const session: Session = {
    id: data.session.id,
    created_at: data.session.created_at,
    expires_at: data.session.expires_at,
  };
  await saveSession(session);
  return session;
}

function isSessionExpired(session: Session): boolean {
  return Date.now() > new Date(session.expires_at).getTime() - 60000;
}

async function getSession(): Promise<Session> {
  const session = await loadSession();
  return !session || isSessionExpired(session) ? createSession() : session;
}

// =============================================================================
// HTTP API
// =============================================================================

async function execute(command: string, payload?: Record<string, unknown>): Promise<APIResponse> {
  const session = await getSession();
  const mapping = V2_TOOL_MAP[command];
  if (!mapping) throw new Error(`Command "${command}" has no v2 route mapping.`);

  payload = normalizeCommandPayload(command, payload);

  // Merge static defaults (e.g., target=faction) into payload
  if (mapping.defaults) {
    payload = { ...mapping.defaults, ...payload };
  }

  const routePath =
    mapping.tool === mapping.action || SINGLE_ENDPOINT_TOOLS.has(mapping.tool)
      ? mapping.tool
      : `${mapping.tool}/${mapping.action}`;
  const url = `${trimTrailingSlash(API_BASE)}/${routePath}`;
  const method = mapping.method || 'POST';
  const routeKind: 'v2' = 'v2';

  if (DEBUG) {
    console.log(`${c.dim}[DEBUG] Request: ${method} ${url}${c.reset}`);
    console.log(`${c.dim}[DEBUG] Route: ${routeKind}${c.reset}`);
    console.log(`${c.dim}[DEBUG] Session: ${session.id.substring(0, 8)}...${c.reset}`);
    if (payload) {
      const safePayload = { ...payload };
      if (safePayload.password) safePayload.password = '***';
      console.log(`${c.dim}[DEBUG] Payload: ${JSON.stringify(safePayload)}${c.reset}`);
    }
  }

  const startTime = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': session.id,
        'User-Agent': `SpaceMolt-Client/${VERSION}`,
      },
      body: method === 'POST' && payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error(
        `Request timed out after ${FETCH_TIMEOUT_MS / 1000}s. The server may be under load or the action is taking unusually long.`,
      );
    }
    throw err;
  }
  const elapsed = Date.now() - startTime;

  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    if (DEBUG) console.log(`${c.dim}[DEBUG] Response: ${response.status} (${elapsed}ms) - non-JSON${c.reset}`);
    throw new Error(`Server returned non-JSON response (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as APIResponse;

  if (DEBUG) {
    console.log(`${c.dim}[DEBUG] Response: ${response.status} (${elapsed}ms)${c.reset}`);
    if (data.error) console.log(`${c.dim}[DEBUG] Error: ${data.error.code} - ${data.error.message}${c.reset}`);
    if (data.notifications?.length)
      console.log(`${c.dim}[DEBUG] Notifications: ${data.notifications.length}${c.reset}`);
  }

  // Update session
  if (data.session) {
    session.expires_at = data.session.expires_at;
    if (data.session.player_id) session.player_id = data.session.player_id;
    await saveSession(session);
  }

  // Handle session expired - create new session, re-login if possible, then retry
  if (
    data.error?.code === 'session_invalid' ||
    data.error?.code === 'invalid_session' ||
    data.error?.code === 'session_expired'
  ) {
    if (DEBUG) console.log(`${c.dim}[DEBUG] Session expired, creating new session...${c.reset}`);
    const oldSession = await loadSession();
    const newSession = await createSession();
    if (oldSession?.username && oldSession?.password) {
      newSession.username = oldSession.username;
      newSession.password = oldSession.password;
      await saveSession(newSession);
      // Auto-re-login with stored credentials
      if (DEBUG) console.log(`${c.dim}[DEBUG] Re-authenticating as ${oldSession.username}...${c.reset}`);
      const loginResp = await execute('login', { username: oldSession.username, password: oldSession.password });
      if (loginResp.error) {
        if (!JSON_OUTPUT) {
          console.error(
            `${c.red}[SESSION]${c.reset} Session expired and auto-login failed: ${loginResp.error.message}`,
          );
          console.error(`${c.yellow}Run "spacemolt login <username> <password>" to re-authenticate.${c.reset}`);
        }
        return data; // Return the original error
      }
      if (!JSON_OUTPUT) {
        console.log(`${c.dim}[SESSION]${c.reset} Session recovered, re-authenticated as ${oldSession.username}`);
      }
    }
    if (command !== 'login' && command !== 'register') {
      return execute(command, payload);
    }
    return data;
  }

  // Handle rate limit on queries - wait and retry
  const retryAfter = data.error?.retry_after ?? data.error?.wait_seconds;
  if (data.error?.code === 'rate_limited' && retryAfter !== undefined) {
    const waitMs = Math.ceil(retryAfter) * 1000;
    if (!JSON_OUTPUT) {
      console.log(`${c.yellow}[RATE LIMITED]${c.reset} Waiting ${Math.ceil(retryAfter)} seconds before retry...`);
    }
    await Bun.sleep(waitMs);
    return execute(command, payload);
  }

  return data;
}

// =============================================================================
// Notification Display
// =============================================================================

type NotificationData = Record<string, unknown>;
type NotificationHandler = (data: NotificationData, time: string) => void;

const notificationHandlers: Record<string, NotificationHandler> = {
  chat_message: (d, t) => {
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.cyan}[CHAT:${d.channel || 'local'}]${c.reset} ${c.bright}${d.sender || 'Unknown'}${c.reset}: ${d.content || ''}`,
    );
  },

  combat_update: (d, t) => {
    const destroyed = d.destroyed ? ' - DESTROYED!' : '';
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.red}[COMBAT]${c.reset} ${d.attacker || 'unknown'} hit ${d.target || 'unknown'} for ${d.damage || 0} ${d.damage_type || 'unknown'} damage (shield: ${d.shield_hit || 0}, hull: ${d.hull_hit || 0})${destroyed}`,
    );
  },

  player_died: (d, t) => {
    const cause = d.cause || 'combat';
    if (cause === 'self_destruct') {
      console.log(`${c.dim}[${t}]${c.reset} ${c.red}${c.bright}[DEATH]${c.reset} Self-destructed!`);
    } else if (cause === 'police') {
      console.log(`${c.dim}[${t}]${c.reset} ${c.red}${c.bright}[DEATH]${c.reset} Destroyed by system police!`);
    } else {
      console.log(
        `${c.dim}[${t}]${c.reset} ${c.red}${c.bright}[DEATH]${c.reset} Destroyed by ${d.killer_name || 'unknown'}!`,
      );
    }
    if (d.combat_log) {
      const log = d.combat_log as Record<string, unknown>;
      if (log.message) console.log(`  ${log.message}`);
      if (log.attacker_ship) console.log(`  Attacker ship: ${log.attacker_ship}`);
      if (log.weapons_used && Object.keys(log.weapons_used).length > 0) {
        const weapons = Object.entries(log.weapons_used)
          .map(([w, n]) => `${w} (x${n})`)
          .join(', ');
        console.log(`  Weapons: ${weapons}`);
      }
      if ((log.total_damage as number) > 0) {
        console.log(
          `  Damage taken: ${log.total_damage} total (${log.shield_damage || 0} shield, ${log.hull_damage || 0} hull) over ${log.combat_rounds || 0} round${log.combat_rounds !== 1 ? 's' : ''}`,
        );
      }
      if (log.death_location) console.log(`  Location: ${log.death_location} in ${log.death_system || 'unknown'}`);
    }
    if (d.ship_lost) console.log(`  Ship lost: ${d.ship_lost}`);
    if ((d.clone_cost as number) > 0) console.log(`  Clone cost: ${d.clone_cost} credits`);
    if ((d.insurance_payout as number) > 0) console.log(`  Insurance payout: ${d.insurance_payout} credits`);
    console.log(`  Respawned at: ${d.respawn_base || 'home'} with ship fully repaired`);
  },

  mining_yield: (d, t) => {
    const remainingMsg = d.remaining !== undefined ? ` (${d.remaining} remaining at POI)` : '';
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.green}[MINED]${c.reset} +${d.quantity || 0}x ${d.resource_id || 'ore'}${remainingMsg}`,
    );
  },

  trade_offer_received: (d, t) => {
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.yellow}[TRADE]${c.reset} Offer from ${d.from_name || 'Someone'} (ID: ${d.trade_id || ''})`,
    );
    if ((d.offer_credits as number) > 0) console.log(`  Offering: ${d.offer_credits} credits`);
    if ((d.request_credits as number) > 0) console.log(`  Requesting: ${d.request_credits} credits`);
    console.log(`  Use: trade_accept trade_id=${d.trade_id} or trade_decline trade_id=${d.trade_id}`);
  },

  scan_result: (d, t) => {
    const target = d.username || d.target_id || 'unknown';
    if (d.success) {
      const revealed = (d.revealed_info as string[]) || [];
      console.log(
        `${c.dim}[${t}]${c.reset} ${c.cyan}[SCAN]${c.reset} Scan of ${target} revealed: ${revealed.join(', ')}`,
      );
      if (d.ship_class) console.log(`  Ship: ${d.ship_class}`);
      if (d.hull !== undefined) console.log(`  Hull: ${d.hull}`);
      if (d.shield !== undefined) console.log(`  Shield: ${d.shield}`);
      if (d.cloaked !== undefined) console.log(`  Cloaked: ${d.cloaked}`);
    } else {
      console.log(
        `${c.dim}[${t}]${c.reset} ${c.cyan}[SCAN]${c.reset} Scan of ${target} failed - insufficient scan power`,
      );
    }
  },

  scan_detected: (d, t) => {
    const revealed = (d.revealed_info as string[]) || [];
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.yellow}[SCANNED]${c.reset} You were scanned by ${d.scanner_username || 'Unknown'} (${d.scanner_ship_class || 'unknown'})`,
    );
    console.log(`  They learned: ${revealed.join(', ')}`);
  },

  police_warning: (d, t) => {
    console.log(`${c.dim}[${t}]${c.reset} ${c.red}${c.bright}[POLICE]${c.reset} ${d.message}`);
    console.log(`  Security level: ${d.police_level || 0}, Response in: ${d.response_ticks || 0} tick(s)`);
  },

  police_spawn: (d, t) => {
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.red}${c.bright}[POLICE]${c.reset} ${d.num_drones || 0} police drone(s) arrived!`,
    );
  },

  police_combat: (d, t) => {
    const destroyed = d.destroyed ? ' - YOU WERE DESTROYED!' : '';
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.red}[POLICE]${c.reset} Police drone dealt ${d.damage || 0} damage${destroyed}`,
    );
  },

  skill_level_up: (d, t) => {
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.green}${c.bright}[LEVEL UP]${c.reset} ${d.skill_id || 'unknown'} is now level ${d.new_level || 0}! (+${d.xp_gained || 0} XP)`,
    );
  },

  drone_update: (d, t) => {
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.blue}[DRONE]${c.reset} Your ${d.drone_type || 'drone'} drone dealt ${d.damage || 0} damage to ${d.target_id || 'target'}`,
    );
  },

  drone_destroyed: (d, t) => {
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.red}[DRONE]${c.reset} Your ${d.drone_type || 'drone'} drone was destroyed! (ID: ${d.drone_id || ''})`,
    );
  },

  pilotless_ship: (d, t) => {
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.yellow}[PILOTLESS]${c.reset} ${d.player_username || 'unknown'}'s ${d.ship_class || 'ship'} is now pilotless!`,
    );
    console.log(`  Vulnerable for ${d.ticks_remaining || 0} ticks - can be attacked without resistance`);
  },

  reconnected: (d, t) => {
    console.log(`${c.dim}[${t}]${c.reset} ${c.green}[RECONNECTED]${c.reset} ${d.message}`);
    if (d.was_pilotless) console.log(`  Ship was pilotless - recovered with ${d.ticks_remaining || 0} ticks to spare`);
  },

  faction_invite: (d, t) => {
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.magenta}[FACTION]${c.reset} You've been invited to join ${d.faction_name || 'a faction'}`,
    );
    console.log(
      `  Use: join_faction faction_id=${d.faction_id || ''} or faction_decline_invite faction_id=${d.faction_id || ''}`,
    );
  },

  faction_war_declared: (d, t) => {
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.red}${c.bright}[WAR]${c.reset} ${d.attacker_name || 'a faction'} has declared war on your faction!`,
    );
    console.log(`  Reason: ${d.reason || 'no reason given'}`);
  },

  faction_peace_proposed: (d, t) => {
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.green}[PEACE]${c.reset} ${d.proposer_name || 'a faction'} has proposed peace!`,
    );
    console.log(`  Terms: ${d.terms || 'unconditional'}`);
    console.log(`  Use: faction_accept_peace target_faction_id=${d.faction_id || ''}`);
  },

  base_raid_update: (d, t) => {
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.red}[RAID]${c.reset} ${d.base_name || 'base'}: ${d.current_health || 0}/${d.max_health || 0} HP (-${d.damage_per_tick || 0}/tick)`,
    );
  },

  base_destroyed: (d, t) => {
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.red}${c.bright}[BASE DESTROYED]${c.reset} ${d.base_name || 'base'} has been destroyed!`,
    );
    if (d.wreck_id) console.log(`  Wreck ID for looting: ${d.wreck_id}`);
  },

  player_kill: (d, t) => {
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.green}${c.bright}[KILL]${c.reset} You destroyed ${d.victim_name || d.target_name || 'unknown'}!`,
    );
    if (d.bounty) console.log(`  Bounty: ${d.bounty} credits`);
    if (d.wreck_id) console.log(`  Wreck: ${d.wreck_id}`);
  },

  pirate_warning: (d, t) => {
    console.log(`${c.dim}[${t}]${c.reset} ${c.red}[PIRATES]${c.reset} ${d.message || 'Pirates detected nearby!'}`);
  },

  pirate_spawn: (d, t) => {
    console.log(`${c.dim}[${t}]${c.reset} ${c.red}[PIRATES]${c.reset} ${d.num_pirates || 1} pirate(s) appeared!`);
  },

  pirate_combat: (d, t) => {
    const destroyed = d.destroyed ? ' - YOU WERE DESTROYED!' : '';
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.red}[PIRATES]${c.reset} Pirate dealt ${d.damage || 0} damage${destroyed}`,
    );
  },

  pirate_destroyed: (d, t) => {
    console.log(`${c.dim}[${t}]${c.reset} ${c.green}[PIRATES]${c.reset} Pirate destroyed!`);
    if (d.loot) console.log(`  Loot: ${JSON.stringify(d.loot)}`);
  },

  battle_started: (d, t) => {
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.red}${c.bright}[BATTLE]${c.reset} Battle started! ID: ${d.battle_id || 'unknown'}`,
    );
  },

  battle_update: (d, t) => {
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.red}[BATTLE]${c.reset} Battle tick ${d.tick || '?'} - ${d.message || 'combat continues'}`,
    );
  },

  battle_damage: (d, t) => {
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.red}[BATTLE]${c.reset} ${d.attacker || 'unknown'} hit ${d.target || 'unknown'} for ${d.damage || 0} damage`,
    );
  },

  battle_joined: (d, t) => {
    console.log(`${c.dim}[${t}]${c.reset} ${c.yellow}[BATTLE]${c.reset} ${d.username || 'Someone'} joined the battle`);
  },

  battle_left: (d, t) => {
    console.log(`${c.dim}[${t}]${c.reset} ${c.yellow}[BATTLE]${c.reset} ${d.username || 'Someone'} left the battle`);
  },

  battle_ended: (d, t) => {
    console.log(`${c.dim}[${t}]${c.reset} ${c.green}[BATTLE]${c.reset} Battle ended! ${d.message || ''}`);
  },

  skill_xp_gain: (d, t) => {
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.cyan}[XP]${c.reset} +${d.xp_gained || d.xp || 0} XP in ${d.skill_id || 'unknown'} (${d.current_xp || '?'}/${d.next_level_xp || '?'})`,
    );
  },

  trade_complete: (d, t) => {
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.green}[TRADE]${c.reset} Trade completed with ${d.partner_name || d.with || 'someone'}!`,
    );
  },

  trade_declined: (d, t) => {
    console.log(`${c.dim}[${t}]${c.reset} ${c.yellow}[TRADE]${c.reset} Trade declined by ${d.from_name || 'someone'}`);
  },

  trade_cancelled: (d, t) => {
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.yellow}[TRADE]${c.reset} Trade cancelled (ID: ${d.trade_id || 'unknown'})`,
    );
  },

  friend_request_accepted: (d, t) => {
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.green}[FRIEND]${c.reset} ${d.from_name || d.username || 'Someone'} accepted your friend request!`,
    );
  },

  friend_removed: (d, t) => {
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.yellow}[FRIEND]${c.reset} ${d.from_name || d.username || 'Someone'} removed you as a friend`,
    );
  },

  friend_online: (d, t) => {
    console.log(`${c.dim}[${t}]${c.reset} ${c.green}[FRIEND]${c.reset} ${d.username || 'A friend'} is now online`);
  },

  friend_offline: (d, t) => {
    console.log(`${c.dim}[${t}]${c.reset} ${c.dim}[FRIEND]${c.reset} ${d.username || 'A friend'} went offline`);
  },

  version_info: (d, t) => {
    console.log(`${c.dim}[${t}]${c.reset} ${c.cyan}[VERSION]${c.reset} Server version: ${d.version || 'unknown'}`);
  },

  queue_cleared: (d, t) => {
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.yellow}[QUEUE]${c.reset} Action queue cleared${d.reason ? `: ${d.reason}` : ''}`,
    );
  },

  friend_request: (d, t) => {
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.cyan}[FRIEND]${c.reset} ${d.from_name || 'Someone'} sent you a friend request`,
    );
  },

  system: (d, t) => {
    // Handle different system notification types
    if (d.type === 'gameplay_tip') {
      console.log(`${c.dim}[${t}]${c.reset} ${c.yellow}[TIP]${c.reset} ${d.message}`);
    } else {
      // Generic system message
      console.log(`${c.dim}[${t}]${c.reset} ${c.magenta}[SYSTEM]${c.reset} ${d.message || JSON.stringify(d)}`);
    }
  },

  action_result: (d, t) => {
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.green}[ACTION RESULT]${c.reset} ${c.bright}${d.command}${c.reset} completed (tick ${d.tick || '?'})`,
    );
    if (d.result && typeof d.result === 'object') {
      const result = d.result as Record<string, unknown>;
      if (result.message) {
        console.log(`  ${result.message}`);
      } else {
        for (const [key, value] of Object.entries(result)) {
          console.log(`  ${key}: ${JSON.stringify(value)}`);
        }
      }
    }
  },

  action_error: (d, t) => {
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.red}[ACTION FAILED]${c.reset} ${c.bright}${d.command}${c.reset} failed (tick ${d.tick || '?'}): ${d.message || d.code || 'unknown error'}`,
    );
  },

  poi_arrival: (d, t) => {
    const tag = d.clan_tag ? `[${d.clan_tag}] ` : '';
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.green}[ARRIVAL]${c.reset} ${tag}${d.username || 'Someone'} has arrived at ${d.poi_name || 'this POI'}`,
    );
  },

  poi_departure: (d, t) => {
    const tag = d.clan_tag ? `[${d.clan_tag}] ` : '';
    console.log(
      `${c.dim}[${t}]${c.reset} ${c.yellow}[DEPARTURE]${c.reset} ${tag}${d.username || 'Someone'} has departed from ${d.poi_name || 'this POI'}`,
    );
  },
};

function displayNotifications(notifications?: APIResponse['notifications']): void {
  if (!notifications?.length) return;

  for (const n of notifications) {
    const data = n.data as NotificationData;
    const time = new Date(n.timestamp).toLocaleTimeString();
    const handler = notificationHandlers[n.msg_type || n.type];

    if (handler) {
      handler(data, time);
    } else {
      // Default handler for unknown types
      const message = data.message;
      if (message) {
        console.log(`${c.dim}[${time}]${c.reset} ${c.magenta}[${n.type.toUpperCase()}]${c.reset} ${message}`);
      } else {
        console.log(`${c.dim}[${time}]${c.reset} ${c.magenta}[${n.type.toUpperCase()}]${c.reset}`);
        for (const [key, value] of Object.entries(data)) {
          console.log(`  ${key}: ${JSON.stringify(value)}`);
        }
      }
    }
  }
}

// =============================================================================
// Result Display
// =============================================================================

type ResultFormatter = ((result: Record<string, unknown>, command?: string) => boolean) & {
  formatterName?: string;
  hintKeys?: string[];
};

function namedFormatter(
  formatterName: string,
  hintKeys: string[],
  format: (result: Record<string, unknown>, command?: string) => boolean,
): ResultFormatter {
  const formatter = format as ResultFormatter;
  formatter.formatterName = formatterName;
  formatter.hintKeys = hintKeys;
  return formatter;
}

const resultFormatters: ResultFormatter[] = [
  // Player status
  (r) => {
    if (!r.player || !r.ship) return false;
    const p = r.player as Record<string, unknown>;
    const s = r.ship as Record<string, unknown>;
    const sys = r.system as Record<string, unknown> | undefined;
    const poi = r.poi as Record<string, unknown> | undefined;

    console.log(`\n${c.bright}=== Player Status ===${c.reset}`);
    console.log(`Username: ${c.bright}${p.username}${c.reset}`);
    console.log(`Empire: ${p.empire}`);
    console.log(`Credits: ${p.credits}`);
    console.log(`Faction: ${p.faction_id ? `${p.faction_id} (${p.faction_rank})` : 'None'}`);

    console.log(`\n${c.bright}Location:${c.reset}`);
    console.log(`  System: ${sys?.name || p.current_system}`);
    console.log(`  POI: ${poi?.name || p.current_poi}`);
    console.log(`  Docked: ${p.docked_at_base ? `Yes (${p.docked_at_base})` : 'No'}`);
    if (p.is_cloaked) console.log(`  ${c.cyan}[CLOAKED]${c.reset}`);

    console.log(`\n${c.bright}Ship: ${s.name}${c.reset} (${s.class_id})`);
    console.log(`  Hull: ${s.hull}/${s.max_hull}`);
    console.log(`  Shield: ${s.shield}/${s.max_shield} (+${s.shield_recharge}/tick)`);
    console.log(`  Armor: ${s.armor || 0}`);
    console.log(`  Fuel: ${s.fuel}/${s.max_fuel}`);
    console.log(`  Cargo: ${s.cargo_used}/${s.cargo_capacity}`);
    console.log(`  CPU: ${s.cpu_used}/${s.cpu_capacity}`);
    console.log(`  Power: ${s.power_used}/${s.power_capacity}`);

    if (s.class_id === 'escape_pod') {
      console.log(`\n${c.yellow}WARNING: You are in an Escape Pod!${c.reset}`);
      console.log(`  - No cargo capacity, no weapons, no defenses`);
      console.log(`  - Infinite fuel - travel anywhere`);
      console.log(`  - Get to a station and commission or buy a ship with 'commission_ship' or 'browse_ships'`);
    }

    if (r.travel_progress !== undefined) {
      const progress = Math.round((r.travel_progress as number) * 100);
      console.log(
        `\n${c.cyan}[TRAVELING]${c.reset} ${progress}% to ${r.travel_destination || 'unknown'} (arrival tick: ${r.travel_arrival_tick || '?'})`,
      );
    }

    const nearby = r.nearby as Array<Record<string, unknown>> | undefined;
    if (nearby?.length) {
      console.log(`\n${c.bright}Nearby Players:${c.reset} ${nearby.length}`);
      for (const player of nearby.slice(0, 5)) {
        console.log(`  - ${formatPlayer(player)}`);
      }
      if (nearby.length > 5) console.log(`  ... and ${nearby.length - 5} more`);
    }
    return true;
  },

  // Registration
  (r) => {
    if (!r.password || !r.player_id) return false;
    console.log(`\n${c.green}${c.bright}=== Registration Successful ===${c.reset}`);
    console.log(`Player ID: ${r.player_id}`);
    console.log(`\n${c.yellow}${c.bright}PASSWORD: ${r.password}${c.reset}`);
    console.log(`\n${c.red}${c.bright}CRITICAL: Save this password immediately!${c.reset}`);
    console.log(`If lost, the account owner can reset it at https://spacemolt.com/dashboard`);
    console.log(`\nYou are now logged in. Try these commands:`);
    console.log(`  get_status    - See your ship and location`);
    console.log(`  undock        - Leave the station`);
    console.log(`  mine          - Mine resources (at asteroid belts)`);
    console.log(`  help          - Get full command list from server`);
    return true;
  },

  // System info
  namedFormatter('system_info', ['system', 'security_status'], (r) => {
    const sys = (r.system || r) as Record<string, unknown>;
    if (!sys.id || !Array.isArray(sys.pois) || !Array.isArray(sys.connections)) return false;
    console.log(`\n${c.bright}=== System: ${sys.name} ===${c.reset}`);
    console.log(`ID: ${sys.id}`);
    console.log(`Empire: ${sys.empire || 'None'}`);
    console.log(
      `Police Level: ${sys.police_level} (${r.security_status || sys.security_status || 'unknown security'})`,
    );
    if (sys.description) console.log(`Description: ${sys.description}`);

    const pois = sys.pois as Array<Record<string, unknown> | string>;
    console.log(`\n${c.bright}Points of Interest:${c.reset}`);
    for (const poi of pois) {
      if (typeof poi === 'string') {
        console.log(`  - ${poi}`);
        continue;
      }
      const online = (poi.online as number) > 0 ? ` ${c.cyan}(${poi.online} online)${c.reset}` : '';
      const base = poi.has_base ? ` ${c.green}[base]${c.reset}` : '';
      console.log(`  - ${poi.name} (${poi.type})${base}${online}  ${c.dim}${poi.id}${c.reset}`);
    }

    const connections = sys.connections as Array<Record<string, unknown> | string>;
    console.log(`\n${c.bright}Connected Systems:${c.reset}`);
    for (const conn of connections) {
      if (typeof conn === 'string') {
        console.log(`  - ${conn}`);
        continue;
      }
      const distance = conn.distance ? ` ${c.dim}(${conn.distance} ly)${c.reset}` : '';
      console.log(`  - ${conn.name}${distance}  ${c.dim}${conn.system_id}${c.reset}`);
    }

    const currentPoi = r.poi as Record<string, unknown> | undefined;
    if (currentPoi) {
      console.log(
        `\n${c.bright}Current POI:${c.reset} ${currentPoi.name} (${currentPoi.type})  ${c.dim}${currentPoi.id}${c.reset}`,
      );
    }
    return true;
  }),

  // POI info
  namedFormatter('poi_info', ['poi'], (r) => {
    const poi = (r.poi || r) as Record<string, unknown>;
    if (!poi.id || !poi.type || !poi.system_id) return false;
    console.log(`\n${c.bright}=== POI: ${poi.name} ===${c.reset}`);
    console.log(`ID: ${poi.id}`);
    console.log(`Type: ${poi.type}`);
    console.log(`System: ${poi.system_id}`);
    if (poi.description) console.log(`Description: ${poi.description}`);
    if (poi.class) console.log(`Class: ${poi.class}`);

    const resources = (r.resources || poi.resources) as Array<Record<string, unknown>> | undefined;
    if (resources?.length) {
      console.log(`\n${c.bright}Resources:${c.reset}`);
      for (const res of resources) {
        const display = res.remaining_display || `${res.remaining} remaining`;
        if (display === 'depleted' || res.remaining === 0) {
          console.log(
            `  - \x1b[9m${c.dim}${res.name || res.resource_id}: richness ${res.richness}, depleted${c.reset}\x1b[29m`,
          );
          continue;
        }

        let depletion = '';
        if (res.depletion_percent !== undefined) {
          const pct = Number(res.depletion_percent);
          const color = pct > 25 ? c.green : pct >= 5 ? c.yellow : c.red;
          depletion = ` (${color}${pct.toFixed(2)}% remaining${c.reset})`;
        }
        const remaining = res.max_remaining ? `${res.remaining}/${res.max_remaining}` : display;
        console.log(`  - ${res.name || res.resource_id}: richness ${res.richness}, ${remaining}${depletion}`);
      }
    }

    if (poi.base_id) console.log(`\nBase: ${poi.base_id} (use 'dock' to enter)`);

    const base = r.base as Record<string, unknown> | undefined;
    if (base) {
      console.log(`\n${c.bright}Base: ${base.name}${c.reset}`);
      if (base.description) console.log(`  ${base.description}`);
      console.log(`  Empire: ${base.empire || 'None'}`);
      console.log(`  Defense: ${base.defense_level}`);
    }

    const services = r.services as string[] | undefined;
    if (services?.length) console.log(`\n${c.bright}Services:${c.reset} ${services.join(', ')}`);
    return true;
  }),

  // Cargo
  namedFormatter('cargo', ['cargo'], (r, command) => {
    if (r.cargo === undefined) return false;
    if (command !== 'get_cargo' && command !== 'v2_get_cargo' && r.used === undefined && r.cargo_used === undefined) {
      return false;
    }
    const cargo = (r.cargo as Array<Record<string, unknown>>) || [];
    console.log(`\n${c.bright}=== Cargo ===${c.reset}`);
    const used = r.used ?? r.cargo_used ?? (r.ship as Record<string, unknown> | undefined)?.cargo_used;
    const capacity = r.capacity ?? r.cargo_capacity ?? (r.ship as Record<string, unknown> | undefined)?.cargo_capacity;
    const available = r.available ?? r.cargo_available;
    if (used !== undefined || capacity !== undefined) {
      const suffix = available !== undefined ? ` (${available} available)` : '';
      console.log(`Used: ${used ?? '?'}/${capacity ?? '?'}${suffix}\n`);
    }
    printItemTable(cargo);
    return true;
  }),

  // Nearby players, pirates, and empire NPCs
  namedFormatter('nearby', ['nearby'], (r) => {
    const players = (Array.isArray(r.nearby) ? r.nearby : r.players) as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(players)) return false;
    const pirates = (r.pirates as Array<Record<string, unknown>>) || [];
    const npcs = (r.empire_npcs as Array<Record<string, unknown>>) || [];

    console.log(`\n${c.bright}=== Nearby ===${c.reset}`);
    console.log(`\n${c.bright}Players (${(r.count as number) || players.length}):${c.reset}`);
    if (!players.length) {
      console.log(`  (No other players at this location)`);
    } else {
      for (const p of players) console.log(`  ${formatPlayer(p)}`);
    }

    if ((r.pirate_count as number) > 0) {
      console.log(`\n${c.red}Pirates (${r.pirate_count}):${c.reset}`);
      for (const p of pirates) {
        const name = p.name || p.pirate_id || 'Unknown';
        const ship = p.ship_class ? ` (${p.ship_class})` : '';
        const status = p.status ? ` - ${p.status}` : '';
        console.log(`  ${name}${ship}${status}`);
      }
    }

    if ((r.empire_npc_count as number) > 0) {
      console.log(`\n${c.dim}Empire NPCs (${r.empire_npc_count}):${c.reset}`);
      for (const n of npcs) {
        const name = n.name || n.npc_id || 'Unknown';
        const ship = n.ship_class ? ` (${n.ship_class})` : '';
        console.log(`  ${name}${ship}`);
      }
    }
    return true;
  }),

  // Wrecks
  (r) => {
    if (!Array.isArray(r.wrecks)) return false;
    const wrecks = r.wrecks as Array<Record<string, unknown>>;
    console.log(`\n${c.bright}=== Wrecks at POI ===${c.reset}`);
    if (!wrecks.length) {
      console.log(`(No wrecks at this location)`);
    } else {
      for (const w of wrecks) {
        console.log(`\n${c.yellow}Wreck: ${w.wreck_id}${c.reset}`);
        console.log(`  Ship: ${w.ship_class}`);
        console.log(`  Expires in: ${w.ticks_remaining} ticks`);
        const items = (w.items as Array<Record<string, unknown>>) || [];
        if (items.length) {
          console.log(`  Contents:`);
          for (const item of items) console.log(`    - ${item.quantity}x ${item.item_id}`);
        }
      }
    }
    return true;
  },

  // Skills (v2 format: player_skills array + skills metadata)
  (r) => {
    if (r.skills === undefined || r.player_skills === undefined) return false;
    const playerSkills = (r.player_skills as Array<Record<string, unknown>>) || [];
    console.log(`\n${c.bright}=== Your Skills ===${c.reset}`);
    console.log(`Total skills: ${r.player_skill_count || playerSkills.length}`);
    if (!playerSkills.length) {
      console.log(`\n(No skills trained yet - perform activities to gain XP)`);
    } else {
      const byCategory: Record<string, Array<Record<string, unknown>>> = {};
      for (const skill of playerSkills) {
        const cat = (skill.category as string) || 'Other';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(skill);
      }
      for (const [category, skills] of Object.entries(byCategory)) {
        console.log(`\n${c.cyan}${category}:${c.reset}`);
        for (const skill of skills) {
          const progress = skill.next_level_xp ? ` (${skill.current_xp}/${skill.next_level_xp} XP)` : ' (MAX)';
          console.log(`  ${skill.name}: Level ${skill.level}/${skill.max_level}${progress}`);
        }
      }
    }
    return true;
  },

  // Skills (v1 format: skills as object map of skill_id -> skill data)
  (r) => {
    if (!r.skills || typeof r.skills !== 'object' || Array.isArray(r.skills)) return false;
    const skills = r.skills as Record<
      string,
      {
        name: string;
        category: string;
        level: number;
        max_level: number;
        xp: number;
        next_level_xp?: number;
      }
    >;
    const skillEntries = Object.entries(skills);
    if (skillEntries.length === 0) return false;
    const firstSkill = skillEntries[0]?.[1];
    // Verify this looks like a skills map (entries should have name/level)
    if (!firstSkill?.name || firstSkill.level === undefined) return false;
    console.log(`\n${c.bright}=== Your Skills ===${c.reset}`);
    const byCategory: Record<string, typeof skillEntries> = {};
    for (const [skillId, skill] of skillEntries) {
      const cat = skill.category || 'Other';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push([skillId, skill]);
    }
    for (const [category, entries] of Object.entries(byCategory)) {
      console.log(`\n${c.cyan}${category}:${c.reset}`);
      for (const [, skill] of entries) {
        const progress = skill.next_level_xp
          ? ` (${skill.xp}/${skill.next_level_xp} XP to level ${skill.level + 1})`
          : skill.level >= skill.max_level
            ? ' (MAX)'
            : ` (${skill.xp} XP)`;
        console.log(`  ${skill.name}: Level ${skill.level}/${skill.max_level}${progress}`);
      }
    }
    return true;
  },

  // Ship listings (browse_ships) — must come before market listings since both use r.listings
  (r) => {
    if (!Array.isArray(r.listings)) return false;
    const listings = r.listings as Array<Record<string, unknown>>;
    const firstListing = listings[0];
    if (!firstListing?.ship_id) return false;
    console.log(`\n${c.bright}=== Ships for Sale @ ${r.base_name || 'Station'} ===${c.reset}`);
    for (const listing of listings) {
      const shipClass = listing.class_id || 'Unknown';
      const shipName = listing.ship_name || shipClass;
      const price = listing.price as number;
      const formattedPrice = price.toLocaleString();
      const scale = listing.scale ? `(Scale ${listing.scale})` : '';
      const tier = listing.tier ? `T${listing.tier}` : '';
      const category = listing.category ? `${listing.category}` : '';
      const categoryTier = [category, tier].filter(Boolean).join(' - ');
      const hull = listing.hull ? `Hull: ${listing.hull}/${listing.max_hull}` : '';
      const shield = listing.shield ? `Shield: ${listing.shield}` : '';
      const stats = [hull, shield].filter(Boolean).join(', ');
      const seller = listing.seller || listing.seller_name || listing.seller_id || 'Unknown';
      console.log(`\n${c.cyan}${shipName}${c.reset} (${shipClass}) ${scale}`);
      if (categoryTier) console.log(`  ${categoryTier}`);
      console.log(`  Price: ${c.yellow}${formattedPrice} credits${c.reset}`);
      if (stats) console.log(`  ${stats}`);
      console.log(`  Seller: ${seller}`);
      console.log(`  Listing ID: ${listing.listing_id}`);
    }
    return true;
  },

  // Market listings
  (r) => {
    if (!Array.isArray(r.listings)) return false;
    const listings = r.listings as Array<Record<string, unknown>>;
    console.log(`\n${c.bright}=== Market Listings ===${c.reset}`);
    if (r.buy_price_modifier) {
      console.log(`Buy price modifier: ${r.buy_price_modifier}x`);
      console.log(`Sell price modifier: ${r.sell_price_modifier}x`);
    }
    if (!listings.length) {
      console.log(`\n(No listings at this market)`);
    } else {
      for (const listing of listings) {
        const seller = listing.seller_name || listing.seller || listing.seller_id || 'NPC';
        console.log(`\n  ${listing.item_id}: ${listing.quantity} @ ${listing.price_each} each`);
        console.log(`    Listing ID: ${listing.listing_id}`);
        console.log(`    Seller: ${seller}`);
      }
    }
    return true;
  },

  // Location info (get_location) — must come before simple message formatter since
  // the response has both r.location and r.message, which the simple formatter swallows
  (r) => {
    if (!r.location || typeof r.location !== 'object') return false;
    const loc = r.location as {
      system_id: string;
      system_name: string;
      empire: string;
      security_status: string;
      connections: string[];
      poi_id: string;
      poi_name: string;
      poi_type: string;
      docked_at?: string;
      nearby_players: Array<Record<string, unknown>>;
      nearby_player_count: number;
      nearby_pirates: Array<Record<string, unknown>>;
      nearby_pirate_count: number;
      nearby_empire_npcs?: Array<Record<string, unknown>>;
      nearby_empire_npc_count?: number;
    };
    console.log(`\n${c.bright}=== Location ===${c.reset}`);
    console.log(`${c.cyan}System:${c.reset} ${loc.system_name} (${loc.system_id})`);
    console.log(`${c.cyan}Empire:${c.reset} ${loc.empire}`);
    console.log(`${c.cyan}Security:${c.reset} ${loc.security_status}`);
    if (loc.connections.length > 0) {
      console.log(`${c.cyan}Connections:${c.reset} ${loc.connections.join(', ')}`);
    }
    console.log(`${c.cyan}POI:${c.reset} ${loc.poi_name} (${loc.poi_type})`);
    if (loc.docked_at) {
      console.log(`${c.cyan}Docked at:${c.reset} ${loc.docked_at}`);
    }
    if (loc.nearby_player_count > 0) {
      console.log(`\n${c.bright}Nearby Players (${loc.nearby_player_count}):${c.reset}`);
      for (const player of loc.nearby_players.slice(0, 10)) {
        console.log(`  ${formatPlayer(player)}`);
      }
      if (loc.nearby_player_count > 10) {
        console.log(`  ... and ${loc.nearby_player_count - 10} more`);
      }
    }
    if (loc.nearby_pirate_count > 0) {
      console.log(`\n${c.red}Nearby Pirates: ${loc.nearby_pirate_count}${c.reset}`);
    }
    if (loc.nearby_empire_npc_count && loc.nearby_empire_npc_count > 0) {
      console.log(`\n${c.dim}Nearby NPCs: ${loc.nearby_empire_npc_count}${c.reset}`);
    }
    return true;
  },

  // Arrival (travel/jump)
  namedFormatter('arrival', ['poi_id', 'online_players'], (r) => {
    if (!r.poi_id || !Array.isArray(r.online_players)) return false;
    console.log(`\n${c.green}Arrived at ${c.bright}${r.poi || r.poi_id}${c.reset}`);
    const players = r.online_players as Array<Record<string, unknown>>;
    const count = (r.online_players_count as number) || players.length;
    if (count > 0) {
      console.log(`\n${c.bright}Players here (${count}):${c.reset}`);
      for (const p of players) console.log(`  ${formatPlayer(p)}`);
      if (r.online_players_truncated) console.log(`  ... and more`);
    } else {
      console.log(`\n(No other players here)`);
    }
    return true;
  }),

  // Market order book
  namedFormatter('view_market', ['items'], (r) => {
    if (r.action !== 'view_market' || !r.base_id) return false;
    const items = r.items as Array<Record<string, unknown>>;
    if (!items || items.length === 0) {
      console.log(`\n${c.bright}=== Market at ${r.base_id} ===${c.reset}\n  (empty)`);
      return true;
    }
    console.log(`\n${c.bright}=== Market at ${r.base_id} ===${c.reset}\n`);
    for (const item of items) {
      const name = String(item.item_name || item.item_id || 'unknown');
      const buyOrders = item.buy_orders as Array<Record<string, unknown>> | undefined;
      const sellOrders = item.sell_orders as Array<Record<string, unknown>> | undefined;
      console.log(`${c.bright}${name}${c.reset}`);
      if (buyOrders && buyOrders.length > 0) {
        console.log(`  Buy orders (${buyOrders.length}):`);
        for (const o of buyOrders) {
          const price = Number(o.price_each).toLocaleString();
          const qty = Number(o.quantity).toLocaleString();
          const src = o.source && o.source !== 'station' && o.source !== 'player' ? ` [${o.source}]` : '';
          console.log(`    ${c.green}${price} cr${c.reset} x ${qty}${src}`);
        }
      }
      if (sellOrders && sellOrders.length > 0) {
        console.log(`  Sell orders (${sellOrders.length}):`);
        for (const o of sellOrders) {
          const price = Number(o.price_each).toLocaleString();
          const qty = Number(o.quantity).toLocaleString();
          console.log(`    ${c.red}${price} cr${c.reset} x ${qty}`);
        }
      }
      if (!buyOrders?.length && !sellOrders?.length) {
        console.log('  (no orders)');
      }
      console.log('');
    }
    return true;
  }),

  // Station storage
  namedFormatter('storage', ['base_id', 'items'], (r) => {
    if (!r.base_id || !Array.isArray(r.items)) return false;
    const items = r.items as Array<Record<string, unknown>>;
    const ships = (r.ships as Array<Record<string, unknown>>) || [];
    console.log(`\n${c.bright}=== Storage at ${r.base_id} ===${c.reset}\n`);
    printItemTable(items);
    if (ships.length) {
      const nameW = Math.max(9, ...ships.map((s) => String(s.class_name || s.class_id || '').length));
      const classW = Math.max(5, ...ships.map((s) => String(s.class_id || '').length));
      const idW = Math.max(2, ...ships.map((s) => String(s.ship_id || '').length));
      const modsW = Math.max(4, ...ships.map((s) => String(s.modules ?? '').length));
      const cargoW = Math.max(5, ...ships.map((s) => String(s.cargo_used ?? '').length));
      console.log(`\n${c.bright}Ships (${ships.length}):${c.reset}\n`);
      console.log(
        `  ${'Ship Name'.padEnd(nameW)} | ${'Class'.padEnd(classW)} | ${'Mods'.padStart(modsW)} | ${'Cargo'.padStart(cargoW)} | ${'ID'.padEnd(idW)}`,
      );
      console.log(
        `  ${'-'.repeat(nameW)}-+-${'-'.repeat(classW)}-+-${'-'.repeat(modsW)}-+-${'-'.repeat(cargoW)}-+-${'-'.repeat(idW)}`,
      );
      for (const s of ships) {
        const name = String(s.class_name || s.class_id || '').padEnd(nameW);
        const cls = String(s.class_id || '').padEnd(classW);
        const mods = String(s.modules ?? '').padStart(modsW);
        const cargo = String(s.cargo_used ?? '').padStart(cargoW);
        const id = String(s.ship_id || '').padEnd(idW);
        console.log(`  ${name} | ${cls} | ${mods} | ${cargo} | ${id}`);
      }
    }
    return true;
  }),

  // Chat confirmation
  namedFormatter('chat_sent', ['content'], (r) => {
    const channel = r.channel || r.target;
    if (!channel || (r.action && r.action !== 'chat')) return false;
    if (!r.action && !r.message && !r.content && !r.sent_at && !r.timestamp) return false;
    if (r.message || r.content) {
      const timestamp = r.sent_at || r.timestamp;
      const time = timestamp ? `${c.dim}${new Date(timestamp as string).toLocaleTimeString()}${c.reset} ` : '';
      console.log(`${c.green}[${channel}]${c.reset} ${time}${r.message || r.content}`);
    } else {
      console.log(`${c.green}Chat sent:${c.reset} ${channel}`);
    }
    if (r.warning) console.log(`${c.yellow}Warning:${c.reset} ${r.warning}`);
    return true;
  }),

  namedFormatter('drones', ['drones'], (r) => {
    const drones = firstArray(r, ['drones']);
    if (!drones) return false;
    printCompactTable('Drones', drones, [
      ['Name', ['name', 'type_name', 'drone_type', 'item_id']],
      ['ID', ['drone_id', 'id']],
      ['Status', ['status', 'state']],
      ['Location', ['poi_name', 'poi_id', 'location', 'base_id']],
      ['Cargo', ['cargo_used', 'cargo']],
    ]);
    return true;
  }),

  namedFormatter('drone', ['drone'], (r) => {
    const drone = r.drone as Record<string, unknown> | undefined;
    if (!drone) return false;
    printCompactTable(
      'Drone',
      [drone],
      [
        ['Name', ['name', 'type_name', 'drone_type', 'item_id']],
        ['ID', ['drone_id', 'id']],
        ['Status', ['status', 'state']],
        ['Location', ['poi_name', 'poi_id', 'location', 'base_id']],
      ],
    );
    if (drone.script || r.script) console.log(`\n${c.bright}Script:${c.reset}\n${drone.script || r.script}`);
    return true;
  }),

  namedFormatter('facilities', ['facilities'], (r) => {
    const facilities = firstArray(r, ['facilities', 'facility_types', 'upgrades']);
    if (!facilities) return false;
    printCompactTable('Facilities', facilities, [
      ['Name', ['name', 'type_name', 'facility_type']],
      ['ID', ['facility_id', 'id', 'type_id']],
      ['Level', ['level', 'tier']],
      ['Status', ['status', 'enabled', 'active']],
      ['Owner', ['owner_name', 'owner_id', 'faction_tag', 'faction_id']],
    ]);
    return true;
  }),

  namedFormatter('facility', ['facility'], (r) => {
    const facility = r.facility as Record<string, unknown> | undefined;
    if (!facility) return false;
    printCompactTable(
      'Facility',
      [facility],
      [
        ['Name', ['name', 'type_name', 'facility_type']],
        ['ID', ['facility_id', 'id']],
        ['Level', ['level', 'tier']],
        ['Status', ['status', 'enabled', 'active']],
        ['Owner', ['owner_name', 'owner_id', 'faction_tag', 'faction_id']],
      ],
    );
    return true;
  }),

  namedFormatter('fleet', ['fleet'], (r) => {
    const fleet = r.fleet as Record<string, unknown> | undefined;
    if (!fleet) return false;
    console.log(`\n${c.bright}=== Fleet ===${c.reset}`);
    console.log(`ID: ${fleet.fleet_id || fleet.id || 'unknown'}`);
    if (fleet.leader_name || fleet.leader_id) console.log(`Leader: ${fleet.leader_name || fleet.leader_id}`);
    const members = (fleet.members || r.members) as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(members)) {
      printCompactTable('Fleet Members', members, [
        ['Name', ['username', 'name', 'player_name']],
        ['ID', ['player_id', 'id']],
        ['Ship', ['ship_class', 'ship_name']],
        ['Location', ['system_name', 'current_system', 'poi_name', 'current_poi']],
        ['Status', ['status', 'state']],
      ]);
    }
    return true;
  }),

  namedFormatter('battle_status', ['battle'], (r) => {
    const battle = r.battle as Record<string, unknown> | undefined;
    if (!battle) return false;
    console.log(`\n${c.bright}=== Battle ===${c.reset}`);
    console.log(`ID: ${battle.battle_id || battle.id || 'unknown'}`);
    if (battle.status || battle.phase) console.log(`Status: ${battle.status || battle.phase}`);
    if (battle.range_band || battle.range) console.log(`Range: ${battle.range_band || battle.range}`);
    const participants = (battle.participants || r.participants) as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(participants)) {
      printCompactTable('Participants', participants, [
        ['Name', ['username', 'name', 'player_name']],
        ['ID', ['player_id', 'id']],
        ['Side', ['side_id', 'side']],
        ['Stance', ['stance']],
        ['Target', ['target_name', 'target_id']],
      ]);
    }
    return true;
  }),

  namedFormatter('market_orders', ['orders'], (r) => {
    const orders = firstArray(r, ['orders']);
    if (!orders) return false;
    printCompactTable('Market Orders', orders, [
      ['Item', ['item_id', 'item_name']],
      ['ID', ['order_id', 'listing_id', 'id']],
      ['Side', ['side', 'type']],
      ['Qty', ['quantity', 'remaining']],
      ['Price', ['price_each', 'price']],
    ]);
    return true;
  }),

  namedFormatter('intel', ['intel'], (r) => {
    const intel = firstArray(r, ['intel', 'results', 'trade_intel']);
    if (!intel) return false;
    printCompactTable('Intel', intel, [
      ['System', ['system_name', 'system_id']],
      ['POI/Base', ['poi_name', 'poi_id', 'base_name', 'base_id']],
      ['Type', ['poi_type', 'resource_type', 'item_id']],
      ['Value', ['quantity', 'price_each', 'confidence']],
      ['Updated', ['updated_at', 'created_at']],
    ]);
    return true;
  }),

  // Simple message
  (r) => {
    if (!r.message || Object.keys(r).length > 2) return false;
    console.log(`${c.green}OK:${c.reset} ${r.message}`);
    return true;
  },
];

function displayStructuredResult(command: string, result: Record<string, unknown>): void {
  if (!result) return;

  // Normalize get_status response: the v2 API returns location data in a
  // separate `location` object rather than enriched `system`/`poi` fields
  // and player fields like `current_system`/`current_poi`/`docked_at_base`.
  // The login endpoint still returns the old shape.  Merge the location
  // object into the expected shape so formatters work for both.
  const loc = result.location as Record<string, unknown> | undefined;
  if (loc && !result.system) {
    result.system = { id: loc.system_id, name: loc.system_name };
  }
  if (loc && !result.poi) {
    result.poi = { id: loc.poi_id, name: loc.poi_name, base_name: loc.poi_id };
  }
  if (loc && result.player) {
    const p = result.player as Record<string, unknown>;
    if (p.current_system === undefined) p.current_system = loc.system_name;
    if (p.current_poi === undefined) p.current_poi = loc.poi_name;
    if (p.docked_at_base === undefined && loc.docked_at) p.docked_at_base = loc.docked_at;
  }
  // get_status puts nearby_players inside location; lift to top-level for formatter
  if (loc?.nearby_players && !result.nearby) {
    result.nearby = loc.nearby_players;
  }

  // Show auto-dock/undock flags before the result
  if (result.auto_docked)
    console.log(`${c.cyan}[AUTO-DOCKED]${c.reset} Automatically docked at station (cost 1 extra tick)`);
  if (result.auto_undocked)
    console.log(`${c.cyan}[AUTO-UNDOCKED]${c.reset} Automatically undocked from station (cost 1 extra tick)`);

  for (const formatter of resultFormatters) {
    if (formatter(result, command)) return;
  }

  const resultKeys = Object.keys(result);
  const nearMisses = resultFormatters.filter(
    (formatter) => formatter.hintKeys?.length && formatter.hintKeys.every((key) => resultKeys.includes(key)),
  );
  if (nearMisses.length > 0) {
    const names = nearMisses
      .map((formatter) => formatter.formatterName)
      .filter(Boolean)
      .join(', ');
    console.error(
      `${c.yellow}[DRIFT WARNING]${c.reset} '${command}' response has keys matching formatter(s) [${names}] but none matched. Response keys: [${resultKeys.join(', ')}]`,
    );
  }

  // Default: print JSON
  console.log(`\n${c.bright}=== Response ===${c.reset}`);
  console.log(JSON.stringify(result, null, 2));
}

function displayResult(command: string, response: APIResponse): void {
  console.log(`${c.dim}[${new Date().toISOString()}]${c.reset}`);
  const structured = getStructuredResult(response);
  if (structured) {
    displayStructuredResult(command, structured);
    return;
  }

  const result = getObjectResult(response);
  if (result) {
    displayStructuredResult(command, result);
    return;
  }

  if (typeof response.result === 'string' && response.result.trim()) {
    console.log(response.result);
    return;
  }

  if (command === 'session') return;
}

function parseGlobalOptions(args: string[]): GlobalOptions {
  const json = args[0] === '--json' || process.env.SPACEMOLT_OUTPUT === 'json';
  if (json) {
    JSON_OUTPUT = true;
    DEBUG = false;
  }
  return {
    json,
    args: json && args[0] === '--json' ? args.slice(1) : args,
  };
}

function printJsonResponse(response: APIResponse): void {
  console.log(JSON.stringify(response, null, 2));
}

function printJsonError(code: string, message: string): void {
  printJsonResponse({ error: { code, message } });
}

// =============================================================================
// Argument Parsing
// =============================================================================

function parseArgs(args: string[]): { command: string; payload: Record<string, string>; warnings: string[] } {
  const command = args[0] || '';
  const payload: Record<string, string> = {};
  const warnings: string[] = [];
  const config = COMMANDS[command];
  const argDefs = config?.args || [];
  // Collect all valid arg names (positional strings + required) for --flag detection
  const validArgNames = new Set<string>();
  for (const def of argDefs) {
    if (typeof def === 'string') validArgNames.add(def);
    else if (def && typeof def === 'object' && def.rest) validArgNames.add(def.rest);
  }
  if (config?.required) for (const r of config.required) validArgNames.add(r);
  let positionalIndex = 0;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    // Warn on bare --flag (no =) that looks like a flag but isn't a known arg
    if (arg.startsWith('--') && arg.indexOf('=') === -1 && !validArgNames.has(arg.slice(2))) {
      warnings.push(`Unknown flag "${arg}" — treated as positional arg. Use "spacemolt ${command}" for usage.`);
    }

    const eqIndex = arg.indexOf('=');
    if (eqIndex > 0) {
      // Key=value argument
      payload[arg.substring(0, eqIndex)] = arg.substring(eqIndex + 1);
    } else {
      // Positional argument
      const argDef = argDefs[positionalIndex];
      if (argDef) {
        if (typeof argDef === 'string') {
          payload[argDef] = arg;
        } else if (argDef.rest) {
          // Rest argument - consume remaining args
          payload[argDef.rest] = args.slice(i).join(' ');
          break;
        }
      } else if (positionalIndex === 0 && !payload.id && !payload.target_id) {
        // Fallback: first positional as generic ID
        payload.id = arg;
      }
      positionalIndex++;
    }
  }

  return { command, payload, warnings };
}

function validateRequiredArgs(command: string, payload: Record<string, string>): string | null {
  const required = COMMANDS[command]?.required;
  if (!required) return null;
  const normalized = normalizeParsedPayload(command, payload);
  for (const arg of required) {
    if (payload[arg]) continue;
    const canonicalRequired = normalizeParsedPayload(command, { [arg]: '__required__' });
    const canonicalKeys = Object.keys(canonicalRequired);
    if (canonicalKeys.some((key) => normalized[key])) continue;
    return arg;
  }
  return null;
}

function getUsageHint(command: string): string {
  return COMMANDS[command]?.usage || '<args...>';
}

function getUsageLine(command: string): string {
  return `spacemolt ${command} ${getUsageHint(command)}`.trimEnd();
}

function getArgNames(config: CommandConfig): string[] {
  const names: string[] = [];
  for (const arg of config.args || []) {
    names.push(typeof arg === 'string' ? arg : arg.rest);
  }
  for (const arg of config.required || []) {
    if (!names.includes(arg)) names.push(arg);
  }
  return names;
}

function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
    }
    for (let j = 0; j < previous.length; j++) previous[j] = current[j] ?? 0;
  }

  return previous[b.length] ?? 0;
}

function suggestCommands(command: string, limit = 3): string[] {
  if (!command) return [];
  const normalized = command.toLowerCase();
  return Object.keys(COMMANDS)
    .map((candidate) => {
      const distance = levenshtein(normalized, candidate);
      const prefixScore = candidate.startsWith(normalized) || normalized.startsWith(candidate) ? -2 : 0;
      return { candidate, score: distance + prefixScore };
    })
    .filter(({ candidate, score }) => score <= Math.max(2, Math.floor(Math.max(command.length, candidate.length) / 3)))
    .sort((a, b) => a.score - b.score || a.candidate.localeCompare(b.candidate))
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

function showCommandHelp(command: string): boolean {
  const config = COMMANDS[command];
  if (!config) return false;

  console.log(`\n${c.bright}${command}${c.reset}`);
  if (config.description) console.log(config.description);
  console.log(`\n${c.bright}Usage:${c.reset}`);
  console.log(`  ${getUsageLine(command)}`);

  const argNames = getArgNames(config);
  if (argNames.length > 0) {
    console.log(`\n${c.bright}Arguments:${c.reset}`);
    console.log(`  ${argNames.join(', ')}`);
    console.log(`\n${c.bright}Accepted forms:${c.reset}`);
    console.log(`  ${getUsageLine(command)}`);
    console.log(`  spacemolt ${command} ${argNames.map((arg) => `${arg}=...`).join(' ')}`);
  }

  if (config.example) {
    console.log(`\n${c.bright}Example:${c.reset}`);
    console.log(`  ${config.example}`);
  }
  if (config.discoverWith?.length) {
    console.log(`\n${c.bright}Discover valid IDs/state with:${c.reset}`);
    for (const related of config.discoverWith) console.log(`  spacemolt ${related}`);
  }
  if (config.seeAlso?.length) {
    console.log(`\n${c.bright}See also:${c.reset} ${config.seeAlso.join(', ')}`);
  }
  return true;
}

function printNextSteps(command: string, missingArg?: string): void {
  const config = COMMANDS[command];
  const steps: string[] = [];
  for (const related of config?.discoverWith || []) steps.push(`spacemolt ${related}`);
  if (!steps.includes('spacemolt get_status')) steps.push('spacemolt get_status');
  if (command !== 'get_commands' && !steps.includes('spacemolt get_commands')) steps.push('spacemolt get_commands');

  const reason = missingArg && config?.discoverWith?.length ? ` to find a valid ${missingArg}` : '';
  console.error(
    `\n${c.cyan}Next:${c.reset} run ${steps
      .slice(0, 3)
      .map((step) => `"${step}"`)
      .join(' or ')}${reason}.`,
  );
}

function displayUnknownCommand(command: string): void {
  console.error(`${c.red}Error:${c.reset} Unknown command "${command}"`);
  const suggestions = suggestCommands(command);
  if (suggestions.length > 0) console.error(`Did you mean: ${suggestions.join(', ')}`);
  console.error(`\nRun "spacemolt --help" for the local command overview.`);
  console.error(`Run "spacemolt get_commands" for the server command list once connected.`);
}

function displayMissingArgument(command: string, missingArg: string): void {
  console.error(`${c.red}Error:${c.reset} Missing required argument: ${c.yellow}${missingArg}${c.reset}`);
  console.error(`\n${c.bright}Usage:${c.reset}`);
  console.error(`  ${getUsageLine(command)}`);

  const argNames = getArgNames(COMMANDS[command] || {});
  if (argNames.length > 0) {
    console.error(`\n${c.bright}Accepted forms:${c.reset}`);
    console.error(`  ${getUsageLine(command)}`);
    console.error(`  spacemolt ${command} ${argNames.map((arg) => `${arg}=...`).join(' ')}`);
  }

  const example = COMMANDS[command]?.example;
  if (example) console.error(`\n${c.bright}Example:${c.reset}\n  ${example}`);
  printNextSteps(command, missingArg);
}

// Fields that should be converted to numbers when sending to the server
const NUMERIC_FIELDS = new Set([
  'quantity',
  'price_each',
  'new_price',
  'slot_idx',
  'weapon_idx',
  'page',
  'limit',
  'offset',
  'coverage_percent',
  'credits',
  'index',
  'ticks',
  'amount',
  'priority',
  'expiration_hours',
  'per_page',
  'level',
  'max_price',
  'price',
  'page_size',
  'side_id',
]);

// Convert string payload values to appropriate types (numbers, booleans)
function convertPayloadTypes(payload: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    // Convert numeric fields
    if (NUMERIC_FIELDS.has(key)) {
      const num = parseFloat(value);
      if (!Number.isNaN(num)) {
        result[key] = num;
        continue;
      }
    }
    // Convert boolean fields
    if (value === 'true') {
      result[key] = true;
      continue;
    }
    if (value === 'false') {
      result[key] = false;
      continue;
    }
    // Keep as string
    result[key] = value;
  }
  return result;
}

// =============================================================================
// Help
// =============================================================================

function showHelp(): void {
  console.log(`
${c.bright}SpaceMolt Reference Client v${VERSION}${c.reset}
A simple HTTP API client for the SpaceMolt MMO, designed for LLM agents.

${c.bright}Quick Start:${c.reset}
  ${c.cyan}# New player - get registration code from spacemolt.com/dashboard, then:${c.reset}
  spacemolt register myname solarian YOUR_REGISTRATION_CODE

  ${c.cyan}# Login (session persists, only needed once per 30 min):${c.reset}
  spacemolt login myname <password>

  ${c.cyan}# Basic gameplay loop:${c.reset}
  spacemolt get_status                  # See your ship/location
  spacemolt undock                      # Leave station
  spacemolt get_system                  # See POIs to travel to
  spacemolt travel sol_asteroid_belt    # Go to asteroid belt
  spacemolt mine                        # Mine resources
  spacemolt get_cargo                   # Check what you mined
  spacemolt travel sol_earth            # Return to station
  spacemolt dock                        # Enter station
  spacemolt sell ore_iron 50            # Sell 50 iron ore

${c.bright}Usage:${c.reset}
  spacemolt <command> [args...]
  spacemolt --json <command> [args...]

  Arguments can be positional or key=value:
    spacemolt travel sol_asteroid_belt
    spacemolt travel target_poi=sol_asteroid_belt

${c.bright}Information Commands (unlimited):${c.reset}
  get_status          Your player, ship, location
  get_system          Current system's POIs and connections
  get_poi             Current POI details and resources
  get_base            Base info (when docked)
  get_ship            Detailed ship info with modules
  get_cargo           Cargo contents
  get_nearby          Other players at your POI
  get_skills          Your skill levels and XP
  get_wrecks          Wrecks at POI (for looting)
  get_map             Galaxy map (all systems)
  get_battle_status   Current battle state
  list_drones         Drones in your ship bay and deployed nearby
  fleet_status        Current fleet membership and members
  facility_list       Facilities at your current base
  catalog <type>      Browse ships/items/skills/recipes
  get_guide [guide]   Game guide and onboarding info
  help                Full command list from server
  get_commands        Structured command list (for automation)

${c.bright}Action Commands (1 per tick, ~10 seconds):${c.reset}
  Actions execute on the next tick (~10 seconds). The response
  blocks until the result is ready and returns it directly.

  ${c.cyan}Navigation:${c.reset}
    travel <poi_id>           Travel within system
    jump <system_id>          Jump to connected system
    dock                      Enter station
    undock                    Leave station

  ${c.cyan}Mining & Trading:${c.reset}
    mine                      Mine at asteroid belt
    sell <item_id> <qty>      Sell to NPC market
    buy <item_id> [qty]       Buy from market
    refuel [id] [qty]         Refuel at station or use fuel cells
    repair                    Repair at station

  ${c.cyan}Combat:${c.reset}
    attack <player_id>        Attack player at POI
    scan <player_id>          Scan player for info
    cloak true/false          Toggle cloaking

  ${c.cyan}Battle:${c.reset}
    battle_engage             Join or start a battle
    battle_advance            Advance battle range
    battle_retreat            Retreat from battle
    battle_stance <stance>    Set stance (fire/evade/brace/flee)
    battle_target <target>    Focus a battle target
    reload <weapon> <ammo>    Reload weapon with ammo

  ${c.cyan}Drones:${c.reset}
    load_drone <item_id>      Load a drone from cargo
    deploy_drone <drone_id>   Deploy a loaded drone
    recall_drone [drone_id]   Recall one drone, or all=true
    upload_drone <id> <code>  Upload DroneLang script

  ${c.cyan}Salvage & Tow:${c.reset}
    tow_wreck <wreck_id>      Tow a wreck
    release_tow               Release towed wreck
    scrap_wreck               Scrap towed wreck for materials
    sell_wreck                Sell towed wreck at station

  ${c.cyan}Shipyard:${c.reset}
    commission_ship <class>   Order a custom ship build
    commission_quote <class>  Get build quote
    commission_status         Check build progress
    claim_commission <id>     Pick up completed ship
    cancel_commission <id>    Cancel active commission

  ${c.cyan}Ship Exchange:${c.reset}
    list_ship_for_sale        List a stored ship for sale
    browse_ships              Browse ships for sale at station
    buy_listed_ship <id>      Buy a player-listed ship
    cancel_ship_listing <id>  Cancel your ship listing

  ${c.cyan}Insurance:${c.reset}
    buy_insurance <ticks>     Purchase ship insurance
    get_insurance_quote       Get insurance pricing
    claim_insurance           File insurance claim
    view_insurance            View active policies

  ${c.cyan}Fleet & Facilities:${c.reset}
    create_fleet              Create a fleet
    fleet_invite <player>     Invite a player
    fleet_accept              Accept a fleet invite
    fleet_leave               Leave your fleet
    fleet_disband             Disband your fleet
    facility_list             List all facilities at current base
    facility_types [category]  Browse facility types (use category=faction, infrastructure, etc.)
    facility_build <type>     Build a player facility
    facility_upgrade <type>   Upgrade a player facility
    facility_toggle <id>      Toggle a facility
    faction_facility_list     List faction facilities at current base
    faction_facility_build <type>  Build a faction facility
    faction_facility_upgrade <type>  Upgrade a faction facility
    faction_facility_toggle <id>     Toggle a faction facility

  ${c.cyan}Storage:${c.reset}
    view_storage [station_id]        Personal storage at station (or current)
    view_faction_storage              Faction storage at current station
    deposit_items <item_id> <qty>     Cargo -> personal storage
    withdraw_items <item_id> <qty>    Personal storage -> cargo
    send_gift <recipient> [item_id=.. quantity=.. credits=.. ship_id=..] [message=".."]
    faction_deposit_credits <amount>  Wallet -> faction treasury
    faction_withdraw_credits <amount> Faction treasury -> wallet (requires manage_treasury)
    NOTE: deposit_items source=faction target=self for faction->personal direct transfer
    NOTE: deposit_items source=storage target=faction for personal->faction direct transfer

  ${c.cyan}Market / Exchange:${c.reset}
    view_market [item_id] [category]  Order book (use item_id for depth, category for filter)
    view_orders [station_id]          Your orders at station
    create_sell_order <item> <qty> <price>  List items for sale
    create_buy_order <item> <qty> <price>   Place a buy offer
    cancel_order <order_id|all>       Cancel order (or 'all')
    modify_order <order_id> <price>   Update order price
    estimate_purchase <item> <qty>     Preview buy cost without executing
    analyze_market                     Trading insights at current station
    faction_create_sell_order <item> <qty> <price>  Faction sell (from faction storage)
    faction_create_buy_order <item> <qty> <price>   Faction buy (to faction storage)

  ${c.cyan}Faction:${c.reset}
    faction_info [faction_id]         Your faction (or specific faction)
    faction_list                      All factions
    create_faction <name> <tag>       Start a faction
    join_faction <faction_id>         Join via invite
    leave_faction                     Leave your faction
    faction_edit [description=.. charter=.. primary_color=.. secondary_color=..]
    faction_invite <player>           Invite player (requires invite permission)
    faction_kick <player>             Kick member (requires kick permission)
    faction_promote <player> <role>   Promote/demote (recruit/member/officer/leader)
    faction_set_ally <faction_id>     Mark as ally
    faction_set_enemy <faction_id>     Mark as enemy
    faction_remove_ally <faction_id>  Remove ally
    faction_remove_enemy <faction_id>  Remove enemy
    faction_declare_war <faction_id> [reason=..]  Declare war
    faction_propose_peace <faction_id> [terms=..]  Offer peace
    faction_accept_peace <faction_id>  Accept peace
    faction_create_role <name> <priority> [permissions=..]  Custom role
    faction_edit_role <role_id> [name=.. permissions=..]  Edit role
    faction_delete_role <role_id>      Delete custom role
    faction_rooms                      List common space rooms
    faction_visit_room <room_id>      Visit a room
    faction_write_room <room_id>       Create/edit room
    faction_delete_room <room_id>      Delete room
    faction_get_invites                Pending invites
    faction_decline_invite <faction_id>  Decline invite
    faction_post_mission <title> <description> <type> <objectives> <rewards>
    faction_cancel_mission <template_id>  Cancel faction mission
    faction_list_missions              Faction missions at current station

  ${c.cyan}Faction Intel & Trade:${c.reset}
    faction_submit_intel <systems>     Submit system data (JSON array)
    faction_query_intel [system_name=.. system_id=.. poi_type=.. resource_type=..]
    faction_intel_status               Intel coverage stats
    faction_submit_trade_intel <stations>  Report market prices
    faction_query_trade_intel [base_id=.. item_id=.. station_name=..]
    faction_trade_intel_status         Trade intel coverage stats

  ${c.cyan}Social:${c.reset}
    chat <channel> <message>  Send chat (local/system/faction)
    petition <empire_id> <message>  Send message to empire leadership (1/hr rate limit)
    captains_log_list               View journal entries
    captains_log_add <entry>        Add journal entry
    captains_log_get <index>        Read entry (0=newest)
    captains_log_delete <index>     Delete entry

${c.bright}Empires:${c.reset} solarian, voidborn, crimson, nebula, outerrim

${c.bright}Tips for LLM Agents:${c.reset}
  - Always run 'get_status' first to understand your situation
  - Use 'get_system' to see where you can travel
  - Check 'get_cargo' before selling
  - Use '--help <command>' for local CLI usage and examples
  - Use 'help command=<command>' for server-provided command details
  - Actions return results directly — no polling needed
  - Auto-dock/undock handles dock state automatically
  - Your session auto-renews; credentials saved in session file
  - Speak English in all chat and forum messages

${c.bright}Environment Variables:${c.reset}
  SPACEMOLT_URL       API URL (default: https://game.spacemolt.com/api/v2)
  SPACEMOLT_SESSION   Session file (default: ./.spacemolt-session.json)
  DEBUG=true          Show verbose request/response logging

${c.bright}API Routing:${c.reset}
  - The client uses v2 exclusively
  - Commands route to /api/v2/{tool}/{action}
  - help and get_guide route through v2 spacemolt endpoints

${c.bright}Documentation:${c.reset}
  API Reference: https://game.spacemolt.com/api/v2/openapi.json
  Game Website:  https://www.spacemolt.com
`);
}

// =============================================================================
// Error Display
// =============================================================================

function displayError(
  command: string,
  error: { code: string; message: string; wait_seconds?: number; retry_after?: number },
): void {
  console.log(`${c.dim}[${new Date().toISOString()}]${c.reset}`);
  console.error(`${c.red}Error [${error.code}]:${c.reset} ${error.message}`);
  const retryAfter = error.retry_after ?? error.wait_seconds;
  if (retryAfter !== undefined) {
    console.error(`${c.yellow}Wait ${retryAfter.toFixed(1)} seconds before retrying.${c.reset}`);
  }
  const help = ERROR_HELP[error.code];
  if (help) console.error(`\n${c.cyan}Suggestion:${c.reset} ${help}`);
  if (COMMANDS[command]) printNextSteps(command);
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const options = parseGlobalOptions(process.argv.slice(2));
  const args = options.args;

  // Check for updates in the background (non-blocking)
  if (!options.json) checkForUpdates();

  if (args.length === 0) {
    showHelp();
    process.exit(0);
  }

  if (args[0] === '--help' || args[0] === '-h') {
    const helpCommand = args[1];
    if (helpCommand) {
      if (!showCommandHelp(helpCommand)) {
        if (options.json) {
          printJsonError('unknown_command', `Unknown command: ${helpCommand}`);
          process.exit(1);
        }
        displayUnknownCommand(helpCommand);
        process.exit(1);
      }
      process.exit(0);
    }
    showHelp();
    process.exit(0);
  }

  if (args[0] === '--version' || args[0] === '-v') {
    console.log(`SpaceMolt Client v${VERSION}`);
    console.log(`API: ${API_BASE}`);
    process.exit(0);
  }

  const { command, payload, warnings } = parseArgs(args);

  if (!command) {
    showHelp();
    process.exit(0);
  }

  if (warnings.length > 0) {
    for (const w of warnings) console.error(`${c.yellow}Warning:${c.reset} ${w}`);
  }

  if (DEBUG) {
    console.log(`${c.dim}[DEBUG] Command: ${command}${c.reset}`);
    console.log(`${c.dim}[DEBUG] Payload: ${JSON.stringify(payload)}${c.reset}`);
    console.log(`${c.dim}[DEBUG] API: ${API_BASE}${c.reset}`);
  }

  try {
    if (!COMMANDS[command]) {
      if (options.json) {
        printJsonError('unknown_command', `Unknown command: ${command}`);
        process.exit(1);
      }
      displayUnknownCommand(command);
      process.exit(1);
    }

    if (payload.help === 'true' || payload.help === '1') {
      showCommandHelp(command);
      process.exit(0);
    }

    const missingArg = validateRequiredArgs(command, payload);
    if (missingArg) {
      if (options.json) {
        printJsonError('missing_required_argument', `Missing required argument: ${missingArg}`);
        process.exit(1);
      }
      displayMissingArgument(command, missingArg);
      process.exit(1);
    }

    // Save credentials on login/register
    if (command === 'login' && payload.username && payload.password) {
      const session = await getSession();
      session.username = payload.username;
      session.password = payload.password;
      await saveSession(session);
      if (DEBUG) console.log(`${c.dim}[DEBUG] Saved credentials to session${c.reset}`);
    }

    if (command === 'register' && payload.username) {
      const session = await getSession();
      session.username = payload.username;
      await saveSession(session);
    }

    const requestPayload = normalizeParsedPayload(command, payload);

    // Convert string payload to proper types (numbers, booleans)
    const typedPayload = Object.keys(requestPayload).length > 0 ? convertPayloadTypes(requestPayload) : {};
    const response = await execute(command, typedPayload);

    if (options.json && response.error) {
      printJsonResponse(response);
      process.exit(1);
    }

    if (!options.json && response.notifications?.length) {
      console.log(`${c.dim}--- Notifications (${response.notifications.length}) ---${c.reset}`);
      displayNotifications(response.notifications);
      console.log('');
    }

    if (!options.json && response.error) {
      displayError(command, response.error);
      process.exit(1);
    }

    const structuredResult = getStructuredResult(response);
    const resultRecord = structuredResult || getObjectResult(response);

    if (command === 'register') {
      const password = typeof resultRecord?.password === 'string' ? resultRecord.password : undefined;
      const player = isRecord(resultRecord?.player) ? resultRecord.player : undefined;
      const playerId =
        typeof resultRecord?.player_id === 'string'
          ? resultRecord.player_id
          : typeof player?.id === 'string'
            ? player.id
            : response.session?.player_id;

      if (password) {
        const session = await loadSession();
        if (session) {
          session.password = password;
          if (playerId) session.player_id = playerId;
          await saveSession(session);
          if (DEBUG) console.log(`${c.dim}[DEBUG] Saved password to session${c.reset}`);
        }
      }
    }

    if (command === 'login') {
      const player = isRecord(resultRecord?.player) ? resultRecord.player : undefined;
      const playerId =
        typeof player?.id === 'string'
          ? player.id
          : typeof resultRecord?.player_id === 'string'
            ? resultRecord.player_id
            : response.session?.player_id;

      if (playerId) {
        const session = await loadSession();
        if (session) {
          session.player_id = playerId;
          await saveSession(session);
        }
      }
    }

    if (options.json) {
      printJsonResponse(response);
      process.exit(response.error ? 1 : 0);
    }

    displayResult(command, response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (options.json) {
      printJsonError('connection_error', errorMessage);
      process.exit(1);
    }
    console.error(`${c.red}${c.bright}Connection Error:${c.reset} ${errorMessage}`);
    console.error('');

    if (errorMessage.includes('fetch') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('network')) {
      console.error(`${c.yellow}Troubleshooting:${c.reset}`);
      console.error(`  1. Check your internet connection`);
      console.error(`  2. Verify the API is reachable: ${API_BASE}`);
      console.error(`  3. The game server may be temporarily down`);
      console.error(`  4. Try again in a few moments`);
    }

    if (DEBUG) {
      console.error(`\n${c.dim}[DEBUG] Full error:${c.reset}`);
      console.error(error);
    }

    process.exit(1);
  }
}

main();
