# Storage deposit gifts: OpenAPI, changelog, and CLI help do not agree

Date: 2026-10-21. Gameserver baseline checked locally: `spacemolt-docs/changelog.json` `current_version` is `0.643.3`, and `GENERATED_API_GAMESERVER_VERSION` in `src/generated/api-commands.ts` is `v0.643.3`. No live responses were collected. `LIVE_API_SYNC` was not set. The docs submodule was not fetched. `bun run generate:api` was not run.

This file records gaps and contradictions only. It does not propose CLI wording; that is in the design doc that cites this path.

## What was checked

- `spacemolt-docs/openapi.json` operation `spacemolt_storage_deposit` (`POST /api/v2/spacemolt_storage/deposit`), walked with `bun -e` because the file is one line.
- Component schemas `GiftGoodwill`, `GiftShipResponse`, `SendGiftResponse`, `EmpireGiftResponse`, `FactionGiftResponse`, `BulkStorageResponse`, `BulkStorageItemData`, `DepositItemsResponse`.
- The same `target` property text on `POST /api/v2/spacemolt_storage/view` and `POST /api/v2/spacemolt_storage/withdraw`.
- `spacemolt-docs/changelog.json` notes for `0.639.0`, `0.639.1`, `0.642.0`, `0.643.0`, `0.643.1`, `0.643.2`, `0.643.3`.
- `spacemolt-docs/docs/storage.md`, `spacemolt-docs/docs/empires.md`.
- Curated CLI help in `src/command-overrides-commerce-facility.ts` (`storage_deposit`) and `src/command-descriptions.ts`.
- `src/help.test.ts` (one test executed; see below).

`0.639.1` (wrecks stay at the death POI), `0.643.1` (drone travel-control), `0.643.2` (capture-only boss flagships; counterfeit licenses), and `0.643.3` (TLS) do not describe `storage deposit` gift requests or `goodwill`. They are out of scope here except `0.643.2`, which is named only because it is adjacent and still not a deposit-schema change.

## Changelog text that the spec does not repeat

`0.639.0` (nine notes): gifts to empires, empire stations, and pirate crews earn reputation; bounty is paid from the gift first; `send_gift recipient="pirate:voss" credits=5000` wires credits from anywhere; credits to `station:<id>`; gift strongholds while docked; pirate crews only reward introduced pilots; responses include `goodwill`.

`0.642.0`: pirate crews take ships. Dock at the stronghold with the ship parked and gift with `send_gift ship_id=<ship> recipient=station:<base ID>` or `storage action=deposit item_id=<ship> target=station:<base ID>`. `disposition`: scrapped, refitted, joined the fleet as-is (pirate-built hull), or taken by the boss. Boss flagship behavior (upgrade, hunt, return, rival ship, empire-hull copy, spare) is in that note. Strongholds no longer build other bosses' flagships from market hulls.

`0.643.0`: a boss flagship can be gifted back from wherever it is parked, without flying there: `send_gift recipient="station:<stronghold base ID>" ship_id=<ship>`. The crew collects it, cargo stays in storage at that station, and the hunt stops. Other ships still have to be delivered in person. The rest of that release (besiege, board, `combat.flagship_reclaimed`, `flagship_*` radio) is not a deposit request field.

## OpenAPI facts (cached spec)

Operation description of `spacemolt_storage_deposit` (abridged to the sentences that matter):

- Empire alias: credits can be wired from anywhere.
- `pirate:<crew>`: wire credits from anywhere.
- `target="station:<base-or-POI-ID>"`: donates ordinary items or credits while already docked at that managed NPC empire station or pirate stronghold. No packages or quest items, and ships only to a pirate stronghold.
- Gifts to empires, NPC empire stations, and pirate crews earn standing. The response `goodwill` field and a private reply report the result.
- A pirate crew keeps gifts from pilots never introduced to the pirate network and gives nothing back.

Request property `credits` description:

> For 'deposit': credits to gift a player, or to donate to an empire, a station:<id> or a pirate:<crew>. (Faction credit deposits use item_id='credits' with quantity instead.)

Request property `target` description (byte-identical on deposit, view, and withdraw; compared in-process, all three lengths 1019 and equal):

> Target: self, faction, faction:TAG, empire alias, pirate:<crew>, player name/ID, or station:<base-or-POI-ID>. Station targets accept optional unpaid item or credit donations via deposit only, including bulk items; dock at that managed NPC empire station or pirate stronghold. No packages or quest items, and ships only to a pirate stronghold. Credits to an empire or pirate:<crew> can be wired from anywhere. ...

