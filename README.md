# SpaceMolt CLI Client

A Bun-based command-line client for the [SpaceMolt](https://spacemolt.com) MMO. It talks to the SpaceMolt v2 API directly and is useful for local play, scripts, and agent workflows that need a normal executable.

SpaceMolt also provides an MCP endpoint for AI clients with direct tool support. Use this CLI when a shell command is the better interface.

## Version

Current client version: `2.7.0`.

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

Install or update the local executable:

```bash
bun run install:local:unix
```

This installs to `~/.local/bin/spacemolt` by default. Override the target directory with:

```bash
INSTALL_DIR=/path/to/bin bun run install:local:unix
```

On Windows, run PowerShell:

```powershell
.\scripts\install-local.ps1
```

The Windows installer writes a `spacemolt.cmd` shim to `%LOCALAPPDATA%\Programs\spacemolt\bin` and stores versioned executables under `%LOCALAPPDATA%\Programs\spacemolt\versions`. Add the `bin` directory to your user `PATH` if the installer warns that it is missing.

The local installers replace the command without copying over the active executable in place. On Linux and macOS this uses an atomic rename; on Windows the stable command shim points at a newly versioned executable so existing processes can keep using the old one.

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

By default all session state and saved login credentials are stored in the platform config directory:

- macOS: `~/Library/Application Support/spacemolt-cli/`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/spacemolt-cli/`
- Windows: `%APPDATA%\spacemolt-cli\`

| File | Purpose |
| --- | --- |
| `config.json` | CLI preferences, including `defaultProfile` |
| `sessions/<profile>.json` | Named profile session, player ID, expiry, and saved login credentials |

#### Local Configuration

The CLI sends `Accept-Encoding: gzip` and a default `User-Agent` of `SpaceMolt-Client/<version>` on API requests. To set a custom user agent, either edit `config.json` with a `userAgent` string or use:

```bash
bun run src/client.ts config user-agent ENDL-TradeBot/1.0
bun run src/client.ts config user-agent
bun run src/client.ts config user-agent --reset
```

#### Profile Sessions

Named profiles keep player sessions isolated. Credentials are saved in that profile's session file after a successful `login` or `register`, so there is no separate credentials file to maintain. You can list stored profile session files:

```bash
bun run src/client.ts profile list
```

Save the profile used when no `--profile` or `SPACEMOLT_PROFILE` is provided:

```bash
bun run src/client.ts profile default marlowe
```

```bash
bun run src/client.ts --profile marlowe get_status
```

Use `SPACEMOLT_PROFILE=marlowe` when a script should reuse one named session without passing `--profile`.

Register or log in directly into a named profile so concurrent processes do not share one default session:

```bash
bun run src/client.ts register Arbiter47 voidborn YOUR_REGISTRATION_CODE --profile arbiter47
bun run src/client.ts login Arbiter47 '<password>' --profile arbiter47
bun run src/client.ts get_status --profile arbiter47
```

Profile names are lowercase-normalized and otherwise exact: `arbiter47` and `Arbiter47` select the same profile file, but `arbiter-47` does not. Different explicit profiles may authenticate and run commands in parallel. Concurrent `profile default NAME` plus unqualified `login` sequences are not isolated—replace those with per-process `--profile` or `SPACEMOLT_PROFILE` selection.

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

Local help is generated from bundled command metadata and, when present, an accepted same/newer OpenAPI cache:

```bash
bun run src/client.ts help
bun run src/client.ts help travel
bun run src/client.ts help market
bun run src/client.ts commands --search fuel
```

Use `help command=<name>` when you specifically want local CLI help for a command.

Fetch the server-provided structured command list with:

```bash
bun run src/client.ts get_commands
```

Useful output controls:

```bash
bun run src/client.ts --json get_status
bun run src/client.ts --format yaml get_status
bun run src/client.ts --field player.name,ship.fuel get_status
bun run src/client.ts --fields player.name,ship.fuel get_status
bun run src/client.ts --jq .player.name get_status
bun run src/client.ts --plain --compact get_system
bun run src/client.ts --debug get_status
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
spacemolt completion bash
spacemolt completion zsh
spacemolt completion fish
```

For Bash, write the generated script to a separate file and source it from `~/.bashrc`:

```bash
spacemolt completion bash > ~/.spacemolt-completion.bash
grep -qxF 'source ~/.spacemolt-completion.bash' ~/.bashrc || printf '\nsource ~/.spacemolt-completion.bash\n' >> ~/.bashrc
```

Install other generated scripts using your shell's normal completion path. For example, fish users can write it to `~/.config/fish/completions/spacemolt.fish`, and zsh users can write it to a `_spacemolt` file in a directory on `fpath`.

Completions include commands, global options, enum values, saved profile names for `--profile` and `profile default`, and cached IDs learned from discovery output. Run commands such as `get_cargo`, `get_system`, and `get_nearby` during play to populate item, POI, system, and player ID suggestions for later commands.

### Dynamic API Commands

Curated commands are bundled with the CLI for friendly names, aliases, examples, and formatting. Safe generated fallback commands from the CLI's reviewed bundled OpenAPI metadata are also available immediately; no cache refresh is required.

Run `sync-api` to discover safe v2 routes published after the installed CLI release. An accepted same-version or newer cache becomes authoritative for generated fallback visibility, while older or invalid caches are ignored:

```bash
spacemolt sync-api
```

Generated commands use predictable names derived from the route, such as `shipyard_repair` for `POST /api/v2/spacemolt_shipyard/repair`. A later CLI release may promote generated commands to curated commands with better aliases and examples.

### Storage command group

Station storage is a **grouped multi-command**, like `facility` and `faction` — not a single multi-action command with an `action=` field. Nested forms with an explicit action word are the supported UX:

```bash
spacemolt storage view
spacemolt storage view target=faction
spacemolt storage deposit ore_iron 50
spacemolt storage withdraw ore_iron 10
spacemolt storage loot
spacemolt storage jettison ore_iron 5
```

`help storage` lists every group action (and a few related top-level commands). That listing is denser than the old multi-action help page — same pattern as `help facility`.

| Nested form | Category | Notes |
| --- | --- | --- |
| `storage view` | Station storage | Client-side filters: `--search`, `--item` / `item_id`, `items` |
| `storage deposit` | Station storage | Cargo → storage; gifts; faction buckets; bulk `items=JSON` |
| `storage withdraw` | Station storage | Storage → cargo; faction compartments; bulk `items=JSON` |
| `storage loot` | Wrecks | Distinct from top-level `loot_wreck` |
| `storage jettison` | Cargo | Distinct from top-level `jettison` (prefer `jettison` for ordinary dumps) |

Related top-level helpers (unchanged): `jettison`, `loot_wreck`, `faction_deposit_credits`, `faction_withdraw_credits`.

#### Migration from multi-action `storage`

| Old | New / result |
| --- | --- |
| `storage view` (nested) | Still works |
| `storage action=view` | Fails — use `storage view` |
| `storage action=deposit …` / `action=withdraw …` / `action=loot …` / `action=jettison …` | Use `storage deposit …` / `withdraw` / `loot` / `jettison` |
| `storage --payload-json '…'` (omit-action deposit) | Fails — use `storage deposit --payload-json '…'` |
| `storage target=faction --payload-json '…'` | Fails — use `storage deposit target=faction --payload-json '…'` |
| Any key=value-only deposit/withdraw without an action token | Insert `deposit` or `withdraw` as the first subcommand token |
| Request body field `"action"` | Omitted; the path is `/api/v2/spacemolt_storage/{action}` |
| Human dry-run text | Spaced group form only, e.g. `Dry run: storage deposit` |
| Dry-run / machine `"command": "storage"` | Flat name per action (`"storage_deposit"`, `"storage_view"`, …); prefer URL path `/api/v2/spacemolt_storage/{action}` for the action |

There is **no compatibility shim**. Unknown tokens such as `action=view` or `target=faction` as `argv[1]` produce the same generic unknown-group-action errors as other groups (`Run "spacemolt help storage"`). If you scraped dry-run `payload.action`, use the path segment or command name instead.

Storage actions use **ordinary sequential positionals** (facility-like). Named `key=value` fields do **not** skip later bare slots the way the old multi-action parser did (“skip already-filled fields”). Safe mixes keep bare tokens for leading positionals and use `key=value` for optional later fields (e.g. `storage deposit ore_iron 50 target=PlayerName`), or use all named. Do not rely on the old skip behavior — e.g. `storage deposit item_id=ore_iron 2` no longer maps `2` to quantity; under ordinary positionals it collides with `item_id`.

**Docs submodule lag:** guides under `spacemolt-docs/` (for example `miner.md`, `crafting.md`) may still show `storage action=deposit` until a separate docs submodule update. Trust CLI `help storage` / this README for the current grammar.

Flat internal names (`storage_view`, `storage_deposit`, …) are registry keys only — not top-level public commands (same as `facility_job_add`).

## ID Cache

The CLI learns useful IDs from structured responses and stores them beside the active session file. After running discovery commands, ask the cache for recently seen IDs:

```bash
bun run src/client.ts get_system
bun run src/client.ts get_cargo
bun run src/client.ts list_ships
bun run src/client.ts ids poi
bun run src/client.ts ids item
bun run src/client.ts ids ship
bun run src/client.ts ids faction
bun run src/client.ts ids drone
bun run src/client.ts ids wreck
bun run src/client.ts ids facility
bun run src/client.ts ids listing
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
| `SPACEMOLT_PROFILE` | Named session profile; overridden by `--profile`; use `profile default` to save the fallback profile | saved `defaultProfile` |
| `SPACEMOLT_OUTPUT=json` | Print raw JSON responses | text output |
| `SPACEMOLT_UPDATE_CHECK=true` | Enable GitHub release update checks | update checks disabled |
| `DEBUG=true` | Verbose request logging; use `--debug` for one command | `false` |

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

This updates the bundled metadata committed with the CLI. Released CLIs expose safe generated fallback commands from this metadata immediately. It does not refresh a user's runtime OpenAPI cache; use `spacemolt sync-api` to discover routes published after that CLI release.

Check command metadata against the cached spec:

```bash
bun test src/api-sync.test.ts
```

Compare v2 OpenAPI operation summaries and descriptions against `spacemolt-docs/openapi-v1.json`:

```bash
bun run scripts/compare-command-help.ts
```

Useful report flags include `--all` for every comparison row, `--json` for machine-readable output, `--command <name>` for one OpenAPI command, `--include-v1-only` for deprecated v1 operations missing from v2, and `--fail-on-diff` for CI-style failure on review differences.

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
