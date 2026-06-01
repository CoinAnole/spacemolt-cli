# Friendly Formatting Gap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add friendly table/text rendering and golden coverage for the 20 curated commands identified in the approved formatter-gap spec.

**Architecture:** Keep the existing renderer pipeline intact: JSON/YAML/projections are handled before human formatters, command-scoped formatters run before shape fallbacks, and raw `=== Response ===` remains the last resort. Add one conservative generic scalar/action fallback, then add focused formatter batches in the existing display modules that already own those domains.

**Tech Stack:** Bun test runner, TypeScript display modules, committed golden files under `src/golden-output/`, OpenAPI-backed local fixtures.

---

## File Structure

- Modify `src/test-support/formatter-golden-coverage.ts` to export the approved 20-command target list and a report that checks high-value fixture coverage plus fallback-free table rendering.
- Modify `src/test-support/formatter-golden-coverage.test.ts` to fail until every target command has a high-value fixture that renders without `=== Response ===`.
- Modify `src/display/generic.ts` for the conservative scalar/action fallback and generic list-key expansion.
- Modify `src/display/social.ts` for social/document/faction-room/forum/guide formatters.
- Modify `src/display/status.ts` for map, server-command, system-agent, scan, and mission-detail formatters.
- Modify `src/display/empire.ts` for `get_tax_estimate`.
- Modify `src/display/ship.ts` for `reload` and `salvage_wreck`.
- Modify fixture files:
  - `src/display/generic.fixtures.ts`
  - `src/display/social.fixtures.ts`
  - `src/display/status.fixtures.ts`
  - `src/display/ship.fixtures.ts`
- Golden files will be generated under `src/golden-output/renderer/`.

## Task 1: Add the Formatter Gap Coverage Guard

**Files:**
- Modify: `src/test-support/formatter-golden-coverage.ts`
- Modify: `src/test-support/formatter-golden-coverage.test.ts`

- [ ] **Step 1: Write the failing report helper**

Add these imports at the top of `src/test-support/formatter-golden-coverage.ts`:

```ts
import { renderStructuredResult } from '../display/index.ts';
```

Add this export after `GOLDEN_COVERAGE_OPT_OUTS`:

```ts
export const FRIENDLY_FORMATTING_TARGETS = [
  'captains_log_get',
  'create_faction',
  'faction_get_invites',
  'faction_intel_status',
  'faction_trade_intel_status',
  'faction_visit_room',
  'forum_get_thread',
  'get_commands',
  'get_guide',
  'get_map',
  'get_system_agents',
  'get_tax_estimate',
  'read_note',
  'reload',
  'salvage_wreck',
  'scan',
  'set_colors',
  'set_status',
  'undock',
  'view_completed_mission',
] as const;
```

Add these interfaces after `FormatterGoldenCoverageReport`:

```ts
export interface FriendlyFormattingGapReport {
  targets: string[];
  missingHighValueFixtures: string[];
  fallbackOutputs: string[];
}
```

Add this function before `formatFormatterCoverageError`:

```ts
export function friendlyFormattingGapReport(): FriendlyFormattingGapReport {
  const targetSet = new Set<string>(FRIENDLY_FORMATTING_TARGETS);
  const highValueEntries = Object.values(highValueCommandFixtures);
  const coveredTargets = new Set(
    highValueEntries.filter((entry) => targetSet.has(entry.command)).map((entry) => entry.command),
  );
  const missingHighValueFixtures = FRIENDLY_FORMATTING_TARGETS.filter((command) => !coveredTargets.has(command));
  const fallbackOutputs = highValueEntries
    .filter((entry) => targetSet.has(entry.command))
    .flatMap((entry) => {
      const rendered = renderStructuredResult(
        entry.command,
        structuredClone(entry.fixture),
        {
          args: [],
          json: false,
          quiet: false,
          plain: true,
          allowUnknown: false,
          dryRun: false,
          noTimestamp: true,
          compact: false,
        },
        {
          clock: { now: () => new Date('2026-05-29T00:00:00.000Z') },
          output: { json: false, quiet: false, plain: true, format: 'table', compact: false },
        },
      );
      return rendered.stdout.some((line) => line.includes('=== Response ===')) ? [entry.command] : [];
    });

  return {
    targets: [...FRIENDLY_FORMATTING_TARGETS],
    missingHighValueFixtures,
    fallbackOutputs: Array.from(new Set(fallbackOutputs)).sort((a, b) => a.localeCompare(b)),
  };
}
```

- [ ] **Step 2: Write the failing test**

Update the existing `src/test-support/formatter-golden-coverage.test.ts` import from `./formatter-golden-coverage` so it includes `friendlyFormattingGapReport`:

```ts
import {
  formatFormatterCoverageError,
  formatterGoldenCoverageReport,
  friendlyFormattingGapReport,
} from './formatter-golden-coverage';
```

Add this test:

```ts
test('friendly formatting gap targets have high-value non-fallback table output', () => {
  const report = friendlyFormattingGapReport();
  expect(report.missingHighValueFixtures).toEqual([]);
  expect(report.fallbackOutputs).toEqual([]);
});
```

- [ ] **Step 3: Run the focused test and verify it fails**

Run:

```bash
bun test src/test-support/formatter-golden-coverage.test.ts
```

