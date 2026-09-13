import { isRecord } from './response.ts';
import { parseRetryAfterHeaderRaw } from './retry-after.ts';
import type { APIResponse } from './types.ts';

export { type ParsedRetryAfter, parseRetryAfterHeaderRaw } from './retry-after.ts';

/** One session-bucket window. */
export const MAX_RATE_LIMIT_AUTO_RETRY_WAIT_SECONDS = 60;

const FLAT_429_LIFTED = [
  'message',
  'retry_after',
  'wait_seconds',
  'limit',
  'scope',
  'pending_command',
  'details',
] as const;

const WAIT_UNIT = /^\s*(seconds?|secs?|s|minutes?|mins?|m)\b/i;

function usableString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function finiteNonNegativeSeconds(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function omitKeys(data: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!keys.includes(key)) rest[key] = value;
  }
  return rest;
}

export function parseRetryAfterHeaderSeconds(header: string | undefined, nowMs: number): number | undefined {
  const parsed = parseRetryAfterHeaderRaw(header, nowMs);
  if (!parsed) return undefined;
  if (parsed.kind === 'delta') return parsed.seconds;
  return parsed.seconds > 0 ? parsed.seconds : 0;
}

export function parseWaitSecondsFromMessage(message: unknown): number | undefined {
  if (typeof message !== 'string') return undefined;
  const match = message.match(/\d+/);
  if (!match || match.index === undefined) return undefined;
  const n = Number(match[0]);
  if (!Number.isFinite(n) || n < 0) return undefined;
  const remainder = message.slice(match.index + match[0].length);
  const unit = remainder.match(WAIT_UNIT);
  if (!unit?.[1]) return undefined;
  const token = unit[1].toLowerCase();
  if (token === 'm' || token.startsWith('min')) return n * 60;
  return n;
}

export function extractErrorWaitSeconds(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;

  const fromRetryAfter = finiteNonNegativeSeconds(error.retry_after);
  if (fromRetryAfter !== undefined) return fromRetryAfter;

  if (isRecord(error.details)) {
    const fromDetails = finiteNonNegativeSeconds(error.details.retry_after);
    if (fromDetails !== undefined) return fromDetails;
  }

  // Legacy alias. Gameserver 0.601.6 never sent this field.
  const fromWaitSeconds = finiteNonNegativeSeconds(error.wait_seconds);
  if (fromWaitSeconds !== undefined) return fromWaitSeconds;

  if (error.code === 'ip_timed_out') return parseWaitSecondsFromMessage(error.message);
  return undefined;
}

export function isRateLimitAutoRetryWait(error: unknown): number | undefined {
  if (!isRecord(error) || error.code !== 'rate_limited') return undefined;
  const wait = extractErrorWaitSeconds(error);
  if (wait === undefined || wait > MAX_RATE_LIMIT_AUTO_RETRY_WAIT_SECONDS) return undefined;
  return wait;
}

export function extractRateLimitMeta(error: unknown): {
  limit?: string;
  scope?: string;
  pendingCommand?: string;
} {
  if (!isRecord(error)) return {};
  const details = isRecord(error.details) ? error.details : undefined;
  const limit = usableString(error.limit) ?? (details ? usableString(details.limit) : undefined);
  const scope = usableString(error.scope) ?? (details ? usableString(details.scope) : undefined);
  const pendingCommand =
    usableString(error.pending_command) ?? (details ? usableString(details.pending_command) : undefined);
  return {
    ...(limit ? { limit } : {}),
    ...(scope ? { scope } : {}),
    ...(pendingCommand ? { pendingCommand } : {}),
  };
}

function rewriteFlat429(
  data: Record<string, unknown>,
  retryAfterHeader: string | undefined,
  nowMs: number,
): APIResponse {
  const rest = omitKeys(data, ['error', ...FLAT_429_LIFTED]);
  const code = typeof data.error === 'string' ? data.error : '';
  const synth = {
    code,
    message: usableString(data.message) || code,
    retry_after: data.retry_after,
    wait_seconds: data.wait_seconds,
    details: isRecord(data.details) ? data.details : undefined,
  };
  const resolvedWait = extractErrorWaitSeconds(synth) ?? parseRetryAfterHeaderSeconds(retryAfterHeader, nowMs);
  const limit = usableString(data.limit);
  const scope = usableString(data.scope);
  const pendingCommand = usableString(data.pending_command);
  const details = isRecord(data.details) ? (data.details as NonNullable<APIResponse['error']>['details']) : undefined;
  return {
    ...rest,
    error: {
      code: synth.code,
      message: synth.message,
      ...(resolvedWait !== undefined ? { retry_after: resolvedWait } : {}),
      ...(limit ? { limit } : {}),
      ...(scope ? { scope } : {}),
      ...(pendingCommand ? { pending_command: pendingCommand } : {}),
      ...(details ? { details } : {}),
    },
  };
}

export function normalizeRateLimitError(
  data: APIResponse,
  options: { status: number; retryAfterHeader?: string; nowMs?: number },
): APIResponse {
  if (options.status === 503) return data;
  if (!isRecord(data) || !('error' in data)) return data;

  const nowMs = options.nowMs ?? Date.now();
  const rawError = (data as Record<string, unknown>).error;

  if (typeof rawError === 'string') {
    if (options.status !== 429) return data;
    if (isRecord(data.structuredContent)) return data;
    return rewriteFlat429(data as Record<string, unknown>, options.retryAfterHeader, nowMs);
  }

  if (!isRecord(rawError) || rawError.retry_after !== undefined) return data;

  const resolvedWait =
    extractErrorWaitSeconds(rawError) ?? parseRetryAfterHeaderSeconds(options.retryAfterHeader, nowMs);
  if (resolvedWait === undefined) return data;

  return {
    ...data,
    error: {
      ...(data.error as NonNullable<APIResponse['error']>),
      retry_after: resolvedWait,
    },
  };
}
