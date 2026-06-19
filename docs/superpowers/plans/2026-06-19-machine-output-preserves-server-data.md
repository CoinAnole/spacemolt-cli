# Machine Output Preserves Server Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `--json`, `--structured`, and explicit projection output operate on unmodified server response data while keeping display filters and local enrichments for human table/text output.

**Architecture:** Split renderer inputs into raw server data for machine/projection output and derived display data for human output. Preserve existing display filter helpers by moving their call site behind the machine/projection branches. Make structured output normalization identity-only so nearby arrays and `list_ships` fields are no longer truncated or rewritten for automation.

**Tech Stack:** Bun test runner, TypeScript CLI renderer, `APIResponse` envelopes, structuredContent projection helpers, golden output tests.

---

## File Structure

- Modify `src/response-renderer.ts`: route `--json`, `--structured`, and projection output through the original response; call display filters/enrichments only for human output; rename `applyDisplayFilters()` to `applyHumanDisplayFilters()`.
- Modify `src/response.ts`: make `normalizeStructuredResultForOutput()` return raw structured data and remove private nearby/list-ships limiting helpers.
- Modify `src/response-renderer.test.ts`: update machine-output tests so storage, market, cargo, nearby, and `list_ships` output preserve full server data.
- Modify `src/formatter.test.ts`: update pure structured renderer YAML coverage so `format: 'yaml'` preserves full nearby collections.
- No golden output file changes are expected because current high-value fixtures do not contain nearby collections larger than the previous limit or a `list_ships` case.

### Task 1: Add Failing Machine-Output Preservation Tests

**Files:**
- Modify: `src/response-renderer.test.ts`
- Modify: `src/formatter.test.ts`

- [ ] **Step 1: Replace the nearby structured-output truncation test**

In `src/response-renderer.test.ts`, replace the existing `renderResponse truncates nearby collections in --structured output without mutating the response` test with this test:

```ts
  test('renderResponse preserves nearby collections in --structured output without mutating the response', async () => {
    const capture = fakeContext();
    const structuredContent = {
      nearby: nearbyPlayers(12),
      count: 12,
      empire_npcs: nearbyNpcs(13),
      empire_npc_count: 13,
    };

    const exitCode = await renderResponse(
      {
        command: 'get_nearby',
        displayCommand: 'get_nearby',
        response: { structuredContent },
      },
      { ...baseOptions, dryRun: true, structured: true },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(capture.text());
    expect(parsed.nearby).toHaveLength(12);
    expect(parsed.empire_npcs).toHaveLength(13);
    expect(parsed.nearby[11].username).toBe('Pilot 12');
    expect(parsed.empire_npcs[12].name).toBe('Patrol 13');
    expect(parsed.nearby_player_count).toBeUndefined();
    expect(parsed.nearby_empire_npc_count).toBeUndefined();
    expect(structuredContent.nearby).toHaveLength(12);
    expect(structuredContent.empire_npcs).toHaveLength(13);
  });
```

- [ ] **Step 2: Replace the `list_ships` structured-output normalization test**

In `src/response-renderer.test.ts`, replace the existing `renderResponse normalizes list_ships --structured output to canonical fields` test with this test:

```ts
  test('renderResponse preserves list_ships --structured output fields exactly', async () => {
    const capture = fakeContext();
    const structuredContent = {
      ships: [
        {
          ship_id: 'ship-active',
          class_id: 'lithosphere',
          class_name: 'Lithosphere',
          custom_name: 'Burn-Rate Betty',
          is_active: true,
          location: 'active (with you)',
        },
        {
          ship_id: 'ship-stored',
          class_id: 'dust_devil',
          class_name: 'Dust Devil',
          is_active: false,
          location: 'stored at Nova Terra Central',
          location_base_id: 'nova_terra_central',
        },
      ],
      count: 2,
      active_ship_id: 'ship-active',
      active_ship_class: 'lithosphere',
    };

    const exitCode = await renderResponse(
      {
        command: 'list_ships',
        displayCommand: 'list_ships',
        response: { structuredContent },
      },
      { ...baseOptions, dryRun: true, structured: true },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(capture.text());
    expect(parsed).toEqual(structuredContent);
    expect(parsed.ships[0].location).toBe('active (with you)');
    expect(parsed.ships[1].location).toBe('stored at Nova Terra Central');
    expect(parsed.ships[0].ship_class).toBeUndefined();
    expect(parsed.ships[0].active).toBeUndefined();
  });
```