Expected: FAIL with `missingHighValueFixtures` listing the 20 target commands.

- [ ] **Step 4: Commit the failing guard**

Run:

```bash
git add src/test-support/formatter-golden-coverage.ts src/test-support/formatter-golden-coverage.test.ts
git commit -m "test: guard friendly formatter gap coverage"
```

## Task 2: Add Generic Scalar and List Fallbacks

**Files:**
- Modify: `src/display/generic.ts`
- Modify: `src/display/generic.fixtures.ts`

- [ ] **Step 1: Add scalar-only fixtures**

In `src/display/generic.fixtures.ts`, add these fixtures after `empireInfoFixture`:

```ts
export const createFactionFixture = {
  action: 'create_faction',
  faction_id: 'faction-smc',
  name: 'Surveyor Mining Collective',
};

export const setColorsFixture = {
  action: 'set_colors',
};

export const setStatusFixture = {
  action: 'set_status',
};

export const undockFixture = {
  action: 'undock',
};
```

Add these entries to `genericHighValueFixtures`:

```ts
  create_faction: { command: 'create_faction', fixture: createFactionFixture },
  set_colors: { command: 'set_colors', fixture: setColorsFixture },
  set_status: { command: 'set_status', fixture: setStatusFixture },
  undock: { command: 'undock', fixture: undockFixture },
```

- [ ] **Step 2: Run the guard and verify it still fails for generic scalar targets**

Run:

```bash
bun test src/test-support/formatter-golden-coverage.test.ts
```

Expected: FAIL with `fallbackOutputs` containing `create_faction`, `set_colors`, `set_status`, and `undock`.

- [ ] **Step 3: Implement the generic fallback**

In `src/display/generic.ts`, expand `GENERIC_LIST_KEYS` to include the new list keys:

```ts
const GENERIC_LIST_KEYS = [
  'items',
  'missions',
  'factions',
  'facilities',
  'facility_types',
  'types',
  'ships',
  'orders',
  'notes',
  'threads',
  'results',
  'commands',
  'systems',
  'agents',
  'invites',
  'guides',
] as const;
```

Add these helpers before `export const genericFormatters`:

```ts
function isScalarDisplayValue(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function labelForScalarKey(key: string): string {
  return key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function titleForScalarAction(action: unknown): string {
  if (typeof action !== 'string' || action.trim() === '') return 'Result';
  return labelForScalarKey(action);
}
```

Add this formatter after the simple message formatter:

```ts
  // Conservative fallback for scalar-only action responses.
  formatter(
    (r) => {
      const entries = Object.entries(r).filter(([, value]) => value !== undefined && value !== null && value !== '');
      if (!entries.length || entries.length > 8) return false;
      if (entries.some(([, value]) => !isScalarDisplayValue(value))) return false;
      const hasActionMarker =
        typeof r.action === 'string' ||
        typeof r.success === 'boolean' ||
        entries.some(([key]) => key.endsWith('_id') || key === 'id');
      if (!hasActionMarker) return false;

      emitLine(`\n${c.bright}=== ${titleForScalarAction(r.action)} ===${c.reset}`);
      for (const [key, value] of entries) {
        if (key === 'action') continue;
        emitLine(`${labelForScalarKey(key)}: ${String(value)}`);
      }
      if (entries.length === 1 && r.action !== undefined) emitLine(`${c.green}OK${c.reset}`);
      return true;
    },
    { shapeFallback: true },
  ),
```

- [ ] **Step 4: Run the guard and verify scalar targets pass**

Run:

```bash
bun test src/test-support/formatter-golden-coverage.test.ts
```

Expected: FAIL only for target commands whose fixtures have not been added yet.

- [ ] **Step 5: Generate scalar target goldens**

Run:

```bash
UPDATE_GOLDENS=1 GOLDEN_ONLY=create_faction,set_colors,set_status,undock bun test src/output-golden.test.ts
```

Expected: PASS and new renderer golden files for the four commands.

- [ ] **Step 6: Commit generic fallback work**

Run:

```bash
git add src/display/generic.ts src/display/generic.fixtures.ts src/golden-output/renderer src/test-support/formatter-golden-coverage.ts src/test-support/formatter-golden-coverage.test.ts
git commit -m "feat: format scalar action responses"
```

## Task 3: Add Social and Document Formatters

**Files:**
- Modify: `src/display/social.ts`
- Modify: `src/display/social.fixtures.ts`

- [ ] **Step 1: Add social/document fixtures**

In `src/display/social.fixtures.ts`, add:

```ts
export const captainLogGetFixture = {
  index: 0,
  created_at: '2026-05-29T14:45:00Z',
  entry: 'Reached Earth Station.\nLoaded fuel and checked the market.',
};

export const readNoteFixture = {
  note_id: 'note-1',
  title: 'Ore contract',
  content: 'Deliver 500 ore_iron to Earth Station.',
  created_by: 'Marlowe',
  created_at: '2026-05-28T12:00:00Z',
  updated_at: '2026-05-29T12:00:00Z',
  value: 250,
};

export const factionVisitRoomFixture = {
  action: 'visit_room',
  room_id: 'bridge',
  name: 'Bridge',
  description: 'Command deck for fleet operations.',
  access: 'members',
  author: 'Marlowe',
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-29T00:00:00Z',
};

export const forumThreadFixture = {
  thread: {
    thread_id: 'thread-1',
    title: 'Fuel convoy',
    category: 'logistics',
    author: 'Marlowe',
    created_at: '2026-05-27T09:30:00Z',
    content: 'Coordinating fuel convoy departures.',
    upvotes: 4,
  },
  replies: [
    {
      reply_id: 'reply-1',
      author: 'Ibis',
      created_at: '2026-05-27T10:00:00Z',
      content: 'I can cover the Sol leg.',
      upvotes: 2,
    },
  ],
};

export const guideFixture = {
  guide: 'miner',
  content: 'Mine at asteroid belts, then sell ore at a station market.',
  hint: 'Use get_poi before mining.',
};
```

Add these entries to `socialHighValueFixtures`:

```ts
  captains_log_get: { command: 'captains_log_get', fixture: captainLogGetFixture },
  read_note: { command: 'read_note', fixture: readNoteFixture },
  faction_visit_room: { command: 'faction_visit_room', fixture: factionVisitRoomFixture },
  forum_get_thread: { command: 'forum_get_thread', fixture: forumThreadFixture },
  get_guide: { command: 'get_guide', fixture: guideFixture },
```

- [ ] **Step 2: Run the guard and verify social/document targets fail on fallback**

Run:

```bash
bun test src/test-support/formatter-golden-coverage.test.ts
```

Expected: FAIL with `fallbackOutputs` containing the five social/document commands.

- [ ] **Step 3: Add document helpers**

In `src/display/social.ts`, add these helpers after `firstLinePreview`:

```ts
function emitOptionalLine(label: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return;
  emitLine(`${label}: ${value}`);
}

function emitBody(title: string, value: unknown): boolean {
  if (typeof value !== 'string' || value.trim() === '') return false;
  emitLine(`\n${c.bright}${title}:${c.reset}`);
  for (const line of value.split(/\r?\n/)) emitLine(line);
  return true;
}
```

- [ ] **Step 4: Add social/document formatters**

In `src/display/social.ts`, add these formatters after the captain log list formatter:

```ts
  formatter(
    (r) => {
      if (r.entry === undefined && r.content === undefined && r.text === undefined) return false;
      emitLine(`\n${c.bright}=== Captain's Log Entry ===${c.reset}`);
      emitOptionalLine('Index', r.index);
      emitOptionalLine('Created', formatTimestampPreview(r.created_at ?? r.timestamp ?? r.date));
      emitBody('Entry', r.entry ?? r.content ?? r.text);
      return true;
    },
    { commands: ['captains_log_get'] },
  ),

  formatter(
    (r) => {
      if (!r.note_id && !r.title && r.content === undefined) return false;
      emitLine(`\n${c.bright}=== Note: ${r.title ?? r.note_id ?? 'Untitled'} ===${c.reset}`);
      emitOptionalLine('ID', r.note_id ?? r.id);
      emitOptionalLine('Author', r.created_by ?? r.author);
      emitOptionalLine('Created', formatTimestampPreview(r.created_at));
      emitOptionalLine('Updated', formatTimestampPreview(r.updated_at));
      emitOptionalLine('Value', r.value);
      emitBody('Content', r.content ?? r.text);
      return true;
    },
    { commands: ['read_note'] },
  ),

  formatter(
    (r) => {
      if (!r.room_id && !r.name && !r.description) return false;
      emitLine(`\n${c.bright}=== Faction Room: ${r.name ?? r.room_id ?? 'Room'} ===${c.reset}`);
      emitOptionalLine('ID', r.room_id ?? r.id);
      emitOptionalLine('Access', r.access);
      emitOptionalLine('Author', r.author);
      emitOptionalLine('Created', formatTimestampPreview(r.created_at));
      emitOptionalLine('Updated', formatTimestampPreview(r.updated_at));
      emitBody('Description', r.description);
      return true;
    },
    { commands: ['faction_visit_room'] },
  ),

  formatter(
    (r) => {
      const thread = isRecord(r.thread) ? r.thread : undefined;
      if (!thread) return false;
      emitLine(`\n${c.bright}=== Forum Thread: ${thread.title ?? thread.thread_id ?? thread.id} ===${c.reset}`);
      emitOptionalLine('ID', thread.thread_id ?? thread.id);
      emitOptionalLine('Category', thread.category);
      emitOptionalLine('Author', thread.author ?? thread.username);
      emitOptionalLine('Created', formatTimestampPreview(thread.created_at));
      emitOptionalLine('Upvotes', thread.upvotes);
      emitBody('Content', thread.content ?? thread.text);
      const replies = firstArray(r, ['replies']);
      if (replies) {
        const rows = replies.map((reply) => ({
          ...reply,
          created_preview: formatTimestampPreview(reply.created_at ?? reply.timestamp),
          content_preview: firstLinePreview(reply.content ?? reply.text),
        }));
        printCompactTable(
          'Replies',
          rows,
          [
            ['Author', ['author', 'username']],
            ['Created', ['created_preview', 'created_at', 'timestamp']],
            ['Reply', ['content_preview', 'content', 'text']],
            ['Votes', ['upvotes']],
            ['ID', ['reply_id', 'id']],
          ],
          { maxCellWidth: 72 },
        );
      }
      return true;
    },
    { commands: ['forum_get_thread'] },
  ),

  formatter(
    (r) => {
      if (r.content === undefined && !Array.isArray(r.guides)) return false;
      if (Array.isArray(r.guides)) {
        printCompactTable('Guides', r.guides.filter(isRecord), [
          ['Guide', ['guide', 'id', 'name']],
          ['Title', ['title']],
          ['Summary', ['summary', 'description']],
        ]);
      }
      if (r.content !== undefined) {
        emitLine(`\n${c.bright}=== Guide: ${r.guide ?? 'Guide'} ===${c.reset}`);
        emitBody('Content', r.content);
      }
      if (r.hint) emitLine(`\n${c.dim}${r.hint}${c.reset}`);
      return true;
    },
    { commands: ['get_guide'] },
  ),
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
bun test src/test-support/formatter-golden-coverage.test.ts
```

Expected: FAIL only for remaining target commands not covered in later tasks.

- [ ] **Step 6: Generate social/document goldens**

Run:

```bash
UPDATE_GOLDENS=1 GOLDEN_ONLY=captains_log_get,read_note,faction_visit_room,forum_get_thread,get_guide bun test src/output-golden.test.ts
```

Expected: PASS and new renderer golden files for the five commands.

- [ ] **Step 7: Commit social/document work**

Run:

```bash
git add src/display/social.ts src/display/social.fixtures.ts src/golden-output/renderer
git commit -m "feat: format social document responses"
```

## Task 4: Add Faction Intel and Invite Formatters

**Files:**
- Modify: `src/display/social.ts`
- Modify: `src/display/social.fixtures.ts`

- [ ] **Step 1: Add faction fixtures**

In `src/display/social.fixtures.ts`, add:

```ts
export const factionInvitesFixture = {
  invites: [
    {
      faction_id: 'smc',
      faction_name: 'Surveyor Mining Collective',
      tag: 'SMC',
      invited_by: 'Marlowe',
      created_at: '2026-05-29T12:00:00Z',
    },
  ],
};

