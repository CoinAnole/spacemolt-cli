# SpaceMolt v0.522 Compatibility and Correctness Design

Date: 2026-07-17

## Summary

The cached SpaceMolt documentation has advanced from gameserver v0.512.0 to v0.522.0. The CLI must align its bundled route metadata, curated command surface, human-readable renderers, response fixtures, and OpenAPI validation with that release range.

This is a compatibility release, not a first-class shipping feature release. Regenerating API metadata will make the eleven new non-help `shipping_*` actions available through the existing dynamic-command path and will bundle the hidden shipping help-route metadata, but this work will not add curated shipping commands, shipping-specific renderers, or shipping golden fixtures.

The v0.521.0 OpenAPI refactor is large but does not require a runtime rewrite. This CLI generates request and route metadata, not TypeScript response models, and its response rendering is dynamic. The stable named response components and discriminators should instead be used to make fixture/schema validation more deterministic.

## Problem

The repository currently bundles gameserver v0.512.0 metadata while `spacemolt-docs/openapi.json` describes v0.522.0. The focused API sync test reports three failures:

- `facility_disassemble` still targets the removed `/api/v2/spacemolt_facility/disassemble` route.
- `faction_disassemble` still targets the removed `/api/v2/spacemolt_facility/faction_disassemble` route.
- `src/generated/api-commands.ts` is stale and differs substantially from the current spec.

The route delta contains twelve new shipping endpoints and the two removed facility endpoints. Those are not the only compatibility concerns. Releases v0.513.0 through v0.522.0 also changed or extended structured responses:

- v0.515.0 adds `base_id` and `base_name` to craft queue jobs.
- v0.516.0 identifies public bases as stations or outposts through the existing base `type` field.
- v0.518.0 replaces the three scalar passenger berth strings with a nested `berths` object and adds the same object to `get_ship`.
- v0.519.0 adds optional `trading_restricted_until` player state.
- v0.520.1 exposes facility build keys as `type` in owned-facility tables.
- v0.521.0 adds stable named response components, discriminated unions, and new required `action` or `kind` fields on about twenty response variants.
- v0.522.0 adds numeric `maintenance_level` to facility list entries.

The committed high-value fixtures still model several old shapes. Strict fixture/schema validation now reports old passenger berth fields and missing discriminator fields. Updating only the baseline would conceal real drift rather than adapt the CLI.

## Goals

- Make bundled generated metadata match cached gameserver v0.522.0 exactly.
- Remove curated commands whose server routes no longer exist.
- Keep current v2 response payloads useful in human-readable output.
- Preserve raw server data unchanged in JSON, YAML, structured, compact, field, and jq output modes.
- Update representative fixtures to exercise new canonical response fields.
- Use v0.521 discriminators to select union branches deterministically when possible.
- Keep fixture/schema drift review strict and intentional.
- Preserve generated fallback access to newly discovered safe v2 routes.
- Complete the work using the cached OpenAPI document without live API requests.

## Non-Goals

- Do not add curated `shipping_*` commands, aliases, examples, categories, or positional arguments.
- Do not add shipping-specific formatters or golden fixtures.
- Do not generate TypeScript response interfaces or import OpenAPI response models into runtime code.
- Do not rename code references for v0.521 `*CommandResponse` components unless a schema-validation test refers to those names.
- Do not redesign command dispatch, HTTP transport, profiles, sessions, or dynamic-command caching.
- Do not change gameplay behavior introduced in v0.520.0.
- Do not perform live OpenAPI verification or retry rate-limited endpoints.
- Do not refactor unrelated formatter or report code.
- Do not modify unrelated local or ignored files, including local verification scratch scripts.

## Approaches Considered

### Recommended: Targeted Compatibility Adaptation

Regenerate metadata, remove invalid curated commands, adapt only affected response presentation, and enhance schema validation to use discriminators while retaining existing fallbacks.

Tradeoffs:

- Restores correctness without coupling the work to a large new gameplay feature.
- Preserves the current architecture and machine-output guarantees.
- Uses the richer v0.521 schema information where it adds clear value.
- Requires intentional golden updates across several existing fixtures.

This is the selected approach.

### Alternative: Minimal Route Sync

Regenerate metadata, remove the two stale commands, update passenger berths, and accept all other additive fields without renderer or fixture changes.

Tradeoffs:

- Produces the smallest patch.
- Leaves human output unaware of useful current fields.
- Leaves strict fixture/schema validation stale or forces baseline-only updates.
- Does not benefit from v0.521 discriminators.

