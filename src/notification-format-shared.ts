import { formatShipCommissionReceipt } from './ship-commission-receipt.ts';

/** Local isRecord — same style as ship-commission-receipt.ts; no import from response.ts. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

const DEFAULT_COUNT_MAP_LIMIT = 6;
const DEFAULT_INVENTORY_LIMIT = 6;

/**
 * Format `{ jump: 12, undock: 1 }` as `jump×12, undock×1` (top entries only).
 * Default limit 6 (unified multi-line + table).
 */
export function formatCountMap(value: unknown, limit = DEFAULT_COUNT_MAP_LIMIT): string | undefined {
  const record = isRecord(value) ? value : undefined;
  if (!record) return undefined;
  const entries = Object.entries(record)
    .map(([key, count]) => {
      const n = finiteNumber(count);
      if (!key.trim() || n === undefined || n <= 0) return undefined;
      return [key, n] as const;
    })
    .filter((entry): entry is readonly [string, number] => Boolean(entry))
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  if (!entries.length) return undefined;
  const preview = entries
    .slice(0, limit)
    .map(([key, count]) => `${key}×${count}`)
    .join(', ');
  const suffix = entries.length > limit ? `, +${entries.length - limit} more` : '';
  return `${preview}${suffix}`;
}

/** Keys that may nest an item list inside an inventory-like bag. */
const INVENTORY_NEST_KEYS = ['items', 'cargo', 'loot', 'inventory', 'contents', 'looted'] as const;

/** Prefer these fields (in order) for an item row label. */
const INVENTORY_ITEM_ID_KEYS = [
  'item_id',
  'item_name',
  'name',
  'resource_id',
  'module_type_id',
  'module_id',
  'id',
] as const;

/** Prefer these fields (in order) for an item row quantity. */
const INVENTORY_QTY_KEYS = ['quantity', 'count', 'amount', 'qty'] as const;

function inventoryItemLabel(item: Record<string, unknown>): string | undefined {
  for (const key of INVENTORY_ITEM_ID_KEYS) {
    const value = item[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function inventoryItemQuantity(item: Record<string, unknown>): number | undefined {
  for (const key of INVENTORY_QTY_KEYS) {
    const n = finiteNumber(item[key]);
    if (n !== undefined) return n;
  }
  // Module / presence rows without quantity still count as one unit.
  return inventoryItemLabel(item) !== undefined ? 1 : undefined;
}

function pushInventoryEntry(acc: Map<string, number>, key: string | undefined, quantity: number | undefined): void {
  if (!key?.trim() || quantity === undefined || quantity <= 0) return;
  const id = key.trim();
  acc.set(id, (acc.get(id) ?? 0) + quantity);
}

/**
 * Collect inventory-like entries from common API shapes:
 * - count map: `{ ore_iron: 5, credits: 100 }`
 * - item array: `[{ item_id, quantity }, …]`
 * - nested bag: `{ items: […] }`, `{ cargo: […] }`, etc.
 * Nested non-list objects are skipped (never walked into ship/location graphs).
 */
function collectInventoryEntries(value: unknown, acc: Map<string, number>, depth = 0): void {
  if (depth > 2 || value === null || value === undefined) return;

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!isRecord(entry)) continue;
      pushInventoryEntry(acc, inventoryItemLabel(entry), inventoryItemQuantity(entry));
    }
    return;
  }

  if (!isRecord(value)) return;

  // Prefer nested list bags when present (merge all recognized nests).
  let sawNest = false;
  for (const nestKey of INVENTORY_NEST_KEYS) {
    if (!(nestKey in value)) continue;
    sawNest = true;
    collectInventoryEntries(value[nestKey], acc, depth + 1);
  }
  if (sawNest) {
    // Also pick up scalar co-entries on the same bag (e.g. credits alongside items[]).
    for (const [key, count] of Object.entries(value)) {
      if ((INVENTORY_NEST_KEYS as readonly string[]).includes(key)) continue;
      pushInventoryEntry(acc, key, finiteNumber(count));
    }
    return;
  }

  // Flat count map: only finite positive numeric values.
  for (const [key, count] of Object.entries(value)) {
    pushInventoryEntry(acc, key, finiteNumber(count));
  }
}

/**
 * Compact inventory-style preview (K15) — never full nested JSON.
 *
 * Examples:
 * - `{ ore_iron: 5, credits: 100 }` → `2 items: ore_iron×5, credits×100`
 * - `[{ item_id: 'ore_iron', quantity: 5 }]` → `1 item: ore_iron×5`
 * - large bags truncate with `+N more` after `limit` (default 6)
 *
 * Returns undefined when no inventory-like entries can be extracted.
 */
