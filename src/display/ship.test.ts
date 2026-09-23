import { describe, expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { withDisplayRenderBuffer } from './helpers.ts';
import { renderStructuredResult } from './index.ts';
import { formatCrewRatio } from './personnel.ts';
import {
  cargoFixture,
  cargoOverCapacityFixture,
  factionGaragesFixture,
  listShipsFixture,
  reloadBulkFixture,
  reloadBulkMixedFixture,
  reloadFixture,
  repairFixture,
  repairFleetFixture,
  repairStationFixture,
  repairTargetFixture,
  scrapWreckFixture,
  sellWreckFixture,
  sellWreckModulesFixture,
  sellWreckPartialPayFixture,
  shipFixture,
  shipIncapacitatedFixture,
  shipOverCapacityFixture,
} from './ship.fixtures.ts';
import { emitCargoHold } from './ship.ts';

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

test('get_ship flags only over-capacity ratios', () => {
  const fixture = { ...shipFixture, ship: { ...shipFixture.ship, cpu_used: 40 } };
  const stdout = renderShip(fixture).stdout.join('\n');
  expect(stdout).toContain('CPU: 40/34 (over capacity)');
  expect(stdout).toContain('Cargo: 0/1250');
  expect(stdout).toContain('Power: 23/75');
  expect(stdout).not.toContain('Cargo: 0/1250 (over capacity)');
  expect(stdout).not.toContain('Power: 23/75 (over capacity)');
});

test('get_ship does not flag per-module CPU or Power', () => {
  const stdout = renderShip(shipOverCapacityFixture).stdout.join('\n');
  const modulesHalf = stdout.split('=== Modules ===')[1] ?? '';
  expect(modulesHalf).not.toContain('(over capacity)');
  const expander = tableRow(stdout, 'Cargo Expander III');
  const laser = tableRow(stdout, 'Pulse Laser III');
  expect(expander).toMatch(/\|\s*2\s*\|\s*2\s*\|/);
  expect(laser).toMatch(/\|\s*3\s*\|\s*8\s*\|/);
});

test('get_cargo flags used over capacity without inventing available', () => {
  const stdout = renderStructuredResult(
    'get_cargo',
    structuredClone(cargoOverCapacityFixture),
    options,
    context,
  ).stdout.join('\n');
  expect(stdout).toContain('Used: 120/100 (over capacity)');
  expect(stdout).not.toContain('(available)');
});

test('get_cargo does not flag equal used and capacity', () => {
  const stdout = renderStructuredResult('get_cargo', structuredClone(cargoFixture), options, context).stdout.join('\n');
  expect(stdout).toContain('Used: 50/100');
  expect(stdout).not.toContain('(over capacity)');
});

test('get_cargo prints over-capacity before available', () => {
  const stdout = renderStructuredResult(
    'get_cargo',
    { ...cargoOverCapacityFixture, available: 5 },
    options,
    context,
  ).stdout.join('\n');
  expect(stdout).toContain('Used: 120/100 (over capacity) (5 available)');
});

test('install_mod ship fallback flags over-capacity CPU', () => {
  const stdout = renderStructuredResult(
    'install_mod',
    structuredClone(shipOverCapacityFixture),
    options,
    context,
  ).stdout.join('\n');
  expect(stdout).toContain('=== Ship:');
  expect(stdout).toContain('CPU: 40/34 (over capacity)');
});

function renderSellWreck(fixture: Record<string, unknown>) {
  return renderStructuredResult('sell_wreck', structuredClone(fixture), options, context);
}

test('sell_wreck prints Offer and Paid when they match', () => {
  const stdout = renderSellWreck(sellWreckFixture).stdout.join('\n');
  expect(stdout).toContain('=== Wreck Sold ===');
  expect(stdout).toContain('Wreck: wreck-1 (skiff)');
  expect(stdout).toContain('Offer: 500 cr');
  expect(stdout).toContain('Paid: 500 cr');
  expect(stdout).toContain('Salvage value: 400 cr');
  expect(stdout).toContain('New balance: 2,400 cr');
  expect(stdout).toContain('Sold wreck.');
  expect(stdout).not.toContain('less than offer');
  expect(stdout).not.toContain('Cargo Value');
  expect(stdout).not.toContain('Total Payout');
  expect(stdout).not.toContain('=== Sell Complete ===');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('Modules Stored');
});

test('sell_wreck labels a shortfall when paid is less than offer', () => {
  const stdout = renderSellWreck(sellWreckPartialPayFixture).stdout.join('\n');
  expect(stdout).toContain('=== Wreck Sold ===');
  expect(stdout).toContain('Offer: 500 cr');
  expect(stdout).toContain('Paid: 350 cr (150 cr less than offer)');
  expect(stdout).toContain('New balance: 2,250 cr');
  expect(stdout).toContain('Station manager was short on credits and paid what they could.');
  expect(stdout).not.toContain('=== Sell Complete ===');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('Modules Stored');
});

test('sell_wreck declines without an offer pair', () => {
  const fixture = structuredClone(sellWreckFixture) as { details: Record<string, unknown> };
  delete fixture.details.offer;
  const stdout = renderSellWreck(fixture).stdout.join('\n');
  expect(stdout).not.toContain('=== Wreck Sold ===');
  expect(stdout).not.toContain('=== Sell Complete ===');
  expect(
    stdout.includes('=== Sell Wreck ===') || stdout.includes('Total Payout') || stdout.includes('=== Response ==='),
  ).toBe(true);
});

test('sell_wreck does not claim a market sell shape', () => {
  const stdout = renderSellWreck({
    details: {
      action: 'sell_wreck',
      wreck_id: 'wreck-1',
      offer: 500,
      total_payout: 500,
      new_balance: 2400,
      item: 'iron_ore',
      quantity_sold: 10,
      fills: [{ quantity: 10, price_each: 50, subtotal: 500 }],
      message: 'Sold items.',
    },
  }).stdout.join('\n');
  expect(stdout).not.toContain('=== Wreck Sold ===');
  expect(stdout).not.toContain('=== Sell Complete ===');
});

test('sell_wreck prints leftover modules stored at the station', () => {
  const stdout = renderSellWreck(sellWreckModulesFixture).stdout.join('\n');
  expect(stdout).toContain('=== Wreck Sold ===');
  expect(stdout).toContain('Offer: 500 cr');
  expect(stdout).toContain('Paid: 500 cr');
  expect(stdout).toContain('=== Modules Stored ===');
  expect(stdout).toContain('Pulse Laser I');
  expect(stdout).toContain('pulse_laser_i');
  expect(stdout).toContain('Cargo Expander I');
  expect(stdout).toContain('cargo_expander_i');
  expect(stdout).toContain('Sold wreck. Leftover modules moved to station storage.');
  expect(stdout).toMatch(/cargo_expander_i\s*\nSold wreck\. Leftover modules moved to station storage\./);
  expect(stdout).not.toMatch(/cargo_expander_i\s*\n\nSold wreck/);
  expect(stdout).not.toContain('item(s)');
  expect(stdout).not.toContain('=== Response ===');
});

test('sell_wreck omits the modules table when modules_stored is empty', () => {
  const fixture = structuredClone(sellWreckFixture) as { details: Record<string, unknown> };
  fixture.details.modules_stored = [];
  const stdout = renderSellWreck(fixture).stdout.join('\n');
  expect(stdout).toContain('=== Wreck Sold ===');
  expect(stdout).toContain('New balance: 2,400 cr');
  expect(stdout).not.toContain('=== Modules Stored ===');
  expect(stdout).not.toContain('(None)');
});

test('sell_wreck omits the modules table when modules_stored is not an array', () => {
  const fixture = structuredClone(sellWreckFixture) as { details: Record<string, unknown> };
  fixture.details.modules_stored = { module_type: 'pulse_laser_i', name: 'Pulse Laser I' };
  const stdout = renderSellWreck(fixture).stdout.join('\n');
  expect(stdout).toContain('=== Wreck Sold ===');
  expect(stdout).not.toContain('=== Modules Stored ===');
  expect(stdout).not.toContain('Pulse Laser I');
});

test('sell_wreck skips non-record and empty name/type module entries', () => {
  const stdout = renderSellWreck({
    details: {
      ...sellWreckFixture.details,
      modules_stored: [
        { module_type: 'pulse_laser_i', name: 'Pulse Laser I' },
        'not-a-record',
        42,
        null,
        undefined,
        { name: '', module_type: '' },
        {},
        { module_type: 'cargo_expander_i' },
        { name: 'Shield Booster I' },
      ],
    },
  }).stdout.join('\n');
  expect(stdout).toContain('=== Modules Stored ===');
  expect(stdout).toContain('Pulse Laser I');
  expect(stdout).toContain('pulse_laser_i');
  expect(stdout).toContain('cargo_expander_i');
  expect(stdout).toContain('Shield Booster I');
  expect(stdout).not.toContain('not-a-record');
  expect(stdout).not.toContain('item(s)');
});

test('sell_wreck keeps whitespace-only module name and type', () => {
  const stdout = renderSellWreck({
    details: {
      ...sellWreckFixture.details,
      modules_stored: [{ module_type: '  pulse_type  ', name: '  Pulse  ' }],
    },
  }).stdout.join('\n');
  expect(stdout).toContain('=== Modules Stored ===');
  expect(stdout).toContain('  Pulse  ');
  expect(stdout).toContain('  pulse_type  ');
});

test('sell_wreck details-only auto_docked does not print a receipt line or banner', () => {
  const stdout = renderSellWreck({
    details: {
      ...sellWreckFixture.details,
      auto_docked: true,
    },
  }).stdout.join('\n');
  expect(stdout).toContain('=== Wreck Sold ===');
  expect(stdout).not.toContain('Auto-docked:');
  expect(stdout).not.toContain('Auto Docked:');
  expect(stdout).not.toContain('[AUTO-DOCKED]');
});

function renderScrapWreck(fixture: Record<string, unknown>) {
  return renderStructuredResult('scrap_wreck', structuredClone(fixture), options, context);
}

test('scrap_wreck prints wreck, storage, value, and expanded materials', () => {
  const stdout = renderScrapWreck(scrapWreckFixture).stdout.join('\n');
  expect(stdout).toContain('=== Wreck Scrapped ===');
  expect(stdout).toContain('Wreck: wreck-1 (skiff)');
  expect(stdout).toContain('Stored at: sol_yard');
  expect(stdout).toContain('Total value: 1,250 cr');
  expect(stdout).toContain('=== Materials ===');
  expect(stdout).toContain('Scrap Metal');
  expect(stdout).toContain('Pulse Laser I');
  expect(stdout).toMatch(/Pulse Laser I\s+\|\s+1\s*\nScrapped wreck\./);
  expect(stdout).not.toMatch(/Pulse Laser I\s+\|\s+1\s*\n\nScrapped wreck\./);
  expect(stdout).not.toContain('Materials: 1 item(s)');
  expect(stdout).not.toContain('=== Scrap Wreck ===');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('Action:');
});

test('scrap_wreck omits the materials table when materials is empty', () => {
  const fixture = structuredClone(scrapWreckFixture) as { details: Record<string, unknown> };
  fixture.details.materials = [];
  const stdout = renderScrapWreck(fixture).stdout.join('\n');
  expect(stdout).toContain('=== Wreck Scrapped ===');
  expect(stdout).toContain('Wreck: wreck-1 (skiff)');
  expect(stdout).not.toContain('=== Materials ===');
  expect(stdout).not.toContain('(None)');
});

test('scrap_wreck omits the materials table when materials has no records', () => {
  const fixture = structuredClone(scrapWreckFixture) as { details: Record<string, unknown> };
  fixture.details.materials = ['not-a-record', 4, null];
  const stdout = renderScrapWreck(fixture).stdout.join('\n');
  expect(stdout).toContain('=== Wreck Scrapped ===');
  expect(stdout).not.toContain('=== Materials ===');
  expect(stdout).not.toContain('(None)');
});

test('scrap_wreck omits stored_at, class suffix, and message when missing or empty', () => {
  const fixture = structuredClone(scrapWreckFixture) as { details: Record<string, unknown> };
  fixture.details.stored_at = '';
  fixture.details.ship_class = '';
  fixture.details.message = '';
  const stdout = renderScrapWreck(fixture).stdout.join('\n');
  expect(stdout).toContain('=== Wreck Scrapped ===');
  expect(stdout).toContain('Wreck: wreck-1');
  expect(stdout).not.toContain('(skiff)');
  expect(stdout).not.toContain('Stored at:');
  expect(stdout).not.toContain('Scrapped wreck.');
});

test('scrap_wreck omits stored_at when the field is missing or non-string', () => {
  const missing = structuredClone(scrapWreckFixture) as { details: Record<string, unknown> };
  delete missing.details.stored_at;
  expect(renderScrapWreck(missing).stdout.join('\n')).not.toContain('Stored at:');

  const nonString = structuredClone(scrapWreckFixture) as { details: Record<string, unknown> };
  nonString.details.stored_at = 12;
  expect(renderScrapWreck(nonString).stdout.join('\n')).not.toContain('Stored at:');
});

test('scrap_wreck prints Total value: 0 cr and omits invalid values', () => {
  const zero = structuredClone(scrapWreckFixture) as { details: Record<string, unknown> };
  zero.details.total_value = 0;
  expect(renderScrapWreck(zero).stdout.join('\n')).toContain('Total value: 0 cr');

  const missing = structuredClone(scrapWreckFixture) as { details: Record<string, unknown> };
  delete missing.details.total_value;
  expect(renderScrapWreck(missing).stdout.join('\n')).not.toContain('Total value:');

  const empty = structuredClone(scrapWreckFixture) as { details: Record<string, unknown> };
  empty.details.total_value = '';
  expect(renderScrapWreck(empty).stdout.join('\n')).not.toContain('Total value:');

  const nulled = structuredClone(scrapWreckFixture) as { details: Record<string, unknown> };
  nulled.details.total_value = null;
  expect(renderScrapWreck(nulled).stdout.join('\n')).not.toContain('Total value:');

  const nan = structuredClone(scrapWreckFixture) as { details: Record<string, unknown> };
  nan.details.total_value = Number.NaN;
  expect(renderScrapWreck(nan).stdout.join('\n')).not.toContain('Total value:');

  const infinite = structuredClone(scrapWreckFixture) as { details: Record<string, unknown> };
  infinite.details.total_value = Number.POSITIVE_INFINITY;
  expect(renderScrapWreck(infinite).stdout.join('\n')).not.toContain('Total value:');
});

test('scrap_wreck declines when materials is missing', () => {
  const fixture = structuredClone(scrapWreckFixture) as { details: Record<string, unknown> };
  delete fixture.details.materials;
  const stdout = renderScrapWreck(fixture).stdout.join('\n');
  expect(stdout).not.toContain('=== Wreck Scrapped ===');
});

test('scrap_wreck details-only auto_docked does not print a receipt line or banner', () => {
  const stdout = renderScrapWreck({
    details: {
      ...scrapWreckFixture.details,
      auto_docked: true,
    },
  }).stdout.join('\n');
  expect(stdout).toContain('=== Wreck Scrapped ===');
  expect(stdout).not.toContain('Auto-docked:');
  expect(stdout).not.toContain('Auto Docked:');
  expect(stdout).not.toContain('[AUTO-DOCKED]');
});

function renderRepair(fixture: Record<string, unknown>) {
  return renderStructuredResult('repair', structuredClone(fixture), options, context);
}

test('repair kits print hull restored and kits used without fallback', () => {
  const stdout = renderRepair(repairFixture).stdout.join('\n');
  expect(stdout).toContain('=== Repair Complete ===');
  expect(stdout).toContain('Source: kits');
  expect(stdout).toContain('Hull restored: 8');
  expect(stdout).toContain('Hull: 92/100');
  expect(stdout).toContain('Kits used: 1');
  expect(stdout).toContain('Item: Repair Kit (repair_kit)');
  expect(stdout).toContain('Hull repaired.');
  expect(stdout).not.toContain('Has arm:');
  expect(stdout).not.toContain('Cost:');
  expect(stdout).not.toContain('Target:');
  expect(stdout).not.toContain('item(s)');
  expect(stdout).not.toContain('?/?');
  expect(stdout).not.toContain('=== Response ===');
});

test('repair station prints restored hull not an overstated kits number', () => {
  const stdout = renderRepair(repairStationFixture).stdout.join('\n');
  expect(stdout).toContain('=== Repair Complete ===');
  expect(stdout).toContain('Source: station');
  expect(stdout).toContain('Hull restored: 3');
  expect(stdout).toContain('Hull: 100/100');
  expect(stdout).toContain('Cost: 1,200 cr');
  expect(stdout).not.toContain('Kits used:');
  expect(stdout).not.toContain('Has arm:');
  expect(stdout).not.toContain('item(s)');
  expect(stdout).not.toContain('=== Response ===');
});

test('repair target prints target hull and restored amount', () => {
  const stdout = renderRepair(repairTargetFixture).stdout.join('\n');
  expect(stdout).toContain('=== Repair Complete ===');
  expect(stdout).toContain('Source: kits');
  expect(stdout).toContain('Hull restored: 8');
  expect(stdout).toContain('Target: Alice (player-id)');
  expect(stdout).toContain('Target hull: 92/100');
  expect(stdout).toContain('Kits used: 1');
  expect(stdout).not.toContain('Hull: ');
  expect(stdout).not.toContain('Has arm:');
  expect(stdout).not.toContain('Cost:');
  expect(stdout).not.toContain('item(s)');
  expect(stdout).not.toContain('=== Response ===');
});

test('repair fleet prints pilots and omits hull-restored and kits lines', () => {
  const stdout = renderRepair(repairFleetFixture).stdout.join('\n');
  expect(stdout).toContain('=== Repair Complete ===');
  expect(stdout).toContain('Source: repair_arm');
  expect(stdout).toContain('Has arm: yes');
  expect(stdout).toContain('Fleet hull status.');
  expect(stdout).toContain('=== Fleet Hull ===');
  expect(stdout).toContain('Alice');
  expect(stdout).toContain('Bob');
  expect(stdout).toContain('lithosphere');
  expect(stdout).toContain('prospector');
  expect(stdout).toContain('yes');
  expect(stdout).toContain('no');
  expect(stdout).not.toContain('Hull restored:');
  expect(stdout).not.toContain('Kits used:');
  expect(stdout).not.toContain('Hull:');
  expect(stdout).not.toContain('Cost:');
  expect(stdout).not.toContain('Item:');
  expect(stdout).not.toContain('item(s)');
  expect(stdout).not.toContain('Members:');
  expect(stdout).not.toContain('=== Response ===');
});

test('repair omits gated optional lines when fields are absent', () => {
  const stdout = renderRepair({
    action: 'repair',
    source: 'kits',
    message: 'No optional hull fields.',
  }).stdout.join('\n');
  expect(stdout).toContain('=== Repair Complete ===');
  expect(stdout).toContain('Source: kits');
  expect(stdout).toContain('No optional hull fields.');
  expect(stdout).not.toContain('Has arm:');
  expect(stdout).not.toContain('Hull restored:');
  expect(stdout).not.toContain('Hull:');
  expect(stdout).not.toContain('Target:');
  expect(stdout).not.toContain('Target hull:');
  expect(stdout).not.toContain('Kits used:');
  expect(stdout).not.toContain('Item:');
  expect(stdout).not.toContain('Cost:');
  expect(stdout).not.toContain('?');
  expect(stdout).not.toContain('=== Response ===');
});

test('repair prints Has arm no and omits non-boolean has_arm', () => {
  const noArm = renderRepair({ action: 'repair', source: 'kits', has_arm: false }).stdout.join('\n');
  expect(noArm).toContain('Has arm: no');
  expect(noArm).not.toContain('Has arm: yes');

  const missing = renderRepair({ action: 'repair', source: 'kits' }).stdout.join('\n');
  expect(missing).not.toContain('Has arm:');

  const invalid = renderRepair({ action: 'repair', source: 'kits', has_arm: 'yes' }).stdout.join('\n');
  expect(invalid).not.toContain('Has arm:');
});

test('repair prints a one-sided hull pair without placeholders', () => {
  const hullOnly = renderRepair({ action: 'repair', source: 'kits', hull: 92 }).stdout.join('\n');
  expect(hullOnly).toContain('Hull: 92');
  expect(hullOnly).not.toContain('?');
  expect(hullOnly).not.toContain('Hull: 92/');

  const maxOnly = renderRepair({ action: 'repair', source: 'kits', max_hull: 100 }).stdout.join('\n');
  expect(maxOnly).toContain('Hull: 100');
  expect(maxOnly).not.toContain('?');
  expect(maxOnly).not.toContain('Hull: /100');
});

test('repair prints zero restored hull and omits non-finite repaired', () => {
  const zero = renderRepair({ action: 'repair', source: 'kits', repaired: 0 }).stdout.join('\n');
  expect(zero).toContain('Hull restored: 0');

  const missing = renderRepair({ action: 'repair', source: 'kits' }).stdout.join('\n');
  expect(missing).not.toContain('Hull restored:');

  const nan = renderRepair({ action: 'repair', source: 'kits', repaired: Number.NaN }).stdout.join('\n');
  expect(nan).not.toContain('Hull restored:');
});

test('repair fleet omits hull-restored even when repaired is present', () => {
  const stdout = renderRepair({
    ...repairFleetFixture,
    repaired: 8,
    kits_used: 1,
    hull: 92,
    max_hull: 100,
  }).stdout.join('\n');
  expect(stdout).toContain('=== Fleet Hull ===');
  expect(stdout).toContain('Alice');
  expect(stdout).not.toContain('Hull restored:');
  expect(stdout).not.toContain('Kits used:');
  expect(stdout).not.toContain('Hull: 92/100');
});

test('repair fleet omits Shield unless a member has it', () => {
  const fleetHeader = (stdout: string) =>
    stdout.split('\n').find((line) => line.includes('|') && line.includes('Pilot')) ?? '';

  const withShield = renderRepair(repairFleetFixture).stdout.join('\n');
  expect(fleetHeader(withShield)).toContain('Shield');

  const noShield = structuredClone(repairFleetFixture) as {
    members: Array<Record<string, unknown>>;
  };
  for (const member of noShield.members) {
    delete member.shield;
    delete member.max_shield;
    delete member.hull_pct;
  }
  const withoutShield = renderRepair(noShield).stdout.join('\n');
  expect(fleetHeader(withoutShield)).not.toContain('Shield');
  expect(withoutShield).toContain('Alice');
  expect(withoutShield).toContain('Bob');
});

test('repair matches command plus source when action is omitted', () => {
  const stdout = renderRepair({ source: 'kits', repaired: 4 }).stdout.join('\n');
  expect(stdout).toContain('=== Repair Complete ===');
  expect(stdout).toContain('Source: kits');
  expect(stdout).toContain('Hull restored: 4');
  expect(stdout).not.toContain('=== Response ===');
});

test('repair does not match on repaired alone', () => {
  const stdout = renderRepair({ repaired: 8, hull: 92, max_hull: 100 }).stdout.join('\n');
  expect(stdout).not.toContain('=== Repair Complete ===');
  expect(stdout).toContain('=== Response ===');
});

test('repair details-only auto_docked does not print a receipt line or banner', () => {
  const stdout = renderRepair({
    details: {
      ...repairFixture,
      auto_docked: true,
    },
  }).stdout.join('\n');
  expect(stdout).toContain('=== Repair Complete ===');
  expect(stdout).not.toContain('Auto-docked:');
  expect(stdout).not.toContain('Auto Docked:');
  expect(stdout).not.toContain('[AUTO-DOCKED]');
});

function renderReload(fixture: Record<string, unknown>, extraOptions: Partial<GlobalOptions> = {}) {
  return renderStructuredResult('reload', structuredClone(fixture), { ...options, ...extraOptions }, context);
}

function renderReloadDetails(details: Record<string, unknown>, extraOptions: Partial<GlobalOptions> = {}) {
  return renderReload({ details }, extraOptions);
}

function nestedReload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action: 'reload',
    weapon_name: 'Pulse Laser',
    weapon_id: 'weapon-1',
    ammo_name: 'Laser Cell',
    ammo_id: 'ammo-cell',
    current_ammo: 8,
    magazine_size: 8,
    ...overrides,
  };
}

