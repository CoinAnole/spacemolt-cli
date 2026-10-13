# Changelog

Notable user-facing changes to the SpaceMolt CLI. For agent/contributor routing details, see `AGENTS.md`.

Earlier release notes, including the full 2.9.0 detail and 2.8.0, live in git history
(`git log -- CHANGELOG.md`, `git show v2.9.0:CHANGELOG.md`) and at
https://github.com/CoinAnole/spacemolt-cli/releases.

## Unreleased

### Navigation

- `dock` help names `station_under_attack` and the 0.604.0 join rules (armed join; unarmed/wrecked stay out; wildlife hunts unless leviathan).
- `dock` table output now prints envelope `cargo` when present, so mission cargo handed on arrival is visible without `get_cargo`.
- `travel`, `jump`, `find_route`, `inspect`, `faction scan_poi`, and `upload_drone` help: an uncharted hidden POI acts like an unknown id. Codes: `invalid_poi` (travel, wormhole mouths included; arriving charts it), `unknown_system` (uncharted wormhole entrance on jump; chart with `survey_system`, by arriving, or through faction intel — that sentence does not use the word travel), `system_not_found` (find_route), `not_found` (inspect), `poi_not_found` (`faction scan_poi`, not the flat `faction_scan_poi` invocation). Drone MOVE is not an upload error: at MOVE time the POI acts like an id that does not exist, and the failure is often silent. `upload_drone` names no code (gameserver 0.618.0). **No parser change.**

### Observation

- `get_nearby`, `get_status`, `get_state`, `get_location`, and the `subscribe_observation` snapshot print every ship row the server returned. They no longer stop at 10. `offline collapsed N` prints when that field is present, including 0. The snapshot prints `Ship counts: …` for `ship_counts`, including `Ship counts: (cleared)` when the map is empty.
- Travel and jump arrival print `offline collapsed N` when details include that number, including 0.
- `subscribe_observation --follow` no longer headlines system agents. It prints `Ship counts: …` when an observation update includes `ship_counts`, and `Ship counts: (cleared)` when that map is empty. `offline collapsed N` prints when that field is present, including 0.
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

### Battle

- `list_battles` lists public battle history with no login (`GET /api/battles`). Page with `limit` (1-100; omit for the server default of 20) and `offset`. `captured=true` lists only boarding captures. Public history is not a prize. Do not poll. `public_api` (60 requests per minute for this IP) is not the session budget of 30 mutations and 300 queries.
- `list_battles` table output shows one row per public battle: ended time, system, category, status, outcome, winning side, pilots, ticks, ships destroyed, ships captured, damage, top damage, station, origin POI, and battle id. The header repeats `captured`, `category`, and `search` when those were sent. A null or empty page prints `No battles.` when the total is 0 or omitted, and `No battles on this page.` when the total is greater than 0. Arena capture rows omit prize and location columns. A wildlife row prints its `origin_poi`. When more rows exist, the next line repeats the command at the next offset. **No parser change.**

### Scanning

- `scan` help names a charted POI id or station base id in your system as a remote scan. Human output for a response with native `poi_id` lists that POI, scan power when sent, players, empire NPCs, pirates, and leviathans, using the same lines as `faction scan_poi`. A native `message` prints as an unlabeled line when it is a non-empty string. A target scan and an area sweep keep the existing Scan Result lines. Success `--json`, YAML, structured, and compact output are unchanged. `--json` and `--structured` errors stay the envelope. `--yaml` and `--compact` errors already use the human error printer, so `no_scanner` shows the new suggestion there too. `no_scanner` suggests fitting `ship_scanner_i`, `ship_scanner_ii`, or `ship_scanner_iii`. Gameserver 0.618.0. OpenAPI: a ship scanner is sensor rating above 0, and another POI in the system is 10 less power (`ScanResponse.scan_power`, `POST /api/v2/spacemolt/scan`). Catalog `scanner_power` for those three modules is 30, 55, and 95. **No parser change.**

### Salvage & Tow

