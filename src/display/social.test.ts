import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { hexColor } from './ansi.ts';
import { facilityBillingPaused, withPausedRentSuffix } from './helpers.ts';
import { renderStructuredResult } from './index.ts';
import {
  actionLogCursorFixture,
  battleLogBoardingFixture,
  battleLogFixture,
  battleLogInterruptedFixture,
  battleLogPlunderedFixture,
  battleLogSnapshotsFixture,
  battleStatusBoardingFixture,
  battleStatusFixture,
  battleSummaryCapturesFixture,
  battleSummaryCapturesKindFixture,
  battleSummaryFixture,
  battleSummaryInterruptedFixture,
  facilityListFixture,
  facilityListSimpleFixture,
  facilityOwnedFixture,
  facilityTypesDetailFixture,
  factionFacilityListFixture,
  factionFacilityOwnedFixture,
  factionScanPoiDetails,
  factionScanPoiEmptyFixture,
  factionScanPoiFixture,
  factionScanPoiPartialFixture,
  forumThreadFixture,
  ranchSetCullFixture,
  ranchStatusFixture,
} from './social.fixtures.ts';

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

function sectionAfter(stdout: string, title: string, nextTitle?: string): string {
  const start = stdout.split(`=== ${title} ===`)[1] ?? '';
  return nextTitle ? (start.split(`=== ${nextTitle} ===`)[0] ?? start) : start;
}

function tableCell(section: string, rowNeedle: string, column: string): string | undefined {
  const lines = section.split('\n');
  const header = lines.find((line) => line.includes('|') && line.includes(column) && line.includes('Name'));
  const row = lines.find((line) => line.includes('|') && line.includes(rowNeedle) && !line.includes('---'));
  if (!header || !row) return undefined;
  const headers = header.split('|').map((part) => part.trim());
  const cells = row.split('|').map((part) => part.trim());
  const index = headers.indexOf(column);
  return index >= 0 ? cells[index] : undefined;
}

function captureHeader(section: string): string | undefined {
  return section
    .split('\n')
    .find((line) => line.includes('|') && line.includes('Captor') && line.includes('Former owner'));
}

function captureCell(section: string, rowNeedle: string, column: string): string | undefined {
  const header = captureHeader(section);
  const row = section
    .split('\n')
    .find((line) => line.includes('|') && line.includes(rowNeedle) && !line.includes('---'));
  if (!header || !row) return undefined;
  const headers = header.split('|').map((part) => part.trim());
  const cells = row.split('|').map((part) => part.trim());
  const index = headers.indexOf(column);
  return index >= 0 ? cells[index] : undefined;
}

function expectCaptorThenKindThenFormerOwner(header: string | undefined): void {
  expect(header).toBeDefined();
  expect(header).toContain('Kind');
  expect(header?.indexOf('Captor') ?? -1).toBeLessThan(header?.indexOf('Kind') ?? -1);
  expect(header?.indexOf('Kind') ?? -1).toBeLessThan(header?.indexOf('Former owner') ?? -1);
}

function renderBattleSummary(fixture: Record<string, unknown>): string {
  const rendered = renderStructuredResult('get_battle_summary', fixture, options, context);
  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).not.toContain('=== Response ===');
  return stdout;
}

function captureRow(rows: Array<Record<string, unknown>>, index = 0): Record<string, unknown> {
  const row = rows[index];
  if (!row) throw new Error(`expected capture row ${index}`);
  return row;
}

function battleSummaryCapturesClone(overrides: Record<string, unknown>): Record<string, unknown> {
  const fixture = structuredClone(battleSummaryCapturesFixture) as Record<string, unknown>;
  Object.assign(captureRow(fixture.captures as Array<Record<string, unknown>>), overrides);
  return fixture;
}

test('renders cursor action-log entries in server order with the next polling cursor', () => {
  const rendered = renderStructuredResult('get_action_log', structuredClone(actionLogCursorFixture), options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout.indexOf('Faction production cycle completed.')).toBeLessThan(
    stdout.indexOf('Prospector buy order filled at Nova Terra Central.'),
  );
  expect(stdout).toContain('Timestamp');
  expect(stdout).toContain('Summary');
  expect(stdout).toContain('Category');
  expect(stdout).toContain('Event');
  expect(stdout).toContain('More entries available.');
  expect(stdout).toContain('Next since_id: 105');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toMatch(/NaN|undefined|\[object Object\]/);
});

test('renders a valid next cursor even when the current cursor page has no more entries', () => {
  const fixture = structuredClone(actionLogCursorFixture);
  fixture.has_more = false;
  fixture.next_since_id = 0;
  const stdout = renderStructuredResult('get_action_log', fixture, options, context).stdout.join('\n');

  expect(stdout).not.toContain('More entries available.');
  expect(stdout).toContain('Next since_id: 0');
});

test('omits malformed action-log cursors from human output', () => {
  for (const cursor of [-1, 1.5, Number.POSITIVE_INFINITY, Number.NaN, '105', undefined]) {
    const fixture = structuredClone(actionLogCursorFixture) as Record<string, unknown>;
    fixture.next_since_id = cursor;
    const stdout = renderStructuredResult('get_action_log', fixture, options, context).stdout.join('\n');
    expect(stdout).not.toContain('Next since_id:');
    expect(stdout).toContain('Faction production cycle completed.');
  }
});

