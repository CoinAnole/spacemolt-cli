---
name: verify-subscription-follow
description: >
  Check --follow for subscribe_market and subscribe_observation: after
  subscribe succeeds, stopping, a get_notifications error, or the end of the
  loop unsubscribes once, a thrown poll only changes the delay, and one
  response keeps each string id once. Use when editing runSubscriptionFollow,
  deduplicatedNotifications, bestEffortUnsubscribe, interruptibleSleep, or
  throttledRetryAfter in src/subscription-follow.ts, and before finishing a
  change that touches those functions.
user-invocable: true
---

# Verify subscription follow

## Property

Two clauses. Each check says which clause it is.

1. After `subscribe_market` or `subscribe_observation` succeeds, stopping (`running = false`, including the SIGINT and SIGTERM listener), a `get_notifications` response with `response.error`, or the follow loop ending any other way sends exactly one `unsubscribe_market` or `unsubscribe_observation`. A poll that throws does not unsubscribe. It only changes the delay. The delays are 2, 4, 8, 16, then 30 seconds, and a successful poll sets the delay back to `FOLLOW_POLL_INTERVAL_SECONDS` (10) unless `throttledRetryAfter` returns a wait.
2. Inside one `get_notifications` response, `deduplicatedNotifications` keeps a notification with a string `id` once across `structuredContent`, `result`, and `notifications`, and does not drop a notification that has no string `id`.

Harm: the market or observation subscription stays on after Ctrl+C, or one alert is printed twice and a bot acts twice.

Clause 1 is which order those events can run. It is a TLA+ model of `runSubscriptionFollow` after subscribe succeeds, checked with TLC. Read every result with `/statechart`. Do not copy that skill's commands into this one. The spec is `verification/subscription-follow/SubscriptionFollow.tla`, the TLC config is `verification/subscription-follow/SubscriptionFollow.cfg`, and the chart labels are `verification/subscription-follow/view.mjs`. This run used TLC2 2.19 on Temurin 25, which `/statechart` installs.

Clause 2 is a data invariant of the real function. Nothing model-checks TypeScript. `/statechart` does not apply to clause 2. Do not hand-model `deduplicatedNotifications`. It is exported. `scripts/verify-subscription-follow.ts` calls it.

## Clause 1 holds

`/statechart` exits 0. `TypeOK`, `NoUnsubscribeWhileFollowing`, `ExactlyOneUnsubscribe`, `DelayMatches`, and `NoDeadlock` hold. TLC reached 119 states and 175 steps. The chart draws 10 states and 19 arrows.

The chart groups the 2, 4, 8, and 16 second waits as one label, "Waiting out a failed poll". The 30 second cap is its own label. `DelayMatches` is what checks the sequence. The chart does not draw the 7 steps that start the wait, because that step stays on the waiting label. The view hides the 35 steps that stutter after "Unsubscribed once". A wait that fails shares the Ctrl+C arrow. Its label is "you press Ctrl+C [during the wait] or the wait fails".

## Clause 2 holds

`bun run verify:subscription-follow` exits 0 and prints `verify-subscription-follow: pass`, the property line, `checks: 119172`, the bound line, and `elapsed_ms`. It finishes in about 1.5 seconds. That transcript does not contain `empty-string id failures:` or `other failures:`. Those lines are printed only when the script fails. Exit 0 means both counters were 0.

A string `id`, including `""`, is kept once. `"a"`, `"b"`, `"0"`, and `" a "` are kept once. `" a "` is not `"a"`. `"0"` is not `0`. A notification with no `id`, or with `null`, `false`, or `0`, is kept every time and is not deduped. The follow loop calls `deduplicatedNotifications(response)` with a new `Set` each poll.

In `deduplicatedNotifications` that is: `typeof id === "string"`, then `seenIds.has(id)` skips a repeat and `seenIds.add(id)` records it, including `""`. A non-string id is pushed and not recorded. Do not drop the empty string from the bound, and do not change `expectKeep` so that `""` is not a string id.

## When a change touches this

