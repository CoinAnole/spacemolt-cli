import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { renderStructuredResult } from './index.ts';
import { shippingActiveEmptyFixture } from './shipping.fixtures.ts';

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
      return new Date('2026-07-17T00:00:00.000Z');
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

function rawFallbackJson(stdout: string): unknown {
  expect(stdout).toContain('=== Response ===');
  return JSON.parse(stdout.slice(stdout.indexOf('{')));
}

const contract = {
  id: 'shipment-1',
  package_id: 'package-1',
  status: 'in_transit',
  origin_base_id: 'earth_station',
  destination_base_id: 'nova_central',
  shipper: { kind: 'player', id: 'shipper-1' },
  recipient: { kind: 'faction', id: 'recipient-1' },
  contractor: { kind: 'player', id: 'carrier-1' },
  visibility: 'public',
  service_level: 'priority',
  base_reward: 12500,
  max_speed_bonus: 2500,
  service_fee: 800,
  reward_escrow: 15000,
  speed_bonus_escrow: 2500,
  policy_status: 'active',
  insurable: true,
  risk_band: 'licensed',
  premium: 450,
  covered_value: 30000,
  reserved_exposure: 33000,
  failure_debt: 33000,
  reputation_eligible: false,
  posted_at: '2026-07-17T10:00:00Z',
  listing_expires_at: '2026-07-18T10:00:00Z',
  accepted_at: '2026-07-17T10:05:00Z',
  target_tick: 1200,
  deadline_tick: 1240,
  latest_beacon_fingerprint: 'beacon-alpha',
  latest_beacon_at: '2026-07-17T10:10:00Z',
};

test('freight quote prints exact digits for an out-of-range base reward', () => {
  const reward = 9007199254740993n;
  const stdout = output('shipping_quote', {
    action: 'quote',
    quote: {
      package_id: 'package-1',
      origin_base_id: 'earth_station',
      destination_base_id: 'nova_central',
      base_reward: reward,
    },
  });
  expect(stdout).toContain(`Base reward: ${reward.toLocaleString()} cr`);
  expect(stdout.replace(/\D/g, '')).toContain('9007199254740993');
  expect(stdout).not.toContain('9007199254740992');
});

test('renders freight quotes with route, actors, costs, liability, and appraisal lines', () => {
  const stdout = output('shipping_quote', {
    action: 'quote',
    quote: {
      package_id: 'package-1',
      origin_base_id: 'earth_station',
      destination_base_id: 'nova_central',
      shipper: { kind: 'player', id: 'shipper-1' },
      recipient: { kind: 'station', id: 'nova_central' },
      invited_carrier: { kind: 'faction', id: 'haulers-guild' },
      service_level: 'priority',
      visibility: 'invited',
      route_hops: 3,
      target_ticks: 20,
      deadline_ticks: 40,
      base_reward: 12500,
      estimated_reward: 11000,
      estimate_samples: 8,
      max_speed_bonus: 2500,
      service_fee: 800,
      premium: 450,
      total_cost: 16250,
      appraised_value: 30000,
      covered_value: 30000,
      insurance_selected: true,
      insurable: true,
      risk_band: 'licensed',
      required_carrier_tier: 'licensed',
      reserved_exposure: 33000,
      failure_debt: 33000,
      consequences: 'Opening the seal forfeits payment.',
      appraisal_lines: [
        {
          item_id: 'iron_ore',
          quantity: 20,
          unit_value: 100,
          total_value: 2000,
          insurable: true,
          confidence: 'high',
          basis: 'completed fills',
        },
      ],
    },
  });

  expect(stdout).toContain('=== Freight Quote ===');
  expect(stdout).toContain('earth_station -> nova_central');
  expect(stdout).toContain('player:shipper-1');
  expect(stdout).toContain('Total cost: 16,250 cr');
  expect(stdout).toContain('Estimated market reward: 11,000 cr');
  expect(stdout).toContain('Estimate samples: 8');
  expect(stdout).toContain('Failure debt: 33,000 cr');
  expect(stdout).toContain('Target: 20 ticks');
  expect(stdout).toContain('Insurance selected: yes');
  expect(stdout).toContain('=== Appraisal ===');
  expect(stdout).toContain('iron_ore');
  expect(stdout).not.toContain('=== Response ===');
});

test('freight quote with insurance_selected false prints Insurance selected: no', () => {
  const stdout = output('shipping_quote', {
    action: 'quote',
    quote: {
      package_id: 'package-1',
      insurance_selected: false,
    },
  });

  expect(stdout).toContain('Insurance selected: no');
});

test('freight quote shipper without an id still prints the quote', () => {
  const stdout = output('shipping_quote', {
    action: 'quote',
    quote: {
      package_id: 'package-1',
      shipper: { kind: 'player' },
    },
  });

  expect(stdout).toContain('=== Freight Quote ===');
  expect(stdout).toContain('Package: package-1');
  expect(stdout).not.toContain('Shipper:');
  expect(stdout).not.toContain('=== Response ===');
});

test('freight quote shipper id of only spaces omits Shipper and still prints the quote', () => {
  const stdout = output('shipping_quote', {
    action: 'quote',
    quote: {
      package_id: 'package-1',
      shipper: { kind: 'player', id: '   ' },
    },
  });

  expect(stdout).toContain('=== Freight Quote ===');
  expect(stdout).toContain('Package: package-1');
  expect(stdout).not.toContain('Shipper:');
  expect(stdout).not.toContain('=== Response ===');
});

test('freight quote shipper with an id and no kind omits Shipper and still prints the quote', () => {
  const stdout = output('shipping_quote', {
    action: 'quote',
    quote: {
      package_id: 'package-1',
      shipper: { id: 'marlowe' },
    },
  });

  expect(stdout).toContain('=== Freight Quote ===');
  expect(stdout).toContain('Package: package-1');
  expect(stdout).not.toContain('Shipper:');
  expect(stdout).not.toContain('=== Response ===');
});

test('freight quote shipper name prints Marlowe with kind and id', () => {
  const stdout = output('shipping_quote', {
    action: 'quote',
    quote: {
      package_id: 'package-1',
      shipper: { kind: 'player', id: 'marlowe', name: 'Marlowe' },
    },
  });

  expect(stdout).toContain('Shipper: Marlowe (player:marlowe)');
  expect(stdout).not.toContain('=== Response ===');
});

test('freight quote keeps surrounding spaces in a shipper name', () => {
  const stdout = output('shipping_quote', {
    action: 'quote',
    quote: {
      package_id: 'package-1',
      shipper: { kind: 'player', id: 'marlowe', name: ' Marlowe ' },
    },
  });

  expect(stdout).toContain('Shipper:  Marlowe  (player:marlowe)');
});

test('freight quote blank or non-string shipper name stays kind and id', () => {
  for (const name of ['', '   ', 1, true]) {
    const stdout = output('shipping_quote', {
      action: 'quote',
      quote: {
        package_id: 'package-1',
        shipper: { kind: 'player', id: 'marlowe', name },
      },
    });
    expect(stdout).toContain('Shipper: player:marlowe');
    expect(stdout).not.toContain('(player:marlowe)');
  }
});

test('freight quote shipper name without a kind still omits Shipper', () => {
  const stdout = output('shipping_quote', {
    action: 'quote',
    quote: {
      package_id: 'package-1',
      shipper: { id: 'marlowe', name: 'Marlowe' },
    },
  });

  expect(stdout).toContain('=== Freight Quote ===');
  expect(stdout).not.toContain('Shipper:');
  expect(stdout).not.toContain('Marlowe');
});

test('one-sided freight quote omits Route when destination_base_id is omitted', () => {
  const stdout = output('shipping_quote', {
    action: 'quote',
    quote: {
      package_id: 'package-1',
      origin_base_id: 'earth_station',
    },
  });

  expect(stdout).toContain('=== Freight Quote ===');
  expect(stdout).not.toContain('Route:');
});

test('freight quote with a whitespace destination_base_id omits Route and still prints the quote', () => {
  const stdout = output('shipping_quote', {
    action: 'quote',
    quote: {
      package_id: 'package-1',
      origin_base_id: 'earth_station',
      destination_base_id: '   ',
    },
  });

  expect(stdout).toContain('=== Freight Quote ===');
  expect(stdout).toContain('Package: package-1');
  expect(stdout).not.toContain('Route:');
  expect(stdout).not.toContain('=== Response ===');
});

test('freight quote with a whitespace service_level prints Package and the quote heading and not Service', () => {
  const stdout = output('shipping_quote', {
    action: 'quote',
    quote: {
      package_id: 'package-1',
      service_level: '   ',
    },
  });

  expect(stdout).toContain('=== Freight Quote ===');
  expect(stdout).toContain('Package: package-1');
  expect(stdout).not.toContain('Service:');
  expect(stdout).not.toContain('=== Response ===');
});

test('freight quote with a whitespace origin_base_id omits Route and still prints the quote', () => {
  const stdout = output('shipping_quote', {
    action: 'quote',
    quote: {
      package_id: 'package-1',
      origin_base_id: '   ',
      destination_base_id: 'earth_station',
    },
  });

  expect(stdout).toContain('=== Freight Quote ===');
  expect(stdout).toContain('Package: package-1');
  expect(stdout).not.toContain('Route:');
  expect(stdout).not.toContain('=== Response ===');
});

test('freight quote prints uninsurable reason', () => {
  const stdout = output('shipping_quote', {
    action: 'quote',
    quote: {
      uninsurable_reason: 'seal broken',
    },
  });
  expect(stdout).toContain('Uninsurable reason: seal broken');
  expect(stdout).not.toContain('=== Response ===');
});

test('freight quote appraisal line prints its uninsurable reason', () => {
  const stdout = output('shipping_quote', {
    action: 'quote',
    quote: {
      appraisal_lines: [
        {
          item_id: 'iron_ore',
          uninsurable_reason: 'opened seal',
        },
      ],
    },
  });
  expect(stdout).toContain('opened seal');
});

test('freight quote appraisal line with insurable false prints no', () => {
  const stdout = output('shipping_quote', {
    action: 'quote',
    quote: {
      appraisal_lines: [
        {
          item_id: 'iron_ore',
          insurable: false,
        },
      ],
    },
  });
  expect(stdout).toContain('no');
  expect(stdout).not.toContain('yes');
});

test('renders an explicit empty appraisal message', () => {
  const stdout = output('shipping_quote', {
    action: 'quote',
    quote: {
      package_id: 'package-empty-1',
      origin_base_id: 'earth_station',
      destination_base_id: 'nova_central',
      appraisal_lines: [],
    },
  });
  expect(stdout).toContain('No appraisal lines.');
  expect(stdout).not.toContain('=== Response ===');
});

