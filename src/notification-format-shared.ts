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

function pushInventoryEntry(
  acc: Map<string, number>,
  key: string | undefined,
  quantity: number | undefined,
): void {
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
export function formatInventoryPreview(
  value: unknown,
  limit = DEFAULT_INVENTORY_LIMIT,
): string | undefined {
  const acc = new Map<string, number>();
  collectInventoryEntries(value, acc);
  if (!acc.size) return undefined;

  const entries = [...acc.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  );
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
   * **Reserved until PR 8:** accepted and resolved today but does **not** change preview output.
   * `omittedHint` is already computed on scalar-bag/last-resort paths; showing it as a dim
   * detail line is an **inline adapter** concern under `--verbose-notifications` (PR 8), not
   * the pure builder. Still never expands nested ship/location/nearby dumps.
   */
  verbose?: boolean;
}

type ResolvedPreviewOptions = Required<
  Pick<NotificationPreviewOptions, 'maxLineLength' | 'maxDetails' | 'maxDepth' | 'verbose'>
>;

/** Defaults include reserved `maxDepth` / `verbose` so later PRs can read them without API churn. */
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

function headlinePreview(
  tag: string,
  headline: string,
  options: ResolvedPreviewOptions,
): NotificationPreview {
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
  for (const key of ['module_id', 'wear_status', 'storage_total', 'cargo_remaining'] as const) {
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
      headline: truncate(
        message !== undefined ? firstLine(String(message)) : 'gameplay tip',
        options,
      ),
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
// Dual-registry: writeLine handlers remain in notifications.ts for NOTIFICATION_TYPES
// until PR7c deletes them. Table Type stays raw msg_type (K13).

function damageLabel(value: unknown, fallback: string | number = 0): string | number {
  const n = finiteNumber(value);
  if (n !== undefined) return n;
  if (typeof value === 'string' && value.trim()) return value;
  return fallback;
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
    if (deathLocation !== undefined) {
      details.push(
        truncate(
          `Location: ${deathLocation} in ${safeScalar(log.death_system) ?? 'unknown'}`,
          options,
        ),
      );
    }
  }

  const shipLost = safeScalar(data.ship_lost);
  if (shipLost !== undefined) details.push(truncate(`Ship lost: ${shipLost}`, options));

  const cloneCost = finiteNumber(data.clone_cost);
  if (cloneCost !== undefined && cloneCost > 0) {
    details.push(truncate(`Clone cost: ${cloneCost} credits`, options));
  }

  const insurance = finiteNumber(data.insurance_payout);
  if (insurance !== undefined && insurance > 0) {
    details.push(truncate(`Insurance payout: ${insurance} credits`, options));
  }

  details.push(
    truncate(`Respawned at: ${safeScalar(data.respawn_base) ?? 'home'} with ship fully repaired`, options),
  );

  return {
    tag: 'DEATH',
    headline: truncate(headline, options),
    details,
  };
}

function previewPlayerKill(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const victim = safeScalar(data.victim_name) ?? safeScalar(data.target_name) ?? 'unknown';
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
  const wreckId = safeScalar(data.wreck_id);
  if (wreckId !== undefined) details.push(truncate(`Wreck: ${wreckId}`, options));
  return {
    tag: 'KILL',
    headline: truncate(`You destroyed ${victim}!`, options),
    details,
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
  return headlinePreview(
    'POLICE',
    `${damageLabel(data.num_drones, 0)} police drone(s) arrived!`,
    options,
  );
}

function previewPoliceCombat(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const destroyed = data.destroyed ? ' - YOU WERE DESTROYED!' : '';
  return headlinePreview(
    'POLICE',
    `Police drone dealt ${damageLabel(data.damage, 0)} damage${destroyed}`,
    options,
  );
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
  return headlinePreview(
    'PIRATES',
    `${damageLabel(data.num_pirates, 1)} pirate(s) appeared!`,
    options,
  );
}

function previewPirateCombat(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const destroyed = data.destroyed ? ' - YOU WERE DESTROYED!' : '';
  return headlinePreview(
    'PIRATES',
    `Pirate dealt ${damageLabel(data.damage, 0)} damage${destroyed}`,
    options,
  );
}

/** pirate_destroyed uses formatInventoryPreview for loot (PR6 / K15) — never JSON.stringify. */
function previewPirateDestroyed(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const details: string[] = [];
  if (data.loot !== undefined && data.loot !== null) {
    const lootPreview = formatInventoryPreview(data.loot);
    if (lootPreview) details.push(truncate(`Loot: ${lootPreview}`, options));
  }
  return {
    tag: 'PIRATES',
    headline: 'Pirate destroyed!',
    details,
  };
}

function previewBattleStarted(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  return headlinePreview(
    'BATTLE',
    `Battle started! ID: ${safeScalar(data.battle_id) ?? 'unknown'}`,
    options,
  );
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
  return headlinePreview(
    'BATTLE',
    `${safeScalar(data.username) ?? 'Someone'} joined the battle`,
    options,
  );
}

function previewBattleLeft(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  return headlinePreview(
    'BATTLE',
    `${safeScalar(data.username) ?? 'Someone'} left the battle`,
    options,
  );
}

function previewBattleEnded(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const message = safeScalar(data.message);
  const suffix = message !== undefined ? ` ${firstLine(String(message))}` : '';
  return headlinePreview('BATTLE', `Battle ended!${suffix}`, options);
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
  return headlinePreview(
    'FRIEND',
    `${scalarOr(data.from_name, 'Someone')} sent you a friend request`,
    options,
  );
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
    [
      `Use: join_faction faction_id=${factionId} or faction decline_invite faction_id=${factionId}`,
    ],
    options,
  );
}

function previewFactionWarDeclared(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  return detailPreview(
    'WAR',
    `${scalarOr(data.attacker_name, 'a faction')} has declared war on your faction!`,
    [`Reason: ${scalarOr(data.reason, 'no reason given')}`],
    options,
  );
}

function previewFactionPeaceProposed(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const factionId = scalarOr(data.faction_id, '');
  return detailPreview(
    'PEACE',
    `${scalarOr(data.proposer_name, 'a faction')} has proposed peace!`,
    [
      `Terms: ${scalarOr(data.terms, 'unconditional')}`,
      `Use: faction accept_peace target_faction_id=${factionId}`,
    ],
    options,
  );
}

function previewBaseRaidUpdate(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const current = finiteNumber(data.current_health) ?? 0;
  const max = finiteNumber(data.max_health) ?? 0;
  const dpt = finiteNumber(data.damage_per_tick) ?? 0;
  return headlinePreview(
    'RAID',
    `${scalarOr(data.base_name, 'base')}: ${current}/${max} HP (-${dpt}/tick)`,
    options,
  );
}

function previewBaseDestroyed(
  data: Record<string, unknown>,
  _notification: NormalizedNotification,
  options: ResolvedPreviewOptions,
): NotificationPreview {
  const details: string[] = [];
  const wreckId = safeScalar(data.wreck_id);
  if (wreckId !== undefined) details.push(`Wreck ID for looting: ${wreckId}`);
  return detailPreview(
    'BASE DESTROYED',
    `${scalarOr(data.base_name, 'base')} has been destroyed!`,
    details,
    options,
  );
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
    return detailPreview(
      'SCAN',
      `Scan of ${target} revealed: ${revealed.join(', ')}`,
      details,
      options,
    );
  }
  return headlinePreview(
    'SCAN',
    `Scan of ${target} failed - insufficient scan power`,
    options,
  );
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

/**
 * Typed pure preview handlers. Grown over later PRs.
 * null → fall through to Policy 5 generic path.
 *
 * PR2: table Message special-case types (market, crafting, summaries, commission).
 * PR3: action_result + system (residual dump fixes).
 * PR7b: social / trade / friends / faction / base / scan.
 * Inline dual-use prefers this registry before writeLine (see formatNotification).
 */

const PREVIEW_HANDLERS: Record<string, PreviewHandler> = {
  market_update: (data, _notification, options) =>
    headlinePreview('MARKET', formatMarketUpdateMessage(data), options),

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

  action_result: previewActionResult,
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
  faction_war_declared: previewFactionWarDeclared,
  faction_peace_proposed: previewFactionPeaceProposed,
  base_raid_update: previewBaseRaidUpdate,
  base_destroyed: previewBaseDestroyed,
  scan_result: previewScanResult,
  scan_detected: previewScanDetected,
};

/** True when a native pure preview handler is registered for msgType (dual-registry dispatch). */
export function hasPreviewHandler(msgType: string): boolean {
  return typeof PREVIEW_HANDLERS[msgType] === 'function';
}

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

function firstSafeScalar(data: Record<string, unknown>, keys: readonly string[]): string | number | boolean | undefined {
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
 * Used by interim inline dual-registry dispatch (PREVIEW_HANDLERS → writeLine → generic).
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
 * Completeness: Policy 5 ladder + PREVIEW_HANDLERS (PR2 table-parity + PR3 action_result/system + PR7a combat domain).
 * Table Message always consumes this via tableMessageFromPreview (PR4 / K13 Message only).
 */
export function formatNotificationPreview(
  notification: unknown,
  options?: NotificationPreviewOptions,
): NotificationPreview {
  try {
    const resolved = resolveOptions(options);
    const normalized = normalizeNotification(notification);
    const typed = tryTypedNotificationPreview(notification, options);
    if (typed) return typed;
    return previewGeneric(normalized, resolved);
  } catch {
    return { tag: 'NOTIFICATION', headline: 'notification', details: [] };
  }
}

/**
 * Table Message = pure function of preview (normative). Type column is independent.
 * Prefer headline alone; fold first detail only when short and additive.
 * Never fold omittedHint (verbose-only, inline-only).
 */
export function tableMessageFromPreview(preview: NotificationPreview): string {
  const details = preview.details;
  if (!details.length) return preview.headline;
  const first = details[0];
  if (first && first.length <= 80 && !preview.headline.includes(first)) {
    return `${preview.headline}; ${first}`;
  }
  return preview.headline;
}
