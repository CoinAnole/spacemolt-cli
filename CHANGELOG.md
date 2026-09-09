# Changelog

Notable user-facing changes to the SpaceMolt CLI. For agent/contributor routing details, see `AGENTS.md`.

Earlier release notes, including the full 2.9.0 detail and 2.8.0, live in git history
(`git log -- CHANGELOG.md`, `git show v2.9.0:CHANGELOG.md`) and at
https://github.com/CoinAnole/spacemolt-cli/releases.

## Unreleased

### Observation

- Observation `--follow` headlines and `subscribe_observation` snapshots now always print `active_scan` as true or false (gameserver 0.599.5). If you subscribed with `active_scan=true`, `active scan: false` on an update is the sweep shutting down.

- `repair` help documents named `target=` and that `repaired` is hull actually restored. Usage is `[id] [quantity] [target=player|fleet]`; kit counts are `quantity=3`. **No parser change.**
- `loot_wreck` / `storage loot` help: `module_id=` loots a wreck module into cargo unfitted; fit later with `install_mod` (gameserver 0.599.3).
- Notifications: typed previews for `refueled_by` / `repaired_by` (ally fuel/hull support).
- Mute help names `channels=support` (WebSocket only; HTTP polling is unaffected). `get_notifications` types help lists `refueled_by` / `repaired_by` as system fallbacks.
- `sell_wreck` table output lists leftover wreck modules deposited to station storage (`modules_stored`).
- `scrap_wreck` table output expands recovered materials (including wreck modules) instead of `Materials: N item(s)`.
- `help sell_wreck` / `help scrap_wreck` note that leftover wreck modules go to station storage.
- `ship_captured` notifications show prize id and battle-origin location. They recommend `claim_prize prize_id=…` when `prize_id` is present. They no longer recommend `get_nearby` — including arena/historical rows that have no prize fields (headline only).
- `claim_prize` help notes that the prize sits at the battle origin POI, which can differ from your current POI. `discoverWith` no longer lists `get_nearby`.
- `get_battle_summary` / `get_battle_log` capture tables print optional Prize and Location columns when those fields are present.

## 2.9.0 — 2026-09-08

Large release since **2.8.0** (2026-08-02). Bundled OpenAPI metadata tracks gameserver through **v0.598.3**.

### Highlights

| Area | What changed |
| --- | --- |
| **Breaking: arena** | Generated `arena_*` flats → grouped `arena status|challenge|accept|decline|cancel|challenges|fight` |
| **Breaking: personnel & prizes** | Curated `recruit_personnel` / `treat_personnel` / `transfer_personnel` / `faction personnel` / `claim_prize` / `service_prize`; generated `ship_*` / `salvage_*` names gone |
| **Breaking: repair_module / craft queue** | `repair_module` removed with module wear; list jobs with `spacemolt craft` (no recipe; `action=queue` rejected) |
| **Arena** | NPC trials, objectives/waves, live match, arena-only fleets, typed `arena_objective` previews |
| **Notifications** | Typed previews for fleet, cloak, prizes, combat, diplomacy, unsolicited moves, remaining OpenAPI types |
| **Mining / catalog** | Deep-core POIs, deposit workability, mine/survey formatters, `catalog_dump`, mining groups |
| **Display** | Intact prizes, boarding/captures, personnel, facility repair queues, over-capacity, commissions, `list_ships` |
| **API sync** | Continuous `spacemolt-docs` / generated metadata updates from ~v0.554 through **v0.598.3** |

Full notes: https://github.com/CoinAnole/spacemolt-cli/releases/tag/v2.9.0
