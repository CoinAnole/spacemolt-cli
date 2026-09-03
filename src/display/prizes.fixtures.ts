import type { HighValueFixtureEntry } from './formatter-fixtures.ts';

/** Nested live-shaped SC: details = ClaimPrizeResponse. */
export const claimPrizeFixture = {
  details: {
    prize_id: 'prize-1',
    ship_id: 'ship-99',
    ship_class: 'skiff',
    ship_name: 'Captured Lark',
    destination_base_id: 'earth_station',
    destination_name: 'Earth Station',
    status: 'claimed',
    crew_assigned: 1,
    crew_disposition: 'aboard',
    idempotent: false,
  },
};

export const prizesHighValueFixtures: Record<string, HighValueFixtureEntry> = {
  claim_prize: {
    command: 'claim_prize',
    fixture: claimPrizeFixture,
    apiRoute: 'POST /api/v2/spacemolt_salvage/claim_prize',
    schemaTarget: 'details',
  },
};
