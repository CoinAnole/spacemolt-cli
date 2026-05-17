import { afterEach, describe, expect, test } from 'bun:test';
import { displayStructuredResult } from './client';

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
): { stdout: string; stderr: string } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  console.log = (...args: unknown[]) => stdout.push(args.map(String).join(' '));
  console.error = (...args: unknown[]) => stderr.push(args.map(String).join(' '));

  displayStructuredResult(command, structuredClone(fixture));

  return {
    stdout: stdout.join('\n').replace(ANSI_PATTERN, ''),
    stderr: stderr.join('\n').replace(ANSI_PATTERN, ''),
  };
}

describe('structuredContent formatters', () => {
  test('formats get_location before the simple message formatter', () => {
    const { stdout, stderr } = captureStructuredOutput('get_location', {
      message: 'Location retrieved',
      location: {
        system_id: 'sol',
        system_name: 'Sol',
        empire: 'Terran',
        security_status: 'high security',
        connections: ['alpha_centauri'],
        poi_id: 'sol_earth',
        poi_name: 'Earth',
        poi_type: 'planet',
        docked_at: 'earth_station',
        nearby_player_count: 1,
        nearby_players: [{ username: 'Marlowe', faction_tag: 'SMC', ship_class: 'prospector' }],
        nearby_pirate_count: 2,
        nearby_pirates: [{ name: 'Raider' }],
        nearby_empire_npc_count: 1,
        nearby_empire_npcs: [{ name: 'Patrol' }],
      },
    });

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
    const { stdout, stderr } = captureStructuredOutput('browse_ships', {
      base_name: 'Earth Station',
      listings: [
        {
          listing_id: 'listing-1',
          ship_id: 'ship-1',
          ship_name: 'Lucky Strike',
          class_id: 'prospector',
          price: 125000,
          scale: 1,
          tier: 2,
          category: 'Mining',
          hull: 80,
          max_hull: 100,
          shield: 20,
          seller_name: 'Marlowe',
        },
      ],
    });

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
    const { stdout, stderr } = captureStructuredOutput('view_market', {
      action: 'view_market',
      base_id: 'earth_station',
      items: [
        {
          item_id: 'ore_iron',
          item_name: 'Iron Ore',
          buy_orders: [{ price_each: 15, quantity: 500, source: 'station' }],
          sell_orders: [{ price_each: 18, quantity: 125 }],
        },
        {
          item_id: 'fuel_cell',
          item_name: 'Fuel Cell',
          buy_orders: [],
          sell_orders: [],
        },
      ],
    });

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

  test('normalizes get_status location data before player status formatting', () => {
    const { stdout, stderr } = captureStructuredOutput('get_status', {
      player: {
        username: 'Marlowe',
        empire: 'Terran',
        credits: 4242,
        faction_id: 'smc',
        faction_rank: 'captain',
      },
      ship: {
        name: 'Surveyor',
        class_id: 'prospector',
        hull: 90,
        max_hull: 100,
        shield: 35,
        max_shield: 50,
        shield_recharge: 5,
        armor: 10,
        fuel: 80,
        max_fuel: 100,
        cargo_used: 12,
        cargo_capacity: 60,
        cpu_used: 8,
        cpu_capacity: 20,
        power_used: 10,
        power_capacity: 25,
      },
      location: {
        system_id: 'sol',
        system_name: 'Sol',
        poi_id: 'sol_earth',
        poi_name: 'Earth',
        docked_at: 'earth_station',
        nearby_players: [{ username: 'Ibis', ship_class: 'hauler' }],
      },
    });

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
});
