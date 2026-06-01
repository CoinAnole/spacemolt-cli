import { describe, expect, test } from 'bun:test';
import {
  formatFormatterCoverageError,
  formatterGoldenCoverageReport,
  friendlyFormattingGapReport,
} from './formatter-golden-coverage';

describe('formatter golden coverage', () => {
  test('every command-scoped formatter has a high-value fixture or explicit opt-out', () => {
    const report = formatterGoldenCoverageReport();
    expect(report.missing, formatFormatterCoverageError(report)).toEqual([]);
    expect(report.staleOptOuts, formatFormatterCoverageError(report)).toEqual([]);
  });

  test('requires separate high-value fixtures for known multi-shape command formatters', () => {
    const report = formatterGoldenCoverageReport();
    expect(report.requiredCoverageKeys).toContain('facility_list_detailed');
    expect(report.highValueFixtureLabels).toContain('facility_list_detailed');
    expect(report.requiredCoverageKeys).toContain('catalog_recipes');
    expect(report.highValueFixtureLabels).toContain('catalog_recipes');
  });

  test('friendly formatting gap targets have high-value non-fallback table output', () => {
    const report = friendlyFormattingGapReport();
    expect(report.missingHighValueFixtures).toEqual([]);
    expect(report.fallbackOutputs).toEqual([]);
  });
});
