---
name: verify-session-file
description: >
  Check the SpaceMolt CLI session file: after a login saves a password and a
  session refresh saves a new expiry, the file must still have the password
  and the newest expires_at. Use when editing saveSession, createSession,
  createTransientSession, getSession, or authenticateProfileSession in
  src/session.ts, or sendRequest, persistSuccessfulCredentials,
  recoverSession, or loginWithSession in src/api.ts, and before finishing a
  change that touches those writers.
user-invocable: true
---

# Verify the session file

## Property

After any interleaving of a login's credential save and a session-refresh save, the session file still has the password and the newest `expires_at`.

Harm: the next `not_authenticated` cannot recover, so the pilot is logged out mid-route.

This is a TLA+ model of the session-file writers in `src/session.ts` and `src/api.ts`, checked with TLC. Read every result with `/statechart`. Do not copy that skill's commands into this one. The spec is `verification/session-file/SessionFile.tla`, the TLC config is `verification/session-file/SessionFile.cfg`, and the chart labels are `verification/session-file/view.mjs`. TLC is the 1.7.4 tools jar, on Temurin 25, which `/statechart` installs.

## The current code breaks it

`/statechart` exits 1. That failure is the finding below. Do not weaken `PasswordKept`, `NewestExpiry`, or `RecoveryKeeps`, and do not delete the route command's whole-object save, to make the run pass. `TypeOK` and `NoDeadlock` hold. TLC explored 125 states and 173 steps. The chart draws 13 states and 28 arrows.

`PasswordKept` breaks. The shortest path has 6 steps:

0. Both commands are waiting.
1. Login writes a new session with no password.
2. The route command reads the session file and sees no password.
3. Login writes the login response, still with no password.
4. Login reads the session file.
5. Login writes the password onto the session it read.
6. The route command writes a new expiry and no password. The password is gone.

In the code that is: `createSession` for login writes the object from `createTransientSession` with no saved credentials. `getSession` on the route command reads that file, the session is not expired, and it holds the object. Login's `sendRequest` copies `expires_at` and `saveSession`s that same passwordless object. `persistSuccessfulCredentials` reads the file, sets `session.password`, and `saveSession`s. The route command's `sendRequest` then copies its own `expires_at` onto the object from step 2 and `saveSession`s the whole object. The password login just wrote is gone. The next `recoverSession` hits `if (!oldSession?.username || !oldSession?.password) return null`.

`NewestExpiry` breaks. The shortest path has 6 steps. Steps 0–4 match `PasswordKept`. Then:

5. The route command writes a new expiry and no password.
6. Login writes the password onto the session it read. The password is kept and the expiry is older.

`persistSuccessfulCredentials` had already read the file. The route command's `saveSession` landed a newer `expires_at`. Login's later `saveSession` writes the expiry from its read.

`RecoveryKeeps` breaks. The shortest path has 8 steps:

0. Both commands are waiting.
1. Recovery reads the saved password.
2. Login writes a new session with no password.
3. Login writes the login response, still with no password.
4. Login reads the session file.
5. Recovery writes a new session with no password.
6. Recovery writes that session with the password put back.
7. Recovery writes the re-login expiry and the password.
8. Login writes the password onto the session it read. The password is kept and the expiry is older.

Step 5 is `createSession()` inside `recoverSession`, with no saved credentials. That is the passwordless window. Steps 6 and 7 put the password back: the copy onto `newSession`, then `loginWithSession`'s `sendRequest` save. The window is not the last write. Step 8 is `persistSuccessfulCredentials` writing the older expiry it read at step 4, over the re-login expiry. The finished file has the password and the older expiry.

The chart's breaks mark names `PasswordKept`, `NewestExpiry`, and `RecoveryKeeps` together. "The password is gone" breaks `PasswordKept`. "The password is kept and the expiry is older" breaks `NewestExpiry`, and it breaks `RecoveryKeeps` when the other command is `recoverSession`.

The chart hides `Done`: both commands have already stopped, and that step changes nothing. It does not draw 43 other steps that stay on the same label and are not on a shortest bug path. On the recovery path it does draw two loops: one on "The file has no password" for the login response write, the login read, and the passwordless `createSession` write, and one on "The file has the password and the newest expiry" for the re-login save.

Deleting `session.password = payload.password` in `persistSuccessfulCredentials` is `WritePassword = FALSE` in the config. That fails earlier. `PasswordKept` and `RecoveryKeeps` then have a 5-step path: login writes the new session, writes the login response, reads the file, writes that read back without the password, and recovery finds no password and stops. The route command does not have to overwrite a password that login had saved. The constant stays `TRUE` because that assignment is in the code.

## When a change touches this

Run `/statechart` on this spec if a diff touches `saveSession`, `createSession`, `createTransientSession`, `getSession`, or `authenticateProfileSession` in `src/session.ts`, or `sendRequest`, `persistSuccessfulCredentials`, `recoverSession`, or `loginWithSession` in `src/api.ts`.

```bash
git diff fbd4f141c76d47fc638fc87120805a902195ebcc -- src/session.ts src/api.ts
```

Replace that hash when the coverage record below moves. A change to `acquireConfigLock` or `config.json` does not change this model. `verify-config-lock` covers that lock.

## Coverage