- `service_prize` help now documents that stop, resume, and redirect remain claimant-only, while refuel and repair also accept a faction-mate of the claimant once that faction runs an operational Prize Recovery Yard at any station (gameserver 0.603.0). A yard under construction or damaged does not unlock it. Both ships must still be out of combat at the same POI. **No parser change.**
- `service_prize` help now documents that repair spends any repair item from your cargo, not only a basic repair kit (gameserver 0.609.2). Pass `item_id=<id>` to choose one; omit it and the cheapest repair item in your cargo is used. On refuel, omit `quantity` or pass 0 to transfer the safe maximum fuel. On repair, omit `quantity` or pass 0 to spend one repair item. Usage lists `item_id=`. Arguments stay `prize_id` and `service_action`. **No parser change.**
- `get_wrecks` table output prints `Carrion: N` when `carrion` is present on a wreck (age-death leviathan body; amount added to the system each wildlife pass, about 1 minute, while the body lasts; feeds scavengers). Omitted when the field is absent. An explicit `0` prints `Carrion: 0`. Loot is still `loot_wreck`. `--json` / `--yaml` / `--structured` stay pass-through (gameserver 0.614.0). **No parser change.**
- `loot_wreck` and `storage loot` help: a wreck at another POI returns `not_found`, the same as a wreck that is already gone. `tow_wreck` help: the wreck must be at your POI; elsewhere is `wreck_not_found` (gameserver 0.618.0). Carrion display is unchanged. **No parser change.**

### Crafting

- `craft` / `recycle` help now say omitted `preset` is `fast` (soonest finish; ownership only breaks ties) (gameserver 0.601.3). `help craft` warns that a paid public rental can beat your own idle facility and prepays that facility's per-run rental fee. Pass `preset=prefer_own` for ownership-order routing. Recycle has no `workshop` preset. **No parser change.**

### Factions

- `faction_mobile_base_update` previews print the jump event, base name, lifecycle, system, origin, wrecked when true, and escrow, and suggest `faction get_mobile_base` (gameserver 0.622.0). Severity follows the event. A null `mobile_base` prints `Mobile base unavailable` and does not change severity. **No parser change.**

### Facilities

- `faction_facility_owned` table output reads `faction_rent` instead of top-level rent fields, prints `Facilities: N`, and still prints the top-level `hint` (gameserver 0.606.2). **No parser change.**
- `faction_facility_list` table output prints the same `faction_rent` summary when the server includes it. Omitted when the faction owns no facilities at that station — no second `faction_facility_owned` call required to see the bill (gameserver 0.606.2). **No parser change.**
- Rent summaries (`facility_list` personal/faction bills included) print the required `facilities` count.
- `facility_owned` (`spacemolt facility owned`) table output prints `Personal rent bill` / `Arrears` from `rent`. **No parser change.** Not a JSON break — `rent` was already nested.
- `faction info` table output prints `faction_rent` when the server sends it (gameserver 0.615.0), in `emitRentSummary` order: Faction rent bill, Facilities, Faction arrears when sent, Grace remaining when sent, Estimated rent/day, then the note when sent. Same lines as `facility list` and `faction facility_owned`. An omitted key prints nothing (non-members, or a faction that owns no facilities). Explicit `0` prints `0cr/cycle`. No second `faction facility_owned` call. Help names `faction_rent` and points at `faction facility_owned` for the per-facility breakdown. `--json` / `--yaml` / `--structured` stay pass-through. **No parser change.**

### Query

