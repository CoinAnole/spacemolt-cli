# Docs issues

Complaints about OpenAPI gaps and documentation lag that affect the SpaceMolt CLI.

No live server responses were collected. Nothing below invents a response body.

## 2026-10-18 — Pathfinder follow-up (gameserver 0.637.2)

Scope: CLI help for a Pathfinder bearing `jump`, and human formatting of an `action_result` whose `command` is `pathfinder_arrival`. Cached sources: `spacemolt-docs/openapi.json` (`current` gameserver in `spacemolt-docs/changelog.json` is `0.637.3`), `spacemolt-docs/changelog.json`, `spacemolt-docs/api.md`, `spacemolt-docs/skill.md`, `spacemolt-docs/ws.md`, `spacemolt-docs/docs/travel.md`. Bundled CLI metadata stamp is `GENERATED_API_GAMESERVER_VERSION = 'v0.637.3'` in `src/generated/api-commands.ts`.

### 1. Synchronous jump result vs unsolicited `pathfinder_arrival`

`components.schemas.JumpCommandResponse.discriminator.mapping` in `spacemolt-docs/openapi.json`:

```json
{
  "jumped": "#/components/schemas/JumpResponse",
  "pathfinder_arrival": "#/components/schemas/JumpResponse",
  "pathfinder_jump": "#/components/schemas/PathfinderJumpResponse",
  "pathfinder_redirect": "#/components/schemas/PathfinderJumpResponse"
}
```

`propertyName` is `action`. `JumpResponse.action` enum is `jumped` | `pathfinder_arrival`, and `JumpResponse.required` is `action`, `system`, `system_id`, `from_system`, `navigation_xp`.

`Notification_action_result.properties.command.description` in the same file says the opposite about that name:

> pathfinder_arrival is sent when a Pathfinder drift drops out at a system. The bearing jump already settled with its own action_result on the tick it ran, so this push is not that command finishing. The ok notification with action=pathfinder_arrival that comes with it names the system and the XP gained.

`spacemolt-docs/changelog.json` release `0.637.2` (2026-10-18), note 2:

> When a Pathfinder drift drops out at a system, WebSocket v2 clients now also get an `action_result` with `command: "pathfinder_arrival"` and no `request_id`. It carries your updated state. The `ok` notification with `action: "pathfinder_arrival"` still arrives, and it no longer repeats the original jump's `request_id`.

`spacemolt-docs/ws.md` (multi-tick actions) agrees with the changelog: the bearing jump's `action_result` arrives on the tick it runs; dropout is a later `ok` with `action: "pathfinder_arrival"` plus an unsolicited `action_result` with `command` `pathfinder_arrival`. Neither carries a `request_id`.

CLI assumption: the bearing-jump receipt is `PathfinderJumpResponse` (`action` `pathfinder_jump` or `pathfinder_redirect`). `pathfinder_arrival` on an `action_result` is an unsolicited event, classified with `mission_objective_completed`. The CLI will not add a jump-details formatter for discriminator arm `pathfinder_arrival`. If a jump `details` object is still all scalars, the existing scalar dump prints it, including an `action` of `pathfinder_arrival` under the title `Pathfinder Arrival`.

### 2. Jump 200 example is a lane `jumped` placeholder, not a Pathfinder body

`POST /api/v2/spacemolt/jump` response `200` description:

> Result. structuredContent: V2GameState post-mutation delta (changed ship/cargo/location/queue sections); the command result is under `details` (JumpCommandResponse)

The 200 `example` is a generic envelope. Its `structuredContent.details` is a `JumpResponse`-shaped placeholder (`action` `"jumped"`, `from_system` `"example"`, `system` `"example"`, `system_id` `"36_ophiuchi"`, XP integers). It has no `bearing`, `origin_x`, `origin_y`, or Pathfinder `message`.

`PathfinderJumpResponse` (`additionalProperties: false`) properties are `action` (`pathfinder_jump` | `pathfinder_redirect`), `bearing` (number, no description), `message` (string, no description), `origin_x` (number, no description), `origin_y` (number, no description), `auto_docked`, `auto_undocked`. `required` is only `action`, `bearing`, `message`.

`auto_docked.description` on that schema is the generic text "True when the engine docked you automatically before running this command, because the command requires being docked." A bearing jump is an undocked drift. The CLI will not interpret that sentence.

CLI assumption: human jump output keeps the existing scalar dump in `src/display/generic.ts` (`titleForScalarAction`). For a Pathfinder body that dump already prints `Action`, `Bearing`, `Message`, `Origin X`, `Origin Y`, and the auto-dock flags when those scalars are present. No new receipt fields. No poll sentence on the receipt (the poll sentence goes in `jump` help).

### 3. No schema for the `pathfinder_arrival` action_result `result` object

`Notification_action_result.properties.result.description`:

