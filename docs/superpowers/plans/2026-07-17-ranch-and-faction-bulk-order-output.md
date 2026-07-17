# Ranch and Faction Bulk-Order Human Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add stable, human-readable output and exact-schema golden fixtures for wildlife ranch management and faction bulk-order responses while preserving existing single-order and machine-readable output.

**Architecture:** Extend the existing facility presentation in `src/display/social.ts` and commerce presentation in `src/display/market.ts` with command-scoped formatters. Keep all derived rows display-only, validate the core discriminators and required fields before rendering, and decline malformed responses to the existing raw fallback. Register exact OpenAPI fixtures in the matching domain fixture modules so the existing table/JSON/YAML/compact golden matrix and fixture-schema reporter cover every new branch.

**Tech Stack:** Bun 1.3, TypeScript, Bun test, existing `ResultFormatter`/`printCompactTable` display framework, committed output goldens, cached SpaceMolt OpenAPI v0.529.0.

## Global Constraints

- Follow the approved design in `docs/superpowers/specs/2026-07-17-ranch-and-faction-bulk-order-output-design.md`.
- Do not change command parsing, routing, generated API metadata, help, completion, or API request payloads.
- Do not add dependencies or new output modes.
- Register only command-scoped ranch and bulk-order formatters; do not add `shapeFallback: true` to the new formatters.
- Preserve server order for ranch feed/production rows and bulk order results.
- Preserve required numeric zero and boolean false values in human output.
- Never print `NaN`, `undefined`, `[object Object]`, or a misleading partial view.
- Machine-readable JSON, YAML, compact JSON, structured output, jq, fields, and search must serialize the original structured response before table formatting.
- Use only the cached `spacemolt-docs/openapi.json`; do not run `LIVE_API_SYNC=1`.
- Use `UPDATE_GOLDENS=1` only with a targeted `GOLDEN_ONLY` filter.
- Every implementation task follows red-green-refactor and ends in a focused commit.

## File Structure

- Modify `src/display/social.fixtures.ts`: own exact-schema ranch status and cull fixtures plus high-value fixture registration.
- Modify `src/display/social.test.ts`: own focused ranch renderer behavior and malformed-response fallback tests.
- Modify `src/display/social.ts`: own ranch validation, display-only row construction, status dashboard, and cull acknowledgement.
- Modify `src/display/market.fixtures.ts`: align single faction fixtures with `kind: "single"` and add bulk buy/sell mutation fixtures.
- Modify `src/formatter.test.ts`: own faction bulk renderer tests and single-branch regression assertions.
- Modify `src/display/market.ts`: own discriminator-aware bulk faction order validation and presentation.
- Modify `src/test-support/formatter-golden-coverage.ts`: require separate high-value labels for both bulk branches.
- Modify `src/test-support/formatter-golden-coverage.test.ts`: prove the bulk labels remain mandatory.
- Create/update `src/golden-output/renderer/facility_ranch_*`: lock table and machine output for both ranch commands.
- Create/update `src/golden-output/renderer/faction_create_*_order*`: lock both single and bulk response branches.

---

### Task 1: Ranch Status and Cull Human Output

**Files:**
- Modify: `src/display/social.fixtures.ts:1-760`
- Modify: `src/display/social.test.ts:1-310`
- Modify: `src/display/social.ts:1-850`
- Create: `src/golden-output/renderer/facility_ranch_status.table.stdout`
- Create: `src/golden-output/renderer/facility_ranch_status.table.stderr`
- Create: `src/golden-output/renderer/facility_ranch_status.json.stdout`
- Create: `src/golden-output/renderer/facility_ranch_status.json.stderr`
- Create: `src/golden-output/renderer/facility_ranch_status.yaml.stdout`
- Create: `src/golden-output/renderer/facility_ranch_status.yaml.stderr`
- Create: `src/golden-output/renderer/facility_ranch_status.compact-json.stdout`
- Create: `src/golden-output/renderer/facility_ranch_status.compact-json.stderr`
- Create: `src/golden-output/renderer/facility_ranch_set_cull.table.stdout`
- Create: `src/golden-output/renderer/facility_ranch_set_cull.table.stderr`
- Create: `src/golden-output/renderer/facility_ranch_set_cull.json.stdout`
- Create: `src/golden-output/renderer/facility_ranch_set_cull.json.stderr`
- Create: `src/golden-output/renderer/facility_ranch_set_cull.yaml.stdout`
- Create: `src/golden-output/renderer/facility_ranch_set_cull.yaml.stderr`
- Create: `src/golden-output/renderer/facility_ranch_set_cull.compact-json.stdout`
- Create: `src/golden-output/renderer/facility_ranch_set_cull.compact-json.stderr`