export const factionIntelStatusFixture = {
  intel_level: 'regional',
  coverage_pct: 42.5,
  systems_known: 17,
  pois_known: 68,
  total_systems: 40,
  contributors: 3,
  top_contributor: 'Marlowe',
  most_recent_tick: 12045,
  top_contributions: [
    { contributor: 'Marlowe', count: 12 },
    { contributor: 'Ibis', count: 7 },
  ],
};

export const factionTradeIntelStatusFixture = {
  intel_level: 'station',
  coverage_pct: 36.25,
  stations_known: 11,
  total_stations: 32,
  items_tracked: 19,
  contributors: 2,
  top_contributor: 'Ibis',
  most_recent_tick: 12050,
  top_contributions: [
    { contributor: 'Ibis', count: 9 },
    { contributor: 'Marlowe', count: 5 },
  ],
};
```

Add these entries to `socialHighValueFixtures`:

```ts
  faction_get_invites: { command: 'faction_get_invites', fixture: factionInvitesFixture },
  faction_intel_status: { command: 'faction_intel_status', fixture: factionIntelStatusFixture },
  faction_trade_intel_status: { command: 'faction_trade_intel_status', fixture: factionTradeIntelStatusFixture },
```

- [ ] **Step 2: Run the guard and verify faction targets fail on fallback**

Run:

```bash
bun test src/test-support/formatter-golden-coverage.test.ts
```

Expected: FAIL with `fallbackOutputs` containing `faction_intel_status` and `faction_trade_intel_status`. `faction_get_invites` may already pass through the expanded generic list fallback; if it passes, keep its high-value fixture for regression coverage.

- [ ] **Step 3: Add faction formatters**

In `src/display/social.ts`, add these formatters after the `faction_info` formatter:

```ts
  formatter(
    (r) => {
      const invites = firstArray(r, ['invites']);
      if (!invites) return false;
      const rows = invites.map((invite) => ({
        ...invite,
        created_preview: formatTimestampPreview(invite.created_at ?? invite.timestamp),
      }));
      printCompactTable('Faction Invites', rows, [
        ['Faction', ['faction_name', 'name']],
        ['Tag', ['tag', 'faction_tag']],
        ['ID', ['faction_id', 'id']],
        ['Invited By', ['invited_by', 'sender', 'username']],
        ['Created', ['created_preview', 'created_at', 'timestamp']],
      ]);
      return true;
    },
    { commands: ['faction_get_invites'] },
  ),

  formatter(
    (r, command) => {
      if (command !== 'faction_intel_status' && command !== 'faction_trade_intel_status') return false;
      if (r.intel_level === undefined && r.coverage_pct === undefined) return false;
      const title = command === 'faction_trade_intel_status' ? 'Faction Trade Intel' : 'Faction Intel';
      emitLine(`\n${c.bright}=== ${title} Status ===${c.reset}`);
      emitOptionalLine('Intel Level', r.intel_level);
      emitOptionalLine('Coverage', r.coverage_pct === undefined ? undefined : `${r.coverage_pct}%`);
      emitOptionalLine('Systems Known', r.systems_known);
      emitOptionalLine('POIs Known', r.pois_known);
      emitOptionalLine('Stations Known', r.stations_known);
      emitOptionalLine('Items Tracked', r.items_tracked);
      emitOptionalLine('Total Systems', r.total_systems);
      emitOptionalLine('Total Stations', r.total_stations);
      emitOptionalLine('Contributors', r.contributors);
      emitOptionalLine('Top Contributor', r.top_contributor);
      emitOptionalLine('Most Recent Tick', r.most_recent_tick);
      const contributions = firstArray(r, ['top_contributions']);
      if (contributions) {
        printCompactTable('Top Contributions', contributions, [
          ['Contributor', ['contributor', 'username', 'player_id']],
          ['Count', ['count', 'contributions']],
        ]);
      }
      return true;
    },
    { commands: ['faction_intel_status', 'faction_trade_intel_status'] },
  ),
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
bun test src/test-support/formatter-golden-coverage.test.ts
```

Expected: FAIL only for remaining target commands not covered in later tasks.

- [ ] **Step 5: Generate faction goldens**

Run:

```bash
UPDATE_GOLDENS=1 GOLDEN_ONLY=faction_get_invites,faction_intel_status,faction_trade_intel_status bun test src/output-golden.test.ts
```

Expected: PASS and new renderer golden files for the three commands.

- [ ] **Step 6: Commit faction work**

Run:

```bash
git add src/display/social.ts src/display/social.fixtures.ts src/golden-output/renderer
git commit -m "feat: format faction intel responses"
```

## Task 5: Add Navigation and Reference Formatters

**Files:**
- Modify: `src/display/status.ts`
- Modify: `src/display/status.fixtures.ts`

- [ ] **Step 1: Add navigation/reference fixtures**

In `src/display/status.fixtures.ts`, add:

```ts
export const getMapFixture = {
  systems: [
    {
      system_id: 'sol',
      name: 'Sol',
      x: 0,
      y: 0,
      empire: 'solarian',
      security_status: 'high security',
      connections: ['alpha_centauri'],
    },
    {
      system_id: 'alpha_centauri',
      name: 'Alpha Centauri',
      x: 4,
      y: 1,
      empire: 'solarian',
      security_status: 'medium security',
      connections: ['sol'],
    },
  ],
  total_count: 2,
};

