# Notification Summarization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Summarize routine crafting progress notifications everywhere the CLI renders notification streams, while keeping important notifications visible and providing `--raw-notifications` for exact raw output.

**Architecture:** Add a pure notification presentation module that transforms raw notification arrays into a displayed stream plus summary metadata. Wire that module into explicit notification formatters and `renderResponse()` so human output, JSON, structured output, and projections use the summarized stream unless `--raw-notifications` is set.

**Tech Stack:** Bun test runner, TypeScript, existing SpaceMolt CLI renderer modules, existing formatter and golden-output test harnesses.

---

## File Structure

- Create `src/notification-summary.ts`
  - Classify routine crafting progress notifications.
  - Build synthetic `crafting_summary` notification rows.
  - Present notification arrays and API response notification-bearing fields without mutating raw responses.
- Create `src/notification-summary.test.ts`
  - Unit tests for classification, grouping, order, metadata, non-mutation, and raw-response preservation.
- Modify `src/types.ts`
  - Add `rawNotifications?: boolean` to `GlobalOptions`.
- Modify `src/global-options.ts`
  - Parse `--raw-notifications` as a boolean global flag.
- Modify `src/completion-metadata.ts`
  - Add shell-completion metadata for `--raw-notifications`.
- Modify `src/help.ts`
  - Document `--raw-notifications` in global help output.
- Modify `src/args.test.ts`, `src/completion.test.ts`, and `src/help.test.ts`
  - Cover parsing and discoverability of the new global flag.
- Modify `src/notifications.ts`
  - Format `crafting_summary` for inline human notification output.
- Modify `src/notifications.test.ts`
  - Cover the new formatter and ensure known notification coverage includes it.
- Modify `src/display/notifications.ts`
  - Summarize raw notification arrays before table formatting for direct `displayStructuredResult()` callers.
  - Format `crafting_summary` rows in the notification table.
- Modify `src/formatter.test.ts`
  - Cover explicit `notifications` / `get_notifications` table summarization.
- Modify `src/response-renderer.ts`
  - Apply presented notification responses before all output branches except `--raw-notifications`.
  - Use raw responses for ID caching.
  - Render summarized inline notification headers such as `Notifications (50 -> 3 shown)`.
- Modify `src/response-renderer.test.ts`
  - Cover human inline output, JSON, structured output, projections, quiet mode, and raw override.

---

### Task 1: Add the `--raw-notifications` Global Flag

**Files:**
- Modify: `src/types.ts`
- Modify: `src/global-options.ts`
- Modify: `src/completion-metadata.ts`
- Modify: `src/help.ts`
- Test: `src/args.test.ts`
- Test: `src/completion.test.ts`
- Test: `src/help.test.ts`

- [ ] **Step 1: Add failing parser coverage**

Add this test near the existing global option parser tests in `src/args.test.ts`.

```ts
test('global option parser handles raw notification override', () => {
  const result = parseGlobalOptions(['--json', '--raw-notifications', 'get_notifications']);

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  expect(result.options.json).toBe(true);
  expect(result.options.rawNotifications).toBe(true);
  expect(result.options.args).toEqual(['get_notifications']);
});
```

Expected before implementation: FAIL because `rawNotifications` is not present on parsed options.

- [ ] **Step 2: Add failing completion coverage**

In `src/completion.test.ts`, update the `runtime completion suggests top-level commands and global options by prefix` test or add this focused test in the same describe block.

```ts
test('runtime completion suggests raw notification override', () => {
  const labels = completeWords({ shell: 'fish', words: ['spacemolt', '--raw-n'], current: '--raw-n' }).map(
    (entry) => entry.value,
  );

  expect(labels).toContain('--raw-notifications');
});
```

Expected before implementation: FAIL because completion metadata does not include `--raw-notifications`.

- [ ] **Step 3: Add failing help coverage**

In `src/help.test.ts`, add assertions to the existing tests that check global help output. Use the same help capture helper already used by those tests.

```ts
expect(output).toContain('--raw-notifications');
expect(output).toContain('Render raw notification streams');
```

Expected before implementation: FAIL because help text does not mention the new flag.

- [ ] **Step 4: Run focused tests and confirm expected failures**

Run:

```bash
/home/hermes/.bun/bin/bun test src/args.test.ts src/completion.test.ts src/help.test.ts
```

Expected: FAIL only on the new `--raw-notifications` parser, completion, and help assertions.

- [ ] **Step 5: Add the option to `GlobalOptions`**

In `src/types.ts`, extend the interface.

