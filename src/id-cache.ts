import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliWriter } from './cli-context.ts';
import { COMMANDS } from './commands.ts';
import { colorsForPlain, type DirectColors } from './output-style.ts';
import { getObjectResult, getStructuredResult, isRecord } from './response.ts';
import { getSessionPath, hardenPermissions, tryGetSessionPath } from './session.ts';
import type { APIResponse } from './types.ts';

export type IdKind =
  | 'poi'
  | 'system'
  | 'item'
  | 'player'
  | 'ship'
  | 'faction'
  | 'drone'
  | 'wreck'
  | 'facility'
  | 'listing';

export interface IdHint {
  kind: IdKind;
  id: string;
  name?: string;
  sourceCommand: string;
  seenAt: string;
  context?: Record<string, string | number | boolean>;
}

export type CachedIdResolveResult =
  | { type: 'resolved'; value: string; hint: IdHint; match: 'exact' | 'prefix' | 'substring' }
  | { type: 'ambiguous'; kind: IdKind; query: string; matches: IdHint[] }
  | { type: 'unresolved'; value: string };

interface IdCacheFile {
  version: 1;
  hints: IdHint[];
}

const ID_KINDS = new Set<IdKind>([
  'poi',
  'system',
  'item',
  'player',
  'ship',
  'faction',
  'drone',
  'wreck',
  'facility',
  'listing',
]);
const CACHE_FILE_MODE = 0o600;
const CACHE_DIR_MODE = 0o700;
const MAX_HINTS = 500;
const DEFAULT_CLOCK = { now: () => new Date() };
const DEFAULT_COLORS = colorsForPlain(false);
const COMMAND_ID_RESOLVER_RULES: Record<string, Partial<Record<IdKind, string[]>>> = {
  travel: { poi: ['target_poi', 'id'] },
  jump: { system: ['target_system', 'id'] },
  find_route: { system: ['target_system', 'id'] },
  attack: { player: ['target_id', 'player_id', 'id'] },
  scan: { player: ['target_id', 'player_id', 'id'] },
  battle_target: { player: ['target_id', 'id'] },
  chat: { player: ['target_id'] },
  get_chat_history: { player: ['target_id'] },
  fleet_invite: { player: ['target_id', 'player_id', 'id'] },
  fleet_kick: { player: ['target_id', 'player_id', 'id'] },
  faction_invite: { player: ['player_id', 'id'] },
  faction_withdraw_invite: { player: ['player_id', 'id'] },
  faction_kick: { player: ['player_id', 'id'] },
  faction_promote: { player: ['player_id', 'id'] },
  write_note: {},
  read_note: {},
  delete_note: {},
  forum_get_thread: {},
  forum_delete_thread: {},
  forum_reply: {},
  forum_upvote: {},
  forum_delete_reply: {},
  citizenship_apply: {},
  citizenship_renounce: {},
  citizenship_withdraw: {},
  petition: {},
  faction_info: { faction: ['faction_id', 'id'] },
  join_faction: { faction: ['faction_id', 'id'] },
  faction_accept_invite: { faction: ['faction_id', 'id'] },
  faction_decline_invite: { faction: ['faction_id', 'id'] },
  faction_propose_ally: { faction: ['target_faction_id', 'id'] },
  faction_set_ally: { faction: ['target_faction_id', 'id'] },
  faction_accept_ally: { faction: ['target_faction_id', 'id'] },
  faction_set_enemy: { faction: ['target_faction_id', 'id'] },
  faction_remove_ally: { faction: ['target_faction_id', 'id'] },
  faction_remove_enemy: { faction: ['target_faction_id', 'id'] },
  faction_declare_war: { faction: ['target_faction_id', 'id'] },
  faction_propose_peace: { faction: ['target_faction_id', 'id'] },
  faction_accept_peace: { faction: ['target_faction_id', 'id'] },
  sell: { item: ['item_id', 'id'] },
  buy: { item: ['item_id', 'id'] },
  // Preserve canonical storage item IDs like fuel; cached item names can resolve to different cargo items.
  storage: {},
  deposit_items: { item: ['item_id', 'id'] },
  withdraw_items: { item: ['item_id', 'id'] },
  jettison: { item: ['item_id', 'id'] },
  use_item: { item: ['item_id', 'id'] },
  create_sell_order: { item: ['item_id', 'id'] },
  create_buy_order: { item: ['item_id', 'id'] },
  load_drone: { item: ['drone_item_id', 'id'] },
  deploy_drone: { drone: ['drone_id', 'id'] },
  recall_drone: { drone: ['drone_id', 'id'] },
  unload_drone: { drone: ['drone_id', 'id'] },
  upload_drone: { drone: ['drone_id', 'id'] },
  get_drone: { drone: ['drone_id', 'id'] },
  name_drone: { drone: ['drone_id', 'id'] },
  set_drone_name: { drone: ['drone_id', 'id'] },
  reload: { item: ['ammo_item_id', 'target'] },
  tow_wreck: { wreck: ['wreck_id', 'id'] },
  salvage_wreck: { wreck: ['wreck_id', 'id'] },
  loot_wreck: { wreck: ['wreck_id', 'id'], item: ['item_id'] },
  facility_toggle: { facility: ['facility_id'] },
  facility_upgrade: { facility: ['facility_id'] },
  facility_transfer: { facility: ['facility_id'], player: ['player_id'] },
  facility_list_for_sale: { facility: ['facility_id'] },
  facility_buy_listing: { listing: ['listing_id'] },
  facility_cancel_listing: { listing: ['listing_id'] },
  faction_facility_toggle: { facility: ['facility_id'] },
  faction_facility_upgrade: { facility: ['facility_id'] },
  buy_listed_ship: { listing: ['listing_id', 'id'] },
  cancel_ship_listing: { listing: ['listing_id', 'id'] },
  switch_ship: { ship: ['ship_id', 'id'] },
  sell_ship: { ship: ['ship_id', 'id'] },
  scrap_ship: { ship: ['ship_id', 'id'] },
  list_ship_for_sale: { ship: ['ship_id', 'id'] },
  view_storage: { poi: ['station_id'] },
  view_faction_storage: { poi: ['station_id'] },
};

