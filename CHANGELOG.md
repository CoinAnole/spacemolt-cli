# Changelog

Notable user-facing changes to the SpaceMolt CLI. For agent/contributor routing details, see `AGENTS.md`.

## Unreleased

### Dock state on mutation table output (gameserver 0.577.3)

- Human `dock` / `undock` table output prints a compact `Docked at:` / `Undocked at:`
  line after the command receipt so you do not need a follow-up `get_status` /
  `get_location`. Storage deposit/withdraw that auto-dock print the same line
  instead of dumping aliased location keys.
- `--quiet` still shows the compact line. Cyan `[AUTO-DOCKED]` / `[AUTO-UNDOCKED]`
  banners stay quiet-gated.
- JSON/YAML/jq field names are unchanged.

### Action-result dock state (gameserver 0.577.3)

- Human `get_notifications` inline `action_result` previews print `auto-docked` /
  `auto-undocked` when those payload flags are true, and a compact `Docked at:` /
  `Undocked at:` line when `result.location.docked_at` is present (including null).
- Table Message still folds only the result message or summary. Nested ship and
  nearby-player payloads stay omitted.
- JSON/YAML/jq field names are unchanged.

### Help copy (gameserver 0.574.5 / 0.575.0)

- `facility repair` help now states that a repair finishes on the next station
  maintenance cycle, that listings report that rounded completion tick, and that
  a paid Faction Storage already under repair keeps reporting as repairing for
  the whole job.
- `attack` usage and description accept intact-prize actor IDs from `get_nearby`
  (same-POI intercept during recovery). `get_nearby` and `scan` help mention
  intact prizes; prize rows expose `actor_id` for attack or scan and `prize_id`
  for `claim_prize`. Full-help `scan` is `scan [target_id]` (not player-only).
- `battle_target` help lists intact prizes among combatants from `get_battle_status`.

### Battle identity columns and interrupted logs (gameserver 0.575.0 / 0.574.8)

- Human `get_battle_status` Participants tables print NPC as yes/no when `is_npc` is
  present. There is no Boss column on status (schema has no `is_boss`).
- Human `get_nearby` / `subscribe_observation` pirate lines prefix `Boss ` when
  `is_boss` is true. Regular pirates are unchanged.
- Human `get_battle_log` prints a Combatants table from tick snapshots when present
  (Kind/NPC/Boss), prefixes `Boss ` on attack From/To when snapshot `is_boss` is true,
  and prints Recovered Summary when `recovered_summary` is present. Interrupted ticks
  without that object still only show `interrupted` in Ticks Ended.
- Interrupted summaries print `Outcome: interrupted` and still omit `Winning Side: -1`.
- JSON/YAML/jq field names are unchanged.

### Prize and capture notification previews (gameserver 0.575.0)

- Human `ship_captured` previews name captor, ship class, and former owner, and point at
  `get_nearby` then `claim_prize` (the capture frame has no `prize_id`).
- Human `prize_update` previews name `prize_id`, transit/wait, location, destination or wreck,
  and `service_prize prize_id=…` on stall-like updates.
- JSON/YAML/jq field names are unchanged.

### Combat kill notification previews (gameserver 0.574.9)

- Human `player_kill` previews name schema `victim` and the wreck POI/system when the
  server sent them, so `get_notifications` shows where to fly.
- Human `pirate_destroyed` previews name the pirate and wreck site; `player_died` names
  the wreck left behind (or that it was suppressed).
- JSON/YAML/jq field names are unchanged.

### Missing-materials error table (gameserver 0.569.1)

- Human errors with code `missing_materials` or `missing_faction_materials` print
  `details.missing` as a compact Item / ID / Need / Have table on stderr.
- The table is omitted when `details` is absent or not that shape. `--quiet`
  still prints it; suggestions stay quiet-gated.
- `--json` / `--structured` / `--format json` field names are unchanged. `--format yaml`
  errors stay on the human path (now with this table when `details.missing` parses).

### Combined repair shortages (gameserver 0.573.1)

- Human `get_base` and `inspect` of a docked base print combined supply shortages after
  the repair queue. Shared stock is counted once, so two waiting repairs that each need
  10 steel with 5 in storage show 15 missing, not 10. The delivery hint is unindented so
  it is not read as a shortage row.
