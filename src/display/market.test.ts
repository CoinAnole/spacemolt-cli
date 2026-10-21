import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { renderStructuredResult } from './index.ts';
import { factionCreateSellOrderFixture, factionQueryIntelFixture, supplyCommissionFixture } from './market.fixtures.ts';

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

const singleSellBody = {
  action: 'create_sell_order',
  kind: 'single',
  item: 'Void Salt',
  item_id: 'void_salt',
  quantity: 20,
  price_each: 500,
  quantity_filled: 20,
  quantity_listed: 0,
  total_earned: 10000,
  listing_fee: 100,
  order_id: 'order-salt-1',
  message: 'Created sell order.',
};

test('create_sell_order prints smuggling XP and level-up when present', () => {
  const stdout = renderStructuredResult(
    'create_sell_order',
    { ...singleSellBody, smuggling_xp: 50, smuggling_level_up: true },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('=== Sell Order Created ===');
  expect(stdout).toContain('Instant fills: 20 (earned: 10,000 cr)');
  expect(stdout.endsWith('Order ID: order-salt-1\nSmuggling XP: 50\nSmuggling level up: yes')).toBe(true);
  expect(stdout).not.toContain('Created sell order');
});

test('create_sell_order omits smuggling lines when both fields are absent', () => {
  const stdout = renderStructuredResult('create_sell_order', singleSellBody, options, context).stdout.join('\n');

  expect(stdout).toContain('=== Sell Order Created ===');
  expect(stdout.endsWith('Order ID: order-salt-1')).toBe(true);
  expect(stdout).not.toContain('Smuggling');
});

test('create_sell_order prints explicit smuggling XP 0 and skips a false level-up', () => {
  const stdout = renderStructuredResult(
    'create_sell_order',
    { ...singleSellBody, smuggling_xp: 0, smuggling_level_up: false },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout.endsWith('Order ID: order-salt-1\nSmuggling XP: 0')).toBe(true);
  expect(stdout).not.toContain('Smuggling level up');
});

test('create_sell_order prints a bigint smuggling_xp without rounding', () => {
  const stdout = renderStructuredResult(
    'create_sell_order',
    {
      action: 'create_sell_order',
      item: 'Iron Ore',
      item_id: 'ore_iron',
      quantity: 1,
      order_id: 'order-1',
      smuggling_xp: 9007199254740993n,
    },
    options,
    context,
  ).stdout.join('\n');
  const rounded = Number(9007199254740993n).toLocaleString();

  expect(stdout).toContain('Order ID: order-1');
  expect(stdout).toContain('Smuggling XP:');
  expect(stdout.replace(/\D/g, '')).toContain('9007199254740993');
  expect(stdout).not.toContain('9007199254740992');
  expect(stdout).not.toContain(rounded);
});

const directSellBody = {
  action: 'sell',
  item: 'Void Salt',
  item_id: 'void_salt',
  quantity_sold: 8,
  total_earned: 4000,
  unsold: 2,
  fills: [{ quantity: 8, price_each: 500, subtotal: 4000, counterparty: 'Mara' }],
  smuggling_xp: 40,
  level_up: false,
  message: 'Sold items.',
};

test('sell prints smuggling XP without a level-up line', () => {
  const stdout = renderStructuredResult('sell', directSellBody, options, context).stdout.join('\n');

  expect(stdout).toContain('=== Sell Complete ===');
  expect(stdout).toContain('Item: Void Salt (void_salt)');
  expect(stdout).toContain('Sold: 8');
  expect(stdout).toContain('Instant fills: 8 (earned: 4,000 cr) from Mara');
  expect(stdout.endsWith('Unsold: 2\nSmuggling XP: 40')).toBe(true);
  expect(stdout).not.toContain('Smuggling level up');
  expect(stdout).not.toContain('Sold items.');
  expect(stdout).not.toContain('Level up');
  expect(stdout).not.toContain('XP gained');
  expect(stdout).not.toContain('Skill level');
  expect(stdout).not.toContain('From cargo');
  expect(stdout).not.toContain('From storage');
});

test('sell prints cargo and storage counts after fills and before unsold', () => {
  const stdout = renderStructuredResult(
    'sell',
    { ...directSellBody, from_cargo: 5, from_storage: 1 },
    options,
    context,
  ).stdout.join('\n');
  const fillsAt = stdout.indexOf('Instant fills:');
  const cargoAt = stdout.indexOf('From cargo: 5');
  const storageAt = stdout.indexOf('From storage: 1');
  const unsoldAt = stdout.indexOf('Unsold: 2');
  const xpAt = stdout.indexOf('Smuggling XP: 40');

  expect(stdout).toContain('From cargo: 5');
  expect(stdout).toContain('From storage: 1');
  expect(fillsAt).toBeGreaterThan(-1);
  expect(cargoAt).toBeGreaterThan(fillsAt);
  expect(storageAt).toBeGreaterThan(cargoAt);
  expect(unsoldAt).toBeGreaterThan(storageAt);
  expect(xpAt).toBeGreaterThan(unsoldAt);
});

test('sell prints only a positive storage count when cargo contributed nothing', () => {
  const stdout = renderStructuredResult('sell', { ...directSellBody, from_storage: 4 }, options, context).stdout.join(
    '\n',
  );
  const fillsAt = stdout.indexOf('Instant fills:');
  const storageAt = stdout.indexOf('From storage: 4');
  const unsoldAt = stdout.indexOf('Unsold: 2');

  expect(stdout).toContain('From storage: 4');
  expect(stdout).not.toContain('From cargo');
  expect(fillsAt).toBeGreaterThan(-1);
  expect(storageAt).toBeGreaterThan(fillsAt);
  expect(unsoldAt).toBeGreaterThan(storageAt);
});

test('sell omits a zero source count and still prints smuggling XP 0', () => {
  for (const counts of [
    { from_cargo: 0, from_storage: 0 },
    { from_cargo: 0n, from_storage: 0n },
    { from_cargo: 0, from_storage: 0n },
    { from_cargo: 0n, from_storage: 0 },
  ]) {
    const stdout = renderStructuredResult(
      'sell',
      { ...directSellBody, ...counts, smuggling_xp: 0, smuggling_level_up: false },
      options,
      context,
    ).stdout.join('\n');

    expect(stdout).toContain('Smuggling XP: 0');
    expect(stdout).not.toContain('Smuggling level up');
    expect(stdout).not.toContain('From cargo');
    expect(stdout).not.toContain('From storage');
  }

  const cargoOnly = renderStructuredResult(
    'sell',
    { ...directSellBody, from_cargo: 3, from_storage: 0 },
    options,
    context,
  ).stdout.join('\n');
  expect(cargoOnly).toContain('From cargo: 3');
  expect(cargoOnly).not.toContain('From storage');

  const storageOnly = renderStructuredResult(
    'sell',
    { ...directSellBody, from_cargo: 0n, from_storage: 4 },
    options,
    context,
  ).stdout.join('\n');
  expect(storageOnly).toContain('From storage: 4');
  expect(storageOnly).not.toContain('From cargo');
});

test('sell omits non-positive source values and still formats the receipt', () => {
  for (const value of [-1, 1.5, '6', null, true, false, Number.NaN, Number.POSITIVE_INFINITY, -1n, [6], { n: 6 }]) {
    const stdout = renderStructuredResult(
      'sell',
      { ...directSellBody, from_cargo: value, from_storage: value },
      options,
      context,
    ).stdout.join('\n');

    expect(stdout).toContain('=== Sell Complete ===');
    expect(stdout).not.toContain('=== Response ===');
    expect(stdout).not.toContain('From cargo');
    expect(stdout).not.toContain('From storage');
  }
});

test('sell prints a bigint from_cargo without rounding', () => {
  const stdout = renderStructuredResult(
    'sell',
    {
      action: 'sell',
      item: 'Iron Ore',
      item_id: 'ore_iron',
      quantity_sold: 1,
      total_earned: 1,
      from_cargo: 9007199254740993n,
    },
    options,
    context,
  ).stdout.join('\n');
  const rounded = Number(9007199254740993n).toLocaleString();

  expect(stdout).toContain('From cargo:');
  expect(stdout.replace(/\D/g, '')).toContain('9007199254740993');
  expect(stdout).not.toContain('9007199254740992');
  expect(stdout).not.toContain(rounded);
  expect(stdout).not.toContain('From storage');
});

test('sell --format text prints the same source lines as the table', () => {
  const body = { ...directSellBody, from_cargo: 5, from_storage: 1 };
  const table = renderStructuredResult('sell', body, options, context).stdout.join('\n');
  const text = renderStructuredResult('sell', body, { ...options, format: 'text' }, context).stdout.join('\n');

  expect(text).toBe(table);
  expect(text).toContain('From cargo: 5');
  expect(text).toContain('From storage: 1');
});

test('sell --json keeps zero, negative, and string source fields', () => {
  const body = {
    action: 'sell',
    item: 'Void Salt',
    from_cargo: 0,
    from_storage: -3,
    note: 'keep',
  };
  const stdout = renderStructuredResult('sell', body, { ...options, format: 'json' }, context).stdout.join('\n');

  expect(JSON.parse(stdout)).toEqual(body);
  expect(stdout).not.toContain('=== Sell Complete ===');
});

test('sell source lines follow total earned when nothing was sold', () => {
  const stdout = renderStructuredResult(
    'sell',
    {
      action: 'sell',
      item: 'Void Salt',
      item_id: 'void_salt',
      total_earned: 40,
      unsold: 2,
      from_cargo: 1,
      from_storage: 2,
    },
    options,
    context,
  ).stdout.join('\n');
  const earnedAt = stdout.indexOf('Total earned:');
  const cargoAt = stdout.indexOf('From cargo: 1');
  const storageAt = stdout.indexOf('From storage: 2');
  const unsoldAt = stdout.indexOf('Unsold: 2');

  expect(earnedAt).toBeGreaterThan(-1);
  expect(cargoAt).toBeGreaterThan(earnedAt);
  expect(storageAt).toBeGreaterThan(cargoAt);
  expect(unsoldAt).toBeGreaterThan(storageAt);
  expect(stdout).not.toContain('Sold:');
  expect(stdout).not.toContain('Instant fills:');
});

test('sell does not format source counts without a sell receipt shape', () => {
  const stdout = renderStructuredResult(
    'sell',
    { item: 'Iron Ore', item_id: 'ore_iron', from_cargo: 5, from_storage: 1 },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).not.toContain('=== Sell Complete ===');
  expect(stdout).not.toContain('From cargo:');
  expect(stdout).not.toContain('From storage:');
});

test('create_sell_order does not print direct sell source lines', () => {
  const withSmuggling = renderStructuredResult(
    'create_sell_order',
    { ...singleSellBody, from_cargo: 20, from_storage: 1, smuggling_xp: 50, smuggling_level_up: true },
    options,
    context,
  ).stdout.join('\n');
  const orderOnly = renderStructuredResult(
    'create_sell_order',
    { ...singleSellBody, from_cargo: 20, from_storage: 1 },
    options,
    context,
  ).stdout.join('\n');

  expect(withSmuggling).toContain('=== Sell Order Created ===');
  expect(withSmuggling.endsWith('Order ID: order-salt-1\nSmuggling XP: 50\nSmuggling level up: yes')).toBe(true);
  expect(withSmuggling).not.toContain('From cargo');
  expect(withSmuggling).not.toContain('From storage');
  expect(orderOnly.endsWith('Order ID: order-salt-1')).toBe(true);
  expect(orderOnly).not.toContain('From cargo');
  expect(orderOnly).not.toContain('From storage');
});

test('sell does not print trading level_up as smuggling', () => {
  const stdout = renderStructuredResult(
    'sell',
    { ...directSellBody, level_up: true, skill_level: 4, xp_gained: 12 },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Smuggling XP: 40');
  expect(stdout).not.toContain('Smuggling level up');
  expect(stdout).not.toContain('Level up');
  expect(stdout).not.toContain('XP gained');
  expect(stdout).not.toContain('Skill level');
  expect(stdout).not.toContain('Sold items.');
});

test('faction_create_sell_order does not print player smuggling lines', () => {
  const fixture = structuredClone(factionCreateSellOrderFixture);
  Object.assign(fixture.details, { smuggling_xp: 50, smuggling_level_up: true });
  const stdout = renderStructuredResult('faction_create_sell_order', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('=== Sell Order Created ===');
  expect(stdout).toContain('Order ID: faction-sell-1');
  expect(stdout).not.toContain('Smuggling XP');
  expect(stdout).not.toContain('Smuggling level up');
});

test('single create_buy_order still prints delivery lines and no smuggling', () => {
  const stdout = renderStructuredResult(
    'create_buy_order',
    {
      action: 'create_buy_order',
      item: 'Iron Ore',
      item_id: 'iron_ore',
      quantity: 10,
      price_each: 5,
      quantity_filled: 4,
      quantity_listed: 6,
      total_spent: 20,
      delivered_to_cargo: 4,
      delivered_to_storage: 3,
      order_id: 'order-buy-1',
      smuggling_xp: 50,
      smuggling_level_up: true,
      message: 'Created buy order.',
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('=== Buy Order Created ===');
  expect(stdout).toContain('Delivered to cargo: 4');
  expect(stdout).toContain('Delivered to storage: 3');
  expect(stdout).not.toContain('Smuggling');
  expect(stdout).not.toContain('Created buy order.');
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
    description?: unknown;
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
  expect(stdout).not.toContain('Description');

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

test('faction_query_intel prints trimmed system and POI descriptions in field order', () => {
  const fixture = cloneIntelFixture();
  firstIntelEntry(fixture).description = '  Birthplace system  ';
  firstIntelPoi(fixture).description = '  Dense mining field  ';
  const stdout = renderIntel(fixture);
  const poiHeader = '  Sol Gas Cloud (gas_cloud) [deep core] sol_gas_cloud';
  const tickAt = stdout.indexOf('Intel tick: 900685 by Marlowe, age 5 ticks');
  const systemDescAt = stdout.indexOf('Description: Birthplace system');
  const poiAt = stdout.indexOf(poiHeader);
  const poiDescAt = stdout.indexOf('    Description: Dense mining field');
  const readAt = stdout.indexOf('    Read at tick: unverified');
  const hydrogenAt = stdout.indexOf('hydrogen_gas');

  expect(stdoutLine(stdout, 'Description: Birthplace system')).toBe('Description: Birthplace system');
  expect(stdoutLine(stdout, '    Description: Dense mining field')).toBe('    Description: Dense mining field');
  expect(tickAt).toBeGreaterThan(-1);
  expect(systemDescAt).toBeGreaterThan(tickAt);
  expect(poiAt).toBeGreaterThan(systemDescAt);
  expect(poiDescAt).toBeGreaterThan(poiAt);
  expect(readAt).toBeGreaterThan(poiDescAt);
  expect(hydrogenAt).toBeGreaterThan(readAt);
  expect(stdout).toContain('Showing intel for 1 system');
  expect(stdoutLine(stdout, poiHeader)).toBe(poiHeader);
  expect(stdoutLine(stdout, poiHeader)).not.toContain('Description');
  expect(stdoutLine(stdout, poiHeader)).not.toContain('Dense mining field');
});

test('faction_query_intel omits missing, blank, and non-string descriptions', () => {
  for (const description of [undefined, '', '  \n\t  ', null, 4, false, { text: 'no' }]) {
    const fixture = cloneIntelFixture();
    const entry = firstIntelEntry(fixture);
    const poi = firstIntelPoi(fixture);
    if (description === undefined) {
      delete entry.description;
      delete poi.description;
    } else {
      entry.description = description;
      poi.description = description;
    }
    const stdout = renderIntel(fixture);
    expect(stdout).toContain('Showing intel for 1 system');
    expect(stdout).toContain('    Read at tick: unverified');
    expect(stdout).toContain('Sol Gas Cloud');
    expect(stdout).not.toContain('Description');
  }

  expect(renderIntel(cloneIntelFixture())).not.toContain('Description');
});

test('faction_query_intel skips a description whose trimmed text equals the printed message', () => {
  const fixture = cloneIntelFixture();
  const message = 'Showing intel for 1 system';
  firstIntelEntry(fixture).description = '  Showing intel for 1 system  ';
  firstIntelPoi(fixture).description = message;
  firstIntelEntry(fixture).pois.push({
    id: 'sol_belt',
    type: 'asteroid',
    name: 'Sol Belt',
    description: 'Dense mining field',
  });
  const stdout = renderIntel(fixture);
  const beltAt = stdout.indexOf('  Sol Belt (asteroid) sol_belt');
  const descAt = stdout.indexOf('    Description: Dense mining field');
  const readAt = stdout.indexOf('    Read at tick: unverified', descAt);

  expect(stdout.split('\n').filter((line) => line === message)).toHaveLength(1);
  expect(stdout).not.toContain('Description: Showing intel for 1 system');
  expect(beltAt).toBeGreaterThan(-1);
  expect(descAt).toBeGreaterThan(beltAt);
  expect(readAt).toBeGreaterThan(descAt);
});

test('faction_query_intel prints a description when the message was not printed', () => {
  const blank = cloneIntelFixture();
  blank.message = '   ';
  firstIntelEntry(blank).description = '   ';
  expect(renderIntel(blank)).not.toContain('Description');

  const numeric = cloneIntelFixture();
  numeric.message = 4;
  firstIntelEntry(numeric).description = 'Birthplace system';
  const stdout = renderIntel(numeric);
  expect(stdoutLine(stdout, 'Description: Birthplace system')).toBe('Description: Birthplace system');
  expect(stdout).not.toContain('Showing intel');
});

test('faction_query_intel prints every POI description with no 12 cap', () => {
  const fixture = cloneIntelFixture();
  firstIntelEntry(fixture).description = 'System lore';
  firstIntelEntry(fixture).pois = Array.from({ length: 13 }, (_, index) => {
    const n = index + 1;
    return {
      id: `belt_${n}`,
      type: 'asteroid',
      name: `Belt ${n}`,
      description: 'Belt lore',
    };
  });
  const stdout = renderIntel(fixture);
  const lines = stdout.split('\n');

  expect(lines.filter((line) => line === 'Description: System lore')).toHaveLength(1);
  expect(lines.filter((line) => line === '    Description: Belt lore')).toHaveLength(13);
  expect(stdout).not.toMatch(/and \d+ more/);
  expect(stdout).toContain('Belt 13');
});

test('faction_query_intel prints descriptions when intel tick is omitted', () => {
  const fixture = cloneIntelFixture();
  delete firstIntelEntry(fixture).submitted_at_tick;
  firstIntelEntry(fixture).description = 'Birthplace system';
  firstIntelPoi(fixture).description = 'Dense mining field';
  const stdout = renderIntel(fixture);
  const policeAt = stdout.indexOf('Police: 3');
  const descAt = stdout.indexOf('Description: Birthplace system');
  const poiAt = stdout.indexOf('  Sol Gas Cloud (gas_cloud) [deep core] sol_gas_cloud');

  expect(policeAt).toBeGreaterThan(-1);
  expect(descAt).toBeGreaterThan(policeAt);
  expect(poiAt).toBeGreaterThan(descAt);
  expect(stdout).toContain('    Description: Dense mining field');
  expect(stdout).not.toContain('Intel tick:');
});

test('faction_query_intel --format text uses the description lines', () => {
  const fixture = cloneIntelFixture();
  firstIntelEntry(fixture).description = '  Birthplace system  ';
  firstIntelPoi(fixture).description = '  Dense mining field  ';
  const stdout = renderIntel(fixture, { format: 'text' });

  expect(stdoutLine(stdout, 'Description: Birthplace system')).toBe('Description: Birthplace system');
  expect(stdoutLine(stdout, '    Description: Dense mining field')).toBe('    Description: Dense mining field');
  expect(stdout).not.toContain('=== Response ===');
});

test('faction_query_intel json keeps description and does not add the label', () => {
  const fixture = cloneIntelFixture();
  firstIntelEntry(fixture).description = 'Birthplace system';
  firstIntelPoi(fixture).description = 'Dense mining field';
  const jsonStdout = renderStructuredResult(
    'faction_query_intel',
    fixture,
    { ...options, format: 'json' },
    context,
  ).stdout.join('\n');
  const parsed = JSON.parse(jsonStdout) as IntelResult;

  expect(parsed.entries[0]?.description).toBe('Birthplace system');
  expect(parsed.entries[0]?.pois[0]?.description).toBe('Dense mining field');
  expect(jsonStdout).not.toContain('Description:');
  expect(jsonStdout).not.toContain('=== Faction Intel ===');

  const yamlStdout = renderStructuredResult(
    'faction_query_intel',
    fixture,
    { ...options, format: 'yaml' },
    context,
  ).stdout.join('\n');
  expect(yamlStdout).toContain('Birthplace system');
  expect(yamlStdout).toContain('Dense mining field');
  expect(yamlStdout).not.toContain('=== Faction Intel ===');
});

test('faction_query_intel search keeps descriptions on the matched row', () => {
  const fixture = cloneIntelFixture();
  fixture.live_systems = ['sol', 'proxima'];
  firstIntelPoi(fixture).read_at_tick = fixture.current_tick;
  firstIntelEntry(fixture).description = 'System lore';
  firstIntelPoi(fixture).description = 'Dense mining field';
  firstIntelEntry(fixture).pois.push({
    id: 'sol_belt',
    type: 'asteroid',
    name: 'Sol Belt',
    description: 'Other belt',
    resources: [{ resource_id: 'iron_ore', richness: 3, remaining: 10, max_remaining: 40, depletion_percent: 75 }],
  });
  const stdout = renderIntel(fixture, { outputSearch: 'hydrogen' });

  expect(stdoutLine(stdout, 'Description: System lore')).toBe('Description: System lore');
  expect(stdoutLine(stdout, '    Description: Dense mining field')).toBe('    Description: Dense mining field');
  expect(stdout).toContain('Live systems: sol, proxima');
  expect(stdout).toContain('hydrogen_gas');
  expect(stdout).not.toContain('Sol Belt');
  expect(stdout).not.toContain('Other belt');
  expect(stdout).not.toContain('argon_gas');
});

test('faction_query_intel keeps an internal newline and repeated spaces in a description', () => {
  const fixture = cloneIntelFixture();
  firstIntelEntry(fixture).description = '  line one\nline  two  ';
  firstIntelPoi(fixture).description = '  belt  one\nline two  ';
  const stdout = renderIntel(fixture);
  const lines = stdout.split('\n');
  const systemAt = lines.indexOf('Description: line one');
  const poiAt = lines.indexOf('    Description: belt  one');

  expect(stdout).toContain('Description: line one\nline  two');
  expect(stdout).toContain('    Description: belt  one\nline two');
  expect(systemAt).toBeGreaterThan(-1);
  expect(lines[systemAt + 1]).toBe('line  two');
  expect(poiAt).toBeGreaterThan(-1);
  expect(lines[poiAt + 1]).toBe('line two');
  expect(stdout).not.toContain('Description: line one line');
  expect(stdout).not.toContain('    line  two');
  expect(stdout).not.toContain('    line two');
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