Run clause 1 with `/statechart`, and clause 2 with the command below, if a diff touches `runSubscriptionFollow`, `interruptibleSleep`, `bestEffortUnsubscribe`, `deduplicatedNotifications`, `throttledRetryAfter`, `RETRY_DELAYS_SECONDS`, or `FOLLOW_POLL_INTERVAL_SECONDS` in `src/subscription-follow.ts`.

```bash
git diff 038ece044c825c53aa4d861ec20f5e9744ff4ad4 -- src/subscription-follow.ts
```

Replace that hash when the coverage record below moves. A change only in `validateSubscriptionFollow` does not change this model or this bound. Say so, and do not move the sync commit.

## Coverage

| What | Where |
| --- | --- |
| Enter the sleep | `BeginSleep` is `while (running)` and the start of `interruptibleSleep` |
| The sleep ends and `get_notifications` starts | `SleepFinished` |
| The sleep rejects and `stop()` did not abort it | `SleepFailed` is the outer `catch`, then `finally` |
| Ctrl+C or SIGTERM during the sleep | `SignalDuringSleep` is `stop` |
| The poll returns and the next delay is 10 seconds | `GetNotificationsOk` |
| The poll returns and `throttledRetryAfter` returns a wait | `GetNotificationsThrottled`. The model uses 7 seconds for that wait |
| The poll throws and the loop continues | `GetNotificationsFails`. `UnsubscribeOnPollThrow` is false. The catch does not call `bestEffortUnsubscribe` |
| The poll returns `response.error` | `GetNotificationsError`. `renderResponse` returns, then the loop breaks |
| Ctrl+C during `get_notifications` | `SignalDuringPoll`. The poll is not aborted. `wake` is already cleared |
| The poll settles after that signal | `GetNotificationsAfterStop`. `if (!running) break` runs before the delay update and before the `response.error` check |
| The one unsubscribe call | `BestEffortUnsubscribe`. `CleanupGuard` is `if (!cleanupAttempted)` |
| That call finishes and the listeners are removed | `UnsubscribeFinished`. `bestEffortUnsubscribe` does not call `execute` again |
| Ctrl+C during the unsubscribe call | `SignalDuringCleanup`. `stop` does not unsubscribe |

Clause 2 is `deduplicatedNotifications` on one response. The follow loop calls it with a new set each poll. The checker does too.

Sync commit: `038ece044c825c53aa4d861ec20f5e9744ff4ad4`. That commit is the product code this describes. The checker and this skill do not change `runSubscriptionFollow` or `deduplicatedNotifications`. Move the hash only after the update procedure below, and only to a commit whose covered functions you have re-read. A run that still prints this pass, or a clause 1 run that still reaches 119 states, does not by itself mean a new edit was checked.

## Bounds and assumptions

Clause 1 is one follow loop. It starts after `handler.render` has returned 0, the SIGINT and SIGTERM listeners are registered, `running` is true, `retryIndex` is 0, and `delaySeconds` is 10. A failed subscribe is out of scope. `handler.run` or `handler.render` returning non-zero, or throwing, returns before the `try`/`finally` and does not call `bestEffortUnsubscribe`. There is no action for that return.

`stop` is idempotent. A second signal after `running` is false does nothing. The model has one such signal during the sleep, during `get_notifications`, or during the unsubscribe call.

The code increments `retryIndex` without bound. After the step that selects the 30 second cap, further throws keep that delay. The model lumps those later indexes at 5. The unsubscribe counter stops at 2, which is enough to show a second call. A third call is still 2.

The throttle wait in the model is 7, the value in the follow test, chosen because it is not 2, 4, 8, 16, 30, or 10. Any other positive finite `retry_after` is that same branch. `throttledRetryAfter` is not exported, and this check does not copy it. The model does not decide which of `structuredContent`, `result`, or the response object supplied the wait.

The unsubscribe name is fixed before the loop: `subscribe_market` uses `unsubscribe_market`, and `subscribe_observation` uses `unsubscribe_observation`. The model counts that one call. It does not choose the wrong name.

Follow mode's `response.error` path returns from `renderResponse` on the human error branch, before `cacheIdsFromResponse`. The next await is `bestEffortUnsubscribe`. A signal in that gap is `SignalDuringCleanup`.

`bestEffortUnsubscribe` prints a warning when the cleanup call fails. It still counts as the one call.