test('appraisal_lines containing only a string prints No appraisal lines.', () => {
  const stdout = output('shipping_quote', {
    action: 'quote',
    quote: {
      package_id: 'package-empty-1',
      origin_base_id: 'earth_station',
      destination_base_id: 'nova_central',
      appraisal_lines: ['not-a-line'],
    },
  });
  expect(stdout).toContain('No appraisal lines.');
  expect(stdout).not.toContain('not-a-line');
  expect(stdout).not.toContain('=== Response ===');
});

test('freight quote with no appraisal_lines key still prints the quote', () => {
  const stdout = output('shipping_quote', {
    action: 'quote',
    quote: {
      package_id: 'package-missing-lines',
      origin_base_id: 'earth_station',
      destination_base_id: 'nova_central',
    },
  });
  expect(stdout).toContain('=== Freight Quote ===');
  expect(stdout).toContain('Package: package-missing-lines');
  expect(stdout).toContain('earth_station -> nova_central');
  expect(stdout).not.toContain('No appraisal lines.');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders direct and mutation contract responses with action-specific headings', () => {
  const fixtures: Array<[string, Record<string, unknown>, string]> = [
    [
      'shipping_post',
      { details: { action: 'post', contract }, player: { credits: 10 }, ship: {}, cargo: [] },
      'Posted Freight Contract',
    ],
    ['shipping_get', { action: 'get', contract }, 'Freight Contract'],
    [
      'shipping_accept',
      { details: { action: 'accept', contract }, player: { credits: 10 }, ship: {}, cargo: [] },
      'Accepted Freight Contract',
    ],
  ];

  for (const [command, fixture, heading] of fixtures) {
    const stdout = output(command, fixture);
    expect(stdout).toContain(`=== ${heading} ===`);
    expect(stdout).toContain('Contract: shipment-1');
    expect(stdout).toContain('Route: earth_station -> nova_central');
    expect(stdout).toContain('Contractor: player:carrier-1');
    expect(stdout).toContain('Base reward: 12,500 cr');
    expect(stdout).toContain('Reputation eligible: no');
    expect(stdout).toContain('Posted: 2026-07-17T10:00:00Z');
    expect(stdout).not.toContain('=== Response ===');
  }
});

test('renders the shipping_get delivered_at branch', () => {
  const stdout = output('shipping_get', {
    action: 'get',
    contract: { ...contract, delivered_at: '2026-07-17T10:35:00Z' },
  });
  expect(stdout).toContain('Delivered: 2026-07-17T10:35:00Z');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders the shipping_get terminal_reason branch', () => {
  const stdout = output('shipping_get', {
    action: 'get',
    contract: { ...contract, terminal_reason: 'seal broken' },
  });
  expect(stdout).toContain('=== Freight Contract ===');
  expect(stdout).toContain('Terminal reason: seal broken');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders the shipping_get breached_at branch', () => {
  const stdout = output('shipping_get', {
    action: 'get',
    contract: { ...contract, breached_at: '2026-07-17T10:40:00Z' },
  });
  expect(stdout).toContain('Breached: 2026-07-17T10:40:00Z');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders the shipping_get settled_at branch', () => {
  const stdout = output('shipping_get', {
    action: 'get',
    contract: { ...contract, settled_at: '2026-07-17T11:00:00Z' },
  });
  expect(stdout).toContain('Settled: 2026-07-17T11:00:00Z');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders the shipping_get insurer branch', () => {
  const stdout = output('shipping_get', {
    action: 'get',
    contract: { ...contract, insurer: { kind: 'faction', id: 'lloyds' } },
  });
  expect(stdout).toContain('Insurer: faction:lloyds');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders the shipping_get salvage-owner branch', () => {
  const stdout = output('shipping_get', {
    action: 'get',
    contract: { ...contract, salvage_owner: { kind: 'player', id: 'salvager-1' } },
  });
  expect(stdout).toContain('Salvage owner: player:salvager-1');
  expect(stdout).not.toContain('=== Response ===');
});

test('keeps mutation envelopes unchanged in JSON output', () => {
  const fixture = {
    details: { action: 'post', contract },
    player: { credits: 10 },
    ship: { id: 'ship-1' },
    cargo: [{ item_id: 'package-1', quantity: 1 }],
  };
  const rendered = renderStructuredResult(
    'shipping_post',
    structuredClone(fixture),
    { ...options, format: 'json' },
    context,
  );

  expect(JSON.parse(rendered.stdout.join('\n'))).toEqual(fixture);
});

test('declines malformed required shipping roots and preserves the raw fallback', () => {
  expect(output('shipping_quote', { action: 'quote', quote: 'invalid' })).toContain('=== Response ===');
  expect(output('shipping_get', { action: 'get', contract: [] })).toContain('=== Response ===');
  expect(rawFallbackJson(output('shipping_list', { action: 'list', shipments: 'invalid' }))).toEqual({
    action: 'list',
    shipments: 'invalid',
  });
  expect(rawFallbackJson(output('shipping_list_all', { action: 'list_all', shipments: 'invalid' }))).toEqual({
    action: 'list_all',
    shipments: 'invalid',
  });
  expect(
    rawFallbackJson(output('shipping_list', { action: 'list', shipments: [{ contract: 'invalid', eligible: true }] })),
  ).toEqual({
    action: 'list',
    shipments: [{ contract: 'invalid', eligible: true }],
  });
  expect(rawFallbackJson(output('shipping_track', { action: 'track', contract: 'invalid', events: [] }))).toEqual({
    action: 'track',
    contract: 'invalid',
    events: [],
  });
  expect(rawFallbackJson(output('shipping_track', { action: 'track', contract, events: ['invalid'] }))).toEqual({
    action: 'track',
    contract,
    events: ['invalid'],
  });
  expect(
    rawFallbackJson(
      output('shipping_profile', {
        action: 'profile',
        profile: carrierProfile,
        capacity: carrierCapacity,
        progression: carrierProgression,
        debts: ['invalid'],
      }),
    ),
  ).toEqual({
    action: 'profile',
    profile: carrierProfile,
    capacity: carrierCapacity,
    progression: carrierProgression,
    debts: ['invalid'],
  });
});

test('preserves the complete mutation envelope when a shipping formatter declines', () => {
  const fixture = {
    details: { action: 'post', contract: 'invalid' },
    player: { credits: 10 },
    ship: { id: 'ship-1' },
    cargo: [{ item_id: 'package-1', quantity: 1 }],
  };
  const stdout = output('shipping_post', fixture);

  expect(stdout).toContain('=== Response ===');
  expect(JSON.parse(stdout.slice(stdout.indexOf('{')))).toEqual(fixture);
});

test('renders freight-list hazmat, warning, and listing eligibility', () => {
  const stdout = output('shipping_list', {
    action: 'list',
    page: 2,
    per_page: 20,
    total: 21,
    shipments: [
      {
        contract: { ...contract, id: 'hazmat-1', base_reward: 0, requires_hazmat: true },
        eligible: true,
        reason: 'Outstanding freight debt blocks acceptance.',
      },
      {
        contract: { ...contract, id: 'plain-1', failure_debt: 500, requires_hazmat: false },
        eligible: false,
        warning: 'no lead-lined hold',
      },
      {
        contract: {
          ...contract,
          id: 'omitted-1',
          failure_debt: 500,
          origin_base_id: 'alpha_port',
          destination_base_id: 'beta_port',
        },
      },
    ],
  });

  expect(stdout).toContain('=== Freight Contracts ===');
  expect(stdout).toContain('page 2, 3 of 21');
  expect(stdout).toMatch(/Hazmat\s+\|\s+Warning\s+\|\s+Eligible/);
  expect(stdout).not.toMatch(/\bReason\b/);
  expect(stdout).toContain('0 cr');
  expect(stdout).toContain('yes');
  expect(stdout).toContain('no');
  expect(stdout).toContain('no lead-lined hold');
  expect(stdout).not.toContain('Outstanding freight debt blocks acceptance.');
  const omitted = stdout.split('\n').find((line) => line.includes('omitted-1'));
  expect(omitted).toBeDefined();
  expect(omitted).not.toContain('yes');
  expect(omitted).not.toContain('no');
  expect(omitted).not.toContain('no lead-lined hold');
  expect(stdout).not.toContain('=== Response ===');
});

test('shipping_list omits Hazmat and Warning when no row sends them', () => {
  const stdout = output('shipping_list', {
    action: 'list',
    shipments: [
      { contract: { ...contract, id: 'shipment-page-blank' }, warning: '   ' },
      { contract: { ...contract, id: 'shipment-page-empty' }, warning: '' },
      { contract: { ...contract, id: 'shipment-page-number' }, warning: 0 },
    ],
  });

  expect(stdout).not.toMatch(/\bHazmat\b/);
  expect(stdout).not.toMatch(/\bWarning\b/);
  expect(stdout).not.toMatch(/\bEligible\b/);
  expect(stdout).not.toMatch(/\bReason\b/);
});

test('shipping_list keeps Hazmat when requires_hazmat is false and omits Warning', () => {
  const stdout = output('shipping_list', {
    action: 'list',
    shipments: [{ contract: { ...contract, id: 'shipment-clear-1', requires_hazmat: false } }],
  });

  expect(stdout).toMatch(/\bHazmat\b/);
  expect(stdout).toContain('no');
  expect(stdout).not.toContain('yes');
  expect(stdout).not.toMatch(/\bWarning\b/);
});

test('freight list prints listing eligible and ineligible_reason without tick columns', () => {
  const listing = {
    contract: {
      ...contract,
      origin_base_id: 'alpha_port',
      destination_base_id: 'beta_port',
      status: 'posted',
      eligible: false,
      ineligible_reason: 'from the contract',
      target_ticks: 111,
      deadline_ticks: 222,
      recovery_ticks: 333,
    },
    target_ticks: 424242,
    deadline_ticks: 434343,
    recovery_ticks: 444444,
  };
  const payload = {
    action: 'list_all',
    page: 1,
    total: 4,
    shipments: [
      {
        ...listing,
        contract: { ...listing.contract, id: 'take-1' },
        eligible: true,
        ineligible_reason: '   ',
      },
      {
        ...listing,
        contract: { ...listing.contract, id: 'skip-1' },
        eligible: false,
        ineligible_reason: '  carrier owes 500 cr  ',
      },
      {
        ...listing,
        contract: { ...listing.contract, id: 'odd-1' },
        eligible: 'false',
        ineligible_reason: false,
      },
      {
        ...listing,
        contract: { ...listing.contract, id: 'bare-1' },
      },
    ],
  };

  for (const command of ['shipping_list', 'shipping_list_all'] as const) {
    const stdout = output(command, payload);
    expect(stdout).toContain('=== Freight Contracts ===');
    expect(stdout).toMatch(/Eligible\s+\|\s+Reason/);
    expect(stdout).not.toContain('Target');
    expect(stdout).not.toContain('Deadline');
    expect(stdout).not.toContain('Recovery');
    expect(stdout).not.toContain('424242');
    expect(stdout).not.toContain('434343');
    expect(stdout).not.toContain('444444');
    expect(stdout).not.toContain('from the contract');
    expect(stdout).not.toContain('=== Response ===');
    const yes = stdout.split('\n').find((line) => line.includes('take-1'));
    const no = stdout.split('\n').find((line) => line.includes('skip-1'));
    const blank = stdout.split('\n').find((line) => line.includes('odd-1'));
    const omitted = stdout.split('\n').find((line) => line.includes('bare-1'));
    expect(yes).toContain('yes');
    expect(yes).not.toContain('no');
    expect(yes).not.toContain('carrier owes 500 cr');
    expect(no).toContain('no');
    expect(no).not.toContain('yes');
    expect(no).toContain('carrier owes 500 cr');
    expect(no).not.toContain('  carrier owes 500 cr  ');
    expect(blank).not.toContain('yes');
    expect(blank).not.toContain('no');
    expect(blank).not.toContain('false');
    expect(omitted).not.toContain('yes');
    expect(omitted).not.toContain('no');
  }
});

