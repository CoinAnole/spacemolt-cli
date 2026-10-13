import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { hexColor } from './ansi.ts';
import { facilityBillingPaused, withPausedRentSuffix } from './helpers.ts';
import { renderStructuredResult } from './index.ts';
import {
  actionLogCursorFixture,
  actionLogFactionRefuelFixture,
  actionLogFixture,
  actionLogFreightEscrowFixture,
  actionLogPersonnelCaptureFixture,
  actionLogPirateDestroyedFixture,
  battleLogArenaFixture,
  battleLogBoardingFixture,
  battleLogFixture,
  battleLogHuntFixture,
  battleLogInterruptedFixture,
  battleLogPlunderedFixture,
  battleLogSnapshotsFixture,
  battleLogZoneMovesFixture,
  battleStatusBoardingFixture,
  battleStatusCombatStateFixture,
  battleStatusFixture,
  battleStatusLatchStatusFixture,
  battleSummaryArenaFixture,
  battleSummaryCapturesFixture,
  battleSummaryCapturesKindFixture,
  battleSummaryCapturesPrizeFixture,
  battleSummaryFixture,
  battleSummaryHuntFixture,
  battleSummaryInterruptedFixture,
  facilityListFixture,
  facilityListSimpleFixture,
  facilityOwnedFixture,
  facilityTypesDetailFixture,
  factionDecommissionMobileBaseFixture,
  factionFacilityListFixture,
  factionFacilityOwnedFixture,
  factionGetMobileBaseFixture,
  factionGetMobileBaseIsolatedFixture,
  factionGetMobileBasePreparingFixture,
  factionInfoFixture,
  factionJumpMobileBaseFixture,
  factionScanPoiDetails,
  factionScanPoiEmptyFixture,
  factionScanPoiFixture,
  factionScanPoiLeviathansFixture,
  factionScanPoiPartialFixture,
  fleetArenaOnlyFixture,
  fleetFixture,
  forumThreadFixture,
  listBattlesArenaCaptureFixture,
  listBattlesEmptyFixture,
  listBattlesFixture,
  listBattlesPastEndFixture,
  listBattlesWildlifeFixture,
  ranchSetCullFixture,
  ranchStatusFixture,
} from './social.fixtures.ts';
import { adultLeviathanContact, juvenileLeviathanContact } from './status.fixtures.ts';

const options: GlobalOptions = {
  args: [],
  json: false,
  quiet: false,
  plain: true,
  allowUnknown: false,
  dryRun: false,
  noTimestamp: true,
  compact: false,
};

const context = {
  clock: {
    now() {
      return new Date('2026-05-29T00:00:00.000Z');
    },
  },
  output: {
    json: false,
    quiet: false,
    plain: true,
    format: 'table' as const,
    compact: false,
  },
};

function sectionAfter(stdout: string, title: string, nextTitle?: string): string {
  const start = stdout.split(`=== ${title} ===`)[1] ?? '';
  return nextTitle ? (start.split(`=== ${nextTitle} ===`)[0] ?? start) : start;
}

function tableCell(section: string, rowNeedle: string, column: string): string | undefined {
  const lines = section.split('\n');
  const header = lines.find((line) => line.includes('|') && line.includes(column) && line.includes('Name'));
  const row = lines.find((line) => line.includes('|') && line.includes(rowNeedle) && !line.includes('---'));
  if (!header || !row) return undefined;
  const headers = header.split('|').map((part) => part.trim());
  const cells = row.split('|').map((part) => part.trim());
  const index = headers.indexOf(column);
  return index >= 0 ? cells[index] : undefined;
}

function captureHeader(section: string): string | undefined {
  return section
    .split('\n')
    .find((line) => line.includes('|') && line.includes('Captor') && line.includes('Former owner'));
}

function captureCell(section: string, rowNeedle: string, column: string): string | undefined {
  const header = captureHeader(section);
  const row = section
    .split('\n')
    .find((line) => line.includes('|') && line.includes(rowNeedle) && !line.includes('---'));
  if (!header || !row) return undefined;
  const headers = header.split('|').map((part) => part.trim());
  const cells = row.split('|').map((part) => part.trim());
  const index = headers.indexOf(column);
  return index >= 0 ? cells[index] : undefined;
}

function expectCaptorThenKindThenFormerOwner(header: string | undefined): void {
  expect(header).toBeDefined();
  expect(header).toContain('Kind');
  expect(header?.indexOf('Captor') ?? -1).toBeLessThan(header?.indexOf('Kind') ?? -1);
  expect(header?.indexOf('Kind') ?? -1).toBeLessThan(header?.indexOf('Former owner') ?? -1);
}

function expectHeaderColumnsInOrder(header: string | undefined, columns: string[]): void {
  expect(header).toBeDefined();
  if (header === undefined) return;
  let last = -1;
  for (const column of columns) {
    expect(header).toContain(column);
    const index = header.indexOf(column);
    expect(index).toBeGreaterThan(last);
    last = index;
  }
}

function actionLogHeader(stdout: string): string | undefined {
  return stdout
    .split('\n')
    .find((line) => line.includes('|') && line.includes('Timestamp') && line.includes('Summary'));
}

function actionLogHeaderColumns(stdout: string): string[] {
  const header = actionLogHeader(stdout);
  expect(header).toBeDefined();
  return (header ?? '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
}

function actionLogCell(stdout: string, rowNeedle: string, column: string): string | undefined {
  const header = actionLogHeader(stdout);
  const row = stdout
    .split('\n')
    .find((line) => line.includes('|') && line.includes(rowNeedle) && !line.includes('---'));
  if (!header || !row) return undefined;
  const headers = header.split('|').map((part) => part.trim());
  const cells = row.split('|').map((part) => part.trim());
  const index = headers.indexOf(column);
  return index >= 0 ? cells[index] : undefined;
}

function actionLogDataIdCells(stdout: string): string[] {
  const header = actionLogHeader(stdout);
  if (header === undefined) return [];
  const idIndex = header
    .split('|')
    .map((part) => part.trim())
    .indexOf('ID');
  if (idIndex < 0) return [];
  const cells: string[] = [];
  for (const line of stdout.split('\n')) {
    if (line === header || !line.includes('|') || line.includes('---')) continue;
    cells.push(line.split('|').map((part) => part.trim())[idIndex] ?? '');
  }
  return cells;
}

function renderActionLog(fixture: Record<string, unknown>): string {
  const rendered = renderStructuredResult('get_action_log', fixture, options, context);
  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toMatch(/NaN|undefined|\[object Object\]/);
  return stdout;
}

function actionLogPage(entries: Array<Record<string, unknown>>, category = 'shipping'): Record<string, unknown> {
  return {
    category,
    has_more: false,
    page: 1,
    page_size: 50,
    total: entries.length,
    total_pages: 1,
    entries,
  };
}

function claimEntry(
  data: Record<string, unknown> | undefined,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 401,
    created_at: '2026-09-23T12:00:00.000Z',
    event_type: 'shipping.claim_paid',
    category: 'shipping',
    summary: 'Insurer paid the claim in full.',
    ...(data === undefined ? {} : { data }),
    ...extra,
  };
}

function pirateEntry(
  data: Record<string, unknown> | undefined,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 501,
    created_at: '2026-09-24T16:00:00.000Z',
    event_type: 'combat.pirate_destroyed',
    category: 'combat',
    summary: 'Destroyed pirate Corsair.',
    ...(data === undefined ? {} : { data }),
    ...extra,
  };
}

function rentEntry(
  eventType: string,
  data: Record<string, unknown> | undefined,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 601,
    created_at: '2026-10-12T08:00:00.000Z',
    event_type: eventType,
    category: eventType.startsWith('faction.') ? 'faction' : 'other',
    summary: 'Rent overdue at Earth Station.',
    ...(data === undefined ? {} : { data }),
    ...extra,
  };
}

function expectNoPrizeOrLocation(header: string | undefined): void {
  expect(header).toBeDefined();
  expect(header).not.toContain('Prize');
  expect(header).not.toContain('Location');
}

function renderBattleSummary(fixture: Record<string, unknown>): string {
  const rendered = renderStructuredResult('get_battle_summary', fixture, options, context);
  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).not.toContain('=== Response ===');
  return stdout;
}

function captureRow(rows: Array<Record<string, unknown>>, index = 0): Record<string, unknown> {
  const row = rows[index];
  if (!row) throw new Error(`expected capture row ${index}`);
  return row;
}

function battleSummaryCapturesClone(overrides: Record<string, unknown>): Record<string, unknown> {
  const fixture = structuredClone(battleSummaryCapturesFixture) as Record<string, unknown>;
  Object.assign(captureRow(fixture.captures as Array<Record<string, unknown>>), overrides);
  return fixture;
}

test('renders cursor action-log entries in server order with the next polling cursor', () => {
  const rendered = renderStructuredResult('get_action_log', structuredClone(actionLogCursorFixture), options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout.indexOf('Faction production cycle completed.')).toBeLessThan(
    stdout.indexOf('Prospector buy order filled at Nova Terra Central.'),
  );
  expect(actionLogHeaderColumns(stdout)[0]).toBe('ID');
  expect(actionLogDataIdCells(stdout)).toEqual(['101', '105']);
  expect(actionLogCell(stdout, '101', 'ID')).toBe('101');
  expect(actionLogCell(stdout, '105', 'ID')).toBe('105');
  expect(stdout).toContain('Timestamp');
  expect(stdout).toContain('Summary');
  expect(stdout).toContain('Category');
  expect(stdout).toContain('Event');
  expect(stdout).toContain('Runs');
  expect(stdout).toContain('Venue');
  expect(stdout).toContain('4');
  expect(stdout).toContain('alloy-foundry');
  expect(stdout).toContain('Ship');
  expect(stdout).toContain('ship-prospector-42');
  expect(stdout).toContain('Base');
  expect(stdout).toContain('nova-terra-central');
  expect(stdout).toContain('More entries available.');
  expect(stdout).toContain('Next since_id: 105');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toMatch(/NaN|undefined|\[object Object\]/);
});

test('renders a valid next cursor even when the current cursor page has no more entries', () => {
  const fixture = structuredClone(actionLogCursorFixture);
  fixture.has_more = false;
  fixture.next_since_id = 0;
  const stdout = renderStructuredResult('get_action_log', fixture, options, context).stdout.join('\n');

  expect(stdout).not.toContain('More entries available.');
  expect(stdout).toContain('Next since_id: 0');
});

test('omits malformed action-log cursors from human output', () => {
  for (const cursor of [-1, 1.5, Number.POSITIVE_INFINITY, Number.NaN, '105', undefined]) {
    const fixture = structuredClone(actionLogCursorFixture) as Record<string, unknown>;
    fixture.next_since_id = cursor;
    const stdout = renderStructuredResult('get_action_log', fixture, options, context).stdout.join('\n');
    expect(stdout).not.toContain('Next since_id:');
    expect(stdout).toContain('Faction production cycle completed.');
  }
});

test('prints action-log entry ids in server order', () => {
  const stdout = renderActionLog(structuredClone(actionLogFixture));
  expect(actionLogHeaderColumns(stdout)[0]).toBe('ID');
  expect(actionLogDataIdCells(stdout)).toEqual(['1', '4', '2', '3', '5']);
  const summaries = ['iron smelting', 'Queued 10', 'Ore Refinery', 'Drone Control', 'Prospector completed'];
  let last = -1;
  for (const summary of summaries) {
    const index = stdout.indexOf(summary);
    expect(index).toBeGreaterThan(last);
    last = index;
  }
  expect(actionLogCell(stdout, 'iron smelting', 'ID')).toBe('1');
  expect(actionLogCell(stdout, 'Queued 10', 'ID')).toBe('4');
  expect(actionLogCell(stdout, 'Ore Refinery', 'ID')).toBe('2');
  expect(actionLogCell(stdout, 'Drone Control', 'ID')).toBe('3');
  expect(actionLogCell(stdout, 'Prospector completed', 'ID')).toBe('5');
  expect(stdout).not.toContain('Next since_id:');
});

test('puts ID first on action-log fixtures that carry integer ids', () => {
  for (const fixture of [
    actionLogFixture,
    actionLogCursorFixture,
    actionLogPersonnelCaptureFixture,
    actionLogFactionRefuelFixture,
    actionLogFreightEscrowFixture,
    actionLogPirateDestroyedFixture,
  ]) {
    const stdout = renderActionLog(structuredClone(fixture));
    expect(actionLogHeaderColumns(stdout)[0]).toBe('ID');
  }
});

test('omits the ID column when no action-log entry has an integer id', () => {
  const fixture = structuredClone(actionLogFixture);
  for (const entry of fixture.entries) {
    delete (entry as { id?: unknown }).id;
  }
  const stdout = renderActionLog(fixture);
  expect(actionLogHeaderColumns(stdout)).not.toContain('ID');
  expect(stdout).toContain('Completed basic iron smelting.');
  expect(stdout).toContain('Queued 10 runs of steel_plate at personal facility.');
});

test('leaves a blank ID cell when only a sibling entry has an integer id', () => {
  const fixture = structuredClone(actionLogFixture);
  delete (fixture.entries[1] as { id?: unknown }).id;
  const stdout = renderActionLog(fixture);
  expect(actionLogHeaderColumns(stdout)[0]).toBe('ID');
  expect(actionLogCell(stdout, 'Queued 10', 'ID')).toBe('');
  expect(actionLogCell(stdout, 'iron smelting', 'ID')).toBe('1');
  expect(actionLogDataIdCells(stdout)).toEqual(['1', '', '2', '3', '5']);
});

function actionLogIdRow(id: unknown, summary: string, includeId = true): Record<string, unknown> {
  const row: Record<string, unknown> = {
    created_at: '2026-09-24T16:00:00.000Z',
    event_type: 'skill.level_up',
    category: 'skill',
    summary,
  };
  if (includeId) row.id = id;
  return row;
}

test('prints canonical ungrouped digits for action-log entry ids', () => {
  const cases: Array<{ id: unknown; expected: string; summary: string }> = [
    { id: 1500, expected: '1500', summary: 'Safe fifteen hundred.' },
    { id: 0, expected: '0', summary: 'Zero entry id.' },
    { id: -1500, expected: '-1500', summary: 'Negative fifteen hundred.' },
    { id: -0, expected: '0', summary: 'Negative zero number.' },
    { id: 9007199254740993n, expected: '9007199254740993', summary: 'Bigint past the safe range.' },
    { id: 0n, expected: '0', summary: 'Zero bigint id.' },
    { id: -1n, expected: '-1', summary: 'Negative bigint id.' },
    { id: '9007199254740993', expected: '9007199254740993', summary: 'Digit string past the safe range.' },
    { id: '  105  ', expected: '105', summary: 'Padded digit string.' },
    { id: '+1500', expected: '1500', summary: 'Plus digit string.' },
    { id: '007', expected: '7', summary: 'Padded zeros digit string.' },
    { id: '-0', expected: '0', summary: 'Negative zero digit string.' },
    { id: '000', expected: '0', summary: 'Zero digit string.' },
    { id: '-1500', expected: '-1500', summary: 'Negative digit string.' },
  ];
  for (const { id, expected, summary } of cases) {
    const stdout = renderActionLog(actionLogPage([actionLogIdRow(id, summary)], 'skill'));
    expect(actionLogHeaderColumns(stdout)[0], summary).toBe('ID');
    expect(actionLogCell(stdout, summary, 'ID'), summary).toBe(expected);
    expect(stdout, summary).not.toContain('9007199254740992');
    expect(actionLogCell(stdout, summary, 'ID'), summary).not.toContain(',');
  }
});

test('prints an ungrouped entry id beside grouped credits', () => {
  const stdout = renderActionLog(
    actionLogPage(
      [pirateEntry({ credits_earned: 1500 }, { id: 1500, summary: 'Bounty beside its entry id.' })],
      'combat',
    ),
  );
  const idCell = actionLogCell(stdout, 'Bounty beside its entry id.', 'ID');
  expect(idCell).toBe('1500');
  expect(idCell).not.toContain(',');
  expect(idCell).not.toContain('1,500');
  expect(actionLogCell(stdout, 'Bounty beside its entry id.', 'Credits')).toBe('1,500cr');
});

test('omits the ID column for missing and non-integer action-log ids', () => {
  const junk: unknown[] = [
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    true,
    false,
    'nope',
    '1e3',
    '1,500',
    '1.0',
    Number('9007199254740993'),
    { bad: true },
    ['bad-id'],
    null,
    '',
    '   ',
  ];
  for (const value of junk) {
    const stdout = renderActionLog(actionLogPage([actionLogIdRow(value, 'Non-integer id is omitted.')], 'skill'));
    expect(actionLogHeaderColumns(stdout), String(value)).not.toContain('ID');
    expect(stdout, String(value)).not.toContain('1.5');
    expect(stdout, String(value)).not.toContain('true');
    expect(stdout, String(value)).not.toContain('false');
    expect(stdout, String(value)).not.toContain('1,000');
    expect(stdout, String(value)).not.toContain('1,500');
    expect(stdout, String(value)).not.toContain('9007199254740992');
    expect(stdout, String(value)).not.toContain('9007199254740993');
    expect(stdout, String(value)).not.toContain('NaN');
    expect(stdout, String(value)).not.toContain('[object Object]');
    expect(stdout, String(value)).not.toContain('nope');
    expect(stdout, String(value)).not.toContain('1e3');
    expect(stdout, String(value)).not.toContain('1.0');
    expect(stdout, String(value)).not.toContain('bad-id');
    expect(stdout, String(value)).not.toContain('Infinity');
  }

  const missing = renderActionLog(actionLogPage([actionLogIdRow(undefined, 'Missing entry id.', false)], 'skill'));
  expect(actionLogHeaderColumns(missing)).not.toContain('ID');
  expect(missing).toContain('Missing entry id.');
});

test('drops a spread id_display that is not the entry id', () => {
  for (const id of [undefined, 'nope'] as const) {
    for (const idDisplay of ['1|2', { bad: true }] as const) {
      const entry = actionLogIdRow(id, 'Poisoned display row.', id !== undefined);
      entry.id_display = idDisplay;
      const stdout = renderActionLog(actionLogPage([entry], 'skill'));
      expect(actionLogHeaderColumns(stdout), `${String(id)} ${JSON.stringify(idDisplay)}`).not.toContain('ID');
      expect(stdout).not.toContain('1|2');
      expect(stdout).not.toContain('[object Object]');
      if (id === 'nope') expect(stdout).not.toContain('nope');
    }
  }

  const valid = actionLogIdRow(7, 'Valid id drops poisoned display.');
  valid.id_display = '1|2';
  const stdout = renderActionLog(actionLogPage([valid], 'skill'));
  expect(actionLogCell(stdout, 'Valid id drops poisoned display.', 'ID')).toBe('7');
  expect(stdout).not.toContain('1|2');
  expect(stdout).not.toContain('[object Object]');
});

test('does not lift data.id into the action-log ID column', () => {
  const absent = renderActionLog(
    actionLogPage(
      [
        {
          created_at: '2026-09-24T16:00:00.000Z',
          event_type: 'skill.level_up',
          category: 'skill',
          summary: 'Nested id is not the entry.',
          data: { id: 99 },
        },
      ],
      'skill',
    ),
  );
  expect(actionLogHeaderColumns(absent)).not.toContain('ID');
  expect(absent).not.toContain('99');

  const empty = renderActionLog(
    actionLogPage(
      [
        {
          id: '',
          created_at: '2026-09-24T16:00:00.000Z',
          event_type: 'skill.level_up',
          category: 'skill',
          summary: 'Empty string id ignores nested id.',
          data: { id: 99 },
        },
      ],
      'skill',
    ),
  );
  expect(actionLogHeaderColumns(empty)).not.toContain('ID');
  expect(empty).not.toContain('99');

  const wins = renderActionLog(
    actionLogPage(
      [
        {
          id: 7,
          created_at: '2026-09-24T16:00:00.000Z',
          event_type: 'skill.level_up',
          category: 'skill',
          summary: 'Entry id wins over nested id.',
          data: { id: 99 },
        },
      ],
      'skill',
    ),
  );
  expect(actionLogCell(wins, 'Entry id wins over nested id.', 'ID')).toBe('7');
  expect(wins).not.toContain('99');
});

test('prints a negative entry id and still omits a negative next cursor', () => {
  const row = actionLogIdRow(-1500, 'Negative entry id stays visible.');
  const stdout = renderActionLog(actionLogPage([row], 'skill'));
  expect(actionLogCell(stdout, 'Negative entry id stays visible.', 'ID')).toBe('-1500');
  expect(stdout).not.toContain('Next since_id:');

  const withCursor = renderActionLog({
    ...actionLogPage([row], 'skill'),
    next_since_id: -1n,
  });
  expect(actionLogCell(withCursor, 'Negative entry id stays visible.', 'ID')).toBe('-1500');
  expect(withCursor).not.toContain('Next since_id:');
});

test('prints non-negative bigint action-log cursors and still omits malformed ones', () => {
  const printed: Array<{ cursor: unknown; line: string }> = [
    { cursor: 105n, line: 'Next since_id: 105' },
    { cursor: 0n, line: 'Next since_id: 0' },
    { cursor: 9007199254740993n, line: 'Next since_id: 9007199254740993' },
  ];
  for (const { cursor, line } of printed) {
    const fixture = structuredClone(actionLogCursorFixture) as Record<string, unknown>;
    fixture.next_since_id = cursor;
    const stdout = renderActionLog(fixture);
    expect(stdout, String(cursor)).toContain(line);
    expect(stdout, String(cursor)).not.toContain('9007199254740992');
  }

  for (const cursor of [-1n, Number('9007199254740993'), '105', '  105  ', '+105']) {
    const fixture = structuredClone(actionLogCursorFixture) as Record<string, unknown>;
    fixture.next_since_id = cursor;
    const stdout = renderActionLog(fixture);
    expect(stdout, String(cursor)).not.toContain('Next since_id:');
    expect(stdout, String(cursor)).toContain('Faction production cycle completed.');
    expect(stdout, String(cursor)).not.toContain('9007199254740992');
  }
});

test('prints a zero bigint next cursor when the action log has no entries', () => {
  const stdout = renderActionLog({
    ...actionLogPage([], 'all'),
    next_since_id: 0n,
  });
  expect(stdout).toContain('(None)');
  expect(stdout).toContain('Next since_id: 0');
  expect(stdout).not.toContain('ID');
});