test('renders ranch status as a dashboard with feed and production tables', () => {
  const rendered = renderStructuredResult(
    'facility_ranch_status',
    structuredClone(ranchStatusFixture),
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Wildlife Ranch ===');
  expect(stdout).toContain('Facility: Ember Grazer Corral (ranch-ember-1)');
  expect(stdout).toContain('Location: Cinder Outpost (cinder_outpost)');
  expect(stdout).toContain('Habitat: Cinder Iron Belt (cinder_iron_belt)');
  expect(stdout).toContain('Species: Ember Grazer (ember_grazer)');
  expect(stdout).toContain('Herd: 18 / 24');
  expect(stdout).toContain('Range health: 75% | Fed: 50% | Supplies: no');
  expect(stdout).toContain('Growth: 1.5/cycle | Cull target: disabled (0) | Cull cap: 4/cycle');
  expect(stdout).toContain('Domestication: inactive | Reserve: 0');
  expect(stdout).toContain('=== Feed ===');
  expect(stdout).toContain('iron_ore');
  expect(stdout).toContain('Cycles Left');
  expect(stdout).toContain('=== Production ===');
  expect(stdout).toContain('ember_grazer_meat');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toMatch(/NaN|undefined|\[object Object\]/);
});

test('renders explicit empty ranch feed and production states', () => {
  const fixture = structuredClone(ranchStatusFixture);
  fixture.feed = [];
  fixture.produces = [];

  const rendered = renderStructuredResult('facility_ranch_status', fixture, options, context);
  const stdout = rendered.stdout.join('\n');

  expect(stdout).toContain('No feed requirements.');
  expect(stdout).toContain('No expected ranch products.');
});

test('renders cull target zero as disabled while preserving zero herd', () => {
  const fixture = structuredClone(ranchSetCullFixture);
  fixture.details.herd = 0;

  const rendered = renderStructuredResult('facility_ranch_set_cull', fixture, options, context);
  const stdout = rendered.stdout.join('\n');

  expect(stdout).toContain('=== Ranch Cull Policy Updated ===');
  expect(stdout).toContain('Facility: ranch-ember-1');
  expect(stdout).toContain('Current herd: 0');
  expect(stdout).toContain('Cull target: disabled (0)');
  expect(stdout).toContain('Automatic culling disabled.');
  expect(stdout).not.toContain('=== Response ===');
});

test('declines malformed required ranch fields to the raw response fallback', () => {
  const fixture = structuredClone(ranchStatusFixture) as Record<string, unknown>;
  fixture.range_health = 2;

  const rendered = renderStructuredResult('facility_ranch_status', fixture, options, context);
  const stdout = rendered.stdout.join('\n');

  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('=== Wildlife Ranch ===');
});

test('declines malformed ranch cull fields to the raw response fallback', () => {
  const fixture = structuredClone(ranchSetCullFixture) as Record<string, unknown>;
  const details = fixture.details as Record<string, unknown>;
  details.herd = 'many';

  const rendered = renderStructuredResult('facility_ranch_set_cull', fixture, options, context);
  const stdout = rendered.stdout.join('\n');

  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('=== Ranch Cull Policy Updated ===');
});

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

test('renders station service pools after construction and before facility tables', () => {
  const rendered = renderStructuredResult('facility_list', structuredClone(facilityListFixture), options, context);
  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Service pools:');
  expect(stdout).toContain('Personnel: 12/20 remaining (+4/cycle, crew_rations)');
  expect(stdout).toContain('Medical: 3/10 remaining (+1/cycle)');
  expect(stdout).toContain('Marine training: 8/8 remaining (+2/cycle, marine_rations)');
  expect(stdout.indexOf('=== Construction ===')).toBeLessThan(stdout.indexOf('Service pools:'));
  expect(stdout.indexOf('Service pools:')).toBeLessThan(stdout.indexOf('=== Station Facilities ==='));
  expect(stdout).not.toContain('service_pool_capacity');
  const stationHeader = stdout
    .split('=== Player Facilities ===')[0]
    ?.split('\n')
    .find((line) => line.includes('Name') && line.includes('ID') && line.includes('Level'));
  expect(stationHeader).toBeDefined();
  expect(stationHeader).not.toContain('Service pool');
});

test('omits station service pools when the list response has none', () => {
  const simple = renderStructuredResult(
    'facility_list',
    structuredClone(facilityListSimpleFixture),
    options,
    context,
  ).stdout.join('\n');
  expect(simple).not.toContain('Service pools:');

  const detailed = structuredClone(facilityListFixture) as Record<string, unknown>;
  delete detailed.service_pools;
  const omitted = renderStructuredResult('facility_list', detailed, options, context).stdout.join('\n');
  expect(omitted).not.toContain('Service pools:');
});

test('prints remaining 0 and next-cycle supply need for station service pools', () => {
  const fixture = structuredClone(facilityListFixture) as Record<string, unknown>;
  fixture.service_pools = {
    personnel: { remaining: 0, capacity: 20, refill_per_cycle: 4, supply_item: 'crew_rations' },
    medical: { remaining: 3, capacity: 10, refill_per_cycle: 1, next_cycle_supply_required: 2 },
  };
  const stdout = renderStructuredResult('facility_list', fixture, options, context).stdout.join('\n');
  expect(stdout).toContain('Personnel: 0/20 remaining (+4/cycle, crew_rations)');
  expect(stdout).toContain('Medical: 3/10 remaining (+1/cycle) (need 2 next cycle)');
  expect(stdout).not.toContain('Marine training:');
});

test('facility_types detail prints identity and service pool without generic dump', () => {
  const stdout = renderStructuredResult(
    'facility_types',
    structuredClone(facilityTypesDetailFixture),
    options,
    context,
  ).stdout.join('\n');
  expect(stdout).toContain('=== Facility type: Crew Office ===');
  expect(stdout).toContain('ID: crew_office');
  expect(stdout).toContain('Category: service');
  expect(stdout).toContain('Level: 1');
  expect(stdout).toContain('Buildable: yes');
  expect(stdout).toContain('Build cost: 12000');
  expect(stdout).toContain('Build time: 40');
  expect(stdout).toContain('Labor: 80');
  expect(stdout).toContain('Rent/cycle: 200');
  expect(stdout).toContain('Description: Recruits fit crew from the station pool.');
  expect(stdout).toContain('Service pool: 20 cap, +4/cycle, 1x crew_rations');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('=== Categories ===');
});

test('facility_types omits Service pool when definition pool fields are absent', () => {
  const fixture = structuredClone(facilityTypesDetailFixture) as Record<string, unknown>;
  delete fixture.service_pool_capacity;
  delete fixture.service_pool_refill_per_cycle;
  delete fixture.service_pool_supply_item;
  delete fixture.service_pool_units_per_item;
  const stdout = renderStructuredResult('facility_types', fixture, options, context).stdout.join('\n');
  expect(stdout).toContain('=== Facility type: Crew Office ===');
  expect(stdout).not.toContain('Service pool:');
  expect(stdout).not.toContain('=== Response ===');
});

test('facility_types shapeFallback does not claim catalog-shaped type_id objects', () => {
  const stdout = renderStructuredResult(
    'inspect',
    { type_id: 'crew_office', name: 'Crew Office' },
    options,
    context,
  ).stdout.join('\n');
  expect(stdout).not.toContain('=== Facility type:');
  expect(stdout).not.toContain('Service pool:');
});

test('facility_types declines detail payloads with a non-types action', () => {
  const stdout = renderStructuredResult(
    'facility_types',
    { ...facilityTypesDetailFixture, action: 'list' },
    options,
    context,
  ).stdout.join('\n');
  expect(stdout).not.toContain('=== Facility type:');
  expect(stdout).not.toContain('Service pool: 20 cap');
});

test('renders facility list item req. stock and labor per cycle', () => {
  const rendered = renderStructuredResult('facility_list', structuredClone(facilityListFixture), options, context);
  const stdout = rendered.stdout.join('\n');
  const stationSection = stdout.split('=== Player Facilities ===')[0] ?? stdout;
  const stationTableHeader = stationSection
    .split('\n')
    .find((line) => line.includes('Name') && line.includes('ID') && line.includes('Level'));

  expect(rendered.success).toBe(true);
  expect(stationTableHeader).toBeDefined();
  expect(stationTableHeader).toContain('Req. stock');
  expect(stdout).toContain('Labor/cycle');
  expect(stdout).toContain('12 Fuel Cell');
  expect(stdout).toContain('320cr');
});

test('renders repair completion ticks in shared facility tables', () => {
  const facilityList = structuredClone(facilityListFixture) as Record<string, unknown>;
  const playerFacilities = facilityList.player_facilities as Array<Record<string, unknown>>;
  if (!playerFacilities[0]) throw new Error('Player facility fixture is incomplete.');
  playerFacilities[0].repair_complete_tick = 901500;

  const rendered = renderStructuredResult('facility_list', facilityList, options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Repair Tick');
  expect(stdout).toContain('901500');
});

test('omits repair completion ticks from shared facility tables when absent', () => {
  const rendered = renderStructuredResult('facility_list', structuredClone(facilityListFixture), options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).not.toContain('Repair Tick');
});

test('renders facility maintenance_fuel as fuel stock in Req. stock', () => {
  const facilityList = structuredClone(facilityListFixture) as Record<string, unknown>;
  const stationFacilities = facilityList.station_facilities as Array<Record<string, unknown>>;
  stationFacilities.push({
    facility_id: 'station-reactor',
    type: 'bunker_fed_reactor',
    name: 'Bunker-Fed Reactor',
    description: 'Station power from bunker fuel.',
    category: 'infrastructure',
    level: 2,
    maintenance_satisfied: true,
    maintenance_fuel: 55,
  });

  const rendered = renderStructuredResult('facility_list', facilityList, options, context);
  const stdout = rendered.stdout.join('\n');
  const stationSection = stdout.split('=== Player Facilities ===')[0] ?? stdout;
  const stationTableHeader = stationSection
    .split('\n')
    .find((line) => line.includes('Name') && line.includes('ID') && line.includes('Level'));

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Bunker-Fed Reactor');
  expect(stationTableHeader).toBeDefined();
  expect(stationTableHeader).toContain('Req. stock');
  expect(stdout).toContain('55 fuel stock');
  expect(stdout).not.toContain('fuel/cycle');
});

test('renders facility req. stock with fuel plus item maintenance together', () => {
  const facilityList = structuredClone(facilityListFixture) as Record<string, unknown>;
  const stationFacilities = facilityList.station_facilities as Array<Record<string, unknown>>;
  stationFacilities.push({
    facility_id: 'hybrid-plant',
    type: 'hybrid_plant',
    name: 'Hybrid Plant',
    category: 'infrastructure',
    level: 1,
    maintenance_fuel: 10,
    maintenance_per_cycle: [{ item_id: 'iron_ore', name: 'Iron', quantity: 2 }],
  });

  const rendered = renderStructuredResult('facility_list', facilityList, options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Hybrid Plant');
  expect(stdout).toContain('10 fuel stock, 2 Iron');
});

test('renders facility maintenance_inputs when maintenance_per_cycle is absent', () => {
  const facilityList = structuredClone(facilityListFixture) as Record<string, unknown>;
  facilityList.station_facilities = [
    {
      facility_id: 'catalog-shaped',
      type: 'ore_refinery',
      name: 'Catalog-Shaped Plant',
      category: 'production',
      level: 1,
      maintenance_inputs: [
        { item_id: 'steel_plate', name: 'Steel Plate', quantity: 3 },
        { item_id: 'durasteel_plate', quantity: 2 },
      ],
    },
  ];
  facilityList.player_facilities = [];
  facilityList.faction_facilities = [];
  facilityList.public_facilities = [];

  const rendered = renderStructuredResult('facility_list', facilityList, options, context);
  const stdout = rendered.stdout.join('\n');
  const stationSection = stdout.split('=== Public Facilities ===')[0] ?? stdout;
  const stationTableHeader = stationSection
    .split('\n')
    .find((line) => line.includes('Name') && line.includes('ID') && line.includes('Level'));

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Catalog-Shaped Plant');
  expect(stationTableHeader).toBeDefined();
  expect(stationTableHeader).toContain('Req. stock');
  expect(stdout).toContain('3 Steel Plate');
  expect(stdout).toContain('2 durasteel_plate');
});

test('omits facility table Req. stock column when no maintenance fields are present', () => {
  const facilityList = structuredClone(facilityListFixture) as Record<string, unknown>;
  facilityList.station_facilities = [
    {
      facility_id: 'bare-facility',
      type: 'fuel_bunker',
      name: 'Bare Bunker',
      category: 'service',
      level: 1,
    },
  ];
  facilityList.player_facilities = [];
  facilityList.faction_facilities = [];
  facilityList.public_facilities = [];

  const rendered = renderStructuredResult('facility_list', facilityList, options, context);
  const stdout = rendered.stdout.join('\n');
  const stationSection = stdout.split('=== Public Facilities ===')[0] ?? stdout;
  const stationTableHeader = stationSection
    .split('\n')
    .find((line) => line.includes('Name') && line.includes('ID') && line.includes('Level'));

  expect(rendered.success).toBe(true);
  expect(stationTableHeader).toBeDefined();
  expect(stationTableHeader).toContain('Name');
  expect(stationTableHeader).not.toContain('Req. stock');
  // Bare maintenance column header "Upkeep" must also be absent (not Tourism Upkeep).
  expect(stationTableHeader).not.toMatch(/(^|\|)\s*Upkeep\s*(\||$)/);
  // Life support may still print "Upkeep every N ticks" outside facility tables.
  expect(stdout).toContain('Life Support');
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

test('facilityBillingPaused is an allowlist, not status != active', () => {
  expect(facilityBillingPaused({ status: 'repairing' })).toBe(true);
  expect(facilityBillingPaused({ status: 'damaged' })).toBe(true);
  expect(facilityBillingPaused({ status: 'under_construction' })).toBe(true);
  expect(facilityBillingPaused({ status: 'dismantling' })).toBe(true);
  expect(facilityBillingPaused({ damaged: true })).toBe(true);
  expect(facilityBillingPaused({ under_construction: true })).toBe(true);
  expect(facilityBillingPaused({ dismantling: true })).toBe(true);
  expect(facilityBillingPaused({ status: 'enabled' })).toBe(false);
  expect(facilityBillingPaused({ status: 'disabled' })).toBe(false);
  expect(facilityBillingPaused({ status: 'active' })).toBe(false);
  expect(facilityBillingPaused({})).toBe(false);
  expect(withPausedRentSuffix('1200', { status: 'enabled' })).toBe('1200');
  expect(withPausedRentSuffix('1,200cr', { status: 'damaged' })).toBe('1,200cr (paused)');
});

test('grouped facility_list restyles Damaged to yes/no on the player-refinery row', () => {
  const stdout = renderStructuredResult(
    'facility_list',
    structuredClone(facilityListFixture),
    options,
    context,
  ).stdout.join('\n');
  const player = sectionAfter(stdout, 'Player Facilities', 'Faction Facilities');
  const station = sectionAfter(stdout, 'Station Facilities', 'Player Facilities');
  const faction = sectionAfter(stdout, 'Faction Facilities');

  expect(player).toContain('Damaged');
  expect(tableCell(player, 'player-refinery', 'Damaged')).toBe('yes');
  const stationHeader = station.split('\n').find((line) => line.includes('Name') && line.includes('ID'));
  const factionHeader = faction.split('\n').find((line) => line.includes('Name') && line.includes('ID'));
  expect(stationHeader).toBeDefined();
  expect(factionHeader).toBeDefined();
  expect(stationHeader).not.toContain('Damaged');
  expect(factionHeader).not.toContain('Damaged');
  expect(stdout).not.toContain('Dismantling');
});

test('simple facility_list omits Damaged and Dismantling columns', () => {
  const stdout = renderStructuredResult(
    'facility_list',
    structuredClone(facilityListSimpleFixture),
    options,
    context,
  ).stdout.join('\n');
  expect(stdout).not.toMatch(/\|\s*Damaged\s*\|/);
  expect(stdout).not.toContain('Dismantling');
});

test('grouped facility_list grows a Dismantling yes column when the flag is present', () => {
  const fixture = structuredClone(facilityListFixture) as Record<string, unknown>;
  const playerFacilities = fixture.player_facilities as Array<Record<string, unknown>>;
  if (!playerFacilities[0]) throw new Error('Player facility fixture is incomplete.');
  playerFacilities[0].dismantling = true;
  const stdout = renderStructuredResult('facility_list', fixture, options, context).stdout.join('\n');
  const player = sectionAfter(stdout, 'Player Facilities', 'Faction Facilities');
  expect(player).toContain('Dismantling');
  expect(tableCell(player, 'player-refinery', 'Dismantling')).toBe('yes');
});

test('grouped facility_list suffixes paused rent without switching to 1,200cr', () => {
  const fixture = structuredClone(facilityListFixture) as Record<string, unknown>;
  const playerFacilities = fixture.player_facilities as Array<Record<string, unknown>>;
  if (!playerFacilities[0]) throw new Error('Player facility fixture is incomplete.');
  playerFacilities[0].rent_per_cycle = 1200;
  const stdout = renderStructuredResult('facility_list', fixture, options, context).stdout.join('\n');
  const player = sectionAfter(stdout, 'Player Facilities', 'Faction Facilities');
  const faction = sectionAfter(stdout, 'Faction Facilities');
  expect(tableCell(player, 'player-refinery', 'Damaged')).toBe('yes');
  expect(tableCell(player, 'player-refinery', 'Rent/cycle')).toBe('1200 (paused)');
  expect(tableCell(faction, 'faction-smelter', 'Rent/cycle')).toBe('1200');
  expect(stdout).not.toContain('1,200cr (paused)');
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

test('facility_list prints personal and faction rent bills from separate sources', () => {
  const both = structuredClone(facilityListFixture) as Record<string, unknown>;
  both.player_rent = {
    facilities: 1,
    total_rent_per_cycle: 400,
    arrears_owed: 100,
    grace_cycles: 2,
    est_rent_per_day: 2400,
    note: 'Personal facilities pay rent from your wallet each cycle.',
  };
  const bothStdout = renderStructuredResult('facility_list', both, options, context).stdout.join('\n');
  const personalIdx = bothStdout.indexOf('Personal rent bill:');
  const factionIdx = bothStdout.indexOf('Faction rent bill:');
  const factionArrearsIdx = bothStdout.indexOf('Faction arrears:');
  expect(personalIdx).toBeGreaterThan(-1);
  expect(factionIdx).toBeGreaterThan(personalIdx);
  expect(factionArrearsIdx).toBeGreaterThan(factionIdx);
  expect(bothStdout.slice(personalIdx, factionIdx)).toContain('Arrears: 100cr');
  expect(bothStdout.slice(personalIdx, factionIdx)).not.toContain('Faction arrears');
  expect(bothStdout).toContain('Personal rent bill: 400cr/cycle');
  expect(bothStdout).toContain('Faction rent bill: 1,200cr/cycle');

  const personalOnly = structuredClone(facilityListFixture) as Record<string, unknown>;
  delete personalOnly.faction_rent;
  personalOnly.player_rent = {
    facilities: 1,
    total_rent_per_cycle: 400,
    arrears_owed: 100,
    note: 'Personal facilities pay rent from your wallet each cycle.',
  };
  const personalStdout = renderStructuredResult('facility_list', personalOnly, options, context).stdout.join('\n');
  expect(personalStdout).toContain('Personal rent bill: 400cr/cycle');
  expect(personalStdout).toContain('Arrears: 100cr');
  expect(personalStdout).not.toContain('Faction rent bill');
  expect(personalStdout).not.toContain('Faction arrears');
});

test('facility_owned does not print a rent bill', () => {
  const stdout = renderStructuredResult(
    'facility_owned',
    structuredClone(facilityOwnedFixture),
    options,
    context,
  ).stdout.join('\n');
  expect(stdout).toContain('Ore Refinery');
  expect(stdout).not.toContain('Faction rent bill');
  expect(stdout).not.toContain('Personal rent bill');
  expect(stdout).not.toContain('Faction arrears');
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

test('owned facility tables separate display names from build type keys', () => {
  const owned = renderStructuredResult(
    'facility_owned',
    {
      action: 'owned',
      facilities: [
        {
          facility_id: 'facility-1',
          type: 'ore_refinery',
          name: 'Ore Refinery',
          custom_name: 'Frontier Smelter',
          base_id: 'earth_station',
          base_name: 'Earth Station',
          rent_per_cycle: 10,
        },
      ],
      rent: { facilities: 1, total_rent_per_cycle: 10, est_rent_per_day: 60 },
    },
    options,
    context,
  );
  const faction = renderStructuredResult(
    'faction_facility_owned',
    structuredClone(factionFacilityOwnedFixture),
    options,
    context,
  );

  expect(owned.stdout.join('\n')).toMatch(/Name\s+\|\s+Type\s+\|\s+ID/);
  expect(owned.stdout.join('\n')).toContain('Frontier Smelter (Ore Refinery)');
  expect(owned.stdout.join('\n')).toContain('ore_refinery');
  expect(faction.stdout.join('\n')).toMatch(/Name\s+\|\s+Type\s+\|\s+ID\s+\|\s+Station/);
  expect(faction.stdout.join('\n')).toContain('faction_shipyard_berth');
});

test('owned facility tables omit malformed build type keys', () => {
  const rendered = renderStructuredResult(
    'facility_owned',
    {
      action: 'owned',
      facilities: [
        {
          facility_id: 'facility-1',
          type: {},
        },
      ],
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  expect(rendered.stdout.join('\n')).not.toContain('[object Object]');
});

test('facility list prefers numeric maintenance level and falls back to boolean state', () => {
  const fixture = structuredClone(facilityListFixture) as Record<string, unknown>;
  const station = fixture.station_facilities as Array<Record<string, unknown>>;
  if (!station[0] || !station[1]) throw new Error('Facility fixture is incomplete.');
  station[0].maintenance_level = 0.6;
  station[1].maintenance_level = 'invalid';

  const rendered = renderStructuredResult('facility_list', fixture, options, context);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('60%');
  expect(stdout).toContain('false');
  expect(stdout).not.toContain('NaN');
});

test('facility maintenance level formats finite percentages without leaking malformed values', () => {
  const rendered = renderStructuredResult(
    'facility_list',
    {
      action: 'list',
      base_id: 'earth_station',
      station_facilities: [
        { facility_id: 'zero', name: 'Zero', maintenance_level: 0, maintenance_satisfied: true },
        { facility_id: 'full', name: 'Full', maintenance_level: 1, maintenance_satisfied: false },
        { facility_id: 'integral', name: 'Integral', maintenance_level: 0.29 },
        { facility_id: 'non-integral', name: 'Non-integral', maintenance_level: 0.2904 },
        { facility_id: 'partial', name: 'Partial', maintenance_level: 0.605 },
        { facility_id: 'fallback', name: 'Fallback', maintenance_level: Number.NaN, maintenance_satisfied: false },
        { facility_id: 'malformed', name: 'Malformed', maintenance_level: {} },
      ],
      player_facilities: [],
      faction_facilities: [],
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('0%');
  expect(stdout).toContain('100%');
  expect(stdout).toMatch(/Integral\s+\|\s+integral\s+\|[^\n]*29%/);
  expect(stdout).not.toMatch(/Integral\s+\|\s+integral\s+\|[^\n]*29\.0%/);
  expect(stdout).toMatch(/Non-integral\s+\|\s+non-integral\s+\|[^\n]*29\.0%/);
  expect(stdout).toContain('60.5%');
  expect(stdout).toMatch(/Fallback\s+\|\s+fallback\s+\|[^\n]*false/);
  expect(stdout).not.toContain('NaN');
  expect(stdout).not.toContain('undefined');
  expect(stdout).not.toContain('[object Object]');
});

test('facility list ignores malformed boolean maintenance fallback', () => {
  const rendered = renderStructuredResult(
    'facility_list',
    {
      action: 'list',
      base_id: 'earth_station',
      station_facilities: [{ facility_id: 'malformed', name: 'Malformed', maintenance_satisfied: {} }],
      player_facilities: [],
      faction_facilities: [],
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).not.toContain('Maint');
  expect(stdout).not.toContain('[object Object]');
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

test('faction_facility_owned clone shows Damaged, Building, and Dismantling as yes', () => {
  const fixture = structuredClone(factionFacilityOwnedFixture) as Record<string, unknown>;
  const facilities = fixture.facilities as Array<Record<string, unknown>>;
  if (!facilities[0]) throw new Error('Faction facility fixture is incomplete.');
  facilities[0].damaged = true;
  facilities[0].under_construction = true;
  facilities[0].dismantling = true;
  const stdout = renderStructuredResult('faction_facility_owned', fixture, options, context).stdout.join('\n');
  const section = sectionAfter(stdout, 'Faction Facilities');
  expect(tableCell(section, 'faction-yard-1', 'Damaged')).toBe('yes');
  expect(tableCell(section, 'faction-yard-1', 'Building')).toBe('yes');
  expect(tableCell(section, 'faction-yard-1', 'Dismantling')).toBe('yes');
  expect(tableCell(section, 'faction-yard-1', 'Rent')).toBe('1,200cr (paused)');
  expect(stdout).toContain('Faction rent bill: 1,200cr/cycle');
  expect(stdout).toContain('Faction arrears: 2,400cr');
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

function expectNoPersonnelCounts(stdout: string): void {
  expect(stdout).not.toContain('fit_crew');
  expect(stdout).not.toContain('fit_marines');
  expect(stdout).not.toMatch(/injured_/);
}

function renderBattleStatus(fixture: Record<string, unknown>): string {
  const rendered = renderStructuredResult('get_battle_status', fixture, options, context);
  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).not.toContain('=== Response ===');
  return stdout;
}

test('get_battle_status omits Boarding when boarding is absent or empty', () => {
  const stdout = renderBattleStatus(structuredClone(battleStatusFixture) as Record<string, unknown>);
  expect(stdout).toContain('=== Participants ===');
  expect(stdout).not.toContain('=== Boarding ===');
  expectNoPersonnelCounts(stdout);

  const empty = structuredClone(battleStatusFixture) as Record<string, unknown>;
  empty.boarding = [];
  expect(renderBattleStatus(empty)).not.toContain('=== Boarding ===');
});

test('get_battle_status prints qualitative boarding after participants', () => {
  const stdout = renderBattleStatus(structuredClone(battleStatusBoardingFixture) as Record<string, unknown>);
  const boarding = stdout.split('=== Boarding ===')[1] ?? '';

  expect(stdout.indexOf('=== Participants ===')).toBeLessThan(stdout.indexOf('=== Boarding ==='));
  expect(boarding).toContain('board-1');
  expect(boarding).toContain('breach');
  expect(boarding).toContain('40%');
  expect(boarding).toContain('player-1');
  expect(boarding).toContain('pirate-1');
  expect(boarding).toContain('3');
  expect(boarding).toContain('Progress');
  expect(boarding).toContain('Self-destruct');
  expect(boarding).not.toContain('Event');
  expectNoPersonnelCounts(stdout);
});

test('get_battle_status ignores a synthetic boarding event and still has no Event column', () => {
  const fixture = structuredClone(battleStatusBoardingFixture) as Record<string, unknown>;
  fixture.boarding = [
    {
      ...(battleStatusBoardingFixture.boarding[0] as Record<string, unknown>),
      event: 'plundered',
    },
  ];
  const boarding = renderBattleStatus(fixture).split('=== Boarding ===')[1] ?? '';

  expect(boarding).toContain('board-1');
  expect(boarding).toContain('breach');
  expect(boarding).not.toContain('Event');
  expect(boarding).not.toContain('plundered');
});

test('get_battle_status reads boarding nested on battle and ignores personnel counts', () => {
  const fixture = {
    battle: {
      ...(structuredClone(battleStatusFixture) as Record<string, unknown>),
      boarding: [
        {
          operation_id: 'board-nested',
          phase: 'latch',
          attacker_id: 'player-1',
          target_id: 'pirate-1',
          fit_crew: 4,
          fit_marines: 2,
          injured_crew: 1,
          injured_marines: 0,
        },
      ],
    },
  };
  const stdout = renderBattleStatus(fixture);
  const boarding = stdout.split('=== Boarding ===')[1] ?? '';

  expect(boarding).toContain('board-nested');
  expect(boarding).toContain('latch');
  expect(boarding).not.toContain('Progress');
  expect(boarding).not.toContain('Self-destruct');
  expectNoPersonnelCounts(stdout);
  expect(boarding).not.toContain('4');
  expect(boarding).not.toContain('2');
});

test('get_battle_status omits optional boarding columns when those fields are absent', () => {
  const fixture = structuredClone(battleStatusFixture) as Record<string, unknown>;
  fixture.boarding = [{ operation_id: 'board-lean', phase: 'hold' }];
  const boarding = renderBattleStatus(fixture).split('=== Boarding ===')[1] ?? '';

  expect(boarding).toContain('board-lean');
  expect(boarding).toContain('hold');
  expect(boarding).not.toContain('Progress');
  expect(boarding).not.toContain('Attacker');
  expect(boarding).not.toContain('Target');
  expect(boarding).not.toContain('Self-destruct');
});

function battleParticipants(fixture: Record<string, unknown>): Array<Record<string, unknown>> {
  const participants = fixture.participants as Array<Record<string, unknown>> | undefined;
  if (!participants) throw new Error('Battle status fixture is missing participants.');
  return participants;
}

function participantsHeader(stdout: string): string | undefined {
  return sectionAfter(stdout, 'Participants')
    .split('\n')
    .find((line) => line.includes('|') && line.includes('Name') && line.includes('ID'));
}

test('get_battle_status prints NPC yes/no after Kind and never a Boss column', () => {
  const stdout = renderBattleStatus(structuredClone(battleStatusFixture) as Record<string, unknown>);
  const section = sectionAfter(stdout, 'Participants');
  const header = participantsHeader(stdout);

  expect(header).toBeDefined();
  expect(header).toContain('Kind');
  expect(header).toContain('NPC');
  expect(header).not.toContain('Boss');
  expect(header?.indexOf('Kind') ?? -1).toBeLessThan(header?.indexOf('NPC') ?? -1);
  expect(tableCell(section, 'Marlowe', 'Kind')).toBe('player');
  expect(tableCell(section, 'Marlowe', 'NPC')).toBe('no');
  expect(tableCell(section, 'Pirate Skiff', 'NPC')).toBe('yes');
  expect(tableCell(section, 'Pilot Whale', 'NPC')).toBe('yes');
  expect(tableCell(section, 'Earth Station', 'NPC')).toBe('yes');
  expect(stdout).not.toMatch(/\bfalse\b/);
});

test('get_battle_status ignores rogue is_boss on a participant', () => {
  const fixture = structuredClone(battleStatusFixture) as Record<string, unknown>;
  const pirate = battleParticipants(fixture).find((row) => row.player_id === 'pirate-1');
  if (!pirate) throw new Error('Pirate participant is missing.');
  pirate.is_boss = true;
  const stdout = renderBattleStatus(fixture);
  const section = sectionAfter(stdout, 'Participants');
  const header = participantsHeader(stdout);

  expect(header).toContain('NPC');
  expect(header).not.toContain('Boss');
  expect(tableCell(section, 'Pirate Skiff', 'NPC')).toBe('yes');
  expect(tableCell(section, 'Marlowe', 'NPC')).toBe('no');
});

test('get_battle_status omits NPC when every participant lacks is_npc', () => {
  const fixture = structuredClone(battleStatusFixture) as Record<string, unknown>;
  for (const row of battleParticipants(fixture)) delete row.is_npc;
  const header = participantsHeader(renderBattleStatus(fixture));

  expect(header).toContain('Kind');
  expect(header).not.toContain('NPC');
  expect(header).not.toContain('Boss');
});

test('get_battle_status mixed is_npc page blanks omitted rows instead of no', () => {
  const fixture = structuredClone(battleStatusFixture) as Record<string, unknown>;
  for (const row of battleParticipants(fixture)) {
    if (row.player_id === 'pirate-1') row.is_npc = true;
    else delete row.is_npc;
  }
  const stdout = renderBattleStatus(fixture);
  const section = sectionAfter(stdout, 'Participants');
  const header = participantsHeader(stdout);

  expect(header).toContain('NPC');
  expect(tableCell(section, 'Pirate Skiff', 'NPC')).toBe('yes');
  expect(tableCell(section, 'Marlowe', 'NPC')).toBe('');
  expect(tableCell(section, 'Pilot Whale', 'NPC')).toBe('');
  expect(tableCell(section, 'Earth Station', 'NPC')).toBe('');
});

test('get_battle_status prize row shows Kind prize and NPC yes', () => {
  const fixture = structuredClone(battleStatusFixture) as Record<string, unknown>;
  battleParticipants(fixture).push({
    player_id: 'prize-1',
    username: 'Abandoned Skiff',
    side_id: 2,
    kind: 'prize',
    is_npc: true,
    auto_pilot: true,
  });
  const section = sectionAfter(renderBattleStatus(fixture), 'Participants');

  expect(tableCell(section, 'prize-1', 'Kind')).toBe('prize');
  expect(tableCell(section, 'prize-1', 'NPC')).toBe('yes');
});

test('get_battle_status JSON passthrough keeps is_npc false', () => {
  const rendered = renderStructuredResult(
    'get_battle_status',
    structuredClone(battleStatusFixture),
    { ...options, format: 'json' },
    context,
  );
  const parsed = JSON.parse(rendered.stdout.join('\n')) as Record<string, unknown>;
  const participants = parsed.participants as Array<Record<string, unknown>>;

  expect(participants[0]?.is_npc).toBe(false);
  expect(participants[1]?.is_npc).toBe(true);
});

test('get_battle_summary shows Has Station yes when has_station is true', () => {
  const rendered = renderStructuredResult(
    'get_battle_summary',
    structuredClone(battleSummaryFixture),
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Has Station: yes');
  expect(stdout).not.toContain('=== Response ===');
});

test('get_battle_summary shows Has Station no when has_station is false', () => {
  const fixture = structuredClone(battleSummaryFixture) as Record<string, unknown>;
  fixture.has_station = false;
  const stdout = renderStructuredResult('get_battle_summary', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Has Station: no');
});

test('get_battle_summary omits Has Station when has_station is absent', () => {
  const fixture = structuredClone(battleSummaryFixture) as Record<string, unknown>;
  delete fixture.has_station;
  const stdout = renderStructuredResult('get_battle_summary', fixture, options, context).stdout.join('\n');

  expect(stdout).not.toContain('Has Station:');
});

test('get_battle_summary interrupted fixture prints Outcome and omits Winning Side and Destroyed', () => {
  const stdout = renderStructuredResult(
    'get_battle_summary',
    structuredClone(battleSummaryInterruptedFixture),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Outcome: interrupted');
  expect(stdout).not.toContain('Winning Side:');
  expect(stdout).not.toContain('\nDestroyed:');
  expect(stdout).not.toContain('-1');
  expect(stdout).not.toContain('=== Response ===');
});

test('get_battle_summary interrupted JSON passthrough keeps winning_side -1', () => {
  const rendered = renderStructuredResult(
    'get_battle_summary',
    structuredClone(battleSummaryInterruptedFixture),
    { ...options, format: 'json' },
    context,
  );
  const parsed = JSON.parse(rendered.stdout.join('\n')) as Record<string, unknown>;

  expect(parsed.winning_side).toBe(-1);
  expect(parsed.outcome).toBe('interrupted');
  expect(parsed.ships_destroyed).toBe(0);
  expect(parsed).not.toHaveProperty('destroyed_names');
});

test('get_battle_summary omits Winning Side on stalemate winning_side -1', () => {
  const fixture = structuredClone(battleSummaryFixture) as Record<string, unknown>;
  fixture.outcome = 'stalemate';
  fixture.winning_side = -1;
  fixture.ships_destroyed = 0;
  delete fixture.destroyed_names;
  const stdout = renderStructuredResult('get_battle_summary', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Outcome: stalemate');
  expect(stdout).not.toContain('Winning Side:');
  expect(stdout).not.toContain('-1');
  expect(stdout).not.toContain('=== Response ===');
});

test('get_battle_summary still prints Winning Side: 1 on victory', () => {
  const stdout = renderStructuredResult(
    'get_battle_summary',
    structuredClone(battleSummaryFixture),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Winning Side: 1');
});

test("get_battle_summary omits Winning Side when winning_side is the string '-1'", () => {
  const fixture = structuredClone(battleSummaryFixture) as Record<string, unknown>;
  fixture.outcome = 'stalemate';
  fixture.winning_side = '-1';
  const stdout = renderStructuredResult('get_battle_summary', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Outcome: stalemate');
  expect(stdout).not.toContain('Winning Side:');
});

test('get_battle_summary JSON passthrough keeps winning_side -1', () => {
  const fixture = structuredClone(battleSummaryFixture) as Record<string, unknown>;
  fixture.outcome = 'stalemate';
  fixture.winning_side = -1;
  const rendered = renderStructuredResult('get_battle_summary', fixture, { ...options, format: 'json' }, context);
  const parsed = JSON.parse(rendered.stdout.join('\n')) as Record<string, unknown>;

  expect(parsed.winning_side).toBe(-1);
  expect(parsed.outcome).toBe('stalemate');
});

test('get_battle_summary omits Winning Side on mutual_destruction with winning_side -1', () => {
  const fixture = structuredClone(battleSummaryFixture) as Record<string, unknown>;
  fixture.outcome = 'mutual_destruction';
  fixture.winning_side = -1;
  const stdout = renderStructuredResult('get_battle_summary', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Outcome: mutual_destruction');
  expect(stdout).not.toContain('Winning Side:');
});

test('get_battle_summary omits Winning Side on -1 without fabricating Outcome: stalemate', () => {
  const fixture = structuredClone(battleSummaryFixture) as Record<string, unknown>;
  delete fixture.outcome;
  fixture.winning_side = -1;
  const stdout = renderStructuredResult('get_battle_summary', fixture, options, context).stdout.join('\n');

  expect(stdout).not.toContain('Winning Side:');
  expect(stdout).not.toContain('Outcome: stalemate');
});

test('get_battle_summary prints Ships Captured 0 from the default fixture', () => {
  const stdout = renderStructuredResult(
    'get_battle_summary',
    structuredClone(battleSummaryFixture),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Ships Captured: 0');
  expect(stdout).not.toContain('=== Captures ===');
  expectNoPersonnelCounts(stdout);
});

test('get_battle_summary omits Ships Captured when ships_captured is absent', () => {
  const fixture = structuredClone(battleSummaryFixture) as Record<string, unknown>;
  delete fixture.ships_captured;
  const stdout = renderStructuredResult('get_battle_summary', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Ships Destroyed:');
  expect(stdout).not.toContain('Ships Captured:');
  expect(stdout).not.toContain('=== Captures ===');
});

test('get_battle_summary prints Captures identities after Ships Captured', () => {
  const stdout = renderStructuredResult(
    'get_battle_summary',
    structuredClone(battleSummaryCapturesFixture),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Ships Captured: 1');
  expect(stdout.indexOf('Ships Captured: 1')).toBeLessThan(stdout.indexOf('=== Captures ==='));
  expect(stdout).toContain('ship-skiff-1');
  expect(stdout).toContain('skiff');
  expect(stdout).toContain('Marlowe (player-1)');
  expect(stdout).toContain('Corsair-7 (pirate-1)');
  expect(stdout).toContain('board-1');
  expect(stdout).not.toContain('Kind');
  expectNoPersonnelCounts(stdout);
});

test('get_battle_summary Captures prints Kind after Captor for mixed captor_kind rows', () => {
  const stdout = renderBattleSummary(structuredClone(battleSummaryCapturesKindFixture) as Record<string, unknown>);
  const captures = sectionAfter(stdout, 'Captures', 'Sides');
  const header = captureHeader(captures);

  expect(stdout).toContain('Ships Captured: 4');
  expectCaptorThenKindThenFormerOwner(header);
  expect(captureCell(captures, 'ship-skiff-1', 'Kind')).toBe('player');
  expect(captureCell(captures, 'ship-skiff-2', 'Kind')).toBe('pirate');
  expect(captureCell(captures, 'ship-skiff-3', 'Kind')).toBe('npc');
  expect(captureCell(captures, 'ship-skiff-4', 'Kind')).toBe('');
  expect(captureCell(captures, 'ship-skiff-1', 'Captor')).toBe('Marlowe (player-1)');
  expect(captureCell(captures, 'ship-skiff-2', 'Captor')).toBe('Corsair (pirate-1)');
  expect(captureCell(captures, 'ship-skiff-3', 'Captor')).toBe('Sentinel (npc-1)');
  expect(captureCell(captures, 'ship-skiff-4', 'Captor')).toBe('Marlowe (player-1)');
  expectNoPersonnelCounts(stdout);
});

test('get_battle_summary Captures prints PLAYER as player and unknown herald as-is', () => {
  const playerStdout = renderBattleSummary(battleSummaryCapturesClone({ captor_kind: 'PLAYER' }));
  const playerCaptures = sectionAfter(playerStdout, 'Captures', 'Sides');
  expectCaptorThenKindThenFormerOwner(captureHeader(playerCaptures));
  expect(captureCell(playerCaptures, 'ship-skiff-1', 'Kind')).toBe('player');
  expect(captureCell(playerCaptures, 'ship-skiff-1', 'Captor')).toBe('Marlowe (player-1)');

  const pirateStdout = renderBattleSummary(battleSummaryCapturesClone({ captor_kind: ' Pirate ' }));
  expect(captureCell(sectionAfter(pirateStdout, 'Captures', 'Sides'), 'ship-skiff-1', 'Kind')).toBe('pirate');

  const heraldStdout = renderBattleSummary(battleSummaryCapturesClone({ captor_kind: 'herald' }));
  expect(captureCell(sectionAfter(heraldStdout, 'Captures', 'Sides'), 'ship-skiff-1', 'Kind')).toBe('herald');
});

test('get_battle_summary Captures blanks whitespace and non-string captor_kind cells', () => {
  const fixture = structuredClone(battleSummaryCapturesKindFixture) as Record<string, unknown>;
  const captures = fixture.captures as Array<Record<string, unknown>>;
  captureRow(captures, 0).captor_kind = '   ';
  captureRow(captures, 1).captor_kind = { kind: 'pirate' };
  captureRow(captures, 2).captor_kind = 1;
  captureRow(captures, 3).captor_kind = 'player';
  const stdout = renderBattleSummary(fixture);
  const section = sectionAfter(stdout, 'Captures', 'Sides');
  expectCaptorThenKindThenFormerOwner(captureHeader(section));
  expect(captureCell(section, 'ship-skiff-1', 'Kind')).toBe('');
  expect(captureCell(section, 'ship-skiff-2', 'Kind')).toBe('');
  expect(captureCell(section, 'ship-skiff-3', 'Kind')).toBe('');
  expect(captureCell(section, 'ship-skiff-4', 'Kind')).toBe('player');
});

test('get_battle_summary Captures omits Kind when every row lacks captor_kind', () => {
  const stdout = renderBattleSummary(structuredClone(battleSummaryCapturesFixture) as Record<string, unknown>);
  const header = captureHeader(sectionAfter(stdout, 'Captures', 'Sides'));
  expect(header).toBeDefined();
  expect(header).toContain('Captor');
  expect(header).not.toContain('Kind');
  expectNoPersonnelCounts(stdout);
});

test('get_battle_summary omits empty captures table', () => {
  const fixture = structuredClone(battleSummaryFixture) as Record<string, unknown>;
  fixture.ships_captured = 0;
  fixture.captures = [];
  const stdout = renderStructuredResult('get_battle_summary', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Ships Captured: 0');
  expect(stdout).not.toContain('=== Captures ===');
});

function renderBattleLog(fixture: Record<string, unknown>): string {
  const rendered = renderStructuredResult('get_battle_log', fixture, options, context);
  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).not.toContain('=== Response ===');
  return stdout;
}

function leftoverDefenseComponent(): Record<string, unknown> {
  return {
    weapon_instance_id: 'w-leftover',
    weapon_name: 'Ghost Cannon',
    damage_type: 'energy',
    incoming_damage: 400,
    shield_resist_pct: 5,
    after_shield_resist: 380,
    type_resist_pct: 5,
    after_type_resist: 360,
    flat_reduction_pct: 3,
    after_flat_reduction: 350,
    shield_bypass_pct: 0,
    armor_bypass_pct: 0,
    ignore_all_defense: false,
    final_damage: 350,
    shield_damage: 200,
    hull_damage: 150,
  };
}

test('get_battle_log renders shield/hull ticks, defense legend, and attacks without falling back', () => {
  const stdout = renderBattleLog(structuredClone(battleLogFixture) as Record<string, unknown>);

  expect(stdout).toContain('=== Battle Log ===');
  expect(stdout).toContain('=== Ticks ===');
  expect(stdout).toContain('Shield');
  expect(stdout).toContain('Hull');
  expect(stdout).toContain('=== Attacks ===');
  expect(stdout).toContain(
    'Defense: incoming→shield skill→typed resist→flat/adaptive (S# T# F#). S/H = shield/hull. Trailing flags may truncate.',
  );
  expect(stdout).toContain('Pulse Laser kinetic 500→470→455→440 (S6 T3 F3)');
  expect(stdout).toContain('chance 12% roll 81');
  expect(stdout).toContain('Railgun energy 400→380→360→350 (S5 T5 F3)');
  expect(stdout).toContain('Pulse Cannon kinetic 200→190→180→170 (S5 T5 F6)');
});

function battleLogTicksSection(stdout: string): string {
  return stdout.split('=== Ticks ===')[1]?.split('=== Attacks ===')[0] ?? '';
}

function withBattleEnded(
  fixture: Record<string, unknown>,
  battleEnded: Record<string, unknown>,
): Record<string, unknown> {
  const entries = fixture.entries as Array<Record<string, unknown>>;
  const entry = entries.at(1);
  if (!entry) throw new Error('expected ending battle log entry');
  entry.battle_ended = battleEnded;
  return fixture;
}

test('get_battle_log Ticks Ended prints fixture outcome instead of yes', () => {
  const stdout = renderBattleLog(structuredClone(battleLogFixture) as Record<string, unknown>);
  const ticks = battleLogTicksSection(stdout);

  expect(ticks).toContain('side_1_victory');
  expect(ticks).not.toMatch(/\|\s*yes\s*$/m);
  expect(ticks).not.toContain('| yes');
});

test('get_battle_log Ticks Ended prints stalemate outcome and not winning_side -1', () => {
  const fixture = withBattleEnded(structuredClone(battleLogFixture) as Record<string, unknown>, {
    outcome: 'stalemate',
    winning_side: -1,
  });
  const ticks = battleLogTicksSection(renderBattleLog(fixture));

  expect(ticks).toContain('stalemate');
  expect(ticks).not.toContain('-1');
});

test('get_battle_log Ticks Ended falls back to yes when battle_ended has no outcome', () => {
  const fixture = withBattleEnded(structuredClone(battleLogFixture) as Record<string, unknown>, {
    winning_side: -1,
  });
  const ticks = battleLogTicksSection(renderBattleLog(fixture));

  expect(ticks).toContain('yes');
});

test('get_battle_log JSON passthrough keeps nested winning_side -1', () => {
  const fixture = withBattleEnded(structuredClone(battleLogFixture) as Record<string, unknown>, {
    outcome: 'stalemate',
    winning_side: -1,
    total_damage: 8420,
  });
  const rendered = renderStructuredResult('get_battle_log', fixture, { ...options, format: 'json' }, context);
  const parsed = JSON.parse(rendered.stdout.join('\n')) as {
    entries: Array<{ battle_ended?: { winning_side?: unknown; outcome?: unknown } }>;
  };
  const ended = parsed.entries.at(1)?.battle_ended;

  expect(ended?.winning_side).toBe(-1);
  expect(ended?.outcome).toBe('stalemate');
});

test('get_battle_log miss with leftover defense_components stays one miss row', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-miss',
    status: 'completed',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 0,
        attacks: [
          {
            attacker_id: 'pirate-1',
            target_id: 'player-1',
            hit_success: false,
            final_damage: 0,
            shield_damage: 200,
            hull_damage: 150,
            hit_chance: 12,
            hit_roll: 81,
            defense_components: [leftoverDefenseComponent()],
          },
        ],
      },
    ],
  });

  const ticksSection = stdout.split('=== Ticks ===')[1]?.split('=== Attacks ===')[0] ?? '';

  expect(stdout).toContain('miss');
  expect(stdout).toContain('chance 12% roll 81');
  expect(stdout).not.toContain('Ghost Cannon');
  expect(stdout).not.toContain('400→380→360→350');
  expect(stdout).not.toContain('200/150');
  expect(stdout.match(/\| miss \|/g)?.length).toBe(1);
  expect(ticksSection).not.toContain('Shield');
  expect(ticksSection).not.toContain('Hull');
  expect(ticksSection).not.toContain('200');
  expect(ticksSection).not.toContain('150');
});

test('get_battle_log attack-level resist percents skip fabricated stage hops', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-fallback',
    status: 'active',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 3,
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            hit_success: true,
            raw_damage: 900,
            pre_hit_damage: 800,
            final_damage: 420,
            shield_damage: 300,
            hull_damage: 120,
            damage_type: 'kinetic',
            shield_resist_pct: 6,
            type_resist_pct: 3,
            flat_reduction_pct: 3,
          },
        ],
      },
    ],
  });

  expect(stdout).toContain('kinetic (S6 T3 F3)');
  expect(stdout).toContain('300/120');
  expect(stdout).not.toContain('900→');
  expect(stdout).not.toContain('800→');
  expect(stdout).not.toContain('→420');
});

test('get_battle_log uses weapons[0].name when defense_components are absent', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-weapon-name',
    status: 'active',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 2,
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            hit_success: true,
            final_damage: 90,
            shield_damage: 60,
            hull_damage: 30,
            damage_type: 'energy',
            weapons: [{ name: 'Ion Lance', instance_id: 'w-ion' }],
          },
        ],
      },
    ],
  });

  expect(stdout).toContain('Ion Lance energy');
  expect(stdout).toContain('60/30');
});

test('get_battle_log maps snapshot usernames and falls back to id when username is empty', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-names',
    status: 'active',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 0,
        snapshots: [
          { player_id: 'player-1', username: 'Ace' },
          { player_id: 'pirate-1', username: '' },
        ],
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            hit_success: true,
            final_damage: 10,
            shield_damage: 7,
            hull_damage: 3,
          },
        ],
      },
    ],
  });

  const attacks = sectionAfter(stdout, 'Attacks', 'Combatants');

  expect(attacks).toContain('Ace');
  expect(attacks).toContain('pirate-1');
  expect(attacks).not.toContain('player-1');
});

test('get_battle_log blanks Hit when hit_success is missing', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-no-hit-flag',
    status: 'active',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 4,
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            final_damage: 50,
            shield_damage: 20,
            hull_damage: 30,
            shield_resist_pct: 4,
          },
        ],
      },
    ],
  });

  expect(stdout).toContain('|     |');
  expect(stdout).toContain('20/30');
  expect(stdout).toContain('(S4)');
  expect(stdout).not.toContain('| hit |');
  expect(stdout).not.toContain('| miss |');
});