```ts
export interface GlobalOptions {
  json: boolean;
  quiet: boolean;
  plain: boolean;
  debug?: boolean;
  allowUnknown: boolean;
  dryRun: boolean;
  rawNotifications?: boolean;
  fuzzy?: boolean;
  profile?: string;
  field?: string;
  fields?: string[];
  format?: OutputFormat;
  noTimestamp: boolean;
  compact: boolean;
  structured?: boolean;
  watch?: number;
  jq?: string;
  keys?: string;
  outputSearch?: string;
  outputSearchKeys?: string;
  outputSearchValues?: string;
  outputSearchRegex?: string;
  args: string[];
}
```

- [ ] **Step 6: Parse `--raw-notifications`**

In `src/global-options.ts`, add the branch after `--raw` / `--allow-unknown` or next to other boolean output flags.

```ts
    } else if (arg === '--raw-notifications') {
      result.rawNotifications = true;
```

Do not add a value form. If a user runs `--raw-notifications=false`, the current parser should leave it in command args as an unknown argument, matching how unsupported global flag values behave.

- [ ] **Step 7: Add completion metadata**

In `src/completion-metadata.ts`, add this entry to `GLOBAL_COMPLETION_OPTIONS` near `--quiet`.

```ts
  { long: '--raw-notifications', description: 'Render raw notification streams' },
```

- [ ] **Step 8: Add help text**

In the `Global Flags` section in `src/help.ts`, add this line near `--quiet`.

```text
  --raw-notifications  Render raw notification streams without crafting summaries
```

Keep spacing aligned with the surrounding literal help block.

- [ ] **Step 9: Run focused tests and confirm they pass**

Run:

```bash
/home/hermes/.bun/bin/bun test src/args.test.ts src/completion.test.ts src/help.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/global-options.ts src/completion-metadata.ts src/help.ts src/args.test.ts src/completion.test.ts src/help.test.ts
git commit -m "feat: add raw notifications flag"
```

---

### Task 2: Add Pure Notification Presentation

**Files:**
- Create: `src/notification-summary.ts`
- Create: `src/notification-summary.test.ts`

- [ ] **Step 1: Write failing unit tests**

Create `src/notification-summary.test.ts` with these tests.

```ts
import { describe, expect, test } from 'bun:test';
import { presentNotifications, presentResponseNotifications } from './notification-summary';
import type { APIResponse } from './types';

const progressA = {
  type: 'crafting',
  msg_type: 'crafting_progress',
  timestamp: '2026-06-29T00:00:00.000Z',
  data: { tick: 901237, job_id: 'job-a', message: 'Crafting steel plate.' },
};

const progressB = {
  type: 'system',
  msg_type: 'crafting_tick',
  timestamp: '2026-06-29T00:00:20.000Z',
  data: { event_type: 'crafting.progress', tick: 901239, job_id: 'job-b', message: 'Crafting fuel cells.' },
};

const trade = {
  type: 'trade',
  msg_type: 'trade_offer_received',
  timestamp: '2026-06-29T00:00:10.000Z',
  data: { from_name: 'Dockmaster', trade_id: 'trade-1' },
};

describe('notification presentation', () => {
  test('summarizes routine crafting progress into one synthetic row and preserves non-crafting order', () => {
    const presented = presentNotifications([progressA, trade, progressB]);

    expect(presented.rawCount).toBe(3);
    expect(presented.shownCount).toBe(2);
    expect(presented.summarizedCount).toBe(2);
    expect(presented.notifications.map((n) => n.msg_type)).toEqual(['crafting_summary', 'trade_offer_received']);

    const summary = presented.notifications[0];
    expect(summary).toMatchObject({
      type: 'crafting',
      msg_type: 'crafting_summary',
      timestamp: '2026-06-29T00:00:20.000Z',
      data: {
        count: 2,
        first_timestamp: '2026-06-29T00:00:00.000Z',
        latest_timestamp: '2026-06-29T00:00:20.000Z',
        first_tick: 901237,
        latest_tick: 901239,
        jobs: 2,
        latest_message: 'Crafting fuel cells.',
      },
    });
  });

  test('leaves crafting completion and failure notifications visible', () => {
    const completed = {
      type: 'crafting',
      msg_type: 'crafting_completed',
      timestamp: '2026-06-29T00:00:30.000Z',
      data: { event_type: 'crafting.completed', message: 'Completed steel plate.' },
    };
    const failed = {
      type: 'crafting',
      msg_type: 'crafting_failed',
      timestamp: '2026-06-29T00:00:40.000Z',
      data: { event_type: 'crafting.failed', message: 'Missing input.' },
    };

    const presented = presentNotifications([progressA, completed, failed]);

    expect(presented.notifications.map((n) => n.msg_type)).toEqual([
      'crafting_summary',
      'crafting_completed',
      'crafting_failed',
    ]);
    expect(presented.summarizedCount).toBe(1);
  });

  test('does not mutate raw notifications', () => {
    const raw = [progressA, progressB];
    const before = structuredClone(raw);

    presentNotifications(raw);

    expect(raw).toEqual(before);
  });

  test('presents notification arrays in response envelope, structuredContent, and object result', () => {
    const response: APIResponse = {
      notifications: [progressA, progressB],
      structuredContent: { notifications: [progressA, progressB], count: 2 },
      result: { notifications: [progressA, progressB], count: 2 },
    };

    const presented = presentResponseNotifications(response);

    expect(presented.response.notifications?.map((n) => n.msg_type)).toEqual(['crafting_summary']);
    expect((presented.response.structuredContent?.notifications as Array<{ msg_type?: string }>).map((n) => n.msg_type)).toEqual([
      'crafting_summary',
    ]);
    expect(((presented.response.result as Record<string, unknown>).notifications as Array<{ msg_type?: string }>).map((n) => n.msg_type)).toEqual([
      'crafting_summary',
    ]);
    expect(response.notifications?.map((n) => n.msg_type)).toEqual(['crafting_progress', 'crafting_tick']);
  });

  test('raw option returns the original response object', () => {
    const response: APIResponse = { notifications: [progressA, progressB] };

    const presented = presentResponseNotifications(response, { rawNotifications: true });

    expect(presented.response).toBe(response);
    expect(presented.topLevel?.notifications.map((n) => n.msg_type)).toEqual(['crafting_progress', 'crafting_tick']);
  });
});
```

