---
name: verify-id-cache-merge
description: >
  Check the SpaceMolt id-cache merge: for one kind, id, and source command,
  the stored name and context come from the latest seenAt, and two finished
  saves of different keys both remain in the file. Use when editing
  mergeHints, cacheIdsFromResponse, saveIdCache, or loadIdCacheSync in
  src/id-cache.ts, and before finishing a change that touches those functions.
user-invocable: true
---

# Verify the id-cache merge

## Property

For one `(kind, id, sourceCommand)`, the stored name and context come from the sighting with the latest `seenAt`, and two finished saves of different keys both remain in `<profile>.ids.json`.

Harm: a name that used to be ambiguous becomes unique, so the next `attack`, `travel`, or transfer goes to the ship that still has that name, and a stale response can replace a newer location or drop the other id.

Two clauses. Each check says which clause it is.

1. Name and context for one key come from the latest `seenAt`. An empty name does not wipe a name the other sighting had. A context key only on the older sighting is kept. A context key on both comes from the newer sighting. The stored `seenAt` is that later timestamp. That is the same sighting, not a new promise.
2. Two completed `cacheIdsFromResponse` saves of different keys both still contain their keys.

Clause 1 is a data invariant of `mergeHints`. Nothing model-checks TypeScript. `mergeHints` is not exported, and this check does not copy it or export it. `scripts/verify-id-cache-merge.ts` writes one stored sighting, then calls the real `cacheIdsFromResponse`, which loads that file and calls `mergeHints`.

Clause 2 is which order the filesystem calls can run in. It is a TLA+ model, checked with TLC. Read every result with `/statechart`. Do not copy that skill's commands into this one. The spec is `verification/id-cache-merge/IdCacheMerge.tla`, the TLC config is `verification/id-cache-merge/IdCacheMerge.cfg`, and the chart labels are `verification/id-cache-merge/view.mjs`. TLC is the 1.7.4 tools jar, on Temurin 25, which `/statechart` installs. The model does not encode `mergeHints`. For two different keys, a save keeps every key in the snapshot it read, plus its own key. `MergeExisting` is that load and that part of the walk. `IdCacheLock` is the advisory lock from before that load through the final chmod. `FALSE` deletes the lock.

## The current code

Clause 1 passes. Clause 2 passes while `IdCacheLock` is `TRUE`. The scratches below are not the product. Do not weaken either clause, the bound, `MergeExisting`, or `IdCacheLock`, to make a run pass. Do not change product merge behavior unless the user asked.

### Clause 1

`bun run verify:id-cache-merge` prints `verify-id-cache-merge: pass` and `checks: 1458`. That is `response-newer failures: 0` and `stored-newer failures: 0`. It finishes in about half a second.

`mergeHints` groups `[...existing, ...newHints]` by `kind:id:sourceCommand` and folds each group from oldest `seenAt` to newest. `localeCompare` ties keep walk order, so the later entry is last. Each step binds `hint` to that next sighting and `previous` to the fold so far. The stored name is `hint.name || previous.name`. Context is `compactContext({ ...previous.context, ...hint.context })`. `seenAt` is `hint.seenAt`. A field copied from an older sighting is not treated as one the newer sighting reported. `sortNewest` only orders the saved list. It does not choose the fields.

The file keeps `location=sol` at `2026-05-18T00:01:00.000Z` when an older `list_ships` response carries `location=earth_station`. An empty newer name does not wipe `Manny`. A context key only the older sighting had stays. A context key on both comes from the newer sighting. Two hints with the same `seenAt` in one `get_system` keep the later poi's `type` and `system_id`, plus `has_base` from the earlier poi and the newer cache's `base_id`, name, and `seenAt`. An empty newer name keeps the later of two older `list_ships` rows, including that row's `is_active`.

Deleting `|| previous.name`, so the line is `name: hint.name`, is a different failure. `response-newer failures: 162` and `stored-newer failures: 162`. The first failure is `response-newer`: the stored name is `Manny`, the newer response name is empty, and the file's name is empty. Restore `hint.name || previous.name`. `response-newer failures` returns to 0.

### Clause 2

`/statechart` exits 0 with `IdCacheLock = TRUE` and `MergeExisting = TRUE`. `TypeOK`, `BothKeys`, and `NoDeadlock` hold. TLC explored 49 states and 50 steps. The chart draws 13 states and 15 arrows. It does not draw 32 steps that stay on one label. The view hides 2 `Done` steps.

