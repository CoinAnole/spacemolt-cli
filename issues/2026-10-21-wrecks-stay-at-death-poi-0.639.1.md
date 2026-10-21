# Docs issues

Complaint about an OpenAPI and prose gap for wreck and carcass placement. This is an upstream docs change request, not a CLI bug.

No live server responses were collected. Nothing below invents a response body. `LIVE_API_SYNC` was not set. `generate:api` was not run.

## 2026-10-21 — Wrecks stay at the death POI (gameserver 0.639.1)

Scope: where a wreck or creature carcass is left, whether pirate salvagers are told about a hidden-POI wreck, and the creature kill message that says "an uncharted location". Cached sources: `spacemolt-docs/openapi.json` (`info.version` `2.0.0`, `info.x-gameserver-version` `v0.643.3`), `spacemolt-docs/changelog.json` (`current_version` `0.643.3`, release `0.639.1` dated 2026-10-20, still on page 1), `spacemolt-docs/api.md`, `spacemolt-docs/ws.md`, `spacemolt-docs/skill.md`, `spacemolt-docs/docs/wrecks.md`, `spacemolt-docs/docs/wildlife.md`. Bundled CLI metadata stamp is `GENERATED_API_GAMESERVER_VERSION = 'v0.643.3'` in `src/generated/api-commands.ts`. No live call.

Changelog `0.639.1` (2026-10-20), all four notes:

> Wrecks and creature carcasses now stay at the POI where the ship or creature died, also at a hidden POI. They no longer appear at the nearest charted POI.
>
> Pirate salvagers never get a salvage report for a wreck at a hidden POI, so they do not fly there and pirate radio does not name it.
>
> The creature kill message names the carcass POI only if you charted it. Otherwise it says "an uncharted location".
>
> Captured ships are unchanged: a captured ship still appears at the nearest charted POI.

No cached OpenAPI string, and no cached prose page, states those four notes together. Nothing in the cached spec says a wreck moves to the nearest charted POI. The nearest-charted sentences that do exist are prize placement, and they match the fourth note. The gap is omission after `0.639.1`, still present at docs stamp `v0.643.3`.

### 1. `POST /api/v2/spacemolt_salvage/wrecks` still only says "current POI"

`paths["/api/v2/spacemolt_salvage/wrecks"].post.summary`:

> List all wrecks at your current POI

`paths["/api/v2/spacemolt_salvage/wrecks"].post.description`:

> Wrecks contain cargo and modules from destroyed ships. Each module in the response includes its name, type, and instance ID. Ship and pirate wrecks persist indefinitely until looted or salvaged. Jettison containers despawn after 10 minutes; their cargo settles back into any matching deposit at the POI.

That description does not say a wreck or carcass stays at the death POI, does not say a hidden POI is included, does not say the old nearest-charted placement stopped, and does not mention pirate salvagers or a kill message. The same summary is what `generateApiRoutes` keeps. `src/generated/api-commands.ts` stores only:

```ts
'POST /api/v2/spacemolt_salvage/wrecks': {
  operationId: 'spacemolt_salvage_wrecks',
  summary: 'List all wrecks at your current POI',
  route: { tool: 'spacemolt_salvage', action: 'wrecks', method: 'POST' },
  schema: {},
}
```

The operation `description` is not on `GeneratedApiRoute`. `Operation` in `src/openapi-metadata.ts` has `summary` and no `description` field. `generateApiRoutes` assigns `summary: operation.summary` and drops the operation description. Quoted only to show the CLI metadata is not hiding a spec sentence that is not in the summary. The missing rules are absent from the spec text itself.

`components.schemas.GetWrecksResponse` is `{ wrecks, count }`, both required, `additionalProperties: false`. It has no `message`. `components.schemas.EnrichedWreck.properties.poi_id` and `system_id` are required strings with no `description`. `poi_id` is not documented as the death POI, hidden or otherwise. `EnrichedWreck.properties.ship_name.description` mentions creature carcasses only as wrecks that were never a named ship. `paths["/api/v2/spacemolt/hunt"].post.description` says "Killing a creature drops a carcass wreck you can loot" and does not say where the carcass stays.

