# Crafting CLI Sync Design

## Context

SpaceMolt gameserver `v0.389.0` changed crafting from an instant action into a queued production system. The cached docs submodule is currently newer than that release (`v0.390.0`), and `spacemolt-docs/openapi.json` already contains the new crafting surface:

- `POST /api/v2/spacemolt/craft`
- `POST /api/v2/spacemolt/recycle`
- facility job/rental routes including `job_add`, `job_list`, `job_cancel`, `job_reorder`, `set_output_price`, and `set_access`

The bundled generated metadata in `src/generated/api-commands.ts` is still built from gameserver `v0.384.1`, so bundled help, schemas, and generated fallback commands lag behind the cached OpenAPI spec. The curated `craft` command also still describes the old instant/batch system in generated descriptions.

## Goals

- Regenerate bundled OpenAPI command metadata from the cached `spacemolt-docs/openapi.json`.
- Update curated CLI commands so the new crafting production model is discoverable and accurate.
- Add curated commands for recycling and facility production queue/rental management.
- Preserve existing friendly command names and argument parsing patterns.
- Add focused tests that prevent stale crafting help and route mappings from returning.

## Non-Goals

- No live OpenAPI fetch is required for routine verification.
- No gameplay balance changes, recipe data edits, or station economy edits.
- No broad output renderer redesign unless the new response shapes expose a concrete rendering gap.
- No unrelated refactoring of command registration or dynamic command discovery.

## Approach

Use a full metadata sync plus curated overrides.

1. Run the local metadata generator against `spacemolt-docs/openapi.json`.
2. Update curated command overrides for the high-value user-facing workflows.
3. Add or update tests for help text, command schemas, positionals, and route mapping.
4. Run focused metadata tests, then broader tests as needed.

This keeps the bundled OpenAPI snapshot consistent with the cached spec while still giving players ergonomic commands instead of relying only on route-derived generated fallbacks.

## Command UX

### `craft`

Keep `craft` as the main production command.

Positionals:

- `recipe_id`
- `quantity`

Accepted fields should include the generated schema fields:

- `deliver_to=storage|faction`
- `facility_id`
- `preset=fast|cheap|workshop`
- `dry_run=true|false`
- `jobs=[...]`
- `count` as a compatibility alias only when the server schema still exposes it

Curated help must make these semantics clear:

- Crafting queues work; it does not complete instantly.
- Inputs are escrowed from station storage.
- Output lands in station storage by default.
- `deliver_to=cargo` is not valid for crafting.
- `quantity` means desired output item count, rounded to whole runs.
- `craft action=queue` or omitting `recipe_id` checks queued work if supported by the API.
- `dry_run=true` quotes cost, routing, and ETA without spending.
- Bulk queueing uses `jobs=[...]`.

### `recycle`

Add curated `recycle` command for `POST /api/v2/spacemolt/recycle`.

Positionals:

- `recipe_id`
- `quantity`

Help should describe recycling as queued reverse production that consumes a recipe's outputs from station storage and returns a lossy fraction of inputs. It should expose `facility_id`, `deliver_to=storage|faction`, `dry_run`, and `jobs=[...]` when present in the generated schema.

### Facility Queue and Rental Commands

Add curated commands for production facility operation:

- `facility_job_add`
- `facility_job_list`
- `facility_job_cancel`
- `facility_job_reorder`
- `facility_set_output_price`
- `facility_set_access`

Expected routes:

- `facility_job_add` -> `POST /api/v2/spacemolt_facility/job_add`
- `facility_job_list` -> `POST /api/v2/spacemolt_facility/job_list`
- `facility_job_cancel` -> `POST /api/v2/spacemolt_facility/job_cancel`
- `facility_job_reorder` -> `POST /api/v2/spacemolt_facility/job_reorder`
- `facility_set_output_price` -> `POST /api/v2/spacemolt_facility/set_output_price`
- `facility_set_access` -> `POST /api/v2/spacemolt_facility/set_access`

Positionals should follow the API's natural workflow:

- `facility_job_add <facility_id> <recipe_id> <quantity> [direction=forward|reverse] [deliver_to=storage|faction]`
- `facility_job_list <facility_id>`
- `facility_job_cancel <facility_id> <job_id>`
- `facility_job_reorder <facility_id> <job_id> <position>`
- `facility_set_output_price <facility_id> <item_id> <price>`
- `facility_set_access <facility_id> <access>`

Help should connect these commands to running a facility as a business: owners can queue jobs, reorder/cancel work, open or close public access, and set per-item output pricing.

### Stale Recycler Configuration

If regenerated metadata no longer includes `POST /api/v2/spacemolt_facility/configure_recycler`, remove or retire the curated `configure_recycler` override and update tests that currently assert it exists. Recycling is now represented by the top-level `recycle` command and facility queue direction.

## Data Flow

Bundled command data is built in layers:

1. `spacemolt-docs/openapi.json` is read by `scripts/generate-api-metadata.ts`.
2. Generated route/schema metadata is written to `src/generated/api-commands.ts`.
3. Curated overrides in `src/command-overrides-*.ts` merge friendly command names, usage, aliases, examples, and category metadata over generated route schemas.
4. The command registry exposes bundled curated commands and generated fallbacks.
5. Argument parsing uses merged schemas and positionals to build API payloads.

This change should keep that layering intact.

## Error Handling

No new runtime error handling is planned. The CLI should continue to rely on:

- Generated schemas for field typing and enum display.
- Existing argument parsing errors for unknown fields or invalid positional use.
- Server responses for gameplay validation such as missing storage, insufficient escrow, facility access, and faction permission failures.

The help text should prevent common user mistakes before runtime, especially re-issuing queued craft jobs and attempting `deliver_to=cargo`.

## Testing

Focused tests:

- `src/api-sync.test.ts` verifies generated metadata matches cached OpenAPI and gameserver version.
- `src/command-metadata.test.ts` verifies `craft` help reflects queued production, station storage, no cargo delivery, `dry_run`, and bulk jobs.
- `src/command-metadata.test.ts` verifies `recycle` and facility job/rental commands have curated route mappings and useful help.
- `src/args.test.ts` verifies positionals parse correctly for `craft`, `recycle`, and representative facility job commands.
- `src/version-sync.test.ts` updates or replaces stale assertions about `configure_recycler`.

Broader verification:

- Run `bun test src/api-sync.test.ts`.
- Run focused command and argument tests.
- Run `bun test` if focused changes pass and time permits.
- Run `bun run typecheck` if TypeScript-facing command metadata changes are nontrivial.

## Acceptance Criteria

- `src/generated/api-commands.ts` is regenerated from cached docs and no longer reports gameserver `v0.384.1`.
- `spacemolt help craft` does not mention cargo delivery, instant crafting, old quality/skill output behavior, fixed batch caps, or cargo overflow.
- `spacemolt help craft` does mention queued jobs, station storage escrow, output count semantics, `dry_run`, and bulk `jobs`.
- `spacemolt help recycle` exists and documents lossy reverse production.
- Facility job/rental commands are bundled curated commands with correct routes and sensible positionals.
- Cached API sync tests pass.
- Existing command behavior unrelated to crafting remains unchanged.