`BothKeys` holds. The second save does not reach `existsSync` until the first save has renamed and released the lock. A writer in `"locked"` is its own sentence, "holds the id-cache lock and has not read yet", not the same sentence as `"start"`. "Both saves finished. The ship and the poi are in the cache" does not break. "Both saves finished. A saved id is gone" is not reached. "Both saves hold the id-cache lock" is not on the pass chart. That sentence is two writers inside the critical section, which `UNCHANGED lock` does not allow.

`cacheIdsFromResponse` calls `acquireIdCacheLock` after the early returns and before `loadIdCacheSync`. The early returns are `catalog_dump`, `response.error`, no result, no hints, `sessionPath === undefined`, and no cache path. `sessionPath === undefined` returns without calling `tryGetSessionPath()` again. Release runs after `saveIdCache` returns, which is after the final `hardenPermissions`. `open(wx)` of `${cachePath}.lock` is before `existsSync` on the cache path. The unlink that checks the token is after that chmod. No call was added between that `existsSync` and the final `hardenPermissions`. `loadIdCacheSync` still reads `<profile>.ids.json`. `rename` still replaces that path. It does not read the other temp file. The parent `mkdir` before `open(wx)` runs only when the parent is missing. The model assumes the parent is already there, so `DirExists` is still the `existsSync` inside `saveIdCache`, and that mkdir is not an action.

`IdCacheLock = FALSE` deletes the lock. `Acquire` and `Release` do not run. `Exists` and `SkipLoad` start at `"start"`. `/statechart` exits 1. TLC explored 148 states and 250 steps. The chart draws 15 states and 20 arrows. `BothKeys` breaks. The shortest path has 18 steps. The first load step is "sees that the id cache is not there yet". The last state is "Both saves finished. A saved id is gone". That is the finding for a build that does not take the lock. Put `IdCacheLock = TRUE` back.

`MergeExisting = FALSE` deletes `loadIdCacheSync` and merges with `[]`. `SkipLoad` is that deleted load. It is disabled while `MergeExisting` is `TRUE`. `/statechart` with `IdCacheLock = TRUE` exits 1. TLC explored 45 states and 46 steps. The shortest path has 22 steps. It is not 18, because `Acquire` and `Release` are steps. The trace contains "does not read the id cache". `BothKeys` fails because each `rename` writes only that save's key. Put `MergeExisting = TRUE` back. Do not delete `Acquire` or `Release` to keep that scratch at 18 steps.

The 18-step path, with `IdCacheLock = FALSE` and `MergeExisting = TRUE`:

0. The id cache is not there yet. Both saves are waiting
1. The list_ships save sees that the id cache is not there yet: The id cache is not there yet. The list_ships save is holding its read. The get_system save is waiting
2. The list_ships save sees that the cache directory is there: The id cache is not there yet. The list_ships save is holding its read. The get_system save is waiting
3. The list_ships save sets the cache directory's permissions: The id cache is not there yet. The list_ships save is holding its read. The get_system save is waiting
4. The get_system save sees that the id cache is not there yet: The id cache is not there yet. Both saves are holding the read they just took
5. The get_system save sees that the cache directory is there: The id cache is not there yet. Both saves are holding the read they just took
6. The get_system save sets the cache directory's permissions: The id cache is not there yet. Both saves are holding the read they just took
7. The get_system save opens its private temp file: The id cache is not there yet. Both saves are holding the read they just took
8. The list_ships save opens its private temp file: The id cache is not there yet. Both saves are holding the read they just took
9. The list_ships save writes the merged ids into that temp file: The id cache is not there yet. Both saves are holding the read they just took
10. The list_ships save syncs that temp file: The id cache is not there yet. Both saves are holding the read they just took
11. The list_ships save closes that temp file: The id cache is not there yet. Both saves are holding the read they just took
12. The list_ships save renames its temp file onto the id cache: The id cache has the ship. The get_system save is holding a read that is missing an id
13. The list_ships save sets the id cache's permissions after the rename: The id cache has the ship. The get_system save is holding a read that is missing an id
14. The get_system save writes the merged ids into that temp file: The id cache has the ship. The get_system save is holding a read that is missing an id
15. The get_system save syncs that temp file: The id cache has the ship. The get_system save is holding a read that is missing an id
16. The get_system save closes that temp file: The id cache has the ship. The get_system save is holding a read that is missing an id
17. The get_system save renames its temp file onto the id cache: The id cache has the poi. The list_ships save has renamed. The get_system save has renamed
18. The get_system save sets the id cache's permissions after the rename: Both saves finished. A saved id is gone

That path is the deleted lock. Both calls pass `existsSync` on a missing `<profile>.ids.json` and take `[]`. `mergeHints` therefore does not see the other key. `saveIdCache` writes that snapshot to a private temp file. `rename` replaces the cache path. The `get_system` rename runs after the `list_ships` rename, and the file keeps the poi only. The locked product cannot take this path: the second `existsSync` runs only after the first release.

