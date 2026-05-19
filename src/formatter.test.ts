import { afterEach, describe, expect, test } from 'bun:test';
import { displayStructuredResult } from './client';
import {
  browseShipsFixture,
  catalogItemsFixture,
  formatterFixtureCases,
  getLocationFixture,
  getStatusFixture,
  highValueCommandFixtures,
  missionsFixture,
  viewMarketFixture,
} from './display/formatter-fixtures';
import { resultFormatters } from './display/formatters';
import { renderResponse } from './main';
import type { GlobalOptions } from './types';

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

const originalLog = console.log;
const originalError = console.error;

afterEach(() => {
  console.log = originalLog;
  console.error = originalError;
});

function captureStructuredOutput(
  command: string,
  fixture: Record<string, unknown>,
  options?: Partial<GlobalOptions>,
): { stdout: string; stderr: string } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  console.log = (...args: unknown[]) => stdout.push(args.map(String).join(' '));
  console.error = (...args: unknown[]) => stderr.push(args.map(String).join(' '));

  displayStructuredResult(command, structuredClone(fixture), options ? globalOptions(options) : undefined);

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
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  console.log = (...args: unknown[]) => stdout.push(args.map(String).join(' '));
  console.error = (...args: unknown[]) => stderr.push(args.map(String).join(' '));

  const exitCode = await renderResponse(
    {
      command: 'get_status',
      displayCommand: 'get_status',
      response,
    },
    globalOptions({ dryRun: true, ...options }),
  );

  return {
    stdout: stdout.join('\n').replace(ANSI_PATTERN, ''),
    stderr: stderr.join('\n').replace(ANSI_PATTERN, ''),
    exitCode,
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

  test('catalog list responses do not drift against market formatter', () => {
    const { stdout, stderr } = captureStructuredOutput('catalog', catalogItemsFixture);

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Items ===');
    expect(stdout).toContain('Antimatter Torpedoes');
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
        ore_iron | ore_iron |  50 |          "
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
        fuel_cell | fuel_cell |  12 |          

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
