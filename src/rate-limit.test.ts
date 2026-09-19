import { describe, expect, test } from 'bun:test';
import {
  extractErrorWaitSeconds,
  isRateLimitAutoRetryWait,
  normalizeRateLimitError,
  parseRetryAfterHeaderRaw,
  parseRetryAfterHeaderSeconds,
  parseWaitSecondsFromMessage,
} from './rate-limit.ts';
import type { APIResponse } from './types.ts';

const NOW_MS = Date.parse('Wed, 21 Oct 2015 07:28:00 GMT');

describe('parseWaitSecondsFromMessage', () => {
  test('binds the first integer only when a unit follows immediately', () => {
    expect(parseWaitSecondsFromMessage('IP timed out for 120 seconds')).toBe(120);
    expect(parseWaitSecondsFromMessage('timed out for 2 minutes')).toBe(120);
    expect(parseWaitSecondsFromMessage('timeout expires at 12:04:00Z')).toBeUndefined();
    expect(parseWaitSecondsFromMessage('until 12:04 UTC')).toBeUndefined();
    expect(parseWaitSecondsFromMessage('2–30 minutes')).toBeUndefined();
    expect(parseWaitSecondsFromMessage('2-30 minutes')).toBeUndefined();
  });
});

describe('parseRetryAfterHeaderSeconds', () => {
  test('parses integer deltas without a default or cap', () => {
    expect(parseRetryAfterHeaderSeconds('54', NOW_MS)).toBe(54);
    expect(parseRetryAfterHeaderSeconds('0', NOW_MS)).toBe(0);
    expect(parseRetryAfterHeaderSeconds('120', NOW_MS)).toBe(120);
    expect(parseRetryAfterHeaderSeconds('54.5', NOW_MS)).toBeUndefined();
    expect(parseRetryAfterHeaderSeconds('54s', NOW_MS)).toBeUndefined();
    expect(parseRetryAfterHeaderSeconds(undefined, NOW_MS)).toBeUndefined();
    expect(parseRetryAfterHeaderSeconds('   ', NOW_MS)).toBeUndefined();
  });

  test('HTTP-date waits are unclamped; past or equal dates are 0', () => {
    expect(parseRetryAfterHeaderSeconds('Wed, 21 Oct 2015 07:28:12 GMT', NOW_MS)).toBe(12);
    expect(parseRetryAfterHeaderSeconds('Wed, 21 Oct 2015 07:29:00 GMT', NOW_MS)).toBe(60);
    expect(parseRetryAfterHeaderSeconds('Wed, 21 Oct 2015 07:28:00 GMT', NOW_MS)).toBe(0);
    expect(parseRetryAfterHeaderSeconds('Wed, 21 Oct 2015 07:27:00 GMT', NOW_MS)).toBe(0);
  });
});

describe('parseRetryAfterHeaderRaw', () => {
  test('tags integer deltas and HTTP-dates without applying wrapper policy', () => {
    expect(parseRetryAfterHeaderRaw('0', NOW_MS)).toEqual({ kind: 'delta', seconds: 0 });
    expect(parseRetryAfterHeaderRaw('54', NOW_MS)).toEqual({ kind: 'delta', seconds: 54 });
    expect(parseRetryAfterHeaderRaw('Wed, 21 Oct 2015 07:28:12 GMT', NOW_MS)).toEqual({
      kind: 'date',
      seconds: 12,
    });
    expect(parseRetryAfterHeaderRaw('Wed, 21 Oct 2015 07:28:00 GMT', NOW_MS)).toEqual({
      kind: 'date',
      seconds: 0,
    });
    expect(parseRetryAfterHeaderRaw('54.5', NOW_MS)).toBeUndefined();
    expect(parseRetryAfterHeaderRaw(undefined, NOW_MS)).toBeUndefined();
  });
});

