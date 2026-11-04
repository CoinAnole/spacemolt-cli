---
name: verify-command-retry
description: >
  Check that SpaceMoltClient does not send one player command again after the
  server has applied it or returned a non-retryable error. Use when editing
  executeRoute, session recovery, HTTP 503 retry, rate-limit classification, or
  the retry budgets in src/api.ts, src/retry-after.ts, src/rate-limit.ts, or
  src/runtime.ts, and before finishing a change that touches those functions.
user-invocable: true
---

# Verify command retry

## Property

A player command is sent again only after an in-budget HTTP 503, an in-budget `rate_limited` wait of at most 60 seconds, or one session recovery that logs in.

Harm: another send is another mutation. A second `undock` leaves the station twice. The same loop sends attacks, trades, transfers, and jettisons.

The automatic reasons are only these three:

1. HTTP 503, from `requestWithServiceUnavailableRetry`. Three retries, so four sends, then that attempt ends. The client waits the `Retry-After` value rounded up to a whole second. With no header it waits 5 seconds. An explicit `0` waits 0, not 5.
2. `error.code === 'rate_limited'` whose wait is 0 through 60 seconds, from `isRateLimitAutoRetryWait`. Three retries, so four such responses, then stop. The wait is `retry_after`, otherwise `details.retry_after`, otherwise legacy `wait_seconds`, otherwise a `Retry-After` header (delta or HTTP date; a date in the past counts as 0). Above 60 seconds, or no wait, it does not send again. The client waits `Math.ceil(seconds) * 1000` milliseconds.
3. `not_authenticated`, `session_expired`, `session_invalid`, or `invalid_session`, from `executeRoute`. One recovery: `recoverSession` logs in as the saved pilot and the command is sent on the new session. A second such response stops. A rejected login, four HTTP 503s on that login, or no saved password stops without another command send. This path does not take the rate-limit sleep, even if the error also carries `retry_after`.

`ERROR_REGISTRY.retryable` and `isRetryableError` are pilot-facing hints. Unknown codes are retryable there (`?? true`). They are not automatic sends. `action_pending` means a mutation is already queued; HTTP 429 does not by itself resend.

Budgets stack. One command may see rate-limit retries, one session recovery, and a 503 attempt inside each try. For the sequence alphabet that is at most 20 sends: `(1 + 3 rate-limit retries + 1 recovery) * (1 + 3 HTTP 503 retries)`.

A flat HTTP 503 whose error string is `rate_limited` is both reasons. `withExhaustedServiceUnavailable` turns that string into `error.code === 'rate_limited'` after the fourth 503, and the outer loop may then spend the rate-limit budget. `Retry-After: 1` repeated that way stops at 16 sends. An object 503 (`error.code === 'service_unavailable'`) does not spend the rate-limit budget; four sends stop.

This is not a TLA+ model. `/statechart` does not apply. Nothing model-checks TypeScript. The check runs the real `SpaceMoltClient` on every sequence in the bound.

## When a change touches this

Run the check if a diff touches any of these:

- `SpaceMoltClient.execute`, `executeCommandConfig`, `executeRoute`, `sendRequest`, `recoverSession`, `loginWithSession` in `src/api.ts`
- `requestWithServiceUnavailableRetry`, `withExhaustedServiceUnavailable`, `retryAfterWaitSeconds`, `parseRetryAfterHeaderRaw` in `src/retry-after.ts`
- `isRateLimitAutoRetryWait`, `normalizeRateLimitError`, `extractErrorWaitSeconds`, `parseRetryAfterHeaderSeconds` in `src/rate-limit.ts`
- `MAX_RATE_LIMIT_RETRIES`, `MAX_SERVICE_UNAVAILABLE_RETRIES`, `MAX_SESSION_RECOVERY_ATTEMPTS`, `MAX_RATE_LIMIT_AUTO_RETRY_WAIT_SECONDS`, `DEFAULT_SERVICE_UNAVAILABLE_WAIT_SECONDS` in `src/runtime.ts`

