import { describe, expect, test } from 'bun:test';
import type { CliRuntimeContext } from './cli-context';
import { displayStructuredResult } from './client';
import { renderResult, renderStructuredResult } from './display';
import {
  activeMissionsFixture,
  browseShipsFixture,
  catalogItemsFixture,
  formatterFixtureCases,
  getLocationFixture,
  getStatusFixture,
  highValueCommandFixtures,
  missionsFixture,
  poiInfoFixture,
  storageFixture,
  viewMarketFixture,
} from './display/formatter-fixtures';
import { resultFormatters } from './display/formatters';
import { renderResponse } from './main';
import type { GlobalOptions } from './types';

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

function captureStructuredOutput(
  command: string,
  fixture: Record<string, unknown>,
  options?: Partial<GlobalOptions>,
): { stdout: string; stderr: string } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const context = captureContext(stdout, stderr, options ? globalOptions(options) : undefined);

  displayStructuredResult(command, structuredClone(fixture), options ? globalOptions(options) : undefined, context);

  return {
    stdout: stdout.join('\n').replace(ANSI_PATTERN, ''),
    stderr: stderr.join('\n').replace(ANSI_PATTERN, ''),
  };
}

function globalOptions(overrides: Partial<GlobalOptions> = {}): GlobalOptions {
  return {
    json: false,
    quiet: false,
    plain: false,
    allowUnknown: false,
    dryRun: false,
    noTimestamp: false,
    compact: false,
    args: [],
    ...overrides,
  };
}

const outputModeFixture = {
  player: { name: 'Marlowe' },
  ship: { fuel: 42 },
  items: [{ id: 'ore_iron', quantity: 5 }],
};

async function captureRenderedOutput(
  response: Parameters<typeof renderResponse>[0]['response'],
  options: Partial<GlobalOptions>,
  commandRunOverrides: Partial<Parameters<typeof renderResponse>[0]> = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const context = captureContext(stdout, stderr, globalOptions({ dryRun: true, ...options }));

  const exitCode = await renderResponse(
    {
      command: 'get_status',
      displayCommand: 'get_status',
      response,
      ...commandRunOverrides,
    },
    globalOptions({ dryRun: true, ...options }),
    undefined,
    context,
  );

  return {
    stdout: stdout.join('\n').replace(ANSI_PATTERN, ''),
    stderr: stderr.join('\n').replace(ANSI_PATTERN, ''),
    exitCode,
  };
}

function captureContext(
  stdout: string[],
  stderr: string[],
  output: GlobalOptions = globalOptions(),
): CliRuntimeContext {
  return {
    env: {},
    writer: {
      out(message = '') {
        stdout.push(message);
      },
      err(message = '') {
        stderr.push(message);
      },
      writeOut(chunk) {
        stdout.push(chunk);
      },
    },
    clock: {
      now() {
        return new Date('2026-05-19T12:34:56.000Z');
      },
    },
    sleep() {
      return Promise.resolve();
    },
    output,
  };
}

