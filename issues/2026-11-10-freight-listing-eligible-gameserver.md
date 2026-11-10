---
kind: contradiction
gameserver: 0.675.0
---

# Packages guide still says freight listings carry `eligible` and that the board is global

`spacemolt-docs/guides/packages.md`, heading "The carrier's flow: list, accept, haul, deliver":

> Listings include route and payment terms, package value and liability exposure, required tier, and an `eligible` decision with a reason when you cannot accept. The list is global, but acceptance must happen while you are docked at that contract's origin station.

`spacemolt-docs/changelog.json`, release 0.675.0:

> Removed: listing `eligible` and `reason`, and profile `capacity.active_contract_limit`. Every listed run is one you can accept, and the contract count has no cap.

> The freight board adds a `warning` when your active ship has no lead-lined hold for a hazmat package. The v2 text board has a `hazmat` column in place of `eligible`.

`spacemolt-docs/openapi.json` schema `ShippingListing` (`info.x-gameserver-version` `v0.679.1`) has `contract`, `target_ticks`, `deadline_ticks`, `recovery_ticks`, and `warning`. It has no `eligible` or `reason`. `warning` is present when `contract.requires_hazmat` is true and the active ship has no `lead_lined_cargo_i` or `lead_lined_cargo_ii` module, and absent when nothing blocks you.

The same file, `paths["/api/v2/spacemolt_shipping/list"].post.description`:

> list is the freight board for the station you are docked at — it shows only posted contracts originating here that the carrier selected by eligible_as=player|faction can actually accept right now

Drop the listing `eligible` decision and its reason. Say every listed run is one you can accept, and that a listing may carry `warning` instead. Say the board is posted contracts originating at the station where you are docked, not a global list. Keep `eligible_as`. Keep the acceptance fact that self-shipping skips standing and tier liability limits while unpaid freight debt still blocks it. Do not describe that as a listing `eligible` field.
