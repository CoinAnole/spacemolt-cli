# Machine Output Preserves Server Data Design

Date: 2026-06-19

## Summary

SpaceMolt CLI machine-readable output must preserve server response data by default. The CLI currently applies display filters and structured-output normalization before rendering `--json`, `--structured`, and some projection output. That makes automation lose fields or rows even though the server returned them.

The design changes the renderer boundary so display filters and local enrichments apply only to human table/text output. Full machine output uses the unmodified server response. User-requested projections such as `--jq`, `--field`, `--fields`, `--keys`, and `--search*` remain explicit projections and may return subsets because the user asked for them.

## Problem

The CLI has built-in JSON parsing, projection, and search tooling. Machine output should be the most complete source of data available to callers. Today several paths reduce or rewrite that data before JSON rendering:

- `renderResponse()` computes `filteredResponse` before the JSON branch, so `--json` and `--structured` inherit display filters.
- `applyDisplayFilters()` filters `storage view`, `view_market`, and `get_cargo` structured collections based on payload fields such as `item_id`, `items`, `search`, `top`, and `show_empty`.
- `normalizeStructuredResultForOutput()` truncates nearby player/NPC arrays for `get_status`, `get_location`, and `get_nearby`.
- `normalizeStructuredResultForOutput()` rewrites `list_ships` entries into canonical fields, replacing the original `location` value with a normalized object.

These behaviors are useful for readable tables, but they are the wrong default for automation.

## Goals

- `--json` prints the full API response envelope after command execution, without display filters or structured truncation.
- `--structured` prints the full server `structuredContent` object without display filters, local enrichments, nearby truncation, or canonical rewrites.
- Projection options operate on unmodified server structured data unless the projection itself selects a subset.
- Human table/text output keeps existing ergonomic behavior: storage and market filters narrow rendered tables, cargo output stays sorted and filtered, and local display enrichments still improve readability.
- Existing error JSON behavior remains unchanged.
- Tests make the data-preservation boundary explicit.

## Non-Goals

- Do not remove projection behavior. `--jq`, `--field`, `--fields`, `--keys`, and `--search*` are explicit user requests and can produce partial output.
- Do not change the outgoing API payload. Client-only fields should still be stripped before requests where they are display-only.
- Do not change human table/text formatting semantics except where required to keep machine-output logic separate.
- Do not remove helper functions if table output still uses them.
- Do not fetch live API data for verification.

## Approaches Considered

### Recommended: Split Human And Machine Render Inputs

Keep the server response as the source for machine output. Build a separate human-display response after the machine-output branch has been handled.

Tradeoffs:

- Best preserves automation behavior.
- Smallest behavioral surprise: `--json` and `--structured` mean "what the server returned".
- Requires tests that update the current expectation that JSON output is filtered.
- Requires careful ordering in `renderResponse()` so ID caching still sees the original response.

### Alternative: Add A New Raw Flag

Keep current behavior and add a `--raw-structured` or similar flag for unfiltered output.

Tradeoffs:

- Avoids breaking existing users relying on filtered JSON.
- Keeps the surprising default that machine output hides data.
- Adds another output mode despite existing projection tooling already covering filtering.

This is rejected because machine-readable defaults should favor completeness.

### Alternative: Preserve JSON But Keep Structured Normalization

Make `--json` raw, but leave `--structured` normalized and truncated.

Tradeoffs:

- Full envelopes become reliable.
- `--structured` remains convenient for stable normalized shapes.
- Still violates the principle that structured automation output should not hide server fields or rows.

This is rejected because the user-facing problem applies to both `--json` and `--structured`.

## Design

### Render Flow

`renderResponse()` should keep two separate response values:

- `serverResponse`: the original API response returned by the client.
- `displayResponse`: a derived response used only for human rendering.

The high-level flow should be:

1. Handle JSON/structured error envelopes as today.
2. Cache IDs from `serverResponse`.
3. If machine output without projections was requested:
   - For `--structured`, print `serverResponse.structuredContent` directly when present.
   - For `--json` or `--format json`, print `serverResponse` directly.
   - Do not call display filters or structured normalization first.
4. If projection output was requested:
   - Evaluate the projection against unmodified server structured data when structured content is available.
   - Keep existing projection formatting rules.
   - Do not apply display filters or structured truncation before projection.
