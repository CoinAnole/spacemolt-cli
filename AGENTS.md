# SpaceMolt CLI Agent Guide

This repository contains a Bun-based HTTP client for SpaceMolt. It is a local CLI fallback for agents or scripts that are not using the SpaceMolt MCP endpoint.

## Project Shape

- Main client: `src/client.ts`
- API drift test: `src/api-sync.test.ts`
- Version and parser tests: `src/version.test.ts`
- Cached v2 OpenAPI spec: `spacemolt-docs/openapi.json`
- Default session file: `./.spacemolt-session.json`

The client has no daemon, WebSocket, or background process. Commands execute direct HTTP requests, and game mutations wait for the server tick before returning.

## Runtime

Bun is installed at `~/.bun/bin/bun` (and `~/.bun/bin/bunx`). If `bun` is not found on `PATH`, use the full path:

```bash
~/.bun/bin/bun install
~/.bun/bin/bun run src/client.ts <command> [args...]
~/.bun/bin/bun test
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
~/.bun/bin/bun run build
```

If commands fail with "command not found", prepend `~/.bun/bin/` to the command or add `~/.bun/bin` to `PATH`.

```bash
bun install
bun run src/client.ts <command> [args...]
bun test
bun run typecheck
bun run lint
bun run build
```

Useful environment variables:

| Variable | Purpose |
| --- | --- |
| `SPACEMOLT_URL` | Override the API base URL. Defaults to `https://game.spacemolt.com/api/v2`. |
| `SPACEMOLT_SESSION` | Override the session file path. Defaults to `.spacemolt-session.json` in the current directory. |
| `SPACEMOLT_OUTPUT=json` | Print raw JSON responses. |
| `SPACEMOLT_NO_UPDATE_CHECK=true` | Disable the GitHub release update check. |
| `DEBUG=true` | Print verbose request and response diagnostics. |

## API Routing

This fork is v2-only. Do not add v1 fallback routing.

- Most commands use `POST /api/v2/{tool}/{action}`.
- Single-endpoint tools use `POST /api/v2/{tool}`. See `SINGLE_ENDPOINT_TOOLS` in `src/client.ts`.
- `V2_TOOL_MAP` maps CLI command names to v2 tool/action routes.
- `COMMANDS` defines argument parsing, required arguments, and usage hints.

When adding or changing a command, update both `COMMANDS` and `V2_TOOL_MAP`, then run:

```bash
bun test src/api-sync.test.ts
```

The sync test reads `spacemolt-docs/openapi.json` by default. Use the live spec only when network access is intentional:

```bash
LIVE_API_SYNC=1 bun test src/api-sync.test.ts
```

## Sessions and Authentication

Registration requires a dashboard registration code:

```bash
bun run src/client.ts register <username> <empire> <registration_code>
```

The server returns a password. The client stores session data and saved login credentials in `.spacemolt-session.json` so it can renew expired sessions and re-authenticate automatically. Treat that file as secret local state.

## Response Handling

v2 responses may include:

- `structuredContent`: typed data for formatters and programmatic use
- `result`: rendered text from the server
- `notifications`: side-channel game events
- `session`: renewed session metadata
- `error`: structured error details

Prefer `structuredContent` for custom formatting and fall back to `result` when no formatter applies.

## Releases

The client uses semantic versions. Keep these in sync:

- `package.json` version
- `const VERSION` in `src/client.ts`

The startup update check queries GitHub releases for `SpaceMolt/client`, caches results in `~/.config/spacemolt/update-check.json`, times out quickly, and fails silently unless `DEBUG=true`.

## Gameplay Smoke Test

After login or registration, a minimal non-combat loop is:

```bash
bun run src/client.ts get_status
bun run src/client.ts undock
bun run src/client.ts get_system
bun run src/client.ts travel target_poi=sol_asteroid_belt
bun run src/client.ts mine
bun run src/client.ts get_cargo
bun run src/client.ts travel target_poi=sol_earth
bun run src/client.ts dock
bun run src/client.ts sell item_id=ore_iron quantity=50
```

Game actions are limited to one action per tick. The server may hold action requests until the next tick resolves; query commands are not subject to the same gameplay cadence.

## External Docs

- Player guide: `spacemolt-docs/skill.md`
- API v2 spec: `spacemolt-docs/openapi.json`
- Additional guides: `spacemolt-docs/`
- Upstream website: https://spacemolt.com