Clause 2 tries every list of 0, 1, or 2 notifications on each of the three sources. Each note has `type: "market"` and an id of `"a"`, `"b"`, `""`, no id, or `0`. `structuredContent` and `result` are each either a record or the JSON string of that record. Order is `structuredContent`, then `result`, then `notifications`. The first note with a given string id is the one that must remain. Notes with the same id and different `mark` fields are how the checker sees which one remained.

Eight probes sit outside that grid: a second call keeps `id: "a"` again, the same object in two envelopes is kept once, `false` is not dropped and not deduped, `null` and `0` and `"0"` stay distinct, `" a "` is not `"a"`, a top-level note with no `type` is still deduped by string id, a broken JSON envelope contributes nothing, and an empty response keeps nothing.

Assumptions:

- An envelope note with no string `type` is not in the grid. `notificationsFromEnvelope` drops it. The top-level probe is the case with no `type`.
- A `null` entry in `response.notifications` is not in the bound. Reading `.id` throws, the outer `catch` runs, and `finally` unsubscribes once. That throw is not a model action.
- Integers above `2^53` are not in the bound. `parseApiJson` is what a JSON envelope goes through. The follow unit test covers one such integer.
- `presentNotifications` and `displayNotifications` are not checked. Clause 2 ends at the array `deduplicatedNotifications` returns.
- `seenIds` passed in by a caller is not the follow loop. The checker uses the default, a new set per call.

## Run

Clause 1: read `verification/subscription-follow/SubscriptionFollow.tla` with `/statechart`, using `verification/subscription-follow/view.mjs` for the labels. Pass is exit 0 and the five rules above. The chart is the picture of this model, not a proof beyond it.

Clause 2, from the repo root, with Bun on `PATH` (this run used Bun 1.4.4; no other install):

```bash
bun run verify:subscription-follow
```

The current result is the pass above. Exit 0. A run that prints `verify-subscription-follow: pass` means the empty string is kept once. Do not drop the empty string from the bound, and do not change `expectKeep` so that `""` is not a string id.

## Read a failure

Clause 1: replay the path against `runSubscriptionFollow`. Each step is one action in the coverage table.

`NoUnsubscribeWhileFollowing` or `ExactlyOneUnsubscribe` failing on the current constants is a new bug or a model that no longer matches the code. The constants are `CleanupGuard = TRUE` and `UnsubscribeOnPollThrow = FALSE`. A step the function cannot take is a modeling error. Fix the model from the code, then rerun.

It is a modeling error when the poll throw unsubscribes, when `stop` during `get_notifications` unsubscribes before the poll settles, or when a successful poll leaves `retryIndex` above 0. The catch continues. `if (!running) break` is first after the poll. The success path sets `retryIndex = 0` before it reads `response.error`.

`DelayMatches` failing is the delay sequence. Say it as: after a thrown poll the next sleep is not the next of 2, 4, 8, 16, 30, or a successful poll did not return the delay to 10 seconds or to the server's wait.

Setting `UnsubscribeOnPollThrow = TRUE` is the catch also calling `bestEffortUnsubscribe`. `/statechart` exits 1. `NoUnsubscribeWhileFollowing` breaks. The shortest path has 3 steps:

0. Waiting 10s for the next poll
1. the wait starts: Waiting 10s for the next poll
2. the wait ends: Polling notifications
3. the notification poll fails and the subscription is removed: Unsubscribed while still following

`ExactlyOneUnsubscribe` breaks on that path continued to 5 steps. The next wait starts, then the wait fails, and the loop has stopped with an unsubscribe already sent. `DelayMatches` still holds. Put the constant back. The result is the clause 1 pass above.

`CleanupGuard = FALSE` is deleting `if (!cleanupAttempted)`. It does not fail. TLC still reaches 119 states and the same five rules hold. `finally` has one call to `bestEffortUnsubscribe`, and nothing else calls it, so the guard has no second call to refuse. Keep the constant `TRUE` while that `if` is in the code. If a second call site appears, add that action. Do not treat a still-green `CleanupGuard = FALSE` run as proof the guard was checked.

A successful poll that sets the next delay to 2 instead of `FOLLOW_POLL_INTERVAL_SECONDS` fails `DelayMatches` in 3 steps and ends at "the notification poll succeeds". Put `delay' = PollInterval` back.

