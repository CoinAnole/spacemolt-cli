# SpaceMolt v0.522 Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the CLI's bundled commands, response rendering, fixtures, and OpenAPI validation with gameserver v0.522.0, exposing shipping only through a refreshed dynamic-command cache and without adding curated shipping UX.

**Architecture:** Preserve the current direct-HTTP and dynamic-response architecture. Regenerate request/route metadata mechanically, remove invalid curated routes, add small formatter helpers for current additive response fields, and use OpenAPI discriminators only inside fixture/schema diagnostics; machine-output paths remain untouched.

**Tech Stack:** Bun 1.x, TypeScript, `bun:test`, Biome, existing OpenAPI metadata generator, committed golden-output harness.

## Global Constraints

- Use only committed `spacemolt-docs/openapi.json`; never set `LIVE_API_SYNC=1`.
- Bundle gameserver metadata exactly as `v0.522.0` via `bun run generate:api`; never hand-edit `src/generated/api-commands.ts`.
- Expose the eleven non-help shipping actions only through generated dynamic commands after `spacemolt sync-api` loads a v0.522 cache; keep both GET and POST shipping help records hidden and add no curated shipping overrides, aliases, formatters, or fixtures.
- Remove `facility_disassemble` and `faction_disassemble`; do not silently redirect them.
- Preserve raw server data in JSON, YAML, structured, compact, field, fields, and jq output modes.
- Keep old scalar passenger berth fields only as a renderer fallback; canonical fixtures use nested `berths`.
- Missing or malformed optional display fields must not emit `NaN`, `undefined`, or `[object Object]` and must not crash rendering.
- Fixture schema selection precedence is explicit `schemaTarget`, matching discriminator, structural scoring, then fallback.
- Correct fixtures before refreshing `src/test-support/fixture-schema-baseline.json`.
- Do not modify unrelated local or ignored files.

---

## File Structure

- Modify `src/command-overrides-commerce-facility.ts`: remove obsolete commands and update dismantle copy/cross-references.
- Modify `src/id-cache.ts`: remove resolver rules for deleted commands.
- Regenerate `src/generated/api-commands.ts`: mechanical v0.522 route/request metadata.
- Modify `src/version-sync.test.ts`, `src/args.test.ts`, `src/dynamic-commands.test.ts`: deleted-command and generated-shipping coverage.
- Create `src/display/berths.ts`: shared canonical nested-berth formatter.
- Create `src/display/berths.test.ts`: canonical, zero, absent, and malformed berth tests.
- Modify `src/display/passenger.ts`, `src/display/ship.ts`: consume the berth helper and retain the passenger legacy fallback.
- Modify `src/display/status.ts`: conditionally render trading restrictions and embedded base type.
- Modify `src/display/social.ts`: separate facility type columns and maintenance-level presentation.
- Modify `src/display/generic.test.ts`, `src/display/social.test.ts`, `src/formatter.test.ts`: focused formatter behavior.
- Modify fixture modules under `src/display/*.fixtures.ts`: canonical v0.522 response examples.
- Modify `src/test-support/openapi-schema.ts`: retain discriminator metadata on response candidates.
- Modify `src/test-support/fixture-schema-compare.ts`: prefer matching discriminator branches.
- Modify `src/test-support/openapi-schema.test.ts`, `src/test-support/output-golden.test.ts`: discriminator regression coverage.
- Update affected files under `src/golden-output/renderer/`: intentional canonical fixture and table output changes.
- Update `src/test-support/fixture-schema-baseline.json`: reviewed v0.522 remaining divergence signatures.

---

### Task 1: Synchronize Routes and Remove Obsolete Facility Commands

**Files:**
- Modify: `src/version-sync.test.ts:180-205`
- Modify: `src/args.test.ts:1575-1590`
- Modify: `src/dynamic-commands.test.ts:1-100`
- Modify: `src/api-sync.test.ts:10-25,305-350`
- Modify: `src/command-overrides-commerce-facility.ts:430-470,675-705`
- Modify: `src/id-cache.ts:115-125`
- Regenerate: `src/generated/api-commands.ts`
- Test: `src/api-sync.test.ts`

**Interfaces:**
- Consumes: `generateApiRoutes(spec)`, `buildDynamicCommands(routes, curatedNames, curatedRoutes)`.
- Produces: v0.522 `GENERATED_API_ROUTES`; curated `facility_dismantle` and `faction_dismantle`; generated `shipping_*` commands for eleven non-help actions.

- [ ] **Step 1: Change command-surface tests to require deletion**

In the existing v2 route assertion in `src/version-sync.test.ts`, replace the disassemble expectations with:

```ts
    expect(COMMANDS.facility_disassemble).toBeUndefined();
    expect(COMMANDS.faction_disassemble).toBeUndefined();
    expect(COMMANDS.facility_dismantle?.route).toEqual({
      tool: 'spacemolt_facility',
      action: 'dismantle',
      method: 'POST',
    });
    expect(COMMANDS.faction_dismantle?.route).toEqual({
      tool: 'spacemolt_facility',
      action: 'faction_dismantle',
      method: 'POST',
    });
    expect(COMMANDS.facility_dismantle?.args).toEqual(['facility_id']);
    expect(COMMANDS.faction_dismantle?.args).toEqual(['facility_id']);
```

