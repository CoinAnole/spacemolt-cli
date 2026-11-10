# Changelog

Notable user-facing changes to the SpaceMolt CLI. For agent/contributor routing details, see `AGENTS.md`.

Earlier release notes, including the full 2.10.0 detail and 2.9.0, live in git history
(`git log -- CHANGELOG.md`, `git show v2.10.0:CHANGELOG.md`) and at
https://github.com/CoinAnole/spacemolt-cli/releases.

## Unreleased

- `shipping_list` drops Eligible and Reason. It prints Hazmat as yes or no from `contract.requires_hazmat` when that key is a boolean, including false. An omitted key leaves the cell blank, and the column is omitted when no row sends the key. It prints Warning from `listing.warning` when that value is a non-empty string. An omitted or empty warning prints nothing, and the column is omitted when no row sends one. `shipping_quote` and freight contract detail print `Requires hazmat:` as yes or no when `requires_hazmat` is a boolean, including false. An omitted key prints nothing. `eligible_as` stays a request filter (gameserver 0.675.0).

- `get_ship`, `get_state`, and short `get_status` print `Refit available:` as yes or no on the ship block when `refit_available` is a boolean, including false. An omitted key prints nothing. It is not printed as no. `refit_ship` help says to check `refit_available` before looking for a shipyard (gameserver 0.679.0).

- `craft` help says an undocked field-workshop hull can craft hand-craftable recipes from ship cargo. `source` and `deliver_to` must be omitted or `cargo`. Facility-only recipes, package recipes, `package_ids`, `output_package_label`, and `facility_id` are refused. Escrowed inputs keep their cargo space until a run uses them. The job runs at Station Workshop speed and gives the same XP. It pauses, and loses nothing, while the ship is not the active ship, while you are docked, travelling, jumping, or in battle, without fit crew, or on a tick you used the ship. Chat, trades, gifts, storage views, and queries do not pause it. It keeps running while you are offline. A finished run that does not fit in cargo waits. Cancel refunds unused inputs to that ship's cargo. Field jobs cannot be redirected. You cannot sell, list, gift, donate, scrap, or garage a ship with queued field jobs. A destroyed ship drops escrowed inputs onto the wreck and the jobs are lost. A capture takes the inputs with the ship. A boarding plunder ends the jobs and returns the inputs to the hold before the boarders take cargo. A customs seizure ends the jobs that hold contraband the same way. Those two endings are one `get_action_log` entry each, `event_type=crafting.lost`, per input. A cargo scan shows the inputs as ordinary cargo and does not end the job. No new action-log columns (gameserver 0.678.0).

- `list_ship_for_sale`, `scrap_ship`, and `sell_ship_to_order` help say a ship with queued field workshop jobs is refused with `field_jobs_queued`: cancel them first. That error is not retryable and is not an authentication error. It suggests cancelling that ship's field jobs first with `craft` and `job_id`, and it relates the code to `craft` and `get_ship`. `craft` help still says you cannot sell, list, gift, donate, scrap, or garage a ship with queued field jobs, and it does not name a code for gift, donate, or garage (gameserver 0.678.0).

- `get_ship` prints a Field Workshop block when `ship.field_workshop` is a record: `state` as sent, `queued_jobs` including 0, and `reserved_cargo` including 0. A non-empty `pause_reason` prints as sent. An omitted `pause_reason` prints nothing. An omitted `field_workshop` prints nothing. Reserved cargo is not added to the `Cargo:` line, and free space is not computed. `get_state` does not print the block when the key is absent (gameserver 0.678.0).

- `switch_ship` usage says an undocked bay swap keeps each ship's cargo, modules, and crew. `storage deposit` help says a gifted ship that is not in a carrier bay stays parked where it is. A ship in a bay still stays in the bay under the new owner (gameserver 0.671.0).

