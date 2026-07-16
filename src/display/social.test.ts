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

test('renders facility dining and leisure scores when present', () => {
  const rendered = renderStructuredResult('facility_list', structuredClone(facilityListFixture), options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Dining');
  expect(stdout).toContain('Tourism Upkeep');
  expect(stdout).toContain('Dockside Diner');
  expect(stdout).toContain('2');
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

test('renders facility metadata when all required facility groups are empty', () => {
  const facilityList = structuredClone(facilityListFixture) as Record<string, unknown>;
  facilityList.station_facilities = [];
  facilityList.player_facilities = [];
  facilityList.faction_facilities = [];
  facilityList.public_facilities = [];

  const rendered = renderStructuredResult('facility_list', facilityList, options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Power: 95/120 draw (85% efficiency)');
  expect(stdout).toContain('=== Construction ===');
  expect(stdout).toContain('Faction rent bill: 1,200cr/cycle');
  expect(stdout).not.toContain('=== Station Facilities ===');
  expect(stdout).not.toContain('=== Public Facilities ===');
  expect(stdout).not.toContain('=== Player Facilities ===');
  expect(stdout).not.toContain('=== Faction Facilities ===');
  expect(stdout).not.toContain('=== Response ===');
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
  expect(stdout).not.toContain('Idle');
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
      is_leader: true,
      max_size: 5,
      system_id: 'sol',
      poi_id: 'earth_station',
      invites: [{ player_id: 'player-3', username: 'Ibis' }],
      members: [
        {
          player_id: 'player-1',
          username: 'Marlowe',
          is_leader: true,
          ship: 'Prospector',
          fuel_per_jump: 12,
        },
        {
          player_id: 'player-2',
          username: 'Rook',
          is_leader: false,
          passenger: true,
          riding_ship_id: 'ship-marlowe-1',
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
  expect(stdout).toContain('You are leader: yes');
  expect(stdout).toContain('Size: 2/5');
  expect(stdout).toContain('Marlowe');
  expect(stdout).toContain('Prospector');
  expect(stdout).toContain('sol');
  expect(stdout).toContain('Rook');
  expect(stdout).toContain('Passenger');
  expect(stdout).toContain('Riding');
  expect(stdout).toContain('ship-marlowe-1');
  expect(stdout).toContain('Pending Invites');
  expect(stdout).toContain('Ibis');
  // Deadhead passenger has blank Ship column (no ship field)
  const rookLine = stdout.split('\n').find((line) => line.includes('Rook'));
  expect(rookLine).toBeDefined();
  expect(rookLine).toMatch(/Rook\s+\|\s+player-2\s+\|\s+\|\s+/);
});

test('fleet shape fallback does not claim public faction profiles', () => {
  const rendered = renderStructuredResult(
    'unmatched_command',
    {
      id: 'cb22dc89b36022a0beecea17d548b76b',
      name: 'Interstellar Continental',
      tag: 'NOIR',
      leader: 'Marlowe',
      members: [{ username: 'Marlowe', role: 'Leader' }],
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).not.toContain('=== Fleet ===');
  expect(stdout).not.toContain('| ID | Ship | Location | Status');
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

test('chat confirmation formats documented numeric sent_at as UTC', () => {
  const rendered = renderStructuredResult(
    'chat',
    {
      channel: 'local',
      message: 'Clear skies.',
      sent_at: 1748012645,
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  expect(rendered.stdout.join('\n')).toBe('[local] 15:04:05Z Clear skies.');
});

test('chat confirmation ignores the undocumented timestamp alias', () => {
  const rendered = renderStructuredResult(
    'chat',
    {
      action: 'chat',
      channel: 'local',
      content: 'Clear skies.',
      timestamp: '2026-05-23T15:04:05-04:00',
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  expect(rendered.stdout.join('\n')).toBe('[local] Clear skies.');
});

test('chat confirmation ignores string-valued sent_at', () => {
  const rendered = renderStructuredResult(
    'chat',
    {
      channel: 'local',
      message: 'Clear skies.',
      sent_at: '2026-05-23T15:04:05-04:00',
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  expect(rendered.stdout.join('\n')).toBe('[local] Clear skies.');
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
