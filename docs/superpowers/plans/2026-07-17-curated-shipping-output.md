# Curated Shipping Output and Golden Fixtures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give all eleven generated shipping commands curated table output and schema-shaped four-mode golden fixtures without changing request metadata or machine-output payloads.

**Architecture:** Add one command-scoped shipping display module organized around the seven stable OpenAPI response families. Build shared scalar, actor, route, contract, carrier, and debt helpers, then register action-specific compositions for quote/contract, list/track, profile/debt, and settlements. Keep generated command dispatch untouched and prove raw machine-output preservation with full mutation envelopes in the high-value golden matrix.

**Tech Stack:** Bun 1.x, TypeScript, `bun:test`, existing display helpers and compact-table renderer, cached SpaceMolt v0.522.0 OpenAPI schemas, committed golden files, Biome.

## Global Constraints

- Give all eleven non-help shipping commands intentional human-readable table output.
- Preserve raw server data unchanged in JSON, YAML, structured, compact, field, fields, and jq output modes.
- Shipping commands remain generated commands; do not add command overrides, aliases, friendly names, positional arguments, examples, categories, or request parsing behavior.
- Do not change bundled or cached dynamic-command discovery, help, completion, or dispatch.
- Do not change API transport, sessions, authentication, profiles, mutation state handling, or generic fallback behavior.
- Do not invent names for IDs, convert timestamps to local time, or reorder server arrays.
- Actors render as `<kind>:<id>` and routes as `<origin_base_id> -> <destination_base_id>`.
- Credit values use grouped digits plus ` cr`; tick durations use `<value> ticks`; booleans use `yes` or `no`; timestamps remain exact.
- Missing or malformed optional values are omitted; numeric zero and boolean false remain visible.
- Required malformed response-family roots decline the shipping formatter and reach the existing raw-response fallback.
- Add one schema-shaped high-value fixture and table/JSON/YAML/compact-JSON goldens for every shipping action.
- Use only committed `spacemolt-docs/openapi.json`; never run `LIVE_API_SYNC=1`.
- Preserve unrelated tracked, untracked, ignored, and user-owned files.

---

## File Structure

- Create `src/display/shipping.ts`: all shipping-only scalar helpers, derived table rows, shared contract/carrier sections, and eleven command-scoped formatter registrations.
- Create `src/display/shipping.test.ts`: focused semantic tests for formatter selection, shared conventions, empty/malformed values, event ordering, capacity, debt, settlement zeroes, and machine-output preservation.
- Create `src/display/shipping.fixtures.ts`: schema-shaped v0.522 fixtures and explicit route metadata for all eleven generated shipping commands.
- Modify `src/display/formatters.ts`: register `shippingFormatters` before generic fallbacks.
- Modify `src/display/formatter-fixtures.ts`: import, export, and spread `shippingHighValueFixtures` into the renderer matrix.
- Modify `src/test-support/fixture-schema-compare.ts`: when `schemaTarget: details` is explicit and a golden fixture contains a mutation envelope, compare `fixture.details` with the action schema.
- Modify `src/test-support/output-golden.test.ts`: prove envelope-aware details comparison while retaining bare-details compatibility.
- Create 88 files under `src/golden-output/renderer/`: stdout/stderr pairs for table, JSON, YAML, and compact JSON across eleven shipping fixtures.

Keep the production code in one domain module. Its helpers are private because no other display domain owns freight-specific actor, liability, insurance, or debt semantics.

The approved spec requires mutation goldens to retain the full `details + player + ship + cargo` envelope while schema comparison targets the inner action response. The current reporter's explicit-details path assumes the fixture itself is already the bare details object, so Task 4 adds a backward-compatible unwrapping step before the envelope fixtures are registered.

---

### Task 1: Shared Formatting, Quote, and Contract Views

**Files:**
- Create: `src/display/shipping.ts`
- Create: `src/display/shipping.test.ts`
- Modify: `src/display/formatters.ts:1-28`

**Interfaces:**
- Consumes: `formatter`, `isRecord`, `emitLine`, `printCompactTable`, and `c` from `src/display/helpers.ts`; `renderStructuredResult` from `src/display/index.ts`.
- Produces: private `formatActor`, `formatRoute`, `formatCredits`, `formatTicks`, `emitField`, `recordArray`, and `renderContract`; exported `shippingFormatters` initially covering `shipping_quote`, `shipping_post`, `shipping_get`, and `shipping_accept`.