test('freight list omits Eligible and Reason when no kept row sends them', () => {
  const stdout = output('shipping_list_all', {
    action: 'list_all',
    shipments: [
      { contract: { ...contract, id: 'odd-eligible' }, eligible: 'true', ineligible_reason: '   ' },
      { contract: { ...contract, id: 'odd-reason' }, eligible: null, ineligible_reason: 0 },
      { contract: { ...contract, id: 'plain-row', eligible: true } },
    ],
  });

  expect(stdout).not.toMatch(/\bEligible\b/);
  expect(stdout).not.toMatch(/\bReason\b/);
  expect(stdout).not.toContain('yes');
  expect(stdout).not.toContain('true');
  expect(stdout).not.toContain('=== Response ===');
});

test('freight list keeps Eligible when eligible is false and omits a blank reason', () => {
  const stdout = output('shipping_list', {
    action: 'list',
    shipments: [{ contract: { ...contract, id: 'blocked-only' }, eligible: false, ineligible_reason: '' }],
  });

  expect(stdout).toMatch(/\bEligible\b/);
  expect(stdout).toContain('no');
  expect(stdout).not.toContain('yes');
  expect(stdout).not.toMatch(/\bReason\b/);
});

test('shipping_list shows a blank Hazmat cell when the key is present but not a boolean', () => {
  const stdout = output('shipping_list', {
    action: 'list',
    shipments: [
      {
        contract: {
          ...contract,
          id: 'shipment-odd-1',
          origin_base_id: 'alpha_port',
          destination_base_id: 'beta_port',
          requires_hazmat: 'true',
        },
      },
    ],
  });

  expect(stdout).toMatch(/\bHazmat\b/);
  expect(stdout).not.toContain('yes');
  expect(stdout).not.toContain('no');
  expect(stdout).not.toContain('true');
});

test('freight quote prints Requires hazmat for true and false and omits a missing key', () => {
  const yes = output('shipping_quote', {
    action: 'quote',
    quote: { package_id: 'package-1', requires_hazmat: true },
  });
  const no = output('shipping_quote', {
    action: 'quote',
    quote: { package_id: 'package-1', requires_hazmat: false },
  });
  const omitted = output('shipping_quote', {
    action: 'quote',
    quote: { package_id: 'package-1' },
  });
  const odd = output('shipping_quote', {
    action: 'quote',
    quote: { package_id: 'package-1', requires_hazmat: 'true' },
  });

  expect(yes).toContain('Requires hazmat: yes');
  expect(no).toContain('Requires hazmat: no');
  expect(omitted).not.toContain('Requires hazmat');
  expect(odd).not.toContain('Requires hazmat');
});

test('freight contract detail prints Requires hazmat for true and false and omits a missing key', () => {
  const yes = output('shipping_get', {
    action: 'get',
    contract: { ...contract, requires_hazmat: true },
  });
  const no = output('shipping_get', {
    action: 'get',
    contract: { ...contract, requires_hazmat: false },
  });
  const omitted = output('shipping_get', { action: 'get', contract });

  expect(yes).toContain('Requires hazmat: yes');
  expect(no).toContain('Requires hazmat: no');
  expect(omitted).not.toContain('Requires hazmat');
});

test('missing freight-list page prints page ? when total is omitted', () => {
  const stdout = output('shipping_list', {
    action: 'list',
    shipments: [{ contract: { ...contract, id: 'shipment-page-1' } }],
  });

  expect(stdout).toContain('page ?, 1 of 1');
});

test('shipping_list page 0 prints page 0', () => {
  const stdout = output('shipping_list', {
    action: 'list',
    page: 0,
    shipments: [{ contract: { ...contract, id: 'shipment-page-0' } }],
  });

  expect(stdout).toContain('page 0,');
});

test('renders an explicit empty listing message with pagination', () => {
  const stdout = output('shipping_list', {
    action: 'list',
    page: 1,
    per_page: 20,
    total: 0,
    shipments: [],
    empty_reason_code: 'no_matching_shipments',
    empty_reason: 'No contracts at this station match the selected filters.',
  });
  expect(stdout).toContain('page 1, 0 of 0');
  expect(stdout).toContain('No contracts at this station match the selected filters.');
  expect(stdout).toContain('Reason: no_matching_shipments');
});

test('shipping_list total 0 with one shipment prints 1 of 0 and not 1 of 1', () => {
  const stdout = output('shipping_list', {
    action: 'list',
    page: 1,
    total: 0,
    shipments: [{ contract: { ...contract, id: 'shipment-total-0' } }],
  });

  expect(stdout).toContain('page 1, 1 of 0');
  expect(stdout).not.toContain('1 of 1');
});

test('renders the default empty freight listing when empty_reason is absent', () => {
  const stdout = output('shipping_list', {
    action: 'list',
    page: 1,
    per_page: 20,
    total: 0,
    shipments: [],
  });
  expect(stdout).toContain('No visible freight contracts.');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders active freight with role, destination, deadline/late, recovery, payout, late fee, cargo, and next step', () => {
  const stdout = output('shipping_active', {
    action: 'active',
    tick: 12450,
    message: '3 live freight contracts.',
    shipments: [
      {
        contract: { ...contract, id: 'shipment-active-carrier-1', package_id: 'package-relief-1' },
        role: 'carrier',
        ticks_to_target: 8,
        ticks_to_deadline: 28,
        ticks_to_recovery_deadline: 2908,
        late: false,
        payout_if_delivered_now: 12000,
        failure_debt: 500,
        package_in_your_cargo: true,
        next_step: 'Deliver at nova_central while docked.',
        destination_name: 'Nova Central',
        destination_system: 'Nova',
        last_known_location: 'sol / earth_orbit',
      },
      {
        contract: {
          ...contract,
          id: 'shipment-active-late-1',
          package_id: 'package-reactor-1',
          service_level: 'priority',
        },
        role: 'carrier',
        ticks_to_target: -40,
        ticks_to_deadline: -15,
        ticks_to_recovery_deadline: 2865,
        late: true,
        payout_if_delivered_now: 0,
        late_fee_if_delivered_now: 400,
        failure_debt: 72000,
        package_in_your_cargo: true,
        next_step: 'Deliver late (forfeit reward, pay late fee) or return at origin.',
        destination_name: 'Sirius Observatory',
        destination_system: 'Sirius',
      },
      {
        contract: {
          ...contract,
          id: 'shipment-active-invited-1',
          package_id: 'package-invite-1',
          status: 'posted',
          visibility: 'invited',
        },
        role: 'invited_carrier',
        ticks_to_target: 40,
        ticks_to_deadline: 80,
        ticks_to_recovery_deadline: 2960,
        late: false,
        payout_if_delivered_now: 9000,
        failure_debt: 500,
        package_in_your_cargo: false,
        next_step: 'Accept the invitation or ignore the listing.',
        destination_name: 'Nova Central',
        destination_system: 'Nova',
      },
    ],
  });

  expect(stdout).toContain('=== Active Freight ===');
  expect(stdout).toContain('tick 12,450 · 3 contracts');
  expect(stdout).toContain('3 live freight contracts.');
  expect(stdout).toContain('carrier');
  expect(stdout).toContain('invited_carrier');
  expect(stdout).toContain('Nova Central (Nova)');
  expect(stdout).toContain('Sirius Observatory (Sirius)');
  expect(stdout).toContain('28 ticks');
  expect(stdout).toContain('late · -15 ticks');
  expect(stdout).toContain('2,908 ticks');
  expect(stdout).toContain('12,000 cr');
  expect(stdout).toContain('0 cr');
  expect(stdout).toContain('400 cr');
  expect(stdout).toContain('Deliver at nova_central while docked.');
  expect(stdout).toContain('shipment-active-carrier-1');
  expect(stdout).toContain('package-reactor-1');
  expect(stdout).toContain('package-invite-1');
  expect(stdout).toMatch(/In cargo/);
  expect(stdout).toMatch(/Late fee/);
  expect(stdout).toMatch(/Next step/);
  expect(stdout).toMatch(/\bStatus\b/);
  expect(stdout).toContain('in_transit');
  expect(stdout).toContain('posted');
  expect(stdout).toContain('Last seen');
  expect(stdout).toContain('sol / earth_orbit');
  expect(stdout).not.toContain('last_known_location');
  expect(stdout).not.toMatch(/\bParty\b/);
  expect(stdout).not.toMatch(/\bTarget\b/);
  expect(stdout).not.toMatch(/\bLiability\b/);
  expect(stdout).not.toContain('=== Response ===');
});

test('shipping_active always prints status as sent and opens last seen only for a non-blank string', () => {
  const spaced = output('shipping_active', {
    action: 'active',
    tick: 10,
    shipments: [
      {
        contract: { id: 'shipment-spaced-1', package_id: 'package-spaced-1', status: ' defaulted ' },
        role: 'shipper',
        next_step: '  Reclaim the sealed package.  ',
        last_known_location: '  player_storage at Earth Station  ',
      },
      {
        contract: { id: 'shipment-blank-loc-1', package_id: 'package-blank-loc-1', status: 'in_transit' },
        role: 'carrier',
        next_step: 'Deliver while docked.',
        last_known_location: '   ',
      },
    ],
  });
  expect(spaced).toContain(' defaulted ');
  expect(spaced).toContain('in_transit');
  expect(spaced).toContain('  player_storage at Earth Station  ');
  expect(spaced).toContain('  Reclaim the sealed package.  ');
  expect(spaced).toContain('Last seen');
  expect(spaced).not.toMatch(/\bParty\b/);
  expect(spaced).not.toContain('Class');

  const closed = output('shipping_active', {
    action: 'active',
    tick: 11,
    shipments: [
      {
        contract: { id: 'shipment-no-loc-1', package_id: 'package-no-loc-1', status: 'posted' },
        role: 'shipper',
        last_known_location: '',
      },
      {
        contract: { id: 'shipment-bad-loc-1', package_id: 'package-bad-loc-1', status: 424242 },
        role: 'carrier',
        last_known_location: { class: 'ship' },
      },
      {
        contract: { id: 'shipment-num-loc-1', package_id: 'package-num-loc-1' },
        role: 'recipient',
        last_known_location: 515151,
      },
    ],
  });
  expect(closed).toMatch(/\bStatus\b/);
  expect(closed).toContain('posted');
  expect(closed).not.toContain('Last seen');
  expect(closed).not.toContain('424242');
  expect(closed).not.toContain('515151');
  expect(closed).not.toContain('[object Object]');
  expect(closed).not.toContain('player_storage');
});