This is rejected because it restores route validity without fully restoring correctness coverage.

### Alternative: Typed Response Generation

Extend generated metadata into a full typed response client based on all named OpenAPI components.

Tradeoffs:

- Could provide compile-time response narrowing.
- Would be a large architecture change across generation, transport, rendering, and tests.
- Is unnecessary because wire JSON is unchanged in v0.521 and current runtime handling is dynamic.

This is rejected for this release.

## Design

### 1. Generated Metadata and Route Surface

Run `bun run generate:api` against the committed `spacemolt-docs/openapi.json`. The generated file remains mechanical and must not be edited by hand.

The regenerated metadata must:

- report gameserver `v0.522.0`
- omit the removed `disassemble` and `faction_disassemble` routes
- include all twelve shipping routes from the cached spec, including the infrastructure help route
- continue excluding infrastructure-only help routes from curated-coverage requirements where existing API sync rules already do so
- match a fresh in-memory generation exactly

The eleven non-help shipping routes will be exposed only through generated dynamic commands. Their generated names, request schemas, help visibility, completion, and dispatch follow existing behavior. The shipping help route remains hidden from dynamic command generation under the existing infrastructure-route rule. No curated override will shadow any shipping route in this release.

### 2. Removed Facility Commands

Remove `facility_disassemble` and `faction_disassemble` from the curated surface instead of redirecting them silently. Their server actions no longer exist, while `facility_dismantle` and `faction_dismantle` are already the supported replacements and now return all build and upgrade materials as ordinary labeled packages.

Removal includes:

- command overrides
- aliases and nested-command metadata, if present
- `discoverWith` and `seeAlso` references
- ID-cache command mappings
- parser, route, command-metadata, version-sync, help, and completion expectations
- examples or documentation that still recommends disassembly

The CLI should not keep a client-only compatibility command that calls `dismantle`, because that would preserve obsolete semantics and make help/API sync disagree. Normal unknown-command suggestions may guide users toward `facility_dismantle` or `faction_dismantle` when their similarity is sufficient.

### 3. Canonical Berth Response Handling

The canonical berth shape is:

```json
{
  "berths": {
    "economy": { "total": 12, "free": 10 },
    "business": { "total": 2, "free": 2 },
    "first": { "total": 1, "free": 0 }
  }
}
```

Create or extend a small display helper that reads this shape and returns stable class summaries in economy, business, first order. Human output should use the unambiguous form `Economy: 10/12 free`, meaning free/total. Classes are shown when their entry exists, including zero-capacity entries when returned by the server.

Use the helper in both places:

- `list_passengers` prints the class summary above its passenger table.
- `get_ship` prints a `Berths:` line in the ship summary when `ship.berths` is present.

For resilience, the `list_passengers` renderer will continue reading the old `economy_berths`, `business_berths`, and `first_berths` fields as a fallback. Current fixtures and goldens must use the nested canonical shape. The fallback is not part of the current OpenAPI contract and receives one focused compatibility unit test rather than high-value golden coverage.

If `berths` is absent, the renderers omit berth output. They must not print `undefined`, `NaN`, or an empty berth label.

### 4. Additive Human-Readable Fields

Additive fields must not alter machine-output transformation. They are rendered only by existing table/text formatters.

#### Craft Queue Base Context

The craft queue renderer already prefers job-level `base_name` and `base_id` before falling back to workshop facility-ID parsing or response-level location. Update representative fixtures and tests to exercise the direct v0.515 fields. Keep the existing fallbacks for older or partial payloads.

The station column should display `base_name (base_id)` when both differ, and the ID alone when no name is available.

#### Base Type

When a base record includes `type`, show `Type: <value>` in `get_base` detail output and in the embedded base block rendered by `get_poi`. Treat the value as presentation data; do not branch command availability or permissions based on `station` versus `outpost`.

When `type` is absent, preserve current output without a placeholder.

#### Trading Restriction

When the nested player record contains a non-empty `trading_restricted_until`, show `Trading restricted until: <server value>` in human-readable status/player output. Preserve the exact server timestamp for deterministic output rather than converting it to local time.

When the field is absent, empty, or equal to Go's zero timestamp `0001-01-01T00:00:00Z`, omit the line.

#### Facility Type

