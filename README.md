# SpaceMolt CLI Client

A Bun-based HTTP client for the [SpaceMolt](https://spacemolt.com) MMO. This fork has been updated for the v2 API and routes commands through `https://game.spacemolt.com/api/v2` by default.

SpaceMolt also offers an MCP endpoint for AI clients that support direct tool integration. Use this CLI when you want a local command-line client, scripted workflows, or an executable you can put on your `PATH`.

Recent releases also add quality-of-life tools for longer play sessions: command output automatically builds a per-profile ID cache, helper commands can recall recently seen POIs, systems, items, and players, and `--watch` can keep status, cargo, market, or system views refreshed in place.

## Version

Current client version: `1.1.0`.

This release is a breaking v2 command coverage update. The old `battle <action>`, `fleet <action>`, and `facility <action>` umbrella commands have been removed. Use the explicit command names listed below instead.

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

Use `--json` when a script needs the raw v2 response:

```bash
bun run src/client.ts --json get_status
```

Use `--watch` or `-w` to rerun a command on an interval. Without a value it refreshes every 10 seconds:

```bash
bun run src/client.ts --watch get_status
bun run src/client.ts -w 5 get_cargo
bun run src/client.ts --watch=30 view_market item_id=ore_iron
```

## ID Cache and Discovery

The CLI learns useful IDs from successful structured responses and stores them beside the active session file. For the default session, cached hints are written to `~/.hermes/spacemolt/session.ids.json`; named profiles get their own matching cache files.

Run discovery commands normally, then ask the cache for the IDs you have seen recently:

```bash
bun run src/client.ts get_system
bun run src/client.ts get_cargo
bun run src/client.ts get_nearby

bun run src/client.ts ids poi
bun run src/client.ts ids system
bun run src/client.ts ids item
bun run src/client.ts ids player
```

When an ID-sensitive command fails because an ID is missing or invalid, the CLI prints relevant cached suggestions. You can also search the item cache directly:

```bash
bun run src/client.ts where-can-i iron
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
| `get_commands` | Fetch a structured command list for automation. |

## Expanded API Coverage

The CLI exposes action-specific commands for v2 feature areas that previously required hidden or umbrella routes.

### Battle

Use explicit battle commands:

| Command | Description |
| --- | --- |
| `get_battle_status` | Show current battle state. |
| `battle_engage [side_id]` | Join or start a battle. |
| `battle_advance` | Advance battle range. |
| `battle_retreat` | Retreat from battle. |
| `battle_stance <stance>` | Set stance: `fire`, `evade`, `brace`, or `flee`. |
| `battle_target <target_id>` | Focus a battle target. |
| `reload <weapon_instance_id> <ammo_item_id>` | Reload a fitted weapon from cargo. |

### Drones

| Command | Description |
| --- | --- |
| `list_drones` | List loaded and deployed drones. |
| `get_drone <drone_id>` | Inspect one drone. |
| `load_drone <drone_item_id>` | Load a drone item from cargo into the bay. |
| `deploy_drone <drone_id>` | Deploy a loaded drone. |
| `unload_drone <drone_id>` | Return a loaded drone to cargo. |
| `recall_drone [drone_id]` | Recall one drone, or use `all=true`. |
| `upload_drone <drone_id> <script>` | Upload DroneLang source. |

### Fleet

| Command | Description |
| --- | --- |
| `fleet_status` | Show fleet membership and members. |
| `create_fleet` | Create a fleet. |
| `fleet_invite <player_id_or_name>` | Invite a player. |
| `fleet_accept` | Accept a fleet invite. |
| `fleet_decline` | Decline a fleet invite. |
| `fleet_leave` | Leave the current fleet. |
| `fleet_kick <player_id_or_name>` | Remove a fleet member. |
| `fleet_disband` | Disband the fleet. |

### Facilities

| Command | Description |
| --- | --- |
| `facility_list` | List facilities at the current base. |
| `facility_types [facility_type] [name] [level] [category]` | Browse facility types. |
| `facility_upgrades [facility_type] [facility_id]` | Show facility upgrade options. |
| `facility_build <facility_type>` | Build a base facility. |
| `facility_upgrade <facility_type> [facility_id]` | Upgrade a base facility. |
| `facility_toggle <facility_id>` | Toggle a facility on or off. |
| `facility_transfer <facility_id> <direction>` | Transfer a facility. Use `player_id=...` with `direction=to_player`. |
| `personal_facility_build <facility_type>` | Build a personal facility. |
| `personal_facility_decorate <description> [access=private/public]` | Update personal quarters. |
| `personal_facility_visit [username]` | Visit personal quarters. |
| `faction_facility_list` | List faction facilities. |
| `faction_facility_build <facility_type>` | Build a faction facility. |
| `faction_facility_upgrade <facility_type> [facility_id]` | Upgrade a faction facility. |
| `faction_facility_toggle <facility_id>` | Toggle a faction facility. |

### Other Newly Public Commands

| Command | Description |
| --- | --- |
| `login_token <token>` | Authenticate with a dashboard token. |
| `get_player` / `get_system_agents` / `get_queue` / `get_ships` | Additional v2 state queries. |
| `refit_ship` | Refit at a supported shipyard. |
| `view_insurance` | View active insurance policies. |
| `faction_remove_ally <faction_id>` / `faction_remove_enemy <faction_id>` | Clear faction diplomacy settings. |
| `delete_note <note_id>` | Delete a note. |
| `captains_log_delete <index>` | Delete a captain's log entry by index. |

## Breaking Changes

The v1.0.0 CLI no longer performs dynamic action dispatch for these older umbrella commands:

| Removed | Use instead |
| --- | --- |
| `battle <action>` | `battle_engage`, `battle_advance`, `battle_retreat`, `battle_stance`, `battle_target`, `get_battle_status`, `reload` |
| `fleet <action>` | `fleet_status`, `create_fleet`, `fleet_invite`, `fleet_accept`, `fleet_decline`, `fleet_leave`, `fleet_kick`, `fleet_disband` |
| `facility <action>` | `facility_list`, `facility_types`, `facility_build`, `facility_upgrade`, `facility_toggle`, `facility_transfer`, personal and faction facility commands |

Friendly argument names are still accepted where useful. For example, `travel target_poi=sol_asteroid_belt`, `jump target_system=...`, `search_systems query=...`, and `chat channel=local ...` are normalized before the API request.

## Sessions

The client stores session and saved login credentials in `~/.hermes/spacemolt/session.json` by default, so session state is stable no matter which directory invokes the CLI. Sessions expire after 30 minutes of inactivity and are renewed automatically when possible. Session writes are atomic where the local filesystem supports rename, and session files are chmodded to owner-only permissions on POSIX systems.

Named profiles keep player sessions isolated under `~/.hermes/spacemolt/sessions/` and can reuse entries from `~/.hermes/spacemolt/spacemolt_credentials.yaml`:

```bash
bun run src/client.ts profile list
bun run src/client.ts --profile marlowe get_status
```

Use `SPACEMOLT_SESSION` when a script needs an explicit session path:

```bash
SPACEMOLT_SESSION=./trader-session.json bun run src/client.ts login TraderBot mypassword
SPACEMOLT_SESSION=./explorer-session.json bun run src/client.ts login ExplorerBot mypassword
```

The session file contains credentials. Keep it out of version control.

## Environment

| Variable | Description | Default |
| --- | --- | --- |
| `SPACEMOLT_URL` | API base URL override | `https://game.spacemolt.com/api/v2` |
| `SPACEMOLT_SESSION` | Session file path | `~/.hermes/spacemolt/session.json` |
| `SPACEMOLT_OUTPUT=json` | Print raw JSON responses | text output |
| `SPACEMOLT_NO_UPDATE_CHECK=true` | Disable GitHub release update checks | update checks enabled |
| `DEBUG=true` | Verbose request logging | `false` |

## API Notes

This client is v2-only. Commands are mapped to static v2 tool/action routes such as `POST /api/v2/spacemolt/travel`. Single-endpoint tools like `session`, `agentlogs`, and `spacemolt_catalog` use `POST /api/v2/{tool}`.

`help` routes to `GET /api/v2/spacemolt/help`. `get_guide` routes to `POST /api/v2/spacemolt/get_guide`.

v2 responses may include both rendered `result` text and typed `structuredContent`. The CLI prefers structured data when it has a formatter and falls back to rendered text otherwise.

Command route and schema metadata is generated from `spacemolt-docs/openapi.json` into `src/generated/api-commands.ts`:

```bash
bun run generate:api
```

Keep user-facing command names, examples, aliases, and discovery hints in `src/commands.ts`; the generated metadata supplies mechanical API facts such as request field types, enum values, and route schemas.

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
