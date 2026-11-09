---
kind: contradiction
gameserver: 0.669.0
---

# Ships guide says install_mod requires a dock

`spacemolt-docs/docs/ships.md`, heading "Fitting Commands":

> `install_mod` — install a module from your cargo. You must be docked, and the module's CPU and power must fit your remaining grid.

`spacemolt-docs/openapi.json` `paths["/api/v2/spacemolt/install_mod"].post.description` (`info.x-gameserver-version` `v0.673.1`):

> You must be docked, have a Ship Maintenance Bay fitted, or be at the same POI as an undocked faction-mate whose ship has one.

`paths["/api/v2/spacemolt/uninstall_mod"].post.description` repeats that place rule.

`spacemolt-docs/changelog.json`, release 0.669.0:

> `install_mod` and `uninstall_mod` now work in space when an undocked faction-mate at your POI has a Ship Maintenance Bay fitted. You fit your own ship from your own cargo.

Change the Fitting Commands sentence so a dock is one place, not the only place. Keep the CPU and power requirement. Do not add a place the operation description does not list.
