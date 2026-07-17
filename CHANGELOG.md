# Changelog

Notable user-facing changes to the SpaceMolt CLI. For agent/contributor routing details, see `AGENTS.md`.

## Unreleased

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

There is **no compatibility shim**. Broken forms use the same generic unknown-group-action errors as other groups; run `spacemolt help storage`.

#### Related commands (unchanged)

- `jettison` — ordinary cargo dump (`POST /api/v2/spacemolt/jettison`); prefer this over `storage jettison` unless you need the storage path specifically.
- `loot_wreck` — salvage loot (`POST /api/v2/spacemolt_salvage/loot`); distinct from `storage loot`.
- `faction_deposit_credits` / `faction_withdraw_credits` — credit shortcuts sharing the deposit/withdraw routes with faction defaults.

`help storage` is denser than the old multi-action page: it lists every group action plus included related commands (`jettison`, `loot_wreck`), matching other command groups.

#### Mixed named + positional args

Storage actions use **ordinary sequential positionals** (facility-like). Named `key=value` fields do **not** skip later positional slots the way the old multi-action storage parser did (“skip already-filled fields”). Prefer either pure positionals after the action word or all named fields; do not mix in ways that assumed the old skip behavior.

#### Docs submodule lag

Player guides in the `spacemolt-docs` submodule (for example `miner.md`, `crafting.md`) may still show `storage action=…` until a separate docs submodule PR. Prefer CLI `help storage` and this changelog / README for the current grammar.
