# Docs issues

Complaints about OpenAPI gaps and documentation lag that affect the SpaceMolt CLI. This file did not exist at the repo root or under `spacemolt-docs/` when the 2026-10-18 Pathfinder design was written. A normal `git add` includes `docs_issues.md`.

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