- JSON/YAML field names are unchanged.

### Facility dismantle help (gameserver 0.572.5)

- `facility dismantle` and `faction dismantle` document that damaged facilities can be dismantled without repairing first (cancels in-progress repair with no refund), plus Personal Quarters / Faction Storage ordering after other facilities at that station are gone, including ones still dismantling.
- `faction facility_list` help lists status values including repairing and dismantling.

### Facility tables, paused rent, and dock briefing (gameserver 0.572.5)

- Human facility tables keep the stored rent rate and append `(paused)` while damaged, repairing, under construction, or dismantling. Grouped `facility list` restyles Damaged to yes/no and adds a Dismantling column when that flag is present.
- `faction facility_list` marks paused rent on non-active statuses (including dismantling). `faction facility_owned` can show Damaged / Building / Dismantling as yes/no.
- Grouped `facility list` prints `Personal rent bill` from `player_rent` next to the existing `Faction rent bill`. `facility owned` still has no rent bill.
- Human `dock` prints `facility_note` and a **Your facilities** table (`1,200cr` or `1,200cr (paused)`). Empty `your_facilities` is omitted.
- JSON/YAML/jq field names are unchanged.

### Diplomacy and ops notification previews (gameserver 0.573.2)

- Human `get_notifications` / `notifications` prefer the server `message` as the
  headline for war, peace, and alliance frames. When `message` is absent, copy is
  synthesized from OpenAPI faction names (alliance names include `[TAG]` when present).
- `faction_war_declared` reads `aggressor_faction_name` / `defender_faction_name`.
  `Reason:` prints only when `reason` is present.
- Peace offers use `faction_peace_proposal` (`from_faction_id` / `from_faction_name`).
  `Terms:` prints only when `terms` is present. `faction_peace_proposed` no longer has
  a typed handler.
- Typed previews for `faction_peace_accepted` (`PEACE`) and `faction_alliance_proposal` /
  `faction_alliance_formed` / `faction_alliance_broken` (`FACTION`). Alliance proposals
  include `Use: faction accept_ally target_faction_id=…`; peace proposals still include
  `Use: faction accept_peace target_faction_id=…`.
- `server_restart_warning` (`SYSTEM`) prints `Server restart in Ns` in the headline,
  with `(target_version)` when present, and the server `message` as a detail when it is
  not already the headline.
- `drone_adrift` (`DRONE`) names type, POI, and system so the drone can be recovered at
  its last fuel-in-transit location. Drone ID is shown only when present; empty payloads
  print `A drone is adrift`. Recovery hints: `get_drone`, then `recall_drone`.
- JSON/YAML/jq field names are unchanged.

### Station material gifts (gameserver 0.574.0)

- `help storage deposit` documents `target=station:<base-or-POI-ID>` (docked-only, cargo vs `source=storage`, no credits/ships/packages/quest items).
- Docs/v1 `send_gift` to a station is `storage deposit`; the CLI command `send_gift` stays removed.
- `station:` deposit targets are reserved and are not rewritten from the player ID cache (strict exact match and `--fuzzy-ids`).

### Ship personnel and prize recoveries (gameserver 0.572.0)

- `get_ship` and `get_status`/`get_state` print **Crew**, **Marines**, **Efficiency**, **Operational speed**,
  and **Survivor recovery** from V2Ship personnel fields. **INCAPACITATED** appears only when that flag is true.
- `get_status --summary` prints a `Crew:` occupancy line (`fit_crew`/`effective_crew_capacity`) after Ship.
  The line is omitted when personnel is absent or the player is riding.
- `get_status`/`get_state` print a **Prize recoveries** table from non-empty `prize_recoveries`.
- JSON/YAML/jq field names are unchanged.

### Intact prizes in nearby / status / location tables (gameserver 0.572.0)

- `get_nearby` and `subscribe_observation` print a **Prizes** table with copyable Prize ID and Actor columns
  from `prizes` (plus Class, Status, Hull; optional Name, Wait, Shield, Combat). Empty lists are omitted.
- `get_status`, `get_state`, and `get_location` print **Nearby Prizes** from `location.nearby_prizes`.
- JSON/YAML/jq field names are unchanged.

### Battle boarding and captures (gameserver 0.572.0)

