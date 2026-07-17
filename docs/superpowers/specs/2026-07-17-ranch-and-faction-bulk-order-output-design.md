# Ranch and Faction Bulk-Order Human Output Design

Date: 2026-07-17

## Summary

SpaceMolt v0.525.0 added wildlife ranch management through `facility ranch_status` and `facility ranch_set_cull`. SpaceMolt v0.527.0 added bulk variants to faction buy- and sell-order creation. The CLI can route and serialize these commands, but their new response shapes do not yet have dedicated, stable human-readable output.

This design adds command-scoped table formatters and exact-schema high-value fixtures for four response cases:

- `facility_ranch_status`
- `facility_ranch_set_cull`
- the `kind: "bulk"` branch of `faction_create_buy_order`
- the `kind: "bulk"` branch of `faction_create_sell_order`

Ranch status uses an operational dashboard followed by feed and production tables. Cull updates use a compact acknowledgement. Faction bulk orders use an action-specific summary followed by one mixed result table that preserves request order and shows both successes and failures. Existing single-order human output and all machine-readable output remain unchanged.

## Problem

The current generated command metadata is sufficient to parse and route the new requests, but response presentation has two gaps.

First, `RanchStatusResponse` is a rich response with facility identity, herd capacity, health, feeding, growth, culling, domestication, and expected production. Generic JSON fallback is complete but makes routine ranch management harder than necessary. `RanchSetCullResponse` is smaller, but a dedicated acknowledgement can explain the special `cull_target: 0` behavior and keep the command consistent with the status view.

Second, faction order creation is now a discriminated response union. Existing `create_market_order` formatting handles the `kind: "single"` branch, but the `kind: "bulk"` branch contains a summary and an ordered `results` array instead of a top-level `order_id` and `listing_fee`. The existing formatter correctly declines that shape, leaving bulk results on the generic response fallback. Players cannot quickly see which requested orders succeeded, which failed, and what financial effect each successful row had.

The current single faction fixtures also predate the required `kind: "single"` discriminator. Add that discriminator while introducing the second response branch.

## Goals

- Give ranch operators a scannable default status view without hiding any operational category returned by the API.
- Give cull-policy changes a concise acknowledgement that makes target zero unambiguous.
- Show faction bulk-order successes and failures together in original request order.
- Preserve buy- and sell-specific financial meaning.
- Keep required zero and false values visible.
- Preserve raw structured data for JSON, YAML, compact JSON, structured output, field projections, jq, and search.
- Add exact-schema fixtures and golden coverage for every new response case.
- Make coverage enforcement aware that faction order commands have separate single and bulk response branches.
- Decline malformed core response structures to the existing raw fallback instead of printing a misleading partial view.

## Non-Goals

- Do not change request parsing, routing, command names, help, completion, or generated API metadata.
- Do not change the server response schema or compensate for fields absent from the OpenAPI specification.
- Do not redesign existing single personal or faction order output.
- Do not add a new output mode, terminal-width engine, interactive display, or pagination behavior.
- Do not build a generic OpenAPI-driven response renderer.
- Do not add broad shape fallbacks that could claim unrelated facility or market responses.
- Do not sort bulk results or ranch feed/output entries; server order remains authoritative.

## Approaches Considered

### Recommended: Extend Existing Domain Modules

Add ranch presentation beside the facility formatters in `src/display/social.ts` and ranch fixtures beside existing facility fixtures in `src/display/social.fixtures.ts`. Add bulk faction order presentation beside order creation in `src/display/market.ts` and fixtures in `src/display/market.fixtures.ts`.

Tradeoffs:

- Follows the repository's existing facility and commerce ownership boundaries.
- Reuses existing table, validation, and credit-formatting helpers.
- Keeps single and bulk order behavior close enough to share small display-only helpers.
- Adds some code to already substantial domain modules, but the additions remain narrow and independently testable.

This is the selected approach.

### Alternative: Add Ranch and Faction-Commerce Display Modules

Create new `ranch.ts` and `faction-commerce.ts` modules with matching fixture modules.

Tradeoffs:

- Creates strong isolation for the new response families.
- Splits facility behavior across social and ranch modules and order behavior across market and faction-commerce modules.
- Adds formatter registry and fixture aggregation overhead for two small additions.