The `IdCacheLock = FALSE` chart draws the directory check, permission changes, and temp-file calls as loops on three states. It does not draw 181 other steps that stay on one label. The view hides `Done`, and the report counts 4 of those. `Done` changes nothing: both saves have already stopped.

The `MergeExisting = FALSE` path, with `IdCacheLock = TRUE`, has 22 steps:

0. The id cache is not there yet. Both saves are waiting
1. The list_ships save takes the id-cache lock: The id cache is not there yet. The list_ships save holds the id-cache lock and has not read yet. The get_system save is waiting
2. The list_ships save does not read the id cache: The id cache is not there yet. The list_ships save is holding its read. The get_system save is waiting
3. The list_ships save sees that the cache directory is there: The id cache is not there yet. The list_ships save is holding its read. The get_system save is waiting
4. The list_ships save sets the cache directory's permissions: The id cache is not there yet. The list_ships save is holding its read. The get_system save is waiting
5. The list_ships save opens its private temp file: The id cache is not there yet. The list_ships save is holding its read. The get_system save is waiting
6. The list_ships save writes the merged ids into that temp file: The id cache is not there yet. The list_ships save is holding its read. The get_system save is waiting
7. The list_ships save syncs that temp file: The id cache is not there yet. The list_ships save is holding its read. The get_system save is waiting
8. The list_ships save closes that temp file: The id cache is not there yet. The list_ships save is holding its read. The get_system save is waiting
9. The list_ships save renames its temp file onto the id cache: The id cache has the ship. The get_system save has not read it yet
10. The list_ships save sets the id cache's permissions after the rename: The id cache has the ship. The get_system save has not read it yet
11. The list_ships save releases the id-cache lock: The id cache has the ship. The get_system save has not read it yet
12. The get_system save takes the id-cache lock: The id cache has the ship. The get_system save holds the id-cache lock and has not read yet. The list_ships save has renamed
13. The get_system save does not read the id cache: The id cache has the ship. The get_system save is holding a read that is missing an id
14. The get_system save sees that the cache directory is there: The id cache has the ship. The get_system save is holding a read that is missing an id
15. The get_system save sets the cache directory's permissions: The id cache has the ship. The get_system save is holding a read that is missing an id
16. The get_system save opens its private temp file: The id cache has the ship. The get_system save is holding a read that is missing an id
17. The get_system save writes the merged ids into that temp file: The id cache has the ship. The get_system save is holding a read that is missing an id
18. The get_system save syncs that temp file: The id cache has the ship. The get_system save is holding a read that is missing an id
19. The get_system save closes that temp file: The id cache has the ship. The get_system save is holding a read that is missing an id
20. The get_system save renames its temp file onto the id cache: The id cache has the poi. The list_ships save has renamed. The get_system save has renamed
21. The get_system save sets the id cache's permissions after the rename: The id cache has the poi. The list_ships save has renamed. The get_system save has renamed
22. The get_system save releases the id-cache lock: Both saves finished. A saved id is gone

Put `MergeExisting = TRUE` and `IdCacheLock = TRUE` back. The code calls `loadIdCacheSync` and walks `[...existing, ...newHints]`, and it holds the lock from before that load through the final chmod.

## When a change touches this

Run clause 1, and read clause 2 with `/statechart`, if a diff touches `mergeHints`, `cacheIdsFromResponse`, `loadIdCacheSync`, or `saveIdCache` in `src/id-cache.ts`.

```bash
git diff 6600460f82d7a60c081f738098e80b6e2cf323b3 -- src/id-cache.ts
```

Replace that hash when the coverage record below moves. A change only in `resolveCachedId` or the match helpers is `verify-id-resolution`, not this check. A change only in `extractIdHints` can make clause 1 stop before the merge and print that the `list_ships` response did not extract the sighting the bound asked for. That is a modeling error until you point the response shape at the new extractor. Do not move the sync commit for that print alone.

## Coverage