function pipeCells(line: string): string[] {
  return line.split('|').map((cell) => cell.trim());
}

function resultsTable(stdout: string): { header: string[]; rows: string[][] } {
  const lines = stdout.split('\n');
  const headerIndex = lines.findIndex(
    (line) => line.includes('|') && line.includes('Index') && line.includes('Weapon'),
  );
  expect(headerIndex).toBeGreaterThanOrEqual(0);
  const header = pipeCells(lines[headerIndex] ?? '');
  const rows: string[][] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.includes('|')) continue;
    rows.push(pipeCells(line));
  }
  return { header, rows };
}

test('single-weapon reload keeps the magazine lines and skips the bulk table', () => {
  const rendered = renderReload(reloadFixture);
  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(rendered.stderr.join('')).toBe('');
  expect(stdout).toContain('Weapon: Pulse Laser (weapon-1)');
  expect(stdout).toContain('Rounds discarded: 0');
  expect(stdout).not.toContain('total |');
  expect(stdout).not.toContain('=== Results ===');
});

test('all-success bulk reload prints summary, magazines, and discarded counts', () => {
  const rendered = renderReload(reloadBulkFixture);
  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('2 total | 2 succeeded | 0 failed');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('Previous');
  expect(stdout).not.toContain('Reloaded 1 of 2');
  const { header, rows } = resultsTable(stdout);
  expect(header).toEqual(['Index', 'Weapon', 'OK', 'Ammo', 'Magazine', 'Discarded']);
  expect(rows[0]).toEqual(['0', 'Pulse Laser (weapon-1)', 'yes', 'Laser Cell (ammo-cell)', '8/8', '2']);
  expect(rows[1]).toEqual(['1', 'Scrapgun (weapon-2)', 'yes', 'Scrap (scrap_metal)', '1/1', '0']);
});

