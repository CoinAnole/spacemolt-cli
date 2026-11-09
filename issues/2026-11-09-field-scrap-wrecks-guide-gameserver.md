---
kind: contradiction
gameserver: 0.673.1
---

# Wrecks guide still says in-place salvage is gone

`spacemolt-docs/docs/wrecks.md`, heading "The Tow Flow":

> There is no destroy-in-place salvage anymore — loot what you want with `loot_wreck` in the field, and use the `tow_wreck` flow to a salvage yard for everything else.

Same page, heading "Practical Tips":

> Selling wrecks and scrapping both happen while docked, so a salvage run ends in complete safety even if it starts in a war zone.

`spacemolt-docs/changelog.json`, release 0.672.0:

> New `scrap_wreck` mode: with an Outer Rim Salvage Array fitted, send `mode="field"` and `wreck_id` to cut a wreck apart where it lies, with no tow or salvage yard.

`spacemolt-docs/openapi.json` `paths["/api/v2/spacemolt_salvage/scrap"].post.description` (`info.x-gameserver-version` `v0.673.1`):

> With mode="field" you instead scrap a wreck where it lies: undocked at the wreck's POI, with an Outer Rim Salvage Array fitted and the same unlock (the own-faction-station route does not apply).

`spacemolt-docs/api.md` already says `scrap_wreck` scraps a towed wreck at a salvage yard, or any wreck in the field.

Change those two `docs/wrecks.md` sentences so field scrap cuts a wreck in place while undocked. Yard scrap stays the docked tow.
