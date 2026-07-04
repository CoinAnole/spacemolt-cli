# OpenAPI Consistency Schema-Aware Prose Design

Date: 2026-07-04

## Summary

SpaceMolt gameserver v0.471.0 added explicit `requestBody` and `responses[200]` schemas across the v2 OpenAPI routes. That changes how `report:openapi-consistency` should read operation descriptions.

The report should remain high-recall and willing to surface questionable prose. However, it should no longer treat all description prose as a possible response-field reference. The analyzer can now classify prose by contract target:

- request-oriented prose should be checked against the route's `requestBody`
- response-oriented prose should be checked against the route's `responses[200]`
- general gameplay, permission, concept, and routing prose should not be treated as response fields by default

The result should keep the diagnostic spirit of the existing report while using v0.471.0's richer schemas to make the default output more reviewable.

## Problem

Before v0.471.0, operation descriptions carried much of the useful command contract. Broad prose mining was a reasonable strategy because the report had limited structured data to compare against.

After v0.471.0, each route usually has both a request schema and a 200 response schema. The current analyzer still mines operation descriptions broadly, then checks many extracted terms against response schemas. That produces many default `missing-response-field-prose` findings for terms that are not response fields:

- tool names such as `spacemolt_auth`
- permission names such as `manage_roles` and `manage_treasury`
- gameplay skill or concept names such as `drone_control`
- request concepts such as `item_id`, `target_base_id`, or action enum values
- explanatory compounds such as `speed_ticks`, `ammo_item`, or `station_type`
- error or failure concepts such as `insufficient_credits`

These findings are not necessarily useless in a high-recall mode, but they are mixed into the default response-schema report. The root issue is missing target classification. The analyzer sees a description block, extracts field-like terms, and too often assumes those terms belong to `responses[200]`.

## Goals

- Keep `report:openapi-consistency` high-recall.
- Use explicit `requestBody` and `responses[200]` schemas to classify prose by target.
- Preserve true request/prose mismatch findings, especially JSON example keys absent from request schemas.
- Report clear non-example request/prose mismatches when request-oriented prose names a body field absent from `requestBody`.
- Preserve true response/prose mismatch findings when prose explicitly describes response fields.
- Stop default `missing-response-field-prose` findings for permissions, tool names, gameplay concepts, route/action names, and ordinary request prose.
- Keep looser prose mining available behind an explicit flag such as `--include-low` or `--high-recall`.
- Add regression tests for request prose, response prose, and neutral gameplay prose.
- Keep report scripts local and diagnostic; do not add CI gating.

## Non-Goals

- Do not reduce the report to only exact JSON example checks.
- Do not remove high-recall fuzzy extraction.
- Do not require live API access.
- Do not change `report:fixture-schemas` or `report:curated-commands` in this design.
- Do not fix OpenAPI prose or schemas in this change.
- Do not add a reviewed baseline for `report:openapi-consistency`.
- Do not change report exit codes; default scripts should still exit zero.

## Approaches Considered

### Recommended: Schema-Aware Prose Classification

Classify operation prose into request, response, or neutral contexts before producing findings. Compare request candidates only against request schemas and response candidates only against response schema candidates. Keep neutral prose out of default response-field findings.

Tradeoffs:

- Uses the structured v0.471.0 schema data directly.
- Keeps useful high-recall behavior for explicit response prose.
- Reduces default false positives without relying mainly on term blacklists.
- Requires more context-aware text segmentation and tests.

This is the recommended approach.

### Alternative: Suppression Lists

Add deny lists for known permissions, tool names, error codes, route names, and noisy compounds.

Tradeoffs:

- Fast to implement.
- Still useful as a defense-in-depth layer.
- Does not address the underlying request/response classification issue.
- Will drift as new commands and prose patterns are added.

This should be used only as a secondary filter after classification.

### Alternative: Keep Current High-Recall Default

Keep the existing broad extraction behavior and rely on reviewers to ignore false positives.

Tradeoffs:

- Preserves maximum recall.
- Makes v0.471.0 output hard to review.
- Fails to use the new request/response schemas that make better classification possible.

This is rejected for default output.

## Design

### Prose Targets

Introduce an internal target classification for description blocks or sentences:

```ts
type ProseTarget = 'request' | 'response' | 'neutral' | 'ambiguous';
```

The helper should remain internal to the consistency analyzer unless another report needs the same classification later. The important contract is that findings are generated only after this target classification.

Request context indicators:

- canonical `**Example:**` payload JSON
- `payload`, `request`, `parameter`, `accepts`, `pass`, `specify`, `set`, or `use <field>=...`
- prose near request-body examples or command invocation syntax
- field names already declared in the request schema when the sentence does not also describe returned data

Response context indicators:

- `response`, `result`, `returns`, `returned`, `structuredContent`, `details`
- `includes`, `contains`, `has`, or `shows` when paired with `field`, `fields`, `key`, `keys`, `payload`, `result`, or `response`
- explicit field lists such as `returns carried_ships, bay_used, and bay_capacity fields`
- display/report verbs such as `shows`, `lists`, `reports`, `summarizes`, or `carries` when the same sentence contains field-like candidates or existing response-schema fields
- schema-summary prose such as `taxable_income_to_date, deductible_expenses_to_date, and net_taxable_profit summarize the period`
- prose after a response example, if response examples are added later

Neutral context indicators:

- `Requires <permission>` sentences
- help-route prose such as `Returns documentation for all actions available in spacemolt_auth`
- route/action catalogs
- examples of accepted IDs or enum values
- explanatory gameplay prose that does not claim a response field is returned
- error concepts unless the sentence explicitly says the response contains that error detail

Ambiguous context should stay high-recall but low-confidence. It should be hidden from default output unless the caller opts into low-confidence or high-recall findings.

### Request-Prose Checks

Request-oriented candidates should be compared against `requestBody.content.application/json.schema`.

Keep the existing high-confidence example behavior:

- JSON payload keys absent from request schema produce `prose-field-mismatch`
- request schema aliases or friendly names should continue to be reported when examples use the prose name but the schema uses generic `id`
- the finding should include route, field, example payload, and candidate provenance

New behavior:

- Explicit request prose outside JSON examples should also produce `prose-field-mismatch` when it names a request body field absent from the request schema. Examples include `Pass target_base_id ...`, `Options: scope ...`, `Accepts item_id ...`, and `Use deliver_to=storage ...`.
- Non-example request/prose findings should be lower confidence than JSON example findings unless the prose uses command syntax such as `field=value`, `field:`, or `body {"field": ...}`.
- Non-example request extraction should favor literal field-like tokens already written as snake_case, JSON keys, or command syntax. It should not synthesize ordinary narrative compounds such as `buy order` into request mismatches by default, and quoted example values such as `'fuel'` should remain examples, not fields.
- request-oriented terms must not produce `missing-response-field-prose`
- if a request-oriented term is absent from the request schema but present in the response schema, it is still a request/prose mismatch, not a response mismatch
- ambiguous request-like prose should be hidden from default output and retained only in high-recall mode

### Response-Prose Checks

Response-oriented candidates should be compared against the route's resolved success response schema.

The response field set should use the shared OpenAPI schema utilities already used by the fixture/schema report:

- resolve `$ref`
- merge `allOf`
- unwrap `V2Response.structuredContent`
- expand `structuredContent.details`
- walk `oneOf` and `anyOf` branches
- collect nested property names from objects, arrays, and variants

Response-prose candidates absent from that route-bound response field set produce `missing-response-field-prose`.

Response-context extraction must not depend only on literal words like `response` or `fields`. The current OpenAPI prose often uses domain-facing display verbs, for example `Shows each passenger's ... base fare ...` or `Also reports ... fare_surge ...`. Once a sentence is classified as response-oriented, candidate extraction should be allowed to synthesize normal field compounds from that sentence even when it lacks older extraction cues such as `payload` or quoted JSON.

The finding should include:

- route
- field
- prose excerpt
- candidate provenance
- response candidates checked, such as `structuredContent` and `details`
- primary schema name when available

### Neutral Prose

Neutral prose should not produce default response-field findings.

The analyzer should explicitly suppress common neutral patterns:

- permission sentences: `Requires manage_roles permission`
- tool/help route names: `spacemolt_auth`, `spacemolt_faction`, etc.
- action catalogs: `Actions: types, build, job_add`
- command cross-references: `Use get_system to see connected systems`
- quoted enum or example values: `'fuel'`, `'member'`, `'forward'`
- route leaf names and known operation names

Neutral terms may still be available in high-recall output if they pass existing fuzzy extraction and are marked low-confidence or speculative.

### High-Recall Mode

The report should preserve the current loose behavior behind an explicit opt-in.

Flag behavior:

- keep `--include-low` / `--low-confidence` for backward-compatible opt-in to low-confidence findings
- add `--high-recall` as a clearer alias for the same broad prose-mining behavior

Default output should include:

- high-confidence request example mismatches
- medium-confidence explicit request-prose mismatches
- high-confidence or medium-confidence response-field prose mismatches from response context
- existing high-confidence shared-schema findings

High-recall output may additionally include:

- ambiguous prose candidates
- loose snake_case terms from code-like blocks
- synthesized compounds outside explicit response-field context
- component-wide response prose checks when `--include-component-prose` is also present

### Component Prose

Component-wide response prose scanning should stay opt-in through `--include-component-prose`.

When enabled, generic envelopes such as `V2Response` and broad state containers such as `V2GameState` should be downgraded or clearly labeled because their descriptions may intentionally mention cross-cutting concepts. Route-bound findings should be preferred for default review.