In `src/args.test.ts`, delete only the two assertions that parse `facility_disassemble` and `faction_disassemble`; retain the dismantle assertions.

- [ ] **Step 2: Add generated shipping exposure coverage**

Import the bundled routes in `src/dynamic-commands.test.ts`:

```ts
import { GENERATED_API_ROUTES } from './generated/api-commands';
```

Add this test inside `describe('dynamic OpenAPI commands', ...)`:

```ts
  test('exposes v0.522 shipping actions but keeps both shipping help routes hidden', () => {
    const shippingRoutes = Object.fromEntries(
      Object.entries(GENERATED_API_ROUTES).filter(([signature]) => signature.includes('/spacemolt_shipping/')),
    );
    const commands = buildDynamicCommands(shippingRoutes, new Set());

    expect(Object.keys(commands).sort()).toEqual([
      'shipping_accept',
      'shipping_cancel',
      'shipping_deliver',
      'shipping_get',
      'shipping_list',
      'shipping_pay_debt',
      'shipping_post',
      'shipping_profile',
      'shipping_quote',
      'shipping_return',
      'shipping_track',
    ]);
    expect(commands.shipping_help).toBeUndefined();
  });
```

- [ ] **Step 3: Run tests to verify the intended failures**

Run:

```bash
bun test src/version-sync.test.ts src/dynamic-commands.test.ts src/api-sync.test.ts
```

Expected: FAIL because disassemble commands still exist, shipping metadata is absent, and generated metadata still reports v0.512.0.

- [ ] **Step 4: Remove obsolete overrides and update dismantle copy**

Delete the complete `facility_disassemble` and `faction_disassemble` override objects. Replace the two surviving dismantle definitions with:

```ts
  facility_dismantle: {
    usage: '<facility_id>',
    description:
      'Dismantle a facility you own, returning 100% of build and upgrade materials in ordinary labeled packages.',
    example: 'spacemolt facility_dismantle facility-1',
    discoverWith: ['facility_owned'],
    seeAlso: ['facility_owned', 'facility_build', 'facility_repair'],
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/dismantle',
    positionals: ['facility_id'],
  },
```

```ts
  faction_dismantle: {
    usage: '<facility_id>',
    description:
      'Dismantle a faction facility, returning 100% of build and upgrade materials to faction storage in ordinary labeled packages.',
    example: 'spacemolt faction_dismantle facility-1',
    discoverWith: ['faction_facility_owned'],
    seeAlso: ['faction_facility_owned', 'faction_build', 'facility_repair'],
    category: 'Facilities',
    apiRoute: 'POST /api/v2/spacemolt_facility/faction_dismantle',
    positionals: ['facility_id'],
  },
```

Remove `facility_disassemble` from `facility_repair.seeAlso` and remove both deleted keys from `COMMAND_ID_RESOLVER_RULES` in `src/id-cache.ts`.

- [ ] **Step 5: Regenerate API metadata**

Run:

```bash
bun run generate:api
```

Expected: `src/generated/api-commands.ts` reports `v0.522.0`, removes the two disassemble routes, and adds 13 shipping route records: eleven non-help actions plus GET and POST `/help` records.

- [ ] **Step 6: Teach API sync to count safe generated fallback coverage**

Import the dynamic builder in `src/api-sync.test.ts`:

```ts
import { buildDynamicCommands } from './dynamic-commands';
```

Replace construction of `mappedRoutes` and `unmappedSpecRoutes` with:

```ts
      const curatedRouteSignatures = new Set(
        Object.values(v2ToolMap).map((mapping) => `${mapping.method} ${mapping.route}`),
      );
      const dynamicCommands = buildDynamicCommands(generate(spec), clientCommands, curatedRouteSignatures);
      const generatedDynamicRoutes = Object.values(dynamicCommands).map(
        (config) => `${config.route.method || 'POST'} ${routeToPath(config.route, { includeApiPrefix: true })}`,
      );
      const mappedRoutes = new Set([
        ...curatedRouteSignatures,
        ...generatedDynamicRoutes,
        ...dynamicStorageRoutes,
      ]);
      const unmappedSpecRoutes = [...v2Routes]
        .filter((route) => !isInfrastructureSpecRoute(route))
        .filter((route) => !mappedRoutes.has(route));
```

This changes the assertion's meaning from “every safe route is curated” to “every safe route is either curated, intentionally unified, or exposed by generated fallback.” Keep the stale-curated-route and unmapped-curated-command assertions unchanged.

- [ ] **Step 7: Verify route, parser, metadata, and formatting**

Run:

```bash
bun test src/version-sync.test.ts src/args.test.ts src/dynamic-commands.test.ts src/api-sync.test.ts
bunx biome check src/command-overrides-commerce-facility.ts src/id-cache.ts src/version-sync.test.ts src/args.test.ts src/dynamic-commands.test.ts
git diff --check
```

Expected: all commands exit 0; API sync reports 8 passing tests and no stale or missing routes.

- [ ] **Step 8: Commit route synchronization**

```bash
git add src/generated/api-commands.ts src/command-overrides-commerce-facility.ts src/id-cache.ts src/version-sync.test.ts src/args.test.ts src/dynamic-commands.test.ts src/api-sync.test.ts
git commit -m "fix(api): sync commands with v0.522"
```

