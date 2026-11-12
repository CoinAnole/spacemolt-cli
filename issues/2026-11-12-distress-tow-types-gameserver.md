---
kind: contradiction
gameserver: 0.696.0
---

# Distress types are not only fuel, repair, and combat

`spacemolt-docs/docs/missions.md` (Distress Signals) says `distress_signal` has three types and lists only `fuel`, `repair`, and `combat`. `spacemolt-docs/guides/nomad.md` (When someone runs dry) says `distress_type` is `fuel`, `repair`, or `combat`.

`spacemolt-docs/openapi.json` `POST /api/v2/spacemolt/distress_signal` `distress_type` enum is `fuel`, `repair`, `combat`, and `tow`. The operation description says `tow` calls a Galactic Salvage Authority tug. Changelog 0.696.0 says the same. `spacemolt-docs/api.md` already says the command can call a Salvage Authority tow.

Stop saying there are only those three types, and include `tow`, matching that enum. Emergency-channel `distress_type` stays `fuel`, `repair`, or `combat`: a tow is not broadcast (`Notification_chat_message` and `spacemolt-docs/ws.md`).