- Human `get_battle_status` prints **=== Boarding ===** (operation ID, phase, optional progress / attacker / target / self-destruct) when `boarding` is a non-empty array. Enemy crew/marine counts are never shown.
- Human `get_battle_summary` prints **Ships Captured:** (including `0`) and a **Captures** table (ship, class, captor, former owner, boarding id) when `captures` is a non-empty array.
- Human `get_battle_log` adds optional tick columns **Board** / **Captures** / **Casualties** and follow-on **Boarding** / **Captures** / **Personnel casualties** tables. Casualty cells are yes/no flags only.

### scan table

- Human `scan` prints `Description:` after hull/shield/cloak when the server sends lore that is not already an identical `revealed_info` string. Prize/creature scans still omit personnel.

### facility_list / facility_types table (gameserver 0.572.0)

- Human `facility_list` prints a station `Service pools:` section from top-level `service_pools` (`Personnel` / `Medical` / `Marine training` remaining stock). This is not a per-row facility column.
- Human `facility_types` detail (`kind: detail`) prints identity fields and a `Service pool:` definition line (`20 cap, +4/cycle, 1x crew_rations`). Discovery listing is unchanged. JSON/YAML/jq field names are unchanged.

### catalog / inspect ships and modules (gameserver 0.572.0)

- Ship-class inspect prints `Crew capacity`, `Minimum crew`, `Marine capacity`, `Latch resistance`, and `Boarding defense: N%` (the percent line is omitted when missing or `0`).
- Module inspect and bonus summaries print boarding/medical/personnel bonuses and flags (`boarding`, `boarding contact defense`, `remote medical`; `_pct` keys as `N%`).

### battle_stance board (gameserver 0.572.0)

- Second bare token is now `target` (including on fire/evade/brace/flee); `board <enemy> marines=N` no longer drops the enemy. Leftover tokens after `target` are still ignored; use `marines=N`.
- Local reject of unknown stances (`charge` → `invalid_enum` listing `board`).
- Local reject of non-positive `marines` (`marines=0` → `below_minimum`). Help Fields say `target`, not `target_id`; `target_id=` aliases to `target` on this command only.

### Ship personnel commands (breaking)

- `recruit_personnel`, `treat_personnel`, and `transfer_personnel` are curated Ship management
  commands (`POST /api/v2/spacemolt_ship/{recruit,treat,transfer}_personnel`). Generated names
  `ship_recruit_personnel`, `ship_treat_personnel`, and `ship_transfer_personnel` no longer
  dispatch, complete, or resolve as help for the curated commands.
- `treat_personnel` and `transfer_personnel` accept docs/v1 kwargs `target=` (alias of API `id=`).
- Human output for these three commands is still the generic `=== Response ===` dump.

### claim_prize / service_prize (Salvage & Tow)

- `claim_prize` and `service_prize` are curated Salvage & Tow commands with docs/v1 field aliases
  (`prize_id` → `id`, `destination_base_id` → `target`; `service_prize` also accepts `action` → `service_action`).
- Generated fallbacks `salvage_claim_prize` and `salvage_service_prize` are a breaking cutover. Those names are
  gone, have no hidden aliases, and will **not** fuzzy-map to `claim_prize` / `service_prize`.

### Faction personnel group action (breaking)

- `spacemolt faction personnel` views, recruits into, deposits to, or withdraws from the faction local
  personnel reserve (`POST /api/v2/spacemolt_ship/faction_personnel`). Omitting `personnel_action` leaves
  the server default (`status`). Recruit and withdraw require ManageTreasury; any member may deposit.
- Generated `ship_faction_personnel` is removed. There is no command-name alias; use the grouped form.

### Full help listings (personnel and intact prizes)

- `spacemolt help all` lists Personnel immediately after Combat (`recruit_personnel`, `treat_personnel`,
  `transfer_personnel`), prize recovery only under Salvage & Tow (`claim_prize`, `service_prize`), and
  `faction personnel` in the Faction block. Generated `ship_*` / `salvage_*` names stay out of help.

### commission_ship / commission_quote help (gameserver 0.569)

- `help commission_ship` documents `bare_hull=true` (opt-in unfitted hull at NPC, empire, and faction yards) and
  `source_missing_materials=true` (NPC/empire only: contribute cargo then station storage; pay the deficit).
