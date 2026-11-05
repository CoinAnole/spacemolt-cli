---
name: verify-reserved-ids
description: >
  Check that preparePayload keeps reserved wire strings (storage targets, fuel,
  tank_fuel, credits on the credit commands, numeric jump bearings) and sends
  a prize station field as the cached POI base id. Use when editing
  reservedIdValue, resolvedStationBaseId, resolveReloadWeaponsAmmo, or the
  payload rewrite around resolveCachedId in src/payload.ts, and before
  finishing a change that touches those functions.
user-invocable: true
---

# Verify reserved payload ids

## Property

Reserved storage targets, `fuel`, `tank_fuel`, `credits` on the four credit commands, and numeric `jump` bearings are never replaced by a cached player, item, or system id. `claim_prize` and `service_prize` send a station field as the cached POI base id when the hint has one.

Harm: `storage deposit target=self` would pay a player whose name is `self`. `jump 90` would travel to a system named `90`. A prize claim would go to the POI id instead of the station.

This is not a TLA+ model. `/statechart` does not apply. Nothing model-checks TypeScript. Do not hand-model `preparePayload`. The check calls the real `preparePayload` on every reserved word against a cache that also contains that word as a name or an id. `resolveCachedId` is only the harness check that skipping the bypass would have changed the wire.

`verify-id-resolution` already checks `resolveCachedId` match stages and the `attack` ambiguity exit. This check is the bypass in `reservedIdValue` and the prize rewrite in `resolvedStationBaseId`.

## What the code at the sync commit does

`preparePayload` validates, runs `normalizeParsedPayload`, then `resolveCachedIdsForPayload`. That function asks `reservedIdValue` before `resolveCachedId`. A returned string is the wire value. `resolvedStationBaseId` runs only after a resolved POI, and only for `claim_prize` and `service_prize`. `reload` then runs `resolveReloadWeaponsAmmo`, which asks `reservedIdValue` again for each `weapons[].ammo_item_id`.

`reservedIdValue` (`src/payload.ts`):

- `storage_deposit` field `target`, kind `player`. Reserved when the trimmed lower text is `self`, `faction`, or `fixer:tab`, or starts with `faction:`, `station:`, or `pirate:`, or `isEmpireRecipientAlias` is true. `fixer:tab` is sent lowercased. Every other reserved target is sent trimmed, with the typed case kept. `Fixer:TAB` is `fixer:tab`. `SOLARIAN` stays `SOLARIAN`.
- Empire aliases: trim, lower, turn spaces and hyphens into `_`. A value that starts with `empire:` matches, including `empire:` alone and `empire:not-in-the-set`. Otherwise the normalized text must be in `EMPIRE_RECIPIENT_ALIASES`. At this commit that set is `solarian`, `solarian_confederacy`, `confederacy`, `voidborn`, `voidborn_collective`, `collective`, `crimson`, `crimson_pact`, `pact`, `nebula`, `nebula_trade_federation`, `trade_federation`, `outerrim`, `outer_rim`, `outer_rim_explorers`, `explorers`. `outer rim`, `outer-rim`, and `Outer Rim` stay the trimmed typed text.
- Item kind: trimmed lower `fuel` and `tank_fuel` are sent as `fuel` on every item field this check drives. Trimmed lower `credits` is sent as `credits` only on `storage_deposit`, `storage_withdraw`, `faction_deposit_credits`, and `faction_withdraw_credits`.
- `jump` fields `id` and `target_system`: when the trimmed text is non-empty and `Number.isFinite(Number(trimmed))`, the wire is that trimmed text. `90`, `1e2`, `0x10`, `+90`, `-0`, and `90.5` stay as typed after trim. The alias map sends `target_system` as `id` before the check, and `reservedIdValue` still recognizes both field names.

`resolvedStationBaseId`: kind `poi` and command `claim_prize` or `service_prize`. A non-empty string `hint.context.base_id` is the wire. The aliases `destination_base_id` and `target` are that station field. `prize_id` is not.

`resolveReloadWeaponsAmmo`: each `ammo_item_id` is an item. Reserved `fuel` stays `fuel`. Two items named `Iron` make `preparePayload` exit 1 and the error names `weapons[0].ammo_item_id`.

Bare `pirate` and `fixer:tab:extra` are not reserved. `haven`, `90a`, and `Infinity` are not numeric bearings. `credits` on `sell` and `buy` resolves. `travel` keeps the POI id. A prize POI with no `base_id` is sent as the POI id.

## When a change touches this

Run the check if a diff touches any of these:

- `reservedIdValue`, `isReservedStorageTarget`, `isEmpireRecipientAlias`, `isNumericJumpBearing`, `resolvedStationBaseId`, `resolveReloadWeaponsAmmo`, `resolveCachedIdsForPayload`, `EMPIRE_RECIPIENT_ALIASES` in `src/payload.ts`
- `COMMAND_ID_RESOLVER_RULES`, `idKindForCommandField`, `softIdResolutionPolicy`, or `STRICT_ID_RESOLUTION_POLICY` in `src/id-cache.ts`, when a probed field's kind or fuzzy rule changes
- aliases for the probed commands in `src/commands.ts`, `src/command-overrides-commerce-facility.ts`, `src/command-overrides-core.ts`, `src/command-overrides-battle-shipyard.ts`, or `src/command-overrides-faction-social.ts`

```bash
git diff fbd4f141c76d47fc638fc87120805a902195ebcc -- src/payload.ts src/id-cache.ts src/commands.ts src/command-overrides-commerce-facility.ts src/command-overrides-core.ts src/command-overrides-battle-shipyard.ts src/command-overrides-faction-social.ts
```

Replace that hash when the coverage record below moves.

A change only in `resolveCachedId` match stages is `verify-id-resolution`. A change only in hint extraction is not this check. Say so, and do not move the sync commit.

## Coverage

| What | Where |
| --- | --- |
| Reserved storage, fuel, credits, and numeric jump text | `reservedIdValue` and the helpers it calls, reached from `resolveCachedIdsForPayload` |
| Prize station sent as `context.base_id` | `resolvedStationBaseId` inside `resolveCachedIdsForPayload` |
| Nested reload ammo | `resolveReloadWeaponsAmmo` after `preparePayload` converts the weapons array |
| The cache would have changed the wire | `resolveCachedId`, called only so a removed bypass cannot pass quietly |

Sync commit: `fbd4f141c76d47fc638fc87120805a902195ebcc`. That commit is the product code this describes. The checker and this skill were written against it and do not change those functions. Move the hash only after the update procedure below, and only to a commit whose covered functions you have re-read. A passing run by itself is not that confirmation: a new reserved form the word lists never hit can still pass.

## Run

From the repo root, with Bun on `PATH` (confirmed with Bun 1.4.4; no other install):

```bash
bun run verify:reserved-ids
```

Pass prints `verify-reserved-ids: pass`, then the property, `preparePayload calls: 2210`, `catching calls: 2167`, and the word and tag counts. It finishes in under a second (477 ms on the run that recorded those counts). Exit 0.

Fail prints `verify-reserved-ids: fail` and exits 1. The next lines are the counterexample: phase, command, field, policy, query, expected wire, actual wire, and what `resolveCachedId` returned. Do not weaken the property or the bound to make a red run green. Do not change product behavior unless the user asked.

## Bounds and assumptions

2210 calls to `preparePayload`. 2167 of them are catching: `resolveCachedId` on the same query and cache would return something other than the expected wire, so deleting the bypass or the base-id rewrite fails the probe. The other 43 calls still assert the wire. They do not catch a removed bypass, and the failure note says so.

Four caches, each a temp `version: 1` hints file beside a temp session:

1. **name.** One hint per normalized key. The hint name is a trimmed sample of the typed word (so `-0` stays `-0`; `normalizeSearchText("-0")` is `" 0"`, and storing that already-normalized key would miss on the second normalize). The hint id is a foreign id: `cached-player:<key>`, `bearing:<key>`, `cached-item:<key>`, or `credit_chit` when the key is `credits`. Extra hints: `pirate`, `fixer:tab:extra`, `Haven`, `90a`, `Infinity`, POI `sol_earth` / Earth with `base_id` `earth_station`, POI `nova` / Nova, two items named Iron, and `laser_cell` / Laser Cell.
2. **id.** The name hint plus a second hint whose id is the trimmed sample, so the word is also a cached id. Skipping the bypass is ambiguous and `preparePayload` exits 1, which is not the reserved wire. Marlowe is on this cache too, and still resolves, so an empty cache cannot pass the live-cache boundary.
3. **prefix.** Longer names only: `Station:Explorer`, `station:earth_station_fan`, `faction:smc`, `pirate:vossren`, `selfish`, `empire:solarian`, Marlowe, and system `90 Eridani` / `90_eridani`. Queries are `station:e`, `station:earth`, `faction:s`, `pirate:vo`, `self`, `empire:sol`, and jump `90`. Fuzzy catches. Strict does not prefix-match, so those strict calls do not catch a removed bypass.
4. **catalog.** One item, `fuel_cell` / Fuel Cell. Fuzzy `fuel` is a soft substring and catches. Strict `fuel` does not. `tank_fuel` catches on both policies because the wire must be `fuel`.