**Interfaces:**
- Consumes: `formatter`, `isRecord`, `emitLine`, `c`, and `printCompactTable` from `src/display/helpers.ts`; `renderStructuredResult` from `src/display/index.ts`; `HighValueFixtureEntry` from `src/display/formatter-fixtures.ts`.
- Produces: command-scoped formatters for `facility_ranch_status` and `facility_ranch_set_cull`; exported `ranchStatusFixture` and `ranchSetCullFixture`; high-value labels with explicit API routes and correct schema targets.

- [ ] **Step 1: Add exact-schema fixtures and failing ranch renderer tests**

Add this import at the top of `src/display/social.fixtures.ts`:

```ts
import type { HighValueFixtureEntry } from './formatter-fixtures.ts';
```

Add these fixtures before `socialHighValueFixtures`:

```ts
export const ranchStatusFixture = {
  action: 'ranch_status',
  facility_id: 'ranch-ember-1',
  facility_name: 'Ember Grazer Corral',
  level: 2,
  base_id: 'cinder_outpost',
  base_name: 'Cinder Outpost',
  anchor_poi: 'cinder_iron_belt',
  anchor_name: 'Cinder Iron Belt',
  species: 'ember_grazer',
  species_name: 'Ember Grazer',
  herd: 18,
  capacity: 24,
  range_health: 0.75,
  fed_fraction: 0.5,
  supplies_ok: false,
  cull_target: 0,
  max_cull_per_cycle: 4,
  growth_per_cycle: 1.5,
  wild_population: 12,
  domestication_reserve: 0,
  domestication_active: false,
  feed: [{ resource: 'iron_ore', per_cycle: 2, stocked: 10, cycles_left: 5 }],
  produces: [
    { item: 'grazer_milk', per_cycle: 2.5 },
    { item: 'ember_grazer_meat', per_cycle: 0 },
  ],
  message: 'The herd is healthy, but worker supplies need attention.',
};

export const ranchSetCullFixture = {
  details: {
    action: 'ranch_set_cull',
    facility_id: 'ranch-ember-1',
    cull_target: 0,
    herd: 18,
    message: 'Automatic culling disabled.',
  },
  player: { username: 'Marlowe', credits: 198000 },
  ship: { id: 'ship-wayfarer', name: 'Wayfarer', cargo_used: 0, cargo_capacity: 500 },
  cargo: [],
};
```

Change the declaration to `export const socialHighValueFixtures: Record<string, HighValueFixtureEntry> = {`, then insert these two entries with the other facility fixtures:

```ts
facility_ranch_status: {
  command: 'facility_ranch_status',
  fixture: ranchStatusFixture,
  apiRoute: 'POST /api/v2/spacemolt_facility/ranch_status',
},
facility_ranch_set_cull: {
  command: 'facility_ranch_set_cull',
  fixture: ranchSetCullFixture,
  apiRoute: 'POST /api/v2/spacemolt_facility/ranch_set_cull',
  schemaTarget: 'details',
},
```

Extend the fixture import in `src/display/social.test.ts`:

```ts
import {
  facilityListFixture,
  factionFacilityOwnedFixture,
  forumThreadFixture,
  ranchSetCullFixture,
  ranchStatusFixture,
} from './social.fixtures.ts';
```

Add these tests to `src/display/social.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the ranch tests and verify the red state**

Run:

```bash
bun test src/display/social.test.ts
```

Expected: the new tests fail because output still contains `=== Response ===` and does not contain `=== Wildlife Ranch ===` or `=== Ranch Cull Policy Updated ===`.

- [ ] **Step 3: Implement strict ranch helpers and command-scoped formatters**

Add these helpers near the other display-only helpers in `src/display/social.ts`:

```ts
function ranchString(value: unknown): value is string {
  return typeof value === 'string';
}

function ranchNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function ranchInteger(value: unknown): value is number {
  return ranchNumber(value) && Number.isInteger(value);
}

function ranchFraction(value: unknown): value is number {
  return ranchNumber(value) && value >= 0 && value <= 1;
}

function ranchNamedId(name: string, id: string): string {
  return name === id ? name : `${name} (${id})`;
}

