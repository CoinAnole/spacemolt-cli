# Craft Routing Help and Commission Receipts Design

Date: 2026-07-17

## Summary

SpaceMolt gameserver v0.523.0 through v0.523.2 changed two user-visible workflows that the CLI only partially reflects. Craft and recycle routing now includes ally-granted facilities, and the `cheap` preset chooses the lowest fee the player would actually pay instead of comparing public rental prices. The regenerated OpenAPI metadata contains the corrected descriptions, but curated command overrides replace them with stale help.

Shipyard commission completion now produces a `ship_commission_complete` notification and a durable `ship.commission_completed` action-log entry. Both receipts connect the completed `commission_id` to the delivered `ship_id`. The CLI's generic notification fallback preserves the fields, but there is no dedicated human-readable presentation or regression fixture for this important handoff.

This design synchronizes curated craft and recycle help with the current routing contract and adds focused, readable commission-receipt presentation across inline notifications, notification polling, and action-log output. It introduces no receipt-specific transformation in machine-readable modes; the existing notification summarization policy and `--raw-notifications` escape hatch remain unchanged.

## Problem

The curated `craft` and `recycle` overrides in `src/command-overrides-core.ts` currently describe `fast` and `cheap` together as global routing presets that may choose a paid public rental. That is no longer true for `cheap`. Owned and faction facilities cost the player zero, so they win fee comparison. The help also omits ally-granted facilities from default and `prefer_own` routing. Because curated descriptions and schema extensions override generated metadata, regeneration alone cannot correct local help. Existing assertions in `src/command-metadata.test.ts` enforce the obsolete combined wording.

When a shipyard commission finishes, the commission record disappears as the delivered hull is created. The new receipt is therefore the authoritative link between the old commission and the new ship. Current rendering has three relevant paths:

- inline response notifications use `src/notifications.ts`
- explicit `notifications` and `get_notifications` table output uses `src/display/notifications.ts`
- action-log table output uses `src/display/social.ts`

Unknown notification data is preserved by generic formatting, but the result is less readable than a dedicated receipt and is not protected by high-value fixtures. The action-log table primarily shows summary metadata and does not explicitly project commission and ship identifiers from `entry.data` into columns.

## Goals

- Make curated craft and recycle help accurately distinguish `fast`, `cheap`, and `prefer_own`.
- Document ally-granted facilities in default and ownership-preferring routing.
- Preserve the rule that recycling always requires a real recycler and cannot use a workshop.
- Render `ship_commission_complete` notifications as concise, readable receipts.
- Show both `commission_id` and `ship_id` in inline notifications, notification polling, and action-log tables.
- Add schema-shaped high-value fixtures for `ship_commission_complete` and `ship.commission_completed`.
- Keep receipt data structured in JSON, YAML, structured, compact, field, fields, and jq output modes instead of replacing it with the human-readable receipt string.
- Preserve the existing notification summarization policy, including exact raw notification data under `--raw-notifications`.
- Retain defensive generic formatting for partial, malformed, or unfamiliar notification shapes.
- Verify fixture/schema consistency using the cached v0.524.0 OpenAPI document without live API requests.

## Non-Goals

- Do not change craft or recycle request payloads, routing behavior, or server-side facility selection.
- Do not add new presets, command aliases, or positional arguments.
- Do not change notification polling, clearing, ordering, retention, or summarization policy.
- Do not persist commission receipts client-side.
- Do not redesign commission commands or infer completed ships by comparing `list_ships` output.
- Do not redesign action-log tables to expose every arbitrary key in `entry.data`.
- Do not transform or enrich machine-readable response objects.
- Do not refactor unrelated command help, notification handlers, or social formatters.
- Do not fetch the live OpenAPI specification.

## Approaches Considered

### Recommended: Dedicated Receipt Formatting and Targeted Help Synchronization

