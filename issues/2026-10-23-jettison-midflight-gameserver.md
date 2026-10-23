---
kind: contradiction
---

# Mid-flight jettison does not fail fast (gameserver 0.645.0)

Cached docs stamp: `spacemolt-docs/openapi.json` `info.x-gameserver-version` `v0.647.1`. `spacemolt-docs/changelog.json` `current_version` `0.647.1`. Release `0.645.0` is on page 1.

## `docs/storage.md` says jettison fails mid-flight

Ship Cargo:

> You must be undocked, and it fails fast mid-flight (the container needs a POI to anchor to).

`paths["/api/v2/spacemolt/jettison"].post.description` and the same sentence on `paths["/api/v2/spacemolt_storage/jettison"].post.description`:

> Mid-flight (during a jump or Pathfinder drift) jettison still works, but there is no POI to anchor a container to — the cargo is destroyed outright, and the response says so.

Changelog `0.645.0`:

> This repair does not extend to jettison during flight. Deep space still operates a strict no-refunds policy.

`guides/packages.md` already says a mid-flight jettison destroys the cargo. Replace "it fails fast mid-flight (the container needs a POI to anchor to)" with the destruction rule. A mid-flight jettison still succeeds and voids the cargo. Leave the rest of that bullet as it is.
