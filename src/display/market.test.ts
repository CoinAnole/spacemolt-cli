import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { renderStructuredResult } from './index.ts';
import { factionQueryIntelFixture, supplyCommissionFixture } from './market.fixtures.ts';

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
      return new Date('2026-06-19T00:00:00.000Z');
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

test('sell prints a bigint total instead of a rounded fill sum', () => {
  const stdout = renderStructuredResult(
    'sell',
    {
      action: 'sell',
      item: 'Iron Ore',
      item_id: 'ore_iron',
      quantity_sold: 2,
      total_earned: 9007199254740993n,
      fills: [
        { quantity: 1, subtotal: 9007199254740991 },
        { quantity: 1, subtotal: 2 },
      ],
    },
    options,
    context,
  ).stdout.join('\n');
  const rounded = (9007199254740991 + 2).toLocaleString();

  expect(stdout).toContain('Sold: 2');
  expect(stdout).toContain('earned:');
  expect(stdout.replace(/\D/g, '')).toContain('9007199254740993');
  expect(stdout).not.toContain('9007199254740992');
  expect(stdout).not.toContain(rounded);
});

test('sell prints a bigint quantity_sold instead of summing fills', () => {
  const stdout = renderStructuredResult(
    'sell',
    {
      action: 'sell',
      item: 'Iron Ore',
      item_id: 'ore_iron',
      quantity_sold: 9007199254740993n,
      total_earned: 10,
      fills: [{ quantity: 9007199254740991 }, { quantity: 2 }],
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('earned: 10 cr');
  expect(stdout.replace(/\D/g, '')).toContain('9007199254740993');
  expect(stdout).toContain('Sold:');
  expect(stdout).toContain('Instant fills:');
  expect(stdout).not.toContain('9007199254740992');
  expect(stdout).not.toContain((9007199254740991 + 2).toLocaleString());
});

test('buy prints a bigint total_cost instead of a rounded fill sum', () => {
  const stdout = renderStructuredResult(
    'buy',
    {
      action: 'buy',
      item: 'Fuel',
      item_id: 'fuel',
      quantity: 2,
      total_cost: 9007199254740993n,
      fills: [
        { quantity: 1, subtotal: 9007199254740991 },
        { quantity: 1, subtotal: 2 },
      ],
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Requested: 2');
  expect(stdout).toContain('spent:');
  expect(stdout.replace(/\D/g, '')).toContain('9007199254740993');
  expect(stdout).not.toContain('9007199254740992');
  expect(stdout).not.toContain((9007199254740991 + 2).toLocaleString());
});

test('create_sell_order prints bigint quantity_filled and total_earned', () => {
  const stdout = renderStructuredResult(
    'create_sell_order',
    {
      action: 'create_sell_order',
      item: 'Iron Ore',
      item_id: 'ore_iron',
      quantity: 4,
      quantity_filled: 9007199254740993n,
      total_earned: 9007199254740993n,
      order_id: 'order-1',
      fills: [
        { quantity: 9007199254740991, subtotal: 9007199254740991 },
        { quantity: 2, subtotal: 2 },
      ],
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Requested: 4');
  expect(stdout).toContain('Order ID: order-1');
  expect(stdout).toContain('Instant fills:');
  expect(stdout).toContain('earned:');
  expect(stdout.replace(/\D/g, '')).toContain('9007199254740993');
  expect(stdout).not.toContain('9007199254740992');
  expect(stdout).not.toContain((9007199254740991 + 2).toLocaleString());
});

test('create_sell_order prints a bigint quantity_listed instead of a zero remainder', () => {
  const stdout = renderStructuredResult(
    'create_sell_order',
    {
      action: 'create_sell_order',
      item: 'Iron Ore',
      item_id: 'ore_iron',
      quantity: 4,
      quantity_filled: 4,
      quantity_listed: 9007199254740993n,
      order_id: 'order-1',
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Remaining listed:');
  expect(stdout.replace(/\D/g, '')).toContain('9007199254740993');
  expect(stdout).not.toContain('9007199254740992');
  expect(stdout).not.toContain('Remaining listed: 0');
});

test('faction_query_intel appends [deep core] when the POI is tagged', () => {
  const stdout = renderStructuredResult(
    'faction_query_intel',
    structuredClone(factionQueryIntelFixture),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Sol Gas Cloud (gas_cloud) [deep core] sol_gas_cloud');
  expect(stdout).not.toContain('Deep core: yes');
  expect(stdout).not.toContain('=== Response ===');
});

function overlayIntelPoi(
  fixture: typeof factionQueryIntelFixture,
  value: unknown | undefined,
): typeof factionQueryIntelFixture {
  const poi = fixture.entries[0]?.pois[0] as Record<string, unknown> | undefined;
  if (!poi) throw new Error('expected intel POI');
  if (value === undefined) delete poi.deep_core;
  else poi.deep_core = value;
  return fixture;
}

test('faction_query_intel omits [deep core] when the tag is false or missing', () => {
  const omitted = overlayIntelPoi(structuredClone(factionQueryIntelFixture), undefined);
  const falsy = overlayIntelPoi(structuredClone(factionQueryIntelFixture), false);
  const coerced = overlayIntelPoi(structuredClone(factionQueryIntelFixture), 'true');

  for (const fixture of [omitted, falsy, coerced]) {
    const stdout = renderStructuredResult('faction_query_intel', fixture, options, context).stdout.join('\n');
    expect(stdout).toContain('Sol Gas Cloud (gas_cloud) sol_gas_cloud');
    expect(stdout).not.toContain('[deep core]');
    expect(stdout).not.toContain('Deep core:');
  }
});

interface IntelResult {
  count?: number;
  current_tick?: unknown;
  message?: unknown;
  live_systems?: unknown;
  entries: Array<{
    system_id: string;
    submitted_at_tick?: unknown;
    submitter_name?: string;
    pois: Array<Record<string, unknown>>;
  }>;
  [key: string]: unknown;
}

function cloneIntelFixture(): IntelResult {
  return structuredClone(factionQueryIntelFixture) as unknown as IntelResult;
}

function firstIntelEntry(fixture: IntelResult): IntelResult['entries'][number] {
  const entry = fixture.entries[0];
  if (!entry) throw new Error('expected intel entry');
  return entry;
}

function firstIntelPoi(fixture: IntelResult): Record<string, unknown> {
  const poi = firstIntelEntry(fixture).pois[0];
  if (!poi) throw new Error('expected intel POI');
  return poi;
}

function renderIntel(fixture: IntelResult, extra?: Partial<GlobalOptions>): string {
  return renderStructuredResult('faction_query_intel', fixture, { ...options, ...extra }, context).stdout.join('\n');
}

function stdoutLine(stdout: string, needle: string): string | undefined {
  return stdout.split('\n').find((line) => line.includes(needle));
}

test('faction_query_intel prints the trimmed message and an unverified read', () => {
  const stdout = renderIntel(cloneIntelFixture());

  expect(stdout).toContain('Showing intel for 1 system');
  expect(stdout).not.toContain('Message:');
  expect(stdout).not.toContain('Live systems');
  expect(stdout).toContain('    Read at tick: unverified');
  expect(stdout).not.toContain('Read at tick: 0');
  expect(stdout).toContain('Sol Gas Cloud (gas_cloud) [deep core] sol_gas_cloud');
  expect(stdout).toContain('hydrogen_gas');
  expect(stdout).toContain('argon_gas');
  expect(stdout).toContain('(40.00% remaining)');
  expect(stdout).toContain('Intel tick: 900685 by Marlowe, age 5 ticks');
  expect(stdout).not.toContain('=== Response ===');

  const spaced = renderStructuredResult(
    'faction query_intel',
    structuredClone(factionQueryIntelFixture),
    options,
    context,
  ).stdout.join('\n');
  expect(spaced).toContain('Showing intel for 1 system');
  expect(spaced).toContain('    Read at tick: unverified');
});

test('faction_query_intel prints a trimmed message and skips blank or non-string messages', () => {
  const padded = cloneIntelFixture();
  padded.message = '  Showing intel for 1 system  ';
  expect(stdoutLine(renderIntel(padded), 'Showing intel')).toBe('Showing intel for 1 system');

  for (const message of ['  ', 4, '', null]) {
    const fixture = cloneIntelFixture();
    fixture.message = message;
    const stdout = renderIntel(fixture);
    expect(stdout).toContain('Systems: 1\n\nSol (sol)');
    expect(stdout).not.toContain('Showing intel');
  }
});

test('faction_query_intel omits Live systems when the field is null or not an array', () => {
  for (const live_systems of [null, 'sol', { id: 'sol' }]) {
    const fixture = cloneIntelFixture();
    fixture.live_systems = live_systems;
    const stdout = renderIntel(fixture);
    expect(stdout).not.toContain('Live systems');
    expect(stdout).toContain('    Read at tick: unverified');
  }
});

test('faction_query_intel prints Live systems: (none) when the array has no strings', () => {
  for (const live_systems of [[], [1, false, null]]) {
    const fixture = cloneIntelFixture();
    fixture.live_systems = live_systems;
    const stdout = renderIntel(fixture);
    expect(stdout).toContain('Live systems: (none)');
    expect(stdout).not.toContain('Live systems: 1');
    expect(stdout).toContain('    Read at tick: unverified');
  }
});

test('faction_query_intel keeps duplicate live system ids and skips non-strings', () => {
  const fixture = cloneIntelFixture();
  fixture.live_systems = ['sol', 1, 'sol'];
  const stdout = renderIntel(fixture);

  expect(stdout).toContain('Live systems: sol, sol');
  expect(stdout).not.toContain('Live systems: sol, 1');
  expect(stdout).toContain('    Read at tick: unverified');
  expect(stdout).not.toContain(', live');
});

test('faction_query_intel prints explicit read_at_tick 0 as a snapshot, not unverified', () => {
  const fixture = cloneIntelFixture();
  firstIntelPoi(fixture).read_at_tick = 0;
  const stdout = renderIntel(fixture);

  expect(stdout).toContain('    Read at tick: 0, snapshot, age 900690 ticks');
  expect(stdout).not.toContain('unverified');
  expect(stdout).not.toContain(', live');
  expect(stdout).not.toContain('Live systems');
});

test('faction_query_intel prints live when the tick matches a listed system', () => {
  const fixture = cloneIntelFixture();
  fixture.live_systems = ['sol'];
  firstIntelPoi(fixture).read_at_tick = fixture.current_tick;
  const stdout = renderIntel(fixture);
  const readLine = stdoutLine(stdout, 'Read at tick:');

  expect(readLine).toBe('    Read at tick: 900690, live');
  expect(readLine).not.toContain('age');
  expect(stdout).toContain('Systems: 1\nShowing intel for 1 system\nLive systems: sol\n');
  expect(stdout).not.toContain('snapshot');
  expect(stdout).toContain('Intel tick: 900685 by Marlowe, age 5 ticks');
});

test('faction_query_intel keeps an older POI in a live system as a snapshot', () => {
  const fixture = cloneIntelFixture();
  fixture.live_systems = ['sol'];
  firstIntelPoi(fixture).read_at_tick = fixture.current_tick;
  firstIntelEntry(fixture).pois.push({
    id: 'sol_belt',
    type: 'asteroid',
    name: 'Sol Belt',
    read_at_tick: 900680,
    resources: [
      { resource_id: 'iron_ore', richness: 3, remaining: 10, max_remaining: 40, depletion_percent: 75 },
      { resource_id: 'copper_ore', richness: 1, remaining: 5, max_remaining: 10, depletion_percent: 50 },
    ],
  });
  const stdout = renderIntel(fixture);
  const liveAt = stdout.indexOf('    Read at tick: 900690, live');
  const hydrogenAt = stdout.indexOf('hydrogen_gas');
  const argonAt = stdout.indexOf('argon_gas');
  const snapAt = stdout.indexOf('    Read at tick: 900680, snapshot, age 10 ticks');
  const ironAt = stdout.indexOf('iron_ore');
  const copperAt = stdout.indexOf('copper_ore');

  expect(liveAt).toBeGreaterThan(-1);
  expect(hydrogenAt).toBeGreaterThan(liveAt);
  expect(argonAt).toBeGreaterThan(hydrogenAt);
  expect(snapAt).toBeGreaterThan(argonAt);
  expect(ironAt).toBeGreaterThan(snapAt);
  expect(copperAt).toBeGreaterThan(ironAt);
  expect(stdout).toContain('Intel tick: 900685 by Marlowe, age 5 ticks');
});

test('faction_query_intel prints read_at_tick when resources are missing or empty', () => {
  const fixture = cloneIntelFixture();
  firstIntelEntry(fixture).pois = [
    { id: 'sol_empty', name: 'Empty Wreck', read_at_tick: 900680 },
    { name: 'Bare Rock', resources: [] },
  ];
  const stdout = renderIntel(fixture);

  expect(stdout).toContain('Empty Wreck');
  expect(stdout).toContain('    Read at tick: 900680, snapshot, age 10 ticks');
  expect(stdout).toContain('Bare Rock');
  expect(stdout).toContain('    Read at tick: unverified');
  expect(stdout).not.toContain('hydrogen_gas');
  expect(stdout).not.toContain('=== Response ===');
});

test('faction_query_intel prints age 0 snapshot when the tick matches but the system is not listed', () => {
  const omitted = cloneIntelFixture();
  firstIntelPoi(omitted).read_at_tick = omitted.current_tick;
  const omittedOut = renderIntel(omitted);
  expect(stdoutLine(omittedOut, 'Read at tick:')).toBe('    Read at tick: 900690, snapshot, age 0 ticks');
  expect(omittedOut).not.toContain('Live systems');
  expect(omittedOut).not.toContain(', live');
  expect(omittedOut).toContain('Intel tick: 900685 by Marlowe, age 5 ticks');

  const other = cloneIntelFixture();
  other.live_systems = ['proxima'];
  firstIntelPoi(other).read_at_tick = other.current_tick;
  const otherOut = renderIntel(other);
  expect(stdoutLine(otherOut, 'Read at tick:')).toBe('    Read at tick: 900690, snapshot, age 0 ticks');
  expect(otherOut).toContain('Live systems: proxima');
  expect(otherOut).not.toContain(', live');
});

test('faction_query_intel treats null and empty-string read_at_tick as unverified', () => {
  for (const read_at_tick of [null, '']) {
    const fixture = cloneIntelFixture();
    fixture.live_systems = ['sol'];
    firstIntelPoi(fixture).read_at_tick = read_at_tick;
    expect(stdoutLine(renderIntel(fixture), 'Read at tick:')).toBe('    Read at tick: unverified');
  }
});

test('faction_query_intel prints a bigint live tick without rounding', () => {
  const fixture = cloneIntelFixture();
  const tick = 9007199254740993n;
  fixture.current_tick = tick;
  fixture.live_systems = ['sol'];
  firstIntelPoi(fixture).read_at_tick = tick;
  const stdout = renderIntel(fixture);
  const readLine = stdoutLine(stdout, 'Read at tick:');

  expect(readLine).toContain('9007199254740993');
  expect(readLine).toContain('live');
  expect(readLine).not.toContain('age');
  expect(stdout).not.toContain('9007199254740992');
});

test('faction_query_intel prints an exact bigint snapshot age', () => {
  const fixture = cloneIntelFixture();
  fixture.current_tick = 9007199254740993n;
  firstIntelPoi(fixture).read_at_tick = 9007199254740991n;
  const stdout = renderIntel(fixture);

  expect(stdout).toContain('    Read at tick: 9007199254740991, snapshot, age 2 ticks');
  expect(stdout).not.toContain('9007199254740992');
  expect(stdout).not.toContain(', live');
});

test('faction_query_intel prints a bigint Intel tick age', () => {
  const fixture = cloneIntelFixture();
  fixture.current_tick = 9007199254740993n;
  firstIntelEntry(fixture).submitted_at_tick = 9007199254740992n;
  const stdout = renderIntel(fixture);

  expect(stdoutLine(stdout, 'Intel tick:')).toBe('Intel tick: 9007199254740992 by Marlowe, age 1 ticks');
  expect(stdout).not.toContain('9007199254740994');
});

test('faction_query_intel omits a negative Intel tick age', () => {
  const fixture = cloneIntelFixture();
  firstIntelEntry(fixture).submitted_at_tick = 900700;
  const stdout = renderIntel(fixture);

  expect(stdoutLine(stdout, 'Intel tick:')).toBe('Intel tick: 900700 by Marlowe');
  expect(stdout).toContain('    Read at tick: unverified');
});

test('faction_query_intel omits age when read_at_tick is in the future', () => {
  const fixture = cloneIntelFixture();
  firstIntelPoi(fixture).read_at_tick = 900700;
  const stdout = renderIntel(fixture);
  const readLine = stdoutLine(stdout, 'Read at tick:');

  expect(readLine).toBe('    Read at tick: 900700, snapshot');
  expect(readLine).not.toContain('age');
  expect(readLine).not.toContain('live');
  expect(stdout).toContain('Intel tick: 900685 by Marlowe, age 5 ticks');
});

test('faction_query_intel prints a snapshot without age when current_tick is missing', () => {
  const fixture = cloneIntelFixture();
  delete fixture.current_tick;
  firstIntelPoi(fixture).read_at_tick = 900680;
  fixture.live_systems = ['sol'];
  const stdout = renderIntel(fixture);

  expect(stdout).not.toContain('Current tick:');
  expect(stdoutLine(stdout, 'Read at tick:')).toBe('    Read at tick: 900680, snapshot');
  expect(stdout).not.toContain('age');
  expect(stdout).not.toContain(', live');
  expect(stdout).toContain('Live systems: sol');
});

test('faction_query_intel keeps a non-integer current tick raw and omits age', () => {
  const fixture = cloneIntelFixture();
  fixture.current_tick = 1.5;
  fixture.live_systems = ['sol'];
  firstIntelPoi(fixture).read_at_tick = 900680;
  const stdout = renderIntel(fixture);

  expect(stdout).toContain('Current tick: 1.5');
  expect(stdoutLine(stdout, 'Read at tick:')).toBe('    Read at tick: 900680, snapshot');
  expect(stdout).not.toContain('age');
  expect(stdout).not.toContain(', live');
  expect(stdout).toContain('Live systems: sol');
});

test('faction_query_intel prints non-integer read_at_tick values with no status word', () => {
  const cases: Array<[unknown, string]> = [
    [1.5, '    Read at tick: 1.5'],
    ['900690', '    Read at tick: 900690'],
    [false, '    Read at tick: false'],
    [{ tick: 1 }, '    Read at tick: [object Object]'],
  ];
  for (const [read_at_tick, line] of cases) {
    const fixture = cloneIntelFixture();
    fixture.live_systems = ['sol'];
    firstIntelPoi(fixture).read_at_tick = read_at_tick;
    const stdout = renderIntel(fixture);
    expect(stdoutLine(stdout, 'Read at tick:')).toBe(line);
    expect(stdout).not.toContain('Read at tick: 1.5, snapshot');
    expect(stdout).toContain('Intel tick: 900685 by Marlowe, age 5 ticks');
  }
});

test('faction_query_intel search keeps unlisted live systems and a live read', () => {
  const fixture = cloneIntelFixture();
  fixture.live_systems = ['sol', 'proxima'];
  firstIntelPoi(fixture).read_at_tick = fixture.current_tick;
  const stdout = renderIntel(fixture, { outputSearch: 'hydrogen' });
  const readLine = stdoutLine(stdout, 'Read at tick:');

  expect(stdout).toContain('Live systems: sol, proxima');
  expect(readLine).toBe('    Read at tick: 900690, live');
  expect(readLine).not.toContain('age');
  expect(stdout).not.toContain('snapshot');
  expect(stdout).not.toContain('argon_gas');
  expect(stdout).toContain('hydrogen_gas');
  expect(stdout).toContain('Intel tick: 900685 by Marlowe, age 5 ticks');
});

test('faction_query_intel prints message and live systems when entries is empty', () => {
  const fixture = cloneIntelFixture();
  fixture.entries = [];
  fixture.count = 0;
  fixture.live_systems = [];
  const stdout = renderIntel(fixture);

  expect(stdout).toContain('Systems: 0\nShowing intel for 1 system\nLive systems: (none)');
  expect(stdout).not.toContain('Sol');
  expect(stdout).not.toContain('=== Response ===');
});

function renderSupplyCommission(fixture: Record<string, unknown>) {
  return renderStructuredResult('supply_commission', structuredClone(fixture), options, context);
}

test('supply_commission prints material names with needed and gathered progress', () => {
  const stdout = renderSupplyCommission(supplyCommissionFixture).stdout.join('\n');

  expect(stdout).toContain('=== Commission Supplied ===');
  expect(stdout).toContain('Materials supplied.');
  expect(stdout).toContain('ID: commission-1');
  expect(stdout).toContain('Donated: Nanite Hull Coating (nanite_hull_coating) x1');
  expect(stdout).toContain('Status: pending');
  expect(stdout).toContain('All sourced: no');
  expect(stdout).toContain('Credits: 5,000 cr');
  expect(stdout).toContain('=== Materials ===');
  expect(stdout).toContain('Steel Plate');
  expect(stdout).toContain('Nanite Hull Coating');
  expect(stdout).toMatch(/Steel Plate\s+\|\s+12\s+\|\s+12\s+\|\s+yes/);
  expect(stdout).toMatch(/Nanite Hull Coating\s+\|\s+1\s+\|\s+0\s+\|\s+no/);
  expect(stdout).not.toContain('Materials: 2 item(s)');
  expect(stdout).not.toContain('=== Response ===');
});

test('supply_commission omits the materials table when materials is empty', () => {
  const stdout = renderSupplyCommission({ ...supplyCommissionFixture, materials: [] }).stdout.join('\n');

  expect(stdout).toContain('=== Commission Supplied ===');
  expect(stdout).toContain('ID: commission-1');
  expect(stdout).toContain('Donated: Nanite Hull Coating (nanite_hull_coating) x1');
  expect(stdout).not.toContain('=== Materials ===');
  expect(stdout).not.toContain('(None)');
  expect(stdout).not.toContain('=== Response ===');
});

test('supply_commission omits the materials table when materials has no records', () => {
  const stdout = renderSupplyCommission({
    ...supplyCommissionFixture,
    materials: ['not-a-record', 4, null],
  }).stdout.join('\n');

  expect(stdout).toContain('=== Commission Supplied ===');
  expect(stdout).not.toContain('=== Materials ===');
  expect(stdout).not.toContain('(None)');
});

test('supply_commission falls back to item_id when material name is missing or empty', () => {
  for (const name of [undefined, '', null]) {
    const stdout = renderSupplyCommission({
      ...supplyCommissionFixture,
      materials: [{ item_id: 'steel_plate', name, needed: 12, gathered: 8, complete: false }],
    }).stdout.join('\n');

    expect(stdout).toContain('=== Materials ===');
    expect(stdout).toContain('steel_plate');
    expect(stdout).toMatch(/steel_plate\s+\|\s+12\s+\|\s+8\s+\|\s+no/);
    expect(stdout).not.toContain('Steel Plate');
  }
});

test('supply_commission omits credits when absent and prints all sourced yes', () => {
  const { credits: _credits, ...withoutCredits } = supplyCommissionFixture;
  const stdout = renderSupplyCommission({ ...withoutCredits, all_sourced: true }).stdout.join('\n');

  expect(stdout).toContain('All sourced: yes');
  expect(stdout).not.toContain('Credits:');
  expect(stdout).not.toContain('All sourced: no');
});

test('supply_commission formats an all-sourced receipt without a materials array', () => {
  const { materials: _materials, credits: _credits, ...receipt } = supplyCommissionFixture;
  const stdout = renderSupplyCommission({
    ...receipt,
    all_sourced: true,
  }).stdout.join('\n');

  expect(stdout).toContain('=== Commission Supplied ===');
  expect(stdout).toContain('Donated: Nanite Hull Coating (nanite_hull_coating) x1');
  expect(stdout).toContain('All sourced: yes');
  expect(stdout).not.toContain('=== Materials ===');
  expect(stdout).not.toContain('Credits:');
  expect(stdout).not.toContain('=== Response ===');
});
