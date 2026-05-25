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

function firstLinePreview(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value).split(/\r?\n/, 1)[0]?.trim() ?? '';
}

function formatNotificationType(notification: Record<string, unknown>): string {
  const data = isRecord(notification.data) ? notification.data : undefined;
  const type = notification.msg_type ?? notification.type ?? data?.type;
  return type === undefined || type === null || type === '' ? 'notification' : String(type);
}

function formatNotificationMessage(notification: Record<string, unknown>): string {
  const data = notification.data;
  if (typeof data === 'string') return firstLinePreview(data);
  if (!isRecord(data)) return data === undefined || data === null ? '' : JSON.stringify(data);

  const sender = data.sender ?? data.sender_name ?? data.from_name ?? data.username;
  const content = data.content ?? data.message ?? data.summary ?? data.text ?? data.description;
  if (sender !== undefined && sender !== null && sender !== '' && content !== undefined && content !== null) {
    return `${sender}: ${firstLinePreview(content)}`;
  }

  const command = data.command;
  const error = data.message ?? data.code;
  if (command !== undefined && command !== null && command !== '' && error !== undefined && error !== null) {
    return `${command}: ${firstLinePreview(error)}`;
  }

  const direct = data.message ?? data.summary ?? data.content ?? data.text ?? data.description;
  if (direct !== undefined && direct !== null && direct !== '') return firstLinePreview(direct);

  const compact = JSON.stringify(data);
  return compact === '{}' ? '' : compact;
}

function notificationRows(result: Record<string, unknown>): Array<Record<string, unknown>> | undefined {
  if (Array.isArray(result.notifications)) return result.notifications.filter(isRecord);
  if (result.notifications === null) return [];
  return undefined;
}

export const notificationFormatters = [
  formatter(
    (r) => {
      const notifications = notificationRows(r);
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
        { maxCellWidth: 80 },
      );

      if (typeof r.remaining === 'number' && r.remaining > 0) {
        emitLine(`${c.dim}${r.remaining} more notification${r.remaining === 1 ? '' : 's'} remaining.${c.reset}`);
      }
      return true;
    },
    { commands: ['notifications', 'get_notifications'] },
  ),
];