- [ ] **Step 2: Run the new test and confirm it fails**

Run:

```bash
/home/hermes/.bun/bin/bun test src/notification-summary.test.ts
```

Expected: FAIL because `src/notification-summary.ts` does not exist.

- [ ] **Step 3: Create `src/notification-summary.ts`**

Add the pure presenter module. Use this implementation as the first complete version.

```ts
import { isRecord } from './response.ts';
import type { APIResponse } from './types.ts';

export type Notification = NonNullable<APIResponse['notifications']>[number];

export interface PresentedNotifications {
  notifications: Notification[];
  rawCount: number;
  shownCount: number;
  summarizedCount: number;
  summaries: Array<{ type: string; count: number }>;
}

export interface PresentedResponse {
  response: APIResponse;
  topLevel?: PresentedNotifications;
  structuredContent?: PresentedNotifications;
  result?: PresentedNotifications;
}

export interface NotificationPresentationOptions {
  rawNotifications?: boolean;
}

const HIGH_SIGNAL_TERMS = ['complete', 'completed', 'failed', 'failure', 'error', 'cancel', 'cancelled', 'refund'];

function asNotificationArray(value: unknown): Notification[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every((entry) => isRecord(entry) && typeof entry.type === 'string') ? (value as Notification[]) : undefined;
}

function collectSearchText(value: unknown, output: string[] = [], depth = 0): string[] {
  if (value === undefined || value === null || depth > 3) return output;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    output.push(String(value).toLowerCase());
    return output;
  }
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 20)) collectSearchText(entry, output, depth + 1);
    return output;
  }
  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      output.push(key.toLowerCase());
      collectSearchText(entry, output, depth + 1);
    }
  }
  return output;
}

function notificationText(notification: Notification): string {
  return collectSearchText([notification.type, notification.msg_type, notification.data]).join(' ');
}

function isCraftingSummary(notification: Notification): boolean {
  return notification.msg_type === 'crafting_summary';
}

function isCraftingLike(notification: Notification): boolean {
  const text = notificationText(notification);
  return text.includes('craft') || text.includes('crafting.');
}

function isHighSignalCrafting(notification: Notification): boolean {
  const text = notificationText(notification);
  return HIGH_SIGNAL_TERMS.some((term) => text.includes(term));
}

function isRoutineCraftingProgress(notification: Notification): boolean {
  if (isCraftingSummary(notification)) return false;
  return isCraftingLike(notification) && !isHighSignalCrafting(notification);
}

function timestampMillis(notification: Notification): number {
  const millis = Date.parse(notification.timestamp);
  return Number.isFinite(millis) ? millis : Number.NEGATIVE_INFINITY;
}

function numericDataField(notification: Notification, field: string): number | undefined {
  const data = isRecord(notification.data) ? notification.data : undefined;
  const value = data?.[field];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function stringDataField(notification: Notification, field: string): string | undefined {
  const data = isRecord(notification.data) ? notification.data : undefined;
  const value = data?.[field];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function jobIdsFrom(notification: Notification): string[] {
  const data = isRecord(notification.data) ? notification.data : undefined;
  if (!data) return [];
  const ids: string[] = [];
  if (typeof data.job_id === 'string' && data.job_id) ids.push(data.job_id);
  if (Array.isArray(data.job_ids)) {
    for (const id of data.job_ids) {
      if (typeof id === 'string' && id) ids.push(id);
    }
  }
  if (Array.isArray(data.jobs)) {
    for (const job of data.jobs) {
      if (isRecord(job) && typeof job.id === 'string' && job.id) ids.push(job.id);
      if (isRecord(job) && typeof job.job_id === 'string' && job.job_id) ids.push(job.job_id);
    }
  }
  return ids;
}

function craftingSummary(progress: Notification[]): Notification {
  const sortedByTime = [...progress].sort((left, right) => timestampMillis(left) - timestampMillis(right));
  const first = sortedByTime[0] ?? progress[0];
  const latest = sortedByTime[sortedByTime.length - 1] ?? progress[progress.length - 1] ?? first;
  const ticks = progress
    .map((notification) => numericDataField(notification, 'tick'))
    .filter((value): value is number => value !== undefined)
    .sort((left, right) => left - right);
  const jobIds = new Set(progress.flatMap(jobIdsFrom));
  const latestMessage = latest ? stringDataField(latest, 'message') : undefined;
  const data: Record<string, unknown> = {
    count: progress.length,
  };

  if (first?.timestamp) data.first_timestamp = first.timestamp;
  if (latest?.timestamp) data.latest_timestamp = latest.timestamp;
  if (ticks[0] !== undefined) data.first_tick = ticks[0];
  if (ticks[ticks.length - 1] !== undefined) data.latest_tick = ticks[ticks.length - 1];
  if (jobIds.size > 0) data.jobs = jobIds.size;
  if (latestMessage) data.latest_message = latestMessage;

  return {
    type: 'crafting',
    msg_type: 'crafting_summary',
    timestamp: latest?.timestamp ?? first?.timestamp ?? new Date(0).toISOString(),
    data,
  };
}

export function presentNotifications(notifications?: APIResponse['notifications']): PresentedNotifications {
  const raw = notifications ?? [];
  const routineIndexes = new Set<number>();
  const routine: Notification[] = [];

  raw.forEach((notification, index) => {
    if (isRoutineCraftingProgress(notification)) {
      routineIndexes.add(index);
      routine.push(notification);
    }
  });

  if (!routine.length) {
    return {
      notifications: [...raw],
      rawCount: raw.length,
      shownCount: raw.length,
      summarizedCount: 0,
      summaries: [],
    };
  }

  const firstRoutineIndex = [...routineIndexes].sort((left, right) => left - right)[0] ?? 0;
  const summary = craftingSummary(routine);
  const presented = raw.flatMap((notification, index) => {
    if (index === firstRoutineIndex) return [summary];
    if (routineIndexes.has(index)) return [];
    return [notification];
  });

  return {
    notifications: presented,
    rawCount: raw.length,
    shownCount: presented.length,
    summarizedCount: routine.length,
    summaries: [{ type: 'crafting', count: routine.length }],
  };
}

function presentObjectNotifications(value: Record<string, unknown>): {
  value: Record<string, unknown>;
  presentation?: PresentedNotifications;
} {
  const notifications = asNotificationArray(value.notifications);
  if (!notifications) return { value };
  const presentation = presentNotifications(notifications);
  return {
    value: { ...value, notifications: presentation.notifications },
    presentation,
  };
}

export function presentResponseNotifications(
  response: APIResponse,
  options: NotificationPresentationOptions = {},
): PresentedResponse {
  if (options.rawNotifications) {
    return {
      response,
      topLevel: response.notifications
        ? {
            notifications: [...response.notifications],
            rawCount: response.notifications.length,
            shownCount: response.notifications.length,
            summarizedCount: 0,
            summaries: [],
          }
        : undefined,
    };
  }

  let next: APIResponse = response;
  const topLevel = response.notifications ? presentNotifications(response.notifications) : undefined;
  if (topLevel) next = { ...next, notifications: topLevel.notifications };

  let structuredContent: PresentedNotifications | undefined;
  if (isRecord(response.structuredContent)) {
    const presented = presentObjectNotifications(response.structuredContent);
    structuredContent = presented.presentation;
    if (structuredContent) next = { ...next, structuredContent: presented.value };
  }

  let result: PresentedNotifications | undefined;
  if (isRecord(response.result)) {
    const presented = presentObjectNotifications(response.result);
    result = presented.presentation;
    if (result) next = { ...next, result: presented.value };
  }

  return { response: next, topLevel, structuredContent, result };
}
```

