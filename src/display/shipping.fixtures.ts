import type { HighValueFixtureEntry } from './formatter-fixtures.ts';

function actor(kind: 'player' | 'faction' | 'station', id: string): Record<string, unknown> {
  return { kind, id };
}

function shipmentContract(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'shipment-standard-1',
    package_id: 'package-relief-1',
    shipper: actor('player', 'marlowe'),
    recipient: actor('station', 'nova_central'),
    origin_base_id: 'earth_station',
    destination_base_id: 'nova_central',
    shipping_house_id: 'earth_mission_board',
    visibility: 'public',
    service_level: 'standard',
    status: 'posted',
    posted_at: '2026-07-17T10:00:00Z',
    listing_expires_at: '2026-07-18T10:00:00Z',
    base_reward: 12000,
    max_speed_bonus: 0,
    service_fee: 800,
    reward_escrow: 12000,
    speed_bonus_escrow: 0,
    failure_debt: 500,
    reserved_exposure: 500,
    policy_status: 'none',
    insurable: false,
    risk_band: 'unpriced',
    ...overrides,
  };
}

function carrierProfile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    actor: actor('player', 'carrier-vale'),
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
    updated_at: '2026-07-17T12:00:00Z',
    ...overrides,
  };
}

function carrierCapacity(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    active_contracts: 2,
    active_contracts_unlimited: true,
    active_liability: 33000,
    liability_unlimited: false,
    aggregate_liability_limit: 100000,
    remaining_aggregate_liability: 67000,
    single_package_liability_limit: 50000,
    ...overrides,
  };
}

function carrierProgression(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    current_tier: 'licensed',
    next_tier: 'trusted',
    at_maximum_tier: false,
    successful_deliveries: 12,
    required_successful_deliveries: 25,
    remaining_successful_deliveries: 13,
    delivered_value: 125000,
    required_delivered_value: 250000,
    remaining_delivered_value: 125000,
    ...overrides,
  };
}

function freightDebt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'freight-debt-1',
    shipment_id: 'shipment-breached-1',
    debtor: actor('player', 'carrier-vale'),
    creditor: actor('station', 'earth_station'),
    original: 1000,
    outstanding: 500,
    created_at: '2026-07-17T09:00:00Z',
    ...overrides,
  };
}

function mutationFixture(details: Record<string, unknown>, credits: number): Record<string, unknown> {
  return {
    details,
    player: { username: 'Marlowe', credits },
    ship: { id: 'ship-wayfarer', name: 'Wayfarer', cargo_used: 100, cargo_capacity: 500 },
    cargo: [{ item_id: 'sealed_package', package_id: 'package-relief-1', quantity: 1, size: 100 }],
  };
}

export const shippingQuoteFixture = {
  action: 'quote',
  quote: {
    package_id: 'package-medical-1',
    origin_base_id: 'earth_station',
    destination_base_id: 'nova_central',
    shipper: actor('player', 'marlowe'),
    recipient: actor('faction', 'nova_relief'),
    invited_carrier: actor('faction', 'swift_haulage'),
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
    covered_value: 30000,
    appraised_value: 30000,
    appraisal_lines: [
      {
        item_id: 'medical_supplies',
        quantity: 20,
        unit_value: 1200,
        total_value: 24000,
        insurable: true,
        basis: 'completed-fill VWAP',
        confidence: 'high',
        fill_count: 18,
        latest_fill_at: '2026-07-17T08:00:00Z',
        lookback: '30d',
        traded_notional: 216000,
        traded_units: 180,
      },
      {
        item_id: 'food_rations',
        quantity: 30,
        unit_value: 200,
        total_value: 6000,
        insurable: true,
        basis: 'completed-fill VWAP',
        confidence: 'medium',
      },
    ],
    insurable: true,
    insurance_selected: true,
    risk_band: 'licensed',
    required_carrier_tier: 'licensed',
    reserved_exposure: 33000,
    failure_debt: 33000,
    consequences: 'Opening the seal or missing the deadline forfeits payment and creates freight debt.',
  },
};