---

### Task 2: Render Canonical Nested Berths

**Files:**
- Create: `src/display/berths.ts`
- Create: `src/display/berths.test.ts`
- Modify: `src/display/passenger.ts:1-20,152-165`
- Modify: `src/display/ship.ts:1-20,185-220`
- Modify: `src/formatter.test.ts:3030-3120`
- Modify: `src/display/passenger.fixtures.ts:1-30`
- Modify: `src/display/ship.fixtures.ts:25-75`
- Update: `src/golden-output/renderer/list_passengers.*`
- Update: `src/golden-output/renderer/get_ship.*`

**Interfaces:**
- Produces: `formatBerthSummary(value: unknown): string | undefined`.
- Consumes later: passenger and ship human-readable formatters only; machine output never calls this helper.

- [ ] **Step 1: Add failing canonical helper tests**

Create `src/display/berths.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { formatBerthSummary } from './berths.ts';

test('formats canonical berth classes in stable order', () => {
  expect(
    formatBerthSummary({
      first: { total: 1, free: 0 },
      economy: { total: 12, free: 10 },
      business: { total: 2, free: 2 },
    }),
  ).toBe('Economy: 10/12 free | Business: 2/2 free | First: 0/1 free');
});

test('preserves zero-capacity classes and rejects malformed entries', () => {
  expect(formatBerthSummary({ economy: { total: 0, free: 0 } })).toBe('Economy: 0/0 free');
  expect(formatBerthSummary({ economy: { total: '12', free: undefined } })).toBeUndefined();
  expect(formatBerthSummary(undefined)).toBeUndefined();
});
```

- [ ] **Step 2: Add failing renderer tests for canonical and legacy shapes**

In the passenger test area of `src/formatter.test.ts`, add:

```ts
  test('passenger and ship renderers show canonical berth availability', () => {
    const passengers = captureStructuredOutput('list_passengers', {
      passengers: [],
      count: 0,
      berths: {
        economy: { total: 12, free: 10 },
        business: { total: 2, free: 2 },
        first: { total: 1, free: 0 },
      },
    });
    const ship = captureStructuredOutput('get_ship', {
      ship: {
        id: 'ship-1',
        name: 'Wayfarer',
        class_id: 'liner',
        berths: { economy: { total: 4, free: 3 } },
      },
      modules: [],
    });

    expect(passengers.stdout).toContain('Economy: 10/12 free | Business: 2/2 free | First: 0/1 free');
    expect(ship.stdout).toContain('Berths: Economy: 3/4 free');
  });

  test('list_passengers retains legacy scalar berth fallback without undefined output', () => {
    const rendered = captureStructuredOutput('list_passengers', {
      passengers: [],
      count: 0,
      economy_berths: '1/2',
      business_berths: '0/1',
      first_berths: '0/0',
    });

    expect(rendered.stdout).toContain('Economy: 1/2 | Business: 0/1 | First: 0/0');
    expect(rendered.stdout).not.toContain('undefined');
    expect(rendered.stdout).not.toContain('NaN');
  });
```

- [ ] **Step 3: Run the focused tests to verify failure**

Run:

```bash
bun test src/display/berths.test.ts src/formatter.test.ts --test-name-pattern 'berth'
```

Expected: FAIL because `berths.ts` does not exist and current renderers ignore nested berth data.

- [ ] **Step 4: Implement the shared canonical helper**

Create `src/display/berths.ts`:

```ts
import { isRecord } from './helpers.ts';

const BERTH_CLASSES = [
  ['economy', 'Economy'],
  ['business', 'Business'],
  ['first', 'First'],
] as const;

function finiteCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function formatBerthSummary(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const parts = BERTH_CLASSES.flatMap(([key, label]) => {
    const counts = value[key];
    if (!isRecord(counts)) return [];
    const total = finiteCount(counts.total);
    const free = finiteCount(counts.free);
    return total === undefined || free === undefined ? [] : [`${label}: ${free}/${total} free`];
  });
  return parts.length ? parts.join(' | ') : undefined;
}
```

- [ ] **Step 5: Wire canonical and legacy berth rendering**

Import `formatBerthSummary` into `src/display/passenger.ts` and replace `berthSummary` with:

```ts
function berthSummary(result: Record<string, unknown>): string {
  const canonical = formatBerthSummary(result.berths);
  if (canonical) return canonical;
  return [
    ['Economy', result.economy_berths],
    ['Business', result.business_berths],
    ['First', result.first_berths],
  ]
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([label, value]) => `${label}: ${value}`)
    .join(' | ');
}
```

Import the same helper into `src/display/ship.ts`. Immediately after the ship slot line, add:

```ts
      const berths = formatBerthSummary(ship.berths);
      if (berths) emitLine(`Berths: ${berths}`);
```

- [ ] **Step 6: Make high-value fixtures canonical**

Replace the scalar berth fields in `listPassengersFixture` with:

```ts
  berths: {
    economy: { total: 2, free: 1 },
    business: { total: 1, free: 0 },
    first: { total: 0, free: 0 },
  },
```

Add this inside `shipFixture.ship`:

```ts
    berths: {
      economy: { total: 4, free: 3 },
      business: { total: 1, free: 1 },
      first: { total: 0, free: 0 },
    },
```