function ranchPercent(value: number): string {
  return `${Number((value * 100).toFixed(1)).toLocaleString()}%`;
}

function ranchRate(value: number): string {
  return Number(value.toFixed(2)).toLocaleString();
}

function ranchCullTarget(value: number): string {
  return value === 0 ? 'disabled (0)' : value.toLocaleString();
}

function isRanchFeed(value: unknown): value is Array<Record<string, unknown>> {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        ranchString(entry.resource) &&
        ranchInteger(entry.per_cycle) &&
        ranchInteger(entry.stocked) &&
        ranchInteger(entry.cycles_left),
    )
  );
}

function isRanchProduction(value: unknown): value is Array<Record<string, unknown>> {
  return (
    Array.isArray(value) &&
    value.every((entry) => isRecord(entry) && ranchString(entry.item) && ranchNumber(entry.per_cycle))
  );
}

function isRanchStatusResponse(result: Record<string, unknown>): boolean {
  return (
    result.action === 'ranch_status' &&
    ranchString(result.facility_id) &&
    ranchString(result.facility_name) &&
    ranchInteger(result.level) &&
    ranchString(result.base_id) &&
    ranchString(result.base_name) &&
    ranchString(result.anchor_poi) &&
    ranchString(result.anchor_name) &&
    ranchString(result.species) &&
    ranchString(result.species_name) &&
    ranchInteger(result.herd) &&
    ranchInteger(result.capacity) &&
    ranchFraction(result.range_health) &&
    ranchFraction(result.fed_fraction) &&
    typeof result.supplies_ok === 'boolean' &&
    ranchInteger(result.cull_target) &&
    ranchInteger(result.max_cull_per_cycle) &&
    ranchNumber(result.growth_per_cycle) &&
    ranchInteger(result.wild_population) &&
    ranchInteger(result.domestication_reserve) &&
    typeof result.domestication_active === 'boolean' &&
    isRanchFeed(result.feed) &&
    ranchString(result.message) &&
    (result.produces === undefined || isRanchProduction(result.produces))
  );
}

function renderRanchStatus(result: Record<string, unknown>): boolean {
  if (!isRanchStatusResponse(result)) return false;

  const feed = result.feed as Array<Record<string, unknown>>;
  const produces = result.produces as Array<Record<string, unknown>> | undefined;
  const facilityName = result.facility_name as string;
  const facilityId = result.facility_id as string;
  const baseName = result.base_name as string;
  const baseId = result.base_id as string;
  const anchorName = result.anchor_name as string;
  const anchorPoi = result.anchor_poi as string;
  const speciesName = result.species_name as string;
  const species = result.species as string;

  emitLine(`\n${c.bright}=== Wildlife Ranch ===${c.reset}`);
  emitLine(`Facility: ${ranchNamedId(facilityName, facilityId)}`);
  emitLine(`Location: ${ranchNamedId(baseName, baseId)}`);
  emitLine(`Habitat: ${ranchNamedId(anchorName, anchorPoi)}`);
  emitLine(`Species: ${ranchNamedId(speciesName, species)}`);
  emitLine(`Level: ${(result.level as number).toLocaleString()}`);
  emitLine(`Herd: ${(result.herd as number).toLocaleString()} / ${(result.capacity as number).toLocaleString()}`);
  emitLine(
    `Range health: ${ranchPercent(result.range_health as number)} | Fed: ${ranchPercent(result.fed_fraction as number)} | Supplies: ${result.supplies_ok ? 'yes' : 'no'}`,
  );
  emitLine(
    `Growth: ${ranchRate(result.growth_per_cycle as number)}/cycle | Cull target: ${ranchCullTarget(result.cull_target as number)} | Cull cap: ${(result.max_cull_per_cycle as number).toLocaleString()}/cycle`,
  );
  emitLine(`Wild population: ${(result.wild_population as number).toLocaleString()}`);
  emitLine(
    `Domestication: ${result.domestication_active ? 'active' : 'inactive'} | Reserve: ${(result.domestication_reserve as number).toLocaleString()}`,
  );
  if ((result.message as string).trim()) emitLine(result.message as string);

  if (feed.length === 0) emitLine('\nNo feed requirements.');
  else {
    printCompactTable('Feed', feed, [
      ['Resource', ['resource']],
      ['Per Cycle', ['per_cycle']],
      ['Stocked', ['stocked']],
      ['Cycles Left', ['cycles_left']],
    ]);
  }

  if (produces !== undefined) {
    if (produces.length === 0) emitLine('\nNo expected ranch products.');
    else {
      printCompactTable('Production', produces, [
        ['Item', ['item']],
        ['Per Cycle', ['per_cycle']],
      ]);
    }
  }
  return true;
}

