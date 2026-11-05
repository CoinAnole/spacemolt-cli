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

Clause 2 is which order the filesystem calls can run in. It is a TLA+ model, checked with TLC. Read every result with `/statechart`. Do not copy that skill's commands into this one. The spec is `verification/id-cache-merge/IdCacheMerge.tla`, the TLC config is `verification/id-cache-merge/IdCacheMerge.cfg`, and the chart labels are `verification/id-cache-merge/view.mjs`. TLC is the 1.7.4 tools jar, on Temurin 25, which `/statechart` installs. The model does not encode `mergeHints`. For two different keys, a save keeps every key in the snapshot it read, plus its own key. `MergeExisting` is that load and that part of the walk.

## The current code breaks it

Clause 2 exits 1. That failure is the finding below. Clause 1 passes. Do not weaken either clause, the bound, or `MergeExisting`, to make a run pass. Do not change product merge behavior unless the user asked.

### Clause 1

`bun run verify:id-cache-merge` prints `verify-id-cache-merge: pass` and `checks: 1458`. That is `response-newer failures: 0` and `stored-newer failures: 0`. It finishes in about half a second.

`mergeHints` walks `[...existing, ...newHints]` and compares `seenAt` with `localeCompare`. When the stored sighting's `seenAt` is greater, that sighting is `hint` and the older response is `previous`. Otherwise the hint later in the walk stays `hint`. The stored name is `hint.name || previous.name`. Context is `compactContext({ ...previous.context, ...hint.context })`. `seenAt` is `hint.seenAt`. `sortNewest` only orders the list after the map is built. It does not choose the fields.

The file keeps `location=sol` at `2026-05-18T00:01:00.000Z` when an older `list_ships` response carries `location=earth_station`. An empty newer name does not wipe `Manny`. A context key only the older sighting had stays. A context key on both comes from the newer sighting.

Deleting `|| previous.name`, so the line is `name: hint.name`, is a different failure. `response-newer failures: 162` and `stored-newer failures: 162`. The first failure is `response-newer`: the stored name is `Manny`, the newer response name is empty, and the file's name is empty. Restore `hint.name || previous.name`. `response-newer failures` returns to 0.

### Clause 2

`/statechart` exits 1. `TypeOK` and `NoDeadlock` hold. TLC explored 148 states and 250 steps. The chart draws 15 states and 20 arrows. The breaks mark is `BothKeys`, on "Both saves finished. A saved id is gone". "Both saves finished. The ship and the poi are in the cache" does not break.

`BothKeys` breaks. The shortest path has 18 steps:

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

In the code that is: both calls pass `existsSync` on a missing `<profile>.ids.json` and take `[]`. `mergeHints` therefore does not see the other key. `saveIdCache` writes that snapshot to a private temp file. `rename` replaces the cache path. The `get_system` rename runs after the `list_ships` rename, and the file keeps the poi only. There is no lock between `loadIdCacheSync` and `rename`.

Two overlapping `cacheIdsFromResponse` calls, `list_ships` for `ship-1` and `get_system` for `poi` `sol_earth`, left only `poi:sol_earth:get_system` on 30 of 30 trials. The same two calls, one after the other, left both keys. The lost ship is this path, not a merge of two different keys inside one save.

The chart draws the shortest path's directory check, permission changes, and temp-file calls as loops on three states. It does not draw 181 other steps that stay on one label. The view hides `Done`, and the report counts 4 of those. `Done` changes nothing: both saves have already stopped.

`MergeExisting = FALSE` deletes `loadIdCacheSync` and merges with `[]`. `SkipLoad` is that deleted load. It is disabled while the constant is `TRUE`. `/statechart` still exits 1. TLC explored 104 states and 186 steps. The shortest path is still 18 steps and still ends with the ship gone. The load steps say "does not read the id cache":

0. The id cache is not there yet. Both saves are waiting
1. The list_ships save does not read the id cache: The id cache is not there yet. The list_ships save is holding its read. The get_system save is waiting
2. The list_ships save sees that the cache directory is there: The id cache is not there yet. The list_ships save is holding its read. The get_system save is waiting
3. The list_ships save sets the cache directory's permissions: The id cache is not there yet. The list_ships save is holding its read. The get_system save is waiting
4. The list_ships save opens its private temp file: The id cache is not there yet. The list_ships save is holding its read. The get_system save is waiting
5. The get_system save does not read the id cache: The id cache is not there yet. Both saves are holding the read they just took

