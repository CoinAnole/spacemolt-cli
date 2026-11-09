---
kind: contradiction
gameserver: 0.669.0
---

# Faction treasury credits are still documented as dock-only

`spacemolt-docs/guides/factions.md`, heading "Treasury, storage, and markets":

> `faction_deposit_items` / `faction_deposit_credits` | — | Yes | Faction Storage here (may still be under construction)

> `faction_withdraw_items` / `faction_withdraw_credits` | `manage_treasury` | Yes | **Active** Faction Storage here

`spacemolt-docs/docs/storage.md`, heading "Direct Transfers: source and target":

> Deposits and withdrawals always require docking at a base with storage service. The exception is a `fixer:tab` payment: it needs a public empire station with mission services, not storage service.

`spacemolt-docs/openapi.json` `paths["/api/v2/spacemolt_storage/deposit"].post.description` and `paths["/api/v2/spacemolt_storage/withdraw"].post.description` (`info.x-gameserver-version` `v0.673.1`):

> except faction treasury credits (`item_id="credits"`), which never dock and work anywhere

`spacemolt-docs/changelog.json`, release 0.669.0:

> `faction_deposit_credits` and `faction_withdraw_credits` (and `storage` with `target=faction item_id=credits`) now work docked or in space. Withdrawals still need the manage treasury permission.

Mark faction treasury credits as working anywhere, including in space, and as never auto-docking. Withdrawals still need manage treasury. Do not drop the dock rule for item deposits or item withdrawals.