- `get_location`, `get_status` / `get_state`, and `faction_scan_poi` table output lists leviathans at the POI (gameserver 0.614.0). The line shows name, id, species, stage, current/max hull, and `aggressive` or `not aggressive`. `aggressive` means that stage attacks ships at the POI and does not join a fight already in progress. `in combat` is printed only while it is in a battle. An empty location array and an omitted faction-scan key print no heading. The id is the `creature_id` for `hunt` while you are at its POI. `get_location`, `get_state`, and `faction_scan_poi` help name that list and that hunt id. `get_status` help text is unchanged; its table still prints the line because it shares the status formatter. `get_nearby` creature rows are unchanged. **No parser change.**
- `get_location` table output lists nearby pirates with the same livery line as `get_nearby` (`Boss` prefix, crew name, status, optional `#RRGGBB` name colors). The heading is `Nearby Pirates (N):` instead of `Nearby Pirates: N`. Colors stay omitted when the server omits them (gameserver 0.602.0). **No parser change.**
- `get_base` / docked-base `inspect` shortage rows now print `buy order: yes` or `buy order: no` from gameserver 0.605.2 `buy_order_available`. Sell only `yes` rows through the public market; check current prices and order depth. `no` means the station must arrange procurement. Availability is a snapshot and does not guarantee enough order depth to cover the missing quantity. Help documents the split. **No parser change.**
- `catalog type=skills` uses a dedicated table (Name, ID, Category, Max, optional Empire) instead of the generic item columns (title `Items`). A one-row page (`id=refining`) prints the full catalog `description` under Details, plus Training and any server-supplied `bonus_per_level`. Crafting and Refining omit Bonuses — gameserver 0.606.1 dropped the advertised refining-efficiency and bulk-crafting bonuses that were never active; the catalog sentence is the source of truth. List pages do not truncate that copy into a Description column. **No parser change.** `get_skills` remains progress-only.
- `help catalog` includes `type=skills id=refining`. `help get_skills` points at `catalog`. **No parser change.**
- `inspect` help no longer calls the id a catalog entry. Skills, recipes, and facilities are looked up with `catalog` (`spacemolt catalog type=skills id=refining`, `type=recipes`, `type=facilities`). A catalog block on an inspect response uses `type items` for an item or module and `type ships` for a ship class (gameserver 0.613.4). Table output is unchanged, including a skill or recipe block if one arrives. **No parser change.**
- One-row `catalog type=ships` and inspect ships pages print the `mobile_base` block (services, weapon mounts, built-in facilities, ship modules no). Multi-row lists do not (gameserver 0.622.0). **No parser change.**
- `catalog type=recipes` Use column prefers dump venue fields when present and treats `"Facility Only"` / `"Ship Passive"` as load-bearing (not `facility_only` alone). Ship Passive is never shown as craftable.
- `catalog_dump` human output adds a Recipe venues census when dump recipes carry `hand_craftable`. `--jq` example projects `hand_craftable` / `produced_by_facility_ids` (dump-only, gameserver 0.600.0). Census `no venue` means not workshop, not ship-passive, empty facility ids.
- `inspect` of a catalog recipe, and `catalog type=recipes` when the page has a single recipe, print `Venue:` and `Produced by:` from `produced_by_facilities`.
- `get_system_agents` table output lists optional Docked (`true`/`false`) when the server reports `NearbyPlayer.docked` (gameserver 0.601.1). That is the same boolean `get_nearby` already surfaces as `[DOCKED]`; this table does not use that marker. Docked pilots cannot be attacked, scanned, or traded with until they undock.
- `get_action_log` help names `event_type=faction.refuel` with `faction_id=` for faction bunker withdrawals by members and allies (gameserver 0.605.1). Table output prints optional Pilot and Fuel when `data` carries them; station stays the existing Base column. **No parser change.**
- `get_action_log` help names the four `faction.freight_*` events, `shipping.claim_paid`, and `trading.escrow_refunded` (gameserver 0.611.0). `faction_id=` is how you read the faction log, not a claim that those freight events are only there. Table output adds optional Station paid and Shortfall when a `shipping.claim_paid` row carries `station_paid` and `shortfall`. Those columns are not `ShipmentContract.claim_paid` and not the removed settlement field. **No parser change.**
- `get_action_log` help names `event_type=combat.pirate_destroyed` (gameserver 0.612.0). Table output adds an optional Credits column only on that event when `data` carries `credits_earned` (the bounty actually paid, including the bounty-skill bonus). `0` prints `0cr`. The summary sentence is not parsed. **No parser change.**
- `get_action_log` table output prints an ID column from each entry `id` as ungrouped digits. Entry id 1500 prints 1500, not 1,500; 0 prints 0; a negative id keeps its minus sign; integers outside the safe range print every digit. The column is omitted when no row has an integer id. `Next since_id` also prints a non-negative bigint cursor with those digits and still omits a negative. `--json` / `--yaml` / `--structured` are unchanged. **No parser change.**
- `get_action_log` help states that a missing `next_since_id` means keep the current cursor, and that an archive read failure returns an error so the same `since_id` is retried (gameserver 0.613.7). **No parser change.**
- `shipping_deliver`, `shipping_return`, and `shipping_cancel` table output no longer prints settlement-level `Claim paid`. Gameserver 0.611.0 removed that never-populated field from `ShippingSettlementResponse`. A `claim_paid` integer on the nested contract still prints on the full contract view (`shipping_get`, `shipping_post`, `shipping_accept`) when the server sends it. It does not print on the compact settlement or track summary. Action-log `shipping.claim_paid` is unchanged. **No parser change.**
- `survey_system` help: the Wildlife column stays `Estimate`. It is a rounded population estimate for ordinary wildlife and an exact head count for a leviathan species, eggs not counted (gameserver 0.614.0). **No parser change.**
- `get_nearby` and `subscribe_observation` table output print every creature row the server returned (gameserver 0.614.0; server list stops at 30). When `creature_count` is larger than that list, the extra line is only the unlisted remainder (`creature_count` minus rows printed), not a 10-row client cap. Players, pirates, arena NPCs, and empire NPCs stay capped at 10. `--follow` headlines still name at most three creature identities; the snapshot and `get_nearby` have the hunt ids. **No parser change.**
- `get_system` table output no longer prints `(N online)` on a POI. Gameserver 0.618.0 removed per-POI `online`. When the server sends `ship_count` (ship scanner fitted, sensor rating above 0), the POI line shows `(N ships)`, including `(0 ships)`. A missing `ship_count` prints no count. The number is other uncloaked players (online, offline, and docked), pirates, empire NPCs, and leviathans. It does not include your ship or wildlife. Fuel and services are not on this chart. Help points at `get_poi`. `--json` / `--yaml` / `--structured` stay pass-through. **No parser change.**
- `get_system_agents` is deprecated. The server returns an empty `agents` list, `count` 0, and `warning`. Table output prints that warning. Help no longer says the command lists pilots in the system. `fleet invite` and `subscribe_observation` Discover-with entries point at `get_nearby` and `get_system`. An empty player-id cache suggests `get_nearby` only. The command stays callable. `--json` / `--yaml` / `--structured` stay pass-through and still include `warning`. **No parser change.**

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
- `get_chat_history` help: `emergency` is read-only MAYDAY history for every system within 5 jumps, the same range as a live distress call (gameserver 0.618.0). It no longer says the current system. The `mission_id` sentence is unchanged. **No parser change.**