- Empire/NPC material modes are credits-only (default), `provide_materials=true`, or `source_missing_materials=true`.
  Do not combine the two material flags. Faction yards still require `fund_from_faction=true` (ManageTreasury)
  and do not market-source missing materials.
- `help commission_quote` Usage lists `bare_hull` and `source_missing_materials`; quote with the same flags as
  `commission_ship`. Human quote and `commission_ship` receipts print Materials Supplied / Materials To Source;
  `commission_status` prints Item / Required / Supplied / Gathered (no Missing header). JSON/YAML/jq field names
  are unchanged.

### commission_status table (gameserver 0.569)

- Human `commission_status` prints a **Bare hull** column (`yes`/`no`) when any row has a boolean
  `bare_hull`. An optional **Sourcing** column (`yes`/`no`) appears when any row has
  `source_missing_materials` (the default curated golden still omits it).
- **Materials** cells print `yes`/`no` instead of `true`/`false`. Scripts that scrape the human
  Materials cell for `true` must switch to `yes`. JSON/YAML/jq field names are unchanged.
- When a commission includes printable material maps, a follow-on table lists **Item**, **Required**,
  **Supplied**, and **Gathered** from the server maps only (no **Missing** header). The section is
  omitted when maps are absent, empty, or unparsable.

### commission_quote table (gameserver 0.569)

- Human `commission_quote` prints bare-hull / partial-sourcing flags, sales tax,
  faction-funded-only, sourcing cost, partial-sourcing total, afford-partial, and
  Materials Supplied / Materials To Source tables when the server sends them.
  Credits-only and provide-materials lines are unchanged. JSON/YAML/jq field names
  are unchanged.

### commission_ship table receipt (gameserver 0.569)

- Human `commission_ship` prints a dedicated receipt (hull/sourcing modes, costs, supplied / to-source
  tables) instead of the generic scalar dump or `=== Response ===` JSON. Table labels changed
  (`Commission Id:` → `ID:`; credits as `N cr`). `--json` / `--yaml` / `--jq` field names are unchanged.

### get_ship remote fleet reads (gameserver 0.568.0)

- `get_ship` accepts optional `ship_id` (alias of `id`); omit for the flying hull. Copy the ID from
  `list_ships` or `faction garages` (cached names resolve only for hulls already in the local ID
  cache, typically owned ships from `list_ships` / `storage view`).
- Help documents remote owned / faction-garage reads from anywhere.
- Table output prints `Location:` from `ship.location` on remote reads, plus dim `message` when that
  message is not a duplicate of `ship.location`. Current-hull table is unchanged.
- `list_ships` / `faction garages` help point at `get_ship` for the full fit.

### SpaceMolt v0.568.0 compatibility — `list_ships` table

- Human `list_ships` is no longer the generic Name / ID / Type list. It shows custom name,
  class, id, active, location, hull, fuel, cargo, module count, listings when present, fitted
  module type ids, and faction garage used/capacity.
- Table headers changed (`Type` removed; Class / Active / Location / Hull / Fuel and optional
  Cargo / Mods / Listing / Price added). Scripts that scrape human headers must update.
  `--json` / `--yaml` / `--jq` / `--structured` field names are unchanged.
- `help list_ships` documents module types and `get_ship <ship_id>` for the full fit.

### SpaceMolt v0.567.6 compatibility

- Human `get_battle_summary` omits **Winning Side** when the API returns `winning_side: -1`
  (stalemate). `Outcome` still prints the raw server token. JSON/YAML still pass through `-1`.
- Human `get_battle_log` Ticks **Ended** prints the raw `battle_ended.outcome` token
  (for example `stalemate` or `side_1_victory`) instead of `yes`. JSON/YAML nested fields
  are unchanged. Defense-stage columns are unchanged.
- `battle_ended` notification previews prefer raw `reason` (`Battle ended (stalemate)`),
  keep legacy `message` when `reason` is absent (`Battle ended! Victory`), and say
  **no winning side** when `winning_side` is `-1`.

### `get_base` repair queue (gameserver 0.567.5)

- Human `get_base` (and `inspect` of a docked base) now prints `repairs` when
  facilities are damaged: queue counts, supply method, hull recovery, the next
  blocked facility with exact missing materials, and a repair-queue table whose
  Facility ID column is the `facility_id` for `facility repair`.