> Payload of the completed command. On v1 this is the command's own response object — see that command's response schema. On v2 it is a state delta keyed by state section: the sections the command registered, or every section on an unsolicited push, since an event that moves you without your asking changes more than any one command does. A section that is absent is unchanged. Untyped because all these shapes are possible; it is null when the command returned no body.

`result` has no `type` and no dedicated Pathfinder properties (no system name, coordinates, or XP on this object). `ws.md` "Unsolicited state updates" says `pathfinder_arrival` carries every state section. The same page's "Convenience fields" says a delta may also carry top-level `message` (string) and `details` (object). `required` on the notification data is `command`, `tick`, `result`.

CLI assumption: there is no Pathfinder-specific detail parser. A string `result` prints as one human detail line (first line, trimmed). An object uses the existing `previewActionResult` detail path (`result.message` when it is a scalar, otherwise `formatActionResultDetails` on `result.details`, plus the existing dock line and bulky omitted hint). A missing, null, array, or other non-string non-object `result` adds no message line. `--json` stays the envelope. Unknown coordinates are not invented; `get_location` remains the coordinate view.

### 4. `Notification_ok` does not describe `action: pathfinder_arrival`

`Notification_action_result.properties.command.description` says the paired ok notification "names the system and the XP gained."

`Notification_ok` in `spacemolt-docs/openapi.json` does not mention `pathfinder_arrival`. Its `action.description` is "Event or completed command name. For coordinated docking this is fleet_dock." Properties are `action`, `arrival_tick`, `base`, `base_id`, `destination`, `message`. There is no `system`, `system_id`, `exploration_xp`, `navigation_xp`, or `piloting_xp`. The schema example is `fleet_dock`. `ws.md` "Fleet movement notifications (`ok`)" tables only `fleet_dock`, `fleet_undock`, `fleet_travel`, and `fleet_jump`, and says clients must accept unknown `ok` actions.

CLI assumption: `previewOk` in `src/notification-format-shared.ts` stays unchanged. An ok frame with `action` `pathfinder_arrival` keeps today's default branch (message as the `[OK]` headline when `message` is a scalar; otherwise the action token). The formatter does not read `request_id`. System and XP keys, if a server sends them, stay unprinted until a schema names them.

### 5. Poll-only clients vs a frame the CLI must format if it arrives

`Notification_action_result.description` ends with:

> The unsolicited form is sent only while your live WebSocket speaks v2, so a client that only polls receives the story frame alone.

Changelog `0.637.2` note 2 addresses "WebSocket v2 clients". Note 3:

> The HTTP API docs now say that a bearing jump returns at once. Poll `get_location` to follow the drift.

`spacemolt-docs/api.md` (Action Execution, the "Movement blocks until arrival" bullet) matches note 3 and does not mention `pathfinder_arrival`. `POST /api/v2/spacemolt/jump` `description` matches the HTTP sentence: "The command returns immediately — poll get_location for live coordinates."

CLI assumption, same as `mission_objective_completed`: this CLI does not open a WebSocket. It prints an `action_result` with `command` `pathfinder_arrival` when a `notifications` array on an HTTP response already contains that frame. Help will not say that `get_notifications` is guaranteed to deliver it. Drift progress is `get_location`.

### 6. `skill.md` lags the HTTP return sentence; `travel.md` states both rules

`spacemolt-docs/skill.md` Navigation:

> `jump(target_system)` -- Jump to an adjacent star system, or plot a numeric bearing with a Pathfinder Drive **Mutation.**

That line does not say the bearing returns on this call or to poll `get_location`. `skill.md` has no `pathfinder_arrival` mention. `api.md` and the OpenAPI jump description do say the bearing returns on the tick it runs and to poll `get_location`. Changelog `0.637.2` note 3 says the HTTP API docs now say that.

`spacemolt-docs/docs/travel.md` "Movement blocks until you arrive":

> Over MCP and HTTP, `travel` and `jump` hold your request open until you actually arrive — not just until the next tick.

The Pathfinder section of the same page:

> The command returns immediately; poll `get_location` for your live galactic coordinates while drifting.

CLI assumption: curated `jump` help follows the Pathfinder sentence, `api.md`, and the OpenAPI operation description. A numeric bearing, including a mid-drift replot, returns on this call. The drift continues until the operator polls `get_location`. The general "blocks until arrival" sentence stays the rule for a lane `jump`.

### 7. `get_location` operation prose lags `V2Location`

`POST /api/v2/spacemolt/get_location` `description`:

> Returns system, POI, resources, nearby players, and pirates in the v2 state envelope. Includes in_transit and transit_dest_* fields when actively jumping or traveling.

`components.schemas.V2Location` also describes `transit_type` (`"jump"`, `"travel"`, or `"pathfinder"`), `transit_bearing` ("Plotted compass bearing in degrees (pathfinder only)"), `transit_x`, `transit_y`, `transit_ticks_elapsed`, and `void_message` ("present only when drifting beyond the galaxy edge").

