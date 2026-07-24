import type { CliWriter } from './cli-context.ts';
import {
  formatNotificationPreview,
  PREVIEW_HANDLER_TYPES,
  type NotificationPreview,
} from './notification-format-shared.ts';
import { colorsForPlain } from './output-style.ts';
import type { APIResponse } from './types.ts';

type NotificationData = Record<string, unknown>;
type Notification = NonNullable<APIResponse['notifications']>[number];
type NotificationColors = ReturnType<typeof colorsForPlain>;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function hasDiagnosticToken(lines: string[]): boolean {
  return lines.some(
    (line) =>
      line.includes('NaN') ||
      line.includes('Infinity') ||
      line.includes('[object Object]') ||
      line.includes('undefined'),
  );
}

function normalizedNotification(notification: unknown): {
  type: string;
  msgType: string;
  timestamp: unknown;
  data: NotificationData;
} {
  const record = asRecord(notification);
  if (!record) {
    return {
      type: 'notification',
      msgType: 'notification',
      timestamp: undefined,
      data: { value: notification },
    };
  }

  const type = typeof record.type === 'string' && record.type.trim() ? record.type : 'notification';
  const msgType = typeof record.msg_type === 'string' && record.msg_type.trim() ? record.msg_type : type;
  return {
    type,
    msgType,
    timestamp: record.timestamp,
    data: asRecord(record.data) ?? (record.data === undefined ? {} : { value: record.data }),
  };
}

function formatTime(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return 'unknown time';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString() : 'unknown time';
}

/**
 * Map known pure-preview tags to colors (K14 — severity later).
 * Tag-level approximation of former writeLine handler colors; unknown tags stay magenta.
 */
function previewTagColor(tag: string, c: NotificationColors): string {
  const upper = tag.toUpperCase();
  if (upper.startsWith('CHAT')) return c.cyan;
  switch (tag) {
    case 'MARKET':
    case 'CRAFTING':
    case 'ACTION RESULT':
    case 'ACTION RESULTS':
    case 'PEACE':
    case 'FRIEND':
    case 'MINED':
    case 'RECONNECTED':
    case 'ARRIVAL':
      return c.green;
    case 'SHIP READY':
    case 'KILL':
    case 'LEVEL UP':
      return `${c.green}${c.bright}`;
    case 'BASE DESTROYED':
    case 'WAR':
    case 'DEATH':
    case 'ACTION FAILED':
      return `${c.red}${c.bright}`;
    case 'SYSTEM':
    case 'FACTION':
      return c.magenta;
    case 'COMBAT':
    case 'POLICE':
    case 'PIRATES':
    case 'BATTLE':
    case 'RAID':
      return c.red;
    case 'TRADE':
    case 'SCANNED':
    case 'PILOTLESS':
    case 'QUEUE':
    case 'DEPARTURE':
      return c.yellow;
    case 'SCAN':
    case 'VERSION':
    case 'XP':
      return c.cyan;
    case 'DRONE':
      return c.blue;
    case 'TIP':
      return c.yellow;
    default:
      return c.magenta;
  }
}

/**
 * Render a pure NotificationPreview as colored multi-line output.
 * Does not show omittedHint by default (verbose-only, PR 8).
 */
function renderPreviewInline(
  preview: NotificationPreview,
  time: string,
  c: NotificationColors,
  writeLine: (message?: string) => void,
): void {
  const tagColor = previewTagColor(preview.tag, c);
  writeLine(
    `${c.dim}[${time}]${c.reset} ${tagColor}[${preview.tag}]${c.reset} ${preview.headline}`,
  );
  for (const detail of preview.details) {
    writeLine(`  ${detail}`);
  }
}

/**
 * Layout-only fallback: Policy 5 ladder via shared pure preview.
 * Never dumps nested JSON of ship/location/nearby payloads.
 */
function formatGenericNotification(
  notification: ReturnType<typeof normalizedNotification>,
  time: string,
  c: NotificationColors,
  writeLine: (message?: string) => void,
  verbose = false,
): void {
  const preview = formatNotificationPreview({
    verbose,
    type: notification.type,
    msg_type: notification.msgType,
    timestamp: notification.timestamp,
    data: notification.data,
  });
  renderPreviewInline(preview, time, c, writeLine);
}

/**
 * Known notification msg_types — derived from pure PREVIEW_HANDLERS keys (PR7c).
 * Table Type column still shows raw server msg_type (K13); this list is for test coverage.
 */
export const NOTIFICATION_TYPES = [...PREVIEW_HANDLER_TYPES];

/**
 * Layout-only human formatter (PR7c pure registry):
 *   1. formatNotificationPreview (typed PREVIEW_HANDLERS → Policy 5 generic)
 *   2. renderPreviewInline (timestamp + [TAG] + colors)
 *   3. On diagnostic-token / throw: re-run generic layout path
 *
 * Table Message is independent (tableMessageFromPreview); Type stays raw msg_type (K13).
 */
export function formatNotification(
  notification: Notification,
  options?: { plain?: boolean; verbose?: boolean },
): string[] {
  const lines: string[] = [];
  const writeLine = (message = '') => lines.push(message);
  const normalized = normalizedNotification(notification);
  const time = formatTime(normalized.timestamp);
  const c = colorsForPlain(Boolean(options?.plain));

  try {
    const preview = formatNotificationPreview({
      verbose: Boolean(options?.verbose),
      type: normalized.type,
      msg_type: normalized.msgType,
      timestamp: normalized.timestamp,
      data: normalized.data,
    });
    renderPreviewInline(preview, time, c, writeLine);
    if (lines.length > 0 && !hasDiagnosticToken(lines)) return lines;
  } catch {
    // Malformed pure preview should not make rendering fail.
  }

  lines.length = 0;
  formatGenericNotification(normalized, time, c, writeLine, Boolean(options?.verbose));
  return lines;
}

export function displayNotifications(
  notifications?: APIResponse['notifications'],
  writer?: CliWriter,
  quiet = false,
  options?: { plain?: boolean; verbose?: boolean },
): void {
  if (!Array.isArray(notifications) || !notifications.length) return;
  if (quiet) return;

  const out = writer?.out.bind(writer) ?? console.log;
  for (const notification of notifications) {
    for (const line of formatNotification(notification, { plain: options?.plain, verbose: options?.verbose })) {
      out(line);
    }
  }
}
