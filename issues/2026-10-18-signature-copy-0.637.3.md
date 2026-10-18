# Docs issues

Complaints about OpenAPI gaps and documentation lag that affect the SpaceMolt CLI.

No live server responses were collected. Nothing below invents a response body.

## 2026-10-18 — Signature copy (gameserver 0.637.3)

Scope: human copy for `unknown_signature` and `signature_detected` only. Cached sources: `spacemolt-docs/openapi.json` (`info.x-gameserver-version` is `v0.637.3`), `spacemolt-docs/changelog.json` release `0.637.3`, `spacemolt-docs/api.md`, `spacemolt-docs/skill.md`, `spacemolt-docs/ws.md`, `spacemolt-docs/docs/scanning.md`. Bundled CLI metadata stamp is `GENERATED_API_GAMESERVER_VERSION = 'v0.637.3'` in `src/generated/api-commands.ts`. No live call. No `generate:api`.

Changelog `0.637.3` (2026-10-18), the only note in that release:

> Improved schema description accuracy on `unknown_signature` and `signature_detected`.

### 1. `GetNearbyResponse.unknown_signature` has a type and no description

`components.schemas.GetNearbyResponse.properties.unknown_signature` in `spacemolt-docs/openapi.json`:

```json
{ "type": "boolean" }
```

It is not in `required`. The property has no `description`.

`POST /api/v2/spacemolt/scan` `description` still says:

> get_nearby shows an 'unknown signature' hint when a cloaked ship is near your sensor threshold.

`spacemolt-docs/docs/scanning.md` "Area Sweeps" says the same ship-only rule:

> `get_nearby` gives you the tell: when a cloaked ship is close to your sensor threshold, it shows an **unknown signature** hint — evidence that something is there, without saying what.

`V2Location.unknown_signature` (quoted in item 3) says a cloaked ship or a cloaked creature. The GetNearby field itself says neither.

CLI assumption: `unknown_signature === true` on a `get_nearby` body prints `Unknown cloaked signature (not identified).` Any other value, including `false`, prints nothing. The line does not name a ship or a creature and does not say to run `scan`. The area-scan sentence from `V2Location` and `TravelResponse` is not copied onto this empty field.

### 2. `SubscribeObservationResponse` and `Notification_observation_update` also have an empty `unknown_signature`

`SubscribeObservationResponse.properties.unknown_signature` and `Notification_observation_update.properties.unknown_signature` are each `{ "type": "boolean" }` with no `description`. Both schemas list `unknown_signature` in `required`, unlike `GetNearbyResponse` and unlike the "omitted when false" fields in item 3 and item 4.

`spacemolt-docs/ws.md` observation_update table:

> | `unknown_signature` | boolean | Whether a faint cloaked-ship signature is present at the watched POI |

That sentence is ship-only and says "faint". It does not say "one sensor level", "presence only", or "cloaked creature".

`POST /api/v2/spacemolt/subscribe_observation` `description` names "the unknown_signature hint" on the baseline snapshot and does not define the boolean.

CLI assumption: the snapshot uses the same presence line as `get_nearby`, and only when the value is exactly `true` (`false` is required by the schema and stays silent). An `observation_update` headline keeps the existing suffix `unknown signature` for exactly `true` and adds nothing for `false`. That suffix is not rewritten to the table sentence and is not a `scan` instruction. `cloaked_resolved` / `cloaked_lost` stay the only named cloaked contacts, and only when the server sends those arrays.

### 3. `V2Location` and `TravelResponse` describe the same flag with different thresholds

`V2Location.properties.unknown_signature.description`:

> True when a cloaked ship or cloaked creature at this POI is near your sensor threshold. Presence only — run an area scan (scan with no target_id) to resolve a ship; a creature resolves only with a sensor rating a full level above its cloak (omitted when false)

`TravelResponse.properties.unknown_signature.description`:

> True when a cloaked ship or cloaked creature at the arrival POI is within one sensor level of your scanner: presence only. Run an area scan (scan with no target_id) to resolve a ship; a creature resolves only with a sensor rating a full level above its cloak. Omitted when false.

"Near your sensor threshold" is not the same phrase as "within one sensor level of your scanner". Neither description says "10 power". `signature_detected` does (item 4). The travel `200` example sets both `structuredContent.details.unknown_signature` and `structuredContent.location.unknown_signature` to `false`, so the spec allows both keys on one envelope and does not say they are duplicates.

`POST /api/v2/spacemolt/travel` `description` says arrival `online_players` lists ships "exactly as get_nearby does (offline players included, cloaked ships never)." It does not mention `unknown_signature`.

