import { formatNotificationPreview, tableMessageFromPreview } from '../notification-format-shared.ts';
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
  return tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
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
  formatter(
    (r) => {
      if (!Array.isArray(r.channels)) return false;
      const channels = r.channels.filter(isRecord);
      if (channels.length !== r.channels.length) return false;

      const trimmedStrings = (value: unknown): string[] => {
        if (!Array.isArray(value)) return [];
        return value
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0);
      };

      if (Array.isArray(r.muted)) {
        if (r.muted.length === 0) emitLine('Muted: none');
        else {
          const names = trimmedStrings(r.muted);
          if (names.length > 0) emitLine(`Muted: ${names.join(', ')}`);
        }
      }

      const rows = channels.map((channel) => {
        let muted = '';
        if (channel.muted === true) muted = 'yes';
        else if (channel.muted === false) muted = 'no';
        return {
          channel: typeof channel.channel === 'string' ? channel.channel : '',
          muted,
          message_types: trimmedStrings(channel.message_types).join(', '),
          description: typeof channel.description === 'string' ? channel.description.trim() : '',
        };
      });

      // Default width 32 clips server channel descriptions.
      printCompactTable(
        'Notification Settings',
        rows,
        [
          ['Channel', ['channel']],
          ['Muted', ['muted']],
          ['Message types', ['message_types']],
          ['Description', ['description']],
        ],
        { maxCellWidth: 80 },
      );

      if (typeof r.message === 'string') {
        const message = r.message.trim();
        if (message) emitLine(`${c.dim}${message}${c.reset}`);
      }
      return true;
    },
    {
      commands: ['get_notification_settings', 'mute_notifications', 'unmute_notifications'],
      shapeFallback: false,
    },
  ),
];
