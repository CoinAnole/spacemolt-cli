---
name: update-spacemolt-docs
description: Update the spacemolt-docs git submodule to the latest commit, commit the pointer as "spacemolt-docs vX.Y.Z" using the gameserver version, regenerate API metadata with bun run generate:api, restamp src/test-support/fixture-schema-baseline.json with bun run report:fixture-schemas --update-baseline, commit those generated changes, run api-sync and baseline-stamp tests, and push those commits. Use when the user runs /update-spacemolt-docs, or asks to bump the spacemolt-docs submodule, sync docs to latest, or regenerate API metadata after a docs update. Do not load when the user says docs and metadata have already been updated, or when they only want to read changelog.json / openapi.json / ws.md.
---

# Update spacemolt-docs + regenerate API metadata

Bring the `spacemolt-docs` submodule to the latest gameserver docs, commit the pointer, regenerate bundled OpenAPI command metadata, restamp the fixture-schema baseline to that gameserver version, commit that output, verify with the API sync tests and the baseline stamp test, and push the commits this run created.

## Prerequisites

- Repo root is a git checkout of spacemolt-cli with submodule `spacemolt-docs`.
- Use Bun from `PATH`, or `~/.bun/bin/bun` if needed.
- Prefer the cached `spacemolt-docs/openapi.json` for local checks. Do **not** set `LIVE_API_SYNC=1` as part of this skill (live OpenAPI fetches are rate-limited).

## Steps

### 1. Update the submodule

```bash
git -C spacemolt-docs fetch origin
git -C spacemolt-docs checkout origin/master
git -C spacemolt-docs log -1 --oneline
```

Record `git rev-parse HEAD` before the first commit in this run. The tip commit message is the gameserver version (e.g. `v0.547.0`). If the tip is already current and the parent repo has no submodule delta, compare `generatedAtGameserver` in `src/test-support/fixture-schema-baseline.json` with `GENERATED_API_GAMESERVER_VERSION` in `src/generated/api-commands.ts`. If they match, say so and stop unless the user still wants metadata regenerated. If they differ, skip the submodule commit and continue at step 3.

### 2. Commit the submodule pointer

Only when `git status` shows `spacemolt-docs` has new commits:

```bash
git add spacemolt-docs
git commit -m "spacemolt-docs vX.Y.Z"
```

Replace `vX.Y.Z` with the actual version from step 1 (include the leading `v`). Message format is exact: `spacemolt-docs v0.547.0` — not bare `v0.547.0`, not a longer body.

### 3. Regenerate API metadata and restamp the baseline

If `src/generated/api-commands.ts` or `src/test-support/fixture-schema-baseline.json` already has uncommitted changes, stop and report them before rewriting either file.

```bash
bun run generate:api
bun run report:fixture-schemas --update-baseline
```

`generate:api` rewrites `src/generated/api-commands.ts` from `spacemolt-docs/openapi.json` (header and `GENERATED_API_GAMESERVER_VERSION` should match `vX.Y.Z`).

`--update-baseline` rewrites `src/test-support/fixture-schema-baseline.json` after `generate:api`, including when `api-commands.ts` did not change. `generatedAtGameserver` becomes `GENERATED_API_GAMESERVER_VERSION`, and `blockingDivergenceSignatures` becomes the current blocking fixture/schema drift. Leave fixtures, goldens, and curated commands unchanged.

The report command prints every divergence. Summarize added and removed signatures from `git diff -- src/test-support/fixture-schema-baseline.json`. Keep that list in the user report. The commit subject stays the one line in step 4.

### 4. Commit generated output

Use the same `vX.Y.Z` as the submodule tip, or as `GENERATED_API_GAMESERVER_VERSION` when this run did not move the submodule.

When `src/generated/api-commands.ts` is modified, commit it and the baseline if the baseline changed too:

```bash
git add src/generated/api-commands.ts src/test-support/fixture-schema-baseline.json
git commit -m "Regenerate API metadata for gameserver vX.Y.Z"
```

When only the baseline changed:

```bash
git add src/test-support/fixture-schema-baseline.json
git commit -m "test: restamp fixture-schema baseline to vX.Y.Z"
```

Stage only the paths that changed. If neither file changed, skip this commit and still run tests.

### 5. Verify

```bash
bun test src/api-sync.test.ts
bun test src/test-support/output-golden.test.ts -t "fixture schema baseline gameserver stamp matches bundled metadata"
```

The stamp test fails when `generatedAtGameserver` does not match `GENERATED_API_GAMESERVER_VERSION`. All tests must pass before pushing. If they fail, fix or report — do not leave a broken metadata commit unmentioned, and do not push until tests pass.

### 6. Push

When this run created commits and tests passed, push those commits to the current branch on `origin`. Compare `git rev-list --count <base>..HEAD` with `git rev-list --count @{upstream}..HEAD` (or `origin/<branch>..HEAD` when no upstream is set). The counts must match, so the push contains only commits created after the recorded base.

```bash
git status -sb
git push
```

If the current branch has no upstream, use `git push -u origin HEAD`.

If the branch is ahead by any commit this run did not create, stop and report those commits. Do not force-push. If the remote rejects the push, report the rejection and leave the local commits in place.

### 7. Report

Summarize for the user:

| Item | Value |
|------|--------|
| Previous docs tip / version | … |
| New docs tip / version | … |
| Submodule commit | hash + `spacemolt-docs vX.Y.Z` |
| Metadata commit | hash + message (or “no metadata change”) |
| Baseline | `generatedAtGameserver`, signature adds/removes, commit (or “included in the metadata commit” / “unchanged”) |
| New routes / notable schema diffs | brief list from `git diff` if useful |
| api-sync and baseline stamp tests | pass/fail |
| Push status | remote branch and range pushed, “nothing to push”, or the rejection |

## Notes

- Submodule-only historical commits in this repo use `spacemolt-docs vX.Y.Z`. Keep that convention.
- AGENTS.md also mentions bare `vX.Y.Z` when doing a combined docs+metadata task; for this skill prefer the commit sequence above so history matches recent practice.
- After large OpenAPI changes, the user may want follow-ups (curated command updates, golden fixtures). Leave those unless asked; mention if generated routes look promotion-worthy.
- Never commit session credentials or unrelated working-tree changes. Stage only `spacemolt-docs`, `src/generated/api-commands.ts`, and `src/test-support/fixture-schema-baseline.json` for these commits.
