import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { renderStructuredResult } from './index.ts';
import { factionQueryIntelFixture } from './market.fixtures.ts';

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