CLI assumption: no `get_location` display change. `locationTransitLines` in `src/display/status.ts` already prints transit type, bearing, position, ticks elapsed, and `void_message` when those values are present. Jump help points at `get_location` and does not restate those lines.

## 2026-10-18 — Exploration survey power (gameserver 0.634.0)

Scope: the `survey_system` help sentence about skill bonuses, and the integer printed as `Survey power`. Cached sources: `spacemolt-docs/openapi.json` (`info.x-gameserver-version` is `v0.637.3`), `spacemolt-docs/catalog.json` (`version` `0.637.3`), `spacemolt-docs/changelog.json` release `0.634.0`, `spacemolt-docs/docs/skills.md`, `spacemolt-docs/docs/exploration.md`, `spacemolt-docs/docs/scanning.md`, `spacemolt-docs/api.md`. Bundled CLI metadata stamp is `GENERATED_API_GAMESERVER_VERSION = 'v0.637.3'` in `src/generated/api-commands.ts`. No live server response was collected. The OpenAPI 200 example for this operation is a placeholder (`message` `"example"`, `skills.armor.name` `"example"`, `details.survey_power` `1`) and is not a measured survey.

### 1. OpenAPI survey prose omits Exploration `surveyPower`

`POST /api/v2/spacemolt/survey_system` `description` in `spacemolt-docs/openapi.json`:

> Survey power uses the scanner math: operational modules only, each extra module adds 50% of the one before, plus the integrated survey scanner, survey probe and navigation beacon bonuses, scaled by Scanning (1% per level).

That sentence does not mention Exploration.

`components.schemas.Skill.properties.bonus_per_level` is an open object of integers (`additionalProperties: { type: integer }`). It has no description and no named keys. `bonus_per_level` is not in `Skill.required`. The schema cannot confirm `surveyPower`.

`spacemolt-docs/catalog.json` skill `id` `exploration` (same catalog version `0.637.3`):

- `bonus_per_level`: `{ "surveyPower": 1 }`
- `description`: "Discovery and surveying. Increases survey power by 1% per level, added to the Scanning skill's bonus. survey_system reveals a hidden POI when your survey power reaches its reveal difficulty."
- `training_source`: "Visit systems for the first time."

`spacemolt-docs/changelog.json` release `0.634.0` (2026-10-17), note 3:

> **Exploration skill levels:** each Exploration level now adds 1% survey power, added to the Scanning skill bonus. Higher survey power lets `survey_system` reveal harder hidden POIs. The Exploration catalog bonus key is now `surveyPower`.

Catalog and changelog agree. The operation description lags both. The cached catalog still carries the 0.634.0 sentence at stamp `0.637.3`.

CLI assumption: `survey_system` help keeps the existing Scanning clause ("Scanning scales the total by 1% per level"), because the operation description still says that and the changelog says Exploration is added to the Scanning bonus. Help adds the catalog sentence: Exploration increases survey power by 1% per level, added to the Scanning skill bonus, and names `bonus_per_level.surveyPower` with gameserver `0.634.0`. Help does not claim the OpenAPI schema lists that key.

### 2. No source states the combined Scanning-plus-Exploration expression

The operation description says survey power is "scaled by Scanning (1% per level)". The catalog Exploration description says the Exploration increase is "added to the Scanning skill's bonus". The changelog says the same with "added to the Scanning skill bonus". None of those texts, and not `SurveySystemResponse`, gives an expression (sum of the two percents, product of two factors, or any other combination). The published 200 example does not include an Exploration or Scanning skill level next to `survey_power`.

CLI assumption: help uses those source verbs and does not add a worked total, a second percentage for Scanning's catalog key, or a formula. `src/display/survey.ts` keeps printing `Survey power:` from `details.survey_power`. The client does not derive that integer from skill levels.

### 3. Scanning's catalog key is `scannerEffectiveness`, while the survey operation still names Scanning

`spacemolt-docs/catalog.json` skill `id` `scanning`:

- `bonus_per_level`: `{ "scannerEffectiveness": 1 }`
- `description`: "Sensor operations and target detection. Increases scanner effectiveness by 1% per level."

There is no `surveyPower` key on Scanning.

`spacemolt-docs/docs/skills.md` Support table: "Scanning | Scanner effectiveness +1% per level". `spacemolt-docs/docs/scanning.md` applies that 1% to ship scanner power for `scan` ("scaled by your Scanning skill (1% per level)"), which matches `scannerEffectiveness` and does not mention `survey_system` survey power.

The survey operation description still says survey power is scaled by Scanning at 1% per level. Changelog note 3 says Exploration survey power is added to "the Scanning skill bonus" and does not rename Scanning's key to `surveyPower`.

