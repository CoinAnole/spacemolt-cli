import { describe, expect, test } from 'bun:test';
import {
  formatMissingMaterialsErrorLines,
  formatMissingMaterialsPreview,
  isMissingMaterialErrorCode,
  type MissingMaterialRow,
  parseMissingMaterialRows,
} from './error-details.ts';
import { colorsForPlain } from './output-style.ts';

const opticalFiber: MissingMaterialRow = {
  item_id: 'optical_fiber_bundle',
  item_name: 'Optical Fiber Bundle',
  need: 300,
  have: 0,
};

const circuitBoard: MissingMaterialRow = {
  item_id: 'circuit_board',
  item_name: 'Circuit Board',
  need: 20,
  have: 5,
};

function detailsWith(...missing: unknown[]) {
  return { missing };
}

describe('isMissingMaterialErrorCode', () => {
  test('accepts the two documented codes', () => {
    expect(isMissingMaterialErrorCode('missing_materials')).toBe(true);
    expect(isMissingMaterialErrorCode('missing_faction_materials')).toBe(true);
  });

  test('rejects unrelated codes', () => {
    expect(isMissingMaterialErrorCode('no_credits')).toBe(false);
  });
});

describe('parseMissingMaterialRows', () => {
  test('preserves two valid rows', () => {
    expect(parseMissingMaterialRows(detailsWith(opticalFiber, circuitBoard))).toEqual([opticalFiber, circuitBoard]);
  });

  test('falls back to item_id when item_name is missing', () => {
    expect(parseMissingMaterialRows(detailsWith({ item_id: 'optical_fiber_bundle', need: 300, have: 0 }))).toEqual([
      { item_id: 'optical_fiber_bundle', item_name: 'optical_fiber_bundle', need: 300, have: 0 },
    ]);
  });

  test('keeps a blank item_id when only item_name is present', () => {
    expect(parseMissingMaterialRows(detailsWith({ item_name: 'Optical Fiber Bundle', need: 300, have: 0 }))).toEqual([
      { item_id: '', item_name: 'Optical Fiber Bundle', need: 300, have: 0 },
    ]);
  });

  test('returns [] when details is undefined, null, a bare array, a string, or a number', () => {
    expect(parseMissingMaterialRows(undefined)).toEqual([]);
    expect(parseMissingMaterialRows(null)).toEqual([]);
    expect(parseMissingMaterialRows([opticalFiber])).toEqual([]);
    expect(parseMissingMaterialRows('missing')).toEqual([]);
    expect(parseMissingMaterialRows(1)).toEqual([]);
  });

  test('returns [] when missing is absent, an object, a string, or null', () => {
    expect(parseMissingMaterialRows({})).toEqual([]);
    expect(parseMissingMaterialRows({ missing: { item_id: 'optical_fiber_bundle' } })).toEqual([]);
    expect(parseMissingMaterialRows({ missing: 'optical_fiber_bundle' })).toEqual([]);
    expect(parseMissingMaterialRows({ missing: null })).toEqual([]);
  });

  test('returns [] for an empty missing array', () => {
    expect(parseMissingMaterialRows({ missing: [] })).toEqual([]);
  });

  test('ignores extra top-level keys', () => {
    expect(
      parseMissingMaterialRows({
        hint: 'check faction storage',
        source: 'facility_upgrade',
        missing: [opticalFiber],
      }),
    ).toEqual([opticalFiber]);
  });

  test('ignores extra per-entry keys', () => {
    expect(parseMissingMaterialRows(detailsWith({ ...opticalFiber, unit: 'crate', source: 'cargo' }))).toEqual([
      opticalFiber,
    ]);
  });

  test('skips rows with non-finite or non-numeric need', () => {
    const validHave = { item_id: 'optical_fiber_bundle', item_name: 'Optical Fiber Bundle', have: 0 };
    expect(parseMissingMaterialRows(detailsWith({ ...validHave, need: Number.NaN }))).toEqual([]);
    expect(parseMissingMaterialRows(detailsWith({ ...validHave, need: Number.POSITIVE_INFINITY }))).toEqual([]);
    expect(parseMissingMaterialRows(detailsWith({ ...validHave, need: { amount: 300 } }))).toEqual([]);
    expect(parseMissingMaterialRows(detailsWith({ ...validHave, need: false }))).toEqual([]);
    expect(parseMissingMaterialRows(detailsWith({ ...validHave, need: [] }))).toEqual([]);
    expect(parseMissingMaterialRows(detailsWith({ ...validHave, need: true }))).toEqual([]);
    expect(parseMissingMaterialRows(detailsWith({ ...validHave, need: '  ' }))).toEqual([]);
    expect(parseMissingMaterialRows(detailsWith({ ...validHave, need: '' }))).toEqual([]);
    expect(parseMissingMaterialRows(detailsWith({ ...validHave, need: null }))).toEqual([]);
    expect(parseMissingMaterialRows(detailsWith({ item_id: 'optical_fiber_bundle', have: 0 }))).toEqual([]);
  });

  test('skips rows with non-finite or non-numeric have', () => {
    const validNeed = { item_id: 'optical_fiber_bundle', item_name: 'Optical Fiber Bundle', need: 300 };
    expect(parseMissingMaterialRows(detailsWith({ ...validNeed, have: Number.NaN }))).toEqual([]);
    expect(parseMissingMaterialRows(detailsWith({ ...validNeed, have: Number.POSITIVE_INFINITY }))).toEqual([]);
    expect(parseMissingMaterialRows(detailsWith({ ...validNeed, have: { amount: 0 } }))).toEqual([]);
    expect(parseMissingMaterialRows(detailsWith({ ...validNeed, have: false }))).toEqual([]);
    expect(parseMissingMaterialRows(detailsWith({ ...validNeed, have: [] }))).toEqual([]);
    expect(parseMissingMaterialRows(detailsWith({ ...validNeed, have: true }))).toEqual([]);
    expect(parseMissingMaterialRows(detailsWith({ ...validNeed, have: '  ' }))).toEqual([]);
    expect(parseMissingMaterialRows(detailsWith({ ...validNeed, have: '' }))).toEqual([]);
    expect(parseMissingMaterialRows(detailsWith({ ...validNeed, have: null }))).toEqual([]);
    expect(parseMissingMaterialRows(detailsWith({ item_id: 'optical_fiber_bundle', need: 300 }))).toEqual([]);
  });

  test('skips nested-object item_name unless item_id is a usable string', () => {
    expect(
      parseMissingMaterialRows(detailsWith({ item_name: { label: 'Optical Fiber Bundle' }, need: 300, have: 0 })),
    ).toEqual([]);
    expect(
      parseMissingMaterialRows(
        detailsWith({
          item_name: { label: 'Optical Fiber Bundle' },
          item_id: 'optical_fiber_bundle',
          need: 300,
          have: 0,
        }),
      ),
    ).toEqual([{ item_id: 'optical_fiber_bundle', item_name: 'optical_fiber_bundle', need: 300, have: 0 }]);
  });

  test('skips entries that are not records or lack a usable name', () => {
    expect(
      parseMissingMaterialRows(
        detailsWith(
          'optical_fiber_bundle',
          ['optical_fiber_bundle'],
          { need: 300, have: 0 },
          { item_id: '  ', need: 1, have: 0 },
        ),
      ),
    ).toEqual([]);
  });

  test('accepts numeric strings for need and have', () => {
    expect(
      parseMissingMaterialRows(
        detailsWith({ item_id: 'optical_fiber_bundle', item_name: 'Optical Fiber Bundle', need: '300', have: '0' }),
      ),
    ).toEqual([opticalFiber]);
  });

  test('keeps rows where have is greater than or equal to need', () => {
    expect(
      parseMissingMaterialRows(detailsWith({ item_id: 'circuit_board', item_name: 'Circuit Board', need: 5, have: 5 })),
    ).toEqual([{ item_id: 'circuit_board', item_name: 'Circuit Board', need: 5, have: 5 }]);
  });

  test('emits only valid rows from a mixed list', () => {
    expect(
      parseMissingMaterialRows(
        detailsWith(
          opticalFiber,
          { item_id: 'bad_need', item_name: 'Bad Need', need: [], have: 0 },
          circuitBoard,
          { item_name: { nested: true }, need: 1, have: 0 },
          'skip-me',
        ),
      ),
    ).toEqual([opticalFiber, circuitBoard]);
  });
});

