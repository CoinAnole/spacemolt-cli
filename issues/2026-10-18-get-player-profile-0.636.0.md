# Docs issues

Complaints for the spacemolt-docs maintainers. Written 2026-10-18 from the cached tree only. No live HTTP call, no WebSocket, and no captured server body was used. `GENERATED_API_GAMESERVER_VERSION` in `src/generated/api-commands.ts` is `v0.637.3`. `spacemolt-docs/changelog.json` `current_version` is `0.637.3` (page 1, 20 releases). Gameserver 0.636.0 is in that page.

Do not treat CLI fixtures as server samples. `publicPlayerProfileFixture` in `src/display/status.fixtures.ts` is a client-authored test object. It includes `location`. That does not prove what `GET /api/players/{name}` returns today.

## `get_player_profile` / `PlayerProfileResponse` (cached OpenAPI)

Files:

- `spacemolt-docs/openapi.json` `POST /api/v2/spacemolt/get_player_profile` (`operationId` `spacemolt_get_player_profile`)
- `spacemolt-docs/openapi-v1.json` `POST /get_player_profile` (`operationId` `get_player_profile`)
- Schemas in both files: `PlayerProfileResponse`, `PlayerProfileStats`, `PlayerProfileFaction`, `ProfileAchievementsSummary`, `ProfileRankEntry`

### What the cached spec does say

v2 operation description (v1 is the same paragraph; only the example wrapper differs):

> Returns the public profile the website shows: empire, clan tag, status message, colors, join date, online flag, titles, faction and role, lifetime stats, leaderboard placements, and an achievement summary. The username match ignores case. It never includes location: no system, POI, or docked station, cloaked or not. To find a pilot, look around with get_nearby or scan. An unknown username returns player_not_found.

v2 example line: `POST /api/v2/spacemolt/get_player_profile` with body `{"username":"Vex Caldera"}`.

v1 example line: `{"type": "get_player_profile", "payload": {"username": "Vex Caldera"}}`.

Request schema: object, `required: ["username"]`, `username` is `type: string`, description `Username of the pilot to look up (case-insensitive)`. No `minLength`, `maxLength`, `pattern`, or `format`.

Security on both operations: `[{"SessionId": []}]`. `SessionId` is `type: apiKey`, header `X-Session-Id`, description `Session ID from POST /api/v2/session.`

`PlayerProfileResponse.additionalProperties` is `false`. Property set (both specs): `achievements`, `clan_tag`, `created_at`, `empire`, `empire_name`, `faction`, `online`, `primary_color`, `ranks`, `ranks_generated_at`, `ranks_top_n`, `secondary_color`, `stats`, `status_message`, `titles`, `username`. There is no `location`, `system`, `poi`, or docked-station property.

`required` on `PlayerProfileResponse` (both specs): `username`, `empire`, `created_at`, `online`, `stats`, `ranks`, `ranks_top_n`, `achievements`.

Documented as omitted when unset (property descriptions, v2): `clan_tag`, `empire_name`, `faction` ("Omitted when the pilot is in no faction."), `primary_color`, `secondary_color`, `ranks_generated_at` ("Omitted before the first snapshot after a server start."), `status_message`, `titles` ("Omitted when none.").

`ranks` description: empty when the pilot places on none of the boards or before the first snapshot. `ranks_top_n` description: how many places each leaderboard keeps. Example value `30`. Changelog 0.636.0 says "top-30" as a release note, not as a schema constant.

`PlayerProfileFaction.required`: `name`, `tag`, `joined_at`. `role` description: omitted when no role is recorded.

`PlayerProfileStats.required` lists all 19 integer counters (`credits_earned` through `arena_knockouts`). `ProfileAchievementsSummary.required`: `earned`, `total`, `points`. `points` description: `0 when none are earned.` `ProfileRankEntry.required`: `category`, `label`, `rank`, `value`.

Every property on those five schemas has a description. The schema objects themselves have no top-level `description` and no schema-level `example` (examples sit on properties and on the v2 200 content example).

`online` description: true when the pilot has a live session on any transport or sent a command in the last 30 minutes.

Changelog `0.636.0` (2026-10-18), four notes:

- New query `get_player_profile` with one param, `username` (case-insensitive). On v2 it is `spacemolt` action `get_player_profile`.
- It returns another pilot's public profile: empire, clan tag, status message, colors, join date, online flag, titles, faction and role, lifetime stats, top-30 leaderboard placements, and an achievement summary.
- It never shows location: no system, POI or docked station. To find a pilot, use `get_nearby` or `scan`.
- An unknown username returns `player_not_found`.

`spacemolt-docs/api.md` (Status & Information) and `spacemolt-docs/skill.md` (Available Tools) each have only:

> `get_player_profile(username)` -- Look up another pilot's public profile by username

### Gaps a maintainer can close

1. `player_not_found` is prose in the operation description only. The operation's `responses` are `200`, `400`, `401`, and `429`. `400` is description-only: `Bad request — invalid params, unknown command, or game error`. It has no `content` schema and no example. `player_not_found` is not an enum value anywhere on this operation. A search of `openapi.json` finds the code in this description and in the prose for `refuel`, `repair`, `spacemolt_arena/challenge`, `spacemolt_fleet/invite`, `transfer_personnel`, `treat_personnel`, and `trade_offer`. It is not listed in `V2Response.error.code`'s description. That description names `session_required`, `session_invalid`, `not_authenticated`, `rate_limited`, `command_error`, `invalid_params`, `invalid_json`, `payload_too_large`, `method_not_allowed`, `missing_action`, `unknown_command`.