- A `hold_update` notification prints the hold. `started` and `ended` name the event. Any other `event` prints as sent. The holder and target print as name and id when both arrive. `source` and `reason` print as sent, including `scan` and `scan_over`. A non-empty `message` prints. `trade_id` prints when sent. `start_tick` prints when it is a number, including 0. An omitted key prints nothing (gameserver 0.670.0).

- `station_in_battle` suggests waiting until the battle ends, then retrying. The suggestion does not read `details` and does not add a retry field. Disbanding a faction, dismantling an outpost, and selling a station return this code while that station is in a battle (gameserver 0.661.0).

- `install_mod` help says the module must be in cargo, and you must be docked, have a Ship Maintenance Bay fitted, or be at the same POI as an undocked faction-mate whose ship has one. A module that reduces cargo capacity is refused with `cargo_capacity_exceeded` when the hold is over the reduced capacity. `uninstall_mod` help repeats that place rule. In space the module must fit in cargo, measured against the hold after the module is off. A module that grants CPU, power, or cargo is refused with `cpu_exceeded`, `power_exceeded`, or `cargo_capacity_exceeded` while the rest of the fit still needs that capacity. A module that costs capacity is not refused for that reason. A stored ship is still uninstalled only while you are docked at its station (gameserver 0.669.0).

- `faction_deposit_credits` and `faction_withdraw_credits` help say faction treasury credits (`item_id=credits`) never auto-dock and work anywhere, including in space. Withdrawals still need manage treasury (gameserver 0.669.0).

- `storage deposit` credits help says a credits-only gift to a player works from anywhere, including in space. An item gift still needs a dock at a station with storage. That help does not name an error for the item-gift case (gameserver 0.669.0).

- `get_base`, docked-base `inspect`, and `facility list` print `Generator supply` on the station power block when `generator_supply` is present, including an explicit 0. An omitted key prints nothing. The number is printed as sent and is not subtracted from `supply`. The line does not apply a plant-capacity cap (gameserver 0.664.0).

- Login and the short status view print `player.safe_passages` as one line per grant, in the order received, with the keys that arrived (`source`, `grantor_player_id`, `grantor_faction_id`, `system_id`, `granted_tick`, `until_tick`, and `ref_id`). An omitted key prints nothing. An empty array prints nothing. The lines are not sorted or capped, and a grantor id is not replaced with a name. `get_state` does not print them. A `safe_passage` error prints the details keys that are present (`grantor_id`, `faction_id`, `system_id`, `granted_tick`, `until_tick`, and `source`). An empty `faction_id` stays empty. `no_scrambler`, `target_not_holdable`, `already_held`, and `hold_cooldown` do not gain detail keys (gameserver 0.670.0).

- `get_trades` prints a non-empty note. An empty note prints nothing. When `offer_safe_passage` is true, the offer prints as a toll and `expires_tick` prints when sent. That toll does not print `expires_at`. `hold` prints only when true. A trade-offer notification prints a non-empty note, a toll line when `offer_safe_passage` is true, a hold line when `hold` is true, `expires_tick` when sent, and `pass_until_ticks` as sent. `battle_stance` usage includes `intent=capture|plunder`. plunder robs another player's cargo and leaves the hull; capture is the default; plunder targets only players (gameserver 0.670.0 and 0.663.0).

- `scan` with `mode=cargo` prints the target's cargo table, capacity, and used space. A successful cargo scan with no `cargo` prints an empty hold. A failed scan prints `reason` as sent and does not invent an empty hold. `hold` and `hold_cancelled` print only when true. `success` false prints Success: false. Credits are not printed. Help names `mode=cargo`: the scan reads a player's hold over 3 ticks and never returns credits, and a scrambler ship also holds the target for 5 ticks (gameserver 0.670.0).

