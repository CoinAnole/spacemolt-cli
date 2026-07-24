# Changelog

Notable user-facing changes to the SpaceMolt CLI. For agent/contributor routing details, see `AGENTS.md`.

## Unreleased

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