- JSON/YAML field names are unchanged. `facility repair` remains the mutation.
  Help for that command notes that damaged-station IDs also appear on `get_base`.

### Catalog inspect (gameserver 0.564–0.566)

- Human `inspect` of catalog modules now shows slot, CPU/power (including 0), dedicated combat stats,
  leftover bonuses, combat specials, and special text without duplicating the same token.
- Human `inspect` of catalog ship classes now shows hull/shield/slots, the full default loadout,
  distinct achievement / faction achievement / lock lines, capabilities, and truncated build materials.

### Catalog item tables

- Catalog item tables show a Slot column when items declare a slot, and Effects now include
  module combat and utility effects as well as ammo.

### Catalog ships list

- Human `catalog` ship tables keep the `=== Items ===` title and add optional Loadout, Req. items,
  Lock (`prestige_lock` only), and Availability columns when those values are present. A one-row
  ship catalog also prints a full Details block after the table.

### Breaking: `repair_module` removed (gameserver v0.567.1)

- Modules no longer accumulate wear, so `spacemolt repair_module` is gone with the API
  route. Repair Kits still repair ship hull via `spacemolt repair`.
- Human `get_ship` module tables no longer include a Wear column. JSON/YAML still
  pass through any leftover `wear` / `wear_status` keys the server sends.
- Catalog ammo effect summaries no longer print `wear/shot`.

### Help: wreck fit and faction scrap (gameserver 0.565.0–0.567.1)

- `loot_wreck` usage now includes `module_id=`. That ID fits the module onto your ship
  (free slot, CPU/power; withdrawn types cannot be fitted); it does not put the module
  in cargo. Example: `spacemolt loot_wreck wreck-1 module_id=module-1`.
- `storage loot` help matches that fit path. Omit `wreck_id` while towing; cargo still
  uses `item_id` / `quantity`. Distinct from top-level `loot_wreck`.
- `scrap_wreck` help documents the 0.565.0 locations: salvage yard after
  "A Lucrative Sideline" (Salvaging 2+) or "Cut It Apart Yourself" at a pirate
  stronghold, or your faction's own player station with Salvaging 2+ and no mission.

### SpaceMolt v0.566.2 compatibility

- Human `get_battle_log` now prints the shield/hull split and compact per-weapon defense stages.
  JSON/YAML output is unchanged.
- Station-aware commands accept a station base ID or station POI ID (gameserver 0.565.1).
  Help for `travel`, `find_route`, `view_orders`, `storage view`, `browse_ships`,
  `commission_status`, `load_passenger`, `faction_scan_poi`, `shipping_list`,
  `faction_query_trade_intel`, and `faction post_mission` (`target_base_id`) now says so.
  `jump` remains a connected system ID or Pathfinder bearing. `shipping_post` /
  `shipping_quote` were already documented this way.
- `get_poi` labels a nested station's canonical Base ID and POI ID separately; a lone `base_id`
  prints as Station Base ID.

### SpaceMolt v0.564.0 compatibility

- `pay_bounty` is a first-class Taxes command. Settle outstanding bounty with one empire from
  anywhere (`spacemolt pay_bounty solarian`, or `spacemolt pay_bounty solarian faction` to pay
  from the faction treasury). `empire` and `empire_id` are aliases for `id`. Omit `id` when you
  owe exactly one empire; use `source=faction` if you omit `id` and pay from the treasury.
- `help misc` lists Taxes (`prepay_tax` and `pay_bounty`). Command-group discovery copy includes
  `misc` (`spacemolt help <group>`).
- Human `pay_bounty` output shows amount paid, paid-from (`self` / `faction`), remaining bounties,
  and whether detention for that empire was released.
- `get_status`, `get_state`, and `get_player` table output show non-zero outstanding bounty on
  standings and a detention line when a standing includes a detention until-time.

- Human `complete_mission` output shows credits promised and shortfall when the empire treasury
  underpays. Full-payout copy is unchanged.
- `battle_left` notification previews include flee, destroyed, and emergency-warp reasons.
- `facility repair` help now matches gameserver 0.559.0: a wrecked station rebuilds every
  facility it can afford at once (it will not stall on one unpayable bill), NPC megaproject
  repair bills are capped, and player-faction stations pay full price.
