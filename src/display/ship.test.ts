import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { renderStructuredResult } from './index.ts';
import { formatCrewRatio } from './personnel.ts';
import { factionGaragesFixture, listShipsFixture, shipFixture, shipIncapacitatedFixture } from './ship.fixtures.ts';

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

function renderFactionGarages(fixture: Record<string, unknown>, extraOptions: Partial<GlobalOptions> = {}) {
  return renderStructuredResult('faction_garages', structuredClone(fixture), { ...options, ...extraOptions }, context);
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
  expect(stdout).toContain('Use get_ship <id> for the full fit.');
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
  expect(stdout).toContain('Use get_ship <id> for the full fit.');
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

test('faction_garages happy path shows stations and ships', () => {
  const rendered = renderFactionGarages(factionGaragesFixture);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Faction garages ===');
  expect(stdout).toContain('Stations: 2');
  expect(stdout).toContain('Ships: 2');
  expect(stdout).toContain('=== Nova Terra Central (nova_terra_central) ===');
  expect(stdout).toContain('System: Sol');
  expect(stdout).toContain('Used: 1/4');
  expect(stdout).toContain('Rock Skipper');
  expect(stdout).toContain('Ibis');
  expect(stdout).toContain('ship-garage');
  expect(stdout).toContain('=== Alpha Centauri Colonial Station (alpha_centauri_colonial_station) ===');
  expect(stdout).toContain('System: Alpha Centauri');
  expect(stdout).toContain('Claim Candidate');
  expect(stdout).toContain('Fabrini');
  expect(stdout).not.toContain('=== Response ===');
});

test('faction_garages empty stations prints totals only', () => {
  const stdout = renderFactionGarages({
    station_count: 0,
    total_ships: 0,
    stations: [],
  }).stdout.join('\n');

  expect(stdout).toContain('=== Faction garages ===');
  expect(stdout).toContain('Stations: 0');
  expect(stdout).toContain('Ships: 0');
  expect(stdout).not.toContain('Used:');
  expect(stdout).not.toContain('System:');
  expect(stdout).not.toContain('=== Response ===');
});

test('faction_garages omits optional station and ship names when absent', () => {
  const stdout = renderFactionGarages({
    station_count: 1,
    total_ships: 1,
    stations: [
      {
        base_id: 'nova_terra_central',
        used: 1,
        capacity: 4,
        ships: [
          {
            ship_id: 'ship-garage',
            class_id: 'prospector',
            depositor_id: 'player-1',
            deposited_tick: 12050,
          },
        ],
      },
    ],
  }).stdout.join('\n');

  expect(stdout).toContain('=== nova_terra_central ===');
  expect(stdout).toContain('prospector');
  expect(stdout).toContain('player-1');
  expect(stdout).not.toContain('System:');
  expect(stdout).not.toContain('Nova Terra Central');
  expect(stdout).not.toContain('Rock Skipper');
  expect(stdout).not.toContain('Ibis');
  expect(stdout).not.toContain('=== Response ===');
});

test('faction_garages station with empty ships prints none', () => {
  const stdout = renderFactionGarages({
    station_count: 1,
    total_ships: 0,
    stations: [
      {
        base_id: 'nova_terra_central',
        base_name: 'Nova Terra Central',
        used: 0,
        capacity: 4,
        ships: [],
      },
    ],
  }).stdout.join('\n');

  expect(stdout).toContain('=== Nova Terra Central (nova_terra_central) ===');
  expect(stdout).toContain('Used: 0/4');
  expect(stdout).toContain('(None)');
  expect(stdout).not.toContain('=== Response ===');
});

function renderShip(fixture: Record<string, unknown>) {
  return renderStructuredResult('get_ship', structuredClone(fixture), options, context);
}

test('formatCrewRatio prints occupancy and omits missing or non-finite counts', () => {
  expect(formatCrewRatio(shipFixture.ship)).toBe('4/6');
  expect(formatCrewRatio(shipIncapacitatedFixture.ship)).toBe('0/6');
  expect(formatCrewRatio({ name: 'Bare' })).toBeUndefined();
  expect(formatCrewRatio({ personnel: { fit_crew: 4 } })).toBeUndefined();
  expect(formatCrewRatio({ personnel: { fit_crew: Number.NaN }, effective_crew_capacity: 6 })).toBeUndefined();
});

test('get_ship prints healthy personnel after berths and before modules', () => {
  const stdout = renderShip(shipFixture).stdout.join('\n');
  expect(stdout).toContain('Crew: 4/6 fit (min 3)');
  expect(stdout).toContain('Marines: 2/4 fit');
  expect(stdout).toContain('Efficiency: 67%');
  expect(stdout).toContain('Operational speed: 8');
  expect(stdout).not.toContain('injured');
  expect(stdout).not.toContain('INCAPACITATED');
  expect(stdout).not.toContain('Survivor recovery:');
  expect(stdout).not.toContain('undefined');
  const berthsIdx = stdout.indexOf('Berths:');
  const crewIdx = stdout.indexOf('Crew:');
  const modulesIdx = stdout.indexOf('=== Modules ===');
  expect(crewIdx).toBeGreaterThan(berthsIdx);
  expect(modulesIdx).toBeGreaterThan(crewIdx);
});

test('get_ship omits personnel lines when personnel and scalars are absent', () => {
  const fixture = structuredClone(shipFixture) as { ship: Record<string, unknown> };
  delete fixture.ship.personnel;
  delete fixture.ship.effective_crew_capacity;
  delete fixture.ship.effective_marine_capacity;
  delete fixture.ship.minimum_crew;
  delete fixture.ship.crew_efficiency;
  delete fixture.ship.operational_speed;
  delete fixture.ship.incapacitated;
  const stdout = renderShip(fixture).stdout.join('\n');
  expect(stdout).not.toContain('Crew:');
  expect(stdout).not.toContain('Marines:');
  expect(stdout).not.toContain('Efficiency:');
  expect(stdout).not.toContain('Operational speed:');
  expect(stdout).not.toContain('INCAPACITATED');
  expect(stdout).not.toContain('Survivor recovery:');
});

test('get_ship prints incapacitated warning, injured survivors, recovery, and no version', () => {
  const fixture = structuredClone(shipIncapacitatedFixture) as {
    ship: { personnel: Record<string, unknown> };
  };
  fixture.ship.personnel.version = 7;
  const stdout = renderShip(fixture).stdout.join('\n');
  expect(stdout).toContain('Crew: 0/6 fit, 2 injured (min 3)');
  expect(stdout).toContain('Marines: 0/4 fit, 1 injured');
  expect(stdout).toContain('Efficiency: 0%');
  expect(stdout).toContain('Operational speed: 0 (base 12)');
  expect(stdout).toContain('INCAPACITATED: no fit crew — ship operations unavailable');
  expect(stdout).toContain('Survivor recovery: 5 ticks (tick 12600)');
  expect(stdout).not.toContain('version');
  expect(stdout).not.toContain('undefined');
  expect(stdout).not.toContain('=== Response ===');
  const incapacitatedIdx = stdout.indexOf('INCAPACITATED:');
  const modulesIdx = stdout.indexOf('=== Modules ===');
  expect(incapacitatedIdx).toBeGreaterThan(stdout.indexOf('Operational speed:'));
  expect(modulesIdx).toBeGreaterThan(incapacitatedIdx);
});

test('get_ship omits efficiency and incapacitated noise and prints recovery 0', () => {
  const fixture = structuredClone(shipFixture) as { ship: Record<string, unknown> };
  delete fixture.ship.crew_efficiency;
  fixture.ship.incapacitated = false;
  fixture.ship.operational_speed = 8;
  fixture.ship.speed = 8;
  fixture.ship.personnel_recovery_ticks_remaining = 0;
  const stdout = renderShip(fixture).stdout.join('\n');
  expect(stdout).not.toContain('Efficiency:');
  expect(stdout).not.toContain('INCAPACITATED');
  expect(stdout).toContain('Operational speed: 8');
  expect(stdout).not.toContain('(base 8)');
  expect(stdout).toContain('Survivor recovery: 0 ticks');
});

test('get_ship prints non-integer operational speed without coercing to int', () => {
  const fixture = structuredClone(shipFixture) as { ship: Record<string, unknown> };
  fixture.ship.operational_speed = 8.5;
  fixture.ship.speed = 8.5;
  const stdout = renderShip(fixture).stdout.join('\n');
  expect(stdout).toContain('Operational speed: 8.5');
  expect(stdout).not.toContain('Operational speed: 8\n');
  expect(stdout).not.toContain('Operational speed: 9');
  expect(stdout).not.toContain('(base 8.5)');
});

test('get_ship does not warn when incapacitated is not boolean true', () => {
  for (const incapacitated of ['true', 1, 'yes']) {
    const fixture = structuredClone(shipFixture) as { ship: Record<string, unknown> };
    fixture.ship.incapacitated = incapacitated;
    const stdout = renderShip(fixture).stdout.join('\n');
    expect(stdout).not.toContain('INCAPACITATED');
  }
});

test('get_ship omits Survivor recovery when only personnel_recovery_tick is set', () => {
  const fixture = structuredClone(shipFixture) as { ship: Record<string, unknown> };
  delete fixture.ship.personnel_recovery_ticks_remaining;
  fixture.ship.personnel_recovery_tick = 12600;
  const stdout = renderShip(fixture).stdout.join('\n');
  expect(stdout).not.toContain('Survivor recovery:');
  expect(stdout).not.toContain('tick 12600');
});
