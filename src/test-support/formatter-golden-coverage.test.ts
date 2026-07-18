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
    expect(report.requiredCoverageKeys).toContain('faction_create_buy_order_bulk');
    expect(report.highValueFixtureLabels).toContain('faction_create_buy_order_bulk');
    expect(report.requiredCoverageKeys).toContain('faction_create_sell_order_bulk');
    expect(report.highValueFixtureLabels).toContain('faction_create_sell_order_bulk');
    expect(report.requiredCoverageKeys).toContain('get_action_log_cursor');
    expect(report.highValueFixtureLabels).toContain('get_action_log_cursor');
    expect(report.requiredCoverageKeys).toContain('scan_creature');
    expect(report.highValueFixtureLabels).toContain('scan_creature');
  });

  test('friendly formatting gap targets have high-value non-fallback table output', () => {
    const report = friendlyFormattingGapReport();
    expect(report.missingHighValueFixtures).toEqual([]);
    expect(report.fallbackOutputs).toEqual([]);
  });

  test('stale formatter-only commands stay removed', () => {
    const report = formatterGoldenCoverageReport();
    expect(report.formatterCommands).not.toContain('facility_get');
    expect(report.formatterCommands).not.toContain('faction_trade_intel');
    expect(report.optOuts).not.toHaveProperty('facility_get');
    expect(report.optOuts).not.toHaveProperty('faction_trade_intel');
  });
});