| What | Where |
| --- | --- |
| Login writes a new session with no password | `LoginCreate` is `createSession` from `getSessionForCommand` for `login`: `createTransientSession` with no saved credentials, then `saveSession` |
| Login writes the login response | `LoginSend` is `sendRequest` when `data.session` is present, on that same object |
| Login reads the file and sets the password | `PersistLoad` is `loadSession` in `persistSuccessfulCredentials`. The password assignment is synchronous, before `saveSession` |
| Login writes that object | `PersistSave`. `WritePassword` is `session.password = payload.password` |
| The route command reads the file | `GetSession` is `loadSession` in `getSession` when the session is present and `isSessionExpired` is false |
| The route command writes a new expiry | `RouteSend` is `sendRequest` when `data.session` is present, on the object `getSession` returned |
| Recovery reads the saved password | `RecoverLoad` is the `loadSession` at the start of `recoverSession`. No username or password returns null |
| Recovery writes a session with no password | `RecoverCreate` is `createSession()` with no saved credentials |
| Recovery puts the password back | `RecoverRestore` copies `username` and `password` from the loaded object, then `saveSession`. `expires_at` stays the value from `createTransientSession` |
| Recovery writes the re-login expiry | `RecoverLogin` is `sendRequest` inside `loginWithSession` |

Sync commit: `fbd4f141c76d47fc638fc87120805a902195ebcc`. That commit is the product code this describes. Move the hash only after the update procedure below, and only to a commit whose covered functions you have re-read. A run that still prints these same paths does not by itself mean a new edit was checked.

## Bounds and assumptions

One login and one other command, on one profile, so one session path. The other command is either a route command whose response includes `session`, or `recoverSession`. One route command does not do both: `sendRequest` does not save when `data.error` is set, and that is when `executeRoute` calls `recoverSession`. A third command is not in the model.

The file starts with a password. The pilot is already logged in. `isSessionExpired` is false, so `getSession` returns the loaded object and does not call `createSession`. When that object has a password it also has `player_id`, so `authenticateProfileSession` returns without `saveSession`. A passwordless object fails the `session.password` check and also returns without a save.

Each `createTransientSession` result and each `data.session.expires_at` is strictly newer than every `expires_at` already issued. The file starts at that same newest value. `saveSession` publishes the whole JSON object at `rename`. The open, write, and sync of the temp file are not a second session-file state: `loadSession` reads the session path, which still has the previous object until the rename.

The model does not include a failed rename, a crash between `recoverSession`'s two saves, permission errors, or `register` as its own command. `register` uses the same load, set password, and save shape, with the password taken from the result record. The retried command after `recoverSession` returns can `saveSession` again; that write is not in the model. Password in the model is presence. A stale earlier password still counts as present. The session id is not checked.

## Read a failure

Replay the path against `createSession`, `sendRequest`, `persistSuccessfulCredentials`, and `recoverSession`. Each step is one of the actions in the coverage table. `saveSession` replaces the whole file. It does not merge.

The three paths above are bugs in the current code. Say the password one as: login's `saveSession` puts the password on the file, then the route command's `saveSession` writes the object it read before that, which has no password. Say the expiry ones as: `persistSuccessfulCredentials` writes the expiry from its `loadSession`, and a newer `expires_at` that another `saveSession` already published is gone. Do not change product code unless the user asked.

A different path, or a failure of `TypeOK` or `NoDeadlock`, is a new bug or a model that no longer matches the code. A step that `session.ts` or `api.ts` cannot take is a modeling error. Fix the model from the code, then rerun. If these three paths remain, the finding remains.

It is a modeling error when a save keeps a field from the file that the in-memory object did not have, or when `recoverSession`'s second `saveSession` reads the file again. The password on that write is the one copied from the earlier `loadSession`.

## Update the model when the change is intended

1. Re-read `saveSession`, `createSession`, `getSession`, `sendRequest`, `persistSuccessfulCredentials`, and `recoverSession` at the new commit. Write down each new or removed session-file call, and any change to whether a save writes the in-memory object or a fresh read.
2. Edit `verification/session-file/SessionFile.tla` from that reading. Keep one session-file call as one action. Change `PasswordKept`, `NewestExpiry`, or `RecoveryKeeps` only when the product change says the promise changed (a comment, a test, `CHANGELOG.md`, or the commit message). Record the old sentence and the new sentence, and cite that evidence. Keep `WritePassword = TRUE` while `session.password = payload.password` is in `persistSuccessfulCredentials`.
3. Read the result with `/statechart`, using `verification/session-file/view.mjs` for the labels.
4. Break the new behavior the way the code would break. For the password assignment, that is `WritePassword = FALSE`, which is deleting `session.password = payload.password`. Confirm `/statechart` fails with the 5-step path in the section above. Put the constant back. Confirm the result is the three paths you expect.
5. Move the sync commit in this skill only after steps 1–4. If step 1 found a call the model does not contain, do not move the hash.

## What a pass does not cover

A pass is not the current result. The invariants fail. A future pass would cover this model only: one login and one other command, not a third writer, not `getSession` calling `createSession` because the session is inside the 60-second early-expiry window, not the `authenticateProfileSession` save when a password is present and `player_id` is missing, and not a crash that stops `recoverSession` between its two saves.
