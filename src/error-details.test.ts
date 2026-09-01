import { describe, expect, test } from 'bun:test';
import { isMissingMaterialErrorCode, type MissingMaterialRow, parseMissingMaterialRows } from './error-details.ts';

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
