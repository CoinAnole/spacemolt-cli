---
kind: contradiction
gameserver: 0.654.2
---

# Status message limit is still 100 characters in the guides

`spacemolt-docs/docs/accounts.md`, heading "Identity: status, clan tag, and colors":

> Status message: free text, max 100 characters.

The same page, Commands table:

> Set your status message (max 100 chars) and clan tag (max 4 chars)

`spacemolt-docs/docs/scanning.md`, heading "What Others See: Identity and Presence":

> set your status message (up to 100 characters) and four-character clan tag.

`spacemolt-docs/changelog.json`, release 0.654.2:

> `set_status` now states the real limit: status messages are up to 64 characters. The schema wrongly said 100.

`spacemolt-docs/openapi.json` `paths["/api/v2/spacemolt_social/set_status"].post.description`:

> Status max 64 chars, clan tag max 4 chars.

`content` is `maxLength` 64 ("Status message (max 64 chars)"). `clan_tag` is `maxLength` 4 ("Clan tag (max 4 chars)"). `Player.status_message` is `maxLength` 64 and `Player.clan_tag` is `maxLength` 4.

Change the 100-character status sentences in `docs/accounts.md` and `docs/scanning.md` to 64 characters. The clan-tag limit of 4 on those lines already matches the spec.