### Combat

- `use_item` help names 0.601.2 `boarding_locked` on `emergency_warp_device`.
- `attack` help notes that an armed faction station may join a member's fight in the same system. `hunt` help notes that a leviathan hunt may pull an armed faction station in-system (gameserver 0.604.0).
- `hunt` help: the `creature_id` you pass for a leviathan is its `leviathan_id` (same id at its POI, stable for its whole life). Damage stays between fights and heals slowly out of battle. Adult Molt, Rainbow, and Hoarfrost Leviathans attack on sight and fight to the death; young leviathans flee; Cloudwhales do not attack first. An aggressive stage does not join a fight already in progress. The armed-faction-station sentence is unchanged (gameserver 0.614.0). **No parser change.**
- `get_battle_status` help names `flee_required` as a speed-adjusted baseline (floor 1), not a hard minimum of 3, and that the field is omitted while warp-disrupted or boarding-intercepted (gameserver 0.601.4). **No parser change.**
- `get_battle_status` table output prints `Latch` from `combat_state.latch_status` while you are latching onto a target (gameserver 0.609.4). `shields_holding` means keep the target's shields down; `out_of_range` means close to point-blank first. When both gates are shut the field is `out_of_range`. Omitted once marines are aboard, omitted for the ship being boarded, and omitted when you are not latching. Not the Boarding table Progress column. Help names the same answers. **No parser change.**
- `reload` table output shows per-weapon success and failure for a bulk reload (gameserver 0.609.0). Mixed batches stay exit 0. Single-weapon text is unchanged. **No parser change.**
- `reload` ammo display names inside `weapons` resolve like the top-level ammo argument. Weapon instance ids stay literal. **No parser change.**
- `help reload` documents `weapons=[{weapon_instance_id, ammo_item_id?}]`, max 50, one tick for the batch, omit the single-weapon arguments, ammo display names inside the array resolve, weapon instance ids do not. **No parser change.**
- `attack` help: starting a battle requires the target at your POI. Joining a battle already running works from anywhere in that system. A target at another POI, in transit, or cloaked is `invalid_target` (Target not found), the same as a missing id. A docked pilot at your POI is `target_docked`. A station at another charted POI is `out_of_range`. Opening fire on a pirate that others already fight joins their side. Your own faction or an ally still comes first. A war with the hunters' faction uses normal side rules (gameserver 0.618.0 and 0.618.3). The armed-faction-station sentence is unchanged. **No parser change.**
- `hunt` help: the creature must be at your current POI. Elsewhere is `invalid_target` (Target not found). Leviathan wording is unchanged (gameserver 0.618.0). **No parser change.**
- `cloak` help names `in_battle`. A cloak cannot be engaged during a battle. Attacking or engaging drops an active cloak (gameserver 0.618.0). **No parser change.**

