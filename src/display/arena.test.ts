import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import {
  arenaAcceptDetails,
  arenaAcceptFixture,
  arenaCancelFixture,
  arenaChallengeFixture,
  arenaDeclineFixture,
  arenaStatusIdleFixture,
  arenaStatusInBattleFixture,
  arenaStatusIncomingFixture,
} from './arena.fixtures.ts';
import { formatArenaSideSize } from './arena.ts';
import { renderStructuredResult } from './index.ts';

const options: GlobalOptions = {
  args: [],
  json: false,
  quiet: false,
  plain: true,
  allowUnknown: false,
  dryRun: false,
  noTimestamp: true,
  compact: false,
};

const context = {
  clock: {
    now() {
      return new Date('2026-09-04T00:00:00.000Z');
    },
  },
  output: {
    json: false,
    quiet: false,
    plain: true,
    format: 'table' as const,
    compact: false,
  },
};

function output(command: string, fixture: Record<string, unknown>): string {
  return renderStructuredResult(command, structuredClone(fixture), options, context).stdout.join('\n');
}

test('formatArenaSideSize uses the shared lobby vocabulary', () => {
  expect(formatArenaSideSize(0)).toBe('full fleet (every eligible member)');
  expect(formatArenaSideSize(1)).toBe('solo duel');
  expect(formatArenaSideSize(3)).toBe('up to 3 ships per side');
  expect(formatArenaSideSize(Number.NaN)).toBe('');
});

test('renders an idle arena lobby without the raw response fallback', () => {
  const stdout = output('arena_status', arenaStatusIdleFixture);
  expect(stdout).toContain('=== Arena ===');
  expect(stdout).toContain('At arena POI: yes');
  expect(stdout).toContain('Record: 3 wins / 1 loss / 7 knockouts');
  expect(stdout).toContain('Arena XP today (cap 500 per skill)');
  expect(stdout).toContain('none today');
  expect(stdout).not.toContain('Incoming challenge');
  expect(stdout).not.toContain('In battle');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders incoming challenge and XP remaining with deterministic skill sort', () => {
  const stdout = output('arena_status', arenaStatusIncomingFixture);
  expect(stdout).toContain('Incoming challenge from Kestrel (player-77)');
  expect(stdout).toContain('Side size: solo duel');
  expect(stdout).toContain('Expires: tick 41200');
  expect(stdout).toContain('Answer with: arena accept | arena decline');
  expect(stdout).toContain('Remaining');
  const gunnery = stdout.indexOf('gunnery');
  const shields = stdout.indexOf('shields');
  expect(gunnery).toBeGreaterThan(-1);
  expect(shields).toBeGreaterThan(gunnery);
  expect(stdout).toContain('380');
  expect(stdout).toContain('460');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders an in-battle lobby when the pilot has left the arena POI', () => {
  const stdout = output('arena_status', arenaStatusInBattleFixture);
  expect(stdout).toContain('At arena POI: no');
  expect(stdout).toContain('In battle: btl-5c3');
  expect(stdout).toContain('Next: get_battle_status');
  expect(stdout).toContain('Outgoing challenge to Kestrel (player-77)');
  expect(stdout).toContain('Side size: full fleet (every eligible member)');
  expect(stdout).toContain('Withdraw with: arena cancel');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders accept participants with Team from your_side and a unique (you) marker', () => {
  const stdout = output('arena_accept', arenaAcceptFixture);
  expect(stdout).toContain('Arena match started — battle btl-5c3');
  expect(stdout).toContain('Your side: 2   Opponent side: 1');
  expect(stdout).toContain('=== Participants ===');
  expect(stdout).toContain('Team');
  expect(stdout).toContain('yours');
  expect(stdout).toContain('opponent');
  expect(stdout).toContain('Kestrel (you)');
  expect(stdout).toContain('Coin');
  expect(stdout).toContain('Rook');
  expect(stdout).toContain('Next: get_battle_status · battle_target <pilot> · battle_stance <stance>');
  expect(stdout).not.toContain('=== Response ===');
});

test('omits (you) when more than one pilot shares your_side', () => {
  const stdout = output('arena_accept', {
    details: {
      ...arenaAcceptDetails,
      your_side: 1,
      opponent_side: 2,
    },
  });
  expect(stdout).toContain('Coin');
  expect(stdout).toContain('Rook');
  expect(stdout).not.toContain('(you)');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders challenge, decline, and cancel mutation copy', () => {
  const challenge = output('arena_challenge', arenaChallengeFixture);
  expect(challenge).toContain('Challenge sent to Kestrel (player-77)');
  expect(challenge).toContain('Side size: full fleet (every eligible member)');
  expect(challenge).toContain('Kestrel has until tick 41260 to answer.');
  expect(challenge).toContain('Next: arena status (wait for an answer) · arena cancel (withdraw)');
  expect(challenge).not.toContain('=== Response ===');

  const decline = output('arena_decline', arenaDeclineFixture);
  expect(decline).toContain('Challenge chal-9f1 declined.');
  expect(decline).not.toContain('=== Response ===');

  const cancel = output('arena_cancel', arenaCancelFixture);
  expect(cancel).toContain('Challenge chal-a02 cancelled.');
  expect(cancel).toContain('You withdrew challenge chal-a02.');
  expect(cancel).not.toContain('=== Response ===');
});

test('declines malformed arena shapes and keeps the raw fallback', () => {
  expect(output('arena_status', { at_arena: 'yes', arena_wins: 3 })).toContain('=== Response ===');
  expect(output('arena_accept', { details: { action: 'accept', battle_id: 'btl-5c3' } })).toContain('=== Response ===');
  expect(output('arena_decline', { details: { action: 'decline' } })).toContain('=== Response ===');
});

test('suppresses shape fallback when an arena formatter declines', () => {
  const stdout = output('arena_decline', {
    details: { action: 'decline', message: 'not enough' },
    ship: { id: 'ship-wayfarer' },
    location: { poi_id: '36_ophiuchi_belt' },
  });
  expect(stdout).toContain('=== Response ===');
  expect(stdout).toContain('not enough');
  expect(stdout).not.toContain('Challenge');
});
