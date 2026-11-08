---
name: verify-advisory-lock
description: >
  Check the SpaceMolt CLI advisory lock: two saves are never in the critical
  section together, and when both finish the session file still has the
  password and the newer expiry, and the id cache still has both keys, the
  older non-empty name, and both context contributions. Use when editing
  acquireAdvisoryLock, publishLock, removeStaleAdvisoryLock, or
  staleAdvisoryLockDecision in src/advisory-lock.ts; saveSession or
  mergePublishedSession in src/session.ts; or acquireIdCacheLock,
  removeStaleIdCacheLock, staleAdvisoryLockDecision, or mergeHints in
  src/id-cache.ts; and before finishing a change that touches those locks.
user-invocable: true
---

# Verify the advisory lock

## Property

Two saves are never in the critical section together, and when both finish the session file still has the password and the newer expiry, and the id cache still has both keys, the older non-empty name, and both context contributions.

## How to run

Run `/statechart` on `verification/advisory-lock`, using `view.mjs` for labels. Pass is `TypeOK`, `Exclusive`, `UnlinkMatches`, `SessionLanded`, `CacheLanded`, and `NoDeadlock`.

`Recheck`, `StartTime`, and `TokenMatch` stay `TRUE` in `verification/advisory-lock/AdvisoryLock.cfg` while the second read, the start-time check, and the release token compare exist in `src/advisory-lock.ts`. Set one to `FALSE` only when the model itself changes, confirm the matching invariant fails, then put it back. That mutation is not part of an ordinary edit. If a run with all three `TRUE` already fails, leave them `TRUE` and treat that failure as the result.

## Failure

A red `Exclusive`, `UnlinkMatches`, `SessionLanded`, or `CacheLanded` with the three constants `TRUE` is a product bug. A step `advisory-lock.ts` cannot take is a model bug. Fix the model from the code.

## Coverage

| Action | Filesystem call |
| --- | --- |
| `OpenWx` | `fs.promises.open(lockPath, "wx")` in `publishLock` |
| `WriteToken` | `handle.writeFile` of the token in `publishLock` |
| `ReadLock` | `readFileSync` of the lock, binding `observed`, in `removeStaleAdvisoryLock` |
| `Judge` | `statSync` after `lockOwnerAlive`, and `processStartedAfterLockForPid` when the owner is alive |
| `Reread` | `readFileSync` of the lock, binding `still`, then `staleAdvisoryLockDecision` |
| `Unlink` | `unlinkSync` of the lock in `removeStaleAdvisoryLock` |
| `Load` | `readSessionFile` and the id-cache read inside the one critical section |
| `Save` | `mergePublishedSession` and `mergeHints`, then both renames |
| `ReleaseRead` | `readFileSync` of the lock in the release closure |
| `ReleaseUnlink` | `unlinkSync` of the lock in the release closure |
| `Crash` | The process exits while holding the lock, or after `open` and before the token write, and leaves the file |
| `KernelReissue` | The kernel gives the dead pid to a new process |
| `IntruderOpen` | `open(wx)` in that new process's `publishLock` |
| `IntruderWrite` | `writeFile` of that process's token |
| `IntruderRead` | `readFileSync` of the lock in that process's release |
| `IntruderUnlink` | `unlinkSync` of the lock in that process's release, only when the token still matches |
| `AgeEmpty` | The empty file left by a crashed publisher passes `staleMs` |
| `Done` | Both savers have stopped, and this action changes nothing |

## The id-cache copy

`acquireIdCacheLock` does not call `acquireAdvisoryLock`. The copy differs in three ways:

- The token is minted once, before the retry loop. `acquireAdvisoryLock` mints a new token on every attempt.
- `src/id-cache.ts` has its own `staleAdvisoryLockDecision`. It does not take the two bodies. A dead owner is removed. An unparsable owner follows the age. A live owner is removed when that process started after the lock or the body is old.
- In `removeStaleIdCacheLock` the still-equals-observed check sits beside the decision: the decision runs, then a separate `readFileSync` binds `still`, and a mismatch returns before `unlinkSync`. In `removeStaleAdvisoryLock` that comparison is inside `staleAdvisoryLockDecision`, after `still` has already been read.

On the remove path the copy still reads the confirming bytes and then unlinks without looking again. `CacheLanded` applies to the copy while that split stays. Minting the token once does not change this model, which has one token identity per process.

## Out of model

The 30 second stale timer and the 2 second acquire timeout as real time, the 10 ms retry sleep, a third saver, a crash mid-rename of the session or cache file, username and `player_id` copying, a different session id, catalog dump, and the config-lock break file.
