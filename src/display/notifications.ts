import { type Notification, presentNotifications } from '../notification-summary.ts';
import { formatShipCommissionReceipt } from '../ship-commission-receipt.ts';
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

function firstLinePreview(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value).split(/\r?\n/, 1)[0]?.trim() ?? '';
}

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function safeScalar(value: unknown): string | number | boolean | undefined {
  if (typeof value === 'string') return value.trim() ? value : undefined;
  if (typeof value === 'boolean') return value;
  return finiteNumber(value);
}

function isNotificationArray(value: unknown[]): value is Notification[] {
  return value.every((entry) => isRecord(entry) && typeof entry.type === 'string');
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

function formatCraftingUpdate(data: Record<string, unknown>): string {
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

function formatCraftingSummary(data: Record<string, unknown>): string {
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

function formatCountMapPreview(value: unknown, limit = 4): string | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value)
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

function formatActionResultSummary(data: Record<string, unknown>): string {
  const count = finiteNumber(data.count) ?? 0;
  const parts = [`${count} action result${count === 1 ? '' : 's'} summarized`];
  const commands = formatCountMapPreview(data.commands);
  if (commands) parts.push(commands);
  const latestTick = safeScalar(data.latest_tick);
  if (latestTick !== undefined) parts.push(`latest tick ${latestTick}`);
  const latestCommand = safeScalar(data.latest_command);
  if (latestCommand !== undefined) parts.push(`latest ${latestCommand}`);
  const latestMessage = safeScalar(data.latest_message);
  if (latestMessage !== undefined) parts.push(`latest: ${latestMessage}`);
  return parts.join('; ');
}

function formatSystemProgressSummary(data: Record<string, unknown>): string {
  const count = finiteNumber(data.count) ?? 0;
  const parts = [`${count} travel progress update${count === 1 ? '' : 's'} summarized`];
  const actions = formatCountMapPreview(data.actions);
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
  if (type === 'crafting_update') return formatCraftingUpdate(data);
  if (type === 'action_result_summary') return formatActionResultSummary(data);
  if (type === 'system_progress_summary') return formatSystemProgressSummary(data);
  if (type === 'ship_commission_complete') {
    const receipt = formatShipCommissionReceipt(data);
    if (receipt) return receipt;
  }

  const sender = safeScalar(data.sender ?? data.sender_name ?? data.from_name ?? data.username);
  const content = safeScalar(data.content ?? data.message ?? data.summary ?? data.text ?? data.description);
  if (sender !== undefined && content !== undefined) {
    return `${sender}: ${firstLinePreview(content)}`;
  }

  const command = safeScalar(data.command);
  const error = safeScalar(data.message ?? data.code);
  if (command !== undefined && error !== undefined) {
    return `${command}: ${firstLinePreview(error)}`;
  }

  const direct = safeScalar(data.message ?? data.summary ?? data.content ?? data.text ?? data.description);
  if (direct !== undefined) return firstLinePreview(direct);

  const compact = JSON.stringify(data);
  return compact === '{}' ? '' : compact;
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
