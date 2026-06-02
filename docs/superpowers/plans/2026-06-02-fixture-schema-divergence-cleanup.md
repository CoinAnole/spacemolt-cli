# Fixture Schema Divergence Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the approved fixture/schema divergences for stale high-value entries, `get_wrecks`, `view_market`, and `view_orders`.

**Architecture:** Keep this fixture-first and tightly scoped. Remove stale high-value API fixtures that cannot resolve to current OpenAPI routes, update the remaining high-value fixtures to schema-current response shapes, add one targeted `get_wrecks` formatter compatibility update so human output stays useful, then regenerate affected golden files and the reviewed divergence baseline.

**Tech Stack:** Bun test runner, TypeScript fixtures and display formatters, local OpenAPI cache at `spacemolt-docs/openapi.json`, committed golden files under `src/golden-output/`.

---

## File Structure

- Modify `src/display/social.fixtures.ts` to remove `facility_get` from `socialHighValueFixtures` while preserving renderer-only fixture coverage.
- Modify `src/display/market.fixtures.ts` to remove `faction_trade_intel` from `marketHighValueFixtures`, expand `viewMarketFixture`, and expand `marketOrdersFixture`.
- Modify `src/display/ship.fixtures.ts` to replace `wrecksFixture` with a schema-current `GetWrecksResponse` example.
- Modify `src/display/ship.ts` with a small `get_wrecks` formatter compatibility update for schema-current wreck fields.
- Delete orphaned golden files under `src/golden-output/renderer/` for high-value fixtures removed from the renderer matrix.
- Update golden files under `src/golden-output/renderer/` for `get_wrecks`, `view_market`, and `view_orders`.
- Update `src/test-support/fixture-schema-baseline.json` after reviewing the reduced divergence report.

## Task 1: Remove Stale High-Value Fixtures

**Files:**
- Modify: `src/display/social.fixtures.ts`
- Modify: `src/display/market.fixtures.ts`
- Delete: `src/golden-output/renderer/facility_get.*`
- Delete: `src/golden-output/renderer/faction_trade_intel.*`

- [ ] **Step 1: Run the focused reporter and confirm the current failure**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH bun run report:fixture-schemas --only facility_get,faction_trade_intel
```

Expected: report includes schema resolution failures for `facility_get` and `faction_trade_intel`.

- [ ] **Step 2: Remove `facility_get` from high-value schema coverage**

In `src/display/social.fixtures.ts`, replace the `socialHighValueFixtures` block with:

```ts
export const socialHighValueFixtures = {
  chat: { command: 'chat', fixture: chatSentFixture },
  facility_list: { command: 'facility_list', fixture: facilitiesFixture },
  facility_list_detailed: { command: 'facility_list', fixture: facilityListFixture },
  fleet_status: { command: 'fleet_status', fixture: fleetFixture },
  get_battle_status: { command: 'get_battle_status', fixture: battleStatusFixture },
  facility_types: { command: 'facility_types', fixture: facilityTypesFixture },
  captains_log_get: { command: 'captains_log_get', fixture: captainLogGetFixture },
  read_note: { command: 'read_note', fixture: readNoteFixture },
  faction_visit_room: { command: 'faction_visit_room', fixture: factionVisitRoomFixture },
  faction_get_invites: { command: 'faction_get_invites', fixture: factionInvitesFixture },
  faction_intel_status: { command: 'faction_intel_status', fixture: factionIntelStatusFixture },
  faction_trade_intel_status: { command: 'faction_trade_intel_status', fixture: factionTradeIntelStatusFixture },
  forum_get_thread: { command: 'forum_get_thread', fixture: forumThreadFixture },
  get_guide: { command: 'get_guide', fixture: guideFixture },
  get_guide_list: { command: 'get_guide', fixture: guideListFixture },
};
```

Keep `facility: { command: 'facility_get', fixture: facilityFixture }` in `socialFixtureCases`; that renderer-only case is not schema compared.

- [ ] **Step 3: Remove `faction_trade_intel` from high-value schema coverage**

In `src/display/market.fixtures.ts`, replace the `marketHighValueFixtures` block with:

```ts
export const marketHighValueFixtures = {
  browse_ships: { command: 'browse_ships', fixture: browseShipsFixture },
  create_sell_order: { command: 'create_sell_order', fixture: createSellOrderFixture },
  view_market: { command: 'view_market', fixture: viewMarketFixture },
  storage: { command: 'storage', fixture: storageFixture },
  view_orders: { command: 'view_orders', fixture: marketOrdersFixture },
  commission_status: { command: 'commission_status', fixture: commissionStatusFixture },
  commission_status_empty: { command: 'commission_status', fixture: emptyCommissionStatusFixture },
  view_storage: { command: 'view_storage', fixture: storageFixture },
  faction_query_trade_intel: { command: 'faction_query_trade_intel', fixture: intelFixture },
  get_trades: { command: 'get_trades', fixture: marketListingsFixture },
};
```

Keep `intel: { command: 'faction_trade_intel', fixture: intelFixture }` in `marketFixtureCases`; that renderer-only alias coverage remains separate from high-value schema comparison.

- [ ] **Step 4: Delete orphaned golden files for removed high-value entries**

Run:

```bash
git rm \
  src/golden-output/renderer/facility_get.compact-json.stderr \
  src/golden-output/renderer/facility_get.compact-json.stdout \
  src/golden-output/renderer/facility_get.json.stderr \
  src/golden-output/renderer/facility_get.json.stdout \
  src/golden-output/renderer/facility_get.table.stderr \
  src/golden-output/renderer/facility_get.table.stdout \
  src/golden-output/renderer/facility_get.yaml.stderr \
  src/golden-output/renderer/facility_get.yaml.stdout \
  src/golden-output/renderer/faction_trade_intel.compact-json.stderr \
  src/golden-output/renderer/faction_trade_intel.compact-json.stdout \
  src/golden-output/renderer/faction_trade_intel.json.stderr \
  src/golden-output/renderer/faction_trade_intel.json.stdout \
  src/golden-output/renderer/faction_trade_intel.table.stderr \
  src/golden-output/renderer/faction_trade_intel.table.stdout \
  src/golden-output/renderer/faction_trade_intel.yaml.stderr \
  src/golden-output/renderer/faction_trade_intel.yaml.stdout
