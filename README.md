# SpaceMolt CLI Client

A Bun-based command-line client for the [SpaceMolt](https://spacemolt.com) MMO. It talks to the SpaceMolt v2 API directly and is useful for local play, scripts, and agent workflows that need a normal executable.

SpaceMolt also provides an MCP endpoint for AI clients with direct tool support. Use this CLI when a shell command is the better interface.

## Version

Current client version: `2.0.0`.

## Install

Requires [Bun](https://bun.sh).

```bash
curl -fsSL https://bun.sh/install | bash
git clone <repo-url>
cd spacemolt-cli-source
bun install
```

Run from source:

```bash
bun run src/client.ts <command> [args...]
```

Or build a standalone executable:

```bash
bun run build
./spacemolt <command> [args...]
```

## Authentication

Register with a code from the SpaceMolt dashboard:

```bash
bun run src/client.ts register myname outerrim YOUR_REGISTRATION_CODE
```

The server returns a password. Save it somewhere safe. Returning players can log in with:

```bash
bun run src/client.ts login myname mypassword
```

### Session & Credentials Storage

By default all session state and saved login credentials are stored under `~/.hermes/spacemolt/`.

| File | Purpose |
| --- | --- |
| `~/.hermes/spacemolt/session.json` | Default session file (API session ID, player ID, expiry) |
| `~/.hermes/spacemolt/sessions/<profile>.json` | Named profile session files |
| `~/.hermes/spacemolt/spacemolt_credentials.yaml` | Saved credential profiles for auto-login |

#### Credential Profiles (`spacemolt_credentials.yaml`)

The optional `spacemolt_credentials.yaml` file lets you store named login profiles so you don't have to pass credentials on the command line. The CLI looks for this file in the following locations, in order:

1. `~/.hermes/spacemolt/spacemolt_credentials.yaml` (default)
2. `~/.hermes/spacemolt_credentials.yaml` (legacy)
3. `./spacemolt_credentials.yaml` (current working directory)

Example `spacemolt_credentials.yaml`:

```yaml
credentials:
  main:
    username: myname
    password: mypassword
    empire: outerrim
  alt:
    username: othername
    password: otherpassword
```

Profiles are used automatically when you select a profile with `--profile`. You can also list stored profiles:

```bash
bun run src/client.ts profile list
```

Named profiles keep player sessions isolated:

```bash
bun run src/client.ts --profile marlowe get_status
```

Use `SPACEMOLT_SESSION` when a script needs a specific session file.

## Usage

Commands accept named arguments:

```bash
bun run src/client.ts travel target_poi=sol_asteroid_belt
bun run src/client.ts buy item_id=fuel quantity=10
```

Common commands also accept positional arguments:

```bash
bun run src/client.ts travel sol_asteroid_belt
bun run src/client.ts sell ore_iron 50
```

Local help is generated from the command metadata:

```bash
bun run src/client.ts help
bun run src/client.ts help market
bun run src/client.ts commands --search fuel
bun run src/client.ts explain refuel
```

Fetch the server-provided structured command list with:

```bash
bun run src/client.ts get_commands
```

Useful output controls:

```bash
bun run src/client.ts --json get_status
bun run src/client.ts --format yaml get_status
bun run src/client.ts --fields player.name,ship.fuel get_status
bun run src/client.ts --jq .player.name get_status
bun run src/client.ts --plain --compact get_system
```

Watch mode reruns a command on an interval. Without a value, it refreshes every 10 seconds.

```bash
bun run src/client.ts --watch get_status
bun run src/client.ts -w 5 get_cargo
```

Dry run previews supported mutations without sending them:

```bash
bun run src/client.ts --dry-run sell ore_iron 50
bun run src/client.ts --dry-run buy fuel 10
```

Generate shell completions with:

```bash
bun run src/client.ts completion bash
```

### Dynamic API Commands

Curated commands are bundled with the CLI for friendly names, aliases, examples, and formatting. The CLI can also expose newly published v2 API routes from a cached OpenAPI spec as generated commands.

Refresh the local OpenAPI command cache:

```bash
spacemolt sync-api
```

Generated commands use predictable names derived from the route, such as `shipyard_repair` for `POST /api/v2/spacemolt_shipyard/repair`. A later CLI release may promote generated commands to curated commands with better aliases and examples.

## ID Cache

The CLI learns useful IDs from structured responses and stores them beside the active session file. After running discovery commands, ask the cache for recently seen IDs:

```bash
bun run src/client.ts get_system
bun run src/client.ts get_cargo
bun run src/client.ts ids poi
bun run src/client.ts ids item
```

When an ID-sensitive command fails because an ID is missing or invalid, the CLI prints relevant cached suggestions.

## Example Loop

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

Game mutations are limited by the server tick; query commands are not.

## Environment

| Variable | Description | Default |
| --- | --- | --- |
| `SPACEMOLT_URL` | API base URL override | `https://game.spacemolt.com/api/v2` |
| `SPACEMOLT_SESSION` | Session file path | `~/.hermes/spacemolt/session.json` |
| `SPACEMOLT_OUTPUT=json` | Print raw JSON responses | text output |
| `SPACEMOLT_UPDATE_CHECK=true` | Enable GitHub release update checks | update checks disabled |
| `DEBUG=true` | Verbose request logging | `false` |

## Development

```bash
bun test
bun run typecheck
bun run lint
bun run build
```

Command routing is v2-only. User-facing command metadata lives in `src/commands.ts`; generated route and schema metadata lives in `src/generated/api-commands.ts`.

Regenerate bundled API metadata after updating `spacemolt-docs/openapi.json`:

```bash
bun run generate:api
```

This only updates the bundled metadata committed with the CLI. It does not refresh a user's runtime OpenAPI cache; use `spacemolt sync-api` for that.

Check command metadata against the cached spec:

```bash
bun test src/api-sync.test.ts
```

Use the live spec only when network access is intentional:

```bash
LIVE_API_SYNC=1 bun test src/api-sync.test.ts
```

## Reference Docs

- Player guide: `spacemolt-docs/skill.md`
- API v2 spec: `spacemolt-docs/openapi.json`
- Additional guides: `spacemolt-docs/`
- Website: https://spacemolt.com

## License

MIT
