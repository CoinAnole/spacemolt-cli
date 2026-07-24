/** Local isRecord — same style as ship-commission-receipt.ts; no import from response.ts. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

const DEFAULT_COUNT_MAP_LIMIT = 6;

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

// ── Shared notification preview (Policy 5 ladder + typed handlers) ──────────

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
  /** Max object depth for generic scalar walk. Default: 2. */
  maxDepth?: number;
  /**
   * When true (`--verbose-notifications`), include `omittedHint` as a detail line
   * and allow extra preferred scalars in details — still never nested ship/location/nearby dumps.
   */
  verbose?: boolean;
}

type ResolvedPreviewOptions = Required<
  Pick<NotificationPreviewOptions, 'maxLineLength' | 'maxDetails' | 'maxDepth' | 'verbose'>
>;

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

/**
 * Typed pure preview handlers. Grown over later PRs.
 * null → fall through to Policy 5 generic path.
 */
const PREVIEW_HANDLERS: Record<string, PreviewHandler> = {
  // PR1: empty — typed handlers land in later PRs. Policy 5 generic covers unknown types.
};

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
 * Build a human preview for any notification (raw or synthetic).
 * Never throws; never emits diagnostic tokens; never stringifies nested objects for human recovery.
 *
 * PR1 completeness: generic Policy 5 ladder + empty PREVIEW_HANDLERS.
 * Later PRs register typed handlers; table Message still independent until table-unification.
 */
export function formatNotificationPreview(
  notification: unknown,
  options?: NotificationPreviewOptions,
): NotificationPreview {
  try {
    const resolved = resolveOptions(options);
    const normalized = normalizeNotification(notification);
    const handler = PREVIEW_HANDLERS[normalized.msgType];
    if (handler) {
      try {
        const typed = handler(normalized.data, normalized, resolved);
        if (typed) return typed;
      } catch {
        // Typed handler failure falls through to generic.
      }
    }
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