Storage words (314), every one under strict and fuzzy, on both the name cache and the id cache. `storage_deposit` payload `{ target, credits: '1' }`. The checker reads `EMPIRE_RECIPIENT_ALIASES` from `src/payload.ts` and builds:

- `self`, `faction`, `fixer:tab`, each as typed, uppercased, wrapped in spaces, and wrapped in a tab and newline, plus `Fixer:TAB` and ` Fixer:TAB `
- `faction:`, `station:`, and `pirate:` with tails empty, `a`, `smc`, `voss`, `earth_station`, `Earth_Station`, `Explorer`, `grand_exchange_station`, each decorated the same way, plus `Station:Earth_Station`, `Station:Explorer`, `Pirate:Voss`, `Faction:SMC`
- every empire alias, decorated; when the alias contains `_`, also the spaced form, the hyphenated form (decorated), a double-space form, and title case
- `empire:<alias>` decorated, plus `empire:`, `Empire:Solarian`, `empire:not-in-the-set`, `empire:Outer Rim`, `Empire: Outer Rim`

The same words through the `recipient` alias, for `self`, `Fixer:TAB`, `solarian`, `outer rim`, `station:earth_station`, `empire:solarian`, and `pirate:voss`. One target array: `self`, `Solarian`, `fixer:tab`, ` outer rim `, `Fixer:TAB`.

Jump words, on `target_system` and on `id`, strict and fuzzy, name cache and id cache: `0`, `-0`, `00`, `90`, `-1`, `-90`, `+90`, `  +90  `, `90.0`, `90.5`, `.5`, `5.`, `1e2`, `1E2`, `1e-2`, `1.5e1`, `0x10`, `0X10`, `  90  `, a tab-and-newline `90`, and `9007199254740993`. Expected wire is `word.trim()`.

Fuel words on every item command below, both policies, both caches: `fuel`, `Fuel`, `FUEL`, ` fuel `, `tank_fuel`, `Tank_Fuel`, `TANK_FUEL`, ` tank_fuel `. Expected wire is `fuel`. One `sell` array of `fuel`, `tank_fuel`, `Fuel`, ` tank_fuel `.

Credit words on the four credit commands, both policies, both caches: `credits`, `Credits`, `CREDITS`, ` credits `. Expected wire is `credits`.

Item commands, with the aliases `preparePayload` applies (`item_id` stays on storage and orders; `sell` / `buy` / `use_item` / `jettison` send `id`; `load_drone` sends `id` from `drone_item_id`; top-level `reload` sends `target` from `ammo_item_id`):

`sell`, `buy`, `use_item`, `jettison`, `storage_jettison`, `storage_deposit`, `storage_withdraw`, `storage_loot`, `loot_wreck`, `create_sell_order`, `create_buy_order`, `faction_create_sell_order`, `faction_create_buy_order`, `load_drone`, `reload`, `faction_deposit_credits`, `faction_withdraw_credits`.

Reload, name cache only: a weapons array of `tank_fuel` and `fuel`; the same array with Laser Cell in the middle; a JSON string of weapons; two items named Iron, which must exit 1. Catalog cache: weapons ammo `fuel`.

Prize, name cache. Commands `claim_prize` and `service_prize`, fields `destination_base_id` and `target`. Queries `Earth`, `earth`, `EARTH`, `sol_earth`, `SOL_EARTH`, `Earth_Station` catch on both policies. `Ear`, `ear`, `sol`, `sol_e` catch on fuzzy only. Expected wire is `earth_station`. Arrays of `Earth`, `sol_earth`, `Earth_Station` too. ` earth_station ` is asserted and does not catch: `resolveCachedId` trims, and an exact base id is returned as that trimmed text, which is already `earth_station`.

The name phase runs the first two prize probes (`claim_prize` `destination_base_id` `Earth`, strict then fuzzy) before the storage words. A missing base-id rewrite fails on call 1. A missing `reservedIdValue` still passes those two calls and fails on `storage_deposit` `target` `self`.

Boundaries that must still resolve, so a cache that was never read cannot pass: `pirate` → `player-pirate`, `fixer:tab:extra` → `player-fixer-extra`, jump `haven` → `crosshaven`, `90a` → `sys-90a`, `Infinity` → `sys-infinity`, `sell` and `buy` `credits` → `credit_chit`, `travel` Earth → `sol_earth`, fuzzy `travel` Ear → `sol_earth`, prize Nova → `nova`, Marlowe on the id cache and the prefix cache, Fuel Cell → `fuel_cell`.