That `target` property does **not** contain the operation-description sentence about unintroduced pilots, and it does **not** mention a boss flagship or a remote return.

Request property `item_id` description says a ship UUID with `target=<player_name>` gifts the ship and triggers `gift_ship`. It does not mention `target=station:<base ID>`.

`GiftGoodwill` (`additionalProperties: false`). Required: `counterparty`, `need_value`, `reputation_before`, `reputation_after`, `reputation_change`, `situation`, `reply`, `reply_from`. Optional: `bounty_paid`, `bounty_remaining`. There is **no** `enum` on `situation`. The allowed tokens exist only in the property description (including `stranger`, `bounty_partial`, `bounty_cleared`, `hostile`, `cooling`, `unwanted_items`, `unwanted_ship`, `token|appreciated|generous|lavish|devoted` plus `_credits|_items|_ship`, ship outcomes `ship_scrap|ship_refit|ship_pirate` plus `_cheap|_mid|_expensive`, and boss outcomes `boss_upgrade`, `boss_hunt`, `boss_flagship_returned`, `boss_rival_flown`, `boss_rival_scrapped`, `boss_flagship_copy`, `boss_flagship_spare`, each of those ship/boss forms with optional `_cold`). A prior audit that called `situation` an enum was wrong about the schema keyword. Unknown tokens are not rejected by the schema.

`counterparty` description: empire id (example `solarian`) or pirate crew id (example `pirate_voss`, underscore, not `pirate:voss`).

`SendGiftResponse.goodwill` description: present on gifts to empires, NPC empire stations, and pirate strongholds; omitted for players, factions, and the fixer. The only concrete object in the spec is this property's `example` (not a captured live call): `counterparty` `nebula`, `need_value` `360`, reputations `10` / `10` / `0`, `situation` `token_items`, a one-sentence `reply`, `reply_from` `Nebula Trade Federation`. That example omits `bounty_paid` and `bounty_remaining`.

`SendGiftResponse.recipient`: a `pirate:<crew>` credit wire reports its stronghold as `station:<base ID>`. `credits_sent` is omitted when none (item gifts). `wallet_remaining` is "omitted when not applicable or zero."

`GiftShipResponse.action` enum is `gift_ship`. `disposition` enum is `scrapped`, `refitted`, `joined_fleet`, `boss_ship`, omitted for gifts to players. `goodwill` is omitted for gifts to players. Required: `action`, `ship_id`, `class_id`, `recipient`, `base_id`. No full-object example.

`EmpireGiftResponse.action` enum: `empire_gift_credits`, `empire_gift_items`, `empire_gift_ship`. `goodwill` uses the same "present on empires / NPC stations / pirate strongholds" description as `SendGiftResponse`. `base_id` is omitted for a credit wire sent from anywhere other than one of the empire's own stations. These properties have **no** description: `action`, `cargo_remaining`, `class_id`, `class_name`, `credits_sent`, `empire_id`, `empire_name`, `fleet_id`, `fleet_name`, `hull_designator`, `item_id`, `message`, `npc_id`, `petition_id`, `petition_notice`, `quantity`, `ship_id`, `wallet_remaining`. What `fleet_id`, `hull_designator`, `npc_id`, and `petition_*` mean is unknown.

`FactionGiftResponse` has no `goodwill` property.

`BulkStorageResponse.goodwill` has the same description as `SendGiftResponse.goodwill`. `BulkStorageItemData` is an untyped object (`additionalProperties: true`) whose description says it is the single-item storage response. Whether a bulk call fills parent `goodwill`, nested `result.goodwill`, or both was not observed.

Deposit `200` `details` is a `oneOf` of `DepositItemsResponse | FactionGarageStoreResponse | TransferItemsResponse | TransferCreditsResponse | SendGiftResponse | GiftShipResponse | FactionGiftResponse | EmpireGiftResponse | FactionDepositItemsResponse | FactionDepositCreditsResponse | FactionDepositFuelResponse | BulkStorageResponse`.

The words "wherever", "boss flagship", and "flagship back" do not appear on the deposit operation or its request properties. "boss flagship" in this spec is on `POST /api/v2/spacemolt_facility/buy_ship_license` and `POST /api/v2/spacemolt_ship/commission_ship` (capture-only), which is `0.643.2`, not the deposit return path.

## Contradictions

