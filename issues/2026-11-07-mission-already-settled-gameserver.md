---
kind: openapi-gap
gameserver: 0.657.5
---

# `mission_already_settled` is not in OpenAPI

`spacemolt-docs/changelog.json`, release 0.657.5:

> If another pilot completes a faction posting before you, the `mission_already_settled` error now says so and tells you to use `abandon_mission` to clear your copy.

`spacemolt-docs/openapi.json` (`info.x-gameserver-version` `v0.660.2`) does not contain `mission_already_settled` or `already_settled`.

`paths["/api/v2/spacemolt/accept_mission"].post.description` says faction postings pay only the first pilot to complete them. `paths["/api/v2/spacemolt_faction_admin/post_mission"].post.description` says any number of pilots can accept a posting, but only the first to complete it gets paid. `paths["/api/v2/spacemolt/complete_mission"].post.description` does not mention a settled posting. None of those operations name this error code. The changelog does not name the route that returns it.

`components.schemas.V2Response.properties.error.properties.code` lists session, auth, and transport codes (`session_required`, `session_invalid`, `not_authenticated`, `rate_limited`, `command_error`, `invalid_params`, `invalid_json`, `payload_too_large`, `method_not_allowed`, `missing_action`, `unknown_command`). It does not list `mission_already_settled`. `Notification_action_error.code` says to switch on `code` rather than `message`, and that the code is the same set the synchronous error uses. That set is not enumerated there either.

A client cannot tell this failure from any other game error except by matching the human `message`, and cannot rely on the spec for the `abandon_mission` clear step.

Name `mission_already_settled` on the operation that returns it. Do not add a guide sentence for the first-to-complete rule. Those two operation descriptions already state it.