test('renders an explicit empty active freight message', () => {
  const withMessage = output('shipping_active', structuredClone(shippingActiveEmptyFixture));
  expect(withMessage).toContain('=== Active Freight ===');
  expect(withMessage).toContain('tick 12,450 · 0 contracts');
  expect(withMessage).toContain('No active freight contracts.');
  expect(withMessage).not.toContain('=== Response ===');

  const defaultEmpty = output('shipping_active', {
    action: 'active',
    tick: 100,
    shipments: [],
  });
  expect(defaultEmpty).toContain('tick 100 · 0 contracts');
  expect(defaultEmpty).toContain('No active freight contracts.');
  expect(defaultEmpty).not.toContain('=== Response ===');
});

test('empty active freight prints a non-default message', () => {
  const stdout = output('shipping_active', {
    action: 'active',
    shipments: [],
    message: 'Filters hid every contract.',
  });

  expect(stdout).toContain('Filters hid every contract.');
});

test('missing active-freight tick prints tick ? for an empty shipment list', () => {
  const stdout = output('shipping_active', {
    action: 'active',
    shipments: [],
  });

  expect(stdout).toContain('tick ? · 0 contracts');
});

test('shipping_active tick 0 prints tick 0 · 0 contracts', () => {
  const stdout = output('shipping_active', {
    action: 'active',
    tick: 0,
    shipments: [],
  });

  expect(stdout).toContain('tick 0 · 0 contracts');
  expect(stdout).not.toContain('tick ?');
});

test('declines malformed active freight payloads and preserves the raw fallback', () => {
  expect(rawFallbackJson(output('shipping_active', { action: 'active', tick: 1, shipments: 'invalid' }))).toEqual({
    action: 'active',
    tick: 1,
    shipments: 'invalid',
  });
  expect(
    rawFallbackJson(
      output('shipping_active', {
        action: 'active',
        tick: 1,
        shipments: [{ contract: 'invalid', role: 'carrier' }],
      }),
    ),
  ).toEqual({
    action: 'active',
    tick: 1,
    shipments: [{ contract: 'invalid', role: 'carrier' }],
  });
});

test('omits malformed optional active freight fields without diagnostic tokens', () => {
  const stdout = output('shipping_active', {
    action: 'active',
    tick: 500,
    shipments: [
      {
        contract: { id: 'shipment-sparse-1', package_id: 'package-sparse-1' },
        role: 'shipper',
        ticks_to_deadline: Number.NaN,
        ticks_to_recovery_deadline: 'not-a-number',
        late: 'maybe',
        payout_if_delivered_now: undefined,
        late_fee_if_delivered_now: Number.NaN,
        package_in_your_cargo: 'yes',
        next_step: '',
        destination_name: '',
      },
    ],
  });

  expect(stdout).toContain('=== Active Freight ===');
  expect(stdout).toContain('shipper');
  expect(stdout).toContain('shipment-sparse-1');
  expect(stdout).toContain('package-sparse-1');
  expect(stdout).toMatch(/\bStatus\b/);
  expect(stdout).not.toContain('Last seen');
  expect(stdout).not.toContain('NaN');
  expect(stdout).not.toContain('undefined');
  expect(stdout).not.toContain('[object Object]');
  expect(stdout).not.toContain('=== Response ===');
});

test('shipping_active with one shipment and no message prints the contracts table', () => {
  const stdout = output('shipping_active', {
    action: 'active',
    tick: 500,
    shipments: [
      {
        contract: { id: 'shipment-one-1', package_id: 'package-one-1' },
        role: 'carrier',
      },
    ],
  });

  expect(stdout).toContain('=== Contracts ===');
  expect(stdout).toContain('shipment-one-1');
  expect(stdout).not.toContain('No active freight contracts.');
});

test('formats active destination as name-only or contract base id when system is missing', () => {
  const stdout = output('shipping_active', {
    action: 'active',
    tick: 900,
    shipments: [
      {
        contract: { id: 'shipment-name-only-1', package_id: 'package-name-only-1' },
        role: 'carrier',
        ticks_to_deadline: 10,
        ticks_to_recovery_deadline: 100,
        late: false,
        payout_if_delivered_now: 1000,
        package_in_your_cargo: true,
        next_step: 'Deliver while docked.',
        destination_name: 'Name Only Station',
        // destination_system omitted → name-only branch
      },
      {
        contract: {
          id: 'shipment-base-id-1',
          package_id: 'package-base-id-1',
          destination_base_id: 'nova_central',
        },
        role: 'recipient',
        ticks_to_deadline: 12,
        ticks_to_recovery_deadline: 120,
        late: false,
        payout_if_delivered_now: 0,
        package_in_your_cargo: false,
        next_step: 'Wait for delivery.',
        // destination_name / destination_system omitted → base id fallback
      },
    ],
  });

  expect(stdout).toContain('Name Only Station');
  expect(stdout).toContain('nova_central');
  expect(stdout).not.toContain('Name Only Station (');
  expect(stdout).not.toContain('=== Response ===');
});

test('formats active freight with destination_system and no destination_name as the contract base id', () => {
  const stdout = output('shipping_active', {
    action: 'active',
    tick: 900,
    shipments: [
      {
        contract: {
          id: 'shipment-system-only-1',
          package_id: 'package-system-only-1',
          destination_base_id: 'nova_central',
        },
        role: 'carrier',
        ticks_to_deadline: 10,
        ticks_to_recovery_deadline: 100,
        late: false,
        payout_if_delivered_now: 1000,
        package_in_your_cargo: true,
        next_step: 'Deliver while docked.',
        destination_system: 'Polaris',
      },
    ],
  });

  expect(stdout).toContain('nova_central');
  expect(stdout).not.toContain('Polaris');
});

test('shipping_active ticks_to_deadline 0 prints 0 ticks', () => {
  const stdout = output('shipping_active', {
    action: 'active',
    tick: 900,
    shipments: [
      {
        contract: { id: 'shipment-zero-deadline-1', package_id: 'package-zero-deadline-1' },
        role: 'carrier',
        ticks_to_deadline: 0,
        late: false,
        payout_if_delivered_now: 1000,
        package_in_your_cargo: true,
        next_step: 'Deliver while docked.',
        destination_name: 'Name Only Station',
      },
    ],
  });

  expect(stdout).toContain('0 ticks');
});

test('renders tracking events in server order with returned location components only', () => {
  const stdout = output('shipping_track', {
    action: 'track',
    contract,
    events: [
      {
        id: 'first-event',
        shipment_id: 'shipment-1',
        package_id: 'package-1',
        class: 'ship',
        fingerprint: 'fingerprint-one',
        observed_at: '2026-07-17T10:10:00Z',
        observed_tick: 1201,
        system_id: 'sol',
        poi_id: 'earth_orbit',
        custodian: { kind: 'player', id: 'carrier-1' },
        reference_id: 'ship-1',
      },
      {
        id: 'second-event',
        shipment_id: 'shipment-1',
        package_id: 'package-1',
        class: 'faction_storage',
        fingerprint: 'fingerprint-two',
        observed_at: '2026-07-17T10:20:00Z',
        observed_tick: 1202,
        base_id: 'nova_central',
        custodian: { kind: 'faction', id: 'recipient-1' },
      },
    ],
  });

  expect(stdout).toContain('=== Freight Tracking ===');
  expect(stdout).toContain('sol / earth_orbit');
  expect(stdout).toContain('nova_central');
  expect(stdout.indexOf('fingerprint-one')).toBeLessThan(stdout.indexOf('fingerprint-two'));
  expect(stdout).not.toContain('=== Response ===');
});

test('freight tracking location joins system, poi, and base', () => {
  const stdout = output('shipping_track', {
    action: 'track',
    contract,
    events: [
      {
        system_id: 'sol',
        poi_id: 'earth_orbit',
        base_id: 'nova_central',
      },
    ],
  });

  expect(stdout).toContain('sol / earth_orbit / nova_central');
});

test('freight tracking with empty system_id joins poi and base without a leading slash', () => {
  const stdout = output('shipping_track', {
    action: 'track',
    contract,
    events: [
      {
        system_id: '',
        poi_id: 'earth_orbit',
        base_id: 'nova_central',
      },
    ],
  });

  expect(stdout).toContain('earth_orbit / nova_central');
  expect(stdout).not.toContain('/ earth_orbit');
});

test('renders an explicit empty tracking message', () => {
  expect(output('shipping_track', { action: 'track', contract, events: [] })).toContain('No tracking events.');
});

test('freight tracking prints a named custodian in the Custodian cell', () => {
  const stdout = output('shipping_track', {
    action: 'track',
    contract,
    events: [
      {
        class: 'ship',
        custodian: { kind: 'player', id: 'carrier-vale', name: 'SwiftHauler' },
      },
    ],
  });

  expect(stdout).toContain('Custodian');
  expect(stdout).toContain('SwiftHauler (player:carrier-vale)');
  expect(stdout).not.toContain('held by');
});

const carrierProfile = {
  actor: { kind: 'player', id: 'carrier-1' },
  tier: 'licensed',
  successful_deliveries: 12,
  delivered_value: 125000,
  priority_deliveries: 4,
  returns: 1,
  breaches: 0,
  defaults: 0,
  active_contracts: 2,
  active_liability: 33000,
  outstanding_debt: 500,
  updated_at: '2026-07-17T11:00:00Z',
};

const carrierCapacity = {
  active_contracts: 2,
  active_contracts_unlimited: true,
  active_liability: 33000,
  liability_unlimited: false,
  aggregate_liability_limit: 100000,
  remaining_aggregate_liability: 67000,
  single_package_liability_limit: 50000,
};

const carrierProgression = {
  current_tier: 'licensed',
  next_tier: 'trusted',
  at_maximum_tier: false,
  successful_deliveries: 12,
  required_successful_deliveries: 25,
  remaining_successful_deliveries: 13,
  delivered_value: 125000,
  required_delivered_value: 250000,
  remaining_delivered_value: 125000,
};

const freightDebt = {
  id: 'debt-1',
  shipment_id: 'shipment-1',
  debtor: { kind: 'player', id: 'carrier-1' },
  creditor: { kind: 'station', id: 'earth_station' },
  original: 1000,
  outstanding: 500,
  created_at: '2026-07-17T09:00:00Z',
};

