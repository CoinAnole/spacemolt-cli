# Changelog

Notable user-facing changes to the SpaceMolt CLI. For agent/contributor routing details, see `AGENTS.md`.

Earlier release notes, including the full 2.9.0 detail and 2.8.0, live in git history
(`git log -- CHANGELOG.md`, `git show v2.9.0:CHANGELOG.md`) and at
https://github.com/CoinAnole/spacemolt-cli/releases.

## Unreleased

### Navigation

- `dock` help names `station_under_attack` and the 0.604.0 join rules (armed join; unarmed/wrecked stay out; wildlife hunts unless leviathan).
- `dock` table output now prints envelope `cargo` when present, so mission cargo handed on arrival is visible without `get_cargo`.

### Observation

- Observation `--follow` headlines and `subscribe_observation` snapshots now always print `active_scan` as true or false (gameserver 0.599.5). If you subscribed with `active_scan=true`, `active scan: false` on an update is the sweep shutting down.
- Observation `--follow` headlines now count arena challenge enemies and intact prizes (`arena_npcs_changed` / `arena_npcs_departed`, `prizes_changed` / `prizes_departed`; gameserver 0.601.0). A knocked-out arena enemy is a hull 0 change, not a departure — enemies leave the feed only when the match ends. Help documents the live arena watch.
- `subscribe_observation` snapshots of a running NPC challenge are golden'd (`subscribe_observation_arena`).

- `repair` help documents named `target=` and that `repaired` is hull actually restored. Usage is `[id] [quantity] [target=player|fleet]`; kit counts are `quantity=3`. **No parser change.**
- `no_space` suggests a full hold on loot left the wreck untouched. `cargo_capacity_exceeded` no longer names `loot_wreck`.
- `loot_wreck` / `storage loot` help: `module_id=` loots a wreck module into cargo unfitted; fit later with `install_mod` (gameserver 0.599.3).
- Notifications: typed previews for `refueled_by` / `repaired_by` (ally fuel/hull support).
- Mute help names `channels=support` (WebSocket only; HTTP polling is unaffected) and `channels=chat.emergency` (gameserver 0.608.0: muting opts you out of distress calls entirely — hides the ping and the `mission_id`; nothing is assigned). `get_notifications` types help lists `refueled_by` / `repaired_by` as system fallbacks. **No parser change.**
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
- `service_prize` help now documents that repair spends any repair item from your cargo, not only a basic repair kit (gameserver 0.609.2). Pass `item_id=<id>` to choose one; omit it and the cheapest repair item in your cargo is used. On refuel, omit `quantity` or pass 0 to transfer the safe maximum fuel. On repair, omit `quantity` or pass 0 to spend one repair item. Usage lists `item_id=`. Arguments stay `prize_id` and `service_action`. **No parser change.**

### Crafting

- `craft` / `recycle` help now say omitted `preset` is `fast` (soonest finish; ownership only breaks ties) (gameserver 0.601.3). `help craft` warns that a paid public rental can beat your own idle facility and prepays that facility's per-run rental fee. Pass `preset=prefer_own` for ownership-order routing. Recycle has no `workshop` preset. **No parser change.**

### Facilities

- `faction_facility_owned` table output reads `faction_rent` instead of top-level rent fields, prints `Facilities: N`, and still prints the top-level `hint` (gameserver 0.606.2). **No parser change.**
- `faction_facility_list` table output prints the same `faction_rent` summary when the server includes it. Omitted when the faction owns no facilities at that station — no second `faction_facility_owned` call required to see the bill (gameserver 0.606.2). **No parser change.**
- Rent summaries (`facility_list` personal/faction bills included) print the required `facilities` count.
- `facility_owned` (`spacemolt facility owned`) table output prints `Personal rent bill` / `Arrears` from `rent`. **No parser change.** Not a JSON break — `rent` was already nested.

### Query