This is rejected because the existing domain boundaries already provide clear ownership.

### Alternative: Add a Generic Schema-Driven Renderer

Map arbitrary scalar properties and object arrays into headings and tables using OpenAPI metadata.

Tradeoffs:

- Could reduce bespoke code for future generated commands.
- Cannot infer domain semantics such as range health, culling disabled at zero, buy escrow, sell earnings, or the relationship between order success and error fields.
- Would produce field-oriented output rather than player-oriented output and introduce much broader scope.

This is rejected because these response families benefit specifically from semantic presentation.

## Architecture

### Formatter Ownership

Add two command-scoped ranch formatters to `socialFormatters`:

- `facility_ranch_status`
- `facility_ranch_set_cull`

Grouped invocation names such as `facility ranch_status` normalize to these internal names through the existing formatter matching helpers.

Add a bulk faction-order formatter to `marketFormatters` for:

- `faction_create_buy_order`
- `faction_create_sell_order`

The bulk formatter accepts only `kind === "bulk"`. The existing `create_market_order` formatter continues to own single responses. Formatter order may place the bulk branch immediately before the existing single formatter for readability, although the single formatter already declines bulk responses because they lack both `order_id` and `listing_fee`.

None of the new formatters sets `shapeFallback: true`. These command names are stable, and broad matching on common keys such as `action`, `results`, `summary`, or `facility_id` could capture unrelated responses.

### Display-Only Helpers

Keep helpers local to their domain modules unless an existing shared helper already provides the behavior.

Ranch helpers should handle:

- finite fraction-to-percentage display;
- facility, base, anchor, and species identity;
- cull-target display, including `disabled (0)`;
- derived feed and production rows.

Market helpers should handle:

- bulk summary validation and rendering;
- per-result status;
- item display with name and ID fallback;
- bucket/consolidation display;
- buy-specific and sell-specific financial summaries;
- success order ID versus failure code/message display.

Derived table rows are new objects used only by the human formatter. No helper mutates the structured response.

### Data Flow

The existing display pipeline remains authoritative:

1. Normalize the structured response for machine-readable output.
2. Apply jq, field, fields, search, or other projections when requested.
3. Serialize JSON, YAML, structured, text projection, or compact JSON before human formatters run.
4. For default table output, normalize a display view.
5. Offer mutation `details` to command-scoped formatters before the full state envelope.
6. If every applicable formatter declines, print the existing raw response fallback.

`ranch_status` consumes top-level structured content. `ranch_set_cull` and both faction bulk-order mutations consume `details`. Representative game-state siblings stay present in mutation fixtures so machine-output goldens prove that the display path does not discard state.

## Presentation Contract

### Ranch Status

`facility_ranch_status` requires every OpenAPI-required `RanchStatusResponse` field to have its declared type. When optional `produces` is present, it must be an array of records. The formatter renders:

```text
=== Wildlife Ranch ===
Facility: <facility_name> (<facility_id>)
Location: <base_name> (<base_id>)
Habitat: <anchor_name> (<anchor_poi>)
Species: <species_name> (<species>)
Level: <level>
Herd: <herd> / <capacity>
Range health: <percent> | Fed: <percent> | Supplies: yes|no
Growth: <value>/cycle | Cull target: <value> | Cull cap: <value>/cycle
Wild population: <value>
Domestication: active|inactive | Reserve: <value>
```

Rules:

- Identity uses the human-readable name followed by the stable ID when both are present and different.
- `range_health` and `fed_fraction` must be finite 0-1 fractions and render as percentages. An out-of-range required fraction causes the formatter to decline to raw fallback.
- Zero numeric values and `domestication_active: false` or `supplies_ok: false` remain visible.
- A non-empty server message renders after the scalar dashboard and before the feed and production sections; it does not replace structured fields.
- Missing optional `produces` is treated as absent information. A returned empty array prints an explicit empty-production message.

The required `feed` array renders as:

| Column | Source |
| --- | --- |
| `Resource` | `resource` |
| `Per Cycle` | `per_cycle` |
| `Stocked` | `stocked` |
| `Cycles Left` | `cycles_left` |

An empty feed array prints `No feed requirements.`