5. For human table/text output:
   - Apply display filters and display enrichments.
   - Render using the existing formatter dispatch.

### Display Filters

`applyDisplayFilters()` should be renamed or documented as human-only, for example `applyHumanDisplayFilters()`. It should be called only from the human-output branch.

The existing behavior remains appropriate for human output:

- `storage view` may filter visible `items` by `item_id`, `items`, or `search`.
- `view_market` may filter visible market rows by item.
- `get_cargo` may hide empty stacks, sort by quantity, filter by `items`, and apply `top`.

These filters should not affect `--json`, `--structured`, `--jq`, `--field`, `--fields`, `--keys`, or `--search*`.

### Structured Output Normalization

`normalizeStructuredResultForOutput()` should stop being part of full machine output. The limiting behavior inside it should be moved, renamed, or reserved for human display helpers if still needed.

Expected changes:

- Remove nearby collection limiting from `--structured`, `--format json`, `--format yaml`, and projection inputs.
- Remove `list_ships` canonical rewrites from full `--structured` output. If canonical fields are useful for table rendering, add them only to a display view model.
- Preserve existing scalar JSON/YAML formatting behavior; only the source object changes from normalized to raw.

### Projection Semantics

Projection options remain explicit user filters. They should operate on raw structured data:

- `--jq .cargo[0]` returns the selected cargo element from raw `structuredContent`.
- `--fields player.name,ship.fuel` returns only those fields, because the user requested those paths.
- `--search fuel`, `--search-keys fuel`, `--search-values fuel`, and `--search-regex fuel` search raw structured output and print matching paths/values.

If a command has no `structuredContent`, existing fallback behavior should continue.

### Local Enrichments

Local enrichments are human-only unless they are already part of server data:

- `enrichStorageViewDisplayResponse()` should only add `target` for human display.
- `enrichCarrierLoadDisplayResponse()` should only add cached ship names/classes and derived bay slot aliases for human display.
- Display-only aliases from `postActionDetailsViewModel()` remain part of table/text rendering, not full machine output.

### Errors And Notifications

Error handling should remain unchanged:

- `--json` and `--structured` error output should keep printing the full error envelope.
- Human errors should keep formatted messages and cached ID suggestions.

Notifications should remain unchanged:

- Human output may print notifications before the formatted result.
- `--json` prints notifications as part of the full response envelope when present.
- `--structured` prints only `structuredContent`, as it does today.

## Test Plan

Update or add tests in `src/response-renderer.test.ts` and `src/formatter.test.ts`:

- `--json` storage view with `item_id` keeps all returned `structuredContent.items`.
- `--structured` storage view with `search` or `items` keeps all returned `items`.
- `--json` `view_market` with an item payload keeps all returned market items.
- `--json` `get_cargo top=1` keeps all returned cargo rows and preserves server order.
- `--json` `get_cargo` with `items` and `show_empty` keeps all returned cargo rows.
- `--structured get_nearby` keeps all nearby players/NPCs, not just the first 10.
- `--format yaml get_status` keeps all nearby players/NPCs.
- `--structured list_ships` preserves server fields exactly, including the original `location` value.
- Projection tests confirm `--jq` and `--fields` still intentionally select subsets from raw structured data.
- Human table tests confirm storage, market, and cargo display filters still work.

Run:

```bash
bun test src/response-renderer.test.ts src/formatter.test.ts
bun test src/output-golden.test.ts
bun run typecheck
bun run lint
bun test
```

## Risks

- Some users may rely on `--json` with payload filters to reduce output size. They should switch to `--jq`, `--fields`, or `--search*`, which are explicit projection tools.
- Golden outputs may need updates if existing high-value JSON cases cover normalized nearby or `list_ships` data.
- The implementation must avoid changing outgoing request payload handling. Client-only fields are still removed before API calls where required.

## Open Questions

- None. The requested behavior explicitly prefers full server data for machine output and human-only display filtering.

## Acceptance Criteria

- Full machine output does not lose rows, truncate arrays, or rewrite fields returned by the server.
- Explicit projections still work and remain the supported way to select subsets.
- Human table/text output keeps current display filtering and enrichment behavior.
- The full local test suite passes.