test('mixed bulk reload prints per-weapon success and failure and stays successful', () => {
  const rendered = renderReload(reloadBulkMixedFixture);
  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(rendered.stderr.join('')).toBe('');
  expect(stdout).toContain('2 total | 1 succeeded | 1 failed');
  expect(stdout).toContain('Reloaded 1 of 2 weapons.');
  expect(stdout.indexOf('Reloaded 1 of 2 weapons.')).toBeGreaterThan(
    stdout.indexOf('2 total | 1 succeeded | 1 failed'),
  );
  expect(stdout.indexOf('=== Results ===')).toBeGreaterThan(stdout.indexOf('Reloaded 1 of 2 weapons.'));
  const { header, rows } = resultsTable(stdout);
  expect(header).toEqual(['Index', 'Weapon', 'OK', 'Ammo', 'Magazine', 'Discarded', 'Detail']);
  expect(rows[0]).toEqual(['0', 'Pulse Laser (weapon-1)', 'yes', 'Laser Cell (ammo-cell)', '8/8', '0', '']);
  expect(rows[1]).toEqual(['1', 'weapon-2', 'no', '', '', '', 'incompatible_ammo: Ammo does not match this weapon.']);
});

const bulkMarkers = [
  ['mode bulk', { mode: 'bulk' }],
  ['action reload', { action: 'reload' }],
] as const;

