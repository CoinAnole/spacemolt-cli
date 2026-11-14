---
kind: contradiction
gameserver: 0.713.4
---

# `jump_mobile_base` says the destination must be charted

`spacemolt-docs/openapi.json` (`info.x-gameserver-version` `v0.713.5`), operation `POST /api/v2/spacemolt_faction/jump_mobile_base`:

> The fully repaired, stationary base may jump only to an adjacent system charted by the commander or the faction.

Request field `id`:

> Adjacent destination system charted by the commander or the faction

`spacemolt-docs/changelog.json` release `0.713.4`:

> Faction mobile bases can now jump to any adjacent public system, even if the commander has never visited it.

> Jumps to frontier systems still need the commander or the faction to have charted the destination. The `unknown_system` error now says this.

Change the operation text and the `id` description so they no longer say the base may jump only to a charted system. An adjacent public system does not require a visit. A frontier destination must be charted by the commander or the faction.
