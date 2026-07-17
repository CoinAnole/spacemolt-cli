import { c, emitLine, formatter, isRecord, printCompactTable } from './helpers.ts';

type ValueFormatter = (value: unknown) => string | undefined;

function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() ? value : undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString();
  return undefined;
}

function formatCredits(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return `${value.toLocaleString()} cr`;
}

function formatTicks(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return `${value.toLocaleString()} ticks`;
}

function formatBoolean(value: unknown): string | undefined {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return undefined;
}

function formatActor(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const kind = typeof value.kind === 'string' && value.kind.trim() ? value.kind : undefined;
  const id = typeof value.id === 'string' && value.id.trim() ? value.id : undefined;
  return kind && id ? `${kind}:${id}` : undefined;
}

function formatRoute(origin: unknown, destination: unknown): string | undefined {
  const from = typeof origin === 'string' && origin.trim() ? origin : undefined;
  const to = typeof destination === 'string' && destination.trim() ? destination : undefined;
  return from && to ? `${from} -> ${to}` : undefined;
}

function optionalRecordArray(value: unknown): Array<Record<string, unknown>> | undefined {
  return Array.isArray(value) ? value.filter(isRecord) : undefined;
}

function requiredRecordArray(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every(isRecord) ? value : undefined;
}

function emitHeading(title: string): void {
  emitLine(`\n${c.bright}=== ${title} ===${c.reset}`);
}

function emitField(label: string, value: unknown, format: ValueFormatter = text): boolean {
  const rendered = format(value);
  if (rendered === undefined) return false;
  emitLine(`${label}: ${rendered}`);
  return true;
}

function renderQuote(result: Record<string, unknown>): boolean {
  if (!isRecord(result.quote)) return false;
  const quote = result.quote;
  emitHeading('Freight Quote');
  emitField('Package', quote.package_id);
  emitField('Route', formatRoute(quote.origin_base_id, quote.destination_base_id));
  emitField('Shipper', quote.shipper, formatActor);
  emitField('Recipient', quote.recipient, formatActor);
  emitField('Invited carrier', quote.invited_carrier, formatActor);
  emitField('Service', quote.service_level);
  emitField('Visibility', quote.visibility);
  emitField('Route hops', quote.route_hops);
  emitField('Target', quote.target_ticks, formatTicks);
  emitField('Deadline', quote.deadline_ticks, formatTicks);
  emitField('Base reward', quote.base_reward, formatCredits);
  emitField('Estimated market reward', quote.estimated_reward, formatCredits);
  emitField('Estimate samples', quote.estimate_samples);
  emitField('Maximum speed bonus', quote.max_speed_bonus, formatCredits);
  emitField('Service fee', quote.service_fee, formatCredits);
  emitField('Premium', quote.premium, formatCredits);
  emitField('Total cost', quote.total_cost, formatCredits);
  emitField('Appraised value', quote.appraised_value, formatCredits);
  emitField('Covered value', quote.covered_value, formatCredits);
  emitField('Insurance selected', quote.insurance_selected, formatBoolean);
  emitField('Insurable', quote.insurable, formatBoolean);
  emitField('Risk band', quote.risk_band);
  emitField('Required carrier tier', quote.required_carrier_tier);
  emitField('Reserved exposure', quote.reserved_exposure, formatCredits);
  emitField('Failure debt', quote.failure_debt, formatCredits);
  emitField('Uninsurable reason', quote.uninsurable_reason);
  emitField('Consequences', quote.consequences);

  const appraisal = optionalRecordArray(quote.appraisal_lines);
  if (!appraisal) return true;
  if (appraisal.length === 0) {
    emitLine('No appraisal lines.');
    return true;
  }

  const rows = appraisal.map((line) => ({
    item: text(line.item_id),
    quantity: text(line.quantity),
    unit_value: formatCredits(line.unit_value),
    total_value: formatCredits(line.total_value),
    insurable: formatBoolean(line.insurable),
    basis: [text(line.confidence), text(line.basis)].filter(Boolean).join(' / '),
    reason: text(line.uninsurable_reason),
  }));
  printCompactTable(
    'Appraisal',
    rows,
    [
      ['Item', ['item']],
      ['Qty', ['quantity']],
      ['Unit Value', ['unit_value']],
      ['Total Value', ['total_value']],
      ['Insurable', ['insurable']],
      ['Confidence / Basis', ['basis']],
      ['Reason', ['reason']],
    ],
    { maxCellWidth: 48 },
  );
  return true;
}