for (const [label, marker] of bulkMarkers) {
  test(`empty results with a zero summary via ${label} prints No results`, () => {
    const stdout = renderReloadDetails({
      ...marker,
      summary: { total: 0, succeeded: 0, failed: 0 },
      results: [],
    }).stdout.join('\n');
    expect(stdout).toContain('=== Reloaded ===');
    expect(stdout).toContain('0 total | 0 succeeded | 0 failed');
    expect(stdout).toContain('No results.');
    expect(stdout).not.toContain('=== Results ===');
  });

  test(`empty results keep a non-zero summary via ${label}`, () => {
    const stdout = renderReloadDetails({
      ...marker,
      summary: { total: 2, succeeded: 0, failed: 0 },
      results: [],
    }).stdout.join('\n');
    expect(stdout).toContain('2 total | 0 succeeded | 0 failed');
    expect(stdout).toContain('No results.');
    expect(stdout).not.toContain('0 total | 0 succeeded | 0 failed');
    expect(stdout).not.toContain('=== Results ===');
  });

  test(`empty results with no summary via ${label} print question marks`, () => {
    const stdout = renderReloadDetails({
      ...marker,
      results: [],
    }).stdout.join('\n');
    expect(stdout).toContain('? total | ? succeeded | ? failed');
    expect(stdout).toContain('No results.');
    expect(stdout).not.toContain('0 total |');
  });
}