Clause 2: replay the printed notes through `deduplicatedNotifications`. The actual line is what the real function returned.

If both notifications with a string `id` of `""` are returned, that is a regression to a truthiness test: `if (id && seenIds.has(id))` skips the empty string, and `if (id) seenIds.add(id)` does not record it. Do not drop `""` from the bound, and do not change `expectKeep` so that `""` is not a string id. Do not change product code unless the user asked.

`other failures` above 0 is a new bug, or one of the scratches below. A thrown call, or a malformed envelope that invents a notification, is a bug unless the input is not a record the function claims to read. Do not edit `expectKeep` so the current code passes.

Deleting the `seenIds` check (`if (false && typeof id === "string" && seenIds.has(id)) continue`, or deleting `if (seenIds.has(id)) continue`) fails with `other failures: 62644`. The first failure is two notes with `id: "a"` on `response.notifications`. Both are returned. Put `if (seenIds.has(id)) continue` and `seenIds.add(id)` back inside `if (typeof id === "string")`.

Dropping a notification with no string id (`if (typeof id !== "string") continue` before `deduplicated.push`) fails with `other failures: 110379`. The first failure is one note with `type: "market"` and no `id`. The actual array is empty. `""` is a string, so `empty-string id failures` stays 0 on that scratch. Remove that `continue`.

After either scratch is reverted, the script prints the pass above and does not print `empty-string id failures:` or `other failures:`. Every failure transcript prints the label `empty-string id failures:`, including `empty-string id failures: 0`. A truthiness regression is a non-zero `empty-string id failures` count, or both notes with `id: ""` being returned. The no-id scratch prints `empty-string id failures: 0` and is not that regression.

## Update the check when the change is intended

1. Re-read `runSubscriptionFollow`, `interruptibleSleep`, `bestEffortUnsubscribe`, and `deduplicatedNotifications` at the new commit. Write down each new or removed await between the successful subscribe and the unsubscribe call, and any change to which notifications are candidates or which string counts as an id.
2. Edit `verification/subscription-follow/SubscriptionFollow.tla` and `scripts/verify-subscription-follow.ts` from that reading. Keep one await or one loop decision as one action. Change clause 1 or clause 2 only when the product change says the promise changed (a comment, a test, `CHANGELOG.md`, or the commit message). Record the old sentence and the new sentence, and cite that evidence. Keep `UnsubscribeOnPollThrow = FALSE` while the `get_notifications` catch does not call `bestEffortUnsubscribe`. Keep `CleanupGuard = TRUE` while `if (!cleanupAttempted)` is in `finally`. Keep `expectKeep` treating every string, including `""`, as an id that is kept once.
3. Read clause 1 with `/statechart`, using `verification/subscription-follow/view.mjs` for the labels. Run `bun run verify:subscription-follow`.
4. Break the new behavior the way the code would break. For the catch, set `UnsubscribeOnPollThrow = TRUE` and confirm the 3-step path above. Put `FALSE` back. For dedup, delete the `seenIds` check, confirm `other failures` is not 0 and the first pair is `id: "a"`, and put the check back. Confirm clause 1 is the pass above. Confirm clause 2 exits 0 and prints `verify-subscription-follow: pass` and `checks: 119172`, and does not print `empty-string id failures:` or `other failures:`. Every failure transcript prints the label `empty-string id failures:`, including when the count is 0. A truthiness regression is a non-zero `empty-string id failures` count, or both notes with `id: ""` being returned. Do not drop `""` from the bound, and do not change `expectKeep`.
5. Move the sync commit in this skill only after steps 1–4. If step 1 found an await or an id rule the check does not cover, do not move the hash.

## What a pass does not cover

Clause 1's pass is this model only: one loop, one signal, retry indexes through the 30 second cap, and one sample throttle wait. It is not a failed subscribe, not the scan inside `throttledRetryAfter`, not a wrong unsubscribe command name, and not a third unsubscribe call counted separately from a second.

Clause 2's pass covers the lists in the bound, not every notification a server can send, and not `presentNotifications`. The empty string is kept once inside one response. It is not deduped across polls.
