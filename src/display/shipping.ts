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

function recordArray(value: unknown): Array<Record<string, unknown>> | undefined {
  return Array.isArray(value) ? value.filter(isRecord) : undefined;
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

  const appraisal = recordArray(quote.appraisal_lines);
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
];