- `get_location` table output lists nearby pirates with the same livery line as `get_nearby` (`Boss` prefix, crew name, status, optional `#RRGGBB` name colors). The heading is `Nearby Pirates (N):` instead of `Nearby Pirates: N`. Colors stay omitted when the server omits them (gameserver 0.602.0). **No parser change.**
- `get_base` / docked-base `inspect` shortage rows now print `buy order: yes` or `buy order: no` from gameserver 0.605.2 `buy_order_available`. Sell only `yes` rows through the public market; check current prices and order depth. `no` means the station must arrange procurement. Availability is a snapshot and does not guarantee enough order depth to cover the missing quantity. Help documents the split. **No parser change.**
- `catalog type=skills` uses a dedicated table (Name, ID, Category, Max, optional Empire) instead of the generic item columns (title `Items`). A one-row page (`id=refining`) prints the full catalog `description` under Details, plus Training and any server-supplied `bonus_per_level`. Crafting and Refining omit Bonuses — gameserver 0.606.1 dropped the advertised refining-efficiency and bulk-crafting bonuses that were never active; the catalog sentence is the source of truth. List pages do not truncate that copy into a Description column. **No parser change.** `get_skills` remains progress-only.
- `help catalog` includes `type=skills id=refining`. `help get_skills` points at `catalog`. **No parser change.**
- `catalog type=recipes` Use column prefers dump venue fields when present and treats `"Facility Only"` / `"Ship Passive"` as load-bearing (not `facility_only` alone). Ship Passive is never shown as craftable.
- `catalog_dump` human output adds a Recipe venues census when dump recipes carry `hand_craftable`. `--jq` example projects `hand_craftable` / `produced_by_facility_ids` (dump-only, gameserver 0.600.0). Census `no venue` means not workshop, not ship-passive, empty facility ids.
- `inspect` of a catalog recipe, and `catalog type=recipes` when the page has a single recipe, print `Venue:` and `Produced by:` from `produced_by_facilities`.
- `get_system_agents` table output lists optional Docked (`true`/`false`) when the server reports `NearbyPlayer.docked` (gameserver 0.601.1). That is the same boolean `get_nearby` already surfaces as `[DOCKED]`; this table does not use that marker. Docked pilots cannot be attacked, scanned, or traded with until they undock.
- `get_action_log` help names `event_type=faction.refuel` with `faction_id=` for faction bunker withdrawals by members and allies (gameserver 0.605.1). Table output prints optional Pilot and Fuel when `data` carries them; station stays the existing Base column. **No parser change.**

### Taxes

- `get_tax_estimate` table output shows inactivity exemption, outstanding empire bounties, server payment guidance, and the latest weekly statement when present (gameserver 0.605.0). Current estimate, current debt, and the historical statement stay in separate blocks. `pay_bounty` help See also and Discover-with now point at `get_tax_estimate`. **No parser change.**

### Citizenship

- `citizenship list` / `renounce` / `withdraw` help is curated so the group no longer shares the generic citizenship-tool blurb. Renounce documents that the last citizenship can be dropped, that you stay stateless across server restarts until you apply again, and that tax treatment follows that status (gameserver 0.605.4). See also `get_tax_estimate` and `get_empire_info`. **No parser change.**
- `citizenship list` / `apply` / `renounce` / `withdraw` table output uses a dedicated Citizenship view: origin vs remaining citizenships, `Citizenships: none` when remaining is empty, petitions when present, and `Renounced:` after a drop.
- `get_status` / `get_state` / `get_player` table output prints `Citizenships: none` when you hold none (`get_status` is an alias of `get_state`; snapshot omits the key when empty; an explicit empty array also prints none). Player-shaped payloads on other commands still omit the line when the key is absent.

### Missions