interface Clock {
  now(): Date;
}

export function isIdKind(value: string): value is IdKind {
  return ID_KINDS.has(value as IdKind);
}

export function commandResolverFields(command: string): Record<string, string[]> | undefined {
  const rules = COMMAND_ID_RESOLVER_RULES[command];
  if (!rules) return undefined;
  return Object.fromEntries(Object.entries(rules).map(([kind, fields]) => [kind, [...(fields ?? [])]])) as Record<
    string,
    string[]
  >;
}

export function getIdCachePath(sessionPath?: string): string {
  const resolvedPath = sessionPath || getSessionPath();
  const parsed = path.parse(resolvedPath);
  return path.join(parsed.dir, `${parsed.name}.ids.json`);
}

export function tryGetIdCachePath(sessionPath?: string): string | undefined {
  const resolvedPath = sessionPath || tryGetSessionPath();
  if (!resolvedPath) return undefined;
  const parsed = path.parse(resolvedPath);
  return path.join(parsed.dir, `${parsed.name}.ids.json`);
}

export function loadIdCacheSync(sessionPath?: string): IdHint[] {
  try {
    const cachePath = tryGetIdCachePath(sessionPath);
    if (!cachePath) return [];
    if (!fs.existsSync(cachePath)) return [];
    hardenPermissions(cachePath, CACHE_FILE_MODE);
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as Partial<IdCacheFile>;
    if (!Array.isArray(parsed.hints)) return [];
    return parsed.hints.filter(isHint);
  } catch {
    return [];
  }
}