Update the curated help at its source, add a small pure receipt-formatting helper shared by both notification presentation paths, and project the two receipt IDs into conditional action-log columns. Promote representative notification and action-log payloads into the existing golden fixture matrix.

Tradeoffs:

- Guarantees that both IDs remain readable regardless of server summary wording.
- Keeps inline and polled notification wording consistent.
- Adds only narrow event-specific behavior and follows existing formatter boundaries.
- Requires intentional golden changes for notification and action-log fixtures.

This is the selected approach.

### Alternative: Fixture-Only Coverage of Generic Formatting

Add receipt payloads to fixtures and assert that existing generic formatting exposes both IDs without adding dedicated presentation.

Tradeoffs:

- Produces a smaller implementation diff.
- Preserves current behavior exactly.
- Leaves a high-value operational receipt as compact JSON or dependent on server summary text.
- Makes inline and table output less scannable than other known notification types.

This is rejected because the receipt is the only durable mapping from a completed commission to its delivered ship and merits explicit presentation.

### Alternative: Generic Nested Event-Data Columns

Redesign notification and action-log tables to discover and render arbitrary nested data fields for every event type.

Tradeoffs:

- Could expose more future server fields without event-specific work.
- Risks unstable, overly wide tables and accidental output churn whenever schemas add fields.
- Expands the task beyond the two known receipt identifiers.

This is rejected as unnecessary scope.

## Design

### 1. Curated Craft and Recycle Help

Update the `craft` and `recycle` entries in `src/command-overrides-core.ts`. Both the top-level command description and the `schemaExtensions.preset.description` text must describe the presets independently.

For craft:

- Default auto-routing prefers the player's own facility, then a faction facility, then an ally-granted facility, then a public rental, and finally the Station Workshop when no eligible real facility is available.
- `fast` selects the soonest-finishing eligible venue globally, so an idle paid public rental may beat a busy owned facility.
- `cheap` selects the lowest fee the player would actually pay. Owned, faction, and ally-granted facilities are free to the player and therefore beat paid rentals; normal ownership priority resolves equal-fee choices. The text must not claim that `cheap` and `fast` share identical global selection semantics.
- `prefer_own` stays on the player's own, faction, or ally-granted facility when one can run the job, and uses a public rental only when none of those facilities is available.
- `workshop` continues to force hand-crafting.

For recycle:

- Default auto-routing prefers the player's own recycler, then a faction recycler, then an ally-granted recycler, then a public rental.
- `fast`, `cheap`, and `prefer_own` use the same distinctions as craft for eligible recyclers.
- Recycling always requires a real recycler. No help text may imply that the Station Workshop is an eligible fallback.

The curated prose should remain concise enough for local help while matching the generated OpenAPI contract. Tests should assert each semantic claim separately instead of locking one long sentence verbatim.

### 2. Shared Commission Receipt Formatting

Add a small pure helper module, `src/ship-commission-receipt.ts`, responsible only for validating and formatting commission-completion data. It accepts `unknown` and returns a formatted string or `undefined`.

The helper activates only when the value is an object containing non-empty scalar `commission_id` and `ship_id` values. The formatted receipt must always name both IDs. When present and valid, it may also include:

- `ship_name`
- `ship_class`
- `base_name`
- `base_id`
- `tick`

The output should be concise and operationally useful, for example:

```text
Commission commission-1 delivered Surveyor (prospector), ship ship-42, at Earth Station (earth_station)
```

The exact punctuation may follow existing CLI style, but the labels and identifiers must be unambiguous. The helper must not emit empty labels, `undefined`, `NaN`, `[object Object]`, or stringified arbitrary objects.

Keeping this logic in a pure shared module prevents the inline and table notification paths from drifting while avoiding a general notification architecture change.

### 3. Inline Notification Presentation

Register a `ship_commission_complete` handler in `src/notifications.ts`. The handler calls the shared helper and emits one human-readable receipt line.

If the helper returns `undefined`, the handler emits no lines. The existing `formatNotification` control flow then uses generic formatting, preserving any valid fields present in a partial or future payload. This fallback behavior is important because malformed server notifications must never make command rendering fail.

