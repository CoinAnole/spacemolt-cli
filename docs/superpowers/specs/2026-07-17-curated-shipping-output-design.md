# Curated Shipping Output and Golden Fixtures Design

Date: 2026-07-17

## Summary

SpaceMolt gameserver v0.517.0 added eleven non-help shipping actions for sealed-package freight contracts. The CLI already exposes those actions as bundled generated commands, but table output still falls through to the generic JSON response renderer. Add a dedicated, command-scoped shipping display module and schema-shaped high-value fixtures so every shipping action has concise human-readable output and exact golden coverage.

Shipping commands remain generated commands. This design curates response presentation only; it does not add command overrides, aliases, positional arguments, examples, or categories.

## Context

The relevant changelog entries are:

- v0.517.0 introduced quoting, posting, browsing, acceptance, tracking, delivery, returns, cancellation, carrier profiles, insurance, liability, and freight debt.
- v0.519.1 allowed self-shipping outside normal carrier-tier and tier-liability gates and added the exact `failure_debt` to quotes and contracts.

The cached v0.522.0 OpenAPI document defines eleven generated commands and seven stable response families:

| Commands | Response family |
| --- | --- |
| `shipping_quote` | `ShippingQuoteResponse` |
| `shipping_post`, `shipping_get`, `shipping_accept` | `ShippingContractResponse` |
| `shipping_list` | `ShippingListResponse` |
| `shipping_track` | `ShippingTrackResponse` |
| `shipping_profile` | `ShippingProfileResponse` |
| `shipping_pay_debt` | `ShippingDebtPaymentResponse` |
| `shipping_deliver`, `shipping_return`, `shipping_cancel` | `ShippingSettlementResponse` |

Mutation responses place the shipping response under `structuredContent.details` alongside game-state sections. Read responses return their shipping response directly as `structuredContent`. The display pipeline already tries an unwrapped `details` view before the full view, while machine-output modes serialize the original structured response before invoking a table formatter.

## Goals

- Give all eleven non-help shipping commands intentional human-readable table output.
- Present the operational decisions players need: route, eligibility, timing, reward, cost, insurance, liability, failure debt, carrier capacity, and settlement.
- Share presentation logic across commands that return the same domain objects.
- Preserve raw server data unchanged in JSON, YAML, structured, compact, field, fields, and jq output modes.
- Add one schema-shaped high-value fixture for every shipping action.
- Add exact table, JSON, YAML, and compact-JSON goldens for every shipping action.
- Exercise both direct structured responses and mutation `details` envelopes.
- Keep fixture/schema comparison deterministic by declaring each generated command's exact API route.
- Use only the committed OpenAPI document for schema validation and routine verification.

## Non-Goals

- Do not promote shipping into curated command overrides.
- Do not add aliases, friendly command names, positional arguments, examples, categories, or request parsing behavior.
- Do not change bundled or cached dynamic-command discovery, help, completion, or dispatch.
- Do not change API transport, sessions, authentication, profiles, or mutation state handling.
- Do not invent server-derived names for base, package, actor, or shipment IDs when the response supplies only IDs.
- Do not convert server timestamps to local time or reorder tracking events.
- Do not add CLI-layer shipping goldens; existing runner tests already cover generated shipping dispatch.
- Do not fetch the live OpenAPI spec.
- Do not refactor unrelated formatter modules or generic fallback behavior.

## Approaches Considered

### Selected: Dedicated Module Organized by Response Family

Create a shipping display module with small helpers for actors, routes, contracts, money, capacity, progression, and debts. Register command-scoped formatters that reuse four presentation views across the seven stable response families.

Tradeoffs:

- Follows the existing domain-module structure used by market, passenger, ship, and social output.
- Keeps repeated contract and carrier concepts consistent across eleven commands.
- Uses command scoping to avoid claiming unrelated `action`-tagged responses.
- Requires a small amount of action-specific orchestration around shared views.

This is the selected approach.