describe('structuredContent output mode precedence', () => {
  test('--jq wins over --fields', () => {
    const { stdout, stderr } = captureStructuredOutput('get_status', outputModeFixture, {
      jq: '.ship.fuel',
      fields: ['player.name'],
    });

    expect(stderr).toBe('');
    expect(stdout).toBe('42');
  });

  test('--field extracts one scalar without a JSON object wrapper', () => {
    const { stdout, stderr } = captureStructuredOutput('get_status', outputModeFixture, {
      field: 'ship.fuel',
    });

    expect(stderr).toBe('');
    expect(stdout).toBe('42');
  });

  test('--field supports --format=json for scalar extraction', () => {
    const { stdout, stderr } = captureStructuredOutput('get_status', outputModeFixture, {
      field: 'ship.fuel',
      format: 'json',
    });

    expect(stderr).toBe('');
    expect(stdout).toBe('42');
  });

  test('--fields overrides --json for successful structured output', () => {
    const { stdout, stderr } = captureStructuredOutput('get_status', outputModeFixture, {
      json: true,
      fields: ['player.name'],
    });

    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toEqual({ 'player.name': 'Marlowe' });
  });

  test('--fields overrides --format=json for successful structured output', () => {
    const { stdout, stderr } = captureStructuredOutput('get_status', outputModeFixture, {
      format: 'json',
      fields: ['ship.fuel'],
    });

    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toEqual({ 'ship.fuel': 42 });
  });

  test('--jq overrides --json for successful structured output', () => {
    const { stdout, stderr } = captureStructuredOutput('get_status', outputModeFixture, {
      json: true,
      jq: '.ship',
    });

    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toEqual({ fuel: 42 });
  });

  test('--compact compacts projected JSON', () => {
    const { stdout, stderr } = captureStructuredOutput('get_status', outputModeFixture, {
      json: true,
      compact: true,
      fields: ['player.name', 'ship.fuel'],
    });

    expect(stderr).toBe('');
    expect(stdout).toBe('{"player.name":"Marlowe","ship.fuel":42}');
  });

  test('--plain does not change --fields structure', () => {
    const { stdout, stderr } = captureStructuredOutput('get_status', outputModeFixture, {
      plain: true,
      fields: ['player.name'],
    });

    expect(stderr).toBe('');
    expect(stdout).toBe('{"player.name":"Marlowe"}');
    expect(stdout).not.toContain('player.name=');
  });

  test('context output options apply when explicit options are omitted', () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const context = captureContext(stdout, stderr, globalOptions({ format: 'json', compact: true }));

    displayStructuredResult('get_status', structuredClone(outputModeFixture), undefined, context);

    expect(stderr.join('\n')).toBe('');
    expect(stdout.join('\n')).toBe(
      '{"player":{"name":"Marlowe"},"ship":{"fuel":42},"items":[{"id":"ore_iron","quantity":5}]}',
    );
  });

  test('--compact compacts successful full-response JSON', async () => {
    const { stdout, stderr, exitCode } = await captureRenderedOutput(
      { structuredContent: outputModeFixture },
      { json: true, compact: true },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toBe(
      '{"structuredContent":{"player":{"name":"Marlowe"},"ship":{"fuel":42},"items":[{"id":"ore_iron","quantity":5}]}}',
    );
  });

  test('--json errors remain full response envelopes', async () => {
    const { stdout, stderr, exitCode } = await captureRenderedOutput(
      { error: { code: 'validation_error', message: 'Bad field' } },
      { json: true, fields: ['player.name'] },
    );

    expect(exitCode).toBe(1);
    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toEqual({ error: { code: 'validation_error', message: 'Bad field' } });
  });

  test('view_storage item filter narrows displayed rows without wrapping output', async () => {
    const { stdout, stderr, exitCode } = await captureRenderedOutput(
      {
        structuredContent: {
          ...storageFixture,
          items: [
            { item_id: 'iron_ore', item_name: 'Iron Ore', quantity: 718, size: 1 },
            { item_id: 'fuel_cell', item_name: 'Fuel Cell', quantity: 12, size: 1 },
          ],
        },
      },
      {},
      { command: 'view_storage', displayCommand: 'view_storage', payload: { item_id: 'iron_ore' } },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain('Iron Ore');
    expect(stdout).toContain('iron_ore');
    expect(stdout).toContain('718');
    expect(stdout).not.toContain('Fuel Cell');
  });

  test('view_faction_storage search filter narrows displayed rows', async () => {
    const { stdout, stderr, exitCode } = await captureRenderedOutput(
      {
        structuredContent: {
          base_id: 'earth_station',
          items: [
            { item_id: 'iron_ore', item_name: 'Iron Ore', quantity: 718, size: 1 },
            { item_id: 'copper_ore', item_name: 'Copper Ore', quantity: 12, size: 1 },
          ],
        },
      },
      {},
      { command: 'view_faction_storage', displayCommand: 'view_faction_storage', payload: { search: 'iron' } },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain('Iron Ore');
    expect(stdout).not.toContain('Copper Ore');
  });

  test('view_faction_storage prints bunker fuel and storage hint', async () => {
    const { stdout, stderr, exitCode } = await captureRenderedOutput(
      {
        structuredContent: {
          base_id: 'earth_station',
          hint: 'Faction storage at Earth Station',
          faction_fuel_reserve: 320,
          faction_fuel_capacity: 500,
          items: [{ item_id: 'fuel_cell', item_name: 'Fuel Cell', quantity: 12, size: 1 }],
          ships: [],
        },
      },
      {},
      { command: 'view_faction_storage', displayCommand: 'view_faction_storage' },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain('=== Faction Storage at earth_station ===');
    expect(stdout).toContain('Fuel bunker: 320 / 500 units');
    expect(stdout).toContain('Faction storage at Earth Station');
  });

  test('rendered text output uses context clock for timestamps', async () => {
    const { stdout, stderr, exitCode } = await captureRenderedOutput({ result: 'OK' }, {});

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toBe('[2026-05-19T12:34:56.000Z]\nOK');
  });

  test('--jq evaluation errors exit with non-zero code', async () => {
    const { stdout, stderr, exitCode } = await captureRenderedOutput(
      { structuredContent: outputModeFixture },
      { jq: '.non_existent_key[]' },
    );

    expect(exitCode).toBe(1);
    expect(stderr).toContain('Error: Expected array at "non_existent_key"');
    expect(stdout).toBe('');
  });

  test('pure structured renderer formats yaml without writing', () => {
    const rendered = renderStructuredResult('get_status', outputModeFixture, globalOptions({ format: 'yaml' }), {
      clock: captureContext([], []).clock,
    });

    expect(rendered.success).toBe(true);
    expect(rendered.stderr).toEqual([]);
    expect(rendered.stdout.join('\n')).toBe(
      '\nplayer:\n  name: Marlowe\nship:\n  fuel: 42\nitems:\n  - id: ore_iron\n    quantity: 5',
    );
  });

  test('pure structured renderer formats text and compact output', () => {
    const text = renderStructuredResult('get_status', outputModeFixture, globalOptions({ format: 'text' }));
    const compact = renderStructuredResult('get_status', outputModeFixture, globalOptions({ compact: true }));

    expect(text.stdout.join('\n')).toBe(JSON.stringify(outputModeFixture, null, 2));
    expect(compact.stdout.join('\n')).toBe(
      '{"player":{"name":"Marlowe"},"ship":{"fuel":42},"items":[{"id":"ore_iron","quantity":5}]}',
    );
  });

  test('pure renderer respects projection, quiet, timestamp, and drift warning paths', () => {
    const projected = renderStructuredResult('get_status', outputModeFixture, globalOptions({ fields: ['ship.fuel'] }));
    const quiet = renderResult(
      'get_status',
      { structuredContent: { ...outputModeFixture, auto_docked: true } },
      globalOptions({ quiet: true }),
      { clock: captureContext([], []).clock },
    );
    const timed = renderResult('get_status', { result: 'OK' }, globalOptions({ plain: true }), {
      clock: captureContext([], []).clock,
    });
    const drift = renderStructuredResult('unmatched_command', { items: 'not-an-array' }, globalOptions());

    expect(projected.stdout).toEqual(['{"ship.fuel":42}']);
    expect(quiet.stdout.join('\n')).not.toContain('[AUTO-DOCKED]');
    expect(timed.stdout).toEqual(['[2026-05-19T12:34:56.000Z]', 'OK']);
    expect(drift.stderr.join('\n')).not.toContain('[DRIFT WARNING]');
  });

  test('pure structured renderer emits drift warnings when debug is enabled', () => {
    const drift = renderStructuredResult('unmatched_command', { items: 'not-an-array' }, globalOptions(), {
      clock: captureContext([], []).clock,
      config: {
        apiBase: 'https://example.test/api/v2',
        jsonOutput: false,
        debug: true,
        plain: false,
        quiet: false,
        format: 'table',
        compact: false,
      },
    });

    expect(drift.stderr.join('\n')).toContain('[DRIFT WARNING]');
  });
});

describe('structuredContent formatters', () => {
  test('formats get_location before the simple message formatter', () => {
    const { stdout, stderr } = captureStructuredOutput('get_location', getLocationFixture);

    expect(stderr).toBe('');
    expect(stdout).toMatchInlineSnapshot(`
      "
      === Location ===
      System: Sol (sol)
      Empire: Terran
      Security: high security
      Connections: alpha_centauri
      POI: Earth (planet)
      Docked at: earth_station

      Nearby Players (1):
        Marlowe [SMC] (prospector)

      Nearby Pirates: 2

      Nearby NPCs: 1"
    `);
  });

  test('formats ship listings before generic market listings', () => {
    const { stdout, stderr } = captureStructuredOutput('browse_ships', browseShipsFixture);

    expect(stderr).toBe('');
    expect(stdout).toMatchInlineSnapshot(`
      "
      === Ships for Sale @ Earth Station ===

      Lucky Strike (prospector) (Scale 1)
        Mining - T2
        Price: 125,000 credits
        Hull: 80/100, Shield: 20
        Seller: Marlowe
        Listing ID: listing-1"
    `);
  });

  test('formats market order books before generic item table formatters', () => {
    const { stdout, stderr } = captureStructuredOutput('view_market', viewMarketFixture);

    expect(stderr).toBe('');
    expect(stdout).toMatchInlineSnapshot(`
      "
      === Market at earth_station ===

      Iron Ore
        Buy orders (1):
          15 cr x 500
        Sell orders (1):
          18 cr x 125

      Fuel Cell
        (no orders)
      "
    `);
  });

  test('prefers command-scoped formatters before shape fallbacks', () => {
    const { stdout, stderr } = captureStructuredOutput('get_trades', {
      listings: [
        {
          listing_id: 'listing-1',
          ship_id: 'incidental-ship-field',
          item_id: 'ore_iron',
          quantity: 100,
          price_each: 15,
          seller_name: 'Marlowe',
        },
      ],
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Market Listings ===');
    expect(stdout).not.toContain('=== Ships for Sale');
  });

  test('generic list fallback formats list-shaped responses', () => {
    const { stdout, stderr } = captureStructuredOutput('get_missions', missionsFixture);

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Missions ===');
    expect(stdout).toContain('Pirate Sweep');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('get_active_missions formats nested active mission state instead of generic OK', () => {
    const { stdout, stderr } = captureStructuredOutput('get_active_missions', activeMissionsFixture);

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Active Missions ===');
    expect(stdout).toContain('Distress Call: CombatDummy6');
    expect(stdout).toContain('mission-distress-wealthyminer2023');
    expect(stdout).toContain('Rescue WealthyMiner2023 WealthyMiner2023 0/1');
    expect(stdout).toContain('piloting XP +50');
    expect(stdout).toContain('missions 2/5');
    expect(stdout).not.toContain('OK: Active missions');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('simple message formatter does not hide a rich two-key payload', () => {
    const { stdout, stderr } = captureStructuredOutput('claim_insurance', {
      message: 'Active policies',
      policies: [{ policy_id: 'policy-1', coverage: 50000 }],
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Response ===');
    expect(stdout).toContain('policy-1');
    expect(stdout).not.toContain('OK: Active policies');
  });

  test('catalog list responses do not drift against market formatter', () => {
    const { stdout, stderr } = captureStructuredOutput('catalog', catalogItemsFixture);

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Items ===');
    expect(stdout).toContain('Antimatter Torpedoes');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('catalog ship responses include passive recipe ids', () => {
    const { stdout, stderr } = captureStructuredOutput('catalog', {
      items: [
        {
          id: 't4_ore_refinery',
          name: 'T4 Ore Refinery',
          class: 'Industrial',
          tier: 4,
          empire: 'solarian',
          shipyard_tier: 4,
          passive_recipes: ['passive_refine_iron_ore', 'passive_refine_solar_crystal'],
        },
      ],
      message: 'Ships: showing 1 of 1',
      page: 1,
      page_size: 20,
      total: 1,
      total_pages: 1,
      type: 'ships',
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Ships ===');
    expect(stdout).toContain('T4 Ore Refinery');
    expect(stdout).toContain('passive_refine_iron_ore, passive_refine_solar_crystal');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('catalog recipe responses show inputs outputs and craftability markers', () => {
    const { stdout, stderr } = captureStructuredOutput('catalog', {
      recipes: [
        {
          id: 'passive_refine_iron_ore',
          name: 'Passive Iron Refining',
          category: 'refining',
          inputs: [{ item_id: 'iron_ore', quantity: 10 }],
          outputs: [{ item_id: 'iron_ingot', quantity: 2 }],
          crafting_time: 0,
          facility_only: true,
        },
      ],
      message: 'Recipes: showing 1 of 1',
      page: 1,
      page_size: 20,
      total: 1,
      total_pages: 1,
      type: 'recipes',
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Recipes ===');
    expect(stdout).toContain('10x iron_ore');
    expect(stdout).toContain('2x iron_ingot');
    expect(stdout).toContain('facility only');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('catalog ship lookups show passive recipe details', () => {
    const { stdout, stderr } = captureStructuredOutput('catalog', {
      type: 'ships',
      items: [
        {
          id: 't4_ore_refinery',
          name: 'T4 Ore Refinery',
          passive_recipes: ['passive_refine_iron_ore'],
        },
      ],
      passive_recipe_details: [
        {
          id: 'passive_refine_iron_ore',
          name: 'Passive Iron Refining',
          category: 'refining',
          inputs: [{ item_id: 'iron_ore', quantity: 10 }],
          outputs: [{ item_id: 'iron_ingot', quantity: 2 }],
          crafting_time: 0,
        },
      ],
      message: 'Ship details',
      page: 1,
      page_size: 20,
      total: 1,
      total_pages: 1,
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Ships ===');
    expect(stdout).toContain('=== Passive Recipes ===');
    expect(stdout).toContain('Passive Iron Refining');
    expect(stdout).toContain('ship passive');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('facility_list formats grouped facility responses', () => {
    const { stdout, stderr } = captureStructuredOutput('facility_list', {
      base_id: 'earth_station',
      station_facilities: [
        {
          facility_id: 'station-fuel',
          type: 'fuel_bunker',
          name: 'Fuel Bunker',
          category: 'service',
          active: true,
          maintenance_satisfied: true,
        },
      ],
      player_facilities: [
        {
          facility_id: 'player-refinery',
          type: 'ore_refinery',
          name: 'Ore Refinery',
          category: 'production',
          active: false,
          maintenance_satisfied: true,
        },
      ],
      faction_facilities: [],
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Station Facilities ===');
    expect(stdout).toContain('Fuel Bunker');
    expect(stdout).toContain('=== Player Facilities ===');
    expect(stdout).toContain('Ore Refinery');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('get_poi includes faction fuel reserve when present', () => {
    const { stdout, stderr } = captureStructuredOutput('get_poi', {
      ...poiInfoFixture,
      poi: {
        ...poiInfoFixture.poi,
        faction_fuel_reserve: 320,
        faction_fuel_capacity: 500,
      },
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('Faction Fuel: 320/500');
  });

  test('faction_info lists faction facilities', () => {
    const { stdout, stderr } = captureStructuredOutput('faction_info', {
      id: 'faction-1',
      name: 'Drift Matrix',
      tag: 'DMX7',
      leader_username: 'DriftMiner-7',
      member_count: 20,
      owned_bases: 2,
      treasury: 12345,
      is_member: true,
      facilities: [
        {
          facility_id: 'facility-1',
          base_id: 'earth_station',
          name: 'Faction Fuel Bunker',
          type: 'fuel_bunker',
          active: true,
          faction_service: 'fuel',
        },
      ],
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Faction: Drift Matrix [DMX7] ===');
    expect(stdout).toContain('Leader: DriftMiner-7');
    expect(stdout).toContain('=== Faction Facilities ===');
    expect(stdout).toContain('Faction Fuel Bunker');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('get_ship shows passive processing details', () => {
    const { stdout, stderr } = captureStructuredOutput('get_ship', {
      ship: {
        id: 'ship-1',
        name: 'T4 Ore Refinery',
        class_id: 't4_ore_refinery',
        hull: 420,
        max_hull: 420,
        shield: 300,
        max_shield: 300,
        fuel: 240,
        max_fuel: 240,
        cargo_used: 30,
        cargo_capacity: 1250,
        cpu_used: 16,
        cpu_capacity: 34,
        power_used: 23,
        power_capacity: 75,
        last_process_tick: 15234,
      },
      modules: [],
      passive_recipe_details: [
        {
          id: 'passive_refine_iron_ore',
          name: 'Passive Iron Refining',
          inputs: [{ item_id: 'iron_ore', quantity: 10 }],
          outputs: [{ item_id: 'iron_ingot', quantity: 2 }],
        },
      ],
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('Passive Processing: last tick 15234');
    expect(stdout).toContain('=== Passive Recipes ===');
    expect(stdout).toContain('Passive Iron Refining');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('normalizes get_status location data before player status formatting', () => {
    const { stdout, stderr } = captureStructuredOutput('get_status', getStatusFixture);

    expect(stderr).toBe('');
    expect(stdout).toMatchInlineSnapshot(`
      "
      === Player Status ===
      Username: Marlowe
      Empire: Terran
      Credits: 4242
      Faction: smc (captain)

      Location:
        System: Sol
        POI: Earth
        Docked: Yes (earth_station)

      Ship: Surveyor (prospector)
        Hull: 90/100
        Shield: 35/50 (+5/tick)
        Armor: 10
        Fuel: 80/100
        Cargo: 12/60
        CPU: 8/20
        Power: 10/25

      Nearby Players: 1
        - Ibis (hauler)"
    `);
  });

  test('all named formatters have snapshot fixtures', () => {
    const namedFormatters = resultFormatters
      .map((formatter) => formatter.formatterName)
      .filter((name): name is string => Boolean(name))
      .sort();

    expect(Object.keys(formatterFixtureCases).sort()).toEqual(namedFormatters);
  });

  test('named formatter fixtures select custom formatters', () => {
    const outputs: Record<string, string> = {};

    for (const [formatterName, { command, fixture }] of Object.entries(formatterFixtureCases).sort()) {
      const { stdout, stderr } = captureStructuredOutput(command, fixture);
      expect(stderr, `${formatterName} should not emit drift warnings`).toBe('');
      expect(stdout, `${formatterName} should not fall back to JSON`).not.toContain('=== Response ===');
      outputs[formatterName] = stdout;
    }

    expect(outputs).toMatchInlineSnapshot(`
      {
        "arrival": 
      "
      Arrived at Earth

      Players here (1):
        Ibis (hauler)"
      ,
        "base": 
      "
      === Base: Nova Terra Central ===
      ID: nova_terra_central
      POI: nova_terra_central
      Empire: solarian
      Defense: 55
      Fuel: 290750/0
      Fuel Price: 6 credits
      Condition: Critical infrastructure failure. (16% satisfaction)
      Services: crafting, market, missions, refuel
      Facilities: 3
        fuel_grid, trade_nexus, fleet_yards

      A busy trade station."
      ,
        "battle_status": 
      "
      === Battle ===
      ID: battle-1
      Status: active
      Range: medium

      === Participants ===

        Name    | ID       | Side | Stance | Target  
        --------+----------+------+--------+---------
        Marlowe | player-1 | 1    | fire   | pirate-1"
      ,
        "cargo": 
      "
      === Cargo ===
      Used: 50/100 (50 available)

      Items (1):

        Name     | ID       | Qty | Unit Size
        ---------+----------+-----+----------
        Iron Ore | ore_iron |  50 |          "
      ,
        "chat_sent": "[local] Clear skies.",
        "drone": 
      "
      === Drone ===

        Name         | ID      | Status | Location     
        -------------+---------+--------+--------------
        Survey Drone | drone-1 | loaded | earth_station

      Script:
      scan()"
      ,
        "drones": 
      "
      === Drones ===

        Name         | ID      | Status   | Location          | Cargo
        -------------+---------+----------+-------------------+------
        Survey Drone | drone-1 | deployed | Sol Asteroid Belt | 4    "
      ,
        "facilities": 
      "
      === Facilities ===

        Name        | ID         | Level | Status | Owner  
        ------------+------------+-------+--------+--------
        Fuel Bunker | facility-1 | 2     | online | Marlowe"
      ,
        "facility": 
      "
      === Facility ===

        Name        | ID         | Level | Status | Owner  
        ------------+------------+-------+--------+--------
        Fuel Bunker | facility-1 | 2     | true   | Marlowe"
      ,
        "facility_list": 
      "
      === Facilities at earth_station ===

      === Station Facilities ===

        Name        | ID           | Category | Active | Maint | Owner
        ------------+--------------+----------+--------+-------+------
        Fuel Bunker | station-fuel | service  | true   | true  |      

      === Player Facilities ===

        Name         | ID              | Category   | Active | Maint | Owner
        -------------+-----------------+------------+--------+-------+------
        Ore Refinery | player-refinery | production | false  | true  |      

      === Faction Facilities ===
      (None)"
      ,
        "facility_types": 
      "
      === Facility Type Categories ===

        Category       | Count | Buildable | Description                   
        ---------------+-------+-----------+-------------------------------
        infrastructure | 55    |           | Power and life support systems
        personal       | 13    | 4         | Personal facilities           
        production     | 1589  | 427       | Manufacturing facilities      

      Total facility types: 1753

      Use filters to browse."
      ,
        "fleet": 
      "
      === Fleet ===
      ID: fleet-1
      Leader: Marlowe

      === Fleet Members ===

        Name    | ID       | Ship       | Location | Status
        --------+----------+------------+----------+-------
        Marlowe | player-1 | prospector | Sol      | ready "
      ,
        "intel": 
      "
      === Intel ===

        System | POI/Base | Type      | Value | Updated             
        -------+----------+-----------+-------+---------------------
        Sol    | Earth    | fuel_cell | 25    | 2026-05-17T00:00:00Z"
      ,
        "market_orders": 
      "
      === Market Orders ===

        Item     | ID      | Side | Qty | Price
        ---------+---------+------+-----+------
        ore_iron | order-1 | buy  | 100 | 12   "
      ,
        "nearby": 
      "
      === Nearby ===

      Players (1):
        Marlowe [SMC] (prospector)

      Pirates (1):
        Raider (skiff) - hostile

      Empire NPCs (1):
        Patrol (interceptor)"
      ,
        "poi_info": 
      "
      === POI: Sol Asteroid Belt ===
      ID: sol_asteroid_belt
      Type: asteroid_belt
      System: sol
      Description: Dense mining field
      Class: common

      Resources:
        - Iron Ore: richness 3, 750/1000 (75.00% remaining)"
      ,
        "ship": 
      "
      === Ship: Deep Survey ===
      ID: ship-1
      Class: Deep Survey
      Custom Name: Asteroid Accessory
      Hull: 420/420
      Shield: 300/300 (+4/tick)
      Armor: 18
      Fuel: 240/240
      Cargo: 0/1250
      CPU: 16/34
      Power: 23/75
      Slots: 1 weapon, 1 defense, 5 utility

      === Modules ===

        Slot    | Name               | Type    | Wear     | CPU | Power | Size | ID      
        --------+--------------------+---------+----------+-----+-------+------+---------
        utility | Cargo Expander III | utility | Pristine | 2   | 2     | 10   | module-1
        weapon  | Pulse Laser III    | weapon  | Scuffed  | 3   | 8     | 10   | module-2"
      ,
        "storage": 
      "
      === Storage at earth_station ===

      Items (1):

        Name      | ID        | Qty | Unit Size
        ----------+-----------+-----+----------
        Fuel Cell | fuel_cell |  12 |          

      Ships (1):

        Ship Name  | Class      | Mods | Cargo | ID    
        -----------+------------+------+-------+-------
        Prospector | prospector |    3 |    10 | ship-1"
      ,
        "system_info": 
      "
      === System: Sol ===
      ID: sol
      Empire: Terran
      Police Level: 5 (high security)
      Description: Birthplace system

      Points of Interest:
        - Earth (planet) [base] (2 online)  sol_earth

      Connected Systems:
        - Alpha Centauri (4.3 ly)  alpha_centauri

      Current POI: Earth (planet)  sol_earth"
      ,
        "view_market": 
      "
      === Market at earth_station ===

      Iron Ore
        Buy orders (1):
          15 cr x 500
        Sell orders (1):
          18 cr x 125

      Fuel Cell
        (no orders)
      "
      ,
      }
    `);
  });

  test('high-value commands have formatter coverage', () => {
    const failures: string[] = [];

    for (const [label, { command, fixture }] of Object.entries(highValueCommandFixtures)) {
      const { stdout, stderr } = captureStructuredOutput(command, fixture);
      const usedFallback = stdout.includes('=== Response ===');
      const hadDrift = stderr.length > 0;

      if (usedFallback) {
        failures.push(`${label}: fell through to JSON fallback`);
      }
      if (hadDrift) {
        failures.push(`${label}: emitted drift warning: ${stderr}`);
      }
    }

    expect(failures).toEqual([]);
  });
});
