---
kind: contradiction
gameserver: 0.673.1
---

# `hold_update` prose omits scan holds

`spacemolt-docs/api.md`, Combat, `hold_update`:

> `source` (`toll`), `trade_id?`, `start_tick`, `reason?` (on `ended`: `paid`, `offer_closed`, `holder_acted`, `holder_left`, `battle`)

`spacemolt-docs/ws.md`, heading `hold_update`:

> `source` | string | `toll`: a `trade_offer` with `hold=true`

> `reason` | string? | On `ended` only: `paid`, `offer_closed` (declined, cancelled or expired, after a 2-tick grace), `holder_acted`, `holder_left` (left, docked, jumped or died), or `battle` (the two are now fighting)

`spacemolt-docs/openapi.json` `components.schemas.Notification_hold_update` (`info.x-gameserver-version` `v0.673.1`):

> `source` enum `toll`, `scan`. "scan is a cargo scan from a ship with a warp scrambler."

> `reason` enum includes `scan_over`: "a scan hold ran its 5 ticks with no toll offer."

Change the `api.md` and `ws.md` `hold_update` lines so `source` includes `scan` and `reason` includes `scan_over`.
