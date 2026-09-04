import type { HighValueFixtureEntry } from './formatter-fixtures.ts';

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

export const arenaFixtureCases = {
  arena_status: { command: 'arena_status', fixture: arenaStatusIncomingFixture },
  arena_challenge: { command: 'arena_challenge', fixture: arenaChallengeFixture },
  arena_accept: { command: 'arena_accept', fixture: arenaAcceptFixture },
  arena_action: { command: 'arena_decline', fixture: arenaDeclineFixture },
};

export const arenaHighValueFixtures: Record<string, HighValueFixtureEntry> = {
  arena_status: arenaEntry('arena_status', arenaStatusIdleFixture, 'structuredContent'),
  arena_status_incoming: arenaEntry('arena_status', arenaStatusIncomingFixture, 'structuredContent'),
  arena_status_in_battle: arenaEntry('arena_status', arenaStatusInBattleFixture, 'structuredContent'),
  arena_challenge: arenaEntry('arena_challenge', arenaChallengeFixture, 'details'),
  arena_accept: arenaEntry('arena_accept', arenaAcceptFixture, 'details'),
  arena_decline: arenaEntry('arena_decline', arenaDeclineFixture, 'details'),
  arena_cancel: arenaEntry('arena_cancel', arenaCancelFixture, 'details'),
};
