# Craft Routing Help and Commission Receipts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct craft/recycle routing help for SpaceMolt v0.524.0 and make ship commission completion receipts explicitly readable in inline notifications, notification polls, and action logs.

**Architecture:** Keep generated OpenAPI metadata mechanical, correct the curated help that overrides it, and add one pure `formatShipCommissionReceipt(unknown): string | undefined` helper shared by both notification presentation paths. Keep action-log support targeted by projecting only `commission_id` and `ship_id` from entry data into conditional columns; machine-output behavior and notification summarization remain unchanged.

**Tech Stack:** Bun 1.3.x, TypeScript, Bun test runner, existing table/display formatter framework, committed golden-output harness, cached SpaceMolt OpenAPI v0.524.0.

**Design Spec:** `docs/superpowers/specs/2026-07-17-craft-routing-and-commission-receipts-design.md`

## Global Constraints

- Use only the cached `spacemolt-docs/openapi.json` at gameserver `v0.524.0`; do not run `LIVE_API_SYNC=1` or make live API/OpenAPI requests.
- Preserve the existing preset enums exactly: craft uses `fast`, `cheap`, `prefer_own`, `workshop`; recycle uses `fast`, `cheap`, `prefer_own`.
- Do not change craft/recycle payloads, command aliases, positional arguments, server-side routing, notification polling, clearing, ordering, retention, or summarization.
- Receipt presentation must not replace structured receipt fields in JSON, YAML, structured, compact, field, fields, or jq output.
- Preserve exact notification data under the existing `--raw-notifications` option.
- Missing or malformed receipt fields must fall back safely without `undefined`, `NaN`, `Infinity`, `[object Object]`, stderr leakage, or `=== Response ===` fallback.
- Only the `renderer/get_notifications.*` and `renderer/get_action_log.*` golden families may change.
- Preserve the existing uncommitted `src/generated/api-commands.ts` v0.524.0 regeneration and include it intentionally in Task 1.
- Do not edit generated metadata by hand; regenerate it only with `bun run generate:api`.

## File Structure

- Create `src/ship-commission-receipt.ts`: pure validation and human receipt-string construction shared by notification renderers.
- Modify `src/generated/api-commands.ts`: deterministic v0.524.0 output already present in the working tree; Task 1 verifies and commits it.
- Modify `src/command-overrides-core.ts`: correct curated craft/recycle descriptions and preset help.
- Modify `src/command-metadata.test.ts`: replace assertions that enforce obsolete combined `fast`/`cheap` wording.
- Modify `src/notifications.ts`: add the inline `ship_commission_complete` handler.
- Modify `src/notifications.test.ts`: cover valid and malformed inline receipt presentation and exhaustive handler registration.
- Modify `src/display/notifications.ts`: use the shared receipt helper for notification-poll Message cells.
- Modify `src/display/notifications.fixtures.ts`: add the schema-shaped notification receipt fixture.
- Modify `src/display/social.ts`: project commission/ship IDs from action-log entry data and add conditional columns.
- Modify `src/display/social.fixtures.ts`: add the schema-shaped durable action-log receipt fixture.
- Modify `src/formatter.test.ts`: assert both receipt IDs in notification and action-log human output.
- Modify the eight affected renderer stdout goldens under `src/golden-output/renderer/`: four output formats each for `get_notifications` and `get_action_log`.

---

### Task 1: Verify v0.524 Metadata and Correct Curated Routing Help

**Files:**
- Modify: `src/generated/api-commands.ts:1-5905`
- Modify: `src/command-overrides-core.ts:339-478`
- Test: `src/command-metadata.test.ts:545-630`
- Test: `src/api-sync.test.ts:360-395`

**Interfaces:**
- Consumes: cached `spacemolt-docs/openapi.json` with `x-gameserver-version: v0.524.0`.
- Produces: deterministic `GENERATED_API_GAMESERVER_VERSION === 'v0.524.0'` and corrected curated `BUNDLED_COMMAND_REGISTRY.commands.craft/recycle` help metadata.

- [ ] **Step 1: Replace stale command-help expectations with semantic assertions**

In `src/command-metadata.test.ts`, replace the craft assertion that requires `globally fastest or cheapest` with this block immediately after the existing preset-enum assertion:

