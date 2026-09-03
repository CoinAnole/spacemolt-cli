import { expect, test } from 'bun:test';
import { normalizeCaptorKind } from './captor-kind.ts';

test('omits non-strings', () => {
  expect(normalizeCaptorKind(undefined)).toBeUndefined();
  expect(normalizeCaptorKind(null)).toBeUndefined();
  expect(normalizeCaptorKind(1)).toBeUndefined();
  expect(normalizeCaptorKind(true)).toBeUndefined();
  expect(normalizeCaptorKind({ kind: 'player' })).toBeUndefined();
  expect(normalizeCaptorKind(['player'])).toBeUndefined();
});

test('omits empty and whitespace strings', () => {
  expect(normalizeCaptorKind('')).toBeUndefined();
  expect(normalizeCaptorKind('   ')).toBeUndefined();
});

test('canonicalizes known tokens case-insensitively', () => {
  expect(normalizeCaptorKind('PLAYER')).toBe('player');
  expect(normalizeCaptorKind(' Pirate ')).toBe('pirate');
  expect(normalizeCaptorKind('npc')).toBe('npc');
});

test('prints unknown tokens trimmed as-is', () => {
  expect(normalizeCaptorKind('herald')).toBe('herald');
});