test('lifts nested craft receipt fields into action-log table columns', () => {
  const rendered = renderStructuredResult('get_action_log', structuredClone(actionLogFixture), options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Job');
  expect(stdout).toContain('Mode');
  expect(stdout).toContain('Runs');
  expect(stdout).toContain('Venue');
  expect(stdout).toContain('Storage');
  expect(stdout).toContain('job-craft-1');
  expect(stdout).toContain('job-craft-42');
  expect(stdout).toContain('craft');
  expect(stdout).toContain('10');
  expect(stdout).toContain('player-refinery');
  expect(stdout).toContain('faction');
  expect(stdout).toContain('Commission');
  expect(stdout).toContain('commission-1');
  expect(stdout).toContain('Ship');
  expect(stdout).toContain('ship-42');
  expect(stdout).toContain('Class');
  expect(stdout).toContain('prospector');
  expect(stdout).toContain('Base');
  expect(stdout).toContain('Earth Station');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders recruit/treat costs and capture insurance from action-log data', () => {
  const rendered = renderStructuredResult(
    'get_action_log',
    structuredClone(actionLogPersonnelCaptureFixture),
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('ship.recruit_personnel');
  expect(stdout).toContain('ship.treat_personnel');
  expect(stdout).toContain('combat.ship_captured');
  expect(stdout).toContain('combat.ship_lost_to_capture');
  expect(stdout).toContain('Crew');
  expect(stdout).toContain('Marines');
  expect(stdout).toContain('Cost');
  expect(stdout).toContain('Base');
  expect(stdout).toContain('Source');
  expect(stdout).toContain('Insurance');
  expect(stdout).toContain('4');
  expect(stdout).toContain('2');
  expect(stdout).toContain('900cr');
  expect(stdout).toContain('125cr');
  expect(stdout).toContain('Earth Station');
  expect(stdout).toContain('station');
  expect(stdout).toContain('ship-skiff-7');
  expect(stdout).toContain('skiff');
  expect(stdout).toContain('ship-42');
  expect(stdout).toContain('prospector');
  const capturedRow = stdout.split('\n').find((line) => line.includes('combat.ship_captured'));
  const lostRow = stdout.split('\n').find((line) => line.includes('combat.ship_lost_to_capture'));
  expect(capturedRow).toMatch(/\bno\b/);
  expect(lostRow).toMatch(/\byes\b/);
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toMatch(/NaN|undefined|\[object Object\]/);
});

test('renders faction.refuel pilot, base, and fuel from action-log data', () => {
  const rendered = renderStructuredResult(
    'get_action_log',
    structuredClone(actionLogFactionRefuelFixture),
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expectHeaderColumnsInOrder(actionLogHeader(stdout), ['Event', 'Pilot', 'Base', 'Fuel']);
  expect(actionLogCell(stdout, 'Marlowe', 'Pilot')).toBe('Marlowe (player-1)');
  expect(actionLogCell(stdout, 'Marlowe', 'Fuel')).toBe('120');
  expect(actionLogCell(stdout, 'Marlowe', 'Base')).toBe('Earth Station');
  expect(actionLogCell(stdout, 'Ibis', 'Fuel')).toBe('45');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toMatch(/NaN|undefined|\[object Object\]/);
});

test('omits Pilot, Fuel, Station paid, and Shortfall when existing action-log fixtures lack those fields', () => {
  for (const fixture of [actionLogFixture, actionLogCursorFixture, actionLogPersonnelCaptureFixture]) {
    const stdout = renderActionLog(structuredClone(fixture));
    const columns = actionLogHeaderColumns(stdout);
    expect(columns).not.toContain('Pilot');
    expect(columns).not.toContain('Fuel');
    expect(columns).not.toContain('Station paid');
    expect(columns).not.toContain('Shortfall');
    expect(columns).not.toContain('Credits');
    expect(columns).not.toContain('Owed');
    expect(columns).not.toContain('Missed');
    expect(columns).not.toContain('Grace');
    expect(columns).not.toContain('Facilities');
  }

  for (const fixture of [actionLogFactionRefuelFixture, actionLogFreightEscrowFixture]) {
    const stdout = renderActionLog(structuredClone(fixture));
    const columns = actionLogHeaderColumns(stdout);
    expect(columns).not.toContain('Credits');
    expect(columns).not.toContain('Owed');
    expect(columns).not.toContain('Missed');
    expect(columns).not.toContain('Grace');
    expect(columns).not.toContain('Facilities');
  }

  const personnel = renderActionLog(structuredClone(actionLogPersonnelCaptureFixture));
  const personnelColumns = actionLogHeaderColumns(personnel);
  expect(personnelColumns).toContain('Base');
  expect(personnelColumns).toContain('Cost');
  expect(personnelColumns).toContain('Insurance');
});

test('omits Pilot, Fuel, and Base when faction.refuel data has no those keys', () => {
  const fixture = structuredClone(actionLogFactionRefuelFixture);
  for (const entry of fixture.entries) {
    const data = entry.data as Record<string, unknown>;
    delete data.username;
    delete data.player_id;
    delete data.fuel;
    delete data.base_id;
    delete data.base_name;
  }
  const stdout = renderStructuredResult('get_action_log', fixture, options, context).stdout.join('\n');
  const columns = actionLogHeaderColumns(stdout);
  expect(columns).not.toContain('Pilot');
  expect(columns).not.toContain('Fuel');
  expect(columns).not.toContain('Base');
  expect(actionLogCell(stdout, 'Marlowe', 'Event')).toBe('faction.refuel');
});

test('renders id-only Pilot when faction.refuel data has player_id without username', () => {
  const fixture = structuredClone(actionLogFactionRefuelFixture);
  for (const entry of fixture.entries) {
    delete (entry.data as Record<string, unknown>).username;
  }
  const stdout = renderStructuredResult('get_action_log', fixture, options, context).stdout.join('\n');
  expect(actionLogHeaderColumns(stdout)).toContain('Pilot');
  expect(actionLogCell(stdout, 'player-1', 'Pilot')).toBe('player-1');
});

test('renders Fuel 0 when faction.refuel data has fuel zero', () => {
  const fixture = structuredClone(actionLogFactionRefuelFixture);
  for (const entry of fixture.entries) {
    (entry.data as Record<string, unknown>).fuel = 0;
  }
  const stdout = renderStructuredResult('get_action_log', fixture, options, context).stdout.join('\n');
  expect(actionLogHeaderColumns(stdout)).toContain('Fuel');
  expect(actionLogCell(stdout, 'Marlowe', 'Fuel')).toBe('0');
});

test('renders Fuel from faction_fuel when fuel is absent', () => {
  const fixture = structuredClone(actionLogFactionRefuelFixture);
  for (const entry of fixture.entries) {
    const data = entry.data as Record<string, unknown>;
    delete data.fuel;
    data.faction_fuel = 80;
  }
  const stdout = renderStructuredResult('get_action_log', fixture, options, context).stdout.join('\n');
  expect(actionLogHeaderColumns(stdout)).toContain('Fuel');
  expect(actionLogCell(stdout, 'Marlowe', 'Fuel')).toBe('80');
});

test('keeps Pilot and Fuel columns on mixed action-log pages', () => {
  const fixture = structuredClone(actionLogFactionRefuelFixture);
  const mixed = {
    ...fixture,
    entries: [
      fixture.entries[0],
      {
        id: 1,
        created_at: '2026-05-23T15:04:05.000Z',
        summary: 'Completed basic iron smelting.',
        category: 'crafting',
        event_type: 'crafting.completed',
        data: {
          job_id: 'job-craft-1',
          mode: 'craft',
          storage: 'faction',
        },
      },
    ],
  };
  const stdout = renderStructuredResult('get_action_log', mixed, options, context).stdout.join('\n');
  const columns = actionLogHeaderColumns(stdout);
  expect(columns).toContain('Pilot');
  expect(columns).toContain('Fuel');
  expect(actionLogCell(stdout, 'crafting.completed', 'Pilot')?.trim()).toBe('');
  expect(actionLogCell(stdout, 'crafting.completed', 'Fuel')?.trim()).toBe('');
});

test('renders combat.pirate_destroyed credits from action-log data', () => {
  const stdout = renderActionLog(structuredClone(actionLogPirateDestroyedFixture));
  expect(actionLogHeaderColumns(stdout)).toEqual(['ID', 'Timestamp', 'Summary', 'Category', 'Event', 'Credits']);
  expect(actionLogCell(stdout, 'Corsair', 'Credits')).toBe('1,500cr');
  expect(actionLogCell(stdout, 'Skiff', 'Credits')).toBe('0cr');
});

test('omits Credits when combat.pirate_destroyed data has no credits_earned', () => {
  const fixture = structuredClone(actionLogPirateDestroyedFixture);
  for (const entry of fixture.entries) {
    delete (entry.data as { credits_earned?: unknown }).credits_earned;
  }
  const deleted = renderActionLog(fixture);
  expect(actionLogHeaderColumns(deleted)).not.toContain('Credits');
  expect(actionLogCell(deleted, 'Corsair', 'Event')).toBe('combat.pirate_destroyed');

  const noData = renderActionLog(actionLogPage([pirateEntry(undefined)], 'combat'));
  expect(actionLogHeaderColumns(noData)).not.toContain('Credits');
  expect(actionLogCell(noData, 'Corsair', 'Event')).toBe('combat.pirate_destroyed');
});

test('renders Credits 0 when combat.pirate_destroyed data has credits_earned zero', () => {
  const zero = renderActionLog(actionLogPage([pirateEntry({ credits_earned: 0 })], 'combat'));
  expect(actionLogHeaderColumns(zero)).toContain('Credits');
  expect(actionLogCell(zero, 'Corsair', 'Credits')).toBe('0cr');

  const zeroBigint = renderActionLog(actionLogPage([pirateEntry({ credits_earned: 0n })], 'combat'));
  expect(actionLogHeaderColumns(zeroBigint)).toContain('Credits');
  expect(actionLogCell(zeroBigint, 'Corsair', 'Credits')).toBe('0cr');
});

test('keeps Credits on a mixed action-log page with faction.refuel', () => {
  const pirate = structuredClone(actionLogPirateDestroyedFixture);
  const refuel = structuredClone(actionLogFactionRefuelFixture);
  const corsair = pirate.entries[0];
  const marlowe = refuel.entries[0];
  if (!corsair || !marlowe) throw new Error('expected pirate and refuel rows');
  const stdout = renderActionLog(actionLogPage([corsair, marlowe], 'combat'));
  const columns = actionLogHeaderColumns(stdout);
  expect(columns).toContain('Credits');
  expect(columns).toContain('Pilot');
  expect(columns).toContain('Base');
  expect(columns).toContain('Fuel');
  expect(actionLogCell(stdout, 'Corsair', 'Pilot')).toBe('');
  expect(actionLogCell(stdout, 'Corsair', 'Base')).toBe('');
  expect(actionLogCell(stdout, 'Corsair', 'Fuel')).toBe('');
  expect(actionLogCell(stdout, 'Marlowe', 'Credits')).toBe('');
  expect(actionLogCell(stdout, 'Marlowe', 'Fuel')).toBe('120');
  expect(actionLogCell(stdout, 'Corsair', 'Credits')).toBe('1,500cr');
});

test('does not lift credits_earned off a non-pirate event', () => {
  const stdout = renderActionLog(
    actionLogPage(
      [
        {
          id: 410,
          created_at: '2026-09-23T12:20:00.000Z',
          summary: 'Crafted a plate.',
          category: 'crafting',
          event_type: 'crafting.completed',
          data: { credits_earned: 1500 },
        },
      ],
      'crafting',
    ),
  );
  expect(actionLogHeaderColumns(stdout)).not.toContain('Credits');
  expect(actionLogCell(stdout, 'crafting.completed', 'Event')).toBe('crafting.completed');
  expect(stdout).not.toContain('1,500cr');
});

test('does not treat a prefix, different case, data event_type, or losing type as pirate_destroyed', () => {
  const rejected = [
    { event_type: 'combat.pirate_destroyed.extra' },
    { event_type: 'COMBAT.PIRATE_DESTROYED' },
    {
      event_type: 'crafting.completed',
      data: { event_type: 'combat.pirate_destroyed', credits_earned: 1500 },
    },
    {
      event_type: 'crafting.completed',
      type: 'combat.pirate_destroyed',
      data: { credits_earned: 1500 },
    },
  ];
  for (const extra of rejected) {
    const stdout = renderActionLog(actionLogPage([pirateEntry({ credits_earned: 1500 }, extra)], 'combat'));
    expect(actionLogHeaderColumns(stdout), JSON.stringify(extra)).not.toContain('Credits');
    expect(stdout, JSON.stringify(extra)).not.toContain('1,500cr');
  }
});

test('lifts pirate credits from type when event_type is absent', () => {
  const stdout = renderActionLog(
    actionLogPage(
      [
        {
          id: 511,
          created_at: '2026-09-24T16:10:00.000Z',
          summary: 'Typed pirate.',
          category: 'combat',
          type: 'combat.pirate_destroyed',
          data: { credits_earned: 1500 },
        },
      ],
      'combat',
    ),
  );
  expect(actionLogCell(stdout, 'Typed pirate.', 'Event')).toBe('combat.pirate_destroyed');
  expect(actionLogCell(stdout, 'Typed pirate.', 'Credits')).toBe('1,500cr');
});

test('prefers entry-level credits_earned over data.credits_earned', () => {
  const stdout = renderActionLog(
    actionLogPage([pirateEntry({ credits_earned: 99 }, { credits_earned: 10 })], 'combat'),
  );
  expect(actionLogCell(stdout, 'Corsair', 'Credits')).toBe('10cr');
  expect(stdout).not.toContain('99');
});

test('does not fall through a whitespace entry credits_earned to data', () => {
  const stdout = renderActionLog(
    actionLogPage([pirateEntry({ credits_earned: 1500 }, { credits_earned: '   ' })], 'combat'),
  );
  expect(actionLogHeaderColumns(stdout)).not.toContain('Credits');
  expect(stdout).not.toContain('1,500cr');
});

test('formats out-of-range bigint credits_earned without rounding', () => {
  const stdout = renderActionLog(actionLogPage([pirateEntry({ credits_earned: 9007199254740993n })], 'combat'));
  const cell = actionLogCell(stdout, 'Corsair', 'Credits');
  expect(cell).toBe(`${(9007199254740993n).toLocaleString()}cr`);
  expect(cell?.replace(/\D/g, '')).toContain('9007199254740993');
  expect(cell).not.toContain('9007199254740992');
});

test('formats digit-string credits_earned without rounding', () => {
  const cases: Array<{ raw: unknown; expected: string; digits?: string }> = [
    {
      raw: '9007199254740993',
      expected: `${BigInt('9007199254740993').toLocaleString()}cr`,
      digits: '9007199254740993',
    },
    { raw: '0', expected: '0cr' },
    { raw: '+1500', expected: '1,500cr' },
    { raw: '007', expected: '7cr' },
    { raw: '-1500', expected: `${BigInt('-1500').toLocaleString()}cr` },
    { raw: '000', expected: '0cr' },
    { raw: '-0', expected: '0cr' },
    { raw: '+0', expected: '0cr' },
    { raw: '  1500  ', expected: '1,500cr' },
    { raw: -1500, expected: '-1,500cr' },
  ];
  for (const { raw, expected, digits } of cases) {
    const stdout = renderActionLog(actionLogPage([pirateEntry({ credits_earned: raw })], 'combat'));
    const cell = actionLogCell(stdout, 'Corsair', 'Credits');
    expect(cell, String(raw)).toBe(expected);
    if (digits) expect(cell?.replace(/\D/g, '')).toContain(digits);
    expect(cell).not.toContain('9007199254740992');
  }
});

test('does not format non-integer credits_earned as credits', () => {
  const badValues: unknown[] = [
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    true,
    false,
    'nope',
    '1e3',
    Number('9007199254740993'),
    null,
    { amount: 1 },
  ];
  for (const value of badValues) {
    const stdout = renderActionLog(actionLogPage([pirateEntry({ credits_earned: value })], 'combat'));
    expect(actionLogHeaderColumns(stdout), String(value)).not.toContain('Credits');
    expect(actionLogCell(stdout, 'Corsair', 'Event')).toBe('combat.pirate_destroyed');
    expect(stdout).not.toContain('1.5');
    expect(stdout).not.toContain('1,000cr');
    expect(stdout).not.toContain('9007199254740992');
    expect(stdout).not.toContain('NaN');
    expect(stdout).not.toContain('[object Object]');
  }
});

test('does not parse credits out of the summary', () => {
  const summaryOnly = renderActionLog(
    actionLogPage([pirateEntry(undefined, { summary: 'Paid 9999 credits.' })], 'combat'),
  );
  expect(actionLogHeaderColumns(summaryOnly)).not.toContain('Credits');
  expect(summaryOnly).toContain('Paid 9999 credits.');
  expect(summaryOnly).not.toContain('9,999');

  const withField = renderActionLog(
    actionLogPage(
      [
        pirateEntry(undefined, { summary: 'Paid 9999 credits.', id: 501 }),
        pirateEntry({ credits_earned: 1500 }, { summary: 'Bounty was 100.', id: 502 }),
      ],
      'combat',
    ),
  );
  expect(withField).toContain('Paid 9999 credits.');
  expect(withField).toContain('Bounty was 100.');
  expect(actionLogCell(withField, 'Paid 9999 credits.', 'Credits')).toBe('');
  expect(actionLogCell(withField, 'Bounty was 100.', 'Credits')).toBe('1,500cr');
  expect(withField).not.toContain('9,999');
  expect(withField).not.toContain('100cr');
});

test('inserts Credits after Shortfall and before Base', () => {
  const stdout = renderActionLog(
    actionLogPage([
      {
        id: 201,
        created_at: '2026-09-03T10:00:00.000Z',
        summary: 'Hired 4 crew and 2 marines at Earth Station.',
        category: 'ship',
        event_type: 'ship.recruit_personnel',
        data: { cost: 900, base_name: 'Earth Station' },
      },
      claimEntry({ station_paid: 8000, shortfall: 0 }, { id: 402 }),
      pirateEntry({ credits_earned: 1500 }, { id: 503 }),
    ]),
  );
  expectHeaderColumnsInOrder(actionLogHeader(stdout), ['Cost', 'Station paid', 'Shortfall', 'Credits', 'Base']);
  const columns = actionLogHeaderColumns(stdout);
  const cost = columns.indexOf('Cost');
  expect(columns.slice(cost, cost + 5)).toEqual(['Cost', 'Station paid', 'Shortfall', 'Credits', 'Base']);
});

const rentCounters = {
  credits_owed: 12000,
  missed_cycles: 3,
  grace_cycles: 260,
  facilities_behind: 2,
};

test('lifts missed-rent counters for other.rent_warning and faction.rent_warning', () => {
  const stdout = renderActionLog(
    actionLogPage([
      rentEntry('other.rent_warning', {
        base_id: 'earth_station',
        base_name: 'Earth Station',
        credits_owed: 12000,
        missed_cycles: 3,
        grace_cycles: 260,
        facilities_behind: 2,
        message: 'DETAIL_MESSAGE_TOKEN',
        faction_id: 'fac_personal_should_not_print',
      }),
      rentEntry(
        'faction.rent_warning',
        {
          base_id: 'haven_exchange',
          credits_owed: 45000,
          missed_cycles: 8,
          grace_cycles: 260,
          facilities_behind: 4,
          faction_id: 'fac_wardens_token',
          message: 'FACTION_MESSAGE_TOKEN',
        },
        { id: 602 },
      ),
    ]),
  );
  expectHeaderColumnsInOrder(actionLogHeader(stdout), ['Owed', 'Missed', 'Grace', 'Facilities', 'Base']);
  const columns = actionLogHeaderColumns(stdout);
  const owed = columns.indexOf('Owed');
  expect(columns.slice(owed, owed + 5)).toEqual(['Owed', 'Missed', 'Grace', 'Facilities', 'Base']);
  expect(columns).not.toContain('Fuel');
  expect(actionLogCell(stdout, 'other.rent_warning', 'Owed')).toBe('12,000cr');
  expect(actionLogCell(stdout, 'other.rent_warning', 'Missed')).toBe('3');
  expect(actionLogCell(stdout, 'other.rent_warning', 'Grace')).toBe('260');
  expect(actionLogCell(stdout, 'other.rent_warning', 'Facilities')).toBe('2');
  expect(actionLogCell(stdout, 'other.rent_warning', 'Base')).toBe('Earth Station');
  expect(actionLogCell(stdout, 'faction.rent_warning', 'Owed')).toBe('45,000cr');
  expect(actionLogCell(stdout, 'faction.rent_warning', 'Missed')).toBe('8');
  expect(actionLogCell(stdout, 'faction.rent_warning', 'Grace')).toBe('260');
  expect(actionLogCell(stdout, 'faction.rent_warning', 'Facilities')).toBe('4');
  expect(actionLogCell(stdout, 'faction.rent_warning', 'Base')).toBe('haven_exchange');
  expect(stdout.match(/Rent overdue at Earth Station\./g)?.length).toBe(2);
  expect(stdout).not.toContain('DETAIL_MESSAGE_TOKEN');
  expect(stdout).not.toContain('FACTION_MESSAGE_TOKEN');
  expect(stdout).not.toContain('fac_wardens_token');
  expect(stdout).not.toContain('fac_personal_should_not_print');
});

test('does not lift rent counters off a non-rent event', () => {
  const stdout = renderActionLog(
    actionLogPage(
      [
        rentEntry('crafting.completed', {
          credits_owed: 12000,
          missed_cycles: 3,
          grace_cycles: 260,
          facilities_behind: 2,
        }),
      ],
      'crafting',
    ),
  );
  const columns = actionLogHeaderColumns(stdout);
  expect(columns).not.toContain('Owed');
  expect(columns).not.toContain('Missed');
  expect(columns).not.toContain('Grace');
  expect(columns).not.toContain('Facilities');
  expect(stdout).not.toContain('12,000cr');
  expect(actionLogCell(stdout, 'crafting.completed', 'Event')).toBe('crafting.completed');
});

test('does not treat a prefix, different case, data event_type, or losing type as a rent warning', () => {
  const rejected = [
    rentEntry('other.rent_warning.extra', rentCounters),
    rentEntry('OTHER.RENT_WARNING', rentCounters),
    rentEntry('faction.rent_warning.extra', rentCounters),
    rentEntry('FACTION.RENT_WARNING', rentCounters),
    rentEntry('other.rent_warning', rentCounters, {
      event_type: 'crafting.completed',
      data: { event_type: 'other.rent_warning', ...rentCounters },
    }),
    rentEntry('faction.rent_warning', rentCounters, {
      event_type: 'crafting.completed',
      type: 'faction.rent_warning',
    }),
  ];
  for (const entry of rejected) {
    const stdout = renderActionLog(actionLogPage([entry]));
    const columns = actionLogHeaderColumns(stdout);
    expect(columns, JSON.stringify(entry.event_type)).not.toContain('Owed');
    expect(columns, JSON.stringify(entry.event_type)).not.toContain('Missed');
    expect(columns, JSON.stringify(entry.event_type)).not.toContain('Grace');
    expect(columns, JSON.stringify(entry.event_type)).not.toContain('Facilities');
    expect(stdout, JSON.stringify(entry.event_type)).not.toContain('12,000cr');
  }
});

test('lifts rent warnings from type when event_type is absent', () => {
  for (const eventType of ['other.rent_warning', 'faction.rent_warning'] as const) {
    const entry = rentEntry(eventType, {
      credits_owed: 12000,
      missed_cycles: 1,
      grace_cycles: 260,
      facilities_behind: 1,
    });
    delete entry.event_type;
    entry.type = eventType;
    const stdout = renderActionLog(actionLogPage([entry]));
    expect(actionLogCell(stdout, eventType, 'Event')).toBe(eventType);
    expect(actionLogCell(stdout, eventType, 'Owed')).toBe('12,000cr');
  }
});

test('lifts a trimmed rent-warning event type', () => {
  const stdout = renderActionLog(actionLogPage([rentEntry(' other.rent_warning ', { credits_owed: 5 })]));
  expect(actionLogCell(stdout, 'other.rent_warning', 'Owed')).toBe('5cr');
});

test('prints zero rent-warning counters', () => {
  const zeros = renderActionLog(
    actionLogPage([
      rentEntry('other.rent_warning', {
        credits_owed: 0,
        missed_cycles: 0,
        grace_cycles: 0,
        facilities_behind: 0,
      }),
    ]),
  );
  const columns = actionLogHeaderColumns(zeros);
  expect(columns).toContain('Owed');
  expect(columns).toContain('Missed');
  expect(columns).toContain('Grace');
  expect(columns).toContain('Facilities');
  expect(actionLogCell(zeros, 'other.rent_warning', 'Owed')).toBe('0cr');
  expect(actionLogCell(zeros, 'other.rent_warning', 'Missed')).toBe('0');
  expect(actionLogCell(zeros, 'other.rent_warning', 'Grace')).toBe('0');
  expect(actionLogCell(zeros, 'other.rent_warning', 'Facilities')).toBe('0');

  const zeroBigint = renderActionLog(
    actionLogPage([
      rentEntry('other.rent_warning', {
        credits_owed: 0n,
        missed_cycles: 0,
        grace_cycles: 0,
        facilities_behind: 0n,
      }),
    ]),
  );
  expect(actionLogCell(zeroBigint, 'other.rent_warning', 'Owed')).toBe('0cr');
  expect(actionLogCell(zeroBigint, 'other.rent_warning', 'Missed')).toBe('0');
  expect(actionLogCell(zeroBigint, 'other.rent_warning', 'Grace')).toBe('0');
  expect(actionLogCell(zeroBigint, 'other.rent_warning', 'Facilities')).toBe('0');
});

test('omits rent-warning columns when their keys are missing', () => {
  const bare = renderActionLog(actionLogPage([rentEntry('other.rent_warning', {})]));
  const bareColumns = actionLogHeaderColumns(bare);
  expect(actionLogCell(bare, 'other.rent_warning', 'Event')).toBe('other.rent_warning');
  expect(bareColumns).not.toContain('Owed');
  expect(bareColumns).not.toContain('Missed');
  expect(bareColumns).not.toContain('Grace');
  expect(bareColumns).not.toContain('Facilities');

  const owedOnly = renderActionLog(actionLogPage([rentEntry('other.rent_warning', { credits_owed: 0 })]));
  const owedColumns = actionLogHeaderColumns(owedOnly);
  expect(actionLogCell(owedOnly, 'other.rent_warning', 'Owed')).toBe('0cr');
  expect(owedColumns).not.toContain('Missed');
  expect(owedColumns).not.toContain('Grace');
  expect(owedColumns).not.toContain('Facilities');

  const missedOnly = renderActionLog(actionLogPage([rentEntry('other.rent_warning', { missed_cycles: 3 })]));
  const missedColumns = actionLogHeaderColumns(missedOnly);
  expect(actionLogCell(missedOnly, 'other.rent_warning', 'Missed')).toBe('3');
  expect(missedColumns).not.toContain('Owed');
  expect(missedColumns).not.toContain('Grace');
  expect(missedColumns).not.toContain('Facilities');
});

test('prefers entry-level rent counters over data', () => {
  const stdout = renderActionLog(
    actionLogPage([rentEntry('other.rent_warning', { credits_owed: 99 }, { credits_owed: 10 })]),
  );
  expect(actionLogCell(stdout, 'other.rent_warning', 'Owed')).toBe('10cr');
  expect(stdout).not.toContain('99');

  const blocked = renderActionLog(
    actionLogPage([rentEntry('other.rent_warning', { credits_owed: 1500 }, { credits_owed: '   ' })]),
  );
  expect(actionLogHeaderColumns(blocked)).not.toContain('Owed');
  expect(blocked).not.toContain('1,500cr');
});

test('formats rent-warning int64 and digit strings with the shared integer policy', () => {
  const bigintOwed = renderActionLog(
    actionLogPage([rentEntry('other.rent_warning', { credits_owed: 9007199254740993n })]),
  );
  const owedCell = actionLogCell(bigintOwed, 'other.rent_warning', 'Owed');
  expect(owedCell).toBe(`${(9007199254740993n).toLocaleString()}cr`);
  expect(owedCell?.replace(/\D/g, '')).toContain('9007199254740993');
  expect(owedCell).not.toContain('9007199254740992');

  const stringOwed = renderActionLog(
    actionLogPage([rentEntry('faction.rent_warning', { credits_owed: '9007199254740993' })]),
  );
  const stringCell = actionLogCell(stringOwed, 'faction.rent_warning', 'Owed');
  expect(stringCell).toBe(`${BigInt('9007199254740993').toLocaleString()}cr`);
  expect(stringCell?.replace(/\D/g, '')).toContain('9007199254740993');
  expect(stringCell).not.toContain('9007199254740992');

  const cases: Array<{ raw: unknown; expected: string }> = [
    { raw: '0', expected: '0cr' },
    { raw: '+1500', expected: '1,500cr' },
    { raw: '007', expected: '7cr' },
    { raw: '-1500', expected: `${BigInt('-1500').toLocaleString()}cr` },
    { raw: '  1500  ', expected: '1,500cr' },
  ];
  for (const { raw, expected } of cases) {
    const stdout = renderActionLog(actionLogPage([rentEntry('other.rent_warning', { credits_owed: raw })]));
    expect(actionLogCell(stdout, 'other.rent_warning', 'Owed'), String(raw)).toBe(expected);
  }

  const missed = renderActionLog(
    actionLogPage([rentEntry('other.rent_warning', { missed_cycles: 9007199254740993n })]),
  );
  const missedCell = actionLogCell(missed, 'other.rent_warning', 'Missed');
  expect(missedCell).toBe(9007199254740993n.toLocaleString());
  expect(missedCell).not.toContain('cr');
  expect(missedCell?.replace(/\D/g, '')).toContain('9007199254740993');
  expect(missedCell).not.toContain('9007199254740992');
});

test('omits rent-warning cells for rejected scalars', () => {
  const badValues: unknown[] = [
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    true,
    false,
    'nope',
    '1e3',
    Number('9007199254740993'),
    { amount: 1 },
  ];
  for (const key of ['credits_owed', 'missed_cycles'] as const) {
    const header = key === 'credits_owed' ? 'Owed' : 'Missed';
    for (const value of badValues) {
      const label = `${key}=${String(value)}`;
      const stdout = renderActionLog(actionLogPage([rentEntry('other.rent_warning', { [key]: value })]));
      expect(actionLogHeaderColumns(stdout), label).not.toContain(header);
      expect(stdout, label).not.toContain('1.5');
      expect(stdout, label).not.toContain('NaN');
      expect(stdout, label).not.toContain('[object Object]');
      expect(stdout, label).not.toContain('9007199254740992');
    }
  }
});

test('does not parse rent counters out of the summary', () => {
  const summary = 'Owed 9999 credits, 7 cycles, 4 facilities.';
  const summaryOnly = renderActionLog(actionLogPage([rentEntry('other.rent_warning', undefined, { summary })]));
  const summaryColumns = actionLogHeaderColumns(summaryOnly);
  expect(summaryColumns).not.toContain('Owed');
  expect(summaryColumns).not.toContain('Missed');
  expect(summaryColumns).not.toContain('Grace');
  expect(summaryColumns).not.toContain('Facilities');
  expect(summaryOnly).toContain(summary);
  expect(summaryOnly).not.toContain('9,999');

  const withField = renderActionLog(
    actionLogPage([
      rentEntry('other.rent_warning', undefined, { summary, id: 601 }),
      rentEntry('other.rent_warning', { credits_owed: 1500 }, { summary: 'Rent warning with owed.', id: 602 }),
    ]),
  );
  expect(withField).toContain(summary);
  expect(withField).toContain('Rent warning with owed.');
  expect(actionLogCell(withField, summary, 'Owed')).toBe('');
  expect(actionLogCell(withField, 'Rent warning with owed.', 'Owed')).toBe('1,500cr');
  expect(actionLogHeaderColumns(withField)).not.toContain('Missed');
  expect(actionLogHeaderColumns(withField)).not.toContain('Grace');
  expect(actionLogHeaderColumns(withField)).not.toContain('Facilities');
  expect(withField).not.toContain('9,999');
});

test('keeps rent columns beside Credits on a mixed action-log page', () => {
  const refuel = structuredClone(actionLogFactionRefuelFixture);
  const marlowe = refuel.entries[0];
  if (!marlowe) throw new Error('expected refuel row');
  const stdout = renderActionLog(
    actionLogPage([
      pirateEntry({ credits_earned: 1500 }),
      marlowe,
      rentEntry('other.rent_warning', {
        base_id: 'earth_station',
        base_name: 'Earth Station',
        ...rentCounters,
      }),
    ]),
  );
  const columns = actionLogHeaderColumns(stdout);
  for (const header of ['Credits', 'Owed', 'Missed', 'Grace', 'Facilities', 'Pilot', 'Base', 'Fuel']) {
    expect(columns).toContain(header);
  }
  expectHeaderColumnsInOrder(actionLogHeader(stdout), ['Credits', 'Owed', 'Missed', 'Grace', 'Facilities', 'Base']);
  const credits = columns.indexOf('Credits');
  expect(columns.slice(credits, credits + 6)).toEqual(['Credits', 'Owed', 'Missed', 'Grace', 'Facilities', 'Base']);
  for (const header of ['Owed', 'Missed', 'Grace', 'Facilities', 'Pilot', 'Base', 'Fuel']) {
    expect(actionLogCell(stdout, 'Corsair', header)).toBe('');
  }
  expect(actionLogCell(stdout, 'Marlowe', 'Credits')).toBe('');
  expect(actionLogCell(stdout, 'Marlowe', 'Owed')).toBe('');
  expect(actionLogCell(stdout, 'Rent overdue', 'Credits')).toBe('');
  expect(actionLogCell(stdout, 'Rent overdue', 'Pilot')).toBe('');
  expect(actionLogCell(stdout, 'Rent overdue', 'Fuel')).toBe('');
  expect(actionLogCell(stdout, 'Rent overdue', 'Owed')).toBe('12,000cr');
});

test('keeps rent-warning data on json output', () => {
  const fixture = actionLogPage([
    rentEntry('other.rent_warning', {
      credits_owed: 12000,
      missed_cycles: 3,
      grace_cycles: 260,
      facilities_behind: 2,
      message: 'DETAIL_MESSAGE_TOKEN',
      faction_id: 'fac_personal_should_not_print',
    }),
  ]);
  const rendered = renderStructuredResult('get_action_log', fixture, { ...options, format: 'json' }, context);
  expect(rendered.success).toBe(true);
  const parsed = JSON.parse(rendered.stdout.join('\n')) as {
    entries: Array<{ data: Record<string, unknown> }>;
  };
  expect(parsed.entries[0]?.data).toEqual({
    credits_owed: 12000,
    missed_cycles: 3,
    grace_cycles: 260,
    facilities_behind: 2,
    message: 'DETAIL_MESSAGE_TOKEN',
    faction_id: 'fac_personal_should_not_print',
  });
  expect(rendered.stdout.join('\n')).not.toContain('owed_display');
  expect(rendered.stdout.join('\n')).not.toContain('missed_display');
  expect(rendered.stdout.join('\n')).not.toContain('grace_display');
  expect(rendered.stdout.join('\n')).not.toContain('facilities_display');
  const human = renderActionLog(fixture);
  expect(actionLogCell(human, 'other.rent_warning', 'Owed')).toBe('12,000cr');
});

test('renders shipping.claim_paid station paid and shortfall from action-log data', () => {
  const stdout = renderActionLog(structuredClone(actionLogFreightEscrowFixture));
  expect(actionLogHeaderColumns(stdout)).toEqual([
    'ID',
    'Timestamp',
    'Summary',
    'Category',
    'Event',
    'Station paid',
    'Shortfall',
  ]);
  expect(actionLogCell(stdout, 'claim in full', 'Station paid')).toBe('8,000cr');
  expect(actionLogCell(stdout, 'claim in full', 'Shortfall')).toBe('0cr');
  expect(actionLogCell(stdout, 'part of the claim', 'Station paid')).toBe('1,500cr');
  expect(actionLogCell(stdout, 'part of the claim', 'Shortfall')).toBe('6,500cr');
  expect(actionLogCell(stdout, 'trading.escrow_refunded', 'Event')).toBe('trading.escrow_refunded');
  expect(actionLogCell(stdout, 'trading.escrow_refunded', 'Station paid')).toBe('');
  expect(actionLogCell(stdout, 'trading.escrow_refunded', 'Shortfall')).toBe('');
});

test('omits Station paid and Shortfall when shipping.claim_paid data lacks both keys', () => {
  const fixture = structuredClone(actionLogFreightEscrowFixture);
  for (const entry of fixture.entries) {
    if (!('data' in entry) || entry.data === undefined) continue;
    const data = entry.data as { station_paid?: unknown; shortfall?: unknown };
    delete data.station_paid;
    delete data.shortfall;
  }
  const stdout = renderActionLog(fixture);
  const columns = actionLogHeaderColumns(stdout);
  expect(columns).not.toContain('Station paid');
  expect(columns).not.toContain('Shortfall');
  expect(actionLogCell(stdout, 'claim in full', 'Event')).toBe('shipping.claim_paid');
});

test('omits Station paid and Shortfall for faction freight events', () => {
  const events = [
    'faction.freight_fee_earned',
    'faction.freight_premium_earned',
    'faction.freight_claim_paid',
    'faction.freight_debt_repaid',
  ] as const;
  const stdout = renderActionLog(
    actionLogPage(
      events.map((eventType, index) => ({
        id: 500 + index,
        created_at: `2026-09-23T13:0${index}:00.000Z`,
        category: 'faction',
        event_type: eventType,
        summary: eventType,
      })),
      'faction',
    ),
  );
  const columns = actionLogHeaderColumns(stdout);
  expect(columns).not.toContain('Station paid');
  expect(columns).not.toContain('Shortfall');
  for (const eventType of events) {
    expect(actionLogCell(stdout, eventType, 'Event')).toBe(eventType);
  }
});

test('does not lift shortfall or station_paid off a non-claim event', () => {
  const stdout = renderActionLog(
    actionLogPage(
      [
        {
          id: 410,
          created_at: '2026-09-23T12:20:00.000Z',
          summary: 'Crafted a plate.',
          category: 'crafting',
          event_type: 'crafting.completed',
          data: { shortfall: 5, station_paid: 10 },
        },
      ],
      'crafting',
    ),
  );
  expect(actionLogHeaderColumns(stdout)).not.toContain('Station paid');
  expect(actionLogHeaderColumns(stdout)).not.toContain('Shortfall');
  expect(actionLogCell(stdout, 'crafting.completed', 'Event')).toBe('crafting.completed');
  expect(stdout).not.toContain('10cr');
  expect(stdout).not.toContain('5cr');
});

test('does not treat a prefix, different case, data event_type, or losing type as a claim', () => {
  const rejected = [
    { event_type: 'shipping.claim_paid.extra' },
    { event_type: 'SHIPPING.CLAIM_PAID' },
    {
      event_type: 'crafting.completed',
      data: { event_type: 'shipping.claim_paid', station_paid: 10, shortfall: 5 },
    },
    {
      event_type: 'crafting.completed',
      type: 'shipping.claim_paid',
      data: { station_paid: 10, shortfall: 5 },
    },
  ];
  for (const extra of rejected) {
    const stdout = renderActionLog(actionLogPage([claimEntry({ station_paid: 10, shortfall: 5 }, extra)]));
    expect(actionLogHeaderColumns(stdout), JSON.stringify(extra)).not.toContain('Station paid');
    expect(actionLogHeaderColumns(stdout), JSON.stringify(extra)).not.toContain('Shortfall');
  }
});

test('lifts claim credits from type when event_type is absent', () => {
  const stdout = renderActionLog(
    actionLogPage([
      {
        id: 411,
        created_at: '2026-09-23T12:25:00.000Z',
        summary: 'Typed claim.',
        category: 'shipping',
        type: 'shipping.claim_paid',
        data: { station_paid: 8000, shortfall: 0 },
      },
    ]),
  );
  expect(actionLogCell(stdout, 'Typed claim.', 'Event')).toBe('shipping.claim_paid');
  expect(actionLogCell(stdout, 'Typed claim.', 'Station paid')).toBe('8,000cr');
  expect(actionLogCell(stdout, 'Typed claim.', 'Shortfall')).toBe('0cr');
});

test('keeps Station paid and Shortfall on a mixed action-log page', () => {
  const fixture = structuredClone(actionLogFreightEscrowFixture);
  const claim = fixture.entries[0];
  if (!claim) throw new Error('expected claim row');
  const stdout = renderActionLog(
    actionLogPage([
      claim,
      {
        id: 1,
        created_at: '2026-05-23T15:04:05.000Z',
        summary: 'Completed basic iron smelting.',
        category: 'crafting',
        event_type: 'crafting.completed',
        data: { job_id: 'job-craft-1', mode: 'craft', storage: 'faction' },
      },
    ]),
  );
  expect(actionLogHeaderColumns(stdout)).toContain('Station paid');
  expect(actionLogHeaderColumns(stdout)).toContain('Shortfall');
  expect(actionLogCell(stdout, 'crafting.completed', 'Station paid')).toBe('');
  expect(actionLogCell(stdout, 'crafting.completed', 'Shortfall')).toBe('');
  expect(actionLogCell(stdout, 'claim in full', 'Station paid')).toBe('8,000cr');
});

test('inserts Station paid and Shortfall after Cost and before Base', () => {
  const stdout = renderActionLog(
    actionLogPage([
      {
        id: 201,
        created_at: '2026-09-03T10:00:00.000Z',
        summary: 'Hired 4 crew and 2 marines at Earth Station.',
        category: 'ship',
        event_type: 'ship.recruit_personnel',
        data: { cost: 900, base_name: 'Earth Station' },
      },
      claimEntry({ station_paid: 8000, shortfall: 0 }, { id: 402 }),
    ]),
  );
  expectHeaderColumnsInOrder(actionLogHeader(stdout), ['Cost', 'Station paid', 'Shortfall', 'Base']);
  const columns = actionLogHeaderColumns(stdout);
  const cost = columns.indexOf('Cost');
  expect(columns.slice(cost, cost + 4)).toEqual(['Cost', 'Station paid', 'Shortfall', 'Base']);
});

test('renders Station paid and Shortfall 0 as 0cr', () => {
  const fixture = structuredClone(actionLogFreightEscrowFixture);
  for (const entry of fixture.entries) {
    if (!('data' in entry) || entry.data === undefined) continue;
    entry.data.station_paid = 0;
    entry.data.shortfall = 0;
  }
  const stdout = renderActionLog(fixture);
  expect(actionLogCell(stdout, 'claim in full', 'Station paid')).toBe('0cr');
  expect(actionLogCell(stdout, 'claim in full', 'Shortfall')).toBe('0cr');
  expect(actionLogCell(stdout, 'part of the claim', 'Station paid')).toBe('0cr');
  expect(actionLogCell(stdout, 'part of the claim', 'Shortfall')).toBe('0cr');

  const zeroBigint = renderActionLog(actionLogPage([claimEntry({ station_paid: 0n, shortfall: 0n })]));
  expect(actionLogCell(zeroBigint, 'shipping.claim_paid', 'Station paid')).toBe('0cr');
  expect(actionLogCell(zeroBigint, 'shipping.claim_paid', 'Shortfall')).toBe('0cr');
});

test('shows Station paid and Shortfall only for the key that formatted', () => {
  const paidOnly = renderActionLog(actionLogPage([claimEntry({ station_paid: 0 })]));
  expect(actionLogHeaderColumns(paidOnly)).toContain('Station paid');
  expect(actionLogHeaderColumns(paidOnly)).not.toContain('Shortfall');
  expect(actionLogCell(paidOnly, 'shipping.claim_paid', 'Station paid')).toBe('0cr');

  const shortOnly = renderActionLog(actionLogPage([claimEntry({ shortfall: 6500 })]));
  expect(actionLogHeaderColumns(shortOnly)).not.toContain('Station paid');
  expect(actionLogHeaderColumns(shortOnly)).toContain('Shortfall');
  expect(actionLogCell(shortOnly, 'shipping.claim_paid', 'Shortfall')).toBe('6,500cr');
});

test('prefers entry-level station_paid over data.station_paid', () => {
  const fixture = structuredClone(actionLogFreightEscrowFixture);
  const entry = fixture.entries[0];
  if (!entry || !('data' in entry) || entry.data === undefined) throw new Error('expected claim row');
  Object.assign(entry, { station_paid: 10 });
  entry.data.station_paid = 99;
  const stdout = renderActionLog(fixture);
  expect(actionLogCell(stdout, 'claim in full', 'Station paid')).toBe('10cr');
  expect(actionLogCell(stdout, 'claim in full', 'Shortfall')).toBe('0cr');
  expect(stdout).not.toContain('99');
});

test('does not fall through a whitespace entry station_paid to data', () => {
  const stdout = renderActionLog(
    actionLogPage([
      claimEntry({ station_paid: 8000, shortfall: 0 }, { station_paid: '   ', summary: 'Whitespace beats data.' }),
    ]),
  );
  expect(actionLogHeaderColumns(stdout)).not.toContain('Station paid');
  expect(actionLogCell(stdout, 'Whitespace beats data.', 'Shortfall')).toBe('0cr');
  expect(stdout).not.toContain('8,000cr');
});

test('formats out-of-range bigint station_paid without rounding', () => {
  const stdout = renderActionLog(actionLogPage([claimEntry({ station_paid: 9007199254740993n, shortfall: 0n })]));
  const cell = actionLogCell(stdout, 'shipping.claim_paid', 'Station paid');
  expect(cell).toBe(`${(9007199254740993n).toLocaleString()}cr`);
  expect(cell?.replace(/\D/g, '')).toContain('9007199254740993');
  expect(cell).not.toContain('9007199254740992');
  expect(actionLogCell(stdout, 'shipping.claim_paid', 'Shortfall')).toBe('0cr');
});

test('formats digit-string claim credits without rounding', () => {
  const cases: Array<{ raw: unknown; expected: string; digits?: string }> = [
    {
      raw: '9007199254740993',
      expected: `${BigInt('9007199254740993').toLocaleString()}cr`,
      digits: '9007199254740993',
    },
    { raw: '0', expected: '0cr' },
    { raw: '+1500', expected: '1,500cr' },
    { raw: '007', expected: '7cr' },
    { raw: '-1500', expected: `${BigInt('-1500').toLocaleString()}cr` },
    { raw: '000', expected: '0cr' },
    { raw: '-0', expected: '0cr' },
    { raw: '+0', expected: '0cr' },
    { raw: '  1500  ', expected: '1,500cr' },
    { raw: -1500, expected: '-1,500cr' },
  ];
  for (const { raw, expected, digits } of cases) {
    const stdout = renderActionLog(actionLogPage([claimEntry({ station_paid: raw, shortfall: raw })]));
    const cell = actionLogCell(stdout, 'shipping.claim_paid', 'Station paid');
    expect(cell, String(raw)).toBe(expected);
    expect(actionLogCell(stdout, 'shipping.claim_paid', 'Shortfall'), String(raw)).toBe(expected);
    if (digits) expect(cell?.replace(/\D/g, '')).toContain(digits);
    expect(cell).not.toContain('9007199254740992');
  }
});

test('does not format non-integer station_paid or shortfall as credits', () => {
  const badValues: unknown[] = [
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    true,
    false,
    '',
    '   ',
    'nope',
    '1e3',
    '0x10',
    '1.5',
    '15 00',
    '+',
    Number('9007199254740993'),
    null,
    undefined,
    { amount: 1 },
  ];
  for (const value of badValues) {
    const stdout = renderActionLog(actionLogPage([claimEntry({ station_paid: value, shortfall: value })]));
    const columns = actionLogHeaderColumns(stdout);
    expect(columns, String(value)).not.toContain('Station paid');
    expect(columns, String(value)).not.toContain('Shortfall');
    expect(actionLogCell(stdout, 'shipping.claim_paid', 'Event')).toBe('shipping.claim_paid');
    expect(stdout).not.toContain('1.5');
    expect(stdout).not.toContain('1,000cr');
    expect(stdout).not.toContain('9007199254740992');
  }

  const mixed = renderActionLog(
    actionLogPage([
      claimEntry({ station_paid: 1.5, shortfall: 6500 }, { id: 401, summary: 'Partial numbers.' }),
      claimEntry({ station_paid: 8000, shortfall: 'nope' }, { id: 402, summary: 'Whole station paid.' }),
    ]),
  );
  expect(actionLogHeaderColumns(mixed)).toContain('Station paid');
  expect(actionLogHeaderColumns(mixed)).toContain('Shortfall');
  expect(actionLogCell(mixed, 'Partial numbers.', 'Station paid')).toBe('');
  expect(actionLogCell(mixed, 'Partial numbers.', 'Shortfall')).toBe('6,500cr');
  expect(actionLogCell(mixed, 'Whole station paid.', 'Station paid')).toBe('8,000cr');
  expect(actionLogCell(mixed, 'Whole station paid.', 'Shortfall')).toBe('');
  expect(mixed).not.toContain('1.5');
  expect(mixed).not.toContain('nope');
});

test('renders ranch status as a dashboard with feed and production tables', () => {
  const rendered = renderStructuredResult(
    'facility_ranch_status',
    structuredClone(ranchStatusFixture),
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Wildlife Ranch ===');
  expect(stdout).toContain('Facility: Ember Grazer Corral (ranch-ember-1)');
  expect(stdout).toContain('Location: Cinder Outpost (cinder_outpost)');
  expect(stdout).toContain('Habitat: Cinder Iron Belt (cinder_iron_belt)');
  expect(stdout).toContain('Species: Ember Grazer (ember_grazer)');
  expect(stdout).toContain('Herd: 18 / 24');
  expect(stdout).toContain('Range health: 75% | Fed: 50% | Supplies: no');
  expect(stdout).toContain('Growth: 1.5/cycle | Cull target: disabled (0) | Cull cap: 4/cycle');
  expect(stdout).toContain('Domestication: inactive | Reserve: 0');
  expect(stdout).toContain('=== Feed ===');
  expect(stdout).toContain('iron_ore');
  expect(stdout).toContain('Cycles Left');
  expect(stdout).toContain('=== Production ===');
  expect(stdout).toContain('ember_grazer_meat');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toMatch(/NaN|undefined|\[object Object\]/);
});

test('renders explicit empty ranch feed and production states', () => {
  const fixture = structuredClone(ranchStatusFixture);
  fixture.feed = [];
  fixture.produces = [];

  const rendered = renderStructuredResult('facility_ranch_status', fixture, options, context);
  const stdout = rendered.stdout.join('\n');

  expect(stdout).toContain('No feed requirements.');
  expect(stdout).toContain('No expected ranch products.');
});

test('renders cull target zero as disabled while preserving zero herd', () => {
  const fixture = structuredClone(ranchSetCullFixture);
  fixture.details.herd = 0;

  const rendered = renderStructuredResult('facility_ranch_set_cull', fixture, options, context);
  const stdout = rendered.stdout.join('\n');

  expect(stdout).toContain('=== Ranch Cull Policy Updated ===');
  expect(stdout).toContain('Facility: ranch-ember-1');
  expect(stdout).toContain('Current herd: 0');
  expect(stdout).toContain('Cull target: disabled (0)');
  expect(stdout).toContain('Automatic culling disabled.');
  expect(stdout).not.toContain('=== Response ===');
});

test('declines malformed required ranch fields to the raw response fallback', () => {
  const fixture = structuredClone(ranchStatusFixture) as Record<string, unknown>;
  fixture.range_health = 2;

  const rendered = renderStructuredResult('facility_ranch_status', fixture, options, context);
  const stdout = rendered.stdout.join('\n');

  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('=== Wildlife Ranch ===');
});

test('declines malformed ranch cull fields to the raw response fallback', () => {
  const fixture = structuredClone(ranchSetCullFixture) as Record<string, unknown>;
  const details = fixture.details as Record<string, unknown>;
  details.herd = 'many';

  const rendered = renderStructuredResult('facility_ranch_set_cull', fixture, options, context);
  const stdout = rendered.stdout.join('\n');

  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('=== Ranch Cull Policy Updated ===');
});

test('renders faction-owned facility rent summary and delinquency fields', () => {
  const rendered = renderStructuredResult(
    'faction_facility_owned',
    structuredClone(factionFacilityOwnedFixture),
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');
  const rentIdx = stdout.indexOf('Faction rent bill:');
  const header = stdout
    .split('\n')
    .find((line) => line.includes('|') && line.includes('Name') && line.includes('Type'));

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Faction rent bill: 1,200cr/cycle');
  expect(stdout).toContain('Facilities: 1');
  expect(stdout).toContain('Faction arrears: 2,400cr');
  expect(stdout).toContain('Grace remaining: 1 cycle');
  expect(stdout).toContain('Estimated rent/day: 7,200cr');
  expect(stdout).toContain('Faction facilities pay rent from the treasury each cycle.');
  expect(stdout).toContain("Use action 'faction_list' while docked for full per-facility detail at that station.");
  expect(stdout).toContain('Missed');
  expect(stdout).toContain('Arrears');
  expect(stdout).toContain('2,400cr');
  expect(rentIdx).toBeGreaterThan(-1);
  expect(stdout.slice(rentIdx)).toContain('Facilities: 1');
  expect(header).toBeDefined();
  expect(header).not.toContain('Facilities: 1');
});

test('faction_facility_owned ignores legacy top-level rent fields', () => {
  const fixture = structuredClone(factionFacilityOwnedFixture) as Record<string, unknown>;
  delete fixture.faction_rent;
  fixture.total_rent_per_cycle = 1200;
  fixture.arrears_owed = 2400;
  fixture.grace_cycles = 1;
  fixture.note = 'Faction facilities pay rent from the treasury each cycle.';

  const stdout = renderStructuredResult('faction_facility_owned', fixture, options, context).stdout.join('\n');

  expect(stdout).not.toContain('Faction rent bill');
  expect(stdout).toContain("Use action 'faction_list' while docked for full per-facility detail at that station.");
});

test('renders station service pools after construction and before facility tables', () => {
  const rendered = renderStructuredResult('facility_list', structuredClone(facilityListFixture), options, context);
  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Service pools:');
  expect(stdout).toContain('Personnel: 12/20 remaining (+4/cycle, crew_rations)');
  expect(stdout).toContain('Medical: 3/10 remaining (+1/cycle)');
  expect(stdout).toContain('Marine training: 8/8 remaining (+2/cycle, marine_rations)');
  expect(stdout.indexOf('=== Construction ===')).toBeLessThan(stdout.indexOf('Service pools:'));
  expect(stdout.indexOf('Service pools:')).toBeLessThan(stdout.indexOf('=== Station Facilities ==='));
  expect(stdout).not.toContain('service_pool_capacity');
  const stationHeader = stdout
    .split('=== Player Facilities ===')[0]
    ?.split('\n')
    .find((line) => line.includes('Name') && line.includes('ID') && line.includes('Level'));
  expect(stationHeader).toBeDefined();
  expect(stationHeader).not.toContain('Service pool');
});

test('omits station service pools when the list response has none', () => {
  const simple = renderStructuredResult(
    'facility_list',
    structuredClone(facilityListSimpleFixture),
    options,
    context,
  ).stdout.join('\n');
  expect(simple).not.toContain('Service pools:');

  const detailed = structuredClone(facilityListFixture) as Record<string, unknown>;
  delete detailed.service_pools;
  const omitted = renderStructuredResult('facility_list', detailed, options, context).stdout.join('\n');
  expect(omitted).not.toContain('Service pools:');
});

test('prints remaining 0 and next-cycle supply need for station service pools', () => {
  const fixture = structuredClone(facilityListFixture) as Record<string, unknown>;
  fixture.service_pools = {
    personnel: { remaining: 0, capacity: 20, refill_per_cycle: 4, supply_item: 'crew_rations' },
    medical: { remaining: 3, capacity: 10, refill_per_cycle: 1, next_cycle_supply_required: 2 },
  };
  const stdout = renderStructuredResult('facility_list', fixture, options, context).stdout.join('\n');
  expect(stdout).toContain('Personnel: 0/20 remaining (+4/cycle, crew_rations)');
  expect(stdout).toContain('Medical: 3/10 remaining (+1/cycle) (need 2 next cycle)');
  expect(stdout).not.toContain('Marine training:');
});

test('facility_types detail prints identity and service pool without generic dump', () => {
  const stdout = renderStructuredResult(
    'facility_types',
    structuredClone(facilityTypesDetailFixture),
    options,
    context,
  ).stdout.join('\n');
  expect(stdout).toContain('=== Facility type: Crew Office ===');
  expect(stdout).toContain('ID: crew_office');
  expect(stdout).toContain('Category: service');
  expect(stdout).toContain('Level: 1');
  expect(stdout).toContain('Buildable: yes');
  expect(stdout).toContain('Build cost: 12000');
  expect(stdout).toContain('Build time: 40');
  expect(stdout).toContain('Labor: 80');
  expect(stdout).toContain('Rent/cycle: 200');
  expect(stdout).toContain('Description: Recruits fit crew from the station pool.');
  expect(stdout).toContain('Service pool: 20 cap, +4/cycle, 1x crew_rations');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('=== Categories ===');
});

test('facility_types omits Service pool when definition pool fields are absent', () => {
  const fixture = structuredClone(facilityTypesDetailFixture) as Record<string, unknown>;
  delete fixture.service_pool_capacity;
  delete fixture.service_pool_refill_per_cycle;
  delete fixture.service_pool_supply_item;
  delete fixture.service_pool_units_per_item;
  const stdout = renderStructuredResult('facility_types', fixture, options, context).stdout.join('\n');
  expect(stdout).toContain('=== Facility type: Crew Office ===');
  expect(stdout).not.toContain('Service pool:');
  expect(stdout).not.toContain('=== Response ===');
});

test('facility_types shapeFallback does not claim catalog-shaped type_id objects', () => {
  const stdout = renderStructuredResult(
    'inspect',
    { type_id: 'crew_office', name: 'Crew Office' },
    options,
    context,
  ).stdout.join('\n');
  expect(stdout).not.toContain('=== Facility type:');
  expect(stdout).not.toContain('Service pool:');
});

test('facility_types declines detail payloads with a non-types action', () => {
  const stdout = renderStructuredResult(
    'facility_types',
    { ...facilityTypesDetailFixture, action: 'list' },
    options,
    context,
  ).stdout.join('\n');
  expect(stdout).not.toContain('=== Facility type:');
  expect(stdout).not.toContain('Service pool: 20 cap');
});

test('renders facility list item req. stock and labor per cycle', () => {
  const rendered = renderStructuredResult('facility_list', structuredClone(facilityListFixture), options, context);
  const stdout = rendered.stdout.join('\n');
  const stationSection = stdout.split('=== Player Facilities ===')[0] ?? stdout;
  const stationTableHeader = stationSection
    .split('\n')
    .find((line) => line.includes('Name') && line.includes('ID') && line.includes('Level'));

  expect(rendered.success).toBe(true);
  expect(stationTableHeader).toBeDefined();
  expect(stationTableHeader).toContain('Req. stock');
  expect(stdout).toContain('Labor/cycle');
  expect(stdout).toContain('12 Fuel Cell');
  expect(stdout).toContain('320cr');
});

test('renders repair completion ticks in shared facility tables', () => {
  const facilityList = structuredClone(facilityListFixture) as Record<string, unknown>;
  const playerFacilities = facilityList.player_facilities as Array<Record<string, unknown>>;
  if (!playerFacilities[0]) throw new Error('Player facility fixture is incomplete.');
  playerFacilities[0].repair_complete_tick = 901500;

  const rendered = renderStructuredResult('facility_list', facilityList, options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Repair Tick');
  expect(stdout).toContain('901500');
});

test('omits repair completion ticks from shared facility tables when absent', () => {
  const rendered = renderStructuredResult('facility_list', structuredClone(facilityListFixture), options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).not.toContain('Repair Tick');
});

test('renders facility maintenance_fuel as fuel stock in Req. stock', () => {
  const facilityList = structuredClone(facilityListFixture) as Record<string, unknown>;
  const stationFacilities = facilityList.station_facilities as Array<Record<string, unknown>>;
  stationFacilities.push({
    facility_id: 'station-reactor',
    type: 'bunker_fed_reactor',
    name: 'Bunker-Fed Reactor',
    description: 'Station power from bunker fuel.',
    category: 'infrastructure',
    level: 2,
    maintenance_satisfied: true,
    maintenance_fuel: 55,
  });

  const rendered = renderStructuredResult('facility_list', facilityList, options, context);
  const stdout = rendered.stdout.join('\n');
  const stationSection = stdout.split('=== Player Facilities ===')[0] ?? stdout;
  const stationTableHeader = stationSection
    .split('\n')
    .find((line) => line.includes('Name') && line.includes('ID') && line.includes('Level'));

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Bunker-Fed Reactor');
  expect(stationTableHeader).toBeDefined();
  expect(stationTableHeader).toContain('Req. stock');
  expect(stdout).toContain('55 fuel stock');
  expect(stdout).not.toContain('fuel/cycle');
});

test('renders facility req. stock with fuel plus item maintenance together', () => {
  const facilityList = structuredClone(facilityListFixture) as Record<string, unknown>;
  const stationFacilities = facilityList.station_facilities as Array<Record<string, unknown>>;
  stationFacilities.push({
    facility_id: 'hybrid-plant',
    type: 'hybrid_plant',
    name: 'Hybrid Plant',
    category: 'infrastructure',
    level: 1,
    maintenance_fuel: 10,
    maintenance_per_cycle: [{ item_id: 'iron_ore', name: 'Iron', quantity: 2 }],
  });

  const rendered = renderStructuredResult('facility_list', facilityList, options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Hybrid Plant');
  expect(stdout).toContain('10 fuel stock, 2 Iron');
});

test('renders facility maintenance_inputs when maintenance_per_cycle is absent', () => {
  const facilityList = structuredClone(facilityListFixture) as Record<string, unknown>;
  facilityList.station_facilities = [
    {
      facility_id: 'catalog-shaped',
      type: 'ore_refinery',
      name: 'Catalog-Shaped Plant',
      category: 'production',
      level: 1,
      maintenance_inputs: [
        { item_id: 'steel_plate', name: 'Steel Plate', quantity: 3 },
        { item_id: 'durasteel_plate', quantity: 2 },
      ],
    },
  ];
  facilityList.player_facilities = [];
  facilityList.faction_facilities = [];
  facilityList.public_facilities = [];

  const rendered = renderStructuredResult('facility_list', facilityList, options, context);
  const stdout = rendered.stdout.join('\n');
  const stationSection = stdout.split('=== Public Facilities ===')[0] ?? stdout;
  const stationTableHeader = stationSection
    .split('\n')
    .find((line) => line.includes('Name') && line.includes('ID') && line.includes('Level'));

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Catalog-Shaped Plant');
  expect(stationTableHeader).toBeDefined();
  expect(stationTableHeader).toContain('Req. stock');
  expect(stdout).toContain('3 Steel Plate');
  expect(stdout).toContain('2 durasteel_plate');
});

test('omits facility table Req. stock column when no maintenance fields are present', () => {
  const facilityList = structuredClone(facilityListFixture) as Record<string, unknown>;
  facilityList.station_facilities = [
    {
      facility_id: 'bare-facility',
      type: 'fuel_bunker',
      name: 'Bare Bunker',
      category: 'service',
      level: 1,
    },
  ];
  facilityList.player_facilities = [];
  facilityList.faction_facilities = [];
  facilityList.public_facilities = [];

  const rendered = renderStructuredResult('facility_list', facilityList, options, context);
  const stdout = rendered.stdout.join('\n');
  const stationSection = stdout.split('=== Public Facilities ===')[0] ?? stdout;
  const stationTableHeader = stationSection
    .split('\n')
    .find((line) => line.includes('Name') && line.includes('ID') && line.includes('Level'));

  expect(rendered.success).toBe(true);
  expect(stationTableHeader).toBeDefined();
  expect(stationTableHeader).toContain('Name');
  expect(stationTableHeader).not.toContain('Req. stock');
  // Bare maintenance column header "Upkeep" must also be absent (not Tourism Upkeep).
  expect(stationTableHeader).not.toMatch(/(^|\|)\s*Upkeep\s*(\||$)/);
  // Life support may still print "Upkeep every N ticks" outside facility tables.
  expect(stdout).toContain('Life Support');
});

test('renders facility dining and leisure scores when present', () => {
  const rendered = renderStructuredResult('facility_list', structuredClone(facilityListFixture), options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Dining');
  expect(stdout).toContain('Tourism Upkeep');
  expect(stdout).toContain('Dockside Diner');
  expect(stdout).toContain('2');
});

test('facilityBillingPaused is an allowlist, not status != active', () => {
  expect(facilityBillingPaused({ status: 'repairing' })).toBe(true);
  expect(facilityBillingPaused({ status: 'damaged' })).toBe(true);
  expect(facilityBillingPaused({ status: 'under_construction' })).toBe(true);
  expect(facilityBillingPaused({ status: 'dismantling' })).toBe(true);
  expect(facilityBillingPaused({ damaged: true })).toBe(true);
  expect(facilityBillingPaused({ under_construction: true })).toBe(true);
  expect(facilityBillingPaused({ dismantling: true })).toBe(true);
  expect(facilityBillingPaused({ status: 'enabled' })).toBe(false);
  expect(facilityBillingPaused({ status: 'disabled' })).toBe(false);
  expect(facilityBillingPaused({ status: 'active' })).toBe(false);
  expect(facilityBillingPaused({})).toBe(false);
  expect(withPausedRentSuffix('1200', { status: 'enabled' })).toBe('1200');
  expect(withPausedRentSuffix('1,200cr', { status: 'damaged' })).toBe('1,200cr (paused)');
});

test('grouped facility_list restyles Damaged to yes/no on the player-refinery row', () => {
  const stdout = renderStructuredResult(
    'facility_list',
    structuredClone(facilityListFixture),
    options,
    context,
  ).stdout.join('\n');
  const player = sectionAfter(stdout, 'Player Facilities', 'Faction Facilities');
  const station = sectionAfter(stdout, 'Station Facilities', 'Player Facilities');
  const faction = sectionAfter(stdout, 'Faction Facilities');

  expect(player).toContain('Damaged');
  expect(tableCell(player, 'player-refinery', 'Damaged')).toBe('yes');
  const stationHeader = station.split('\n').find((line) => line.includes('Name') && line.includes('ID'));
  const factionHeader = faction.split('\n').find((line) => line.includes('Name') && line.includes('ID'));
  expect(stationHeader).toBeDefined();
  expect(factionHeader).toBeDefined();
  expect(stationHeader).not.toContain('Damaged');
  expect(factionHeader).not.toContain('Damaged');
  expect(stdout).not.toContain('Dismantling');
});

test('simple facility_list omits Damaged and Dismantling columns', () => {
  const stdout = renderStructuredResult(
    'facility_list',
    structuredClone(facilityListSimpleFixture),
    options,
    context,
  ).stdout.join('\n');
  expect(stdout).not.toMatch(/\|\s*Damaged\s*\|/);
  expect(stdout).not.toContain('Dismantling');
});

test('grouped facility_list grows a Dismantling yes column when the flag is present', () => {
  const fixture = structuredClone(facilityListFixture) as Record<string, unknown>;
  const playerFacilities = fixture.player_facilities as Array<Record<string, unknown>>;
  if (!playerFacilities[0]) throw new Error('Player facility fixture is incomplete.');
  playerFacilities[0].dismantling = true;
  const stdout = renderStructuredResult('facility_list', fixture, options, context).stdout.join('\n');
  const player = sectionAfter(stdout, 'Player Facilities', 'Faction Facilities');
  expect(player).toContain('Dismantling');
  expect(tableCell(player, 'player-refinery', 'Dismantling')).toBe('yes');
});

test('grouped facility_list suffixes paused rent without switching to 1,200cr', () => {
  const fixture = structuredClone(facilityListFixture) as Record<string, unknown>;
  const playerFacilities = fixture.player_facilities as Array<Record<string, unknown>>;
  if (!playerFacilities[0]) throw new Error('Player facility fixture is incomplete.');
  playerFacilities[0].rent_per_cycle = 1200;
  const stdout = renderStructuredResult('facility_list', fixture, options, context).stdout.join('\n');
  const player = sectionAfter(stdout, 'Player Facilities', 'Faction Facilities');
  const faction = sectionAfter(stdout, 'Faction Facilities');
  expect(tableCell(player, 'player-refinery', 'Damaged')).toBe('yes');
  expect(tableCell(player, 'player-refinery', 'Rent/cycle')).toBe('1200 (paused)');
  expect(tableCell(faction, 'faction-smelter', 'Rent/cycle')).toBe('1200');
  expect(stdout).not.toContain('1,200cr (paused)');
});

test('renders facility list faction rent summary', () => {
  const facilityList = structuredClone(facilityListFixture) as Record<string, unknown>;
  facilityList.faction_rent = {
    facilities: 2,
    total_rent_per_cycle: 1200,
    arrears_owed: 2400,
    grace_cycles: 1,
    est_rent_per_day: 7200,
    note: 'Faction facilities pay rent from the treasury each cycle.',
  };

  const rendered = renderStructuredResult('facility_list', facilityList, options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Faction rent bill: 1,200cr/cycle');
  expect(stdout).toContain('Facilities: 2');
  expect(stdout).toContain('Faction arrears: 2,400cr');
  expect(stdout).toContain('Grace remaining: 1 cycle');
  expect(stdout).toContain('Estimated rent/day: 7,200cr');
  expect(stdout).toContain('Faction facilities pay rent from the treasury each cycle.');
});

const factionInfoRentSummary = {
  facilities: 1,
  total_rent_per_cycle: 1200,
  arrears_owed: 2400,
  grace_cycles: 1,
  est_rent_per_day: 7200,
  note: 'Faction facilities pay rent from the treasury each cycle.',
};

function factionInfoWithRent(): Record<string, unknown> {
  const fixture = structuredClone(factionInfoFixture) as Record<string, unknown>;
  fixture.faction_rent = structuredClone(factionInfoRentSummary);
  return fixture;
}

function renderFactionInfo(fixture: Record<string, unknown>, format?: GlobalOptions['format']): string {
  return renderStructuredResult(
    'faction_info',
    fixture,
    format ? { ...options, format } : options,
    context,
  ).stdout.join('\n');
}

test('faction_info prints faction_rent after the facilities table', () => {
  const stdout = renderFactionInfo(factionInfoWithRent());
  const tableTitle = stdout.indexOf('=== Faction Facilities ===');
  const lines = [
    'Faction rent bill: 1,200cr/cycle',
    'Facilities: 1',
    'Faction arrears: 2,400cr',
    'Grace remaining: 1 cycle',
    'Estimated rent/day: 7,200cr',
    'Faction facilities pay rent from the treasury each cycle.',
  ];
  let cursor = tableTitle;
  for (const line of lines) {
    const index = stdout.indexOf(line, cursor);
    expect(index).toBeGreaterThan(cursor);
    cursor = index + line.length;
  }

  expect(stdout.indexOf('Faction rent bill:')).toBeGreaterThan(tableTitle);
  expect(stdout).toContain('  Facilities: no');
  expect(stdout).toContain('=== Faction:');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('103,200cr');
  expect(stdout).not.toContain('Personal rent bill');
});

test('faction_info omits the rent summary when faction_rent is absent', () => {
  const fixture = structuredClone(factionInfoFixture) as Record<string, unknown>;
  delete fixture.faction_rent;
  const stdout = renderFactionInfo(fixture);

  expect(stdout).not.toContain('Faction rent bill');
  expect(stdout).not.toContain('Faction arrears');
  expect(stdout).not.toContain('Grace remaining');
  expect(stdout).not.toContain('Estimated rent/day');
  expect(stdout).not.toMatch(/^Facilities: /m);
  expect(stdout).toContain('=== Faction:');
  expect(stdout).not.toContain('=== Response ===');
});

test('faction_info prints nothing for null or non-record faction_rent', () => {
  for (const factionRent of [null, '1200']) {
    const fixture = structuredClone(factionInfoFixture) as Record<string, unknown>;
    fixture.faction_rent = factionRent;
    const stdout = renderFactionInfo(fixture);

    expect(stdout).not.toContain('Faction rent bill');
    expect(stdout).not.toContain('Faction arrears');
    expect(stdout).not.toContain('Grace remaining');
    expect(stdout).not.toContain('Estimated rent/day');
    expect(stdout).not.toMatch(/^Facilities: /m);
    expect(stdout).not.toContain('1200');
    expect(stdout).toContain('=== Faction:');
    expect(stdout).not.toContain('=== Response ===');
  }
});

test('faction_info prints explicit zero arrears and skips omitted grace and empty notes', () => {
  const fixture = factionInfoWithRent();
  const rent = fixture.faction_rent as Record<string, unknown>;
  rent.arrears_owed = 0;
  let stdout = renderFactionInfo(fixture);
  expect(stdout).toContain('Faction arrears: 0cr');

  delete rent.arrears_owed;
  stdout = renderFactionInfo(fixture);
  expect(stdout).not.toContain('Faction arrears');

  rent.grace_cycles = 0;
  stdout = renderFactionInfo(fixture);
  expect(stdout).toContain('Grace remaining: 0 cycles');

  delete rent.grace_cycles;
  stdout = renderFactionInfo(fixture);
  expect(stdout).not.toContain('Grace remaining');

  rent.note = '';
  stdout = renderFactionInfo(fixture);
  expect(stdout).not.toContain('Faction facilities pay rent from the treasury each cycle.');
  expect(stdout).toContain('Faction rent bill: 1,200cr/cycle');
  expect(stdout).not.toContain('=== Response ===');
});

test('faction_info pluralizes grace cycles', () => {
  const singular = factionInfoWithRent();
  (singular.faction_rent as Record<string, unknown>).grace_cycles = 1;
  expect(renderFactionInfo(singular)).toContain('Grace remaining: 1 cycle');

  const plural = factionInfoWithRent();
  (plural.faction_rent as Record<string, unknown>).grace_cycles = 2;
  const stdout = renderFactionInfo(plural);
  expect(stdout).toContain('Grace remaining: 2 cycles');
  expect(stdout).not.toContain('Grace remaining: 2 cycle\n');
});

test('faction_info prints faction_rent when the facilities array is absent', () => {
  const fixture = factionInfoWithRent();
  delete fixture.facilities;
  const stdout = renderFactionInfo(fixture);

  expect(stdout).toContain('=== Faction:');
  expect(stdout).toContain('Faction rent bill: 1,200cr/cycle');
  expect(stdout).toContain('Facilities: 1');
  expect(stdout).toContain('Faction arrears: 2,400cr');
  expect(stdout).toContain('Grace remaining: 1 cycle');
  expect(stdout).toContain('Estimated rent/day: 7,200cr');
  expect(stdout).toContain('Faction facilities pay rent from the treasury each cycle.');
  expect(stdout).not.toContain('=== Faction Facilities ===');
  expect(stdout).not.toContain('=== Response ===');
});

test('faction_info does not invent a personal rent bill from rent or player_rent', () => {
  const fixture = factionInfoWithRent();
  fixture.rent = {
    facilities: 1,
    total_rent_per_cycle: 400,
    arrears_owed: 100,
    est_rent_per_day: 2400,
    note: 'Personal facilities pay rent from your wallet each cycle.',
  };
  fixture.player_rent = {
    facilities: 1,
    total_rent_per_cycle: 400,
    arrears_owed: 100,
    est_rent_per_day: 2400,
    note: 'Personal facilities pay rent from your wallet each cycle.',
  };
  const stdout = renderFactionInfo(fixture);

  expect(stdout).toContain('=== Faction:');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('Personal rent bill');
  expect(stdout).toContain('Faction rent bill:');
});

test('faction_info json passes faction_rent through without the table summary', () => {
  const stdout = renderFactionInfo(factionInfoWithRent(), 'json');
  const parsed = JSON.parse(stdout) as { faction_rent: Record<string, number> };

  expect(stdout).toContain('"faction_rent"');
  expect(parsed.faction_rent.facilities).toBe(1);
  expect(parsed.faction_rent.total_rent_per_cycle).toBe(1200);
  expect(parsed.faction_rent.arrears_owed).toBe(2400);
  expect(parsed.faction_rent.grace_cycles).toBe(1);
  expect(parsed.faction_rent.est_rent_per_day).toBe(7200);
  expect(stdout).not.toContain('Faction rent bill');
});

const factionInfoMobileBase = {
  name: 'Civitas',
  base_id: 'mobile_civitas_example',
  archetype_id: 'civitas',
  poi_id: 'mobile_civitas_example_poi',
  lifecycle: 'stationary',
  wrecked: false,
  current_system_id: 'sol',
  current_position: { x: 2.5, y: 3.25 },
  origin: { system_id: '', position: { x: 0, y: 0 } },
  destination: { system_id: '', position: { x: 0, y: 0 } },
  state_started_tick: 0,
  state_complete_tick: 0,
};

const factionInfoMobileBaseLines = [
  'Mobile base: Civitas (mobile_civitas_example)',
  '  Archetype: civitas',
  '  POI: mobile_civitas_example_poi',
  '  Lifecycle: stationary',
  '  Wrecked: no',
  '  System: sol',
  '  Position: (2.5, 3.25)',
  '  Origin: (empty) (0, 0)',
  '  Destination: (empty) (0, 0)',
  '  Started tick: 0',
  '  Complete tick: 0',
];

function factionInfoWithMobileBase(): Record<string, unknown> {
  const fixture = factionInfoWithRent();
  fixture.mobile_base = structuredClone(factionInfoMobileBase);
  return fixture;
}

function renderCommand(command: string, fixture: Record<string, unknown>, format?: GlobalOptions['format']): string {
  return renderStructuredResult(command, fixture, format ? { ...options, format } : options, context).stdout.join('\n');
}

test('faction_info prints the mobile base snapshot after the rent lines', () => {
  const stdout = renderFactionInfo(factionInfoWithMobileBase());
  const rentNote = stdout.indexOf('Faction facilities pay rent from the treasury each cycle.');
  let cursor = rentNote;
  for (const line of factionInfoMobileBaseLines) {
    const index = stdout.indexOf(line, cursor);
    expect(index).toBeGreaterThan(cursor);
    cursor = index + line.length;
  }
  expect(stdout).not.toContain('Escrow');
  expect(stdout).not.toContain('=== Faction Mobile Base');
  expect(stdout).not.toContain('=== Response ===');
});

test('faction_info omits mobile base lines when those keys are absent', () => {
  const stdout = renderFactionInfo(structuredClone(factionInfoFixture) as Record<string, unknown>);
  expect(stdout).not.toContain('Mobile base');
  expect(stdout).not.toContain('Archetype:');
  expect(stdout).not.toContain('Wrecked:');
  expect(stdout).not.toContain('Started tick:');
  expect(stdout).not.toContain('Origin:');
  expect(stdout).toContain('=== Faction:');
});

test('faction_info prints nothing for null or non-record mobile base values', () => {
  for (const mobileBase of [null, 'civitas', [factionInfoMobileBase]]) {
    const fixture = factionInfoWithRent();
    fixture.mobile_base = mobileBase;
    fixture.mobile_base_commission = mobileBase;
    const stdout = renderFactionInfo(fixture);
    expect(stdout).not.toContain('Mobile base');
    expect(stdout).not.toContain('Archetype:');
    expect(stdout).toContain('=== Faction:');
    expect(stdout).not.toContain('=== Response ===');
  }
});

test('faction_info prints explicit zero ticks and empty endpoints, and drops only a deleted tick', () => {
  const fixture = factionInfoWithMobileBase();
  const base = fixture.mobile_base as Record<string, unknown>;
  let stdout = renderFactionInfo(fixture);
  expect(stdout).toContain('  Started tick: 0');
  expect(stdout).toContain('  Complete tick: 0');
  expect(stdout).toContain('  Origin: (empty) (0, 0)');
  expect(stdout).toContain('  Destination: (empty) (0, 0)');

  delete base.state_complete_tick;
  stdout = renderFactionInfo(fixture);
  expect(stdout).toContain('  Started tick: 0');
  expect(stdout).not.toContain('Complete tick:');
});

test('faction_info prints an empty system without copying the origin system', () => {
  const fixture = factionInfoWithMobileBase();
  const base = fixture.mobile_base as Record<string, unknown>;
  base.current_system_id = '';
  base.lifecycle = 'jumping';
  base.origin = { system_id: 'sol', position: { x: 1, y: 2 } };
  const stdout = renderFactionInfo(fixture);
  expect(stdout).toContain('  System: (empty)');
  expect(stdout).toContain('  Origin: sol (1, 2)');
  expect(stdout).not.toContain('System: sol');
});

test('faction_info prints a commission without a mobile base snapshot', () => {
  const fixture = factionInfoWithRent();
  fixture.mobile_base_commission = { commission_id: 'comm-1', archetype_id: 'civitas' };
  const stdout = renderFactionInfo(fixture);
  expect(stdout).toContain('Mobile base commission: comm-1');
  expect(stdout).toContain('  Archetype: civitas');
  expect(stdout).not.toContain('Mobile base:');
  expect(stdout).not.toContain('Wrecked:');
  expect(stdout).not.toContain('Escrow');
});

test('faction_info prints the mobile base snapshot before the commission', () => {
  const fixture = factionInfoWithMobileBase();
  fixture.mobile_base_commission = { commission_id: 'comm-1', archetype_id: 'civitas' };
  const stdout = renderFactionInfo(fixture);
  const baseIndex = stdout.indexOf('Mobile base: Civitas');
  const commissionIndex = stdout.indexOf('Mobile base commission: comm-1');
  expect(baseIndex).toBeGreaterThan(-1);
  expect(commissionIndex).toBeGreaterThan(baseIndex);
});

test('faction_info prints partial mobile base headers and skips absent endpoint or tick keys', () => {
  const nameOnly = factionInfoWithRent();
  nameOnly.mobile_base = { name: 'Civitas' };
  const nameLines = renderFactionInfo(nameOnly).split('\n');
  expect(nameLines).toContain('Mobile base: Civitas');
  expect(nameLines.some((line) => line.startsWith('Mobile base: Civitas ('))).toBe(false);

  const idOnly = factionInfoWithRent();
  idOnly.mobile_base = { base_id: 'mobile_civitas_example' };
  expect(renderFactionInfo(idOnly)).toContain('Mobile base: (mobile_civitas_example)');

  const empty = factionInfoWithRent();
  empty.mobile_base = {};
  expect(renderFactionInfo(empty).split('\n')).toContain('Mobile base:');

  const endpoint = factionInfoWithRent();
  endpoint.mobile_base = {
    origin: { position: { x: 0, y: 0 } },
    destination: { position: { x: 0 } },
  };
  const stdout = renderFactionInfo(endpoint);
  expect(stdout).toContain('  Origin: (0, 0)');
  expect(stdout).not.toContain('Destination:');
  expect(stdout).not.toContain('Started tick:');
  expect(stdout).not.toContain('System:');
});

test('faction_info does not print escrow from a mobile base record', () => {
  const fixture = factionInfoWithMobileBase();
  const base = fixture.mobile_base as Record<string, unknown>;
  base.refundable_item_escrow = [{ item_id: 'dark_matter_cell', quantity: 25 }];
  const stdout = renderFactionInfo(fixture);
  expect(stdout).toContain('Mobile base: Civitas');
  expect(stdout).not.toContain('Escrow');
  expect(stdout).not.toContain('dark_matter_cell');
});

test('faction_info json passes mobile base objects through without table labels', () => {
  const fixture = factionInfoWithMobileBase();
  fixture.mobile_base_commission = { commission_id: '', archetype_id: '' };
  const stdout = renderFactionInfo(fixture, 'json');
  const parsed = JSON.parse(stdout) as {
    mobile_base: { current_system_id: string; state_started_tick: number };
    mobile_base_commission: { commission_id: string };
  };
  expect(parsed.mobile_base.current_system_id).toBe('sol');
  expect(parsed.mobile_base.state_started_tick).toBe(0);
  expect(parsed.mobile_base_commission.commission_id).toBe('');
  expect(stdout).not.toContain('Mobile base:');
  expect(stdout).not.toContain('Mobile base commission:');
});

test('faction_info prints empty commission strings', () => {
  const fixture = factionInfoWithRent();
  fixture.mobile_base_commission = { commission_id: '', archetype_id: '' };
  const stdout = renderFactionInfo(fixture);
  expect(stdout).toContain('Mobile base commission: (empty)');
  expect(stdout).toContain('  Archetype: (empty)');
});

test('faction get_mobile_base prints stationary, preparing, and isolated snapshots', () => {
  const stationary = renderCommand('faction_get_mobile_base', factionGetMobileBaseFixture);
  expect(stationary).toContain('=== Faction Mobile Base: Civitas ===');
  expect(stationary).toContain('Base ID: mobile_civitas_example');
  expect(stationary).toContain('POI: mobile_civitas_example_poi');
  expect(stationary).toContain('Wrecked: no');
  expect(stationary).toContain('System: sol');
  expect(stationary).toContain('Position: (2.5, 3.25)');
  expect(stationary).toContain('Archetype: civitas');
  expect(stationary).toContain('Lifecycle: stationary');
  expect(stationary).toContain('Origin: (empty) (0, 0)');
  expect(stationary).toContain('Destination: (empty) (0, 0)');
  expect(stationary).not.toContain('Started tick:');
  expect(stationary).not.toContain('Complete tick:');
  expect(stationary).not.toContain('Escrow');
  expect(stationary).not.toContain('Commission:');
  expect(stationary).not.toContain('=== Response ===');

  const preparingBody = structuredClone(factionGetMobileBasePreparingFixture);
  const escrow = (preparingBody.mobile_base as { refundable_item_escrow: unknown[] }).refundable_item_escrow;
  escrow.push({ item_id: 'spare_cell', quantity: 0 });
  escrow.push({ item_id: '', quantity: 1 });
  escrow.push({ item_id: 'bad', quantity: 1.5 });
  escrow.push(null);
  const preparing = renderCommand('faction_get_mobile_base', preparingBody);
  expect(preparing).toContain('Lifecycle: jump_preparing');
  expect(preparing).toContain('Commission: comm-9');
  expect(preparing).toContain('Origin: sol (1, 2)');
  expect(preparing).toContain('Destination: neighbor (0, 0)');
  expect(preparing).toContain('Started tick: 1000');
  expect(preparing).toContain('Complete tick: 1090');
  expect(preparing).toContain('Escrow:\n  25x dark_matter_cell\n  0x spare_cell');
  expect(preparing).not.toContain('bad');
  expect(preparing).not.toContain('1.5');

  const isolated = renderCommand('faction_get_mobile_base', factionGetMobileBaseIsolatedFixture);
  expect(isolated).toContain('Lifecycle: jumping');
  expect(isolated).toContain('Position: (1, 2)');
  expect(isolated).toContain('Origin: sol (1, 2)');
  expect(isolated).not.toContain('System:');
  expect(isolated).not.toContain('Escrow');
  expect(isolated).not.toContain('Started tick: 0');
  expect(isolated).toContain('Started tick: 1090');
  expect(isolated).toContain('Complete tick: 1630');
});

test('faction get_mobile_base prints Escrow none only when the escrow key is present', () => {
  const empty = structuredClone(factionGetMobileBaseFixture);
  (empty.mobile_base as Record<string, unknown>).refundable_item_escrow = [];
  expect(renderCommand('faction_get_mobile_base', empty)).toContain('Escrow: none');

  const invalid = structuredClone(factionGetMobileBaseFixture);
  (invalid.mobile_base as Record<string, unknown>).refundable_item_escrow = [{ item_id: ' ', quantity: '25' }, 4];
  const invalidStdout = renderCommand('faction_get_mobile_base', invalid);
  expect(invalidStdout).toContain('Escrow: none');
  expect(invalidStdout).not.toContain('25x');

  const omitted = renderCommand('faction_get_mobile_base', factionGetMobileBaseFixture);
  expect(omitted).not.toContain('Escrow');
});

test('faction get_mobile_base prints an empty system and zero ticks when those keys are present', () => {
  const fixture = structuredClone(factionGetMobileBaseFixture);
  fixture.system_id = '';
  const state = fixture.mobile_base as Record<string, unknown>;
  state.commission_id = '';
  state.state_started_tick = 0;
  state.state_complete_tick = 0;
  const stdout = renderCommand('faction_get_mobile_base', fixture);
  expect(stdout).toContain('System: (empty)');
  expect(stdout).toContain('Commission: (empty)');
  expect(stdout).toContain('Started tick: 0');
  expect(stdout).toContain('Complete tick: 0');
  expect(stdout).not.toContain('System: sol');
});

test('faction jump_mobile_base does not print an alias-copied pilot system', () => {
  const stdout = renderCommand('faction_jump_mobile_base', factionJumpMobileBaseFixture);
  expect(stdout).toContain('=== Faction Mobile Base: Civitas ===');
  expect(stdout).toContain('Origin: sol (1, 2)');
  expect(stdout).toContain('Lifecycle: jumping');
  expect(stdout).not.toContain('pilot_system');
  expect(stdout).not.toContain('pilot_poi');
  expect(stdout).not.toContain('System:');
  expect(stdout).not.toContain('still accessible');
  expect(stdout).not.toContain('Escrow');
  expect(stdout).not.toContain('=== Response ===');
});

test('faction decommission_mobile_base prints yes, no, and an empty message', () => {
  const yes = renderCommand('faction_decommission_mobile_base', factionDecommissionMobileBaseFixture);
  expect(yes).toContain('=== Mobile Base Decommissioned ===');
  expect(yes).toContain('Decommissioned: yes');
  expect(yes).toContain('The base is gone.');
  expect(yes).not.toContain('OK:');
  expect(yes).not.toContain('Base ID:');

  const no = renderCommand('faction_decommission_mobile_base', {
    details: { decommissioned: false, message: 'Still there.' },
  });
  expect(no).toContain('Decommissioned: no');
  expect(no).toContain('Still there.');
  expect(no).not.toContain('OK:');

  const blank = renderCommand('faction_decommission_mobile_base', {
    details: { decommissioned: false, message: '' },
  });
  const lines = blank.split('\n');
  const index = lines.findIndex((line) => line.includes('Decommissioned: no'));
  expect(index).toBeGreaterThan(-1);
  expect(lines[index + 1]).toBe('');
});

test('public get_mobile_base does not use the faction mobile base title', () => {
  const stdout = renderCommand('get_mobile_base', factionGetMobileBaseFixture);
  expect(stdout).not.toContain('=== Faction Mobile Base');
  expect(stdout).not.toContain('Mobile base location');
});

test('facility_list prints personal and faction rent bills from separate sources', () => {
  const both = structuredClone(facilityListFixture) as Record<string, unknown>;
  both.player_rent = {
    facilities: 1,
    total_rent_per_cycle: 400,
    arrears_owed: 100,
    grace_cycles: 2,
    est_rent_per_day: 2400,
    note: 'Personal facilities pay rent from your wallet each cycle.',
  };
  const bothStdout = renderStructuredResult('facility_list', both, options, context).stdout.join('\n');
  const personalIdx = bothStdout.indexOf('Personal rent bill:');
  const factionIdx = bothStdout.indexOf('Faction rent bill:');
  const factionArrearsIdx = bothStdout.indexOf('Faction arrears:');
  expect(personalIdx).toBeGreaterThan(-1);
  expect(factionIdx).toBeGreaterThan(personalIdx);
  expect(factionArrearsIdx).toBeGreaterThan(factionIdx);
  expect(bothStdout.slice(personalIdx, factionIdx)).toContain('Arrears: 100cr');
  expect(bothStdout.slice(personalIdx, factionIdx)).toContain('Facilities:');
  expect(bothStdout.slice(personalIdx, factionIdx)).not.toContain('Faction arrears');
  expect(bothStdout.slice(factionIdx)).toContain('Facilities:');
  expect(bothStdout).toContain('Personal rent bill: 400cr/cycle');
  expect(bothStdout).toContain('Faction rent bill: 1,200cr/cycle');

  const personalOnly = structuredClone(facilityListFixture) as Record<string, unknown>;
  delete personalOnly.faction_rent;
  personalOnly.player_rent = {
    facilities: 1,
    total_rent_per_cycle: 400,
    arrears_owed: 100,
    note: 'Personal facilities pay rent from your wallet each cycle.',
  };
  const personalStdout = renderStructuredResult('facility_list', personalOnly, options, context).stdout.join('\n');
  expect(personalStdout).toContain('Personal rent bill: 400cr/cycle');
  expect(personalStdout).toContain('Arrears: 100cr');
  expect(personalStdout).not.toContain('Faction rent bill');
  expect(personalStdout).not.toContain('Faction arrears');
});

test('facility_owned prints a personal rent bill', () => {
  const stdout = renderStructuredResult(
    'facility_owned',
    structuredClone(facilityOwnedFixture),
    options,
    context,
  ).stdout.join('\n');
  expect(stdout).toContain('Ore Refinery');
  expect(stdout).toContain('Personal rent bill: 120cr/cycle');
  expect(stdout).toContain('Facilities: 1');
  expect(stdout).toContain('Estimated rent/day: 720cr');
  expect(stdout).not.toContain('Faction rent bill');
  expect(stdout).not.toContain('Faction arrears');
});

test('facility_owned prints optional hint after the personal rent bill', () => {
  const fixture = structuredClone(facilityOwnedFixture) as Record<string, unknown>;
  fixture.hint = 'Dock at a station to manage these facilities.';
  const stdout = renderStructuredResult('facility_owned', fixture, options, context).stdout.join('\n');
  expect(stdout).toContain('Personal rent bill: 120cr/cycle');
  expect(stdout).toContain('Dock at a station to manage these facilities.');
});

test('renders facility metadata when all required facility groups are empty', () => {
  const facilityList = structuredClone(facilityListFixture) as Record<string, unknown>;
  facilityList.station_facilities = [];
  facilityList.player_facilities = [];
  facilityList.faction_facilities = [];
  facilityList.public_facilities = [];

  const rendered = renderStructuredResult('facility_list', facilityList, options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Power: 95/120 draw (85% efficiency)');
  expect(stdout).toContain('=== Construction ===');
  expect(stdout).toContain('Faction rent bill: 1,200cr/cycle');
  expect(stdout).not.toContain('=== Station Facilities ===');
  expect(stdout).not.toContain('=== Public Facilities ===');
  expect(stdout).not.toContain('=== Player Facilities ===');
  expect(stdout).not.toContain('=== Faction Facilities ===');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders facility custom names alongside type names across facility views', () => {
  const facilityList = structuredClone(facilityListFixture) as Record<string, unknown>;
  const playerFacilities = facilityList.player_facilities as Array<Record<string, unknown>>;
  const factionFacilities = facilityList.faction_facilities as Array<Record<string, unknown>>;
  if (!playerFacilities[0] || !factionFacilities[0]) throw new Error('Facility fixture is incomplete.');
  playerFacilities[0].custom_name = 'Frontier Smelter';
  playerFacilities[0].output_price = 0.5;
  factionFacilities[0].custom_name = 'Alloy One';

  const listRendered = renderStructuredResult('facility_list', facilityList, options, context);
  const ownedRendered = renderStructuredResult(
    'facility_owned',
    {
      facilities: [
        {
          facility_id: 'player-refinery',
          type: 'ore_refinery',
          name: 'Ore Refinery',
          custom_name: 'Frontier Smelter',
          level: 2,
        },
      ],
    },
    options,
    context,
  );
  const factionOwned = structuredClone(factionFacilityOwnedFixture) as Record<string, unknown>;
  const factionOwnedFacilities = factionOwned.facilities as Array<Record<string, unknown>>;
  if (!factionOwnedFacilities[0]) throw new Error('Faction facility fixture is incomplete.');
  factionOwnedFacilities[0].name = 'Shipyard Berth';
  factionOwnedFacilities[0].custom_name = 'Capital Yard';
  const factionOwnedRendered = renderStructuredResult('faction_facility_owned', factionOwned, options, context);

  expect(listRendered.success).toBe(true);
  expect(listRendered.stdout.join('\n')).toContain('Frontier Smelter (Ore Refinery)');
  expect(listRendered.stdout.join('\n')).toContain('Alloy One (Alloy Smelter)');
  expect(listRendered.stdout.join('\n')).toContain('Rent/run');
  expect(listRendered.stdout.join('\n')).toContain('0.5');
  expect(ownedRendered.success).toBe(true);
  expect(ownedRendered.stdout.join('\n')).toContain('Frontier Smelter (Ore Refinery)');
  expect(factionOwnedRendered.success).toBe(true);
  expect(factionOwnedRendered.stdout.join('\n')).toContain('Capital Yard (Shipyard Berth)');
});

test('owned facility tables separate display names from build type keys', () => {
  const owned = renderStructuredResult(
    'facility_owned',
    {
      action: 'owned',
      facilities: [
        {
          facility_id: 'facility-1',
          type: 'ore_refinery',
          name: 'Ore Refinery',
          custom_name: 'Frontier Smelter',
          base_id: 'earth_station',
          base_name: 'Earth Station',
          rent_per_cycle: 10,
        },
      ],
      rent: { facilities: 1, total_rent_per_cycle: 10, est_rent_per_day: 60 },
    },
    options,
    context,
  );
  const faction = renderStructuredResult(
    'faction_facility_owned',
    structuredClone(factionFacilityOwnedFixture),
    options,
    context,
  );

  expect(owned.stdout.join('\n')).toMatch(/Name\s+\|\s+Type\s+\|\s+ID/);
  expect(owned.stdout.join('\n')).toContain('Frontier Smelter (Ore Refinery)');
  expect(owned.stdout.join('\n')).toContain('ore_refinery');
  expect(owned.stdout.join('\n')).toContain('Personal rent bill: 10cr/cycle');
  expect(owned.stdout.join('\n')).not.toContain('Faction rent bill');
  expect(owned.stdout.join('\n')).not.toContain('Faction arrears');
  expect(faction.stdout.join('\n')).toMatch(/Name\s+\|\s+Type\s+\|\s+ID\s+\|\s+Station/);
  expect(faction.stdout.join('\n')).toContain('faction_shipyard_berth');
});

test('owned facility tables omit malformed build type keys', () => {
  const rendered = renderStructuredResult(
    'facility_owned',
    {
      action: 'owned',
      facilities: [
        {
          facility_id: 'facility-1',
          type: {},
        },
      ],
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  expect(rendered.stdout.join('\n')).not.toContain('[object Object]');
});

test('facility list prefers numeric maintenance level and falls back to boolean state', () => {
  const fixture = structuredClone(facilityListFixture) as Record<string, unknown>;
  const station = fixture.station_facilities as Array<Record<string, unknown>>;
  if (!station[0] || !station[1]) throw new Error('Facility fixture is incomplete.');
  station[0].maintenance_level = 0.6;
  station[1].maintenance_level = 'invalid';

  const rendered = renderStructuredResult('facility_list', fixture, options, context);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('60%');
  expect(stdout).toContain('false');
  expect(stdout).not.toContain('NaN');
});

test('facility maintenance level formats finite percentages without leaking malformed values', () => {
  const rendered = renderStructuredResult(
    'facility_list',
    {
      action: 'list',
      base_id: 'earth_station',
      station_facilities: [
        { facility_id: 'zero', name: 'Zero', maintenance_level: 0, maintenance_satisfied: true },
        { facility_id: 'full', name: 'Full', maintenance_level: 1, maintenance_satisfied: false },
        { facility_id: 'integral', name: 'Integral', maintenance_level: 0.29 },
        { facility_id: 'non-integral', name: 'Non-integral', maintenance_level: 0.2904 },
        { facility_id: 'partial', name: 'Partial', maintenance_level: 0.605 },
        { facility_id: 'fallback', name: 'Fallback', maintenance_level: Number.NaN, maintenance_satisfied: false },
        { facility_id: 'malformed', name: 'Malformed', maintenance_level: {} },
      ],
      player_facilities: [],
      faction_facilities: [],
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('0%');
  expect(stdout).toContain('100%');
  expect(stdout).toMatch(/Integral\s+\|\s+integral\s+\|[^\n]*29%/);
  expect(stdout).not.toMatch(/Integral\s+\|\s+integral\s+\|[^\n]*29\.0%/);
  expect(stdout).toMatch(/Non-integral\s+\|\s+non-integral\s+\|[^\n]*29\.0%/);
  expect(stdout).toContain('60.5%');
  expect(stdout).toMatch(/Fallback\s+\|\s+fallback\s+\|[^\n]*false/);
  expect(stdout).not.toContain('NaN');
  expect(stdout).not.toContain('undefined');
  expect(stdout).not.toContain('[object Object]');
});

test('facility list ignores malformed boolean maintenance fallback', () => {
  const rendered = renderStructuredResult(
    'facility_list',
    {
      action: 'list',
      base_id: 'earth_station',
      station_facilities: [{ facility_id: 'malformed', name: 'Malformed', maintenance_satisfied: {} }],
      player_facilities: [],
      faction_facilities: [],
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).not.toContain('Maint');
  expect(stdout).not.toContain('[object Object]');
});

test('omits facility state and maintenance columns when the API omits those fields', () => {
  const rendered = renderStructuredResult(
    'facility_list',
    {
      base_id: 'nova_terra_central',
      station_facilities: [
        {
          facility_id: 'power-cell-assembler',
          type: 'power_cell_assembler',
          name: 'Power Cell Assembler',
          category: 'production',
          level: 1,
          recipe_id: 'build_power_cell',
        },
      ],
      player_facilities: [
        {
          facility_id: 'crew-bunk-1',
          type: 'crew_bunk',
          name: 'Crew Bunk',
          category: 'personal',
          level: 1,
        },
      ],
      faction_facilities: [
        {
          facility_id: 'faction-workshop-1',
          type: 'faction_workshop',
          name: 'Faction Workshop',
          category: 'faction',
          level: 1,
        },
      ],
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).not.toContain('Active');
  expect(stdout).not.toContain('Maint');
});

test('faction_facility_owned clone shows Damaged, Building, and Dismantling as yes', () => {
  const fixture = structuredClone(factionFacilityOwnedFixture) as Record<string, unknown>;
  const facilities = fixture.facilities as Array<Record<string, unknown>>;
  if (!facilities[0]) throw new Error('Faction facility fixture is incomplete.');
  facilities[0].damaged = true;
  facilities[0].under_construction = true;
  facilities[0].dismantling = true;
  const stdout = renderStructuredResult('faction_facility_owned', fixture, options, context).stdout.join('\n');
  const section = sectionAfter(stdout, 'Faction Facilities');
  expect(tableCell(section, 'faction-yard-1', 'Damaged')).toBe('yes');
  expect(tableCell(section, 'faction-yard-1', 'Building')).toBe('yes');
  expect(tableCell(section, 'faction-yard-1', 'Dismantling')).toBe('yes');
  expect(tableCell(section, 'faction-yard-1', 'Rent')).toBe('1,200cr (paused)');
  expect(stdout).toContain('Faction rent bill: 1,200cr/cycle');
  expect(stdout).toContain('Faction arrears: 2,400cr');
});

test('omits faction facility state column when the API omits that field', () => {
  const rendered = renderStructuredResult(
    'faction_facility_owned',
    {
      action: 'faction_owned',
      facilities: [
        {
          facility_id: 'faction-workshop-1',
          type: 'faction_workshop',
          name: 'Faction Workshop',
          base_name: 'Nova Terra Central',
          system_id: 'sol',
          rent_per_cycle: 80,
        },
      ],
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).not.toContain('Active');
  expect(stdout).not.toContain('Idle');
  expect(stdout).toContain('Rent');
});

const ARENA_ONLY_FLEET_LINE = 'Arena-only: yes (unlimited at this arena; disbands if the leader leaves the arena)';

function renderFleetStatus(fixture: Record<string, unknown>): string {
  const rendered = renderStructuredResult('fleet_status', fixture, options, context);
  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  return stdout;
}

test('renders flat fleet_status response from v2 schema', () => {
  const stdout = renderFleetStatus(fleetFixture);

  expect(stdout).toContain('=== Fleet ===');
  expect(stdout).toContain('ID: fleet-1');
  expect(stdout).toContain('Leader: Marlowe');
  expect(stdout).toContain('You are leader: yes');
  expect(stdout).toContain('Size: 2/5');
  expect(stdout).not.toContain('Arena-only');
  expect(stdout).toContain('Marlowe');
  expect(stdout).toContain('Prospector');
  expect(stdout).toContain('sol');
  expect(stdout).toContain('Rook');
  expect(stdout).toContain('Passenger');
  expect(stdout).toContain('Riding');
  expect(stdout).toContain('ship-marlowe-1');
  expect(stdout).toContain('Pending Invites');
  expect(stdout).toContain('Ibis');
  // Deadhead passenger has blank Ship column (no ship field)
  const rookLine = stdout.split('\n').find((line) => line.includes('Rook'));
  expect(rookLine).toBeDefined();
  expect(rookLine).toMatch(/Rook\s+\|\s+player-2\s+\|\s+\|\s+/);
});

test('renders arena-only fleet status without a Size line', () => {
  const stdout = renderFleetStatus(fleetArenaOnlyFixture);

  expect(stdout).toContain(ARENA_ONLY_FLEET_LINE);
  expect(stdout).not.toContain('Size:');
  expect(stdout).toContain('=== Members ===');
  expect(stdout).toContain('Pending Invites');
});

test('omits Arena-only when arena_only is false', () => {
  const stdout = renderFleetStatus({ ...fleetFixture, arena_only: false });

  expect(stdout).toContain('Size: 2/5');
  expect(stdout).not.toContain('Arena-only');
});

test('omits Arena-only when arena_only is the string true', () => {
  const stdout = renderFleetStatus({ ...fleetFixture, arena_only: 'true' });

  expect(stdout).toContain('Size: 2/5');
  expect(stdout).not.toContain('Arena-only');
});

test('prints Size and Arena-only when both fields are present', () => {
  const stdout = renderFleetStatus({ ...fleetFixture, arena_only: true });

  expect(stdout).toContain('Size: 2/5');
  expect(stdout).toContain(ARENA_ONLY_FLEET_LINE);
});

test('fleet shape fallback does not claim public faction profiles', () => {
  const rendered = renderStructuredResult(
    'unmatched_command',
    {
      id: 'cb22dc89b36022a0beecea17d548b76b',
      name: 'Interstellar Continental',
      tag: 'NOIR',
      leader: 'Marlowe',
      members: [{ username: 'Marlowe', role: 'Leader' }],
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).not.toContain('=== Fleet ===');
  expect(stdout).not.toContain('| ID | Ship | Location | Status');
});

test('renders forum thread reply pagination metadata', () => {
  const rendered = renderStructuredResult(
    'forum_get_thread',
    {
      ...forumThreadFixture,
      page: 2,
      per_page: 20,
      total_replies: 41,
      has_more: true,
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Replies: 41');
  expect(stdout).toContain('reply page 2 | per page 20 | total replies 41');
  expect(stdout).toContain('More replies available.');
});

test('renders chat history timestamps from v2 timestamp_utc field', () => {
  const rendered = renderStructuredResult(
    'get_chat_history',
    {
      channel: 'local',
      has_more: false,
      total_count: 1,
      messages: [
        {
          id: 'chat-1',
          channel: 'local',
          sender_id: 'player-ibis',
          sender: 'Ibis',
          content: 'Clear skies over Sol today.',
          timestamp_utc: '2026-05-23T15:04:05.000Z',
        },
      ],
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('2026-05-23 15:04:05');
  expect(stdout).toContain('Ibis');
  expect(stdout).toContain('Clear skies over Sol today.');
});

test('chat confirmation formats documented numeric sent_at as UTC', () => {
  const rendered = renderStructuredResult(
    'chat',
    {
      channel: 'local',
      message: 'Clear skies.',
      sent_at: 1748012645,
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  expect(rendered.stdout.join('\n')).toBe('[local] 15:04:05Z Clear skies.');
});

test('chat confirmation ignores the undocumented timestamp alias', () => {
  const rendered = renderStructuredResult(
    'chat',
    {
      action: 'chat',
      channel: 'local',
      content: 'Clear skies.',
      timestamp: '2026-05-23T15:04:05-04:00',
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  expect(rendered.stdout.join('\n')).toBe('[local] Clear skies.');
});

test('chat confirmation ignores string-valued sent_at', () => {
  const rendered = renderStructuredResult(
    'chat',
    {
      channel: 'local',
      message: 'Clear skies.',
      sent_at: '2026-05-23T15:04:05-04:00',
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  expect(rendered.stdout.join('\n')).toBe('[local] Clear skies.');
});

test('renders get_guide server version', () => {
  const rendered = renderStructuredResult(
    'get_guide',
    {
      guide: 'miner',
      content: 'Mine at asteroid belts.',
      server_version: 'v0.461.0',
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Server version: v0.461.0');
});

function expectNoPersonnelCounts(stdout: string): void {
  expect(stdout).not.toContain('fit_crew');
  expect(stdout).not.toContain('fit_marines');
  expect(stdout).not.toMatch(/injured_/);
}

function renderBattleStatus(fixture: Record<string, unknown>): string {
  const rendered = renderStructuredResult('get_battle_status', fixture, options, context);
  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).not.toContain('=== Response ===');
  return stdout;
}

test('get_battle_status omits Boarding when boarding is absent or empty', () => {
  const stdout = renderBattleStatus(structuredClone(battleStatusFixture) as Record<string, unknown>);
  expect(stdout).toContain('=== Participants ===');
  expect(stdout).not.toContain('=== Boarding ===');
  expectNoPersonnelCounts(stdout);

  const empty = structuredClone(battleStatusFixture) as Record<string, unknown>;
  empty.boarding = [];
  expect(renderBattleStatus(empty)).not.toContain('=== Boarding ===');
});

test('get_battle_status prints qualitative boarding after participants', () => {
  const stdout = renderBattleStatus(structuredClone(battleStatusBoardingFixture) as Record<string, unknown>);
  const boarding = stdout.split('=== Boarding ===')[1] ?? '';

  expect(stdout.indexOf('=== Participants ===')).toBeLessThan(stdout.indexOf('=== Boarding ==='));
  expect(boarding).toContain('board-1');
  expect(boarding).toContain('breach');
  expect(boarding).toContain('40%');
  expect(boarding).toContain('player-1');
  expect(boarding).toContain('pirate-1');
  expect(boarding).toContain('3');
  expect(boarding).toContain('Progress');
  expect(boarding).toContain('Self-destruct');
  expect(boarding).not.toContain('Event');
  expectNoPersonnelCounts(stdout);
});

test('get_battle_status prints intercept combat state that blocks escape', () => {
  const stdout = renderBattleStatus(structuredClone(battleStatusCombatStateFixture) as Record<string, unknown>);

  expect(stdout).toContain('Combat State:');
  expect(stdout).toContain('Can Escape: no');
  expect(stdout).toContain('Flee Progress: 2');
  expect(stdout).not.toContain('Flee Progress: 2/');
  expect(stdout).toContain('Intercepted: yes (pirate-1)');
  expect(stdout).toContain('Incapacitated: no');
  expect(stdout).toContain('Intercepting: no');
  expect(stdout).toContain('Warp Disrupted: no');
  expect(stdout).not.toContain('Latch:');
});

function renderLatchStatus(latchStatus: unknown): string {
  const fixture = structuredClone(battleStatusLatchStatusFixture);
  const combatState = fixture.combat_state as Record<string, unknown>;
  combatState.latch_status = latchStatus;
  return renderBattleStatus(fixture);
}

test('get_battle_status prints latch status after intercepting and before webbed', () => {
  const stdout = renderBattleStatus(structuredClone(battleStatusLatchStatusFixture));
  const lines = stdout.split('\n');
  const latchLine = 'Latch: shields_holding (keep shields down)';
  const intercepting = lines.findIndex((line) => line.startsWith('Intercepting:'));
  const latch = lines.indexOf(latchLine);
  const webbed = lines.findIndex((line) => line.startsWith('Webbed:'));
  const participants = sectionAfter(stdout, 'Participants', 'Boarding');
  const boarding = sectionAfter(stdout, 'Boarding');

  expect(intercepting).toBeGreaterThanOrEqual(0);
  expect(latch).toBeGreaterThan(intercepting);
  expect(webbed).toBeGreaterThan(latch);
  expect(boarding).toContain('closing');
  expect(boarding).toContain('latching');
  expect(boarding).not.toContain('shields_holding');
  expect(boarding).not.toContain('Latch:');
  expect(tableCell(participants, 'Marlowe', 'Stance')).toBe('board');
  expect(tableCell(participants, 'Pirate Skiff', 'Distance')).toBe('0');
});

test('get_battle_status prints known latch statuses and omits unrecognized values', () => {
  const accruing = renderLatchStatus('accruing');
  expect(accruing.split('\n')).toContain('Latch: accruing');
  expect(accruing).not.toContain('keep shields down');
  expect(accruing).not.toContain('close to point-blank');

  expect(renderLatchStatus('out_of_range').split('\n')).toContain('Latch: out_of_range (close to point-blank)');
  expect(renderLatchStatus('  shields_holding  ').split('\n')).toContain('Latch: shields_holding (keep shields down)');

  for (const latchStatus of [
    'OUT_OF_RANGE',
    'out-of-range',
    '',
    '   ',
    null,
    1,
    true,
    { status: 'accruing' },
    ['accruing'],
    'constructor',
    '__proto__',
    'toString',
    'valueOf',
    'hasOwnProperty',
    'toLocaleString',
  ]) {
    expect(renderLatchStatus(latchStatus)).not.toContain('Latch:');
  }

  const omitted = structuredClone(battleStatusLatchStatusFixture);
  delete (omitted.combat_state as Record<string, unknown>).latch_status;
  const omittedStdout = renderBattleStatus(omitted);
  expect(omittedStdout).not.toContain('Latch:');
  expect(omittedStdout).toContain('Combat State:');
});

test('get_battle_status prints combat state when latch status is the only recognized field', () => {
  const stdout = renderBattleStatus({
    battle_id: 'battle-1',
    system_id: 'sol',
    is_participant: true,
    combat_state: { latch_status: 'accruing' },
  });

  expect(stdout).toContain('Combat State:');
  expect(stdout.split('\n')).toContain('Latch: accruing');
  expect(stdout).not.toContain('Can Escape:');
});

test('get_battle_status omits combat state when latch status is unrecognized', () => {
  for (const latchStatus of [
    'nope',
    'constructor',
    '__proto__',
    'toString',
    'valueOf',
    'hasOwnProperty',
    'toLocaleString',
  ]) {
    const stdout = renderBattleStatus({
      battle_id: 'battle-1',
      system_id: 'sol',
      is_participant: true,
      combat_state: { latch_status: latchStatus },
    });

    expect(stdout).toContain('=== Battle ===');
    expect(stdout).toContain('ID: battle-1');
    expect(stdout).not.toContain('Combat State:');
    expect(stdout).not.toContain('Latch:');
  }
});

test('get_battle_status prints latch status nested under battle', () => {
  const clone = structuredClone(battleStatusLatchStatusFixture);
  const stdout = renderBattleStatus({ battle: { ...clone } });

  expect(stdout.split('\n')).toContain('Latch: shields_holding (keep shields down)');
});

test('get_battle_status ignores a synthetic boarding event and still has no Event column', () => {
  const fixture = structuredClone(battleStatusBoardingFixture) as Record<string, unknown>;
  fixture.boarding = [
    {
      ...(battleStatusBoardingFixture.boarding[0] as Record<string, unknown>),
      event: 'plundered',
    },
  ];
  const boarding = renderBattleStatus(fixture).split('=== Boarding ===')[1] ?? '';

  expect(boarding).toContain('board-1');
  expect(boarding).toContain('breach');
  expect(boarding).not.toContain('Event');
  expect(boarding).not.toContain('plundered');
});

test('get_battle_status reads boarding nested on battle and ignores personnel counts', () => {
  const fixture = {
    battle: {
      ...(structuredClone(battleStatusFixture) as Record<string, unknown>),
      boarding: [
        {
          operation_id: 'board-nested',
          phase: 'latch',
          attacker_id: 'player-1',
          target_id: 'pirate-1',
          fit_crew: 4,
          fit_marines: 2,
          injured_crew: 1,
          injured_marines: 0,
        },
      ],
    },
  };
  const stdout = renderBattleStatus(fixture);
  const boarding = stdout.split('=== Boarding ===')[1] ?? '';

  expect(boarding).toContain('board-nested');
  expect(boarding).toContain('latch');
  expect(boarding).not.toContain('Progress');
  expect(boarding).not.toContain('Self-destruct');
  expectNoPersonnelCounts(stdout);
  expect(boarding).not.toContain('4');
  expect(boarding).not.toContain('2');
});

test('get_battle_status omits optional boarding columns when those fields are absent', () => {
  const fixture = structuredClone(battleStatusFixture) as Record<string, unknown>;
  fixture.boarding = [{ operation_id: 'board-lean', phase: 'hold' }];
  const boarding = renderBattleStatus(fixture).split('=== Boarding ===')[1] ?? '';

  expect(boarding).toContain('board-lean');
  expect(boarding).toContain('hold');
  expect(boarding).not.toContain('Progress');
  expect(boarding).not.toContain('Attacker');
  expect(boarding).not.toContain('Target');
  expect(boarding).not.toContain('Self-destruct');
});

function battleParticipants(fixture: Record<string, unknown>): Array<Record<string, unknown>> {
  const participants = fixture.participants as Array<Record<string, unknown>> | undefined;
  if (!participants) throw new Error('Battle status fixture is missing participants.');
  return participants;
}

function participantsHeader(stdout: string): string | undefined {
  return sectionAfter(stdout, 'Participants')
    .split('\n')
    .find((line) => line.includes('|') && line.includes('Name') && line.includes('ID'));
}

test('get_battle_status prints NPC yes/no after Kind and never a Boss column', () => {
  const stdout = renderBattleStatus(structuredClone(battleStatusFixture) as Record<string, unknown>);
  const section = sectionAfter(stdout, 'Participants');
  const header = participantsHeader(stdout);

  expect(header).toBeDefined();
  expect(header).toContain('Kind');
  expect(header).toContain('NPC');
  expect(header).not.toContain('Boss');
  expect(header?.indexOf('Kind') ?? -1).toBeLessThan(header?.indexOf('NPC') ?? -1);
  expect(tableCell(section, 'Marlowe', 'Kind')).toBe('player');
  expect(tableCell(section, 'Marlowe', 'NPC')).toBe('no');
  expect(tableCell(section, 'Pirate Skiff', 'NPC')).toBe('yes');
  expect(tableCell(section, 'Pilot Whale', 'NPC')).toBe('yes');
  expect(tableCell(section, 'Earth Station', 'NPC')).toBe('yes');
  expect(stdout).not.toMatch(/\bfalse\b/);
});

test('get_battle_status ignores rogue is_boss on a participant', () => {
  const fixture = structuredClone(battleStatusFixture) as Record<string, unknown>;
  const pirate = battleParticipants(fixture).find((row) => row.player_id === 'pirate-1');
  if (!pirate) throw new Error('Pirate participant is missing.');
  pirate.is_boss = true;
  const stdout = renderBattleStatus(fixture);
  const section = sectionAfter(stdout, 'Participants');
  const header = participantsHeader(stdout);

  expect(header).toContain('NPC');
  expect(header).not.toContain('Boss');
  expect(tableCell(section, 'Pirate Skiff', 'NPC')).toBe('yes');
  expect(tableCell(section, 'Marlowe', 'NPC')).toBe('no');
});

test('get_battle_status omits NPC when every participant lacks is_npc', () => {
  const fixture = structuredClone(battleStatusFixture) as Record<string, unknown>;
  for (const row of battleParticipants(fixture)) delete row.is_npc;
  const header = participantsHeader(renderBattleStatus(fixture));

  expect(header).toContain('Kind');
  expect(header).not.toContain('NPC');
  expect(header).not.toContain('Boss');
});

test('get_battle_status mixed is_npc page blanks omitted rows instead of no', () => {
  const fixture = structuredClone(battleStatusFixture) as Record<string, unknown>;
  for (const row of battleParticipants(fixture)) {
    if (row.player_id === 'pirate-1') row.is_npc = true;
    else delete row.is_npc;
  }
  const stdout = renderBattleStatus(fixture);
  const section = sectionAfter(stdout, 'Participants');
  const header = participantsHeader(stdout);

  expect(header).toContain('NPC');
  expect(tableCell(section, 'Pirate Skiff', 'NPC')).toBe('yes');
  expect(tableCell(section, 'Marlowe', 'NPC')).toBe('');
  expect(tableCell(section, 'Pilot Whale', 'NPC')).toBe('');
  expect(tableCell(section, 'Earth Station', 'NPC')).toBe('');
});

test('get_battle_status prize row shows Kind prize and NPC yes', () => {
  const fixture = structuredClone(battleStatusFixture) as Record<string, unknown>;
  battleParticipants(fixture).push({
    player_id: 'prize-1',
    username: 'Abandoned Skiff',
    side_id: 2,
    kind: 'prize',
    is_npc: true,
    auto_pilot: true,
  });
  const section = sectionAfter(renderBattleStatus(fixture), 'Participants');

  expect(tableCell(section, 'prize-1', 'Kind')).toBe('prize');
  expect(tableCell(section, 'prize-1', 'NPC')).toBe('yes');
});

test('get_battle_status JSON passthrough keeps is_npc false', () => {
  const rendered = renderStructuredResult(
    'get_battle_status',
    structuredClone(battleStatusFixture),
    { ...options, format: 'json' },
    context,
  );
  const parsed = JSON.parse(rendered.stdout.join('\n')) as Record<string, unknown>;
  const participants = parsed.participants as Array<Record<string, unknown>>;

  expect(participants[0]?.is_npc).toBe(false);
  expect(participants[1]?.is_npc).toBe(true);
});

test('get_battle_summary shows Has Station yes when has_station is true', () => {
  const rendered = renderStructuredResult(
    'get_battle_summary',
    structuredClone(battleSummaryFixture),
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Has Station: yes');
  expect(stdout).not.toContain('=== Response ===');
});

test('get_battle_summary shows Has Station no when has_station is false', () => {
  const fixture = structuredClone(battleSummaryFixture) as Record<string, unknown>;
  fixture.has_station = false;
  const stdout = renderStructuredResult('get_battle_summary', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Has Station: no');
});

test('get_battle_summary omits Has Station when has_station is absent', () => {
  const fixture = structuredClone(battleSummaryFixture) as Record<string, unknown>;
  delete fixture.has_station;
  const stdout = renderStructuredResult('get_battle_summary', fixture, options, context).stdout.join('\n');

  expect(stdout).not.toContain('Has Station:');
});

test('get_battle_summary interrupted fixture prints Outcome and omits Winning Side and Destroyed', () => {
  const stdout = renderStructuredResult(
    'get_battle_summary',
    structuredClone(battleSummaryInterruptedFixture),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Outcome: interrupted');
  expect(stdout).not.toContain('Winning Side:');
  expect(stdout).not.toContain('\nDestroyed:');
  expect(stdout).not.toContain('-1');
  expect(stdout).not.toContain('=== Response ===');
});

test('get_battle_summary interrupted JSON passthrough keeps winning_side -1', () => {
  const rendered = renderStructuredResult(
    'get_battle_summary',
    structuredClone(battleSummaryInterruptedFixture),
    { ...options, format: 'json' },
    context,
  );
  const parsed = JSON.parse(rendered.stdout.join('\n')) as Record<string, unknown>;

  expect(parsed.winning_side).toBe(-1);
  expect(parsed.outcome).toBe('interrupted');
  expect(parsed.ships_destroyed).toBe(0);
  expect(parsed).not.toHaveProperty('destroyed_names');
});

test('get_battle_summary omits Winning Side on stalemate winning_side -1', () => {
  const fixture = structuredClone(battleSummaryFixture) as Record<string, unknown>;
  fixture.outcome = 'stalemate';
  fixture.winning_side = -1;
  fixture.ships_destroyed = 0;
  delete fixture.destroyed_names;
  const stdout = renderStructuredResult('get_battle_summary', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Outcome: stalemate');
  expect(stdout).not.toContain('Winning Side:');
  expect(stdout).not.toContain('-1');
  expect(stdout).not.toContain('=== Response ===');
});

test('get_battle_summary omits Winning Side when winning_side is -1n', () => {
  const fixture = structuredClone(battleSummaryFixture) as Record<string, unknown>;
  fixture.outcome = 'stalemate';
  fixture.winning_side = -1n;
  fixture.ships_destroyed = 0;
  delete fixture.destroyed_names;
  const stdout = renderStructuredResult('get_battle_summary', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Outcome: stalemate');
  expect(stdout).not.toContain('Winning Side:');
  expect(stdout).not.toContain('-1');
  expect(stdout).not.toContain('=== Response ===');
});

test('get_battle_summary still prints Winning Side: 1 on victory', () => {
  const stdout = renderStructuredResult(
    'get_battle_summary',
    structuredClone(battleSummaryFixture),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Winning Side: 1');
});

test("get_battle_summary omits Winning Side when winning_side is the string '-1'", () => {
  const fixture = structuredClone(battleSummaryFixture) as Record<string, unknown>;
  fixture.outcome = 'stalemate';
  fixture.winning_side = '-1';
  const stdout = renderStructuredResult('get_battle_summary', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Outcome: stalemate');
  expect(stdout).not.toContain('Winning Side:');
});

test('get_battle_summary JSON passthrough keeps winning_side -1', () => {
  const fixture = structuredClone(battleSummaryFixture) as Record<string, unknown>;
  fixture.outcome = 'stalemate';
  fixture.winning_side = -1;
  const rendered = renderStructuredResult('get_battle_summary', fixture, { ...options, format: 'json' }, context);
  const parsed = JSON.parse(rendered.stdout.join('\n')) as Record<string, unknown>;

  expect(parsed.winning_side).toBe(-1);
  expect(parsed.outcome).toBe('stalemate');
});

test('get_battle_summary omits Winning Side on mutual_destruction with winning_side -1', () => {
  const fixture = structuredClone(battleSummaryFixture) as Record<string, unknown>;
  fixture.outcome = 'mutual_destruction';
  fixture.winning_side = -1;
  const stdout = renderStructuredResult('get_battle_summary', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Outcome: mutual_destruction');
  expect(stdout).not.toContain('Winning Side:');
});

test('get_battle_summary omits Winning Side on -1 without fabricating Outcome: stalemate', () => {
  const fixture = structuredClone(battleSummaryFixture) as Record<string, unknown>;
  delete fixture.outcome;
  fixture.winning_side = -1;
  const stdout = renderStructuredResult('get_battle_summary', fixture, options, context).stdout.join('\n');

  expect(stdout).not.toContain('Winning Side:');
  expect(stdout).not.toContain('Outcome: stalemate');
});

test('get_battle_summary prints Ships Captured 0 from the default fixture', () => {
  const stdout = renderStructuredResult(
    'get_battle_summary',
    structuredClone(battleSummaryFixture),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Ships Captured: 0');
  expect(stdout).not.toContain('=== Captures ===');
  expectNoPersonnelCounts(stdout);
});

test('get_battle_summary omits Ships Captured when ships_captured is absent', () => {
  const fixture = structuredClone(battleSummaryFixture) as Record<string, unknown>;
  delete fixture.ships_captured;
  const stdout = renderStructuredResult('get_battle_summary', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Ships Destroyed:');
  expect(stdout).not.toContain('Ships Captured:');
  expect(stdout).not.toContain('=== Captures ===');
});

test('get_battle_summary prints Captures identities after Ships Captured', () => {
  const stdout = renderStructuredResult(
    'get_battle_summary',
    structuredClone(battleSummaryCapturesFixture),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Ships Captured: 1');
  expect(stdout.indexOf('Ships Captured: 1')).toBeLessThan(stdout.indexOf('=== Captures ==='));
  expect(stdout).toContain('ship-skiff-1');
  expect(stdout).toContain('skiff');
  expect(stdout).toContain('Marlowe (player-1)');
  expect(stdout).toContain('Corsair-7 (pirate-1)');
  expect(stdout).toContain('board-1');
  expect(stdout).not.toContain('Kind');
  expectNoPrizeOrLocation(captureHeader(sectionAfter(stdout, 'Captures', 'Sides')));
  expectNoPersonnelCounts(stdout);
});

test('get_battle_summary Captures prints Prize and Location after Boarding for mixed prize rows', () => {
  const stdout = renderBattleSummary(structuredClone(battleSummaryCapturesPrizeFixture) as Record<string, unknown>);
  const captures = sectionAfter(stdout, 'Captures', 'Sides');
  const header = captureHeader(captures);

  expect(stdout).toContain('Ships Captured: 3');
  expectHeaderColumnsInOrder(header, ['Ship', 'Class', 'Captor', 'Former owner', 'Boarding', 'Prize', 'Location']);
  expect(header).not.toContain('Kind');
  expect(captureCell(captures, 'ship-skiff-1', 'Prize')).toBe('prize-1');
  expect(captureCell(captures, 'ship-skiff-1', 'Location')).toBe('Cloudbank (Sol)');
  expect(captureCell(captures, 'ship-skiff-2', 'Prize')).toBe('prize-2');
  expect(captureCell(captures, 'ship-skiff-2', 'Location')).toBe('Sol');
  expect(captureCell(captures, 'ship-skiff-3', 'Prize')).toBe('');
  expect(captureCell(captures, 'ship-skiff-3', 'Location')).toBe('');
  expect(captures).not.toContain(' at ');
  expect(captures).not.toContain(' in Sol');
  expectNoPersonnelCounts(stdout);
});

test('get_battle_summary Captures omits Location when prize rows have no poi or system', () => {
  const stdout = renderBattleSummary(battleSummaryCapturesClone({ prize_id: 'prize-1' }));
  const captures = sectionAfter(stdout, 'Captures', 'Sides');
  const header = captureHeader(captures);

  expect(header).toContain('Prize');
  expect(header).not.toContain('Location');
  expect(header).not.toContain('Kind');
  expect(captureCell(captures, 'ship-skiff-1', 'Prize')).toBe('prize-1');
});

test('get_battle_summary Captures omits Prize for non-string and whitespace prize_id', () => {
  for (const prize_id of ['   ', 1, true, null]) {
    const stdout = renderBattleSummary(battleSummaryCapturesClone({ prize_id }));
    expectNoPrizeOrLocation(captureHeader(sectionAfter(stdout, 'Captures', 'Sides')));
  }
});

test('get_battle_summary Captures prints Kind after Captor for mixed captor_kind rows', () => {
  const stdout = renderBattleSummary(structuredClone(battleSummaryCapturesKindFixture) as Record<string, unknown>);
  const captures = sectionAfter(stdout, 'Captures', 'Sides');
  const header = captureHeader(captures);

  expect(stdout).toContain('Ships Captured: 4');
  expectCaptorThenKindThenFormerOwner(header);
  expectNoPrizeOrLocation(header);
  expect(captureCell(captures, 'ship-skiff-1', 'Kind')).toBe('player');
  expect(captureCell(captures, 'ship-skiff-2', 'Kind')).toBe('pirate');
  expect(captureCell(captures, 'ship-skiff-3', 'Kind')).toBe('npc');
  expect(captureCell(captures, 'ship-skiff-4', 'Kind')).toBe('');
  expect(captureCell(captures, 'ship-skiff-1', 'Captor')).toBe('Marlowe (player-1)');
  expect(captureCell(captures, 'ship-skiff-2', 'Captor')).toBe('Corsair (pirate-1)');
  expect(captureCell(captures, 'ship-skiff-3', 'Captor')).toBe('Sentinel (npc-1)');
  expect(captureCell(captures, 'ship-skiff-4', 'Captor')).toBe('Marlowe (player-1)');
  expectNoPersonnelCounts(stdout);
});

test('get_battle_summary Captures prints PLAYER as player and unknown herald as-is', () => {
  const playerStdout = renderBattleSummary(battleSummaryCapturesClone({ captor_kind: 'PLAYER' }));
  const playerCaptures = sectionAfter(playerStdout, 'Captures', 'Sides');
  expectCaptorThenKindThenFormerOwner(captureHeader(playerCaptures));
  expect(captureCell(playerCaptures, 'ship-skiff-1', 'Kind')).toBe('player');
  expect(captureCell(playerCaptures, 'ship-skiff-1', 'Captor')).toBe('Marlowe (player-1)');

  const pirateStdout = renderBattleSummary(battleSummaryCapturesClone({ captor_kind: ' Pirate ' }));
  expect(captureCell(sectionAfter(pirateStdout, 'Captures', 'Sides'), 'ship-skiff-1', 'Kind')).toBe('pirate');

  const heraldStdout = renderBattleSummary(battleSummaryCapturesClone({ captor_kind: 'herald' }));
  expect(captureCell(sectionAfter(heraldStdout, 'Captures', 'Sides'), 'ship-skiff-1', 'Kind')).toBe('herald');
});

test('get_battle_summary Captures blanks whitespace and non-string captor_kind cells', () => {
  const fixture = structuredClone(battleSummaryCapturesKindFixture) as Record<string, unknown>;
  const captures = fixture.captures as Array<Record<string, unknown>>;
  captureRow(captures, 0).captor_kind = '   ';
  captureRow(captures, 1).captor_kind = { kind: 'pirate' };
  captureRow(captures, 2).captor_kind = 1;
  captureRow(captures, 3).captor_kind = 'player';
  const stdout = renderBattleSummary(fixture);
  const section = sectionAfter(stdout, 'Captures', 'Sides');
  expectCaptorThenKindThenFormerOwner(captureHeader(section));
  expect(captureCell(section, 'ship-skiff-1', 'Kind')).toBe('');
  expect(captureCell(section, 'ship-skiff-2', 'Kind')).toBe('');
  expect(captureCell(section, 'ship-skiff-3', 'Kind')).toBe('');
  expect(captureCell(section, 'ship-skiff-4', 'Kind')).toBe('player');
});

test('get_battle_summary Captures omits Kind when every row lacks captor_kind', () => {
  const stdout = renderBattleSummary(structuredClone(battleSummaryCapturesFixture) as Record<string, unknown>);
  const header = captureHeader(sectionAfter(stdout, 'Captures', 'Sides'));
  expect(header).toBeDefined();
  expect(header).toContain('Captor');
  expect(header).not.toContain('Kind');
  expectNoPrizeOrLocation(header);
  expectNoPersonnelCounts(stdout);
});

test('get_battle_summary omits empty captures table', () => {
  const fixture = structuredClone(battleSummaryFixture) as Record<string, unknown>;
  fixture.ships_captured = 0;
  fixture.captures = [];
  const stdout = renderStructuredResult('get_battle_summary', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Ships Captured: 0');
  expect(stdout).not.toContain('=== Captures ===');
});

test('get_battle_summary arena uses knockout labels and does not claim ammo restore', () => {
  const stdout = renderBattleSummary(structuredClone(battleSummaryArenaFixture) as Record<string, unknown>);
  expect(stdout).toContain('Category: arena');
  expect(stdout).toContain('Arena match: knockouts restore ships, drones, and personnel');
  expect(stdout).toContain('Ammo, fuel, and consumables stay spent');
  expect(stdout).toContain('Ships Knocked Out: 1');
  expect(stdout).toContain('Knocked out: Kestrel');
  expect(stdout).not.toContain('Ships Destroyed');
  expect(stdout).not.toContain('Destroyed:');
});

test('get_battle_summary hunt uses wildlife labels and does not use knockout copy', () => {
  const stdout = renderBattleSummary(structuredClone(battleSummaryHuntFixture) as Record<string, unknown>);
  expect(stdout).toContain('Category: wildlife');
  expect(stdout).toContain(
    'Wildlife hunt: creatures have hull and armor but no shields; kills drop carcass wrecks. Wildlife never dogpiles. Most creatures flee when badly hurt; some apex never flee.',
  );
  expect(stdout).toContain('Destroyed: 1');
  expect(stdout).toContain('Killed: Pilot Whale');
  expect(stdout).toContain('=== Sides ===');
  expect(stdout).not.toContain('Ships Destroyed');
  expect(stdout).not.toContain('Destroyed: Pilot Whale');
  expect(stdout).not.toContain('Ships Knocked Out');
  expect(stdout).not.toContain('Knocked out');
});

function renderBattleLog(fixture: Record<string, unknown>): string {
  const rendered = renderStructuredResult('get_battle_log', fixture, options, context);
  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).not.toContain('=== Response ===');
  return stdout;
}

function leftoverDefenseComponent(): Record<string, unknown> {
  return {
    weapon_instance_id: 'w-leftover',
    weapon_name: 'Ghost Cannon',
    damage_type: 'energy',
    incoming_damage: 400,
    shield_resist_pct: 5,
    after_shield_resist: 380,
    type_resist_pct: 5,
    after_type_resist: 360,
    flat_reduction_pct: 3,
    after_flat_reduction: 350,
    shield_bypass_pct: 0,
    armor_bypass_pct: 0,
    ignore_all_defense: false,
    final_damage: 350,
    shield_damage: 200,
    hull_damage: 150,
  };
}

test('get_battle_log renders shield/hull ticks, defense legend, and attacks without falling back', () => {
  const stdout = renderBattleLog(structuredClone(battleLogFixture) as Record<string, unknown>);

  expect(stdout).toContain('=== Battle Log ===');
  expect(stdout).toContain('=== Ticks ===');
  expect(stdout).toContain('Shield');
  expect(stdout).toContain('Hull');
  expect(stdout).toContain('=== Attacks ===');
  expect(stdout).toContain(
    'Defense: incoming→shield skill→typed resist→flat/adaptive (S# T# F#). S/H = shield/hull. Trailing flags may truncate.',
  );
  expect(stdout).toContain('Pulse Laser kinetic 500→470→455→440 (S6 T3 F3)');
  expect(stdout).toContain('Scatter Cannon chance 12% roll 81');
  expect(stdout).toContain('hit 2/3');
  expect(stdout).toContain('Mining Laser chance 35% roll 61');
  expect(stdout).toContain('Railgun energy 400→380→360→350 (S5 T5 F3)');
  expect(stdout).toContain('Pulse Cannon kinetic 200→190→180→170 (S5 T5 F6)');
});

test('get_battle_log mixed-age tick-1 historical miss prints chance 12% without roll', () => {
  const stdout = renderBattleLog(structuredClone(battleLogFixture) as Record<string, unknown>);
  const ticks = battleLogTicksSection(stdout);
  const attacks = sectionAfter(stdout, 'Attacks');

  expect(ticks).toMatch(/^\s*1\s*\|\s*3\s*\|\s*1\s*\|\s*520\s*\|/m);
  expect(attacks).toContain('Scatter Cannon chance 12% roll 81');
  expect(attacks).toMatch(/^\s*1\s*\|\s*pirate-1\s*\|\s*player-1\s*\|\s*miss\s*\|\s*\|\s*chance 12%\s*$/m);
  expect(attacks).not.toContain('Light Blaster');
});

function battleLogTicksSection(stdout: string): string {
  return stdout.split('=== Ticks ===')[1]?.split('=== Attacks ===')[0] ?? '';
}

function withBattleEnded(
  fixture: Record<string, unknown>,
  battleEnded: Record<string, unknown>,
): Record<string, unknown> {
  const entries = fixture.entries as Array<Record<string, unknown>>;
  const entry = entries.at(1);
  if (!entry) throw new Error('expected ending battle log entry');
  entry.battle_ended = battleEnded;
  return fixture;
}

test('get_battle_log Ticks Ended prints fixture outcome instead of yes', () => {
  const stdout = renderBattleLog(structuredClone(battleLogFixture) as Record<string, unknown>);
  const ticks = battleLogTicksSection(stdout);

  expect(ticks).toContain('side_1_victory');
  expect(ticks).not.toMatch(/\|\s*yes\s*$/m);
  expect(ticks).not.toContain('| yes');
});

test('get_battle_log Ticks Ended prints stalemate outcome and not winning_side -1', () => {
  const fixture = withBattleEnded(structuredClone(battleLogFixture) as Record<string, unknown>, {
    outcome: 'stalemate',
    winning_side: -1,
  });
  const ticks = battleLogTicksSection(renderBattleLog(fixture));

  expect(ticks).toContain('stalemate');
  expect(ticks).not.toContain('-1');
});

test('get_battle_log Ticks Ended falls back to yes when battle_ended has no outcome', () => {
  const fixture = withBattleEnded(structuredClone(battleLogFixture) as Record<string, unknown>, {
    winning_side: -1,
  });
  const ticks = battleLogTicksSection(renderBattleLog(fixture));

  expect(ticks).toContain('yes');
});

test('get_battle_log JSON passthrough keeps nested winning_side -1', () => {
  const fixture = withBattleEnded(structuredClone(battleLogFixture) as Record<string, unknown>, {
    outcome: 'stalemate',
    winning_side: -1,
    total_damage: 8420,
  });
  const rendered = renderStructuredResult('get_battle_log', fixture, { ...options, format: 'json' }, context);
  const parsed = JSON.parse(rendered.stdout.join('\n')) as {
    entries: Array<{ battle_ended?: { winning_side?: unknown; outcome?: unknown } }>;
  };
  const ended = parsed.entries.at(1)?.battle_ended;

  expect(ended?.winning_side).toBe(-1);
  expect(ended?.outcome).toBe('stalemate');
});

test('get_battle_log miss with leftover defense_components stays one miss row', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-miss',
    status: 'completed',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 0,
        attacks: [
          {
            attacker_id: 'pirate-1',
            target_id: 'player-1',
            hit_success: false,
            final_damage: 0,
            shield_damage: 200,
            hull_damage: 150,
            hit_chance: 12,
            hit_roll: 81,
            defense_components: [leftoverDefenseComponent()],
          },
        ],
      },
    ],
  });

  const ticksSection = stdout.split('=== Ticks ===')[1]?.split('=== Attacks ===')[0] ?? '';

  expect(stdout).toContain('miss');
  expect(stdout).toContain('chance 12% roll 81');
  expect(stdout).not.toContain('Ghost Cannon');
  expect(stdout).not.toContain('400→380→360→350');
  expect(stdout).not.toContain('200/150');
  expect(stdout.match(/\| miss \|/g)?.length).toBe(1);
  expect(ticksSection).not.toContain('Shield');
  expect(ticksSection).not.toContain('Hull');
  expect(ticksSection).not.toContain('200');
  expect(ticksSection).not.toContain('150');
});

test('get_battle_log attack-level resist percents skip fabricated stage hops', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-fallback',
    status: 'active',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 3,
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            hit_success: true,
            raw_damage: 900,
            landed_damage: 800,
            final_damage: 420,
            shield_damage: 300,
            hull_damage: 120,
            damage_type: 'kinetic',
            shield_resist_pct: 6,
            type_resist_pct: 3,
            flat_reduction_pct: 3,
          },
        ],
      },
    ],
  });

  expect(stdout).toContain('kinetic (S6 T3 F3)');
  expect(stdout).toContain('300/120');
  expect(stdout).not.toContain('900→');
  expect(stdout).not.toContain('800→');
  expect(stdout).not.toContain('→420');
});

test('get_battle_log live partial volley prints hit N/M, missed-gun rolls, and omits leftover Ghost Cannon', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-partial',
    status: 'active',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 1,
        snapshots: [
          { player_id: 'player-1', username: 'Ace' },
          { player_id: 'pirate-1', username: 'Raider' },
        ],
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            hit_success: true,
            final_damage: 520,
            shield_damage: 340,
            hull_damage: 180,
            landed_damage: 600,
            hit_chance: 0.65,
            weapons: [
              {
                instance_id: 'w-rail',
                name: 'Railgun',
                damage_type: 'energy',
                hit_chance: 0.65,
                hit_roll: 0.2,
                hit_success: true,
              },
              {
                instance_id: 'w-cannon',
                name: 'Pulse Cannon',
                damage_type: 'kinetic',
                hit_chance: 0.65,
                hit_roll: 0.3,
                hit_success: true,
              },
              {
                instance_id: 'w-mining',
                name: 'Mining Laser',
                damage_type: 'kinetic',
                hit_chance: 0.35,
                hit_roll: 0.61,
              },
            ],
            defense_components: [
              {
                weapon_instance_id: 'w-rail',
                weapon_name: 'Railgun',
                damage_type: 'energy',
                incoming_damage: 400,
                shield_resist_pct: 5,
                after_shield_resist: 380,
                type_resist_pct: 5,
                after_type_resist: 360,
                flat_reduction_pct: 3,
                after_flat_reduction: 350,
                shield_bypass_pct: 0,
                armor_bypass_pct: 0,
                ignore_all_defense: false,
                final_damage: 350,
                shield_damage: 200,
                hull_damage: 150,
              },
              {
                weapon_instance_id: 'w-cannon',
                weapon_name: 'Pulse Cannon',
                damage_type: 'kinetic',
                incoming_damage: 200,
                shield_resist_pct: 5,
                after_shield_resist: 190,
                type_resist_pct: 5,
                after_type_resist: 180,
                flat_reduction_pct: 6,
                after_flat_reduction: 170,
                shield_bypass_pct: 0,
                armor_bypass_pct: 0,
                ignore_all_defense: false,
                final_damage: 170,
                shield_damage: 140,
                hull_damage: 30,
              },
              leftoverDefenseComponent(),
            ],
          },
        ],
      },
    ],
  });

  const ticks = battleLogTicksSection(stdout);
  const attacks = sectionAfter(stdout, 'Attacks', 'Combatants');

  expect(ticks).toMatch(/\|\s*1\s*\|\s*1\s*\|\s*520\s*\|\s*340\s*\|\s*180\s*\|/);
  expect(attacks.match(/hit 2\/3/g)?.length).toBe(3);
  expect(attacks).toContain('Railgun energy 400→380→360→350 (S5 T5 F3)');
  expect(attacks).toContain('Pulse Cannon kinetic 200→190→180→170 (S5 T5 F6)');
  expect(attacks).toContain('Mining Laser chance 35% roll 61');
  expect(attacks).not.toContain('Ghost Cannon');
  expect(attacks).not.toContain('| miss |');
  expect(stdout).not.toContain('600→');
});

test('get_battle_log live full miss prints per-gun chance/roll and omits leftover Ghost Cannon', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-full-miss',
    status: 'active',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 1,
        snapshots: [
          { player_id: 'player-1', username: 'Ace' },
          { player_id: 'pirate-1', username: 'Raider' },
        ],
        attacks: [
          {
            attacker_id: 'pirate-1',
            target_id: 'player-1',
            hit_success: false,
            final_damage: 0,
            shield_damage: 200,
            hull_damage: 150,
            landed_damage: 0,
            hit_chance: 0.12,
            weapons: [
              {
                instance_id: 'w-scatter',
                name: 'Scatter Cannon',
                damage_type: 'kinetic',
                hit_chance: 0.12,
                hit_roll: 0.81,
              },
              {
                instance_id: 'w-blaster',
                name: 'Light Blaster',
                damage_type: 'kinetic',
                hit_chance: 0.12,
                hit_roll: 0.9,
              },
            ],
            defense_components: [leftoverDefenseComponent()],
          },
        ],
      },
    ],
  });

  const ticks = battleLogTicksSection(stdout);
  const attacks = sectionAfter(stdout, 'Attacks', 'Combatants');

  expect(ticks).toMatch(/\|\s*1\s*\|\s*0\s*\|/);
  expect(ticks).not.toContain('Shield');
  expect(ticks).not.toContain('Hull');
  expect(ticks).not.toContain('200');
  expect(ticks).not.toContain('150');
  expect(attacks.match(/\| miss \|/g)?.length).toBe(2);
  expect(attacks).toContain('Scatter Cannon chance 12% roll 81');
  expect(attacks).toContain('Light Blaster chance 12% roll 90');
  expect(attacks).not.toContain('Ghost Cannon');
  expect(attacks).not.toContain('400→380→360→350');
  expect(attacks).not.toContain('200/150');
});

test('get_battle_log Ticks Hits still counts a volley when every fired weapon omitted hit_success', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-disagree',
    status: 'active',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 1,
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            hit_success: true,
            final_damage: 10,
            shield_damage: 7,
            hull_damage: 3,
            landed_damage: 12,
            weapons: [
              {
                instance_id: 'w-scatter',
                name: 'Scatter Cannon',
                damage_type: 'kinetic',
                hit_chance: 0.12,
                hit_roll: 0.81,
              },
              {
                instance_id: 'w-blaster',
                name: 'Light Blaster',
                damage_type: 'kinetic',
                hit_chance: 0.12,
                hit_roll: 0.9,
              },
            ],
          },
        ],
      },
    ],
  });

  const ticks = battleLogTicksSection(stdout);
  const attacks = sectionAfter(stdout, 'Attacks');

  expect(ticks).toMatch(/\|\s*1\s*\|\s*1\s*\|\s*10\s*\|/);
  expect(attacks.match(/\| miss \|/g)?.length).toBe(2);
  expect(attacks).toContain('Scatter Cannon chance 12% roll 81');
  expect(attacks).toContain('Light Blaster chance 12% roll 90');
  expect(attacks).not.toContain('| hit |');
});

test('get_battle_log uses weapons[0].name when defense_components are absent', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-weapon-name',
    status: 'active',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 2,
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            hit_success: true,
            final_damage: 90,
            shield_damage: 60,
            hull_damage: 30,
            damage_type: 'energy',
            weapons: [{ name: 'Ion Lance', instance_id: 'w-ion' }],
          },
        ],
      },
    ],
  });

  expect(stdout).toContain('Ion Lance energy');
  expect(stdout).toContain('60/30');
});

test('get_battle_log maps snapshot usernames and falls back to id when username is empty', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-names',
    status: 'active',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 0,
        snapshots: [
          { player_id: 'player-1', username: 'Ace' },
          { player_id: 'pirate-1', username: '' },
        ],
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            hit_success: true,
            final_damage: 10,
            shield_damage: 7,
            hull_damage: 3,
          },
        ],
      },
    ],
  });

  const attacks = sectionAfter(stdout, 'Attacks', 'Combatants');

  expect(attacks).toContain('Ace');
  expect(attacks).toContain('pirate-1');
  expect(attacks).not.toContain('player-1');
});