- [ ] **Step 4: Run the new unit test**

Run:

```bash
/home/hermes/.bun/bin/bun test src/notification-summary.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/notification-summary.ts src/notification-summary.test.ts
git commit -m "feat: summarize crafting notifications"
```

---

### Task 3: Format Crafting Summary Notifications

**Files:**
- Modify: `src/notifications.ts`
- Modify: `src/notifications.test.ts`
- Modify: `src/display/notifications.ts`
- Modify: `src/formatter.test.ts`

- [ ] **Step 1: Add failing inline formatter coverage**

In `src/notifications.test.ts`, add `crafting_summary` to `knownCases`.

```ts
{
  msgType: 'crafting_summary',
  data: { count: 48, latest_tick: 901337, jobs: 2, latest_message: 'Crafting fuel cells.' },
  snippets: [
    '[CRAFTING]',
    '48 crafting progress updates summarized',
    'latest tick 901337',
    '2 active jobs',
    'Latest: Crafting fuel cells.',
  ],
},
```

Expected before implementation: FAIL because `NOTIFICATION_TYPES` does not include `crafting_summary` and formatting falls back to generic output.

- [ ] **Step 2: Add failing explicit notification table coverage**

In `src/formatter.test.ts`, add this fixture near `notificationsFixture`.

```ts
const craftingNotificationsFixture = {
  count: 4,
  current_tick: 901337,
  notifications: [
    {
      type: 'crafting',
      msg_type: 'crafting_progress',
      data: { tick: 901335, job_id: 'job-a', message: 'Crafting steel plate.' },
      timestamp: '2026-06-29T00:00:00.000Z',
    },
    {
      type: 'crafting',
      msg_type: 'crafting_progress',
      data: { tick: 901336, job_id: 'job-a', message: 'Crafting steel plate.' },
      timestamp: '2026-06-29T00:00:20.000Z',
    },
    {
      type: 'trade',
      msg_type: 'trade_offer_received',
      data: { from_name: 'Dockmaster', trade_id: 'trade-1' },
      timestamp: '2026-06-29T00:00:30.000Z',
    },
    {
      type: 'crafting',
      msg_type: 'crafting_completed',
      data: { event_type: 'crafting.completed', message: 'Completed steel plate.' },
      timestamp: '2026-06-29T00:00:40.000Z',
    },
  ],
  remaining: 0,
};
```

