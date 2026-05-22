import { FETCH_TIMEOUT_MS, VERSION } from './runtime.ts';
import type { APIResponse, JsonRequestOptions, JsonResponse } from './types.ts';

export async function requestJson<T = APIResponse>(
  url: string,
  options: JsonRequestOptions = {},
): Promise<JsonResponse<T>> {
  const method = options.method || 'GET';
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const headers: Record<string, string> = {
    'Accept-Encoding': 'gzip',
    'User-Agent': `SpaceMolt-Client/${VERSION}`,
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

  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    throw new Error(`Server returned non-JSON response (${response.status}): ${await response.text()}`);
  }

  try {
    return { status: response.status, ok: response.ok, data: (await response.json()) as T };
  } catch {
    throw new Error(`Server returned invalid JSON response (${response.status})`);
  }
}