test('get_battle_log blanks Hit when hit_success is missing', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-no-hit-flag',
    status: 'active',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 4,
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            final_damage: 50,
            shield_damage: 20,
            hull_damage: 30,
            shield_resist_pct: 4,
          },
        ],
      },
    ],
  });

  expect(stdout).toContain('|     |');
  expect(stdout).toContain('20/30');
  expect(stdout).toContain('(S4)');
  expect(stdout).not.toContain('| hit |');
  expect(stdout).not.toContain('| miss |');
});

test('get_battle_log ticks do not double-count mixed-weapon component final_damage', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-mixed',
    status: 'active',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 1,
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            hit_success: true,
            final_damage: 520,
            shield_damage: 340,
            hull_damage: 180,
            defense_components: [
              leftoverDefenseComponent(),
              {
                ...leftoverDefenseComponent(),
                weapon_instance_id: 'w-cannon',
                weapon_name: 'Pulse Cannon',
                damage_type: 'kinetic',
                incoming_damage: 200,
                after_shield_resist: 190,
                after_type_resist: 180,
                after_flat_reduction: 170,
                flat_reduction_pct: 6,
                final_damage: 170,
                shield_damage: 140,
                hull_damage: 30,
              },
            ],
          },
        ],
      },
    ],
  });

  expect(stdout).toMatch(/\|\s*520\s*\|\s*340\s*\|\s*180\s*\|/);
  expect(stdout).not.toContain('1040');
  expect(stdout).toContain('200/150');
  expect(stdout).toContain('140/30');
});