function renderRanchSetCull(result: Record<string, unknown>): boolean {
  if (
    result.action !== 'ranch_set_cull' ||
    !ranchString(result.facility_id) ||
    !ranchInteger(result.cull_target) ||
    !ranchInteger(result.herd) ||
    !ranchString(result.message)
  ) {
    return false;
  }

  emitLine(`\n${c.bright}=== Ranch Cull Policy Updated ===${c.reset}`);
  emitLine(`Facility: ${result.facility_id}`);
  emitLine(`Current herd: ${result.herd.toLocaleString()}`);
  emitLine(`Cull target: ${ranchCullTarget(result.cull_target)}`);
  if (result.message.trim()) emitLine(result.message);
  return true;
}
```

Add these entries near the facility formatters in `socialFormatters`:

```ts
formatter((result) => renderRanchStatus(result), {
  commands: ['facility_ranch_status'],
}),
formatter((result) => renderRanchSetCull(result), {
  commands: ['facility_ranch_set_cull'],
}),
```

- [ ] **Step 4: Run focused ranch tests and fix only implementation defects**

Run:

```bash
bun test src/display/social.test.ts
```

Expected: all tests in `src/display/social.test.ts` pass, including the four new ranch cases.

- [ ] **Step 5: Generate only the ranch goldens**

Run:

```bash
UPDATE_GOLDENS=1 GOLDEN_ONLY=renderer/facility_ranch_status,renderer/facility_ranch_set_cull bun test src/output-golden.test.ts
```

Expected: the golden test passes and creates 16 ranch files: four renderer modes × stdout/stderr × two fixture labels.

- [ ] **Step 6: Verify ranch schema alignment and formatter coverage**

Run:

```bash
bun run report:fixture-schemas --only facility_ranch_status,facility_ranch_set_cull
bun test src/test-support/formatter-golden-coverage.test.ts src/output-golden.test.ts
```

Expected: both ranch fixtures resolve to their explicit facility routes with no blocking divergence; formatter coverage and the non-update golden run pass.

- [ ] **Step 7: Commit the ranch formatter slice**

```bash
git add src/display/social.ts src/display/social.test.ts src/display/social.fixtures.ts src/golden-output/renderer/facility_ranch_status.* src/golden-output/renderer/facility_ranch_set_cull.*
git commit -m "feat(output): format wildlife ranch responses"
```

### Task 2: Faction Bulk Buy/Sell Order Human Output

**Files:**
- Modify: `src/display/market.fixtures.ts:250-505`
- Modify: `src/formatter.test.ts:2380-2440`
- Modify: `src/display/market.ts:70-535`
- Modify: `src/test-support/formatter-golden-coverage.ts:30-45`
- Modify: `src/test-support/formatter-golden-coverage.test.ts:14-25`
- Create: `src/golden-output/renderer/faction_create_buy_order_bulk.table.stdout`
- Create: `src/golden-output/renderer/faction_create_buy_order_bulk.table.stderr`
- Create: `src/golden-output/renderer/faction_create_buy_order_bulk.json.stdout`
- Create: `src/golden-output/renderer/faction_create_buy_order_bulk.json.stderr`
- Create: `src/golden-output/renderer/faction_create_buy_order_bulk.yaml.stdout`
- Create: `src/golden-output/renderer/faction_create_buy_order_bulk.yaml.stderr`
- Create: `src/golden-output/renderer/faction_create_buy_order_bulk.compact-json.stdout`
- Create: `src/golden-output/renderer/faction_create_buy_order_bulk.compact-json.stderr`
- Create: `src/golden-output/renderer/faction_create_sell_order_bulk.table.stdout`
- Create: `src/golden-output/renderer/faction_create_sell_order_bulk.table.stderr`
- Create: `src/golden-output/renderer/faction_create_sell_order_bulk.json.stdout`
- Create: `src/golden-output/renderer/faction_create_sell_order_bulk.json.stderr`
- Create: `src/golden-output/renderer/faction_create_sell_order_bulk.yaml.stdout`
- Create: `src/golden-output/renderer/faction_create_sell_order_bulk.yaml.stderr`
- Create: `src/golden-output/renderer/faction_create_sell_order_bulk.compact-json.stdout`
- Create: `src/golden-output/renderer/faction_create_sell_order_bulk.compact-json.stderr`
- Update: `src/golden-output/renderer/faction_create_buy_order.json.stdout`
- Update: `src/golden-output/renderer/faction_create_buy_order.yaml.stdout`
- Update: `src/golden-output/renderer/faction_create_buy_order.compact-json.stdout`
- Update: `src/golden-output/renderer/faction_create_sell_order.json.stdout`
- Update: `src/golden-output/renderer/faction_create_sell_order.yaml.stdout`
- Update: `src/golden-output/renderer/faction_create_sell_order.compact-json.stdout`

**Interfaces:**
- Consumes: existing `createOrderSide`, `formatCredits`, `finiteNumber`, `isRecord`, `namedFormatter`, `emitLine`, `c`, and `printCompactTable` in `src/display/market.ts`; `captureStructuredOutput` in `src/formatter.test.ts`; `HighValueFixtureEntry` in `src/display/market.fixtures.ts`.
- Produces: `kind: "bulk"` command-scoped formatter for both faction order commands; exact single and bulk discriminator fixtures; required multi-shape coverage labels.

- [ ] **Step 1: Align single fixtures and add bulk fixtures**

Replace the two existing single faction fixtures with these exact discriminator-aligned versions:

```ts
export const factionCreateBuyOrderFixture = {
  details: {
    action: 'create_buy_order',
    kind: 'single',
    order_id: 'faction-buy-1',
    faction_id: 'faction-1',
    faction_tag: 'MOLT',
    item: 'Nickel Ore',
    item_id: 'nickel_ore',
    quantity: 25,
    price_each: 2,
    quantity_filled: 0,
    quantity_listed: 25,
    total_spent: 0,
    total_escrowed: 50,
    listing_fee: 1,
    message: 'Created faction buy order.',
  },
};

