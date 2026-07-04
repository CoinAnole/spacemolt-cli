# OpenAPI Report System Refresh Design

Date: 2026-07-04

## Summary

SpaceMolt gameserver v0.471.0 changed the OpenAPI response surface substantially. The fixture/schema report has already been updated to handle the new `V2Response` + `structuredContent` + `details` response shapes by scoring candidate schemas. The remaining report systems should use the same resolver behavior instead of maintaining separate schema traversal rules.

The design updates `report:curated-commands` and `report:openapi-consistency` so they produce reviewable signal after v0.471.0:

- `report:curated-commands` should default to actionable command-contract drift, not expected curated metadata differences.
- `report:openapi-consistency` should reuse the fixture-schema response resolver, avoid generic-envelope false positives, and tighten prose field extraction.
- shared schema and low-confidence fuzzy checks should remain available, but they should not dominate default output.

The reports should remain diagnostic for this change. Baseline-backed or CI-gated behavior can be considered after the default output is trustworthy.

## Problem

The current report outputs are too noisy for v0.471.0 triage.

`report:curated-commands` compares every curated command against the generated command config and reports all differences equally. On the current v0.471.0 spec, all 261 curated commands have differences. Most are expected and intentional:

- curated categories versus `Generated API`
- friendly command names versus generated route-derived names
- curated positional argument labels such as `mission_id` versus schema fields such as `id`
- curated usage and description text

The smaller actionable surface is mixed into that noise: route defaults, missing generated routes, request schema field differences, enum drift, type drift, and positional drift.

`report:openapi-consistency` has the opposite failure mode. It does deeper fuzzy analysis, but it uses separate schema walking and broad prose mining. With v0.471.0, it reports high-severity response-prose findings against generic schemas such as `V2Response` and `V2GameState`. Examples include synthesized or non-field terms such as `Base_ID`, `scan_scan`, `rate_limited`, `session_invalid`, and other operation names or error codes. Those findings reduce trust in the report.

The root issue is duplicated schema semantics. `report:fixture-schemas` now understands the v0.471.0 response envelope and candidate schemas. The other reports should share that behavior and classify findings by usefulness.

## Goals

- Make report output useful for OpenAPI review after v0.471.0.
- Share response schema resolution logic across report systems where practical.
- Keep curated-command report defaults focused on contract drift.
- Preserve access to cosmetic/friendly curated metadata differences behind explicit flags.
- Mark client-only CLI schema extensions separately from server schema drift.
- Reduce false positives from generic envelopes and loose prose-derived terms.
- Keep `report:openapi-consistency` high-recall, but make default findings reviewable.
- Add regression tests for v0.471-style response shapes and report filtering.
- Keep all report commands local and based on `spacemolt-docs/openapi.json` unless the caller explicitly chooses other inputs.

## Non-Goals

- Do not change the cached OpenAPI spec.
- Do not regenerate API metadata as part of this design.
- Do not update golden output fixtures except where implementation tests require expected report text.
- Do not turn these reports into CI gates in this change.
- Do not remove high-recall checks entirely; low-confidence checks should remain opt-in or clearly classified.
- Do not make live API requests.
- Do not redesign command parsing, dynamic command dispatch, or output rendering.

## Approaches Considered

### Recommended: Shared Schema Resolution Plus Classified Output

Reuse the schema resolution and candidate concepts from `src/test-support/fixture-schema-compare.ts`, then update each report to classify findings by actionability.

Tradeoffs:

- Fixes the v0.471.0 response-shape gap in the consistency report.
- Keeps the curated-command report useful by default.
- Reduces duplicated schema traversal logic.
- Adds moderate refactoring in test-support utilities.

This is the recommended approach because it addresses both correctness and usability.

### Alternative: Add Suppression Lists

Add targeted suppressions for known noisy fields, schemas, and curated metadata differences.

Tradeoffs:

- Fast to implement.
- Leaves duplicated schema logic in place.
- Will likely drift again on the next OpenAPI response-shape change.

This is acceptable only as a narrow compatibility aid after the shared resolver is in place.

