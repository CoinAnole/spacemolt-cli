# Changelog

Notable user-facing changes to the SpaceMolt CLI. For agent/contributor routing details, see `AGENTS.md`.

## Unreleased

### ID cache payload resolution (breaking)

Payload fields resolved from the profile ID cache use **exact id/name match only** by default.
Unique **prefix** and **substring** rewrites no longer apply unless soft match is enabled.

Exact name→id rewrites still work without any flag (examples: `travel earth`,
`battle_target raider`, facility display names).

| Old (implicit) | New |
| --- | --- |
| `find_route haven` with only `crosshaven` in cache → `crosshaven` | Sends `haven` unchanged |
| `sell iron` / `buy cell` short fragments → soft rewrite | Sends fragment unless soft match enabled |
| `storage view station_id=node_beta` prefix expand | Requires soft match |
| Silent prefix/substring rewrite | Opt-in + one stderr line (unless `--quiet`) |

#### Who is affected

| Audience | Action |
| --- | --- |
| **Automation** (exact IDs, map tokens) | Usually **do nothing**. New default is safe. Prefer ids from `get_map` / `get_system` / `get_cargo`. |
| **Interactive traders** using short item fragments (`sell iron`, `buy cell`, storage item nicknames) | Enable soft match **or** switch to exact item ids |
| **Interactive navigators** using full/exact POI or system names | Name-exact still works; system **substring** never did the right thing for short real systems |

#### Interactive soft match (restore old short-token UX)

Preferred (merge-safe — do **not** overwrite whole config.json):

1. Merge-safe setter: `spacemolt config fuzzy-ids on` (or `off`). Prefer this over hand-editing.
2. Or edit `~/.config/spacemolt-cli/config.json` (or macOS/Windows config path) and **add**
   `"fuzzyIds": true` alongside existing keys such as `defaultProfile`.
3. Or export for a shell session / tools wrapper:
   `export SPACEMOLT_FUZZY_IDS=1`
4. Or per-invocation: `spacemolt --fuzzy-ids sell iron 50`

**Do not** run `echo '{"fuzzyIds":true}' > config.json` — that wipes `defaultProfile` / `userAgent`.

Precedence: **CLI flag > env > config.json boolean > default (`false`)**. Use `--no-fuzzy-ids` to force off.
`spacemolt doctor` reports the effective soft-match preference and source.

#### Exact-id path (no soft match)

```bash
spacemolt ids item iron          # discovery (still fuzzy search)
spacemolt get_cargo              # seed exact item ids
spacemolt sell ore_iron 50       # exact id — works under strict default
```

#### Notes

- `--fuzzy` remains **jq-only** and does **not** enable ID soft match.
- `--fuzzy-ids` does **not** reintroduce `haven` → `crosshaven` (system/poi: unique **prefix** only, never substring).
- Unique system **prefix** expansion under soft match is intentional (`cro` → `crosshaven`) and prints a stderr notice.
- Completion, `ids`, and `where-can-i` stay fuzzy and are **not** gated by `--fuzzy-ids`.

### Help: `--raw-notifications` vs compact human formatting

`--raw-notifications` skips notification **summarization** only (crafting, action results, system travel progress, and similar collapses). Human output still uses compact one-line formatting; it does not dump full nested notification JSON. Use `--json` / `--structured` / related machine modes when you need full objects.

### Curated `dismantle_outpost` (breaking rename)

Dismantling a faction outpost is now a first-class top-level command, matching `build_outpost` and the skill/API verb `dismantle_outpost()`.

| Surface | Before | After |
| --- | --- | --- |
| Command | Generated flat `facility_dismantle_outpost` and grouped `facility dismantle_outpost` | Curated top-level `dismantle_outpost` only |
| Body args | None | None (empty request body) |
| Human output | Generic fallback | Kit refund / fee / auto-undock details (`=== Outpost Dismantled ===`) |

#### Migration

| Old | New |
| --- | --- |
| `spacemolt facility_dismantle_outpost` | `spacemolt dismantle_outpost` |
| `spacemolt facility dismantle_outpost` | `spacemolt dismantle_outpost` |

There is **no command-name alias**. Requires ManageBases; empty faction storage (items, fuel) and remove garaged ships first; leave free cargo room for the returned Outpost Kit. Founding fee is not refunded; you are undocked afterward.