function renderContract(contract: Record<string, unknown>, title: string, compact = false): void {
  emitHeading(title);
  emitField('Contract', contract.id);
  emitField('Status', contract.status);
  emitField('Package', contract.package_id);
  emitField('Route', formatRoute(contract.origin_base_id, contract.destination_base_id));
  if (compact) return;

  emitField('Shipper', contract.shipper, formatActor);
  emitField('Recipient', contract.recipient, formatActor);
  emitField('Contractor', contract.contractor, formatActor);
  emitField('Invited carrier', contract.invited_carrier, formatActor);
  emitField('Visibility', contract.visibility);
  emitField('Service', contract.service_level);
  emitField('Base reward', contract.base_reward, formatCredits);
  emitField('Maximum speed bonus', contract.max_speed_bonus, formatCredits);
  emitField('Service fee', contract.service_fee, formatCredits);
  emitField('Reward escrow', contract.reward_escrow, formatCredits);
  emitField('Speed bonus escrow', contract.speed_bonus_escrow, formatCredits);
  emitField('Policy status', contract.policy_status);
  emitField('Insurable', contract.insurable, formatBoolean);
  emitField('Risk band', contract.risk_band);
  emitField('Premium', contract.premium, formatCredits);
  emitField('Covered value', contract.covered_value, formatCredits);
  emitField('Reserved exposure', contract.reserved_exposure, formatCredits);
  emitField('Failure debt', contract.failure_debt, formatCredits);
  emitField('Reputation eligible', contract.reputation_eligible, formatBoolean);
  emitField('Posted', contract.posted_at);
  emitField('Listing expires', contract.listing_expires_at);
  emitField('Accepted', contract.accepted_at);
  emitField('Accepted tick', contract.accepted_tick);
  emitField('Target tick', contract.target_tick);
  emitField('Deadline tick', contract.deadline_tick);
  emitField('Delivered', contract.delivered_at);
  emitField('Breached', contract.breached_at);
  emitField('Settled', contract.settled_at);
  emitField('Latest beacon', contract.latest_beacon_fingerprint);
  emitField('Latest beacon at', contract.latest_beacon_at);
  emitField('Terminal reason', contract.terminal_reason);
  emitField('Carrier payout', contract.carrier_payout, formatCredits);
  emitField('Claim paid', contract.claim_paid, formatCredits);
  emitField('Insurer', contract.insurer, formatActor);
  emitField('Salvage owner', contract.salvage_owner, formatActor);
}

function contractTitle(command: string | undefined): string {
  if (command === 'shipping_post') return 'Posted Freight Contract';
  if (command === 'shipping_accept') return 'Accepted Freight Contract';
  return 'Freight Contract';
}

function renderShippingList(result: Record<string, unknown>): boolean {
  const shipments = requiredRecordArray(result.shipments);
  if (!shipments) return false;
  if (!shipments.every((listing) => isRecord(listing.contract))) return false;
  emitHeading('Freight Contracts');
  const page = text(result.page) ?? '?';
  const total = text(result.total) ?? shipments.length.toLocaleString();
  emitLine(`${c.dim}page ${page}, ${shipments.length.toLocaleString()} of ${total}${c.reset}`);
  if (shipments.length === 0) {
    emitLine(text(result.empty_reason) ?? 'No visible freight contracts.');
    emitField('Reason', result.empty_reason_code);
    return true;
  }

  const rows: Array<Record<string, unknown>> = [];
  for (const listing of shipments) {
    if (!isRecord(listing.contract)) continue;
    const shipment = listing.contract;
    rows.push({
      id: text(shipment.id),
      status: text(shipment.status),
      package: text(shipment.package_id),
      route: formatRoute(shipment.origin_base_id, shipment.destination_base_id),
      service: text(shipment.service_level),
      reward: formatCredits(shipment.base_reward),
      liability: formatCredits(shipment.failure_debt),
      eligible: formatBoolean(listing.eligible),
      reason: text(listing.reason),
    });
  }

  printCompactTable(
    'Listings',
    rows,
    [
      ['ID', ['id']],
      ['Status', ['status']],
      ['Package', ['package']],
      ['Route', ['route']],
      ['Service', ['service']],
      ['Reward', ['reward']],
      ['Liability', ['liability']],
      ['Eligible', ['eligible']],
      ['Reason', ['reason']],
    ],
    { maxCellWidth: 56 },
  );
  return true;
}