describe('extractErrorWaitSeconds', () => {
  test('reads envelope retry_after, then details.retry_after, then wait_seconds', () => {
    expect(extractErrorWaitSeconds({ code: 'rate_limited', message: 'slow down', retry_after: 54 })).toBe(54);
    expect(
      extractErrorWaitSeconds({
        code: 'rate_limited',
        message: 'slow down',
        details: { retry_after: 12 },
      }),
    ).toBe(12);
    expect(extractErrorWaitSeconds({ code: 'rate_limited', message: 'slow down', wait_seconds: 3.5 })).toBe(3.5);
  });

  test('has no header argument and ignores header-only waits', () => {
    expect(extractErrorWaitSeconds({ code: 'rate_limited', message: 'slow down' })).toBeUndefined();
  });

  test('prefers details.retry_after on ip_timed_out over a conflicting integer-plus-unit message', () => {
    expect(
      extractErrorWaitSeconds({
        code: 'ip_timed_out',
        message: 'IP timed out for 999 seconds',
        details: { retry_after: 120 },
      }),
    ).toBe(120);
  });

  test('prefers envelope retry_after over details.retry_after on ip_timed_out', () => {
    expect(
      extractErrorWaitSeconds({
        code: 'ip_timed_out',
        message: 'IP timed out for 999 seconds',
        retry_after: 54,
        details: { retry_after: 120 },
      }),
    ).toBe(54);
  });

  test('falls back to the ip_timed_out message when no structured wait is present', () => {
    expect(
      extractErrorWaitSeconds({
        code: 'ip_timed_out',
        message: 'IP timed out for 120 seconds',
      }),
    ).toBe(120);
    expect(
      extractErrorWaitSeconds({
        code: 'rate_limited',
        message: 'IP timed out for 120 seconds',
      }),
    ).toBeUndefined();
  });
});

describe('isRateLimitAutoRetryWait', () => {
  test('allows rate_limited waits in [0, 60] only', () => {
    expect(isRateLimitAutoRetryWait({ code: 'rate_limited', message: 'slow down', retry_after: 0 })).toBe(0);
    expect(isRateLimitAutoRetryWait({ code: 'rate_limited', message: 'slow down', retry_after: 60 })).toBe(60);
    expect(isRateLimitAutoRetryWait({ code: 'rate_limited', message: 'slow down', retry_after: 61 })).toBeUndefined();
    expect(isRateLimitAutoRetryWait({ code: 'action_pending', message: 'queued', retry_after: 5 })).toBeUndefined();
    expect(
      isRateLimitAutoRetryWait({
        code: 'ip_timed_out',
        message: 'IP timed out for 120 seconds',
        retry_after: 30,
      }),
    ).toBeUndefined();
    expect(
      isRateLimitAutoRetryWait({
        code: 'ip_timed_out',
        message: 'This IP is temporarily blocked.',
        details: { retry_after: 30 },
      }),
    ).toBeUndefined();
  });
});