### Alternative: One Independent Formatter per Command

Implement eleven self-contained formatters.

Tradeoffs:

- Makes each command's behavior locally explicit.
- Duplicates contract, actor, route, money, liability, and debt presentation.
- Makes labels and field ordering more likely to drift between related commands.

This is rejected because the OpenAPI schema deliberately shares response and domain components.

### Alternative: Discriminator-Based Shape Fallbacks

Match shipping responses by their `action` value regardless of command name.

Tradeoffs:

- Could format aliases or renamed commands automatically.
- Broad shape matching can capture unrelated responses with common fields such as `action`, `contract`, or `profile`.
- Bypasses the repository's preference for command-scoped presentation when stable command names exist.

This is rejected because generated shipping command names are stable and already known to the bundled registry.

## Architecture

### Display Module

Add `src/display/shipping.ts` and export a `shippingFormatters` array. Register it in `src/display/formatters.ts` before generic formatters.

The module owns only shipping presentation. Its internal units have narrow responsibilities:

- Scalar helpers validate optional values and format credits, ticks, booleans, actors, routes, and timestamps.
- Contract helpers turn `ShipmentContract` into reusable summary sections without mutating the response.
- Quote helpers render terms and `FreightAppraisalLine` rows.
- Listing and tracking helpers flatten nested contracts or events into table rows.
- Carrier helpers render `CarrierProfile`, `CarrierCapacity`, `CarrierTierProgress`, and `FreightDebt`.
- Command-scoped formatters validate the required response-family root and compose the relevant helpers.

No helper changes the structured response object. Derived display rows are new objects used only by `printCompactTable`.

### Formatter Registration

Register only these command names:

```text
shipping_accept
shipping_cancel
shipping_deliver
shipping_get
shipping_list
shipping_pay_debt
shipping_post
shipping_profile
shipping_quote
shipping_return
shipping_track
```

Do not set `shapeFallback: true`. A matching command with a malformed required root must return `false`, allowing the existing raw-response fallback to show the data instead of printing a misleading partial shipping view.

For mutation responses, the existing display pipeline passes `details` to the command-scoped formatter first. For direct read responses, it passes the top-level structured content. The shipping module must not add special envelope-unwrapping logic.

## Presentation Contract

### Shared Formatting Conventions

- Headings use `Freight Quote`, `Freight Contract`, `Freight Contracts`, `Freight Tracking`, `Carrier Profile`, `Freight Debt Payment`, and action-specific settlement titles.
- Actors render as `<kind>:<id>`, for example `player:player-7` or `station:nova_central`.
- Routes render as `<origin_base_id> -> <destination_base_id>` in plain-safe ASCII.
- Credit values use grouped digits plus ` cr`, for example `12,500 cr`.
- Tick durations use `<value> ticks`; absolute tick fields retain their field meaning in the label.
- Booleans render as `yes` or `no`.
- Server timestamps are shown exactly as received.
- Missing optional values are omitted, not rendered as `undefined`, `null`, `NaN`, an empty label, or a guessed value.
- Arrays preserve server order.
- Tables use `maxCellWidth` to keep identifiers, reasons, and fingerprints readable without unbounded lines.

### Quote

`shipping_quote` requires a `quote` object and renders:

1. Package ID and route.
2. Shipper, recipient, and invited carrier when present.
3. Service level, visibility, route hops, target ticks, and deadline ticks.
4. Base reward, maximum speed bonus, service fee, premium, and total cost.
5. Appraised value, covered value, insurance selection, insurability, risk band, required carrier tier, reserved exposure, and exact failure debt.
6. `uninsurable_reason` and `consequences` when present.
7. An appraisal table with item, quantity, unit value, total value, insurable, confidence/basis, and reason columns when appraisal lines exist.

An empty `appraisal_lines` array prints `No appraisal lines.` after the summary.

### Contract

`shipping_post`, `shipping_get`, and `shipping_accept` require a `contract` object and share a contract view containing:

1. Contract ID, status, and package ID.
2. Route, shipper, recipient, contractor, and invited carrier when present.
3. Visibility, service level, base reward, maximum speed bonus, service fee, reward escrow, and speed-bonus escrow.
4. Policy status, insurability, risk band, premium and covered value when present, reserved exposure, exact failure debt, and reputation eligibility when present.
5. Posted/listing-expiry timestamps plus accepted, delivered, breached, settled, target, and deadline fields when present.
6. Latest beacon fingerprint/time, terminal reason, carrier payout, claim paid, insurer, and salvage owner when present.

The heading includes the action context (`Posted Freight Contract`, `Freight Contract`, or `Accepted Freight Contract`) while the shared field order remains stable.

### Listings

`shipping_list` requires a `shipments` array. It prints pagination as `page <page>, <count> of <total>` and a compact table with:

| Column | Source |
| --- | --- |
| ID | `contract.id` |
| Status | `contract.status` |
| Package | `contract.package_id` |
| Route | derived origin and destination |
| Service | `contract.service_level` |
| Reward | `contract.base_reward` |
| Liability | `contract.failure_debt` |
| Eligible | `eligible` |
| Reason | `reason` |

Eligibility and reason stay adjacent so a player can understand why a visible contract cannot be accepted. An empty list prints `No visible freight contracts.` and still prints pagination when those fields are valid.

### Tracking

`shipping_track` requires both a `contract` object and an `events` array. It renders the compact contract identity, status, package, and route first, followed by events in server order.

The event table contains observed time, tick, class, location, custodian, reference, and fingerprint. Location is derived only from returned `system_id`, `poi_id`, and `base_id`, joined in that order. Custodian uses the shared actor format. An empty event list prints `No tracking events.`

### Carrier Profile

`shipping_profile` requires `profile`, `capacity`, `progression`, and `debts`. It renders:

1. Actor and current tier.
2. Successful and priority deliveries, delivered value, returns, breaches, defaults, active contracts, active liability, outstanding debt, and update/consequence/recovery timestamps.
3. Capacity: active contracts, aggregate liability, remaining aggregate liability, single-package liability, and the server's unlimited flags. Optional numeric limits are omitted when the corresponding unlimited flag is true or the value is absent.
4. Tier progression: current and next tier, delivery/value requirements and remaining amounts, or `Maximum carrier tier reached.` when `at_maximum_tier` is true.
5. Acceptance blocking status and `debt_block_reason` when present.
6. A debts table with debt ID, shipment, original, outstanding, creditor, created, and paid fields.

An empty debt list prints `No outstanding freight debt.`

### Debt Payment

`shipping_pay_debt` requires `amount_paid`, `profile`, `capacity`, `progression`, `updated_debts`, and `outstanding_debts`. It prints the amount paid, then reuses the profile/capacity/progression summary so the player can see the resulting acceptance capacity.

It renders `updated_debts` as `Updated Debts` and `outstanding_debts` as `Outstanding Debts`. Empty arrays produce explicit messages. If both arrays contain the same debt, both are still shown because they answer different questions: what changed and what remains.

### Settlement

`shipping_deliver`, `shipping_return`, and `shipping_cancel` require a `contract` object. They reuse the compact contract identity, status, package, and route, followed by only the settlement values returned by the server:

- `carrier_payout`
- `shipper_refund`
- `claim_paid`
- `debt_created`
- `terminal_reason` from the contract

Headings are action-specific: `Freight Delivered`, `Freight Returned`, and `Freight Contract Canceled`.

Zero-valued settlement amounts are valid and must be printed when present. Absent settlement fields are omitted.

## Machine Output Preservation

The shipping formatter participates only in normal table output. Existing output ordering remains authoritative:

1. Normalize the structured response for raw output.
2. Apply jq, field, fields, or search projections when requested.
3. Serialize JSON, YAML, text projection, structured, or compact output when requested.
4. Only then normalize a display view and invoke command-scoped table formatters.

