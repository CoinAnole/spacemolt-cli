---
name: verify-cli-changelog
description: >
  Audit the SpaceMolt CLI against recent gameserver changelog entries after
  docs and API metadata are already current. Write recommended CLI changes to
  docs/cli-changelog-recommendations-<version>.md and list what already works.
  Use when the user says "docs and metadata have already been updated", asks
  to "verify that our cli works with these recent spacemolt changes", or
  points at spacemolt-docs/changelog.json for a CLI check. Do not bump the
  spacemolt-docs submodule or run generate:api.
user-invocable: true
---

# Verify CLI against changelog

Docs and generated metadata are already updated. Do **not** load
`update-spacemolt-docs`. Do **not** fetch the submodule, commit a pointer,
or run `bun run generate:api`.

## Steps

1. Read `spacemolt-docs/changelog.json` (`current_version` and `releases`).
   Baseline what the CLI already tracks:
   - `GENERATED_API_GAMESERVER_VERSION` in `src/generated/api-commands.ts`
   - `CHANGELOG.md` Unreleased notes and the last shipped gameserver mention
   Treat as in-scope: changelog versions newer than that baseline, plus items
   in the baseline window the CLI still mishandles.
2. For each in-scope changelog item, check whether the CLI already handles it:
   - Curated commands and aliases: `src/commands.ts`
   - Generated routes: `src/generated/api-commands.ts`
   - Display / tables: `src/display/`
   - Golden fixtures: `src/display/*.fixtures.ts` and `src/golden-output/`
   - Help and error copy as relevant
3. Prefer cached OpenAPI (`spacemolt-docs/openapi.json`). Do not set
   `LIVE_API_SYNC=1`.
4. Optional diagnostics (informational only):
   - `bun run report:fixture-schemas`
   - `bun run report:curated-commands`
5. In the chat report, list what already works and what the recommendations are.
6. Write the recommendations, and only those, to
   `docs/cli-changelog-recommendations-<version>.md`. `<version>` is
   `current_version` from `spacemolt-docs/changelog.json` with a leading `v`
   removed. Overwrite that file. It is gitignored with `docs/` except
   `docs/README.md`. Do not `git add` it.
   Start with one `#` heading and a short intro. The intro has no `##`
   heading. Then one section per recommendation:

   `## N. <title>`

   Number from 1 with no gaps. Put the gameserver version and the change in
   the body, including what not to invent when the spec is silent. No other
   `##` headings. If there are no recommendations, write the heading, the
   intro, and the line `No recommended CLI changes.`
   Tell the user the path. Do not implement. Do not start `/design` or
   `/implement-cli-changelog` unless the user asks.
