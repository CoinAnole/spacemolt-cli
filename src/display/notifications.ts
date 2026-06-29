import { c, emitLine, formatter, isRecord, printCompactTable } from './helpers.ts';
import { presentNotifications, type Notification } from '../notification-summary.ts';

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

function formatMarketUpdate(data: Record<string, unknown>): string {
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

function formatCraftingSummary(data: Record<string, unknown>): string {
  const count = typeof data.count === 'number' ? data.count : 0;
  const updateWord = count === 1 ? 'update' : 'updates';
  const parts = [`${count} crafting progress ${updateWord} summarized`];
  if (data.latest_tick !== undefined) parts.push(`latest tick ${data.latest_tick}`);
  if (typeof data.jobs === 'number') parts.push(`${data.jobs} active ${data.jobs === 1 ? 'job' : 'jobs'}`);
  if (data.latest_message) parts.push(`latest: ${data.latest_message}`);
  return parts.join('; ');
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

  const type = formatNotificationType(notification);
  if (type === 'market_update') return formatMarketUpdate(data);
  if (type === 'crafting_summary') return formatCraftingSummary(data);

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
  if (Array.isArray(result.notifications)) {
    return presentNotifications(result.notifications as Notification[]).notifications.filter(isRecord);
  }
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