`spacemolt-docs/docs/wrecks.md` says a wreck "appears at the POI where it was destroyed" and that `get_wrecks` "lists every wreck at your current POI". `spacemolt-docs/docs/wildlife.md` says a killed creature "drops a carcass wreck at the site". `spacemolt-docs/skill.md` under Salvage & Towing (line 444) lists `` `get_wrecks()` -- List all wrecks at your current POI ``. The same one-liner is `spacemolt-docs/api.md` line 905, under Salvage & Towing. A second `skill.md` block, "Salvage and Wrecks" (lines 980–985), says "Wrecks stay in-system indefinitely" and comments `get_wrecks() # List wrecks in current system`. "Current system" is a wider scope than the current POI. None of those sentences mention a hidden POI, a salvager report, or "an uncharted location". They also do not say the wreck moves.

CLI quote, only to show the client is not the source of a relocation claim: the curated `get_wrecks` description in `src/command-overrides-query-reference.ts` begins "List wrecks and jettison containers at the current POI" and never says "nearest charted". It does not state the `0.639.1` hidden-POI rule either. That silence matches the spec. It is not a client contradiction of a documented server rule.

Please put the stay-at-death rule, including a hidden POI, and the explicit end of nearest-charted wreck placement, on the wrecks operation description (and on `EnrichedWreck.poi_id` if that property is the death POI). Please say the same for a carcass on the hunt operation, `docs/wrecks.md`, and `docs/wildlife.md`. Please update both `skill.md` `get_wrecks` sites: Salvage & Towing line 444, and "Salvage and Wrecks" lines 982–985, including the sentence "Wrecks stay in-system indefinitely" and the comment `get_wrecks() # List wrecks in current system` (that comment names the system, not the POI). Please update `api.md` line 905, the Salvage & Towing index one-liner `get_wrecks()` -- List all wrecks at your current POI, so that index stays aligned with the wrecks operation. Do not describe wrecks with the prize sentence below. Those prose edits are upstream. They are not a CLI change.

### 2. No schema describes a pirate salvager report, or its absence

A search of every string in `spacemolt-docs/openapi.json` finds zero occurrences of `salvager`.

`components.schemas.Notification_pirate_radio.properties.source_poi.description`:

> POI ID from which the transmission originated. Empty when no POI can be resolved or the POI is hidden (uncharted POIs are never named on the radio).

`spacemolt-docs/ws.md` says the same for `source_poi`: empty when unresolved or hidden, and "the radio never names an uncharted POI". That is a naming rule for a transmission that exists. Changelog `0.639.1` says pirate salvagers never get a salvage report for a hidden-POI wreck, so they do not fly there, and that pirate radio does not name it. The spec does not say the report is omitted, does not name the report's event or schema, and does not say salvagers do not travel to that wreck.

Please document the withheld salvage report as its own rule: no report for a wreck at a hidden POI, salvagers do not fly there, and radio does not name that POI. If the withheld report is `pirate_radio` with an empty `source_poi`, say so. If it is a different event that is not sent at all, name that event and say it is omitted. Do not leave "empty source_poi" as the only sentence.

### 3. "an uncharted location" is not the creature kill message in this spec

The exact phrase `an uncharted location` occurs three times in `spacemolt-docs/openapi.json`, none of them a kill:

- `DistressSignalResponse.properties.poi_name.description`: for a hidden POI it is "an uncharted location": the broadcast never names a hidden POI.
- `paths["/api/v2/spacemolt/distress_signal"].post.description`: from a hidden POI the broadcast gives the system and calls the location "an uncharted location", and `poi_name` in the response says the same.
- `ShipmentTrackingEvent.properties.poi_id.description`: absent when the location has no POI or the POI is hidden (the transponder gives only `system_id` for an uncharted location).