test('get_battle_log keeps Shield/Hull 0 on a full absorb with blank Damage', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-absorb',
    status: 'active',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 0,
        attacks: [
          {
            attacker_id: 'pirate-1',
            target_id: 'player-1',
            hit_success: true,
            final_damage: 0,
            shield_damage: 0,
            hull_damage: 0,
            defense_components: [
              {
                ...leftoverDefenseComponent(),
                incoming_damage: 100,
                after_shield_resist: 0,
                after_type_resist: 0,
                after_flat_reduction: 0,
                final_damage: 0,
                shield_damage: 0,
                hull_damage: 0,
              },
            ],
          },
        ],
      },
    ],
  });

  expect(stdout).toMatch(/\|\s*1\s*\|\s*1\s*\|\s+\|\s*0\s*\|\s*0\s*\|/);
  expect(stdout).toContain('0/0');
});

test('get_battle_log omits Board Captures Casualties columns without those arrays', () => {
  const stdout = renderBattleLog(structuredClone(battleLogFixture) as Record<string, unknown>);
  const ticks = battleLogTicksSection(stdout);

  expect(ticks).not.toContain('Board');
  expect(ticks).not.toContain('Moves');
  expect(ticks).not.toContain('Captures');
  expect(ticks).not.toContain('Casualties');
  expect(stdout).not.toContain('=== Boarding ===');
  expect(stdout).not.toContain('=== Zone moves ===');
  expect(stdout).not.toContain('=== Captures ===');
  expect(stdout).not.toContain('=== Personnel casualties ===');
});

