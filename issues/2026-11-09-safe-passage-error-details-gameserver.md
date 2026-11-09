---
kind: openapi-gap
gameserver: 0.670.0
---

# `safe_passage` error details are not in OpenAPI

`spacemolt-docs/api.md` error table, code `safe_passage`:

> The target holds a grant of safe passage that binds you. From `attack`, and from `battle` `target`, board stance, or `engage` against the holder's side. `details` gives `grantor_id`, `faction_id` (empty when the grantor had no faction), `system_id`, `granted_tick`, `until_tick` and `source` (`toll` or `robbery`)

`spacemolt-docs/openapi.json` (`info.x-gameserver-version` `v0.673.1`) does not contain `grantor_id`.

`paths["/api/v2/spacemolt/attack"].post.description`, `paths["/api/v2/spacemolt_battle/target"].post.description`, `paths["/api/v2/spacemolt_battle/engage"].post.description`, and `paths["/api/v2/spacemolt_battle/stance"].post.description` do not name `safe_passage`.

`paths["/api/v2/spacemolt_transfer/trade_offer"].post.description` and `paths["/api/v2/spacemolt/scan"].post.description` name the code and do not define `details`.

`components.schemas.V2Response.properties.error.properties.details` is an object whose keys vary by code. Its description names `missing_materials` and does not name `grantor_id`, `faction_id`, `system_id`, `granted_tick`, `until_tick`, or `source`.

`components.schemas.Player.properties.safe_passages` is the grants on login. It uses `grantor_player_id` and `grantor_faction_id`, not this error object.

A client cannot parse `safe_passage` `details` from the spec.

Name those six keys on the `safe_passage` error details for `attack` and for `battle` target, board, and engage. Do not add detail keys for `no_scrambler`, `target_not_holdable`, `already_held`, or `hold_cooldown`.