| What | Where |
| --- | --- |
| Fold one key from oldest `seenAt` to newest | `mergeHints`. The key is `kind:id:sourceCommand`. Ties keep walk order, so the later entry is last. `hint` is that next sighting and `previous` is the fold so far. Clause 1 calls it through `cacheIdsFromResponse` |
| Empty name keeps the other name | `name: hint.name \|\| previous.name` after that binding |
| Context overlay | `compactContext({ ...previous.context, ...hint.context })`. `seenAt` is `hint.seenAt` |
| Order the saved list | `sortNewest`. It does not choose name or context |
| Read the cache | `Exists` is `existsSync` in `loadIdCacheSync`. A missing file is `[]` and is not read. `ChmodCache` and `Read` are `hardenPermissions` and `readFileSync` when the file is there |
| See the directory, then the private temp file | `DirExists`, `ChmodDir`, `OpenTemp`, `WriteTemp`, `SyncTemp`, `CloseTemp` are `existsSync` on the parent, `hardenPermissions` on that directory, and `open` / `writeFile` / `sync` / `close` on the temp path |
| Replace `<profile>.ids.json` | `Rename` is `rename(tmpPath, cachePath)`. `ChmodFinal` is `hardenPermissions` on the cache path after that. `Rename` still replaces. It does not read the other temp |
| Load and keep keys already in the snapshot | `MergeExisting`. `FALSE` is `SkipLoad` and a rename of only this save's key |
| Take the id-cache lock | `Acquire` is `open(wx)` of `${cachePath}.lock` before `existsSync` on the cache path. The phase becomes `"locked"`. The other save cannot load while `lock` is held |
| Release the id-cache lock | `Release` is the token-checked unlink after the final `hardenPermissions`. `IdCacheLock = FALSE` disables `Acquire` and `Release`, and `Exists` / `SkipLoad` start at `"start"` |

Sync commit: `6600460f82d7a60c081f738098e80b6e2cf323b3`. That commit adds the lock. Re-read at that commit: `cacheIdsFromResponse` returns when `sessionPath === undefined` and does not call `tryGetSessionPath()` again. It creates a missing parent, then `open(wx)` on `${cachePath}.lock`, then `loadIdCacheSync`, `mergeHints`, and `saveIdCache`, and unlinks the lock after `saveIdCache` returns. No call was added between `existsSync` on the cache path and the final `hardenPermissions`. `loadIdCacheSync` still reads the cache path. `rename` still replaces it. `mergeHints` is unchanged: one key is folded oldest `seenAt` first, ties by walk order, then `name: hint.name || previous.name` with `hint` the next sighting and `previous` the fold so far. The hash is that product commit. Do not point it at a commit that only edits this skill. Move the hash only after the update procedure below, and only to a commit whose covered functions you have re-read. A run that still prints a `location=sol` failure does not by itself mean a new edit was checked.

## Bounds and assumptions

Clause 1 enumerates one `list_ships` ship, id `ship-1`. Names are `Manny`, `Rock Skipper`, and empty. `location` is `sol`, `earth_station`, or absent. `is_active` is `true`, `false`, or absent. Either the response is newer or the stored sighting is newer. The timestamps are `2026-05-18T00:00:00.000Z` and one minute later. Equal `seenAt` is not in the bound. A name of spaces is not in the bound. Numeric context values are not in the bound. The checker plants the stored sighting as JSON, then `cacheIdsFromResponse` performs the load, the merge, and the save.

Clause 2 is two saves, one `list_ships` ship `ship-1` and one `get_system` poi `sol_earth`, on one profile. The file starts missing. The parent directory is already there, so `mkdir` does not run. The product still creates a missing parent before `open(wx)` on the lock. That mkdir is outside the model. Each save adds one key. The temp name has the pid, `Date.now()`, and a random suffix, so `open(wx)` does not collide. `loadIdCacheSync` reads the cache path, which stays the previous file until `rename`. The system key from `extractIdHints` is not in the model. The product test still expects it.

The 500-hint cap is not checked. `MAX_HINTS` is not in the clause 1 bound or the model.

Assumptions:

- `response-renderer` awaits one `cacheIdsFromResponse`, so one command does not overlap itself. Clause 2 is two processes, or two calls that overlap on the awaits inside `saveIdCache`. The file lock is what keeps both keys. An in-process mutex is not this model.
- `catalog_dump`, a response error, an extract that returns no hints, `sessionPath === undefined`, and a missing cache path return before the lock. They are not saves.
- A failed `rename`, the temp `unlink` in that `catch`, and a chmod that throws are not in the model. `hardenPermissions` swallows a chmod error. The model is the calls that run when the save completes.
- Clause 1 does not check a second key in the same file. Clause 2 assumes a save keeps different keys it actually read. That is the walk over `existing`. If that walk stops, set `MergeExisting` to `FALSE` and treat the new `/statechart` path as the finding only after you re-read the code.
- `collapseHintsById` at resolve time is `verify-id-resolution`. This check is the file `mergeHints` writes.

## Read a failure

Clause 1: replay the printed stored sighting and the response through `cacheIdsFromResponse`. The actual line is what `loadIdCacheSync` returned.