export const factionCreateSellOrderFixture = {
  details: {
    action: 'create_sell_order',
    kind: 'single',
    order_id: 'faction-sell-1',
    faction_id: 'faction-1',
    faction_tag: 'MOLT',
    item: 'Nickel Ore',
    item_id: 'nickel_ore',
    quantity: 25,
    price_each: 4,
    quantity_filled: 10,
    quantity_listed: 15,
    total_earned: 40,
    listing_fee: 2,
    message: 'Created faction sell order.',
  },
};
```

Add these exact-schema bulk fixtures beside them:

```ts
export const factionCreateBuyOrderBulkFixture = {
  details: {
    action: 'faction_create_buy_order',
    mode: 'bulk',
    kind: 'bulk',
    results: [
      {
        index: 0,
        success: true,
        item: 'Nickel Ore',
        item_id: 'nickel_ore',
        quantity: 25,
        price_each: 2,
        quantity_filled: 0,
        quantity_listed: 25,
        total_spent: 0,
        total_escrowed: 50,
        escrow_refunded: 0,
        listing_fee: 1,
        bucket: 'Procurement',
        consolidated: false,
        order_id: 'faction-buy-bulk-1',
        message: 'Created faction buy order.',
      },
      {
        index: 1,
        success: false,
        item: 'Fuel Cell',
        item_id: 'fuel_cell',
        quantity: 100,
        price_each: 20,
        error_code: 'listing_limit_reached',
        error: 'The faction listing limit has been reached.',
      },
    ],
    summary: { total: 2, succeeded: 1, failed: 1 },
  },
  player: { username: 'Marlowe', credits: 198000 },
  ship: { id: 'ship-wayfarer', name: 'Wayfarer', cargo_used: 0, cargo_capacity: 500 },
  cargo: [],
};