test('get_battle_log ticks do not double-count mixed-weapon component final_damage', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-mixed',
    status: 'active',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 1,
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            hit_success: true,
            final_damage: 520,
            shield_damage: 340,
            hull_damage: 180,
            defense_components: [
              leftoverDefenseComponent(),
              {
                ...leftoverDefenseComponent(),
                weapon_instance_id: 'w-cannon',
                weapon_name: 'Pulse Cannon',
                damage_type: 'kinetic',
                incoming_damage: 200,
                after_shield_resist: 190,
                after_type_resist: 180,
                after_flat_reduction: 170,
                flat_reduction_pct: 6,
                final_damage: 170,
                shield_damage: 140,
                hull_damage: 30,
              },
            ],
          },
        ],
      },
    ],
  });

  expect(stdout).toMatch(/\|\s*520\s*\|\s*340\s*\|\s*180\s*\|/);
  expect(stdout).not.toContain('1040');
  expect(stdout).toContain('200/150');
  expect(stdout).toContain('140/30');
});

test('get_battle_log keeps Shield/Hull 0 on a full absorb with blank Damage', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-absorb',
    status: 'active',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 0,
        attacks: [
          {
            attacker_id: 'pirate-1',
            target_id: 'player-1',
            hit_success: true,
            final_damage: 0,
            shield_damage: 0,
            hull_damage: 0,
            defense_components: [
              {
                ...leftoverDefenseComponent(),
                incoming_damage: 100,
                after_shield_resist: 0,
                after_type_resist: 0,
                after_flat_reduction: 0,
                final_damage: 0,
                shield_damage: 0,
                hull_damage: 0,
              },
            ],
          },
        ],
      },
    ],
  });

  expect(stdout).toMatch(/\|\s*1\s*\|\s*1\s*\|\s+\|\s*0\s*\|\s*0\s*\|/);
  expect(stdout).toContain('0/0');
});