test('get_battle_log prints zone moves after ticks with retreat_intercepted gloss', () => {
  const stdout = renderBattleLog(structuredClone(battleLogZoneMovesFixture) as Record<string, unknown>);
  const ticks = battleLogTicksSection(stdout);
  const zoneMoves = sectionAfter(stdout, 'Zone moves');

  expect(stdout).not.toContain('=== Attacks ===');
  expect(stdout).not.toContain('=== Boarding ===');
  expect(ticks).toContain('Moves');
  expect(ticks).not.toContain('Board');
  expect(stdout.indexOf('=== Ticks ===')).toBeLessThan(stdout.indexOf('=== Zone moves ==='));
  expect(zoneMoves).toContain('player-1');
  expect(zoneMoves).toContain('outer');
  expect(zoneMoves).toContain('middle');
  expect(zoneMoves).toContain('retreat_intercepted (retreat cancelled by interceptor)');
  expect(zoneMoves).toContain('pirate-1');
  expect(zoneMoves).toContain('pulled_closer');
  expect(zoneMoves).not.toContain('pulled_closer (');
});

test('get_battle_log places Zone moves between Boarding and Captures', () => {
  const fixture = structuredClone(battleLogBoardingFixture) as Record<string, unknown>;
  const entries = fixture.entries as Array<Record<string, unknown>>;
  const firstEntry = entries[0];
  expect(firstEntry).toBeDefined();
  if (!firstEntry) return;
  firstEntry.zone_moves = [
    {
      player_id: 'player-1',
      old_zone: 'outer',
      new_zone: 'middle',
      reason: 'retreat_intercepted',
    },
  ];
  const stdout = renderBattleLog(fixture);
  const ticks = battleLogTicksSection(stdout);

  expect(ticks).toContain('Board');
  expect(ticks).toContain('Moves');
  expect(ticks).toContain('Captures');
  expect(stdout.indexOf('=== Boarding ===')).toBeLessThan(stdout.indexOf('=== Zone moves ==='));
  expect(stdout.indexOf('=== Zone moves ===')).toBeLessThan(stdout.indexOf('=== Captures ==='));
});

