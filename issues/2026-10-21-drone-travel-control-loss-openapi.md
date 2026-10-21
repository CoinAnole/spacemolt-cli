# OpenAPI complaint: drone travel control loss (gameserver 0.643.1)

Date checked: 2026-10-21. Cached spec only. Live server captures were not collected. `LIVE_API_SYNC` was not set. The live gameserver was not contacted. `bun run generate:api` was not run. The docs submodule was not fetched.

## Versions that were actually on disk

| Source | Value |
|---|---|
| `spacemolt-docs/changelog.json` `current_version` | `0.643.3` |
| `spacemolt-docs/openapi.json` `info.x-gameserver-version` | `v0.643.3` |
| `spacemolt-docs/openapi.json` `info.version` | `2.0.0` (API generation, not the gameserver) |
| `src/generated/api-commands.ts` `GENERATED_API_GAMESERVER_VERSION` | `v0.643.3` (file header says the same) |
| `spacemolt-docs/catalog.json` `version` | `0.643.3` |

The 0.643.1 note is still the gameserver behavior. The cached spec and generated CLI metadata are two releases later (`0.643.2`, `0.643.3`) and still omit it. `0.643.2` and `0.643.3` notes are pirate flagships and TLS. They do not revise the drone note.

## Changelog sentence (0.643.1, release_date 2026-10-20)

> Drones that lose control during travel now remain visible at their departure location. Recall them there, or restore control by refitting enough drone-bay bandwidth.

## What a full-text walk of `spacemolt-docs/openapi.json` contains

Walk of every string in the parsed spec, rechecked 2026-10-21. An earlier draft of this complaint reported `departure` and `adrift` as 0. That count was wrong. The walk below is the one to trust.

| Needle | Hits |
|---|---|
| `lose control` (case-insensitive substring) | 0 |
| `lost control` (case-insensitive substring) | 0 |
| `during travel` (case-insensitive substring) | 0 |
| `drone-bay` (case-insensitive substring) | 0 |
| `\bdeparture\b` | 10, none on the recall operation or `Notification_drone_adrift` |
| `\badrift\b` | 2, neither is a drone |
| `drone_adrift` (identifier) | 2, both type names, no travel-loss prose |

The 10 `departure` strings are other mechanics:

- `FactionMobileBaseResponse.position` and `system_id`: coordinates held at departure during isolated jumping; read `origin.system_id` for the departure system.
- `MobileBaseInfo.current_position`, `current_system_id`, and `origin`: same isolated-jumping wording.
- `MobileBaseState.origin`: "Departure system and AU coordinates".
- `Notification_observation_update.arena_npcs_changed` and `arena_npcs_departed`: a knockout is hull 0, not a departure from the watched POI.
- `POST /api/v2/spacemolt/subscribe_observation` description: "A knockout is a change, not a departure".
- `POST /api/v2/spacemolt/unload_passenger` description: a layover about to miss its deadline sends a "departure-board warning". Passenger delivery, not a drone.

The 2 `adrift` prose strings:

- `PrizeRecoveryInfo.prize_crew_fit`: "Zero means it is adrift and cannot move".
- `POST /api/v2/spacemolt_facility/dismantle_outpost` description: the caller is "set adrift at the outpost's point of interest".

None of those 12 strings is the 0.643.1 drone travel-loss rule. `POST /api/v2/spacemolt_drone/recall` and `components.schemas.Notification_drone_adrift` still omit it. Help text does not depend on these counts.

`drone_adrift` occurs twice, both as a type name, with no travel-loss prose:

- `components.schemas.MCPNotification.properties.msg_type.description` lists `drone_adrift` among frames that route to `system`. The sentence is: "Frames not named here also route to system - that includes battle_damage / drone_scan / drone_survey / drone_adrift / action_result / action_error / error / server_restart_warning. A types=combat filter does not carry them."
- `components.schemas.NotificationPayload.anyOf[18].$ref` = `#/components/schemas/Notification_drone_adrift`.