describe('formatMissingMaterialsErrorLines', () => {
  const accidentalTokens = ['undefined', 'NaN', '[object Object]'];

  test('formats two valid rows as visual lines without ANSI when plain', () => {
    const lines = formatMissingMaterialsErrorLines([opticalFiber, circuitBoard], colorsForPlain(true));
    expect(lines[0]).toBe('');
    expect(lines[1]).toBe('=== Missing materials ===');
    expect(lines[2]).toBe('');
    expect(lines[3]).toContain('Item');
    expect(lines[3]).toContain('ID');
    expect(lines[3]).toContain('Need');
    expect(lines[3]).toContain('Have');
    expect(lines[4]).toMatch(/-/);
    expect(lines[5]).toContain('Optical Fiber Bundle');
    expect(lines[5]).toContain('optical_fiber_bundle');
    expect(lines[5]).toContain('300');
    expect(lines[5]).toContain('0');
    expect(lines[6]).toContain('Circuit Board');
    expect(lines[6]).toContain('circuit_board');
    expect(lines[6]).toContain('20');
    expect(lines[6]).toContain('5');
    expect(lines[7]).toBe('');
    expect(lines).toHaveLength(8);
    const joined = lines.join('\n');
    expect(joined).not.toContain('\x1b[');
    for (const token of accidentalTokens) expect(joined).not.toContain(token);
  });

  test('wraps only the title line after split when colors are enabled', () => {
    const colors = colorsForPlain(false);
    const lines = formatMissingMaterialsErrorLines([opticalFiber, circuitBoard], colors);
    expect(lines[0]).toBe('');
    expect(lines[0]).not.toContain('\x1b[');
    expect(lines[1]).toBe(`${colors.bright}=== Missing materials ===${colors.reset}`);
    expect(lines[1]).toContain(colors.bright);
    expect(lines[1]).toContain(colors.reset);
    expect(lines[5]).toContain('Optical Fiber Bundle');
    expect(lines[5]).not.toContain('\x1b[');
    expect(lines[6]).toContain('Circuit Board');
    expect(lines[6]).not.toContain('\x1b[');
    const joined = lines.join('\n');
    for (const token of accidentalTokens) expect(joined).not.toContain(token);
  });

  test('returns no (None) table when there are no rows', () => {
    const lines = formatMissingMaterialsErrorLines([], colorsForPlain(true));
    expect(lines).toEqual([]);
    expect(lines.join('\n')).not.toContain('(None)');
    expect(lines.join('\n')).not.toContain('=== Missing materials ===');
  });
});