test('results without mode or action reload are not a bulk reload', () => {
  const stdout = renderReloadDetails({
    results: [],
    summary: { total: 2, succeeded: 0, failed: 0 },
  }).stdout.join('\n');
  expect(stdout).not.toContain('=== Reloaded ===');
  expect(stdout).not.toContain('2 total |');
});

test('action reload with an empty results array takes the bulk summary path', () => {
  const stdout = renderReloadDetails({ action: 'reload', results: [] }).stdout.join('\n');
  expect(stdout).toContain('=== Reloaded ===');
  expect(stdout).toContain('? total | ? succeeded | ? failed');
  expect(stdout).toContain('No results.');
  expect(stdout).not.toContain('=== Results ===');
});

test('action reload alone stays heading-only', () => {
  const stdout = renderReloadDetails({ action: 'reload' }).stdout.join('\n');
  expect(stdout).toContain('=== Reloaded ===');
  expect(stdout).not.toContain('total |');
  expect(stdout).not.toContain('No results.');
  expect(stdout).not.toContain('=== Results ===');
  expect(stdout).not.toContain('Weapon:');
});

for (const withMode of [false, true]) {
  test(`top-level weapon fields plus results stay on the bulk table (mode ${withMode})`, () => {
    const stdout = renderReloadDetails({
      action: 'reload',
      ...(withMode ? { mode: 'bulk' } : {}),
      weapon_id: 'weapon-top',
      weapon_name: 'Top Laser',
      current_ammo: 3,
      summary: { total: 1, succeeded: 1, failed: 0 },
      results: [{ index: 0, weapon_id: 'weapon-1', success: true, result: nestedReload() }],
    }).stdout.join('\n');
    expect(stdout).toContain('=== Results ===');
    expect(stdout).toContain('Pulse Laser (weapon-1)');
    expect(stdout).not.toContain('Weapon: ');
    expect(stdout).not.toContain('Current ammo:');
    expect(stdout).not.toContain('weapon-top');
    expect(stdout).not.toContain('Top Laser');
  });
}