A `stored-newer` location failure is a bug. Say it as: the file had `location=sol` at the later `seenAt`, the older `list_ships` response carried `earth_station`, and the file kept `earth_station`. Do not change product code unless the user asked.

A `response-newer` failure is a new bug, or the empty-name scratch. A shape line that says the `list_ships` response did not extract the bound's sighting is a modeling error. Point the ship object at what `extractIdHints` now emits, then rerun. If the merged fields are still wrong for that sighting, it is a bug.

Clause 2: replay the path against `loadIdCacheSync`, `saveIdCache`, and the lock around them. Each step is one action in the coverage table. With `IdCacheLock = TRUE`, `BothKeys` holds. The 18-step path is `IdCacheLock = FALSE`: both saves read a missing file, each `rename` writes only the keys it had merged from that read, and the later `rename` drops the ship. That is the scratch, not the locked product. Do not change product code unless the user asked.

A different path, or a failure of `TypeOK` or `NoDeadlock`, on the config whose constants are both `TRUE` is a new bug or a model that no longer matches the code. A step `id-cache.ts` cannot take is a modeling error. Fix the model from the code, then rerun. If `IdCacheLock = TRUE` loses a key, the finding is new. If `IdCacheLock = FALSE` is no longer the 18-step path, the scratch no longer matches the deleted lock.

It is a modeling error when a save reads the other save's temp file, or when `rename` merges with the cache path instead of replacing it. `loadIdCacheSync` reads `<profile>.ids.json`. `rename` replaces that path with the temp file's bytes.

## Update the check when the change is intended

1. Re-read `mergeHints`, `cacheIdsFromResponse`, `loadIdCacheSync`, and `saveIdCache` at the new commit. Write down any new or removed filesystem call between the cache `existsSync` and the final `hardenPermissions`, any change to the lock `open` before that `existsSync` or the lock `unlink` after the final chmod, and any change to which sighting supplies `name`, `context`, or `seenAt`.
2. Edit `scripts/verify-id-cache-merge.ts` and `verification/id-cache-merge/IdCacheMerge.tla` from that reading. Keep one filesystem call as one action. `Acquire` and `Release` are the lock-file calls. Every other action lists `lock` in `UNCHANGED`. Change clause 1 or `BothKeys` only when the product change says the promise changed (a comment, a test, `CHANGELOG.md`, or the commit message). Record the old sentence and the new sentence, and cite that evidence. Keep `MergeExisting = TRUE` while `loadIdCacheSync` and the walk over `existing` are in the code. Keep `IdCacheLock = TRUE` while the lock is held from before `loadIdCacheSync` through `saveIdCache`'s final `hardenPermissions`. Leave `MAX_HINTS` out of the bound. Do not add the system key to the model.
3. Run `bun run verify:id-cache-merge`. Read the model with `/statechart`, using `verification/id-cache-merge/view.mjs` for the labels. `"locked"` stays its own sentence.
4. Scratches, then put the constants back. Delete `|| previous.name` so the line is `name: hint.name`. Confirm the checker fails, and the first failure is `response-newer`: the stored name is `Manny`, the newer response name is empty, and the file's name is empty. Put the `||` back. Confirm `response-newer failures` is 0. Set `IdCacheLock = FALSE` with `MergeExisting = TRUE`. `/statechart` fails with the 18-step path whose first load step is "sees that the id cache is not there yet" and whose last state is "Both saves finished. A saved id is gone". Set `MergeExisting = FALSE` with `IdCacheLock = TRUE`. `/statechart` fails, and the trace contains "does not read the id cache". That path is longer than 18 steps because `Acquire` and `Release` run. Do not delete those steps to keep the number 18. Put both constants back to `TRUE`.
5. Move the sync commit in this skill only after steps 1–4, and only to a product commit whose covered functions you have re-read. Do not point the hash at a commit that only edits this skill. If step 1 found a call or a field rule the check does not cover, do not move the hash.

## What a pass does not cover

Clause 1 passes for this bound only: one ship key's name, context, and `seenAt` for the pairs above. It does not cover the 500-hint cap, equal `seenAt`, a name of spaces, numeric context, or every command `extractIdHints` can parse. Clause 2 passes for two saves of two different keys while the lock is held from before the load through the final chmod. It does not cover a third save or a failed `rename`. A pass does not cover a wedged holder, the 2 s timeout, the 30 s stale age, Linux `/proc` start time, or the cross-process gap between the stale lock's matching `readFileSync` and `unlinkSync`; TLC `NoDeadlock` assumes a holder in the critical section can finish. The nonce does not prove that gap.
