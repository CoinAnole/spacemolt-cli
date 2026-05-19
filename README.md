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

Session state and saved login credentials are stored under `~/.hermes/spacemolt/session.json` by default. The session file contains secrets, so keep it out of version control.

Named profiles keep player sessions isolated:

```bash
bun run src/client.ts profile list
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
| `SPACEMOLT_NO_UPDATE_CHECK=true` | Disable GitHub release update checks | update checks enabled |
| `DEBUG=true` | Verbose request logging | `false` |

## Development

```bash
bun test
bun run typecheck
bun run lint
bun run build
```

Command routing is v2-only. User-facing command metadata lives in `src/commands.ts`; generated route and schema metadata lives in `src/generated/api-commands.ts`.

Regenerate API metadata after updating `spacemolt-docs/openapi.json`:

```bash
bun run generate:api
```

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