Add this test near the existing notification formatter tests.

```ts
test('formats crafting progress notifications as a summary row', () => {
  const { stdout, stderr } = captureStructuredOutput('get_notifications', craftingNotificationsFixture);

  expect(stderr).toBe('');
  expect(stdout).toContain('count 4');
  expect(stdout).toContain('crafting_summary');
  expect(stdout).toContain('2 crafting progress updates summarized');
  expect(stdout).toContain('latest tick 901336');
  expect(stdout).toContain('trade_offer_received');
  expect(stdout).toContain('crafting_completed');
  expect(stdout.match(/Crafting steel plate\./g)?.length ?? 0).toBe(1);
  expect(stdout).not.toContain('=== Response ===');
});
```

Expected before implementation: FAIL because both raw progress rows are rendered.

- [ ] **Step 3: Add `crafting_summary` to inline notification handlers**

In `src/notifications.ts`, add a helper above `createNotificationHandlers`.

```ts
function plural(value: number, singular: string, pluralText = `${singular}s`): string {
  return value === 1 ? singular : pluralText;
}
```

Inside `createNotificationHandlers`, add this handler.

```ts
    crafting_summary: (d, t, writeLine) => {
      const count = typeof d.count === 'number' ? d.count : 0;
      const parts = [`${count} crafting progress ${plural(count, 'update')} summarized`];
      if (d.latest_tick !== undefined) parts.push(`latest tick ${d.latest_tick}`);
      if (typeof d.jobs === 'number') parts.push(`${d.jobs} active ${plural(d.jobs, 'job')}`);
      writeLine(`${c.dim}[${t}]${c.reset} ${c.green}[CRAFTING]${c.reset} ${parts.join('; ')}`);
      if (d.latest_message) writeLine(`  Latest: ${d.latest_message}`);
    },
```