export const getSystemAgentsFixture = {
  system_id: 'sol',
  count: 2,
  offline_collapsed: 4,
  agents: [
    {
      username: 'Marlowe',
      player_id: 'player-1',
      ship_class: 'prospector',
      poi_name: 'Earth Station',
      online: true,
    },
    {
      username: 'Ibis',
      player_id: 'player-2',
      ship_class: 'hauler',
      poi_name: 'Mars Depot',
      online: false,
    },
  ],
};

export const getCommandsFixture = {
  commands: [
    {
      command: 'get_status',
      category: 'Query commands',
      description: 'Inspect player, ship, and location.',
      usage: '',
    },
    {
      command: 'travel',
      category: 'Navigation',
      description: 'Move to a POI.',
      usage: '<poi_id>',
    },
  ],
};
```

Add these entries to `statusHighValueFixtures`:

```ts
  get_map: { command: 'get_map', fixture: getMapFixture },
  get_system_agents: { command: 'get_system_agents', fixture: getSystemAgentsFixture },
  get_commands: { command: 'get_commands', fixture: getCommandsFixture },
```

- [ ] **Step 2: Run the guard and verify reference targets fail on fallback**

Run:

```bash
bun test src/test-support/formatter-golden-coverage.test.ts
```

Expected: FAIL with `fallbackOutputs` containing any of `get_map`, `get_system_agents`, or `get_commands` not already handled by the expanded generic list fallback.

- [ ] **Step 3: Import table helper**

Change the import in `src/display/status.ts` from:

```ts
import { c, emitLine, formatPlayer, formatter, isRecord, namedFormatter } from './helpers.ts';
```

to:

```ts
import { c, emitLine, formatPlayer, formatter, isRecord, namedFormatter, printCompactTable } from './helpers.ts';
```

- [ ] **Step 4: Add reference formatters**

In `src/display/status.ts`, add these formatters before the `get_system` formatter:

```ts
  formatter(
    (r) => {
      if (!Array.isArray(r.systems)) return false;
      const rows = r.systems.filter(isRecord).map((system) => ({
        ...system,
        connection_count: Array.isArray(system.connections) ? system.connections.length : system.connections,
      }));
      printCompactTable('Systems', rows, [
        ['Name', ['name']],
        ['ID', ['system_id', 'id']],
        ['Empire', ['empire']],
        ['Security', ['security_status']],
        ['X', ['x']],
        ['Y', ['y']],
        ['Connections', ['connection_count']],
      ]);
      if (r.total_count !== undefined) emitLine(`${c.dim}total ${r.total_count}${c.reset}`);
      return true;
    },
    { commands: ['get_map'] },
  ),

  formatter(
    (r) => {
      if (!Array.isArray(r.agents)) return false;
      emitLine(`\n${c.bright}=== System Agents: ${r.system_id ?? 'current system'} ===${c.reset}`);
      printCompactTable('Agents', r.agents.filter(isRecord), [
        ['Name', ['username', 'name']],
        ['ID', ['player_id', 'id']],
        ['Ship', ['ship_class', 'ship_name']],
        ['POI', ['poi_name', 'poi_id']],
        ['Online', ['online']],
      ]);
      if (r.count !== undefined) emitLine(`${c.dim}count ${r.count}${c.reset}`);
      if (r.offline_collapsed !== undefined) emitLine(`${c.dim}offline collapsed ${r.offline_collapsed}${c.reset}`);
      return true;
    },
    { commands: ['get_system_agents'] },
  ),

  formatter(
    (r) => {
      if (!Array.isArray(r.commands)) return false;
      printCompactTable(
        'Commands',
        r.commands.filter(isRecord),
        [
          ['Command', ['command', 'name']],
          ['Category', ['category']],
          ['Usage', ['usage']],
          ['Description', ['description', 'summary']],
        ],
        { maxCellWidth: 72 },
      );
      return true;
    },
    { commands: ['get_commands'] },
  ),
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
bun test src/test-support/formatter-golden-coverage.test.ts
```

Expected: FAIL only for remaining target commands not covered in later tasks.

- [ ] **Step 6: Generate reference goldens**

Run:

```bash
UPDATE_GOLDENS=1 GOLDEN_ONLY=get_map,get_system_agents,get_commands bun test src/output-golden.test.ts
```

Expected: PASS and new renderer golden files for the three commands.

- [ ] **Step 7: Commit reference work**

Run:

```bash
git add src/display/status.ts src/display/status.fixtures.ts src/golden-output/renderer
git commit -m "feat: format reference query responses"
```

## Task 6: Add Economy, Combat, and Mission Detail Formatters

**Files:**
- Modify: `src/display/status.ts`
- Modify: `src/display/empire.ts`
- Modify: `src/display/ship.ts`
- Modify: `src/display/status.fixtures.ts`
- Modify: `src/display/ship.fixtures.ts`
- Modify: `src/display/generic.fixtures.ts`

- [ ] **Step 1: Add status-side fixtures**

In `src/display/status.fixtures.ts`, add:

```ts
export const scanFixture = {
  success: true,
  target_id: 'player-2',
  username: 'Ibis',
  faction_id: 'smc',
  ship_class: 'hauler',
  hull: 180,
  shield: 75,
  cloaked: false,
  revealed_info: {
    cargo_used: 20,
    cargo_capacity: 200,
    weapons: 1,
  },
};

