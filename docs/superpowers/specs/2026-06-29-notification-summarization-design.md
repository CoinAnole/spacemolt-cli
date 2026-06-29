# Notification Summarization Design

Date: 2026-06-29

## Summary

SpaceMolt CLI should summarize noisy progress notifications before rendering them. Active crafting can currently enqueue one notification per game tick, and each CLI command prints up to 50 queued notifications before the actual response. That can bury the command output under roughly 17 minutes of stale crafting progress and can also hide more important notifications such as combat, trade offers, action failures, and faction events.

The design adds a shared notification presentation layer that classifies notifications, summarizes low-priority crafting progress into a single synthetic summary row, and renders high-signal notifications normally. The same presented stream is used for human output, `get_notifications`, JSON, structured output, and projection options. A global raw override keeps the original server notification stream available for debugging and automation that truly needs every notification event.

## Problem

The current renderer has two notification paths:

- `src/response-renderer.ts` prints every `response.notifications` entry before successful human-readable command output.
- `src/display/notifications.ts` formats explicit `notifications` and `get_notifications` responses as a table.

Neither path ranks, groups, or limits noisy notification types. Crafting progress is especially disruptive because a long-running active job can produce one progress notification per tick. With a server limit of 50 notifications per response, normal CLI commands can print many stale progress rows before the actual command result appears.

This is not only a length problem. A simple cap can still spend the entire visible notification budget on crafting progress, drowning out important notifications that require attention.

## Goals

- Summarize crafting progress notifications into one concise row by default.
- Render important notifications individually and keep them visible.
- Apply the same summarization to inline response notifications and explicit `spacemolt get_notifications` output.
- Apply summarization to `--json`, `--structured`, `--field`, `--fields`, and `--jq` by default so machine-readable notification queries are usable.
- Provide an explicit raw override for callers that need the original notification stream.
- Keep raw server command result data unchanged except for the notification stream presentation.
- Avoid changing outgoing API requests or server notification clearing behavior.
- Add focused tests for human output, explicit notification output, machine output, projections, and the raw override.

## Non-Goals

- Do not change server notification generation, queue depth, ordering, or retention.
- Do not add client-side persistent notification state.
- Do not suppress all crafting notifications; completed, failed, or otherwise important crafting events should still be visible.
- Do not redesign every notification formatter.
- Do not fetch live API data for verification.

## Approaches Considered

### Recommended: Summarize Noisy Types, Preserve Important Events

Classify notifications by `msg_type || type`. Low-priority crafting progress notifications are grouped into one synthetic summary row. High-signal notifications continue to render as individual events.

Tradeoffs:

- Solves the crafting flood directly.
- Prevents crafting progress from hiding unrelated important notifications.
- Gives `get_notifications` and machine-readable output the same practical default behavior as human output.
- Requires a raw override because default JSON is no longer the exact server notification list.

### Alternative: Hard Cap All Notifications

Render only the first or last N notifications and print `+X more`.

Tradeoffs:

- Simple to implement.
- Does not reliably protect important notifications from being hidden by crafting progress.
- Still leaves `get_notifications` noisy unless combined with grouping.

This is rejected because the problem is priority and noise, not only output length.

### Alternative: Move Notifications After Command Output

Render the command result first and notifications afterward.

Tradeoffs:

- Makes normal command output easier to find.
- Does not improve `get_notifications`.
- Still allows important notifications to be buried in a long list.

This can be considered separately later, but it is not sufficient for the current issue.

## Design

### Presentation Boundary

Add a shared notification presentation module, for example `src/notification-summary.ts`. It should expose a pure function that accepts raw notifications and returns a presented notification stream plus metadata:

```ts
interface PresentedNotifications {
  notifications: APIResponse['notifications'];
  rawCount: number;
  shownCount: number;
  summarizedCount: number;
  summaries: Array<{
    type: string;
    count: number;
  }>;
}
```

The renderer should call this function before any notification output path unless raw notification output is explicitly requested.

### Crafting Classification

Crafting progress notifications should be grouped when they are routine status updates. Classification should use defensive matching because server notification names can evolve:

- `notification.type === 'crafting'`
- `notification.msg_type` contains `craft` or `crafting`
- `notification.data.type`, `notification.data.event_type`, or similar fields contain `craft` or `crafting`

Only routine progress should be summarized. Important crafting events should remain individual notifications when the data indicates completion, failure, cancellation, refund, missing inputs, or another actionable outcome. The first implementation should use a denylist of high-signal terms in `msg_type`, `type`, and data fields such as:

- `complete`
- `completed`
- `failed`
- `error`
- `cancel`
- `cancelled`
- `refund`

Unknown crafting-like notifications without a high-signal marker may be treated as progress and summarized.

### Summary Row Shape

The synthetic notification should look like a normal notification so all renderers can handle it:

```ts
{
  type: 'crafting',
  msg_type: 'crafting_summary',
  timestamp: latestTimestamp,
  data: {
    count: 48,
    first_timestamp: '2026-06-29T00:00:00.000Z',
    latest_timestamp: '2026-06-29T00:16:40.000Z',
    first_tick: 901237,
    latest_tick: 901337,
    jobs: 2,
    latest_message: 'optional latest server message'
  }
}
```

Fields should be included only when they can be derived reliably. The summary must always include `count`.

The synthetic row should be inserted where the grouped crafting progress would have appeared. A practical rule is to replace the first grouped crafting progress notification with the summary and remove the rest. That preserves approximate chronology while shrinking the output.

### Human Inline Output

`renderResponse()` should present notifications before printing the notification header. The header should make summarization visible:

```text
--- Notifications (50 -> 3 shown) ---
[CRAFTING] 48 crafting progress updates summarized: latest tick 901337, 2 active jobs.
[TRADE] Offer from Dockmaster ...
[ACTION FAILED] travel failed ...
```

If no summarization occurred, keep the current header style:

```text
--- Notifications (3) ---
```

`--quiet` continues to suppress inline notifications.

### Explicit Notification Commands

`src/display/notifications.ts` should format the presented notification stream for both `notifications` and `get_notifications`.

The table should show one crafting summary row instead of many crafting progress rows:

```text
count 50

=== Notifications ===

  Timestamp        | Type             | Message
  -----------------+------------------+-----------------------------------------------------------
  2026-06-29 00:16 | crafting_summary | 48 crafting progress updates summarized; latest tick 901337
  2026-06-29 00:17 | trade_offer      | Dockmaster: Trade offer received
```

If the server response contains `remaining`, keep the existing remaining message. The displayed `count` should continue to represent the server-reported count when present, while table rows represent the summarized display rows.

### Machine-Readable Output

By default, notification presentation applies before machine-readable rendering:

- `--json` prints the response envelope with `notifications` summarized.
- `--structured` prints summarized `structuredContent` when it contains a `notifications` array, as `get_notifications` does.
- `--field`, `--fields`, and `--jq` operate on the summarized notification stream.

For ordinary command responses, `--structured` still prints only `structuredContent`. If that object does not contain notifications, no notification summary appears in structured output. For explicit `get_notifications`, where notifications are the command result, the structured object should contain the summary row.

This intentionally creates a narrow exception to the general machine-output preservation rule: notification streams are presented by default because the raw stream can be operationally unusable. The raw override restores exact server data.

### Raw Override

Add a global option named `--raw-notifications`.

Behavior:

- Inline human output renders every raw notification.
- `notifications` and `get_notifications` render every raw notification row.
- `--json` prints the unmodified response envelope.
- `--structured` prints the unmodified `structuredContent`.
- `--field`, `--fields`, and `--jq` operate on raw notifications.

This should be a global option rather than a `get_notifications` payload field so it also works for notifications attached to any command response. It should not conflict with the existing `--raw` / `--allow-unknown` option.

### Data Flow

The rendering flow should become:

1. Execute the command and receive the raw API response.
2. Preserve the raw response for ID caching and for `--raw-notifications`.
3. Build a presented response by summarizing notifications in:
   - top-level `response.notifications`
   - `response.structuredContent.notifications` when present
   - `response.result.notifications` when result is an object and contains a notifications array
4. Render human, JSON, structured, or projection output from the presented response.
5. If `--raw-notifications` is set, skip step 3 and render the raw response.

The presentation function should avoid mutating the original response.

### Error Handling

Errors should keep existing behavior. If an error response includes notifications, the same presentation rules apply to any rendered notification stream, but the formatted error message and exit code logic do not change.

Malformed notification objects should not crash rendering. The summary layer should only group notifications it can classify confidently enough as routine crafting progress; all other entries should pass through unchanged.

## Test Plan

Focused tests:

- `src/notifications.test.ts`
  - formats `crafting_summary` in a concise human line
  - summarizes many crafting progress notifications into one row
  - does not summarize crafting completion or failure notifications
  - preserves non-crafting notification order around a summary
- `src/display/notifications.ts` formatter tests
  - `get_notifications` table shows one crafting summary row
  - `--raw-notifications` path can still render all raw crafting rows
- `src/response-renderer.test.ts`
  - inline human notifications show `N -> M shown` when summarized
  - command output is no longer buried under repeated crafting progress rows
  - `--quiet` still suppresses inline notifications
  - `--json` response envelope contains a crafting summary row by default
  - `--json --raw-notifications` preserves raw notifications
  - `--structured get_notifications` contains a summary row by default
  - `--jq` and `--fields` operate on summarized notifications by default
  - `--jq --raw-notifications` operates on raw notifications
- `src/global-options.ts` tests
  - parses `--raw-notifications`
  - treats `--raw-notifications` as a boolean flag and preserves existing `--raw` behavior
- Golden tests
  - update or add `get_notifications` / `notifications` output cases if the golden harness covers them after promotion

Verification commands:

```bash
bun test src/notifications.test.ts
bun test src/response-renderer.test.ts src/formatter.test.ts src/args.test.ts
bun test src/output-golden.test.ts
bun run typecheck
bun run lint
bun test
```

## Risks

- Some automation may currently expect raw notification arrays from `--json`. The `--raw-notifications` override handles this, and notification streams are narrow enough to justify the default presentation change.
- Server notification shapes may change. The grouping logic should be defensive and pass through unrecognized important notifications.
- A too-broad crafting classifier could summarize an actionable crafting event. Tests should lock completion and failure pass-through behavior, and the high-signal term list should err toward showing individual notifications.
- Summarizing `structuredContent.notifications` changes the shape of explicit notification command output. The summary row should retain the normal notification object shape so projection tools remain predictable.

## Open Questions

- None. The approved policy is to summarize noisy crafting progress by default everywhere notifications are rendered, including machine-readable notification streams, with `--raw-notifications` as the escape hatch.

## Acceptance Criteria

- Normal command output no longer prints dozens of crafting progress rows before the actual command result.
- Crafting progress is summarized in inline human output, `get_notifications`, JSON, structured output, and projection output by default.
- Combat, action failures, trade offers, faction invites, chat, and other important notifications render individually.
- Crafting completion and failure notifications render individually.
- `--raw-notifications` restores the exact raw server notification stream for all output modes.
- Existing `--quiet`, `--json`, `--structured`, projection, and error behavior remain otherwise intact.
- Focused tests, typecheck, lint, golden tests, and the full test suite pass.