export const shippingPostFixture = mutationFixture(
  {
    action: 'post',
    contract: shipmentContract({
      id: 'shipment-posted-1',
      package_id: 'package-medical-1',
      recipient: actor('faction', 'nova_relief'),
      invited_carrier: actor('faction', 'swift_haulage'),
      visibility: 'invited',
      service_level: 'priority',
      base_reward: 12500,
      max_speed_bonus: 2500,
      reward_escrow: 12500,
      speed_bonus_escrow: 2500,
      failure_debt: 33000,
      reserved_exposure: 33000,
      policy_status: 'pending',
      insurable: true,
      risk_band: 'licensed',
      premium: 450,
      covered_value: 30000,
    }),
  },
  183750,
);

export const shippingGetFixture = {
  action: 'get',
  contract: shipmentContract({
    id: 'shipment-transit-1',
    status: 'in_transit',
    contractor: actor('player', 'carrier-vale'),
    accepted_at: '2026-07-17T10:05:00Z',
    accepted_tick: 1200,
    target_tick: 1220,
    deadline_tick: 1240,
    reputation_eligible: true,
    latest_beacon_at: '2026-07-17T10:20:00Z',
    latest_beacon_fingerprint: 'beacon-transit-1',
  }),
};

export const shippingAcceptFixture = mutationFixture(
  {
    action: 'accept',
    contract: shipmentContract({
      id: 'shipment-self-1',
      status: 'in_transit',
      recipient: actor('player', 'marlowe'),
      contractor: actor('player', 'marlowe'),
      accepted_at: '2026-07-17T10:05:00Z',
      accepted_tick: 1200,
      target_tick: 1220,
      deadline_tick: 1240,
      reputation_eligible: false,
    }),
  },
  183750,
);

export const shippingListFixture = {
  action: 'list',
  shipments: [
    {
      contract: shipmentContract({ id: 'shipment-eligible-1', base_reward: 9000, reward_escrow: 9000 }),
      eligible: true,
    },
    {
      contract: shipmentContract({
        id: 'shipment-blocked-1',
        package_id: 'package-reactor-1',
        service_level: 'priority',
        base_reward: 22000,
        max_speed_bonus: 4000,
        reward_escrow: 22000,
        speed_bonus_escrow: 4000,
        failure_debt: 72000,
        reserved_exposure: 72000,
        policy_status: 'active',
        insurable: true,
        risk_band: 'trusted',
        premium: 1200,
        covered_value: 65000,
      }),
      eligible: false,
      reason: 'Single-package liability exceeds the licensed carrier limit.',
    },
  ],
  page: 1,
  per_page: 20,
  total: 2,
};

export const shippingTrackFixture = {
  action: 'track',
  contract: shipmentContract({
    id: 'shipment-track-1',
    status: 'in_transit',
    contractor: actor('player', 'carrier-vale'),
    accepted_at: '2026-07-17T10:05:00Z',
    accepted_tick: 1200,
    target_tick: 1220,
    deadline_tick: 1240,
    reputation_eligible: true,
  }),
  events: [
    {
      id: 'tracking-event-1',
      shipment_id: 'shipment-track-1',
      package_id: 'package-relief-1',
      class: 'ship',
      fingerprint: 'beacon-ship-1',
      observed_at: '2026-07-17T10:10:00Z',
      observed_tick: 1201,
      system_id: 'sol',
      poi_id: 'earth_orbit',
      custodian: actor('player', 'carrier-vale'),
      reference_id: 'ship-wayfarer',
    },
    {
      id: 'tracking-event-2',
      shipment_id: 'shipment-track-1',
      package_id: 'package-relief-1',
      class: 'faction_storage',
      fingerprint: 'beacon-storage-1',
      observed_at: '2026-07-17T10:30:00Z',
      observed_tick: 1203,
      base_id: 'nova_central',
      custodian: actor('faction', 'nova_relief'),
      reference_id: 'nova-relief-main',
    },
  ],
};

