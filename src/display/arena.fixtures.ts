import type { ArenaEnemyLine, ArenaTrial } from './arena.ts';
import type { HighValueFixtureEntry } from './formatter-fixtures.ts';

const BLOOD_ARENA_POI = {
  poi_id: 'krynn_blood_arena',
  poi_name: 'Blood Arena',
} as const;

const RING_CLEAVER: ArenaEnemyLine = {
  name: 'Ring Cleaver',
  ship_class: 'ring_cleaver',
  ship_class_name: 'Fighter',
  count: 1,
  is_boss: false,
};

export function trialDef(
  partial: Pick<ArenaTrial, 'challenge_id' | 'name' | 'series' | 'stage'> & Partial<ArenaTrial>,
): ArenaTrial {
  return {
    description: '',
    ...BLOOD_ARENA_POI,
    at_this_arena: true,
    requires: [],
    locked: false,
    rules: { max_side_size: 1 },
    enemies: [RING_CLEAVER],
    wins: 0,
    ...partial,
  };
}

export function sixteenTrialMidSeries(): ArenaTrial[] {
  const swarm: Array<{ challenge_id: string; name: string; requires: string[] }> = [
    { challenge_id: 'ten_shards', name: 'Ten Shards', requires: ['first_blood'] },
    { challenge_id: 'twenty_shards', name: 'Twenty Shards', requires: ['ten_shards'] },
    { challenge_id: 'thirty_shards', name: 'Thirty Shards', requires: ['twenty_shards'] },
    { challenge_id: 'forty_shards', name: 'Forty Shards', requires: ['thirty_shards'] },
    { challenge_id: 'fifty_shards', name: 'Fifty Shards', requires: ['forty_shards'] },
    { challenge_id: 'sixty_shards', name: 'Sixty Shards', requires: ['fifty_shards'] },
    { challenge_id: 'seventy_shards', name: 'Seventy Shards', requires: ['sixty_shards'] },
    { challenge_id: 'eighty_shards', name: 'Eighty Shards', requires: ['seventy_shards'] },
    { challenge_id: 'ninety_shards', name: 'Ninety Shards', requires: ['eighty_shards'] },
    { challenge_id: 'the_century', name: 'The Century', requires: ['ninety_shards'] },
  ];

  return [
    trialDef({
      challenge_id: 'first_blood',
      name: 'First Blood',
      series: 'Blood Arena',
      stage: 1,
      wins: 3,
      enemies: [{ ...RING_CLEAVER, count: 1 }],
    }),
    trialDef({
      challenge_id: 'two_on_one',
      name: 'Two on One',
      series: 'Blood Arena',
      stage: 2,
      enemies: [{ ...RING_CLEAVER, count: 2 }],
    }),
    trialDef({
      challenge_id: 'trial_master',
      name: 'The Trial Master',
      series: 'Blood Arena',
      stage: 3,
      locked: true,
      requires: ['two_on_one'],
    }),
    trialDef({
      challenge_id: 'gravemaker',
      name: 'Gravemaker',
      series: 'Blood Arena',
      stage: 4,
      locked: true,
      requires: ['trial_master'],
    }),
    trialDef({
      challenge_id: 'haulers_gauntlet',
      name: "Hauler's Gauntlet",
      series: "Hauler's Gauntlet",
      stage: 1,
      locked: true,
      requires: ['first_blood'],
    }),
    trialDef({
      challenge_id: 'clean_fight',
      name: 'Clean Fight',
      series: 'Clean Fight',
      stage: 1,
      locked: true,
      requires: ['first_blood'],
    }),
    ...swarm.map((entry, index) =>
      trialDef({
        challenge_id: entry.challenge_id,
        name: entry.name,
        series: 'The Swarm',
        stage: index + 1,
        locked: true,
        requires: entry.requires,
      }),
    ),
  ];
}

function catalogEnvelope(trials: ArenaTrial[]): Record<string, unknown> {
  return {
    action: 'challenges',
    challenges: trials,
  };
}

const arenaPoi = '36_ophiuchi_belt';

function challengeInfo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    challenge_id: 'chal-9f1',
    opponent_id: 'player-77',
    opponent_name: 'Kestrel',
    poi_id: arenaPoi,
    max_side_size: 1,
    expires_tick: 41200,
    ...overrides,
  };
}

function mutationEnvelope(details: Record<string, unknown>): Record<string, unknown> {
  return {
    details,
    ship: { id: 'ship-wayfarer', name: 'Wayfarer', cargo_used: 0, cargo_capacity: 500 },
    location: { poi_id: arenaPoi, system_id: '36_ophiuchi' },
  };
}

function arenaEntry(
  command: string,
  fixture: Record<string, unknown>,
  schemaTarget?: HighValueFixtureEntry['schemaTarget'],
): HighValueFixtureEntry {
  return {
    command,
    fixture,
    apiRoute: `POST /api/v2/spacemolt_arena/${command.replace('arena_', '')}`,
    ...(schemaTarget ? { schemaTarget } : {}),
  };
}

export const arenaStatusIdleFixture: Record<string, unknown> = {
  action: 'status',
  at_arena: true,
  arena_wins: 3,
  arena_losses: 1,
  arena_knockouts: 7,
  xp_used_today: {},
  xp_cap_per_skill: 500,
};