test('copied location and fuel keys are not bulk signals', () => {
  const single = renderReloadDetails({
    action: 'reload',
    weapon_name: 'Pulse Laser',
    weapon_id: 'weapon-1',
    current_ammo: 4,
    fuel_now: 80,
    fuel_max: 100,
    system_id: 'sol',
    station_id: 'earth',
  }).stdout.join('\n');
  expect(single).toContain('Weapon: Pulse Laser (weapon-1)');
  expect(single).toContain('Current ammo: 4');
  expect(single).not.toContain('total |');
  expect(single).not.toContain('=== Results ===');

  const copiesOnly = renderReloadDetails({
    fuel_now: 80,
    system_id: 'sol',
    station_name: 'Earth',
  }).stdout.join('\n');
  expect(copiesOnly).not.toContain('=== Reloaded ===');
  expect(copiesOnly).not.toContain('total |');

  const bulkWithCopies = renderReloadDetails({
    mode: 'bulk',
    fuel_now: 80,
    system_id: 'sol',
    summary: { total: 0, succeeded: 0, failed: 0 },
  }).stdout.join('\n');
  expect(bulkWithCopies).toContain('0 total | 0 succeeded | 0 failed');
  expect(bulkWithCopies).toContain('No results.');
  expect(bulkWithCopies).not.toContain('Weapon:');
});

test('non-array results on a bulk body still print the summary and No results', () => {
  const stdout = renderReloadDetails({
    mode: 'bulk',
    results: { index: 0 },
    summary: { total: 4, succeeded: 4, failed: 0 },
  }).stdout.join('\n');
  expect(stdout).toContain('4 total | 4 succeeded | 0 failed');
  expect(stdout).toContain('No results.');
  expect(stdout).not.toContain('=== Results ===');
});

test('all-failure rows with errors and no nested result omit ammo columns', () => {
  const stdout = renderReloadDetails({
    mode: 'bulk',
    summary: { total: 1, succeeded: 0, failed: 1 },
    results: [
      {
        index: 0,
        weapon_id: 'weapon-2',
        success: false,
        error_code: 'incompatible_ammo',
        error: 'Ammo does not match this weapon.',
      },
    ],
  }).stdout.join('\n');
  const { header, rows } = resultsTable(stdout);
  expect(header).toEqual(['Index', 'Weapon', 'OK', 'Detail']);
  expect(header).not.toContain('Ammo');
  expect(header).not.toContain('Magazine');
  expect(header).not.toContain('Discarded');
  expect(rows[0]).toEqual(['0', 'weapon-2', 'no', 'incompatible_ammo: Ammo does not match this weapon.']);
});

test('missing success leaves the OK cell blank', () => {
  const rendered = renderReloadDetails({
    mode: 'bulk',
    summary: { total: 1, succeeded: 0, failed: 0 },
    results: [{ index: 0, weapon_id: 'weapon-1' }],
  });
  const stdout = rendered.stdout.join('\n');
  const rowLine = stdout.split('\n').find((line) => line.includes('weapon-1') && line.includes('|'));
  expect(rowLine).toBeDefined();
  expect(rowLine ?? '').not.toContain('| no |');
  expect(rowLine ?? '').not.toContain('| yes |');
  const { header, rows } = resultsTable(stdout);
  expect(header).toContain('OK');
  expect(rows[0]?.[2]).toBe('');
});

test('success true with no result and no error says no reload detail', () => {
  const stdout = renderReloadDetails({
    mode: 'bulk',
    summary: { total: 1, succeeded: 1, failed: 0 },
    results: [{ index: 0, weapon_id: 'weapon-9', success: true }],
  }).stdout.join('\n');
  const { header, rows } = resultsTable(stdout);
  expect(header).toEqual(['Index', 'Weapon', 'OK', 'Detail']);
  expect(rows[0]).toEqual(['0', 'weapon-9', 'yes', 'no reload detail']);
});

test('success true with an error does not say no reload detail', () => {
  const absent = renderReloadDetails({
    action: 'reload',
    summary: { total: 1, succeeded: 1, failed: 0 },
    results: [{ index: 0, weapon_id: 'weapon-9', success: true, error: 'magazine jammed' }],
  }).stdout.join('\n');
  expect(absent).toContain('magazine jammed');
  expect(absent).not.toContain('no reload detail');
  expect(resultsTable(absent).rows[0]?.[1]).toBe('weapon-9');

  const arrayResult = renderReloadDetails({
    mode: 'bulk',
    summary: { total: 1, succeeded: 1, failed: 0 },
    results: [{ index: 0, weapon_id: 'weapon-9', success: true, result: [], error_code: 'partial' }],
  }).stdout.join('\n');
  expect(arrayResult).toContain('partial');
  expect(arrayResult).not.toContain('no reload detail');
  expect(resultsTable(arrayResult).header).not.toContain('Ammo');
});

test('a nested result still prints when an error is set', () => {
  const stdout = renderReloadDetails({
    mode: 'bulk',
    summary: { total: 2, succeeded: 1, failed: 1 },
    results: [
      {
        index: 0,
        weapon_id: 'weapon-entry',
        success: true,
        error: 'kept a warning',
        result: nestedReload({ rounds_discarded: 0 }),
      },
      {
        index: 1,
        weapon_id: 'weapon-2',
        success: false,
        error_code: 'warn_false',
        result: nestedReload({ weapon_name: 'Scrapgun', weapon_id: 'weapon-2', rounds_discarded: 1 }),
      },
    ],
  }).stdout.join('\n');
  const { rows } = resultsTable(stdout);
  expect(rows[0]?.[1]).toBe('Pulse Laser (weapon-1)');
  expect(rows[0]?.[3]).toBe('Laser Cell (ammo-cell)');
  expect(rows[0]?.[5]).toBe('0');
  expect(rows[0]?.[6]).toBe('kept a warning');
  expect(rows[0]?.join(' ')).not.toContain('weapon-entry');
  expect(rows[1]?.[2]).toBe('no');
  expect(rows[1]?.[3]).toBe('Laser Cell (ammo-cell)');
  expect(rows[1]?.[6]).toBe('warn_false');
});