function formatLocation(event: Record<string, unknown>): string | undefined {
  const parts = [text(event.system_id), text(event.poi_id), text(event.base_id)].filter(
    (value): value is string => value !== undefined,
  );
  return parts.length ? parts.join(' / ') : undefined;
}

function renderShippingTrack(result: Record<string, unknown>): boolean {
  const events = requiredRecordArray(result.events);
  if (!isRecord(result.contract) || !events) return false;
  renderContract(result.contract, 'Freight Tracking', true);
  if (events.length === 0) {
    emitLine('No tracking events.');
    return true;
  }

  const rows = events.map((event) => ({
    observed: text(event.observed_at),
    tick: text(event.observed_tick),
    class: text(event.class),
    location: formatLocation(event),
    custodian: formatActor(event.custodian),
    reference: text(event.reference_id),
    fingerprint: text(event.fingerprint),
  }));
  printCompactTable(
    'Tracking Events',
    rows,
    [
      ['Observed', ['observed']],
      ['Tick', ['tick']],
      ['Class', ['class']],
      ['Location', ['location']],
      ['Custodian', ['custodian']],
      ['Reference', ['reference']],
      ['Fingerprint', ['fingerprint']],
    ],
    { maxCellWidth: 56 },
  );
  return true;
}

function formatCountCapacity(current: unknown, limit: unknown, unlimited: unknown): string | undefined {
  const count = text(current);
  if (count === undefined) return undefined;
  if (unlimited === true) return `${count} (unlimited)`;
  const maximum = text(limit);
  return maximum === undefined ? count : `${count} / ${maximum}`;
}

function formatLiabilityCapacity(current: unknown, limit: unknown, unlimited: unknown): string | undefined {
  const liability = formatCredits(current);
  if (liability === undefined) return undefined;
  if (unlimited === true) return `${liability} (unlimited)`;
  const maximum = formatCredits(limit);
  return maximum === undefined ? liability : `${liability} / ${maximum}`;
}

function renderCarrierSections(
  profile: Record<string, unknown>,
  capacity: Record<string, unknown>,
  progression: Record<string, unknown>,
  result: Record<string, unknown>,
): void {
  emitField('Actor', profile.actor, formatActor);
  emitField('Tier', profile.tier);
  emitField('Successful deliveries', profile.successful_deliveries);
  emitField('Priority deliveries', profile.priority_deliveries);
  emitField('Delivered value', profile.delivered_value, formatCredits);
  emitField('Returns', profile.returns);
  emitField('Breaches', profile.breaches);
  emitField('Defaults', profile.defaults);
  emitField('Active contracts', profile.active_contracts);
  emitField('Active liability', profile.active_liability, formatCredits);
  emitField('Outstanding debt', profile.outstanding_debt, formatCredits);
  emitField('Updated', profile.updated_at);
  emitField('Last consequence', profile.last_consequence_at);
  emitField('Last recovery', profile.last_recovery_at);

  emitLine(`\n${c.bright}Capacity:${c.reset}`);
  emitField(
    'Active contracts',
    formatCountCapacity(capacity.active_contracts, capacity.active_contract_limit, capacity.active_contracts_unlimited),
  );
  emitField(
    'Aggregate liability',
    formatLiabilityCapacity(
      capacity.active_liability,
      capacity.aggregate_liability_limit,
      capacity.liability_unlimited,
    ),
  );
  if (capacity.liability_unlimited !== true) {
    emitField('Remaining aggregate liability', capacity.remaining_aggregate_liability, formatCredits);
    emitField('Single-package liability', capacity.single_package_liability_limit, formatCredits);
  }

  emitLine(`\n${c.bright}Tier Progression:${c.reset}`);
  if (progression.at_maximum_tier === true) {
    emitLine('Maximum carrier tier reached.');
  } else {
    emitField('Current tier', progression.current_tier);
    emitField('Next tier', progression.next_tier);
    emitField('Successful deliveries', progression.successful_deliveries);
    emitField('Required deliveries', progression.required_successful_deliveries);
    emitField('Remaining deliveries', progression.remaining_successful_deliveries);
    emitField('Delivered value', progression.delivered_value, formatCredits);
    emitField('Required delivered value', progression.required_delivered_value, formatCredits);
    emitField('Remaining delivered value', progression.remaining_delivered_value, formatCredits);
  }
  emitField('Acceptance blocked', result.debt_blocks_acceptance, formatBoolean);
  emitField('Block reason', result.debt_block_reason);
}