- `get_notifications` / `notifications` usage and examples include `observation` in `types=`.
- Battle help states that advance, retreat, stance, target, and engage do not cost a tick;
  only `reload` does.

### Auth-provider 503 retries

- HTTP 503 from the authentication provider is retried using `Retry-After` instead of being
  treated as a bad credential. After retries are exhausted the CLI reports `service_unavailable`
  and tells you to wait and retry the same command. Do not change your password — this is not
  an invalid-credentials error. (API-key agents should likewise retry rather than mint a new key;
  the server revokes the old one.)

### Breaking: list the crafting queue with `spacemolt craft`

- To list queued crafting (and recycling) jobs, run `spacemolt craft` with no recipe.
  `action=queue` is rejected and is not sent. Gameserver 0.554.15 does not accept that
  field on v2 transports; following it could silently enqueue a real job.
- Cancel/retarget still use `job_id` / `job_ids` on `craft` and `recycle`. Find IDs from
  `spacemolt craft` or `facility_job_list`.

### SpaceMolt v0.554.1 compatibility

- Bundled OpenAPI metadata and the reviewed fixture/schema baseline now track gameserver
  **v0.554.1**.
- `craft` and `recycle` can retarget the remaining output of an existing job without cancelling
  it: pass `job_id=<id>` together with `deliver_to=<storage|faction|faction:bucket>`. Queue and
  retarget responses show the current, previous, and new destinations where applicable.
- `subscribe_observation` human output now includes pirates, empire NPCs, and creatures from the
  baseline snapshot. `observation_update` notifications summarize changed and departed players,
  system agents, pirates (including crew), empire NPCs, creatures, and cloaked contacts.
- `subscribe_market --follow` and `subscribe_observation active_scan=true --follow` now keep a
  subscription open using 10-second HTTP notification polling. The existing commands remain
  one-shot without the flag, machine-readable follow output is intentionally rejected, and
  Ctrl+C/SIGTERM makes one best-effort unsubscribe request. Market follow polls
  `get_notifications` with `types=market`; observation follow polls with `types=observation`.
- Local combat help now reflects persistent system battles: `attack` starts or joins a battle and
  does not fire an extra volley when repeated, while `battle_engage` only joins an existing battle.
- `storage deposit` and `storage withdraw` help entries document automatic local docking,
  including fleet docking for fleet leaders and the fact that deposit validation happens after
  docking; human responses surface the resulting docking and location state.
- `faction post_mission` help documents that unknown objective/reward item_ids fail with
  `invalid_item`. Fields cover type-specific item_id rules, quantity merge, and that
  `visit_system` needs an Intel Center while `dock_at_base` needs a Commerce Terminal.
- `facility repair` help teaches that a station rebuilds its own faction's damaged facilities
  automatically from that faction's storage at the station; use the command for a facility the
  station will not rebuild, or to jump the queue. Automatic rebuild spends and manual spends are
  recorded in the faction action log. `faction facility_list` human output mentions the same
  auto-rebuild path.
- `shipping_post` and `shipping_quote` help document `package_id` as a bare id or `package:<id>`,
  `destination_base_id` as a station base ID or station POI ID, and station `recipient_id` the
  same way. `shipping_quote` is now a curated Missions command.
- Human output surfaces the latest response fields: catalog item `compression`, mission
  `reputation_changes`, resolved/issuing mission destinations, and faction facility
  `repair_complete_tick`. Structured JSON/YAML output preserves the API field names unchanged.

### SpaceMolt v0.556.0 compatibility

- `observation` is a first-class notification type on `get_notifications` and GET `notifications`
  (`types=observation`), alongside chat, combat, trade, market, crafting, and system.

### SpaceMolt v0.555.0 compatibility

- `storage view` prints a Locations table (station, system, item and ship counts, ID) whenever the
  response includes `locations`. Personal views summarize every station where you hold items or
  parked ships. Undocked with no `station_id` shows `=== Storage Locations ===` instead of a raw
  JSON dump.

### SpaceMolt v0.557.0 compatibility

- `get_ship` table output shows drone bay counters and racked drones when `drone_bay` is present.
  Use `list_drones` / `get_drone` for hull, cargo, and script. Ships without a bay omit the section.

## 2.8.0 — 2026-08-02