test('success false without a result prints the error and no ammo', () => {
  const stdout = renderReloadDetails({
    mode: 'bulk',
    summary: { total: 1, succeeded: 0, failed: 1 },
    results: [
      {
        index: 1,
        weapon_id: 'weapon-2',
        success: false,
        error: 'magazine empty',
        ammo_name: 'Decoy Ammo',
        ammo_id: 'decoy',
        current_ammo: 8,
        magazine_size: 8,
        rounds_discarded: 5,
      },
    ],
  }).stdout.join('\n');
  const { header, rows } = resultsTable(stdout);
  expect(header).toEqual(['Index', 'Weapon', 'OK', 'Detail']);
  expect(rows[0]).toEqual(['1', 'weapon-2', 'no', 'magazine empty']);
  expect(stdout).not.toContain('Decoy Ammo');
  expect(stdout).not.toContain('decoy');
  expect(stdout).not.toContain('8/8');
  expect(stdout).not.toContain('no reload detail');
});

test('a string summary count prints ? and the same body without mode is not bulk', () => {
  const payload = {
    summary: { total: '2', succeeded: true, failed: 0 },
    results: [] as unknown[],
  };
  const bulk = renderReloadDetails({ mode: 'bulk', ...payload }).stdout.join('\n');
  expect(bulk).toContain('? total | ? succeeded | 0 failed');
  expect(bulk).not.toContain('2 total');
  expect(bulk).not.toContain('1 succeeded');

  const notBulk = renderReloadDetails(payload).stdout.join('\n');
  expect(notBulk).not.toContain('=== Reloaded ===');
  expect(notBulk).not.toContain('2 total');
  expect(notBulk).not.toContain('? total');
});

test('non-record summary and a missing summary field print ?', () => {
  const nonRecord = renderReloadDetails({
    mode: 'bulk',
    summary: ['2'],
    results: [],
  }).stdout.join('\n');
  expect(nonRecord).toContain('? total | ? succeeded | ? failed');

  const missingField = renderReloadDetails({
    action: 'reload',
    summary: { total: 2, failed: 0 },
    results: [],
  }).stdout.join('\n');
  expect(missingField).toContain('2 total | ? succeeded | 0 failed');
});

test('non-record results elements stay rows labeled invalid result', () => {
  const stdout = renderReloadDetails({
    mode: 'bulk',
    summary: { total: 4, succeeded: 0, failed: 0 },
    results: ['bad', null, 1, ['nested']],
  }).stdout.join('\n');
  const { header, rows } = resultsTable(stdout);
  expect(header).toEqual(['Index', 'Weapon', 'OK', 'Detail']);
  expect(rows).toEqual([
    ['', '', '', 'invalid result'],
    ['', '', '', 'invalid result'],
    ['', '', '', 'invalid result'],
    ['', '', '', 'invalid result'],
  ]);
});

test('detail text prefers one error string, both strings, or a blank failure', () => {
  const stdout = renderReloadDetails({
    mode: 'bulk',
    summary: { total: 5, succeeded: 1, failed: 4 },
    results: [
      { index: 0, weapon_id: 'w0', success: false, error_code: 'code_only' },
      { index: 1, weapon_id: 'w1', success: false, error: 'error only' },
      { index: 2, weapon_id: 'w2', success: false, error_code: 'both_code', error: 'both error' },
      { index: 3, weapon_id: 'w3', success: true },
      { index: 4, weapon_id: 'w4', success: false },
    ],
  }).stdout.join('\n');
  const { rows } = resultsTable(stdout);
  expect(rows.map((row) => row[3])).toEqual([
    'code_only',
    'error only',
    'both_code: both error',
    'no reload detail',
    '',
  ]);
  expect(rows.map((row) => row[2])).toEqual(['no', 'no', 'no', 'yes', 'no']);
});

test('bulk rows stay in server order and the summary is not recounted', () => {
  const stdout = renderReloadDetails({
    mode: 'bulk',
    summary: { total: 9, succeeded: 8, failed: 1 },
    results: [
      { index: 1, weapon_id: 'second', success: false, error: 'late' },
      { index: 0, weapon_id: 'first', success: true, result: nestedReload() },
    ],
  }).stdout.join('\n');
  expect(stdout).toContain('9 total | 8 succeeded | 1 failed');
  expect(stdout).not.toContain('2 total |');
  const { rows } = resultsTable(stdout);
  expect(rows[0]?.[1]).toBe('second');
  expect(rows[1]?.[1]).toBe('Pulse Laser (weapon-1)');
  expect(rows[0]?.[0]).toBe('1');
  expect(rows[1]?.[0]).toBe('0');
});

test('weapon and ammo cells follow the name and id pattern', () => {
  const differed = renderReloadDetails({
    mode: 'bulk',
    summary: { total: 1, succeeded: 1, failed: 0 },
    results: [
      {
        index: 0,
        weapon_id: 'weapon-entry',
        success: true,
        result: nestedReload({ weapon_id: 'weapon-nested' }),
      },
    ],
  }).stdout.join('\n');
  expect(resultsTable(differed).rows[0]?.[1]).toBe('Pulse Laser (weapon-nested)');
  expect(differed).not.toContain('weapon-entry');

  const nameOnly = renderReloadDetails({
    mode: 'bulk',
    summary: { total: 1, succeeded: 1, failed: 0 },
    results: [{ index: 0, success: true, result: nestedReload({ weapon_id: undefined, ammo_id: undefined }) }],
  }).stdout.join('\n');
  const nameRow = resultsTable(nameOnly).rows[0] ?? [];
  expect(nameRow[1]).toBe('Pulse Laser');
  expect(nameRow[3]).toBe('Laser Cell');

  const idOnly = renderReloadDetails({
    mode: 'bulk',
    summary: { total: 1, succeeded: 1, failed: 0 },
    results: [
      {
        index: 0,
        weapon_id: 'weapon-entry',
        success: true,
        result: nestedReload({ weapon_name: undefined, ammo_name: undefined }),
      },
    ],
  }).stdout.join('\n');
  const idRow = resultsTable(idOnly).rows[0] ?? [];
  expect(idRow[1]).toBe('weapon-1');
  expect(idRow[3]).toBe('ammo-cell');
  expect(idOnly).not.toContain('weapon-entry');

  const fallbackId = renderReloadDetails({
    mode: 'bulk',
    summary: { total: 1, succeeded: 1, failed: 0 },
    results: [
      {
        index: 0,
        weapon_id: 'weapon-entry',
        success: true,
        result: nestedReload({ weapon_name: undefined, weapon_id: undefined }),
      },
    ],
  }).stdout.join('\n');
  expect(resultsTable(fallbackId).rows[0]?.[1]).toBe('weapon-entry');
});