2. The v2 200 `application/json` example puts a successful `structuredContent` profile next to a placeholder error and a notification that is not a profile. Quoted from the cached example: `"error": { "code": "example", "message": "example", "retry_after": 1 }` and `notifications[0].data` of `{ "achievements": [ { "category": "example", ... } ], "faction": false }`. `V2Response.error` says "Error details (present instead of result on failure)." The example shows `error` and `structuredContent` together. The profile object under `structuredContent` in that same example is the only realistic sample (username `Vex Caldera`, `clan_tag` `WOLF`, `ranks_top_n` `30`, and the stats object). Please split the success example from the error example, and stop reusing the generic notification payload as if it were `PlayerProfileResponse`.

3. `401` description is `Not authenticated — missing or invalid session`. It does not say which of `session_required`, `session_invalid`, or `not_authenticated` this route returns. `V2Response.error.code` says `not_authenticated` means "session exists but not logged in", but that sentence is global. This operation does not say whether a session created with `POST /api/v2/session` and no login is enough. Contrast `POST /api/v2/spacemolt/get_empire_info`, whose description includes the sentence `No authentication required.` `get_player_profile` has the same `SessionId` security block and does not include that sentence. Please say explicitly: logged-in player required, or anonymous session accepted.

4. `429` description is `Rate limited — mutations allow 1 per tick (10 seconds)`. The operation description does not contain `Rate limited: This is a mutation command`. This is a query. The 429 text looks like shared mutation boilerplate.

5. `username` has no length or charset. The example value is `Vex Caldera` (contains a space). The CLI's `invalid_username` registry text, which is for `register`, says `Username must be 3-20 alphanumeric characters.` The profile lookup schema does not say whether that rule applies. Please add `minLength` / `maxLength` / `pattern`, or state that lookup accepts a different set than registration (spaces, length).

6. `titles` is "Omitted when none." It does not say whether the server ever sends `[]` instead, or whether items may be empty strings. `ranks` is required and may be empty; `titles` is optional. Please say which one is the none-state for titles.

7. `PlayerProfileResponse`, `PlayerProfileStats`, `PlayerProfileFaction`, `ProfileAchievementsSummary`, and `ProfileRankEntry` have no schema-level `description`. Property descriptions are present. A one-line schema description would make the "no location" rule show up on the schema, not only on the operation.

8. `status_message` and `clan_tag` descriptions do not repeat the limits the CLI already shows on `set_status` usage (`status max 100 chars, tag max 4 chars` in `src/command-overrides-faction-social.ts`). If those limits are server rules, put them on the profile properties and on `set_status`'s OpenAPI fields. If they are not, the CLI usage string is ahead of the spec.

9. `ProfileRankEntry.value` says the unit is "credits for the wealth, value, credits and escrow boards; the matching lifetime stat's unit for the others." There is no map from `category` to unit. Clients cannot format a suffix (`cr`, seconds, AU) from the schema alone.

### Contradictions and lag

- Operation prose says the route "returns the public profile the website shows" and, in the same paragraph, that it never includes location. Changelog 0.636.0 agrees there is no location. `api.md` and `skill.md` one-liners mention neither the location ban nor `player_not_found` nor case-insensitivity.
- `spacemolt-docs/api.md` error table: `` `player_not_found` | Player not found or not visible. A pilot at another POI, in transit, or cloaked gives the same error and message as an unknown name ``. `spacemolt-docs/docs/trading.md` says the same ("Meet up first."). That matches the OpenAPI prose for trade, refuel, repair, arena challenge, fleet invite, transfer, and treat. It contradicts the `get_player_profile` description, which uses `player_not_found` for an unknown username and says the response never includes location. The error-table row needs a scope: visibility for those mutations, unknown username for `get_player_profile`.
- `GET /api/players/{name}` and `GET /api/factions/{tag}` appear nowhere in `spacemolt-docs/openapi.json`, `spacemolt-docs/openapi-v1.json`, `api.md`, or `skill.md` (search for `api/players` and `/players/{`). The CLI still calls them as `player_profile` and `faction_profile` (`src/command-overrides-query-reference.ts`, `src/command-overrides-faction-social.ts`) with `publicUnauthenticated: true`. `player_profile` help says cloaked location and hidden pilots follow server rules. The v2 query says it never returns location. Please document the website GET (body, auth, whether location is still returned, whether 0.636.0 replaced it) or mark it removed. Until then the CLI is keeping both commands.
- v1 `POST /get_player_profile` and v2 `POST /api/v2/spacemolt/get_player_profile` describe the same behavior. Property sets and `required` arrays match. Not a schema drift. The only description difference found is the example wrapper (MCP `type`/`payload` versus HTTP POST).

### Not verified

- No live 200 body and no live error body. The `structuredContent` object inside the cached 200 example was not re-fetched from a server.
- HTTP status of `player_not_found` (400 versus something else) and the server's `message` string.
- Whether a session that has not logged in can call this route.
- Whether `GET /api/players/{name}` still exists, and whether its JSON still has `location`.
- Whether `titles` is omitted or `[]` when the pilot has none.
- Whether `ranks_top_n` is fixed at 30 or only happens to be 30 in the example and the 0.636.0 note.
