import { describe, expect, test } from 'bun:test';
import { retryAfterWaitSeconds } from './retry-after.ts';

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