- [ ] **Step 4: Summarize direct notification formatter inputs**

In `src/display/notifications.ts`, import the presenter and notification type.

```ts
import { presentNotifications, type Notification } from '../notification-summary.ts';
```

Replace `notificationRows` with a version that summarizes arrays.

```ts
function notificationRows(result: Record<string, unknown>): Array<Record<string, unknown>> | undefined {
  if (Array.isArray(result.notifications)) {
    return presentNotifications(result.notifications as Notification[]).notifications.filter(isRecord);
  }
  if (result.notifications === null) return [];
  return undefined;
}
```

Add a `formatCraftingSummary` helper near `formatMarketUpdate`.

```ts
function formatCraftingSummary(data: Record<string, unknown>): string {
  const count = typeof data.count === 'number' ? data.count : 0;
  const updateWord = count === 1 ? 'update' : 'updates';
  const parts = [`${count} crafting progress ${updateWord} summarized`];
  if (data.latest_tick !== undefined) parts.push(`latest tick ${data.latest_tick}`);
  if (typeof data.jobs === 'number') parts.push(`${data.jobs} active ${data.jobs === 1 ? 'job' : 'jobs'}`);
  if (data.latest_message) parts.push(`latest: ${data.latest_message}`);
  return parts.join('; ');
}
```

In `formatNotificationMessage`, add this branch after the market branch.

```ts
  if (type === 'crafting_summary') return formatCraftingSummary(data);
```

- [ ] **Step 5: Run focused formatter tests**

Run:

```bash
/home/hermes/.bun/bin/bun test src/notifications.test.ts src/formatter.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/notifications.ts src/notifications.test.ts src/display/notifications.ts src/formatter.test.ts
git commit -m "feat: render crafting notification summaries"
```

---

### Task 4: Apply Notification Presentation in `renderResponse()`

**Files:**
- Modify: `src/response-renderer.ts`
- Modify: `src/response-renderer.test.ts`

- [ ] **Step 1: Add failing inline human output coverage**

In `src/response-renderer.test.ts`, add this test near `renderResponse prints notifications before successful text output`.

```ts
test('renderResponse summarizes crafting progress before successful text output', async () => {
  const capture = fakeContext();
  const exitCode = await renderResponse(
    {
      command: 'get_status',
      displayCommand: 'get_status',
      response: {
        result: 'Status ready',
        notifications: [
          {
            type: 'crafting',
            msg_type: 'crafting_progress',
            data: { tick: 901335, job_id: 'job-a', message: 'Crafting steel plate.' },
            timestamp: '2026-06-29T00:00:00.000Z',
          },
          {
            type: 'crafting',
            msg_type: 'crafting_progress',
            data: { tick: 901336, job_id: 'job-a', message: 'Crafting steel plate.' },
            timestamp: '2026-06-29T00:00:20.000Z',
          },
          {
            type: 'action',
            msg_type: 'action_error',
            data: { command: 'travel', tick: 901337, message: 'drive offline' },
            timestamp: '2026-06-29T00:00:30.000Z',
          },
        ],
      },
    },
    { ...baseOptions, dryRun: true },
    { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
    capture.context,
  );

  const output = capture.text();
  expect(exitCode).toBe(0);
  expect(output).toContain('Notifications (3 -> 2 shown)');
  expect(output).toContain('2 crafting progress updates summarized');
  expect(output).toContain('[ACTION FAILED]');
  expect(output).toContain('Status ready');
  expect(output.indexOf('Notifications (3 -> 2 shown)')).toBeLessThan(output.indexOf('Status ready'));
  expect(output.match(/Crafting steel plate\./g)?.length ?? 0).toBe(1);
});
```

Expected before implementation: FAIL because the header remains `Notifications (3)` and both progress rows render.

- [ ] **Step 2: Add failing machine-output and projection coverage**

Add this helper in `src/response-renderer.test.ts`.