- `storage deposit` and `storage withdraw` help name a faction carrier bay. Docked at the same station as a faction-mate who is flying a carrier, `target=carrier:<pilot name>` and your parked ship's `item_id` load that ship into their bay. The ship stays yours. A listed ship cannot be loaded. `target=self` loads your active carrier's bay, or attaches a tow when the active ship is a non-carrier with a tow rig. `storage withdraw` of that `item_id` unloads the bay ship at the carrier's station. The owner can do it, and so can the carrier's owner, including when the carrier is parked. A ship in a bay can be gifted with `target=<player name>` while the carrier is at a station, and it stays in the bay under the new owner. A listed ship cannot be towed. A listed ship in a bay or under tow cannot be bought. `switch_ship` help says an undocked swap at that carrier's POI puts your current ship into the bay and undocks the bay ship in one action. Each ship keeps its cargo, modules, and crew. The swap is refused in battle, in transit, with an aggression timer, while towing, when your current ship has passengers, or when the bay has no room for your current ship. A station switch still moves cargo from your current ship to station storage. `get_cargo` prints Owner on a carried ship when `owner` is sent. An omitted `owner` stays blank (gameserver 0.671.0).

- `scrap_wreck` help says `mode=field` and `id` (the wreck at your POI; `get_wrecks`) cuts that wreck in place with an Outer Rim Salvage Array. Omit `mode`, or pass `yard`, for yard scrap, including automatic docking. Unknown payload fields return `invalid_payload`. Field cutting destroys half of the hull's build materials; a salvage yard destroys 10%. The rest, plus cargo and modules still aboard, goes into your cargo, most valuable first. What does not fit is destroyed and listed in `lost`. Field scrap uses the same unlock as yard scrap, and it cannot scrap a wreck another pilot is towing. The receipt prints `lost` with the same material columns as `materials` (item, name, and quantity), including an explicit 0. An omitted or empty `lost` prints nothing. `message` stays as sent (gameserver 0.672.0).

- `find_route` help says a missing route is `route` [] with `found` false and the fuel fields at 0. Human output still prints that body as not found. An older body with `route` null still prints as not found. `found` true still prints as found, including when `route` is empty. A one-step route when you are already in the system also prints as found (gameserver 0.673.1).

- `faction info` prints `Shipyard:` as yes or no in the Ally access block when `ally_shipyard_access` is a boolean, including false. An omitted key prints nothing. A non-boolean prints nothing. The line prints whenever the key arrives, including when `is_member` is false, and membership does not invent it. `faction edit` usage lists `ally_shipyard_access=true/false` beside the other ally toggles, and the summary names shipyard access. `catalog` `commissionable` help and `commission_ship` help say members of an allied faction can commission at a station whose owner set that toggle, with `fund_from_faction=true`, under the station owner's ship licenses. They supply materials from their own faction storage at that station, and their own treasury pays labor and the empire royalty. They need ManageTreasury in their own faction. The station owner's treasury and storage are not charged. They still need the piloting level. Prestige hulls still need their own achievements. Mobile bases stay members-only. A build already placed finishes if the alliance ends or the toggle is turned off. `catalog type=ships commissionable=true` lists the hulls an ally can build at that station. The own-station reputation sentence is unchanged (gameserver 0.668.0).

- `facility types` detail prints Req. stock when `maintenance_per_cycle` is present: each item's name, item id, and quantity, including an explicit 0. An empty array prints Req. stock and (None). An omitted `maintenance_per_cycle` prints nothing. A fuel line is one of those items. There is no separate fuel field. The types list and the discovery table do not add an upkeep column. `facility list` still prints that array as one Req. stock quantity and name, and an omitted key still adds no column. Help says a market's `trade_authenticator` quantity is declared stock plus a charge that grows with this station's recent market trade volume. The market burns that charge in full each cycle, and a player-station market goes offline when faction storage cannot cover the whole quantity. The column does not split that quantity (gameserver 0.658.0).

