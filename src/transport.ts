import { DEFAULT_USER_AGENT, FETCH_TIMEOUT_MS } from './runtime.ts';
import type { APIResponse, JsonRequestOptions, JsonResponse } from './types.ts';

const SERVICE_UNAVAILABLE_MESSAGE =
  'The authentication provider is temporarily unreachable. Wait and retry; do not change your password.';

function withRetryAfterHeader<T>(response: JsonResponse<T>, retryAfterHeader: string | undefined): JsonResponse<T> {
  return retryAfterHeader === undefined ? response : { ...response, retryAfterHeader };
}

function synthesizedServiceUnavailable<T>(retryAfterHeader: string | undefined): JsonResponse<T> {
  return withRetryAfterHeader(
    {
      status: 503,
      ok: false,
      data: {
        error: {
          code: 'service_unavailable',
          message: SERVICE_UNAVAILABLE_MESSAGE,
        },
      } as T,
    },
    retryAfterHeader,
  );
}

export async function requestJson<T = APIResponse>(
  url: string,
  options: JsonRequestOptions = {},
): Promise<JsonResponse<T>> {
  const method = options.method || 'GET';
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const headers: Record<string, string> = {
    'Accept-Encoding': 'gzip',
    'User-Agent': options.userAgent ?? DEFAULT_USER_AGENT,
    ...options.headers,
  };

  if (options.sessionId) headers['X-Session-Id'] = options.sessionId;
  if (options.payload !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.payload !== undefined ? JSON.stringify(options.payload) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error(
        `Request timed out after ${timeoutMs / 1000}s. The server may be under load or the action is taking unusually long.`,
      );
    }
    throw err;
  }

  const retryAfterHeader = response.headers.get('Retry-After') ?? undefined;
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    if (response.status === 503) {
      await response.text();
      return synthesizedServiceUnavailable(retryAfterHeader);
    }
    throw new Error(`Server returned non-JSON response (${response.status}): ${await response.text()}`);
  }

  try {
    return withRetryAfterHeader(
      { status: response.status, ok: response.ok, data: (await response.json()) as T },
      retryAfterHeader,
    );
  } catch {
    if (response.status === 503) return synthesizedServiceUnavailable(retryAfterHeader);
    throw new Error(`Server returned invalid JSON response (${response.status})`);
  }
}