export const arenaStatusIncomingFixture: Record<string, unknown> = {
  action: 'status',
  at_arena: true,
  arena_wins: 3,
  arena_losses: 1,
  arena_knockouts: 7,
  incoming: challengeInfo(),
  xp_used_today: { shields: 40, gunnery: 120 },
  xp_cap_per_skill: 500,
};

export const arenaStatusInBattleFixture: Record<string, unknown> = {
  action: 'status',
  at_arena: false,
  arena_wins: 3,
  arena_losses: 1,
  arena_knockouts: 7,
  battle_id: 'btl-5c3',
  outgoing: challengeInfo({
    challenge_id: 'chal-a02',
    max_side_size: 0,
    expires_tick: 41260,
  }),
  xp_used_today: {},
  xp_cap_per_skill: 500,
};

export const arenaChallengeDetails = {
  action: 'challenge',
  challenge_id: 'chal-a02',
  target_id: 'player-77',
  target_name: 'Kestrel',
  poi_id: arenaPoi,
  max_side_size: 0,
  expires_tick: 41260,
  message: 'Kestrel has until tick 41260 to answer.',
};

export const arenaChallengeFixture = mutationEnvelope(arenaChallengeDetails);

export const arenaAcceptDetails = {
  action: 'accept',
  battle_id: 'btl-5c3',
  your_side: 2,
  opponent_side: 1,
  participants: [
    { player_id: 'player-12', username: 'Coin', side_id: 1 },
    { player_id: 'player-13', username: 'Rook', side_id: 1 },
    { player_id: 'player-77', username: 'Kestrel', side_id: 2 },
  ],
  message: 'Arena match started.',
};

export const arenaAcceptFixture = mutationEnvelope(arenaAcceptDetails);

export const arenaDeclineDetails = {
  action: 'decline',
  challenge_id: 'chal-9f1',
  message: 'Challenge chal-9f1 declined.',
};

export const arenaDeclineFixture = mutationEnvelope(arenaDeclineDetails);

export const arenaCancelDetails = {
  action: 'cancel',
  challenge_id: 'chal-a02',
  message: 'You withdrew challenge chal-a02.',
};

export const arenaCancelFixture = mutationEnvelope(arenaCancelDetails);

export const arenaChallengesFixture = catalogEnvelope(sixteenTrialMidSeries());

export const arenaChallengesTravelFixture = catalogEnvelope(
  sixteenTrialMidSeries().map((trial) => ({ ...trial, at_this_arena: false })),
);

export const arenaChallengesEmptyFixture = catalogEnvelope([]);

export const arenaFightDetails = {
  action: 'fight',
  challenge_id: 'two_on_one',
  name: 'Two on One',
  battle_id: 'btl-7e1',
  your_side: 2,
  enemy_side: 1,
  participants: [
    { player_id: 'npc-rc-1', username: 'Ring Cleaver 1', side_id: 1 },
    { player_id: 'npc-rc-2', username: 'Ring Cleaver 2', side_id: 1 },
    { player_id: 'player-12', username: 'Coin', side_id: 2 },
  ],
  enemies: [{ ...RING_CLEAVER, count: 2 }],
  message: 'Trial started: Two on One',
};

export const arenaFightFixture = mutationEnvelope(arenaFightDetails);

export const arenaFixtureCases = {
  arena_status: { command: 'arena_status', fixture: arenaStatusIncomingFixture },
  arena_challenge: { command: 'arena_challenge', fixture: arenaChallengeFixture },
  arena_accept: { command: 'arena_accept', fixture: arenaAcceptFixture },
  arena_action: { command: 'arena_decline', fixture: arenaDeclineFixture },
  arena_challenges: { command: 'arena_challenges', fixture: arenaChallengesFixture },
  arena_fight: { command: 'arena_fight', fixture: arenaFightFixture },
};

export const arenaHighValueFixtures: Record<string, HighValueFixtureEntry> = {
  arena_status: arenaEntry('arena_status', arenaStatusIdleFixture, 'structuredContent'),
  arena_status_incoming: arenaEntry('arena_status', arenaStatusIncomingFixture, 'structuredContent'),
  arena_status_in_battle: arenaEntry('arena_status', arenaStatusInBattleFixture, 'structuredContent'),
  arena_challenge: arenaEntry('arena_challenge', arenaChallengeFixture, 'details'),
  arena_accept: arenaEntry('arena_accept', arenaAcceptFixture, 'details'),
  arena_decline: arenaEntry('arena_decline', arenaDeclineFixture, 'details'),
  arena_cancel: arenaEntry('arena_cancel', arenaCancelFixture, 'details'),
  arena_challenges: arenaEntry('arena_challenges', arenaChallengesFixture, 'structuredContent'),
  arena_challenges_travel: arenaEntry('arena_challenges', arenaChallengesTravelFixture, 'structuredContent'),
  arena_challenges_empty: arenaEntry('arena_challenges', arenaChallengesEmptyFixture, 'structuredContent'),
  arena_fight: arenaEntry('arena_fight', arenaFightFixture, 'details'),
};