test('get_battle_log prints boarding detail tables after ticks when there are no attacks', () => {
  const stdout = renderBattleLog(structuredClone(battleLogBoardingFixture) as Record<string, unknown>);
  const ticks = battleLogTicksSection(stdout);

  expect(stdout).not.toContain('=== Attacks ===');
  expect(ticks).toContain('Board');
  expect(ticks).toContain('Captures');
  expect(ticks).toContain('Casualties');
  expect(stdout.indexOf('=== Ticks ===')).toBeLessThan(stdout.indexOf('=== Boarding ==='));
  expect(stdout.indexOf('=== Boarding ===')).toBeLessThan(stdout.indexOf('=== Captures ==='));
  expect(stdout.indexOf('=== Captures ===')).toBeLessThan(stdout.indexOf('=== Personnel casualties ==='));
  expect(stdout).toContain('board-1');
  expect(stdout).toContain('progress');
  expect(stdout).not.toContain('plundered (cargo taken, hull left)');
  expect(stdout).toContain('breach');
  expect(stdout).toContain('marines_committed');
  expect(stdout).toContain('yes attacker defender');
  expect(stdout).toContain('Marlowe (player-1)');
  expect(stdout).toContain('Corsair-7 (pirate-1)');
  expect(stdout).toContain('applied');
  expect(stdout).not.toContain('converted');
  expect(stdout).toContain('player-1 / ship-marlowe-1');
  expect(stdout).not.toContain('Kind');
  expectNoPrizeOrLocation(captureHeader(sectionAfter(stdout, 'Captures', 'Personnel casualties')));
  expectNoPersonnelCounts(stdout);
});

function boardingLogFixture(event: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    battle_id: 'battle-42',
    status: 'completed',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 3,
        boarding: [{ operation_id: 'board-1', event, phase: 'hold', ...extra }],
      },
    ],
  };
}

test('get_battle_log arena uses KOs and glosses boarding reasons', () => {
  const stdout = renderBattleLog(structuredClone(battleLogArenaFixture) as Record<string, unknown>);
  expect(stdout).toContain('Arena match: knockouts restore ships, drones, and personnel');
  expect(stdout).toContain('Ammo, fuel, and consumables stay spent');
  expect(stdout).toContain('| KOs |');
  expect(stdout).not.toContain('| Kills |');
  const boarding = sectionAfter(stdout, 'Boarding');
  expect(boarding).toContain('closing_stalled (latch made no progress; withdrawn so the battle can end)');
  expect(boarding).toContain('boarding_rejected (attempt refused; see Reason)');
  expect(boarding).not.toContain('...');
});

test('get_battle_log recovered arena summary uses knockout labels', () => {
  const fixture = structuredClone(battleLogInterruptedFixture) as Record<string, unknown>;
  const summary = recoveredSummaryOf(fixture);
  summary.category = 'arena';
  summary.ships_destroyed = 1;
  summary.destroyed_names = ['Kestrel'];
  const stdout = renderBattleLog(fixture);
  const recovered = sectionAfter(stdout, 'Recovered Summary');
  expect(recovered).toContain('Category: arena');
  expect(recovered).toContain('Arena match: knockouts restore ships, drones, and personnel');
  expect(recovered).toContain('Ships Knocked Out: 1');
  expect(recovered).toContain('Knocked out: Kestrel');
  expect(recovered).not.toContain('Ships Destroyed');
});

test('get_battle_log hunt prints the hunt note and keeps Kills', () => {
  const stdout = renderBattleLog(structuredClone(battleLogHuntFixture) as Record<string, unknown>);
  expect(stdout).toContain(
    'Wildlife hunt: creatures have hull and armor but no shields; kills drop carcass wrecks. Wildlife never dogpiles. Most creatures flee when badly hurt; some apex never flee.',
  );
  expect(stdout).toContain('| Kills |');
  expect(stdout).not.toContain('| KOs |');
  expect(stdout).toContain('victory');
  expect(stdout).not.toContain('| Board |');
  expect(stdout).not.toContain('=== Boarding ===');
});

test('get_battle_log recovered hunt summary uses hunt labels', () => {
  // Header also shows the hunt note (unlike the arena recovered clone); assert recovered only.
  const fixture = structuredClone(battleLogInterruptedFixture) as Record<string, unknown>;
  const summary = recoveredSummaryOf(fixture);
  summary.category = 'wildlife';
  summary.ships_destroyed = 1;
  summary.destroyed_names = ['Pilot Whale'];
  const stdout = renderBattleLog(fixture);
  const recovered = sectionAfter(stdout, 'Recovered Summary');
  expect(recovered).toContain('Category: wildlife');
  expect(recovered).toContain(
    'Wildlife hunt: creatures have hull and armor but no shields; kills drop carcass wrecks. Wildlife never dogpiles. Most creatures flee when badly hurt; some apex never flee.',
  );
  expect(recovered).toContain('Destroyed: 1');
  expect(recovered).toContain('Killed: Pilot Whale');
  expect(recovered).not.toContain('Ships Destroyed');
});

test('get_battle_log mixed arena flag and hunt recovered category splits', () => {
  const fixture = structuredClone(battleLogInterruptedFixture) as Record<string, unknown>;
  const entry = (fixture.entries as Array<Record<string, unknown>>)[0];
  if (!entry) throw new Error('expected log entry');
  entry.arena = true;
  recoveredSummaryOf(fixture).category = 'wildlife';
  const stdout = renderBattleLog(fixture);
  const beforeRecovered = stdout.split('=== Recovered Summary ===')[0] ?? '';
  const ticks = battleLogTicksOnly(stdout);
  const recovered = sectionAfter(stdout, 'Recovered Summary');
  expect(beforeRecovered).toContain('Arena match: knockouts restore ships, drones, and personnel');
  expect(beforeRecovered).not.toContain('Wildlife hunt');
  expect(ticks).toContain('| KOs |');
  expect(ticks).not.toContain('| Kills |');
  expect(recovered).toContain('Category: wildlife');
  expect(recovered).toContain('Wildlife hunt:');
  expect(recovered).not.toContain('Arena match');
  expect(recovered).not.toContain('Ships Knocked Out');
});

test('get_battle_log Event glosses plundered without truncating', () => {
  const stdout = renderBattleLog(structuredClone(battleLogPlunderedFixture) as Record<string, unknown>);
  const boarding = sectionAfter(stdout, 'Boarding');

  expect(boarding).toContain('plundered (cargo taken, hull left)');
  expect(boarding).not.toContain('hul...');
  expect(stdout).not.toContain('=== Captures ===');
  expect(stdout).not.toContain('=== Personnel casualties ===');
});

test('get_battle_log Event uses event_type when event is absent', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-42',
    status: 'completed',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 3,
        boarding: [{ operation_id: 'board-1', event_type: 'plundered', phase: 'hold' }],
      },
    ],
  });

  expect(sectionAfter(stdout, 'Boarding')).toContain('plundered (cargo taken, hull left)');
});

test('get_battle_log Event prints target_self_destructed without a gloss', () => {
  const boarding = sectionAfter(renderBattleLog(boardingLogFixture('target_self_destructed')), 'Boarding');

  expect(boarding).toContain('target_self_destructed');
  expect(boarding).not.toContain('(');
});

test('get_battle_log Event prints unknown live tokens as-is', () => {
  const boarding = sectionAfter(renderBattleLog(boardingLogFixture('weird_live_token')), 'Boarding');

  expect(boarding).toContain('weird_live_token');
});

test('get_battle_log boarding reason of 40 characters is not clipped', () => {
  const reason = 'x'.repeat(40);
  expect(reason.length).toBe(40);
  const boarding = sectionAfter(renderBattleLog(boardingLogFixture('progress', { reason })), 'Boarding');

  expect(boarding).toContain(reason);
  expect(boarding).not.toContain('...');
});

test('get_battle_log Captures prints Tick and Kind when a capture has captor_kind', () => {
  const fixture = structuredClone(battleLogBoardingFixture) as Record<string, unknown>;
  const entries = fixture.entries as Array<Record<string, unknown>>;
  const captures = entries[0]?.captures as Array<Record<string, unknown>>;
  captureRow(captures).captor_kind = 'pirate';
  const stdout = renderBattleLog(fixture);
  const section = sectionAfter(stdout, 'Captures', 'Personnel casualties');
  const header = captureHeader(section);

  expect(header).toContain('Tick');
  expectCaptorThenKindThenFormerOwner(header);
  expect(captureCell(section, 'ship-skiff-1', 'Kind')).toBe('pirate');
  expect(captureCell(section, 'ship-skiff-1', 'Captor')).toBe('Marlowe (player-1)');
  expectNoPrizeOrLocation(header);
  expectNoPersonnelCounts(stdout);
});

test('get_battle_log Captures keeps Kind after Captor and Prize after Boarding', () => {
  const fixture = structuredClone(battleLogBoardingFixture) as Record<string, unknown>;
  const entries = fixture.entries as Array<Record<string, unknown>>;
  const captures = entries[0]?.captures as Array<Record<string, unknown>>;
  Object.assign(captureRow(captures), {
    captor_kind: 'pirate',
    prize_id: 'prize-1',
    prize_poi_id: 'sol_cloudbank',
    prize_poi_name: 'Cloudbank',
    prize_system_id: 'sol',
    prize_system_name: 'Sol',
  });
  const stdout = renderBattleLog(fixture);
  const section = sectionAfter(stdout, 'Captures', 'Personnel casualties');
  const header = captureHeader(section);

  expectHeaderColumnsInOrder(header, [
    'Tick',
    'Ship',
    'Class',
    'Captor',
    'Kind',
    'Former owner',
    'Boarding',
    'Prize',
    'Location',
  ]);
  expect(captureCell(section, 'ship-skiff-1', 'Kind')).toBe('pirate');
  expect(captureCell(section, 'ship-skiff-1', 'Prize')).toBe('prize-1');
  expect(captureCell(section, 'ship-skiff-1', 'Location')).toBe('Cloudbank (Sol)');
  expect(section).not.toContain('moving');
  expectNoPersonnelCounts(stdout);
});

test('get_battle_log prints boarding tables after Attacks when both are present', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-board-attacks',
    status: 'active',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 4,
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            hit_success: true,
            final_damage: 50,
            shield_damage: 20,
            hull_damage: 30,
          },
        ],
        boarding: [
          { operation_id: 'board-2', event: 'latch', phase: 'latch', actor_id: 'player-1', target_id: 'pirate-1' },
        ],
        captures: [],
        personnel_casualties: [],
      },
    ],
  });

  expect(stdout.indexOf('=== Attacks ===')).toBeLessThan(stdout.indexOf('=== Boarding ==='));
  expect(stdout).toContain('board-2');
  expect(stdout).toContain('latch');
  const ticks = battleLogTicksSection(stdout);
  expect(ticks).toContain('Board');
  expect(ticks).not.toContain('Captures');
  expect(ticks).not.toContain('Casualties');
  expect(stdout).not.toContain('=== Captures ===');
  expect(stdout).not.toContain('=== Personnel casualties ===');
});

test('get_battle_log omits Board column when boarding is an empty array', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-empty-board',
    status: 'active',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 1,
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            hit_success: true,
            final_damage: 10,
            shield_damage: 6,
            hull_damage: 4,
          },
        ],
        boarding: [],
        captures: [],
        personnel_casualties: [],
      },
    ],
  });
  const ticks = battleLogTicksSection(stdout);

  expect(ticks).not.toContain('Board');
  expect(ticks).not.toContain('Captures');
  expect(ticks).not.toContain('Casualties');
  expect(stdout).not.toContain('=== Boarding ===');
});

