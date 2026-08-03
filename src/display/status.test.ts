import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { renderStructuredResult } from './index.ts';
import { getStatusFixture, playerProfileFixture, scanCreatureFixture } from './status.fixtures.ts';

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
      return new Date('2026-07-18T00:00:00.000Z');
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

test('renders creature scan identity, hull, and revealed wildlife details in order', () => {
  const rendered = renderStructuredResult('scan', structuredClone(scanCreatureFixture), options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(rendered.stderr).toEqual([]);
  expect(stdout).toContain('=== Scan Result ===');
  expect(stdout).toContain('Target: creature-ember-grazer-1');
  expect(stdout).toContain('Hull: 80');
  expect(stdout).toContain('Revealed:');

  const revealLines = ['Species: Ember Grazer', 'Role: grazer', 'Danger: low', 'Ranchable: yes'];
  const revealIndexes = revealLines.map((line) => stdout.indexOf(line));
  expect(revealIndexes.every((index) => index >= 0)).toBe(true);
  expect(revealIndexes).toEqual([...revealIndexes].sort((left, right) => left - right));
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('NaN');
  expect(stdout).not.toContain('undefined');
  expect(stdout).not.toContain('[object Object]');
});

test('scan formatter declines a malformed shape without a target identity', () => {
  const malformed = { revealed_info: ['Species: Ember Grazer'] };
  const rendered = renderStructuredResult('scan', malformed, options, context);

  expect(rendered.stdout.join('\n')).toContain('=== Response ===');
});

test('get_status shows towing ship and release hint when towing_ship_id is set', () => {
  const rendered = renderStructuredResult(
    'get_status',
    {
      player: {
        username: 'Marlowe',
        empire: 'Terran',
        credits: 100,
        faction_id: null,
        towing_ship_id: 'ship-tow-1',
      },
      ship: {
        name: 'Hauler',
        class_id: 'hauler',
        hull: 50,
        max_hull: 50,
        shield: 10,
        max_shield: 10,
        shield_recharge: 1,
        armor: 0,
        fuel: 20,
        max_fuel: 40,
        cargo_used: 0,
        cargo_capacity: 100,
        cpu_used: 1,
        cpu_capacity: 10,
        power_used: 1,
        power_capacity: 10,
      },
    },
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Towing ship: ship-tow-1');
  expect(stdout).toContain('storage withdraw ship-tow-1');
  expect(stdout).not.toContain('Towing wreck:');
});

test('get_status shows towing wreck when towing_wreck_id is set', () => {
  const rendered = renderStructuredResult(
    'get_status',
    {
      player: {
        username: 'Marlowe',
        empire: 'Terran',
        credits: 100,
        towing_wreck_id: 'wreck-9',
      },
      ship: {
        name: 'Hauler',
        class_id: 'hauler',
        hull: 50,
        max_hull: 50,
        shield: 10,
        max_shield: 10,
        shield_recharge: 1,
        armor: 0,
        fuel: 20,
        max_fuel: 40,
        cargo_used: 0,
        cargo_capacity: 100,
        cpu_used: 1,
        cpu_capacity: 10,
        power_used: 1,
        power_capacity: 10,
      },
    },
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('Towing wreck: wreck-9');
  expect(stdout).toContain('release_tow');
  expect(stdout).not.toContain('Towing ship:');
});

test('get_status omits towing lines when not towing', () => {
  const rendered = renderStructuredResult(
    'get_status',
    {
      player: { username: 'Marlowe', empire: 'Terran', credits: 100 },
      ship: {
        name: 'Hauler',
        class_id: 'hauler',
        hull: 50,
        max_hull: 50,
        shield: 10,
        max_shield: 10,
        shield_recharge: 1,
        armor: 0,
        fuel: 20,
        max_fuel: 40,
        cargo_used: 0,
        cargo_capacity: 100,
        cpu_used: 1,
        cpu_capacity: 10,
        power_used: 1,
        power_capacity: 10,
      },
    },
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');
  expect(stdout).not.toContain('Towing ship:');
  expect(stdout).not.toContain('Towing wreck:');
});

function standingsSection(stdout: string): string | undefined {
  const match = stdout.match(/\nStandings:\n( {2}.+)/);
  return match?.[0];
}

test('get_status prints Standings when player.standings is present including pirate strongholds', () => {
  const rendered = renderStructuredResult('get_status', structuredClone(getStatusFixture), options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Standings:');
  expect(stdout).toContain('pirate_voss: -10');
  expect(stdout).toContain('pirate_kael: 5');
  expect(stdout).toContain('solarian: 12');
  expect(stdout).toContain('crimson: 94');
  // Placement: after trading restriction / faction identity, before Location
  const standingsIdx = stdout.indexOf('Standings:');
  const locationIdx = stdout.indexOf('Location:');
  const tradingIdx = stdout.indexOf('Trading restricted until:');
  expect(standingsIdx).toBeGreaterThan(tradingIdx);
  expect(locationIdx).toBeGreaterThan(standingsIdx);
  // Reputation only — no bounty/baseline expansion
  expect(stdout).not.toContain('outstanding_bounty');
  expect(stdout).not.toContain('baseline');
});

test('get_status omits Standings when standings are absent or empty', () => {
  const basePlayer = {
    username: 'Marlowe',
    empire: 'Terran',
    credits: 100,
  };
  for (const player of [{ ...basePlayer }, { ...basePlayer, standings: {} }, { ...basePlayer, standings: null }]) {
    const rendered = renderStructuredResult(
      'get_status',
      {
        player,
        ship: {
          name: 'Hauler',
          class_id: 'hauler',
          hull: 50,
          max_hull: 50,
          shield: 10,
          max_shield: 10,
          shield_recharge: 1,
          armor: 0,
          fuel: 20,
          max_fuel: 40,
          cargo_used: 0,
          cargo_capacity: 100,
          cpu_used: 1,
          cpu_capacity: 10,
          power_used: 1,
          power_capacity: 10,
        },
      },
      options,
      context,
    );
    expect(rendered.stdout.join('\n')).not.toContain('Standings:');
  }
});

test('get_status and get_player share emitStandings output shape', () => {
  const statusOut = renderStructuredResult(
    'get_status',
    structuredClone(getStatusFixture),
    options,
    context,
  ).stdout.join('\n');
  const playerOut = renderStructuredResult(
    'get_player',
    structuredClone(playerProfileFixture),
    options,
    context,
  ).stdout.join('\n');

  const statusSection = standingsSection(statusOut);
  const playerSection = standingsSection(playerOut);
  expect(statusSection).toBeDefined();
  expect(playerSection).toBeDefined();
  // Same header + indented key: rep line form
  expect(statusSection).toMatch(/\nStandings:\n {2}\S+: -?\d+/);
  expect(playerSection).toMatch(/\nStandings:\n {2}\S+: -?\d+/);
  // Both include at least one pirate_* key in key: rep form
  expect(statusSection).toMatch(/pirate_\w+: -?\d+/);
  expect(playerSection).toMatch(/pirate_\w+: -?\d+/);
});

test('get_state uses the status formatter and prints Standings', () => {
  const rendered = renderStructuredResult('get_state', structuredClone(getStatusFixture), options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Player Status ===');
  expect(stdout).toContain('Standings:');
  expect(stdout).toContain('pirate_voss: -10');
  expect(stdout).not.toContain('=== Response ===');
});