test('get_battle_log omits Board Captures Casualties columns without those arrays', () => {
  const stdout = renderBattleLog(structuredClone(battleLogFixture) as Record<string, unknown>);
  const ticks = battleLogTicksSection(stdout);

  expect(ticks).not.toContain('Board');
  expect(ticks).not.toContain('Captures');
  expect(ticks).not.toContain('Casualties');
  expect(stdout).not.toContain('=== Boarding ===');
  expect(stdout).not.toContain('=== Captures ===');
  expect(stdout).not.toContain('=== Personnel casualties ===');
});

test('get_battle_log prints boarding detail tables after ticks when there are no attacks', () => {
  const stdout = renderBattleLog(structuredClone(battleLogBoardingFixture) as Record<string, unknown>);
  const ticks = battleLogTicksSection(stdout);

  expect(stdout).not.toContain('=== Attacks ===');
  expect(ticks).toContain('Board');
  expect(ticks).toContain('Captures');
  expect(ticks).toContain('Casualties');
  expect(stdout.indexOf('=== Ticks ===')).toBeLessThan(stdout.indexOf('=== Boarding ==='));
  expect(stdout.indexOf('=== Boarding ===')).toBeLessThan(stdout.indexOf('=== Captures ==='));
  expect(stdout.indexOf('=== Captures ===')).toBeLessThan(stdout.indexOf('=== Personnel casualties ==='));
  expect(stdout).toContain('board-1');
  expect(stdout).toContain('progress');
  expect(stdout).not.toContain('plundered (cargo taken, hull left)');
  expect(stdout).toContain('breach');
  expect(stdout).toContain('marines_committed');
  expect(stdout).toContain('yes attacker defender');
  expect(stdout).toContain('Marlowe (player-1)');
  expect(stdout).toContain('Corsair-7 (pirate-1)');
  expect(stdout).toContain('applied');
  expect(stdout).not.toContain('converted');
  expect(stdout).toContain('player-1 / ship-marlowe-1');
  expect(stdout).not.toContain('Kind');
  expectNoPersonnelCounts(stdout);
});

