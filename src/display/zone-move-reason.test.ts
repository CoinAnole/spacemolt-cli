import { expect, test } from 'bun:test';
import { formatZoneMoveReason } from './zone-move-reason.ts';

test('omits non-strings', () => {
  expect(formatZoneMoveReason(undefined)).toBeUndefined();
  expect(formatZoneMoveReason(null)).toBeUndefined();
  expect(formatZoneMoveReason(1)).toBeUndefined();
  expect(formatZoneMoveReason(true)).toBeUndefined();
  expect(formatZoneMoveReason({ reason: 'retreat_intercepted' })).toBeUndefined();
  expect(formatZoneMoveReason(['retreat_intercepted'])).toBeUndefined();
});

test('omits empty and whitespace strings', () => {
  expect(formatZoneMoveReason('')).toBeUndefined();
  expect(formatZoneMoveReason('   ')).toBeUndefined();
});

test('glosses retreat_intercepted case-insensitively', () => {
  expect(formatZoneMoveReason('retreat_intercepted')).toBe('retreat_intercepted (retreat cancelled by interceptor)');
  expect(formatZoneMoveReason(' RETREAT_INTERCEPTED ')).toBe('retreat_intercepted (retreat cancelled by interceptor)');
});

test('prints other reasons trimmed as-is', () => {
  expect(formatZoneMoveReason('pulled_closer')).toBe('pulled_closer');
  expect(formatZoneMoveReason('PULLED_CLOSER')).toBe('PULLED_CLOSER');
  expect(formatZoneMoveReason('herald')).toBe('herald');
});
