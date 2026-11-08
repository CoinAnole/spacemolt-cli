---
name: verify-command-retry
description: >
  Check the SpaceMolt CLI command retry: a player command is sent again only
  after an in-budget HTTP 503, an in-budget rate_limited wait of at most 60
  seconds, or one session recovery that logs in. Use when editing executeRoute,
  recoverSession, or loginWithSession in src/api.ts,
  requestWithServiceUnavailableRetry, withExhaustedServiceUnavailable,
  retryAfterWaitSeconds, or parseRetryAfterHeaderRaw in src/retry-after.ts,
  isRateLimitAutoRetryWait, normalizeRateLimitError, extractErrorWaitSeconds,
  parseRetryAfterHeaderSeconds, or MAX_RATE_LIMIT_AUTO_RETRY_WAIT_SECONDS in
  src/rate-limit.ts, or MAX_RATE_LIMIT_RETRIES, MAX_SERVICE_UNAVAILABLE_RETRIES,
  MAX_SESSION_RECOVERY_ATTEMPTS, or DEFAULT_SERVICE_UNAVAILABLE_WAIT_SECONDS in
  src/runtime.ts, and before finishing a change that touches those paths.
user-invocable: true
---

# Verify command retry

## Property

A player command is sent again only after an in-budget HTTP 503, an in-budget rate_limited wait of at most 60 seconds, or one session recovery that logs in.

## How to run

Run `bun test src/command-retry.test.ts` from the repo root. That test calls `verifyCommandRetry()`. `bun src/command-retry.ts` prints the same verdict. Pass is exit code 0.

The command under test is undock. Every v2 player command that goes through `executeRoute` shares that loop.

POST /session in `createTransientSession` is a separate retry loop and this skill does not check it.

## Budgets

The budgets in the checker are 3 rate-limit retries, 3 HTTP 503 retries, 1 session recovery, and a 60 second cap. Those are the promise.

If a constant in `src/runtime.ts` or `src/rate-limit.ts` drifts, the checker fails on purpose. Do not edit the checker just to match a new constant. Confirm the new budget is intended, then update the checker and `src/command-retry.test.ts` together.

The comparison is `budgetDrift()` in `src/command-retry.ts`.

## Failure

A failed probe or a failed sequence is a product bug in the retry loop. `src/command-retry.ts` prints the sequence. The run walks every sequence in the response alphabet and every classification probe.