- [ ] **Step 7: Verify focused behavior and update only berth goldens**

Run:

```bash
bun test src/display/berths.test.ts src/formatter.test.ts --test-name-pattern 'berth'
UPDATE_GOLDENS=1 GOLDEN_ONLY=renderer/list_passengers,renderer/get_ship bun test src/output-golden.test.ts
bun test src/output-golden.test.ts
bunx biome check src/display/berths.ts src/display/berths.test.ts src/display/passenger.ts src/display/ship.ts src/display/passenger.fixtures.ts src/display/ship.fixtures.ts
git diff --check
```

Expected: all commands exit 0; table output shows free/total counts and machine goldens contain the nested `berths` object unchanged.

- [ ] **Step 8: Commit berth compatibility**

```bash
git add src/display/berths.ts src/display/berths.test.ts src/display/passenger.ts src/display/ship.ts src/display/passenger.fixtures.ts src/display/ship.fixtures.ts src/formatter.test.ts src/golden-output/renderer/list_passengers.* src/golden-output/renderer/get_ship.*
git commit -m "fix(output): support structured passenger berths"
```

---

### Task 3: Surface Base, Restriction, and Craft Queue Context

**Files:**
- Modify: `src/formatter.test.ts`
- Modify: `src/display/generic.test.ts:330-420`
- Modify: `src/display/status.ts:380-605,770-785`
- Modify: `src/display/ship.ts:230-245`
- Modify: `src/display/status.fixtures.ts`
- Modify: `src/display/ship.fixtures.ts`
- Update: `src/golden-output/renderer/get_status.*`
- Update: `src/golden-output/renderer/get_player.*`
- Update: `src/golden-output/renderer/get_base.*`

**Interfaces:**
- Produces: internal `emitTradingRestriction(player)` helper; no public API.
- Preserves: existing `formatCraftJobStation(job, result)` precedence of job, facility-ID fallback, response location.

- [ ] **Step 1: Add failing trading-restriction and base-type tests**

Add to the relevant formatter describe in `src/formatter.test.ts`:

```ts
  test('renders active trading restrictions and omits the zero timestamp', () => {
    const active = captureStructuredOutput('get_player', {
      player: { username: 'Marlowe', trading_restricted_until: '2026-07-18T12:34:56Z' },
    });
    const zeroFixture = structuredClone(getStatusFixture);
    zeroFixture.player.trading_restricted_until = '0001-01-01T00:00:00Z';
    const zero = captureStructuredOutput('get_status', {
      ...zeroFixture,
    });

    expect(active.stdout).toContain('Trading restricted until: 2026-07-18T12:34:56Z');
    expect(zero.stdout).not.toContain('Trading restricted until');
  });

  test('renders base type in get_base and embedded get_poi base details', () => {
    const base = captureStructuredOutput('get_base', {
      base: { id: 'forward-cache', name: 'Forward Cache', type: 'outpost', empire: '' },
      services: [],
    });
    const poi = captureStructuredOutput('get_poi', {
      kind: 'normal',
      poi: { id: 'cache-poi', name: 'Cache POI', type: 'station', system_id: 'sol' },
      base: { id: 'forward-cache', name: 'Forward Cache', type: 'outpost', empire: '' },
    });

    expect(base.stdout).toContain('Type: outpost');
    expect(poi.stdout).toContain('  Type: outpost');
  });
```

- [ ] **Step 2: Make the craft queue test require direct base fields**

In `renders craft queue station from workshop facility ids`, change the first job to include:

```ts
          base_id: 'nova_terra_central',
          base_name: 'Nova Terra Central',
```

Change its `facility_id` to a value that cannot supply station context:

```ts
          facility_id: 'workshop-job-facility',
```

Replace the station assertion with:

```ts
  expect(stdout).toContain('Nova Terra Central (nova_terra_central)');
```

Keep a separate existing test for the workshop facility-ID fallback.

- [ ] **Step 3: Run focused tests and confirm failure**

Run:

```bash
bun test src/formatter.test.ts src/display/generic.test.ts --test-name-pattern 'trading restrictions|base type|craft queue station'
```

Expected: trading restriction and base type assertions FAIL; direct craft base context should already PASS, proving the current formatter supports v0.515 fields.

- [ ] **Step 4: Add deterministic trading restriction output**

Add near the player helpers in `src/display/status.ts`:

```ts
const ZERO_TRADING_RESTRICTION = '0001-01-01T00:00:00Z';

function emitTradingRestriction(player: Record<string, unknown>): void {
  const value = player.trading_restricted_until;
  if (typeof value !== 'string' || value === '' || value === ZERO_TRADING_RESTRICTION) return;
  emitLine(`Trading restricted until: ${value}`);
}
```

Call `emitTradingRestriction(player)` in the `get_player` formatter after `Home Station`, and call `emitTradingRestriction(p)` in the `get_status` formatter after the faction line.

- [ ] **Step 5: Add conditional base type lines**

In the `get_base` formatter in `src/display/ship.ts`, immediately after ID, add:

```ts
      if (base.type) emitLine(`Type: ${base.type}`);
```

In the embedded base block in `src/display/status.ts`, immediately after the station heading, add:

```ts
        if (base.type) emitLine(`  Type: ${base.type}`);
```

