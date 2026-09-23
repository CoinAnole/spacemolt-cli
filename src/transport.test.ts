import { afterEach, describe, expect, test } from 'bun:test';
import { UnsafeIntegerSourceError } from './json-number.ts';
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

  test('hydrates an integer Retry-After onto a 429 object error', async () => {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ error: { code: 'rate_limited', message: 'slow down' } }), {
        status: 429,
        headers: { 'content-type': 'application/json', 'Retry-After': '54' },
      });
    }) as unknown as typeof fetch;

    const response = await requestJson('https://example.test/api');

    expect(response.status).toBe(429);
    expect(response.retryAfterHeader).toBe('54');
    expect(response.data.error).toEqual({
      code: 'rate_limited',
      message: 'slow down',
      retry_after: 54,
    });
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

  test('preserves integers above 2^53 from a JSON body', async () => {
    const raw = '{"structuredContent":{"credits":9007199254740993,"fuel":40}}';
    globalThis.fetch = (async () => {
      return new Response(raw, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const response = await requestJson('https://example.test/api');
    const credits = response.data.structuredContent?.credits;

    expect(credits).toBe(9007199254740993n);
    expect(String(credits)).toBe('9007199254740993');
    expect(String(credits)).not.toBe('9007199254740992');
    expect(response.data.structuredContent?.fuel).toBe(40);
  });

  test('re-emits bigint request payload digits', async () => {
    const calls: Array<{ init?: RequestInit }> = [];
    globalThis.fetch = (async (_url, init) => {
      calls.push({ init });
      return new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    await requestJson('https://example.test/api', {
      method: 'POST',
      payload: { base_reward: 9007199254740993n },
    });

    expect(calls[0]?.init?.body).toBe('{"base_reward":9007199254740993}');
    expect(String(calls[0]?.init?.body)).not.toContain('9007199254740992');
  });

  test('rethrows UnsafeIntegerSourceError without rewriting the message', async () => {
    const originalParse = JSON.parse;
    JSON.parse = ((text: string, reviver?: (this: unknown, key: string, value: unknown) => unknown) => {
      if (!reviver) return originalParse(text);
      return originalParse(text, function (this: unknown, key, value) {
        return reviver.call(this, key, value);
      });
    }) as typeof JSON.parse;

    globalThis.fetch = (async () => {
      return new Response('{"structuredContent":{"credits":9007199254740993,"fuel":40}}', {
        status: 503,
        headers: { 'content-type': 'application/json', 'Retry-After': '4' },
      });
    }) as unknown as typeof fetch;

    const message =
      'JSON parser did not provide number source text; refusing to round an integer outside the safe range.';
    let thrown: unknown;
    try {
      await requestJson('https://example.test/api');
    } catch (err) {
      thrown = err;
    } finally {
      JSON.parse = originalParse;
    }

    expect(thrown).toBeInstanceOf(UnsafeIntegerSourceError);
    expect(thrown).toBeInstanceOf(Error);
    if (!(thrown instanceof Error)) throw new Error('expected UnsafeIntegerSourceError');
    expect(thrown.message).toBe(message);
    expect(thrown.message).not.toContain('Server returned invalid JSON response');
  });
});
