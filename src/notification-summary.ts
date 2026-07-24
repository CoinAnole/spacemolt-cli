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

type SummaryKind = 'crafting' | 'action_result' | 'system_progress';

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

function isActionResultSummary(notification: Notification): boolean {
  return notification.msg_type === 'action_result_summary';
}

function isSystemProgressSummary(notification: Notification): boolean {
  return notification.msg_type === 'system_progress_summary';
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

function notificationMsgType(notification: Notification): string {
  return typeof notification.msg_type === 'string' && notification.msg_type.trim()
    ? notification.msg_type
    : notification.type;
}

function isRoutineActionResult(notification: Notification): boolean {
  if (isActionResultSummary(notification)) return false;
  const msgType = notificationMsgType(notification);
  return msgType === 'action_result' || notification.type === 'action_result';
}

function isRoutineSystemProgress(notification: Notification): boolean {
  if (isSystemProgressSummary(notification)) return false;
  // Specific system-adjacent msg_types (commission, tips, etc.) keep their own handlers.
  if (notification.msg_type && notification.msg_type !== 'system') return false;
  if (notification.type !== 'system' && notificationMsgType(notification) !== 'system') return false;

  const data = isRecord(notification.data) ? notification.data : undefined;
  if (!data) return false;
  if (data.type === 'gameplay_tip') return false;
  if (typeof data.action !== 'string' || !data.action.trim()) return false;
  // Failures / errors in system travel should stay individual.
  if (hasHighSignalValue([data.action, data.message, data.status, data.error, data.code])) return false;
  return true;
}

function classifyRoutine(notification: Notification): SummaryKind | null {
  if (isRoutineCraftingProgress(notification)) return 'crafting';
  if (isRoutineActionResult(notification)) return 'action_result';
  if (isRoutineSystemProgress(notification)) return 'system_progress';
  return null;
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

function countByKey(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function sortedTimeSpan(progress: Notification[]): {
  first?: Notification;
  latest?: Notification;
  firstTick?: number;
  latestTick?: number;
} {
  const sortedByTime = [...progress].sort((left, right) => timestampMillis(left) - timestampMillis(right));
  const first = sortedByTime[0] ?? progress[0];
  const latest = sortedByTime[sortedByTime.length - 1] ?? progress[progress.length - 1] ?? first;
  const ticks = progress
    .map((notification) => numericDataField(notification, 'tick'))
    .filter((value): value is number => value !== undefined)
    .sort((left, right) => left - right);
  return {
    first,
    latest,
    firstTick: ticks[0],
    latestTick: ticks[ticks.length - 1],
  };
}

function actionResultMessage(notification: Notification): string | undefined {
  const data = isRecord(notification.data) ? notification.data : undefined;
  const result = isRecord(data?.result) ? data.result : undefined;
  if (typeof result?.message === 'string' && result.message.trim()) return result.message;
  const details = isRecord(result?.details) ? result.details : undefined;
  if (typeof details?.message === 'string' && details.message.trim()) return details.message;
  if (typeof details?.action === 'string' && details.action.trim()) {
    const system =
      (typeof details.system === 'string' && details.system) ||
      (typeof details.system_id === 'string' && details.system_id) ||
      undefined;
    const poi = typeof details.poi === 'string' && details.poi ? details.poi : undefined;
    if (system && poi) return `${details.action} → ${system} (${poi})`;
    if (system) return `${details.action} → ${system}`;
    return details.action;
  }
  return undefined;
}

function craftingSummary(progress: Notification[]): Notification {
  const { first, latest, firstTick, latestTick } = sortedTimeSpan(progress);
  const jobIds = new Set(progress.flatMap(jobIdsFrom));
  const rentalJobIds = new Set(progress.flatMap(rentalJobIdsFrom));
  const latestMessage = latest ? stringDataField(latest, 'message') : undefined;
  const latestEscrowedCredits = latest ? escrowedCreditsFrom(latest) : undefined;
  const data: Record<string, unknown> = {
    count: progress.length,
  };

  if (first?.timestamp) data.first_timestamp = first.timestamp;
  if (latest?.timestamp) data.latest_timestamp = latest.timestamp;
  if (firstTick !== undefined) data.first_tick = firstTick;
  if (latestTick !== undefined) data.latest_tick = latestTick;
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

function actionResultSummary(progress: Notification[]): Notification {
  const { first, latest, firstTick, latestTick } = sortedTimeSpan(progress);
  const commands = countByKey(progress.map((notification) => stringDataField(notification, 'command') || 'unknown'));
  const latestCommand = latest ? stringDataField(latest, 'command') : undefined;
  const latestMessage = latest ? actionResultMessage(latest) : undefined;
  const data: Record<string, unknown> = {
    count: progress.length,
    commands,
  };

  if (first?.timestamp) data.first_timestamp = first.timestamp;
  if (latest?.timestamp) data.latest_timestamp = latest.timestamp;
  if (firstTick !== undefined) data.first_tick = firstTick;
  if (latestTick !== undefined) data.latest_tick = latestTick;
  if (latestCommand) data.latest_command = latestCommand;
  if (latestMessage) data.latest_message = latestMessage;

  return {
    type: 'action_result',
    msg_type: 'action_result_summary',
    timestamp: latest?.timestamp ?? first?.timestamp ?? new Date(0).toISOString(),
    data,
  };
}

function systemProgressSummary(progress: Notification[]): Notification {
  const { first, latest } = sortedTimeSpan(progress);
  const actions = countByKey(progress.map((notification) => stringDataField(notification, 'action') || 'unknown'));
  const latestAction = latest ? stringDataField(latest, 'action') : undefined;
  const latestDestination = latest ? stringDataField(latest, 'destination') : undefined;
  const latestArrivalTick = latest ? numericDataField(latest, 'arrival_tick') : undefined;
  const data: Record<string, unknown> = {
    count: progress.length,
    actions,
  };

  if (first?.timestamp) data.first_timestamp = first.timestamp;
  if (latest?.timestamp) data.latest_timestamp = latest.timestamp;
  if (latestAction) data.latest_action = latestAction;
  if (latestDestination) data.latest_destination = latestDestination;
  if (latestArrivalTick !== undefined) data.latest_arrival_tick = latestArrivalTick;

  return {
    type: 'system',
    msg_type: 'system_progress_summary',
    timestamp: latest?.timestamp ?? first?.timestamp ?? new Date(0).toISOString(),
    data,
  };
}

function buildSummary(kind: SummaryKind, progress: Notification[]): Notification {
  switch (kind) {
    case 'crafting':
      return craftingSummary(progress);
    case 'action_result':
      return actionResultSummary(progress);
    case 'system_progress':
      return systemProgressSummary(progress);
  }
}

export function presentNotifications(notifications?: APIResponse['notifications']): PresentedNotifications {
  const raw = notifications ?? [];
  const groups = new Map<SummaryKind, number[]>();

  raw.forEach((notification, index) => {
    const kind = classifyRoutine(notification);
    if (!kind) return;
    const indexes = groups.get(kind) ?? [];
    indexes.push(index);
    groups.set(kind, indexes);
  });

  if (!groups.size) {
    return {
      notifications: [...raw],
      rawCount: raw.length,
      shownCount: raw.length,
      summarizedCount: 0,
      summaries: [],
    };
  }

  const summaryAtIndex = new Map<number, Notification>();
  const routineIndexes = new Set<number>();
  const summaries: Array<{ type: string; count: number }> = [];

  // Preserve stable group order by first occurrence in the raw stream.
  // Crafting always collapses (even a single progress tick). Action results and system
  // travel progress only collapse when there are 2+ of that kind so a lone event still
  // renders as itself (with the compact human formatter).
  const orderedKinds = [...groups.entries()].sort((left, right) => (left[1][0] ?? 0) - (right[1][0] ?? 0));
  for (const [kind, indexes] of orderedKinds) {
    const progress = indexes.map((index) => raw[index]).filter((entry): entry is Notification => Boolean(entry));
    if (!progress.length) continue;
    if (kind !== 'crafting' && progress.length < 2) continue;
    const firstIndex = indexes[0] ?? 0;
    summaryAtIndex.set(firstIndex, buildSummary(kind, progress));
    for (const index of indexes) routineIndexes.add(index);
    summaries.push({ type: kind, count: progress.length });
  }

  const presented = raw.flatMap((notification, index) => {
    const summary = summaryAtIndex.get(index);
    if (summary) return [summary];
    if (routineIndexes.has(index)) return [];
    return [notification];
  });

  return {
    notifications: presented,
    rawCount: raw.length,
    shownCount: presented.length,
    summarizedCount: routineIndexes.size,
    summaries,
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