### Formatter Behavior

Text output should keep the existing summary-first shape.

For `missing-response-field-prose`, include the target classification in evidence when useful:

```text
provenance: response field list in response context
response candidates: structuredContent, details
```

For suppressed or low-confidence terms, do not print them in default output. JSON output in high-recall mode can include them as normal findings with `confidence: speculative` or `low`.

### Error Handling

Schema resolution failures should not crash the report. If a route has description prose but no resolvable request or response schema, the analyzer should:

- skip target-specific comparison when the missing schema makes the finding unreliable
- optionally emit a low-confidence diagnostic finding in high-recall mode
- continue processing other routes

Report scripts should continue to exit zero.

## Data Flow

1. Load the OpenAPI spec.
2. For each matching operation, resolve request schema fields.
3. Resolve route-bound 200 response candidates and collect response field names.
4. Split the operation description into blocks or sentences.
5. Classify each block or sentence as request, response, neutral, or ambiguous.
6. Extract candidates with provenance from each classified unit.
7. Compare request candidates against request schema fields.
8. Compare response candidates against response schema fields.
9. Suppress neutral candidates from default output.
10. Include ambiguous candidates only in high-recall output.
11. Deduplicate findings by stable ID.
12. Render text or JSON.

## Testing

Add focused tests in `src/test-support/openapi-consistency.test.ts`.

### Request Prose Does Not Become Response Prose

Build a route with:

- request schema containing `item_id`
- response schema containing only `ok`
- description: `Use item_id 'fuel' to post a buy order. Sort previews with sort_by 'price_asc'.`

Expected:

- no `missing-response-field-prose` for `item_id`
- no response finding for `fuel` or `buy_order`
- no request/prose mismatch for quoted values `fuel` / `price_asc` or narrative compound `buy_order`

### Explicit Request Prose Reports Request Mismatch

Build a route with:

- request schema containing `mission_type`
- response schema containing only `ok`
- description: `Pass target_base_id when posting a delivery mission.`

Expected:

- `prose-field-mismatch` for `target_base_id`
- no `missing-response-field-prose` for `target_base_id`

### Explicit Response Field List Still Reports Missing Fields

Build a route with:

- response schema containing `carried_ships`
- description: `Response includes carried_ships, bay_used, and bay_capacity fields.`

Expected:

- no finding for `carried_ships`
- `missing-response-field-prose` findings for `bay_used` and `bay_capacity`

### Display Verbs Still Count As Response Context

Build a route with:

- response schema containing `fare_surge`
- description: `Shows each passenger's base fare. Also reports fare_surge for the station.`

Expected:

- no finding for `fare_surge`
- `missing-response-field-prose` for `base_fare`

### Permission Prose Is Neutral

Build a route with:

- description: `Requires manage_roles permission. Priority must exceed the new role priority.`
- response schema without `manage_roles`

Expected:

- no default `missing-response-field-prose` for `manage_roles`

### Help Route Tool Names Are Neutral

Build a help route with:

- description: `Returns documentation for all actions available in spacemolt_auth.`
- response schema without `spacemolt_auth`

Expected:

- no default `missing-response-field-prose` for `spacemolt_auth`

### Response Context Keeps Error Details When Explicit

Build a route with:

- description: `The error response details may include missing_materials.`
- response schema without `missing_materials`

Expected:

- default output suppresses it because the response-prose check is scoped to `responses[200]`
- high-recall mode may report it only as error-response prose, not as a missing 200-response field

### High-Recall Mode Keeps Ambiguous Terms

Use a code-like but ambiguous description block that currently produces a loose candidate.

Expected:

- default output suppresses it
- `--include-low` or `--high-recall` includes it as low-confidence/speculative

## Rollout

1. Add failing tests for request, response, neutral, and high-recall classification.
2. Introduce prose target classification helpers.
3. Route existing candidate extraction through target-specific paths.
4. Keep existing high-confidence request example behavior unchanged.
5. Update formatter evidence only where needed.
6. Run focused tests:

```bash
bun test src/test-support/openapi-consistency.test.ts
```

7. Run the report against the v0.471.0 cached spec and inspect summary counts:

```bash
bun run report:openapi-consistency
```

8. Run related reporter checks:

```bash
bun test src/api-sync.test.ts
bun test src/output-golden.test.ts
```

## Acceptance Criteria

- Default `report:openapi-consistency` no longer reports permissions, tool names, route names, or request-only concepts as missing 200-response fields.
- Explicit response field prose still produces findings when fields are absent from the route-bound 200 response schema.
- Request examples still produce `prose-field-mismatch` when payload keys are absent from request schemas.
- High-recall behavior remains available through an explicit flag.
- Tests cover request, response, neutral, and high-recall paths.
- Report scripts remain local, diagnostic, and exit zero by default.
