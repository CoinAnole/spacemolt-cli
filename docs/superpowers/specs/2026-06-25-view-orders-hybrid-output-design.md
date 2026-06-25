# View Orders Hybrid Output Design

Date: 2026-06-25

## Summary

`view_orders` should show enough information by default for a player to manage active market orders without switching to `--json`. The current human table only renders item ID, order ID, side, original quantity, and price. That hides fill progress and order context even though the API response already includes required fields such as `remaining`, `filled_quantity`, `listing_fee`, and `created_at`.

The design keeps machine-readable output unchanged and improves only the default human table/text renderer for `view_orders`. The new output uses a hybrid format: a compact context line above the table, followed by a wider but still scannable table that includes open quantity, filled quantity, fees, created time, and order ID.

## Problem

The existing table in `src/display/market.ts` renders `view_orders` through the `market_orders` formatter:

```text
=== Orders ===

  Item     | ID      | Side | Qty | Price
  ---------+---------+------+-----+------
  ore_iron | order-1 | buy  | 100 | 12
```

This output hides several fields a player needs when reviewing or modifying orders:

- `remaining`: the amount still open on the order.
- `filled_quantity`: fill progress since creation.
- `listing_fee`: credits already paid to list the order.
- `created_at`: age and ordering context.
- `base`, `scope`, `sort_by`, `page`, `total_pages`, and `total`: response-level context.

It also prefers `item_id` over the more readable `item_name`, which makes scanning many orders harder.

## Goals

- Make default `view_orders` table output show fill progress.
- Keep order IDs visible for `cancel_order` and `modify_order`.
- Show station, scope, sort, total count, and page context when present.
- Prefer human-readable item names while preserving fallbacks to IDs.
- Format credit fields consistently with existing market output.
- Keep `--json`, `--yaml`, `--structured`, `--field`, `--fields`, `--jq`, and compact JSON output unchanged.
- Cover the new default output with golden tests.

## Non-Goals

- Do not change the API request payload for `view_orders`.
- Do not change the server response shape.
- Do not add new flags or output modes.
- Do not change generated OpenAPI command metadata.
- Do not redesign all compact tables or add terminal-width responsive table rendering.
- Do not alter `view_market`, order creation, cancellation, or modification output except where shared helpers are narrowly needed.

## Approaches Considered

### Recommended: Hybrid Summary Plus Richer Table

Add a context line above the orders table and render a richer table:

```text
=== Orders ===
Earth Station | personal | newest | 1 order | page 1/1
Showing personal market orders.

  Item     | Side | Open/Qty | Filled | Price | Fee   | Created          | ID
  ---------+------+----------+--------+-------+-------+------------------+--------
  Iron Ore | buy  | 75/100   | 25     | 12 cr | 25 cr | 2026-05-29 00:00 | order-1
```

Tradeoffs:

- Shows the fields needed for order management without dumping the full response.
- Keeps order IDs close to each row.
- Uses response-level context without repeating it in every row.
- Produces a wider table than today, but the added columns directly answer common order-management questions.

### Alternative: Add Only Remaining And Filled Columns

Keep the existing table structure and add `Open/Qty` and `Filled`.

Tradeoffs:

- Minimal width increase.
- Solves the most important fill-progress problem.
- Still hides fees, created time, and response context, leaving users to reach for `--json` for routine review.

This is not sufficient because the user explicitly wants the default to show more information.

### Alternative: Dump Every Order Field In The Table

Render all schema fields including `order_type`, `faction_order`, and `created_by`.

Tradeoffs:

- Maximizes visible data.
- Makes the default table too wide for common terminal sizes.
- Repeats fields that are often redundant or only relevant for faction-specific cases.

This is rejected because the default should be more useful while still being scannable.

## Design

### Formatter Scope

Change only the human-readable `market_orders` formatter used by `view_orders`.

The formatter should continue to match:

- command-scoped `view_orders`
- shape fallback on an `orders` array