## Schema and operation paths that are missing the 0.643.1 sentence

### `components.schemas.Notification_drone_adrift`

`additionalProperties: false`. Properties, each `{ "type": "string" }` and nothing else (no `description`):

- `drone_id`
- `drone_type`
- `owner_id`
- `poi_id`
- `system_id`

`required`: `drone_id`, `owner_id`, `drone_type`, `system_id`, `poi_id`.

Missing from this schema:

- Any property that distinguishes "lost control during travel" from a bandwidth loss while the drone is already at a POI (bay swap, undock, station Drone Control bonus dropping).
- Any description on `poi_id` that says a traveling drone stops at its departure POI and that this `poi_id` is that place.
- Any description that says the owner recalls at that POI, or restores control by refitting drone-bay bandwidth.

`ws.md` already has that prose. The schema does not.

### `paths./api/v2/spacemolt_drone/recall.post`

- `operationId`: `spacemolt_drone_recall`
- `summary`: `Recall a deployed drone back to your bay`
- `description`: `Use all: true to recall all drones at your current location, or specify drone_id. Frees up bandwidth. Drone is returned to bay (not cargo).` Plus the example `{"all":true}` and the mutation rate-limit sentence.
- Request `properties.all.description`: `Set to true to recall all drones at your current location`
- Request `properties.id.description`: `ID of a specific drone to recall` (`x-positional-index`: 0). The body field is `id`. There is no request field named `drone_id`.

Missing from summary, description, and both property descriptions:

- A drone that loses control during travel stays visible at the departure location.
- Recall of that drone happens at that departure POI.
- Refitting enough drone-bay bandwidth restores control.
- Any statement that `id` is limited to the caller's current location. Only `all` carries "at your current location". The 0.643.1 changelog says to recall the stranded drone there. The operation description's "or specify drone_id" does not say where the caller must be.

### `components.schemas.RecallDroneResponse`

Properties: `message` (string), `recalled` (integer), `skipped` (integer). All three required. No descriptions. No location, departure, or bandwidth fields. 0.643.1 did not add a response field here, and the schema has no place a client could read "this drone was stranded at the departure POI" from the recall result.

### Sibling operations checked, same gap

- `paths./api/v2/spacemolt_drone/get.post` summary: `Get full details for a specific drone including script and memory`. Description: `Returns the drone's full script source, memory register, cargo, and current status.` Request `id.description`: `ID of the drone to inspect`.
- `components.schemas.GetDroneResponse` includes `poi_id`, `system_id`, `status` (free string, no enum), `travel_ticks`, `travel_to`. None of those properties have descriptions. `status` is not documented as `adrift`. `travel_to` is not documented as cleared when control is lost mid-hop.
- `paths./api/v2/spacemolt_drone/deploy.post` describes bandwidth skip on `all: true`. It does not describe later loss of control during travel.
- `paths./api/v2/spacemolt_drone/list.post` description: `Returns bay count and capacity, deployed count, bandwidth usage, and a summary of every drone you own.`
- `components.schemas.DroneInfo.status` is a free string. `x-display.next_actions` is `deploy id={id}` and `recall id={id}`. No adrift or departure text.
- `components.schemas.DroneBayView` describes `bandwidth_used` / `bandwidth_total` as totals only.

## Generated CLI metadata matches the spec, including the omission

`src/generated/api-commands.ts` route `POST /api/v2/spacemolt_drone/recall` (`operationId` `spacemolt_drone_recall`):

- `summary`: `Recall a deployed drone back to your bay`
- schema `all.description`: `Set to true to recall all drones at your current location`
- schema `id.description`: `ID of a specific drone to recall`

