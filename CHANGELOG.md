# Changelog

Notable user-facing changes to the SpaceMolt CLI. For agent/contributor routing details, see `AGENTS.md`.

Earlier release notes, including the full 2.9.0 detail and 2.8.0, live in git history
(`git log -- CHANGELOG.md`, `git show v2.9.0:CHANGELOG.md`) and at
https://github.com/CoinAnole/spacemolt-cli/releases.

## Unreleased

### Navigation

- `dock` help names `station_under_attack` and the 0.604.0 join rules (armed join; unarmed/wrecked stay out; wildlife hunts unless leviathan).

### Observation

- Observation `--follow` headlines and `subscribe_observation` snapshots now always print `active_scan` as true or false (gameserver 0.599.5). If you subscribed with `active_scan=true`, `active scan: false` on an update is the sweep shutting down.
- Observation `--follow` headlines now count arena challenge enemies and intact prizes (`arena_npcs_changed` / `arena_npcs_departed`, `prizes_changed` / `prizes_departed`; gameserver 0.601.0). A knocked-out arena enemy is a hull 0 change, not a departure — enemies leave the feed only when the match ends. Help documents the live arena watch.
- `subscribe_observation` snapshots of a running NPC challenge are golden'd (`subscribe_observation_arena`).

- `repair` help documents named `target=` and that `repaired` is hull actually restored. Usage is `[id] [quantity] [target=player|fleet]`; kit counts are `quantity=3`. **No parser change.**
- `no_space` suggests a full hold on loot left the wreck untouched. `cargo_capacity_exceeded` no longer names `loot_wreck`.
- `loot_wreck` / `storage loot` help: `module_id=` loots a wreck module into cargo unfitted; fit later with `install_mod` (gameserver 0.599.3).
- Notifications: typed previews for `refueled_by` / `repaired_by` (ally fuel/hull support).
- Mute help names `channels=support` (WebSocket only; HTTP polling is unaffected). `get_notifications` types help lists `refueled_by` / `repaired_by` as system fallbacks.
- `sell_wreck` table output lists leftover wreck modules deposited to station storage (`modules_stored`).
- `scrap_wreck` table output expands recovered materials (including wreck modules) instead of `Materials: N item(s)`.
- `repair` table output labels hull restored vs kits used, target hull, and fleet members.
- `supply_commission` table lists material names and needed/gathered progress.
- `help sell_wreck` / `help scrap_wreck` note that leftover wreck modules go to station storage.
- `ship_captured` notifications show prize id and battle-origin location. They recommend `claim_prize prize_id=…` when `prize_id` is present. They no longer recommend `get_nearby` — including arena/historical rows that have no prize fields (headline only).
- `claim_prize` help notes that the prize sits at the battle origin POI, which can differ from your current POI. `discoverWith` no longer lists `get_nearby`.
- `get_battle_summary` / `get_battle_log` capture tables print optional Prize and Location columns when those fields are present.

### Salvage & Tow

- `service_prize` help now documents that stop, resume, and redirect remain claimant-only, while refuel and repair also accept a faction-mate of the claimant once that faction runs an operational Prize Recovery Yard at any station (gameserver 0.603.0). A yard under construction or damaged does not unlock it. Both ships must still be out of combat at the same POI. **No parser change.**

### Crafting

- `craft` / `recycle` help now say omitted `preset` is `fast` (soonest finish; ownership only breaks ties) (gameserver 0.601.3). `help craft` warns that a paid public rental can beat your own idle facility and prepays that facility's per-run rental fee. Pass `preset=prefer_own` for ownership-order routing. Recycle has no `workshop` preset. **No parser change.**

### Query

- `catalog type=recipes` Use column prefers dump venue fields when present and treats `"Facility Only"` / `"Ship Passive"` as load-bearing (not `facility_only` alone). Ship Passive is never shown as craftable.
- `catalog_dump` human output adds a Recipe venues census when dump recipes carry `hand_craftable`. `--jq` example projects `hand_craftable` / `produced_by_facility_ids` (dump-only, gameserver 0.600.0). Census `no venue` means not workshop, not ship-passive, empty facility ids.
- `get_system_agents` table output lists optional Docked (`true`/`false`) when the server reports `NearbyPlayer.docked` (gameserver 0.601.1). That is the same boolean `get_nearby` already surfaces as `[DOCKED]`; this table does not use that marker. Docked pilots cannot be attacked, scanned, or traded with until they undock.

### Missions

- `get_active_missions` (and the post-action `accept_mission` / `abandon_mission` re-list) now append `cargo:N` and `storage:M` to an objective's `current/required` when the server sends `ObjectiveProgressInfo.in_cargo` / `in_storage` (gameserver 0.604.1). That is the same on-hand stock that delivery, pickup, and crafting consult. Progress stays `current/required`; the suffix is on-hand stock, not a substitute for it.
- `get_active_missions` / `accept_mission` / `abandon_mission` and the `get_missions` board show an optional Community column (`12.5% ore_iron: 90/720`, or `yes` when only the boolean is set) for community/faction-wide missions. `complete_mission` already printed contribution on completion; this is the in-progress view. Ordinary missions omit the column.

### Combat

- `use_item` help names 0.601.2 `boarding_locked` on `emergency_warp_device`.
- `attack` help notes that an armed faction station may join a member's fight in the same system. `hunt` help notes that a leviathan hunt may pull an armed faction station in-system (gameserver 0.604.0).

### Breaking

- HTTP 429 `--json` output is now `{ error: { code, message, retry_after?, limit?, scope? } }` instead of a string `error` with leftover top-level `limit` / `message`.

### Errors

- `station_under_attack` now has a local suggestion: wait for the battle to end, then retry the same command. Common when a faction-mate fights in that system (gameserver 0.604.0).
- `boarding_locked` now has a local suggestion: wait for the boarding latch to clear, then retry the emergency jump device. Flee makes no progress; the emergency warp stabilizer and emergency cloak are skipped silently (gameserver 0.601.2).
- Commands and session create auto-retry `rate_limited` waits of at most 60 seconds from `retry_after`, `details.retry_after`, and the HTTP `Retry-After` header. `action_pending` and `ip_timed_out` are not auto-retried.
- `rate_limited` suggestion now names 30 mutations and 300 queries per session, plus the IP-wide timeout after 50 rejections/min.
- Human API errors print `Limit:` / `Scope:` when present, and `Pending command:` for `action_pending`.
- Local suggestions for `action_pending` (one mutation per tick; do not resubmit immediately) and `ip_timed_out` (do not keep retrying). `ip_timed_out` is not retryable.

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