```ts
const craftPresetHelp = config?.schema?.preset?.description ?? '';
expect(craftPresetHelp).toContain("'fast'");
expect(craftPresetHelp).toContain('soonest');
expect(craftPresetHelp).toContain("'cheap'");
expect(craftPresetHelp).toContain('lowest fee you would actually pay');
expect(craftPresetHelp).toContain('free');
expect(craftPresetHelp).toContain('ally-granted');
expect(craftPresetHelp).toContain('public rental');
expect(craftPresetHelp).toContain("'workshop'");
expect(craftPresetHelp).not.toContain("'fast' or 'cheap' selects the globally fastest or cheapest");
```

After the existing `const help = captureHelp('craft');` declaration, replace its obsolete `globally fastest or cheapest` assertion with:

```ts
expect(help).toContain('own facility');
expect(help).toContain('faction');
expect(help).toContain('ally-granted');
expect(help).toContain('public rental');
expect(help).toContain('lowest fee you would actually pay');
expect(help).toContain('workshop');
expect(help).not.toContain('globally fastest or cheapest');
```

Inside `test('recycle help documents queued lossy reverse production', ...)`, add this block after the existing preset-enum assertion:

```ts
const recyclePresetHelp = config?.schema?.preset?.description ?? '';
expect(recyclePresetHelp).toContain("'fast'");
expect(recyclePresetHelp).toContain('soonest');
expect(recyclePresetHelp).toContain("'cheap'");
expect(recyclePresetHelp).toContain('lowest fee you would actually pay');
expect(recyclePresetHelp).toContain('free');
expect(recyclePresetHelp).toContain('ally-granted');
expect(recyclePresetHelp).toContain('public rental');
expect(recyclePresetHelp).toContain("'workshop' doesn't apply");
```

After the existing `const help = captureHelp('recycle');` declaration, add:

```ts
expect(help).toContain('ally-granted');
expect(help).toContain('lowest fee you would actually pay');
expect(help).toContain('real recycler');
expect(help).toContain('workshop does not apply');
expect(help).not.toContain('globally fastest or cheapest');
```

- [ ] **Step 2: Run the focused help tests and confirm the stale help fails**

Run:

```bash
bun test src/command-metadata.test.ts --test-name-pattern 'craft help|recycle help'
```

Expected: FAIL because current curated help omits `ally-granted` and still contains `globally fastest or cheapest`.

- [ ] **Step 3: Update the curated craft and recycle descriptions**

In `src/command-overrides-core.ts`, keep the existing usage, examples, schemas, and package/storage details. Replace the two top-level descriptions with these exact values:

```ts
// craft.description
'Queue crafting work or cancel queued jobs. Default routing prefers your own facility, then your faction\'s, then an ally-granted facility, then a public rental, and finally the Station Workshop. The fast preset chooses the soonest-finishing eligible venue globally, so a paid public rental may win; cheap chooses the lowest fee you would actually pay, with your own, faction, and ally-granted facilities free to you; prefer_own stays on those own/faction/ally-granted facilities and rents publicly only when none can run the job. Ordinary production escrows inputs from source (defaults to deliver_to) and delivers to deliver_to (default: storage); use faction:<bucket> for Storage Extension buckets. Package recipes pack_package and unpack_package run at Logistics (including the station-owned T1 Package Logistics Bay at empire stations for 1 credit per operation): pack with items=JSON and label, unpack with package_id, and use source/target (cargo allowed; target defaults to source; deliver_to aliases target). Workshop unpack (preset=workshop) is slower and does not recover the cargo_container. Inspect finished packages with inspect.'

// recycle.description
'Queue a recycling job or cancel queued jobs. Feedstock is pulled from source (defaults to deliver_to) and recovered inputs go to deliver_to (default: storage). Use faction:<bucket> for Storage Extension buckets. Default routing prefers your own recycler, then your faction\'s, then an ally-granted recycler, then a public rental. The fast preset chooses the soonest-finishing eligible recycler globally, so a paid public rental may win; cheap chooses the lowest fee you would actually pay, with your own, faction, and ally-granted recyclers free to you; prefer_own stays on those own/faction/ally-granted recyclers and rents publicly only when none can run the job. Recycling always needs a real recycler facility; workshop does not apply.'
```

Replace the two `schemaExtensions.preset.description` values with:

```ts
// craft schemaExtensions.preset.description
"Auto-routing preset: 'fast' chooses the soonest-finishing eligible facility globally, so a busy own facility may route to an idle public rental. 'cheap' chooses the lowest fee you would actually pay; your own, faction, and ally-granted facilities are free to you and beat paid rentals. 'prefer_own' keeps the job on your own, faction, or ally-granted facility and only rents publicly when none can run it. Default routing uses that ownership order before public rental and Station Workshop fallback. 'workshop' forces hand-crafting (for unpack_package: slower and does not recover the cargo_container)."

// recycle schemaExtensions.preset.description
"Auto-routing preset: 'fast' chooses the soonest-finishing eligible recycler globally, so a busy own recycler may route to an idle public rental. 'cheap' chooses the lowest fee you would actually pay; your own, faction, and ally-granted recyclers are free to you and beat paid rentals. 'prefer_own' keeps the job on your own, faction, or ally-granted recycler and only rents publicly when none can run it. Default routing uses that ownership order before public rental. 'workshop' doesn't apply because recycling always needs a real recycler facility."
```

- [ ] **Step 4: Regenerate metadata and verify focused help/API sync tests pass**

Run:

```bash
bun run generate:api
bun test src/command-metadata.test.ts --test-name-pattern 'craft help|recycle help'
bun test src/api-sync.test.ts
```

Expected: all selected tests pass; generated metadata still reports v0.524.0, contains `ally_facility_access`, and matches an in-memory regeneration exactly.

- [ ] **Step 5: Commit deterministic metadata and corrected help together**

```bash
git add src/generated/api-commands.ts src/command-overrides-core.ts src/command-metadata.test.ts
git commit -m "fix(commands): sync v0.524 facility routing help"
```

### Task 2: Add Shared Receipt Formatting and Inline Notification Presentation

**Files:**
- Create: `src/ship-commission-receipt.ts`
- Modify: `src/notifications.ts:1-560`
- Test: `src/notifications.test.ts:1-430`

**Interfaces:**
- Consumes: unknown notification `data` values shaped like OpenAPI `Notification_ship_commission_complete`.
- Produces: `formatShipCommissionReceipt(value: unknown): string | undefined`; inline notification handler keyed by `ship_commission_complete`.

- [ ] **Step 1: Add failing inline receipt and malformed fallback tests**

Add this entry to the `knownCases` array in `src/notifications.test.ts`:

```ts
{
  msgType: 'ship_commission_complete',
  data: {
    tick: 901400,
    commission_id: 'commission-1',
    ship_id: 'ship-42',
    ship_class: 'prospector',
    ship_name: 'Prospector',
    base_id: 'earth_station',
    base_name: 'Earth Station',
  },
  snippets: [
    '[SHIP READY]',
    'Commission commission-1',
    'Prospector (prospector)',
    'ship ship-42',
    'Earth Station (earth_station)',
  ],
},
```

Add this focused fallback test after the known-case formatter test:

```ts
test('malformed ship commission receipt falls back without diagnostic tokens', () => {
  const output = stripAnsi(
    formatNotification({
      type: 'system',
      msg_type: 'ship_commission_complete',
      timestamp: '2026-07-17T20:00:00.000Z',
      data: {
        commission_id: 'commission-only',
        ship_id: { malformed: true },
        ship_name: Number.NaN,
      },
    }).join('\n'),
  );

  expect(output).toContain('commission_id: "commission-only"');
  expectNoDiagnosticTokens(output);
});
```

- [ ] **Step 2: Run the focused inline tests and verify they fail**

Run:

```bash
bun test src/notifications.test.ts --test-name-pattern 'ship commission|known notification cases cover every formatter'
```

Expected: FAIL because `ship_commission_complete` has no registered handler and the valid case lacks `[SHIP READY]` dedicated output.

- [ ] **Step 3: Create the pure shared receipt helper**

Create `src/ship-commission-receipt.ts` with:

```ts
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function scalarText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function namedId(name: string | undefined, id: string | undefined): string | undefined {
  if (name && id && name !== id) return `${name} (${id})`;
  return name ?? id;
}

export function formatShipCommissionReceipt(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;

  const commissionId = scalarText(value.commission_id);
  const shipId = scalarText(value.ship_id);
  if (!commissionId || !shipId) return undefined;

  const ship = namedId(scalarText(value.ship_name), scalarText(value.ship_class));
  const base = namedId(scalarText(value.base_name), scalarText(value.base_id));
  const delivered = ship ? `delivered ${ship}, ship ${shipId}` : `delivered ship ${shipId}`;
  const location = base ? `, at ${base}` : '';
  return `Commission ${commissionId} ${delivered}${location}`;
}
```

