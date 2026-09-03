import { expect, test } from 'bun:test';
import { formatBoardingEvent } from './boarding-event.ts';

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

test('glosses only plundered', () => {
  expect(formatBoardingEvent('plundered')).toBe('plundered (cargo taken, hull left)');
  expect(formatBoardingEvent(' PLUNDERED ')).toBe('plundered (cargo taken, hull left)');
});

test('prints non-terminal tokens trimmed as-is', () => {
  expect(formatBoardingEvent('progress')).toBe('progress');
  expect(formatBoardingEvent('PROGRESS')).toBe('PROGRESS');
});

test('prints unknown tokens trimmed as-is', () => {
  expect(formatBoardingEvent('herald')).toBe('herald');
});