### Alternative: Baseline And Gate Reports

Add reviewed baselines and strict modes for curated-command and OpenAPI-consistency reports.

Tradeoffs:

- Useful once the reports are high-signal.
- Premature while current defaults are noisy.
- Would force reviewers to bless false positives.

This should wait until after the signal/noise cleanup.

## Design

### Shared Schema Utilities

Create a small shared OpenAPI schema utility module or move the existing reusable pieces out of `fixture-schema-compare.ts` into a neutral test-support module.

The shared utilities should cover:

- `$ref` resolution
- `allOf` merging
- effective schema lookup
- success response schema resolution
- `V2Response` envelope unwrapping
- `structuredContent` and `structuredContent.details` discovery
- `oneOf` and `anyOf` branch expansion where a caller needs candidates
- recursive property-name collection across properties, items, and branches

The fixture-schema report should keep its candidate scoring behavior. The consistency report can use the same candidates to determine which route-specific response schema should be checked before it mines prose fields.

Do not make this module depend on command fixtures. It should accept an OpenAPI document and schema nodes, then return resolved schemas or candidates.

### Curated Command Report

Change `report:curated-commands` from "all differences are equal" to classified findings.

Default output should emphasize actionable contract drift:

- curated `apiRoute` missing from generated metadata
- route method/tool/action drift
- route default drift
- request schema field missing on either side
- request schema type drift
- request schema enum drift
- required field drift
- positional index drift

Expected curated differences should be hidden by default or summarized separately:

- command name differs from generated route name
- category differs from `Generated API`
- description differs from OpenAPI summary
- usage differs from generated usage
- curated arg labels differ from raw generated field order

Add an explicit flag such as `--include-cosmetic` to show these expected metadata differences.

Client-only schema extensions should be classified separately. Examples include display or filtering fields such as `search`, `summary`, `top`, `show_empty`, and `items` when they are intentionally handled by the CLI before or after the API call. The report should label them as `client-only` instead of treating them as server schema drift.

Suggested finding kinds:

```ts
type CuratedCommandDifferenceKind =
  | 'missing-generated-route'
  | 'route-contract'
  | 'schema-contract'
  | 'schema-enum'
  | 'schema-required'
  | 'schema-positional'
  | 'client-only'
  | 'curated-cosmetic';
```

The formatter should render a summary first:

```text
Curated Command vs Generated OpenAPI Command Divergence Report
Generated for 261 curated command(s)
Actionable commands: 12
Cosmetic-only commands: 249
Client-only fields: 8
```

By default, command sections should appear only when they have actionable differences. Cosmetic-only sections should appear with `--include-cosmetic`.

### OpenAPI Consistency Report

Update `report:openapi-consistency` to use route-bound response schemas rather than broad component scans for default response-prose findings.

Default response-prose checks should:

- resolve the route's 200 response schema using shared utilities
- unwrap `structuredContent`
- inspect `details` or branch candidates when route prose clearly describes an action-result payload
- compare extracted field candidates against the selected route response field set
- include the selected schema name or candidate label in evidence

Component-wide checks should avoid generic envelopes by default. Suppress or downgrade broad schemas such as `V2Response` and `V2GameState` because their descriptions mention cross-cutting concepts, error codes, or partial state. These checks can remain available behind a flag such as `--include-component-prose` or as info-level findings.

Prose extraction should be tightened:

- prefer JSON example keys
- accept quoted snake_case or camelCase identifiers
- accept explicit field lists that use schema-like tokens
- suppress enum values, operation/action names, route leaf names, auth/session error codes, and known error codes
- suppress synthesized compounds unless they appear in a field-list, JSON, or strongly code-like context

The existing `overbroad-shared-schema` analyzer should remain available, but low-confidence shared-shape findings should stay out of default output unless requested with `--include-low` or an equivalent flag. Current v0.471.0 request bodies are direct object schemas, so the default report should not be dominated by speculative shared-schema analysis.

### CLI Flags And Output

Keep existing flags:

- `--only`
- `--json`
- `--include-low` / `--low-confidence`
- `--spec`