- [ ] **Step 3: Update storage, market, and cargo machine-output expectations**

In `src/response-renderer.test.ts`, update the existing machine-output filter tests as follows.

For `renderResponse applies storage view item filter to --json output`, replace the final assertions with:

```ts
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(capture.text());
    expect(parsed.structuredContent.total_items).toBeUndefined();
    expect(parsed.structuredContent.items).toEqual([
      expect.objectContaining({ item_id: 'iron_ore' }),
      expect.objectContaining({ item_id: 'fuel_cell' }),
    ]);
```

For `renderResponse applies storage view search filter to --structured output`, rename the test to `renderResponse keeps storage view search payload raw in --structured output` and replace the final assertions with:

```ts
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(capture.text());
    expect(parsed.total_items).toBeUndefined();
    expect(parsed.items).toEqual([
      expect.objectContaining({ item_id: 'iron_ore' }),
      expect.objectContaining({ item_id: 'fuel_cell' }),
    ]);
```

For `renderResponse applies storage view items filter to --structured output`, rename the test to `renderResponse keeps storage view items payload raw in --structured output` and replace the final assertions with:

```ts
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(capture.text());
    expect(parsed.total_items).toBeUndefined();
    expect(parsed.items).toEqual([
      expect.objectContaining({ item_id: 'iron_ore' }),
      expect.objectContaining({ item_id: 'fuel_cell' }),
      expect.objectContaining({ item_id: 'steel_plate' }),
    ]);
```

For `renderResponse applies storage view array items filter to --structured output`, rename the test to `renderResponse keeps storage view array items payload raw in --structured output` and replace the final assertions with:

```ts
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(capture.text());
    expect(parsed.total_items).toBeUndefined();
    expect(parsed.items.map((item: { item_id: string }) => item.item_id)).toEqual([
      'iron_ore',
      'fuel_cell',
      'steel_plate',
    ]);
```

For `renderResponse applies view_market item filter to --json output`, rename the test to `renderResponse keeps view_market item payload raw in --json output` and replace the final assertions with:

```ts
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(capture.text());
    expect(parsed.structuredContent.total_items).toBeUndefined();
    expect(parsed.structuredContent.items).toEqual([
      expect.objectContaining({ item_id: 'iron_ore' }),
      expect.objectContaining({ item_id: 'fuel_cell' }),
    ]);
```

For `renderResponse applies get_cargo filters to JSON output`, rename the test to `renderResponse keeps get_cargo top payload raw in JSON output` and replace the final assertions with:

```ts
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(capture.text());
    expect(parsed.structuredContent.cargo).toEqual([
      expect.objectContaining({ item_id: 'ore_copper' }),
      expect.objectContaining({ item_id: 'ore_iron' }),
    ]);
```

For `renderResponse applies get_cargo items filter to JSON output`, rename the test to `renderResponse keeps get_cargo items payload raw in JSON output` and replace the final assertions with:

```ts
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(capture.text());
    expect(parsed.structuredContent.cargo).toEqual([
      expect.objectContaining({ item_id: 'ore_copper' }),
      expect.objectContaining({ item_id: 'ore_iron' }),
      expect.objectContaining({ item_id: 'fuel_cell' }),
    ]);
```

- [ ] **Step 4: Add projection coverage for raw structured data**

In `src/response-renderer.test.ts`, insert this test after the storage machine-output tests and before the human table filter tests:

```ts
  test('renderResponse projections use raw structured content before display filters', async () => {
    const capture = fakeContext();
    const exitCode = await renderResponse(
      {
        command: 'storage',
        displayCommand: 'storage',
        payload: { action: 'view', search: 'fuel' },
        response: {
          structuredContent: {
            items: [
              { item_id: 'iron_ore', item_name: 'Iron Ore', quantity: 718 },
              { item_id: 'fuel_cell', item_name: 'Fuel Cell', quantity: 12 },
            ],
          },
        },
      },
      { ...baseOptions, dryRun: true, jq: '.items[].item_id', format: 'json' },
      { config: { profile: 'pilot' } } as unknown as SpaceMoltClient,
      capture.context,
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(capture.text())).toEqual(['iron_ore', 'fuel_cell']);
  });
```

- [ ] **Step 5: Update pure YAML renderer coverage**

In `src/formatter.test.ts`, replace the existing `yaml output truncates nearby player and NPC collections without losing totals` test with this test:

```ts
  test('yaml output preserves nearby player and NPC collections', () => {
    const result = {
      ...getStatusFixture,
      location: {
        ...getStatusFixture.location,
        nearby_players: nearbyPlayers(12),
        nearby_empire_npcs: nearbyNpcs(13),
      },
    };

    const rendered = renderStructuredResult('get_status', result, globalOptions({ format: 'yaml' }));
    const yaml = rendered.stdout.join('\n');

    expect(rendered.success).toBe(true);
    expect(yaml).toContain('username: "Pilot 12"');
    expect(yaml).toContain('name: "Patrol 13"');
  });
```

- [ ] **Step 6: Run focused tests and verify they fail for the expected reasons**

Run:

```bash
bun test src/response-renderer.test.ts src/formatter.test.ts
```

Expected: FAIL. The failures should show current behavior still filters storage/market/cargo machine output, truncates nearby collections to 10, rewrites `list_ships` structured output, and filters the projection input.

### Task 2: Split Machine/Projection Rendering From Human Display Rendering

**Files:**
- Modify: `src/response-renderer.ts`

- [ ] **Step 1: Remove the unused structured-output normalization import**

In `src/response-renderer.ts`, change the response import from:

```ts
import { getStructuredResult, isRecord, normalizeStructuredResultForOutput } from './response.ts';
```

to:

```ts
import { getStructuredResult, isRecord } from './response.ts';
```

- [ ] **Step 2: Replace the render branch around `filteredResponse`**

In `src/response-renderer.ts`, replace this block:

```ts
  const filteredResponse = applyDisplayFilters(command, response, commandRun.payload);

  if ((isJson || renderOptions.structured) && !hasProjection) {
    if (renderOptions.structured && filteredResponse.structuredContent) {
      const out = writer?.out.bind(writer) ?? console.log;
      const warning =
        renderOptions.quiet || isJson
          ? undefined
          : catalogTruncationWarning(displayCommand, filteredResponse.structuredContent);
      if (warning) {
        const err = writer?.err.bind(writer) ?? console.error;
        err(warning);
      }
      out(
        JSON.stringify(
          normalizeStructuredResultForOutput(displayCommand, filteredResponse.structuredContent),
          null,
          renderOptions.compact ? 0 : 2,
        ),
      );
      return 0;
    }
    printJsonResponse(filteredResponse, renderOptions.compact, writer);
    return filteredResponse.error ? 1 : 0;
  }

  const display = prepareHumanDisplay(commandRun, filteredResponse, {
    sessionPath,
    options: renderOptions,
    hasProjection,
    isJson,
  });
```

with this block:

```ts
  if ((isJson || renderOptions.structured) && !hasProjection) {
    if (renderOptions.structured && response.structuredContent) {
      const out = writer?.out.bind(writer) ?? console.log;
      const warning =
        renderOptions.quiet || isJson ? undefined : catalogTruncationWarning(displayCommand, response.structuredContent);
      if (warning) {
        const err = writer?.err.bind(writer) ?? console.error;
        err(warning);
      }
      out(JSON.stringify(response.structuredContent, null, renderOptions.compact ? 0 : 2));
      return 0;
    }
    printJsonResponse(response, renderOptions.compact, writer);
    return response.error ? 1 : 0;
  }

  if (hasProjection) {
    const success = displayResult(displayCommand, response, { ...renderOptions, noTimestamp: true }, context);
    return success === false ? 1 : 0;
  }

  const displayResponse = applyHumanDisplayFilters(command, response, commandRun.payload);
  const display = prepareHumanDisplay(commandRun, displayResponse, {
    sessionPath,
    options: renderOptions,
    hasProjection: false,
    isJson,
  });
```