When `produces` is present, it renders as:

| Column | Source |
| --- | --- |
| `Item` | `item` |
| `Per Cycle` | `per_cycle` |

An empty production array prints `No expected ranch products.`

Feed and production arrays preserve server order.

### Cull Policy Update

`facility_ranch_set_cull` requires all OpenAPI-required fields—`action`, `facility_id`, `cull_target`, `herd`, and `message`—with their declared types. It renders:

```text
=== Ranch Cull Policy Updated ===
Facility: <facility_id>
Current herd: <herd>
Cull target: <value>
<message>
```

When `cull_target` is zero, the target line renders `Cull target: disabled (0)`. Other targets render as grouped integers. A zero herd remains visible.

### Faction Bulk Orders

The bulk formatter requires:

- `kind === "bulk"`;
- the expected bulk action for the selected command;
- a `summary` record with finite integer `total`, `succeeded`, and `failed` values;
- a `results` array whose entries are records with a finite integer `index` and boolean `success`.

It prints `Faction Buy Orders` or `Faction Sell Orders` followed by:

```text
<total> requested | <succeeded> succeeded | <failed> failed
```

The summary uses server-provided counts. It does not silently recompute and replace them from the result rows.

One mixed table preserves result order:

| Column | Behavior |
| --- | --- |
| `#` | `index`, preserving the server's input index. |
| `Status` | `created` for success or `failed` for failure. |
| `Item` | Prefer `item`; include or fall back to `item_id`. |
| `Qty` | Requested `quantity`. |
| `Filled/Listed` | Combine returned `quantity_filled` and `quantity_listed` without guessing absent values. |
| `Price` | `price_each` formatted as credits. |
| `Bucket` | `bucket`, with a concise consolidated marker when `consolidated` is true. |
| `Financial` | Buy: spent, escrowed, refunded, and fee values that are present. Sell: earned and fee values that are present. |
| `Order / Error` | Successful `order_id`, or failure `error_code` plus `error`; fall back to `message` when needed. |

The `Financial` column deliberately combines side-specific values instead of creating many columns that would be empty for half the response family. Labels remain explicit inside the cell, such as `spent 20 cr; escrow 30 cr; fee 1 cr` or `earned 40 cr; fee 2 cr`.

Zero financial values and `consolidated: false` must not be mistaken for missing data. A returned empty results array still renders the summary and an explicit `No order results.` message.

### Existing Single Orders

Existing single personal and faction order output remains unchanged. The single faction fixtures add `kind: "single"` so fixture data follows the current discriminated OpenAPI union. No new discriminator label is printed in human output.

## Validation and Fallback Behavior

New formatters validate the structural roots and core fields needed to make their presentation truthful.

- A malformed ranch identity, herd/capacity value, or required feed structure causes ranch status formatting to decline.
- A malformed cull target or herd value causes cull acknowledgement formatting to decline.
- A malformed bulk discriminator, summary, results array, index, or success flag causes bulk formatting to decline.
- Malformed optional values are omitted from derived cells rather than converted to `NaN`, `undefined`, or `[object Object]`.
- Unexpected optional records or arrays are never stringified implicitly.

Declining returns control to the existing raw-response fallback. This favors complete diagnostic data over a partially credible dashboard or table.

## Fixtures and Golden Coverage

### Ranch Fixtures

Add two entries to `socialHighValueFixtures`:

- `facility_ranch_status`
- `facility_ranch_set_cull`

Both entries declare explicit API routes because the commands are bundled generated fallbacks rather than curated overrides:

- `POST /api/v2/spacemolt_facility/ranch_status`
- `POST /api/v2/spacemolt_facility/ranch_set_cull`

The status fixture uses top-level structured content and includes every required `RanchStatusResponse` field plus representative `produces` rows. The cull fixture places `RanchSetCullResponse` under `details`, sets `schemaTarget: "details"`, and includes representative state sections beside it.

Fixtures use deterministic identifiers and values, and deliberately exercise zero or false values where omission is risky.

### Faction Bulk Fixtures

Keep the existing `faction_create_buy_order` and `faction_create_sell_order` fixture labels for the single branch, adding `kind: "single"` to each fixture.

