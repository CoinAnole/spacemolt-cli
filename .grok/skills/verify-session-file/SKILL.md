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

## The current code keeps it

`/statechart` exits 0. `TypeOK`, `PasswordKept`, `NewestExpiry`, `RecoveryKeeps`, and `NoDeadlock` hold. TLC explored 122 states and 170 steps. The chart draws 10 states and 19 arrows. It does not draw 60 steps that stay on the same label. The view hides 23 steps.

`saveSession` holds `${sessionPath}.lock` from `readFile` through `rename`. The read and the rename are one action. The next-state reads `filePassword`, `fileExpiry`, and `fileId` and writes `mergePublishedSession`. Same id copies an omitted username, password, and `player_id`. A new id does not. `expires_at` is the later parseable timestamp even when the ids differ. Incoming id wins. Lock-file `open` and `unlink` are not session-file calls, so they are not actions.

On the interleaving that used to drop the password, the route command still holds the passwordless object from `getSession`, and its `saveSession` is the same id with an empty password. The chart's `RouteSend` sentence on that step is "The route command writes a new expiry and keeps the password." The settled state is "The password and the newest expiry are both kept."

`WritePassword` stays `TRUE` because `session.password = payload.password` is in `persistSuccessfulCredentials`. `SessionLock` stays `TRUE` because that re-read is inside the lock.

Deleting `session.password = payload.password` is `WritePassword = FALSE`. `/statechart` exits 1. `PasswordKept` and `RecoveryKeeps` then have a 5-step path, with no `RouteSend`:

0. Both commands are waiting.
1. Login writes a new session with no password.
2. Login writes the login response, still with no password.
3. Login reads the session file.
4. Login writes the session it read, without the password.
5. Recovery reads the session file, finds no password, and stops. The password is gone.

`NewestExpiry` still holds. TLC reached 120 states and 168 steps. The chart draws 10 states and 21 arrows. It does not draw 60 steps that stay on the same label. The view hides 22 steps. `TypeOK` and `NoDeadlock` hold. The route command does not have to overwrite a password that was never saved.

Removing the locked re-read is `SessionLock = FALSE` with `WritePassword = TRUE`. `/statechart` exits 1. That is the lock scratch, not the current product. TLC reached 127 states and 175 steps. The chart draws 13 states and 28 arrows. It does not draw 43 steps that stay on the same label. The view hides 28 steps. `TypeOK` and `NoDeadlock` hold.

`PasswordKept` breaks. The shortest path has 6 steps:

0. Both commands are waiting.
1. Login writes a new session with no password.
2. The route command reads the session file and sees no password.
3. Login writes the login response, still with no password.
4. Login reads the session file.
5. Login writes the password onto the session it read.
6. The route command writes a new expiry and no password. The password is gone.

`NewestExpiry` breaks. The shortest path has 6 steps. Steps 0–4 match `PasswordKept`. Then:

5. The route command writes a new expiry and no password.
6. Login writes the password onto the session it read. The password is kept and the expiry is older.

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

Step 5 of that recovery path is `createSession()` inside `recoverSession`, with no saved credentials. That is the passwordless window. Steps 6 and 7 put the password back. The window is not the last write. Step 8 is `persistSuccessfulCredentials` writing the older expiry it read at step 4, which is what `SessionLock = FALSE` still does.

The chart hides `Done`: both commands have already stopped, and that step changes nothing. On the recovery path it draws two loops: one on "The file has no password" for the login response write, the login read, and the passwordless `createSession` write, and one on "The file has the password and the newest expiry" for the re-login save.

## When a change touches this

Run `/statechart` on this spec if a diff touches `saveSession`, `createSession`, `createTransientSession`, `getSession`, or `authenticateProfileSession` in `src/session.ts`, or `sendRequest`, `persistSuccessfulCredentials`, `recoverSession`, or `loginWithSession` in `src/api.ts`.

```bash
git diff 954559c607545847f645deb6038115d66a9de402 -- src/session.ts src/api.ts
```

Replace that hash when the coverage record below moves. A change to `acquireConfigLock` or `config.json` does not change this model. `verify-config-lock` covers that lock. `open` and `unlink` of `${sessionPath}.lock` are not session-file calls.

## Coverage

| What | Where |
| --- | --- |
| Login writes a new session with no password | `LoginCreate` is `createSession` from `getSessionForCommand` for `login`: `createTransientSession` with no saved credentials, then `saveSession`. Incoming id is new, so the merge does not copy a password |
| Login writes the login response | `LoginSend` is `sendRequest` when `data.session` is present, on that same object. `saveSession` re-reads, merges, and renames |
| Login reads the file and sets the password | `PersistLoad` is `loadSession` in `persistSuccessfulCredentials`. The password assignment is synchronous, before `saveSession`. It copies `fileId` |
| Login writes that object | `PersistSave`. `WritePassword` is `session.password = payload.password`. The save re-reads under the lock and keeps the later `expires_at` |
| The route command reads the file | `GetSession` is `loadSession` in `getSession` when the session is present and `isSessionExpired` is false. No lock |
| The route command writes a new expiry | `RouteSend` is `sendRequest` when `data.session` is present, on the object `getSession` returned. Same id and an empty password copies the password |
| Recovery reads the saved password | `RecoverLoad` is the `loadSession` at the start of `recoverSession`. No username or password returns null |
| Recovery writes a session with no password | `RecoverCreate` is `createSession()` with no saved credentials. A new id does not inherit the password |
| Recovery puts the password back | `RecoverRestore` copies `username` and `password` from the loaded object, then `saveSession`. `expires_at` stays the value from `createTransientSession` |
| Recovery writes the re-login expiry | `RecoverLogin` is `sendRequest` inside `loginWithSession` |