### Personnel

- `treat_personnel` help distinguishes active out-of-combat field treatment (`provider=field`) from automatic fleet triage, and names station, Shipboard Sickbay, and Field/Fleet Hospital sources for own-ship vs same-location allied treatment (gameserver 0.603.1). Omit `id` for your ship or faction reserve; pass an allied player at the same POI for remote field treatment; `provider=faction` plus `reserve=true` treats the faction reserve (ManageTreasury). Module names are not CLI grammar: `get_ship` lists the fitted Type id; `inspect` shows Remote medical on the module, or `Capabilities: remote_medical_treatment` on the ship class. **No parser change.**

### Ship

- `refit_ship` help now says to dock at a shipyard, that installed modules and cargo go to station storage (not destroyed), that the refit is free and irreversible, and that a response message of already_current means the ship already matches current class stats and the default-loadout version so nothing is applied. **No parser change.**

### Storage

- `storage view` table output lists durable gifts (`sender`, time, credits, items, ships, note). An explicit empty `gifts` array prints `Gifts: none`. An omitted key prints nothing. `messages` are unchanged. **No parser change.**
- `dock` table output lists durable gifts after trade fills: `Gifts: N`, the trade-fill truncated suffix when `gifts_truncated` is true, `gifts_note` when non-empty, then one block per returned `StorageGift` row. Rows print `ships` with the same ship line as `storage view` when the server sends them (gameserver 0.612.4; `DockResponse.gifts[]` is `StorageGift`). An omitted `ships` key and an explicit empty array print no Ships heading. `base_id` is still omitted on dock because `StorageGift` does not include it. `gift_received` previews still print `base_id`. **No parser change.**

### P2P Trading

- `trade_cancel` / `trade_decline` help documents gameserver 0.611.0: `trade_in_progress` means the other side's accept is already committing and the trade will complete — do not retry cancel or decline; `trade_not_found` means the trade is already gone — check `get_trades`. Usage stays `trade_id`. **No parser change.**

### Exchange