Put `MergeExisting = TRUE` back. The 18-step path whose first load step is "sees that the id cache is not there yet" returns. The constant stays `TRUE` because the code calls `loadIdCacheSync` and walks `[...existing, ...newHints]`.

## When a change touches this

Run clause 1, and read clause 2 with `/statechart`, if a diff touches `mergeHints`, `cacheIdsFromResponse`, `loadIdCacheSync`, or `saveIdCache` in `src/id-cache.ts`.

```bash
git diff f791142d560807aa34a2987365e0c6f825c5267c -- src/id-cache.ts
```

Replace that hash when the coverage record below moves. A change only in `resolveCachedId` or the match helpers is `verify-id-resolution`, not this check. A change only in `extractIdHints` can make clause 1 stop before the merge and print that the `list_ships` response did not extract the sighting the bound asked for. That is a modeling error until you point the response shape at the new extractor. Do not move the sync commit for that print alone.

## Coverage

| What | Where |
| --- | --- |
| Walk stored hints, then the response, and keep the later `seenAt` | `mergeHints`. The key is `kind:id:sourceCommand`. `hint` is the newer sighting and `previous` is the older one. Equal `seenAt` does not swap, so the hint later in the walk wins. Clause 1 calls it through `cacheIdsFromResponse` |
| Empty name keeps the other name | `name: hint.name \|\| previous.name` after that binding |
| Context overlay | `compactContext({ ...previous.context, ...hint.context })`. `seenAt` is `hint.seenAt` |
| Order the saved list | `sortNewest`. It does not choose name or context |
| Read the cache | `Exists` is `existsSync` in `loadIdCacheSync`. A missing file is `[]` and is not read. `ChmodCache` and `Read` are `hardenPermissions` and `readFileSync` when the file is there |
| See the directory, then the private temp file | `DirExists`, `ChmodDir`, `OpenTemp`, `WriteTemp`, `SyncTemp`, `CloseTemp` are `existsSync` on the parent, `hardenPermissions` on that directory, and `open` / `writeFile` / `sync` / `close` on the temp path |
| Replace `<profile>.ids.json` | `Rename` is `rename(tmpPath, cachePath)`. `ChmodFinal` is `hardenPermissions` on the cache path after that |
| Load and keep keys already in the snapshot | `MergeExisting`. `FALSE` is `SkipLoad` and a rename of only this save's key |

Sync commit: `f791142d560807aa34a2987365e0c6f825c5267c`. That commit is the `mergeHints` change clause 1 describes. Re-read at that commit: `mergeHints` compares `seenAt`, then keeps `name: hint.name || previous.name` with `hint` the newer sighting and `previous` the older one. No filesystem call was added or removed. Clause 2's 18-step path is still the current product and is not a reason to refuse this hash. The checker and this skill do not change `mergeHints`. Move the hash only after the update procedure below, and only to a commit whose covered functions you have re-read. A run that still prints a `location=sol` failure does not by itself mean a new edit was checked. The lock PR is what re-runs `MergeExisting = FALSE` and moves the hash again.

## Bounds and assumptions

Clause 1 enumerates one `list_ships` ship, id `ship-1`. Names are `Manny`, `Rock Skipper`, and empty. `location` is `sol`, `earth_station`, or absent. `is_active` is `true`, `false`, or absent. Either the response is newer or the stored sighting is newer. The timestamps are `2026-05-18T00:00:00.000Z` and one minute later. Equal `seenAt` is not in the bound. A name of spaces is not in the bound. Numeric context values are not in the bound. The checker plants the stored sighting as JSON, then `cacheIdsFromResponse` performs the load, the merge, and the save.

Clause 2 is two saves, one `list_ships` ship `ship-1` and one `get_system` poi `sol_earth`, on one profile. The file starts missing. The parent directory is already there, so `mkdir` does not run. Each save adds one key. The temp name has the pid, `Date.now()`, and a random suffix, so `open(wx)` does not collide. `loadIdCacheSync` reads the cache path, which stays the previous file until `rename`.

The 500-hint cap is not checked. `MAX_HINTS` is not in the clause 1 bound or the model.

