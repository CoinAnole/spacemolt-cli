import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { storageDepositAutoDockedFixture } from './generic.fixtures.ts';
import { renderStructuredResult } from './index.ts';
import { claimPrizeFixture } from './prizes.fixtures.ts';

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

function renderClaim(result: Record<string, unknown>, extra: Partial<GlobalOptions> = {}): string {
  return renderStructuredResult('claim_prize', result, { ...options, ...extra }, context).stdout.join('\n');
}

function claimDetails(overrides: Record<string, unknown> = {}, omit: string[] = []): Record<string, unknown> {
  const details: Record<string, unknown> = { ...structuredClone(claimPrizeFixture.details), ...overrides };
  for (const key of omit) delete details[key];
  return details;
}

test('renders nested claim_prize details as a named ship → station receipt', () => {
  const stdout = renderClaim(structuredClone(claimPrizeFixture));
  expect(stdout).toContain('=== Claim Prize ===');
  expect(stdout).toContain('Captured Lark (skiff) → Earth Station (earth_station)');
  expect(stdout).toContain('Prize ID: prize-1');
  expect(stdout).toContain('Status: claimed');
  expect(stdout).toContain('Crew: 1 aboard');
  expect(stdout).not.toContain('ship-99');
  expect(stdout).not.toContain('Ship Id');
  expect(stdout).not.toContain('Idempotent');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders a flat claim_prize payload without a details wrapper', () => {
  const stdout = renderClaim(claimDetails());
  expect(stdout).toContain('=== Claim Prize ===');
  expect(stdout).toContain('Captured Lark (skiff) → Earth Station (earth_station)');
  expect(stdout).toContain('Prize ID: prize-1');
});

test('collapses ship name when it matches class', () => {
  const stdout = renderClaim(claimDetails({ ship_name: 'skiff' }));
  expect(stdout).toContain('skiff → Earth Station (earth_station)');
  expect(stdout).not.toContain('skiff (skiff)');
});

test('collapses destination when name matches id', () => {
  const stdout = renderClaim(claimDetails({ destination_name: 'earth_station' }));
  expect(stdout).toContain('Captured Lark (skiff) → earth_station');
  expect(stdout).not.toContain('earth_station (earth_station)');
});

test('collapses both ship and destination when each pair is equal', () => {
  const stdout = renderClaim(claimDetails({ ship_name: 'skiff', destination_name: 'earth_station' }));
  expect(stdout).toContain('skiff → earth_station');
});

test('treats empty-string ship_name as missing and uses class', () => {
  const stdout = renderClaim(claimDetails({ ship_name: '' }));
  expect(stdout).toContain('skiff → Earth Station (earth_station)');
  expect(stdout).not.toContain('Captured Lark');
});

test('treats empty-string destination_name as missing and uses id', () => {
  const stdout = renderClaim(claimDetails({ destination_name: '' }));
  expect(stdout).toContain('Captured Lark (skiff) → earth_station');
  expect(stdout).not.toContain('Earth Station (earth_station)');
});

test('prints Idempotent: yes only when true', () => {
  const retry = renderClaim(claimDetails({ idempotent: true }));
  expect(retry).toContain('Idempotent: yes');
  const firstClaim = renderClaim(claimDetails({ idempotent: false }));
  expect(firstClaim).not.toContain('Idempotent');
});

test('prints faction_reserve crew with assigned count', () => {
  const stdout = renderClaim(claimDetails({ crew_assigned: 3, crew_disposition: 'faction_reserve' }));
  expect(stdout).toContain('Crew: 3 faction_reserve');
});

test('prints crew_assigned 0 with disposition', () => {
  const stdout = renderClaim(claimDetails({ crew_assigned: 0, crew_disposition: 'aboard' }));
  expect(stdout).toContain('Crew: 0 aboard');
});

test('prints assigned-only crew without disposition', () => {
  const stdout = renderClaim(claimDetails({}, ['crew_disposition']));
  expect(stdout).toContain('Crew: 1');
  expect(stdout).not.toContain('aboard');
});

