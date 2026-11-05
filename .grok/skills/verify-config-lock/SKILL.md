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

Two saves of `config.json` are never in the critical section together, and when both finish, the file still has the default profile and the user agent.

Harm: one save reads the file, the other writes, and the first save writes its snapshot back. The default profile or the user agent disappears. The next command can run as the wrong profile.

This is a TLA+ model of `withConfigLock` in `src/config-lock.ts`, checked with TLC. `updateCliConfig` and `saveCliConfig` call it. Read every result with `/statechart`. Do not copy that skill's commands into this one. The spec is `verification/config-lock/ConfigLock.tla`, the TLC config is `verification/config-lock/ConfigLock.cfg`, and the chart labels are `verification/config-lock/view.mjs`. TLC is the 1.7.4 tools jar, on Temurin 25, which `/statechart` installs.

## The current code holds it

`/statechart` exits 0. `TypeOK`, `Exclusive`, `BothLanded`, `UnlinkMatches`, and `NoDeadlock` hold. TLC explored 2,380 states. Do not weaken `Exclusive` or `BothLanded`, and do not delete pid reuse, to keep the run passing. The chart is larger than 500 states, so a passing run writes no `chart.mmd`.

The lock body is `${pid} ${nonce}`. A saver unlinks a stale file only while it holds `config.json.lock.break`, and only after a second read still returns the body it judged. Release reads the lock and unlinks only its own nonce. `IntruderAcquire` writes `"reused"`, which carries the dead pid and is not the stale body.

Three constants reproduce the old breaks. Put each back to `TRUE` after the run.

- `Recheck = FALSE` deletes `still !== observed`. `Exclusive` breaks in 17 steps with no reused pid: the user-agent save deletes the lock after the profile save has taken it.
- `FreshToken = FALSE` makes the new process write the stale body. `Exclusive` breaks in 17 steps: the user-agent save's second read still matches, and it deletes the new process's lock.
- `ReapClaim = FALSE` skips the exclusive break file. Both saves can pass the second read, and `Exclusive` breaks in 17 steps.

`BothLanded` breaks on each of those paths continued until one setting is lost.

## When a change touches this

Run `/statechart` on this spec if a diff touches `withConfigLock`, `removeIfAbandoned`, or `dropOwn` in `src/config-lock.ts`, or `writeCliConfigAtomic`, `updateCliConfig`, or `saveCliConfig` in `src/session.ts`.

```bash
git diff da8b55cc543b3d6e7542cf2c95ac6b5b4fa24871 -- src/session.ts src/config-lock.ts
```

Replace that hash when the coverage record below moves. A change to `loadCliConfig`'s field parsing, with the lock calls left as they are, does not change this model.

## Coverage

| What | Where |
| --- | --- |
| Take the lock, or start the stale-lock read | `TryOpen` is `publishFresh`: `openSync(lockPath, "wx")` and the token write |
| Read the lock text | `ReadLock` is the first `readFileSync` in `removeIfAbandoned` |
| `kill(pid, 0)`, then `stat` | `Judge`. `lock = "none"` is `ENOENT` on that stat. `ESRCH` goes on to the break file. Any other `kill` result means the owner is still running |
| Take `config.json.lock.break` | `Claim`. `ReapClaim` is the exclusive `wx` |
| Second read | `Reread`. `Recheck` is `still !== observed`. This action does not unlink |
| Unlink the lock | `Unlink`. It does not read. `UnlinkMatches` says the body is still the one `Reread` accepted |
| Read and unlink the break file | `DropClaimRead` and `DropClaimUnlink` |
| Read and write `config.json` | `Load` and `Save` are `loadCliConfig` and `writeCliConfigAtomic` inside the lock |
| Release reads, then unlinks only its own body | `ReleaseRead` and `ReleaseUnlink` are `dropOwn` |
| Exit inside the critical section | `Crash` leaves the lock file |
| The dead pid is issued again, and that process writes a new body | `KernelReissue` and `IntruderAcquire`. `FreshToken` is the new nonce |
| That process reads its lock and unlinks only that body | `IntruderRead` and `IntruderUnlink` |

Sync commit: `da8b55cc543b3d6e7542cf2c95ac6b5b4fa24871`. That commit is the pid-only lock this model used to describe. The hash stays there. `config.json.lock.break.break` is the same removal rule one level down, and this spec has one `lease` variable, not that second file. Move the hash only after the update procedure below, only to a commit whose covered functions you have re-read, and only when that nested file is in the spec or the skill lists its absence next to the rename crash. A passing run of this spec does not by itself mean the nested file was checked.

## Bounds and assumptions

Two savers, one for the default profile and one for the user agent, plus at most one new process that receives the dead pid. The lock starts as that dead pid's file.

`open` plus the token write is one step. A reader of the empty file between them sees a non-numeric body and a fresh mtime. `removeIfAbandoned` asks the age again after the second read when the body has no pid, and a young file is left alone. The model has only numeric bodies, so that second stat is not an action. The 30 second timer, the 2 second acquire timeout, and the 10 millisecond retry sleep are not in the model. A numeric pid whose process is gone is removed without waiting for the 30 seconds. A live pid is kept at any age.

The model does not include permission errors, a crash of `rename`, a crash while holding the deepest break file, or a third saver. `saveCliConfig` uses the same lock and the same critical section as `updateCliConfig`. The session-file lock is a different lock.

## Read a failure

Replay the path against `removeIfAbandoned`, `dropOwn`, and `updateCliConfig`. Each step is one of the actions in the coverage table.

A failure of `Exclusive` or `BothLanded` on the config as written is a new bug. A failure of `TypeOK`, `UnlinkMatches`, or `NoDeadlock` is a new bug or a model that no longer matches the code. A step that `config-lock.ts` cannot take is a modeling error. Fix the model from the code, then rerun.

It is a modeling error when the chart's words no longer match a step the code can take, for example a delete of a lock whose owner `kill` just reported alive. `Judge` goes on to the break file only after `ESRCH`, and only when the lock file is still there.

## Update the model when the change is intended

1. Re-read `withConfigLock`, `removeIfAbandoned`, and `dropOwn` at the new commit. Write down each new or removed filesystem call between the first read and `unlink`, and any change to what `dropOwn` unlinks.
2. Edit `verification/config-lock/ConfigLock.tla` from that reading. Keep one filesystem call as one action. Change `Exclusive` or `BothLanded` only when the product change says the promise changed (a comment, a test, `CHANGELOG.md`, or the commit message). Record the old sentence and the new sentence, and cite that evidence. Keep `Recheck = TRUE` while `still !== observed` is in the code. Keep `FreshToken = TRUE` while a new publish writes a new nonce. Keep `ReapClaim = TRUE` while the break file is created with `wx`.
3. Read the result with `/statechart`, using `verification/config-lock/view.mjs` for the labels.
4. Break the new behavior the way the code would break. Set `Recheck = FALSE`, then `FreshToken = FALSE`, then `ReapClaim = FALSE`. Confirm `/statechart` fails each time. Put each constant back. Confirm the result is the pass above.
5. Move the sync commit in this skill only after steps 1–4. If step 1 found a call the model does not contain, do not move the hash.

## What a pass does not cover

A pass covers this model only: two savers, one reused pid, one break file, and numeric lock bodies. It does not cover a body with no pid, the second age check, `config.json.lock.break.break`, a crash while holding that file, every filesystem error, or the session-file writes in `saveSession`. The nonce does not join the second read to `unlink`. The break file is what keeps the other saver out of that window.