export const shippingProfileFixture = {
  action: 'profile',
  profile: carrierProfile(),
  capacity: carrierCapacity(),
  progression: carrierProgression(),
  debt_blocks_acceptance: true,
  debt_block_reason: 'Outstanding freight debt must be paid before accepting another contract.',
  debts: [freightDebt()],
};

export const shippingPayDebtFixture = mutationFixture(
  {
    action: 'pay_debt',
    amount_paid: 250,
    profile: carrierProfile({ outstanding_debt: 250 }),
    capacity: carrierCapacity(),
    progression: carrierProgression(),
    debt_blocks_acceptance: true,
    debt_block_reason: '250 cr of freight debt remains unpaid.',
    updated_debts: [freightDebt({ outstanding: 250 })],
    outstanding_debts: [freightDebt({ outstanding: 250 })],
  },
  183500,
);

export const shippingDeliverFixture = mutationFixture(
  {
    action: 'deliver',
    contract: shipmentContract({
      id: 'shipment-delivered-1',
      status: 'delivered',
      service_level: 'priority',
      contractor: actor('player', 'carrier-vale'),
      accepted_at: '2026-07-17T10:05:00Z',
      accepted_tick: 1200,
      target_tick: 1220,
      deadline_tick: 1240,
      delivered_at: '2026-07-17T10:35:00Z',
      settled_at: '2026-07-17T10:35:00Z',
      reputation_eligible: true,
      carrier_payout: 14500,
    }),
    carrier_payout: 14500,
    claim_paid: 0,
    debt_created: 0,
  },
  198000,
);

export const shippingReturnFixture = mutationFixture(
  {
    action: 'return',
    contract: shipmentContract({
      id: 'shipment-returned-1',
      status: 'returned',
      contractor: actor('player', 'carrier-vale'),
      accepted_at: '2026-07-17T10:05:00Z',
      settled_at: '2026-07-17T11:00:00Z',
      terminal_reason: 'Carrier surrendered freight at the origin station.',
      reputation_eligible: true,
      carrier_payout: 0,
    }),
    carrier_payout: 0,
    shipper_refund: 12000,
    debt_created: 0,
  },
  195500,
);

export const shippingCancelFixture = mutationFixture(
  {
    action: 'cancel',
    contract: shipmentContract({
      id: 'shipment-canceled-1',
      status: 'canceled',
      settled_at: '2026-07-17T10:02:00Z',
      terminal_reason: 'Shipper canceled the unaccepted listing.',
    }),
    shipper_refund: 12000,
    claim_paid: 0,
    debt_created: 0,
  },
  195750,
);

function shippingEntry(
  action: string,
  fixture: Record<string, unknown>,
  schemaTarget?: HighValueFixtureEntry['schemaTarget'],
): HighValueFixtureEntry {
  return {
    command: `shipping_${action}`,
    fixture,
    apiRoute: `POST /api/v2/spacemolt_shipping/${action}`,
    ...(schemaTarget ? { schemaTarget } : {}),
  };
}

export const shippingHighValueFixtures: Record<string, HighValueFixtureEntry> = {
  shipping_quote: shippingEntry('quote', shippingQuoteFixture),
  shipping_post: shippingEntry('post', shippingPostFixture, 'details'),
  shipping_get: shippingEntry('get', shippingGetFixture),
  shipping_accept: shippingEntry('accept', shippingAcceptFixture, 'details'),
  shipping_list: shippingEntry('list', shippingListFixture),
  shipping_track: shippingEntry('track', shippingTrackFixture),
  shipping_profile: shippingEntry('profile', shippingProfileFixture),
  shipping_pay_debt: shippingEntry('pay_debt', shippingPayDebtFixture, 'details'),
  shipping_deliver: shippingEntry('deliver', shippingDeliverFixture, 'details'),
  shipping_return: shippingEntry('return', shippingReturnFixture, 'details'),
  shipping_cancel: shippingEntry('cancel', shippingCancelFixture, 'details'),
};
