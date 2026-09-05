import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import {
  arenaAcceptDetails,
  arenaAcceptFixture,
  arenaCancelFixture,
  arenaChallengeFixture,
  arenaChallengesEmptyFixture,
  arenaChallengesFixture,
  arenaChallengesTravelFixture,
  arenaDeclineFixture,
  arenaFightFixture,
  arenaStatusIdleFixture,
  arenaStatusInBattleFixture,
  arenaStatusIncomingFixture,
  sixteenTrialMidSeries,
  trialDef,
} from './arena.fixtures.ts';
import {
  arenaStatLines,
  battleLabels,
  battleRulesetFromCategory,
  battleRulesetFromLogEntries,
  countLedger,
  formatArenaPoiLine,
  formatArenaRecord,
  formatArenaSideSize,
  formatEnemyDigest,
  formatRuleDigest,
  groupTrialsBySeries,
  readArenaRecord,
  suggestedFight,
  trialNameIndex,
  trialReadiness,
} from './arena.ts';
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

test('formatArenaPoiLine only tags a true arena flag', () => {
  expect(formatArenaPoiLine(true)).toBe('Arena: yes (consequence-free matches; see: arena status)');
  expect(formatArenaPoiLine(false)).toBeUndefined();
  expect(formatArenaPoiLine(undefined)).toBeUndefined();
  expect(formatArenaPoiLine('true')).toBeUndefined();
});

test('readArenaRecord requires all three counters to be finite', () => {
  expect(readArenaRecord({ arena_wins: 3, arena_losses: 1, arena_knockouts: 7 })).toEqual({
    wins: 3,
    losses: 1,
    knockouts: 7,
  });
  expect(readArenaRecord({ arena_wins: 3, arena_losses: 1 })).toBeUndefined();
  expect(readArenaRecord({ arena_wins: 3, arena_losses: Number.NaN, arena_knockouts: 7 })).toBeUndefined();
});

test('formatArenaRecord keeps the arena_status Record pluralization', () => {
  expect(formatArenaRecord({ wins: 3, losses: 1, knockouts: 7 })).toBe('3 wins / 1 loss / 7 knockouts');
  expect(formatArenaRecord({ wins: 0, losses: 0, knockouts: 0 })).toBe('0 wins / 0 losses / 0 knockouts');
  expect(formatArenaRecord({ wins: 2, losses: 2, knockouts: 1 })).toBe('2 wins / 2 losses / 1 knockouts');
});

test('arenaStatLines suppresses a 0/0/0 record with no XP', () => {
  expect(arenaStatLines({ arena_wins: 0, arena_losses: 0, arena_knockouts: 0 }, undefined)).toEqual([]);
});

test('arenaStatLines prints a record and a sorted XP ledger', () => {
  expect(
    arenaStatLines(
      { arena_wins: 3, arena_losses: 1, arena_knockouts: 7 },
      {
        by_skill: { shields: 40, gunnery: 120 },
        day: '2026-09-04',
      },
    ),
  ).toEqual(['Arena: 3 wins / 1 loss / 7 knockouts', 'Arena XP today (2026-09-04): gunnery 120, shields 40']);
});

test('arenaStatLines keeps XP when the record is all zeros', () => {
  expect(arenaStatLines({ arena_wins: 0, arena_losses: 0, arena_knockouts: 0 }, { by_skill: { gunnery: 10 } })).toEqual(
    ['Arena XP today: gunnery 10'],
  );
});

test('arenaStatLines ignores malformed arena_xp', () => {
  expect(arenaStatLines({ arena_wins: 1, arena_losses: 0, arena_knockouts: 0 }, 'today')).toEqual([
    'Arena: 1 wins / 0 losses / 0 knockouts',
  ]);
  expect(arenaStatLines({ arena_wins: 1, arena_losses: 0, arena_knockouts: 0 }, { by_skill: {} })).toEqual([
    'Arena: 1 wins / 0 losses / 0 knockouts',
  ]);
  expect(arenaStatLines({ arena_wins: 0, arena_losses: 0, arena_knockouts: 0 }, { day: '2026-09-04' })).toEqual([]);
});

test('battleRulesetFromCategory treats only arena as the arena ruleset', () => {
  expect(battleRulesetFromCategory('arena')).toBe('arena');
  expect(battleRulesetFromCategory(' ARENA ')).toBe('arena');
  expect(battleRulesetFromCategory('pvp')).toBe('standard');
  expect(battleRulesetFromCategory(undefined)).toBe('standard');
  expect(battleRulesetFromCategory(true)).toBe('standard');
});