`src/openapi-metadata.ts` `generateApiRoutes` copies `operation.summary` and request property descriptions. It does not copy `operation.description`. The longer OpenAPI sentence ("Use all: true to recall all drones at your current location...") is therefore absent from generated metadata except for the shorter `all` property description. Help users see that field line because `mergeSchemaExtensions` in `src/commands.ts` starts from the generated schema.

No generated route stores a `Notification_drone_adrift` schema. Notification copy in the CLI is hand-written in `previewDroneAdrift`.

## Lag against changelog, docs, catalog, help, and notification copy

| Surface | What it says about 0.643.1 |
|---|---|
| `spacemolt-docs/changelog.json` 0.643.1 | Traveling drones that lose control stay visible at the departure location. Recall there, or refit drone-bay bandwidth. |
| `spacemolt-docs/ws.md` `drone_adrift` (around the `engine_drones.go:184` heading) | "If the drone is traveling, it stops at its departure POI. It stays recoverable at the reported location and resumes control when the owner refits enough drone-bay bandwidth." Field table: `poi_id` is "POI the drone went adrift at", `system_id` is "System the drone went adrift in". |
| `spacemolt-docs/openapi.json` | No such sentences. Schema fields have no descriptions. |
| `src/generated/api-commands.ts` | Same recall summary and `all` / `id` descriptions as the spec. |
| `spacemolt-docs/docs/drones.md` | Adrift drones: refit a bay and they return to control, or fly out and recall them. Command table: "`all: true` recalls all here". No sentence that a traveling drone stops at the departure POI. |
| `spacemolt-docs/guides/drones.md` | Adrift from removing a bay or losing a docked Drone Control bonus. No departure-POI sentence. Recall line is "drone returns to the bay". |
| `spacemolt-docs/api.md` and `spacemolt-docs/skill.md` | `recall_drone(all?, drone_id?)` — "Recall a deployed drone back to your bay". |
| `spacemolt-docs/catalog.json` | Version `0.643.3`. Item, ship, skill, recipe, and facility catalog. No command or notification prose for this behavior. Searches for `adrift` and `recall_drone` in catalog strings did not hit this mechanic (unrelated "departure" lore only). |
| CLI `CURATED_COMMAND_DESCRIPTIONS.recall_drone` (`src/command-descriptions.ts`) | `Recall a deployed drone back to your bay` — identical to the generated summary. Silent on departure POI and bandwidth refit. |
| CLI override `recall_drone` (`src/command-overrides-commerce-facility.ts`) | No `description`, no `schemaExtensions`. Help therefore shows the curated sentence plus generated field descriptions. |
| CLI full-help one-liner (`src/help.ts`) | `recall_drone [drone_id]   Recall one drone, or all=true` |
| CLI `previewDroneAdrift` (`src/notification-format-shared.ts`) | Headline names `poi_id` and `system_id`. Details, when `drone_id` is present: `Use: get_drone drone_id=...` then `Use: recall_drone drone_id=...`. No departure-POI sentence and no bandwidth-refit sentence. That matches the fields the schema actually has. It does not state the 0.643.1 recovery rule. |

Contradiction worth keeping: `ws.md` states the travel-stop rule, and the OpenAPI schema for the same frame does not. The CLI must not invent a sixth notification field to close that gap. `poi_id` on the existing frame is the location the changelog calls the departure location when the loss happened during travel. The frame does not say which losses were mid-travel.

## What this complaint does not claim

No error code for recalling from the wrong POI appears in the spec. No new request parameter appears. `RecallDroneResponse` did not grow a field in this cached spec. A client that needs the 0.643.1 rule has to take it from the changelog and from `ws.md`, then say it in curated help. It cannot read it out of `openapi.json` or `src/generated/api-commands.ts`.

## Hold (2026-10-21)

CLI help for this rule is held. Do not ship the 0.643.1 `recall_drone` sentences until a live capture or this spec names whether a `drone_id` recall of a drone at another POI succeeds and, on failure, the error code. This file records the gap. It does not invent that code. Live responses were not collected for this note.