function boardingLogFixture(event: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    battle_id: 'battle-42',
    status: 'completed',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 3,
        boarding: [{ operation_id: 'board-1', event, phase: 'hold', ...extra }],
      },
    ],
  };
}

test('get_battle_log Event glosses plundered without truncating', () => {
  const stdout = renderBattleLog(structuredClone(battleLogPlunderedFixture) as Record<string, unknown>);
  const boarding = sectionAfter(stdout, 'Boarding');

  expect(boarding).toContain('plundered (cargo taken, hull left)');
  expect(boarding).not.toContain('hul...');
  expect(stdout).not.toContain('=== Captures ===');
  expect(stdout).not.toContain('=== Personnel casualties ===');
});

test('get_battle_log Event uses event_type when event is absent', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-42',
    status: 'completed',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 3,
        boarding: [{ operation_id: 'board-1', event_type: 'plundered', phase: 'hold' }],
      },
    ],
  });

  expect(sectionAfter(stdout, 'Boarding')).toContain('plundered (cargo taken, hull left)');
});

test('get_battle_log Event prints target_self_destructed without a gloss', () => {
  const boarding = sectionAfter(renderBattleLog(boardingLogFixture('target_self_destructed')), 'Boarding');

  expect(boarding).toContain('target_self_destructed');
  expect(boarding).not.toContain('(');
});

test('get_battle_log Event prints unknown live tokens as-is', () => {
  const boarding = sectionAfter(renderBattleLog(boardingLogFixture('weird_live_token')), 'Boarding');

  expect(boarding).toContain('weird_live_token');
});

test('get_battle_log boarding reason of 40 characters is not clipped', () => {
  const reason = 'x'.repeat(40);
  expect(reason.length).toBe(40);
  const boarding = sectionAfter(renderBattleLog(boardingLogFixture('progress', { reason })), 'Boarding');

  expect(boarding).toContain(reason);
  expect(boarding).not.toContain('...');
});

test('get_battle_log Captures prints Tick and Kind when a capture has captor_kind', () => {
  const fixture = structuredClone(battleLogBoardingFixture) as Record<string, unknown>;
  const entries = fixture.entries as Array<Record<string, unknown>>;
  const captures = entries[0]?.captures as Array<Record<string, unknown>>;
  captureRow(captures).captor_kind = 'pirate';
  const stdout = renderBattleLog(fixture);
  const section = sectionAfter(stdout, 'Captures', 'Personnel casualties');
  const header = captureHeader(section);

  expect(header).toContain('Tick');
  expectCaptorThenKindThenFormerOwner(header);
  expect(captureCell(section, 'ship-skiff-1', 'Kind')).toBe('pirate');
  expect(captureCell(section, 'ship-skiff-1', 'Captor')).toBe('Marlowe (player-1)');
  expectNoPersonnelCounts(stdout);
});