export async function saveIdCache(hints: IdHint[], sessionPath?: string): Promise<void> {
  const cachePath = tryGetIdCachePath(sessionPath);
  if (!cachePath) return;
  const parentDir = path.dirname(cachePath);
  if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true, mode: CACHE_DIR_MODE });
  hardenPermissions(parentDir, CACHE_DIR_MODE);

  const tmpPath = path.join(
    parentDir,
    `.${path.basename(cachePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  const contents = `${JSON.stringify({ version: 1, hints: hints.slice(0, MAX_HINTS) }, null, 2)}\n`;

  try {
    const handle = await fs.promises.open(tmpPath, 'wx', CACHE_FILE_MODE);
    try {
      await handle.writeFile(contents, 'utf-8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.promises.rename(tmpPath, cachePath);
    hardenPermissions(cachePath, CACHE_FILE_MODE);
  } catch (err) {
    try {
      await fs.promises.unlink(tmpPath);
    } catch {
      /* best effort */
    }
    throw err;
  }
}

export async function cacheIdsFromResponse(
  command: string,
  response: APIResponse,
  sessionPath?: string,
  clock: Clock = DEFAULT_CLOCK,
): Promise<void> {
  if (response.error) return;
  const result = getStructuredResult(response) || getObjectResult(response);
  if (!result) return;

  const extracted = extractIdHints(command, result, clock.now().toISOString());
  if (extracted.length === 0) return;

  const existing = loadIdCacheSync(sessionPath);
  const merged = mergeHints(extracted, existing);
  await saveIdCache(merged, sessionPath);
}

export function extractIdHints(command: string, result: Record<string, unknown>, seenAt: string): IdHint[] {
  const hints: IdHint[] = [];
  const push = (hint: Omit<IdHint, 'sourceCommand' | 'seenAt'>) => {
    if (!hint.id) return;
    hints.push({
      ...hint,
      sourceCommand: command,
      seenAt,
      context: compactContext(hint.context),
    });
  };

  const system = isRecord(result.system) ? result.system : undefined;
  if (system) {
    push({
      kind: 'system',
      id: stringValue(system.id),
      name: stringValue(system.name),
      context: pick(system, ['empire']),
    });
    for (const poi of arrayRecordsOrStrings(system.pois)) {
      if (typeof poi === 'string') push({ kind: 'poi', id: poi });
      else
        push({
          kind: 'poi',
          id: stringValue(poi.id),
          name: stringValue(poi.name),
          context: pick(poi, ['type', 'has_base']),
        });
    }
    for (const connection of arrayRecordsOrStrings(system.connections)) {
      if (typeof connection === 'string') push({ kind: 'system', id: connection });
      else {
        push({
          kind: 'system',
          id: stringValue(connection.system_id || connection.id),
          name: stringValue(connection.name),
          context: pick(connection, ['distance']),
        });
      }
    }
  }

  const poi = isRecord(result.poi) ? result.poi : undefined;
  if (poi)
    push({
      kind: 'poi',
      id: stringValue(poi.id || poi.poi_id),
      name: stringValue(poi.name || poi.poi_name),
      context: pick(poi, ['type', 'system_id']),
    });

  const faction = isRecord(result.faction) ? result.faction : undefined;
  if (faction) pushFaction(push, faction);
  for (const faction of arrayRecords(result.factions)) pushFaction(push, faction);
  const facility = isRecord(result.facility) ? result.facility : undefined;
  if (facility) pushFacility(push, facility);
  for (const facility of arrayRecords(result.facilities)) pushFacility(push, facility);
  for (const listing of arrayRecords(result.listings)) pushListing(push, listing);

  const location = isRecord(result.location) ? result.location : undefined;
  if (location) {
    push({ kind: 'system', id: stringValue(location.system_id), name: stringValue(location.system_name) });
    push({
      kind: 'poi',
      id: stringValue(location.poi_id),
      name: stringValue(location.poi_name),
      context: pick(location, ['docked_at']),
    });
    for (const player of arrayRecords(location.nearby_players)) pushPlayer(push, player);
  }

  for (const item of arrayRecords(result.cargo)) pushItem(push, item, ['quantity', 'size']);
  for (const item of arrayRecords(result.items)) {
    const itemWithContext = isRecord(result.base_id) ? item : { ...item, base_id: result.base_id };
    pushItem(push, itemWithContext, ['quantity', 'category', 'base_id']);
  }
  for (const item of arrayRecords(result.inventory)) pushItem(push, item, ['quantity']);
  for (const ship of arrayRecords(result.ships)) pushShip(push, ship);
  const drone = isRecord(result.drone) ? result.drone : undefined;
  if (drone) pushDrone(push, drone);
  for (const drone of arrayRecords(result.drones)) pushDrone(push, drone);
  for (const wreck of arrayRecords(result.wrecks)) pushWreck(push, wreck);

  for (const player of arrayRecords(result.nearby)) pushPlayer(push, player);
  for (const player of arrayRecords(result.players)) pushPlayer(push, player);
  for (const player of arrayRecords(result.online_players)) pushPlayer(push, player);
  for (const player of arrayRecords(result.agents)) pushPlayer(push, player);

  return hints;
}

export function hintsForKind(kind: IdKind, hints = loadIdCacheSync()): IdHint[] {
  return sortNewest(dedupeHints(hints.filter((hint) => hint.kind === kind)));
}

export function searchIdHints(kind: IdKind, query: string, hints = loadIdCacheSync()): IdHint[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return hintsForKind(kind, hints);
  return sortNewest(
    dedupeHints(
      hints.filter((hint) => {
        if (hint.kind !== kind) return false;
        return hint.id.toLowerCase().includes(normalized) || (hint.name || '').toLowerCase().includes(normalized);
      }),
    ),
  );
}

export function searchItemHints(query: string, hints = loadIdCacheSync()): IdHint[] {
  if (!query.trim()) return [];
  return searchIdHints('item', query, hints);
}

export function resolveCachedId(kind: IdKind, query: string, hints = loadIdCacheSync()): CachedIdResolveResult {
  const trimmed = query.trim();
  if (!trimmed) return { type: 'unresolved', value: query };

  const candidates = dedupeHintsById(hintsForKind(kind, hints));
  const exact = findMatches(candidates, trimmed, 'exact');
  if (exact.length > 0) return resolveMatches(kind, trimmed, exact, 'exact');

  const prefix = findMatches(candidates, trimmed, 'prefix');
  if (prefix.length > 0) return resolveMatches(kind, trimmed, prefix, 'prefix');

  const substring = findMatches(candidates, trimmed, 'substring');
  if (substring.length > 0) return resolveMatches(kind, trimmed, substring, 'substring');

  return { type: 'unresolved', value: query };
}

export function idKindForCommandField(command: string, field?: string): IdKind | undefined {
  const normalizedField = normalizeField(field || '');
  const resolverRules = COMMAND_ID_RESOLVER_RULES[command];
  if (resolverRules) {
    for (const kind of ID_KINDS) {
      const fields = resolverRules[kind];
      if (fields && isResolverField(normalizedField, fields)) return kind;
    }
    return undefined;
  }

  if (normalizedField.includes('poi')) return 'poi';
  if (normalizedField.includes('system')) return 'system';
  if (normalizedField.includes('player') || normalizedField.includes('target')) return 'player';
  if (normalizedField === 'ship_id' || normalizedField.endsWith('_ship_id')) return 'ship';
  if (normalizedField.includes('item')) return 'item';
  return undefined;
}

export function formatCachedIdAmbiguity(
  command: string,
  field: string,
  result: Extract<CachedIdResolveResult, { type: 'ambiguous' }>,
  options: { plain?: boolean } = {},
): string[] {
  const colors = colorsForPlain(Boolean(options.plain));
  const lines = [
    `${colors.red}Error:${colors.reset} Ambiguous cached ${result.kind} match for "${result.query}" in ${command}.${field}.`,
  ];
  for (const hint of result.matches.slice(0, 8)) lines.push(`  ${formatHint(hint, colors)}`);
  if (result.matches.length > 8) lines.push(`  ${colors.dim}...and ${result.matches.length - 8} more${colors.reset}`);
  lines.push(`Use the exact ID, or run a discovery command to refresh cached IDs.`);
  return lines;
}

export function cachedIdAmbiguityMessage(result: Extract<CachedIdResolveResult, { type: 'ambiguous' }>): string {
  const candidates = result.matches
    .slice(0, 8)
    .map((hint) => (hint.name && hint.name !== hint.id ? `${hint.id} (${hint.name})` : hint.id))
    .join(', ');
  const suffix = result.matches.length > 8 ? `, and ${result.matches.length - 8} more` : '';
  return `Ambiguous cached ${result.kind} match for "${result.query}". Use the exact ID. Matches: ${candidates}${suffix}`;
}

export function printCachedIdSuggestions(
  command: string,
  field?: string,
  sessionPath?: string,
  writer?: CliWriter,
  options: { quiet?: boolean; plain?: boolean } = {},
): void {
  if (options.quiet) return;
  const kind = idKindForCommandField(command, field);
  if (!kind) return;
  const hints = loadIdCacheSync(sessionPath);
  const suggestions = hintsForKind(kind, hints).slice(0, 8);
  if (suggestions.length === 0) return;

  const err = writer?.err.bind(writer) ?? console.error;
  const colors = colorsForPlain(Boolean(options.plain));
  err(`\n${colors.cyan}Cached ${kind} IDs:${colors.reset}`);
  for (const hint of suggestions) err(`  ${formatHint(hint, colors)}`);
}

export function printIds(
  kind: IdKind,
  sessionPath?: string,
  writer?: CliWriter,
  query?: string,
  options: { plain?: boolean } = {},
): void {
  const hints = loadIdCacheSync(sessionPath);
  const filtered = query ? searchIdHints(kind, query, hints) : hintsForKind(kind, hints);
  const out = writer?.out.bind(writer) ?? console.log;
  const colors = colorsForPlain(Boolean(options.plain));
  if (filtered.length === 0) {
    if (query) {
      out(`No cached ${kind} matches for "${query}".`);
    } else {
      out(`No cached ${kind} IDs yet.`);
      printDiscoveryCommands(kind, writer);
    }
    return;
  }

  out(
    query
      ? `${colors.bright}${kind} IDs matching "${query}"${colors.reset}`
      : `${colors.bright}${kind} IDs${colors.reset}`,
  );
  for (const hint of filtered) out(`  ${formatHint(hint, colors)}`);
}

export function printWhereCanI(
  query: string,
  sessionPath?: string,
  writer?: CliWriter,
  options: { plain?: boolean } = {},
): void {
  const hints = loadIdCacheSync(sessionPath);
  const matches = searchItemHints(query, hints);
  const out = writer?.out.bind(writer) ?? console.log;
  const colors = colorsForPlain(Boolean(options.plain));
  if (matches.length === 0) {
    out(`No cached item matches for "${query}".`);
    out(`Try: spacemolt catalog type=items search=${query}`);
    out(`Try: spacemolt view_market ${query}`);
    return;
  }

  out(`${colors.bright}Cached locations for "${query}"${colors.reset}`);
  for (const hint of matches) out(`  ${formatHint(hint, colors)}`);
}

function mergeHints(newHints: IdHint[], existing: IdHint[]): IdHint[] {
  const merged = new Map<string, IdHint>();
  for (const hint of [...existing, ...newHints]) merged.set(`${hint.kind}:${hint.id}:${hint.sourceCommand}`, hint);
  return sortNewest([...merged.values()]);
}

function dedupeHints(hints: IdHint[]): IdHint[] {
  const seen = new Set<string>();
  const result: IdHint[] = [];
  for (const hint of hints) {
    const key = `${hint.kind}:${hint.id}:${hint.sourceCommand}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(hint);
  }
  return result;
}

