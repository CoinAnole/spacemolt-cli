---
kind: contradiction
gameserver: 0.660.2
---

# Pirate ship-license royalties are paid to station managers

`spacemolt-docs/docs/shipyard.md`, heading "Ship Design Licenses":

> The royalty goes to the design's empire treasury; pirate royalties leave the economy.

`spacemolt-docs/openapi.json` `paths["/api/v2/spacemolt_facility/buy_ship_license"].post.description` (`info.x-gameserver-version` `v0.660.2`):

> a per-build royalty of 10% of the current market value of the hull's build materials paid to the hull's empire treasury (pirate hulls: the royalty is split evenly among all pirate station managers).

Change the pirate clause in `docs/shipyard.md` so a pirate hull's royalty is split evenly among all pirate station managers. The empire half already matches: that royalty goes to the hull's empire treasury.