test('battleRulesetFromLogEntries is arena when any tick is flagged', () => {
  expect(battleRulesetFromLogEntries([{ tick: 1 }, { tick: 2, arena: true }])).toBe('arena');
  expect(battleRulesetFromLogEntries([{ tick: 1, arena: false }])).toBe('standard');
  expect(battleRulesetFromLogEntries([])).toBe('standard');
});

test('battleLabels substitutes knockout wording only for arena', () => {
  const standard = battleLabels('standard');
  expect(standard.note).toBeUndefined();
  expect(standard.shipsDestroyed).toBe('Ships Destroyed');
  expect(standard.destroyedNames).toBe('Destroyed');
  expect(standard.killsColumn).toBe('Kills');

  const arena = battleLabels('arena');
  expect(arena.note).toContain('ships, drones, and personnel');
  expect(arena.note).toContain('Ammo, fuel, and consumables stay spent');
  expect(arena.note).not.toContain('ammo, fuel, and consumables are restored');
  expect(arena.shipsDestroyed).toBe('Ships Knocked Out');
  expect(arena.destroyedNames).toBe('Knocked out');
  expect(arena.killsColumn).toBe('KOs');
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

test('trialReadiness keeps wins as a badge and carries travel/locked payloads', () => {
  const names = new Map([
    ['two_on_one', 'Two on One'],
    ['first_blood', 'First Blood'],
  ]);
  expect(
    trialReadiness(
      trialDef({ challenge_id: 'two_on_one', name: 'Two on One', series: 'Blood Arena', stage: 2, wins: 3 }),
      names,
    ),
  ).toEqual({ kind: 'ready' });
  expect(
    trialReadiness(
      trialDef({
        challenge_id: 'two_on_one',
        name: 'Two on One',
        series: 'Blood Arena',
        stage: 2,
        at_this_arena: false,
      }),
      names,
    ),
  ).toEqual({ kind: 'travel', poi_name: 'Blood Arena', poi_id: 'krynn_blood_arena' });
  expect(
    trialReadiness(
      trialDef({
        challenge_id: 'trial_master',
        name: 'The Trial Master',
        series: 'Blood Arena',
        stage: 3,
        locked: true,
        requires: ['two_on_one', 'missing_id'],
      }),
      names,
    ),
  ).toEqual({ kind: 'locked', needs: ['Two on One', 'missing_id'] });
});

test('groupTrialsBySeries preserves server order and marks here from any row', () => {
  const sections = groupTrialsBySeries([
    trialDef({ challenge_id: 'a', name: 'A', series: 'Blood Arena', stage: 1 }),
    trialDef({ challenge_id: 'b', name: 'B', series: 'Blood Arena', stage: 2, at_this_arena: false }),
    trialDef({
      challenge_id: 'c',
      name: 'C',
      series: 'The Swarm',
      stage: 1,
      locked: true,
      at_this_arena: false,
      poi_name: 'Other Arena',
      poi_id: 'other_arena',
    }),
  ]);
  expect(sections).toHaveLength(2);
  expect(sections[0]?.series).toBe('Blood Arena');
  expect(sections[0]?.here).toBe(true);
  expect(sections[0]?.trials).toHaveLength(2);
  expect(sections[1]?.series).toBe('The Swarm');
  expect(sections[1]?.here).toBe(false);
  expect(sections[1]?.poi_name).toBe('Other Arena');
});

test('countLedger excludes rematches from Ready here', () => {
  const trials = sixteenTrialMidSeries();
  expect(countLedger(trials, trialNameIndex(trials))).toEqual({ readyHere: 1, travel: 0, locked: 14 });
});

test('suggestedFight prefers a new ready trial, then a travel new trial', () => {
  const ready = sixteenTrialMidSeries();
  expect(suggestedFight(ready)?.challenge_id).toBe('two_on_one');
  const travel = ready.map((trial) => ({ ...trial, at_this_arena: false }));
  expect(suggestedFight(travel)?.challenge_id).toBe('two_on_one');
  const rematchOnly = ready.map((trial) =>
    trial.challenge_id === 'two_on_one' ? { ...trial, locked: true, wins: 0 } : trial,
  );
  expect(suggestedFight(rematchOnly)?.challenge_id).toBe('first_blood');
});

test('formatRuleDigest keeps max_side_size 0 as full fleet and omits empty or zero optionals', () => {
  expect(formatRuleDigest({ max_side_size: 0 })).toBe('full fleet (every eligible member)');
  expect(formatRuleDigest({ max_side_size: 1 })).toBe('solo duel');
  expect(
    formatRuleDigest({
      max_side_size: 1,
      allowed_ship_categories: ['Industrial', 'Commercial'],
      allowed_damage_types: ['energy'],
      allowed_modules: [],
      banned_cargo: [],
      max_crew: 0,
      max_marines: 0,
      min_side_size: 0,
      no_drones: false,
      no_cloak: true,
    }),
  ).toBe('solo duel · Industrial, Commercial · energy only · no cloak');
  expect(
    formatRuleDigest({
      max_side_size: 2,
      min_ship_tier: 2,
      max_ship_tier: 4,
      max_ship_scale: 2,
      banned_modules: ['webifier'],
      allowed_cargo: ['fuel'],
    }),
  ).toBe('up to 2 ships per side · tier 2–4 · max scale 2 · only fuel · no webifier');
});

test('formatEnemyDigest marks a singleton boss and otherwise prints count × name', () => {
  expect(
    formatEnemyDigest([
      { name: 'Gravemaker', ship_class: 'gravemaker', ship_class_name: 'Cruiser', count: 1, is_boss: true },
      { name: 'Ring Cleaver', ship_class: 'ring_cleaver', ship_class_name: 'Fighter', count: 2, is_boss: false },
    ]),
  ).toBe('Gravemaker (boss, Cruiser) · 2× Ring Cleaver (Fighter)');
  expect(
    formatEnemyDigest([
      { name: 'Ring Cleaver', ship_class: 'ring_cleaver', ship_class_name: 'Fighter', count: 1, is_boss: false },
    ]),
  ).toBe('1× Ring Cleaver (Fighter)');
});

test('renders the sixteen-trial catalog as series sections without lore', () => {
  const stdout = output('arena_challenges', arenaChallengesFixture);
  expect(stdout).toContain('=== NPC Trials ===');
  expect(stdout).toContain('Ready here: 1   Travel: 0   Locked: 14');
  expect(stdout).toContain('Blood Arena  @ Blood Arena  — you are here');
  expect(stdout).toContain('READY');
  expect(stdout).toContain('LOCKED');
  expect(stdout).toContain('first_blood');
  expect(stdout).toContain('3 wins');
  expect(stdout).toContain('1× Ring Cleaver (Fighter) · solo duel');
  expect(stdout).toContain('2× Ring Cleaver (Fighter) · solo duel');
  expect(stdout).toContain('needs Two on One');
  expect(stdout).toContain("Hauler's Gauntlet  @ Blood Arena  — you are here");
  expect(stdout).toContain('The Swarm  @ Blood Arena  — you are here');
  expect(stdout).toContain('LOCKED 10');
  expect(stdout).toContain('Next: arena fight two_on_one');
  expect(stdout).not.toContain('TRAVEL');
  expect(stdout).not.toContain('=== Response ===');
  const firstBlood = sixteenTrialMidSeries()[0];
  expect(firstBlood?.description).toBe('');
});

test('renders travel state and a travel footer', () => {
  const stdout = output('arena_challenges', arenaChallengesTravelFixture);
  expect(stdout).toContain('Ready here: 0   Travel: 2   Locked: 14');
  expect(stdout).toContain('Blood Arena  @ Blood Arena  — travel here');
  expect(stdout).toContain('TRAVEL');
  expect(stdout).toContain('Next: travel to Blood Arena (krynn_blood_arena), then arena fight two_on_one');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders an empty NPC trial catalog', () => {
  const stdout = output('arena_challenges', arenaChallengesEmptyFixture);
  expect(stdout).toContain('=== NPC Trials ===');
  expect(stdout).toContain('No NPC trials defined.');
  expect(stdout).not.toContain('Ready here:');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders a fight start with enemy digest and enemy team label', () => {
  const stdout = output('arena_fight', arenaFightFixture);
  expect(stdout).toContain('=== Trial started: Two on One ===');
  expect(stdout).toContain('Battle: btl-7e1   Challenge: two_on_one');
  expect(stdout).toContain('Your side: 2   Enemy side: 1');
  expect(stdout).toContain('Enemies: 2× Ring Cleaver (Fighter)');
  expect(stdout).toContain('enemy');
  expect(stdout).toContain('Coin (you)');
  expect(stdout).toContain('Ring Cleaver 1');
  expect(stdout).not.toContain('opponent');
  expect(stdout).not.toContain('Trial started: Two on One\n');
  expect(stdout).not.toContain('=== Response ===');
});

test('accept still says opponent after the shared participant helper', () => {
  const stdout = output('arena_accept', arenaAcceptFixture);
  expect(stdout).toContain('opponent');
  expect(stdout).not.toContain('enemy');
});

test('declines malformed catalog and fight shapes', () => {
  expect(output('arena_challenges', { action: 'challenges' })).toContain('=== Response ===');
  expect(output('arena_challenges', { action: 'challenges', challenges: [{ challenge_id: 'x' }] })).toContain(
    '=== Response ===',
  );
  expect(output('arena_fight', { details: { action: 'fight', battle_id: 'btl-7e1' } })).toContain('=== Response ===');
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