describe('formatMissingMaterialsPreview', () => {
  const accidentalTokens = ['undefined', 'NaN', '[object Object]'];
  const twoRows = [opticalFiber, circuitBoard];
  const fiveRows: MissingMaterialRow[] = [
    opticalFiber,
    circuitBoard,
    { item_id: 'power_cell', item_name: 'Power Cell', need: 10, have: 2 },
    { item_id: 'alloy_plate', item_name: 'Alloy Plate', need: 8, have: 0 },
    { item_id: 'coolant', item_name: 'Coolant', need: 4, have: 1 },
  ];

  function expectNoDiagnosticTokens(value: string | undefined): void {
    expect(value).toBeDefined();
    for (const token of accidentalTokens) expect(value).not.toContain(token);
  }

  test('returns undefined for an empty row list', () => {
    expect(formatMissingMaterialsPreview([])).toBeUndefined();
  });

  test('joins two rows without maxChars using only limit', () => {
    const line = formatMissingMaterialsPreview(twoRows);
    expect(line).toBe('missing: Optical Fiber Bundle 0/300, Circuit Board 5/20');
    expect(line).not.toContain('optical_fiber_bundle');
    expect(line).not.toContain('circuit_board');
    expect(line?.length).toBe(55);
    expectNoDiagnosticTokens(line);
  });

  test('limit 1 on two rows reports +1 more from the full input', () => {
    const line = formatMissingMaterialsPreview(twoRows, { limit: 1 });
    expect(line).toBe('missing: Optical Fiber Bundle 0/300, +1 more');
    expectNoDiagnosticTokens(line);
  });

  test('maxChars smaller than two full items keeps the first whole item plus +1 more', () => {
    const full = formatMissingMaterialsPreview(twoRows);
    expect(full).toBeDefined();
    expect(full?.length).toBeGreaterThan(50);
    const line = formatMissingMaterialsPreview(twoRows, { maxChars: 50 });
    expect(line).toBe('missing: Optical Fiber Bundle 0/300, +1 more');
    expect(line?.length).toBeLessThanOrEqual(50);
    expect(line).not.toContain('Circuit Board');
    expectNoDiagnosticTokens(line);
  });

  test('a single item longer than maxChars is ellipsized with no suffix', () => {
    const line = formatMissingMaterialsPreview([opticalFiber], { maxChars: 20 });
    expect(line).toBeDefined();
    expect(line?.length).toBeLessThanOrEqual(20);
    expect(line?.endsWith('…')).toBe(true);
    expect(line).not.toContain('more');
    expect(line).toBe(`${'missing: Optical Fiber Bundle 0/300'.slice(0, 19)}…`);
    expectNoDiagnosticTokens(line);
  });

  test('keeps +N more and ellipsizes the body when the first item fits but the suffix does not', () => {
    const first = 'missing: Optical Fiber Bundle 0/300';
    const withSuffix = `${first}, +1 more`;
    const maxChars = first.length + 5;
    expect(first.length).toBeLessThanOrEqual(maxChars);
    expect(withSuffix.length).toBeGreaterThan(maxChars);

    const line = formatMissingMaterialsPreview(twoRows, { maxChars });
    expect(line).toBeDefined();
    expect(line?.length).toBeLessThanOrEqual(maxChars);
    expect(line?.endsWith('…, +1 more')).toBe(true);
    expectNoDiagnosticTokens(line);
  });

  test('both caps bind: hidden count uses full input, not the limit window', () => {
    const firstPlusSuffix = 'missing: Optical Fiber Bundle 0/300, +4 more';
    const twoPlusSuffix = 'missing: Optical Fiber Bundle 0/300, Circuit Board 5/20, +3 more';
    const maxChars = 50;
    expect(firstPlusSuffix.length).toBeLessThanOrEqual(maxChars);
    expect(twoPlusSuffix.length).toBeGreaterThan(maxChars);

    const line = formatMissingMaterialsPreview(fiveRows, { limit: 3, maxChars });
    expect(line).toBe(firstPlusSuffix);
    expect(line).toContain('+4 more');
    expect(line).not.toContain('+2 more');
    expect(line?.length).toBeLessThanOrEqual(maxChars);
    expectNoDiagnosticTokens(line);
  });

  test('never emits diagnostic tokens', () => {
    const outputs = [
      formatMissingMaterialsPreview(twoRows),
      formatMissingMaterialsPreview(twoRows, { limit: 1 }),
      formatMissingMaterialsPreview(twoRows, { maxChars: 50 }),
      formatMissingMaterialsPreview([opticalFiber], { maxChars: 20 }),
      formatMissingMaterialsPreview(twoRows, { maxChars: 40 }),
      formatMissingMaterialsPreview(fiveRows, { limit: 3, maxChars: 50 }),
    ];
    for (const line of outputs) expectNoDiagnosticTokens(line);
  });
});
