import { isRecord } from './response.ts';
import type { APIResponse } from './types.ts';

export type Notification = NonNullable<APIResponse['notifications']>[number];

export interface PresentedNotifications {
  notifications: Notification[];
  rawCount: number;
  shownCount: number;
  summarizedCount: number;
  summaries: Array<{ type: string; count: number }>;
}

export interface PresentedResponse {
  response: APIResponse;
  topLevel?: PresentedNotifications;
  structuredContent?: PresentedNotifications;
  result?: PresentedNotifications;
}

export interface NotificationPresentationOptions {
  rawNotifications?: boolean;
}

const HIGH_SIGNAL_TERMS = ['complete', 'completed', 'failed', 'failure', 'error', 'cancel', 'cancelled', 'refund'];

function asNotificationArray(value: unknown): Notification[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every((entry) => isRecord(entry) && typeof entry.type === 'string') ? (value as Notification[]) : undefined;
}

function collectSearchText(value: unknown, output: string[] = [], depth = 0): string[] {
  if (value === undefined || value === null || depth > 3) return output;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    output.push(String(value).toLowerCase());
    return output;
  }
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 20)) collectSearchText(entry, output, depth + 1);
    return output;
  }
  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      output.push(key.toLowerCase());
      collectSearchText(entry, output, depth + 1);
    }
  }
  return output;
}

function notificationText(notification: Notification): string {
  return collectSearchText([notification.type, notification.msg_type, notification.data]).join(' ');
}

function isCraftingSummary(notification: Notification): boolean {
  return notification.msg_type === 'crafting_summary';
}

function isCraftingLike(notification: Notification): boolean {
  const text = notificationText(notification);
  return text.includes('craft') || text.includes('crafting.');
}

function isHighSignalCrafting(notification: Notification): boolean {
  const text = notificationText(notification);
  return HIGH_SIGNAL_TERMS.some((term) => text.includes(term));
}

function isRoutineCraftingProgress(notification: Notification): boolean {
  if (isCraftingSummary(notification)) return false;
  return isCraftingLike(notification) && !isHighSignalCrafting(notification);
}

function timestampMillis(notification: Notification): number {
  const millis = Date.parse(notification.timestamp);
  return Number.isFinite(millis) ? millis : Number.NEGATIVE_INFINITY;
}

function numericDataField(notification: Notification, field: string): number | undefined {
  const data = isRecord(notification.data) ? notification.data : undefined;
  const value = data?.[field];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function stringDataField(notification: Notification, field: string): string | undefined {
  const data = isRecord(notification.data) ? notification.data : undefined;
  const value = data?.[field];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function jobIdsFrom(notification: Notification): string[] {
  const data = isRecord(notification.data) ? notification.data : undefined;
  if (!data) return [];
  const ids: string[] = [];
  if (typeof data.job_id === 'string' && data.job_id) ids.push(data.job_id);
  if (Array.isArray(data.job_ids)) {
    for (const id of data.job_ids) {
      if (typeof id === 'string' && id) ids.push(id);
    }
  }
  if (Array.isArray(data.jobs)) {
    for (const job of data.jobs) {
      if (isRecord(job) && typeof job.id === 'string' && job.id) ids.push(job.id);
      if (isRecord(job) && typeof job.job_id === 'string' && job.job_id) ids.push(job.job_id);
    }
  }
  return ids;
}

function craftingSummary(progress: Notification[]): Notification {
  const sortedByTime = [...progress].sort((left, right) => timestampMillis(left) - timestampMillis(right));
  const first = sortedByTime[0] ?? progress[0];
  const latest = sortedByTime[sortedByTime.length - 1] ?? progress[progress.length - 1] ?? first;
  const ticks = progress
    .map((notification) => numericDataField(notification, 'tick'))
    .filter((value): value is number => value !== undefined)
    .sort((left, right) => left - right);
  const jobIds = new Set(progress.flatMap(jobIdsFrom));
  const latestMessage = latest ? stringDataField(latest, 'message') : undefined;
  const data: Record<string, unknown> = {
    count: progress.length,
  };

  if (first?.timestamp) data.first_timestamp = first.timestamp;
  if (latest?.timestamp) data.latest_timestamp = latest.timestamp;
  if (ticks[0] !== undefined) data.first_tick = ticks[0];
  if (ticks[ticks.length - 1] !== undefined) data.latest_tick = ticks[ticks.length - 1];
  if (jobIds.size > 0) data.jobs = jobIds.size;
  if (latestMessage) data.latest_message = latestMessage;

  return {
    type: 'crafting',
    msg_type: 'crafting_summary',
    timestamp: latest?.timestamp ?? first?.timestamp ?? new Date(0).toISOString(),
    data,
  };
}

export function presentNotifications(notifications?: APIResponse['notifications']): PresentedNotifications {
  const raw = notifications ?? [];
  const routineIndexes = new Set<number>();
  const routine: Notification[] = [];

  raw.forEach((notification, index) => {
    if (isRoutineCraftingProgress(notification)) {
      routineIndexes.add(index);
      routine.push(notification);
    }
  });

  if (!routine.length) {
    return {
      notifications: [...raw],
      rawCount: raw.length,
      shownCount: raw.length,
      summarizedCount: 0,
      summaries: [],
    };
  }

  const firstRoutineIndex = [...routineIndexes].sort((left, right) => left - right)[0] ?? 0;
  const summary = craftingSummary(routine);
  const presented = raw.flatMap((notification, index) => {
    if (index === firstRoutineIndex) return [summary];
    if (routineIndexes.has(index)) return [];
    return [notification];
  });

  return {
    notifications: presented,
    rawCount: raw.length,
    shownCount: presented.length,
    summarizedCount: routine.length,
    summaries: [{ type: 'crafting', count: routine.length }],
  };
}

function presentObjectNotifications(value: Record<string, unknown>): {
  value: Record<string, unknown>;
  presentation?: PresentedNotifications;
} {
  const notifications = asNotificationArray(value.notifications);
  if (!notifications) return { value };
  const presentation = presentNotifications(notifications);
  return {
    value: { ...value, notifications: presentation.notifications },
    presentation,
  };
}

export function presentResponseNotifications(
  response: APIResponse,
  options: NotificationPresentationOptions = {},
): PresentedResponse {
  if (options.rawNotifications) {
    return {
      response,
      topLevel: response.notifications
        ? {
            notifications: [...response.notifications],
            rawCount: response.notifications.length,
            shownCount: response.notifications.length,
            summarizedCount: 0,
            summaries: [],
          }
        : undefined,
    };
  }

  let next: APIResponse = response;
  const topLevel = response.notifications ? presentNotifications(response.notifications) : undefined;
  if (topLevel) next = { ...next, notifications: topLevel.notifications };

  let structuredContent: PresentedNotifications | undefined;
  if (isRecord(response.structuredContent)) {
    const presented = presentObjectNotifications(response.structuredContent);
    structuredContent = presented.presentation;
    if (structuredContent) next = { ...next, structuredContent: presented.value };
  }

  let result: PresentedNotifications | undefined;
  if (isRecord(response.result)) {
    const presented = presentObjectNotifications(response.result);
    result = presented.presentation;
    if (result) next = { ...next, result: presented.value };
  }

  return { response: next, topLevel, structuredContent, result };
}