- `modify_order` help states that raising a buy over a cheaper sell fills at the sell price, that the difference plus extra sales tax is `get_action_log event_type=trading.escrow_refunded` and is not on the HTTP response, and that a buy reprice (not only that raise, and not a sell) escrows sales tax so a later cancel refunds what was paid (gameserver 0.611.0). `cancel_order` help says the same sales-tax fact for any buy reprice. Sell cancels are unchanged. **No parser change.**
- `view_market` / `subscribe_market` table output prints each item's `category` (gameserver 0.613.0). Multi-item summaries add a Category column when any row has one. A one-item book prints it on the item line (`Iron Ore (ore)`). The column and the suffix are omitted when the server omits the field — nothing is printed in their place. `analyze_market` insight categories and ship-listing categories are unchanged. Machine output is unchanged aside from fixtures that now include the field the server sends. **No parser change.**
- `market_update` previews, including `get_notifications` and `subscribe_market --follow`, put that category on the first named item (`Iron Ore (ore)`). +N more is still a count of the other items and does not list their categories. **No parser change.**
- `subscribe_market` help no longer says contraband is always left out of the public liquidity snapshot. Fuel stays excluded. Contraband is excluded except at contraband-friendly stations where anyone can trade it (pirate strongholds, Outer Rim stations, Treasure Cache). Private Company Store orders stay excluded; use `view_market company_store=true`. Tables, `market_update` previews, and `--follow` already render every row the server sends (gameserver 0.614.2). **No parser change.**
- `view_market` help states that `since` incremental diffs exclude fuel, and exclude contraband except at contraband-friendly stations where anyone can trade it (pirate strongholds, Outer Rim stations, Treasure Cache) (gameserver 0.614.2). A call without `since` is not described as that exclusion. Private Company Store orders are not excluded from `view_market`. **No parser change.**

### Fixed

- Whole numbers outside the safe integer range (`|n| <= 2^53-1`) are preserved on v2 HTTP JSON and re-emitted by `--json`, `--yaml`, `--structured`, `--field`, `--fields`, and `--jq`. Notification amounts that used to fall back to `0` (`xp_gained`, damage labels, raid HP) print the digits. Human credit lines and notification `positiveNumber` print those digits as well.

### Breaking

- HTTP 429 `--json` output is now `{ error: { code, message, retry_after?, limit?, scope? } }` instead of a string `error` with leftover top-level `limit` / `message`.
- `faction_facility_owned` (`POST /api/v2/spacemolt_facility/faction_owned`, gameserver 0.606.2): `total_rent_per_cycle`, `arrears_owed`, and `note` moved into `faction_rent`. Scripts reading `--json` / `--yaml` must use `faction_rent.total_rent_per_cycle` (and so on). Nothing was removed, only relocated. The object also has required `facilities` and `est_rent_per_day`, plus optional `grace_cycles`.
- Gameserver 0.608.2 reordered JSON keys inside `structuredContent` on the v2 HTTP API. Field names, values, and types are unchanged. `--field` / `--fields` / `--jq` already read by name. Live `--json` / `--yaml` / `--structured` / `--keys` / `--search-keys` re-emit keys in the server's new insertion order; human map-line order (for example Standings) may follow that order too. Scripts must read `--json` by name, not by position. Whole numbers whose digits do not fit in a safe integer (`|n| <= 2^53-1`) are preserved on v2 HTTP JSON. `--json`, `--yaml`, `--structured`, `--field`, `--fields`, and `--jq` re-emit those exact digits. Exponent and fractional tokens are unchanged. Safe integers stay ordinary JSON numbers. Schema integer arguments such as `shipping_post` `base_reward` send those digits. Notification amounts that used to fall back to `0` (`xp_gained`, damage labels, raid HP) print the digits. Credit helpers in shipping, inspect, social, ship, and market, and notification `positiveNumber`, print the digits of an out-of-range integer too. They do not print a rounded value and they do not print `0`.

### Errors

