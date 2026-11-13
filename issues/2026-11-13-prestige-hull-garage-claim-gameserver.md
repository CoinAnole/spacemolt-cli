---
kind: contradiction
gameserver: 0.690.0
---

# A personal-achievement prestige hull in a faction garage is not claimable by any member

`spacemolt-docs/openapi.json` `POST /api/v2/spacemolt_faction/garages` says "Members can claim any of these ships with switch_ship while docked at that station."

`spacemolt-docs/docs/factions.md` (Ship Garages) says any member docked there can claim one with `switch_ship`.

`spacemolt-docs/guides/factions.md` (Ship garage) says any member docked there can claim one with `switch_ship`.

`spacemolt-docs/docs/trading.md` (What Direct Trading Is For) says to gift ships into the faction garage so any member can claim one at that station.

Changelog 0.690.0 says only a member who has earned the personal achievement can claim that prestige hull. Other members get `not_qualified`.

Stop saying every member can claim every garaged ship. A personal-achievement prestige hull can be claimed only by a member who has earned that achievement.