```

- [ ] **Step 5: Verify stale route failures are gone**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH bun run report:fixture-schemas --only facility_get,faction_trade_intel
```

Expected: no `schema resolution failed` sections for `facility_get` or `faction_trade_intel`. The report may still include `faction_trade_intel_status` because the filter is substring-based.

- [ ] **Step 6: Verify the golden manifest after deleting stale files**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH bun test src/output-golden.test.ts
```

Expected: PASS. This step proves the removed high-value entries no longer leave unexpected golden files behind.

- [ ] **Step 7: Commit stale fixture removal**

Run:

```bash
git add src/display/social.fixtures.ts src/display/market.fixtures.ts src/golden-output/renderer
git commit -m "test: remove stale high-value schema fixtures"
```

## Task 2: Update `get_wrecks` Fixture and Formatter

**Files:**
- Modify: `src/display/ship.fixtures.ts`
- Modify: `src/display/ship.ts`
- Update: `src/golden-output/renderer/get_wrecks.*`

- [ ] **Step 1: Confirm current `get_wrecks` divergence**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH bun run report:fixture-schemas --only get_wrecks
```

Expected: report includes `wrecks[0].wreck_id`, `wrecks[0].ticks_remaining`, `wrecks[0].items`, and missing required `GetWrecksResponse` fields.

- [ ] **Step 2: Replace `wrecksFixture` with a schema-current shape**

In `src/display/ship.fixtures.ts`, replace `wrecksFixture` with:

```ts
export const wrecksFixture = {
  count: 1,
  wrecks: [
    {
      id: 'wreck-1',
      type: 'ship',
      poi_id: 'sol_asteroid_belt',
      system_id: 'sol',
      ship_class: 'skiff',
      ship_name: 'Lucky Strike',
      victim_id: 'player-ibis',
      victim_name: 'Ibis',
      cargo: [{ item_id: 'ore_iron', name: 'Iron Ore', quantity: 10, size: 1 }],
      modules: [
        {
          id: 'module-1',
          type_id: 'pulse_laser_i',
          name: 'Pulse Laser I',
          type: 'weapon',
          wear: 0.2,
        },
      ],
      salvage_value: 1250,
      created_at: '2026-05-29T00:00:00Z',
      expires_at: '2026-05-29T01:00:00Z',
      expire_tick: 12050,
    },
  ],
};
```

- [ ] **Step 3: Update the `get_wrecks` formatter for schema-current fields**

In `src/display/ship.ts`, replace the `// Wrecks` formatter block with:

```ts
  // Wrecks
  formatter(
    (r) => {
      if (!Array.isArray(r.wrecks)) return false;
      const wrecks = r.wrecks as Array<Record<string, unknown>>;
      emitLine(`\n${c.bright}=== Wrecks at POI ===${c.reset}`);
      if (!wrecks.length) {
        emitLine(`(No wrecks at this location)`);
      } else {
        for (const w of wrecks) {
          const wreckId = w.id || w.wreck_id || 'unknown';
          const ship = [w.ship_name, w.ship_class].filter(Boolean).join(' / ') || 'unknown';
          const victim = w.victim_name ? ` (${w.victim_name})` : '';
          const cargo = Array.isArray(w.cargo)
            ? (w.cargo as Array<Record<string, unknown>>)
            : ((w.items as Array<Record<string, unknown>>) || []);
          const modules = Array.isArray(w.modules) ? (w.modules as Array<Record<string, unknown>>) : [];

          emitLine(`\n${c.yellow}Wreck: ${wreckId}${c.reset}`);
          emitLine(`  Ship: ${ship}${victim}`);
          if (w.salvage_value !== undefined) emitLine(`  Salvage value: ${w.salvage_value}`);
          if (w.expire_tick !== undefined) {
            emitLine(`  Expires tick: ${w.expire_tick}`);
          } else if (w.ticks_remaining !== undefined) {
            emitLine(`  Expires in: ${w.ticks_remaining} ticks`);
          }
          if (w.expires_at !== undefined) emitLine(`  Expires at: ${w.expires_at}`);
          if (cargo.length) {
            emitLine(`  Cargo:`);
            for (const item of cargo) {
              const itemName = item.name || item.item_id || '?';
              emitLine(`    - ${item.quantity ?? '?'}x ${itemName}`);
            }
          }
          if (modules.length) {
            emitLine(`  Modules:`);
            for (const module of modules) {
              const moduleName = module.name || module.type_id || module.id || '?';
              emitLine(`    - ${moduleName}`);
            }
          }
        }
      }
      return true;
    },
    { commands: ['get_wrecks'], shapeFallback: true },
  ),
```

- [ ] **Step 4: Verify `get_wrecks` schema divergence is closed**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH bun run report:fixture-schemas --only get_wrecks
```

Expected: `get_wrecks` summary is `no structural divergences detected`.

- [ ] **Step 5: Update `get_wrecks` golden files**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH UPDATE_GOLDENS=1 GOLDEN_ONLY=renderer/get_wrecks bun test src/output-golden.test.ts
```

Expected: PASS for the focused golden update. Inspect `src/golden-output/renderer/get_wrecks.table.stdout` and confirm it has no `undefined`, `NaN`, or raw `=== Response ===`.

- [ ] **Step 6: Run focused formatter coverage**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH bun test src/formatter.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit `get_wrecks` cleanup**

Run:

```bash
git add src/display/ship.fixtures.ts src/display/ship.ts src/golden-output/renderer/get_wrecks.*
git commit -m "test: align wreck fixtures with schema"
```

## Task 3: Update Market Fixtures

**Files:**
- Modify: `src/display/market.fixtures.ts`
- Update: `src/golden-output/renderer/view_market.*`
- Update: `src/golden-output/renderer/view_orders.*`

- [ ] **Step 1: Confirm current market fixture divergences**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH bun run report:fixture-schemas --only view_market,view_orders
```

Expected: report includes missing required fields for `view_market` and `view_orders`.

- [ ] **Step 2: Expand `viewMarketFixture`**

In `src/display/market.fixtures.ts`, replace `viewMarketFixture` with:

```ts
export const viewMarketFixture = {
  action: 'view_market',
  base: 'Earth Station',
  base_id: 'earth_station',
  categories: ['ore', 'fuel'],
  message: 'Market at Earth Station',
  items: [
    {
      item_id: 'ore_iron',
      item_name: 'Iron Ore',
      category: 'ore',
      best_buy: 15,
      best_buy_qty: 575,
      best_sell: 18,
      best_sell_qty: 15,
      buy_quantity: 1475,
      buy_price: 15,
      sell_quantity: 1015,
      sell_price: 18,
      buy_orders: [
        { price_each: 15, quantity: 500, source: 'station' },
        { price_each: 15, quantity: 75, source: 'player' },
        { price_each: 12, quantity: 900, source: 'player' },
      ],
      sell_orders: [
        { price_each: 18, quantity: 5 },
        { price_each: 18, quantity: 10 },
        { price_each: 75, quantity: 1000 },
      ],
    },
    {
      item_id: 'fuel_cell',
      item_name: 'Fuel Cell',
      category: 'fuel',
      best_buy: 0,
      best_buy_qty: 0,
      best_sell: 0,
      best_sell_qty: 0,
      buy_quantity: 0,
      buy_price: 0,
      sell_quantity: 0,
      sell_price: 0,
      buy_orders: [],
      sell_orders: [],
    },
  ],
};
```

Leave `viewMarketSingleItemFixture` as:

```ts
export const viewMarketSingleItemFixture = {
  action: 'view_market',
  base_id: 'earth_station',
  items: [viewMarketFixture.items[0]],
};
```

This helper is not part of `highValueCommandFixtures`; it can stay minimal unless a test fails.

- [ ] **Step 3: Expand `marketOrdersFixture`**

In `src/display/market.fixtures.ts`, replace `marketOrdersFixture` with:

```ts
export const marketOrdersFixture = {
  action: 'view_orders',
  base: 'Earth Station',
  scope: 'personal',
  orders: [
    {
      order_id: 'order-1',
      order_type: 'limit',
      side: 'buy',
      item_id: 'ore_iron',
      item_name: 'Iron Ore',
      quantity: 100,
      remaining: 75,
      filled_quantity: 25,
      price_each: 12,
      listing_fee: 25,
      created_at: '2026-05-29T00:00:00Z',
    },
  ],
  total: 1,
  page: 1,
  page_size: 20,
  total_pages: 1,
  has_more: false,
  hint: 'Showing personal market orders.',
  sort_by: 'newest',
};
```

- [ ] **Step 4: Verify market schema divergences are closed**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH bun run report:fixture-schemas --only view_market,view_orders
```