CLI assumption: one shared table sentence, `Unknown cloaked signature (not identified).`, with no threshold and no `Run: scan`. `get_location`, `get_status`, and `get_state` help quote the `V2Location` sentence (near the sensor threshold; area scan with no `target_id` resolves a ship; a creature needs a sensor rating a full level above its cloak). `get_status` help also says `--summary` does not print the line. `travel` help quotes the `TravelResponse` sentence (within one sensor level; same resolution clause). Travel table output reads `details.unknown_signature` only. It does not copy `location.unknown_signature` onto the arrival line. `get_location` / `get_status` / `get_state` keep reading `location.unknown_signature`. `get_nearby` and `subscribe_observation` help do not quote the `V2Location` sentence.

### 4. `signature_detected` is described; the prose around it still is not

`ScanResponse.properties.signature_detected.description` and `FactionScanPOIResponse.properties.signature_detected.description` are the same:

> True when a cloaked ship or cloaked creature is within one sensor level (10 power) below detection: sensed but not resolved. Omitted when false.

`ScanResponse.properties.poi_id.description` says `poi_id` is present only for a remote POI scan. `signature_detected` has no such restriction. `spacemolt-docs/api.md` `scan_result` says a remote POI scan "adds `poi_id`, `scan_power`, `signature_detected`, `contacts[]`, `npcs[]`, `pirates[]`, and `leviathans[]`." That list reads as if `signature_detected` were remote-only. The schema does not say that.

`POST /api/v2/spacemolt/scan` `description`:

> Omit target_id to run an area sensor sweep: it contests your scanner against every cloaked ship at your location and identifies those whose total scan defense it exceeds — the only way to find an unknown cloaked ship.

`POST /api/v2/spacemolt/subscribe_observation` also says `active_scan:true` "resolves cloaked ships (the same contest as the scan command)". That contradicts "the only way". `spacemolt-docs/docs/scanning.md` repeats the ship-only sweep and, under Cloaking:

> A scanner must beat your total defense by 10 to resolve your name; anywhere from 10 below to 9 above it registers only an unknown signature.

The "9 above" band is not in either `unknown_signature` description or in `signature_detected`. The same page says "Fauna doesn't cloak, so creature scans always succeed", which contradicts "cloaked creature" on both flags.

`spacemolt-docs/skill.md` Combat:

> `scan(target_id?)` -- Scan a target, or sweep the area for cloaked ships when no target is given **Mutation.**

`skill.md` does not mention either flag.

`ScanResponse.properties.swept` is `{ "type": "boolean" }` with no description. The scan `200` example sets every `ScanResponse` property, including `poi_id` `"36_ophiuchi_belt"`, `target_id` `"abc123"`, `signature_detected` false, and `swept` false. That example is a filled placeholder, not an area-sweep body.

CLI assumption: when `signature_detected === true`, scan and `faction scan_poi` table output print `Cloaked signature sensed, not identified (10 power below detection).` The "10 power" words are the schema's definition of the flag, not a number read from the body. The line does not name a ship or a creature, does not invent a target id, and is not the `Target:` row. `false` and an omitted field print nothing. The CLI does not apply the "9 above" band, does not treat wildlife as unable to cloak, does not tell the pilot the sweep is guaranteed to identify the contact, and does not branch on `swept`. A scan body the existing Scan Result formatter already accepts prints the line even when `poi_id` is absent. The non-remote `scan` branch treats `target_id` `""` and `null` as present (`=== undefined` is the decline check), prints the line, and prints no `Target:` row. Those clauses are `scan` help only. `FactionScanPOIResponse` has no `target_id`, and `emitFactionScanPoi` never prints `Target:`. `faction_scan_poi` help stops at `false and an omitted field print nothing.` and does not mention `target_id` or a `Target:` row. A body the scan formatter declines (`target_id`, `username`, and `ship_class` all `=== undefined`, and no native `poi_id`) with `signature_detected === true` prints only `Cloaked signature sensed, not identified (10 power below detection).` on table and text output. That is a CLI display choice. `ScanResponse.required` still includes `target_id`, so this body is not a documented area-sweep example and the CLI does not invent the missing fields. The same decline with the flag false, omitted, or non-boolean stays on the generic response dump. `""` and `null` are not that decline.

### 5. `api.md` puts `unknown_signature` on an `ok` arrival; `Notification_ok` does not have the field

`spacemolt-docs/api.md` Server Messages, `ok`:

> arrived: `poi`, `poi_id`, `online_players[]` (NearbyPlayer entries, the same list `get_nearby` returns), `online_players_count`, `online_players_truncated`, `offline_collapsed`, `unknown_signature?`

`components.schemas.Notification_ok.properties` are `action`, `arrival_tick`, `base`, `base_id`, `destination`, `message`. There is no `unknown_signature`. The travel command result that does have the field is `TravelResponse`, under `structuredContent.details`, not this notification schema.

CLI assumption: `previewOk` in `src/notification-format-shared.ts` is unchanged. An `ok` frame does not grow a signature line. Travel table output uses `details.unknown_signature` on the command result.
