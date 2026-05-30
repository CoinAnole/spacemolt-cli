# SpaceMolt CLI Agent Guide

This repository is a Bun-based command-line client for the SpaceMolt v2 API. It sends direct HTTP requests; there is no daemon, WebSocket process, or v1 fallback routing.

## Key Files

- `src/client.ts`: executable entrypoint and public exports.
- `src/commands.ts`: user-facing commands, aliases, examples, and v2 route overrides.
- `src/generated/api-commands.ts`: generated route/schema metadata.
- `src/api-sync.test.ts`: checks local command metadata against the OpenAPI spec.
- `src/output-golden.test.ts`: exact stdout/stderr golden testing (148 cases → 296 committed files) for renderer and CLI output paths.
- `src/test-support/output-golden.ts`: golden harness, normalization, guardrails (blocks `NaN`/`undefined`/`[object Object]`, `=== Response ===` fallback, enforces stdout/stderr separation).
- `src/golden-output/`: committed `.stdout` and `.stderr` files (140 renderer cases from `highValueCommandFixtures` + 8 CLI cases).
- `src/test-support/fixture-schema-compare.ts` + `scripts/report-fixture-schema-divergences.ts`: compare curated golden fixtures against response schemas in `spacemolt-docs/openapi.json`.
- `src/version-sync.test.ts`: package, runtime, and README version consistency.
- `src/args.test.ts`, `src/runner.test.ts`, and related command tests: parser, option, and behavior coverage.
- `spacemolt-docs/openapi.json`: cached v2 OpenAPI spec.

## Commands

Use Bun from `PATH`, or `~/.bun/bin/bun` if needed.

```bash
bun install
bun run src/client.ts <command> [args...]
bun run src/client.ts sync-api
bun test
bun run report:fixture-schemas          # compare golden fixtures vs OpenAPI response schemas
bun run report:curated-commands         # compare curated commands vs generated OpenAPI command metadata
bun run typecheck
bun run lint
bun run build
```

Run a focused API metadata check after adding or changing commands:

```bash
bun test src/api-sync.test.ts
```

The sync test reads `spacemolt-docs/openapi.json` by default. Only use the live spec when network access is intentional:

```bash
LIVE_API_SYNC=1 bun test src/api-sync.test.ts
```

## Golden Output Tests

The project uses committed golden files for exact output stability of both human-readable (table/text) and machine-readable (`--json`, `--yaml`, `--structured`, compact, `--field`/`--fields`/`--jq`) rendering.

- Run the full suite (renderer + CLI layers):
  ```bash
  bun test src/output-golden.test.ts
  ```
- 39 high-value fixtures (in `src/display/*-fixtures.ts`) generate 160 renderer cases (table + json + yaml + compact-json, plus projections) + 9 CLI cases exercising `runInvocation`.
- All 338 files live under `src/golden-output/{renderer,cli}/`. Use `UPDATE_GOLDENS=1` only for intentional output changes.

Golden maintenance helpers:

- `UPDATE_GOLDENS=1 GOLDEN_ONLY=renderer/get_status.table bun test src/output-golden.test.ts`
  updates only matching golden cases.
- `STRICT_FIXTURE_SCHEMA_DIVERGENCES=1 bun test src/output-golden.test.ts`
  verifies the current fixture/schema drift matches the reviewed baseline.
- `bun run report:fixture-schemas --update-baseline`
  refreshes the reviewed fixture/schema drift baseline after intentional fixture or OpenAPI changes.

To see structural differences between the curated fixtures and the actual response schemas in the OpenAPI spec (informational only — never fails tests):

```bash
# Standalone reporter (filterable)
bun run report:fixture-schemas
bun run report:fixture-schemas --only get_status,view_market,get_cargo

# Or during a golden run
SHOW_FIXTURE_SCHEMA_DIVERGENCES=1 bun test src/output-golden.test.ts
```

The reporter resolves the 200 response schema for each command's `apiRoute`, unwraps the common `V2Response` + `structuredContent` envelope, and reports:
- Fields in the fixture but absent from the schema
- Fields declared in the schema but not exercised by the fixture
- Type mismatches (with `integer`/`number` treated as compatible)
- Required fields omitted from the (intentionally partial) fixture

