---
name: verify-advisory-lock
description: >
  Check the SpaceMolt CLI advisory lock: two saves are never in the critical
  section together, and when both finish the session file still has the
  password and the newer expiry, and the id cache still has both keys, the
  older non-empty name, and both context contributions. Use when editing
  acquireAdvisoryLock, publishLock, removeStaleAdvisoryLock, or
  staleAdvisoryLockDecision in src/advisory-lock.ts; saveSession or
  mergePublishedSession in src/session.ts; or cacheIdsFromResponse or
  mergeHints in src/id-cache.ts; and before finishing a change that touches
  those locks.
user-invocable: true
---

# Verify the advisory lock

## Property

Two saves are never in the critical section together, and when both finish the session file still has the password and the newer expiry, and the id cache still has both keys, the older non-empty name, and both context contributions.

`cacheIdsFromResponse` calls `acquireAdvisoryLock`. One algorithm covers the session file and the id cache.

## How to run

Run `/statechart` on `verification/advisory-lock`, using `view.mjs` for labels. Pass is `TypeOK`, `Exclusive`, `UnlinkMatches`, `SessionLanded`, `CacheLanded`, and `NoDeadlock`.

`Recheck`, `StartTime`, `TokenMatch`, and `ReapClaim` stay `TRUE` in `verification/advisory-lock/AdvisoryLock.cfg` while the second read, the start-time check, the release token compare, and the break file are in `src/advisory-lock.ts`. Set one to `FALSE` only when the model itself changes, confirm `Exclusive` fails, then put it back. That mutation is not part of an ordinary edit. If a run with all four `TRUE` already fails, leave them `TRUE` and treat that failure as the result.

## Failure

A red `Exclusive`, `UnlinkMatches`, `SessionLanded`, or `CacheLanded` with the four constants `TRUE` is a product bug. A step `advisory-lock.ts` cannot take is a model bug. Fix the model from the code.

## Coverage

| Action | Filesystem call |
| --- | --- |
| `OpenWx` | `fs.promises.open(lockPath, "wx")` in `publishLock` |
| `WriteToken` | `handle.writeFile` of the token in `publishLock` |
| `ReadLock` | `readFileSync` of the lock, binding `observed`, in `removeStaleAdvisoryLock` |
| `Judge` | the first `statSync` after `lockOwnerAlive`, and `processStartedAfterLockForPid` when the owner is alive |
| `Claim` | `open` of `${lockPath}.break` with `wx`, taking the lease before the confirming read |
| `Reread` | `readFileSync` of the lock, binding `still`, in `removeStaleAdvisoryLock` |
| `SecondStat` | `statSync` of the lock when the confirming read still shows an empty body |
| `Unlink` | `unlinkSync` of the lock in `removeStaleAdvisoryLock`, enabled only while this saver holds `${lockPath}.break` |
| `DropClaimRead` | `readFileSync` of `${lockPath}.break` |
| `DropClaimUnlink` | `unlinkSync` of `${lockPath}.break`, only when it is still this saver's |
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

## Out of model

The 30 second stale timer and the 2 second acquire timeout as real time, a third saver, a crash mid-rename of the session or cache file, username and `player_id` copying, a different session id, catalog dump, and a crash while holding `.break.break`.