Each save action's comment names `readFile`, `mergePublishedSession`, and `rename`. `SessionLock = FALSE` is that re-read removed: the save writes the in-memory object.

Sync commit: `954559c607545847f645deb6038115d66a9de402`. That commit is the product code this describes. Move the hash only after the update procedure below, and only to a commit whose covered functions you have re-read. A run that still prints the `SessionLock = FALSE` paths does not by itself mean a new edit was checked. Do not move the hash if the re-read is not in the save-action formula.

## Bounds and assumptions

One login and one other command, on one profile, so one session path. The other command is either a route command whose response includes `session`, or `recoverSession`. One route command does not do both: `sendRequest` does not save when `data.error` is set, and that is when `executeRoute` calls `recoverSession`. A third command is not in the model.

The file starts with a password and `fileId = "initial"`. The pilot is already logged in. `isSessionExpired` is false, so `getSession` returns the loaded object and does not call `createSession`. When that object has a password it also has `player_id`, so `authenticateProfileSession` returns without `saveSession`. A passwordless object fails the `session.password` check and also returns without a save.

Each `createTransientSession` result and each `data.session.expires_at` is strictly newer than every `expires_at` already issued. The file starts at that same newest value. While `SessionLock` is `TRUE`, `saveSession` re-reads the session path under the lock and renames the merged object. Readers (`GetSession`, `PersistLoad`, `RecoverLoad`) do not take the lock. A reader sees the previous object or the new one. The open, write, and sync of the temp file are not a second session-file state. Lock-file `open` and `unlink` are not session-file calls.

The model does not include a failed rename, a crash between `recoverSession`'s two saves, permission errors, or `register` as its own command. `register` uses the same load, set password, and save shape, with the password taken from the result record. The retried command after `recoverSession` returns can `saveSession` again; that write is not in the model. Password in the model is presence. A stale earlier password still counts as present. The session id is not checked, except as the same-id test that decides whether an omitted password is copied. Incoming id wins.

## Read a failure

Replay the path against `createSession`, `sendRequest`, `persistSuccessfulCredentials`, and `recoverSession`. Each step is one of the actions in the coverage table.

With `SessionLock = TRUE` and `WritePassword = TRUE`, `PasswordKept`, `NewestExpiry`, and `RecoveryKeeps` hold. A failure of one of them is a regression: a save wrote a stale object, or the merge copied a password onto a new id, or it dropped a later `expires_at`. Say a lost password as: the route command's `saveSession` wrote the object it read before the password landed, and the locked re-read did not copy it back. Say a lost expiry as: `persistSuccessfulCredentials` wrote the expiry from its `loadSession`, and a newer `expires_at` already on disk was not kept. Do not change product code unless the user asked.

The `WritePassword = FALSE` 5-step path and the `SessionLock = FALSE` 6-step and 8-step paths are the scratches above. They are not the current product. Put the constants back after reading them.

A different path, or a failure of `TypeOK` or `NoDeadlock`, is a new bug or a model that no longer matches the code. A step that `session.ts` or `api.ts` cannot take is a modeling error. Fix the model from the code, then rerun.

It is a modeling error when a save keeps a password across a changed session id, or when `recoverSession`'s second `saveSession` reads the file again for the password. The password on that write is the one copied from the earlier `loadSession`. Keeping the later `expires_at` on that write is the merge, not a second read of the password.

## Update the model when the change is intended

1. Re-read `saveSession`, `createSession`, `getSession`, `sendRequest`, `persistSuccessfulCredentials`, and `recoverSession` at the new commit. Write down each new or removed session-file call, and any change to whether a save writes the in-memory object or a fresh read. `open` and `unlink` of `${sessionPath}.lock` are not session-file calls.
2. Edit `verification/session-file/SessionFile.tla` from that reading. Keep one session-file call as one action. The locked re-read and the rename stay one action unless the code splits them. Change `PasswordKept`, `NewestExpiry`, or `RecoveryKeeps` only when the product change says the promise changed (a comment, a test, `CHANGELOG.md`, or the commit message). Record the old sentence and the new sentence, and cite that evidence. Keep `WritePassword = TRUE` while `session.password = payload.password` is in `persistSuccessfulCredentials`. Keep `SessionLock = TRUE` while `saveSession` re-reads under the lock.
3. Read the result with `/statechart`, using `verification/session-file/view.mjs` for the labels.
4. Break the new behavior the way the code would break. For the password assignment, that is `WritePassword = FALSE`, which is deleting `session.password = payload.password`. Confirm `/statechart` fails with the 5-step path above. Put the constant back. For the locked re-read, that is `SessionLock = FALSE`. Confirm `/statechart` fails with the 6-step and 8-step paths above. Put the constant back. Confirm the pass.
5. Move the sync commit in this skill only after steps 1–4. If step 1 found a call the model does not contain, do not move the hash. Do not move the hash if the re-read is not in the save-action formula.

## What a pass does not cover

A pass covers this model only: one login and one other command, not a third writer, not `getSession` calling `createSession` because the session is inside the 60-second early-expiry window, not the `authenticateProfileSession` save when a password is present and `player_id` is missing, and not a crash that stops `recoverSession` between its two saves. It does not cover a wedged holder, the 2 second lock timeout, the 30 second stale age, or Linux `/proc` start time. TLC `NoDeadlock` assumes a holder in the critical section can finish. The cross-process gap between the stale lock's matching `readFileSync` and `unlinkSync` is one syscall and is not proved.
