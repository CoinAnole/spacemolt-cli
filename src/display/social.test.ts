import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { renderStructuredResult } from './index.ts';
import { facilityListFixture, factionFacilityOwnedFixture, forumThreadFixture } from './social.fixtures.ts';

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
      return new Date('2026-05-29T00:00:00.000Z');
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

test('renders faction-owned facility rent summary and delinquency fields', () => {
  const rendered = renderStructuredResult(
    'faction_facility_owned',
    structuredClone(factionFacilityOwnedFixture),
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  expect(rendered.stdout.join('\n')).toContain('Faction rent bill: 1,200cr/cycle');
  expect(rendered.stdout.join('\n')).toContain('Faction arrears: 2,400cr');
  expect(rendered.stdout.join('\n')).toContain('Grace remaining: 1 cycle');
  expect(rendered.stdout.join('\n')).toContain('Missed');
  expect(rendered.stdout.join('\n')).toContain('Arrears');
  expect(rendered.stdout.join('\n')).toContain('2,400cr');
});

test('renders facility list per-cycle item and labor upkeep', () => {
  const rendered = renderStructuredResult('facility_list', structuredClone(facilityListFixture), options, context);

  expect(rendered.success).toBe(true);
  expect(rendered.stdout.join('\n')).toContain('Upkeep');
  expect(rendered.stdout.join('\n')).toContain('Labor/cycle');
  expect(rendered.stdout.join('\n')).toContain('12 Fuel Cell');
  expect(rendered.stdout.join('\n')).toContain('320cr');
});

test('renders facility list faction rent summary', () => {
  const facilityList = structuredClone(facilityListFixture) as Record<string, unknown>;
  facilityList.faction_rent = {
    facilities: 2,
    total_rent_per_cycle: 1200,
    arrears_owed: 2400,
    grace_cycles: 1,
    est_rent_per_day: 7200,
    note: 'Faction facilities pay rent from the treasury each cycle.',
  };

  const rendered = renderStructuredResult('facility_list', facilityList, options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Faction rent bill: 1,200cr/cycle');
  expect(stdout).toContain('Faction arrears: 2,400cr');
  expect(stdout).toContain('Grace remaining: 1 cycle');
  expect(stdout).toContain('Estimated rent/day: 7,200cr');
  expect(stdout).toContain('Faction facilities pay rent from the treasury each cycle.');
});

test('renders facility custom names alongside type names across facility views', () => {
  const facilityList = structuredClone(facilityListFixture) as Record<string, unknown>;
  const playerFacilities = facilityList.player_facilities as Array<Record<string, unknown>>;
  const factionFacilities = facilityList.faction_facilities as Array<Record<string, unknown>>;
  if (!playerFacilities[0] || !factionFacilities[0]) throw new Error('Facility fixture is incomplete.');
  playerFacilities[0].custom_name = 'Frontier Smelter';
  playerFacilities[0].output_price = 0.5;
  factionFacilities[0].custom_name = 'Alloy One';

  const listRendered = renderStructuredResult('facility_list', facilityList, options, context);
  const ownedRendered = renderStructuredResult(
    'facility_owned',
    {
      facilities: [
        {
          facility_id: 'player-refinery',
          type: 'ore_refinery',
          name: 'Ore Refinery',
          custom_name: 'Frontier Smelter',
          level: 2,
        },
      ],
    },
    options,
    context,
  );
  const factionOwned = structuredClone(factionFacilityOwnedFixture) as Record<string, unknown>;
  const factionOwnedFacilities = factionOwned.facilities as Array<Record<string, unknown>>;
  if (!factionOwnedFacilities[0]) throw new Error('Faction facility fixture is incomplete.');
  factionOwnedFacilities[0].name = 'Shipyard Berth';
  factionOwnedFacilities[0].custom_name = 'Capital Yard';
  const factionOwnedRendered = renderStructuredResult('faction_facility_owned', factionOwned, options, context);

  expect(listRendered.success).toBe(true);
  expect(listRendered.stdout.join('\n')).toContain('Frontier Smelter (Ore Refinery)');
  expect(listRendered.stdout.join('\n')).toContain('Alloy One (Alloy Smelter)');
  expect(listRendered.stdout.join('\n')).toContain('Rent/run');
  expect(listRendered.stdout.join('\n')).toContain('0.5');
  expect(ownedRendered.success).toBe(true);
  expect(ownedRendered.stdout.join('\n')).toContain('Frontier Smelter (Ore Refinery)');
  expect(factionOwnedRendered.success).toBe(true);
  expect(factionOwnedRendered.stdout.join('\n')).toContain('Capital Yard (Shipyard Berth)');
});

test('omits facility state and maintenance columns when the API omits those fields', () => {
  const rendered = renderStructuredResult(
    'facility_list',
    {
      base_id: 'nova_terra_central',
      station_facilities: [
        {
          facility_id: 'power-cell-assembler',
          type: 'power_cell_assembler',
          name: 'Power Cell Assembler',
          category: 'production',
          level: 1,
          recipe_id: 'build_power_cell',
        },
      ],
      player_facilities: [
        {
          facility_id: 'crew-bunk-1',
          type: 'crew_bunk',
          name: 'Crew Bunk',
          category: 'personal',
          level: 1,
        },
      ],
      faction_facilities: [
        {
          facility_id: 'faction-workshop-1',
          type: 'faction_workshop',
          name: 'Faction Workshop',
          category: 'faction',
          level: 1,
        },
      ],
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).not.toContain('Active');
  expect(stdout).not.toContain('Maint');
});

test('omits faction facility state column when the API omits that field', () => {
  const rendered = renderStructuredResult(
    'faction_facility_owned',
    {
      action: 'faction_owned',
      facilities: [
        {
          facility_id: 'faction-workshop-1',
          type: 'faction_workshop',
          name: 'Faction Workshop',
          base_name: 'Nova Terra Central',
          system_id: 'sol',
          rent_per_cycle: 80,
        },
      ],
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).not.toContain('Active');
  expect(stdout).toContain('Rent');
});

test('renders flat fleet_status response from v2 schema', () => {
  const rendered = renderStructuredResult(
    'fleet_status',
    {
      action: 'status',
      in_fleet: true,
      fleet_id: 'fleet-1',
      leader: 'Marlowe',
      system_id: 'sol',
      poi_id: 'earth_station',
      members: [
        {
          player_id: 'player-1',
          username: 'Marlowe',
          is_leader: true,
          ship: 'Prospector',
        },
      ],
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Fleet ===');
  expect(stdout).toContain('ID: fleet-1');
  expect(stdout).toContain('Leader: Marlowe');
  expect(stdout).toContain('Marlowe');
  expect(stdout).toContain('Prospector');
  expect(stdout).toContain('sol');
});

test('renders forum thread reply pagination metadata', () => {
  const rendered = renderStructuredResult(
    'forum_get_thread',
    {
      ...forumThreadFixture,
      page: 2,
      per_page: 20,
      total_replies: 41,
      has_more: true,
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Replies: 41');
  expect(stdout).toContain('reply page 2 | per page 20 | total replies 41');
  expect(stdout).toContain('More replies available.');
});

test('renders chat history timestamps from v2 timestamp_utc field', () => {
  const rendered = renderStructuredResult(
    'get_chat_history',
    {
      channel: 'local',
      has_more: false,
      total_count: 1,
      messages: [
        {
          id: 'chat-1',
          channel: 'local',
          sender_id: 'player-ibis',
          sender: 'Ibis',
          content: 'Clear skies over Sol today.',
          timestamp_utc: '2026-05-23T15:04:05.000Z',
        },
      ],
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('2026-05-23 15:04:05');
  expect(stdout).toContain('Ibis');
  expect(stdout).toContain('Clear skies over Sol today.');
});

test('renders get_guide server version', () => {
  const rendered = renderStructuredResult(
    'get_guide',
    {
      guide: 'miner',
      content: 'Mine at asteroid belts.',
      server_version: 'v0.461.0',
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Server version: v0.461.0');
});
