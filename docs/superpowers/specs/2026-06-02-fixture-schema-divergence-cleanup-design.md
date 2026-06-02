# Fixture Schema Divergence Cleanup Design

## Goal

Close the highest-value fixture/schema divergences from Findings 1, 2, and 3 so the golden fixtures better represent the current OpenAPI response schemas without broad formatter refactoring.

## Background

`bun run report:fixture-schemas` compares `highValueCommandFixtures` against response schemas in `spacemolt-docs/openapi.json`. The current report has several broad classes of divergence:

- Stale or unresolvable high-value fixtures that no longer map to a real schema-backed command.
- Stale response shapes that use old wrapper fields or renamed fields.
- Partial market and wreck fixtures that omit many schema-required fields.

This spec intentionally covers only the first three review findings:

1. Stale/unresolvable fixtures: `facility_get` and `faction_trade_intel`.
2. `get_wrecks`.
3. `view_market` and `view_orders`.

## Design Summary

Use a fixture-first cleanup. Update or remove stale high-value fixture entries, then adjust the affected fixtures to match the current OpenAPI schemas. Regenerate only the golden files whose rendered output changes, and refresh the fixture/schema baseline after reviewing the reduced divergence set.

The implementation should preserve renderer behavior where current output is still useful. If schema-current data unlocks additional display coverage, update expected golden output intentionally instead of suppressing the data.

## Scope

### Stale and Unresolvable Fixtures

`facility_get` is currently listed as a high-value fixture, but the cached OpenAPI spec has no facility get route. The fixture should no longer be part of `socialHighValueFixtures` unless a real current route is identified in the local spec. The existing renderer fixture case may remain if it is still useful for formatter shape-fallback coverage, but it should not participate in schema comparison as a high-value API fixture.

`faction_trade_intel` is currently listed as a high-value fixture but has no route override or generated route. The schema-backed command is `faction_query_trade_intel`. Remove `faction_trade_intel` from `marketHighValueFixtures`. Keep or update the non-high-value formatter case only if it is still intentionally covering a legacy formatter alias.

### `get_wrecks`

Replace the stale wreck fixture shape with a schema-current `GetWrecksResponse` example. The fixture should include:

- Top-level `count`.
- `wrecks[0].id`, `type`, `poi_id`, `system_id`, `ship_class`, `victim_id`, `victim_name`, `cargo`, `modules`, `salvage_value`, `created_at`, `expires_at`, and `expire_tick`.
- At least one cargo item with `item_id`, `name`, `quantity`, and `size`.
- At least one module with `id`, `type_id`, `name`, `type`, and `wear`.

Do not keep obsolete fixture-only fields such as `wreck_id`, `ticks_remaining`, or `items` in the high-value `get_wrecks` fixture.

### `view_market`

Expand `viewMarketFixture` to satisfy `ViewMarketResponse` while preserving order-book coverage. The fixture should include:

- Top-level `action`, `base`, `base_id`, and `items`.
- For every item: `item_id`, `item_name`, `category`, `sell_orders`, `buy_orders`, `best_sell`, `best_buy`, `sell_quantity`, `sell_price`, `best_sell_qty`, `buy_quantity`, `buy_price`, and `best_buy_qty`.
- Existing multi-order buy/sell examples, including a station/source order and an item with empty order books.

Use realistic numeric sentinel values for empty order-book summaries. If the live API uses `0` for absent prices, use `0` consistently in the fixture.

### `view_orders`

Expand `marketOrdersFixture` to satisfy `ViewOrdersResponse`. The fixture should include:

- Top-level `action`, `base`, `scope`, `orders`, `total`, `page`, `page_size`, `total_pages`, `has_more`, `hint`, and `sort_by`.
- For every order: `order_id`, `order_type`, `side`, `item_id`, `quantity`, `remaining`, `filled_quantity`, `price_each`, `listing_fee`, and `created_at`.
- Existing fields that the renderer may use, such as `item_name`, when schema-compatible.

## Non-Goals

- Do not resolve V2GameState divergences for `get_ship`, `get_status`, `get_location`, `get_cargo`, or `get_skills`.
- Do not change the OpenAPI spec or generated API metadata.
- Do not refactor formatter selection, schema comparison internals, or command routing.
- Do not remove renderer-only fixture cases merely because they are not schema-backed high-value fixtures.

## Acceptance Criteria

- `PATH=/home/hermes/.bun/bin:$PATH bun run report:fixture-schemas --only facility_get,faction_trade_intel` no longer reports schema resolution failures for high-value fixtures.
- `PATH=/home/hermes/.bun/bin:$PATH bun run report:fixture-schemas --only get_wrecks,view_market,view_orders` reports no blocking divergences for `get_wrecks`, `view_market`, and `view_orders`.
- `PATH=/home/hermes/.bun/bin:$PATH bun test src/output-golden.test.ts` passes after intentional golden updates.
- `PATH=/home/hermes/.bun/bin:$PATH bun run report:fixture-schemas --update-baseline` is run after reviewing the new report, so `src/test-support/fixture-schema-baseline.json` reflects the closed divergences.

## Expected Files

- Modify `src/display/social.fixtures.ts` to remove or de-scope stale high-value entries.
- Modify `src/display/market.fixtures.ts` to remove stale high-value trade intel coverage and expand market fixtures.
- Modify `src/display/ship.fixtures.ts` to replace the stale wreck fixture.
- Update affected files under `src/golden-output/` with `UPDATE_GOLDENS=1 GOLDEN_ONLY=... bun test src/output-golden.test.ts`.
- Update `src/test-support/fixture-schema-baseline.json` after reviewing the reduced divergence report.

## Risks

Golden output will change for `get_wrecks`, `view_market`, and `view_orders` because the fixtures will contain additional schema-current fields. These changes are acceptable only when the rendered output remains useful and stable.

Removing high-value entries for stale commands may reduce schema-comparison coverage, but it removes false failures for commands that no longer map to current OpenAPI routes. Renderer-only coverage can remain separately.

## Verification

Run these commands in order:

```bash
PATH=/home/hermes/.bun/bin:$PATH bun run report:fixture-schemas --only facility_get,faction_trade_intel
PATH=/home/hermes/.bun/bin:$PATH bun run report:fixture-schemas --only get_wrecks,view_market,view_orders
PATH=/home/hermes/.bun/bin:$PATH UPDATE_GOLDENS=1 GOLDEN_ONLY=renderer/get_wrecks bun test src/output-golden.test.ts
PATH=/home/hermes/.bun/bin:$PATH UPDATE_GOLDENS=1 GOLDEN_ONLY=renderer/view_market bun test src/output-golden.test.ts
PATH=/home/hermes/.bun/bin:$PATH UPDATE_GOLDENS=1 GOLDEN_ONLY=renderer/view_orders bun test src/output-golden.test.ts
PATH=/home/hermes/.bun/bin:$PATH bun test src/output-golden.test.ts
PATH=/home/hermes/.bun/bin:$PATH bun run report:fixture-schemas --update-baseline
PATH=/home/hermes/.bun/bin:$PATH STRICT_FIXTURE_SCHEMA_DIVERGENCES=1 bun test src/output-golden.test.ts
```

If a golden case has a different label than the command name, use the exact label printed by `bun test src/output-golden.test.ts` or inspect `src/golden-output/renderer/` before running the focused update.