test('get_battle_log casualty flags stay qualitative and hide false destroyed/incapacitated', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-flags',
    status: 'active',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 5,
        boarding: [
          {
            operation_id: 'board-3',
            event: 'hold',
            phase: 'hold',
            actor_id: 'player-1',
            target_id: 'pirate-1',
            destroyed: false,
            casualties_occurred: false,
            attacker_casualties: false,
            defender_casualties: true,
            crew_lost: 6,
            marines_lost: 3,
            fit_crew: 8,
            fit_marines: 4,
            injured_crew: 2,
          },
        ],
        personnel_casualties: [
          {
            target_id: 'pirate-1',
            casualties_occurred: false,
            incapacitated: false,
            triage_applied: false,
            triage_converted: true,
            crew_lost: 6,
            fit_crew: 8,
          },
        ],
      },
    ],
  });
  const boarding = stdout.split('=== Boarding ===')[1]?.split('=== Personnel casualties ===')[0] ?? '';
  const casualties = stdout.split('=== Personnel casualties ===')[1] ?? '';

  expect(boarding).toContain('defender');
  expect(boarding).not.toContain('Destroyed');
  expect(casualties).toContain('no');
  expect(casualties).not.toContain('Incapacitated');
  expect(casualties).toContain('converted');
  expect(casualties).not.toContain('applied');
  expectNoPersonnelCounts(stdout);
  expect(stdout).not.toContain('crew_lost');
  expect(stdout).not.toContain('marines_lost');
});

test('get_battle_log omits Attacks and legend when no attack objects exist', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-burns',
    status: 'active',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 8,
        burns: [{ target_id: 'pirate-1', damage: 20, ticks_remaining: 2 }],
        kills: [{ victim_id: 'pirate-1', killer_id: 'player-1' }],
      },
    ],
  });

  expect(stdout).toContain('=== Ticks ===');
  expect(stdout).not.toContain('=== Attacks ===');
  expect(stdout).not.toContain('incoming→shield skill');
});

test('get_battle_log omits Combatants when snapshots are omitted or empty', () => {
  const omitted = renderBattleLog(structuredClone(battleLogFixture) as Record<string, unknown>);
  expect(omitted).not.toContain('=== Combatants ===');

  const empty = renderBattleLog({
    battle_id: 'battle-empty-snapshots',
    status: 'active',
    total_ticks: 1,
    has_more: false,
    entries: [
      {
        tick: 0,
        snapshots: [],
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            hit_success: true,
            final_damage: 10,
            shield_damage: 7,
            hull_damage: 3,
          },
        ],
      },
    ],
  });
  expect(empty).toContain('=== Attacks ===');
  expect(empty).not.toContain('=== Combatants ===');
});

test('get_battle_log prints Combatants Kind/NPC/Boss and Boss prefix on Attacks', () => {
  const stdout = renderBattleLog(structuredClone(battleLogSnapshotsFixture) as Record<string, unknown>);
  const combatants = sectionAfter(stdout, 'Combatants');
  const attacks = sectionAfter(stdout, 'Attacks', 'Combatants');
  const header = combatants
    .split('\n')
    .find((line) => line.includes('|') && line.includes('Name') && line.includes('ID'));

  expect(stdout).toContain('=== Combatants ===');
  expect(stdout).not.toContain('=== Recovered Summary ===');
  expect(stdout.indexOf('=== Attacks ===')).toBeLessThan(stdout.indexOf('=== Combatants ==='));
  expect(header).toContain('Kind');
  expect(header).toContain('NPC');
  expect(header).toContain('Boss');
  expect(header?.indexOf('Kind') ?? -1).toBeLessThan(header?.indexOf('NPC') ?? -1);
  expect(header?.indexOf('NPC') ?? -1).toBeLessThan(header?.indexOf('Boss') ?? -1);
  expect(tableCell(combatants, 'Marlowe', 'Kind')).toBe('player');
  expect(tableCell(combatants, 'Marlowe', 'NPC')).toBe('no');
  expect(tableCell(combatants, 'Marlowe', 'Boss')).toBe('no');
  expect(tableCell(combatants, 'Corsair', 'Kind')).toBe('pirate');
  expect(tableCell(combatants, 'Corsair', 'NPC')).toBe('yes');
  expect(tableCell(combatants, 'Corsair', 'Boss')).toBe('no');
  expect(tableCell(combatants, 'Dreadnought', 'Kind')).toBe('pirate');
  expect(tableCell(combatants, 'Dreadnought', 'NPC')).toBe('yes');
  expect(tableCell(combatants, 'Dreadnought', 'Boss')).toBe('yes');
  expect(tableCell(combatants, 'Legacy Raider', 'Kind')).toBe('pirate');
  expect(tableCell(combatants, 'Legacy Raider', 'NPC')).toBe('');
  expect(tableCell(combatants, 'Legacy Raider', 'Boss')).toBe('');
  expect(attacks).toContain('Boss Dreadnought');
  expect(attacks).toContain('Marlowe');
  expect(attacks).not.toContain('pirate-boss-1');
  expect(attacks).not.toContain('player-1');
});

function battleLogTicksOnly(stdout: string): string {
  return (stdout.split('=== Ticks ===')[1] ?? '').split('===')[0] ?? '';
}

function recoveredSummaryOf(fixture: Record<string, unknown>): Record<string, unknown> {
  const entries = fixture.entries as Array<Record<string, unknown>>;
  const recovered = entries[0]?.recovered_summary;
  if (!recovered || typeof recovered !== 'object' || Array.isArray(recovered)) {
    throw new Error('expected recovered_summary record');
  }
  return recovered as Record<string, unknown>;
}

test('get_battle_log interrupted without recovered_summary only prints Ended interrupted', () => {
  const fixture = structuredClone(battleLogInterruptedFixture) as Record<string, unknown>;
  const entries = fixture.entries as Array<Record<string, unknown>>;
  delete entries[0]?.recovered_summary;
  const stdout = renderBattleLog(fixture);
  const ticks = battleLogTicksOnly(stdout);

  expect(ticks).toContain('interrupted');
  expect(ticks).not.toContain('-1');
  expect(stdout).not.toContain('=== Recovered Summary ===');
  expect(stdout).not.toContain('=== Recovered Participants ===');
  expect(stdout).not.toContain('=== Recovered Side Factions ===');
  expect(stdout).not.toContain('=== Recovered Captures ===');
  expect(stdout).not.toContain('=== Combatants ===');
  expect(stdout).not.toContain('Duration: 8 ticks');
  expect(stdout).not.toContain('Total Damage:');
  expect(stdout).not.toContain('Start Tick:');
  expect(stdout).not.toContain('Ships Destroyed:');
  expect(stdout).not.toContain('Winning Side:');
});

test('get_battle_log interrupted with recovered_summary prints recovered block and Ended interrupted', () => {
  const stdout = renderBattleLog(structuredClone(battleLogInterruptedFixture) as Record<string, unknown>);
  const ticks = battleLogTicksOnly(stdout);
  const recovered = sectionAfter(stdout, 'Recovered Summary', 'Recovered Side Factions');
  const participants = sectionAfter(stdout, 'Recovered Participants', 'Recovered Captures');

  expect(ticks).toContain('interrupted');
  expect(ticks).not.toContain('-1');
  expect(stdout).toContain('=== Recovered Summary ===');
  expect(recovered).toContain('Tick: 8');
  expect(recovered).toContain('Category: pvp');
  expect(recovered).toContain('Start Tick: 900100');
  expect(recovered).toContain('Duration: 8 ticks');
  expect(recovered).toContain('Total Damage: 1200');
  expect(recovered).toContain('Ships Destroyed: 0');
  expect(recovered).toContain('Ships Captured: 1');
  expect(recovered).not.toContain('Outcome:');
  expect(recovered).not.toContain('Winning Side:');
  expect(stdout).toContain('=== Recovered Side Factions ===');
  expect(stdout).toContain('SMC');
  expect(stdout).toContain('pirate_kael');
  expect(stdout).not.toContain('[object Object]');
  expect(stdout).toContain('=== Recovered Participants ===');
  expect(tableCell(participants, 'Marlowe', 'Kind')).toBe('player');
  expect(tableCell(participants, 'Marlowe', 'NPC')).toBe('no');
  expect(tableCell(participants, 'Marlowe', 'Boss')).toBe('no');
  expect(tableCell(participants, 'Dreadnought', 'Kind')).toBe('pirate');
  expect(tableCell(participants, 'Dreadnought', 'NPC')).toBe('yes');
  expect(tableCell(participants, 'Dreadnought', 'Boss')).toBe('yes');
  expect(stdout).toContain('=== Recovered Captures ===');
  expect(stdout).toContain('ship-skiff-1');
  expect(stdout).toContain('Marlowe (player-1)');
  expect(stdout).toContain('Corsair (pirate-1)');
  const recoveredCaptures = sectionAfter(stdout, 'Recovered Captures');
  const recoveredCapturesHeader = captureHeader(recoveredCaptures);
  expect(recoveredCapturesHeader).toBeDefined();
  expect(recoveredCapturesHeader).not.toContain('Kind');
  expectNoPrizeOrLocation(recoveredCapturesHeader);
  expect(recoveredCapturesHeader).toMatch(/Ship\s*\|\s*Class\s*\|\s*Captor\s*\|\s*Former owner\s*\|\s*Boarding/);
  expect(stdout).not.toContain('=== Combatants ===');
  expect(stdout).not.toContain('Players:');
});

test('get_battle_log recovered Captures prints Kind after Captor when a capture has captor_kind', () => {
  const fixture = structuredClone(battleLogInterruptedFixture) as Record<string, unknown>;
  const captures = recoveredSummaryOf(fixture).captures as Array<Record<string, unknown>>;
  captureRow(captures).captor_kind = 'pirate';
  const stdout = renderBattleLog(fixture);
  const participants = sectionAfter(stdout, 'Recovered Participants', 'Recovered Captures');
  const recoveredCaptures = sectionAfter(stdout, 'Recovered Captures');

  expect(tableCell(participants, 'Marlowe', 'Kind')).toBe('player');
  expect(tableCell(participants, 'Dreadnought', 'Kind')).toBe('pirate');
  expectCaptorThenKindThenFormerOwner(captureHeader(recoveredCaptures));
  expect(captureCell(recoveredCaptures, 'ship-skiff-1', 'Kind')).toBe('pirate');
  expect(captureCell(recoveredCaptures, 'ship-skiff-1', 'Captor')).toBe('Marlowe (player-1)');
  expectNoPrizeOrLocation(captureHeader(recoveredCaptures));
  expectNoPersonnelCounts(stdout);
});

test('get_battle_log recovered Captures keeps Kind after Captor and Prize after Boarding', () => {
  const fixture = structuredClone(battleLogInterruptedFixture) as Record<string, unknown>;
  const captures = recoveredSummaryOf(fixture).captures as Array<Record<string, unknown>>;
  Object.assign(captureRow(captures), {
    captor_kind: 'pirate',
    prize_id: 'prize-1',
    prize_poi_id: 'sol_cloudbank',
    prize_poi_name: 'Cloudbank',
    prize_system_id: 'sol',
    prize_system_name: 'Sol',
  });
  const stdout = renderBattleLog(fixture);
  const recoveredCaptures = sectionAfter(stdout, 'Recovered Captures');
  const header = captureHeader(recoveredCaptures);

  expect(header).not.toContain('Tick');
  expectHeaderColumnsInOrder(header, [
    'Ship',
    'Class',
    'Captor',
    'Kind',
    'Former owner',
    'Boarding',
    'Prize',
    'Location',
  ]);
  expect(captureCell(recoveredCaptures, 'ship-skiff-1', 'Kind')).toBe('pirate');
  expect(captureCell(recoveredCaptures, 'ship-skiff-1', 'Prize')).toBe('prize-1');
  expect(captureCell(recoveredCaptures, 'ship-skiff-1', 'Location')).toBe('Cloudbank (Sol)');
  expect(recoveredCaptures).not.toContain('moving');
  expectNoPersonnelCounts(stdout);
});

test('get_battle_log omits recovered block when recovered_summary is absent', () => {
  const stdout = renderBattleLog(structuredClone(battleLogFixture) as Record<string, unknown>);
  expect(stdout).not.toContain('=== Recovered Summary ===');
  expect(stdout).not.toContain('=== Recovered Participants ===');
  expect(stdout).not.toContain('=== Recovered Captures ===');
});

test('get_battle_log empty recovered captures and side_factions omit those tables', () => {
  const fixture = structuredClone(battleLogInterruptedFixture) as Record<string, unknown>;
  const recovered = recoveredSummaryOf(fixture);
  recovered.captures = [];
  recovered.side_factions = {};
  const stdout = renderBattleLog(fixture);

  expect(stdout).toContain('=== Recovered Summary ===');
  expect(stdout).toContain('=== Recovered Participants ===');
  expect(stdout).not.toContain('=== Recovered Captures ===');
  expect(stdout).not.toContain('=== Recovered Side Factions ===');
  expect(stdout).not.toContain('(None)');
});

test('get_battle_log prints recovered Players names only when participants are empty', () => {
  const named = structuredClone(battleLogInterruptedFixture) as Record<string, unknown>;
  const namedSummary = recoveredSummaryOf(named);
  namedSummary.participants = [];
  namedSummary.participant_names = ['Marlowe', 'Corsair'];
  namedSummary.captures = [];
  namedSummary.side_factions = {};
  const namedStdout = renderBattleLog(named);

  expect(namedStdout).toContain('Players: Marlowe, Corsair');
  expect(namedStdout).not.toContain('=== Recovered Participants ===');

  const rostered = structuredClone(battleLogInterruptedFixture) as Record<string, unknown>;
  recoveredSummaryOf(rostered).participant_names = ['Marlowe', 'Corsair'];
  const rosteredStdout = renderBattleLog(rostered);

  expect(rosteredStdout).toContain('=== Recovered Participants ===');
  expect(rosteredStdout).not.toContain('Players:');
});

test('get_battle_log recovered summary keeps zero scalars and omits absent ships_captured', () => {
  const zeros = structuredClone(battleLogInterruptedFixture) as Record<string, unknown>;
  const zeroSummary = recoveredSummaryOf(zeros);
  zeroSummary.start_tick = 0;
  zeroSummary.duration = 0;
  zeroSummary.total_damage = 0;
  zeroSummary.ships_destroyed = 0;
  zeroSummary.ships_captured = 0;
  const zeroStdout = renderBattleLog(zeros);
  const zeroBlock = sectionAfter(zeroStdout, 'Recovered Summary', 'Recovered Side Factions');

  expect(zeroBlock).toContain('Start Tick: 0');
  expect(zeroBlock).toContain('Duration: 0 ticks');
  expect(zeroBlock).toContain('Total Damage: 0');
  expect(zeroBlock).toContain('Ships Destroyed: 0');
  expect(zeroBlock).toContain('Ships Captured: 0');

  const omitted = structuredClone(battleLogInterruptedFixture) as Record<string, unknown>;
  delete recoveredSummaryOf(omitted).ships_captured;
  const omittedStdout = renderBattleLog(omitted);

  expect(omittedStdout).toContain('Ships Destroyed: 0');
  expect(omittedStdout).not.toContain('Ships Captured:');
});

test('get_battle_log emits one recovered block per entry that has recovered_summary', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-42',
    status: 'completed',
    total_ticks: 2,
    has_more: false,
    entries: [
      {
        battle_id: 'battle-42',
        system_id: 'sol',
        tick: 7,
        snapshots: [],
        recovered_summary: {
          start_tick: 1,
          duration: 1,
          total_damage: 10,
          ships_destroyed: 0,
          category: 'pvp',
          participants: [],
        },
      },
      {
        battle_id: 'battle-42',
        system_id: 'sol',
        tick: 8,
        snapshots: [],
        recovered_summary: {
          start_tick: 1,
          duration: 2,
          total_damage: 20,
          ships_destroyed: 0,
          category: 'pvp',
          participants: [],
        },
      },
    ],
  });

  expect(stdout.split('=== Recovered Summary ===').length - 1).toBe(2);
  expect(stdout).toContain('Tick: 7');
  expect(stdout).toContain('Tick: 8');
  expect(stdout).toContain('Duration: 1 ticks');
  expect(stdout).toContain('Duration: 2 ticks');
});

test('get_battle_log interrupted JSON passthrough keeps winning_side -1 and recovered_summary', () => {
  const rendered = renderStructuredResult(
    'get_battle_log',
    structuredClone(battleLogInterruptedFixture),
    { ...options, format: 'json' },
    context,
  );
  const parsed = JSON.parse(rendered.stdout.join('\n')) as {
    entries: Array<{
      battle_ended?: { winning_side?: unknown; outcome?: unknown };
      recovered_summary?: Record<string, unknown>;
    }>;
  };
  const entry = parsed.entries[0];

  expect(entry?.battle_ended?.winning_side).toBe(-1);
  expect(entry?.battle_ended?.outcome).toBe('interrupted');
  expect(entry?.recovered_summary).toMatchObject({
    category: 'pvp',
    duration: 8,
    ships_captured: 1,
  });
});

test('get_battle_log Combatants last-write identity while Attacks stay per-tick', () => {
  const stdout = renderBattleLog({
    battle_id: 'battle-last-write',
    status: 'active',
    total_ticks: 2,
    has_more: false,
    entries: [
      {
        tick: 0,
        snapshots: [
          { player_id: 'player-1', username: 'Ace', kind: 'player', is_npc: false, is_boss: false },
          { player_id: 'pirate-1', username: 'Raider', kind: 'pirate', is_npc: true, is_boss: false },
        ],
        attacks: [
          {
            attacker_id: 'pirate-1',
            target_id: 'player-1',
            hit_success: true,
            final_damage: 1,
            shield_damage: 1,
            hull_damage: 0,
          },
        ],
      },
      {
        tick: 1,
        snapshots: [{ player_id: 'pirate-1', username: 'Dreadnought', kind: 'pirate', is_npc: true, is_boss: true }],
        attacks: [
          {
            attacker_id: 'pirate-1',
            target_id: 'player-1',
            hit_success: true,
            final_damage: 2,
            shield_damage: 1,
            hull_damage: 1,
          },
        ],
      },
    ],
  });
  const combatants = sectionAfter(stdout, 'Combatants');
  const attacks = sectionAfter(stdout, 'Attacks', 'Combatants');

  expect(tableCell(combatants, 'Ace', 'NPC')).toBe('no');
  expect(tableCell(combatants, 'Ace', 'Boss')).toBe('no');
  expect(tableCell(combatants, 'Dreadnought', 'NPC')).toBe('yes');
  expect(tableCell(combatants, 'Dreadnought', 'Boss')).toBe('yes');
  expect(combatants).not.toContain('Raider');
  expect(attacks).toContain('Raider');
  expect(attacks).toContain('Boss Dreadnought');
});