- [ ] **Step 4: Register the inline notification handler**

Add the import to `src/notifications.ts`:

```ts
import { formatShipCommissionReceipt } from './ship-commission-receipt.ts';
```

Add this entry to `createNotificationHandlers`:

```ts
ship_commission_complete: (data, time, writeLine) => {
  const receipt = formatShipCommissionReceipt(data);
  if (!receipt) return;
  writeLine(`${c.dim}[${time}]${c.reset} ${c.green}${c.bright}[SHIP READY]${c.reset} ${receipt}`);
},
```

Do not add a fallback inside the handler. Returning without output intentionally lets `formatNotification` invoke its existing generic fallback.

- [ ] **Step 5: Run inline receipt tests and the full notification test file**

Run:

```bash
bun test src/notifications.test.ts --test-name-pattern 'ship commission|known notification cases cover every formatter'
bun test src/notifications.test.ts
```

Expected: all tests pass; the valid receipt has dedicated output, malformed data has generic key/value output, and handler coverage remains exhaustive.

- [ ] **Step 6: Commit the shared helper and inline formatter**

```bash
git add src/ship-commission-receipt.ts src/notifications.ts src/notifications.test.ts
git commit -m "feat(output): format ship commission notifications"
```

### Task 3: Render Polled Commission Notifications and Promote the Fixture

**Files:**
- Modify: `src/display/notifications.ts:1-205`
- Modify: `src/display/notifications.fixtures.ts:1-75`
- Modify: `src/formatter.test.ts:1-1900`
- Modify: `src/golden-output/renderer/get_notifications.table.stdout`
- Modify: `src/golden-output/renderer/get_notifications.json.stdout`
- Modify: `src/golden-output/renderer/get_notifications.yaml.stdout`
- Modify: `src/golden-output/renderer/get_notifications.compact-json.stdout`

**Interfaces:**
- Consumes: `formatShipCommissionReceipt(value: unknown): string | undefined` from Task 2.
- Produces: a dedicated `Message` cell for `ship_commission_complete`; schema-shaped high-value fixture coverage across table/JSON/YAML/compact JSON.

- [ ] **Step 1: Extend the high-value notification fixture with a commission receipt**

In `src/display/notifications.fixtures.ts`, change `count` from `3` to `4` and append this notification after the market update:

```ts
{
  id: 'notif-ship-1',
  type: 'system',
  msg_type: 'ship_commission_complete',
  data: {
    tick: 901400,
    commission_id: 'commission-1',
    ship_id: 'ship-42',
    ship_class: 'prospector',
    ship_name: 'Prospector',
    base_id: 'earth_station',
    base_name: 'Earth Station',
  },
  timestamp: '2026-07-17T20:00:00.000Z',
},
```

Also change the fixture comment from `system + chat + market update` to `system + chat + market update + ship commission receipt`.

- [ ] **Step 2: Add a failing table-presentation test**

Add `getNotificationsFixture` to the existing imports from `./display/formatter-fixtures`, then add this test near the other notification formatter tests in `src/formatter.test.ts`:

```ts
test('formats ship commission completion as a readable notification receipt', () => {
  const { stdout, stderr } = captureStructuredOutput('get_notifications', getNotificationsFixture);

  expect(stderr).toBe('');
  expect(stdout).toContain('ship_commission_complete');
  expect(stdout).toContain('Commission commission-1');
  expect(stdout).toContain('ship ship-42');
  expect(stdout).toContain('Prospector (prospector)');
  expect(stdout).toContain('Earth Station (earth_station)');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('[object Object]');
});
```

- [ ] **Step 3: Run the focused formatter test and verify the generic JSON message fails the expectation**

Run:

```bash
bun test src/formatter.test.ts --test-name-pattern 'ship commission completion as a readable notification receipt'
```

Expected: FAIL because the current Message cell is compact JSON and does not contain the dedicated `Commission commission-1 delivered ...` wording.

- [ ] **Step 4: Use the shared helper in the notification table formatter**

Add the import to `src/display/notifications.ts`:

```ts
import { formatShipCommissionReceipt } from '../ship-commission-receipt.ts';
```