```ts
function notificationFixtureResponse() {
  return {
    structuredContent: {
      count: 2,
      notifications: [
        {
          type: 'crafting',
          msg_type: 'crafting_progress',
          data: { tick: 901335, job_id: 'job-a', message: 'Crafting steel plate.' },
          timestamp: '2026-06-29T00:00:00.000Z',
        },
        {
          type: 'crafting',
          msg_type: 'crafting_progress',
          data: { tick: 901336, job_id: 'job-a', message: 'Crafting steel plate.' },
          timestamp: '2026-06-29T00:00:20.000Z',
        },
      ],
    },
    notifications: [
      {
        type: 'crafting',
        msg_type: 'crafting_progress',
        data: { tick: 901335, job_id: 'job-a', message: 'Crafting steel plate.' },
        timestamp: '2026-06-29T00:00:00.000Z',
      },
      {
        type: 'crafting',
        msg_type: 'crafting_progress',
        data: { tick: 901336, job_id: 'job-a', message: 'Crafting steel plate.' },
        timestamp: '2026-06-29T00:00:20.000Z',
      },
    ],
  };
}
```

Add these tests.

```ts
test('--json summarizes notification streams by default and raw override preserves them', async () => {
  const summarized = fakeContext();
  const summarizedExit = await renderResponse(
    { command: 'get_notifications', displayCommand: 'get_notifications', response: notificationFixtureResponse() },
    { ...baseOptions, json: true },
    { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
    summarized.context,
  );

  expect(summarizedExit).toBe(0);
  const summarizedJson = JSON.parse(summarized.text());
  expect(summarizedJson.notifications.map((n: { msg_type?: string }) => n.msg_type)).toEqual(['crafting_summary']);
  expect(summarizedJson.structuredContent.notifications.map((n: { msg_type?: string }) => n.msg_type)).toEqual([
    'crafting_summary',
  ]);

  const raw = fakeContext();
  const rawExit = await renderResponse(
    { command: 'get_notifications', displayCommand: 'get_notifications', response: notificationFixtureResponse() },
    { ...baseOptions, json: true, rawNotifications: true },
    { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
    raw.context,
  );

  expect(rawExit).toBe(0);
  const rawJson = JSON.parse(raw.text());
  expect(rawJson.notifications.map((n: { msg_type?: string }) => n.msg_type)).toEqual([
    'crafting_progress',
    'crafting_progress',
  ]);
});

test('--structured and projections use summarized notifications by default', async () => {
  const structured = fakeContext();
  const structuredExit = await renderResponse(
    { command: 'get_notifications', displayCommand: 'get_notifications', response: notificationFixtureResponse() },
    { ...baseOptions, structured: true },
    { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
    structured.context,
  );

  expect(structuredExit).toBe(0);
  expect(JSON.parse(structured.text()).notifications.map((n: { msg_type?: string }) => n.msg_type)).toEqual([
    'crafting_summary',
  ]);

  const jq = fakeContext();
  const jqExit = await renderResponse(
    { command: 'get_notifications', displayCommand: 'get_notifications', response: notificationFixtureResponse() },
    { ...baseOptions, jq: '.notifications[].msg_type' },
    { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
    jq.context,
  );

  expect(jqExit).toBe(0);
  expect(jq.text()).toContain('crafting_summary');
  expect(jq.text()).not.toContain('crafting_progress');

  const fields = fakeContext();
  const fieldsExit = await renderResponse(
    { command: 'get_notifications', displayCommand: 'get_notifications', response: notificationFixtureResponse() },
    { ...baseOptions, fields: ['notifications.0.msg_type'] },
    { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
    fields.context,
  );

  expect(fieldsExit).toBe(0);
  expect(fields.text()).toContain('crafting_summary');
});

test('--raw-notifications makes projections operate on raw notifications', async () => {
  const jq = fakeContext();
  const jqExit = await renderResponse(
    { command: 'get_notifications', displayCommand: 'get_notifications', response: notificationFixtureResponse() },
    { ...baseOptions, jq: '.notifications[].msg_type', rawNotifications: true },
    { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
    jq.context,
  );

  expect(jqExit).toBe(0);
  expect(jq.text()).toContain('crafting_progress');
  expect(jq.text()).not.toContain('crafting_summary');
});
```

Expected before implementation: FAIL because render paths use raw response data.

- [ ] **Step 3: Run renderer tests and confirm expected failures**

Run:

```bash
/home/hermes/.bun/bin/bun test src/response-renderer.test.ts
```

Expected: FAIL on the new summarization expectations.

- [ ] **Step 4: Wire presentation into `renderResponse()`**

In `src/response-renderer.ts`, import the presenter.

```ts
import { presentResponseNotifications, type PresentedNotifications } from './notification-summary.ts';
```

