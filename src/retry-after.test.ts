import { describe, expect, test } from 'bun:test';
import { requestWithServiceUnavailableRetry, retryAfterWaitSeconds } from './retry-after.ts';

const NOW_MS = Date.parse('Wed, 21 Oct 2015 07:28:00 GMT');

describe('retryAfterWaitSeconds', () => {
  test('missing, empty, and unparsable headers default to 5 seconds', () => {
    expect(retryAfterWaitSeconds(undefined, NOW_MS)).toBe(5);
    expect(retryAfterWaitSeconds(null, NOW_MS)).toBe(5);
    expect(retryAfterWaitSeconds('', NOW_MS)).toBe(5);
    expect(retryAfterWaitSeconds('   ', NOW_MS)).toBe(5);
    expect(retryAfterWaitSeconds('not-a-date', NOW_MS)).toBe(5);
  });

  test('delta-seconds parse as integers with an explicit 0 and a 30s cap', () => {
    expect(retryAfterWaitSeconds('12', NOW_MS)).toBe(12);
    expect(retryAfterWaitSeconds('0', NOW_MS)).toBe(0);
    expect(retryAfterWaitSeconds('120', NOW_MS)).toBe(30);
  });

  test('leading and trailing whitespace on delta-seconds is ignored', () => {
    expect(retryAfterWaitSeconds('  12  ', NOW_MS)).toBe(12);
    expect(retryAfterWaitSeconds('\t0\n', NOW_MS)).toBe(0);
  });

  test('HTTP-date in the future uses a clamped delta', () => {
    expect(retryAfterWaitSeconds('Wed, 21 Oct 2015 07:28:12 GMT', NOW_MS)).toBe(12);
    expect(retryAfterWaitSeconds('Wed, 21 Oct 2015 07:29:00 GMT', NOW_MS)).toBe(30);
  });

  test('HTTP-date in the past or equal to nowMs floors to 1 second, not 0', () => {
    expect(retryAfterWaitSeconds('Wed, 21 Oct 2015 07:28:00 GMT', NOW_MS)).toBe(1);
    expect(retryAfterWaitSeconds('Wed, 21 Oct 2015 07:27:00 GMT', NOW_MS)).toBe(1);
  });
});

describe('requestWithServiceUnavailableRetry', () => {
  test('retries one 503 then returns the successful response', async () => {
    const sleeps: number[] = [];
    const warnings: string[] = [];
    let calls = 0;
    const result = await requestWithServiceUnavailableRetry(
      async () => {
        calls += 1;
        if (calls === 1) {
          return {
            status: 503,
            ok: false,
            retryAfterHeader: '2',
            data: { error: { code: 'service_unavailable', message: 'down' } },
          };
        }
        return { status: 200, ok: true, data: { structuredContent: { ok: true } } };
      },
      {
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        now: () => NOW_MS,
        warn: (message) => {
          warnings.push(message);
        },
      },
    );

    expect(result.status).toBe(200);
    expect(calls).toBe(2);
    expect(sleeps).toEqual([2000]);
    expect(warnings).toEqual(['[UNAVAILABLE] Authentication provider unreachable. Waiting 2 seconds before retry...']);
  });

  test('exhausts after four 503s and attaches numeric retry_after', async () => {
    let calls = 0;
    const result = await requestWithServiceUnavailableRetry(
      async () => {
        calls += 1;
        return {
          status: 503,
          ok: false,
          retryAfterHeader: '8',
          data: { error: { code: 'invalid_credentials', message: 'invalid token' } },
        };
      },
      {
        sleep: async () => {},
        now: () => NOW_MS,
      },
    );

    expect(calls).toBe(4);
    expect(result.status).toBe(503);
    expect(result.data.error).toEqual({
      code: 'service_unavailable',
      message: 'invalid token',
      retry_after: 8,
    });
  });
});
