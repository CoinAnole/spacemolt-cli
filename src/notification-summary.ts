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
const HIGH_SIGNAL_TEXT = /(?:^|[^a-z])(complete|completed|failed|failure|error|cancel|cancelled|refund)(?:[^a-z]|$)/i;
const HIGH_SIGNAL_KEYS = new Set(HIGH_SIGNAL_TERMS);

function asNotificationArray(value: unknown): Notification[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every((entry) => isRecord(entry) && typeof entry.type === 'string')
    ? (value as Notification[])
    : undefined;
}

function isCraftingSummary(notification: Notification): boolean {
  return notification.msg_type === 'crafting_summary';
}

function metadataString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.toLowerCase() : undefined;
}

function hasCraftingSignal(value: unknown): boolean {
  const text = metadataString(value);
  if (!text) return false;
  return (
    text === 'crafting' || text.startsWith('crafting_') || text.startsWith('crafting.') || text.includes('.crafting.')
  );
}

function isCraftingLike(notification: Notification): boolean {
  const data = isRecord(notification.data) ? notification.data : undefined;
  return (
    hasCraftingSignal(notification.type) ||
    hasCraftingSignal(notification.msg_type) ||
    hasCraftingSignal(data?.type) ||
    hasCraftingSignal(data?.event_type)
  );
}

function containsHighSignalText(value: unknown): boolean {
  return typeof value === 'string' && HIGH_SIGNAL_TEXT.test(value);
}

function isTrueLike(value: unknown): boolean {
  return value === true || value === 1 || value === 'true' || value === 'yes';
}

function hasHighSignalValue(value: unknown, depth = 0): boolean {
  if (value === undefined || value === null || depth > 5) return false;
  if (containsHighSignalText(value)) return true;
  if (Array.isArray(value)) return value.slice(0, 20).some((entry) => hasHighSignalValue(entry, depth + 1));
  if (!isRecord(value)) return false;

  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (HIGH_SIGNAL_KEYS.has(normalizedKey) && isTrueLike(entry)) return true;
    if (hasHighSignalValue(entry, depth + 1)) return true;
  }
  return false;
}

function isHighSignalCrafting(notification: Notification): boolean {
  return hasHighSignalValue([notification.type, notification.msg_type, notification.data]);
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

function jobRecordsFrom(notification: Notification): Array<Record<string, unknown>> {
  const data = isRecord(notification.data) ? notification.data : undefined;
  if (!data) return [];
  if (Array.isArray(data.jobs)) return data.jobs.filter(isRecord);
  if (typeof data.job_id === 'string' && data.job_id) {
    return [
      {
        job_id: data.job_id,
        external: data.external,
        escrowed_credits: data.escrowed_credits,
      },
    ];
  }
  return [];
}

function rentalJobIdsFrom(notification: Notification): string[] {
  const ids: string[] = [];
  for (const job of jobRecordsFrom(notification)) {
    if (job.external !== true) continue;
    const id = (typeof job.job_id === 'string' && job.job_id) || (typeof job.id === 'string' && job.id) || undefined;
    ids.push(id || `anonymous-rental-${ids.length}`);
  }
  return ids;
}

function escrowedCreditsFrom(notification: Notification): number | undefined {
  const data = isRecord(notification.data) ? notification.data : undefined;
  if (!data) return undefined;
  const jobs = Array.isArray(data.jobs) ? data.jobs.filter(isRecord) : [];
  if (jobs.length) {
    let total = 0;
    let found = false;
    for (const job of jobs) {
      if (typeof job.escrowed_credits === 'number' && Number.isFinite(job.escrowed_credits)) {
        total += job.escrowed_credits;
        found = true;
      }
    }
    return found ? total : undefined;
  }
  if (typeof data.escrowed_credits === 'number' && Number.isFinite(data.escrowed_credits)) {
    return data.escrowed_credits;
  }
  return undefined;
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
  const rentalJobIds = new Set(progress.flatMap(rentalJobIdsFrom));
  const latestMessage = latest ? stringDataField(latest, 'message') : undefined;
  const latestEscrowedCredits = latest ? escrowedCreditsFrom(latest) : undefined;
  const data: Record<string, unknown> = {
    count: progress.length,
  };

  if (first?.timestamp) data.first_timestamp = first.timestamp;
  if (latest?.timestamp) data.latest_timestamp = latest.timestamp;
  if (ticks[0] !== undefined) data.first_tick = ticks[0];
  if (ticks[ticks.length - 1] !== undefined) data.latest_tick = ticks[ticks.length - 1];
  if (jobIds.size > 0) data.jobs = jobIds.size;
  if (rentalJobIds.size > 0) data.rental_jobs = rentalJobIds.size;
  if (latestEscrowedCredits !== undefined) data.escrowed_credits = latestEscrowedCredits;
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
  const topLevelNotifications = asNotificationArray(response.notifications);

  if (options.rawNotifications) {
    return {
      response,
      topLevel: topLevelNotifications
        ? {
            notifications: [...topLevelNotifications],
            rawCount: topLevelNotifications.length,
            shownCount: topLevelNotifications.length,
            summarizedCount: 0,
            summaries: [],
          }
        : undefined,
    };
  }

  let next: APIResponse = response;
  const topLevel = topLevelNotifications ? presentNotifications(topLevelNotifications) : undefined;
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