test('faction_facility_list renders status, damaged yes/no, and custom names', () => {
  const rendered = renderStructuredResult(
    'faction_facility_list',
    structuredClone(factionFacilityListFixture),
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Faction: faction-1');
  expect(stdout).toContain('Faction Facilities at earth_station');
  expect(stdout).toMatch(/Status/);
  expect(stdout).toMatch(/Damaged/);
  expect(stdout).toContain('Repair Tick');
  expect(stdout).toContain('901412');
  expect(stdout).toContain('active');
  expect(stdout).toContain('damaged');
  expect(stdout).toContain('under_construction');
  expect(stdout).toContain('dismantling');
  expect(stdout).toContain('yes');
  expect(stdout).toContain('no');
  expect(stdout).toContain('800cr (paused)');
  expect(stdout).toContain('1,200cr (paused)');
  expect(stdout).toContain('600cr (paused)');
  expect(stdout).toContain('Alloy One (Alloy Smelter)');
  const section = sectionAfter(stdout, 'Faction Facilities at earth_station');
  expect(tableCell(section, 'faction-smelter', 'Rent')).toBe('1,200cr');
  expect(tableCell(section, 'faction-bunker', 'Rent')).toBe('800cr (paused)');
  expect(tableCell(section, 'faction-yard', 'Rent')).toBe('1,200cr (paused)');
  expect(tableCell(section, 'faction-hangar', 'Status')).toBe('dismantling');
  expect(tableCell(section, 'faction-hangar', 'Rent')).toBe('600cr (paused)');
  expect(stdout).toContain('Faction storage:');
  expect(stdout).toContain('Faction rent bill: 1,200cr/cycle');
  expect(stdout).toContain('Facilities: 4');
  expect(stdout).toContain('Estimated rent/day: 7,200cr');
  expect(stdout).toContain('Grace remaining: 1 cycle');
  expect(stdout).toContain('Faction facilities pay rent from the treasury each cycle.');
  expect(stdout).not.toContain('Faction arrears');
  expect(stdout).toContain('Damaged facilities produce nothing.');
  expect(stdout).toContain('rebuilds its own faction');
  expect(stdout).toContain('facility repair');
  expect(stdout).toContain('jump the queue');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toMatch(/NaN|undefined|\[object Object\]/);
});

test('faction_facility_list empty array still claims response with (None)', () => {
  const fixture = {
    action: 'faction_list',
    base_id: 'earth_station',
    faction_id: 'faction-1',
    faction_facilities: [] as Array<Record<string, unknown>>,
    hint: 'No faction facilities at this station.',
  };
  const rendered = renderStructuredResult('faction_facility_list', fixture, options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Faction: faction-1');
  expect(stdout).toContain('(None)');
  expect(stdout).toContain('No faction facilities at this station.');
  expect(stdout).not.toContain('Faction rent bill');
  expect(stdout).not.toContain('Facilities:');
  expect(stdout).not.toContain('=== Response ===');
});

test('faction_facility_list prints zero recurring rent when billing is paused', () => {
  const fixture = {
    action: 'faction_list',
    base_id: 'earth_station',
    faction_id: 'faction-1',
    faction_facilities: [] as Array<Record<string, unknown>>,
    faction_rent: { facilities: 2, total_rent_per_cycle: 0, est_rent_per_day: 0 },
    hint: 'No faction facilities at this station.',
  };
  const stdout = renderStructuredResult('faction_facility_list', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Faction rent bill: 0cr/cycle');
  expect(stdout).toContain('Facilities: 2');
});

test('faction_facility_list does not claim grouped facility_list payloads', () => {
  const rendered = renderStructuredResult(
    'faction_facility_list',
    structuredClone(facilityListFixture),
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');

  // Matcher rejects station_facilities/player_facilities; must not use the
  // faction_list-only single-table title (grouped list may still shape-match).
  expect(stdout).not.toContain('Faction Facilities at earth_station');
  expect(stdout).not.toContain('Faction: faction-1');
});

test('faction_facility_list omits Damaged column when no damaged fields', () => {
  const fixture = {
    action: 'faction_list',
    base_id: 'earth_station',
    faction_id: 'faction-1',
    faction_facilities: [
      {
        facility_id: 'faction-yard',
        type: 'faction_shipyard_berth',
        name: 'Shipyard Berth',
        level: 1,
        faction_service: 'shipyard',
        rent_per_cycle: 1200,
        status: 'under_construction',
        ticks_until_complete: 12,
      },
      {
        facility_id: 'faction-smelter',
        type: 'alloy_smelter',
        name: 'Alloy Smelter',
        level: 1,
        faction_service: 'production',
        rent_per_cycle: 1200,
        status: 'active',
      },
    ],
    hint: 'No damaged facilities.',
  };
  const stdout = renderStructuredResult('faction_facility_list', fixture, options, context).stdout.join('\n');

  expect(stdout).toMatch(/Name\s+\|\s+Type\s+\|\s+ID\s+\|\s+Level\s+\|\s+Status\s+\|\s+Building\s+\|\s+Service/);
  expect(stdout).not.toMatch(/\|\s*Damaged\s*\|/);
  expect(stdout).toMatch(/\|\s*Building\s*$|\|\s*Building\b/);
  expect(stdout).toContain('12');
  expect(stdout).not.toContain('=== Response ===');
});

test('faction_facility_list omits Building column without ticks_until_complete', () => {
  const fixture = {
    action: 'faction_list',
    base_id: 'earth_station',
    faction_id: 'faction-1',
    faction_facilities: [
      {
        facility_id: 'faction-smelter',
        type: 'alloy_smelter',
        name: 'Alloy Smelter',
        level: 1,
        faction_service: 'production',
        rent_per_cycle: 1200,
        status: 'active',
        damaged: false,
      },
    ],
    hint: 'All active.',
  };
  const stdout = renderStructuredResult('faction_facility_list', fixture, options, context).stdout.join('\n');

  expect(stdout).toMatch(/\|\s*Damaged\s*\|/);
  expect(stdout).not.toMatch(/\|\s*Building\b/);
  expect(stdout).not.toContain('Repair Tick');
  expect(stdout).toContain('no');
});

const scanColorOptions: GlobalOptions = { ...options, plain: false };
const scanPirateFg = '#112233';
const scanPirateBg = '#445566';

function renderFactionScan(fixture: Record<string, unknown>, renderOptions: GlobalOptions = options): string {
  const rendered = renderStructuredResult('faction_scan_poi', fixture, renderOptions, context);
  expect(rendered.success).toBe(true);
  return rendered.stdout.join('\n');
}

function scanPirateLine(stdout: string, token: string): string | undefined {
  return stdout.split('\n').find((line) => line.includes(token) && line.trimStart() !== line);
}

function scanWithPirateColors(colors: Record<string, unknown>): Record<string, unknown> {
  const fixture = structuredClone(factionScanPoiFixture) as {
    details: { pirates: Array<Record<string, unknown>> };
  };
  const pirate = { ...fixture.details.pirates[0] };
  delete pirate.primary_color;
  delete pirate.secondary_color;
  fixture.details.pirates[0] = { ...pirate, ...colors };
  return fixture;
}

test('faction_scan_poi nested details prints header and all three sections', () => {
  const stdout = renderFactionScan(structuredClone(factionScanPoiFixture));

  expect(stdout).toContain('=== Faction Scan ===');
  expect(stdout).toContain('POI: Sol Central (sol_central)');
  expect(stdout).toContain('System: sol');
  expect(stdout).toContain('Facility: L2 at earth_station');
  expect(stdout).toContain('Scan power: 36');
  expect(stdout).toContain('Hops: 1');
  expect(stdout).toContain('Signature detected.');
  expect(stdout).toContain('Projected scan contested 2 cloaks.');
  expect(stdout).toContain('=== Players ===');
  expect(stdout).toContain('=== Empire NPCs ===');
  expect(stdout).toContain('Pirates (1):');
  expect(stdout).toContain('  Raider (skiff) - raider - Admiral Kael');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toMatch(/NaN|undefined|\[object Object\]/);
});

test('faction_scan_poi live envelope ignores aliased location and ship', () => {
  const stdout = renderFactionScan({
    details: {
      poi_id: 'sol_central',
      facility_level: 2,
      scan_power: 36,
      hops: 1,
      message: 'Scan complete.',
    },
    location: {
      system_id: 'elsewhere',
      poi_name: 'Home Dock',
      nearby_players: [{ username: 'LocalOp' }],
    },
    ship: { fuel: 9, max_fuel: 100 },
  });

  expect(stdout).toContain('POI: sol_central');
  expect(stdout).not.toContain('Home Dock');
  expect(stdout).not.toContain('elsewhere');
  expect(stdout).not.toContain('LocalOp');
  expect(stdout).not.toContain('Fuel Now');
  expect(stdout).not.toContain('Fuel Max');
  expect(stdout).not.toContain('fuel_max');
  expect(stdout).not.toContain('fuel');
  expect(stdout).not.toContain('=== Online Players ===');
  expect(stdout).not.toContain('=== Response ===');
});

test('faction_scan_poi omits empty contact sections', () => {
  const stdout = renderFactionScan(structuredClone(factionScanPoiEmptyFixture));

  expect(stdout).toContain('=== Faction Scan ===');
  expect(stdout).toContain('POI: sol_central');
  expect(stdout).toContain('Hops: 0');
  expect(stdout).toContain('Scan complete.');
  expect(stdout).not.toContain('=== Players ===');
  expect(stdout).not.toContain('=== Empire NPCs ===');
  expect(stdout).not.toContain('Pirates (');
  expect(stdout).not.toContain('=== Response ===');
});

test('faction_scan_poi omits signature line when signature_detected is false', () => {
  const fixture = structuredClone(factionScanPoiEmptyFixture) as { details: Record<string, unknown> };
  fixture.details.signature_detected = false;
  const stdout = renderFactionScan(fixture);

  expect(stdout).not.toContain('Signature detected.');
});

test('faction_scan_poi omits signature line when signature_detected is omitted', () => {
  const stdout = renderFactionScan(structuredClone(factionScanPoiEmptyFixture));
  expect(stdout).not.toContain('Signature detected.');
});

test('faction_scan_poi prints yellow Signature detected. when true', () => {
  const stdout = renderFactionScan(structuredClone(factionScanPoiFixture), scanColorOptions);

  expect(stdout).toContain('Signature detected.');
  expect(stdout).toContain('\x1b[33m');
  expect(stdout.split('\n').some((line) => line.includes('Signature detected.') && line.includes('\x1b[33m'))).toBe(
    true,
  );
});

test('faction_scan_poi --plain Signature detected. has no ANSI', () => {
  const stdout = renderFactionScan(structuredClone(factionScanPoiFixture), { ...options, plain: true });
  const line = stdout.split('\n').find((entry) => entry.includes('Signature detected.'));

  expect(line).toBe('Signature detected.');
  expect(stdout).not.toContain('\x1b');
});

test('faction_scan_poi omits Hull column when no contact has hull', () => {
  const stdout = renderFactionScan(structuredClone(factionScanPoiPartialFixture));
  const section = sectionAfter(stdout, 'Players');

  expect(section).toContain('Cloaked');
  expect(section).not.toMatch(/\|\s*Hull\s*\|/);
  expect(section).not.toMatch(/\|\s*Hull\s*$/);
});

test('faction_scan_poi cloaked partial falls back to target_id', () => {
  const stdout = renderFactionScan(structuredClone(factionScanPoiPartialFixture));
  const section = sectionAfter(stdout, 'Players');

  expect(tableCell(section, 'player-cloaked-1', 'Name')).toBe('player-cloaked-1');
  expect(tableCell(section, 'player-cloaked-1', 'Cloaked')).toBe('yes');
  expect(tableCell(section, 'player-cloaked-1', 'Revealed')).toBe('cloaked, ship_class');
});

test('faction_scan_poi pirate crew prefers faction_name then faction', () => {
  const stdout = renderFactionScan({
    details: {
      poi_id: 'sol_central',
      facility_level: 1,
      scan_power: 8,
      hops: 0,
      message: 'Crew labels.',
      pirates: [
        { id: 'p-named', name: 'Named', faction: 'pirate_kael', faction_name: 'Admiral Kael' },
        { id: 'p-id', name: 'Keyed', faction: 'pirate_voss' },
        { id: 'p-plain', name: 'Plain' },
      ],
    },
  });

  expect(scanPirateLine(stdout, 'Named')).toBe('  Named - Admiral Kael');
  expect(scanPirateLine(stdout, 'Keyed')).toBe('  Keyed - pirate_voss');
  expect(scanPirateLine(stdout, 'Plain')).toBe('  Plain');
  expect(stdout).not.toContain('Plain - ');
});

test('faction_scan_poi pirate lines start with two spaces then the name', () => {
  const stdout = renderFactionScan(structuredClone(factionScanPoiFixture));
  const line = scanPirateLine(stdout, 'Raider');

  expect(line?.startsWith('  Raider')).toBe(true);
});

test('faction_scan_poi named pirate line omits id while JSON keeps it', () => {
  const stdout = renderFactionScan(structuredClone(factionScanPoiFixture));
  expect(scanPirateLine(stdout, 'Raider')).toBe('  Raider (skiff) - raider - Admiral Kael');
  expect(scanPirateLine(stdout, 'Raider')).not.toContain('pirate-1');

  const rendered = renderStructuredResult(
    'faction_scan_poi',
    structuredClone(factionScanPoiFixture),
    { ...options, format: 'json' },
    context,
  );
  const parsed = JSON.parse(rendered.stdout.join('\n')) as {
    details: { pirates: Array<Record<string, unknown>> };
  };
  expect(parsed.details.pirates[0]?.id).toBe('pirate-1');
});

test('faction_scan_poi colors pirate names with both crew hex colors', () => {
  const stdout = renderFactionScan(
    scanWithPirateColors({ primary_color: scanPirateFg, secondary_color: scanPirateBg }),
    scanColorOptions,
  );
  const line = scanPirateLine(stdout, 'Raider');

  expect(line).toBe(`  ${hexColor('Raider', scanPirateFg, scanPirateBg)} (skiff) - raider - Admiral Kael`);
  expect(line).toContain('\x1b[38;2');
  expect(line).toContain('\x1b[48;2');
  expect(line?.endsWith('\x1b[0m (skiff) - raider - Admiral Kael')).toBe(true);
});

test('faction_scan_poi colors pirate names with primary color only', () => {
  const stdout = renderFactionScan(scanWithPirateColors({ primary_color: scanPirateFg }), scanColorOptions);
  expect(scanPirateLine(stdout, 'Raider')).toBe(
    `  ${hexColor('Raider', scanPirateFg)} (skiff) - raider - Admiral Kael`,
  );
  expect(scanPirateLine(stdout, 'Raider')).toContain('\x1b[38;2');
  expect(scanPirateLine(stdout, 'Raider')).not.toContain('\x1b[48;2');
});

test('faction_scan_poi colors pirate names with secondary color only', () => {
  const stdout = renderFactionScan(
    scanWithPirateColors({ primary_color: undefined, secondary_color: scanPirateBg }),
    scanColorOptions,
  );
  expect(scanPirateLine(stdout, 'Raider')).toBe(
    `  ${hexColor('Raider', undefined, scanPirateBg)} (skiff) - raider - Admiral Kael`,
  );
  expect(scanPirateLine(stdout, 'Raider')).toContain('\x1b[48;2');
  expect(scanPirateLine(stdout, 'Raider')).not.toContain('\x1b[38;2');
});

test('faction_scan_poi leaves pirate names uncolored for invalid hex', () => {
  const stdout = renderFactionScan(
    scanWithPirateColors({ primary_color: 'red', secondary_color: '#fff' }),
    scanColorOptions,
  );
  const line = scanPirateLine(stdout, 'Raider');

  expect(line).toBe('  Raider (skiff) - raider - Admiral Kael');
  expect(line).not.toContain('\x1b');
});

test('faction_scan_poi colors only the valid pirate livery channel when mixed with invalid hex', () => {
  const stdout = renderFactionScan(
    scanWithPirateColors({ primary_color: scanPirateFg, secondary_color: 'red' }),
    scanColorOptions,
  );
  expect(scanPirateLine(stdout, 'Raider')).toBe(
    `  ${hexColor('Raider', scanPirateFg, 'red')} (skiff) - raider - Admiral Kael`,
  );
});

test('faction_scan_poi leaves pirate names uncolored when livery colors are missing', () => {
  const stdout = renderFactionScan(structuredClone(factionScanPoiPartialFixture), scanColorOptions);
  const line = scanPirateLine(stdout, 'Corsair');

  expect(line).toBe('  Corsair (skiff) - raider');
  expect(line).not.toContain('\x1b');
});

test('faction_scan_poi --plain leaves pirate names uncolored even with valid hex', () => {
  const stdout = renderFactionScan(
    scanWithPirateColors({ primary_color: scanPirateFg, secondary_color: scanPirateBg }),
    { ...options, plain: true },
  );
  const line = scanPirateLine(stdout, 'Raider');

  expect(line).toBe('  Raider (skiff) - raider - Admiral Kael');
  expect(line).not.toContain('\x1b');
});

test('faction_scan_poi leftover native scalar uses title case', () => {
  const fixture = structuredClone(factionScanPoiEmptyFixture) as { details: Record<string, unknown> };
  fixture.details.foo_bar = 1;
  const stdout = renderFactionScan(fixture);

  expect(stdout).toContain('Foo Bar: 1');
});

test('faction_scan_poi leftover object is not printed', () => {
  const fixture = structuredClone(factionScanPoiEmptyFixture) as { details: Record<string, unknown> };
  fixture.details.meta = { nested: true };
  const stdout = renderFactionScan(fixture);

  expect(stdout).not.toContain('Meta');
  expect(stdout).not.toContain('nested');
  expect(stdout).not.toContain('{');
  expect(stdout).not.toContain('=== Response ===');
});

test('faction_scan_poi malformed revealed_info object is not dumped', () => {
  const stdout = renderFactionScan({
    details: {
      poi_id: 'sol_central',
      facility_level: 1,
      scan_power: 8,
      hops: 0,
      message: 'Malformed revealed.',
      contacts: [{ target_id: 'player-bad', revealed_info: { nested: { token: true } } }],
    },
  });

  expect(stdout).not.toContain('[object Object]');
  expect(stdout).toContain('player-bad');
});

test('faction_scan_poi without details prints the title only', () => {
  const stdout = renderFactionScan({
    message: 'ok',
    credits: 12,
    location: { system_id: 'sol', poi_name: 'Earth' },
    ship: { fuel: 9, max_fuel: 100 },
    player: { username: 'Marlowe' },
  });

  expect(stdout.trim()).toBe('=== Faction Scan ===');
  expect(stdout).not.toContain('Credits:');
  expect(stdout).not.toContain('Marlowe');
  expect(stdout).not.toContain('=== Response ===');
});

test('faction_scan_poi JSON keeps primary_color and faction_name', () => {
  const rendered = renderStructuredResult(
    'faction_scan_poi',
    structuredClone(factionScanPoiFixture),
    { ...options, format: 'json' },
    context,
  );
  const parsed = JSON.parse(rendered.stdout.join('\n')) as {
    details: { pirates: Array<Record<string, unknown>> };
  };

  expect(parsed.details.pirates[0]?.primary_color).toBe('#112233');
  expect(parsed.details.pirates[0]?.faction_name).toBe('Admiral Kael');
});

test('faction_scan_poi flattened scan object matches nested details header', () => {
  const stdout = renderFactionScan(structuredClone(factionScanPoiDetails));
  expect(stdout).toContain('POI: Sol Central (sol_central)');
  expect(stdout).toContain('=== Players ===');
  expect(stdout).not.toContain('=== Response ===');
});

test('faction_scan_poi facility line uses station-only and level-only forms', () => {
  const stationOnly = renderFactionScan({
    details: {
      poi_id: 'sol_central',
      facility_station: 'earth_station',
      scan_power: 4,
      hops: 0,
      message: 'Station only.',
    },
  });
  expect(stationOnly).toContain('Facility: earth_station');
  expect(stationOnly).not.toContain('Facility: L');

  const levelOnly = renderFactionScan({
    details: {
      poi_id: 'sol_central',
      facility_level: 3,
      scan_power: 4,
      hops: 0,
      message: 'Level only.',
    },
  });
  expect(levelOnly).toContain('Facility: L3');
  expect(levelOnly).not.toContain(' at ');
});

const adultLeviathanLine = '  Adult Molt Leviathan [lev-molt-1] (molt_leviathan) - adult - hull 800/1200 - aggressive';
const juvenileLeviathanLine =
  '  Juvenile Molt Leviathan [lev-molt-2] (molt_leviathan) - juvenile - hull 0/90 - not aggressive - in combat';

function scanWithLeviathans(leviathans: unknown): Record<string, unknown> {
  const fixture = structuredClone(factionScanPoiFixture) as { details: Record<string, unknown> };
  fixture.details.leviathans = leviathans;
  return fixture;
}

function scanLeviathanLine(stdout: string, token: string): string | undefined {
  return stdout.split('\n').find((line) => line.startsWith('  ') && line.includes(token));
}

test('faction_scan_poi omits leviathans when the key is absent', () => {
  const stdout = renderFactionScan(structuredClone(factionScanPoiFixture));

  expect(stdout).not.toContain('Leviathans');
  expect(stdout).not.toContain('Leviathans: none');
  expect(stdout).toContain('Pirates (1):');
  expect(stdout).toContain('  Raider (skiff) - raider - Admiral Kael');
  expect(stdout).toContain('=== Players ===');
  expect(stdout).toContain('=== Empire NPCs ===');
});

test('faction_scan_poi omits leviathans when the array is empty', () => {
  const stdout = renderFactionScan(scanWithLeviathans([]));

  expect(stdout).not.toContain('Leviathans');
  expect(stdout).not.toContain('Leviathans: none');
  expect(stdout).toContain('Pirates (1):');
});

test('faction_scan_poi prints leviathans after pirates', () => {
  const fixture = structuredClone(factionScanPoiLeviathansFixture) as { details: Record<string, unknown> };
  fixture.details.foo_bar = 1;
  const stdout = renderFactionScan(fixture);
  const piratesIdx = stdout.indexOf('Pirates (1):');
  const leviathansIdx = stdout.indexOf('Leviathans (2):');

  expect(leviathansIdx).toBeGreaterThan(piratesIdx);
  expect(scanLeviathanLine(stdout, 'lev-molt-1')).toBe(adultLeviathanLine);
  expect(scanLeviathanLine(stdout, 'lev-molt-2')).toBe(juvenileLeviathanLine);
  expect(juvenileLeviathanLine).toContain('hull 0/90');
  expect(juvenileLeviathanLine).toContain('not aggressive');
  expect(juvenileLeviathanLine).toContain(' - in combat');
  expect(stdout).toContain('=== Players ===');
  expect(stdout).toContain('=== Empire NPCs ===');
  expect(stdout).toContain('Foo Bar: 1');
  expect(stdout).not.toContain('Leviathans:');
  expect(stdout).not.toContain('[object Object]');
  expect(stdout.indexOf(adultLeviathanLine)).toBeLessThan(stdout.indexOf(juvenileLeviathanLine));
});

test('faction_scan_poi prints not aggressive, hull 0, and in combat on one line', () => {
  const stdout = renderFactionScan(scanWithLeviathans([juvenileLeviathanContact]));

  expect(stdout).toContain('Leviathans (1):');
  expect(scanLeviathanLine(stdout, 'lev-molt-2')).toBe(juvenileLeviathanLine);
  expect(scanLeviathanLine(stdout, 'lev-molt-2')?.endsWith(' - in combat')).toBe(true);
  expect(scanLeviathanLine(stdout, 'lev-molt-2')?.endsWith(' - aggressive')).toBe(false);
});

test('faction_scan_poi ignores envelope location leviathans', () => {
  const omitted = renderFactionScan({
    details: {
      poi_id: 'sol_central',
      facility_level: 2,
      scan_power: 36,
      hops: 1,
      message: 'Scan complete.',
    },
    location: { nearby_leviathans: [adultLeviathanContact] },
  });
  const differ = renderFactionScan({
    details: {
      poi_id: 'sol_central',
      facility_level: 1,
      scan_power: 8,
      hops: 0,
      leviathans: [adultLeviathanContact],
    },
    location: { nearby_leviathans: [juvenileLeviathanContact] },
  });

  expect(omitted).not.toContain('Leviathan');
  expect(omitted).not.toContain('lev-molt');
  expect(differ).toContain('lev-molt-1');
  expect(differ).not.toContain('lev-molt-2');
  expect(scanLeviathanLine(differ, 'lev-molt-1')).toBe(adultLeviathanLine);
});

test('faction_scan_poi colors the leviathan heading and leaves contact lines plain', () => {
  const stdout = renderFactionScan(structuredClone(factionScanPoiLeviathansFixture), scanColorOptions);
  const adult = scanLeviathanLine(stdout, 'lev-molt-1');
  const juvenile = scanLeviathanLine(stdout, 'lev-molt-2');

  expect(stdout).toContain('\n\x1b[31mLeviathans (2):\x1b[0m');
  expect(adult).toBe(adultLeviathanLine);
  expect(juvenile).toBe(juvenileLeviathanLine);
  expect(adult).not.toContain('\x1b');
  expect(juvenile).not.toContain('\x1b');
});

const LIST_BATTLE_VICTORY_ID = 'a1b2c3d4e5f6789012345678abcdef01';
const LIST_BATTLE_DRAW_ID = 'b1b2c3d4e5f6789012345678abcdef02';
const LIST_BATTLE_WILDLIFE_ID = 'c1b2c3d4e5f6789012345678abcdef03';
const LIST_BATTLE_ARENA_ID = 'd1b2c3d4e5f6789012345678abcdef04';
const LIST_BATTLE_SHIP_ID = 'e1b2c3d4e5f6789012345678abcdef05';
const LIST_BATTLE_PRIZE_ID = 'f1b2c3d4e5f6789012345678abcdef06';
const LIST_BATTLE_BOARDING_ID = 'boarding_a1b2c3d4e5f6789012345678';

function renderListBattles(fixture: Record<string, unknown>, extra: Partial<GlobalOptions> = {}): string {
  const rendered = renderStructuredResult('list_battles', structuredClone(fixture), { ...options, ...extra }, context);
  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  return stdout;
}

function listBattlesTable(stdout: string): string {
  return stdout.split('=== Captures ===')[0] ?? stdout;
}

function listBattlesHeaderLine(stdout: string): string | undefined {
  return listBattlesTable(stdout)
    .split('\n')
    .find((line) => line.includes('|') && line.includes('ID'));
}

function listBattlesColumns(stdout: string): string[] {
  return (listBattlesHeaderLine(stdout) ?? '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
}

function listBattlesCell(stdout: string, rowNeedle: string, column: string): string | undefined {
  const section = listBattlesTable(stdout);
  const header = listBattlesHeaderLine(section);
  const row = section
    .split('\n')
    .find((line) => line.includes('|') && line.includes(rowNeedle) && !line.includes('---'));
  if (!header || !row) return undefined;
  const headers = header.split('|').map((part) => part.trim());
  const cells = row.split('|').map((part) => part.trim());
  const index = headers.indexOf(column);
  return index >= 0 ? cells[index] : undefined;
}

function listBattlePage(
  count: number,
  query?: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    battles: Array.from({ length: count }, (_, index) => ({
      battle_id: `row-${index}`,
      status: 'completed',
      category: 'pvp',
    })),
    has_more: true,
    total: 928,
    ...(query === undefined ? {} : { list_battles_query: query }),
    ...extra,
  };
}

test('list_battles bare page prints the public table without filters or a next line', () => {
  const stdout = renderListBattles(listBattlesFixture);
  const columns = listBattlesColumns(stdout);

  expect(stdout).toContain('Public battles: 2 of 928 (more)');
  expect(stdout).not.toContain('Public battles (');
  expect(stdout).not.toContain('Next:');
  expect(stdout).not.toContain('list_battles_query');
  expect(stdout).not.toContain('(None)');
  expect(stdout).not.toContain('=== Response ===');
  expect(columns).toEqual([
    'Ended',
    'System',
    'Category',
    'Status',
    'Outcome',
    'Side',
    'Pilots',
    'Ticks',
    'Destroyed',
    'Captured',
    'Damage',
    'Top',
    'Station',
    'ID',
  ]);
  expect(listBattlesCell(stdout, LIST_BATTLE_VICTORY_ID, 'Ended')).toBe('2026-10-11 23:54:11');
  expect(listBattlesCell(stdout, LIST_BATTLE_VICTORY_ID, 'System')).toBe('Sol');
  expect(listBattlesCell(stdout, LIST_BATTLE_VICTORY_ID, 'Side')).toBe('1');
  expect(listBattlesCell(stdout, LIST_BATTLE_VICTORY_ID, 'Destroyed')).toBe('1');
  expect(listBattlesCell(stdout, LIST_BATTLE_VICTORY_ID, 'Captured')).toBe('1');
  expect(listBattlesCell(stdout, LIST_BATTLE_VICTORY_ID, 'Top')).toBe('Marlowe (5100)');
  expect(listBattlesCell(stdout, LIST_BATTLE_VICTORY_ID, 'Station')).toBe('yes');
  expect(listBattlesCell(stdout, LIST_BATTLE_VICTORY_ID, 'ID')).toBe(LIST_BATTLE_VICTORY_ID);
  expect(listBattlesCell(stdout, LIST_BATTLE_DRAW_ID, 'Outcome')).toBe('');
  expect(listBattlesCell(stdout, LIST_BATTLE_DRAW_ID, 'Side')).toBe('');
  expect(listBattlesCell(stdout, LIST_BATTLE_DRAW_ID, 'Destroyed')).toBe('0');
  expect(listBattlesCell(stdout, LIST_BATTLE_DRAW_ID, 'Captured')).toBe('');
  expect(listBattlesCell(stdout, LIST_BATTLE_DRAW_ID, 'Damage')).toBe('0');
  expect(listBattlesCell(stdout, LIST_BATTLE_DRAW_ID, 'Top')).toBe('Ibis (0)');
  expect(listBattlesCell(stdout, LIST_BATTLE_DRAW_ID, 'Station')).toBe('no');
  expect(listBattlesTable(stdout)).not.toContain('Rust Bucket');
  expect(listBattlesTable(stdout)).not.toContain('Skiff');
  expect(listBattlesTable(stdout)).not.toContain('=== Sides ===');
  expect(stdout).not.toContain('...');
  expect(stdout).toContain(LIST_BATTLE_SHIP_ID);
  expect(stdout).toContain(LIST_BATTLE_PRIZE_ID);
  expect(stdout).toContain(LIST_BATTLE_BOARDING_ID);
  expect(stdout).not.toContain(`${LIST_BATTLE_BOARDING_ID.slice(0, 29)}...`);

  const captures = sectionAfter(stdout, 'Captures');
  const captureHeaderLine = captureHeader(captures);
  expect(captureHeaderLine).toContain('Battle');
  expect(captureHeaderLine).toContain('Prize');
  expect(captureHeaderLine).toContain('Location');
  expect(captureCell(captures, LIST_BATTLE_SHIP_ID, 'Battle')).toBe(LIST_BATTLE_VICTORY_ID);
  expect(captureCell(captures, LIST_BATTLE_SHIP_ID, 'Prize')).toBe(LIST_BATTLE_PRIZE_ID);
  expect(captureCell(captures, LIST_BATTLE_SHIP_ID, 'Location')).toBe('Cloudbank (Sol)');
  expect(captureCell(captures, LIST_BATTLE_SHIP_ID, 'Boarding')).toBe(LIST_BATTLE_BOARDING_ID);
});

test('list_battles omits Ended, Outcome, Side, Captured, Top, and Station when nothing on the page is displayable', () => {
  const stdout = renderListBattles({
    battles: [
      {
        battle_id: 'omit-a',
        system_id: 'sol',
        status: 'completed',
        outcome: null,
        winning_side: -1,
        ships_captured: null,
        ships_destroyed: 0,
        total_damage: 0,
        top_damage: null,
      },
      {
        battle_id: 'omit-b',
        status: 'completed',
        outcome: '',
        winning_side: '-1',
        ships_captured: null,
        top_damage: null,
      },
    ],
    has_more: false,
    total: 2,
  });
  const columns = listBattlesColumns(stdout);

  expect(columns).not.toContain('Ended');
  expect(columns).not.toContain('Outcome');
  expect(columns).not.toContain('Side');
  expect(columns).not.toContain('Captured');
  expect(columns).not.toContain('Top');
  expect(columns).not.toContain('Station');
  expect(columns).not.toContain('Origin');
  expect(columns).toContain('System');
  expect(columns).toContain('Destroyed');
  expect(columns).toContain('Damage');
  expect(listBattlesCell(stdout, 'omit-a', 'System')).toBe('sol');
  expect(listBattlesCell(stdout, 'omit-a', 'Destroyed')).toBe('0');
  expect(listBattlesCell(stdout, 'omit-a', 'Damage')).toBe('0');
  expect(listBattlesCell(stdout, 'omit-b', 'System')).toBe('');
  expect(stdout).not.toContain('-1');
  expect(stdout).not.toContain('null');
  expect(stdout).not.toContain('=== Captures ===');
});

test('list_battles shows Side for 2 or 3 and leaves a blank cell on the draw', () => {
  const stdout = renderListBattles({
    battles: [
      { battle_id: 'side-2', winning_side: 2, status: 'completed' },
      { battle_id: 'side-3', winning_side: 3, status: 'completed' },
      { battle_id: 'side-draw', winning_side: -1, status: 'completed' },
    ],
    has_more: false,
    total: 3,
  });

  expect(listBattlesCell(stdout, 'side-2', 'Side')).toBe('2');
  expect(listBattlesCell(stdout, 'side-3', 'Side')).toBe('3');
  expect(listBattlesCell(stdout, 'side-draw', 'Side')).toBe('');
  expect(stdout).not.toContain('-1');
});

test('list_battles shows Captured for a number and leaves a blank cell for null', () => {
  const stdout = renderListBattles({
    battles: [
      { battle_id: 'cap-num', ships_captured: 2, status: 'completed' },
      { battle_id: 'cap-zero', ships_captured: 0, status: 'completed' },
      { battle_id: 'cap-blank', ships_captured: null, status: 'completed' },
    ],
    has_more: false,
    total: 3,
  });

  expect(listBattlesCell(stdout, 'cap-num', 'Captured')).toBe('2');
  expect(listBattlesCell(stdout, 'cap-zero', 'Captured')).toBe('0');
  expect(listBattlesCell(stdout, 'cap-blank', 'Captured')).toBe('');
  expect(stdout).not.toContain('null');
});

test('list_battles prefers system_name and formats Top with missing username or damage', () => {
  const named = renderListBattles({
    battles: [
      {
        battle_id: 'sys-name',
        system_id: 'sol',
        system_name: 'Sol',
        status: 'completed',
        top_damage: { username: 'Marlowe' },
      },
    ],
    has_more: false,
    total: 1,
  });
  expect(listBattlesCell(named, 'sys-name', 'System')).toBe('Sol');
  expect(listBattlesCell(named, 'sys-name', 'Top')).toBe('Marlowe (?)');

  const idOnly = renderListBattles({
    battles: [{ battle_id: 'sys-id', system_id: 'sol', status: 'completed', top_damage: { damage: 12 } }],
    has_more: false,
    total: 1,
  });
  expect(listBattlesCell(idOnly, 'sys-id', 'System')).toBe('sol');
  expect(listBattlesCell(idOnly, 'sys-id', 'Top')).toBe('? (12)');
});

test('list_battles prints station yes or no and omits the column when the key is absent', () => {
  const shown = renderListBattles({
    battles: [
      { battle_id: 'station-yes', has_station: true, status: 'completed' },
      { battle_id: 'station-no', has_station: false, status: 'completed' },
      { battle_id: 'station-missing', status: 'completed' },
    ],
    has_more: false,
    total: 3,
  });
  expect(listBattlesCell(shown, 'station-yes', 'Station')).toBe('yes');
  expect(listBattlesCell(shown, 'station-no', 'Station')).toBe('no');
  expect(listBattlesCell(shown, 'station-missing', 'Station')).toBe('');

  const omitted = renderListBattles({
    battles: [{ battle_id: 'station-none', status: 'completed' }],
    has_more: false,
    total: 1,
  });
  expect(listBattlesColumns(omitted)).not.toContain('Station');
});

test('list_battles wildlife row prints origin and active status without Ended', () => {
  const stdout = renderListBattles(listBattlesWildlifeFixture);
  const columns = listBattlesColumns(stdout);

  expect(stdout).toContain('Public battles: 1 of 1');
  expect(stdout).not.toContain('(more)');
  expect(stdout).not.toContain('Next:');
  expect(columns).not.toContain('Ended');
  expect(columns).not.toContain('Outcome');
  expect(columns).not.toContain('Side');
  expect(columns).not.toContain('Captured');
  expect(columns).toContain('Origin');
  expect(listBattlesCell(stdout, LIST_BATTLE_WILDLIFE_ID, 'Status')).toBe('active');
  expect(listBattlesCell(stdout, LIST_BATTLE_WILDLIFE_ID, 'Category')).toBe('wildlife');
  expect(listBattlesCell(stdout, LIST_BATTLE_WILDLIFE_ID, 'Origin')).toBe('aster_deep_belt');
  expect(listBattlesCell(stdout, LIST_BATTLE_WILDLIFE_ID, 'Destroyed')).toBe('0');
  expect(listBattlesCell(stdout, LIST_BATTLE_WILDLIFE_ID, 'Damage')).toBe('0');
  expect(stdout).not.toContain('=== Captures ===');
  expect(stdout).not.toContain('(None)');
});

test('list_battles arena capture table omits Prize and Location', () => {
  const stdout = renderListBattles(listBattlesArenaCaptureFixture);
  const captures = sectionAfter(stdout, 'Captures');
  const header = captureHeader(captures);

  expect(listBattlesCell(stdout, LIST_BATTLE_ARENA_ID, 'Side')).toBe('3');
  expect(listBattlesCell(stdout, LIST_BATTLE_ARENA_ID, 'Destroyed')).toBe('0');
  expect(listBattlesCell(stdout, LIST_BATTLE_ARENA_ID, 'Top')).toBe('Probe (400)');
  expect(listBattlesTable(stdout)).not.toContain('Kestrel');
  expectNoPrizeOrLocation(header);
  expect(header).not.toContain('Kind');
  expect(header).toContain('Battle');
  expect(captureCell(captures, LIST_BATTLE_SHIP_ID, 'Boarding')).toBe(LIST_BATTLE_BOARDING_ID);
  expect(stdout).not.toContain('claim_prize');
  expect(stdout).not.toContain('...');
  expect(stdout).not.toContain('Next:');
});

test('list_battles empty and past-the-end pages do not print an empty table', () => {
  const empty = renderListBattles(listBattlesEmptyFixture);
  expect(empty).toContain('Public battles: 0 of 0');
  expect(empty).toContain('No battles.');
  expect(empty).not.toContain('No battles on this page.');
  expect(empty).not.toContain('(None)');
  expect(empty).not.toContain('=== Battles ===');
  expect(empty).not.toContain('=== Captures ===');
  expect(empty).not.toContain('Next:');

  const past = renderListBattles(listBattlesPastEndFixture);
  expect(past).toContain('Public battles: 0 of 4');
  expect(past).toContain('No battles on this page.');
  expect(past).not.toContain('No battles.\n');
  expect(past).not.toContain('(None)');
  expect(past).not.toContain('=== Battles ===');

  const noTotal = renderListBattles({ battles: [], has_more: false });
  expect(noTotal).toContain('Public battles: 0');
  expect(noTotal).toContain('No battles.');
  expect(noTotal).not.toContain(' of ');
  expect(noTotal).not.toContain('(None)');
});

test('list_battles echoes filters in parenthesis order and computes the next offset from returned rows', () => {
  const bare = renderListBattles(listBattlePage(2));
  expect(bare).toContain('Public battles: 2 of 928 (more)');
  expect(bare).not.toContain('Public battles (');
  expect(bare).not.toContain('Next:');

  const liveEmpty = renderListBattles(listBattlePage(2, {}));
  expect(liveEmpty).toContain('Public battles: 2 of 928 (more)');
  expect(liveEmpty).not.toContain('Public battles (');
  expect(liveEmpty).toContain('Next: spacemolt list_battles offset=2');

  const captured = renderListBattles(listBattlePage(1, { captured: true }));
  expect(captured).toContain('Public battles (captured): 1 of 928 (more)');
  expect(captured).toContain('Next: spacemolt list_battles offset=1 captured=true');
  expect(captured).not.toContain('limit=');

  const filtered = renderListBattles(
    listBattlePage(20, {
      search: 'Probe',
      category: 'arena',
      captured: true,
      limit: 20,
      offset: 20,
    }),
  );
  expect(filtered).toContain('Public battles (captured, category=arena, search=Probe): 20 of 928 (more)');
  expect(filtered.split('\n')[0]).not.toContain('limit=');
  expect(filtered.split('\n')[0]).not.toContain('offset=');
  expect(filtered).toContain(
    'Next: spacemolt list_battles search=Probe category=arena limit=20 offset=40 captured=true',
  );
  expect(filtered).not.toContain('list_battles_query');

  const shortPage = renderListBattles(listBattlePage(1, { limit: 20, offset: 0 }));
  expect(shortPage).toContain('Next: spacemolt list_battles limit=20 offset=1');
  expect(shortPage).not.toContain('offset=20');

  const negativeOffset = renderListBattles(listBattlePage(2, { offset: -5, limit: 20 }));
  expect(negativeOffset).toContain('Next: spacemolt list_battles limit=20 offset=2');

  const done = renderListBattles(listBattlePage(1, { captured: true, category: 'arena' }, { has_more: false }));
  expect(done).toContain('Public battles (captured, category=arena): 1 of 928');
  expect(done).not.toContain('(more)');
  expect(done).not.toContain('Next:');

  const nullPage = renderListBattles({
    battles: null,
    has_more: true,
    total: 0,
    list_battles_query: { captured: true, offset: 40 },
  });
  expect(nullPage).toContain('Public battles (captured): 0 of 0 (more)');
  expect(nullPage).toContain('No battles.');
  expect(nullPage).not.toContain('Next:');
  expect(nullPage).not.toContain('(None)');
});

test('list_battles prints an ungrouped total and keeps battles null in json and yaml', () => {
  const stdout = renderListBattles({
    battles: [{ battle_id: 'big', status: 'active', category: 'wildlife' }],
    has_more: true,
    total: 1525902,
  });
  expect(stdout).toContain('Public battles: 1 of 1525902 (more)');
  expect(stdout).not.toContain('1,525,902');

  const json = renderStructuredResult(
    'list_battles',
    structuredClone(listBattlesEmptyFixture),
    { ...options, format: 'json' },
    context,
  );
  expect(JSON.parse(json.stdout.join('\n'))).toEqual({ battles: null, has_more: false, total: 0 });

  const yaml = renderStructuredResult(
    'list_battles',
    structuredClone(listBattlesPastEndFixture),
    { ...options, format: 'yaml' },
    context,
  );
  const yamlText = yaml.stdout.join('\n');
  expect(yamlText).toContain('battles: null');
  expect(yamlText).not.toContain('list_battles_query');
  expect(yamlText).not.toContain('[]');
});

test('list_battles formatter ignores a dry-run preview and other commands that share has_more', () => {
  const preview = renderListBattles({
    dry_run: true,
    command: 'list_battles',
    method: 'GET',
    url: 'https://game.spacemolt.com/api/battles',
    payload: { captured: true, limit: 20 },
    server_request_sent: false,
    notes: ['No mutation was sent. This is a client-side route and payload preview.'],
  });
  expect(preview).toContain('=== Response ===');
  expect(preview).toContain('https://game.spacemolt.com/api/battles');
  expect(preview).not.toContain('Public battles');
  expect(preview).not.toContain('No battles');

  const log = renderStructuredResult('get_battle_log', { battles: null, has_more: true, total: 4 }, options, context);
  expect(log.stdout.join('\n')).not.toContain('Public battles');
});
