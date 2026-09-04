import { expect, test } from 'bun:test';
import { formatBoardingEvent, formatBoardingReason } from './boarding-event.ts';

test('omits non-strings', () => {
  expect(formatBoardingEvent(undefined)).toBeUndefined();
  expect(formatBoardingEvent(null)).toBeUndefined();
  expect(formatBoardingEvent(1)).toBeUndefined();
  expect(formatBoardingEvent(true)).toBeUndefined();
  expect(formatBoardingEvent({ event: 'plundered' })).toBeUndefined();
  expect(formatBoardingEvent(['plundered'])).toBeUndefined();
});

test('omits empty and whitespace strings', () => {
  expect(formatBoardingEvent('')).toBeUndefined();
  expect(formatBoardingEvent('   ')).toBeUndefined();
});

test('canonicalizes known terminal tokens case-insensitively', () => {
  expect(formatBoardingEvent('CAPTURE_READY')).toBe('capture_ready');
  expect(formatBoardingEvent(' Withdrawn ')).toBe('withdrawn');
  expect(formatBoardingEvent('attacker_destroyed')).toBe('attacker_destroyed');
  expect(formatBoardingEvent('ATTACKER_INCAPACITATED')).toBe('attacker_incapacitated');
  expect(formatBoardingEvent('target_destroyed')).toBe('target_destroyed');
  expect(formatBoardingEvent('target_self_destructed')).toBe('target_self_destructed');
  expect(formatBoardingEvent('restart_canceled')).toBe('restart_canceled');
});

test('glosses plundered and boarding_rejected', () => {
  expect(formatBoardingEvent('plundered')).toBe('plundered (cargo taken, hull left)');
  expect(formatBoardingEvent(' PLUNDERED ')).toBe('plundered (cargo taken, hull left)');
  expect(formatBoardingEvent('boarding_rejected')).toBe('boarding_rejected (attempt refused; see Reason)');
  expect(formatBoardingEvent(' BOARDING_REJECTED ')).toBe('BOARDING_REJECTED (attempt refused; see Reason)');
});

test('formatBoardingReason omits non-strings', () => {
  expect(formatBoardingReason(undefined)).toBeUndefined();
  expect(formatBoardingReason(null)).toBeUndefined();
  expect(formatBoardingReason(1)).toBeUndefined();
  expect(formatBoardingReason(true)).toBeUndefined();
  expect(formatBoardingReason({ reason: 'closing_stalled' })).toBeUndefined();
});

test('formatBoardingReason omits empty and whitespace strings', () => {
  expect(formatBoardingReason('')).toBeUndefined();
  expect(formatBoardingReason('   ')).toBeUndefined();
});

test('formatBoardingReason glosses closing_stalled and boarding_locked', () => {
  expect(formatBoardingReason('closing_stalled')).toBe(
    'closing_stalled (latch made no progress; withdrawn so the battle can end)',
  );
  expect(formatBoardingReason(' CLOSING_STALLED ')).toBe(
    'closing_stalled (latch made no progress; withdrawn so the battle can end)',
  );
  expect(formatBoardingReason('boarding_locked')).toBe(
    'boarding_locked (marines attached; flee, emergency warp/jump and cloak wait)',
  );
});

test('formatBoardingReason prints other reasons trimmed as-is', () => {
  expect(formatBoardingReason('target_not_boardable')).toBe('target_not_boardable');
  expect(formatBoardingReason('TARGET_NOT_BOARDABLE')).toBe('TARGET_NOT_BOARDABLE');
});

test('prints non-terminal tokens trimmed as-is', () => {
  expect(formatBoardingEvent('progress')).toBe('progress');
  expect(formatBoardingEvent('PROGRESS')).toBe('PROGRESS');
});

test('prints unknown tokens trimmed as-is', () => {
  expect(formatBoardingEvent('herald')).toBe('herald');
});