export const completedMissionDetailFixture = {
  template_id: 'mission-ore-run',
  title: 'Ore Run',
  type: 'hauling',
  difficulty: 2,
  description: 'Deliver iron ore to Earth Station.',
  giver: 'Dockmaster Vale',
  completion_time: '2026-05-29T18:00:00Z',
  repeatable: true,
  objectives: [
    {
      description: 'Deliver Iron Ore',
      progress: { current: 500, required: 500 },
    },
  ],
  rewards: {
    credits: 7500,
    skill_xp: { piloting: 25 },
  },
  dialog: 'Good work keeping the refineries supplied.',
  chain_next: 'mission-refinery-check',
};
```

Add these entries to `statusHighValueFixtures`:

```ts
  scan: { command: 'scan', fixture: scanFixture },
  view_completed_mission: { command: 'view_completed_mission', fixture: completedMissionDetailFixture },
```

- [ ] **Step 2: Add ship-side fixtures**

In `src/display/ship.fixtures.ts`, add:

```ts
export const reloadFixture = {
  action: 'reload',
  weapon_id: 'weapon-1',
  weapon_name: 'Pulse Laser',
  ammo_id: 'ammo-cell',
  ammo_name: 'Laser Cell',
  previous_ammo: 'empty',
  current_ammo: 'Laser Cell',
  magazine_size: 8,
  rounds_discarded: 0,
};

export const salvageWreckFixture = {
  metal_scrap: 14,
  rare_materials: 2,
  components: 3,
  total_value: 1250,
  xp_gained: 18,
};
```

Add these entries to `shipHighValueFixtures`:

```ts
  reload: { command: 'reload', fixture: reloadFixture },
  salvage_wreck: { command: 'salvage_wreck', fixture: salvageWreckFixture },
```

- [ ] **Step 3: Add tax fixture**

In `src/display/generic.fixtures.ts`, add:

```ts
export const taxEstimateFixture = {
  action: 'get_tax_estimate',
  sales_tax_rates: {
    solarian: 100,
    voidborn: 250,
  },
  taxable_income_to_date: 42000,
  taxable_income_by_source: {
    market: 30000,
    missions: 12000,
  },
  income_tax: 210,
  income_tax_total: 210,
  assessed_property_value: 125000,
  assessed_property_by_ship: {
    'ship-1': 125000,
  },
  property_tax: 625,
  property_tax_total: 625,
  tax_collection_active: true,
  last_assessed_at: '2026-05-28T00:00:00Z',
  next_assessment_approx_seconds: 3600,
  note: 'Estimate only.',
};
```

Add this entry to `genericHighValueFixtures`:

```ts
  get_tax_estimate: { command: 'get_tax_estimate', fixture: taxEstimateFixture },