Add separate labels for the bulk branches:

- `faction_create_buy_order_bulk`
- `faction_create_sell_order_bulk`

Each bulk fixture:

- places the response under mutation `details`;
- sets `schemaTarget: "details"`;
- uses the exact faction-commerce API route;
- contains at least one success and one failure in interleaved input order;
- includes a summary matching those rows;
- exercises zero and false values;
- includes buy- or sell-specific financial fields.

Add both bulk labels to `REQUIRED_HIGH_VALUE_FIXTURE_LABELS`, mapped to their associated commands. This extends the existing multi-shape coverage guard so a future refactor cannot remove the bulk branch while retaining only a command-level single fixture.

### Golden Matrix

The existing renderer matrix automatically creates table, JSON, YAML, and compact-JSON cases for every high-value fixture. The four new labels therefore add sixteen committed golden files. Updating the single faction fixtures also intentionally updates their machine-readable goldens to include `kind: "single"`; their table goldens remain unchanged.

## Test Plan

### Ranch Formatter Tests

Add focused tests in `src/display/social.test.ts` for:

- identity and dashboard field order;
- fraction-to-percentage formatting;
- zero and false preservation;
- feed and production table columns;
- empty feed and returned-empty production messages;
- cull target zero as `disabled (0)`;
- malformed required roots declining to the raw fallback;
- absence of `NaN`, `undefined`, and object stringification.

### Bulk Order Formatter Tests

Add focused tests in `src/formatter.test.ts` for:

- the bulk discriminator selecting the new formatter;
- server result order preservation;
- mixed success and failure rows;
- buy-specific spent, escrow, refund, and fee wording;
- sell-specific earned and fee wording;
- order IDs on success and error code/message on failure;
- zero and false preservation;
- explicit empty-results output;
- existing single buy/sell output remaining unchanged;
- malformed core structures declining to the raw fallback.

### Coverage and Verification

Run:

```bash
bun test src/display/social.test.ts src/formatter.test.ts
bun test src/test-support/formatter-golden-coverage.test.ts
bun test src/output-golden.test.ts
bun run report:fixture-schemas --only facility_ranch_status,facility_ranch_set_cull,faction_create_buy_order,faction_create_sell_order
STRICT_FIXTURE_SCHEMA_DIVERGENCES=1 bun test src/output-golden.test.ts
bun test
bun run typecheck
bun run lint
bun run build
git diff --check
```

Golden updates use `UPDATE_GOLDENS=1` only for the intended new or discriminator-adjusted cases.

## Risks and Mitigations

- **Wide bulk table:** Combining financial values into one labeled cell prevents many sparse columns while retaining action-relevant information. Existing compact-table truncation remains the final line-length guard.
- **Fraction interpretation:** The response fields are defined as fractions and are displayed consistently as percentages. Tests lock representative values.
- **Formatter overlap:** Command scoping plus the `kind: "bulk"` check prevents the new formatter from changing personal orders or faction single orders.
- **Schema evolution:** Exact-schema fixtures, filtered schema reporting, strict drift checks, and required multi-shape labels expose response changes early.
- **Misleading partial output:** Core validation declines malformed structures to the raw fallback.
- **Machine-data loss:** Mutation fixtures retain state siblings and all four machine-readable golden modes serialize the original response before table formatting.

## Acceptance Criteria

- `facility ranch_status` renders a ranch dashboard plus feed and production output without raw fallback.
- `facility ranch_set_cull` renders a dedicated acknowledgement and labels target zero as disabled.
- Bulk faction buy and sell responses render one ordered mixed success/failure table with a server summary.
- Buy and sell financial values use action-correct labels.
- Existing single-order table output is unchanged and its fixtures include `kind: "single"`.
- Required zero and false values remain visible.
- Malformed core shapes fall back to the complete raw response.
- JSON, YAML, structured, compact, and projection behavior preserve original response data.
- New fixtures match their OpenAPI response branches and are enforced by formatter golden coverage.
- Focused tests, strict goldens, the full test suite, typecheck, lint, build, and diff checks pass.

## Open Questions

None. The domain-local modules, ranch dashboard, cull acknowledgement, mixed bulk table, and schema-targeted coverage were approved during brainstorming.