function renderDebts(title: string, debts: Array<Record<string, unknown>>, emptyMessage: string): void {
  if (debts.length === 0) {
    emitLine(emptyMessage);
    return;
  }
  const rows = debts.map((debt) => ({
    id: text(debt.id),
    shipment: text(debt.shipment_id),
    original: formatCredits(debt.original),
    outstanding: formatCredits(debt.outstanding),
    creditor: formatActor(debt.creditor),
    created: text(debt.created_at),
    paid: text(debt.paid_at),
  }));
  printCompactTable(
    title,
    rows,
    [
      ['ID', ['id']],
      ['Shipment', ['shipment']],
      ['Original', ['original']],
      ['Outstanding', ['outstanding']],
      ['Creditor', ['creditor']],
      ['Created', ['created']],
      ['Paid', ['paid']],
    ],
    { maxCellWidth: 48 },
  );
}

function renderShippingProfile(result: Record<string, unknown>): boolean {
  const debts = requiredRecordArray(result.debts);
  if (!isRecord(result.profile) || !isRecord(result.capacity) || !isRecord(result.progression) || !debts) {
    return false;
  }
  emitHeading('Carrier Profile');
  renderCarrierSections(result.profile, result.capacity, result.progression, result);
  renderDebts('Outstanding Debts', debts, 'No outstanding freight debt.');
  return true;
}

function renderDebtPayment(result: Record<string, unknown>): boolean {
  const updated = requiredRecordArray(result.updated_debts);
  const outstanding = requiredRecordArray(result.outstanding_debts);
  if (
    !isRecord(result.profile) ||
    !isRecord(result.capacity) ||
    !isRecord(result.progression) ||
    updated === undefined ||
    outstanding === undefined ||
    typeof result.amount_paid !== 'number' ||
    !Number.isFinite(result.amount_paid)
  ) {
    return false;
  }
  emitHeading('Freight Debt Payment');
  emitField('Amount paid', result.amount_paid, formatCredits);
  renderCarrierSections(result.profile, result.capacity, result.progression, result);
  renderDebts('Updated Debts', updated, 'No freight debts changed.');
  renderDebts('Outstanding Debts', outstanding, 'No outstanding freight debt.');
  return true;
}

function settlementTitle(command: string | undefined): string {
  if (command === 'shipping_deliver') return 'Freight Delivered';
  if (command === 'shipping_return') return 'Freight Returned';
  return 'Freight Contract Canceled';
}

function renderSettlement(result: Record<string, unknown>, command: string | undefined): boolean {
  if (!isRecord(result.contract)) return false;
  renderContract(result.contract, settlementTitle(command), true);
  emitField('Carrier payout', result.carrier_payout, formatCredits);
  emitField('Shipper refund', result.shipper_refund, formatCredits);
  emitField('Claim paid', result.claim_paid, formatCredits);
  emitField('Debt created', result.debt_created, formatCredits);
  emitField('Terminal reason', result.contract.terminal_reason);
  return true;
}

export const shippingFormatters = [
  formatter((result) => renderQuote(result), {
    commands: ['shipping_quote'],
    suppressShapeFallbackOnDecline: true,
  }),
  formatter(
    (result, command) => {
      if (!isRecord(result.contract)) return false;
      renderContract(result.contract, contractTitle(command));
      return true;
    },
    {
      commands: ['shipping_post', 'shipping_get', 'shipping_accept'],
      suppressShapeFallbackOnDecline: true,
    },
  ),
  formatter((result) => renderShippingList(result), {
    commands: ['shipping_list'],
    suppressShapeFallbackOnDecline: true,
  }),
  formatter((result) => renderShippingTrack(result), {
    commands: ['shipping_track'],
    suppressShapeFallbackOnDecline: true,
  }),
  formatter((result) => renderShippingProfile(result), {
    commands: ['shipping_profile'],
    suppressShapeFallbackOnDecline: true,
  }),
  formatter((result) => renderDebtPayment(result), {
    commands: ['shipping_pay_debt'],
    suppressShapeFallbackOnDecline: true,
  }),
  formatter((result, command) => renderSettlement(result, command), {
    commands: ['shipping_deliver', 'shipping_return', 'shipping_cancel'],
    suppressShapeFallbackOnDecline: true,
  }),
];
