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
      'X-Session-Id': 'sess_123',
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
});
