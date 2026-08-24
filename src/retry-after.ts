import {
  DEFAULT_SERVICE_UNAVAILABLE_WAIT_SECONDS,
  MAX_SERVICE_UNAVAILABLE_WAIT_SECONDS,
  MIN_SERVICE_UNAVAILABLE_WAIT_SECONDS,
} from './runtime.ts';

/** Wait seconds in [0, MAX], never NaN. `nowMs` is the injectable clock. */
export function retryAfterWaitSeconds(header: string | null | undefined, nowMs: number): number {
  const trimmed = header?.trim();
  if (!trimmed) return DEFAULT_SERVICE_UNAVAILABLE_WAIT_SECONDS;

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (!Number.isFinite(seconds)) return DEFAULT_SERVICE_UNAVAILABLE_WAIT_SECONDS;
    return Math.min(MAX_SERVICE_UNAVAILABLE_WAIT_SECONDS, Math.max(0, seconds));
  }

  const dateMs = Date.parse(trimmed);
  if (!Number.isFinite(dateMs)) return DEFAULT_SERVICE_UNAVAILABLE_WAIT_SECONDS;

  const raw = (dateMs - nowMs) / 1000;
  if (raw <= 0) return MIN_SERVICE_UNAVAILABLE_WAIT_SECONDS;
  return Math.min(MAX_SERVICE_UNAVAILABLE_WAIT_SECONDS, Math.max(MIN_SERVICE_UNAVAILABLE_WAIT_SECONDS, raw));
}