- [ ] **Step 6: Update representative fixtures**

Add the same active value to `getStatusFixture.player` and `playerProfileFixture.player`:

```ts
    trading_restricted_until: '2026-07-18T12:34:56Z',
```

Add this to `baseFixture.base`:

```ts
    type: 'outpost',
```

- [ ] **Step 7: Verify and update targeted goldens**

Run:

```bash
bun test src/formatter.test.ts src/display/generic.test.ts --test-name-pattern 'trading restrictions|base type|craft queue station|workshop facility'
UPDATE_GOLDENS=1 GOLDEN_ONLY=renderer/get_status,renderer/get_player,renderer/get_base bun test src/output-golden.test.ts
bun test src/output-golden.test.ts
bunx biome check src/display/status.ts src/display/ship.ts src/display/status.fixtures.ts src/display/ship.fixtures.ts src/display/generic.test.ts src/formatter.test.ts
git diff --check
```

Expected: all commands exit 0; active timestamps remain exact server strings and base type is omitted when absent.

- [ ] **Step 8: Commit additive state context**

```bash
git add src/display/status.ts src/display/ship.ts src/display/status.fixtures.ts src/display/ship.fixtures.ts src/display/generic.test.ts src/formatter.test.ts src/golden-output/renderer/get_status.* src/golden-output/renderer/get_player.* src/golden-output/renderer/get_base.*
git commit -m "feat(output): show current base and player state fields"
```

---

### Task 4: Separate Facility Type and Maintenance Level

**Files:**
- Modify: `src/display/social.test.ts:1-220`
- Modify: `src/display/social.ts:90-190,705-795`
- Modify: `src/display/social.fixtures.ts:20-250,620-715`
- Update/Create: `src/golden-output/renderer/facility_owned.*`
- Update: `src/golden-output/renderer/facility_list.*`
- Update: `src/golden-output/renderer/facility_list_detailed.*`
- Update: `src/golden-output/renderer/faction_facility_owned.*`

**Interfaces:**
- Produces: internal `formatMaintenanceLevel(value): string | undefined` and `facilityColumns(rows, { grouped?, includeType? })`.
- Preserves: custom-name display and boolean `maintenance_satisfied` fallback.

- [ ] **Step 1: Add failing type-column and maintenance tests**

Add to `src/display/social.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the focused tests to verify failure**

Run:

```bash
bun test src/display/social.test.ts --test-name-pattern 'separate display names|maintenance level'
```

Expected: FAIL because owned tables do not have a separate Type column and maintenance displays booleans only.

- [ ] **Step 3: Implement maintenance-level view models**

Add before `facilityRows` in `src/display/social.ts`:

```ts
function formatMaintenanceLevel(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const percent = value * 100;
  return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(1)}%`;
}
```

Add to each object returned by `facilityRows`:

```ts
      maintenance_level_display: formatMaintenanceLevel(row.maintenance_level),
```

Change the columns helper signature and initial columns to:

```ts
function facilityColumns(
  rows: Array<Record<string, unknown>>,
  options: { grouped?: boolean; includeType?: boolean } = {},
) {
  const columns: Array<[string, string[]]> = [['Name', ['name_display', 'name', 'type_name', 'facility_type', 'type']]];
  if (options.includeType) columns.push(['Type', ['type', 'facility_type', 'type_id']]);
  columns.push(['ID', ['facility_id', 'id', 'type_id']], ['Level', ['level', 'tier']]);
```

Replace the grouped maintenance condition with:

```ts
  if (options.grouped && hasAnyField(rows, ['maintenance_level_display', 'maintenance_satisfied'])) {
    columns.push(['Maint', ['maintenance_level_display', 'maintenance_satisfied']]);
  }
```

- [ ] **Step 4: Enable Type only for owned tables**

Change the flat facilities formatter callback to accept `command` and pass:

```ts
      printCompactTable(
        'Facilities',
        rows,
        facilityColumns(rows, { includeType: commandNameEquals(command, 'facility_owned') }),
      );
```

In `faction_facility_owned`, insert this entry immediately after Name:

```ts
        ['Type', ['type']],
```

- [ ] **Step 5: Add canonical owned and partial-maintenance fixtures**

Add `facilityOwnedFixture` to `src/display/social.fixtures.ts`:

```ts
export const facilityOwnedFixture = {
  action: 'owned',
  facilities: [
    {
      facility_id: 'player-refinery',
      type: 'ore_refinery',
      name: 'Ore Refinery',
      custom_name: 'Frontier Smelter',
      base_id: 'earth_station',
      base_name: 'Earth Station',
      rent_per_cycle: 120,
    },
  ],
  rent: { facilities: 1, total_rent_per_cycle: 120, est_rent_per_day: 720 },
};
```

Add it to both fixture registries:

```ts
  facility_owned: { command: 'facility_owned', fixture: facilityOwnedFixture },
```

Add representative values to `facilityListFixture.station_facilities`: `maintenance_level: 1` on the fully supplied first entry and `maintenance_level: 0.6` on the partially supplied depot. Add `maintenance_level: 1` to the station entry in `facilityListSimpleFixture`.

- [ ] **Step 6: Verify and update only facility goldens**

Run:

```bash
bun test src/display/social.test.ts --test-name-pattern 'facility'
UPDATE_GOLDENS=1 GOLDEN_ONLY=renderer/facility_owned,renderer/facility_list,renderer/faction_facility_owned bun test src/output-golden.test.ts
bun test src/output-golden.test.ts
bunx biome check src/display/social.ts src/display/social.test.ts src/display/social.fixtures.ts
git diff --check
```

Expected: all commands exit 0; the new `facility_owned` case creates eight committed stdout/stderr files across four formats, Type follows Name, and `60%` appears for partial maintenance.

- [ ] **Step 7: Commit facility presentation**

```bash
git add src/display/social.ts src/display/social.test.ts src/display/social.fixtures.ts src/golden-output/renderer/facility_owned.* src/golden-output/renderer/facility_list.* src/golden-output/renderer/facility_list_detailed.* src/golden-output/renderer/faction_facility_owned.*
git commit -m "feat(output): show facility type and maintenance level"
```

---

### Task 5: Prefer OpenAPI Discriminator Branches

**Files:**
- Modify: `src/test-support/openapi-schema.test.ts`
- Modify: `src/test-support/output-golden.test.ts`
- Modify: `src/test-support/openapi-schema.ts:3-40,120-210`
- Modify: `src/test-support/fixture-schema-compare.ts:15-30,320-465`

**Interfaces:**
- Produces: `JsonSchema.discriminator?: OpenApiDiscriminator`.
- Produces: `OpenApiSchemaCandidate.discriminator?: { propertyName: string; value: string }`.
- Extends: `FixtureSchemaSelectionReason` with `'discriminator'`.
- Preserves: `buildResponseSchemaCandidates(...)` and `compareFixtureAgainstResponseCandidates(...)` public signatures.

- [ ] **Step 1: Add failing response-candidate metadata test**

Extend `makeSpec()` in `src/test-support/openapi-schema.test.ts` with:

```ts
        DiscriminatedResponse: {
          discriminator: {
            propertyName: 'kind',
            mapping: {
              alpha: '#/components/schemas/AlphaResponse',
              beta: '#/components/schemas/BetaResponse',
            },
          },
          oneOf: [
            { $ref: '#/components/schemas/AlphaResponse' },
            { $ref: '#/components/schemas/BetaResponse' },
          ],
        },
        AlphaResponse: { type: 'object', properties: { kind: { type: 'string' }, alpha: { type: 'string' } } },
        BetaResponse: { type: 'object', properties: { kind: { type: 'string' }, beta: { type: 'string' } } },
```

Add:

```ts
  test('buildResponseSchemaCandidates retains discriminator values for mapped branches', () => {
    const spec = makeSpec();
    const candidates = buildResponseSchemaCandidates(spec, { $ref: '#/components/schemas/DiscriminatedResponse' });

    expect(candidates.map((candidate) => [candidate.primarySchemaName, candidate.discriminator])).toEqual([
      ['AlphaResponse', { propertyName: 'kind', value: 'alpha' }],
      ['BetaResponse', { propertyName: 'kind', value: 'beta' }],
    ]);
  });
```

- [ ] **Step 2: Add failing discriminator selection and fallback tests**

In `src/test-support/output-golden.test.ts`, add this helper near `responseSpecWithSchemas`:

```ts
function discriminatedResponseSpec(): OpenApiSpec {
  return {
    paths: {},
    components: {
      schemas: {
        CommandResponse: {
          discriminator: {
            propertyName: 'kind',
            mapping: {
              alpha: '#/components/schemas/AlphaResponse',
              beta: '#/components/schemas/BetaResponse',
            },
          },
          oneOf: [
            { $ref: '#/components/schemas/AlphaResponse' },
            { $ref: '#/components/schemas/BetaResponse' },
          ],
        },
        AlphaResponse: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { type: 'string' },
            alpha: { type: 'string' },
            beta: { type: 'string' },
          },
        },
        BetaResponse: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { type: 'string' },
            beta: { type: 'string' },
          },
        },
      },
    },
  };
}
```

Then add:

```ts
  test('schema comparison prefers the fixture discriminator over a structurally cheaper branch', () => {
    const spec = discriminatedResponseSpec();
    const comparison = compareFixtureAgainstResponseCandidates(
      { kind: 'beta', alpha: 'structurally misleading', beta: 'selected' },
      {
        ...sampleContext,
        spec,
        responseSchema: { $ref: '#/components/schemas/CommandResponse' },
      },
    );

    expect(comparison.primarySchemaName).toBe('BetaResponse');
    expect(comparison.selectionReason).toBe('discriminator');
  });

  test('schema comparison falls back to structural scoring for an unknown discriminator value', () => {
    const spec = discriminatedResponseSpec();
    const comparison = compareFixtureAgainstResponseCandidates(
      { kind: 'unknown', alpha: 'selected structurally' },
      {
        ...sampleContext,
        spec,
        responseSchema: { $ref: '#/components/schemas/CommandResponse' },
      },
    );

    expect(comparison.primarySchemaName).toBe('AlphaResponse');
    expect(comparison.selectionReason).toBe('best-score');
  });
```

- [ ] **Step 3: Run tests and verify discriminator support is absent**

Run:

```bash
bun test src/test-support/openapi-schema.test.ts src/test-support/output-golden.test.ts --test-name-pattern 'discriminator'
```