test('renders carrier profile capacity, progression, debt blocking, and debts', () => {
  const stdout = output('shipping_profile', {
    action: 'profile',
    profile: carrierProfile,
    capacity: carrierCapacity,
    progression: carrierProgression,
    debt_blocks_acceptance: true,
    debt_block_reason: 'Pay outstanding freight debt before accepting another contract.',
    debts: [freightDebt],
  });

  expect(stdout).toContain('=== Carrier Profile ===');
  expect(stdout).toContain('Actor: player:carrier-1');
  expect(stdout).toContain('Delivered value: 125,000 cr');
  expect(stdout).toContain('Active contracts: 2 (unlimited)');
  expect(stdout).toContain('Aggregate liability: 33,000 cr / 100,000 cr');
  expect(stdout).toContain('Next tier: trusted');
  expect(stdout).toContain('Acceptance blocked: yes');
  expect(stdout).toContain('=== Outstanding Debts ===');
  expect(stdout).toContain('debt-1');
  expect(stdout).not.toContain('=== Response ===');
});

test('freight debt prints a named debtor after Creditor', () => {
  const stdout = output('shipping_profile', {
    action: 'profile',
    profile: { ...carrierProfile, actor: { kind: 'player', id: 'carrier-vale', name: 'Vale' } },
    capacity: carrierCapacity,
    progression: carrierProgression,
    debts: [
      {
        ...freightDebt,
        creditor: { kind: 'station', id: 'earth_station', name: 'Earth Station' },
        debtor: { kind: 'player', id: 'carrier-vale', name: 'Vale' },
      },
      { ...freightDebt, id: 'debt-blank', debtor: { name: 'Missing' } },
    ],
  });

  expect(stdout).toContain('Actor: Vale (player:carrier-vale)');
  expect(stdout).toContain('Earth Station (station:earth_station)');
  expect(stdout).toContain('Vale (player:carrier-vale)');
  const lines = stdout.split('\n');
  const header = lines.find((line) => line.includes('Creditor') && line.includes('Debtor'));
  expect(header).toBeDefined();
  expect(header?.indexOf('Creditor')).toBeLessThan(header?.indexOf('Debtor') ?? -1);
  expect(header?.indexOf('Debtor')).toBeLessThan(header?.indexOf('Created') ?? -1);
  const blank = lines.find((line) => line.includes('debt-blank'));
  expect(blank).toBeDefined();
  expect(blank).not.toContain('Missing');
  expect(blank).not.toContain('player:');
});

test('freight debt does not open Debtor when no row renders a debtor', () => {
  const stdout = output('shipping_profile', {
    action: 'profile',
    profile: carrierProfile,
    capacity: carrierCapacity,
    progression: carrierProgression,
    debts: [
      { ...freightDebt, debtor: undefined },
      { ...freightDebt, id: 'debt-2', debtor: 'carrier-1' },
      { ...freightDebt, id: 'debt-3', debtor: { kind: 'player', name: 'Vale' } },
    ],
  });

  expect(stdout).toContain('=== Outstanding Debts ===');
  expect(stdout).toContain('station:earth_station');
  expect(stdout).not.toContain('Debtor');
  expect(stdout).not.toContain('Vale');
});

test('renders the shipping_profile last-consequence branch', () => {
  const stdout = output('shipping_profile', {
    action: 'profile',
    profile: { ...carrierProfile, last_consequence_at: '2026-07-17T08:00:00Z' },
    capacity: carrierCapacity,
    progression: carrierProgression,
    debts: [freightDebt],
  });
  expect(stdout).toContain('Last consequence: 2026-07-17T08:00:00Z');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders the shipping_profile last-recovery branch', () => {
  const stdout = output('shipping_profile', {
    action: 'profile',
    profile: { ...carrierProfile, last_recovery_at: '2026-07-17T09:30:00Z' },
    capacity: carrierCapacity,
    progression: carrierProgression,
    debts: [freightDebt],
  });
  expect(stdout).toContain('Last recovery: 2026-07-17T09:30:00Z');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders the shipping_profile paid_at branch', () => {
  const stdout = output('shipping_profile', {
    action: 'profile',
    profile: carrierProfile,
    capacity: carrierCapacity,
    progression: carrierProgression,
    debts: [{ ...freightDebt, paid_at: '2026-07-17T12:30:00Z' }],
  });
  expect(stdout).toContain('2026-07-17T12:30:00Z');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders limited carrier contract capacity', () => {
  const stdout = output('shipping_profile', {
    action: 'profile',
    profile: carrierProfile,
    capacity: { ...carrierCapacity, active_contracts_unlimited: false, active_contract_limit: 4 },
    progression: carrierProgression,
    debts: [freightDebt],
  });

  expect(stdout).toContain('Active contracts: 2 / 4');
});

test('renders an explicit zero carrier contract limit', () => {
  const stdout = output('shipping_profile', {
    action: 'profile',
    profile: carrierProfile,
    capacity: { ...carrierCapacity, active_contracts: 2, active_contracts_unlimited: false, active_contract_limit: 0 },
    progression: carrierProgression,
    debts: [freightDebt],
  });

  expect(stdout).toContain('Active contracts: 2 / 0');
});

test('renders unlimited carrier contract capacity when a numeric limit is also set', () => {
  const stdout = output('shipping_profile', {
    action: 'profile',
    profile: carrierProfile,
    capacity: { ...carrierCapacity, active_contracts_unlimited: true, active_contract_limit: 4 },
    progression: carrierProgression,
    debts: [freightDebt],
  });

  expect(stdout).toContain('Active contracts: 2 (unlimited)');
  expect(stdout).not.toContain('Active contracts: 2 / 4');
});

test('shipping_profile capacity active_contracts 0 with unlimited true prints Active contracts: 0 (unlimited)', () => {
  const stdout = output('shipping_profile', {
    action: 'profile',
    profile: carrierProfile,
    capacity: { ...carrierCapacity, active_contracts: 0, active_contracts_unlimited: true },
    progression: carrierProgression,
    debts: [freightDebt],
  });

  expect(stdout).toContain('Active contracts: 0 (unlimited)');
});

test('carrier profile prints recovery, a past cooldown, and recent failures without counting them', () => {
  const stdout = output('shipping_profile', {
    action: 'profile',
    profile: {
      ...carrierProfile,
      recovery_deliveries_remaining: 10000,
      acceptance_blocked_until: '  2020-01-01T00:00:00Z  ',
      recent_failures: ['  2026-07-18T00:00:00Z  ', 3, '', '   ', '2026-07-17T00:00:00Z', null],
    },
    capacity: carrierCapacity,
    progression: carrierProgression,
    debt_blocks_acceptance: false,
    debts: [],
  });

  expect(stdout).toContain('Recovery deliveries: 10,000');
  expect(stdout).toContain('Acceptance blocked until:   2020-01-01T00:00:00Z  ');
  expect(stdout).toContain('Acceptance blocked: no');
  const failureLines = stdout.split('\n').filter((line) => line.startsWith('Recent failures:'));
  expect(failureLines).toEqual(['Recent failures:   2026-07-18T00:00:00Z  ', 'Recent failures: 2026-07-17T00:00:00Z']);
  expect(failureLines).not.toContain('Recent failures: 2');
  expect(failureLines).not.toContain('Recent failures: 3');
  expect(stdout.indexOf('Recovery deliveries:')).toBeLessThan(stdout.indexOf('Capacity:'));
  expect(stdout.indexOf('Acceptance blocked until:')).toBeLessThan(stdout.indexOf('Capacity:'));
  expect(stdout.indexOf('Recent failures:')).toBeLessThan(stdout.indexOf('Capacity:'));
  const progression = stdout.split('Tier Progression:')[1] ?? '';
  expect(progression).not.toContain('Recovery deliveries');
  expect(progression).toContain('Acceptance blocked: no');
  expect(progression).not.toContain('Acceptance blocked until');
  expect(stdout).not.toContain('=== Response ===');
});

test('recovery deliveries 0 still prints, including at the maximum tier', () => {
  const stdout = output('shipping_profile', {
    action: 'profile',
    profile: { ...carrierProfile, tier: 'prime', recovery_deliveries_remaining: 0 },
    capacity: carrierCapacity,
    progression: { ...carrierProgression, current_tier: 'prime', at_maximum_tier: true },
    debts: [],
  });

  expect(stdout).toContain('Recovery deliveries: 0');
  expect(stdout).toContain('Maximum carrier tier reached.');
  expect(stdout.indexOf('Recovery deliveries:')).toBeLessThan(stdout.indexOf('Tier Progression:'));
  expect(stdout.split('Tier Progression:')[1]).not.toContain('Recovery deliveries');
  expect(stdout).not.toContain('=== Response ===');
});

test('omitted carrier recovery fields print nothing and are not zero', () => {
  const stdout = output('shipping_profile', {
    action: 'profile',
    profile: {
      ...carrierProfile,
      recovery_deliveries_remaining: '10',
      acceptance_blocked_until: '   ',
      recent_failures: [1, '', '   ', null],
    },
    capacity: carrierCapacity,
    progression: carrierProgression,
    debt_blocks_acceptance: true,
    debts: [],
  });

  expect(stdout).not.toContain('Recovery deliveries');
  expect(stdout).not.toContain('Acceptance blocked until');
  expect(stdout).not.toContain('Recent failures');
  expect(stdout).toContain('Acceptance blocked: yes');
  expect(stdout).not.toContain('=== Response ===');

  const missing = output('shipping_profile', {
    action: 'profile',
    profile: carrierProfile,
    capacity: carrierCapacity,
    progression: carrierProgression,
    debts: [],
  });
  expect(missing).not.toContain('Recovery deliveries');
  expect(missing).not.toContain('Acceptance blocked until');
  expect(missing).not.toContain('Recent failures');
  expect(missing).not.toContain('=== Response ===');

  const wrong = output('shipping_profile', {
    action: 'profile',
    profile: {
      ...carrierProfile,
      recovery_deliveries_remaining: Number.NaN,
      acceptance_blocked_until: 1,
      recent_failures: '2026-07-17T00:00:00Z',
    },
    capacity: carrierCapacity,
    progression: carrierProgression,
    debts: [],
  });
  expect(wrong).not.toContain('Recovery deliveries');
  expect(wrong).not.toContain('Acceptance blocked until');
  expect(wrong).not.toContain('Recent failures');
  expect(wrong).not.toContain('NaN');
});