export const factionCreateSellOrderBulkFixture = {
  details: {
    action: 'faction_create_sell_order',
    mode: 'bulk',
    kind: 'bulk',
    results: [
      {
        index: 0,
        success: false,
        item: 'Steel Plate',
        item_id: 'steel_plate',
        quantity: 10,
        price_each: 40,
        error_code: 'insufficient_storage',
        error: 'Faction storage does not contain enough Steel Plate.',
      },
      {
        index: 1,
        success: true,
        item: 'Nickel Ore',
        item_id: 'nickel_ore',
        quantity: 25,
        price_each: 4,
        quantity_filled: 10,
        quantity_listed: 15,
        total_earned: 40,
        listing_fee: 2,
        bucket: 'Sales',
        consolidated: true,
        order_id: 'faction-sell-bulk-1',
        message: 'Created faction sell order.',
      },
    ],
    summary: { total: 2, succeeded: 1, failed: 1 },
  },
  player: { username: 'Marlowe', credits: 198040 },
  ship: { id: 'ship-wayfarer', name: 'Wayfarer', cargo_used: 0, cargo_capacity: 500 },
  cargo: [],
};
```

Register the bulk labels in `marketHighValueFixtures`:

```ts
faction_create_buy_order_bulk: {
  command: 'faction_create_buy_order',
  fixture: factionCreateBuyOrderBulkFixture,
  apiRoute: 'POST /api/v2/spacemolt_faction_commerce/create_buy_order',
  schemaTarget: 'details',
},
faction_create_sell_order_bulk: {
  command: 'faction_create_sell_order',
  fixture: factionCreateSellOrderBulkFixture,
  apiRoute: 'POST /api/v2/spacemolt_faction_commerce/create_sell_order',
  schemaTarget: 'details',
},
```

- [ ] **Step 2: Add failing bulk formatter and multi-shape coverage tests**

Add the bulk fixture exports to the existing import from `./display/formatter-fixtures` in `src/formatter.test.ts`:

```ts
factionCreateBuyOrderBulkFixture,
factionCreateSellOrderBulkFixture,
```

Add these tests near the existing faction order tests:

```ts
test('formats faction bulk buy results in server order with mixed outcomes', () => {
  const fixture = structuredClone(factionCreateBuyOrderBulkFixture);
  fixture.details.results[0]!.index = 7;
  fixture.details.results[1]!.index = 3;

  const { stdout, stderr } = captureStructuredOutput('faction_create_buy_order', fixture);

  expect(stderr).toBe('');
  expect(stdout).toContain('=== Faction Buy Orders ===');
  expect(stdout).toContain('2 requested | 1 succeeded | 1 failed');
  expect(stdout).toContain('spent 0 cr; escrow 50 cr; refund 0 cr; fee 1 cr');
  expect(stdout).toContain('Procurement (separate)');
  expect(stdout).toContain('faction-buy-bulk-1');
  expect(stdout).toContain('listing_limit_reached: The faction listing');
  expect(stdout.indexOf('7')).toBeLessThan(stdout.indexOf('3'));
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toMatch(/NaN|undefined|\[object Object\]/);
});

test('formats faction bulk sell financials and consolidated bucket', () => {
  const { stdout, stderr } = captureStructuredOutput(
    'faction_create_sell_order',
    factionCreateSellOrderBulkFixture,
  );

  expect(stderr).toBe('');
  expect(stdout).toContain('=== Faction Sell Orders ===');
  expect(stdout).toContain('earned 40 cr; fee 2 cr');
  expect(stdout).toContain('Sales (consolidated)');
  expect(stdout).toContain('insufficient_storage: Faction storage');
  expect(stdout).not.toContain('spent');
});

test('renders an explicit empty faction bulk result state', () => {
  const fixture = structuredClone(factionCreateBuyOrderBulkFixture);
  fixture.details.results = [];
  fixture.details.summary = { total: 0, succeeded: 0, failed: 0 };

  const { stdout } = captureStructuredOutput('faction_create_buy_order', fixture);

  expect(stdout).toContain('0 requested | 0 succeeded | 0 failed');
  expect(stdout).toContain('No order results.');
});

test('declines malformed faction bulk core fields to raw fallback', () => {
  const fixture = structuredClone(factionCreateBuyOrderBulkFixture) as Record<string, unknown>;
  const details = fixture.details as Record<string, unknown>;
  const results = details.results as Array<Record<string, unknown>>;
  results[0]!.success = 'yes';

  const { stdout } = captureStructuredOutput('faction_create_buy_order', fixture);

  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('=== Faction Buy Orders ===');
});
```

Extend `REQUIRED_HIGH_VALUE_FIXTURE_LABELS` in `src/test-support/formatter-golden-coverage.ts`:

```ts
const REQUIRED_HIGH_VALUE_FIXTURE_LABELS: Record<string, string> = {
  catalog_recipes: 'catalog',
  facility_list_detailed: 'facility_list',
  faction_create_buy_order_bulk: 'faction_create_buy_order',
  faction_create_sell_order_bulk: 'faction_create_sell_order',
};
```

Extend the multi-shape coverage test in `src/test-support/formatter-golden-coverage.test.ts`:

```ts
expect(report.requiredCoverageKeys).toContain('faction_create_buy_order_bulk');
expect(report.highValueFixtureLabels).toContain('faction_create_buy_order_bulk');
expect(report.requiredCoverageKeys).toContain('faction_create_sell_order_bulk');
expect(report.highValueFixtureLabels).toContain('faction_create_sell_order_bulk');
```

- [ ] **Step 3: Run the bulk tests and verify the red state**

Run:

```bash
bun test src/formatter.test.ts src/test-support/formatter-golden-coverage.test.ts
```

Expected: the coverage assertions pass because the labels exist, while the four new formatter tests fail because bulk details still reach `=== Response ===`.

- [ ] **Step 4: Implement the discriminator-aware bulk formatter**

Add these helpers before the market order creation formatter in `src/display/market.ts`:

```ts
function bulkInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

function bulkNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function bulkText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function bulkItem(result: Record<string, unknown>): string {
  const name = bulkText(result.item);
  const id = bulkText(result.item_id);
  if (name && id && name !== id) return `${name} (${id})`;
  return name ?? id ?? '';
}

function bulkFilledListed(result: Record<string, unknown>): string {
  const filled = bulkInteger(result.quantity_filled);
  const listed = bulkInteger(result.quantity_listed);
  if (filled !== undefined && listed !== undefined) return `${filled.toLocaleString()}/${listed.toLocaleString()}`;
  if (filled !== undefined) return `filled ${filled.toLocaleString()}`;
  if (listed !== undefined) return `listed ${listed.toLocaleString()}`;
  return '';
}

function bulkBucket(result: Record<string, unknown>): string {
  const bucket = bulkText(result.bucket) ?? '';
  if (typeof result.consolidated !== 'boolean') return bucket;
  const mode = result.consolidated ? 'consolidated' : 'separate';
  return bucket ? `${bucket} (${mode})` : mode;
}

function bulkFinancial(result: Record<string, unknown>, side: OrderSide): string {
  const parts: string[] = [];
  const add = (label: string, value: unknown) => {
    const amount = bulkNumber(value);
    if (amount !== undefined) parts.push(`${label} ${formatCredits(amount)}`);
  };

  if (side === 'buy') {
    add('spent', result.total_spent);
    add('escrow', result.total_escrowed);
    add('refund', result.escrow_refunded);
  } else {
    add('earned', result.total_earned);
  }
  add('fee', result.listing_fee);
  return parts.join('; ');
}

function bulkOrderOrError(result: Record<string, unknown>): string {
  if (result.success === true) return bulkText(result.order_id) ?? bulkText(result.message) ?? '';

  const code = bulkText(result.error_code);
  const message = bulkText(result.error) ?? bulkText(result.message);
  if (code && message) return `${code}: ${message}`;
  return code ?? message ?? '';
}