- `trade_in_progress` and `trade_not_found` now have local suggestions (gameserver 0.611.0). The server message still prints. `trade_in_progress` says the other side's accept is already committing, the trade will complete, and not to retry `trade_cancel` or `trade_decline`. `trade_not_found` points at `get_trades`. Neither code is auto-retried (auto-retry remains `rate_limited` waits of at most 60 seconds, and HTTP 503). Human output no longer adds "This error may be retryable." for these codes when they carry no wait.
- `transaction_uncertain` and `accounting_pending` now have local suggestions (gameserver 0.615.1; described in api.md at the bundled v0.617.0 docs; not in the OpenAPI component schemas). The server message still prints. `transaction_uncertain` says the transfer may already be committed, not to retry it, and that gameplay mutations pause while the server reconciles the action-log receipt and then resume automatically. `accounting_pending` says gameplay mutations are paused during that reconciliation, not to retry the original uncertain transfer, and that mutations resume automatically. Both point at `get_action_log` after mutations resume, with `faction_id=` for a faction transfer. Neither code is auto-retried (auto-retry remains `rate_limited` waits of at most 60 seconds, and HTTP 503). Human output no longer adds "This error may be retryable." for these codes when they carry no wait. `insufficient_credits` is unchanged. **No parser change.**
- `ip_timed_out` suggestion now names `retry_after` (gameserver 0.606.0). Human output already prints `Wait` from envelope or `details.retry_after`, plus `Limit:` / `Scope:` when present. Still not auto-retried.
- `station_under_attack` now has a local suggestion: wait for the battle to end, then retry the same command. Common when a faction-mate fights in that system (gameserver 0.604.0).
- `boarding_locked` now has a local suggestion: wait for the boarding latch to clear, then retry the emergency jump device. Flee makes no progress; the emergency warp stabilizer and emergency cloak are skipped silently (gameserver 0.601.2).
- Commands and session create auto-retry `rate_limited` waits of at most 60 seconds from `retry_after`, `details.retry_after`, and the HTTP `Retry-After` header. `action_pending` and `ip_timed_out` are not auto-retried.
- `rate_limited` suggestion now names 30 mutations and 300 queries per session, plus the IP-wide timeout after 50 rejections/min.
- Human API errors print `Limit:` / `Scope:` when present, and `Pending command:` for `action_pending`.
- Local suggestions for `action_pending` (one mutation per tick; do not resubmit immediately) and `ip_timed_out` (do not keep retrying). `ip_timed_out` is not retryable.
- `insufficient_credits` now has a local suggestion. On `craft`, it treats the miss as credits (labor/rental), not materials — do not deposit items unless the code is `missing_materials` / `missing_faction_materials` — and points at `dry_run=true` plus `preset=cheap` / `prefer_own` (gameserver 0.601.5 recategorized a treasury miss that used to look like missing materials; the server message still names that path when it applies). On `faction declare_war`, war costs 50,000 from your wallet — check `get_status`; do not `faction_deposit_credits`. On `citizenship apply`, the fee comes from your player balance (balance+fee) — check `get_status`; do not `faction_deposit_credits`. Other commands get a generic credits-wallet suggestion; `faction_deposit_credits` is suggested only if the server names the faction treasury.
- Removed `target_cloaked` and its scan suggestion. Gameserver 0.618.0 no longer emits it. `player_not_here`, `different_location`, `target_in_transit`, and `not_same_poi` were not in the local registry.
- `invalid_target` no longer reads as "look only at players at your POI" as the whole story. A missing id and a target you cannot see share the error. `get_nearby` stays the next command. On `attack` and `hunt`, the suggestion adds that joining an in-system battle uses `get_battle_status` and does not return this error. No scan suggestion. The ambiguous storage-bucket `invalid_target` path is unchanged.
- `player_not_found` now has a local suggestion, shared by trade, refuel, repair, arena challenge, fleet invite, transfer_personnel, and treat_personnel. Same error as an unknown name when the pilot is at another POI, in transit, or cloaked. Not auto-retried. Human output no longer adds "This error may be retryable."
- `in_battle`, `wreck_not_found`, `unknown_system`, `system_not_found`, and `poi_not_found` now have local suggestions. `unknown_system`, `system_not_found`, and `poi_not_found` name the charting recipe (`survey_system`, arriving, or faction intel). `unknown_system` still points at `get_system` for a connected system the caller already knows. `poi_not_found` says `spacemolt faction scan_poi`, not `spacemolt faction_scan_poi`. `not_found` is command-scoped: the generic line does not mention a wreck; `loot_wreck` and `storage loot` do; `inspect` names an uncharted hidden POI. `not_found` is not auto-retried, and human output no longer adds "This error may be retryable." for it. `invalid_poi` now says an uncharted hidden POI looks like an unknown id and names the same charting recipe.
- `in_battle` stays retryable in the sense of the existing hint (wait until the battle ends), same as `station_under_attack`. It is not an auto-retry code.

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
