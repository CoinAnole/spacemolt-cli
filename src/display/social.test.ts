import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { renderStructuredResult } from './index.ts';
import { facilityListFixture, factionFacilityOwnedFixture } from './social.fixtures.ts';

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

test('renders faction-owned facility rent summary and delinquency fields', () => {
  const rendered = renderStructuredResult(
    'faction_facility_owned',
    structuredClone(factionFacilityOwnedFixture),
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  expect(rendered.stdout.join('\n')).toContain('Faction rent bill: 1,200cr/cycle');
  expect(rendered.stdout.join('\n')).toContain('Faction arrears: 2,400cr');
  expect(rendered.stdout.join('\n')).toContain('Grace remaining: 1 cycle');
  expect(rendered.stdout.join('\n')).toContain('Missed');
  expect(rendered.stdout.join('\n')).toContain('Arrears');
  expect(rendered.stdout.join('\n')).toContain('2,400cr');
});

test('renders facility list per-cycle item and labor upkeep', () => {
  const rendered = renderStructuredResult('facility_list', structuredClone(facilityListFixture), options, context);

  expect(rendered.success).toBe(true);
  expect(rendered.stdout.join('\n')).toContain('Upkeep');
  expect(rendered.stdout.join('\n')).toContain('Labor/cycle');
  expect(rendered.stdout.join('\n')).toContain('12 Fuel Cell');
  expect(rendered.stdout.join('\n')).toContain('320cr');
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
  expect(stdout).toContain('Rent');
});