test('prints disposition-only crew without assigned count', () => {
  const stdout = renderClaim(claimDetails({}, ['crew_assigned']));
  expect(stdout).toContain('Crew: aboard');
  expect(stdout).not.toMatch(/Crew: \d/);
});

test('omits Crew when both assigned and disposition are missing', () => {
  const stdout = renderClaim(claimDetails({}, ['crew_assigned', 'crew_disposition']));
  expect(stdout).toContain('=== Claim Prize ===');
  expect(stdout).toContain('Captured Lark (skiff) → Earth Station (earth_station)');
  expect(stdout).not.toContain('Crew:');
});

test('omits Status when missing and still accepts', () => {
  const stdout = renderClaim(claimDetails({}, ['status']));
  expect(stdout).toContain('=== Claim Prize ===');
  expect(stdout).toContain('Prize ID: prize-1');
  expect(stdout).not.toContain('Status:');
});

test('prints unknown status tokens as-is', () => {
  const stdout = renderClaim(claimDetails({ status: 'mysterious' }));
  expect(stdout).toContain('Status: mysterious');
});

test('ignores extra live fields and still accepts', () => {
  const stdout = renderClaim(
    claimDetails({
      wait_reason: 'busy',
      extra: { nested: true },
    }),
  );
  expect(stdout).toContain('=== Claim Prize ===');
  expect(stdout).toContain('Captured Lark (skiff) → Earth Station (earth_station)');
  expect(stdout).not.toContain('wait_reason');
  expect(stdout).not.toContain('busy');
  expect(stdout).not.toContain('=== Response ===');
});

test('--quiet still prints the claim_prize receipt', () => {
  const stdout = renderClaim(structuredClone(claimPrizeFixture), { quiet: true });
  expect(stdout).toContain('=== Claim Prize ===');
  expect(stdout).toContain('Captured Lark (skiff) → Earth Station (earth_station)');
});

test('--quiet nested auto-docked claim_prize omits banner but keeps compact dock state', () => {
  const stdout = renderClaim(
    {
      details: claimDetails(),
      auto_docked: true,
      location: structuredClone(storageDepositAutoDockedFixture.location),
    },
    { quiet: true },
  );
  expect(stdout).toContain('=== Claim Prize ===');
  expect(stdout).toContain('Captured Lark (skiff) → Earth Station (earth_station)');
  expect(stdout).toContain('Docked at: Earth Station (earth_station)');
  expect(stdout).not.toContain('[AUTO-DOCKED]');
});

test('--plain claim_prize receipt has no ANSI', () => {
  const stdout = renderClaim(structuredClone(claimPrizeFixture), { plain: true });
  expect(stdout).toContain('=== Claim Prize ===');
  expect(stdout).not.toContain('\x1b');
});

test('service_prize with overlapping scalars does not print the claim hero line', () => {
  const stdout = renderStructuredResult('service_prize', claimDetails(), options, context).stdout.join('\n');
  expect(stdout).not.toContain('Captured Lark (skiff) → Earth Station (earth_station)');
  expect(stdout).not.toContain('Captured Lark (skiff) →');
});

test('declines missing prize_id to scalar dump without a hero line', () => {
  const stdout = renderClaim(claimDetails({ prize_id: '' }));
  expect(stdout).not.toContain('Captured Lark (skiff) →');
  expect(stdout).toContain('Ship Id:');
});

test('declines missing ship identity even when ship_id is present', () => {
  const stdout = renderClaim(claimDetails({ ship_name: '', ship_class: '' }));
  expect(stdout).not.toContain(' → Earth Station');
  expect(stdout).toContain('Prize Id:');
  expect(stdout).toContain('Ship Id:');
});

test('declines missing destination identity', () => {
  const stdout = renderClaim(claimDetails({ destination_name: '', destination_base_id: '' }));
  expect(stdout).not.toContain('Captured Lark (skiff) →');
  expect(stdout).toContain('Prize Id:');
});
