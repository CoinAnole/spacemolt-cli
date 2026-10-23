---
kind: contradiction
---

# Abandon penalty disagrees (gameserver 0.645.2)

Cached docs stamp: `spacemolt-docs/openapi.json` `info.x-gameserver-version` `v0.647.1`. `spacemolt-docs/changelog.json` `current_version` `0.647.1`. Release `0.645.2` is on page 1.

## `guides/mission-runner.md` says abandon is free

How Mission Boards Work:

> `abandon_mission` — drop an active mission. No penalty, and any cargo you gathered for it stays in your hold.

The Practical Loop:

> `abandon_mission` costs nothing — cut losers early.

`paths["/api/v2/spacemolt/abandon_mission"].post.description`:

> On a smuggling courier, missing cargo becomes persistent fixer debt at base value, even if your wallet is empty. On other missions, missing provided goods are charged to your wallet, capped at your balance, with no debt.

Changelog `0.645.2`:

> The `abandon_mission` docs now say that missing cargo becomes shared fixer debt only on smuggling couriers. On other missions it is charged to your wallet, capped at your balance.

`skill.md` and `api.md`, heading "Fixer debt and restitution", already say that split. Replace the "No penalty" sentence and the "costs nothing" sentence with it.

## `docs/missions.md` charges the full base value

The Mission Board:

> goods the mission *provided* on accept — a smuggling courier's contraband, for instance — are reclaimed: units you still hold are confiscated, and you are charged the base value of any you no longer carry.

That one charge, with smuggling as the example, is not persistent fixer debt when the wallet is empty, and it is not a wallet charge capped at the balance with no debt. Replace that charge rule with the same two-case sentence already on the abandon operation and under "Fixer debt and restitution".