Grouped commands are not flat entries in the default registry. The checker passes `{ commands: COMMANDS }` into `normalizeParsedPayload` and `preparePayload`, which is the flat action config `GroupedApiCommandHandler` passes for one action.

Assumptions:

- Payloads are strings, string arrays, or a weapons array / JSON array string. Non-string item ids are not enumerated.
- `seenAt` is the same on every hint. Tie-breaking is not this property.
- `base_id` values in the cache are strings. A numeric or boolean `base_id` is not used by `resolvedStationBaseId` and is not enumerated.
- The copied `normalizeSearchText` only builds hint names. Every catching probe then calls the real `resolveCachedId`. A copied normalizer that stores a name the real resolver misses fails as a modeling error.
- The startup guard requires the seven function names above to still appear in `src/payload.ts`, and every generated storage word to match the pinned predicate transcribed from `isReservedStorageTarget`.

## Read a failure

The actual line is what `preparePayload` put on the wire, or the exit it returned.

It is a bug when the query is one of the reserved words or prize queries above and the actual line is a cached player, item, system, or POI id. Report the command, the field, the typed text, and the id that was sent. These two scratches are bugs of that shape:

- `reservedIdValue` returns immediately. First failure: `name storage_deposit target strict "self"`, expected `self`, actual `cached-player:self`.
- `resolvedStationBaseId` returns `resolved.value` immediately. First failure: `name claim_prize destination_base_id strict "Earth"`, expected `earth_station`, actual `sol_earth`.

Do not change product code unless the user asked. Do not edit the expected wire so the current code passes.

It is a modeling error when the line starts with `modeling error:`:

- The cache does not contain the word as a different id, so skipping `reservedIdValue` would already produce the expected wire. Fix the hint. A hint name must be the trimmed typed sample. Storing `normalizeSearchText` of that sample fails for `-0`, because the normalizer turns the leading hyphen into a leading space and a second normalize trims it away.
- An alias was dropped or the wire field changed, so `idKindForCommandField` is not the kind `reservedIdValue` sees. Point `outputField` at the new field. Keep `{ commands: COMMANDS }` for grouped actions.
- `EMPIRE_RECIPIENT_ALIASES` moved or the seven function names were renamed. Re-read `src/payload.ts` before trusting the check. A new alias is picked up by the regex; the wire rule stays "trimmed typed text". If that wire rule changed, the disagreement is a bug, not a reason to edit `expectedStorageWire` until the update procedure says the change is intended.

## Update the check when the change is intended

1. Re-read `preparePayload`, `resolveCachedIdsForPayload`, `reservedIdValue`, `isReservedStorageTarget`, `isEmpireRecipientAlias`, `isNumericJumpBearing`, `resolvedStationBaseId`, and `resolveReloadWeaponsAmmo` at the new commit. Write down each new reserved form, wire rule, or prize exception.
2. Edit `scripts/verify-reserved-ids.ts` from that reading. `expectedStorageWire`, `pinnedStorageReserved`, and `pinnedNumericBearing` are the promise. `storageWords`, `JUMP_WORDS`, `FUEL_WORDS`, `CREDIT_WORDS`, and the prize query list are the bound. Change the property only when the product change says so (the code comment, a test, `CHANGELOG.md`, or the commit message). Record the old sentence and the new sentence, and cite that evidence.
3. Run `bun run verify:reserved-ids`.
4. Break the real code twice, then put it back. In `reservedIdValue`, return `undefined` before the storage check. Run the command and confirm the `self` → `cached-player:self` failure above. Restore that function. In `resolvedStationBaseId`, return `resolved.value` before the `base_id` read. Run the command and confirm the `Earth` → `sol_earth` failure above. Restore `src/payload.ts` with the inverse edit, or `git restore src/payload.ts` only. Do not restore `package.json`. Run once more and confirm `verify-reserved-ids: pass`. `git diff -- src/payload.ts` is empty.
5. Move the sync commit in this skill to that commit only after steps 1–4. If step 1 found a reserved form the checker still does not drive, do not move the hash. Either extend the checker or leave the hash and say what is unconfirmed.

## What a pass does not cover

A pass covers the 2210 calls above. It does not cover `resolveCachedId` match stages (`verify-id-resolution`), hint extraction, `attack` ambiguity, `find_route` numeric text, `service_prize` `item_id`, object entries in a bulk `items` array, non-string payload values, numeric or boolean `base_id`, or `faction:` / `station:` / `pirate:` / `empire:` tails and numeric strings outside the lists. Strict prefix-only probes, strict `fuel` against Fuel Cell, and the exact base-id spelling `earth_station` (including surrounding spaces) stay in the run and do not catch a removed bypass.
