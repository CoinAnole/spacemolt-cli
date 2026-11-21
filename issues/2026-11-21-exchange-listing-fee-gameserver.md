---
kind: contradiction
gameserver: 0.732.0
---

# Guides still charge a 1% exchange listing fee

`spacemolt-docs/docs/markets.md`, heading "Instant Trading: buy and sell":

> Pass `auto_list: true` on either to automatically convert any unfilled remainder into a standing order (the 1% listing fee applies to the listed portion only).

Same page, heading "Standing Orders and Escrow":

> **Fees:** a 1% listing fee applies only to the portion that actually rests on the book. If your order crosses existing orders and fills instantly, the filled portion pays no fee.

Same page, command table:

> `create_sell_order` | List items at your price. Items escrowed (cargo first, then storage); 1% fee on the book portion.

> `create_buy_order` | Standing offer to buy. Credits escrowed; 1% fee on the book portion.

`spacemolt-docs/guides/trader.md`, heading "The Exchange":

> 1% listing fee on the portion of an order that goes on the book; `cancel_order` returns remaining escrow, `modify_order` reprices in place

`spacemolt-docs/guides/arbitrage.md`, heading "Orders, Escrow, and Settlement":

> **Fees:** 1% listing fee on the portion of an order that goes on the book. Instant fills (both `buy` and `sell`) are fee-free.

`spacemolt-docs/docs/economy.md`, heading "Where Stations Earn":

> Refueling, ship repairs, facility construction and upgrades, and exchange listing fees all pay the local station rather than vanishing.

`spacemolt-docs/changelog.json` release `0.732.0`:

> Exchange orders no longer pay a listing fee. Placing, consolidating or repricing buy and sell orders (including faction orders and `auto_list`) costs nothing beyond the escrow, and you can list goods with zero credits.

`spacemolt-docs/openapi.json` (`info.x-gameserver-version` `v0.732.0`), `POST /api/v2/spacemolt/buy`, `POST /api/v2/spacemolt/sell`, `POST /api/v2/spacemolt_market/create_buy_order`, and `POST /api/v2/spacemolt_market/create_sell_order` say exchange orders pay no listing fee. The sell `auto_list` field says there is no listing fee.

Change those sentences. Personal and faction buy and sell orders, including `auto_list` and repricing, pay no listing fee. Ship and facility listing fees are a different charge. Do not add the personal 1000-order cap to a page that never stated a cap.

# Station `set_market_fee` is still described as a listing fee

`spacemolt-docs/docs/stations.md`, heading "Administering a Station":

> `set_market_fee` | Listing fee (0-10%) outside traders pay, into your treasury

`spacemolt-docs/guides/factions.md`, heading "Administering one":

> `set_market_fee` | Listing fee outsiders pay, 0–10%, to your treasury

`spacemolt-docs/changelog.json` release `0.732.0`:

> Pirate strongholds and player stations now charge a market fee to the buyer on top of the price, in place of empire sales tax: 5% at pirate strongholds, and the owner's `set_market_fee` rate (1% by default) at player stations. Members of a station's owning faction pay none.

`spacemolt-docs/openapi.json`, operation `POST /api/v2/spacemolt_facility/set_market_fee`:

> Sets the market fee outside buyers pay on top of the price at your faction's station. `fee_percent` (0-10) flows to the treasury; 0 restores the default (1%). Requires manage_bases and docking there. Station-only (outposts don't support this action).

Change the two table rows. `set_market_fee` sets the market fee outside buyers pay on top of the price at the faction station. It is not an exchange listing fee. `fee_percent` is 0–10 and flows to the treasury. 0 restores the default 1%. Outposts do not support it. Pirate strongholds are not this command.
