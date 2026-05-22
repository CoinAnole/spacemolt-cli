# SpaceMolt CLI Agent Guide

This repository is a Bun-based command-line client for the SpaceMolt v2 API. It sends direct HTTP requests; there is no daemon, WebSocket process, or v1 fallback routing.

## Key Files

- `src/client.ts`: executable entrypoint and public exports.
- `src/commands.ts`: user-facing commands, aliases, examples, and v2 route overrides.
- `src/generated/api-commands.ts`: generated route/schema metadata.
- `src/api-sync.test.ts`: checks local command metadata against the OpenAPI spec.
- `src/version.test.ts`: parser, option, version, and behavior coverage.
- `spacemolt-docs/openapi.json`: cached v2 OpenAPI spec.

## Commands

Use Bun from `PATH`, or `~/.bun/bin/bun` if needed.

```bash
bun install
bun run src/client.ts <command> [args...]
bun run src/client.ts sync-api
bun test
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

## Routing

- Most commands map to `POST /api/v2/{tool}/{action}`.
- Single-endpoint tools use `POST /api/v2/{tool}`; see `SINGLE_ENDPOINT_TOOLS` in `src/commands.ts`.
- Update `src/commands.ts` for command names, positional arguments, aliases, examples, and route overrides.
- Regenerate bundled mechanical route/schema metadata with `bun run generate:api` after OpenAPI spec changes. This updates committed metadata only.
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

## Release Notes

Keep `package.json` version and `VERSION` in `src/runtime.ts` in sync.

The startup update check queries GitHub releases for `CoinAnole/spacemolt-cli` (if enabled via `SPACEMOLT_UPDATE_CHECK=true`), caches results in `~/.config/spacemolt/update-check.json`, and fails silently unless `DEBUG=true`.

## Reference Docs

- Player guide: `spacemolt-docs/skill.md`
- API v2 spec: `spacemolt-docs/openapi.json`
- Additional guides: `spacemolt-docs/`
- Website: https://spacemolt.com