At the start of `renderResponse()`, replace the current destructuring of `response` with raw and presented values.

```ts
  const { command, displayCommand } = commandRun;
  const renderOptions = optionsForCommandLocalSearch(commandRun, options);
  const presented = presentResponseNotifications(commandRun.response, {
    rawNotifications: renderOptions.rawNotifications,
  });
  const response = presented.response;
```

Keep `commandRun.response` available for ID caching:

```ts
  if (!options.dryRun) await cacheIdsFromResponse(command, commandRun.response, sessionPath);
```

Replace the notification header block with:

```ts
    const header = notificationHeader(presented.topLevel, colors);
```

Add this helper near the other renderer helpers.

```ts
function notificationHeader(presented: PresentedNotifications | undefined, colors: ReturnType<typeof colorsForPlain>): string {
  if (presented && presented.summarizedCount > 0 && presented.rawCount !== presented.shownCount) {
    return `${colors.dim}--- Notifications (${presented.rawCount} -> ${presented.shownCount} shown) ---${colors.reset}`;
  }
  const count = presented?.shownCount ?? 0;
  return `${colors.dim}--- Notifications (${count}) ---${colors.reset}`;
}
```

Use the presented `response.notifications` value when calling `displayNotifications`.

- [ ] **Step 5: Run renderer tests**

Run:

```bash
/home/hermes/.bun/bin/bun test src/response-renderer.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/response-renderer.ts src/response-renderer.test.ts
git commit -m "feat: apply notification presentation to responses"
```

---

### Task 5: Verify Explicit Notification Commands and Golden Output

**Files:**
- Modify if needed: `src/output-golden.test.ts`
- Modify if needed: `src/golden-output/renderer/*.stdout`
- Modify if needed: `src/test-support/formatter-golden-coverage.ts`

- [ ] **Step 1: Run notification and formatter tests together**

Run:

```bash
/home/hermes/.bun/bin/bun test src/notification-summary.test.ts src/notifications.test.ts src/formatter.test.ts src/response-renderer.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run golden output tests**

Run:

```bash
/home/hermes/.bun/bin/bun test src/output-golden.test.ts
```

Expected: PASS if the current golden fixture set does not include noisy crafting notifications. If it fails only because intentional notification summary output changed, read the failing case name from the test harness output and update only that named case with `UPDATE_GOLDENS=1 GOLDEN_ONLY=` followed by the exact printed case name. Do not run a broad golden update.

- [ ] **Step 3: Add a golden case only if formatter coverage reports a gap**

Run:

```bash
/home/hermes/.bun/bin/bun test src/test-support/formatter-golden-coverage.test.ts
```

Expected: PASS. If it reports that `get_notifications` is still intentionally excluded, keep the focused unit tests from Tasks 3 and 4 as the coverage source for this change.

- [ ] **Step 4: Commit golden updates if any were required**

If Task 5 changed golden files or golden coverage metadata, commit them.

```bash
git add src/output-golden.test.ts src/golden-output src/test-support/formatter-golden-coverage.ts
git commit -m "test: update notification summary goldens"
```

If no files changed in Task 5, skip this commit.

---

### Task 6: Final Verification

**Files:**
- No source edits expected.

- [ ] **Step 1: Run typecheck**

Run:

```bash
/home/hermes/.bun/bin/bun run typecheck
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
/home/hermes/.bun/bin/bun run lint
```

Expected: PASS.

- [ ] **Step 3: Run the full test suite**

Run:

```bash
/home/hermes/.bun/bin/bun test
```

Expected: PASS.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git status --short
git log --oneline -n 6
```

Expected:

- `git status --short` shows no unstaged source changes.
- Recent commits include the task commits from this plan.

---

## Self-Review Notes

- Spec coverage:
  - Crafting progress summarization is implemented by Task 2.
  - Important notification pass-through is tested in Task 2 and formatted in Task 3.
  - Inline command output is wired in Task 4.
  - Explicit `get_notifications` output is covered in Task 3.
  - JSON, structured output, `--fields`, and `--jq` behavior are covered in Task 4.
  - `--raw-notifications` is added in Task 1 and used in Task 4.
  - Golden and full-suite verification are covered in Tasks 5 and 6.
- Type consistency:
  - The flag name is `rawNotifications` in `GlobalOptions`.
  - The user-facing option is `--raw-notifications`.
  - The synthetic notification type is `type: 'crafting'` and `msg_type: 'crafting_summary'`.
  - The presentation entry points are `presentNotifications()` and `presentResponseNotifications()`.