Expected: FAIL because discriminator properties are not typed, retained, or used for selection.

- [ ] **Step 4: Extend schema and candidate types**

Add to `src/test-support/openapi-schema.ts`:

```ts
export interface OpenApiDiscriminator {
  propertyName: string;
  mapping?: Record<string, string>;
}
```

Add `discriminator?: OpenApiDiscriminator` to `JsonSchema`, and add this to `OpenApiSchemaCandidate`:

```ts
  discriminator?: { propertyName: string; value: string };
```

- [ ] **Step 5: Annotate expanded mapped branches**

Add this helper near `expandBranchCandidates`:

```ts
function mappedDiscriminator(
  schema: JsonSchema,
  branch: JsonSchema,
): OpenApiSchemaCandidate['discriminator'] | undefined {
  const discriminator = schema.discriminator;
  if (!discriminator?.mapping || !branch.$ref) return undefined;
  const value = Object.entries(discriminator.mapping).find(([, ref]) => ref === branch.$ref)?.[0];
  return value ? { propertyName: discriminator.propertyName, value } : undefined;
}
```

When recursing into each union branch in `expandBranchCandidates`, add:

```ts
        discriminator: mappedDiscriminator(effective, branch) ?? candidate.discriminator,
```

Include the discriminator property in the candidate uniqueness key so differently tagged candidates cannot collapse:

```ts
    const tag = candidate.discriminator
      ? `${candidate.discriminator.propertyName}=${candidate.discriminator.value}`
      : '';
    unique.set(`${candidate.label}:${candidate.primarySchemaName ?? ''}:${tag}`, candidate);
```

- [ ] **Step 6: Select discriminator candidates before structural scoring**

Extend the selection reason union in `src/test-support/fixture-schema-compare.ts`:

```ts
export type FixtureSchemaSelectionReason =
  | 'explicit-target'
  | 'discriminator'
  | 'best-score'
  | 'ambiguous'
  | 'fallback';
```

Add:

```ts
function candidatesForDiscriminator(
  fixtureValue: unknown,
  candidates: OpenApiSchemaCandidate[],
): OpenApiSchemaCandidate[] {
  if (!fixtureValue || typeof fixtureValue !== 'object' || Array.isArray(fixtureValue)) return [];
  const fixture = fixtureValue as Record<string, unknown>;
  return candidates.filter((candidate) => {
    const discriminator = candidate.discriminator;
    return discriminator !== undefined && fixture[discriminator.propertyName] === discriminator.value;
  });
}
```

Replace the selection tail of `compareFixtureAgainstResponseCandidates` with this precedence:

```ts
  const explicitCandidates = candidatesForExplicitTarget(candidates, opts.explicitTarget);
  if (explicitCandidates.length > 0) {
    const selected = selectCandidateComparison(
      fixtureValue,
      opts,
      compareCandidates(fixtureValue, opts, explicitCandidates),
      'explicit-target',
    );
    if (selected) return selected;
  }

  const discriminatorCandidates = candidatesForDiscriminator(fixtureValue, candidates);
  if (discriminatorCandidates.length > 0) {
    const selected = selectCandidateComparison(
      fixtureValue,
      opts,
      compareCandidates(fixtureValue, opts, discriminatorCandidates),
      'discriminator',
    );
    if (selected) return selected;
  }

  return (
    selectCandidateComparison(fixtureValue, opts, compareCandidates(fixtureValue, opts, candidates), 'best-score') ??
    fallbackComparison(fixtureValue, opts, fallbackCandidate)
  );
```

- [ ] **Step 7: Verify schema selection**

Run:

```bash
bun test src/test-support/openapi-schema.test.ts src/test-support/output-golden.test.ts
bunx biome check src/test-support/openapi-schema.ts src/test-support/openapi-schema.test.ts src/test-support/fixture-schema-compare.ts src/test-support/output-golden.test.ts
git diff --check
```

Expected: all commands exit 0; mapped tags report `selectionReason: 'discriminator'`, unknown tags report `best-score`, and existing explicit-target tests remain green.

- [ ] **Step 8: Commit discriminator-aware validation**

```bash
git add src/test-support/openapi-schema.ts src/test-support/openapi-schema.test.ts src/test-support/fixture-schema-compare.ts src/test-support/output-golden.test.ts
git commit -m "test(openapi): select response branches by discriminator"
```

---

### Task 6: Align Canonical Fixtures, Goldens, and Schema Baseline

**Files:**
- Modify: `src/display/social.fixtures.ts`
- Modify: `src/display/status.fixtures.ts`
- Modify: `src/display/market.fixtures.ts`
- Modify: `src/display/passenger.fixtures.ts`
- Update: affected `src/golden-output/renderer/*.{stdout,stderr}`
- Update: `src/test-support/fixture-schema-baseline.json`

**Interfaces:**
- Consumes: discriminator selection from Task 5 and canonical formatter fixtures from Tasks 2-4.
- Produces: reviewed v0.522 fixture/schema baseline with no newly blessed berth or discriminator mismatch.

- [ ] **Step 1: Record the pre-fix strict failure**

Run:

```bash
STRICT_FIXTURE_SCHEMA_DIVERGENCES=1 bun test src/output-golden.test.ts
```

