---
name: verify-config-lock
description: >
  Check the SpaceMolt CLI config lock: two saves of config.json must not
  overlap, and a finished pair must keep both the default profile and the user
  agent. Use when editing withConfigLock, removeIfAbandoned, or dropOwn in
  src/config-lock.ts, or updateCliConfig, saveCliConfig, or writeCliConfigAtomic
  in src/session.ts, and before finishing a change that touches that lock.
user-invocable: true
---

# Verify the config lock

## Property

Two saves of `config.json` are never in the critical section together, and when both finish the file still has the default profile and the user agent.

## How to run

Run `/statechart` on `verification/config-lock`, using `view.mjs` for labels. Pass is `TypeOK`, `Exclusive`, `BothLanded`, `UnlinkMatches`, and `NoDeadlock`.

`Recheck`, `FreshToken`, and `ReapClaim` stay `TRUE` in `verification/config-lock/ConfigLock.cfg` while `still !== observed`, a new nonce, and the exclusive break file are in `src/config-lock.ts`. Set one to `FALSE` only when the model itself changes, and confirm `Exclusive` fails, then put it back. That mutation is not part of an ordinary edit.

A `loadCliConfig` parsing change does not need a TLC run.

## Failure

A red `Exclusive` or `BothLanded` with the three constants `TRUE` is a product bug. A step `config-lock.ts` cannot take is a model bug. Fix the model from the code.

## Coverage

| Action | Filesystem call |
| --- | --- |
| `TryOpen` | `openSync(lockPath, "wx")` in `publishFresh` |
| `ReadLock` | `readFileSync` of the lock, binding `observed`, in `removeIfAbandoned` |
| `Judge` | `statSync` in `readOwner` after `lockOwnerAlive` says the pid is gone |
| `Claim` | `openSync` of `config.json.lock.break` in `publishFresh` |
| `Reread` | `readFileSync` of the lock, binding `still`, in `removeIfAbandoned` |
| `Unlink` | `unlinkSync` of the lock in `removeIfAbandoned` |
| `DropClaimRead` | `readFileSync` of the break file in `dropOwn` |
| `DropClaimUnlink` | `unlinkSync` of the break file in `dropOwn` |
| `Load` | `readFileSync` of `config.json` in `loadCliConfig` |
| `Save` | `renameSync` onto `config.json` in `writeCliConfigAtomic` |
| `ReleaseRead` | `readFileSync` of the lock in `dropOwn` |
| `ReleaseUnlink` | `unlinkSync` of the lock in `dropOwn` |
| `Crash` | The process exits inside `withConfigLock` and leaves the lock file |
| `KernelReissue` | The kernel gives the dead pid to a new process |
| `IntruderAcquire` | `writeFileSync` of the new `${pid} ${nonce}` token in that process's `publishFresh` |
| `IntruderRead` | `readFileSync` of the lock in that process's `dropOwn` |
| `IntruderUnlink` | `unlinkSync` of the lock in that process's `dropOwn` |
| `Done` | Both savers have stopped, and this action changes nothing |

## Out of model

A lock body with no pid, the second age check, `config.json.lock.break.break`, a crash while holding that file, a `rename` crash, a third saver, the 30 second timer, the 2 second acquire timeout, and the session-file lock.