Outpost built-in fuel bunkers cannot be dismantled alone via `facility dismantle` / `faction dismantle` — remove them by dismantling the whole outpost with `dismantle_outpost`. Help for those commands notes this path.

### Faction ally access toggles

`faction info` now prints OpenAPI ally-sharing fields when present:

- `ally_fuel_access` → Fuel
- `ally_facility_access` → Facilities
- `ally_intel_opt_out` → Intel opt-out

`faction edit` help/usage documents the same optional boolean kwargs. There is **no** storage-sharing toggle in the OpenAPI field set (fuel / facility / intel only).

### Storage command group (breaking)

Station storage is no longer a single multi-action command. It is a **grouped multi-command** (same pattern as `facility` / `faction`):

| Group UX | Flat registry key | Route | Category |
| --- | --- | --- | --- |
| `storage view` | `storage_view` | `POST /api/v2/spacemolt_storage/view` | Station storage |
| `storage deposit` | `storage_deposit` | `POST /api/v2/spacemolt_storage/deposit` | Station storage |
| `storage withdraw` | `storage_withdraw` | `POST /api/v2/spacemolt_storage/withdraw` | Station storage |
| `storage loot` | `storage_loot` | `POST /api/v2/spacemolt_storage/loot` | Wrecks |
| `storage jettison` | `storage_jettison` | `POST /api/v2/spacemolt_storage/jettison` | Cargo |

Nested forms with an explicit action word **still work**. Flat `storage_*` names are internal registry keys only (not top-level public commands).

#### Migration

| Old | New / result |
| --- | --- |
| `spacemolt storage view` | Unchanged |
| `spacemolt storage deposit ore_iron 50` | Unchanged |
| `spacemolt storage action=view` | **Fails** — use `spacemolt storage view` |
| `spacemolt storage action=deposit …` | **Fails** — use `spacemolt storage deposit …` |
| `spacemolt storage --payload-json '…'` (omit-action / implicit deposit) | **Fails** — use `spacemolt storage deposit --payload-json '…'` |
| `spacemolt storage target=faction --payload-json '…'` | **Fails** — use `spacemolt storage deposit target=faction --payload-json '…'` |
| Key=value-only deposit/withdraw without an action token | Insert `deposit` or `withdraw` as the first subcommand token |
| Request body includes `"action"` | **Omitted**; path is `/api/v2/spacemolt_storage/{action}` |
| Human dry-run text | Spaced group form only, e.g. `Dry run: storage deposit` |
| Dry-run / machine `"command": "storage"` | Flat name per action (`"storage_deposit"`, `"storage_view"`, …); prefer URL path `/api/v2/spacemolt_storage/{action}` for the action |

There is **no compatibility shim**. Broken forms use the same generic unknown-group-action errors as other groups; run `spacemolt help storage`. If you scraped dry-run `payload.action`, use the path segment or command name instead.

#### Related commands (unchanged)

- `jettison` — ordinary cargo dump (`POST /api/v2/spacemolt/jettison`); prefer this over `storage jettison` unless you need the storage path specifically.
- `loot_wreck` — salvage loot (`POST /api/v2/spacemolt_salvage/loot`); distinct from `storage loot`.
- `faction_deposit_credits` / `faction_withdraw_credits` — credit shortcuts sharing the deposit/withdraw routes with faction defaults.

`help storage` is denser than the old multi-action page: it lists every group action plus included related commands (`jettison`, `loot_wreck`), matching other command groups.

#### Mixed named + positional args

Storage actions use **ordinary sequential positionals** (facility-like). Named `key=value` fields do **not** skip later bare slots the way the old multi-action storage parser did (“skip already-filled fields”). Safe mixes keep bare tokens for leading positionals and use `key=value` for optional later fields (e.g. `storage deposit ore_iron 50 target=PlayerName`), or use all named. Do not rely on the old skip behavior — e.g. `storage deposit item_id=ore_iron 2` no longer maps `2` to quantity; under ordinary positionals it collides with `item_id`.

#### Docs submodule lag

Player guides in the `spacemolt-docs` submodule (for example `miner.md`, `crafting.md`) may still show `storage action=…` until a separate docs submodule PR. Prefer CLI `help storage` and this changelog / README for the current grammar.