test('shipping_pay_debt prints the same carrier recovery lines', () => {
  const stdout = output('shipping_pay_debt', {
    details: {
      action: 'pay_debt',
      amount_paid: 500,
      profile: {
        ...carrierProfile,
        recovery_deliveries_remaining: 10,
        acceptance_blocked_until: '2026-07-18T12:00:00Z',
        recent_failures: ['2026-07-17T01:00:00Z'],
      },
      capacity: carrierCapacity,
      progression: carrierProgression,
      debt_blocks_acceptance: true,
      updated_debts: [],
      outstanding_debts: [],
    },
  });

  expect(stdout).toContain('=== Freight Debt Payment ===');
  expect(stdout).toContain('Recovery deliveries: 10');
  expect(stdout).toContain('Acceptance blocked until: 2026-07-18T12:00:00Z');
  expect(stdout).toContain('Recent failures: 2026-07-17T01:00:00Z');
  expect(stdout).toContain('Acceptance blocked: yes');
  expect(stdout.indexOf('Recovery deliveries:')).toBeLessThan(stdout.indexOf('Capacity:'));
  expect(stdout.split('Tier Progression:')[1]).not.toContain('Recovery deliveries');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders carrier capacity without a contract limit when profile active contracts differ', () => {
  const stdout = output('shipping_profile', {
    action: 'profile',
    profile: { ...carrierProfile, active_contracts: 2 },
    capacity: { ...carrierCapacity, active_contracts: 3, active_contracts_unlimited: false },
    progression: carrierProgression,
    debts: [],
  });

  expect(stdout).toContain('Active contracts: 3\n');
});

test('renders maximum tier and an explicit empty debt message', () => {
  const stdout = output('shipping_profile', {
    action: 'profile',
    profile: { ...carrierProfile, tier: 'prime', outstanding_debt: 0 },
    capacity: { ...carrierCapacity, liability_unlimited: true },
    progression: { ...carrierProgression, current_tier: 'prime', at_maximum_tier: true },
    debt_blocks_acceptance: false,
    debts: [],
  });
  expect(stdout).toContain('Maximum carrier tier reached.');
  expect(stdout).toContain('No outstanding freight debt.');
  expect(stdout).toContain('Acceptance blocked: no');
});

test('renders unlimited liability without remaining or single-package limits', () => {
  const stdout = output('shipping_profile', {
    action: 'profile',
    profile: carrierProfile,
    capacity: { ...carrierCapacity, liability_unlimited: true },
    progression: carrierProgression,
    debts: [],
  });

  expect(stdout).toContain('Aggregate liability: 33,000 cr (unlimited)');
  expect(stdout).not.toContain('Remaining aggregate liability');
  expect(stdout).not.toContain('Single-package liability');
});

test('aggregate liability without a limit prints the amount only', () => {
  const { aggregate_liability_limit: _aggregateLiabilityLimit, ...capacity } = {
    ...carrierCapacity,
    liability_unlimited: false,
  };
  const stdout = output('shipping_profile', {
    action: 'profile',
    profile: carrierProfile,
    capacity,
    progression: carrierProgression,
    debts: [],
  });

  expect(stdout).toContain('Aggregate liability: 33,000 cr\n');
});

test('renders debt payment changes separately from remaining debts', () => {
  const stdout = output('shipping_pay_debt', {
    details: {
      action: 'pay_debt',
      amount_paid: 500,
      profile: { ...carrierProfile, outstanding_debt: 250 },
      capacity: carrierCapacity,
      progression: carrierProgression,
      debt_blocks_acceptance: true,
      debt_block_reason: '250 cr remains unpaid.',
      updated_debts: [{ ...freightDebt, outstanding: 250 }],
      outstanding_debts: [{ ...freightDebt, outstanding: 250 }],
    },
    player: { credits: 5000 },
    ship: {},
    cargo: [],
  });

  expect(stdout).toContain('=== Freight Debt Payment ===');
  expect(stdout).toContain('Amount paid: 500 cr');
  expect(stdout).toContain('=== Updated Debts ===');
  expect(stdout).toContain('=== Outstanding Debts ===');
  expect(stdout).not.toContain('=== Response ===');
});

test('shipping_pay_debt amount_paid 0 prints Amount paid: 0 cr and does not fall back to the raw response', () => {
  const stdout = output('shipping_pay_debt', {
    details: {
      action: 'pay_debt',
      amount_paid: 0,
      profile: { ...carrierProfile, outstanding_debt: 250 },
      capacity: carrierCapacity,
      progression: carrierProgression,
      debt_blocks_acceptance: true,
      debt_block_reason: '250 cr remains unpaid.',
      updated_debts: [{ ...freightDebt, outstanding: 250 }],
      outstanding_debts: [{ ...freightDebt, outstanding: 250 }],
    },
    player: { credits: 5000 },
    ship: {},
    cargo: [],
  });

  expect(stdout).toContain('Amount paid: 0 cr');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders empty updated freight debts as unchanged', () => {
  const stdout = output('shipping_pay_debt', {
    details: {
      action: 'pay_debt',
      amount_paid: 500,
      profile: { ...carrierProfile, outstanding_debt: 250 },
      capacity: carrierCapacity,
      progression: carrierProgression,
      debt_blocks_acceptance: true,
      debt_block_reason: '250 cr remains unpaid.',
      updated_debts: [],
      outstanding_debts: [{ ...freightDebt, outstanding: 250 }],
    },
    player: { credits: 5000 },
    ship: {},
    cargo: [],
  });

  expect(stdout).toContain('No freight debts changed.');
  expect(stdout).not.toContain('=== Response ===');
});

test('preserves complete malformed shipping mutation envelopes in the raw fallback', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    [
      'shipping_pay_debt',
      {
        details: {
          action: 'pay_debt',
          amount_paid: 500,
          profile: carrierProfile,
          capacity: carrierCapacity,
          progression: carrierProgression,
          updated_debts: ['invalid'],
          outstanding_debts: [],
        },
        player: { credits: 5000 },
        ship: { id: 'ship-1' },
        cargo: [{ item_id: 'package-1', quantity: 1 }],
      },
    ],
    [
      'shipping_deliver',
      {
        details: { action: 'deliver', contract: 'invalid', carrier_payout: 15000 },
        player: { credits: 10 },
        ship: { id: 'ship-1' },
        cargo: [{ item_id: 'package-1', quantity: 1 }],
      },
    ],
    [
      'shipping_return',
      {
        details: { action: 'return', contract: 'invalid', shipper_refund: 12500 },
        player: { credits: 10 },
        ship: { id: 'ship-1' },
        cargo: [{ item_id: 'package-1', quantity: 1 }],
      },
    ],
    [
      'shipping_reclaim',
      {
        details: { action: 'reclaim', contract: 'invalid', claim_debt: 0 },
        player: { credits: 10 },
        ship: { id: 'ship-1' },
        cargo: [{ item_id: 'package-1', quantity: 1 }],
      },
    ],
    [
      'shipping_cancel',
      {
        details: { action: 'cancel', contract: 'invalid', shipper_refund: 0 },
        player: { credits: 10 },
        ship: { id: 'ship-1' },
        cargo: [{ item_id: 'package-1', quantity: 1 }],
      },
    ],
  ];

  for (const [command, fixture] of cases) {
    expect(rawFallbackJson(output(command, fixture))).toEqual(fixture);
  }
});

test('renders action-specific settlements and keeps zero amounts visible', () => {
  const cases: Array<[string, string, Record<string, unknown>, string]> = [
    ['shipping_deliver', 'Freight Delivered', { carrier_payout: 15000, debt_created: 0 }, 'Debt created: 0 cr'],
    ['shipping_return', 'Freight Returned', { carrier_payout: 0, shipper_refund: 12500 }, 'Carrier payout: 0 cr'],
    ['shipping_cancel', 'Freight Contract Canceled', { shipper_refund: 0, debt_created: 0 }, 'Shipper refund: 0 cr'],
  ];

  for (const [command, heading, settlement, zeroLine] of cases) {
    const action = command.slice('shipping_'.length);
    const stdout = output(command, {
      details: {
        action,
        contract: {
          ...contract,
          status: action === 'cancel' ? 'canceled' : action === 'return' ? 'returned' : 'delivered',
        },
        ...settlement,
      },
      player: { credits: 10 },
      ship: {},
      cargo: [],
    });
    expect(stdout).toContain(`=== ${heading} ===`);
    expect(stdout).toContain(zeroLine);
    expect(stdout).not.toContain('Claim paid');
    expect(stdout).not.toContain('=== Response ===');
  }
});

test('surfaces late delivery flag on deliver and return settlements when present', () => {
  const lateDeliver = output('shipping_deliver', {
    details: {
      action: 'deliver',
      contract: { ...contract, status: 'delivered' },
      carrier_payout: 0,
      late: true,
    },
    player: { credits: 10 },
    ship: {},
    cargo: [],
  });
  expect(lateDeliver).toContain('=== Freight Delivered ===');
  expect(lateDeliver).toContain('Late delivery: yes');
  expect(lateDeliver).not.toContain('=== Response ===');

  const onTimeReturn = output('shipping_return', {
    details: {
      action: 'return',
      contract: { ...contract, status: 'returned' },
      shipper_refund: 12500,
      late: false,
    },
    player: { credits: 10 },
    ship: {},
    cargo: [],
  });
  expect(onTimeReturn).toContain('=== Freight Returned ===');
  expect(onTimeReturn).toContain('Late delivery: no');
  expect(onTimeReturn).not.toContain('=== Response ===');

  const omittedLate = output('shipping_deliver', {
    details: {
      action: 'deliver',
      contract: { ...contract, status: 'delivered' },
      carrier_payout: 15000,
    },
    player: { credits: 10 },
    ship: {},
    cargo: [],
  });
  expect(omittedLate).toContain('=== Freight Delivered ===');
  expect(omittedLate).not.toContain('Late delivery');
  expect(omittedLate).not.toContain('=== Response ===');
});

test('omits malformed optional carrier and settlement fields without diagnostic tokens', () => {
  const stdout = output('shipping_deliver', {
    details: {
      action: 'deliver',
      contract: { ...contract, contractor: {}, terminal_reason: [], carrier_payout: Number.NaN },
      carrier_payout: Number.NaN,
      claim_paid: {},
      late: 'maybe',
    },
  });
  expect(stdout).not.toContain('Late delivery');
  expect(stdout).not.toContain('Claim paid');
  expect(stdout).not.toContain('undefined');
  expect(stdout).not.toContain('NaN');
  expect(stdout).not.toContain('[object Object]');
});

test('does not print settlement-level claim_paid even when a stale payload sends it', () => {
  const fixture = {
    details: {
      action: 'deliver',
      contract: { ...contract, status: 'delivered', claim_paid: 1250 },
      carrier_payout: 15000,
      claim_paid: 500,
      debt_created: 0,
    },
    player: { credits: 10 },
    ship: {},
    cargo: [],
  };
  const stdout = output('shipping_deliver', fixture);
  expect(stdout).toContain('=== Freight Delivered ===');
  expect(stdout).toContain('Carrier payout: 15,000 cr');
  expect(stdout).toContain('Debt created: 0 cr');
  expect(stdout).not.toContain('Claim paid');
  expect(stdout).not.toContain('=== Response ===');

  const rendered = renderStructuredResult(
    'shipping_deliver',
    structuredClone(fixture),
    { ...options, format: 'json' },
    context,
  );
  const parsed = JSON.parse(rendered.stdout.join('\n')) as {
    details: { claim_paid: number; contract: { claim_paid: number } };
  };
  expect(parsed.details.claim_paid).toBe(500);
  expect(parsed.details.contract.claim_paid).toBe(1250);
});