```bash
git diff da9e594ead8a357785f9c30a711a8049830fa1ed -- src/api.ts src/retry-after.ts src/rate-limit.ts src/runtime.ts
```

Replace that hash when the coverage record below moves. Also search the diff for a new `continue` in `executeRoute` or `requestWithServiceUnavailableRetry`, and for a new caller of those two functions.

A change only inside `SessionManager.createTransientSession` or `SessionManager.authenticateProfileSession` (`src/session.ts`) is not this check. A change only inside `requestJson` (`src/transport.ts`) is not this check. Say so, and do not move the sync commit.

## Coverage

| What | Where |
| --- | --- |
| Command loop, recovery, resend | `executeRoute`, `recoverSession`, `loginWithSession`, `sendRequest` |
| HTTP 503 attempt | `requestWithServiceUnavailableRetry`, `withExhaustedServiceUnavailable` |
| Which error is an automatic rate-limit wait | `normalizeRateLimitError`, `isRateLimitAutoRetryWait`, `extractErrorWaitSeconds` |
| Budgets of 3, 3, 1, and 60 seconds, and the 5 second default 503 wait | `src/runtime.ts`, `MAX_RATE_LIMIT_AUTO_RETRY_WAIT_SECONDS` |

The command driven is `undock` (`POST /api/v2/spacemolt/undock`) through `client.execute`. Every command that uses `executeRoute` shares the loop, including `executeCommandConfig`.

Sync commit: `da9e594ead8a357785f9c30a711a8049830fa1ed`. That commit is the product code this describes. The checker and this skill were written against it and do not change those functions. Move the hash only after the update procedure below, and only to a commit whose covered functions you have re-read. A passing run by itself is not that confirmation: a new `continue` the alphabet never hits can still pass.

## Run

From the repo root, with Bun on `PATH` (confirmed with Bun 1.4.4; no other install):

```bash
bun run verify:command-retry
```

Pass prints `verify-command-retry: pass`, then the sequence count and probe count. It explores 32089 sequences and 101 probes and finishes in about a second. Exit 0.

Fail prints `verify-command-retry: fail` and exits 1. The first lines are the counterexample. Do not weaken the property, the alphabet, or a probe to make a red run green.

## Bounds and assumptions

The sequence search tries every order of these responses, and stops a branch when the client stops:

- HTTP 200 `structuredContent`
- HTTP 400 `trade_in_progress` with `retry_after: 1`
- HTTP 429 `rate_limited` with `retry_after: 1`
- HTTP 429 `rate_limited` with `retry_after: 61`
- HTTP 401 `session_expired` with `retry_after: 1`
- HTTP 503 object `service_unavailable` with `Retry-After: 1`

The probes then pin single shapes the alphabet does not interleave: every `ERROR_REGISTRY` code except `rate_limited` and the four session codes, plus `trade_in_progress`, `transaction_uncertain`, `accounting_pending`, `wreck_not_here`, `already_towing`, `trade_not_found`, and an unknown code, each with `retry_after: 1`; HTTP 429 `action_pending`; `ip_timed_out` whose message says 30 seconds; rate-limit waits 0, 60, 61, 1.5, missing, `wait_seconds`, `details.retry_after`, header delta, header date, flat 429, flat 200, and HTTP 200 object `rate_limited`; each session code once and twice; object 503 with header `1`, `0`, and absent; flat 503 `rate_limited` at 4 and at 16; recovery login `invalid_credentials`; four 503s on that login; `session_expired` with no saved password.

Assumptions, all enforced by the harness in `scripts/verify-command-retry.ts`:

- The session store is not `SessionManager`. `getSession` returns one saved session. `createSession` returns `sess_new` immediately and does not POST `/session`. `loadSession` keeps returning the original pilot. `saveSession` does not change that.
- The store's `authenticateProfileSession` returns null when `SessionManager.authenticateProfileSession` would return null without a request (missing username, missing password, or `player_id` set). If the real method would POST login, the harness throws. That POST is not checked. Recovery login in the sequence search succeeds and includes `session.player_id`, so the next authenticate call returns null.
- `sleep` records its argument and returns. Wall-clock waiting is not checked.
- The clock is `2026-01-01T00:00:00.000Z`.
- `undock` is POST with an empty object. Every resend must use that same payload and must not carry the password. The session id may change only after a session-auth response, and then it is `sess_new` (the id `createSession` returned and login authenticated). The login body id `sess_login_body` is not copied.
- `login` and `register`, `list_battles`, public commands, and fully unauthenticated routes are not driven. `executeRoute` has extra branches for them.
- `sendRequest` GET query building is not used.
- Argument parsing and `resolveCachedId` sit above this loop.
- `src/transport.ts` `requestJson` is not the transport under test. A non-JSON HTTP 503 becomes an object `service_unavailable` there before the loop; that object shape is checked, the synthesis function is not.
- No scripted body is both a command result and an error.

## Read a failure

Replay the printed responses in order against `executeRoute` and `requestWithServiceUnavailableRetry`. Each "sent undock" is one `transport.requestJson` to the undock URL.

It is a bug when every step is a branch those functions actually take, and the promise above forbids the extra send or requires a send that did not happen. Report it in those words. Do not change product code unless the user asked. Do not edit the promise so the current code passes.

It is a modeling error when the harness could not follow the code:

- `unexpected URL` — the client called an endpoint the store or the login script does not answer. Read the new call. If it can cause another player-command send, teach the harness that call and keep the property.
- `authenticateProfileSession would POST login` — recovery no longer leaves `player_id` set, or the saved session no longer has one. That POST lives in `SessionManager`, which this check does not run.
- `login retry continued after the scripted login responses` — the recovery login retried past the probe. Compare with `requestWithServiceUnavailableRetry` before calling it a product bug.
- `threw` — an exception escaped `execute`. Read it. A missing fixture is a modeling error. An exception on a response the alphabet is allowed to return is a bug.
- The budget paragraph from the top of the checker — a constant in `src/runtime.ts` or `MAX_RATE_LIMIT_AUTO_RETRY_WAIT_SECONDS` moved. More automatic sends are a bug unless the change says the new budget is intended.

A returned error code that does not match the last response is a bug when the client kept an earlier response or retried a terminal error. It is a modeling update when `withExhaustedServiceUnavailable` or `normalizeRateLimitError` now rewrites that code and the resend decision is still the one the property names. Update `surfacedCode` only in that second case.

A failure that looks like the scratch below is a bug: three `rate_limited` responses, then 503s, then `session_expired`, then another `rate_limited`, and undock goes out again. That sequence spends the three rate-limit retries before recovery. Resetting `rateLimitRetries` inside recovery makes it fail. The code at the sync commit does not reset it.

## Update the check when the change is intended

1. Re-read the covered functions at the new commit. Write down each new or removed `continue`, each new error code the loop treats as retryable, and each budget write.
2. Edit `scripts/verify-command-retry.ts` from that reading. `mayResend` is the promise. `ALPHABET` is the sequence search. `boundaryProbes` is the shapes that are not fully interleaved. `budgetDrift` is the pinned budgets. Change the property only when the product change says so (the code comment, a test, `CHANGELOG.md`, or the commit message). Record the old sentence and the new sentence, and cite that evidence.
3. Run `bun run verify:command-retry`.
4. Break the new behavior in the real code, the way a removed check would. Run the command again and confirm it fails. Revert that break. Run once more and confirm `verify-command-retry: pass`.
5. Move the sync commit in this skill to that commit only after steps 1–4. If step 1 found a new branch the checker still does not drive, do not move the hash. Either extend the checker or leave the hash and say what is unconfirmed.

## What a pass does not cover

Session creation's own retry loop (`SessionManager.createTransientSession`), the login POST inside `authenticateProfileSession`, `requestJson` in `src/transport.ts`, `login` / `register` bootstrap, and cached id rewriting. A pass does not mean the gameserver treated HTTP 503 as "not applied"; the client follows that reading, and this check does not speak for the server.
