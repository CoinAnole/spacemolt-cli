import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { renderStructuredResult } from './index.ts';
import { factionQueryIntelFixture, supplyCommissionFixture } from './market.fixtures.ts';

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
      return new Date('2026-06-19T00:00:00.000Z');
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

test('faction_query_intel appends [deep core] when the POI is tagged', () => {
  const stdout = renderStructuredResult(
    'faction_query_intel',
    structuredClone(factionQueryIntelFixture),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Sol Gas Cloud (gas_cloud) [deep core] sol_gas_cloud');
  expect(stdout).not.toContain('Deep core: yes');
  expect(stdout).not.toContain('=== Response ===');
});

function overlayIntelPoi(
  fixture: typeof factionQueryIntelFixture,
  value: unknown | undefined,
): typeof factionQueryIntelFixture {
  const poi = fixture.entries[0]?.pois[0] as Record<string, unknown> | undefined;
  if (!poi) throw new Error('expected intel POI');
  if (value === undefined) delete poi.deep_core;
  else poi.deep_core = value;
  return fixture;
}

test('faction_query_intel omits [deep core] when the tag is false or missing', () => {
  const omitted = overlayIntelPoi(structuredClone(factionQueryIntelFixture), undefined);
  const falsy = overlayIntelPoi(structuredClone(factionQueryIntelFixture), false);
  const coerced = overlayIntelPoi(structuredClone(factionQueryIntelFixture), 'true');

  for (const fixture of [omitted, falsy, coerced]) {
    const stdout = renderStructuredResult('faction_query_intel', fixture, options, context).stdout.join('\n');
    expect(stdout).toContain('Sol Gas Cloud (gas_cloud) sol_gas_cloud');
    expect(stdout).not.toContain('[deep core]');
    expect(stdout).not.toContain('Deep core:');
  }
});

function renderSupplyCommission(fixture: Record<string, unknown>) {
  return renderStructuredResult('supply_commission', structuredClone(fixture), options, context);
}

test('supply_commission prints material names with needed and gathered progress', () => {
  const stdout = renderSupplyCommission(supplyCommissionFixture).stdout.join('\n');

  expect(stdout).toContain('=== Commission Supplied ===');
  expect(stdout).toContain('Materials supplied.');
  expect(stdout).toContain('ID: commission-1');
  expect(stdout).toContain('Donated: Nanite Hull Coating (nanite_hull_coating) x1');
  expect(stdout).toContain('Status: pending');
  expect(stdout).toContain('All sourced: no');
  expect(stdout).toContain('Credits: 5,000 cr');
  expect(stdout).toContain('=== Materials ===');
  expect(stdout).toContain('Steel Plate');
  expect(stdout).toContain('Nanite Hull Coating');
  expect(stdout).toMatch(/Steel Plate\s+\|\s+12\s+\|\s+12\s+\|\s+yes/);
  expect(stdout).toMatch(/Nanite Hull Coating\s+\|\s+1\s+\|\s+0\s+\|\s+no/);
  expect(stdout).not.toContain('Materials: 2 item(s)');
  expect(stdout).not.toContain('=== Response ===');
});

test('supply_commission omits the materials table when materials is empty', () => {
  const stdout = renderSupplyCommission({ ...supplyCommissionFixture, materials: [] }).stdout.join('\n');

  expect(stdout).toContain('=== Commission Supplied ===');
  expect(stdout).toContain('ID: commission-1');
  expect(stdout).toContain('Donated: Nanite Hull Coating (nanite_hull_coating) x1');
  expect(stdout).not.toContain('=== Materials ===');
  expect(stdout).not.toContain('(None)');
  expect(stdout).not.toContain('=== Response ===');
});

test('supply_commission omits the materials table when materials has no records', () => {
  const stdout = renderSupplyCommission({
    ...supplyCommissionFixture,
    materials: ['not-a-record', 4, null],
  }).stdout.join('\n');

  expect(stdout).toContain('=== Commission Supplied ===');
  expect(stdout).not.toContain('=== Materials ===');
  expect(stdout).not.toContain('(None)');
});

test('supply_commission falls back to item_id when material name is missing', () => {
  const stdout = renderSupplyCommission({
    ...supplyCommissionFixture,
    materials: [{ item_id: 'steel_plate', needed: 12, gathered: 8, complete: false }],
  }).stdout.join('\n');

  expect(stdout).toContain('=== Materials ===');
  expect(stdout).toContain('steel_plate');
  expect(stdout).toMatch(/steel_plate\s+\|\s+12\s+\|\s+8\s+\|\s+no/);
  expect(stdout).not.toContain('Steel Plate');
});

test('supply_commission omits credits when absent and prints all sourced yes', () => {
  const { credits: _credits, ...withoutCredits } = supplyCommissionFixture;
  const stdout = renderSupplyCommission({ ...withoutCredits, all_sourced: true }).stdout.join('\n');

  expect(stdout).toContain('All sourced: yes');
  expect(stdout).not.toContain('Credits:');
  expect(stdout).not.toContain('All sourced: no');
});

test('supply_commission formats an all-sourced receipt without a materials array', () => {
  const { materials: _materials, credits: _credits, ...receipt } = supplyCommissionFixture;
  const stdout = renderSupplyCommission({
    ...receipt,
    all_sourced: true,
  }).stdout.join('\n');

  expect(stdout).toContain('=== Commission Supplied ===');
  expect(stdout).toContain('Donated: Nanite Hull Coating (nanite_hull_coating) x1');
  expect(stdout).toContain('All sourced: yes');
  expect(stdout).not.toContain('=== Materials ===');
  expect(stdout).not.toContain('Credits:');
  expect(stdout).not.toContain('=== Response ===');
});