- `get_active_missions` (and the post-action `accept_mission` / `abandon_mission` re-list) now append `cargo:N` and `storage:M` to an objective's `current/required` when the server sends `ObjectiveProgressInfo.in_cargo` / `in_storage` (gameserver 0.604.1). That is the same on-hand stock that delivery, pickup, and crafting consult. Progress stays `current/required`; the suffix is on-hand stock, not a substitute for it.
- `get_active_missions` / `accept_mission` / `abandon_mission` and the `get_missions` board show an optional Community column (`12.5% ore_iron: 90/720`, or `yes` when only the boolean is set) for community/faction-wide missions. `complete_mission` already printed contribution on completion; this is the in-progress view. Ordinary missions omit the column.
- Table output for `jump`, `dock`, `mine`, `buy`, `sell`, `create_buy_order`, `create_sell_order`, `sell_wreck`, `scrap_wreck`, `survey_system`, and `complete_mission` now prints the Active Missions table when the server includes envelope `missions` (gameserver 0.605.3; `complete_mission` remaining-list is the same envelope). The section is omitted when unchanged, and snapshot commands such as `get_status` do not reprint it. Survey stops count in any order. Already parked in a survey mission's final system still needs a jump out and back. Kill and crafting still require `get_active_missions`. **No parser change.**
- `dock` table output also prints envelope `cargo` when present, so mission cargo handed on arrival is visible without `get_cargo`. An explicit empty array means the hold emptied; an absent key means unchanged.
- Table output for `get_active_missions` (and the post-action `accept_mission` / `abandon_mission` re-list) and the `get_missions` station board now prints the server-issued description in full after the list (gameserver 0.606.3). The truncated board Description column is replaced by those follow-on lines. Missing descriptions are omitted; present strings print in full.
- `distress_signal` / `accept_mission` help documents the gameserver 0.608.0 claimable rescue: one mission_id, first accept_mission wins (docked or not), counts toward the 5-mission cap. mission_id is empty when nobody heard the call. **No parser change.**
- `distress_signal` table output prints `Mission ID` and `Responders reached` instead of `Missions sent` (gameserver 0.608.0). `Responders reached` is how many online pilots within 5 jumps heard the broadcast, not how many are coming. Empty `mission_id` (nobody in range; no rescue posted) prints `Mission ID: none`. `Expires in:` still prints when the server sends `expires_seconds`, including that 0-heard path. **No parser change.**
- `chat_message` previews on `channel=emergency` print `distress_type`, `system`, and `mission_id` when present, and suggest `accept_mission id=…` when `mission_id` is non-empty (gameserver 0.608.0 claimable rescue). Empty `mission_id` omits the claim prompt. Non-emergency chat is unchanged. **No parser change.**

### Chat

- `get_chat_history` help lists `emergency` as read-only MAYDAY history (gameserver 0.608.0). Use it to reread distress text. The `mission_id` for `accept_mission` comes from the live emergency broadcast, not from history. **No parser change.**

### Combat

- `use_item` help names 0.601.2 `boarding_locked` on `emergency_warp_device`.
- `attack` help notes that an armed faction station may join a member's fight in the same system. `hunt` help notes that a leviathan hunt may pull an armed faction station in-system (gameserver 0.604.0).
- `get_battle_status` help names `flee_required` as a speed-adjusted baseline (floor 1), not a hard minimum of 3, and that the field is omitted while warp-disrupted or boarding-intercepted (gameserver 0.601.4). **No parser change.**
- `get_battle_status` table output prints `Latch` from `combat_state.latch_status` while you are latching onto a target (gameserver 0.609.4). `shields_holding` means keep the target's shields down; `out_of_range` means close to point-blank first. When both gates are shut the field is `out_of_range`. Omitted once marines are aboard, omitted for the ship being boarded, and omitted when you are not latching. Not the Boarding table Progress column. Help names the same answers. **No parser change.**
- `reload` table output shows per-weapon success and failure for a bulk reload (gameserver 0.609.0). Mixed batches stay exit 0. Single-weapon text is unchanged. **No parser change.**
- `reload` ammo display names inside `weapons` resolve like the top-level ammo argument. Weapon instance ids stay literal. **No parser change.**
- `help reload` documents `weapons=[{weapon_instance_id, ammo_item_id?}]`, max 50, one tick for the batch, omit the single-weapon arguments, ammo display names inside the array resolve, weapon instance ids do not. **No parser change.**

### Personnel

- `treat_personnel` help distinguishes active out-of-combat field treatment (`provider=field`) from automatic fleet triage, and names station, Shipboard Sickbay, and Field/Fleet Hospital sources for own-ship vs same-location allied treatment (gameserver 0.603.1). Omit `id` for your ship or faction reserve; pass an allied player at the same POI for remote field treatment; `provider=faction` plus `reserve=true` treats the faction reserve (ManageTreasury). Module names are not CLI grammar: `get_ship` lists the fitted Type id; `inspect` shows Remote medical on the module, or `Capabilities: remote_medical_treatment` on the ship class. **No parser change.**

### Storage

- `storage view` table output lists durable gifts (`sender`, time, credits, items, ships, note). An explicit empty `gifts` array prints `Gifts: none`. An omitted key prints nothing. `messages` are unchanged. **No parser change.**
- `dock` table output lists durable gifts after trade fills: `Gifts: N`, the trade-fill truncated suffix when `gifts_truncated` is true, `gifts_note` when non-empty, then one block per returned row. Dock rows follow `GiftNotification` and do not print `ships` or `base_id`. **No parser change.**