Consequently, the formatter must not transform machine output. Mutation fixtures deliberately retain `details`, `player`, `ship`, and `cargo` at the top level so their JSON, YAML, and compact goldens prove that state sections remain present and unchanged even though table output focuses on the unwrapped shipping details.

## Fixtures and Golden Coverage

### Fixture Module

Add `src/display/shipping.fixtures.ts`. Export one fixture for each command and a `shippingHighValueFixtures` map. Import, re-export, and spread that map from `src/display/formatter-fixtures.ts`.

Every fixture must:

- Use the exact v0.522 OpenAPI property names and value types.
- Include every required field for the selected shipping response and its required nested components.
- Include representative optional fields that materially affect table layout.
- Use deterministic IDs and timestamps.
- Include zero and false values where omission would be a likely rendering bug.
- Avoid fields not declared by the cached schema.
- Declare an explicit route in the form `POST /api/v2/spacemolt_shipping/<action>`, because `COMMAND_OVERRIDES` cannot resolve routes for generated-only commands.

Mutation fixture entries for accept, post, deliver, return, cancel, and pay-debt set `schemaTarget: details` and place the action response under `details` with representative state sections alongside it. Quote, get, list, profile, and track use direct structured response fixtures and compare against `structuredContent` through the reporter's normal selection.

### Scenario Allocation

Fixtures must vary scenarios instead of cloning one happy path:

- Quote: insured priority shipment with multiple appraisal lines and exact failure debt.
- Post: posted invited contract with pending insurance and state envelope.
- Get: in-transit contract with contractor and latest beacon fields.
- Accept: self-shipment with `reputation_eligible: false`, accepted/deadline ticks, and state envelope.
- List: one eligible and one ineligible listing, including a reason and pagination.
- Track: multiple custody classes and location combinations.
- Profile: non-maximum tier, constrained liability capacity, and one outstanding debt.
- Pay debt: partial payment, one updated debt, one remaining debt, and state envelope.
- Deliver: successful priority delivery with carrier payout and no created debt.
- Return: returned contract with a zero payout and shipper refund.
- Cancel: canceled posted contract with shipper refund and no carrier.

### Golden Matrix

Adding eleven high-value entries to the existing renderer matrix creates:

- 11 table cases
- 11 pretty JSON cases
- 11 YAML cases
- 11 compact JSON cases
- 44 total renderer cases
- 88 committed `.stdout` and `.stderr` files under `src/golden-output/renderer/`

No `allowFallback` exception is permitted for shipping table cases. JSON, YAML, and compact goldens contain the fixture exactly as normalized by the existing machine-output pipeline.

Golden updates should be targeted with:

```bash
UPDATE_GOLDENS=1 GOLDEN_ONLY=shipping_ bun test src/output-golden.test.ts
```

Review all eleven table outputs and sample both direct and mutation machine-output files before accepting the update.

## Error Handling and Resilience

- A formatter returns `false` when its required root object or array is absent or has the wrong type.
- Invalid entries inside optional arrays are skipped; valid entries continue to render.
- Invalid optional scalars are omitted.
- Numeric zero and boolean false are preserved as present values.
- Empty arrays render explicit domain messages rather than blank tables.
- Unknown enum strings are displayed as returned; presentation does not enforce gameplay validation.
- Missing optional actor, policy, progression, limit, timestamp, or settlement fields do not fail the command.
- No formatter mutates the response or sorts server arrays.
- A declined formatter reaches the existing raw-response fallback, preserving visibility into a drifted server response.
- Golden guardrails continue rejecting `undefined`, `NaN`, `[object Object]`, and accidental `=== Response ===` fallback output.

## Data Flow

### Direct Read Response

1. A bundled generated `shipping_*` command dispatches to its v2 route.
2. The client returns direct shipping data under `structuredContent`.
3. Machine-output and projection modes serialize that data unchanged.
4. Table mode passes the normalized data to the matching command-scoped shipping formatter.
5. The formatter validates its response-family root, derives temporary rows, and emits headings, summaries, and tables.

