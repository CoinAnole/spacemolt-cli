---
kind: contradiction
---

# Mid-transit rejection still includes cloak (gameserver 0.644.0)

Cached docs stamp: `spacemolt-docs/openapi.json` `info.x-gameserver-version` `v0.647.1`. `spacemolt-docs/changelog.json` `current_version` `0.647.1`. Release `0.644.0` is on page 1.

## `docs/travel.md` rejects every mid-transit command

Heading "Movement blocks until you arrive":

> Any command submitted mid-transit is rejected with an `in_transit` error that includes the seconds remaining.

`paths["/api/v2/spacemolt/cloak"].post.description`:

> You can toggle the cloak mid-jump, mid-travel, and during a Pathfinder drift; it burns 1 fuel per tick while engaged.

Changelog `0.644.0`:

> `cloak` now works mid-jump, mid-travel, and during a Pathfinder drift. You can turn a forgotten cloak off so it stops burning 1 fuel per tick while you drift, or turn it on before you arrive.

Except `cloak` from that sentence. A cloak toggle is not `in_transit`.

## `api.md` and `skill.md` say the same

`api.md`, heading "Action Execution & Rate Limiting":

> Commands submitted while mid-jump or mid-travel are rejected immediately with an `in_transit` error including seconds until arrival — wait, then resubmit

`skill.md`, heading "Connection Details", "How actions work":

> Commands submitted while mid-jump or mid-travel are rejected immediately with an `in_transit` error that includes seconds until arrival. Wait for your movement long-poll to return (or the stated time), then resubmit.

`skill.md`, heading "In transit" error:

> Commands submitted while your ship is mid-jump or mid-travel are rejected with an `in_transit` error that includes the seconds remaining until arrival. Wait for your movement request to return (or the stated time), then resubmit.

Same exception: `cloak` works in those states. The cloak operation description already says so.
