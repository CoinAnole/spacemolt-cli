# SpaceMolt CLI Agent Guide

Bun CLI for the SpaceMolt v2 API. Direct HTTP only: no daemon, WebSocket process, or v1 fallback.

## Commands

Use Bun from `PATH` or `~/.bun/bin/bun`.

```bash
bun install
bun run src/client.ts <command> [args...]
bun run src/client.ts sync-api
bun test
bun run report:fixture-schemas
bun run report:curated-commands
bun run report:openapi-consistency
bun run typecheck
bun run lint
bun run build
```

After command changes, run `bun test src/api-sync.test.ts`. It reads `spacemolt-docs/openapi.json`. `LIVE_API_SYNC=1` is a single live-spec check, rate-limited to 1/min (`spacemolt-docs/limits.md`). Do not loop or retry it. Prefer the cached spec.

## Key files

- `src/client.ts`: entrypoint and public exports.
- `src/commands.ts`: names, positionals, aliases, examples, route overrides.
- `src/generated/api-commands.ts`: generated route/schema metadata. Refresh with `bun run generate:api` after OpenAPI changes (committed metadata only).
- `spacemolt-docs/openapi.json`: cached v2 spec.
- Golden output: `src/output-golden.test.ts`. Use `UPDATE_GOLDENS=1` only for intentional output changes. Harness, `GOLDEN_ONLY`, baseline, and reporters live in that test and `src/test-support/output-golden.ts`. Restamp the baseline after `generate:api`.

## Routing

- Most commands are `POST /api/v2/{tool}/{action}`. Single-endpoint tools are `POST /api/v2/{tool}` (`SINGLE_ENDPOINT_TOOLS` in `src/commands.ts`).
- A docs-submodule plus metadata-only commit message is the gameserver version alone, for example `v0.327.2`. It may include `src/test-support/fixture-schema-baseline.json`.
- Runtime dynamic commands come from the user's cached OpenAPI metadata (`spacemolt sync-api`). Prefer `structuredContent`; fall back to server-rendered `result` only when no structured formatter applies.
- Storage is a grouped multi-command. `GROUPED_COMMANDS` includes `storage`. Curated flats: `storage_view`, `storage_deposit`, `storage_withdraw`, `storage_loot`, `storage_jettison`. Users still type `storage <action> …`. There is no `action=` grammar, no implicit deposit, and no request-body `action` field. Keep `SUPPRESSED_GENERATED_ROUTE_SIGNATURES` in `src/dynamic-commands.ts` empty. `jettison`, `loot_wreck`, `faction_deposit_credits`, and `faction_withdraw_credits` stay separate (`README.md`).

## Sessions

Config dir: `~/Library/Application Support/spacemolt-cli/` (macOS), `${XDG_CONFIG_HOME:-~/.config}/spacemolt-cli/` (Linux), `%APPDATA%\spacemolt-cli\` (Windows). `config.json` holds preferences including `defaultProfile`. `sessions/<profile>.json` holds the session, player ID, expiry, and login credentials. Do not commit session files.

`spacemolt profile default <name>` sets the profile used when `--profile` and `SPACEMOLT_PROFILE` are absent.

Public commands that need `X-Session-Id` but not a logged-in profile go through `PUBLIC_SESSION_COMMANDS` in `src/api.ts` (`SessionManager.createTransientSession()`, no profile auth, no session file). `get_empire_info` is the example. Commands that read or mutate player state use a named profile. New public commands need `src/api.test.ts` (anonymous session, no default profile) and `src/runner.test.ts` (empty `XDG_CONFIG_HOME`).

## Environment

`SPACEMOLT_URL`, `SPACEMOLT_PROFILE`, `SPACEMOLT_OUTPUT=json`, `SPACEMOLT_UPDATE_CHECK=true`, `DEBUG=true`. Contributor flags `SHOW_FIXTURE_SCHEMA_DIVERGENCES`, `UPDATE_GOLDENS`, `STRICT_FIXTURE_SCHEMA_DIVERGENCES`, and `LIVE_API_SYNC` are in the golden and sync tests.

## Release

Keep `package.json` version and `VERSION` in `src/runtime.ts` in sync. Breaking notes go in `CHANGELOG.md`.