Expected: FAIL with added signatures for missing `kind`/`action` and old passenger berth fields if Task 2 is not reflected correctly.

- [ ] **Step 2: Complete the facility-types discovery fixture**

Add these fields to `facilityTypesFixture` in `src/display/social.fixtures.ts`:

```ts
  action: 'types',
  kind: 'discovery',
  filters: { category: '', name: '', level: '' },
  pagination: { page: '1', per_page: '20' },
```

This removes the existing reviewed omissions for `action`, `filters`, and `pagination` as well as the new `kind` omission.

- [ ] **Step 3: Add current action and kind tags to state/storage fixtures**

Add to `systemInfoFixture` in `src/display/status.fixtures.ts`:

```ts
  action: 'get_system',
  kind: 'normal',
```

Add to `poiInfoFixture`:

```ts
  kind: 'normal',
```

Add to `storageFixture` in `src/display/market.fixtures.ts`:

```ts
  action: 'view',
```

- [ ] **Step 4: Tag passenger unload variants**

Add these literal fields in `src/display/passenger.fixtures.ts`:

```ts
// unloadPassengerBulkFixture
kind: 'all',

// unloadPassengerTransferFixture
kind: 'transfer',

// unloadPassengerLoungeFixture
kind: 'lounge_checkin',
```

- [ ] **Step 5: Run the focused schema report before updating goldens**

Run:

```bash
bun run report:fixture-schemas --only facility_types,get_system,get_poi,storage,list_passengers,unload_passenger
```

Expected: no extra-in-fixture berth fields and no required-missing divergence for the newly added `action` or `kind` fields. Existing intentionally partial fields such as `resources[0].remaining_display` may remain.

- [ ] **Step 6: Update and inspect only affected golden families**

Run:

```bash
UPDATE_GOLDENS=1 GOLDEN_ONLY=renderer/facility_types,renderer/get_system,renderer/get_poi,renderer/storage,renderer/storage_view,renderer/unload_passenger bun test src/output-golden.test.ts
git diff -- src/golden-output/renderer
bun test src/output-golden.test.ts
```

Expected: golden update and test commands exit 0; JSON/YAML/compact outputs preserve the added tags and table output does not fall back to `=== Response ===`.

- [ ] **Step 7: Refresh the reviewed v0.522 baseline last**

Run:

```bash
bun run report:fixture-schemas --update-baseline
STRICT_FIXTURE_SCHEMA_DIVERGENCES=1 bun test src/output-golden.test.ts
```

Expected: baseline `generatedAtGameserver` is `v0.522.0`; strict output-golden tests pass with no newly accepted berth or discriminator signatures.

- [ ] **Step 8: Verify fixture formatting and commit alignment**

Run:

```bash
bunx biome check src/display/social.fixtures.ts src/display/status.fixtures.ts src/display/market.fixtures.ts src/display/passenger.fixtures.ts
git diff --check
```

Then commit:

```bash
git add src/display/social.fixtures.ts src/display/status.fixtures.ts src/display/market.fixtures.ts src/display/passenger.fixtures.ts src/golden-output/renderer src/test-support/fixture-schema-baseline.json
git commit -m "test(fixtures): align responses with v0.522"
```

---

### Task 7: Run Release-Level Verification

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: all prior task commits.
- Produces: evidence that cached-spec sync, output stability, strict schema drift, types, lint, and build are release-ready.

- [ ] **Step 1: Run focused contract reports**

Run:

```bash
bun test src/api-sync.test.ts
bun run report:fixture-schemas
bun run report:curated-commands
```

Expected: API sync exits 0; fixture report has no new berth/discriminator blocking drift; curated report has no missing-generated-route result for a surviving curated command. Both reports remain informational.

- [ ] **Step 2: Run strict golden verification**

Run:

```bash
bun test src/output-golden.test.ts
STRICT_FIXTURE_SCHEMA_DIVERGENCES=1 bun test src/output-golden.test.ts
```

Expected: both commands exit 0; all active golden files are referenced and all stdout/stderr guardrails pass.

- [ ] **Step 3: Run the complete test suite**

Run:

```bash
bun test
```

Expected: exit 0 with zero failing tests.

- [ ] **Step 4: Run type, lint, and build checks**

Run:

```bash
bun run typecheck
bun run lint
bun run build
```

Expected in a clean checkout: all commands exit 0. If the shared workspace still contains the known ignored `docs/_phase5c_run_verify.ts` scratch file, do not modify or commit it; report that pre-existing local-only typecheck error separately and verify all tracked changes through the remaining commands.

- [ ] **Step 5: Audit final scope and history**

Run:

```bash
git status --short
git log --oneline --decorate -8
git diff HEAD~6..HEAD --stat
git diff HEAD~6..HEAD -- src/command-overrides-commerce-facility.ts src/display src/test-support
```

Expected: worktree clean; commits correspond to the six implementation tasks; no curated shipping override or formatter exists; no unrelated file is changed.

- [ ] **Step 6: Prepare completion handoff**

Summarize:

- removed commands and replacement dismantle semantics
- generated v0.522 metadata and generated-only shipping exposure
- canonical berth and additive human-output fields
- discriminator-aware schema validation and reviewed baseline
- exact verification commands and outcomes
- any pre-existing workspace-only typecheck limitation

Do not create an additional commit when Step 5 is clean.
