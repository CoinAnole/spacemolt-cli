import {
  formatNotificationPreview,
  tableMessageFromPreview,
} from '../notification-format-shared.ts';
import { type Notification, presentNotifications } from '../notification-summary.ts';
import type { GlobalOptions } from '../types.ts';
import { c, emitLine, formatter, isRecord, printCompactTable } from './helpers.ts';

function formatTimestampPreview(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(milliseconds)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d{3}Z$/, '');
  }
  const text = String(value);
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)/.exec(text);
  return match ? `${match[1]} ${match[2]}` : text;
}

/**
 * Table Type column = raw server msg_type (K13).
 * Do not overwrite with preview display tags.
 */
function formatNotificationType(notification: Record<string, unknown>): string {
  const data = isRecord(notification.data) ? notification.data : undefined;
  const type = notification.msg_type ?? notification.type ?? data?.type;
  return type === undefined || type === null || type === '' ? 'notification' : String(type);
}

/**
 * Table Message column via shared pure preview (PR4 / K2 / K13).
 * maxLineLength 120 matches printCompactTable maxCellWidth.
 */
export function formatNotificationMessage(notification: Record<string, unknown>): string {
  return tableMessageFromPreview(
    formatNotificationPreview(notification, { maxLineLength: 120 }),
  );
}

function isNotificationArray(value: unknown[]): value is Notification[] {
  return value.every((entry) => isRecord(entry) && typeof entry.type === 'string');
}

function notificationRows(
  result: Record<string, unknown>,
  options?: Pick<GlobalOptions, 'rawNotifications'>,
): Array<Record<string, unknown>> | undefined {
  if (Array.isArray(result.notifications)) {
    if (!isNotificationArray(result.notifications)) return result.notifications.filter(isRecord);
    if (options?.rawNotifications) return result.notifications.filter(isRecord);
    return presentNotifications(result.notifications).notifications.filter(isRecord);
  }
  if (result.notifications === null) return [];
  return undefined;
}

export const notificationFormatters = [
  formatter(
    (r, _command, options) => {
      const notifications = notificationRows(r, options);
      if (!notifications) return false;
      const count = typeof r.count === 'number' ? r.count : notifications.length;

      if (!notifications.length) {
        emitLine('No new notifications.');
        return true;
      }

      const rows = notifications.map((notification) => ({
        ...notification,
        timestamp_preview: formatTimestampPreview(notification.timestamp ?? notification.created_at ?? r.timestamp),
        type_preview: formatNotificationType(notification),
        message_preview: formatNotificationMessage(notification),
      }));

      emitLine(`${c.dim}count ${count}${c.reset}`);
      printCompactTable(
        'Notifications',
        rows,
        [
          ['Timestamp', ['timestamp_preview', 'timestamp', 'created_at']],
          ['Type', ['type_preview', 'msg_type', 'type']],
          ['Message', ['message_preview']],
        ],
        { maxCellWidth: 120 },
      );

      if (typeof r.remaining === 'number' && r.remaining > 0) {
        emitLine(`${c.dim}${r.remaining} more notification${r.remaining === 1 ? '' : 's'} remaining.${c.reset}`);
      }
      return true;
    },
    { commands: ['notifications', 'get_notifications'] },
  ),
];
