import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { renderStructuredResult } from './index.ts';
import { listShipsFixture } from './ship.fixtures.ts';

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

function cloneListShips(): Record<string, unknown> {
  return structuredClone(listShipsFixture) as Record<string, unknown>;
}

function cloneShips(fixture: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(fixture.ships) ? (fixture.ships as Array<Record<string, unknown>>) : [];
}

function tableHeader(stdout: string): string {
  const headerLine = stdout.split('\n').find((line) => line.includes('|') && line.includes('Name'));
  expect(headerLine).toBeDefined();
  return headerLine ?? '';
}

function tableRow(stdout: string, needle: string): string {
  const row = stdout.split('\n').find((line) => line.includes('|') && line.includes(needle));
  expect(row).toBeDefined();
  return row ?? '';
}

function nameCell(row: string, header: string): string {
  const nameIndex = header.indexOf('Name');
  const classIndex = header.indexOf('Class');
  return row.slice(nameIndex, classIndex);
}

function renderListShips(fixture: Record<string, unknown>, extraOptions: Partial<GlobalOptions> = {}) {
  return renderStructuredResult('list_ships', structuredClone(fixture), { ...options, ...extraOptions }, context);
}

test('list_ships happy path shows fleet, module types, garage, and footer', () => {
  const rendered = renderListShips(listShipsFixture);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Owned: 2');
  expect(stdout).toContain('Active ship: Burn-Rate Betty (ship-active)');
  expect(stdout).toContain('=== Ships ===');
  expect(stdout).toContain('Burn-Rate Betty');
  expect(stdout).toContain('Dust Devil');
  expect(stdout).toContain('yes');
  expect(stdout).toContain('no');
  expect(stdout).toContain('active (with you)');
  expect(stdout).toContain('stored at Nova Terra Central');
  expect(stdout).toContain('420/420');
  expect(stdout).toContain('240/240');
  expect(stdout).toContain('12');
  expect(stdout).toContain('3');
  expect(stdout).toContain('=== Module types ===');
  expect(stdout).toContain('survey_scanner_ii, mining_laser_i, cargo_expander_iii');
  expect(stdout).toContain('=== Faction garage ===');
  expect(stdout).toContain('Used: 1/4');
  expect(stdout).toContain('Rock Skipper');
  expect(stdout).toContain('Ibis');
  expect(stdout).toContain('12,500 cr');
  expect(stdout).toContain('Use get_ship <ship_id> for the full fit.');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toMatch(/\bStation\b/);

  const header = tableHeader(stdout);
  expect(header).toContain('Class');
  expect(header).toContain('Active');
  expect(header).toContain('Location');
  expect(header).toContain('Hull');
  expect(header).toContain('Fuel');
  expect(header).toContain('Cargo');
  expect(header).toContain('Mods');
  expect(header).toContain('Listing');
  expect(header).toContain('Price');
  expect(header).not.toContain('Station');
  expect(header).not.toContain('Type');

  const bettyCell = nameCell(tableRow(stdout, 'Burn-Rate Betty'), header);
  expect(bettyCell).toContain('Burn-Rate Betty');
  expect(bettyCell).not.toContain('Lithosphere');
});

test('list_ships Name falls back to class_name when custom_name is absent', () => {
  const fixture = cloneListShips();
  const ships = cloneShips(fixture);
  const active = ships[0];
  expect(active).toBeDefined();
  if (active) delete active.custom_name;
  fixture.ships = ships;

  const stdout = renderListShips(fixture).stdout.join('\n');
  const header = tableHeader(stdout);
  expect(nameCell(tableRow(stdout, 'ship-active'), header)).toContain('Lithosphere');
  expect(stdout).not.toContain('Burn-Rate Betty');
});

test('list_ships omits module types section when no ship has module_type_ids', () => {
  const fixture = cloneListShips();
  fixture.ships = cloneShips(fixture).map((ship) => {
    const next = { ...ship };
    delete next.module_type_ids;
    return next;
  });

  const stdout = renderListShips(fixture).stdout.join('\n');
  expect(stdout).not.toContain('=== Module types ===');
  expect(stdout).toContain('Use get_ship <ship_id> for the full fit.');
  expect(stdout).toContain('=== Ships ===');
});