Large release since **2.7.0** (2026-06-29). Bundled OpenAPI metadata tracks gameserver through **v0.552.0**.

### Highlights

| Area | What changed |
| --- | --- |
| **Breaking: storage** | Multi-action `storage` → grouped `storage view|deposit|withdraw|loot|jettison` (no `action=` body field) |
| **Breaking: ID cache** | Payload id/name rewrites are exact-only by default; short fragments need `--fuzzy-ids` / `config fuzzy-ids` / `SPACEMOLT_FUZZY_IDS` |
| **Breaking: outpost dismantle** | Use top-level `dismantle_outpost` (not `facility dismantle_outpost`) |
| **Shipping** | Curated `shipping_active` recovery board; get/track/deliver/return accept `package_id` **or** `shipment_id`; late settlement + overdue previews |
| **Notifications** | Shared compact human previews; routine summarization; `--verbose-notifications` for omitted extras; clearer `--raw-notifications` docs |
| **Display** | Standings, pirate crews, facility required stock, faction facility damage status, craft packages, commissions, ranch/bulk orders, battle station participation |
| **API sync** | Continuous `spacemolt-docs` / generated metadata updates from ~v0.454 through **v0.552.0** |

### Display: facility maintenance stock labels (0.550.0)

Facility list and catalog facility tables now label maintenance quantities as
**required on-hand stock**, matching gameserver 0.550.0:

- Column header **`Upkeep` → `Req. stock`** (human table only; scrapers of
  table headers must update).
- Bunker fuel cell text **`N fuel/cycle` → `N fuel stock`**.
- Item-only cells are unchanged quantities under the new header.

`Rent/cycle`, labor, and faction rent bills remain true per-cycle credit costs.
Wire field names (`maintenance_per_cycle`, `maintenance_fuel`, …) and
JSON/YAML/compact output are unchanged.

Station life-support lines (`Upkeep every N ticks`, `Short of upkeep`) are
**intentionally unchanged** — they are station cadence fields, not the facility
maintenance stock list.

### Action log: `session.daily_balance` in help

- `get_action_log` help/example advertise `event_type=session.daily_balance` (UTC-day credit
  snapshot for book balancing), alongside multi-type filters and `since_id` cursor polling.
  No protocol change — filter support was already present.

### Automation notes (gameserver 0.548–0.551)

Scripts and agents that parse structured status / facility / nearby payloads should treat the
following as intentional gameserver contracts. Prefer `--json` / `--structured` over scraping
human stdout.

#### Standings: per-crew pirate keys (0.548.0)

| Old | New |
| --- | --- |
| `standings.pirates` | **Removed** |
| (single aggregate pirate rep) | Per-crew keys: `pirate_voss`, `pirate_kael`, `pirate_thane`, `pirate_mera`, `pirate_dross`, `pirate_crix`, `pirate_sable`, `pirate_nyx`, `pirate_korr` |

Empire keys are unchanged (`solarian`, `voidborn`, `crimson`, `nebula`, `outerrim`). Prefer
iterating object keys (or reading known per-crew ids) rather than a single `pirates` property.
Attacking one crew only moves that crew’s standing.

#### Faction facilities: filter on active / damaged (0.551.1)

| Unsafe assumption | Correct check |
| --- | --- |
| Any listed facility is productive | Prefer `status === "active"` (or treat `status === "damaged"` / `damaged === true` as non-productive) |
| Damaged facilities still look “active” | Damaged faction facilities report `status: "damaged"` and a `damaged` flag |
| `faction_info` “active facilities” includes damaged | `faction_info` no longer lists a damaged faction facility as active |

Repair path: `facility repair` / `spacemolt help facility_repair` (discoverable from
`faction facility_list` help after Stack A). Human `faction facility_list` already shows
Status / Damaged columns.

#### Nearby pirates: structured fields first; gameserver tables vs CLI human text (0.548.0)

Pirate rows expose **`faction`** / **`faction_name`** (crew id / display name). For automation,
prefer `--json` / `--structured` and those field names — do not scrape human text.

