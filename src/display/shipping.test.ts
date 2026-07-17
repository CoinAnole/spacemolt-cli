import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { renderStructuredResult } from './index.ts';

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
  expect(stdout).toContain('Failure debt: 33,000 cr');
  expect(stdout).toContain('Target: 20 ticks');
  expect(stdout).toContain('Insurance selected: yes');
  expect(stdout).toContain('=== Appraisal ===');
  expect(stdout).toContain('iron_ore');
  expect(stdout).not.toContain('=== Response ===');
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

test('renders listing eligibility beside reasons and preserves zero and false values', () => {
  const stdout = output('shipping_list', {
    action: 'list',
    page: 2,
    per_page: 20,
    total: 21,
    shipments: [
      { contract: { ...contract, id: 'eligible-1', base_reward: 0 }, eligible: true },
      {
        contract: { ...contract, id: 'blocked-1', failure_debt: 500 },
        eligible: false,
        reason: 'Outstanding freight debt blocks acceptance.',
      },
    ],
  });

  expect(stdout).toContain('=== Freight Contracts ===');
  expect(stdout).toContain('page 2, 2 of 21');
  expect(stdout).toMatch(/Eligible\s+\|\s+Reason/);
  expect(stdout).toContain('0 cr');
  expect(stdout).toContain('no');
  expect(stdout).toContain('Outstanding freight debt blocks acceptance.');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders an explicit empty listing message with pagination', () => {
  const stdout = output('shipping_list', {
    action: 'list',
    page: 1,
    per_page: 20,
    total: 0,
    shipments: [],
  });
  expect(stdout).toContain('page 1, 0 of 0');
  expect(stdout).toContain('No visible freight contracts.');
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

test('renders an explicit empty tracking message', () => {
  expect(output('shipping_track', { action: 'track', contract, events: [] })).toContain('No tracking events.');
});