The existing notification type coverage test compares known cases against `NOTIFICATION_TYPES`. Add a schema-shaped case containing both IDs and optional ship/station context so the dedicated handler is covered automatically.

### 4. Notification Poll Table Presentation

Extend `formatNotificationMessage` in `src/display/notifications.ts` with a `ship_commission_complete` branch that calls the same shared helper before sender/message and compact-JSON fallback logic.

For a valid receipt, the table's existing `Message` column contains the concise formatted receipt. The existing Timestamp and Type columns remain unchanged. For invalid or partial receipt data, processing continues through the current generic rules.

This change affects only human-readable table/text presentation. Machine formats never substitute this formatted string for receipt data. Existing notification summarization remains in force, and `--raw-notifications` continues to expose the exact notification objects.

### 5. Action-Log Receipt Presentation

Keep the existing `get_action_log` table and add targeted projection of receipt identifiers from `entry.data` into the row view model:

- `commission_id`
- `ship_id`

Add `Commission` and `Ship` columns only when at least one rendered row has a usable corresponding field. The values come from top-level entry fields first if the API ever promotes them, then from scalar values in `entry.data`. Do not spread all of `entry.data` into the row and do not add arbitrary dynamic columns.

The `ship.commission_completed` fixture includes both identifiers in `data`, matching `ActionLogData` in the OpenAPI schema. Its summary remains useful prose, but identifier visibility must not depend on that prose containing the IDs.

This targeted projection may also display these columns for a future action-log event that uses the same documented field names. That is acceptable because the columns describe stable identifiers rather than event-specific prose.

### 6. Fixtures and Golden Output

Extend `src/display/notifications.fixtures.ts` with a schema-shaped `ship_commission_complete` item in `getNotificationsFixture`. The item includes all required fields from `Notification_ship_commission_complete`:

```json
{
  "tick": 901400,
  "commission_id": "commission-1",
  "ship_id": "ship-42",
  "ship_class": "prospector",
  "ship_name": "Prospector",
  "base_id": "earth_station",
  "base_name": "Earth Station"
}
```

Update fixture counts and pagination metadata consistently.

Extend `actionLogFixture` in `src/display/social.fixtures.ts` with a `ship.commission_completed` entry whose `data` contains at least `commission_id` and `ship_id`, plus any scalar ship/base context the server records. Update total fields consistently.

These existing high-value fixtures already generate table, JSON, YAML, and compact JSON cases. Update only their affected committed goldens. Machine-format goldens gain the new raw fixture objects without presentation-only reshaping; table goldens show the dedicated receipt text and conditional identifier columns.

### 7. Data Flow and Machine-Output Preservation

The notification flow is:

1. The API response remains the source of truth.
2. Inline human notification rendering passes `notification.data` to the shared helper.
3. Explicit notification table rendering passes the same data to the shared helper for the Message cell.
4. Action-log table rendering creates a presentation-only row with selected receipt identifiers projected from `entry.data`.
5. JSON, YAML, structured, compact, field, fields, and jq output keep receipt fields structured and follow the existing notification summarization policy. With `--raw-notifications`, they serialize or project the exact response notification data.

No formatter mutates the source object. The shared receipt helper returns text only and has no state or side effects.

## Error Handling

- Missing or malformed `commission_id` or `ship_id` prevents dedicated receipt formatting and triggers existing generic notification fallback.
- Optional context fields are omitted when absent, empty, non-scalar, or non-finite.
- A malformed `entry.data` value produces blank conditional cells rather than throwing.
- Receipt formatting never changes command exit codes or writes diagnostics to stderr.
- Unknown notification and action-log event types continue using existing behavior.
- Golden guardrails continue rejecting `undefined`, `NaN`, `[object Object]`, and unintended `=== Response ===` fallback output.

## Test Plan

### Command Help

