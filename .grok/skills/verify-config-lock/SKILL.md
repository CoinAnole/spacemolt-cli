---
name: verify-config-lock
description: >
  Check the SpaceMolt CLI config lock: two saves of config.json must not
  overlap, and a finished pair must keep both the default profile and the user
  agent. Use when editing acquireConfigLock, removeStaleConfigLock,
  updateCliConfig, saveCliConfig, or writeCliConfigAtomic in src/session.ts,
  and before finishing a change that touches that lock.
user-invocable: true
---

# Verify the config lock

## Property

Two saves of `config.json` are never in the critical section together, and when both finish, the file still has the default profile and the user agent.

Harm: one save reads the file, the other writes, and the first save writes its snapshot back. The default profile or the user agent disappears. The next command can run as the wrong profile.

This is a TLA+ model of the lock in `src/session.ts`, checked with TLC. Read every result with `/statechart`. Do not copy that skill's commands into this one. The spec is `verification/config-lock/ConfigLock.tla`, the TLC config is `verification/config-lock/ConfigLock.cfg`, and the chart labels are `verification/config-lock/view.mjs`. TLC is the 1.7.4 tools jar, on Temurin 25, which `/statechart` installs.

## The current code breaks it

`/statechart` exits 1. That failure is the finding below. Do not weaken `Exclusive` or `BothLanded`, and do not delete pid reuse, to make the run pass. `TypeOK` and `NoDeadlock` hold. TLC explored 1,462 states.

`Exclusive` breaks. The shortest path has 11 steps:

0. A stale lock is waiting. The profile save is waiting. The user-agent save is waiting.
1. The profile save finds the lock already there.
2. The profile save reads the lock file.
3. The profile save sees that the lock owner is gone.
4. The user-agent save finds the lock already there.
5. The user-agent save reads the lock file.
6. The profile save deletes the lock.
7. The user-agent save sees that the lock owner is gone.
8. The exited process id is given to a new spacemolt.
9. That new spacemolt takes the lock.
10. The user-agent save deletes the lock.
11. The profile save takes the lock. Two saves overlap.

In `removeStaleConfigLock` that is: read the lock, `kill(pid, 0)` returns `ESRCH`, then the second read still sees the same pid text and `unlink` runs. The second read is the `still !== observed` test. It does not help when the new process was given the dead pid and wrote that same pid into a new lock file. The profile save then enters `updateCliConfig` while the new process is still between its lock and its `release`.

`BothLanded` breaks on the same path continued to 19 steps. Both saves read `config.json` before either write lands, each writes only its own field, and one setting is lost.

Removing the `still !== observed` test is `Recheck = FALSE` in the spec. That fails earlier, with no reused pid: the user-agent save deletes the lock after the profile save has already taken it, and both write. The constant stays `TRUE` because that test is in the code.

## When a change touches this

Run `/statechart` on this spec if a diff touches `acquireConfigLock`, `removeStaleConfigLock`, `writeCliConfigAtomic`, `updateCliConfig`, or `saveCliConfig` in `src/session.ts`.

```bash
git diff da8b55cc543b3d6e7542cf2c95ac6b5b4fa24871 -- src/session.ts
```

Replace that hash when the coverage record below moves. A change to `loadCliConfig`'s field parsing, with the lock calls left as they are, does not change this model.

## Coverage

| What | Where |
| --- | --- |
| Take the lock, or start the stale-lock read | `TryOpen` is `fs.openSync(lockPath, "wx")` and the pid write |
| Read the lock text | `ReadLock` is the first `readFileSync` in `removeStaleConfigLock` |
| `kill(pid, 0)` | `Judge`. `ESRCH` means the owner is gone. Any other result means the owner is still running |
| Second read and `unlink` | `Reread`. `Recheck` is `still !== observed` |
| Read and write `config.json` | `Load` and `Save` are `loadCliConfig` and `writeCliConfigAtomic` inside the lock |
| Drop the lock with no owner check | `Release` is the function `acquireConfigLock` returns |
| Exit inside the critical section | `Crash` leaves the lock file |
| The dead pid is issued again, and that process writes it into a new lock | `KernelReissue` and `IntruderAcquire` |

Sync commit: `da8b55cc543b3d6e7542cf2c95ac6b5b4fa24871`. That commit is the product code this describes. Move the hash only after the update procedure below, and only to a commit whose covered functions you have re-read. A run that still prints this same 11-step path does not by itself mean a new edit was checked.

## Bounds and assumptions

Two savers, one for the default profile and one for the user agent, plus at most one new process that receives the dead pid. The lock starts as that dead pid's file.

`open` plus the pid write is one step. A reader of the empty file between them sees a non-numeric pid and a fresh mtime, and `removeStaleConfigLock` returns false because `ownerAlive === undefined` and the file is younger than `CONFIG_LOCK_STALE_MS` (30 seconds). That timer, the 2 second acquire timeout, and the 10 millisecond retry sleep are not in the model. A numeric pid whose process is gone is removed without waiting for the 30 seconds. That matches the code: the age check runs only when the pid is not a safe positive integer.

The model does not include permission errors, a crash of `rename`, or a third saver. `saveCliConfig` uses the same lock and the same critical section as `updateCliConfig`.

## Read a failure

Replay the path against `removeStaleConfigLock` and `updateCliConfig`. Each step is one of the actions in the coverage table.

The 11-step path above is a bug in the current code. Say it as: both saves pass `kill(pid, 0)`, the kernel gives that pid to a new spacemolt, the second read still matches, and `unlink` removes the new process's lock. Do not change product code unless the user asked.

A different path, or a failure of `TypeOK` or `NoDeadlock`, is a new bug or a model that no longer matches the code. A step that `session.ts` cannot take is a modeling error. Fix the model from the code, then rerun. If the 11-step path remains, the finding remains.

It is a modeling error when the chart's words no longer match a step the code can take, for example a delete of a lock whose owner `kill` just reported alive. `Judge` goes to the second read only after `ESRCH`.

## Update the model when the change is intended

1. Re-read `acquireConfigLock`, `removeStaleConfigLock`, and `updateCliConfig` at the new commit. Write down each new or removed filesystem call between the first read and `unlink`, and any change to what `release` unlinks.
2. Edit `verification/config-lock/ConfigLock.tla` from that reading. Keep one filesystem call as one action. Change `Exclusive` or `BothLanded` only when the product change says the promise changed (a comment, a test, `CHANGELOG.md`, or the commit message). Record the old sentence and the new sentence, and cite that evidence. Keep `Recheck = TRUE` while `still !== observed` is in the code.
3. Read the result with `/statechart`, using `verification/config-lock/view.mjs` for the labels.
4. Break the new behavior the way the code would break. For the re-read, that is `Recheck = FALSE`, which is deleting `if (still !== observed) return false`. Confirm `/statechart` fails. Put the constant back. Confirm the result is the finding you expect.
5. Move the sync commit in this skill only after steps 1–4. If step 1 found a call the model does not contain, do not move the hash.

## What a pass does not cover

A pass is not the current result. The invariants fail. A future pass would cover this model only: two savers and one reused pid, not every filesystem error, and not the session-file writes in `saveSession`.
