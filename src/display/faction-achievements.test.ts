import { describe, expect, test } from 'bun:test';
import type { SpaceMoltConfig } from '../runtime.ts';
import type { GlobalOptions } from '../types.ts';
import { getFactionAchievementsFixture } from './faction-achievements.fixtures.ts';
import { resultFormatters } from './formatters.ts';
import { renderStructuredResult } from './index.ts';

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

const debugConfig: SpaceMoltConfig = {
  apiBase: 'https://example.test/api/v2',
  jsonOutput: false,
  debug: true,
  plain: false,
  quiet: false,
  format: 'table',
  compact: false,
};

function render(
  result: Record<string, unknown>,
  renderOptions: Partial<GlobalOptions> = {},
  command = 'get_faction_achievements',
  debug = false,
) {
  return renderStructuredResult(
    command,
    structuredClone(result),
    { ...options, ...renderOptions },
    debug ? { ...context, config: debugConfig } : context,
  );
}

function stdoutOf(
  result: Record<string, unknown>,
  renderOptions: Partial<GlobalOptions> = {},
  command = 'get_faction_achievements',
  debug = false,
): string {
  return render(result, renderOptions, command, debug).stdout.join('\n');
}

function entry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'the_whole_bar',
    name: 'The Whole Bar',
    description: 'Stock every form of alcohol.',
    category: 'hospitality',
    points: 10,
    hidden: false,
    earned: false,
    ...overrides,
  };
}

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    summary: { earned: 1, total: 36, points: 60 },
    achievements: [entry()],
    ...overrides,
  };
}

function headerColumns(stdout: string): string[] {
  const header = stdout
    .split('\n')
    .find((line) => line.includes('|') && line.includes('Name') && line.includes('Category'));
  if (!header) return [];
  return header
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
}

function cell(stdout: string, rowNeedle: string, column: string): string {
  const columns = headerColumns(stdout);
  const index = columns.indexOf(column);
  if (index < 0) throw new Error(`missing column ${column}`);
  const row = stdout.split('\n').find((line) => line.includes('|') && line.includes(rowNeedle));
  if (!row) throw new Error(`missing row ${rowNeedle}`);
  return row.split('|').map((part) => part.trim())[index] ?? '';
}

