import { afterEach, describe, expect, test } from 'bun:test';
import { requestJson } from './transport.ts';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('requestJson', () => {
  test('serializes payloads and session headers', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const response = await requestJson<{ ok: boolean }>('https://example.test/api', {
      method: 'POST',
      sessionId: 'sess_123',
      payload: { item_id: 'ore_iron', quantity: 2 },
    });

    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
    expect(response.data).toEqual({ ok: true });
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ item_id: 'ore_iron', quantity: 2 }));
    expect(calls[0]?.init?.headers).toMatchObject({
      'Accept-Encoding': 'gzip',
      'Content-Type': 'application/json',
      'User-Agent': expect.stringMatching(/^SpaceMolt-Client\/\d+\.\d+\.\d+$/),
      'X-Session-Id': 'sess_123',
    });
  });

  test('uses a configured user agent when provided', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    await requestJson('https://example.test/api', {
      userAgent: 'ENDL-TradeBot/1.0',
    });

    expect(calls[0]?.init?.headers).toMatchObject({
      'Accept-Encoding': 'gzip',
      'User-Agent': 'ENDL-TradeBot/1.0',
    });
  });

  test('converts timeout errors to CLI-friendly messages', async () => {
    globalThis.fetch = (async () => {
      const err = new Error('timed out');
      err.name = 'TimeoutError';
      throw err;
    }) as unknown as typeof fetch;

    await expect(requestJson('https://example.test/api', { timeoutMs: 1000 })).rejects.toThrow(
      'Request timed out after 1s',
    );
  });

  test('rejects non-JSON responses with status and body', async () => {
    globalThis.fetch = (async () => {
      return new Response('not found', {
        status: 404,
        headers: { 'content-type': 'text/plain' },
      });
    }) as unknown as typeof fetch;

    await expect(requestJson('https://example.test/api')).rejects.toThrow(
      'Server returned non-JSON response (404): not found',
    );
  });

  test('rejects invalid JSON responses', async () => {
    globalThis.fetch = (async () => {
      return new Response('{bad json', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    await expect(requestJson('https://example.test/api')).rejects.toThrow(
      'Server returned invalid JSON response (200)',
    );
  });

  test('exposes Retry-After on JSON 200 without rewriting the body', async () => {
    globalThis.fetch = (async () => {
      return new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json', 'Retry-After': '8' },
      });
    }) as unknown as typeof fetch;

    const response = await requestJson<{ ok: boolean }>('https://example.test/api');

    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
    expect(response.data).toEqual({ ok: true });
    expect(response.retryAfterHeader).toBe('8');
  });

  test('returns JSON 503 with the raw Retry-After header and does not rewrite data.error', async () => {
    const body = { error: { code: 'provider_down', message: 'auth provider timeout' } };
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify(body), {
        status: 503,
        headers: { 'content-type': 'application/json', 'Retry-After': '12' },
      });
    }) as unknown as typeof fetch;

    const response = await requestJson('https://example.test/api');

    expect(response.status).toBe(503);
    expect(response.ok).toBe(false);
    expect(response.retryAfterHeader).toBe('12');
    expect(response.data).toEqual(body);
  });

  test('synthesizes service_unavailable for text/plain 503 without stuffing retry_after', async () => {
    globalThis.fetch = (async () => {
      return new Response('service down', {
        status: 503,
        headers: { 'content-type': 'text/plain', 'Retry-After': '8' },
      });
    }) as unknown as typeof fetch;

    const response = await requestJson('https://example.test/api');

    expect(response.status).toBe(503);
    expect(response.ok).toBe(false);
    expect(response.retryAfterHeader).toBe('8');
    expect(response.data).toEqual({
      error: {
        code: 'service_unavailable',
        message: 'The authentication provider is temporarily unreachable. Wait and retry; do not change your password.',
      },
    });
    expect(response.data.error).not.toHaveProperty('retry_after');
  });

  test('synthesizes service_unavailable for invalid JSON 503 without throwing', async () => {
    globalThis.fetch = (async () => {
      return new Response('{bad json', {
        status: 503,
        headers: { 'content-type': 'application/json', 'Retry-After': '4' },
      });
    }) as unknown as typeof fetch;

    const response = await requestJson('https://example.test/api');

    expect(response.status).toBe(503);
    expect(response.ok).toBe(false);
    expect(response.retryAfterHeader).toBe('4');
    expect(response.data.error?.code).toBe('service_unavailable');
    expect(response.data.error).not.toHaveProperty('retry_after');
  });
});
