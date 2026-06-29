# OpenAPI Consistency Shared Schema Aggregate Design

Date: 2026-06-29

## Summary

The OpenAPI consistency report already detects overbroad shared request schemas, but its finding count can understate the affected surface. The facility `direction` case is the current example: the report emits 19 high-severity `overbroad-shared-schema` findings, but 25 facility routes expose the same broad `direction` enum. The difference comes from the reporter's action-path heuristic, which chooses which routes deserve individual findings.

The design keeps the existing per-route findings, then adds cluster-level evidence so reviewers can see the actual blast radius of each shared request schema group. The report should distinguish "routes emitted as individual findings" from "routes affected by the shared broad enum."

## Problem

`findOverbroadSharedSchemas` groups routes by request-schema property names. Inside each group, it filters to "action-like" paths and emits high-severity findings when one of those paths has a broad enum field such as `direction`.

That behavior is useful, but the count is easy to misread:

- The report says `overbroad-shared-schema (19)`.
- The facility shared schema actually exposes `direction=to_faction|to_player|forward|reverse` on 25 routes.
- Six additional broad routes are not counted as individual findings: `dismantle`, `list`, `list_for_sale`, `owned`, `types`, and `upgrades`.
- The same broad schema also pollutes CLI help and validation because curated command configs merge the generated schema wholesale, then selectively override only `facility_job_add` and `facility_transfer`.

The root cause is not the action-path heuristic itself. The heuristic intentionally avoids turning every query/list route into a high-severity item. The problem is that the report does not show the complete affected route set anywhere obvious.

## Goals

- Make shared-schema findings report the full affected route count.
- Preserve high-signal per-route findings for action-like paths.
- Avoid inflating the top-level finding count with lower-value route duplicates.
- Include enough JSON evidence for downstream review scripts to identify affected, flagged, unflagged, broad, and narrowed routes.
- Improve human output so reviewers do not have to rerun custom `jq` queries to understand scope.
- Keep the report diagnostic and high-recall; do not turn it into a strict gate.

## Non-Goals

- Do not fix the OpenAPI facility schemas in this change.
- Do not prune CLI command schemas or help output in this change.
- Do not add a new report command.
- Do not change the default severity of existing per-route findings.
- Do not emit every affected route as a separate high-severity finding by default.
- Do not require live OpenAPI access.

## Approaches Considered

### Recommended: Add Cluster Evidence And A Human Summary

For each shared schema group with a broad enum field, compute aggregate scope:

- all routes in the shared schema group
- routes with the broad enum value set
- routes already emitted as individual findings
- routes affected but not individually flagged
- routes in the same schema-property group with narrowed enum values, if any

Emit one additional info-level cluster finding per undercounted shared enum group. Keep aggregate evidence on that cluster finding rather than duplicating it onto every route-level finding.

Tradeoffs:

- Gives reviewers the actual blast radius.
- Keeps existing high-severity findings stable.
- Adds modest JSON/output complexity.
- Requires clear wording so `Findings: N` remains distinct from `affected routes: M`.

### Alternative: Emit Every Affected Route As A Finding

Emit high or medium findings for all 25 broad facility routes instead of only the 19 action-like routes.

Tradeoffs:

- The top-level count would match affected routes.
- The report gets noisier and less useful for triage.
- List/type/query routes are real symptoms but not always as important as mutation/action paths.

This is rejected for default output.

### Alternative: Leave Counts As-Is And Document The Heuristic

Add wording to the report footer explaining that the count reflects individual heuristic findings, not affected routes.

Tradeoffs:

- Very cheap.
- Does not solve the practical review problem.
- Reviewers still need custom inspection to see unflagged affected routes.

This is not sufficient.

## Design

### Analyzer Scope

Keep the existing route grouping strategy in `findOverbroadSharedSchemas`:

- collect request schema properties for each POST route
- group routes by property-name signature
- identify action-like paths within each group
- emit high-severity per-route findings for broad enum fields on action-like paths

Add a second aggregation step per group and broad enum field. The aggregation should run after the per-route findings for that group are known, so it can compare "affected" versus "individually flagged."

### Broad Enum Grouping

Within each schema-property group, identify candidate enum fields using the same broad-field rules already used for per-route findings:

- field name is `direction`, or it is in the existing broad field set
- enum has at least three values

For each candidate field, group routes by exact enum values. The facility case would produce:

```text
to_faction,to_player,forward,reverse -> 25 routes
forward,reverse                      -> 1 route
to_faction,to_player                 -> 1 route
```

The largest enum set is not automatically wrong. The cluster finding should be emitted only when at least one route in that enum group is already considered overbroad by the existing action-path logic, or when the enum description explicitly references multiple actions.

### Evidence Shape

Extend `Finding.evidence` with aggregate fields:

```ts
affectedRouteCount?: number;
flaggedRouteCount?: number;
unflaggedRoutes?: string[];
narrowedEnumRoutes?: Array<{
  route: string;
  enum: string[];
}>;
enumGroups?: Array<{
  enum: string[];
  routes: string[];
}>;
```

The existing `schemaEnum` and `sharedWith` evidence should remain for compatibility.