- [ ] **Step 3: Rename display filter helper**

In `src/response-renderer.ts`, rename the function declaration:

```ts
function applyDisplayFilters(command: string, response: APIResponse, payload?: Record<string, unknown>): APIResponse {
```

to:

```ts
function applyHumanDisplayFilters(command: string, response: APIResponse, payload?: Record<string, unknown>): APIResponse {
```

The call site added in Step 2 should be the only reference to `applyHumanDisplayFilters`.

- [ ] **Step 4: Run focused tests**

Run:

```bash
bun test src/response-renderer.test.ts src/formatter.test.ts
```

Expected: Some tests may still fail because `display/index.ts` still calls `normalizeStructuredResultForOutput()` for projections and pure structured rendering. Storage/market/cargo raw JSON cases should now pass.

### Task 3: Make Structured Output Normalization Preserve Raw Data

**Files:**
- Modify: `src/response.ts`

- [ ] **Step 1: Replace output normalization with identity behavior**

In `src/response.ts`, replace the current `normalizeStructuredResultForOutput()` implementation and all private helpers below it with this implementation:

```ts
export function normalizeStructuredResultForOutput(
  _command: string,
  result: Record<string, unknown>,
): Record<string, unknown> {
  return result;
}
```

Delete these now-unused declarations from `src/response.ts`: `STRUCTURED_NEARBY_LIMIT`, `NEARBY_LIMITED_COMMANDS`, `limitStructuredNearbyForOutput`, `limitNearbyArrays`, `limitArray`, `findExistingCount`, `normalizeCommandName`, `normalizeListShipsForOutput`, `normalizeListedShip`, `normalizeListedShipLocation`, `stringOrNull`, and `booleanOrDefault`.

- [ ] **Step 2: Run focused tests and verify they pass**

Run:

```bash
bun test src/response-renderer.test.ts src/formatter.test.ts
```

Expected: PASS. The new raw machine-output tests should pass, and human table filter tests should still pass.

- [ ] **Step 3: Run TypeScript checking**

Run:

```bash
bun run typecheck
```

Expected: PASS with `tsc --noEmit`.

### Task 4: Golden Output And Full Verification

**Files:**
- No file changes are expected in this task.

- [ ] **Step 1: Run golden output tests**

Run:

```bash
bun test src/output-golden.test.ts
```

Expected: PASS with no unexpected fallback output, `NaN`, `undefined`, or `[object Object]` guardrail failures. If this fails, stop and inspect the reported diff before changing any golden file.

- [ ] **Step 2: Run lint**

Run:

```bash
bun run lint
```

Expected: PASS with `biome check src/` and no fixes applied.

- [ ] **Step 3: Run the full local test suite**

Run:

```bash
bun test
```

Expected: PASS with 0 failures.

### Task 5: Commit The Implementation

**Files:**
- Commit: `src/response-renderer.ts`
- Commit: `src/response.ts`
- Commit: `src/response-renderer.test.ts`
- Commit: `src/formatter.test.ts`
- Do not commit `src/golden-output/**` unless Task 4 was deliberately revised after inspecting a golden failure.

- [ ] **Step 1: Review the final diff**

Run:

```bash
git diff -- src/response-renderer.ts src/response.ts src/response-renderer.test.ts src/formatter.test.ts src/golden-output
```

Expected: The diff only separates raw machine/projection output from human display output, removes structured-output truncation/rewrites, updates tests, and includes intentional golden changes.

- [ ] **Step 2: Stage the implementation files**

Run:

```bash
git add src/response-renderer.ts src/response.ts src/response-renderer.test.ts src/formatter.test.ts src/golden-output
```

Expected: Only implementation, test, and intentional golden files are staged.

- [ ] **Step 3: Commit**

Run:

```bash
git commit -m "Preserve raw data for machine output"
```

Expected: Commit succeeds.

- [ ] **Step 4: Confirm clean worktree**

Run:

```bash
git status --short
```

Expected: No output.
