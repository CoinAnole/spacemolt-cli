---
kind: contradiction
gameserver: 0.669.0
---

# Guides still say a credits gift to a player requires a dock

`spacemolt-docs/docs/storage.md`, heading "Gifts":

> Item and credit gifts to players require you to be docked at a base with storage service.

`spacemolt-docs/docs/trading.md`, heading "Gifts with send_gift":

> Item and credit gifts require you to be docked at a base with storage service; only ship gifts work from anywhere.

Same page, heading "Restrictions":

> Trades anchor to a location; item/credit gifts anchor to a docked station. Only ship gifts are fully remote.

`spacemolt-docs/changelog.json`, release 0.669.0:

> `send_gift` with credits only now works from anywhere, including in space. Item gifts still need a dock at a station with storage.

`spacemolt-docs/openapi.json` `paths["/api/v2/spacemolt_storage/deposit"].post.description` (`info.x-gameserver-version` `v0.673.1`) says a player-name gift keeps its own docking rules and does not spell this split. It does not name an error for the item-gift case.

Say a credits-only gift works from anywhere, including in space, and an item gift still needs a dock at a station with storage. Do not invent that error.