### Cluster Finding

Add one info-level `overbroad-shared-schema` finding per schema group and broad enum field when the affected count is greater than the flagged count.

Suggested ID:

```text
overbroad-shared-schema-cluster|<field>|<signature-hash-or-first-route>
```

Suggested message:

```text
shared request schema exposes broad "direction" enum on 25 routes; 19 are emitted as action findings
```

Suggested evidence:

- `schemaEnum`: broad enum values
- `affectedRouteCount`: all routes with that broad enum
- `flaggedRouteCount`: routes already emitted as individual findings
- `unflaggedRoutes`: affected routes not individually flagged
- `narrowedEnumRoutes`: sibling routes with narrower enums, such as `job_add` and `transfer`
- `enumGroups`: all enum-value groups for the field inside the schema-property group
- `sharedWith`: abbreviated compatible list for existing human output

This cluster finding should use `severity: 'info'` and `confidence: 'high'`. It is factual metadata about a high-confidence finding cluster, not a separate defect class.

### Human Output

Enhance `formatConsistencyReport` to render aggregate evidence when present:

```text
  affected routes: 25
  individually flagged: 19
  unflagged affected routes: POST /api/v2/spacemolt_facility/dismantle, POST /api/v2/spacemolt_facility/list, ...
  narrowed siblings: POST /api/v2/spacemolt_facility/job_add (forward|reverse), POST /api/v2/spacemolt_facility/transfer (to_faction|to_player)
```

Keep truncation similar to `sharedWith`: show the first few entries and append `...` when longer. JSON output should include the complete lists.

### Summary Semantics

Keep `summary.total`, `summary.byKind`, and `summary.bySeverity` based on emitted findings. Do not redefine the existing counters.

Add aggregate counts under `summary`:

```ts
sharedSchemaClusters?: {
  total: number;
  affectedRoutes: number;
};
```

`total` counts emitted cluster findings. `affectedRoutes` is the sum of `affectedRouteCount` across those clusters in the filtered report universe. This is separate from `summary.total`, which remains the emitted finding count.

### Filtering

The existing `--only` filtering should continue to apply before grouping. A cluster finding should summarize only the routes included by the current filter.

Example:

```bash
bun run report:openapi-consistency --only facility
```

should report the full facility cluster. A narrower filter such as `--only job_add,transfer` may show only those routes and therefore should not claim a 25-route affected count.

### JSON Compatibility

This change adds fields; it should not remove or rename existing fields. Existing JSON consumers that ignore unknown evidence fields will continue to work.

If a consumer groups by `kind`, the cluster finding will appear under `overbroad-shared-schema` with `severity: info`. That is intentional: it keeps related data in the same category while preventing the cluster row from being confused with another high-severity route-level defect.

## Testing

Add focused tests in `src/test-support/openapi-consistency.test.ts`.

Test 1: cluster reports affected and unflagged routes.

- Create a minimal spec with a shared facility-like schema on several routes.
- Include action-like routes that should be individually flagged.
- Include list/type-style routes that should be affected but not individually flagged.
- Assert that an info cluster finding exists.
- Assert `affectedRouteCount > flaggedRouteCount`.
- Assert `unflaggedRoutes` contains the list/type-style routes.

Test 2: narrowed siblings are recorded.

- Add `job_add` with `forward|reverse`.
- Add `transfer` with `to_faction|to_player`.
- Add other routes with `to_faction|to_player|forward|reverse`.
- Assert the cluster evidence records both narrowed siblings.

Test 3: no extra cluster when counts match.

- Create a shared group where every affected broad route is individually flagged.
- Assert no aggregate "undercount" cluster is emitted.

Test 4: human formatter renders aggregate evidence.

- Build a small report object containing a cluster finding.
- Assert output includes affected count, flagged count, unflagged route label, and narrowed sibling label.

Run:

```bash
/home/hermes/.bun/bin/bun test src/test-support/openapi-consistency.test.ts
PATH=/home/hermes/.bun/bin:$PATH /home/hermes/.bun/bin/bun run report:openapi-consistency --only facility
```

Optionally run:

```bash
/home/hermes/.bun/bin/bun run typecheck
```

## Risks

- Adding a cluster finding increases `summary.total` slightly. Using `severity: info` keeps the triage impact low.
- The cluster ID needs to be stable enough for reviewer diffs. Use the first sorted route plus field name, or a deterministic hash of the sorted property signature.
- `--only` filters can make cluster counts smaller than the full spec. The report should summarize only the filtered universe and not imply global counts under a narrow filter.
- The aggregate evidence can become verbose in human output. Truncate human route lists but keep JSON complete.

## Acceptance Criteria

- The facility shared-schema case reports an aggregate affected route count greater than the 19 individually flagged routes.
- The report identifies the broad `direction` enum route set and the narrowed `job_add` and `transfer` siblings.
- Existing route-level `overbroad-shared-schema` findings remain present.
- Default output remains readable and does not expand every affected route into a high-severity finding.
- JSON output contains complete aggregate evidence for review automation.
- Focused consistency-report tests pass.