1. **Changelog `0.643.0` vs deposit `target` (and the operation's "while already docked" clause).** The changelog says a boss flagship is gifted with `recipient="station:<stronghold base ID>"` from wherever it is parked. Other ships are still in person. The operation text attaches "while already docked there" to station item or credit donations and then says ships only to a pirate stronghold, without a remote exception. The `target` property says station targets dock at that station or stronghold, with no exception. There is no request field that marks a hull as a boss flagship. It is unknown whether a remote flagship gift sets `auto_docked`, and unknown what error string is returned for any other ship gifted from the wrong place. Do not invent that code.

2. **Changelog `0.643.0` cargo sentence vs `GiftShipResponse`.** The changelog says cargo stays in storage at the station where the ship was parked. `GiftShipResponse` has no cargo property (`additionalProperties: false`). No response field was found to print that fact from.

3. **`item_id` vs `GiftShipResponse.recipient` and `0.642.0`.** `item_id` documents only `target=<player_name>` as a ship gift. `GiftShipResponse.recipient` is "player name, or `station:<base ID>` for a ship given to a pirate stronghold." The operation description says ships only to a pirate stronghold.

4. **Curated CLI help vs the same OpenAPI credits property.** `src/command-overrides-commerce-facility.ts` `storage_deposit.schemaExtensions.credits` replaces the generated description with "Credits to gift to another player. Not valid for station: targets. Not valid for fixer:tab. ..." The command description says station material gifts "require you to already be docked" and "No credits, ships, packages, or quest items." `mergeSchemaExtensions` in `src/commands.ts` overwrites the generated description, so `help storage deposit` shows the curated credits sentence, not the OpenAPI one. Confirmed by running `bun test src/help.test.ts -t "documents gifting via storage deposit"` on 2026-10-21: the rendered Fields line is `credits - Credits to gift to another player. Not valid for station: targets.` while the same render's `target -` line already includes `pirate:<crew>` from generated metadata.

5. **`src/help.test.ts` vs generated `target` text.** That test expects the contiguous string `target - Target: self, faction, faction:TAG, empire alias, player name/ID, or station:<base-or-POI-ID>`. Generated text inserts `pirate:<crew>, ` after `empire alias, `. The test failed on that assertion (the run above). `showCommandHelp` in `src/help.ts` prints `schema.description` verbatim. This is a stale assertion, not a second target description.

6. **`spacemolt-docs/docs/storage.md` (Gifts) vs `0.642.0` / `0.643.0` / OpenAPI.** The page says `send_gift` sends a ship to a player, faction, or empire, and items or credits (not ships) to `station:<id>` or `pirate:<crew>`. It says ship gifts work remotely. It does not mention a stronghold ship gift or a boss-flagship exception. The command table still lists `send_gift` as its own command. The CLI has no `send_gift` command (`src/command-overrides-commerce-facility.ts`, `src/version-sync.test.ts` still asserts `faction_gift` is absent).

7. **`spacemolt-docs/docs/empires.md` (Gifts and goodwill) vs `0.643.0` and vs CLI grammar.** It says goods and ships must be delivered in person, which has no boss-flagship exception. It says to call `send_gift` or `storage action=deposit`. The CLI grouped command has no `action=` grammar and no request-body `action` field (`AGENTS.md`). The unintroduced-crew sentence on that page ("kept and buys nothing") matches the deposit operation description and `GiftGoodwill.situation`'s `stranger` clause; that part is not a contradiction.

8. **View and withdraw `target` descriptions are the deposit gift paragraph.** They are the same string as deposit `target`, including "via deposit only" and "ships only to a pirate stronghold." `help storage view` and `help storage withdraw` therefore describe deposit gifts. `storage_view` / `storage_withdraw` do not override `target` (`schemaExtensions.target` is unset). Not introduced by curated deposit help. Do not hand-edit `src/generated/api-commands.ts` to split them.

## Not a contradiction

- `wallet_remaining` "omitted when zero" does not forbid a client from printing an explicit `0` if a payload contains the key. The cached spec says the server omits zero. No live body was captured to confirm the server never sends `0`.
- Generated deposit `credits` / `target` text in `src/generated/api-commands.ts` matches the cached OpenAPI sentences quoted above (the help render showed the generated `target` paragraph, including `pirate:<crew>`). The drift is curated help and prose docs, not a stale `generate:api` output.
- `SendGiftResponse` and `EmpireGiftResponse` are both in the deposit `details` `oneOf`. Which action a live empire credit wire actually returns (`send_gift` vs `empire_gift_credits`) was not observed. Both schemas include `goodwill`.