- [ ] **Step 1: Add failing quote, contract, envelope, machine-output, and malformed-root tests**

Create `src/display/shipping.test.ts` with:

```ts
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
    ['shipping_post', { details: { action: 'post', contract }, player: { credits: 10 }, ship: {}, cargo: [] }, 'Posted Freight Contract'],
    ['shipping_get', { action: 'get', contract }, 'Freight Contract'],
    ['shipping_accept', { details: { action: 'accept', contract }, player: { credits: 10 }, ship: {}, cargo: [] }, 'Accepted Freight Contract'],
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
```

- [ ] **Step 2: Run the focused test and verify shipping falls back to raw responses**

Run:

```bash
bun test src/display/shipping.test.ts
```

Expected: FAIL because every valid shipping fixture contains `=== Response ===` and lacks the curated headings.

- [ ] **Step 3: Implement shared helpers plus quote and contract formatters**

Create `src/display/shipping.ts` with:

```ts
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
  formatter((result) => renderQuote(result), { commands: ['shipping_quote'] }),
  formatter(
    (result, command) => {
      if (!isRecord(result.contract)) return false;
      renderContract(result.contract, contractTitle(command));
      return true;
    },
    { commands: ['shipping_post', 'shipping_get', 'shipping_accept'] },
  ),
];
```

- [ ] **Step 4: Register shipping formatters before generic formatters**

Add this import to `src/display/formatters.ts`:

```ts
import { shippingFormatters } from './shipping.ts';
```

Insert the spread immediately before `...genericFormatters`:

```ts
  ...empireFormatters,
  ...shippingFormatters,
  ...genericFormatters,
```

- [ ] **Step 5: Run the focused tests and formatter typecheck**

Run:

```bash
bunx biome check --write src/display/shipping.ts src/display/shipping.test.ts src/display/formatters.ts
bun test src/display/shipping.test.ts
bun run typecheck
```

Expected: both commands PASS; valid quote and contract responses use curated views, mutation JSON preserves all state sections, and malformed roots still use raw fallback.

- [ ] **Step 6: Commit the first response families**

```bash
git add src/display/shipping.ts src/display/shipping.test.ts src/display/formatters.ts
git commit -m "feat(output): format shipping quotes and contracts"
```

---

### Task 2: Listing and Tracking Views

**Files:**
- Modify: `src/display/shipping.ts`
- Modify: `src/display/shipping.test.ts`

**Interfaces:**
- Consumes: Task 1's `text`, `formatCredits`, `formatBoolean`, `formatActor`, `formatRoute`, `recordArray`, `emitHeading`, `emitField`, and `renderContract`.
- Produces: private `renderShippingList`, `formatLocation`, and `renderShippingTrack`; formatter registrations for `shipping_list` and `shipping_track`.

- [ ] **Step 1: Add failing listing, empty-list, tracking-order, and empty-event tests**