export function formatInventoryPreview(value: unknown, limit = DEFAULT_INVENTORY_LIMIT): string | undefined {
  const acc = new Map<string, number>();
  collectInventoryEntries(value, acc);
  if (!acc.size) return undefined;

  const entries = [...acc.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const preview = entries
    .slice(0, limit)
    .map(([key, count]) => `${key}×${count}`)
    .join(', ');
  const suffix = entries.length > limit ? `, +${entries.length - limit} more` : '';
  const total = entries.length;
  const label = total === 1 ? '1 item' : `${total} items`;
  return `${label}: ${preview}${suffix}`;
}

// ── Shared notification preview (Policy 5 ladder + typed handlers) ──────────
//
// K8 module-size intent: keep pure preview + formatCountMap in this file for PR1.
// Design allows a split to `notification-preview.ts` only if growth is ≫~200 lines
// *and* the split pays for itself. Typed PREVIEW_HANDLERS (PR2+) may push past that
// threshold — prefer one module until dual registries / table wire-up settle, then
// split if navigation suffers. Do not re-flag K8 solely for line count mid-migration.

/** Normalized envelope matching `normalizedNotification()` in `src/notifications.ts`. */
export interface NormalizedNotification {
  /** Coarse type string (often equals msgType). */
  type: string;
  /** Dispatch key: `msg_type` if non-empty, else `type`. */
  msgType: string;
  timestamp: unknown;
  data: Record<string, unknown>;
}

/** Optional shared color/severity class for renderers (K14). */
export type NotificationSeverity = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** Human-oriented notification preview — no ANSI, no I/O. */
export interface NotificationPreview {
  /**
   * Human inline display tag (no brackets), e.g. "ACTION RESULT", "CHAT:local", "SYSTEM".
   * Used only for multi-line layout: `[${tag}] headline`.
   * **Not** the table Type column — Type stays raw server `msg_type` (K13).
   */
  tag: string;
  /**
   * Single primary line body (no timestamp, no [TAG] brackets).
   * For table-critical types, put the full compact Message-quality string in `headline`.
   */
  headline: string;
  /** Optional secondary lines (prompts, loot lines, verbose extras). Table may ignore these. */
  details: string[];
  /**
   * Optional hint when bulky fields were intentionally omitted.
   * Renderer-only metadata — never injected into notification objects.
   * Default render: off. Shown only under `--verbose-notifications` (inline dim detail).
   */
  omittedHint?: string;
  /**
   * Optional severity for color mapping. Interim inline adapter may ignore.
   * Never affects machine modes or table Type.
   */
  severity?: NotificationSeverity;
}

export interface NotificationPreviewOptions {
  /**
   * Max characters for a single detail line / headline segment.
   * Default: 200 for inline.
   * Table must pass `maxLineLength: 120` to match `printCompactTable` `maxCellWidth: 120`.
   */
  maxLineLength?: number;
  /** Max detail lines / scalar bag keys produced by generic expansion. Default: 6. */
  maxDetails?: number;
  /**
   * Max object depth for a future nested scalar walk. Default: 2.
   * **Reserved:** accepted and resolved today but unused by Policy 5 (top-level scalar bag only).
   * Will apply if/when a depth-limited nested walk is added; not a live control yet.
   */
  maxDepth?: number;
  /**
   * When true (`--verbose-notifications`), allow extra preferred scalars / verbose detail policy.
   * `omittedHint` remains renderer metadata; the inline adapter shows it as a dim detail line
   * under `--verbose-notifications`. Still never expands nested ship/location/nearby dumps.
   */
  verbose?: boolean;
}

type ResolvedPreviewOptions = Required<
  Pick<NotificationPreviewOptions, 'maxLineLength' | 'maxDetails' | 'maxDepth' | 'verbose'>
>;

/** Defaults include reserved `maxDepth`; verbose notification expansion is opt-in. */
const DEFAULT_PREVIEW_OPTIONS: ResolvedPreviewOptions = {
  maxLineLength: 200,
  maxDetails: 6,
  maxDepth: 2,
  verbose: false,
};

/** Table ladder sender side (order matters — first hit wins). */
const SENDER_KEYS = ['sender', 'sender_name', 'from_name', 'username'] as const;

/** Table ladder body side when pairing with sender. */
const BODY_KEYS = ['content', 'message', 'summary', 'text', 'description'] as const;

/** Direct message keys when no sender+body pair (order matches table + design). */
const MESSAGE_KEYS = ['message', 'content', 'summary', 'text', 'description', 'error', 'reason'] as const;

const GENERIC_SCALAR_KEYS = [
  'command',
  'action',
  'code',
  'status',
  'skill_id',
  'item_id',
  'item_name',
  'quantity',
  'tick',
  'count',
  'channel',
  'sender',
  'username',
  'from_name',
  'faction_name',
  'trade_id',
  'version',
  'destination',
  'arrival_tick',
  'system',
  'system_id',
] as const;

/**
 * Keys that are *usually* bulky nested structures (for omittedHint labeling).
 * Skip decision for the scalar bag is value-shape based (object/array), not key name alone.
 */
const BULKY_KEYS = new Set([
  'ship',
  'ships',
  'fleet',
  'location',
  'modules',
  'module_slots',
  'cargo',
  'cargo_hold',
  'inventory',
  'storage',
  'equipment',
  'nearby_players',
  'nearby_ships',
  'nearby_pois',
  'nearby',
  'players',
  'queue',
  'action_queue',
  'orders',
  'order_book',
  'jobs',
  'items',
  'combat_log',
  'log',
  'events',
  'history',
  'result',
  'structuredContent',
  'payload',
  'state',
  'snapshot',
  'revealed_info',
]);

type PreviewHandler = (
  data: Record<string, unknown>,
  notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
) => NotificationPreview | null;

// ── Table Message baseline formatters (PR2; sole Message source after PR4) ───
// Ported from the former table-only helpers in display/notifications.ts.
// Table Message is now always tableMessageFromPreview(formatNotificationPreview(...)).

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function formatDepth(label: string, value: unknown): string | undefined {
  const levels = records(value);
  if (!levels.length) return undefined;
  const preview = levels
    .slice(0, 2)
    .map((level) => `${level.quantity ?? '?'} @ ${level.price_each ?? '?'}`)
    .join(', ');
  const suffix = levels.length > 2 ? `, +${levels.length - 2} more` : '';
  return `${label} ${preview}${suffix}`;
}

function formatMarketUpdateMessage(data: Record<string, unknown>): string {
  const station = data.base_name ?? data.base_id ?? 'current station';
  const items = records(data.items);
  const plural = items.length === 1 ? '' : 's';
  const tick = data.tick === undefined || data.tick === null ? '' : ` tick ${data.tick}`;
  const firstItem = items[0];
  if (!firstItem) return `${station}${tick}: 0 item updates`;

  const itemName = firstItem.item_name ?? firstItem.item_id ?? 'unknown item';
  const sell = formatDepth('sell', firstItem.sell_orders);
  const buy = formatDepth('buy', firstItem.buy_orders);
  const depth = [sell, buy].filter(Boolean).join(', ') || 'book emptied';
  const remaining = items.length > 1 ? `; +${items.length - 1} more` : '';
  return `${station}${tick}: ${items.length} item update${plural}; ${itemName} ${depth}${remaining}`;
}

function formatCreditsAmount(value: unknown): string | undefined {
  const number = finiteNumber(value);
  if (number === undefined) return undefined;
  return `${number.toLocaleString()}cr`;
}

function formatOutputPackagePreview(job: Record<string, unknown>): string | undefined {
  const outLabel = safeScalar(job.output_package_label);
  const outId = safeScalar(job.output_package_id);
  if (outLabel !== undefined && outId !== undefined) return `out ${outLabel} (${outId})`;
  if (outLabel !== undefined || outId !== undefined) return `out ${outLabel ?? outId}`;
  return undefined;
}

function formatCraftingJobPreview(job: Record<string, unknown>): string {
  const recipe = safeScalar(job.recipe) ?? safeScalar(job.job_id) ?? safeScalar(job.id) ?? 'job';
  const parts = [String(recipe)];
  if (job.external === true) parts.push('rental');
  const escrow = formatCreditsAmount(job.escrowed_credits);
  if (escrow !== undefined) parts.push(`${escrow} escrowed`);
  const remaining = finiteNumber(job.runs_remaining);
  if (remaining !== undefined) parts.push(`${remaining.toLocaleString()} run${remaining === 1 ? '' : 's'} left`);
  if (job.completed === true) parts.push('completed');
  const outPackage = formatOutputPackagePreview(job);
  if (outPackage !== undefined) parts.push(outPackage);
  return parts.join(', ');
}

function formatCraftingUpdateMessage(data: Record<string, unknown>): string {
  const jobs = records(data.jobs);
  if (jobs.length) {
    const previews = jobs.slice(0, 3).map(formatCraftingJobPreview);
    const more = jobs.length > 3 ? `; +${jobs.length - 3} more` : '';
    const tick = data.tick === undefined || data.tick === null ? '' : ` tick ${data.tick}`;
    return `${jobs.length} job${jobs.length === 1 ? '' : 's'}${tick}: ${previews.join('; ')}${more}`;
  }

  const parts: string[] = [];
  const message = safeScalar(data.message);
  if (message !== undefined) parts.push(String(message));
  if (data.external === true) parts.push('rental facility');
  const escrow = formatCreditsAmount(data.escrowed_credits);
  if (escrow !== undefined) parts.push(`${escrow} still escrowed`);
  const outPackage = formatOutputPackagePreview(data);
  if (outPackage !== undefined) parts.push(outPackage);
  if (data.tick !== undefined && data.tick !== null) parts.push(`tick ${data.tick}`);
  return parts.join('; ') || 'Crafting update';
}

function formatCraftingSummaryMessage(data: Record<string, unknown>): string {
  const count = finiteNumber(data.count) ?? 0;
  const updateWord = count === 1 ? 'update' : 'updates';
  const parts = [`${count} crafting progress ${updateWord} summarized`];
  const latestTick = safeScalar(data.latest_tick);
  const jobs = finiteNumber(data.jobs);
  const rentalJobs = finiteNumber(data.rental_jobs);
  const escrow = formatCreditsAmount(data.escrowed_credits);
  const latestMessage = safeScalar(data.latest_message);
  if (latestTick !== undefined) parts.push(`latest tick ${latestTick}`);
  if (jobs !== undefined) parts.push(`${jobs} active ${jobs === 1 ? 'job' : 'jobs'}`);
  if (rentalJobs !== undefined) {
    parts.push(`${rentalJobs} on rented ${rentalJobs === 1 ? 'facility' : 'facilities'}`);
  }
  if (escrow !== undefined) parts.push(`${escrow} still escrowed`);
  if (latestMessage !== undefined) parts.push(`latest: ${latestMessage}`);
  return parts.join('; ');
}

function formatActionResultSummaryMessage(data: Record<string, unknown>): string {
  const count = finiteNumber(data.count) ?? 0;
  const parts = [`${count} action result${count === 1 ? '' : 's'} summarized`];
  const commands = formatCountMap(data.commands);
  if (commands) parts.push(commands);
  const latestTick = safeScalar(data.latest_tick);
  if (latestTick !== undefined) parts.push(`latest tick ${latestTick}`);
  const latestCommand = safeScalar(data.latest_command);
  if (latestCommand !== undefined) parts.push(`latest ${latestCommand}`);
  const latestMessage = safeScalar(data.latest_message);
  if (latestMessage !== undefined) parts.push(`latest: ${latestMessage}`);
  return parts.join('; ');
}

function formatSystemProgressSummaryMessage(data: Record<string, unknown>): string {
  const count = finiteNumber(data.count) ?? 0;
  const parts = [`${count} travel progress update${count === 1 ? '' : 's'} summarized`];
  const actions = formatCountMap(data.actions);
  if (actions) parts.push(actions);
  const latestAction = safeScalar(data.latest_action);
  const latestDestination = safeScalar(data.latest_destination);
  if (latestAction !== undefined && latestDestination !== undefined) {
    parts.push(`latest ${latestAction} → ${latestDestination}`);
  } else if (latestAction !== undefined) {
    parts.push(`latest ${latestAction}`);
  } else if (latestDestination !== undefined) {
    parts.push(`latest → ${latestDestination}`);
  }
  const latestArrival = safeScalar(data.latest_arrival_tick);
  if (latestArrival !== undefined) parts.push(`arrival tick ${latestArrival}`);
  return parts.join('; ');
}

function headlinePreview(tag: string, headline: string, options: ResolvedPreviewOptions): NotificationPreview {
  return {
    tag,
    headline: truncate(headline, options),
    details: [],
  };
}

/**
 * Compact action_result details (Policy 3 field priority for details tree).
 * Prefers details.message, then selected scalars — never nested ship/location dumps.
 */
export function formatActionResultDetails(details: Record<string, unknown>): string | undefined {
  const message = safeScalar(details.message);
  if (message !== undefined) return String(message);

  const bits: string[] = [];
  const action = safeScalar(details.action);
  if (action !== undefined) bits.push(String(action));
  const system = safeScalar(details.system) ?? safeScalar(details.system_id);
  if (system !== undefined) bits.push(`→ ${system}`);
  const poi = safeScalar(details.poi) ?? safeScalar(details.poi_name);
  if (poi !== undefined) bits.push(`@ ${poi}`);
  const item = safeScalar(details.item_name) ?? safeScalar(details.item_id);
  if (item !== undefined) {
    const quantity = finiteNumber(details.quantity);
    bits.push(quantity !== undefined ? `${quantity}× ${item}` : String(item));
  }
  for (const key of ['module_id', 'storage_total', 'cargo_remaining'] as const) {
    const value = safeScalar(details[key]);
    if (value !== undefined) bits.push(`${key}=${value}`);
  }
  return bits.length ? bits.join(' ') : undefined;
}

function previewActionResult(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const command = safeScalar(data.command);
  const tick = safeScalar(data.tick);
  const commandLabel = command !== undefined ? String(command) : 'action';
  const tickLabel = tick !== undefined ? String(tick) : '?';
  const headline = truncate(`${commandLabel} completed (tick ${tickLabel})`, options);

  const details: string[] = [];
  const result = isRecord(data.result) ? data.result : undefined;
  if (result) {
    const resultMessage = safeScalar(result.message);
    if (resultMessage !== undefined) {
      details.push(truncate(firstLine(String(resultMessage)), options));
    } else {
      const nested = isRecord(result.details) ? result.details : undefined;
      if (nested) {
        const summary = formatActionResultDetails(nested);
        if (summary) details.push(truncate(summary, options));
      }
    }
  }

  // Label bulky nested result fields for optional verbose (PR 8); never expand them.
  const bulkySource = result ?? data;
  const omittedHint = omittedBulkyHint(bulkySource);

  return {
    tag: 'ACTION RESULT',
    headline,
    details,
    ...(omittedHint ? { omittedHint } : {}),
  };
}

/**
 * Compact system / tip preview. Never stringifies nested data (clears residual safeJson paths).
 */
function previewSystem(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  // gameplay_tip → [TIP]
  if (data.type === 'gameplay_tip') {
    const message = safeScalar(data.message);
    return {
      tag: 'TIP',
      headline: truncate(message !== undefined ? firstLine(String(message)) : 'gameplay tip', options),
      details: [],
    };
  }

  // Travel progress: action → destination (arrival tick N) [wormhole]
  const action = safeScalar(data.action);
  if (action !== undefined) {
    const bits = [String(action)];
    const destination = safeScalar(data.destination);
    if (destination !== undefined) bits.push(`→ ${destination}`);
    const arrival = safeScalar(data.arrival_tick);
    if (arrival !== undefined) bits.push(`(arrival tick ${arrival})`);
    if (data.is_wormhole === true) bits.push('wormhole');
    return {
      tag: 'SYSTEM',
      headline: truncate(bits.join(' '), options),
      details: [],
    };
  }

  // Scalar message only
  const message = safeScalar(data.message);
  if (message !== undefined) {
    return {
      tag: 'SYSTEM',
      headline: truncate(firstLine(String(message)), options),
      details: [],
    };
  }

  // No message: compact scalar bag — never nested JSON dumps of the whole data object.
  const bits = collectScalarBits(data, {
    preferredKeys: GENERIC_SCALAR_KEYS,
    maxKeys: options.maxDetails,
  });
  if (bits.length) {
    const omittedHint = omittedBulkyHint(data);
    return {
      tag: 'SYSTEM',
      headline: truncate(bits.join(', '), options),
      details: [],
      ...(omittedHint ? { omittedHint } : {}),
    };
  }

  const omittedHint = omittedBulkyHint(data);
  return {
    tag: 'SYSTEM',
    headline: 'system notification',
    details: [],
    ...(omittedHint ? { omittedHint } : {}),
  };
}

// ── Combat domain pure previews (PR7a) ──────────────────────────────────────
// combat_update, player_died, player_kill, police_*, pirate_*, battle_*
// Table Type stays raw msg_type (K13).

function damageLabel(value: unknown, fallback: string | number = 0): string | number {
  const n = finiteNumber(value);
  if (n !== undefined) return n;
  if (typeof value === 'string' && value.trim()) return value;
  return fallback;
}

/** Compact wreck site for table Message. Undefined when the server sent no wreck. */
function wreckSiteLabel(data: Record<string, unknown>): string | undefined {
  if (data.wreck_suppressed === true) return 'wreck suppressed';
  const wreckId = safeScalar(data.wreck_id);
  if (wreckId === undefined) return undefined;
  const poi = safeScalar(data.wreck_poi_name) ?? safeScalar(data.wreck_poi_id);
  const system = safeScalar(data.wreck_system_name) ?? safeScalar(data.wreck_system_id);
  if (poi !== undefined && system !== undefined) return `wreck ${wreckId} at ${poi} (${system})`;
  if (poi !== undefined) return `wreck ${wreckId} at ${poi}`;
  if (system !== undefined) return `wreck ${wreckId} in ${system}`;
  return `wreck ${wreckId}`;
}

function wreckContentsLabel(data: Record<string, unknown>): string | undefined {
  const bits: string[] = [];
  if (data.wreck_has_cargo === true) bits.push('cargo');
  if (data.wreck_has_modules === true) bits.push('modules');
  return bits.length ? bits.join('+') : undefined;
}

/** Ellipsize from the end. Same glyph as truncate() (`…`), but with an explicit budget. */
function truncateToBudget(value: string, max: number): string {
  if (max <= 0) return '';
  if (value.length <= max) return value;
  if (max <= 1) return '…';
  return `${value.slice(0, max - 1)}…`;
}

/**
 * Always prepend site to details when present. Foldable path: table reconstitutes
 * `${headline}; ${site}`. Non-fold path: site is already in the headline so the
 * first-detail fold no-ops. Truncate the incoming headline so `${headline}; ${site}`
 * fits maxLineLength; never truncate the combined string after attaching.
 * If site.length >= budget, the headline becomes the truncated site (full site
 * stays first in details).
 */
function attachWreckSite(
  headline: string,
  details: string[],
  data: Record<string, unknown>,
  options: ResolvedPreviewOptions,
): { headline: string; details: string[] } {
  const site = wreckSiteLabel(data);
  if (!site) return { headline: truncate(headline, options), details };

  const budget = options.maxLineLength;
  const sep = '; ';
  const withSite = [site, ...details];
  const canFold = site.length <= TABLE_DETAIL_FOLD_LIMIT && !headline.includes(site);

  if (site.length >= budget) {
    return { headline: truncateToBudget(site, budget), details: withSite };
  }

  const maxKill = budget - sep.length - site.length;
  if (maxKill <= 0) {
    return { headline: truncateToBudget(site, budget), details: withSite };
  }
  const kill = headline.length > maxKill ? truncateToBudget(headline, maxKill) : headline;

  if (canFold) return { headline: kill, details: withSite };
  return { headline: `${kill}${sep}${site}`, details: withSite };
}

function combatLogLocationDuplicatesWreck(log: Record<string, unknown>, data: Record<string, unknown>): boolean {
  // Keep Location: unless a non-suppressed wreck site actually names that POI.
  if (data.wreck_suppressed === true) return false;
  if (safeScalar(data.wreck_id) === undefined) return false;

  const wreckPoi = safeScalar(data.wreck_poi_name) ?? safeScalar(data.wreck_poi_id);
  if (wreckPoi === undefined) return false;

  const deathPoi = safeScalar(log.death_location);
  if (deathPoi === undefined) return false;
  if (String(deathPoi) !== String(wreckPoi)) return false;

  const deathSys = safeScalar(log.death_system);
  if (deathSys === undefined) return true; // POI matches; log has no system to disagree

  const wreckSys = safeScalar(data.wreck_system_name) ?? safeScalar(data.wreck_system_id);
  return wreckSys !== undefined && String(deathSys) === String(wreckSys);
}

function previewCombatUpdate(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const attacker = safeScalar(data.attacker) ?? 'unknown';
  const target = safeScalar(data.target) ?? 'unknown';
  const damage = damageLabel(data.damage);
  const damageType = safeScalar(data.damage_type) ?? 'unknown';
  const shield = damageLabel(data.shield_hit);
  const hull = damageLabel(data.hull_hit);
  const destroyed = data.destroyed ? ' - DESTROYED!' : '';
  return headlinePreview(
    'COMBAT',
    `${attacker} hit ${target} for ${damage} ${damageType} damage (shield: ${shield}, hull: ${hull})${destroyed}`,
    options,
  );
}

/**
 * player_died: headline = one-line death summary; combat_log / costs / respawn are details
 * for inline multi-line only (table Message prefers headline via tableMessageFromPreview).
 * Malformed combat_log is skipped — never dumps nested objects as JSON.
 */
function previewPlayerDied(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const cause = safeScalar(data.cause);
  let headline: string;
  if (cause === 'self_destruct') {
    headline = 'Self-destructed!';
  } else if (cause === 'police') {
    headline = 'Destroyed by system police!';
  } else {
    headline = `Destroyed by ${safeScalar(data.killer_name) ?? 'unknown'}!`;
  }

  const details: string[] = [];
  if (isRecord(data.combat_log)) {
    const log = data.combat_log;
    const logMessage = safeScalar(log.message);
    if (logMessage !== undefined) details.push(truncate(firstLine(String(logMessage)), options));

    const attackerShip = safeScalar(log.attacker_ship);
    if (attackerShip !== undefined) details.push(truncate(`Attacker ship: ${attackerShip}`, options));

    if (isRecord(log.weapons_used)) {
      const weapons = Object.entries(log.weapons_used)
        .map(([weapon, count]) => {
          const n = finiteNumber(count);
          if (n === undefined) return undefined;
          return `${weapon} (x${n})`;
        })
        .filter((entry): entry is string => Boolean(entry));
      if (weapons.length) details.push(truncate(`Weapons: ${weapons.join(', ')}`, options));
    }

    const totalDamage = finiteNumber(log.total_damage);
    if (totalDamage !== undefined && totalDamage > 0) {
      const shield = finiteNumber(log.shield_damage) ?? 0;
      const hull = finiteNumber(log.hull_damage) ?? 0;
      const rounds = finiteNumber(log.combat_rounds) ?? 0;
      details.push(
        truncate(
          `Damage taken: ${totalDamage} total (${shield} shield, ${hull} hull) over ${rounds} round${rounds !== 1 ? 's' : ''}`,
          options,
        ),
      );
    }

    const deathLocation = safeScalar(log.death_location);
    if (deathLocation !== undefined && !combatLogLocationDuplicatesWreck(log, data)) {
      details.push(truncate(`Location: ${deathLocation} in ${safeScalar(log.death_system) ?? 'unknown'}`, options));
    }
  }

  const shipLost = safeScalar(data.ship_lost);
  if (shipLost !== undefined) details.push(truncate(`Ship lost: ${shipLost}`, options));

  const cloneCost = finiteNumber(data.clone_cost);
  if (cloneCost !== undefined && cloneCost > 0) {
    details.push(truncate(`Clone cost: ${cloneCost} credits`, options));
  }

  const selfDestructFee = finiteNumber(data.self_destruct_fee);
  if (selfDestructFee !== undefined && selfDestructFee > 0) {
    details.push(truncate(`Self-destruct fee: ${selfDestructFee} credits`, options));
  }

  const insurance = finiteNumber(data.insurance_payout);
  if (insurance !== undefined && insurance > 0) {
    details.push(truncate(`Insurance payout: ${insurance} credits`, options));
  }

  details.push(truncate(`Respawned at: ${safeScalar(data.respawn_base) ?? 'home'} with ship fully repaired`, options));

  const attached = attachWreckSite(headline, details, data, options);
  return {
    tag: 'DEATH',
    headline: attached.headline,
    details: attached.details,
  };
}

function previewPlayerKill(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const rawVictim = firstSafeScalar(data, ['victim', 'victim_name', 'target_name']);
  const victim = rawVictim !== undefined ? String(rawVictim) : 'unknown';
  const details: string[] = [];
  // Match legacy writeLine: truthy bounty only (0 / empty omitted).
  const bountyN = finiteNumber(data.bounty);
  if (bountyN !== undefined && bountyN > 0) {
    details.push(truncate(`Bounty: ${bountyN} credits`, options));
  } else {
    const bountyScalar = safeScalar(data.bounty);
    if (bountyScalar !== undefined && bountyScalar !== 0 && bountyScalar !== false) {
      details.push(truncate(`Bounty: ${bountyScalar} credits`, options));
    }
  }
  const attached = attachWreckSite(`You destroyed ${victim}!`, details, data, options);
  const contents = wreckContentsLabel(data);
  if (contents !== undefined) attached.details.push(truncate(contents, options));
  return {
    tag: 'KILL',
    headline: attached.headline,
    details: attached.details,
  };
}

function previewPoliceWarning(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const message = safeScalar(data.message);
  const details = [
    truncate(
      `Security level: ${damageLabel(data.police_level, 0)}, Response in: ${damageLabel(data.response_ticks, 0)} tick(s)`,
      options,
    ),
  ];
  return {
    tag: 'POLICE',
    headline: truncate(message !== undefined ? firstLine(String(message)) : 'Police warning', options),
    details,
  };
}

function previewPoliceSpawn(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  return headlinePreview('POLICE', `${damageLabel(data.num_drones, 0)} police drone(s) arrived!`, options);
}

function previewPoliceCombat(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const destroyed = data.destroyed ? ' - YOU WERE DESTROYED!' : '';
  return headlinePreview('POLICE', `Police drone dealt ${damageLabel(data.damage, 0)} damage${destroyed}`, options);
}

function previewPirateWarning(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const message = safeScalar(data.message);
  return headlinePreview(
    'PIRATES',
    message !== undefined ? firstLine(String(message)) : 'Pirates detected nearby!',
    options,
  );
}

function previewPirateSpawn(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  return headlinePreview('PIRATES', `${damageLabel(data.num_pirates, 1)} pirate(s) appeared!`, options);
}

function previewPirateCombat(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const destroyed = data.destroyed ? ' - YOU WERE DESTROYED!' : '';
  return headlinePreview('PIRATES', `Pirate dealt ${damageLabel(data.damage, 0)} damage${destroyed}`, options);
}

const PRIVATE_PIRATE_KEYS = [
  'wreck_id',
  'credits_earned',
  'combat_xp',
  'operator_id',
  'wreck_has_cargo',
  'wreck_has_modules',
] as const;

function isPirateDestroyedBroadcast(data: Record<string, unknown>): boolean {
  const hasPrivate = PRIVATE_PIRATE_KEYS.some((key) => data[key] !== undefined && data[key] !== null);
  if (hasPrivate) return false;
  return safeScalar(data.killer) !== undefined || safeScalar(data.message) !== undefined;
}

/** pirate_destroyed uses formatInventoryPreview for loot (PR6 / K15) — never JSON.stringify. */
function previewPirateDestroyed(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  if (isPirateDestroyedBroadcast(data)) {
    const name = scalarOr(data.pirate_name, 'Pirate');
    const boss = data.is_boss === true ? 'Boss ' : '';
    const killer = safeScalar(data.killer);
    const system = safeScalar(data.system_name) ?? safeScalar(data.system_id);
    let synthesized: string;
    if (killer !== undefined && system !== undefined) {
      synthesized = `${boss}${name} destroyed by ${killer} in ${system}!`;
    } else if (killer !== undefined) {
      synthesized = `${boss}${name} destroyed by ${killer}!`;
    } else {
      synthesized = `${boss}${name} destroyed!`;
    }
    const headline = preferDiplomacyMessage(data, synthesized);
    const attached = attachWreckSite(headline, [], data, options);
    return { tag: 'PIRATES', headline: attached.headline, details: attached.details };
  }

  const boss = data.is_boss === true ? 'Boss ' : '';
  const name = scalarOr(data.pirate_name, 'Pirate');
  const details: string[] = [];

  const credits = positiveNumber(data.credits_earned);
  if (credits !== undefined) details.push(truncate(`Credits: ${credits} credits`, options));

  const xp = positiveNumber(data.combat_xp);
  if (xp !== undefined) details.push(truncate(`Weapons XP: ${xp}`, options));

  const contents = wreckContentsLabel(data);
  if (contents !== undefined) details.push(truncate(contents, options));

  const operator = safeScalar(data.operator_id);
  if (operator !== undefined) details.push(truncate(`Drone operator: ${operator}`, options));

  if (data.loot !== undefined && data.loot !== null) {
    const lootPreview = formatInventoryPreview(data.loot);
    if (lootPreview) details.push(truncate(`Loot: ${lootPreview}`, options));
  }

  const attached = attachWreckSite(`${boss}${name} destroyed!`, details, data, options);
  const role = safeScalar(data.pirate_role);
  // Role is inline-only; append after wreck/credits/XP/loot so it never occupies the fold slot.
  if (role !== undefined) attached.details.push(truncate(`Role: ${role}`, options));
  return {
    tag: 'PIRATES',
    headline: attached.headline,
    details: attached.details,
  };
}

function previewBattleStarted(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  return headlinePreview('BATTLE', `Battle started! ID: ${safeScalar(data.battle_id) ?? 'unknown'}`, options);
}

function previewBattleUpdate(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const tickScalar = safeScalar(data.tick);
  const tick = tickScalar !== undefined ? String(tickScalar) : '?';
  const message = safeScalar(data.message);
  return headlinePreview(
    'BATTLE',
    `Battle tick ${tick} - ${message !== undefined ? firstLine(String(message)) : 'combat continues'}`,
    options,
  );
}

function previewBattleDamage(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  return headlinePreview(
    'BATTLE',
    `${safeScalar(data.attacker) ?? 'unknown'} hit ${safeScalar(data.target) ?? 'unknown'} for ${damageLabel(data.damage, 0)} damage`,
    options,
  );
}

function previewBattleJoined(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  return headlinePreview('BATTLE', `${safeScalar(data.username) ?? 'Someone'} joined the battle`, options);
}

function previewBattleLeft(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const name = safeScalar(data.username) ?? 'Someone';
  const raw = safeScalar(data.reason);
  const reason = typeof raw === 'string' ? raw.trim().toLowerCase() : undefined;
  let headline = `${name} left the battle`;
  if (reason === 'fled') {
    headline = `${name} fled the battle`;
  } else if (reason === 'destroyed') {
    headline = `${name} was destroyed — combat over`;
  } else if (reason === 'emergency_warp') {
    headline = `${name} emergency-warped out of the battle`;
  }
  return headlinePreview('BATTLE', headline, options);
}

function previewBattleEnded(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const reason = safeScalar(data.reason);
  const message = safeScalar(data.message);
  const reasonToken = typeof reason === 'string' ? reason.trim() : '';
  const messageLine = message !== undefined ? firstLine(String(message)) : '';

  let headline: string;
  if (reasonToken) {
    headline = `Battle ended (${reasonToken})`;
  } else if (messageLine) {
    headline = `Battle ended! ${messageLine}`;
  } else {
    headline = 'Battle ended!';
  }

  const details: string[] = [];
  const winningSide = Number(data.winning_side);
  if (Number.isFinite(winningSide) && winningSide === -1) {
    details.push('no winning side');
  }
  if (reasonToken && messageLine && messageLine !== reasonToken && !headline.includes(messageLine)) {
    details.push(messageLine);
  }

  return details.length > 0
    ? detailPreview('BATTLE', headline, details, options)
    : headlinePreview('BATTLE', headline, options);
}

function prizeShipLabel(data: Record<string, unknown>): string | undefined {
  const name = safeScalar(data.ship_name);
  const shipClass = safeScalar(data.ship_class);
  const nameText = name !== undefined ? String(name) : undefined;
  const classText = shipClass !== undefined ? String(shipClass) : undefined;
  return nameText ?? classText;
}

function prizeLocationLabel(data: Record<string, unknown>): string | undefined {
  const poi = safeScalar(data.poi_id);
  const system = safeScalar(data.system_id);
  if (poi !== undefined && system !== undefined) return `${poi} (${system})`;
  return poi !== undefined ? String(poi) : system !== undefined ? String(system) : undefined;
}

function prizeWreckLine(data: Record<string, unknown>): string | undefined {
  const wreckId = safeScalar(data.wreck_id);
  if (wreckId === undefined) return undefined;
  const poi = safeScalar(data.poi_id);
  const system = safeScalar(data.system_id);
  if (poi !== undefined && system !== undefined) return `wreck ${wreckId} at ${poi} (${system})`;
  if (poi !== undefined) return `wreck ${wreckId} at ${poi}`;
  if (system !== undefined) return `wreck ${wreckId} in ${system}`;
  return `wreck ${wreckId}`;
}

function previewShipCaptured(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const captor = safeScalar(data.captor_username);
  const formerOwner = safeScalar(data.former_owner_username);
  const shipClass = safeScalar(data.ship_class);
  if (captor === undefined && formerOwner === undefined && shipClass === undefined) {
    return { ...headlinePreview('CAPTURE', 'Ship captured', options), severity: 'success' };
  }

  const captorText = captor !== undefined ? String(captor) : 'Someone';
  const classText = shipClass !== undefined ? String(shipClass) : 'ship';
  const formerText = formerOwner !== undefined ? String(formerOwner) : 'Someone';
  return {
    ...detailPreview(
      'CAPTURE',
      `${captorText} captured ${classText} from ${formerText}`,
      ['Use: get_nearby then claim_prize'],
      options,
    ),
    severity: 'success',
  };
}

function previewPrizeUpdate(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const prizeId = safeScalar(data.prize_id);
  const statusScalar = safeScalar(data.status);
  const status = typeof statusScalar === 'string' ? statusScalar.trim() : undefined;
  const nameText = safeScalar(data.ship_name);
  const classText = safeScalar(data.ship_class);
  const hasIdentity =
    prizeId !== undefined || nameText !== undefined || classText !== undefined || statusScalar !== undefined;

  if (!hasIdentity) {
    return { ...headlinePreview('PRIZE', 'Prize update', options), severity: 'neutral' };
  }

  const waitReason = safeScalar(data.wait_reason);
  const isTerminal = status === 'delivered' || status === 'destroyed';
  const isInTransit = status === 'in_transit';
  const isStallLike = status !== undefined && !isTerminal && waitReason !== undefined;

  let clause: string;
  let severity: NotificationSeverity;
  const details: string[] = [];

  if (status === 'delivered') {
    clause = 'delivered';
    severity = 'success';
  } else if (status === 'destroyed') {
    clause = 'destroyed';
    severity = 'danger';
    const wreckLine = prizeWreckLine(data);
    if (wreckLine !== undefined) details.push(wreckLine);
  } else if (isStallLike) {
    clause = isInTransit ? 'in transit' : `(${status})`;
    severity = 'warning';
    if (prizeId !== undefined) details.push(`Use: service_prize prize_id=${prizeId}`);
  } else if (isInTransit) {
    clause = 'in transit';
    severity = 'info';
  } else if (status) {
    clause = `(${status})`;
    severity = 'warning';
    if (prizeId !== undefined) details.push(`Use: service_prize prize_id=${prizeId}`);
  } else {
    clause = 'updated';
    severity = 'neutral';
    if (prizeId !== undefined) details.push(`Use: service_prize prize_id=${prizeId}`);
  }

  const shipLabel = prizeShipLabel(data);
  let headline = 'Prize';
  if (prizeId !== undefined) headline += ` ${prizeId}`;
  if (shipLabel !== undefined) headline += ` (${shipLabel})`;
  headline += ` ${clause}`;
  if (isStallLike && waitReason !== undefined) headline += ` (${waitReason})`;
  if (isStallLike || isInTransit) {
    const location = prizeLocationLabel(data);
    if (location !== undefined) headline += ` at ${location}`;
  }
  if (status === 'delivered') {
    const destination = safeScalar(data.destination_base_id);
    if (destination !== undefined) headline += ` to ${destination}`;
  }

  const message = safeScalar(data.message);
  const messageLine = message !== undefined ? firstLine(String(message)) : '';
  if (details.length > 0 && messageLine && messageLine !== headline && !headline.includes(messageLine)) {
    details.push(messageLine);
  }

  return {
    ...(details.length > 0
      ? detailPreview('PRIZE', headline, details, options)
      : headlinePreview('PRIZE', headline, options)),
    severity,
  };
}

/**
 * Typed pure preview handlers. Grown over later PRs.
 * null → fall through to Policy 5 generic path.
 *
 * PR2: table Message special-case types (market, crafting, summaries, commission).
 * PR3: action_result + system (residual dump fixes).
 * PR7a: combat / police / pirate / battle domain.
 * Inline dual-use prefers this registry before writeLine (see formatNotification).
 */
function scalarOr(value: unknown, fallback: string): string {
  const scalar = safeScalar(value);
  return scalar !== undefined ? String(scalar) : fallback;
}

function positiveNumber(value: unknown): number | undefined {
  const n = finiteNumber(value);
  return n !== undefined && n > 0 ? n : undefined;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function detailPreview(
  tag: string,
  headline: string,
  details: string[],
  options: ResolvedPreviewOptions,
): NotificationPreview {
  return {
    tag,
    headline: truncate(headline, options),
    details: details
      .map((line) => truncate(line, options))
      .filter((line) => line.length > 0)
      .slice(0, options.maxDetails),
  };
}

// ── Social / trade / friends / faction / base / scan (PR7b) ──────────────────

function previewChatMessage(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const channel = scalarOr(data.channel, 'local');
  const sender = scalarOr(data.sender, 'Unknown');
  const content = data.content === undefined || data.content === null ? '' : String(data.content);
  return headlinePreview(`CHAT:${channel}`, `${sender}: ${content}`, options);
}

function previewTradeOfferReceived(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const from = scalarOr(data.from_name, 'Someone');
  const tradeId = scalarOr(data.trade_id, '');
  const details: string[] = [];
  const offer = positiveNumber(data.offer_credits);
  if (offer !== undefined) details.push(`Offering: ${offer} credits`);
  const request = positiveNumber(data.request_credits);
  if (request !== undefined) details.push(`Requesting: ${request} credits`);
  details.push(`Use: trade accept trade_id=${tradeId} or trade decline trade_id=${tradeId}`);
  return detailPreview('TRADE', `Offer from ${from} (ID: ${tradeId})`, details, options);
}

function previewTradeComplete(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const partner = scalarOr(data.partner_name, scalarOr(data.with, 'someone'));
  return headlinePreview('TRADE', `Trade completed with ${partner}!`, options);
}

function previewTradeDeclined(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  return headlinePreview('TRADE', `Trade declined by ${scalarOr(data.from_name, 'someone')}`, options);
}

function previewTradeCancelled(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  return headlinePreview('TRADE', `Trade cancelled (ID: ${scalarOr(data.trade_id, 'unknown')})`, options);
}

function previewFriendRequest(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  return headlinePreview('FRIEND', `${scalarOr(data.from_name, 'Someone')} sent you a friend request`, options);
}

function previewFriendRequestAccepted(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const who = scalarOr(data.from_name, scalarOr(data.username, 'Someone'));
  return headlinePreview('FRIEND', `${who} accepted your friend request!`, options);
}

function previewFriendRemoved(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const who = scalarOr(data.from_name, scalarOr(data.username, 'Someone'));
  return headlinePreview('FRIEND', `${who} removed you as a friend`, options);
}

function previewFriendOnline(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  return headlinePreview('FRIEND', `${scalarOr(data.username, 'A friend')} is now online`, options);
}

function previewFriendOffline(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  return headlinePreview('FRIEND', `${scalarOr(data.username, 'A friend')} went offline`, options);
}

function previewFactionInvite(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const factionId = scalarOr(data.faction_id, '');
  return detailPreview(
    'FACTION',
    `You've been invited to join ${scalarOr(data.faction_name, 'a faction')}`,
    [`Use: join_faction faction_id=${factionId} or faction decline_invite faction_id=${factionId}`],
    options,
  );
}

function preferDiplomacyMessage(data: Record<string, unknown>, synthesized: string): string {
  const message = safeScalar(data.message);
  return message !== undefined ? firstLine(String(message)) : synthesized;
}

function factionName(data: Record<string, unknown>, nameKey: string, tagKey?: string, fallback = 'a faction'): string {
  const name = scalarOr(data[nameKey], fallback);
  const tag = tagKey !== undefined ? safeScalar(data[tagKey]) : undefined;
  return tag !== undefined ? `${name} [${tag}]` : name;
}

function previewFactionWarDeclared(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const aggressor = safeScalar(data.aggressor_faction_name);
  const defender = safeScalar(data.defender_faction_name);
  const synthesized =
    aggressor !== undefined || defender !== undefined
      ? `${factionName(data, 'aggressor_faction_name')} declared war on ${factionName(data, 'defender_faction_name', undefined, 'your faction')}!`
      : 'A faction declared war';
  const details: string[] = [];
  const reason = safeScalar(data.reason);
  if (reason !== undefined) details.push(`Reason: ${reason}`);
  return detailPreview('WAR', preferDiplomacyMessage(data, synthesized), details, options);
}

function previewFactionPeaceProposal(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const from = safeScalar(data.from_faction_name);
  const synthesized = from !== undefined ? `${from} proposed peace!` : 'Peace proposed';
  const details: string[] = [];
  const terms = safeScalar(data.terms);
  if (terms !== undefined) details.push(`Terms: ${terms}`);
  details.push(`Use: faction accept_peace target_faction_id=${scalarOr(data.from_faction_id, '')}`);
  return detailPreview('PEACE', preferDiplomacyMessage(data, synthesized), details, options);
}

function previewFactionPeaceAccepted(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const name = safeScalar(data.faction_name);
  const synthesized = name !== undefined ? `${name} accepted peace` : 'Peace accepted';
  return headlinePreview('PEACE', preferDiplomacyMessage(data, synthesized), options);
}

function previewFactionAllianceProposal(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const from = factionName(data, 'from_faction_name', 'from_faction_tag');
  return detailPreview(
    'FACTION',
    preferDiplomacyMessage(data, `${from} proposed an alliance`),
    [`Use: faction accept_ally target_faction_id=${scalarOr(data.from_faction_id, '')}`],
    options,
  );
}

function previewFactionAllianceFormed(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const withFaction = factionName(data, 'with_faction_name', 'with_faction_tag');
  return headlinePreview('FACTION', preferDiplomacyMessage(data, `Alliance formed with ${withFaction}`), options);
}

function previewFactionAllianceBroken(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const by = factionName(data, 'by_faction_name', 'by_faction_tag');
  return headlinePreview('FACTION', preferDiplomacyMessage(data, `${by} broke the alliance`), options);
}

// Countdown owns the headline so table Message still shows Ns when message is long.
function previewServerRestartWarning(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const seconds = finiteNumber(data.seconds_until_restart);
  const targetVersion = safeScalar(data.target_version);
  const message = safeScalar(data.message);
  const messageLine = message !== undefined ? firstLine(String(message)) : undefined;

  let headline: string;
  if (seconds !== undefined) {
    headline = `Server restart in ${seconds}s`;
    if (targetVersion !== undefined) headline += ` (${targetVersion})`;
  } else if (messageLine) {
    headline = messageLine;
  } else {
    headline = 'Server restart warning';
  }

  const details: string[] = [];
  if (messageLine && messageLine !== headline && !headline.includes(messageLine)) {
    details.push(messageLine);
  }

  return {
    ...detailPreview('SYSTEM', headline, details, options),
    severity: 'warning',
  };
}

function previewDroneAdrift(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const droneType = safeScalar(data.drone_type);
  const poiId = safeScalar(data.poi_id);
  const systemId = safeScalar(data.system_id);
  const droneId = safeScalar(data.drone_id);
  const hasLocation = droneType !== undefined || poiId !== undefined || systemId !== undefined || droneId !== undefined;

  let headline: string;
  if (!hasLocation) {
    headline = 'A drone is adrift';
  } else {
    headline = `Your ${droneType !== undefined ? droneType : 'drone'} drone is adrift at ${poiId !== undefined ? poiId : 'unknown POI'} in ${systemId !== undefined ? systemId : 'unknown system'}`;
    // Skip (ID: ) when drone_id is missing.
    if (droneId !== undefined) headline += ` (ID: ${droneId})`;
  }

  const details: string[] = [];
  if (droneId !== undefined) {
    details.push(`Use: get_drone drone_id=${droneId}`);
    details.push(`Use: recall_drone drone_id=${droneId}`);
  }

  return {
    ...detailPreview('DRONE', headline, details, options),
    severity: 'warning',
  };
}

function previewBaseRaidUpdate(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const current = finiteNumber(data.current_health) ?? 0;
  const max = finiteNumber(data.max_health) ?? 0;
  const dpt = finiteNumber(data.damage_per_tick) ?? 0;
  return headlinePreview('RAID', `${scalarOr(data.base_name, 'base')}: ${current}/${max} HP (-${dpt}/tick)`, options);
}

function previewBaseDestroyed(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const details: string[] = [];
  const wreckId = safeScalar(data.wreck_id);
  if (wreckId !== undefined) details.push(`Wreck ID for looting: ${wreckId}`);
  return detailPreview('BASE DESTROYED', `${scalarOr(data.base_name, 'base')} has been destroyed!`, details, options);
}

function previewScanResult(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const target = scalarOr(data.username, scalarOr(data.target_id, 'unknown'));
  if (data.success) {
    const revealed = stringList(data.revealed_info);
    const details: string[] = [];
    const shipClass = safeScalar(data.ship_class);
    if (shipClass !== undefined) details.push(`Ship: ${shipClass}`);
    const hull = safeScalar(data.hull);
    if (hull !== undefined) details.push(`Hull: ${hull}`);
    const shield = safeScalar(data.shield);
    if (shield !== undefined) details.push(`Shield: ${shield}`);
    const cloaked = safeScalar(data.cloaked);
    if (cloaked !== undefined) details.push(`Cloaked: ${cloaked}`);
    return detailPreview('SCAN', `Scan of ${target} revealed: ${revealed.join(', ')}`, details, options);
  }
  return headlinePreview('SCAN', `Scan of ${target} failed - insufficient scan power`, options);
}

function previewScanDetected(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const revealed = stringList(data.revealed_info);
  return detailPreview(
    'SCANNED',
    `You were scanned by ${scalarOr(data.scanner_username, 'Unknown')} (${scalarOr(data.scanner_ship_class, 'unknown')})`,
    [`They learned: ${revealed.join(', ')}`],
    options,
  );
}

// ── Remainder domain pure previews (PR7c) ───────────────────────────────────
// mining, drones, skills, queue, version, poi_*, reconnected, pilotless, action_error
// Completes pure registry; writeLine handlers deleted in notifications.ts.

function previewMiningYield(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const quantity = damageLabel(data.quantity, 0);
  const resource = scalarOr(data.resource_id, 'ore');
  const remaining = data.remaining !== undefined && data.remaining !== null ? safeScalar(data.remaining) : undefined;
  const remainingMsg = remaining !== undefined ? ` (${remaining} remaining at POI)` : '';
  return headlinePreview('MINED', `+${quantity}x ${resource}${remainingMsg}`, options);
}

function previewDroneUpdate(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  return headlinePreview(
    'DRONE',
    `Your ${scalarOr(data.drone_type, 'drone')} drone dealt ${damageLabel(data.damage, 0)} damage to ${scalarOr(data.target_id, 'target')}`,
    options,
  );
}

function previewDroneDestroyed(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  return headlinePreview(
    'DRONE',
    `Your ${scalarOr(data.drone_type, 'drone')} drone was destroyed! (ID: ${scalarOr(data.drone_id, '')})`,
    options,
  );
}

function previewSkillLevelUp(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  return headlinePreview(
    'LEVEL UP',
    `${scalarOr(data.skill_id, 'unknown')} is now level ${damageLabel(data.new_level, 0)}! (+${damageLabel(data.xp_gained, 0)} XP)`,
    options,
  );
}

function previewSkillXpGain(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const xp = data.xp_gained !== undefined && data.xp_gained !== null ? data.xp_gained : data.xp;
  const current = safeScalar(data.current_xp);
  const next = safeScalar(data.next_level_xp);
  const currentLabel = current !== undefined ? String(current) : '?';
  const nextLabel = next !== undefined ? String(next) : '?';
  return headlinePreview(
    'XP',
    `+${damageLabel(xp, 0)} XP in ${scalarOr(data.skill_id, 'unknown')} (${currentLabel}/${nextLabel})`,
    options,
  );
}

function previewPilotlessShip(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  return detailPreview(
    'PILOTLESS',
    `${scalarOr(data.player_username, 'unknown')}'s ${scalarOr(data.ship_class, 'ship')} is now pilotless!`,
    [`Vulnerable for ${damageLabel(data.ticks_remaining, 0)} ticks - can be attacked without resistance`],
    options,
  );
}

function previewReconnected(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const message = safeScalar(data.message);
  const details: string[] = [];
  if (data.was_pilotless) {
    details.push(`Ship was pilotless - recovered with ${damageLabel(data.ticks_remaining, 0)} ticks to spare`);
  }
  return detailPreview(
    'RECONNECTED',
    message !== undefined ? firstLine(String(message)) : 'Reconnected',
    details,
    options,
  );
}

function previewVersionInfo(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  return headlinePreview('VERSION', `Server version: ${scalarOr(data.version, 'unknown')}`, options);
}

function previewQueueCleared(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const reason = safeScalar(data.reason);
  const suffix = reason !== undefined ? `: ${firstLine(String(reason))}` : '';
  return headlinePreview('QUEUE', `Action queue cleared${suffix}`, options);
}

function previewActionError(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const command = scalarOr(data.command, 'action');
  const tick = safeScalar(data.tick);
  const tickLabel = tick !== undefined ? String(tick) : '?';
  const error = safeScalar(data.message) ?? safeScalar(data.code) ?? 'unknown error';
  return headlinePreview(
    'ACTION FAILED',
    `${command} failed (tick ${tickLabel}): ${firstLine(String(error))}`,
    options,
  );
}

function previewPoiArrival(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const clan = safeScalar(data.clan_tag);
  const tag = clan !== undefined ? `[${clan}] ` : '';
  return headlinePreview(
    'ARRIVAL',
    `${tag}${scalarOr(data.username, 'Someone')} has arrived at ${scalarOr(data.poi_name, 'this POI')}`,
    options,
  );
}

function previewPoiDeparture(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const clan = safeScalar(data.clan_tag);
  const tag = clan !== undefined ? `[${clan}] ` : '';
  return headlinePreview(
    'DEPARTURE',
    `${tag}${scalarOr(data.username, 'Someone')} has departed from ${scalarOr(data.poi_name, 'this POI')}`,
    options,
  );
}

/**
 * One-off push when a freight run passes its deadline (games 0.549+).
 * No formal Notification_shipment_overdue schema — field names assumed from
 * ShippingActiveContract / InspectPackageShipment + OpenAPI shipping prose
 * (shipment, destination, ticks left, late fee). Tolerate partial bags.
 */
function previewShipmentOverdue(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  // Assumed keys (aligned with active-contract OpenAPI names — NOT schema-verified for notifications)
  const shipment = firstSafeScalar(data, ['shipment_id', 'shipment', 'contract_id']);
  const destination = firstSafeScalar(data, ['destination_name', 'destination', 'destination_base_id']);
  // Prefer recovery window (time left after deadline), then deadline delta, then loose aliases
  const ticksLeft =
    finiteNumber(data.ticks_to_recovery_deadline) ??
    finiteNumber(data.ticks_to_deadline) ??
    finiteNumber(data.ticks_left) ??
    finiteNumber(data.ticks_remaining);
  const lateFee = finiteNumber(data.late_fee_if_delivered_now) ?? finiteNumber(data.late_fee);

  const parts: string[] = [];
  if (shipment !== undefined) parts.push(`shipment ${shipment}`);
  if (destination !== undefined) parts.push(`→ ${destination}`);
  if (ticksLeft !== undefined) parts.push(`${ticksLeft.toLocaleString()} ticks left`);
  if (lateFee !== undefined) parts.push(`late fee ${lateFee.toLocaleString()} cr`);

  const message = safeScalar(data.message);
  const headline =
    parts.length > 0
      ? `Overdue: ${parts.join(', ')}`
      : message !== undefined
        ? String(message)
        : 'Freight shipment overdue';

  return {
    ...headlinePreview('FREIGHT OVERDUE', headline, options),
    severity: 'warning',
  };
}

const OBSERVATION_IDENTITY_LIMIT = 3;

type ObservationIdentityDomain =
  | 'nearby player'
  | 'system agent'
  | 'pirate'
  | 'empire NPC'
  | 'creature'
  | 'cloaked contact';

function observationText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = firstLine(value);
  if (!text || /NaN|Infinity|\[object Object\]|undefined/.test(text)) return undefined;
  return text;
}

function observationIdentity(record: Record<string, unknown>, domain: ObservationIdentityDomain): string {
  const nameKeys =
    domain === 'nearby player' || domain === 'system agent' || domain === 'cloaked contact'
      ? (['username', 'name', 'ship_name'] as const)
      : domain === 'creature'
        ? (['name', 'species'] as const)
        : (['name', 'ship_name'] as const);
  const idKeys =
    domain === 'nearby player' || domain === 'system agent'
      ? (['player_id', 'id'] as const)
      : domain === 'pirate'
        ? (['pirate_id', 'id'] as const)
        : domain === 'empire NPC'
          ? (['npc_id', 'id'] as const)
          : domain === 'creature'
            ? (['creature_id', 'id'] as const)
            : (['target_id', 'player_id', 'id'] as const);
  const name = nameKeys.map((key) => observationText(record[key])).find(Boolean);
  const id = idKeys.map((key) => observationText(record[key])).find(Boolean);
  let identity = name && id && name !== id ? `${name} [${id}]` : (name ?? id ?? domain);

  if (domain === 'pirate') {
    const crew = observationText(record.faction_name) ?? observationText(record.faction);
    if (crew) identity += ` (${crew})`;
  }
  return identity;
}

function observationDepartures(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(observationText).filter((entry): entry is string => entry !== undefined);
}

function observationDomainDetail(
  label: string,
  domain: ObservationIdentityDomain,
  changed: Array<Record<string, unknown>>,
  departed: string[],
  options: ResolvedPreviewOptions,
): string | undefined {
  if (!changed.length && !departed.length) return undefined;

  let remainingIdentitySlots = OBSERVATION_IDENTITY_LIMIT;
  let shownIdentities = 0;
  const parts: string[] = [];

  if (changed.length) {
    const identities = changed.slice(0, remainingIdentitySlots).map((record) => observationIdentity(record, domain));
    shownIdentities += identities.length;
    remainingIdentitySlots -= identities.length;
    parts.push(`changed ${changed.length}${identities.length ? `: ${identities.join(', ')}` : ''}`);
  }

  if (departed.length) {
    const identities = departed.slice(0, remainingIdentitySlots);
    shownIdentities += identities.length;
    parts.push(`departed ${departed.length}${identities.length ? `: ${identities.join(', ')}` : ''}`);
  }

  const hiddenIdentities = changed.length + departed.length - shownIdentities;
  const detail = `${label} — ${parts.join('; ')}`;
  if (hiddenIdentities <= 0) return truncate(detail, options);

  const more = `; +${hiddenIdentities} more`;
  if (detail.length + more.length <= options.maxLineLength) return `${detail}${more}`;
  if (options.maxLineLength <= more.length + 1) return truncate(`${detail}${more}`, options);
  return `${detail.slice(0, options.maxLineLength - more.length - 1)}…${more}`;
}

function previewObservationUpdate(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const nearbyChanged = records(data.nearby_changed);
  const nearbyDeparted = observationDepartures(data.nearby_departed);
  const systemChanged = records(data.system_changed);
  const systemDeparted = observationDepartures(data.system_departed);
  const piratesChanged = records(data.pirates_changed);
  const piratesDeparted = observationDepartures(data.pirates_departed);
  const empireNpcsChanged = records(data.empire_npcs_changed);
  const empireNpcsDeparted = observationDepartures(data.empire_npcs_departed);
  const creaturesChanged = records(data.creatures_changed);
  const creaturesDeparted = observationDepartures(data.creatures_departed);
  const cloakedResolved = records(data.cloaked_resolved);
  const cloakedLost = observationDepartures(data.cloaked_lost);

  const changedCount =
    nearbyChanged.length +
    systemChanged.length +
    piratesChanged.length +
    empireNpcsChanged.length +
    creaturesChanged.length +
    cloakedResolved.length;
  const departedCount =
    nearbyDeparted.length +
    systemDeparted.length +
    piratesDeparted.length +
    empireNpcsDeparted.length +
    creaturesDeparted.length +
    cloakedLost.length;

  const poi = observationText(data.poi_id) ?? 'current POI';
  const system = observationText(data.system_id) ?? 'current system';
  const tick = finiteNumber(data.tick);
  const suffixes: string[] = [];
  if (data.unknown_signature === true) suffixes.push('unknown signature');
  if (data.active_scan === true) suffixes.push('active scan');
  const suffix = suffixes.length ? `; ${suffixes.join('; ')}` : '';

  const details = [
    observationDomainDetail('Nearby players', 'nearby player', nearbyChanged, nearbyDeparted, options),
    observationDomainDetail('System agents', 'system agent', systemChanged, systemDeparted, options),
    observationDomainDetail('Pirates', 'pirate', piratesChanged, piratesDeparted, options),
    observationDomainDetail('Empire NPCs', 'empire NPC', empireNpcsChanged, empireNpcsDeparted, options),
    observationDomainDetail('Creatures', 'creature', creaturesChanged, creaturesDeparted, options),
    observationDomainDetail('Cloaked contacts', 'cloaked contact', cloakedResolved, cloakedLost, options),
  ]
    .filter((detail): detail is string => detail !== undefined)
    .slice(0, options.maxDetails);

  return {
    tag: 'OBSERVATION',
    headline: truncate(
      `Observation at ${poi} in ${system} (tick ${tick === undefined ? '?' : tick}): ${changedCount} changed, ${departedCount} departed${suffix}`,
      options,
    ),
    details,
  };
}

/**
 * Typed pure preview handlers — sole known-type registry after PR7c.
 * null → fall through to Policy 5 generic path.
 *
 * PR2: table Message special-case types (market, crafting, summaries, commission).
 * PR3: action_result + system (residual dump fixes).
 * PR7a: combat / police / pirate / battle.
 * PR7b: social / trade / friends / faction / base / scan.
 * PR7c: remainder (mining, drones, skills, queue, version, poi, reconnected, pilotless, action_error).
 */

const PREVIEW_HANDLERS: Record<string, PreviewHandler> = {
  market_update: (data, _notification, options) => headlinePreview('MARKET', formatMarketUpdateMessage(data), options),

  crafting_update: (data, _notification, options) =>
    headlinePreview('CRAFTING', formatCraftingUpdateMessage(data), options),

  crafting_summary: (data, _notification, options) =>
    headlinePreview('CRAFTING', formatCraftingSummaryMessage(data), options),

  action_result_summary: (data, _notification, options) =>
    headlinePreview('ACTION RESULTS', formatActionResultSummaryMessage(data), options),

  system_progress_summary: (data, _notification, options) =>
    headlinePreview('SYSTEM', formatSystemProgressSummaryMessage(data), options),

  ship_commission_complete: (data, _notification, options) => {
    // Receipt when present; null falls through to Policy 5 generic (scalar bag / last resort).
    const receipt = formatShipCommissionReceipt(data);
    if (!receipt) return null;
    return headlinePreview('SHIP READY', receipt, options);
  },

  // Freight deadline passed (0.549+); always typed — never null to Policy 5
  shipment_overdue: previewShipmentOverdue,
  observation_update: previewObservationUpdate,

  action_result: previewActionResult,
  action_error: previewActionError,
  system: previewSystem,

  // PR7a combat domain
  combat_update: previewCombatUpdate,
  player_died: previewPlayerDied,
  player_kill: previewPlayerKill,
  police_warning: previewPoliceWarning,
  police_spawn: previewPoliceSpawn,
  police_combat: previewPoliceCombat,
  pirate_warning: previewPirateWarning,
  pirate_spawn: previewPirateSpawn,
  pirate_combat: previewPirateCombat,
  pirate_destroyed: previewPirateDestroyed,
  battle_started: previewBattleStarted,
  battle_update: previewBattleUpdate,
  battle_damage: previewBattleDamage,
  battle_joined: previewBattleJoined,
  battle_left: previewBattleLeft,
  battle_ended: previewBattleEnded,
  ship_captured: previewShipCaptured,
  prize_update: previewPrizeUpdate,
  // Social domain (PR7b)
  chat_message: previewChatMessage,
  trade_offer_received: previewTradeOfferReceived,
  trade_complete: previewTradeComplete,
  trade_declined: previewTradeDeclined,
  trade_cancelled: previewTradeCancelled,
  friend_request: previewFriendRequest,
  friend_request_accepted: previewFriendRequestAccepted,
  friend_removed: previewFriendRemoved,
  friend_online: previewFriendOnline,
  friend_offline: previewFriendOffline,
  faction_invite: previewFactionInvite,
  // 0.573.2 ops + diplomacy
  faction_war_declared: previewFactionWarDeclared,
  faction_peace_proposal: previewFactionPeaceProposal,
  faction_peace_accepted: previewFactionPeaceAccepted,
  faction_alliance_proposal: previewFactionAllianceProposal,
  faction_alliance_formed: previewFactionAllianceFormed,
  faction_alliance_broken: previewFactionAllianceBroken,
  server_restart_warning: previewServerRestartWarning,
  drone_adrift: previewDroneAdrift,
  base_raid_update: previewBaseRaidUpdate,
  base_destroyed: previewBaseDestroyed,
  scan_result: previewScanResult,
  scan_detected: previewScanDetected,
  // Remainder (PR7c)
  mining_yield: previewMiningYield,
  drone_update: previewDroneUpdate,
  drone_destroyed: previewDroneDestroyed,
  skill_level_up: previewSkillLevelUp,
  skill_xp_gain: previewSkillXpGain,
  pilotless_ship: previewPilotlessShip,
  reconnected: previewReconnected,
  version_info: previewVersionInfo,
  queue_cleared: previewQueueCleared,
  poi_arrival: previewPoiArrival,
  poi_departure: previewPoiDeparture,
};

/** True when a native pure preview handler is registered for msgType. */
export function hasPreviewHandler(msgType: string): boolean {
  return typeof PREVIEW_HANDLERS[msgType] === 'function';
}

/**
 * Sorted msg_type keys with pure PREVIEW_HANDLERS.
 * After PR7c this is the sole known-type registry (NOTIFICATION_TYPES derives from it).
 */
export const PREVIEW_HANDLER_TYPES: readonly string[] = Object.keys(PREVIEW_HANDLERS).sort();

function resolveOptions(options?: NotificationPreviewOptions): ResolvedPreviewOptions {
  return {
    maxLineLength: options?.maxLineLength ?? DEFAULT_PREVIEW_OPTIONS.maxLineLength,
    maxDetails: options?.maxDetails ?? DEFAULT_PREVIEW_OPTIONS.maxDetails,
    maxDepth: options?.maxDepth ?? DEFAULT_PREVIEW_OPTIONS.maxDepth,
    verbose: options?.verbose ?? DEFAULT_PREVIEW_OPTIONS.verbose,
  };
}

function safeScalar(value: unknown): string | number | boolean | undefined {
  if (typeof value === 'string') return value.trim() ? value : undefined;
  if (typeof value === 'boolean') return value;
  return finiteNumber(value);
}

function firstSafeScalar(
  data: Record<string, unknown>,
  keys: readonly string[],
): string | number | boolean | undefined {
  for (const key of keys) {
    const value = safeScalar(data[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function firstLine(value: string): string {
  return value.split(/\r?\n/, 1)[0]?.trim() ?? '';
}

function truncate(value: string, options: ResolvedPreviewOptions): string {
  const max = options.maxLineLength;
  if (value.length <= max) return value;
  if (max <= 1) return '…';
  return `${value.slice(0, max - 1)}…`;
}

/** Generic scalar bag: any object or array is skipped. Scalars are never bulky by key name alone. */
function isBulkyValue(_key: string, value: unknown): boolean {
  return value !== null && typeof value === 'object';
}

function collectScalarBits(
  data: Record<string, unknown>,
  options: { preferredKeys: readonly string[]; maxKeys: number },
): string[] {
  const bits: string[] = [];
  const seen = new Set<string>();

  const push = (key: string, value: unknown) => {
    if (seen.has(key) || bits.length >= options.maxKeys) return;
    if (isBulkyValue(key, value)) return;
    const scalar = safeScalar(value);
    if (scalar === undefined) return;
    seen.add(key);
    bits.push(`${key}=${scalar}`);
  };

  for (const key of options.preferredKeys) {
    if (key in data) push(key, data[key]);
  }

  // Prefer listed keys first; fill remaining slots from other top-level scalars.
  if (bits.length < options.maxKeys) {
    for (const [key, value] of Object.entries(data)) {
      if (bits.length >= options.maxKeys) break;
      push(key, value);
    }
  }

  return bits;
}

function omittedBulkyHint(data: Record<string, unknown>): string | undefined {
  // Prefer known bulky key names first, then any remaining object/array keys.
  const known: string[] = [];
  const other: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (!isBulkyValue(key, value)) continue;
    if (BULKY_KEYS.has(key)) known.push(key);
    else other.push(key);
  }
  const omitted = [...known, ...other];
  if (!omitted.length) return undefined;
  const preview = omitted.slice(0, 6).join(', ');
  const suffix = omitted.length > 6 ? `, +${omitted.length - 6} more` : '';
  return `omitted: ${preview}${suffix}`;
}

function defaultTag(notification: NormalizedNotification): string {
  const raw = notification.msgType || notification.type || 'notification';
  return raw.toUpperCase();
}

function previewGeneric(notification: NormalizedNotification, options: ResolvedPreviewOptions): NotificationPreview {
  const data = notification.data;
  const tag = defaultTag(notification);

  // 1. Sender + body (matches table: sender/… + content/message/…)
  const sender = firstSafeScalar(data, SENDER_KEYS);
  const body = firstSafeScalar(data, BODY_KEYS);
  if (sender !== undefined && body !== undefined) {
    return {
      tag,
      headline: truncate(`${sender}: ${firstLine(String(body))}`, options),
      details: [],
    };
  }

  // 2. Command + error/code (matches table action_error-like rows)
  const command = safeScalar(data.command);
  const error = firstSafeScalar(data, ['message', 'code']);
  if (command !== undefined && error !== undefined) {
    return {
      tag,
      headline: truncate(`${command}: ${firstLine(String(error))}`, options),
      details: [],
    };
  }

  // 3. Direct message keys alone (only after sender+body and command+error miss)
  for (const key of MESSAGE_KEYS) {
    const value = safeScalar(data[key]);
    if (value !== undefined) {
      return {
        tag,
        headline: truncate(firstLine(String(value)), options),
        details: [],
      };
    }
  }

  // 4. Compact scalar bag (object/array values skipped)
  const bits = collectScalarBits(data, {
    preferredKeys: GENERIC_SCALAR_KEYS,
    maxKeys: options.maxDetails,
  });
  if (bits.length) {
    const omittedHint = omittedBulkyHint(data);
    return {
      tag,
      headline: truncate(bits.join(', '), options),
      details: [],
      ...(omittedHint ? { omittedHint } : {}),
    };
  }

  // 5. Last resort: type only (never full tree / never JSON.stringify of data)
  const omittedHint = omittedBulkyHint(data);
  return {
    tag,
    headline: 'notification',
    details: [],
    ...(omittedHint ? { omittedHint } : {}),
  };
}

/**
 * Normalize a raw or synthetic notification into the shared envelope shape.
 * Mirrors `normalizedNotification` in notifications.ts for pure-path reuse.
 */
export function normalizeNotification(notification: unknown): NormalizedNotification {
  if (!isRecord(notification)) {
    return {
      type: 'notification',
      msgType: 'notification',
      timestamp: undefined,
      data: { value: notification },
    };
  }

  const type = typeof notification.type === 'string' && notification.type.trim() ? notification.type : 'notification';
  const msgType =
    typeof notification.msg_type === 'string' && notification.msg_type.trim() ? notification.msg_type : type;
  const data = isRecord(notification.data)
    ? notification.data
    : notification.data === undefined
      ? {}
      : { value: notification.data };

  return {
    type,
    msgType,
    timestamp: notification.timestamp,
    data,
  };
}

/**
 * Try a typed PREVIEW_HANDLERS entry only.
 * Returns null when no handler is registered, the handler returns null, or the handler throws.
 */
export function tryTypedNotificationPreview(
  notification: unknown,
  options?: NotificationPreviewOptions,
): NotificationPreview | null {
  try {
    const resolved = resolveOptions(options);
    const normalized = normalizeNotification(notification);
    const handler = PREVIEW_HANDLERS[normalized.msgType];
    if (!handler) return null;
    try {
      return handler(normalized.data, normalized, resolved);
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * Build a human preview for any notification (raw or synthetic).
 * Never throws; never emits diagnostic tokens; never stringifies nested objects for human recovery.
 *
 * Completeness: Policy 5 ladder + full PREVIEW_HANDLERS registry (PR2–PR7c pure known types).
 * Table Message always consumes this via tableMessageFromPreview (PR4 / K13 Message only).
 * Inline formatNotification is layout-only over this builder (PR7c).
 */
function applyVerboseExtras(
  preview: NotificationPreview,
  data: Record<string, unknown>,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  if (!options.verbose) return preview;

  const omittedHint = preview.omittedHint ?? omittedBulkyHint(data);
  const existingText = [preview.headline, ...preview.details].join(' ');
  const preferredBits = collectScalarBits(data, {
    preferredKeys: GENERIC_SCALAR_KEYS,
    maxKeys: options.maxDetails + preview.details.length + 4,
  });

  const details = [...preview.details];
  for (const bit of preferredBits) {
    if (details.length >= options.maxDetails) break;
    if (preview.headline.includes(bit)) continue;
    if (details.includes(bit)) continue;
    // Skip if the key already appears in headline/details (e.g. message-path "code" mention).
    const eq = bit.indexOf('=');
    const key = eq > 0 ? bit.slice(0, eq) : bit;
    if (key && (existingText.includes(`${key}=`) || existingText.includes(`${key}:`))) continue;
    details.push(truncate(bit, options));
  }

  return {
    ...preview,
    details,
    ...(omittedHint ? { omittedHint } : {}),
  };
}

export function formatNotificationPreview(
  notification: unknown,
  options?: NotificationPreviewOptions,
): NotificationPreview {
  try {
    const resolved = resolveOptions(options);
    const normalized = normalizeNotification(notification);
    const typed = tryTypedNotificationPreview(notification, options);
    const preview = typed ?? previewGeneric(normalized, resolved);
    return applyVerboseExtras(preview, normalized.data, resolved);
  } catch {
    return { tag: 'NOTIFICATION', headline: 'notification', details: [] };
  }
}

/** First-detail fold threshold for table Message. Used by tableMessageFromPreview and attachWreckSite. */
const TABLE_DETAIL_FOLD_LIMIT = 80;

/**
 * Table Message = pure function of preview (normative). Type column is independent.
 * Prefer headline alone; fold first detail only when short and additive.
 * Never fold omittedHint (verbose-only, inline-only).
 */
export function tableMessageFromPreview(preview: NotificationPreview): string {
  const details = preview.details;
  if (!details.length) return preview.headline;
  const first = details[0];
  // Role: is inline-only; never occupy the table Message fold slot.
  if (first?.startsWith('Role:')) return preview.headline;
  if (first && first.length <= TABLE_DETAIL_FOLD_LIMIT && !preview.headline.includes(first)) {
    return `${preview.headline}; ${first}`;
  }
  return preview.headline;
}