Machine output branches should continue to serialize the original result data. The new display rows should be derived only inside the human formatter and not written back to the response object used for machine output.

### Context Lines

Before the table body, print response-level context when data is available:

```text
=== Orders ===
Earth Station | personal | newest | 1 order | page 1/1
Showing personal market orders.
```

Context parts:

- `base`
- `scope`
- `sort_by`
- total count as `N order` or `N orders`
- page state as `page X/Y` using `page` and `total_pages`

Skip missing context parts rather than printing placeholders. If the response has `hint`, print it after the context line. If neither context nor hint is available, render only the table heading and rows.

### Table Columns

Render these columns in this order:

| Column | Source | Behavior |
| --- | --- | --- |
| `Item` | `item_name`, `item_id` | Prefer name, fall back to ID. |
| `Side` | `side`, `type` | Preserve existing side fallback. |
| `Open/Qty` | `remaining`, `quantity` | Display `remaining/quantity` when both exist; otherwise display whichever quantity is present. |
| `Filled` | `filled_quantity` | Display the filled amount when present. |
| `Price` | `price_each`, `price` | Format numeric values as credits, for example `12 cr`. |
| `Fee` | `listing_fee` | Format numeric values as credits, for example `25 cr`. |
| `Created` | `created_at` | Display a compact timestamp preview such as `2026-05-29 00:00`. |
| `ID` | `order_id`, `listing_id`, `id` | Keep visible for follow-up commands. |

The table should omit no column from this list merely because a particular row has an empty value. Stable columns matter more than per-row compactness.

### Display Formatting

Use small display-only row fields before calling `printCompactTable`, following existing display-module patterns:

- `item_display`
- `open_quantity_display`
- `price_display`
- `fee_display`
- `created_preview`

Credit formatting should reuse the local market `formatCredits(number)` behavior. Non-numeric price or fee values should fall back to their raw string value rather than becoming `NaN`.

Timestamp preview should follow the existing display convention used by social and notification formatters: ISO timestamps become `YYYY-MM-DD HH:mm` or `YYYY-MM-DD HH:mm:ss`; unrecognized values are printed as-is.

### Empty State

If `orders` is an empty array, keep the same high-level shape:

```text
=== Orders ===
Earth Station | personal | newest | 0 orders | page 1/1
Showing personal market orders.
(None)
```

This keeps context visible even when filters return no rows.

### Golden Output

Update the existing high-value `view_orders` golden table output to lock the new default. JSON, YAML, and compact JSON goldens should remain unchanged unless the fixture itself changes.

The fixture already contains the fields required to exercise the new columns:

- `item_name`
- `remaining`
- `filled_quantity`
- `listing_fee`
- `created_at`
- response-level context fields

## Test Plan

Use focused formatter and golden verification:

- Add or update a formatter test that confirms `view_orders` renders `Open/Qty`, `Filled`, `Fee`, `Created`, and the context line.
- Confirm the table prefers `item_name` over `item_id`.
- Confirm order ID remains visible.
- Confirm empty `orders` output still renders context and `(None)`.
- Update `src/golden-output/renderer/view_orders.table.stdout`.
- Run `bun test src/output-golden.test.ts`.
- Run `bun test src/formatter.test.ts`.
- Run `bun run typecheck`.

Full-suite `bun test` is optional but recommended because this is a display-only change with golden coverage.

## Risks

- The table becomes wider. This is intentional, but the implementation should keep column labels short and avoid adding less actionable fields such as `order_type` by default.
- Timestamp formatting may differ slightly from raw JSON. This is acceptable for human output as long as machine output remains unchanged.
- If future server responses add wider item names or long IDs, the existing compact table helper will truncate cells at its normal maximum width.

## Open Questions

- None. The approved design is the hybrid summary plus richer table.

## Acceptance Criteria

- Default `view_orders` human output includes context, open quantity, filled quantity, price, fee, created time, and order ID.
- The output uses item names when available.
- Machine-readable output remains unchanged.
- Golden output reflects the new default table.
- Focused formatter and golden tests pass.