Append to `src/display/shipping.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the focused test and verify list/track still fall back**

Run:

```bash
bun test src/display/shipping.test.ts
```

Expected: FAIL in the four new tests because `shipping_list` and `shipping_track` are not registered.

- [ ] **Step 3: Implement listing and tracking renderers**

Insert these functions before `export const shippingFormatters` in `src/display/shipping.ts`:

```ts
function renderShippingList(result: Record<string, unknown>): boolean {
  const shipments = recordArray(result.shipments);
  if (!shipments) return false;
  emitHeading('Freight Contracts');
  const page = text(result.page) ?? '?';
  const total = text(result.total) ?? shipments.length.toLocaleString();
  emitLine(`${c.dim}page ${page}, ${shipments.length.toLocaleString()} of ${total}${c.reset}`);
  if (shipments.length === 0) {
    emitLine('No visible freight contracts.');
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
  const events = recordArray(result.events);
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
```

Replace the `shippingFormatters` export with:

```ts
export const shippingFormatters = [
  formatter((result) => renderQuote(result), { commands: ['shipping_quote'] }),
  formatter(
    (result, command) => {
      if (!isRecord(result.contract)) return false;
      renderContract(result.contract, contractTitle(command));
      return true;
    },
    { commands: ['shipping_post', 'shipping_get', 'shipping_accept'] },
  ),
  formatter((result) => renderShippingList(result), { commands: ['shipping_list'] }),
  formatter((result) => renderShippingTrack(result), { commands: ['shipping_track'] }),
];
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
bunx biome check --write src/display/shipping.ts src/display/shipping.test.ts
bun test src/display/shipping.test.ts
bun run typecheck
```

Expected: PASS. The list table keeps eligibility beside its reason, empty arrays have domain messages, and tracking fingerprints remain in server order.

- [ ] **Step 5: Commit list and tracking output**

```bash
git add src/display/shipping.ts src/display/shipping.test.ts
git commit -m "feat(output): format shipping lists and tracking"
```

---

### Task 3: Carrier Profile, Debt Payment, and Settlement Views

**Files:**
- Modify: `src/display/shipping.ts`
- Modify: `src/display/shipping.test.ts`

**Interfaces:**
- Consumes: Task 1's shared scalar/contract helpers and Task 2's formatter array.
- Produces: private capacity/progression/debt helpers, `renderShippingProfile`, `renderDebtPayment`, and `renderSettlement`; formatter registrations for `shipping_profile`, `shipping_pay_debt`, `shipping_deliver`, `shipping_return`, and `shipping_cancel`.

- [ ] **Step 1: Add failing profile, maximum-tier, debt, zero-settlement, and malformed-optional tests**

Append to `src/display/shipping.test.ts`:

```ts
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

test('renders action-specific settlements and keeps zero amounts visible', () => {
  const cases: Array<[string, string, Record<string, unknown>]> = [
    ['shipping_deliver', 'Freight Delivered', { carrier_payout: 15000, claim_paid: 0 }],
    ['shipping_return', 'Freight Returned', { carrier_payout: 0, shipper_refund: 12500 }],
    ['shipping_cancel', 'Freight Contract Canceled', { shipper_refund: 0, debt_created: 0 }],
  ];

  for (const [command, heading, settlement] of cases) {
    const action = command.slice('shipping_'.length);
    const stdout = output(command, {
      details: {
        action,
        contract: { ...contract, status: action === 'cancel' ? 'canceled' : action === 'return' ? 'returned' : 'delivered' },
        ...settlement,
      },
      player: { credits: 10 },
      ship: {},
      cargo: [],
    });
    expect(stdout).toContain(`=== ${heading} ===`);
    expect(stdout).toContain('0 cr');
    expect(stdout).not.toContain('=== Response ===');
  }
});

test('omits malformed optional carrier and settlement fields without diagnostic tokens', () => {
  const stdout = output('shipping_deliver', {
    details: {
      action: 'deliver',
      contract: { ...contract, contractor: {}, terminal_reason: [], carrier_payout: Number.NaN },
      carrier_payout: Number.NaN,
      claim_paid: {},
    },
  });
  expect(stdout).not.toContain('undefined');
  expect(stdout).not.toContain('NaN');
  expect(stdout).not.toContain('[object Object]');
});
```

- [ ] **Step 2: Run the focused test and verify the new command families fall back**

Run:

```bash
bun test src/display/shipping.test.ts
```

Expected: FAIL in the five new tests because profile, debt-payment, and settlement formatters are not registered.

- [ ] **Step 3: Implement carrier capacity, progression, and debt helpers**

Insert these functions before `export const shippingFormatters` in `src/display/shipping.ts`:

```ts
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
    formatLiabilityCapacity(capacity.active_liability, capacity.aggregate_liability_limit, capacity.liability_unlimited),
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
  const debts = recordArray(result.debts);
  if (!isRecord(result.profile) || !isRecord(result.capacity) || !isRecord(result.progression) || !debts) {
    return false;
  }
  emitHeading('Carrier Profile');
  renderCarrierSections(result.profile, result.capacity, result.progression, result);
  renderDebts('Outstanding Debts', debts, 'No outstanding freight debt.');
  return true;
}

function renderDebtPayment(result: Record<string, unknown>): boolean {
  const updated = recordArray(result.updated_debts);
  const outstanding = recordArray(result.outstanding_debts);
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
```

- [ ] **Step 4: Register the remaining five command formatters**

Replace the `shippingFormatters` export with:

```ts
export const shippingFormatters = [
  formatter((result) => renderQuote(result), { commands: ['shipping_quote'] }),
  formatter(
    (result, command) => {
      if (!isRecord(result.contract)) return false;
      renderContract(result.contract, contractTitle(command));
      return true;
    },
    { commands: ['shipping_post', 'shipping_get', 'shipping_accept'] },
  ),
  formatter((result) => renderShippingList(result), { commands: ['shipping_list'] }),
  formatter((result) => renderShippingTrack(result), { commands: ['shipping_track'] }),
  formatter((result) => renderShippingProfile(result), { commands: ['shipping_profile'] }),
  formatter((result) => renderDebtPayment(result), { commands: ['shipping_pay_debt'] }),
  formatter((result, command) => renderSettlement(result, command), {
    commands: ['shipping_deliver', 'shipping_return', 'shipping_cancel'],
  }),
];
```

- [ ] **Step 5: Run focused tests, typecheck, and lint**

Run:

```bash
bunx biome check --write src/display/shipping.ts src/display/shipping.test.ts
bun test src/display/shipping.test.ts
bun run typecheck
bun run lint
```

Expected: all commands PASS. Profile and payment output show capacity/progression/debt sections, settlement zeroes remain visible, and malformed optional values do not leak diagnostic tokens.

- [ ] **Step 6: Commit carrier and settlement output**

```bash
git add src/display/shipping.ts src/display/shipping.test.ts
git commit -m "feat(output): format shipping profiles and settlements"
```

---

### Task 4: Make Explicit Details Schema Comparison Envelope-Aware

**Files:**
- Modify: `src/test-support/fixture-schema-compare.ts:340-535`
- Modify: `src/test-support/output-golden.test.ts:680-735`

**Interfaces:**
- Consumes: `HighValueFixtureEntry['schemaTarget']`, the existing response-schema candidate selection, and mutation fixtures shaped as `{ details, player, ship, cargo }`.
- Produces: private `fixtureValueForExplicitTarget(fixtureValue, explicitTarget): unknown`; explicit `details` comparisons use the nested action response when present and keep accepting existing bare-details fixtures.

- [ ] **Step 1: Add a failing schema-comparison test for a full mutation envelope**

Add this test after the existing `explicit schemaTarget details scores oneOf branches instead of choosing the first branch` test in `src/test-support/output-golden.test.ts`:

```ts
  test('explicit details target unwraps a mutation envelope before schema comparison', () => {
    const spec = responseSpecWithSchemas(
      {
        ShippingDetails: {
          type: 'object',
          additionalProperties: false,
          properties: {
            action: { type: 'string' },
            contract: { type: 'object' },
          },
          required: ['action', 'contract'],
        },
      },
      '#/components/schemas/ShippingDetails',
    );

    const comparison = compareFixtureAgainstResponseCandidates(
      {
        details: { action: 'post', contract: { id: 'shipment-1' } },
        player: { credits: 100 },
        ship: { id: 'ship-1' },
        cargo: [],
      },
      {
        ...sampleContext,
        spec,
        responseSchema: {
          allOf: [
            { $ref: '#/components/schemas/V2GameState' },
            {
              type: 'object',
              properties: {
                details: { $ref: '#/components/schemas/ShippingDetails' },
              },
            },
          ],
        },
        primarySchemaName: 'V2GameState',
        explicitTarget: 'details',
      },
    );

    expect(comparison.comparedAgainst).toBe('details');
    expect(comparison.primarySchemaName).toBe('ShippingDetails');
    expect(comparison.selectionReason).toBe('explicit-target');
    expect(filterBlockingDivergences([comparison])).toEqual([]);
  });
```

- [ ] **Step 2: Run the focused support test and verify the envelope is compared as details**

Run:

```bash
bun test src/test-support/output-golden.test.ts -t 'explicit details target unwraps a mutation envelope'
```

Expected: FAIL because `details`, `player`, `ship`, and `cargo` are reported as extra-in-fixture while `action` and `contract` are reported missing.

- [ ] **Step 3: Add target-aware fixture-value selection**

Add this helper after `candidatesForExplicitTarget` in `src/test-support/fixture-schema-compare.ts`:

```ts
function fixtureValueForExplicitTarget(
  fixtureValue: unknown,
  explicitTarget: HighValueFixtureEntry['schemaTarget'],
): unknown {
  if (
    explicitTarget === 'details' &&
    typeof fixtureValue === 'object' &&
    fixtureValue !== null &&
    !Array.isArray(fixtureValue)
  ) {
    const details = (fixtureValue as Record<string, unknown>).details;
    if (typeof details === 'object' && details !== null && !Array.isArray(details)) return details;
  }
  return fixtureValue;
}
```

In `compareFixtureAgainstResponseCandidates`, replace the explicit-target block with:

```ts
  const explicitCandidates = candidatesForExplicitTarget(candidates, opts.explicitTarget);
  if (explicitCandidates.length > 0) {
    const explicitFixtureValue = fixtureValueForExplicitTarget(fixtureValue, opts.explicitTarget);
    const selected = selectCandidateComparison(
      explicitFixtureValue,
      opts,
      compareCandidates(explicitFixtureValue, opts, explicitCandidates),
      'explicit-target',
    );
    if (selected) return selected;
  }
```

This deliberately changes only explicit details selection. `structuredContent`, discriminator, structural-score, ambiguous, and fallback comparisons continue receiving the original fixture value.

- [ ] **Step 4: Format and run schema-comparison regression tests**

Run:

```bash
bunx biome check --write src/test-support/fixture-schema-compare.ts src/test-support/output-golden.test.ts
bun test src/test-support/output-golden.test.ts
bun run report:fixture-schemas --only refuel,unload_passenger,create_faction
bun run typecheck
```

Expected: all commands PASS. The new envelope test has no blocking divergence, and existing bare `schemaTarget: details` fixtures still select their action schemas without acquiring new blocking divergences.

- [ ] **Step 5: Commit envelope-aware schema comparison**

```bash
git add src/test-support/fixture-schema-compare.ts src/test-support/output-golden.test.ts
git commit -m "test(schema): compare mutation envelope details"
```

---

### Task 5: Schema-Shaped Fixtures and Complete Golden Matrix

**Files:**
- Create: `src/display/shipping.fixtures.ts`
- Modify: `src/display/formatter-fixtures.ts:1-52`
- Create: `src/golden-output/renderer/shipping_*.stdout`
- Create: `src/golden-output/renderer/shipping_*.stderr`

**Interfaces:**
- Consumes: `HighValueFixtureEntry` from `src/display/formatter-fixtures.ts`; all eleven formatter command names from Tasks 1-3; Task 4's envelope-aware explicit-details comparison; cached response schemas in `spacemolt-docs/openapi.json`.
- Produces: `shippingHighValueFixtures: Record<string, HighValueFixtureEntry>` with explicit routes and mutation targets; 44 renderer cases and 88 committed stream files.

- [ ] **Step 1: Add all eleven schema-shaped fixtures**

Create `src/display/shipping.fixtures.ts` with:

```ts
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
```

- [ ] **Step 2: Register the shipping fixture map**

Add this import to `src/display/formatter-fixtures.ts`:

```ts
import { shippingHighValueFixtures } from './shipping.fixtures.ts';
```

Add this re-export with the other fixture re-exports:

```ts
export * from './shipping.fixtures.ts';
```

Insert the map before generic fixtures in `highValueCommandFixtures`:

```ts
  ...notificationsHighValueFixtures,
  ...shippingHighValueFixtures,
  ...genericHighValueFixtures,
```

- [ ] **Step 3: Run schema comparison before generating goldens**

Run:

```bash
bunx biome check --write src/display/shipping.fixtures.ts src/display/formatter-fixtures.ts
bun run report:fixture-schemas --only shipping_
```

Expected: eleven comparisons resolve explicit `/api/v2/spacemolt_shipping/<action>` routes. There are no schema-resolution failures, extra-in-fixture fields, type mismatches, or required-missing divergences. Optional schema fields omitted from a scenario may appear as informational `extra-in-schema` entries.

- [ ] **Step 4: Verify the golden manifest fails because shipping files do not exist yet**

Run:

```bash
bun test src/output-golden.test.ts
```

Expected: FAIL with missing `renderer/shipping_*.stdout` and `.stderr` files. The manifest should require 44 new renderer cases.

- [ ] **Step 5: Generate only the shipping golden files**

Run:

```bash
UPDATE_GOLDENS=1 GOLDEN_ONLY=shipping_ bun test src/output-golden.test.ts
```

Expected: PASS and create exactly 88 files: stdout/stderr pairs for `.table`, `.json`, `.yaml`, and `.compact-json` across eleven fixture labels.

- [ ] **Step 6: Inspect shipping table and machine-output guarantees**

Run:

```bash
rg -n '=== Freight|=== Carrier|=== Posted|=== Accepted' src/golden-output/renderer/shipping_*.table.stdout
rg -n '=== Response ===|undefined|NaN|\[object Object\]' src/golden-output/renderer/shipping_*.table.stdout
rg -n '^  "details":|^details:' src/golden-output/renderer/shipping_{post,accept,pay_debt,deliver,return,cancel}.{json,yaml}.stdout
```

Expected:

- The first command finds all eleven curated table files.
- The second command exits 1 with no matches.
- The third command finds `details` in JSON and YAML for all six mutation fixtures, proving the machine-output envelope is preserved.

Open and read these representative files completely:

```text
src/golden-output/renderer/shipping_quote.table.stdout
src/golden-output/renderer/shipping_list.table.stdout
src/golden-output/renderer/shipping_track.table.stdout
src/golden-output/renderer/shipping_profile.table.stdout
src/golden-output/renderer/shipping_pay_debt.table.stdout
src/golden-output/renderer/shipping_deliver.table.stdout
src/golden-output/renderer/shipping_post.json.stdout
src/golden-output/renderer/shipping_pay_debt.yaml.stdout
```

Confirm field order, labels, actor and route formatting, exact timestamps, `failure_debt`, list eligibility reasons, tracking order, capacity/debt visibility, settlement zeroes, and complete mutation state envelopes match the design.

- [ ] **Step 7: Run strict schema and full repository verification**

Run:

```bash
bun test src/display/shipping.test.ts
bun test src/output-golden.test.ts
STRICT_FIXTURE_SCHEMA_DIVERGENCES=1 bun test src/output-golden.test.ts
bun test
bun run typecheck
bun run lint
bun run build
```

Expected: every command exits 0. Do not refresh `src/test-support/fixture-schema-baseline.json` unless the shipping-only report exposed a legitimate cached-schema or comparison-tool limitation and that exact divergence was reviewed.

- [ ] **Step 8: Verify scope and commit fixtures plus goldens**

Run:

```bash
git status --short
git diff --check
git diff --stat
rg -n 'shipping_(accept|cancel|deliver|get|list|pay_debt|post|profile|quote|return|track)' src/command-overrides*.ts
```

Expected:

- Only `src/display/shipping.fixtures.ts`, `src/display/formatter-fixtures.ts`, and 88 shipping golden files are uncommitted from this task.
- `git diff --check` is silent.
- The command-override search exits 1 with no matches, proving shipping remains generated-only.

Commit:

```bash
git add src/display/shipping.fixtures.ts src/display/formatter-fixtures.ts src/golden-output/renderer/shipping_*
git commit -m "test(output): add shipping golden fixtures"
```

---

## Final Verification Checklist

After all five task commits, run these checks from a clean worktree:

```bash
git status --short
bun run report:fixture-schemas --only shipping_
bun test src/display/shipping.test.ts
bun test src/output-golden.test.ts
STRICT_FIXTURE_SCHEMA_DIVERGENCES=1 bun test src/output-golden.test.ts
bun test
bun run typecheck
bun run lint
bun run build
git log -5 --oneline
```

Expected final state:

- `git status --short` is empty.
- Eleven shipping fixture comparisons resolve their explicit routes and correct direct/details response targets.
- All eleven shipping commands render curated table output without the raw fallback marker.
- All 44 new renderer cases and 88 stream files are present and referenced by the golden manifest.
- Direct and mutation JSON/YAML/compact outputs preserve fixture data unchanged.
- The focused suite, golden suite, strict divergence gate, full tests, typecheck, lint, and build all pass.
- The last five commits correspond to quote/contracts, list/tracking, profile/settlement, envelope-aware schema comparison, and fixtures/goldens.
- No command override or unrelated file changed.