Update `src/command-metadata.test.ts` to verify:

- craft and recycle preset enums remain unchanged
- `fast` documents globally competitive ETA and the possibility of a public rental
- `cheap` documents the fee the player actually pays and free owned, faction, and ally-granted facilities
- default and `prefer_own` routing mention ally-granted facilities
- craft retains the workshop option
- recycle explicitly excludes workshop routing
- rendered local help contains the corrected distinctions
- obsolete `globally fastest or cheapest` assertions are removed

### Receipt Formatting

Update `src/notifications.test.ts` to verify:

- inline `ship_commission_complete` formatting contains both IDs
- valid optional ship and station context is readable
- partial or malformed receipt data falls back without crashing
- notification handler coverage remains exhaustive

Update formatter-focused tests, currently in `src/formatter.test.ts`, to verify:

- `get_notifications` table output contains `commission_id` and `ship_id`
- the commission receipt does not fall back to raw response output
- `get_action_log` table output contains both dedicated identifier columns and values
- unrelated notification and action-log rows remain readable

### Golden and Schema Coverage

Run focused golden updates only for:

- `renderer/get_notifications.*`
- `renderer/get_action_log.*`

Then verify:

```bash
STRICT_FIXTURE_SCHEMA_DIVERGENCES=1 bun test src/output-golden.test.ts
bun run report:fixture-schemas --only get_notifications,get_action_log
```

The schema report must show no new blocking divergence introduced by the receipt fixtures.

### Full Verification

Run:

```bash
bun test src/command-metadata.test.ts src/notifications.test.ts src/formatter.test.ts
bun test src/api-sync.test.ts
bun run typecheck
bun run lint
bun run build
bun test
git diff --check
```

No `LIVE_API_SYNC=1` invocation is required.

## Acceptance Criteria

- Local craft help no longer groups `fast` and `cheap` under the same selection behavior.
- Local craft and recycle help describe `cheap` as the lowest fee the player actually pays.
- Local help includes ally-granted facilities in default and `prefer_own` routing.
- Local help preserves the distinction that craft may use a workshop and recycle may not.
- Inline `ship_commission_complete` output names both `commission_id` and `ship_id`.
- `get_notifications` table output names both identifiers in a concise receipt message.
- `get_action_log` table output shows dedicated Commission and Ship values for `ship.commission_completed`.
- Partial or malformed receipts retain generic fallback behavior without diagnostic-token leakage.
- Receipt presentation does not replace structured identifiers or other receipt fields in machine-readable output.
- Existing notification summarization behavior remains unchanged, and `--raw-notifications` preserves the exact server notification payload.
- Notification and action-log high-value fixtures match the cached OpenAPI response schemas.
- Only intended golden families change.
- Focused tests, strict golden validation, API sync, typecheck, lint, build, and the full test suite pass.
- No live API or OpenAPI request is made.

## Risks and Mitigations

### Help Drifts Again From Generated Metadata

Curated schema extensions can override corrected generated descriptions in future releases.

Mitigation: tests assert semantic distinctions such as actual fee, ally routing, and workshop eligibility rather than only enum membership or generic preset names.

### Receipt Formatting Hides Future Fields

A dedicated one-line receipt cannot display every future additive field.

Mitigation: receipt fields remain structured in machine output, `--raw-notifications` remains available for the exact server stream, and malformed or incomplete receipt shapes fall back to generic formatting.

### Action-Log Tables Become Too Wide

Adding Commission and Ship columns increases width for mixed log pages.

Mitigation: add the columns conditionally, keep them identifier-only, and rely on existing table truncation rules.

### Fixture Changes Create Broad Golden Churn

Adding entries affects four output formats for two high-value fixtures.

Mitigation: use focused golden updates and inspect only the `get_notifications` and `get_action_log` families before running the full manifest check.

## Open Questions

None. The approved scope includes dedicated receipt formatting, targeted action-log columns, corrected curated help, and explicit high-value regression fixtures.