test('get_battle_log prints boarding tables after Attacks when both are present', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-board-attacks',
    status: 'active',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 4,
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            hit_success: true,
            final_damage: 50,
            shield_damage: 20,
            hull_damage: 30,
          },
        ],
        boarding: [
          { operation_id: 'board-2', event: 'latch', phase: 'latch', actor_id: 'player-1', target_id: 'pirate-1' },
        ],
        captures: [],
        personnel_casualties: [],
      },
    ],
  });

  expect(stdout.indexOf('=== Attacks ===')).toBeLessThan(stdout.indexOf('=== Boarding ==='));
  expect(stdout).toContain('board-2');
  expect(stdout).toContain('latch');
  const ticks = battleLogTicksSection(stdout);
  expect(ticks).toContain('Board');
  expect(ticks).not.toContain('Captures');
  expect(ticks).not.toContain('Casualties');
  expect(stdout).not.toContain('=== Captures ===');
  expect(stdout).not.toContain('=== Personnel casualties ===');
});

test('get_battle_log omits Board column when boarding is an empty array', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-empty-board',
    status: 'active',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 1,
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            hit_success: true,
            final_damage: 10,
            shield_damage: 6,
            hull_damage: 4,
          },
        ],
        boarding: [],
        captures: [],
        personnel_casualties: [],
      },
    ],
  });
  const ticks = battleLogTicksSection(stdout);

  expect(ticks).not.toContain('Board');
  expect(ticks).not.toContain('Captures');
  expect(ticks).not.toContain('Casualties');
  expect(stdout).not.toContain('=== Boarding ===');
});

test('get_battle_log casualty flags stay qualitative and hide false destroyed/incapacitated', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-flags',
    status: 'active',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 5,
        boarding: [
          {
            operation_id: 'board-3',
            event: 'hold',
            phase: 'hold',
            actor_id: 'player-1',
            target_id: 'pirate-1',
            destroyed: false,
            casualties_occurred: false,
            attacker_casualties: false,
            defender_casualties: true,
            crew_lost: 6,
            marines_lost: 3,
            fit_crew: 8,
            fit_marines: 4,
            injured_crew: 2,
          },
        ],
        personnel_casualties: [
          {
            target_id: 'pirate-1',
            casualties_occurred: false,
            incapacitated: false,
            triage_applied: false,
            triage_converted: true,
            crew_lost: 6,
            fit_crew: 8,
          },
        ],
      },
    ],
  });
  const boarding = stdout.split('=== Boarding ===')[1]?.split('=== Personnel casualties ===')[0] ?? '';
  const casualties = stdout.split('=== Personnel casualties ===')[1] ?? '';

  expect(boarding).toContain('defender');
  expect(boarding).not.toContain('Destroyed');
  expect(casualties).toContain('no');
  expect(casualties).not.toContain('Incapacitated');
  expect(casualties).toContain('converted');
  expect(casualties).not.toContain('applied');
  expectNoPersonnelCounts(stdout);
  expect(stdout).not.toContain('crew_lost');
  expect(stdout).not.toContain('marines_lost');
});

test('get_battle_log omits Attacks and legend when no attack objects exist', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-burns',
    status: 'active',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 8,
        burns: [{ target_id: 'pirate-1', damage: 20, ticks_remaining: 2 }],
        kills: [{ victim_id: 'pirate-1', killer_id: 'player-1' }],
      },
    ],
  });

  expect(stdout).toContain('=== Ticks ===');
  expect(stdout).not.toContain('=== Attacks ===');
  expect(stdout).not.toContain('incoming→shield skill');
});

test('get_battle_log omits Combatants when snapshots are omitted or empty', () => {
  const omitted = renderBattleLog(structuredClone(battleLogFixture) as Record<string, unknown>);
  expect(omitted).not.toContain('=== Combatants ===');

  const empty = renderBattleLog({
    battle_id: 'battle-empty-snapshots',
    status: 'active',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 0,
        snapshots: [],
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            hit_success: true,
            final_damage: 10,
            shield_damage: 7,
            hull_damage: 3,
          },
        ],
      },
    ],
  });
  expect(empty).toContain('=== Attacks ===');
  expect(empty).not.toContain('=== Combatants ===');
});

test('get_battle_log prints Combatants Kind/NPC/Boss and Boss prefix on Attacks', () => {
  const stdout = renderBattleLog(structuredClone(battleLogSnapshotsFixture) as Record<string, unknown>);
  const combatants = sectionAfter(stdout, 'Combatants');
  const attacks = sectionAfter(stdout, 'Attacks', 'Combatants');
  const header = combatants
    .split('\n')
    .find((line) => line.includes('|') && line.includes('Name') && line.includes('ID'));

  expect(stdout).toContain('=== Combatants ===');
  expect(stdout).not.toContain('=== Recovered Summary ===');
  expect(stdout.indexOf('=== Attacks ===')).toBeLessThan(stdout.indexOf('=== Combatants ==='));
  expect(header).toContain('Kind');
  expect(header).toContain('NPC');
  expect(header).toContain('Boss');
  expect(header?.indexOf('Kind') ?? -1).toBeLessThan(header?.indexOf('NPC') ?? -1);
  expect(header?.indexOf('NPC') ?? -1).toBeLessThan(header?.indexOf('Boss') ?? -1);
  expect(tableCell(combatants, 'Marlowe', 'Kind')).toBe('player');
  expect(tableCell(combatants, 'Marlowe', 'NPC')).toBe('no');
  expect(tableCell(combatants, 'Marlowe', 'Boss')).toBe('no');
  expect(tableCell(combatants, 'Corsair', 'Kind')).toBe('pirate');
  expect(tableCell(combatants, 'Corsair', 'NPC')).toBe('yes');
  expect(tableCell(combatants, 'Corsair', 'Boss')).toBe('no');
  expect(tableCell(combatants, 'Dreadnought', 'Kind')).toBe('pirate');
  expect(tableCell(combatants, 'Dreadnought', 'NPC')).toBe('yes');
  expect(tableCell(combatants, 'Dreadnought', 'Boss')).toBe('yes');
  expect(tableCell(combatants, 'Legacy Raider', 'Kind')).toBe('pirate');
  expect(tableCell(combatants, 'Legacy Raider', 'NPC')).toBe('');
  expect(tableCell(combatants, 'Legacy Raider', 'Boss')).toBe('');
  expect(attacks).toContain('Boss Dreadnought');
  expect(attacks).toContain('Marlowe');
  expect(attacks).not.toContain('pirate-boss-1');
  expect(attacks).not.toContain('player-1');
});

function battleLogTicksOnly(stdout: string): string {
  return (stdout.split('=== Ticks ===')[1] ?? '').split('===')[0] ?? '';
}

function recoveredSummaryOf(fixture: Record<string, unknown>): Record<string, unknown> {
  const entries = fixture.entries as Array<Record<string, unknown>>;
  const recovered = entries[0]?.recovered_summary;
  if (!recovered || typeof recovered !== 'object' || Array.isArray(recovered)) {
    throw new Error('expected recovered_summary record');
  }
  return recovered as Record<string, unknown>;
}

test('get_battle_log interrupted without recovered_summary only prints Ended interrupted', () => {
  const fixture = structuredClone(battleLogInterruptedFixture) as Record<string, unknown>;
  const entries = fixture.entries as Array<Record<string, unknown>>;
  delete entries[0]?.recovered_summary;
  const stdout = renderBattleLog(fixture);
  const ticks = battleLogTicksOnly(stdout);

  expect(ticks).toContain('interrupted');
  expect(ticks).not.toContain('-1');
  expect(stdout).not.toContain('=== Recovered Summary ===');
  expect(stdout).not.toContain('=== Recovered Participants ===');
  expect(stdout).not.toContain('=== Recovered Side Factions ===');
  expect(stdout).not.toContain('=== Recovered Captures ===');
  expect(stdout).not.toContain('=== Combatants ===');
  expect(stdout).not.toContain('Duration: 8 ticks');
  expect(stdout).not.toContain('Total Damage:');
  expect(stdout).not.toContain('Start Tick:');
  expect(stdout).not.toContain('Ships Destroyed:');
  expect(stdout).not.toContain('Winning Side:');
});

test('get_battle_log interrupted with recovered_summary prints recovered block and Ended interrupted', () => {
  const stdout = renderBattleLog(structuredClone(battleLogInterruptedFixture) as Record<string, unknown>);
  const ticks = battleLogTicksOnly(stdout);
  const recovered = sectionAfter(stdout, 'Recovered Summary', 'Recovered Side Factions');
  const participants = sectionAfter(stdout, 'Recovered Participants', 'Recovered Captures');

  expect(ticks).toContain('interrupted');
  expect(ticks).not.toContain('-1');
  expect(stdout).toContain('=== Recovered Summary ===');
  expect(recovered).toContain('Tick: 8');
  expect(recovered).toContain('Category: pvp');
  expect(recovered).toContain('Start Tick: 900100');
  expect(recovered).toContain('Duration: 8 ticks');
  expect(recovered).toContain('Total Damage: 1200');
  expect(recovered).toContain('Ships Destroyed: 0');
  expect(recovered).toContain('Ships Captured: 1');
  expect(recovered).not.toContain('Outcome:');
  expect(recovered).not.toContain('Winning Side:');
  expect(stdout).toContain('=== Recovered Side Factions ===');
  expect(stdout).toContain('SMC');
  expect(stdout).toContain('pirate_kael');
  expect(stdout).not.toContain('[object Object]');
  expect(stdout).toContain('=== Recovered Participants ===');
  expect(tableCell(participants, 'Marlowe', 'Kind')).toBe('player');
  expect(tableCell(participants, 'Marlowe', 'NPC')).toBe('no');
  expect(tableCell(participants, 'Marlowe', 'Boss')).toBe('no');
  expect(tableCell(participants, 'Dreadnought', 'Kind')).toBe('pirate');
  expect(tableCell(participants, 'Dreadnought', 'NPC')).toBe('yes');
  expect(tableCell(participants, 'Dreadnought', 'Boss')).toBe('yes');
  expect(stdout).toContain('=== Recovered Captures ===');
  expect(stdout).toContain('ship-skiff-1');
  expect(stdout).toContain('Marlowe (player-1)');
  expect(stdout).toContain('Corsair (pirate-1)');
  const recoveredCaptures = sectionAfter(stdout, 'Recovered Captures');
  const recoveredCapturesHeader = captureHeader(recoveredCaptures);
  expect(recoveredCapturesHeader).toBeDefined();
  expect(recoveredCapturesHeader).not.toContain('Kind');
  expect(recoveredCapturesHeader).toMatch(/Ship\s*\|\s*Class\s*\|\s*Captor\s*\|\s*Former owner\s*\|\s*Boarding/);
  expect(stdout).not.toContain('=== Combatants ===');
  expect(stdout).not.toContain('Players:');
});

test('get_battle_log recovered Captures prints Kind after Captor when a capture has captor_kind', () => {
  const fixture = structuredClone(battleLogInterruptedFixture) as Record<string, unknown>;
  const captures = recoveredSummaryOf(fixture).captures as Array<Record<string, unknown>>;
  captureRow(captures).captor_kind = 'pirate';
  const stdout = renderBattleLog(fixture);
  const participants = sectionAfter(stdout, 'Recovered Participants', 'Recovered Captures');
  const recoveredCaptures = sectionAfter(stdout, 'Recovered Captures');

  expect(tableCell(participants, 'Marlowe', 'Kind')).toBe('player');
  expect(tableCell(participants, 'Dreadnought', 'Kind')).toBe('pirate');
  expectCaptorThenKindThenFormerOwner(captureHeader(recoveredCaptures));
  expect(captureCell(recoveredCaptures, 'ship-skiff-1', 'Kind')).toBe('pirate');
  expect(captureCell(recoveredCaptures, 'ship-skiff-1', 'Captor')).toBe('Marlowe (player-1)');
  expectNoPersonnelCounts(stdout);
});

test('get_battle_log omits recovered block when recovered_summary is absent', () => {
  const stdout = renderBattleLog(structuredClone(battleLogFixture) as Record<string, unknown>);
  expect(stdout).not.toContain('=== Recovered Summary ===');
  expect(stdout).not.toContain('=== Recovered Participants ===');
  expect(stdout).not.toContain('=== Recovered Captures ===');
});

test('get_battle_log empty recovered captures and side_factions omit those tables', () => {
  const fixture = structuredClone(battleLogInterruptedFixture) as Record<string, unknown>;
  const recovered = recoveredSummaryOf(fixture);
  recovered.captures = [];
  recovered.side_factions = {};
  const stdout = renderBattleLog(fixture);

  expect(stdout).toContain('=== Recovered Summary ===');
  expect(stdout).toContain('=== Recovered Participants ===');
  expect(stdout).not.toContain('=== Recovered Captures ===');
  expect(stdout).not.toContain('=== Recovered Side Factions ===');
  expect(stdout).not.toContain('(None)');
});