Owned and faction-owned facility tables must include a dedicated `Type` column sourced from the facility `type` build key. Place it immediately after `Name`; where a base/station column exists, this puts `Type` between `Name` and the base context as required by v0.520.1.

Do not remove friendly or custom facility names. `Name` remains the display name and `Type` remains the stable build key.

#### Facility Maintenance Level

When a facility list entry includes finite numeric `maintenance_level`, render it as a percentage in the existing maintenance context. `0` renders as `0%`, `1` as `100%`, integral percentages have no decimal, and other percentages have one decimal.

`maintenance_level` is preferred over `maintenance_satisfied` for the displayed maintenance value. When the numeric field is absent or invalid, retain the existing boolean maintenance display. If neither field is usable, omit the maintenance cell; never emit `NaN`.

### 5. Discriminator-Aware Schema Validation

Extend the shared JSON-schema representation with OpenAPI discriminator metadata:

```ts
interface OpenApiDiscriminator {
  propertyName: string;
  mapping?: Record<string, string>;
}
```

Fixture response-candidate selection uses this precedence:

1. An explicit fixture `schemaTarget`, preserving current behavior.
2. A matching discriminator value from the fixture's `action` or `kind` field.
3. Existing structural candidate scoring.
4. Existing fallback comparison when no comparable candidate exists.

When a discriminator mapping points to a component reference, select the corresponding union branch before scoring unrelated branches. When the fixture omits the discriminator, the mapping is missing, or a reference cannot be resolved, validation falls back without crashing.

Add `discriminator` to `FixtureSchemaSelectionReason` so reports and tests can explain why a branch was selected. The text report should continue printing the resolved stable component name where available.

This work does not generate runtime response types. It only makes the diagnostic fixture/schema comparison more accurate and less dependent on incidental structural scoring.

### 6. Fixture and Golden Alignment

Update curated fixtures to model the current server contract rather than merely accepting a new baseline.

At minimum:

- `list_passengers` replaces the three old berth fields with `berths`.
- `get_ship` includes a representative `ship.berths` object.
- craft queue jobs include representative `base_id` and `base_name`.
- facility fixtures include explicit `type` and representative partial `maintenance_level` values.
- status or player fixtures include one active `trading_restricted_until` case.
- base fixtures include a `type` case.
- fixtures for facility types, POI, system, storage, and passenger unload variants include their schema-required `action` or `kind` discriminators.

Update affected golden files only after renderer behavior is correct. Use targeted `GOLDEN_ONLY` updates where practical and inspect the resulting table, JSON, YAML, and compact JSON changes. Machine-output goldens should change only because the canonical fixture now includes real server fields; renderers must not delete, rename, or synthesize machine-output data.

After fixture correction, run the schema divergence report and update `fixture-schema-baseline.json` only for remaining reviewed divergences. New current-version discriminator or berth mismatches must not be blessed into the baseline.

### 7. Error Handling and Compatibility Rules

- Missing optional additive fields preserve existing output.
- Malformed optional display fields never crash command execution.
- Discriminator lookup failures fall back to structural scoring.
- Schema resolution failures remain diagnostic and do not stop other comparisons.
- Removed server routes are removed from the CLI rather than remapped implicitly.
- Machine output remains raw and lossless.
- No live server call is required for implementation or verification.

## Data Flow

### Runtime Command Flow

1. The CLI loads curated commands merged with regenerated v0.522 metadata.
2. Curated commands continue to provide friendly behavior for existing routes.
3. The eleven newly generated non-help shipping commands participate in help, search, completion, and dispatch through the existing dynamic-command path; the shipping help route remains infrastructure metadata rather than a generated command.
4. API responses pass through the existing structured-content selection.
5. Human-readable formatters optionally present current berth, base, restriction, facility type, and maintenance fields.
6. Machine-output modes serialize the selected server data without formatter-derived changes.

### Fixture Validation Flow

1. Load cached `spacemolt-docs/openapi.json`.
2. Resolve the route's 200 response and unwrap `V2Response.structuredContent`.
3. Expand `allOf`, `oneOf`, and `anyOf` candidates.
4. Honor an explicit fixture target when configured.
5. Otherwise inspect discriminator metadata and the fixture's literal tag.
6. Fall back to structural scoring if no discriminator match is possible.
7. Compare the fixture to the selected stable component schema.
8. Report divergences and compare blocking signatures with the reviewed baseline.

## Testing

### Focused Tests