test('list_ships empty owned list still prints ships none and populated garage', () => {
  const fixture = {
    count: 0,
    ships: [],
    faction_garage_used: 1,
    faction_garage_capacity: 4,
    faction_garage: listShipsFixture.faction_garage,
  };

  const stdout = renderListShips(fixture).stdout.join('\n');
  expect(stdout).toContain('Owned: 0');
  expect(stdout).toContain('=== Ships ===');
  expect(stdout).toContain('(None)');
  expect(stdout).toContain('=== Faction garage ===');
  expect(stdout).toContain('Rock Skipper');
  expect(stdout).not.toContain('=== Response ===');
});

test('list_ships omits faction garage when garage keys are absent', () => {
  const fixture = cloneListShips();
  delete fixture.faction_garage;
  delete fixture.faction_garage_used;
  delete fixture.faction_garage_capacity;

  const stdout = renderListShips(fixture).stdout.join('\n');
  expect(stdout).toContain('=== Ships ===');
  expect(stdout).toContain('Burn-Rate Betty');
  expect(stdout).not.toContain('=== Faction garage ===');
  expect(stdout).not.toContain('Rock Skipper');
});

test('list_ships listing columns appear only when listing fields are present', () => {
  const withListing = tableHeader(renderListShips(listShipsFixture).stdout.join('\n'));
  expect(withListing).toContain('Listing');
  expect(withListing).toContain('Price');

  const fixture = cloneListShips();
  fixture.ships = cloneShips(fixture).map((ship) => {
    const next = { ...ship };
    delete next.listing_id;
    delete next.listing_price;
    delete next.listing_base_id;
    return next;
  });
  const withoutListing = tableHeader(renderListShips(fixture).stdout.join('\n'));
  expect(withoutListing).not.toContain('Listing');
  expect(withoutListing).not.toContain('Price');
});

test('list_ships JSON mode keeps original field names', () => {
  const rendered = renderListShips(listShipsFixture, { json: true, format: 'json' });
  const stdout = rendered.stdout.join('\n');
  expect(stdout).not.toContain('=== Ships ===');
  const parsed = JSON.parse(stdout) as {
    ships: Array<{ custom_name?: string; module_type_ids?: string[]; is_active?: boolean }>;
    faction_garage: Array<{ ship_id?: string }>;
  };
  expect(parsed.ships[0]?.custom_name).toBe('Burn-Rate Betty');
  expect(parsed.ships[0]?.module_type_ids).toEqual(['survey_scanner_ii', 'mining_laser_i', 'cargo_expander_iii']);
  expect(parsed.faction_garage[0]?.ship_id).toBe('ship-garage');
  expect(parsed.ships[1]?.is_active).toBe(false);
});

test('list_ships Active column prints yes/no instead of true/false', () => {
  const stdout = renderListShips(listShipsFixture).stdout.join('\n');
  expect(stdout).toMatch(/\|\s*yes\s*\|/);
  expect(stdout).toMatch(/\|\s*no\s*\|/);
  expect(stdout).not.toMatch(/\|\s*true\s*\|/);
  expect(stdout).not.toMatch(/\|\s*false\s*\|/);
});

test('list_ships declines envelopes without ships, garage array, or count', () => {
  const stdout = renderListShips({ message: 'ok' }).stdout.join('\n');
  expect(stdout).not.toContain('=== Ships ===');
  expect(stdout).not.toContain('=== Faction garage ===');
  expect(stdout.includes('=== Response ===') || stdout.includes('OK:')).toBe(true);
});

test('list_ships empty garage with used/capacity prints one heading and none', () => {
  const active = listShipsFixture.ships[0];
  expect(active).toBeDefined();
  const fixture = {
    count: 1,
    ships: active ? [active] : [],
    faction_garage: [],
    faction_garage_used: 0,
    faction_garage_capacity: 4,
  };

  const stdout = renderListShips(fixture).stdout.join('\n');
  expect(stdout).toContain('=== Faction garage ===');
  expect(stdout).toContain('Used: 0/4');
  expect(stdout).toContain('(None)');
  expect(stdout.split('=== Faction garage ===').length - 1).toBe(1);
});

test('list_ships does not truncate a 36-character ship UUID', () => {
  const stdout = renderListShips(listShipsFixture).stdout.join('\n');
  expect(stdout).toContain('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  expect(stdout).not.toContain('aaaaaaa...');
  expect(stdout).not.toContain('aaaaaaaa-bbbb-cccc-dddd-eeeeeee...');
});