Add or refine flags:

- `report:curated-commands --include-cosmetic`
- `report:curated-commands --all` as a convenience alias for actionable plus cosmetic output
- `report:openapi-consistency --include-component-prose` if component-wide response prose checks remain useful

JSON output should preserve existing field names where possible and add classification fields rather than replacing current data. Text output should lead with counts and only print detail sections that match the selected verbosity.

### Error Handling

Schema resolution failures should not crash diagnostic reports. They should produce a finding or diagnostic note with:

- route or schema name
- candidate label, if known
- short failure message
- suggestion to inspect response schema shape

Report scripts should continue to exit zero by default.

## Data Flow

### Curated Commands

1. Load curated command overrides and bundled generated OpenAPI metadata.
2. For each curated command, build the curated and generated command configs.
3. Compare route contract fields.
4. Compare request schema contract fields.
5. Classify curated-only fields as either client-only or schema drift.
6. Classify expected metadata differences as cosmetic.
7. Filter output according to flags.
8. Render summary-first text or full JSON.

### OpenAPI Consistency

1. Load the OpenAPI spec.
2. For each matching route, resolve the route response schema through shared utilities.
3. Build the response field set from the selected response candidate.
4. Extract high-confidence prose candidates from operation descriptions and examples.
5. Suppress non-field terms using route, request, operation, enum, and known-code context.
6. Emit route-bound findings when a candidate is absent from the selected response field set.
7. Optionally run component-wide prose checks and low-confidence shared-schema checks.
8. Render findings with schema candidate evidence and summary counts.

## Testing

Add focused coverage rather than broad snapshot churn.

### Shared Schema Utilities

- resolves `$ref`
- merges `allOf`
- unwraps `V2Response` to `structuredContent`
- discovers `structuredContent.details`
- expands `oneOf` and `anyOf` branches
- collects nested field names from properties, arrays, and branches

### Curated Command Report

- default output excludes cosmetic-only command differences
- `--include-cosmetic` includes command-name/category/description/usage differences
- client-only fields are classified as `client-only`
- enum/type/required/positional drift remains actionable
- summary counts distinguish actionable, cosmetic-only, and client-only differences

### OpenAPI Consistency Report

- v0.471-style `allOf` response envelope resolves to the route-specific response schema
- `structuredContent.details` fields are considered present when route prose describes details output
- generic `V2Response` and `V2GameState` component prose does not produce high-severity default findings
- JSON example keys still produce high-confidence request/prose mismatch findings
- enum values and error codes are suppressed as response field candidates
- `--include-low` and any component-prose flag opt into broader checks

### Real Spec Smoke Tests

- `buildConsistencyReport(loadOpenApiSpec())` completes on v0.471.0.
- `compareCuratedCommandsToGenerated()` reports fewer default command sections than total curated commands.
- `report:fixture-schemas` behavior remains unchanged for candidate selection.

## Rollout

1. Extract shared schema utilities while preserving fixture-schema behavior.
2. Update `report:curated-commands` classification and formatter defaults.
3. Update `report:openapi-consistency` route-bound response schema checks and prose suppression.
4. Run focused tests:
   - `bun test src/test-support/curated-command-compare.test.ts`
   - `bun test src/test-support/openapi-consistency.test.ts`
   - `bun test src/test-support/output-golden.test.ts`
5. Run diagnostic reports manually and review counts:
   - `bun run report:curated-commands`
   - `bun run report:curated-commands --include-cosmetic`
   - `bun run report:openapi-consistency`
   - `bun run report:fixture-schemas`
6. After the default reports have reviewable counts, make an explicit follow-up decision on whether curated-command contract drift or consistency findings should get a reviewed baseline or strict mode.

## Open Questions

- Which client-only schema extension names should be hard-coded first, and should command configs eventually mark them explicitly?
- Should `report:curated-commands --all` be added, or is `--include-cosmetic` sufficient?
- Should component-wide response prose checks remain available by default as info findings, or only behind `--include-component-prose`?
- After output is cleaned up, should curated-command contract drift get a baseline similar to fixture-schema drift?
