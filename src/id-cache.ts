import * as fs from 'node:fs';
import * as path from 'node:path';
import { COMMANDS } from './commands.ts';
import { getObjectResult, getStructuredResult, isRecord } from './response.ts';
import { c, QUIET } from './runtime.ts';
import { getSessionPath, hardenPermissions } from './session.ts';
import type { APIResponse } from './types.ts';

export type IdKind = 'poi' | 'system' | 'item' | 'player';

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

const ID_KINDS = new Set<IdKind>(['poi', 'system', 'item', 'player']);
const CACHE_FILE_MODE = 0o600;
const CACHE_DIR_MODE = 0o700;
const MAX_HINTS = 500;

export function isIdKind(value: string): value is IdKind {
  return ID_KINDS.has(value as IdKind);
}

export function getIdCachePath(sessionPath?: string): string {
  const resolvedPath = sessionPath || getSessionPath();
  const parsed = path.parse(resolvedPath);
  return path.join(parsed.dir, `${parsed.name}.ids.json`);
}

export function loadIdCacheSync(sessionPath?: string): IdHint[] {
  try {
    const cachePath = getIdCachePath(sessionPath);
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
  const cachePath = getIdCachePath(sessionPath);
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
): Promise<void> {
  if (response.error) return;
  const result = getStructuredResult(response) || getObjectResult(response);
  if (!result) return;

  const extracted = extractIdHints(command, result, new Date().toISOString());
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

  for (const player of arrayRecords(result.nearby)) pushPlayer(push, player);
  for (const player of arrayRecords(result.players)) pushPlayer(push, player);
  for (const player of arrayRecords(result.online_players)) pushPlayer(push, player);
  for (const player of arrayRecords(result.agents)) pushPlayer(push, player);

  return hints;
}

export function hintsForKind(kind: IdKind, hints = loadIdCacheSync()): IdHint[] {
  return sortNewest(dedupeHints(hints.filter((hint) => hint.kind === kind)));
}

export function searchItemHints(query: string, hints = loadIdCacheSync()): IdHint[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return sortNewest(
    dedupeHints(
      hints.filter((hint) => {
        if (hint.kind !== 'item') return false;
        return hint.id.toLowerCase().includes(normalized) || (hint.name || '').toLowerCase().includes(normalized);
      }),
    ),
  );
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
  if (command === 'travel' && isResolverField(normalizedField, ['target_poi', 'id'])) return 'poi';
  if (['jump', 'find_route'].includes(command) && isResolverField(normalizedField, ['target_system', 'id'])) {
    return 'system';
  }
  if (
    ['attack', 'scan', 'fleet_invite', 'fleet_kick'].includes(command) &&
    isResolverField(normalizedField, ['target_id', 'player_id', 'id'])
  ) {
    return 'player';
  }
  if (
    [
      'sell',
      'buy',
      'deposit_items',
      'withdraw_items',
      'jettison',
      'use_item',
      'create_sell_order',
      'create_buy_order',
    ].includes(command)
  ) {
    if (isResolverField(normalizedField, ['item_id', 'id'])) return 'item';
    return undefined;
  }
  if (normalizedField.includes('poi')) return 'poi';
  if (normalizedField.includes('system')) return 'system';
  if (normalizedField.includes('player') || normalizedField.includes('target')) return 'player';
  if (normalizedField.includes('item')) return 'item';
  return undefined;
}

export function formatCachedIdAmbiguity(
  command: string,
  field: string,
  result: Extract<CachedIdResolveResult, { type: 'ambiguous' }>,
): string[] {
  const lines = [
    `${c.red}Error:${c.reset} Ambiguous cached ${result.kind} match for "${result.query}" in ${command}.${field}.`,
  ];
  for (const hint of result.matches.slice(0, 8)) lines.push(`  ${formatHint(hint)}`);
  if (result.matches.length > 8) lines.push(`  ${c.dim}...and ${result.matches.length - 8} more${c.reset}`);
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

export function printCachedIdSuggestions(command: string, field?: string, sessionPath?: string): void {
  if (QUIET) return;
  const kind = idKindForCommandField(command, field);
  if (!kind) return;
  const hints = loadIdCacheSync(sessionPath);
  const suggestions = hintsForKind(kind, hints).slice(0, 8);
  if (suggestions.length === 0) return;

  console.error(`\n${c.cyan}Cached ${kind} IDs:${c.reset}`);
  for (const hint of suggestions) console.error(`  ${formatHint(hint)}`);
}

export function printIds(kind: IdKind, sessionPath?: string): void {
  const hints = loadIdCacheSync(sessionPath);
  const filtered = hintsForKind(kind, hints);
  if (filtered.length === 0) {
    console.log(`No cached ${kind} IDs yet.`);
    printDiscoveryCommands(kind);
    return;
  }

  console.log(`${c.bright}${kind} IDs${c.reset}`);
  for (const hint of filtered) console.log(`  ${formatHint(hint)}`);
}

export function printWhereCanI(query: string, sessionPath?: string): void {
  const hints = loadIdCacheSync(sessionPath);
  const matches = searchItemHints(query, hints);
  if (matches.length === 0) {
    console.log(`No cached item matches for "${query}".`);
    console.log(`Try: spacemolt catalog type=items search=${query}`);
    console.log(`Try: spacemolt view_market ${query}`);
    return;
  }

  console.log(`${c.bright}Cached locations for "${query}"${c.reset}`);
  for (const hint of matches) console.log(`  ${formatHint(hint)}`);
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

function formatHint(hint: IdHint): string {
  const name = hint.name && hint.name !== hint.id ? ` (${hint.name})` : '';
  const context = hint.context && Object.keys(hint.context).length > 0 ? ` ${formatContext(hint.context)}` : '';
  return `${hint.id}${name}${context} ${c.dim}[${hint.sourceCommand}, ${hint.seenAt}]${c.reset}`;
}

function formatContext(context: Record<string, string | number | boolean>): string {
  return Object.entries(context)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
}

function printDiscoveryCommands(kind: IdKind): void {
  const commandsByKind: Record<IdKind, string[]> = {
    poi: ['get_system', 'get_status'],
    system: ['get_system', 'get_map'],
    item: ['get_cargo', 'view_market', 'catalog type=items'],
    player: ['get_nearby', 'get_system_agents'],
  };
  console.log(`Run one of these to populate it:`);
  for (const command of commandsByKind[kind]) console.log(`  spacemolt ${command}`);
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
