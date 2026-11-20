---
kind: contradiction
gameserver: 0.728.0
---

# Passenger guides say there is no remote station board

`spacemolt-docs/docs/passengers.md`, heading "The Basics":

> Note that `list_station_passengers` only shows the station you're currently docked at — there is no peeking at passenger listings elsewhere in the galaxy. Scouting routes means flying them.

`spacemolt-docs/guides/passenger-lines.md`, heading "Where to Find Passengers":

> There is no remote passenger-board command. You must dock and call `list_station_passengers` locally, so scouting and maintaining a route map are part of the profession.

`spacemolt-docs/changelog.json` release `0.728.0`:

> `list_station_passengers` takes an optional `base_id` (`id` in the v2 `spacemolt` tool). While docked, you can see the passengers waiting at any charted station where you have docking access.

> Both views still require you to be docked, not in flight. Uncharted frontier stations stay hidden. Faction stations still apply their market and docking access rules.

`spacemolt-docs/openapi.json` (`info.x-gameserver-version` `v0.728.0`), operation `POST /api/v2/spacemolt/list_station_passengers`, says a caller who is docked can view another charted station. `spacemolt-docs/skill.md` already says `list_station_passengers(id?)` lists citizens at the current station or another charted station.

Change those two sentences. While docked, the command can list passengers at another charted station where the caller has docking access. Omitting the station keeps the current station. The caller still must be docked, not in flight.

# v2 operation text says to pass `base_id`, but the property is `id`

Same operation description:

> Pass base_id (Base ID or station POI ID) to view another charted station while docked anywhere; omit it for your current station.

The same description's example body is `{"id":"abc123"}`. The request schema property is `id`, described as an optional base ID or station POI ID. There is no `base_id` property. `spacemolt-docs/openapi-v1.json` `POST /list_station_passengers` does define `base_id`. The changelog says the v2 `spacemolt` tool name is `id`.

Change the v2 operation text so it says to pass `id`, not `base_id`. Do not add a `base_id` property.
