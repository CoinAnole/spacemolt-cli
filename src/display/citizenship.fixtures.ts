import type { HighValueFixtureEntry } from './formatter-fixtures.ts';

const nebulaGrant = {
  empire_id: 'nebula',
  granted_at: '2025-06-01T00:00:00Z',
};

const solarianGrant = {
  empire_id: 'solarian',
  granted_at: '2026-01-15T00:00:00Z',
  granted_by: 'council',
};

const pendingCrimsonPetition = {
  id: 'pet-crimson-1',
  empire_id: 'crimson',
  player_id: 'player-1',
  player_name: 'Marlowe',
  player_home_empire: 'nebula',
  reputation: 12,
  credits: 4242,
  fee_paid: 1000,
  status: 'pending',
  created_at: '2026-07-01T00:00:00Z',
};

const pendingSolarianPetition = {
  ...pendingCrimsonPetition,
  id: 'pet-solarian-1',
  empire_id: 'solarian',
};

const solarianPolicy = {
  empire_name: 'Solarian',
  empire_id: 'solarian',
  is_citizen: true,
  open: true,
  exclusive: false,
  auto_approve: false,
  fee: 1000,
  min_balance: 5000,
  min_reputation: 10,
  your_reputation: 12,
  eligible: true,
};

const crimsonPolicy = {
  empire_name: 'Crimson',
  empire_id: 'crimson',
  is_citizen: false,
  open: true,
  exclusive: true,
  auto_approve: false,
  fee: 2500,
  min_balance: 10000,
  min_reputation: 20,
  your_reputation: 8,
  eligible: false,
  ineligible_reason: 'reputation too low',
};

export const citizenshipListFixture = {
  origin: 'nebula',
  citizenships: [solarianGrant, nebulaGrant],
  pending_petitions: [pendingCrimsonPetition],
  empires: [solarianPolicy, crimsonPolicy],
};

export const citizenshipListStatelessFixture = {
  origin: 'nebula',
  citizenships: [],
  empires: [solarianPolicy, crimsonPolicy],
};

export const citizenshipListOmittedFixture = {
  origin: 'nebula',
  empires: [solarianPolicy, crimsonPolicy],
};

export const citizenshipRenounceLastFixture = {
  origin: 'nebula',
  citizenships: [],
  renounced: ['solarian'],
  empire_id: 'solarian',
  message: 'Last citizenship dropped.',
};

export const citizenshipRenounceOmittedFixture = {
  origin: 'nebula',
  renounced: ['solarian'],
  empire_id: 'solarian',
  message: 'Last citizenship dropped.',
};

export const citizenshipApplyPendingFixture = {
  origin: 'nebula',
  citizenships: [nebulaGrant],
  petition: pendingSolarianPetition,
  fee_paid: 1000,
  empire_id: 'solarian',
  status: 'pending',
  message: 'Application submitted.',
};

export const citizenshipApplyOmittedFixture = {
  petition: pendingSolarianPetition,
  empire_id: 'solarian',
  status: 'pending',
};

export const citizenshipWithdrawFixture = {
  origin: 'nebula',
  citizenships: [solarianGrant, nebulaGrant],
  fee_refunded: 1000,
  empire_id: 'solarian',
  message: 'Application withdrawn.',
};

export const citizenshipHighValueFixtures: Record<string, HighValueFixtureEntry> = {
  citizenship_list: {
    command: 'citizenship_list',
    fixture: citizenshipListFixture,
    schemaTarget: 'structuredContent',
  },
  citizenship_list_stateless: {
    command: 'citizenship_list',
    fixture: citizenshipListStatelessFixture,
    schemaTarget: 'structuredContent',
  },
  citizenship_apply: {
    command: 'citizenship_apply',
    fixture: citizenshipApplyPendingFixture,
    schemaTarget: 'details',
  },
  citizenship_renounce: {
    command: 'citizenship_renounce',
    fixture: citizenshipRenounceLastFixture,
    schemaTarget: 'details',
  },
  citizenship_withdraw: {
    command: 'citizenship_withdraw',
    fixture: citizenshipWithdrawFixture,
    schemaTarget: 'details',
  },
};