```

- [ ] **Step 4: Run the guard and verify these targets fail on fallback**

Run:

```bash
bun test src/test-support/formatter-golden-coverage.test.ts
```

Expected: FAIL with `fallbackOutputs` containing `get_tax_estimate`, `reload`, `salvage_wreck`, `scan`, and `view_completed_mission`.

- [ ] **Step 5: Add mission and scan formatters**

In `src/display/status.ts`, add these helpers after `formatCitizenships`:

```ts
function summarizeObjectiveForDisplay(objective: unknown): string {
  if (!isRecord(objective)) return String(objective);
  const description = objective.description ?? objective.title ?? objective.type;
  const progress = objective.progress;
  if (isRecord(progress)) {
    const current = progress.current ?? progress.completed ?? progress.amount;
    const required = progress.required ?? progress.target ?? progress.total;
    if (current !== undefined && required !== undefined) return `${description ?? 'Objective'} ${current}/${required}`;
  }
  return String(description ?? objective.type ?? 'Objective');
}

function summarizeRewardForDisplay(rewards: unknown): string {
  if (!isRecord(rewards)) return '';
  const parts: string[] = [];
  if (rewards.credits !== undefined) parts.push(`${rewards.credits} cr`);
  if (isRecord(rewards.skill_xp)) {
    parts.push(
      Object.entries(rewards.skill_xp)
        .map(([skill, xp]) => `${skill} +${xp} XP`)
        .join(', '),
    );
  }
  return parts.filter(Boolean).join('; ');
}
```

Add these formatters before the arrival formatter:

```ts
  formatter(
    (r) => {
      if (r.target_id === undefined && r.username === undefined && r.ship_class === undefined) return false;
      emitLine(`\n${c.bright}=== Scan Result ===${c.reset}`);
      if (r.username) emitLine(`Target: ${r.username}${r.target_id ? ` (${r.target_id})` : ''}`);
      else if (r.target_id) emitLine(`Target: ${r.target_id}`);
      if (r.faction_id) emitLine(`Faction: ${r.faction_id}`);
      if (r.ship_class) emitLine(`Ship: ${r.ship_class}`);
      if (r.hull !== undefined) emitLine(`Hull: ${r.hull}`);
      if (r.shield !== undefined) emitLine(`Shield: ${r.shield}`);
      if (r.cloaked !== undefined) emitLine(`Cloaked: ${r.cloaked}`);
      if (isRecord(r.revealed_info)) {
        emitLine(`\n${c.bright}Revealed:${c.reset}`);
        for (const [key, value] of Object.entries(r.revealed_info)) {
          if (value === undefined || value === null || isRecord(value) || Array.isArray(value)) continue;
          emitLine(`  ${key}: ${value}`);
        }
      }
      return true;
    },
    { commands: ['scan'] },
  ),

  formatter(
    (r) => {
      if (!r.template_id && !r.title && !r.description) return false;
      emitLine(`\n${c.bright}=== Completed Mission: ${r.title ?? r.template_id ?? 'Mission'} ===${c.reset}`);
      if (r.template_id) emitLine(`ID: ${r.template_id}`);
      if (r.type) emitLine(`Type: ${r.type}`);
      if (r.difficulty !== undefined) emitLine(`Difficulty: ${r.difficulty}`);
      if (r.giver) emitLine(`Giver: ${r.giver}`);
      if (r.completion_time) emitLine(`Completed: ${r.completion_time}`);
      if (r.repeatable !== undefined) emitLine(`Repeatable: ${r.repeatable}`);
      if (r.description) emitLine(`\n${r.description}`);
      const objectives = Array.isArray(r.objectives) ? r.objectives.map(summarizeObjectiveForDisplay) : [];
      if (objectives.length) {
        emitLine(`\n${c.bright}Objectives:${c.reset}`);
        for (const objective of objectives) emitLine(`  - ${objective}`);
      }
      const rewards = summarizeRewardForDisplay(r.rewards);
      if (rewards) emitLine(`Rewards: ${rewards}`);
      if (r.dialog) emitLine(`Dialog: ${r.dialog}`);
      if (r.chain_next) emitLine(`Next: ${r.chain_next}`);
      return true;
    },
    { commands: ['view_completed_mission'] },
  ),
```

- [ ] **Step 6: Add tax formatter**

In `src/display/empire.ts`, add this formatter before the `get_empire_info` formatter:

```ts
  formatter(
    (r) => {
      if (r.income_tax === undefined && r.property_tax === undefined && r.sales_tax_rates === undefined) return false;
      emitLine(`\n${c.bright}=== Tax Estimate ===${c.reset}`);
      if (r.tax_collection_active !== undefined) emitLine(`Collection active: ${r.tax_collection_active}`);
      if (r.taxable_income_to_date !== undefined) emitLine(`Taxable income: ${r.taxable_income_to_date}`);
      if (r.income_tax !== undefined) emitLine(`Income tax: ${r.income_tax}`);
      if (r.income_tax_total !== undefined) emitLine(`Income tax total: ${r.income_tax_total}`);
      if (r.assessed_property_value !== undefined) emitLine(`Assessed property: ${r.assessed_property_value}`);
      if (r.property_tax !== undefined) emitLine(`Property tax: ${r.property_tax}`);
      if (r.property_tax_total !== undefined) emitLine(`Property tax total: ${r.property_tax_total}`);
      if (isRecord(r.sales_tax_rates)) emitLine(`Sales tax rates: ${formatBpsMap(r.sales_tax_rates)}`);
      if (isRecord(r.taxable_income_by_source)) {
        emitLine(`Income by source: ${Object.entries(r.taxable_income_by_source).map(([key, value]) => `${key} ${value}`).join(', ')}`);
      }
      if (isRecord(r.assessed_property_by_ship)) {
        emitLine(`Property by ship: ${Object.entries(r.assessed_property_by_ship).map(([key, value]) => `${key} ${value}`).join(', ')}`);
      }
      if (r.last_assessed_at) emitLine(`Last assessed: ${r.last_assessed_at}`);
      if (r.next_assessment_approx_seconds !== undefined)
        emitLine(`Next assessment approx: ${r.next_assessment_approx_seconds}s`);
      if (r.note) emitLine(`${c.dim}${r.note}${c.reset}`);
      return true;
    },
    { commands: ['get_tax_estimate'] },
  ),