Assumptions:

- `response-renderer` awaits one `cacheIdsFromResponse`, so one command does not overlap itself. Clause 2 is two processes, or two calls that overlap on the awaits inside `saveIdCache`.
- `catalog_dump`, a response error, and an extract that returns no hints return before the load. They are not saves.
- A failed `rename`, the temp `unlink` in that `catch`, and a chmod that throws are not in the model. `hardenPermissions` swallows a chmod error. The model is the calls that run when the save completes.
- Clause 1 does not check a second key in the same file. Clause 2 assumes a save keeps different keys it actually read. That is the walk over `existing`. If that walk stops, set `MergeExisting` to `FALSE` and treat the new `/statechart` path as the finding only after you re-read the code.
- `collapseHintsById` at resolve time is `verify-id-resolution`. This check is the file `mergeHints` writes.

## Read a failure

Clause 1: replay the printed stored sighting and the response through `cacheIdsFromResponse`. The actual line is what `loadIdCacheSync` returned.

A `stored-newer` location failure is a bug. Say it as: the file had `location=sol` at the later `seenAt`, the older `list_ships` response carried `earth_station`, and the file kept `earth_station`. Do not change product code unless the user asked.

A `response-newer` failure is a new bug, or the empty-name scratch. A shape line that says the `list_ships` response did not extract the bound's sighting is a modeling error. Point the ship object at what `extractIdHints` now emits, then rerun. If the merged fields are still wrong for that sighting, it is a bug.

Clause 2: replay the path against `loadIdCacheSync` and `saveIdCache`. Each step is one action in the coverage table. The 18-step path above is a bug in the current code. Say it as: both saves read a missing file, each `rename` writes only the keys it had merged from that read, and the later `rename` drops the ship. Do not change product code unless the user asked.

A different path, or a failure of `TypeOK` or `NoDeadlock`, is a new bug or a model that no longer matches the code. A step `id-cache.ts` cannot take is a modeling error. Fix the model from the code, then rerun. If the 18-step path remains, the finding remains.

It is a modeling error when a save reads the other save's temp file, or when `rename` merges with the cache path instead of replacing it. `loadIdCacheSync` reads `<profile>.ids.json`. `rename` replaces that path with the temp file's bytes.

## Update the check when the change is intended

1. Re-read `mergeHints`, `cacheIdsFromResponse`, `loadIdCacheSync`, and `saveIdCache` at the new commit. Write down any new or removed filesystem call between the cache `existsSync` and the final `hardenPermissions`, and any change to which sighting supplies `name`, `context`, or `seenAt`.
2. Edit `scripts/verify-id-cache-merge.ts` and `verification/id-cache-merge/IdCacheMerge.tla` from that reading. Keep one filesystem call as one action. Change clause 1 or `BothKeys` only when the product change says the promise changed (a comment, a test, `CHANGELOG.md`, or the commit message). Record the old sentence and the new sentence, and cite that evidence. Keep `MergeExisting = TRUE` while `loadIdCacheSync` and the walk over `existing` are in the code. Leave `MAX_HINTS` out of the bound.
3. Run `bun run verify:id-cache-merge`. Read the model with `/statechart`, using `verification/id-cache-merge/view.mjs` for the labels.
4. This commit's step 4 is the empty-name scratch only. Delete `|| previous.name` so the line is `name: hint.name`. Confirm the checker fails, and the first failure is `response-newer`: the stored name is `Manny`, the newer response name is empty, and the file's name is empty. Put the `||` back. Confirm `response-newer failures` is 0. Clause 2's 18-step path is still the current product and is not a reason to refuse this hash. The hash points at the `mergeHints` commit, whose filesystem calls are unchanged. The lock PR is what re-runs `MergeExisting = FALSE` and moves the hash again.
5. Move the sync commit in this skill only after steps 1–4. If step 1 found a call or a field rule the check does not cover, do not move the hash.

## What a pass does not cover

Clause 1 passes for this bound only: one ship key's name, context, and `seenAt` for the pairs above. It does not cover the 500-hint cap, equal `seenAt`, a name of spaces, numeric context, or every command `extractIdHints` can parse. Clause 2 still fails. A future pass of that model would cover two saves of two different keys only. It would not cover a third save or a failed `rename`.