### Fixed

- Whole numbers outside the safe integer range (`|n| <= 2^53-1`) are preserved on v2 HTTP JSON and re-emitted by `--json`, `--yaml`, `--structured`, `--field`, `--fields`, and `--jq`. Notification amounts that used to fall back to `0` (`xp_gained`, damage labels, raid HP) print the digits. Human credit lines and notification `positiveNumber` print those digits as well.

### Breaking

- HTTP 429 `--json` output is now `{ error: { code, message, retry_after?, limit?, scope? } }` instead of a string `error` with leftover top-level `limit` / `message`.
- `faction_facility_owned` (`POST /api/v2/spacemolt_facility/faction_owned`, gameserver 0.606.2): `total_rent_per_cycle`, `arrears_owed`, and `note` moved into `faction_rent`. Scripts reading `--json` / `--yaml` must use `faction_rent.total_rent_per_cycle` (and so on). Nothing was removed, only relocated. The object also has required `facilities` and `est_rent_per_day`, plus optional `grace_cycles`.
- Gameserver 0.608.2 reordered JSON keys inside `structuredContent` on the v2 HTTP API. Field names, values, and types are unchanged. `--field` / `--fields` / `--jq` already read by name. Live `--json` / `--yaml` / `--structured` / `--keys` / `--search-keys` re-emit keys in the server's new insertion order; human map-line order (for example Standings) may follow that order too. Scripts must read `--json` by name, not by position. Whole numbers whose digits do not fit in a safe integer (`|n| <= 2^53-1`) are preserved on v2 HTTP JSON. `--json`, `--yaml`, `--structured`, `--field`, `--fields`, and `--jq` re-emit those exact digits. Exponent and fractional tokens are unchanged. Safe integers stay ordinary JSON numbers. Schema integer arguments such as `shipping_post` `base_reward` send those digits. Notification amounts that used to fall back to `0` (`xp_gained`, damage labels, raid HP) print the digits. Credit helpers in shipping, inspect, social, ship, and market, and notification `positiveNumber`, print the digits of an out-of-range integer too. They do not print a rounded value and they do not print `0`.

### Errors

- `ip_timed_out` suggestion now names `retry_after` (gameserver 0.606.0). Human output already prints `Wait` from envelope or `details.retry_after`, plus `Limit:` / `Scope:` when present. Still not auto-retried.
- `station_under_attack` now has a local suggestion: wait for the battle to end, then retry the same command. Common when a faction-mate fights in that system (gameserver 0.604.0).
- `boarding_locked` now has a local suggestion: wait for the boarding latch to clear, then retry the emergency jump device. Flee makes no progress; the emergency warp stabilizer and emergency cloak are skipped silently (gameserver 0.601.2).
- Commands and session create auto-retry `rate_limited` waits of at most 60 seconds from `retry_after`, `details.retry_after`, and the HTTP `Retry-After` header. `action_pending` and `ip_timed_out` are not auto-retried.
- `rate_limited` suggestion now names 30 mutations and 300 queries per session, plus the IP-wide timeout after 50 rejections/min.
- Human API errors print `Limit:` / `Scope:` when present, and `Pending command:` for `action_pending`.
- Local suggestions for `action_pending` (one mutation per tick; do not resubmit immediately) and `ip_timed_out` (do not keep retrying). `ip_timed_out` is not retryable.
- `insufficient_credits` now has a local suggestion. On `craft`, it treats the miss as credits (labor/rental), not materials — do not deposit items unless the code is `missing_materials` / `missing_faction_materials` — and points at `dry_run=true` plus `preset=cheap` / `prefer_own` (gameserver 0.601.5 recategorized a treasury miss that used to look like missing materials; the server message still names that path when it applies). On `faction declare_war`, war costs 50,000 from your wallet — check `get_status`; do not `faction_deposit_credits`. On `citizenship apply`, the fee comes from your player balance (balance+fee) — check `get_status`; do not `faction_deposit_credits`. Other commands get a generic credits-wallet suggestion; `faction_deposit_credits` is suggested only if the server names the faction treasury.

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