describe('normalizeRateLimitError', () => {
  test('copies envelope retry_after, details.retry_after, and header-only integer Retry-After', () => {
    expect(
      normalizeRateLimitError(
        { error: { code: 'rate_limited', message: 'slow down', retry_after: 54 } },
        { status: 200 },
      ).error,
    ).toEqual({ code: 'rate_limited', message: 'slow down', retry_after: 54 });

    expect(
      normalizeRateLimitError(
        { error: { code: 'rate_limited', message: 'slow down', details: { retry_after: 12 } } },
        { status: 200 },
      ).error,
    ).toEqual({
      code: 'rate_limited',
      message: 'slow down',
      details: { retry_after: 12 },
      retry_after: 12,
    });

    expect(
      normalizeRateLimitError(
        { error: { code: 'rate_limited', message: 'slow down' } },
        { status: 429, retryAfterHeader: '54' },
      ).error,
    ).toEqual({ code: 'rate_limited', message: 'slow down', retry_after: 54 });
  });

  test('rewrites a flat 429 body into a clean object envelope', () => {
    const normalized = normalizeRateLimitError(
      {
        error: 'rate_limited',
        message: 'Too many requests in the current window',
        retry_after: 54,
        limit: 'game_query',
        scope: 'per_session',
      } as unknown as APIResponse,
      { status: 429 },
    );
    expect(normalized).toEqual({
      error: {
        code: 'rate_limited',
        message: 'Too many requests in the current window',
        retry_after: 54,
        limit: 'game_query',
        scope: 'per_session',
      },
    });

    const serialized = JSON.parse(JSON.stringify(normalized)) as Record<string, unknown>;
    expect(serialized.error).toEqual({
      code: 'rate_limited',
      message: 'Too many requests in the current window',
      retry_after: 54,
      limit: 'game_query',
      scope: 'per_session',
    });
    expect(typeof serialized.error).toBe('object');
    expect(serialized).not.toHaveProperty('limit');
    expect(serialized).not.toHaveProperty('message');
    expect(serialized).not.toHaveProperty('retry_after');
  });

  test('is idempotent after hydrating an envelope', () => {
    const once = normalizeRateLimitError(
      {
        error: 'rate_limited',
        message: 'Too many requests in the current window',
        retry_after: 54,
        limit: 'game_query',
        scope: 'per_session',
      } as unknown as APIResponse,
      { status: 429 },
    );
    const twice = normalizeRateLimitError(once, { status: 429 });
    expect(twice).toEqual(once);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  test('leaves JSON 503 bodies byte-equal even with Retry-After', () => {
    const body = { error: { code: 'provider_down', message: 'auth provider timeout' } };
    const result = normalizeRateLimitError(body, { status: 503, retryAfterHeader: '12' });
    expect(result).toBe(body);
    expect(JSON.stringify(result)).toBe(JSON.stringify(body));
  });

  test('does not rewrite status 200 with a string error', () => {
    const body = { error: 'not_an_api_error', message: 'still success payload' } as unknown as APIResponse;
    const result = normalizeRateLimitError(body, { status: 200 });
    expect(result).toBe(body);
  });

  test('leaves wait_seconds 3.5 usable', () => {
    expect(extractErrorWaitSeconds({ code: 'rate_limited', message: 'slow down', wait_seconds: 3.5 })).toBe(3.5);
    expect(
      normalizeRateLimitError(
        { error: { code: 'rate_limited', message: 'slow down', wait_seconds: 3.5 } },
        { status: 200 },
      ).error?.retry_after,
    ).toBe(3.5);
  });

  test('hydrates ip_timed_out message waits on a flat 429 with no header', () => {
    const normalized = normalizeRateLimitError(
      { error: 'ip_timed_out', message: 'IP timed out for 120 seconds' } as unknown as APIResponse,
      { status: 429 },
    );
    expect(normalized.error).toEqual({
      code: 'ip_timed_out',
      message: 'IP timed out for 120 seconds',
      retry_after: 120,
    });
  });

  test('hydrates ip_timed_out object envelope retry_after from details without dropping nested limit/scope', () => {
    const normalized = normalizeRateLimitError(
      {
        error: {
          code: 'ip_timed_out',
          message: 'This IP is temporarily blocked.',
          details: { retry_after: 120, limit: 'ip_timeout', scope: 'per_ip' },
        },
      },
      { status: 429 },
    );
    expect(normalized.error).toEqual({
      code: 'ip_timed_out',
      message: 'This IP is temporarily blocked.',
      retry_after: 120,
      details: { retry_after: 120, limit: 'ip_timeout', scope: 'per_ip' },
    });
    expect(normalized.error).not.toHaveProperty('limit');
    expect(normalized.error).not.toHaveProperty('scope');
  });

  test('hydrates ip_timed_out details on a flat 429 without lifting nested limit/scope', () => {
    const normalized = normalizeRateLimitError(
      {
        error: 'ip_timed_out',
        message: 'This IP is temporarily blocked.',
        details: { retry_after: 120, limit: 'ip_timeout', scope: 'per_ip' },
      } as unknown as APIResponse,
      { status: 429 },
    );
    expect(normalized.error).toEqual({
      code: 'ip_timed_out',
      message: 'This IP is temporarily blocked.',
      retry_after: 120,
      details: { retry_after: 120, limit: 'ip_timeout', scope: 'per_ip' },
    });
    expect(normalized.error).not.toHaveProperty('limit');
    expect(normalized.error).not.toHaveProperty('scope');
  });

  test('no-ops when the body has no error field', () => {
    const body = { ok: true } as unknown as APIResponse;
    const result = normalizeRateLimitError(body, { status: 200, retryAfterHeader: '8' });
    expect(result).toBe(body);
  });
});
