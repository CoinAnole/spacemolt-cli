---
kind: contradiction
gameserver: 0.687.0
---

# Jump gate command name and access enum disagree

`spacemolt-docs/api.md`, heading "Base Building":

> `build_gate_site(far_system, name)` -- Found one end of a jump gate at your current point of interest in lawless space

`spacemolt-docs/skill.md` and `spacemolt-docs/openapi.json` (`info.x-gameserver-version` `v0.687.0`) name the operation `found_gate_site` at `POST /api/v2/spacemolt_facility/found_gate_site`.

The same OpenAPI file still says `build_gate_site` in two descriptions:

- `GateStatus.partner_base_id`: "Omitted until a faction member founds that end with build_gate_site in far_system_id naming this system."
- `PlayerStats.gate_sites_founded`: "Jump gate ends you founded with build_gate_site. Omitted until the first."

Rename those three to `found_gate_site`.

`paths["/api/v2/spacemolt_facility/set_gate_access"].post.description` says `access` is `"public"` or `"faction"`. The request property `access` says "public or faction for set_gate_access" and its enum is `public`, `allies`, and `faction`. `found_gate_site`'s description also says `set_gate_access (access public or faction)`.

Either drop `allies` from the `set_gate_access` enum, or name `allies` in that operation text and in the `access` description. Do not leave the enum and the operation text naming different sets.
