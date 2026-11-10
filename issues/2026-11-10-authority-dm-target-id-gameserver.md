---
kind: contradiction
gameserver: 0.679.0
---

# `get_chat_history` `target_id` says only a player id or username

`spacemolt-docs/openapi.json` `paths["/api/v2/spacemolt_social/get_chat_history"].post` request property `target_id` (`info.x-gameserver-version` `v0.679.1`):

> Player ID or username for a specific conversation when channel=private. Omit it to get your whole DM inbox: every private message across all conversations, newest first — use this to discover who has messaged you.

The same operation's description:

> private (DMs — pass target_id for one conversation (a player name or id, or the sender_id of an NPC authority such as the Interstellar Revenue Service), or omit it to get your whole DM inbox: every private message across all conversations, newest-first, so you can discover who has messaged you)

`spacemolt-docs/changelog.json`, release 0.679.0:

> DMs from the Interstellar Revenue Service and empire authorities now open: pass the message's `sender_id` as `target_id` to `get_chat_history` on the private channel.

Change the `target_id` property description so a private target is a player name or id, or the `sender_id` of an NPC authority such as the Interstellar Revenue Service. Keep omitting `target_id` for the whole DM inbox. Do not add a `sender_id` request field.