function renderFactionBulkOrders(result: Record<string, unknown>, command?: string): boolean {
  const side = createOrderSide(result, command);
  const expectedAction = side === 'buy' ? 'faction_create_buy_order' : 'faction_create_sell_order';
  if (!side || result.kind !== 'bulk' || result.mode !== 'bulk' || result.action !== expectedAction) return false;
  const summary = result.summary;
  const resultsValue = result.results;
  if (!isRecord(summary) || !Array.isArray(resultsValue)) return false;

  const total = bulkInteger(summary.total);
  const succeeded = bulkInteger(summary.succeeded);
  const failed = bulkInteger(summary.failed);
  if (total === undefined || succeeded === undefined || failed === undefined) return false;
  if (
    !resultsValue.every(
      (entry) => isRecord(entry) && bulkInteger(entry.index) !== undefined && typeof entry.success === 'boolean',
    )
  ) {
    return false;
  }

  const results = resultsValue as Array<Record<string, unknown>>;
  const title = side === 'buy' ? 'Faction Buy Orders' : 'Faction Sell Orders';
  emitLine(`\n${c.bright}=== ${title} ===${c.reset}`);
  emitLine(
    `${total.toLocaleString()} requested | ${succeeded.toLocaleString()} succeeded | ${failed.toLocaleString()} failed`,
  );
  if (results.length === 0) {
    emitLine('No order results.');
    return true;
  }

  const rows = results.map((entry) => ({
    index: (entry.index as number).toLocaleString(),
    status: entry.success ? 'created' : 'failed',
    item_display: bulkItem(entry),
    quantity_display: bulkInteger(entry.quantity)?.toLocaleString() ?? '',
    filled_listed: bulkFilledListed(entry),
    price_display: bulkNumber(entry.price_each) === undefined ? '' : formatCredits(entry.price_each as number),
    bucket_display: bulkBucket(entry),
    financial_display: bulkFinancial(entry, side),
    outcome_display: bulkOrderOrError(entry),
  }));

  printCompactTable(
    'Results',
    rows,
    [
      ['#', ['index']],
      ['Status', ['status']],
      ['Item', ['item_display']],
      ['Qty', ['quantity_display']],
      ['Filled/Listed', ['filled_listed']],
      ['Price', ['price_display']],
      ['Bucket', ['bucket_display']],
      ['Financial', ['financial_display']],
      ['Order / Error', ['outcome_display']],
    ],
    { maxCellWidth: 64 },
  );
  return true;
}
```

Register the formatter immediately before `create_market_order`:

```ts
namedFormatter('faction_bulk_orders', ['kind', 'results', 'summary'], renderFactionBulkOrders, {
  commands: ['faction_create_buy_order', 'faction_create_sell_order'],
}),
```

- [ ] **Step 5: Run focused bulk and single-order regression tests**

Run:

```bash
bun test src/formatter.test.ts src/test-support/formatter-golden-coverage.test.ts
```

Expected: all focused tests pass. Existing tests named `formats faction created buy order without sell wording` and `formats faction created sell order with sell wording` continue to pass with the new single discriminator fields.

- [ ] **Step 6: Generate only faction single/bulk order goldens**

Run:

```bash
UPDATE_GOLDENS=1 GOLDEN_ONLY=renderer/faction_create_buy_order,renderer/faction_create_sell_order bun test src/output-golden.test.ts
```

Expected: the golden test passes, creates 16 files for the two new bulk labels, and changes only the JSON/YAML/compact stdout files for the existing single labels to add `kind: "single"`. Existing single table output remains byte-for-byte unchanged.

- [ ] **Step 7: Verify union-schema selection and strict golden coverage**

Run:

```bash
bun run report:fixture-schemas --only faction_create_buy_order,faction_create_sell_order
bun test src/test-support/formatter-golden-coverage.test.ts src/output-golden.test.ts
```

Expected: the reporter selects `kind: "single"` and `kind: "bulk"` branches without blocking divergence; coverage and non-update goldens pass.

- [ ] **Step 8: Commit the faction bulk-order slice**

```bash
git add src/display/market.ts src/display/market.fixtures.ts src/formatter.test.ts src/test-support/formatter-golden-coverage.ts src/test-support/formatter-golden-coverage.test.ts src/golden-output/renderer/faction_create_buy_order* src/golden-output/renderer/faction_create_sell_order*
git commit -m "feat(output): format faction bulk-order responses"
```

### Task 3: Integrated Verification

**Files:**
- Verify only; no source changes expected.

**Interfaces:**
- Consumes: both committed formatter slices and the repository verification commands.
- Produces: fresh evidence that human output, machine output, schema drift, types, lint, and build all remain valid together.

- [ ] **Step 1: Run the focused response-schema report**

```bash
bun run report:fixture-schemas --only facility_ranch_status,facility_ranch_set_cull,faction_create_buy_order,faction_create_sell_order
```

Expected: all six labels—two ranch, two faction single, and two faction bulk—resolve to their intended response schemas with no new blocking divergence.

- [ ] **Step 2: Run strict golden and schema-drift verification**

```bash
STRICT_FIXTURE_SCHEMA_DIVERGENCES=1 bun test src/output-golden.test.ts
```

Expected: all output golden cases pass and the reviewed fixture/schema divergence baseline remains unchanged except for newly covered exact-schema fixtures, which introduce no blocking divergence.

- [ ] **Step 3: Run the complete automated test suite**

```bash
bun test
```

Expected: every test passes with zero failures.

- [ ] **Step 4: Run static and build verification**

```bash
bun run typecheck
bun run lint
bun run build
git diff --check
```

Expected: TypeScript reports no errors; Biome reports no errors or required fixes; the 68-module CLI bundle compiles; `git diff --check` prints nothing.

- [ ] **Step 5: Confirm repository scope and history**

```bash
git status --short
git log -4 --oneline
```

Expected: the working tree is clean and the two newest feature commits are `feat(output): format faction bulk-order responses` and `feat(output): format wildlife ranch responses` above the design/compatibility checkpoints.
