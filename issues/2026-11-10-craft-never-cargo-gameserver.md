---
kind: contradiction
gameserver: 0.678.0
---

# Crafting guides say inputs never come from cargo

`spacemolt-docs/guides/crafting.md`, heading "Materials come from station storage, and output goes back there":

> There is no "craft straight to cargo" path anymore.

The same page, pitfall "Crafting from cargo":

> Inputs come from **station storage**. Deposit first.

`spacemolt-docs/docs/crafting.md`, "A First Production Run, Start to Finish", step 3:

> Crafting draws from storage, never cargo.

`spacemolt-docs/docs/crafting.md`, heading "How Crafting Works":

> not your cargo hold — use `deposit_items` first

`spacemolt-docs/docs/storage.md`:

> crafting escrows materials from station storage — not cargo — and delivers finished output back to storage.

And under "Cargo vs Storage Trade-offs":

> Crafting runs on storage. Jobs escrow inputs from station storage and deliver outputs there.

`spacemolt-docs/docs/hospitality.md`, heading "The Food & Drink Economy":

> As with all crafting, jobs queue over time, escrow inputs from station storage, and deliver output back to storage.

`spacemolt-docs/changelog.json`, release 0.678.0:

> On a Field Workshop hull you can `craft` hand-craftable recipes while undocked. Inputs come from your ship's cargo and finished runs go back into cargo.

`spacemolt-docs/openapi.json` `paths["/api/v2/spacemolt/craft"].post.description` (`info.x-gameserver-version` `v0.679.1`), FIELD WORKSHOP:

> all inputs for the whole job are escrowed from the ship's CARGO when you queue it, and each finished run goes into cargo. source and deliver_to must be omitted or "cargo"

Qualify those absolutes so docked station craft still uses storage, and an undocked field-workshop hull escrows from ship cargo and delivers finished runs to cargo. The changelog note and the operation description already say that. Do not add a tick duration, an XP amount, or a refusal code.