Inside `formatNotificationMessage`, immediately after the existing crafting branches, add:

```ts
if (type === 'ship_commission_complete') {
  const receipt = formatShipCommissionReceipt(data);
  if (receipt) return receipt;
}
```

If the helper returns `undefined`, leave the remaining sender/message/compact-JSON fallback logic unchanged.

- [ ] **Step 5: Run the focused formatter tests**

Run:

```bash
bun test src/formatter.test.ts --test-name-pattern 'notification receipt|notifications as text|market update notifications'
```

Expected: all selected tests pass and stderr remains empty.

- [ ] **Step 6: Update only the get_notifications renderer goldens**

Run:

```bash
UPDATE_GOLDENS=1 GOLDEN_ONLY=renderer/get_notifications bun test src/output-golden.test.ts
```

Expected: only the four `get_notifications.*.stdout` renderer goldens change. The table contains the dedicated receipt string; JSON, YAML, and compact JSON contain the structured notification object.

- [ ] **Step 7: Verify strict goldens and notification fixture/schema compatibility**

Run:

```bash
STRICT_FIXTURE_SCHEMA_DIVERGENCES=1 bun test src/output-golden.test.ts
bun run report:fixture-schemas --only get_notifications
```

Expected: golden suite passes, no blocking fixture/schema divergence is introduced, and no unexpected golden files appear.

- [ ] **Step 8: Commit notification-poll presentation and goldens**

```bash
git add src/display/notifications.ts src/display/notifications.fixtures.ts src/formatter.test.ts src/golden-output/renderer/get_notifications.table.stdout src/golden-output/renderer/get_notifications.json.stdout src/golden-output/renderer/get_notifications.yaml.stdout src/golden-output/renderer/get_notifications.compact-json.stdout
git commit -m "feat(output): render commission receipts in notification polls"
```

### Task 4: Show Durable Commission Receipts in Action Logs

**Files:**
- Modify: `src/display/social.ts:40-555`
- Modify: `src/display/social.fixtures.ts:655-735`
- Modify: `src/formatter.test.ts:1695-1730`
- Modify: `src/golden-output/renderer/get_action_log.table.stdout`
- Modify: `src/golden-output/renderer/get_action_log.json.stdout`
- Modify: `src/golden-output/renderer/get_action_log.yaml.stdout`
- Modify: `src/golden-output/renderer/get_action_log.compact-json.stdout`

**Interfaces:**
- Consumes: OpenAPI `ActionLogEntry.data` as an optional record of scalar values.
- Produces: presentation-only `commission_id` and `ship_id` row fields with conditional `Commission` and `Ship` columns.

- [ ] **Step 1: Add a schema-shaped durable receipt to the action-log fixture**

In `src/display/social.fixtures.ts`, change `total` from `4` to `5` and append this entry to `actionLogFixture.entries`:

```ts
{
  id: 5,
  created_at: '2026-07-17T20:00:01.000Z',
  summary: 'Prospector completed at Earth Station.',
  category: 'ship',
  event_type: 'ship.commission_completed',
  data: {
    commission_id: 'commission-1',
    ship_id: 'ship-42',
    ship_class: 'prospector',
    ship_name: 'Prospector',
    base_id: 'earth_station',
    base_name: 'Earth Station',
  },
},
```

Update the fixture comment to say that selected receipt IDs are projected into dedicated table columns while all action data remains nested in machine formats.

- [ ] **Step 2: Add failing action-log column assertions**

Inside `test('formats action log entries without raw JSON fallback', ...)` in `src/formatter.test.ts`, add:

```ts
expect(stdout).toContain('ship.commission_completed');
expect(stdout).toContain('Commission');
expect(stdout).toContain('commission-1');
expect(stdout).toContain('Ship');
expect(stdout).toContain('ship-42');
```

- [ ] **Step 3: Run the action-log formatter test and verify it fails**

Run:

```bash
bun test src/formatter.test.ts --test-name-pattern 'formats action log entries without raw JSON fallback'
```

Expected: FAIL because `entry.data.commission_id` and `entry.data.ship_id` are not projected into table columns.

- [ ] **Step 4: Add defensive identifier projection and conditional columns**

Add this helper near `hasAnyField` in `src/display/social.ts`:

```ts
function identifierText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}
```

Replace the action-log row mapping with:

```ts
const rows = r.entries.filter(isRecord).map((entry) => {
  const data = isRecord(entry.data) ? entry.data : undefined;
  return {
    ...entry,
    timestamp_preview: formatTimestampPreview(entry.created_at ?? entry.timestamp),
    category: entry.category ?? category,
    commission_id: identifierText(entry.commission_id) ?? identifierText(data?.commission_id),
    ship_id: identifierText(entry.ship_id) ?? identifierText(data?.ship_id),
  };
});
```

Immediately after the conditional Event column, add:

```ts
if (hasAnyField(rows, ['commission_id'])) columns.push(['Commission', ['commission_id']]);
if (hasAnyField(rows, ['ship_id'])) columns.push(['Ship', ['ship_id']]);
```

Keep all existing Job, Mode, Runs, Venue, and Storage column logic unchanged.

- [ ] **Step 5: Run focused action-log tests**

Run:

```bash
bun test src/formatter.test.ts --test-name-pattern 'action log'
```

Expected: all selected tests pass; the durable receipt row exposes both IDs and unrelated log rows remain readable.

- [ ] **Step 6: Update only the get_action_log renderer goldens**

Run:

```bash
UPDATE_GOLDENS=1 GOLDEN_ONLY=renderer/get_action_log bun test src/output-golden.test.ts
```

Expected: only the four `get_action_log.*.stdout` renderer goldens change. The table gains conditional Commission and Ship columns; machine-format goldens retain `data` as a nested object.

- [ ] **Step 7: Verify strict goldens and action-log fixture/schema compatibility**

Run:

```bash
STRICT_FIXTURE_SCHEMA_DIVERGENCES=1 bun test src/output-golden.test.ts
bun run report:fixture-schemas --only get_action_log
```

Expected: golden suite passes and the `ActionLogData` scalar fields introduce no blocking fixture/schema divergence.

- [ ] **Step 8: Commit action-log presentation and goldens**

```bash
git add src/display/social.ts src/display/social.fixtures.ts src/formatter.test.ts src/golden-output/renderer/get_action_log.table.stdout src/golden-output/renderer/get_action_log.json.stdout src/golden-output/renderer/get_action_log.yaml.stdout src/golden-output/renderer/get_action_log.compact-json.stdout
git commit -m "feat(output): show commission receipts in action logs"
```

### Task 5: Run Complete Compatibility Verification

**Files:**
- Verify: `src/generated/api-commands.ts`
- Verify: `src/command-overrides-core.ts`
- Verify: `src/ship-commission-receipt.ts`
- Verify: `src/notifications.ts`
- Verify: `src/display/notifications.ts`
- Verify: `src/display/social.ts`
- Verify: affected tests, fixtures, and golden files from Tasks 1-4.

**Interfaces:**
- Consumes: all committed deliverables from Tasks 1-4.
- Produces: fresh evidence that the implementation satisfies the approved spec without live network access.

- [ ] **Step 1: Re-run deterministic generation and API metadata checks**

Run:

```bash
bun run generate:api
bun test src/api-sync.test.ts
git diff --exit-code -- src/generated/api-commands.ts
```

Expected: generator produces no diff and all 8 API sync tests pass.

- [ ] **Step 2: Run focused behavior and strict golden tests**

Run:

```bash
bun test src/command-metadata.test.ts src/notifications.test.ts src/formatter.test.ts
STRICT_FIXTURE_SCHEMA_DIVERGENCES=1 bun test src/output-golden.test.ts
bun run report:fixture-schemas --only get_notifications,get_action_log
```

Expected: all focused tests and strict goldens pass; the informational reporter shows no new blocking divergence for either receipt fixture.

- [ ] **Step 3: Run static analysis and build**

Run:

```bash
bun run typecheck
bun run lint
bun run build
```

Expected: TypeScript reports no errors, Biome reports no diagnostics or fixes, and the CLI binary builds successfully.

- [ ] **Step 4: Run the full test suite**

Run:

```bash
bun test
```

Expected: the complete repository test suite passes with zero failures.

- [ ] **Step 5: Review the final repository diff and commit state**

Run:

```bash
git diff --check
git status --short
git log -5 --oneline
```

Expected: no whitespace errors; no unintended files or golden families are modified; Tasks 1-4 appear as four focused implementation commits after the design/plan documentation commits.