test('prints contract-level claim_paid on the full contract view, including zero', () => {
  const paid = output('shipping_get', {
    action: 'get',
    contract: { ...contract, claim_paid: 1250 },
  });
  expect(paid).toContain('=== Freight Contract ===');
  expect(paid).toContain('Claim paid: 1,250 cr');
  expect(paid).not.toContain('=== Response ===');

  const zero = output('shipping_get', {
    action: 'get',
    contract: { ...contract, claim_paid: 0 },
  });
  expect(zero).toContain('Claim paid: 0 cr');
});

test('shipping_get prints contract carrier_payout 0 under the Freight Contract heading', () => {
  const stdout = output('shipping_get', {
    action: 'get',
    contract: { ...contract, carrier_payout: 0 },
  });
  expect(stdout).toContain('=== Freight Contract ===');
  expect(stdout).toContain('Carrier payout: 0 cr');
  expect(stdout).not.toContain('=== Response ===');
});

function settlementEnvelope(
  action: 'deliver' | 'return' | 'cancel' | 'reclaim',
  settlement: Record<string, unknown> = {},
): Record<string, unknown> {
  const status =
    action === 'cancel'
      ? 'canceled'
      : action === 'return'
        ? 'returned'
        : action === 'reclaim'
          ? 'defaulted'
          : 'delivered';
  return {
    details: {
      action,
      contract: {
        ...contract,
        status,
      },
      carrier_payout: 15000,
      ...settlement,
    },
    player: { credits: 10 },
    ship: {},
    cargo: [],
  };
}

test('surfaces late flag on deliver settlement when true', () => {
  const stdout = output('shipping_deliver', settlementEnvelope('deliver', { late: true }));
  expect(stdout).toContain('Late delivery: yes');
  expect(stdout).not.toContain('=== Response ===');
});

test('surfaces late flag on deliver settlement when false (on-time)', () => {
  const stdout = output('shipping_deliver', settlementEnvelope('deliver', { late: false }));
  expect(stdout).toContain('Late delivery: no');
  expect(stdout).not.toContain('=== Response ===');
});

test('omits Late line when late is absent from settlement', () => {
  const stdout = output('shipping_deliver', settlementEnvelope('deliver'));
  expect(stdout).not.toMatch(/^Late delivery:/m);
  expect(stdout).not.toContain('Late delivery:');
  expect(stdout).not.toContain('=== Response ===');
});

test('omits Late line when late is malformed', () => {
  for (const late of [{}, Number.NaN, 'yes', 1] as const) {
    const stdout = output('shipping_deliver', settlementEnvelope('deliver', { late }));
    expect(stdout).not.toContain('Late delivery:');
    expect(stdout).not.toContain('undefined');
    expect(stdout).not.toContain('NaN');
    expect(stdout).not.toContain('[object Object]');
    expect(stdout).not.toContain('=== Response ===');
  }
});

test('surfaces late flag on overdue return settlement', () => {
  const stdout = output('shipping_return', settlementEnvelope('return', { late: true, shipper_refund: 12500 }));
  expect(stdout).toContain('=== Freight Returned ===');
  expect(stdout).toContain('Late delivery: yes');
  expect(stdout).not.toContain('=== Response ===');
});

test('freight quote appraisal line with confidence and no basis prints high without a slash', () => {
  const stdout = output('shipping_quote', {
    action: 'quote',
    quote: {
      appraisal_lines: [
        {
          item_id: 'iron_ore',
          confidence: 'high',
        },
      ],
    },
  });

  expect(stdout).toContain('high');
  expect(stdout).not.toContain('high /');
});

test('freight quote appraisal line with basis and no confidence prints the basis without a slash', () => {
  const stdout = output('shipping_quote', {
    action: 'quote',
    quote: {
      appraisal_lines: [
        {
          item_id: 'iron_ore',
          basis: 'completed-fill VWAP',
        },
      ],
    },
  });

  const basisLine = stdout.split('\n').find((line) => line.includes('completed-fill VWAP'));
  expect(basisLine).toContain('completed-fill VWAP');
  expect(basisLine).not.toContain('/');
});

test('freight settlement prints Piloting XP for a finite number or bigint, including 0', () => {
  const positive = output('shipping_deliver', settlementEnvelope('deliver', { piloting_xp: 140 }));
  expect(positive).toContain('Piloting XP: 140');
  expect(positive).not.toContain('Piloting XP: 1,140');

  const zero = output('shipping_deliver', settlementEnvelope('deliver', { piloting_xp: 0 }));
  expect(zero).toContain('Piloting XP: 0');

  const returned = output('shipping_return', settlementEnvelope('return', { piloting_xp: 0 }));
  expect(returned).toContain('=== Freight Returned ===');
  expect(returned).toContain('Piloting XP: 0');

  const canceled = output('shipping_cancel', settlementEnvelope('cancel', { piloting_xp: 9007199254740993n }));
  expect(canceled).toContain('Piloting XP: 9007199254740993');
  expect(canceled).not.toContain('9,007,199,254,740,993');
});

test('freight settlement omits Piloting XP when the key is absent and does not derive it', () => {
  for (const command of ['shipping_deliver', 'shipping_return', 'shipping_reclaim', 'shipping_cancel'] as const) {
    const action = command.slice('shipping_'.length) as 'deliver' | 'return' | 'cancel' | 'reclaim';
    const stdout = output(command, settlementEnvelope(action));
    expect(stdout).not.toContain('Piloting XP');
  }

  const hops = output('shipping_deliver', {
    details: {
      action: 'deliver',
      contract: { ...contract, status: 'delivered', route_hops: 6, reputation_eligible: false },
      carrier_payout: 15000,
    },
    player: { credits: 10 },
    ship: {},
    cargo: [],
  });
  expect(hops).toContain('=== Freight Delivered ===');
  expect(hops).not.toContain('Piloting XP');

  for (const piloting_xp of [Number.NaN, Number.POSITIVE_INFINITY, '140', null, true] as const) {
    const stdout = output('shipping_deliver', settlementEnvelope('deliver', { piloting_xp }));
    expect(stdout).not.toContain('Piloting XP');
    expect(stdout).not.toContain('NaN');
  }
});

test('shipping_reclaim titles the settlement Freight Reclaimed and prints sent claim amounts, including 0', () => {
  const stdout = output(
    'shipping_reclaim',
    settlementEnvelope('reclaim', {
      debt_cleared: 0,
      claim_repaid: 7500,
      claim_debt: 500n,
      contract: {
        ...contract,
        status: 'defaulted',
        package_recovery: 'reclaimed',
        package_recovered_at: ' 2026-07-17T12:00:00Z ',
        claim_station_paid: 0,
      },
    }),
  );

  expect(stdout).toContain('=== Freight Reclaimed ===');
  expect(stdout).not.toContain('Freight Returned');
  expect(stdout).toContain('Status: defaulted');
  expect(stdout).toContain('Package recovery: reclaimed');
  expect(stdout).toContain('Recovered:  2026-07-17T12:00:00Z ');
  expect(stdout).toContain('Claim station paid: 0 cr');
  expect(stdout).toContain('Debt cleared: 0 cr');
  expect(stdout).toContain('Claim repaid: 7,500 cr');
  expect(stdout).toContain('Claim debt: 500 cr');
  expect(stdout).not.toContain('claim:shipment-1');
  expect(stdout).not.toContain('8,000 cr');
  expect(stdout).not.toContain('=== Response ===');

  const statusAt = stdout.indexOf('Status: defaulted');
  expect(statusAt).toBeLessThan(stdout.indexOf('Package recovery: reclaimed'));
  expect(stdout.indexOf('Package recovery: reclaimed')).toBeLessThan(stdout.indexOf('Recovered:'));
  expect(stdout.indexOf('Recovered:')).toBeLessThan(stdout.indexOf('Claim station paid: 0 cr'));
  expect(stdout.indexOf('Claim station paid: 0 cr')).toBeLessThan(stdout.indexOf('Package: package-1'));
});

test('a return after default stays Freight Returned and prints the same sent claim amounts', () => {
  const stdout = output(
    'shipping_return',
    settlementEnvelope('return', {
      contract: {
        ...contract,
        status: 'defaulted',
        package_recovery: 'returned',
        package_recovered_at: '2026-07-17T13:00:00Z',
        claim_station_paid: 1000,
      },
      debt_cleared: 4000,
      claim_repaid: 20,
      claim_debt: 30,
    }),
  );

  expect(stdout).toContain('=== Freight Returned ===');
  expect(stdout).not.toContain('Freight Reclaimed');
  expect(stdout).toContain('Status: defaulted');
  expect(stdout).toContain('Package recovery: returned');
  expect(stdout).toContain('Recovered: 2026-07-17T13:00:00Z');
  expect(stdout).toContain('Claim station paid: 1,000 cr');
  expect(stdout).toContain('Debt cleared: 4,000 cr');
  expect(stdout).toContain('Claim repaid: 20 cr');
  expect(stdout).toContain('Claim debt: 30 cr');
  expect(stdout).not.toContain('50 cr');
  expect(stdout).not.toContain('claim:');
  expect(stdout).not.toContain('=== Response ===');
});

test('omitted claim settlement keys print nothing and are not 0', () => {
  for (const command of ['shipping_deliver', 'shipping_return', 'shipping_reclaim', 'shipping_cancel'] as const) {
    const action = command.slice('shipping_'.length) as 'deliver' | 'return' | 'cancel' | 'reclaim';
    const stdout = output(command, settlementEnvelope(action));
    expect(stdout).not.toContain('Debt cleared');
    expect(stdout).not.toContain('Claim repaid');
    expect(stdout).not.toContain('Claim debt');
    expect(stdout).not.toContain('Package recovery');
    expect(stdout).not.toContain('Recovered:');
    expect(stdout).not.toContain('Claim station paid');
  }
});

test('a sent 0 on deliver or cancel prints the claim lines and a non-finite value does not', () => {
  const sent = output(
    'shipping_cancel',
    settlementEnvelope('cancel', { debt_cleared: 0, claim_repaid: 0, claim_debt: 0 }),
  );
  expect(sent).toContain('=== Freight Contract Canceled ===');
  expect(sent).toContain('Debt cleared: 0 cr');
  expect(sent).toContain('Claim repaid: 0 cr');
  expect(sent).toContain('Claim debt: 0 cr');

  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, '0', null, true] as const) {
    const stdout = output(
      'shipping_deliver',
      settlementEnvelope('deliver', { debt_cleared: value, claim_repaid: value, claim_debt: value }),
    );
    expect(stdout).not.toContain('Debt cleared');
    expect(stdout).not.toContain('Claim repaid');
    expect(stdout).not.toContain('Claim debt');
    expect(stdout).not.toContain('NaN');
  }
});

