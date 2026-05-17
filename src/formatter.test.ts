import { afterEach, describe, expect, test } from 'bun:test';
import { displayStructuredResult } from './client';
import {
  browseShipsFixture,
  getLocationFixture,
  getStatusFixture,
  viewMarketFixture,
} from './display/formatter-fixtures';

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
});