test('magazine and discarded cells accept only strict finite numbers', () => {
  const oneSided = renderReloadDetails({
    mode: 'bulk',
    summary: { total: 1, succeeded: 1, failed: 0 },
    results: [
      {
        index: true,
        weapon_id: 'weapon-1',
        success: true,
        result: nestedReload({ current_ammo: '8', magazine_size: 9, rounds_discarded: '2' }),
      },
    ],
  }).stdout.join('\n');
  const skewed = resultsTable(oneSided);
  expect(skewed.header).not.toContain('Discarded');
  expect(skewed.rows[0]?.[0]).toBe('');
  expect(skewed.rows[0]?.[4]).toBe('9');
  expect(oneSided).not.toContain('8/9');
  expect(oneSided).not.toContain('?/9');

  const currentOnly = renderReloadDetails({
    mode: 'bulk',
    summary: { total: 1, succeeded: 1, failed: 0 },
    results: [
      {
        index: 0,
        weapon_id: 'weapon-1',
        success: true,
        result: nestedReload({ magazine_size: undefined, rounds_discarded: 0 }),
      },
    ],
  }).stdout.join('\n');
  const currentRow = resultsTable(currentOnly);
  expect(currentRow.header).toEqual(['Index', 'Weapon', 'OK', 'Ammo', 'Magazine', 'Discarded']);
  expect(currentRow.rows[0]?.[4]).toBe('8');
  expect(currentRow.rows[0]?.[5]).toBe('0');

  const sizeOnly = renderReloadDetails({
    mode: 'bulk',
    summary: { total: 1, succeeded: 1, failed: 0 },
    results: [
      {
        index: '0',
        weapon_id: 'weapon-1',
        success: true,
        result: nestedReload({ current_ammo: undefined, magazine_size: 4, rounds_discarded: false }),
      },
    ],
  }).stdout.join('\n');
  const sizeRow = resultsTable(sizeOnly);
  expect(sizeRow.header).not.toContain('Discarded');
  expect(sizeRow.rows[0]?.[0]).toBe('');
  expect(sizeRow.rows[0]?.[4]).toBe('4');
  expect(sizeOnly).not.toContain('?/4');
});

test('a message that restates the summary is still printed', () => {
  const summaryLine = '1 total | 1 succeeded | 0 failed';
  const stdout = renderReloadDetails({
    mode: 'bulk',
    summary: { total: 1, succeeded: 1, failed: 0 },
    message: summaryLine,
    results: [{ index: 0, weapon_id: 'weapon-1', success: true, result: nestedReload() }],
  }).stdout.join('\n');
  expect(stdout.split(summaryLine).length - 1).toBe(2);
});

test('quiet does not hide the bulk reload summary or results', () => {
  const rendered = renderReload(reloadBulkFixture, { quiet: true });
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('2 total | 2 succeeded | 0 failed');
  expect(stdout).toContain('=== Results ===');
  expect(rendered.stderr.join('')).toBe('');
});

test('repair does not render a bulk reload results table', () => {
  const stdout = renderStructuredResult('repair', structuredClone(reloadBulkFixture), options, context).stdout.join(
    '\n',
  );
  expect(stdout).not.toContain('=== Results ===');
  expect(stdout).not.toContain('=== Reloaded ===');
});

function renderCargoHold(result: Record<string, unknown>): { printed: boolean; stdout: string } {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  const printed = withDisplayRenderBuffer(buffer, () => emitCargoHold(result), { plain: true });
  return { printed, stdout: buffer.stdout.join('\n') };
}

describe('emitCargoHold', () => {
  test('item array without hold stats prints the table and omits Used/Credits/bay', () => {
    const { printed, stdout } = renderCargoHold({
      cargo: [{ item_id: 'ore_iron', item_name: 'Iron Ore', quantity: 50, size: 1 }],
    });
    expect(printed).toBe(true);
    expect(stdout).toContain('=== Cargo ===');
    expect(stdout).toContain('Cargo (1):');
    expect(stdout).toContain('Iron Ore');
    expect(stdout).not.toContain('Credits:');
    expect(stdout).not.toContain('Used:');
    expect(stdout).not.toContain('?/');
    expect(stdout).not.toContain('Carrier bay:');
    expect(stdout).not.toContain('Carried Ships');
  });

  test('empty cargo array prints Empty and still omits hold stats', () => {
    const { printed, stdout } = renderCargoHold({ cargo: [] });
    expect(printed).toBe(true);
    expect(stdout).toContain('=== Cargo ===');
    expect(stdout).toContain('Cargo (0):');
    expect(stdout).toContain('(Empty)');
    expect(stdout).not.toContain('Credits:');
    expect(stdout).not.toContain('Used:');
    expect(stdout).not.toContain('?/');
  });

  test('present sibling stats still print Credits, Used, and bay', () => {
    const { printed, stdout } = renderCargoHold(structuredClone(cargoFixture) as Record<string, unknown>);
    expect(printed).toBe(true);
    expect(stdout).toContain('Credits:');
    expect(stdout).toContain('Used: 50/100');
    expect(stdout).toContain('Carrier bay: 1/2');
    expect(stdout).toContain('=== Carried Ships ===');
    expect(stdout).toContain('Rock Skipper');
    expect(stdout).not.toContain('?/');
  });
});