test('shipping_get and shipping_track print package recovery and skip blank or non-string values', () => {
  const recovered = {
    package_recovery: 'reclaimed',
    package_recovered_at: '2026-07-17T12:00:00Z',
    claim_station_paid: 9007199254740993n,
  };
  const full = output('shipping_get', { action: 'get', contract: { ...contract, ...recovered } });
  expect(full).toContain('=== Freight Contract ===');
  expect(full).toContain('Package recovery: reclaimed');
  expect(full).toContain('Recovered: 2026-07-17T12:00:00Z');
  expect(full).toContain('Claim station paid: 9,007,199,254,740,993 cr');
  expect(full).not.toContain('=== Response ===');

  const tracked = output('shipping_track', {
    action: 'track',
    contract: { ...contract, ...recovered, package_recovery: ' returned ' },
    events: [],
  });
  expect(tracked).toContain('=== Freight Tracking ===');
  expect(tracked).toContain('Package recovery:  returned ');
  expect(tracked).toContain('Recovered: 2026-07-17T12:00:00Z');
  expect(tracked).toContain('Claim station paid: 9,007,199,254,740,993 cr');
  expect(tracked).not.toContain('=== Response ===');

  const blank = output('shipping_get', {
    action: 'get',
    contract: {
      ...contract,
      package_recovery: '   ',
      package_recovered_at: '',
      claim_station_paid: '0',
    },
  });
  expect(blank).toContain('=== Freight Contract ===');
  expect(blank).not.toContain('Package recovery');
  expect(blank).not.toContain('Recovered:');
  expect(blank).not.toContain('Claim station paid');

  const wrongType = output('shipping_get', {
    action: 'get',
    contract: { ...contract, package_recovery: 1, package_recovered_at: 2, claim_station_paid: Number.NaN },
  });
  expect(wrongType).not.toContain('Package recovery');
  expect(wrongType).not.toContain('Recovered:');
  expect(wrongType).not.toContain('Claim station paid');
  expect(wrongType).not.toContain('NaN');
});

test('freight listing does not print package recovery fields', () => {
  const stdout = output('shipping_list', {
    action: 'list',
    shipments: [
      {
        contract: {
          ...contract,
          package_recovery: 'reclaimed',
          package_recovered_at: '2026-07-17T12:00:00Z',
          claim_station_paid: 0,
        },
      },
    ],
  });

  expect(stdout).toContain('=== Freight Contracts ===');
  expect(stdout).not.toContain('Package recovery');
  expect(stdout).not.toContain('Recovered');
  expect(stdout).not.toContain('Claim station paid');
  expect(stdout).not.toContain('reclaimed');
  expect(stdout).not.toContain('=== Response ===');
});

test('freight debt tables add Creditor due only when a row sends a finite number or bigint', () => {
  const profile = (debts: Array<Record<string, unknown>>) =>
    output('shipping_profile', {
      action: 'profile',
      profile: carrierProfile,
      capacity: carrierCapacity,
      progression: carrierProgression,
      debts,
    });

  const mixed = profile([
    { ...freightDebt, creditor_due: 0 },
    { ...freightDebt, id: 'debt-2', creditor_due: 4242n },
    { ...freightDebt, id: 'debt-blank' },
  ]);
  const header = mixed.split('\n').find((line) => line.includes('Creditor due'));
  const cells = header?.split('|').map((cell) => cell.trim()) ?? [];
  expect(cells.indexOf('Outstanding')).toBeGreaterThanOrEqual(0);
  expect(cells.indexOf('Outstanding')).toBeLessThan(cells.indexOf('Creditor due'));
  expect(cells.indexOf('Creditor due')).toBeLessThan(cells.indexOf('Creditor'));
  expect(mixed).toContain('4242');
  expect(mixed).not.toContain('4,242');
  expect(mixed).not.toContain('4242 cr');
  const zeroRow = mixed.split('\n').find((line) => line.includes('debt-1'));
  expect(zeroRow).toContain('0');
  const blankRow = mixed.split('\n').find((line) => line.includes('debt-blank'));
  expect(blankRow).toBeDefined();
  expect(blankRow).not.toContain('4242');
  expect(mixed).not.toContain('=== Response ===');

  const omitted = profile([freightDebt, { ...freightDebt, id: 'debt-2', creditor_due: '0' }]);
  expect(omitted).not.toContain('Creditor due');

  const nonFinite = profile([
    { ...freightDebt, creditor_due: Number.NaN },
    { ...freightDebt, id: 'debt-2', creditor_due: Number.POSITIVE_INFINITY },
    { ...freightDebt, id: 'debt-3', creditor_due: null },
  ]);
  expect(nonFinite).not.toContain('Creditor due');
  expect(nonFinite).not.toContain('NaN');

  const paid = output('shipping_pay_debt', {
    details: {
      action: 'pay_debt',
      amount_paid: 500,
      profile: carrierProfile,
      capacity: carrierCapacity,
      progression: carrierProgression,
      updated_debts: [{ ...freightDebt, outstanding: 250, creditor_due: 1000 }],
      outstanding_debts: [{ ...freightDebt, outstanding: 250 }],
    },
  });
  expect(paid).toContain('=== Updated Debts ===');
  expect(paid).toContain('Creditor due');
  expect(paid).toContain('1000');
  expect(paid).toContain('1,000 cr');
  const outstandingHeader = paid
    .split('=== Outstanding Debts ===')[1]
    ?.split('\n')
    .find((line) => line.includes('Outstanding'));
  expect(outstandingHeader).toBeDefined();
  expect(outstandingHeader).not.toContain('Creditor due');
  expect(paid).not.toContain('=== Response ===');
});

test('freight quote prints max_recent_defaults including 0 and skips a missing or non-finite value', () => {
  const limited = output('shipping_quote', {
    action: 'quote',
    quote: {
      package_id: 'package-1',
      route_hops: 3,
      max_recent_defaults: 10000,
    },
  });
  expect(limited).toContain('Route hops: 3');
  expect(limited).toContain('Max recent defaults: 10,000');
  expect(limited.indexOf('Route hops:')).toBeLessThan(limited.indexOf('Max recent defaults:'));
  expect(limited).not.toContain('no limit');
  expect(limited).not.toContain('=== Response ===');

  const zero = output('shipping_quote', {
    action: 'quote',
    quote: { package_id: 'package-1', max_recent_defaults: 0 },
  });
  expect(zero).toContain('Max recent defaults: 0');
  expect(zero).not.toContain('no limit');

  const negative = output('shipping_quote', {
    action: 'quote',
    quote: { package_id: 'package-1', max_recent_defaults: -1 },
  });
  expect(negative).toContain('Max recent defaults: -1');

  const negativeZero = output('shipping_quote', {
    action: 'quote',
    quote: { package_id: 'package-1', route_hops: -0, max_recent_defaults: -0 },
  });
  expect(negativeZero).toContain(`Route hops: ${(-0).toLocaleString()}`);
  expect(negativeZero).toContain(`Max recent defaults: ${(-0).toLocaleString()}`);

  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, '0', 'no limit', null, true, 1n] as const) {
    const stdout = output('shipping_quote', {
      action: 'quote',
      quote: { package_id: 'package-1', max_recent_defaults: value },
    });
    expect(stdout).toContain('=== Freight Quote ===');
    expect(stdout).not.toContain('Max recent defaults');
    expect(stdout).not.toContain('no limit');
    expect(stdout).not.toContain('NaN');
    expect(stdout).not.toContain('=== Response ===');
  }

  const omitted = output('shipping_quote', {
    action: 'quote',
    quote: { package_id: 'package-1', route_hops: 2 },
  });
  expect(omitted).toContain('Route hops: 2');
  expect(omitted).not.toContain('Max recent defaults');
  expect(omitted).not.toContain('no limit');
});

test('full freight contracts print max_recent_defaults and compact, list, and active views do not', () => {
  const posted = output('shipping_post', {
    details: { action: 'post', contract: { ...contract, max_recent_defaults: 0 } },
  });
  expect(posted).toContain('=== Posted Freight Contract ===');
  expect(posted).toContain('Max recent defaults: 0');
  expect(posted.indexOf('Service:')).toBeLessThan(posted.indexOf('Max recent defaults:'));
  expect(posted.indexOf('Max recent defaults:')).toBeLessThan(posted.indexOf('Base reward:'));
  expect(posted).not.toContain('no limit');
  expect(posted).not.toContain('=== Response ===');

  const got = output('shipping_get', {
    action: 'get',
    contract: { ...contract, max_recent_defaults: 4 },
  });
  expect(got).toContain('=== Freight Contract ===');
  expect(got).toContain('Max recent defaults: 4');

  const accepted = output('shipping_accept', {
    details: { action: 'accept', contract: { ...contract, max_recent_defaults: 10000 } },
  });
  expect(accepted).toContain('=== Accepted Freight Contract ===');
  expect(accepted).toContain('Max recent defaults: 10,000');

  const omitted = output('shipping_get', { action: 'get', contract });
  expect(omitted).toContain('=== Freight Contract ===');
  expect(omitted).not.toContain('Max recent defaults');
  expect(omitted).not.toContain('no limit');

  const nonFinite = output('shipping_get', {
    action: 'get',
    contract: { ...contract, max_recent_defaults: '0' },
  });
  expect(nonFinite).not.toContain('Max recent defaults');

  const tracked = output('shipping_track', {
    action: 'track',
    contract: { ...contract, max_recent_defaults: 0 },
    events: [],
  });
  expect(tracked).toContain('=== Freight Tracking ===');
  expect(tracked).not.toContain('Max recent defaults');
  expect(tracked).not.toContain('=== Response ===');

  const settled = output('shipping_deliver', {
    details: {
      action: 'deliver',
      contract: { ...contract, status: 'delivered', max_recent_defaults: 0 },
      carrier_payout: 1,
    },
  });
  expect(settled).toContain('=== Freight Delivered ===');
  expect(settled).not.toContain('Max recent defaults');

  const listed = output('shipping_list', {
    action: 'list',
    shipments: [
      {
        contract: { ...contract, max_recent_defaults: 0 },
        eligible: false,
        ineligible_reason: '  too many recent failures  ',
      },
    ],
  });
  expect(listed).toContain('=== Freight Contracts ===');
  expect(listed).toContain('too many recent failures');
  expect(listed).not.toContain('Max recent defaults');
  expect(listed).not.toContain('=== Response ===');

  const active = output('shipping_active', {
    action: 'active',
    tick: 1,
    shipments: [{ contract: { ...contract, max_recent_defaults: 2 }, role: 'shipper', next_step: 'Wait.' }],
  });
  expect(active).toContain('=== Active Freight ===');
  expect(active).not.toContain('Max recent defaults');
  expect(active).not.toContain('=== Response ===');
});