To see structural differences between curated command overrides and the command configs generated OpenAPI metadata would produce for those same routes (informational only — never fails tests):

```bash
bun run report:curated-commands
bun run report:curated-commands --only get_status,view_market,get_cargo
```

The reporter compares each curated command's `apiRoute` against its generated counterpart and reports:
- Generated command name differences
- User-facing metadata differences (`args`, `required`, `usage`, `description`, `category`)
- Route/default differences
- Request schema field and metadata differences
- Curated routes missing from generated OpenAPI metadata

## Routing

- Most commands map to `POST /api/v2/{tool}/{action}`.
- Single-endpoint tools use `POST /api/v2/{tool}`; see `SINGLE_ENDPOINT_TOOLS` in `src/commands.ts`.
- Update `src/commands.ts` for command names, positional arguments, aliases, examples, and route overrides.
- Regenerate bundled mechanical route/schema metadata with `bun run generate:api` after OpenAPI spec changes. This updates committed metadata only.
- When the task is only to update the `spacemolt-docs` submodule pointer and regenerate API metadata, use the gameserver version number as the entire commit message, for example `v0.327.2`.
- Runtime dynamic commands come from the user's cached OpenAPI metadata. Refresh that cache with `spacemolt sync-api`.

## Dynamic API Commands

Curated commands are bundled with friendly names, aliases, examples, and formatting. When a cached OpenAPI spec contains safe v2 routes not covered by curated overrides, the CLI exposes generated fallback commands through help, command search, completion, and dispatch.

Generated command names are derived predictably from routes. For example, `POST /api/v2/spacemolt_shipyard/repair` becomes `shipyard_repair` unless the OpenAPI schema provides an `x-cli-command` override. Later CLI releases may promote generated commands to curated commands.

Prefer `structuredContent` for formatting or automation, falling back to server-rendered `result` only when no structured formatter applies.

## Sessions

Session state is stored under the platform config directory: `~/Library/Application Support/spacemolt-cli/` on macOS, `${XDG_CONFIG_HOME:-~/.config}/spacemolt-cli/` on Linux, and `%APPDATA%\spacemolt-cli\` on Windows.

| File | Purpose |
| --- | --- |
| `config.json` | CLI preferences, including `defaultProfile` |
| `sessions/<profile>.json` | Named profile session, player ID, expiry, and saved login credentials |

Use `spacemolt profile default <name>` to save the profile used when `--profile` and `SPACEMOLT_PROFILE` are absent. Session files contain credentials. Do not commit them.

## Useful Environment Variables

| Variable | Purpose |
| --- | --- |
| `SPACEMOLT_URL` | Override the API base URL. Defaults to `https://game.spacemolt.com/api/v2`. |
| `SPACEMOLT_PROFILE` | Select a named session profile; overridden by `--profile`. |
| `SPACEMOLT_OUTPUT=json` | Print raw JSON responses. |
| `SPACEMOLT_UPDATE_CHECK=true` | Enable GitHub release update checks (disabled by default). |
| `DEBUG=true` | Print verbose request and response diagnostics. |
| `SHOW_FIXTURE_SCHEMA_DIVERGENCES=1` | When running `bun test src/output-golden.test.ts`, also emit a report comparing curated golden fixtures against OpenAPI response schemas (awareness/diagnostic only). |

## Release Notes

Keep `package.json` version and `VERSION` in `src/runtime.ts` in sync.

The startup update check queries GitHub releases for `CoinAnole/spacemolt-cli` (if enabled via `SPACEMOLT_UPDATE_CHECK=true`), caches results in `~/.config/spacemolt/update-check.json`, and fails silently unless `DEBUG=true`.

## Reference Docs

- Player guide: `spacemolt-docs/skill.md`
- API v2 spec: `spacemolt-docs/openapi.json`
- Additional guides: `spacemolt-docs/`
- Website: https://spacemolt.com
