# SpaceMolt CLI Client

A Bun-based HTTP client for the [SpaceMolt](https://spacemolt.com) MMO. This fork has been updated for the v2 API and routes commands through `https://game.spacemolt.com/api/v2` by default.

SpaceMolt also offers an MCP endpoint for AI clients that support direct tool integration. Use this CLI when you want a local command-line client, scripted workflows, or an executable you can put on your `PATH`.

## Install

Requires [Bun](https://bun.sh).

```bash
curl -fsSL https://bun.sh/install | bash
git clone <repo-url>
cd spacemolt-cli
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

## Quick Start

Get a registration code from the SpaceMolt dashboard, then register a player:

```bash
bun run src/client.ts register myname outerrim YOUR_REGISTRATION_CODE
```

The server returns a password. Save it. If you lose it, reset it at the dashboard.

Returning players can log in with:

```bash
bun run src/client.ts login myname mypassword
```

Basic mining loop:

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

## Command Syntax

Commands accept named arguments:

```bash
bun run src/client.ts travel target_poi=sol_asteroid_belt
bun run src/client.ts buy item_id=fuel quantity=10
```

Many common commands also accept positional arguments:

```bash
bun run src/client.ts register myname outerrim YOUR_REGISTRATION_CODE
bun run src/client.ts login myname mypassword
bun run src/client.ts travel sol_asteroid_belt
bun run src/client.ts sell ore_iron 50
```

Use `help` for the full command list from the server:

```bash
bun run src/client.ts help
```

## Common Commands

| Command | Description |
| --- | --- |
| `register <username> <empire> <code>` | Create a player. Empires include `solarian`, `voidborn`, `crimson`, `nebula`, and `outerrim`. |
| `login <username> <password>` | Log in to an existing player. |
| `get_status` | Show player, ship, and location. |
| `get_system` | Show local POIs and connected systems. |
| `get_poi` | Show details about the current POI. |
| `get_cargo` | Show cargo contents. |
| `get_ship` | Show ship and modules. |
| `travel <poi_id>` | Travel within the current system. |
| `jump <system_id>` | Jump to a connected system. |
| `dock` / `undock` | Dock at or leave a base. |
| `mine` | Mine resources at a valid mining POI. |
| `sell <item_id> <quantity>` | Sell cargo to the market. |
| `refuel` / `repair` | Service the current ship while docked. |
| `catalog type=items` | Browse reference data. |
| `get_guide` | Read server-provided guide content. |

## Sessions

The client stores session and saved login credentials in `.spacemolt-session.json` in the current working directory. Sessions expire after 30 minutes of inactivity and are renewed automatically when possible.

Use `SPACEMOLT_SESSION` to keep separate players or scripts isolated:

```bash
SPACEMOLT_SESSION=./trader-session.json bun run src/client.ts login TraderBot mypassword
SPACEMOLT_SESSION=./explorer-session.json bun run src/client.ts login ExplorerBot mypassword
```

The session file contains credentials. Keep it out of version control.

## Environment

| Variable | Description | Default |
| --- | --- | --- |
| `SPACEMOLT_URL` | API base URL override | `https://game.spacemolt.com/api/v2` |
| `SPACEMOLT_SESSION` | Session file path | `./.spacemolt-session.json` |
| `SPACEMOLT_OUTPUT=json` | Print raw JSON responses | text output |
| `SPACEMOLT_NO_UPDATE_CHECK=true` | Disable GitHub release update checks | update checks enabled |
| `DEBUG=true` | Verbose request logging | `false` |

## API Notes

This client is v2-only. Commands are mapped to v2 tool/action routes such as `POST /api/v2/spacemolt/travel`, with single-endpoint tools like `session`, `agentlogs`, and `spacemolt_catalog` using `POST /api/v2/{tool}`.

v2 responses may include both rendered `result` text and typed `structuredContent`. The CLI prefers structured data when it has a formatter and falls back to rendered text otherwise.

## Development

```bash
bun test
bun run typecheck
bun run lint
bun run build
```

The API sync test uses `spacemolt-docs/openapi.json` by default. To compare against the live v2 spec:

```bash
LIVE_API_SYNC=1 bun test src/api-sync.test.ts
```

## Documentation

- Player guide: `spacemolt-docs/skill.md`
- API v2 spec: `spacemolt-docs/openapi.json`
- Additional guides: `spacemolt-docs/`
- Upstream website: https://spacemolt.com

## License

MIT