### Mutation Response

1. The generated mutation dispatches and receives `structuredContent` containing game-state sections plus `details`.
2. Machine-output modes serialize the entire structured content unchanged.
3. Table mode clones and unwraps `details` through the existing `postActionDetailsViewModel` path.
4. The matching shipping formatter renders the action response.
5. The formatter does not separately render the surrounding state sections.

### Fixture Schema Validation

1. The high-value fixture entry supplies its explicit shipping API route.
2. The reporter resolves the route's named 200-response schema from the cached OpenAPI document.
3. Mutation fixtures target `details`; direct fixtures use the structured-content response.
4. The reporter selects the action-discriminated response family and compares nested fields.
5. Strict tests compare any remaining divergence signatures with the reviewed baseline.

## Testing

### Focused Display Tests

Add `src/display/shipping.test.ts` to cover behavior that is clearer and cheaper than duplicating more high-value goldens:

- Every shipping command selects a shipping formatter and does not fall back to raw response output.
- Actor, route, credits, ticks, booleans, and exact timestamps follow shared conventions.
- Quote totals, insurance, risk, exposure, failure debt, and appraisal rows render.
- Listings flatten nested contracts and keep eligibility adjacent to the reason.
- Tracking preserves event order and combines only returned location components.
- Profile capacity distinguishes unlimited flags from finite limits.
- Maximum-tier progression uses its explicit message.
- Empty listing, appraisal, tracking, and debt arrays use domain-specific messages.
- Debt payment distinguishes updated and outstanding debts.
- Settlement zero values are not dropped.
- Malformed required roots return false and reach raw fallback.
- Malformed optional fields do not emit accidental diagnostic tokens.

Tests should call `renderStructuredResult` with `plain: true` and assert stable semantic lines or tables. Exact full-output coverage remains the responsibility of golden tests.

### Golden and Schema Tests

Run targeted checks while developing:

```bash
bun test src/display/shipping.test.ts
bun test src/output-golden.test.ts
bun run report:fixture-schemas --only shipping_
STRICT_FIXTURE_SCHEMA_DIVERGENCES=1 bun test src/output-golden.test.ts
```

The shipping-only schema report must resolve all eleven explicit routes. Do not update the divergence baseline merely to accept misspelled fields, wrong types, missing required shipping fields, or incorrect response targets.

### Full Verification

Run:

```bash
bun test
bun run typecheck
bun run lint
bun run build
```

Do not run `LIVE_API_SYNC=1`.

## Implementation Boundaries

Expected created files:

- `src/display/shipping.ts`
- `src/display/shipping.test.ts`
- `src/display/shipping.fixtures.ts`
- 88 renderer golden files for the eleven four-mode fixture cases

Expected modified files:

- `src/display/formatters.ts`
- `src/display/formatter-fixtures.ts`

The fixture/schema divergence baseline changes only if the completed shipping fixtures reveal a legitimate, reviewed limitation in the cached schema or comparison tooling. No command override file should change.

## Acceptance Criteria

- All eleven shipping commands render a domain-specific table view without `=== Response ===`.
- Shared contract, actor, route, credit, liability, capacity, progression, and debt concepts use consistent labels and formatting.
- Quote and contract views expose exact `failure_debt`.
- List output explains eligibility failures.
- Track output preserves server event order.
- Profile and pay-debt output make acceptance-blocking debt and remaining capacity visible.
- Deliver, return, and cancel retain zero-valued settlement amounts.
- All eleven commands have committed table, JSON, YAML, and compact-JSON goldens.
- Mutation machine-output goldens retain the full state envelope.
- All fixture-schema comparisons resolve the correct explicit shipping route and response target.
- Focused, golden, strict schema-divergence, full test, typecheck, lint, and build verification pass.
- Shipping remains generated-command-only; no curated request metadata is added.