```

- [ ] **Step 7: Add reload and salvage formatters**

In `src/display/ship.ts`, add these formatters before the wrecks formatter:

```ts
  formatter(
    (r) => {
      if (r.action !== 'reload' && r.weapon_id === undefined && r.current_ammo === undefined) return false;
      emitLine(`\n${c.bright}=== Reloaded ===${c.reset}`);
      if (r.weapon_name || r.weapon_id) emitLine(`Weapon: ${r.weapon_name ?? r.weapon_id}${r.weapon_id && r.weapon_name ? ` (${r.weapon_id})` : ''}`);
      if (r.ammo_name || r.ammo_id) emitLine(`Ammo: ${r.ammo_name ?? r.ammo_id}${r.ammo_id && r.ammo_name ? ` (${r.ammo_id})` : ''}`);
      if (r.previous_ammo !== undefined) emitLine(`Previous ammo: ${r.previous_ammo}`);
      if (r.current_ammo !== undefined) emitLine(`Current ammo: ${r.current_ammo}`);
      if (r.magazine_size !== undefined) emitLine(`Magazine size: ${r.magazine_size}`);
      if (r.rounds_discarded !== undefined) emitLine(`Rounds discarded: ${r.rounds_discarded}`);
      return true;
    },
    { commands: ['reload'] },
  ),

  formatter(
    (r) => {
      if (
        r.metal_scrap === undefined &&
        r.rare_materials === undefined &&
        r.components === undefined &&
        r.total_value === undefined &&
        r.xp_gained === undefined
      )
        return false;
      emitLine(`\n${c.bright}=== Salvage Complete ===${c.reset}`);
      if (r.metal_scrap !== undefined) emitLine(`Metal scrap: ${r.metal_scrap}`);
      if (r.rare_materials !== undefined) emitLine(`Rare materials: ${r.rare_materials}`);
      if (r.components !== undefined) emitLine(`Components: ${r.components}`);
      if (r.total_value !== undefined) emitLine(`Total value: ${r.total_value}`);
      if (r.xp_gained !== undefined) emitLine(`XP gained: ${r.xp_gained}`);
      return true;
    },
    { commands: ['salvage_wreck'] },
  ),
```

- [ ] **Step 8: Run focused tests**

Run:

```bash
bun test src/test-support/formatter-golden-coverage.test.ts
```

Expected: PASS.

- [ ] **Step 9: Generate economy/combat/mission goldens**

Run:

```bash
UPDATE_GOLDENS=1 GOLDEN_ONLY=get_tax_estimate,reload,salvage_wreck,scan,view_completed_mission bun test src/output-golden.test.ts
```

Expected: PASS and new renderer golden files for the five commands.

- [ ] **Step 10: Commit economy/combat/mission work**

Run:

```bash
git add src/display/status.ts src/display/empire.ts src/display/ship.ts src/display/status.fixtures.ts src/display/ship.fixtures.ts src/display/generic.fixtures.ts src/golden-output/renderer
git commit -m "feat: format combat and tax detail responses"
```

## Task 7: Final Verification and Cleanup

**Files:**
- Verify: all modified files and generated goldens.

- [ ] **Step 1: Run formatter coverage guard**

Run:

```bash
bun test src/test-support/formatter-golden-coverage.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run output golden suite**

Run:

```bash
bun test src/output-golden.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run formatter fixture/schema drift awareness**

Run:

```bash
STRICT_FIXTURE_SCHEMA_DIVERGENCES=1 bun test src/output-golden.test.ts
```

Expected: PASS. If it fails because the new fixtures introduce reviewed schema drift, inspect the report with `bun run report:fixture-schemas --only <command>` and update the baseline with `bun run report:fixture-schemas --update-baseline` only when the fixture intentionally represents current server data.

- [ ] **Step 4: Run full test suite**

Run:

```bash
bun test
```

Expected: PASS.

- [ ] **Step 5: Review generated files**

Run:

```bash
git status --short
git diff --stat
```

Expected: only formatter, fixture, coverage, golden, and optional schema-baseline files from this plan are changed.

- [ ] **Step 6: Commit final verification adjustments**

If Step 3 required a schema baseline update or if golden manifest cleanup generated additional changes, run:

```bash
git add src/test-support/fixture-schema-baseline.json src/golden-output/renderer
git commit -m "test: update formatter golden baselines"
```

If there are no remaining uncommitted changes after Step 5, skip this commit.