describe('get_faction_achievements', () => {
  test('1. happy path prints current/target and not the raw heading', () => {
    const stdout = stdoutOf(getFactionAchievementsFixture);

    expect(stdout).toContain('Earned: 1 / 36');
    expect(stdout).toContain('Points: 60');
    expect(stdout).toContain('Points: 60\n\n=== Faction Achievements ===');
    expect(stdout).not.toContain('Points: 60\n\n\n===');
    expect(stdout).toContain('=== Faction Achievements ===');
    expect(stdout).not.toContain('=== Response ===');
    expect(headerColumns(stdout)).toEqual(['Name', 'ID', 'Category', 'Points', 'Earned', 'Progress', 'Earned at']);
    expect(cell(stdout, 'the_whole_bar', 'Progress')).toBe('12/40');
    expect(cell(stdout, 'house_of_plenty', 'Progress')).toBe('40/40');
    expect(cell(stdout, 'house_of_plenty', 'Earned')).toBe('yes');
    expect(cell(stdout, 'the_whole_bar', 'Earned')).toBe('no');
    expect(cell(stdout, 'cottage_industry', 'Progress')).toBe('');
    expect(cell(stdout, 'house_of_plenty', 'Earned at')).toBe('2026-10-20 15:04:05');
    expect(cell(stdout, 'cottage_industry', 'Earned at')).toBe('');
    expect(stdout).toContain('the_whole_bar: Stock every form of alcohol in the galaxy at your bars.');
    expect(stdout).toContain("house_of_plenty: Put every dish in the galaxy on your faction's tables.");
    expect(stdout).toContain('cottage_industry: Craft items as a faction.');
    const lines = stdout.split('\n');
    const description = lines.findIndex((line) => line.startsWith('the_whole_bar:'));
    expect(description).toBeGreaterThan(1);
    expect(lines[description - 1]).toBe('');
    expect(lines[description - 2]).toContain('cottage_industry');
  });

  test('2. zero progress and zero summary stay visible', () => {
    const stdout = stdoutOf({
      summary: { earned: 0, total: 0, points: 0 },
      achievements: [entry({ progress: { current: 0, target: 10 }, points: 0 })],
    });

    expect(cell(stdout, 'the_whole_bar', 'Progress')).toBe('0/10');
    expect(cell(stdout, 'the_whole_bar', 'Points')).toBe('0');
    expect(stdout).toContain('Points: 0');
    expect(stdout).toContain('Earned: 0 / 0');
  });

  test('3. current above target prints both numbers without a ratio', () => {
    const stdout = stdoutOf(body({ achievements: [entry({ progress: { current: 41, target: 40 } })] }));

    expect(cell(stdout, 'the_whole_bar', 'Progress')).toBe('41/40');
    expect(stdout).not.toContain('%');
    expect(stdout.toLowerCase()).not.toContain('over');
  });

  test('4. omits Progress when no row has a progress cell', () => {
    const stdout = stdoutOf(body({ achievements: [entry({ id: 'alpha' }), entry({ id: 'beta', name: 'Beta' })] }));

    expect(stdout).toContain('=== Faction Achievements ===');
    expect(headerColumns(stdout)).not.toContain('Progress');
    expect(headerColumns(stdout)).not.toContain('Earned at');
  });

  test('5. missing progress sides are question marks and empty progress stays blank', () => {
    const stdout = stdoutOf(
      body({
        achievements: [
          entry({ id: 'target_only', progress: { target: 10 } }),
          entry({ id: 'current_only', progress: { current: 3 } }),
          entry({ id: 'empty_progress', progress: {} }),
          entry({ id: 'null_progress', progress: null }),
          entry({ id: 'extra_key', progress: { current: 12, target: 40, items: ['ale'] } }),
        ],
      }),
    );

    expect(cell(stdout, 'target_only', 'Progress')).toBe('?/10');
    expect(cell(stdout, 'current_only', 'Progress')).toBe('3/?');
    expect(cell(stdout, 'empty_progress', 'Progress')).toBe('');
    expect(cell(stdout, 'null_progress', 'Progress')).toBe('');
    expect(cell(stdout, 'extra_key', 'Progress')).toBe('12/40');
    expect(stdout).not.toContain('ale');

    const onlyEmpty = stdoutOf(
      body({
        achievements: [entry({ id: 'empty_progress', progress: {} }), entry({ id: 'null_progress', progress: null })],
      }),
    );
    expect(headerColumns(onlyEmpty)).not.toContain('Progress');
    expect(onlyEmpty).not.toContain('[object Object]');
  });

  test('6. non-record progress falls back to the raw dump', () => {
    const cases: Array<{ progress: unknown; snippet: string }> = [
      { progress: '3/10', snippet: '"progress": "3/10"' },
      { progress: 3, snippet: '"progress": 3' },
      { progress: [], snippet: '"progress": []' },
      { progress: true, snippet: '"progress": true' },
    ];
    for (const { progress, snippet } of cases) {
      const stdout = stdoutOf(body({ achievements: [entry({ progress })] }));
      expect(stdout).toContain('=== Response ===');
      expect(stdout).toContain(snippet);
      expect(stdout).not.toContain('=== Faction Achievements ===');
    }
  });

  test('7. a non-record achievement row falls back to the raw dump', () => {
    const stdout = stdoutOf(body({ achievements: [entry(), 'not-a-row'] }));

    expect(stdout).toContain('=== Response ===');
    expect(stdout).toContain('not-a-row');
    expect(stdout).not.toContain('=== Faction Achievements ===');
  });

  test('8. an achievements summary object falls back to the raw dump', () => {
    const stdout = stdoutOf({ achievements: { earned: 1, total: 2, points: 3 } });

    expect(stdout).toContain('=== Response ===');
    expect(stdout).toContain('"earned": 1');
    expect(stdout).not.toContain('=== Faction Achievements ===');

    for (const summary of [null, [], 'no', 4]) {
      const declined = stdoutOf({ summary, achievements: [entry()] });
      expect(declined).toContain('=== Response ===');
      expect(declined).not.toContain('=== Faction Achievements ===');
    }
  });

  test('9. an empty list still prints the summary and (None)', () => {
    const stdout = stdoutOf({ summary: { earned: 0, total: 36, points: 0 }, achievements: [] });

    expect(stdout).toContain('Earned: 0 / 36');
    expect(stdout).toContain('Points: 0');
    expect(stdout).toContain('=== Faction Achievements ===');
    expect(stdout).toContain('(None)');
    expect(stdout.toLowerCase()).not.toContain('not in a faction');
  });

  test('10. omitted summary still prints the table', () => {
    const withoutSummary = body();
    delete withoutSummary.summary;
    const stdout = stdoutOf(withoutSummary);

    expect(stdout).toContain('=== Faction Achievements ===');
    expect(stdout).not.toContain('Earned:');
    expect(stdout).not.toContain('Points:');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('summary lines omit absent sides and mark unusable integers', () => {
    const earnedOnly = stdoutOf({ summary: { earned: 4 }, achievements: [] });
    expect(earnedOnly).toContain('Earned: 4');
    expect(earnedOnly).not.toContain('Earned: 4 /');
    expect(earnedOnly).not.toContain('Points:');

    const totalOnly = stdoutOf({ summary: { total: 9 }, achievements: [] });
    expect(totalOnly).toContain('Earned: ? / 9');
    expect(totalOnly).not.toContain('Points:');

    const bad = stdoutOf({ summary: { earned: '3', total: 4, points: '5' }, achievements: [] });
    expect(bad).toContain('Earned: ? / 4');
    expect(bad).toContain('Points: ?');
    expect(bad).not.toContain('Earned: 3');
    expect(bad).not.toContain('Points: 5');

    const points = 9007199254740993n;
    const grouped = stdoutOf({ summary: { points }, achievements: [] });
    expect(grouped).toContain(`Points: ${points.toLocaleString()}`);
    expect(grouped).not.toContain('Earned:');

    const emptySummary = stdoutOf({ summary: {}, achievements: [entry()] });
    expect(emptySummary).toContain('=== Faction Achievements ===');
    expect(emptySummary).not.toContain('Earned:');
    expect(emptySummary).not.toContain('Points:');
  });

  test('11. blank messages are skipped and a trimmed message is printed as sent', () => {
    const base = body();
    expect(stdoutOf({ ...base, message: '   ' })).toBe(stdoutOf(base));

    const noted = stdoutOf({ ...base, message: '  Not in a faction.  ' });
    expect(noted).toContain('Not in a faction.');
    expect(noted.match(/Not in a faction\./g)).toEqual(['Not in a faction.']);
    expect(noted).not.toContain('  Not in a faction.');
  });

  test('12. bigint progress keeps every digit and a leading minus', () => {
    const current = -9007199254740993n;
    const target = 10n;
    const stdout = stdoutOf(body({ achievements: [entry({ progress: { current, target } })] }));
    const progress = cell(stdout, 'the_whole_bar', 'Progress');

    expect(progress).toBe(`${current.toLocaleString()}/${target.toLocaleString()}`);
    expect(progress.startsWith(current.toLocaleString())).toBe(true);
    expect(progress.replace(/\D/gu, '')).toBe('900719925474099310');
    expect(progress.length).toBeLessThanOrEqual(64);
  });

  test('13. unsafe integer numbers print question marks instead of rounded groups', () => {
    const unsafe = Number.MAX_SAFE_INTEGER + 2;
    const absentPoints = entry({ id: 'absent_points' });
    delete absentPoints.points;
    const stdout = stdoutOf({
      summary: { earned: 1, total: 2, points: unsafe },
      achievements: [entry({ id: 'unsafe', points: unsafe, progress: { current: unsafe, target: 10 } }), absentPoints],
    });

    expect(stdout).toContain('Points: ?');
    expect(cell(stdout, 'unsafe', 'Points')).toBe('?');
    expect(cell(stdout, 'unsafe', 'Progress')).toBe(`?/${(10).toLocaleString()}`);
    expect(cell(stdout, 'absent_points', 'Points')).toBe('');
    expect(stdout).not.toContain(unsafe.toLocaleString());
    expect(stdout).not.toContain('=== Response ===');
  });

  test('14. finite non-integers print String text', () => {
    const stdout = stdoutOf(body({ achievements: [entry({ points: 1.5, progress: { current: 1.5, target: 10 } })] }));

    expect(cell(stdout, 'the_whole_bar', 'Progress')).toBe(`1.5/${(10).toLocaleString()}`);
    expect(cell(stdout, 'the_whole_bar', 'Points')).toBe('1.5');
    expect(stdout).not.toContain('1.50');
    expect(stdout).not.toContain('2/10');
  });

  test('15. numeric strings are not coerced', () => {
    const stdout = stdoutOf(body({ achievements: [entry({ progress: { current: '4', target: 10 } })] }));

    expect(cell(stdout, 'the_whole_bar', 'Progress')).toBe(`?/${(10).toLocaleString()}`);
    expect(stdout).not.toContain('4/10');
    expect(stdout).not.toContain('"4"');
  });

  test('16. negative progress keeps the minus', () => {
    const stdout = stdoutOf(body({ achievements: [entry({ progress: { current: -1, target: 10 } })] }));
    const progress = cell(stdout, 'the_whole_bar', 'Progress');

    expect(progress).toBe(`${(-1).toLocaleString()}/${(10).toLocaleString()}`);
    expect(progress.startsWith((-1).toLocaleString())).toBe(true);
    expect(progress).not.toBe(`1/${(10).toLocaleString()}`);
  });

  test('17. Hidden is shown only when some row is hidden', () => {
    const shown = stdoutOf(
      body({
        achievements: [
          entry({ id: 'secret', hidden: true, earned_at: '2026-10-20T15:04:05Z', progress: { current: 1, target: 2 } }),
          entry({ id: 'open', hidden: false }),
          entry({ id: 'bad_flag', hidden: 'maybe' }),
        ],
      }),
    );

    expect(headerColumns(shown)).toEqual([
      'Name',
      'ID',
      'Category',
      'Points',
      'Earned',
      'Progress',
      'Earned at',
      'Hidden',
    ]);
    expect(cell(shown, 'secret', 'Hidden')).toBe('yes');
    expect(cell(shown, 'open', 'Hidden')).toBe('no');
    expect(cell(shown, 'bad_flag', 'Hidden')).toBe('');
    expect(shown).not.toContain('maybe');

    const visible = stdoutOf(
      body({ achievements: [entry({ id: 'open', hidden: false }), entry({ id: 'also', hidden: false })] }),
    );
    expect(headerColumns(visible)).not.toContain('Hidden');
  });

  test('18. earned_at previews drop the T and do not invent seconds', () => {
    const stdout = stdoutOf(
      body({
        achievements: [
          entry({ id: 'seconds', earned_at: '2026-10-20T15:04:05Z' }),
          entry({ id: 'minutes', earned_at: '2026-10-21T15:04Z' }),
          entry({ id: 'fraction', earned_at: '2026-10-20T15:04:05.123Z' }),
        ],
      }),
    );

    expect(cell(stdout, 'seconds', 'Earned at')).toBe('2026-10-20 15:04:05');
    expect(cell(stdout, 'minutes', 'Earned at')).toBe('2026-10-21 15:04');
    expect(cell(stdout, 'fraction', 'Earned at')).toBe('2026-10-20 15:04:05');
    expect(stdout).not.toContain('.123');
    expect(stdout).not.toContain('15:04:00');

    const numericStamp = 1_700_000_000;
    const numeric = stdoutOf(body({ achievements: [entry({ id: 'num_time', earned_at: numericStamp })] }));
    expect(headerColumns(numeric)).not.toContain('Earned at');
    expect(numeric).not.toContain(String(numericStamp));
    expect(numeric).not.toContain(numericStamp.toLocaleString());
  });

  test('19. share_url stays out of the table and in JSON', () => {
    const fixture = body({
      achievements: [entry({ share_url: 'https://example.test/share/the_whole_bar' })],
    });
    const table = stdoutOf(fixture);
    const json = stdoutOf(fixture, { format: 'json' });

    expect(table).not.toContain('https://example.test/share/the_whole_bar');
    expect(table).not.toContain('share_url');
    expect(json).toContain('https://example.test/share/the_whole_bar');
    expect(json).not.toContain('=== Faction Achievements ===');
  });

  test('20. a present non-boolean earned flag is a question mark', () => {
    const missing = entry({ id: 'missing', name: 'Missing' });
    delete missing.earned;
    const stdout = stdoutOf(
      body({
        achievements: [
          entry({ id: 'str_flag', earned: 'yes' }),
          entry({ id: 'num_flag', earned: 1 }),
          entry({ id: 'null_flag', earned: null }),
          missing,
        ],
      }),
    );

    expect(cell(stdout, 'str_flag', 'Earned')).toBe('?');
    expect(cell(stdout, 'num_flag', 'Earned')).toBe('?');
    expect(cell(stdout, 'null_flag', 'Earned')).toBe('?');
    expect(cell(stdout, 'missing', 'Earned')).toBe('');
    expect(stdout).toContain('=== Faction Achievements ===');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('21. text matches the table and machine formats stay pass-through', () => {
    const fixture = getFactionAchievementsFixture;
    const table = stdoutOf(fixture);
    expect(stdoutOf(fixture, { format: 'text' })).toBe(table);

    for (const renderOptions of [
      { format: 'yaml' as const },
      { format: 'json' as const },
      { structured: true },
      { compact: true },
    ]) {
      expect(stdoutOf(fixture, renderOptions)).not.toContain('=== Faction Achievements ===');
    }
    expect(stdoutOf(fixture, { format: 'json' })).toContain('"progress"');
    expect(stdoutOf(fixture, { compact: true })).toContain('"progress"');
    expect(stdoutOf(fixture, { format: 'yaml' })).toContain('current:');
    expect(stdoutOf(fixture, { format: 'yaml' })).toContain('target:');
  });

  test('22. row order follows the payload, not the name', () => {
    const stdout = stdoutOf(
      body({
        achievements: [entry({ id: 'z_row', name: 'Zebra' }), entry({ id: 'a_row', name: 'Apple' })],
      }),
    );

    const zebra = stdout.indexOf('z_row');
    const apple = stdout.indexOf('a_row');
    expect(zebra).toBeGreaterThanOrEqual(0);
    expect(zebra).toBeLessThan(apple);
    expect(stdout.indexOf('Zebra')).toBeLessThan(stdout.indexOf('Apple'));
  });

  test('23. descriptions collapse to one line and skip non-strings', () => {
    const stdout = stdoutOf(
      body({
        achievements: [
          entry({ id: 'newline', description: 'Stock every\nform of alcohol.' }),
          entry({ id: 'object_desc', description: { text: 'nope' } }),
          entry({ id: 'blank_desc', description: '   \n  ' }),
        ],
      }),
    );

    expect(stdout).toContain('newline: Stock every form of alcohol.');
    expect(stdout.split('\n').filter((line) => line.includes('form of alcohol.'))).toHaveLength(1);
    expect(stdout).not.toContain('object_desc:');
    expect(stdout).not.toContain('nope');
    expect(stdout).not.toContain('blank_desc:');
  });

  test('24. get_achievements keeps the raw dump and does not drift-warn', () => {
    const plain = render(getFactionAchievementsFixture, {}, 'get_achievements');
    const plainStdout = plain.stdout.join('\n');
    expect(plainStdout).toContain('=== Response ===');
    expect(plainStdout).toContain('"progress"');
    expect(plainStdout).not.toContain('=== Faction Achievements ===');
    expect(plain.stderr.join('\n')).toBe('');

    const debug = render(getFactionAchievementsFixture, {}, 'get_achievements', true);
    const debugStdout = debug.stdout.join('\n');
    const debugStderr = debug.stderr.join('\n');
    expect(debugStdout).toContain('=== Response ===');
    expect(debugStdout).toContain('"progress"');
    expect(debugStdout).not.toContain('=== Faction Achievements ===');
    expect(debugStderr).not.toContain('get_faction_achievements');
    expect(debugStderr).not.toContain('[DRIFT WARNING]');
    expect(debugStderr).toBe('');
  });

  test('25. formatter metadata stays command-scoped without hint keys', () => {
    const match = resultFormatters.find((item) => item.formatterName === 'get_faction_achievements');
    if (match === undefined) throw new Error('missing get_faction_achievements formatter');

    expect(match.commands).toEqual(['get_faction_achievements']);
    expect(match.shapeFallback).not.toBe(true);
    expect(match.formatterName).toBe('get_faction_achievements');
    expect(match.hintKeys).toBeUndefined();
    expect(resultFormatters.filter((item) => item.formatterName === 'get_faction_achievements')).toHaveLength(1);
  });

  test('26. description without an id prints a question mark', () => {
    const row = entry({ description: 'Stock every form.' });
    delete row.id;
    const stdout = stdoutOf(
      body({
        achievements: [row],
      }),
    );

    expect(stdout).toContain('?: Stock every form.');
  });
});