function dedupeHintsById(hints: IdHint[]): IdHint[] {
  const seen = new Set<string>();
  const result: IdHint[] = [];
  for (const hint of hints) {
    const key = `${hint.kind}:${hint.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(hint);
  }
  return result;
}

function sortNewest(hints: IdHint[]): IdHint[] {
  return [...hints].sort((a, b) => b.seenAt.localeCompare(a.seenAt) || a.id.localeCompare(b.id));
}

function findMatches(hints: IdHint[], query: string, match: 'exact' | 'prefix' | 'substring'): IdHint[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];
  return hints.filter((hint) => {
    const values = [hint.id, hint.name || ''].map(normalizeSearchText).filter(Boolean);
    if (match === 'exact') return values.some((value) => value === normalizedQuery);
    if (match === 'prefix') return values.some((value) => value.startsWith(normalizedQuery));
    return values.some((value) => value.includes(normalizedQuery));
  });
}

function resolveMatches(
  kind: IdKind,
  query: string,
  matches: IdHint[],
  match: 'exact' | 'prefix' | 'substring',
): CachedIdResolveResult {
  const hint = matches[0];
  if (matches.length === 1 && hint) return { type: 'resolved', value: hint.id, hint, match };
  return { type: 'ambiguous', kind, query, matches };
}

function formatHint(hint: IdHint, colors: DirectColors = DEFAULT_COLORS): string {
  const name = hint.name && hint.name !== hint.id ? ` (${hint.name})` : '';
  const context = hint.context && Object.keys(hint.context).length > 0 ? ` ${formatContext(hint.context)}` : '';
  return `${hint.id}${name}${context} ${colors.dim}[${hint.sourceCommand}, ${hint.seenAt}]${colors.reset}`;
}

function formatContext(context: Record<string, string | number | boolean>): string {
  return Object.entries(context)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
}

function printDiscoveryCommands(kind: IdKind, writer?: CliWriter): void {
  const out = writer?.out.bind(writer) ?? console.log;
  const commandsByKind: Record<IdKind, string[]> = {
    poi: ['get_system', 'get_status'],
    system: ['get_system', 'get_map'],
    item: ['get_cargo', 'view_market', 'catalog type=items'],
    player: ['get_nearby', 'get_system_agents'],
    ship: ['list_ships', 'view_storage'],
    faction: ['faction_list', 'faction_info'],
    drone: ['list_drones'],
    wreck: ['get_wrecks'],
    facility: ['facility_list', 'faction_facility_list'],
    listing: ['facility_browse_for_sale', 'browse_ships', 'get_trades'],
  };
  out(`Run one of these to populate it:`);
  for (const command of commandsByKind[kind]) out(`  spacemolt ${command}`);
}

function pushItem(
  push: (hint: Omit<IdHint, 'sourceCommand' | 'seenAt'>) => void,
  item: Record<string, unknown>,
  contextKeys: string[],
): void {
  push({
    kind: 'item',
    id: stringValue(item.item_id || item.id),
    name: stringValue(item.item_name || item.name),
    context: pick(item, contextKeys),
  });
}

function pushPlayer(
  push: (hint: Omit<IdHint, 'sourceCommand' | 'seenAt'>) => void,
  player: Record<string, unknown>,
): void {
  push({
    kind: 'player',
    id: stringValue(player.player_id || player.id || player.username),
    name: stringValue(player.username || player.name),
    context: pick(player, ['ship_class', 'faction_tag', 'status']),
  });
}

function pushShip(push: (hint: Omit<IdHint, 'sourceCommand' | 'seenAt'>) => void, ship: Record<string, unknown>): void {
  push({
    kind: 'ship',
    id: stringValue(ship.ship_id || ship.id),
    name: stringValue(ship.custom_name || ship.ship_name || ship.class_id || ship.class_name || ship.name),
    context: pick(ship, ['class_id', 'class_name', 'location', 'location_base_id', 'is_active']),
  });
}

function pushFaction(
  push: (hint: Omit<IdHint, 'sourceCommand' | 'seenAt'>) => void,
  faction: Record<string, unknown>,
): void {
  push({
    kind: 'faction',
    id: stringValue(faction.faction_id || faction.id || faction.tag),
    name: stringValue(faction.tag || faction.name),
    context: pick(faction, ['name', 'member_count', 'relationship']),
  });
}

function pushDrone(
  push: (hint: Omit<IdHint, 'sourceCommand' | 'seenAt'>) => void,
  drone: Record<string, unknown>,
): void {
  push({
    kind: 'drone',
    id: stringValue(drone.drone_id || drone.id),
    name: stringValue(drone.name || drone.type || drone.type_id),
    context: pick(drone, ['status', 'system_id', 'base_id', 'poi_id']),
  });
}

function pushWreck(
  push: (hint: Omit<IdHint, 'sourceCommand' | 'seenAt'>) => void,
  wreck: Record<string, unknown>,
): void {
  push({
    kind: 'wreck',
    id: stringValue(wreck.wreck_id || wreck.id),
    name: stringValue(wreck.name || wreck.ship_class),
    context: pick(wreck, ['ticks_remaining', 'poi_id', 'base_id']),
  });
}

function pushFacility(
  push: (hint: Omit<IdHint, 'sourceCommand' | 'seenAt'>) => void,
  facility: Record<string, unknown>,
): void {
  push({
    kind: 'facility',
    id: stringValue(facility.facility_id || facility.id),
    name: stringValue(facility.name || facility.type_name || facility.facility_type),
    context: pick(facility, ['facility_type', 'type_name', 'base_id', 'owner_name', 'faction_id']),
  });
}

function pushListing(
  push: (hint: Omit<IdHint, 'sourceCommand' | 'seenAt'>) => void,
  listing: Record<string, unknown>,
): void {
  push({
    kind: 'listing',
    id: stringValue(listing.listing_id || listing.id),
    name: stringValue(
      listing.name ||
        listing.item_name ||
        listing.ship_name ||
        listing.class_name ||
        listing.class_id ||
        listing.facility_name ||
        listing.facility_type,
    ),
    context: pick(listing, ['item_id', 'ship_id', 'facility_id', 'price', 'price_each', 'seller_name']),
  });
}

function arrayRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function arrayRecordsOrStrings(value: unknown): Array<Record<string, unknown> | string> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> | string => isRecord(item) || typeof item === 'string');
}

function pick(source: Record<string, unknown>, keys: string[]): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') result[key] = value;
  }
  return result;
}

function compactContext(context: Record<string, string | number | boolean> | undefined) {
  if (!context || Object.keys(context).length === 0) return undefined;
  return context;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeField(field: string): string {
  return field.toLowerCase().replace(/-/g, '_');
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function isResolverField(normalizedField: string, fields: string[]): boolean {
  return !normalizedField || fields.includes(normalizedField);
}

function isHint(value: unknown): value is IdHint {
  if (!isRecord(value)) return false;
  return (
    isIdKind(String(value.kind)) &&
    typeof value.id === 'string' &&
    typeof value.sourceCommand === 'string' &&
    typeof value.seenAt === 'string'
  );
}

export function discoverCommandsFor(command: string): string[] {
  return COMMANDS[command]?.discoverWith || [];
}