There is no `creature kill` string. Notification schemas include `Notification_player_kill`, `Notification_player_died`, and `Notification_pirate_destroyed`. There is no creature-kill or carcass-kill notification schema. `HuntResponse` is a `oneOf` of `AttackNPCResponse` and `AttackPlayerResponse` and is not documented here as carrying the kill message. `GetWrecksResponse` has no message property.

What the kill notifications do say is field omission, not the phrase. None of the descriptions below contains "an uncharted location". All three omit the POI when it is hidden from the recipient. The wording is not one shared sentence.

`Notification_player_kill.properties.wreck_poi_id.description` and `Notification_pirate_destroyed.properties.wreck_poi_id.description` are the same:

> POI the wreck was left at — combat is system-scoped, so this can differ from the killer's POI (omitted when no wreck or the POI is hidden from the recipient).

`Notification_player_died.properties.wreck_poi_id.description` is different:

> POI where the wreck was left. Omitted when there is no wreck or the POI is hidden from the recipient.

`Notification_player_kill.properties.wreck_poi_name.description` and `Notification_pirate_destroyed.properties.wreck_poi_name.description` are:

> Display name of the wreck's POI (omitted when unknown or hidden from the recipient).

`Notification_player_died.properties.wreck_poi_name.description` drops the possessive and splits the omission into its own sentence:

> Display name of the wreck POI. Omitted when unknown or hidden from the recipient.

`spacemolt-docs/ws.md` under `player_kill` adds a prose line the schema description does not: "The wreck stays where the victim died, and the `wreck_*` location fields name that place." The field table still says `wreck_poi_id` is omitted when the POI is hidden from the recipient. `spacemolt-docs/api.md` `player_kill` says `wreck_poi_id` "is withheld for a hidden POI you have not charted." `spacemolt-docs/skill.md` says `pirate_destroyed` carries "any POI you are allowed to see" and to fly there when `wreck_poi_id` is present. None of those pages say the creature kill message uses "an uncharted location", and none name the property that would hold that sentence.

Those omission rules can be true at the same time as a separate message string. The spec never defines that string for a kill. Please add the creature kill message to the schema that actually returns it: name the property, say it names the carcass POI only when that POI is charted, and say the uncharted text is exactly "an uncharted location". Please do not leave readers to reuse the `distress_signal` `poi_name` sentence. Please also say whether player-ship and pirate wrecks use that same message or only omit `wreck_poi_name`. The changelog sentence is the creature kill message only. `ws.md` already says a player wreck stays where the victim died; it still does not mention the phrase.

### 4. Nearest-charted placement is the prize rule, and it should stay the prize rule

`components.schemas.CaptureLogEntry.properties.prize_poi_id.description`:

> POI where the prize sits: the captor's POI at the moment of capture (the battle origin when the captor has no POI). A captured ship never lands at a hidden POI; it goes to the nearest charted POI in the system. Omitted when there is no prize or no POI is known, and when the POI is hidden (only in a system with no charted POI).

`Notification_ship_captured.properties.prize_poi_id.description` has the same nearest-charted sentence and a shorter omission clause ("Omitted when there is no prize or no POI is known"). `spacemolt-docs/api.md` `ship_captured`, `spacemolt-docs/ws.md` `prize_poi_id`, `spacemolt-docs/guides/boarding.md`, and `spacemolt-docs/skill.md` boarding text say the same thing about intact prizes. That matches changelog `0.639.1` note 4. A search of `nearest charted` in `openapi.json` hits only those two `prize_poi_id` descriptions.

Please do not copy the prize sentence onto wrecks, carcasses, or `get_wrecks`. Please do not delete it from `prize_poi_id`. The two rules are different on purpose. The `CaptureLogEntry` omission clause (hidden, and only when the system has no charted POI) is narrower than the `Notification_ship_captured` clause (no prize, or no POI known). That difference is older than this complaint. This request does not ask to collapse it. It asks that wrecks not inherit either sentence.