test('get_battle_log prints recovered Players names only when participants are empty', () => {
  const named = structuredClone(battleLogInterruptedFixture) as Record<string, unknown>;
  const namedSummary = recoveredSummaryOf(named);
  namedSummary.participants = [];
  namedSummary.participant_names = ['Marlowe', 'Corsair'];
  namedSummary.captures = [];
  namedSummary.side_factions = {};
  const namedStdout = renderBattleLog(named);

  expect(namedStdout).toContain('Players: Marlowe, Corsair');
  expect(namedStdout).not.toContain('=== Recovered Participants ===');

  const rostered = structuredClone(battleLogInterruptedFixture) as Record<string, unknown>;
  recoveredSummaryOf(rostered).participant_names = ['Marlowe', 'Corsair'];
  const rosteredStdout = renderBattleLog(rostered);

  expect(rosteredStdout).toContain('=== Recovered Participants ===');
  expect(rosteredStdout).not.toContain('Players:');
});

test('get_battle_log recovered summary keeps zero scalars and omits absent ships_captured', () => {
  const zeros = structuredClone(battleLogInterruptedFixture) as Record<string, unknown>;
  const zeroSummary = recoveredSummaryOf(zeros);
  zeroSummary.start_tick = 0;
  zeroSummary.duration = 0;
  zeroSummary.total_damage = 0;
  zeroSummary.ships_destroyed = 0;
  zeroSummary.ships_captured = 0;
  const zeroStdout = renderBattleLog(zeros);
  const zeroBlock = sectionAfter(zeroStdout, 'Recovered Summary', 'Recovered Side Factions');

  expect(zeroBlock).toContain('Start Tick: 0');
  expect(zeroBlock).toContain('Duration: 0 ticks');
  expect(zeroBlock).toContain('Total Damage: 0');
  expect(zeroBlock).toContain('Ships Destroyed: 0');
  expect(zeroBlock).toContain('Ships Captured: 0');

  const omitted = structuredClone(battleLogInterruptedFixture) as Record<string, unknown>;
  delete recoveredSummaryOf(omitted).ships_captured;
  const omittedStdout = renderBattleLog(omitted);

  expect(omittedStdout).toContain('Ships Destroyed: 0');
  expect(omittedStdout).not.toContain('Ships Captured:');
});

test('get_battle_log emits one recovered block per entry that has recovered_summary', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-42',
    status: 'completed',
    total_ticks: 2,
    has_more: false,
    entries: [
      {
        battle_id: 'battle-42',
        system_id: 'sol',
        tick: 7,
        snapshots: [],
        recovered_summary: {
          start_tick: 1,
          duration: 1,
          total_damage: 10,
          ships_destroyed: 0,
          category: 'pvp',
          participants: [],
        },
      },
      {
        battle_id: 'battle-42',
        system_id: 'sol',
        tick: 8,
        snapshots: [],
        recovered_summary: {
          start_tick: 1,
          duration: 2,
          total_damage: 20,
          ships_destroyed: 0,
          category: 'pvp',
          participants: [],
        },
      },
    ],
  });

  expect(stdout.split('=== Recovered Summary ===').length - 1).toBe(2);
  expect(stdout).toContain('Tick: 7');
  expect(stdout).toContain('Tick: 8');
  expect(stdout).toContain('Duration: 1 ticks');
  expect(stdout).toContain('Duration: 2 ticks');
});

test('get_battle_log interrupted JSON passthrough keeps winning_side -1 and recovered_summary', () => {
  const rendered = renderStructuredResult(
    'get_battle_log',
    structuredClone(battleLogInterruptedFixture),
    { ...options, format: 'json' },
    context,
  );
  const parsed = JSON.parse(rendered.stdout.join('\n')) as {
    entries: Array<{
      battle_ended?: { winning_side?: unknown; outcome?: unknown };
      recovered_summary?: Record<string, unknown>;
    }>;
  };
  const entry = parsed.entries[0];

  expect(entry?.battle_ended?.winning_side).toBe(-1);
  expect(entry?.battle_ended?.outcome).toBe('interrupted');
  expect(entry?.recovered_summary).toMatchObject({
    category: 'pvp',
    duration: 8,
    ships_captured: 1,
  });
});

test('get_battle_log Combatants last-write identity while Attacks stay per-tick', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-last-write',
    status: 'active',
    total_ticks: 2,
    has_more: false,
    entries: [
      {
        tick: 0,
        snapshots: [
          { player_id: 'player-1', username: 'Ace', kind: 'player', is_npc: false, is_boss: false },
          { player_id: 'pirate-1', username: 'Raider', kind: 'pirate', is_npc: true, is_boss: false },
        ],
        attacks: [
          {
            attacker_id: 'pirate-1',
            target_id: 'player-1',
            hit_success: true,
            final_damage: 1,
            shield_damage: 1,
            hull_damage: 0,
          },
        ],
      },
      {
        tick: 1,
        snapshots: [{ player_id: 'pirate-1', username: 'Dreadnought', kind: 'pirate', is_npc: true, is_boss: true }],
        attacks: [
          {
            attacker_id: 'pirate-1',
            target_id: 'player-1',
            hit_success: true,
            final_damage: 2,
            shield_damage: 1,
            hull_damage: 1,
          },
        ],
      },
    ],
  });
  const combatants = sectionAfter(stdout, 'Combatants');
  const attacks = sectionAfter(stdout, 'Attacks', 'Combatants');

  expect(tableCell(combatants, 'Ace', 'NPC')).toBe('no');
  expect(tableCell(combatants, 'Ace', 'Boss')).toBe('no');
  expect(tableCell(combatants, 'Dreadnought', 'NPC')).toBe('yes');
  expect(tableCell(combatants, 'Dreadnought', 'Boss')).toBe('yes');
  expect(combatants).not.toContain('Raider');
  expect(attacks).toContain('Raider');
  expect(attacks).toContain('Boss Dreadnought');
});