- `bun test src/api-sync.test.ts`
  - v0.522 metadata version matches.
  - generated metadata is deterministic.
  - no curated route is stale.
  - all eleven non-help shipping actions are discoverable without curated overrides, while the help route stays hidden.
- Parser and command metadata tests
  - removed disassemble commands are absent.
  - dismantle commands remain valid.
  - no stale cross-reference remains.
- Passenger display tests
  - nested berth counts render in fixed class order.
  - absent berths produce no line.
  - zero values are preserved.
  - malformed values do not produce `NaN` or `undefined`.
- Ship display tests
  - `ship.berths` is shown when present and omitted otherwise.
- Craft display tests
  - direct job `base_name` and `base_id` win over facility-ID and response-level fallbacks.
- Facility display tests
  - `Type` is separate from `Name`.
  - partial maintenance levels render accurately.
  - boolean maintenance remains the fallback.
- Status/base display tests
  - active trading restriction and base type are shown conditionally.
- OpenAPI schema utility and fixture comparison tests
  - discriminator mapping selects the intended stable component.
  - explicit targets retain precedence.
  - unknown or missing discriminator tags fall back to scoring.
  - unresolved mappings do not crash the report.

### Golden and Full Verification

Run:

```bash
bun test src/output-golden.test.ts
STRICT_FIXTURE_SCHEMA_DIVERGENCES=1 bun test src/output-golden.test.ts
bun run report:fixture-schemas
bun run report:curated-commands
bun test
bun run typecheck
bun run lint
bun run build
```

Do not run `LIVE_API_SYNC=1` as part of routine verification.

## Implementation Sequence

1. Add failing focused tests for removed commands and current response shapes.
2. Regenerate v0.522 API metadata and review the mechanical route/schema delta.
3. Remove obsolete facility command definitions and references.
4. Implement canonical berth handling and affected additive display fields.
5. Update fixtures and targeted goldens to current wire shapes.
6. Add discriminator-aware schema selection and its focused tests.
7. Review fixture/schema divergences, then update the baseline only if justified.
8. Run focused, golden, strict-schema, and full verification.

The exact test-first task breakdown belongs in the implementation plan; this sequence defines dependency order, not individual commits.

## Acceptance Criteria

- Bundled metadata reports and deterministically regenerates as gameserver v0.522.0.
- `bun test src/api-sync.test.ts` passes against the cached spec.
- Neither removed disassemble command appears in command lookup, help, completion, routing, or tests.
- All eleven non-help shipping actions are available through generated dynamic commands without curated shipping code, and the shipping help route remains hidden infrastructure metadata.
- Passenger and ship berth output uses the nested canonical shape.
- Craft queue fixtures exercise direct base context.
- Owned-facility output has separate Name and Type columns.
- Partial facility maintenance is visible without replacing machine-output values.
- Active trading restrictions and base types are visible when present.
- Current `action` and `kind` discriminator fields are represented in relevant fixtures.
- Discriminator-aware fixture validation falls back safely when tags are absent or unknown.
- Strict fixture/schema baseline validation passes after intentional review.
- Output guardrails continue to reject `NaN`, `undefined`, `[object Object]`, and generic response fallback leakage.
- Full tests, lint, and build pass; a clean checkout passes typecheck.
- No live OpenAPI request is made.
- No curated shipping UX is included.

## Risks and Mitigations

### Large Generated Diff

The v0.521 schema and operation-description refactor makes the generated metadata diff look much larger than the runtime behavior change.

Mitigation: keep the generated file mechanical, validate deterministic regeneration, and review curated/runtime changes separately.

### Golden Churn From Additive Fields

Adding real discriminator and response fields changes JSON, YAML, and compact golden output even when human presentation changes little.

Mitigation: update only affected cases, inspect every changed golden family, and preserve raw fixture data consistently across formats.

### Incorrect Union Branch Selection

Discriminator handling could select the wrong branch if mapping information is incomplete or malformed.

Mitigation: explicit fixture targets remain highest priority, discriminator matches require literal mapping evidence, and structural scoring remains the fallback.

### Accidental Shipping Scope Expansion

Regeneration exposes shipping routes and may tempt the compatibility patch to curate their UX.

Mitigation: generated exposure is explicitly allowed, while all shipping overrides, formatters, and high-value fixtures remain non-goals.

### Hiding Real Drift in the Baseline

Refreshing the fixture/schema baseline too early could bless obsolete fixtures.

Mitigation: correct canonical fixture shapes first, inspect the standalone report, and update the baseline last.