| Consumer | Shape | What to do |
| --- | --- | --- |
| **CLI structured modes** (`--json` / `--structured`) | Objects with `faction` / `faction_name` (and related pirate fields) | Read fields by name |
| **Gameserver / MCP table UIs** for `get_nearby` / `get_state` | Headered tables that gained a **`crew`** column in 0.548.0 | If you parse those tables, re-bind by **header** (`crew` / `faction`), not fixed column index |
| **CLI default human stdout** | Freeform lines, e.g. `Name (class) - crewLabel - status` — **not** a headered multi-column table | Do **not** look for a `crew` header in CLI human output; switch to structured modes instead of positional scraping |

#### Shipping (already covered elsewhere)

| Topic | Where it lives today |
| --- | --- |
| Dual id (`package_id` **or** `shipment_id`) | **Shipping get / track / deliver / return accept `package_id`** (below) |
| Late windows / fees / recovery board | **Curated `shipping_active` recovery board** (deadline, late fee, late marker) |
| Settlement `late` flag on deliver/return human output | Shipping deliver/return human settlement output |

### Faction facility list table with status and damage

- `faction facility_list` renders a human table with **Status** (active / damaged / under construction), **Damaged** (yes/no), Service, and Rent — including optional Building ticks when under construction.
- Help cross-links `facility_repair` from the list command (and vice versa) so post-raid repair is discoverable.

### Battle summary shows station participation

- `get_battle_summary` table output includes **Has Station: yes|no** when the API returns `has_station` (whether a station fought in the battle).

### Battle targeting help and status fixtures

- `battle_target` help (including the Battle cheatsheet) now states that any battle combatant can be focused by **ID or name** (players, pirates, police, drones, creatures, stations), matching gameserver 0.547.2.
- Golden `get_battle_status` sample includes multi-kind participants (`kind`, station hull/shield) so human output shows the Kind column.

### Curated `shipping_active` recovery board

`shipping_active` is a first-class Missions command (no longer Generated API). Human mode prints
an **Active Freight** table of every live contract you are party to: role, destination,
deadline (with late marker), recovery window, payout if delivered now, late fee, whether the
package is in your cargo, next step, shipment id, and package id. Start here when you accepted
a run and lost track of the box.

```bash
spacemolt shipping_active
spacemolt help shipping_active
```

### Shipping get / track / deliver / return accept `package_id`

`shipping_get`, `shipping_track`, `shipping_deliver`, and `shipping_return` are curated under
Missions and document the dual identifier path: pass **either** `shipment_id` **or** the sealed
`package_id` from cargo (exactly one). Help usage and examples teach the cargo-box path so you
do not need the contract id when the unlabeled package is already in your hold.

```bash
spacemolt shipping_get package_id=package-relief-1
spacemolt shipping_deliver package_id=package-relief-1
spacemolt help shipping_deliver
```

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

### Notifications: compact previews and flags

Human notification and `get_notifications` table **Message** columns share one preview builder:

- Routine types (crafting progress, action results, system travel, social/combat domains, inventory dumps) collapse to short one-line previews instead of nested dumps.
- Generic fallbacks are ladder-aware (prefer useful scalars over raw JSON blobs).
- Crafting / action_result / travel progress can be **summarized** further (multiple related lines collapsed).
- Ship commission and related receipts render cleanly in notification polls and action-log human output.
- Freight: `shipment_overdue` and package-shipment context get human previews; inspect tables show `package.shipment` when present.

Flags:

| Flag | Effect |
| --- | --- |
| (default) | Compact previews + routine summarization |
| `--verbose-notifications` | Keep omitted hints and extra scalar fields that the compact path drops |
| `--raw-notifications` | Skip **summarization** only — still uses compact one-line formatting, not full nested JSON |

Use `--json` / `--structured` / related machine modes when you need full notification objects.

### Display: standings, pirates, craft packages, and related

- `get_status` / `get_state` human output show player **standings** (empire + per-crew pirate keys from gameserver 0.548+).
- Nearby / mission pirate rewards show **crew** labels; structured mode exposes `faction` / `faction_name` (see automation notes above).
- Craft quotes, job fields, and bulk craft columns render **packages** and capacity gates for packaged recipes.
- Wildlife **ranch** responses and faction **bulk-order** responses have dedicated human formatters.
- Action log human output surfaces **polling cursors** (`since_id` style) for incremental scrapers.
- Ship tow help documents same-scale towing; package_ids / dismantle UX aligned with gameserver 0.531–0.538 craft packaging and dock changes.

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