- `storage deposit` help says a boss's stolen flagship can be sent to any pirate stronghold from any station. An ordinary ship still requires you and the ship to be docked at that stronghold. A boss flies a rival boss's stolen flagship while a player holds his own, then scraps it once his own is home, and scraps it at once if his own is home. `disposition` is `scrapped` (broken down for parts), `refitted` (rebuilt to the crew's own design and added to its fleet), `joined_fleet` (a pirate-built hull added to its fleet as it is), or `boss_ship` (the boss flies it in person now or as soon as the boss is free), and is omitted for gifts to players. `class_id` is the class the ship had when you gave it; a pirate crew may refit it afterwards. Giving a ship to a pirate crew voids its insurance. `flagship_bounty` is the credits an empire paid for a pirate boss's stolen flagship, a flat 1000000, added to the wallet on top of goodwill and counted as taxable ship_sale income. The empire destroys the hull. It is set on `empire_gift_ship` only when the donated ship was a boss flagship, and omitted otherwise. It is less than the flat amount only if the wallet hit the credit cap. An omitted `flagship_bounty` is not zero. Fleet, hull designator, npc, and petition fields stay omitted when that hull is destroyed. The CLI does not detect a flagship. The server accepts or rejects the gift (gameserver 0.657.6–0.660.2).

- `accept_mission` help says faction postings pay only the first pilot to complete them. Distress rescues are unchanged: first claim wins. `faction post_mission` help says any number of pilots can accept a posting, but only the first to complete it gets paid (gameserver 0.657.5).

- `buy_ship_license` help says the per-build royalty is 10% of the current market value of the hull's build materials, paid to the hull's empire treasury. Pirate hulls split that royalty evenly among all pirate station managers. It is not your crafting cost, and the amount changes as market prices move. License prices are T1=1M, T2=5M, T3=10M, T4=20M, and T5=50M. Starter, prestige, and pirate boss flagships cannot be licensed. Pirate boss flagships are capture-only. `commission_ship` help says a faction-funded build pays labor and that royalty from the treasury (gameserver 0.657.2).

- `faction edit` usage lists `ally_battle_opt_out=true/false` beside the fuel, facility, and intel toggles. Help says auto-joins for your own faction and for your wars still happen when that toggle is set. The field text is unchanged: true keeps members out of battles they would auto-join for an ally, they can still join with `battle action=engage`, and the default is false (gameserver 0.657.0).

- `faction info` prints `Battle opt-out:` as yes or no in the Ally access block when `ally_battle_opt_out` is a boolean, including false. An omitted key prints nothing. A non-boolean prints nothing. The line prints whenever the key arrives, including when `is_member` is false, and membership does not invent it (gameserver 0.657.0).

- Two overlapping updates of `config.json` keep both the default profile and the user agent when a dead process id is reused. A live process that still holds the lock waits out the same timeout as before.

- Follow mode prints a notification with an empty id once per poll.

- Two finished id-cache saves no longer drop one of the ids.

- An older response no longer replaces a newer name or location for the same cached id.

- Concurrent login and another command on the same profile no longer drop the saved password or replace a newer session expiry with an older one.

- Piped stdout larger than 64KB is no longer truncated.

- `set_status` help says the status message is at most 64 characters and the clan tag is at most 4 characters. The server counts characters, not bytes (gameserver 0.654.2).

- `get_base` and docked-base `inspect` print `Dining` and `Leisure` when `GetBaseResponse` sends `dining_points` or `leisure_points`, including an explicit 0, and `Tourism revenue` in credits when `tourism_revenue` is sent, including an explicit 0. An omitted key prints nothing. These lines are not summed from facility rows and are not printed by `get_poi` (gameserver 0.654.0).

- Short `get_status` prints one `Passengers delivered` line when `player.stats.passengers_delivered` is a finite number or bigint, including 0. An omitted key prints nothing. `--summary` does not print the line, and the rest of the lifetime stats stay off this view. The same short view is the shape fallback, so another player-shaped payload with the key prints the same line. Each delivery counts once. Stranded and expired passengers do not count. The counter started at zero in gameserver 0.653.0.

- `analyze_market` help says price data refreshes every 5 minutes, so an insight can lag the newest trades by up to 5 minutes. Outlier trades are filtered against galaxy-wide prices (gameserver 0.651.1).

- `login`, `login_token`, and a successful `auth_login_link_poll` print `unread_chat` as four channels (`system`, `local`, `faction`, `private`), including an explicit 0. A count of 200 prints as 200 or more. Any other count prints as sent. The channels are not added into one total. An omitted `unread_chat` prints nothing. `register` does not print unread counts. Dock still prints the summed count and `unread_chat_note` as sent (gameserver 0.651.1).

- `facility faction_list` prints Missed when any row sends `missed_rent_cycles`, including an explicit 0. An omitted key on a row stays blank, and the column is omitted when no row sends the key. An omitted key is not 0. Grace remaining on the faction rent bill is the repossession window. Docked `facility list` prints Missed on Player Facilities and Faction Facilities, and a missing key prints 0. Station, Public, and Ally tables do not add Missed from a missing key (gameserver 0.651.0).

- `get_base` and docked-base `inspect` print `pirate_recovery` when the server sends it: ship name, ship class id, and status as sent, plus the one-hull material list (`name`, `item_id`, `quantity_required`, `quantity_in_storage`, `quantity_incoming`, `quantity_missing`, `quantity_to_supply`, `bid_price`, and `bid_quantity`), including an explicit 0. `materials` is omitted after a build is commissioned. An omitted `pirate_recovery` prints nothing. Help says `materials_ready` confirms physical inputs only, a shortage is not a promise of payment, and to check `view_market` and sell into public station buy orders.

- `facility types` detail prints Buildable as yes or no when `buildable` is a boolean, including an explicit false. The types list adds that column when any row sends it. An omitted key prints nothing. `facility types`, `facility build`, and `faction build` say station infrastructure with a flat on/off effect is limited to one copy per station, like dining and leisure. Power plants, life support, capacitor banks, and fuel tank expansions still stack.

- `storage deposit` help names every ship gift: `target=<player_name>` and a docked pirate-stronghold `target=station:<base ID>` are `gift_ship` (a boss's stolen flagship can be sent to any pirate stronghold from any station), and an empire alias is `empire_gift_ship`. An empire station does not take ships. A starter ship donated to an empire is scrapped, earns no goodwill, and omits fleet and petition fields. A bulk `station:` gift prints goodwill once on the parent, not on each row. `situation` prints as sent.

- `faction info` prints the member page when `members` is present (username, role, online, joined, last seen, and player id). `members_limit` prints as the page size, not a member cap. When `members_truncated` is true, the next page is `offset` = `members_offset` + `members_limit`, and an omitted `members_offset` is 0. An omitted pagination field prints nothing. Help says those three fields describe the member-list page. `faction_full` points at the server message for the cap.

- `get_battle_log` help says a completed battle stays readable for 14 days.
- `craft` and `facility job_add` say fuel made on someone else's fuel facility (a public rental or ally access) goes to your faction's fuel bunker at that station. With no bunker there, the order fails with `no_fuel_bunker` and auto-routing skips that facility. A full bunker pauses only your own rented job. `no_fuel_bunker` suggests building a faction fuel bunker at that station first.
- `faction info` prints `fuel_bunkers` rows (base id, base name when sent, reserve, and capacity), including an explicit 0. An omitted key prints nothing.
- `faction info` prints `total_fuel_reserve` and `total_fuel_capacity` next to the `fuel_bunkers` table, including an explicit 0. Those galaxy-wide totals include the home station's shared tank. The home-station row is that shared station tank and is not relabeled. If one total is absent, the one that arrived prints and the other stays blank. An omitted total is not 0, and the rows are not added up (gameserver 0.654.1).
- `get_base` prints `Fuel bunker: reserve / capacity` when `faction_fuel_reserve` or `faction_fuel_capacity` is present, including 0.

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
