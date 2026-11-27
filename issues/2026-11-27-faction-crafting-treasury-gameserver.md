---
kind: openapi-gap
gameserver: 0.734.4
---

# `ActionLogData` does not name faction crafting treasury amounts

`spacemolt-docs/changelog.json` release `0.734.4`:

> Crafts and recycling jobs paid from faction storage and the faction treasury now appear in the faction action log (`get_action_log` with `faction_id`). This covers `crafting.queued` (with `escrow_credits`, the labor and fee taken from the treasury), `crafting.completed` (with any `refunded_credits`) and `crafting.cancelled`.

`spacemolt-docs/openapi.json` (`info.x-gameserver-version` `v0.735.1`), `components.schemas.ActionLogData`, does not name `escrow_credits` or `refunded_credits`. Its `additionalProperties` allows a string, integer, number, or boolean and does not name either key. `components.schemas.ActionLogEntry.data` is that schema. `components.schemas.GetActionLogResponse` entries are `ActionLogEntry`.

A client cannot tell those two amounts from any other extra `data` value.

Name `escrow_credits` on `crafting.queued` and `refunded_credits` on `crafting.completed` in action-log `data`. Do not require either key. Do not add a credit field for `crafting.cancelled`.
