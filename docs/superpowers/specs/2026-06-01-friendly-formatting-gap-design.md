# Friendly Formatting Gap Design

## Goal

Find and fix curated commands whose successful table output still falls through to the raw `=== Response ===` JSON fallback instead of a human-friendly formatter. The immediate trigger was `get_empire_info`, which was recently fixed with a command-specific formatter.

## Audit Result

The audit compared curated command names, command-scoped formatter coverage, generic shape fallback coverage, and OpenAPI `structuredContent` response shapes. A simple command-scoped formatter count is too broad: 174 curated commands do not have a command-scoped formatter, but many are action commands that render through generic `message` output or list-shaped responses that render through the generic table fallback.

The likely remaining fallback set is 20 commands:

- `captains_log_get`
- `create_faction`
- `faction_get_invites`
- `faction_intel_status`
- `faction_trade_intel_status`
- `faction_visit_room`
- `forum_get_thread`
- `get_commands`
- `get_guide`
- `get_map`
- `get_system_agents`
- `get_tax_estimate`
- `read_note`
- `reload`
- `salvage_wreck`
- `scan`
- `set_colors`
- `set_status`
- `undock`
- `view_completed_mission`

This list is heuristic, not a live-server capture. It is based on the cached OpenAPI spec and the current renderer behavior.

## Scope

Fix table/text human output for the 20 likely fallback commands using local fixtures and golden tests. Preserve machine-readable output behavior for `--json`, `--structured`, `--format=json`, `--format=yaml`, compact JSON, `--field`, `--fields`, and `--jq`.

Do not change command routing, argument parsing, API payloads, session behavior, or live API metadata generation.

## Recommended Approach

Use a mixed formatter strategy:

- Add targeted command-scoped formatters for information-rich shapes where users need layout and labels.
- Add a narrow generic scalar/action fallback for simple structured responses that contain a small set of scalar fields such as `action`, `success`, IDs, or timestamps and no nested objects or arrays.
- Extend existing generic list fallback keys where the response is clearly a list shape with an uncovered collection key, such as `commands`, `systems`, `agents`, `invites`, `replies`, or `guides`.

This avoids writing repetitive one-off formatters for tiny success responses while keeping richer data readable.

## Formatter Groups

Add or extend focused display modules as follows:

- Social/document formatters: `captains_log_get`, `read_note`, `faction_visit_room`, `forum_get_thread`, `get_guide`.
- Faction/intel formatters: `faction_get_invites`, `faction_intel_status`, `faction_trade_intel_status`.
- Navigation/reference formatters: `get_map`, `get_system_agents`, `get_commands`.
- Economy/combat action details: `get_tax_estimate`, `reload`, `salvage_wreck`, `scan`, `view_completed_mission`.
- Generic scalar/action fallback: `create_faction`, `set_colors`, `set_status`, `undock`, and similar future scalar-only responses.

Where a command has a natural table shape, prefer `printCompactTable`. Where it has a document shape, print a short labeled header and body text. Where it has a mixed nested object shape, print summary lines first and compact tables for nested arrays or maps only when they are important.

## Data Flow

Rendering should continue through the existing path:

1. `renderResponse` extracts `structuredContent`.
2. `displayStructuredResultInternal` applies command-scoped formatters first.
3. Shape fallback formatters run after command-scoped formatters.
4. Raw `=== Response ===` remains as the last resort.

The new work should not bypass projections or machine-readable modes. Formatters should only affect table/text output after JSON/YAML/projection handling has already been skipped by the renderer.

## Error Handling

Formatters should return `false` when required shape markers are absent so a later formatter can try. They should avoid printing `undefined`, `NaN`, or `[object Object]`. Unknown optional fields can be omitted from human output; complete raw data remains available through machine-readable modes.

The generic scalar/action fallback must be conservative. It should only match responses with scalar values and no nested records or arrays, so it does not hide complex data behind an oversimplified display.

## Testing

Use TDD for implementation.

Add a failing coverage test or golden fixture first for each formatter group. The test should demonstrate that the command no longer emits `=== Response ===` in table output.

Update local fixtures under `src/display/*fixtures.ts` and add each covered command to `highValueCommandFixtures`. Regenerate committed goldens with targeted `UPDATE_GOLDENS=1 GOLDEN_ONLY=... bun test src/output-golden.test.ts` runs, then run:

```bash
bun test src/output-golden.test.ts
bun test src/test-support/formatter-golden-coverage.test.ts
bun test
```

If full `bun test` is too slow or blocked, run the focused suites above and report the remaining verification gap.

## Open Decisions Resolved

Treat the 20-command audit set as the implementation target. If an individual fixture shows a command is already covered by an existing formatter, document why and add or adjust coverage so the audit does not regress silently.

Prefer readable, compact human output over exhaustive field dumps. Exhaustive data is already available through JSON/YAML/structured modes.