CLI assumption: help does not retcon Scanning's catalog key. The existing "scales the total by 1% per level" clause stays, attributed to Scanning, as the operation description states. The new clause attributes `surveyPower` only to Exploration.

### 4. `skills.md` and `exploration.md` lag the Exploration catalog sentence

`spacemolt-docs/docs/skills.md` Exploration table:

> Exploration | Scan range and detail level | Visit systems for the first time

`spacemolt-docs/docs/exploration.md` "Surveying: Finding What Is Hidden" says success depends on survey power against deposit difficulty and that the sweep awards Scanning and Deep Core Mining XP. The career paragraph says the Exploration skill grows as you visit new systems. Neither page states +1% survey power per Exploration level or the key `surveyPower`.

Training ("visit systems for the first time") matches `catalog.json` `training_source`. The effect column does not match the catalog `description`.

CLI assumption: help follows `catalog.json` and changelog `0.634.0` for the Exploration effect. It does not copy "Scan range and detail level". `spacemolt catalog type=skills id=exploration` already prints the server `description` and `summarizeBonusPerLevel` output (`Bonuses: surveyPower 1` when the catalog sends that key). This complaint does not ask for a catalog-formatter change.

### 5. `survey_power` on the response is an integer with no client formula

`components.schemas.SurveySystemResponse.properties.survey_power` is `{ "type": "integer" }` with no description. It is required, with `system_id`, `system_name`, `deposits`, `newly_revealed`, `already_revealed`, `faint_signatures`, `wildlife`, `bloom_intensity`, `bloom_status`, `xp_gained`, and `message`. `deposits.description` says the array is empty when survey power is 0. It does not say how the integer was computed.

CLI assumption: table output keeps `Survey power: ${r.survey_power}` in `src/display/survey.ts`. Help states that this line is the server `survey_power`. Empty-deposits copy keeps using that same integer (`finiteNumber(surveyPower) === 0`). `--json`, `--yaml`, and `--structured` stay pass-through.

### 6. Other 0.634.0 skill pages (CLI non-goal)

Checked while confirming the Exploration row. No `survey_system` help change, and no help change for these skills, follows from this item.

- `spacemolt-docs/docs/skills.md` Piloting: "Module effectiveness on larger ships; capital ships require Piloting level 70". `catalog.json` skill `piloting` description: travel speed between POIs +1% per level, jumps unaffected, tier gates 10/20/30/50, `bonus_per_level.travelSpeed` `1`. `spacemolt-docs/api.md` says "Higher-tier ships require minimum Piloting level (T2=10, T3=20, T4=30, T5=50)." Changelog `0.634.0` note 4 matches the catalog. `skills.md` contradicts the catalog and `api.md`.
- `spacemolt-docs/docs/skills.md` Piracy Improves cell: "Loot from raids +1% per level, scan evasion against customs and NPC inspections +1% per level". The scan-evasion clause matches catalog `bonus_per_level.scanEvasion` `1`. The loot clause is coarser than catalog skill `piracy` ("When you destroy a player's ship, the share of its cargo that drops into the wreck rises by 1% per level (a 60% drop becomes 90% at level 50), up to all of it. Also improves scan evasion against customs and NPC inspections by 1% per level.") and changelog `0.634.0` note 2 (1% relative to the base drop rate; a 60% drop becomes 90% at level 50, capped at 100% of the cargo). `bonus_per_level` is `lootingBonus` `1` and `scanEvasion` `1`.
- `spacemolt-docs/docs/skills.md` Wormhole Navigation: "Wormhole transit accuracy". Catalog `wormhole_navigation` description and changelog `0.634.0` note 5: 4 prediction power per level, key `wormholePrediction`.
- `spacemolt-docs/docs/skills.md` Drone Control Improves cell: "Drone combat damage, mining yield, and repair rate +1% per level; each level allows one more concurrently scripted drone". Catalog skill `drone_control` description: "Improves drone combat damage, mining yield, and repair rate by 1% per level, and adds 1 percentage point of drone hit chance per level. Drone deployment count is gated by the bandwidth of installed drone bay modules — this skill makes the drones you deploy more effective." The bandwidth sentence is that catalog description only. Changelog `0.634.0` note 6 says the description now includes the existing drone hit-chance bonus of 1 percentage point per Drone Control level, and that existing per-level Engineering, Stealth, and Drone Control effects are unchanged. Note 6 does not mention bandwidth. `bonus_per_level` is `droneDamage`, `droneMiningYield`, and `droneRepairRate` (each `1`). The hit-chance sentence is catalog prose; the map has no hit-chance key. The `skills.md` clause "each level allows one more concurrently scripted drone" is the part that disagrees with the catalog bandwidth sentence.

CLI assumption: those four rows are out of scope for the `survey_system` help edit.
