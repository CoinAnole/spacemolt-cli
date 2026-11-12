---
kind: contradiction
gameserver: 0.695.1
---

# A fleet pull does not skip a cloaked pilot

`spacemolt-docs/docs/combat.md` (Ways to Start a Fight) says: "Fleet, faction, undock, and jump-arrival auto-joins skip cloaked pilots; they get the battle alert instead."

`spacemolt-docs/openapi.json` `POST /api/v2/spacemolt_battle/engage` says faction, undock, and jump-arrival auto-joins skip cloaked pilots, and a fleet pull drops a fleet mate's cloak. `POST /api/v2/spacemolt/cloak` says attacking, engaging, or a fleet pull into a battle drops the cloak. Changelog 0.695.1 says a fleet pull brings cloaked fleet members into the battle and joining drops the cloak. `spacemolt-docs/ws.md` (`cloak`) already lists a fleet pull into a battle as a cause that disables cloaking.

Stop listing a fleet auto-join with the auto-joins that skip cloaked pilots. Say a fleet pull drops the cloak. Faction, undock, and jump-arrival auto-joins still skip cloaked pilots.