Expected: `view_market` and `view_orders` summaries are `no structural divergences detected`. Informational `extra-in-schema` entries are acceptable only for optional schema fields not exercised by the fixtures.

- [ ] **Step 5: Update market golden files**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH UPDATE_GOLDENS=1 GOLDEN_ONLY=renderer/view_market bun test src/output-golden.test.ts
PATH=/home/hermes/.bun/bin:$PATH UPDATE_GOLDENS=1 GOLDEN_ONLY=renderer/view_orders bun test src/output-golden.test.ts
```

Expected: both commands pass. The `renderer/view_market` filter also touches `view_market.jq-first-item-id`, which should remain stable.

- [ ] **Step 6: Run focused formatter tests**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH bun test src/formatter.test.ts
```

Expected: PASS. If this fails, inspect the failure before changing snapshots; table output is expected to remain stable because the formatter derives prices from `buy_orders` and `sell_orders`.

- [ ] **Step 7: Commit market fixture cleanup**

Run:

```bash
git add src/display/market.fixtures.ts src/golden-output/renderer/view_market.* src/golden-output/renderer/view_orders.*
git commit -m "test: align market fixtures with schema"
```

## Task 4: Refresh Fixture Schema Baseline

**Files:**
- Modify: `src/test-support/fixture-schema-baseline.json`

- [ ] **Step 1: Review the target report**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH bun run report:fixture-schemas --only facility_get,faction_trade_intel,get_wrecks,view_market,view_orders
```

Expected:
- No `facility_get` section.
- No `faction_trade_intel` section except possible substring match for `faction_trade_intel_status`.
- `get_wrecks`, `view_market`, and `view_orders` have no blocking divergences.

- [ ] **Step 2: Review the full report for unintended changes**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH bun run report:fixture-schemas
```

Expected: remaining blocking divergences are unrelated to this spec, such as V2GameState extras and old wrapper shapes from findings not selected for this work.

- [ ] **Step 3: Update the reviewed baseline**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH bun run report:fixture-schemas --update-baseline
```

Expected: `src/test-support/fixture-schema-baseline.json` removes closed blocking signatures for `get_wrecks`, `view_market`, and `view_orders` without introducing new blocking signatures. The stale `facility_get` and `faction_trade_intel` entries were route-resolution report noise, not blocking baseline signatures.

- [ ] **Step 4: Verify strict baseline mode**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH STRICT_FIXTURE_SCHEMA_DIVERGENCES=1 bun test src/output-golden.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit baseline refresh**

Run:

```bash
git add src/test-support/fixture-schema-baseline.json
git commit -m "test: refresh fixture schema baseline"
```

## Task 5: Final Verification

**Files:**
- No new files expected.
- Verify committed changes from Tasks 1-4.

- [ ] **Step 1: Run golden output tests**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH bun test src/output-golden.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run formatter tests**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH bun test src/formatter.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run focused schema report**

Run:

```bash
PATH=/home/hermes/.bun/bin:$PATH bun run report:fixture-schemas --only facility_get,faction_trade_intel,get_wrecks,view_market,view_orders
```

Expected: diagnostic output with no schema resolution failures and no blocking divergences for the selected target fixtures.

- [ ] **Step 4: Check worktree and commit graph**

Run:

```bash
git status --short
git log --oneline -5
```

Expected: clean worktree and recent commits for stale fixture removal, wreck fixture cleanup, market fixture cleanup, and baseline refresh.
