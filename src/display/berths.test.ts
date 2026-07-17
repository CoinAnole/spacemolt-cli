import { expect, test } from 'bun:test';
import { formatBerthSummary } from './berths.ts';

test('formats canonical berth classes in stable order', () => {
  expect(
    formatBerthSummary({
      first: { total: 1, free: 0 },
      economy: { total: 12, free: 10 },
      business: { total: 2, free: 2 },
    }),
  ).toBe('Economy: 10/12 free | Business: 2/2 free | First: 0/1 free');
});

test('preserves zero-capacity classes and rejects malformed entries', () => {
  expect(formatBerthSummary({ economy: { total: 0, free: 0 } })).toBe('Economy: 0/0 free');
  expect(formatBerthSummary({ economy: { total: '12', free: undefined } })).toBeUndefined();
  expect(formatBerthSummary(undefined)).toBeUndefined();
});