test('faction_facility_list renders status, damaged yes/no, and custom names', () => {
  const rendered = renderStructuredResult(
    'faction_facility_list',
    structuredClone(factionFacilityListFixture),
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Faction: faction-1');
  expect(stdout).toContain('Faction Facilities at earth_station');
  expect(stdout).toMatch(/Status/);
  expect(stdout).toMatch(/Damaged/);
  expect(stdout).toContain('Repair Tick');
  expect(stdout).toContain('901412');
  expect(stdout).toContain('active');
  expect(stdout).toContain('damaged');
  expect(stdout).toContain('under_construction');
  expect(stdout).toContain('dismantling');
  expect(stdout).toContain('yes');
  expect(stdout).toContain('no');
  expect(stdout).toContain('800cr (paused)');
  expect(stdout).toContain('1,200cr (paused)');
  expect(stdout).toContain('600cr (paused)');
  expect(stdout).toContain('Alloy One (Alloy Smelter)');
  const section = sectionAfter(stdout, 'Faction Facilities at earth_station');
  expect(tableCell(section, 'faction-smelter', 'Rent')).toBe('1,200cr');
  expect(tableCell(section, 'faction-bunker', 'Rent')).toBe('800cr (paused)');
  expect(tableCell(section, 'faction-yard', 'Rent')).toBe('1,200cr (paused)');
  expect(tableCell(section, 'faction-hangar', 'Status')).toBe('dismantling');
  expect(tableCell(section, 'faction-hangar', 'Rent')).toBe('600cr (paused)');
  expect(stdout).toContain('Faction storage:');
  expect(stdout).toContain('Damaged facilities produce nothing.');
  expect(stdout).toContain('rebuilds its own faction');
  expect(stdout).toContain('facility repair');
  expect(stdout).toContain('jump the queue');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toMatch(/NaN|undefined|\[object Object\]/);
});

test('faction_facility_list empty array still claims response with (None)', () => {
  const fixture = {
    action: 'faction_list',
    base_id: 'earth_station',
    faction_id: 'faction-1',
    faction_facilities: [] as Array<Record<string, unknown>>,
    hint: 'No faction facilities at this station.',
  };
  const rendered = renderStructuredResult('faction_facility_list', fixture, options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Faction: faction-1');
  expect(stdout).toContain('(None)');
  expect(stdout).toContain('No faction facilities at this station.');
  expect(stdout).not.toContain('=== Response ===');
});

test('faction_facility_list does not claim grouped facility_list payloads', () => {
  const rendered = renderStructuredResult(
    'faction_facility_list',
    structuredClone(facilityListFixture),
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');

  // Matcher rejects station_facilities/player_facilities; must not use the
  // faction_list-only single-table title (grouped list may still shape-match).
  expect(stdout).not.toContain('Faction Facilities at earth_station');
  expect(stdout).not.toContain('Faction: faction-1');
});

test('faction_facility_list omits Damaged column when no damaged fields', () => {
  const fixture = {
    action: 'faction_list',
    base_id: 'earth_station',
    faction_id: 'faction-1',
    faction_facilities: [
      {
        facility_id: 'faction-yard',
        type: 'faction_shipyard_berth',
        name: 'Shipyard Berth',
        level: 1,
        faction_service: 'shipyard',
        rent_per_cycle: 1200,
        status: 'under_construction',
        ticks_until_complete: 12,
      },
      {
        facility_id: 'faction-smelter',
        type: 'alloy_smelter',
        name: 'Alloy Smelter',
        level: 1,
        faction_service: 'production',
        rent_per_cycle: 1200,
        status: 'active',
      },
    ],
    hint: 'No damaged facilities.',
  };
  const stdout = renderStructuredResult('faction_facility_list', fixture, options, context).stdout.join('\n');

  expect(stdout).toMatch(/Name\s+\|\s+Type\s+\|\s+ID\s+\|\s+Level\s+\|\s+Status\s+\|\s+Building\s+\|\s+Service/);
  expect(stdout).not.toMatch(/\|\s*Damaged\s*\|/);
  expect(stdout).toMatch(/\|\s*Building\s*$|\|\s*Building\b/);
  expect(stdout).toContain('12');
  expect(stdout).not.toContain('=== Response ===');
});

test('faction_facility_list omits Building column without ticks_until_complete', () => {
  const fixture = {
    action: 'faction_list',
    base_id: 'earth_station',
    faction_id: 'faction-1',
    faction_facilities: [
      {
        facility_id: 'faction-smelter',
        type: 'alloy_smelter',
        name: 'Alloy Smelter',
        level: 1,
        faction_service: 'production',
        rent_per_cycle: 1200,
        status: 'active',
        damaged: false,
      },
    ],
    hint: 'All active.',
  };
  const stdout = renderStructuredResult('faction_facility_list', fixture, options, context).stdout.join('\n');

  expect(stdout).toMatch(/\|\s*Damaged\s*\|/);
  expect(stdout).not.toMatch(/\|\s*Building\b/);
  expect(stdout).not.toContain('Repair Tick');
  expect(stdout).toContain('no');
});

const scanColorOptions: GlobalOptions = { ...options, plain: false };
const scanPirateFg = '#112233';
const scanPirateBg = '#445566';

function renderFactionScan(fixture: Record<string, unknown>, renderOptions: GlobalOptions = options): string {
  const rendered = renderStructuredResult('faction_scan_poi', fixture, renderOptions, context);
  expect(rendered.success).toBe(true);
  return rendered.stdout.join('\n');
}

function scanPirateLine(stdout: string, token: string): string | undefined {
  return stdout.split('\n').find((line) => line.includes(token) && line.trimStart() !== line);
}

function scanWithPirateColors(colors: Record<string, unknown>): Record<string, unknown> {
  const fixture = structuredClone(factionScanPoiFixture) as {
    details: { pirates: Array<Record<string, unknown>> };
  };
  const pirate = { ...fixture.details.pirates[0] };
  delete pirate.primary_color;
  delete pirate.secondary_color;
  fixture.details.pirates[0] = { ...pirate, ...colors };
  return fixture;
}

test('faction_scan_poi nested details prints header and all three sections', () => {
  const stdout = renderFactionScan(structuredClone(factionScanPoiFixture));

  expect(stdout).toContain('=== Faction Scan ===');
  expect(stdout).toContain('POI: Sol Central (sol_central)');
  expect(stdout).toContain('System: sol');
  expect(stdout).toContain('Facility: L2 at earth_station');
  expect(stdout).toContain('Scan power: 36');
  expect(stdout).toContain('Hops: 1');
  expect(stdout).toContain('Signature detected.');
  expect(stdout).toContain('Projected scan contested 2 cloaks.');
  expect(stdout).toContain('=== Players ===');
  expect(stdout).toContain('=== Empire NPCs ===');
  expect(stdout).toContain('Pirates (1):');
  expect(stdout).toContain('  Raider (skiff) - raider - Admiral Kael');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toMatch(/NaN|undefined|\[object Object\]/);
});

test('faction_scan_poi live envelope ignores aliased location and ship', () => {
  const stdout = renderFactionScan({
    details: {
      poi_id: 'sol_central',
      facility_level: 2,
      scan_power: 36,
      hops: 1,
      message: 'Scan complete.',
    },
    location: {
      system_id: 'elsewhere',
      poi_name: 'Home Dock',
      nearby_players: [{ username: 'LocalOp' }],
    },
    ship: { fuel: 9, max_fuel: 100 },
  });

  expect(stdout).toContain('POI: sol_central');
  expect(stdout).not.toContain('Home Dock');
  expect(stdout).not.toContain('elsewhere');
  expect(stdout).not.toContain('LocalOp');
  expect(stdout).not.toContain('Fuel Now');
  expect(stdout).not.toContain('Fuel Max');
  expect(stdout).not.toContain('fuel_max');
  expect(stdout).not.toContain('fuel');
  expect(stdout).not.toContain('=== Online Players ===');
  expect(stdout).not.toContain('=== Response ===');
});

test('faction_scan_poi omits empty contact sections', () => {
  const stdout = renderFactionScan(structuredClone(factionScanPoiEmptyFixture));

  expect(stdout).toContain('=== Faction Scan ===');
  expect(stdout).toContain('POI: sol_central');
  expect(stdout).toContain('Hops: 0');
  expect(stdout).toContain('Scan complete.');
  expect(stdout).not.toContain('=== Players ===');
  expect(stdout).not.toContain('=== Empire NPCs ===');
  expect(stdout).not.toContain('Pirates (');
  expect(stdout).not.toContain('=== Response ===');
});

test('faction_scan_poi omits signature line when signature_detected is false', () => {
  const fixture = structuredClone(factionScanPoiEmptyFixture) as { details: Record<string, unknown> };
  fixture.details.signature_detected = false;
  const stdout = renderFactionScan(fixture);

  expect(stdout).not.toContain('Signature detected.');
});

test('faction_scan_poi omits signature line when signature_detected is omitted', () => {
  const stdout = renderFactionScan(structuredClone(factionScanPoiEmptyFixture));
  expect(stdout).not.toContain('Signature detected.');
});

test('faction_scan_poi prints yellow Signature detected. when true', () => {
  const stdout = renderFactionScan(structuredClone(factionScanPoiFixture), scanColorOptions);

  expect(stdout).toContain('Signature detected.');
  expect(stdout).toContain('\x1b[33m');
  expect(stdout.split('\n').some((line) => line.includes('Signature detected.') && line.includes('\x1b[33m'))).toBe(
    true,
  );
});

test('faction_scan_poi --plain Signature detected. has no ANSI', () => {
  const stdout = renderFactionScan(structuredClone(factionScanPoiFixture), { ...options, plain: true });
  const line = stdout.split('\n').find((entry) => entry.includes('Signature detected.'));

  expect(line).toBe('Signature detected.');
  expect(stdout).not.toContain('\x1b');
});

test('faction_scan_poi omits Hull column when no contact has hull', () => {
  const stdout = renderFactionScan(structuredClone(factionScanPoiPartialFixture));
  const section = sectionAfter(stdout, 'Players');

  expect(section).toContain('Cloaked');
  expect(section).not.toMatch(/\|\s*Hull\s*\|/);
  expect(section).not.toMatch(/\|\s*Hull\s*$/);
});

test('faction_scan_poi cloaked partial falls back to target_id', () => {
  const stdout = renderFactionScan(structuredClone(factionScanPoiPartialFixture));
  const section = sectionAfter(stdout, 'Players');

  expect(tableCell(section, 'player-cloaked-1', 'Name')).toBe('player-cloaked-1');
  expect(tableCell(section, 'player-cloaked-1', 'Cloaked')).toBe('yes');
  expect(tableCell(section, 'player-cloaked-1', 'Revealed')).toBe('cloaked, ship_class');
});

test('faction_scan_poi pirate crew prefers faction_name then faction', () => {
  const stdout = renderFactionScan({
    details: {
      poi_id: 'sol_central',
      facility_level: 1,
      scan_power: 8,
      hops: 0,
      message: 'Crew labels.',
      pirates: [
        { id: 'p-named', name: 'Named', faction: 'pirate_kael', faction_name: 'Admiral Kael' },
        { id: 'p-id', name: 'Keyed', faction: 'pirate_voss' },
        { id: 'p-plain', name: 'Plain' },
      ],
    },
  });

  expect(scanPirateLine(stdout, 'Named')).toBe('  Named - Admiral Kael');
  expect(scanPirateLine(stdout, 'Keyed')).toBe('  Keyed - pirate_voss');
  expect(scanPirateLine(stdout, 'Plain')).toBe('  Plain');
  expect(stdout).not.toContain('Plain - ');
});

test('faction_scan_poi pirate lines start with two spaces then the name', () => {
  const stdout = renderFactionScan(structuredClone(factionScanPoiFixture));
  const line = scanPirateLine(stdout, 'Raider');

  expect(line?.startsWith('  Raider')).toBe(true);
});

test('faction_scan_poi named pirate line omits id while JSON keeps it', () => {
  const stdout = renderFactionScan(structuredClone(factionScanPoiFixture));
  expect(scanPirateLine(stdout, 'Raider')).toBe('  Raider (skiff) - raider - Admiral Kael');
  expect(scanPirateLine(stdout, 'Raider')).not.toContain('pirate-1');

  const rendered = renderStructuredResult(
    'faction_scan_poi',
    structuredClone(factionScanPoiFixture),
    { ...options, format: 'json' },
    context,
  );
  const parsed = JSON.parse(rendered.stdout.join('\n')) as {
    details: { pirates: Array<Record<string, unknown>> };
  };
  expect(parsed.details.pirates[0]?.id).toBe('pirate-1');
});

test('faction_scan_poi colors pirate names with both crew hex colors', () => {
  const stdout = renderFactionScan(
    scanWithPirateColors({ primary_color: scanPirateFg, secondary_color: scanPirateBg }),
    scanColorOptions,
  );
  const line = scanPirateLine(stdout, 'Raider');

  expect(line).toBe(`  ${hexColor('Raider', scanPirateFg, scanPirateBg)} (skiff) - raider - Admiral Kael`);
  expect(line).toContain('\x1b[38;2');
  expect(line).toContain('\x1b[48;2');
  expect(line?.endsWith('\x1b[0m (skiff) - raider - Admiral Kael')).toBe(true);
});

test('faction_scan_poi colors pirate names with primary color only', () => {
  const stdout = renderFactionScan(scanWithPirateColors({ primary_color: scanPirateFg }), scanColorOptions);
  expect(scanPirateLine(stdout, 'Raider')).toBe(
    `  ${hexColor('Raider', scanPirateFg)} (skiff) - raider - Admiral Kael`,
  );
  expect(scanPirateLine(stdout, 'Raider')).toContain('\x1b[38;2');
  expect(scanPirateLine(stdout, 'Raider')).not.toContain('\x1b[48;2');
});

test('faction_scan_poi colors pirate names with secondary color only', () => {
  const stdout = renderFactionScan(
    scanWithPirateColors({ primary_color: undefined, secondary_color: scanPirateBg }),
    scanColorOptions,
  );
  expect(scanPirateLine(stdout, 'Raider')).toBe(
    `  ${hexColor('Raider', undefined, scanPirateBg)} (skiff) - raider - Admiral Kael`,
  );
  expect(scanPirateLine(stdout, 'Raider')).toContain('\x1b[48;2');
  expect(scanPirateLine(stdout, 'Raider')).not.toContain('\x1b[38;2');
});

test('faction_scan_poi leaves pirate names uncolored for invalid hex', () => {
  const stdout = renderFactionScan(
    scanWithPirateColors({ primary_color: 'red', secondary_color: '#fff' }),
    scanColorOptions,
  );
  const line = scanPirateLine(stdout, 'Raider');

  expect(line).toBe('  Raider (skiff) - raider - Admiral Kael');
  expect(line).not.toContain('\x1b');
});

test('faction_scan_poi colors only the valid pirate livery channel when mixed with invalid hex', () => {
  const stdout = renderFactionScan(
    scanWithPirateColors({ primary_color: scanPirateFg, secondary_color: 'red' }),
    scanColorOptions,
  );
  expect(scanPirateLine(stdout, 'Raider')).toBe(
    `  ${hexColor('Raider', scanPirateFg, 'red')} (skiff) - raider - Admiral Kael`,
  );
});

test('faction_scan_poi leaves pirate names uncolored when livery colors are missing', () => {
  const stdout = renderFactionScan(structuredClone(factionScanPoiPartialFixture), scanColorOptions);
  const line = scanPirateLine(stdout, 'Corsair');

  expect(line).toBe('  Corsair (skiff) - raider');
  expect(line).not.toContain('\x1b');
});

test('faction_scan_poi --plain leaves pirate names uncolored even with valid hex', () => {
  const stdout = renderFactionScan(
    scanWithPirateColors({ primary_color: scanPirateFg, secondary_color: scanPirateBg }),
    { ...options, plain: true },
  );
  const line = scanPirateLine(stdout, 'Raider');

  expect(line).toBe('  Raider (skiff) - raider - Admiral Kael');
  expect(line).not.toContain('\x1b');
});

test('faction_scan_poi leftover native scalar uses title case', () => {
  const fixture = structuredClone(factionScanPoiEmptyFixture) as { details: Record<string, unknown> };
  fixture.details.foo_bar = 1;
  const stdout = renderFactionScan(fixture);

  expect(stdout).toContain('Foo Bar: 1');
});

test('faction_scan_poi leftover object is not printed', () => {
  const fixture = structuredClone(factionScanPoiEmptyFixture) as { details: Record<string, unknown> };
  fixture.details.meta = { nested: true };
  const stdout = renderFactionScan(fixture);

  expect(stdout).not.toContain('Meta');
  expect(stdout).not.toContain('nested');
  expect(stdout).not.toContain('{');
  expect(stdout).not.toContain('=== Response ===');
});

test('faction_scan_poi malformed revealed_info object is not dumped', () => {
  const stdout = renderFactionScan({
    details: {
      poi_id: 'sol_central',
      facility_level: 1,
      scan_power: 8,
      hops: 0,
      message: 'Malformed revealed.',
      contacts: [{ target_id: 'player-bad', revealed_info: { nested: { token: true } } }],
    },
  });

  expect(stdout).not.toContain('[object Object]');
  expect(stdout).toContain('player-bad');
});

test('faction_scan_poi without details prints the title only', () => {
  const stdout = renderFactionScan({
    message: 'ok',
    credits: 12,
    location: { system_id: 'sol', poi_name: 'Earth' },
    ship: { fuel: 9, max_fuel: 100 },
    player: { username: 'Marlowe' },
  });

  expect(stdout.trim()).toBe('=== Faction Scan ===');
  expect(stdout).not.toContain('Credits:');
  expect(stdout).not.toContain('Marlowe');
  expect(stdout).not.toContain('=== Response ===');
});

test('faction_scan_poi JSON keeps primary_color and faction_name', () => {
  const rendered = renderStructuredResult(
    'faction_scan_poi',
    structuredClone(factionScanPoiFixture),
    { ...options, format: 'json' },
    context,
  );
  const parsed = JSON.parse(rendered.stdout.join('\n')) as {
    details: { pirates: Array<Record<string, unknown>> };
  };

  expect(parsed.details.pirates[0]?.primary_color).toBe('#112233');
  expect(parsed.details.pirates[0]?.faction_name).toBe('Admiral Kael');
});

test('faction_scan_poi flattened scan object matches nested details header', () => {
  const stdout = renderFactionScan(structuredClone(factionScanPoiDetails));
  expect(stdout).toContain('POI: Sol Central (sol_central)');
  expect(stdout).toContain('=== Players ===');
  expect(stdout).not.toContain('=== Response ===');
});

test('faction_scan_poi facility line uses station-only and level-only forms', () => {
  const stationOnly = renderFactionScan({
    details: {
      poi_id: 'sol_central',
      facility_station: 'earth_station',
      scan_power: 4,
      hops: 0,
      message: 'Station only.',
    },
  });
  expect(stationOnly).toContain('Facility: earth_station');
  expect(stationOnly).not.toContain('Facility: L');

  const levelOnly = renderFactionScan({
    details: {
      poi_id: 'sol_central',
      facility_level: 3,
      scan_power: 4,
      hops: 0,
      message: 'Level only.',
    },
  });
  expect(levelOnly).toContain('Facility: L3');
  expect(levelOnly).not.toContain(' at ');
});
