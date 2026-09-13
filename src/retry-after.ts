import {
  DEFAULT_SERVICE_UNAVAILABLE_WAIT_SECONDS,
  MAX_SERVICE_UNAVAILABLE_RETRIES,
  MAX_SERVICE_UNAVAILABLE_WAIT_SECONDS,
  MIN_SERVICE_UNAVAILABLE_WAIT_SECONDS,
} from './runtime.ts';
import type { APIResponse, JsonResponse } from './types.ts';

const SERVICE_UNAVAILABLE_MESSAGE =
  'The authentication provider is temporarily unreachable. Wait and retry; do not change your password.';

export type ParsedRetryAfter = { kind: 'delta'; seconds: number } | { kind: 'date'; seconds: number };

/** Tagged parse so 503 and rate-limit wrappers can disagree on past dates and missing headers. */
export function parseRetryAfterHeaderRaw(
  header: string | null | undefined,
  nowMs: number,
): ParsedRetryAfter | undefined {
  const trimmed = header?.trim();
  if (!trimmed) return undefined;

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (!Number.isFinite(seconds) || seconds < 0) return undefined;
    return { kind: 'delta', seconds };
  }

  // "54.5" / "54s" are not HTTP-dates; Date.parse accepts some of them.
  if (/^\d/.test(trimmed)) return undefined;

  const dateMs = Date.parse(trimmed);
  if (!Number.isFinite(dateMs)) return undefined;
  return { kind: 'date', seconds: (dateMs - nowMs) / 1000 };
}

/** Wait seconds in [0, MAX], never NaN. `nowMs` is the injectable clock. */
export function retryAfterWaitSeconds(header: string | null | undefined, nowMs: number): number {
  const parsed = parseRetryAfterHeaderRaw(header, nowMs);
  if (!parsed) return DEFAULT_SERVICE_UNAVAILABLE_WAIT_SECONDS;
  if (parsed.kind === 'delta') {
    return Math.min(MAX_SERVICE_UNAVAILABLE_WAIT_SECONDS, Math.max(0, parsed.seconds));
  }
  if (parsed.seconds <= 0) return MIN_SERVICE_UNAVAILABLE_WAIT_SECONDS;
  return Math.min(MAX_SERVICE_UNAVAILABLE_WAIT_SECONDS, Math.max(MIN_SERVICE_UNAVAILABLE_WAIT_SECONDS, parsed.seconds));
}

export async function requestWithServiceUnavailableRetry(
  send: () => Promise<JsonResponse<APIResponse>>,
  opts: {
    sleep: (ms: number) => Promise<void>;
    now: () => number;
    warn?: (message: string) => void;
    onRetryWait?: (seconds: number) => void;
    maxRetries?: number;
  },
): Promise<JsonResponse<APIResponse>> {
  let retries = 0;
  while (true) {
    const response = await send();
    if (response.status !== 503) return response;
    if (retries >= (opts.maxRetries ?? MAX_SERVICE_UNAVAILABLE_RETRIES)) {
      return withExhaustedServiceUnavailable(response, opts.now());
    }
    retries += 1;
    const waitSeconds = retryAfterWaitSeconds(response.retryAfterHeader, opts.now());
    const waitCeil = Math.ceil(waitSeconds);
    opts.onRetryWait?.(waitCeil);
    opts.warn?.(`[UNAVAILABLE] Authentication provider unreachable. Waiting ${waitCeil} seconds before retry...`);
    await opts.sleep(waitCeil * 1000);
  }
}

export function withExhaustedServiceUnavailable(
  response: JsonResponse<APIResponse>,
  nowMs: number,
): JsonResponse<APIResponse> {
  const retryAfter = retryAfterWaitSeconds(response.retryAfterHeader, nowMs);
  const message = response.data.error?.message?.trim() || SERVICE_UNAVAILABLE_MESSAGE;
  return {
    ...response,
    data: {
      error: { code: 'service_unavailable', message, retry_after: retryAfter },
    },
  };
}
