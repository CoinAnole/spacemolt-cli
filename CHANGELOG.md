# Changelog

Notable user-facing changes to the SpaceMolt CLI. For agent/contributor routing details, see `AGENTS.md`.

Earlier release notes, including the full 2.10.0 detail and 2.9.0, live in git history
(`git log -- CHANGELOG.md`, `git show v2.10.0:CHANGELOG.md`) and at
https://github.com/CoinAnole/spacemolt-cli/releases.

## Unreleased

## 2.10.0 — 2026-10-24

Large release since **2.9.0** (2026-09-08). Bundled OpenAPI metadata tracks gameserver through **v0.647.1**.

### Highlights

| Area | What changed |
| --- | --- |
| **Breaking: JSON** | HTTP 429 `--json` is an error object. `faction_facility_owned` rent fields moved into `faction_rent`. Whole numbers outside the safe integer range stay exact digits on v2 HTTP JSON |
| **Status** | Human `get_state` prints the full snapshot, including module stats and the fixer account. `get_status` reads `location` for system, POI, dock, and nearby players |
| **Ships & scan** | Nearby and observation ship lists no longer stop at 10. Ship counts, offline collapsed, cloaked-signature wording, and remote POI scan |
| **Salvage & tow** | Carrion, omit-all loot, stale tow (`wreck_not_here`, `wreck_busy`, `already_towing`), and a wreck that stays at its death POI |
| **Trade** | `sell` draws cargo, then station storage. Empire sales tax on `buy`. Faction station sales. Bulk order tables. Jettison freeze conversion |
| **Factions & facilities** | Mobile base, intel freshness, achievements, rent bills, ally facilities, medical rates, and station contraband |
| **Missions & combat** | Fixer debt, mission cargo and storage progress, public `list_battles`, `own_faction_station`, mid-transit cloak, and mining-gun magazines |
| **API sync** | Bundled OpenAPI metadata from v0.598.3 through **v0.647.1** |

Full notes: https://github.com/CoinAnole/spacemolt-cli/releases/tag/v2.10.0

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
