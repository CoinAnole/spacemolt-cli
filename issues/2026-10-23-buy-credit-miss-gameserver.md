---
kind: contradiction
---

# A short buy is not `item_not_available` (gameserver 0.645.1)

Cached docs stamp: `spacemolt-docs/openapi.json` `info.x-gameserver-version` `v0.647.1`. `spacemolt-docs/changelog.json` `current_version` `0.647.1`. Release `0.645.1` is on page 1.

## `docs/markets.md` still lists a credit miss as `item_not_available`

Common Errors:

> `item_not_available` | Nothing on the book can fill your `buy` — the only orders may be your own, or you lack credits or cargo space. Place a `create_buy_order` instead and let sellers come to you.

Changelog `0.645.1`:

> When the empire's sales tax pushes a buy over your balance, the error now says `insufficient_credits` and shows the price, tax, and your balance, instead of `item_not_available`.

> An instant buy with no credits left (or not enough to cover sales tax) no longer fills. It now fails with `insufficient_credits`.

`api.md`, heading "Common Error Codes", already lists `insufficient_credits` as insufficient credits. Drop "or you lack credits" from that `item_not_available` row. That shortfall is `insufficient_credits`, not `item_not_available`.
