import {
  DEFAULT_SERVICE_UNAVAILABLE_WAIT_SECONDS,
  MAX_SERVICE_UNAVAILABLE_RETRIES,
  MAX_SERVICE_UNAVAILABLE_WAIT_SECONDS,
  MIN_SERVICE_UNAVAILABLE_WAIT_SECONDS,
} from './runtime.ts';
import type { APIResponse, JsonResponse } from './types.ts';

const SERVICE_UNAVAILABLE_MESSAGE =
  'The authentication provider is temporarily unreachable. Wait and retry; do not change your password.';

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

export async function requestWithServiceUnavailableRetry(
  send: () => Promise<JsonResponse<APIResponse>>,
  opts: {
    sleep: (ms: number) => Promise<void>;
    now: () => number;
    warn?: (message: string) => void; // omitted when jsonOutput
    maxRetries?: number; // MAX_SERVICE_UNAVAILABLE_RETRIES
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
    opts.warn?.(
      `[UNAVAILABLE] Authentication provider unreachable. Waiting ${Math.ceil(waitSeconds)} seconds before retry...`,
    );
    await opts.sleep(Math.ceil(waitSeconds) * 1000);
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
