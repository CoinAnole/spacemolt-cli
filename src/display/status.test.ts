import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { hexColor } from './ansi.ts';
import { renderStructuredResult } from './index.ts';
import {
  adultLeviathanContact,
  getLocationFixture,
  getLocationLeviathansFixture,
  getLocationResourcesFixture,
  getMapFixture,
  getMapStarlessFixture,
  getMapSystemFixture,
  getStateLeviathansFixture,
  getStatusDetainedFixture,
  getStatusFixture,
  getStatusOverCapacityFixture,
  getStatusResourcesFixture,
  getSystemAgentsFixture,
  jumpSurveyMissionsEnvelope,
  juvenileLeviathanContact,
  nearbyArenaFixture,
  nearbyArenaFleesFixture,
  nearbyBossFixture,
  nearbyFixture,
  payBountyFixture,
  playerArenaFixture,
  playerProfileFixture,
  poiArenaFixture,
  poiInfoFixture,
  poiWorkabilityFixture,
  scanCreatureFixture,
  scanFixture,
  scanPoiEmptyFixture,
  scanPoiFixture,
  stationPoiInfoFixture,
  subscribeObservationArenaFixture,
  subscribeObservationFixture,
  systemInfoFixture,
} from './status.fixtures.ts';

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
  expect(stdout).toContain(
    'Description: Heat-tolerant grazers that drift between vent plumes, skittish unless the herd is boxed in.',
  );
  expect(stdout).toContain('Revealed:');
  expect(stdout.indexOf('Hull:')).toBeLessThan(stdout.indexOf('Description:'));
  expect(stdout.indexOf('Description:')).toBeLessThan(stdout.indexOf('Revealed:'));
  expect(stdout).not.toContain('fit_crew');
  expect(stdout).not.toContain('fit_marines');

  const revealLines = ['Species: Ember Grazer', 'Role: grazer', 'Danger: low', 'Ranchable: yes'];
  const revealIndexes = revealLines.map((line) => stdout.indexOf(line));
  expect(revealIndexes.every((index) => index >= 0)).toBe(true);
  expect(revealIndexes).toEqual([...revealIndexes].sort((left, right) => left - right));
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('NaN');
  expect(stdout).not.toContain('undefined');
  expect(stdout).not.toContain('[object Object]');
});

test('scan branded creature prints Branded, Brand, and Ranch before Revealed', () => {
  const fixture = structuredClone(scanCreatureFixture) as Record<string, unknown>;
  fixture.branded = true;
  fixture.brand_faction = '[RNC] Ranchers Co-op';
  fixture.brand_ranch = 'cloudbank-ranch';
  const stdout = renderScan(fixture);

  expect(stdout).toContain('Branded: yes');
  expect(stdout).toContain('Brand: [RNC] Ranchers Co-op');
  expect(stdout).toContain('Ranch: cloudbank-ranch');
  expect(stdout).not.toContain('Branded: true');
  expect(stdout).not.toContain('Branded: false');
  expect(stdout.indexOf('Description:')).toBeLessThan(stdout.indexOf('Branded: yes'));
  expect(stdout.indexOf('Branded: yes')).toBeLessThan(stdout.indexOf('Brand:'));
  expect(stdout.indexOf('Brand:')).toBeLessThan(stdout.indexOf('Ranch:'));
  expect(stdout.indexOf('Ranch:')).toBeLessThan(stdout.indexOf('Revealed:'));
  expect(stdout).not.toContain('=== Response ===');
});

test('scan with branded true and no strings prints only Branded: yes', () => {
  const fixture = structuredClone(scanCreatureFixture) as Record<string, unknown>;
  fixture.branded = true;
  const stdout = renderScan(fixture);

  expect(stdout).toContain('Branded: yes');
  expect(stdout).not.toContain('Brand:');
  expect(stdout).not.toContain('Ranch:');
  expect(stdout.indexOf('Description:')).toBeLessThan(stdout.indexOf('Branded: yes'));
  expect(stdout.indexOf('Branded: yes')).toBeLessThan(stdout.indexOf('Revealed:'));
});

test('scan with branded false and no strings prints no brand lines', () => {
  const fixture = structuredClone(scanCreatureFixture) as Record<string, unknown>;
  fixture.branded = false;
  const stdout = renderScan(fixture);

  expect(stdout).not.toContain('Branded:');
  expect(stdout).not.toContain('Brand:');
  expect(stdout).not.toContain('Ranch:');
  expect(stdout).toContain('Description:');
  expect(stdout).toContain('Revealed:');
});

test('scan with branded false still prints non-empty Brand and Ranch strings', () => {
  const fixture = structuredClone(scanCreatureFixture) as Record<string, unknown>;
  fixture.branded = false;
  fixture.brand_faction = '[RNC] Ranchers Co-op';
  fixture.brand_ranch = '  ';
  const stdout = renderScan(fixture);

  expect(stdout).not.toContain('Branded:');
  expect(stdout).toContain('Brand: [RNC] Ranchers Co-op');
  expect(stdout).not.toContain('Ranch:');
  expect(stdout.indexOf('Description:')).toBeLessThan(stdout.indexOf('Brand:'));
  expect(stdout.indexOf('Brand:')).toBeLessThan(stdout.indexOf('Revealed:'));
});

test('scan omits Description when the lore string is already in revealed_info', () => {
  const fixture = structuredClone(scanCreatureFixture) as Record<string, unknown>;
  const description = fixture.description;
  fixture.revealed_info = [...(fixture.revealed_info as string[]), description];
  const stdout = renderStructuredResult('scan', fixture, options, context).stdout.join('\n');

  expect(stdout).not.toContain(`Description: ${description}`);
  expect(stdout).toContain(String(description));
  expect(stdout.split(String(description)).length - 1).toBe(1);
});

test('scan formatter declines a malformed shape without a target identity', () => {
  const malformed = { revealed_info: ['Species: Ember Grazer'] };
  const rendered = renderStructuredResult('scan', malformed, options, context);

  expect(rendered.stdout.join('\n')).toContain('=== Response ===');
});

function renderScan(fixture: Record<string, unknown>, renderOptions: GlobalOptions = options): string {
  const rendered = renderStructuredResult('scan', structuredClone(fixture), renderOptions, context);
  expect(rendered.success).toBe(true);
  expect(rendered.stderr).toEqual([]);
  return rendered.stdout.join('\n');
}

const scanColorOptions: GlobalOptions = { ...options, plain: false };

test('remote poi scan prints the contact layout under Scan Result', () => {
  const stdout = renderScan(scanPoiFixture);

  expect(stdout).toContain('=== Scan Result ===');
  expect(stdout).not.toContain('=== Faction Scan ===');
  expect(stdout).toContain('POI: sol_central');
  expect(stdout).toContain('Scan power: 20');
  expect(stdout).toContain('Signature detected.');
  expect(stdout).toContain('Target: earth_station');
  expect(stdout).toContain('=== Players ===');
  expect(stdout).toContain('Wisp');
  expect(stdout).toContain('player-1');
  expect(stdout).toContain('=== Empire NPCs ===');
  expect(stdout).toContain('Patrol');
  expect(stdout).toContain('Pirates (1):');
  expect(stdout).toContain('  Raider (skiff) - raider - Admiral Kael');
  expect(stdout).toContain('Leviathans (1):');
  expect(stdout).toContain('  Adult Molt Leviathan [lev-molt-1] (molt_leviathan) - adult - hull 800/1200 - aggressive');
  expect(stdout).toContain('Revealed:');
  expect(stdout).toContain('  cloaked');
  expect(stdout).not.toContain('Success:');
  expect(stdout).not.toContain('Ship:');
  expect(stdout).not.toContain('Branded:');
  expect(stdout).not.toContain('Target Id:');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout.indexOf('Signature detected.')).toBeLessThan(stdout.indexOf('Target: earth_station'));
  expect(stdout.indexOf('Target: earth_station')).toBeLessThan(stdout.indexOf('=== Players ==='));
  expect(stdout.indexOf('=== Players ===')).toBeLessThan(stdout.indexOf('=== Empire NPCs ==='));
  expect(stdout.indexOf('=== Empire NPCs ===')).toBeLessThan(stdout.indexOf('Pirates (1):'));
  expect(stdout.indexOf('Pirates (1):')).toBeLessThan(stdout.indexOf('Leviathans (1):'));
  expect(stdout.indexOf('Leviathans (1):')).toBeLessThan(stdout.indexOf('Revealed:'));
  expect(stdout.split('\n').find((line) => line.includes('Signature detected.'))).toBe('Signature detected.');
  expect(stdout).not.toContain('\x1b');
});

test('remote poi scan with omitted lists prints only the header', () => {
  const stdout = renderScan(scanPoiEmptyFixture);

  expect(stdout).toContain('=== Scan Result ===');
  expect(stdout).toContain('POI: sol_belt_4');
  expect(stdout).toContain('Scan power: 45');
  expect(stdout).not.toContain('Target:');
  expect(stdout).not.toContain('=== Players ===');
  expect(stdout).not.toContain('=== Empire NPCs ===');
  expect(stdout).not.toContain('Pirates (');
  expect(stdout).not.toContain('Leviathans');
  expect(stdout).not.toContain('Revealed:');
  expect(stdout).not.toContain('Success:');
  expect(stdout).not.toContain('Signature detected.');
  expect(stdout).not.toContain('=== Response ===');
});

test('remote poi scan treats empty contact arrays like omitted keys', () => {
  const emptyLists = {
    ...structuredClone(scanPoiEmptyFixture),
    contacts: [],
    npcs: [],
    pirates: [],
    leviathans: [],
  };

  expect(renderScan(emptyLists)).toBe(renderScan(scanPoiEmptyFixture));
});

test('remote poi scan drops top-level ship and branded fields', () => {
  const stdout = renderScan({
    success: true,
    target_id: 'earth_station',
    poi_id: 'sol_central',
    username: 'Ibis',
    ship_class: 'hauler',
    branded: true,
    brand_faction: '[RNC] Ranchers Co-op',
    brand_ranch: 'cloudbank-ranch',
    revealed_info: [],
  });

  expect(stdout).toContain('=== Scan Result ===');
  expect(stdout).toContain('POI: sol_central');
  expect(stdout).toContain('Target: earth_station');
  expect(stdout).not.toContain('Target: Ibis');
  expect(stdout).not.toContain('Ship:');
  expect(stdout).not.toContain('Branded:');
  expect(stdout).not.toContain('Brand:');
  expect(stdout).not.toContain('Ranch:');
  expect(stdout).not.toContain('cloudbank-ranch');
  expect(stdout).not.toContain('Ranchers');
  expect(stdout).not.toContain('=== Faction Scan ===');
  expect(stdout).not.toContain('=== Players ===');
  expect(stdout).not.toContain('=== Response ===');
});

test('scan ignores a location-aliased poi_id', () => {
  const stdout = renderScan({
    details: structuredClone(scanFixture),
    location: { poi_id: 'sol_earth', poi_name: 'Earth', system_id: 'elsewhere' },
  });

  expect(stdout).toContain('Target: Ibis');
  expect(stdout).toContain('Ship: hauler');
  expect(stdout).not.toContain('POI:');
  expect(stdout).not.toContain('Earth');
  expect(stdout).not.toContain('sol_earth');
  expect(stdout).not.toContain('elsewhere');
  expect(stdout).not.toContain('=== Players ===');
  expect(stdout).not.toContain('System:');
});

test('remote poi scan keeps the native poi when location names a different poi', () => {
  const stdout = renderScan({
    details: structuredClone(scanPoiFixture),
    location: { poi_id: 'sol_earth', poi_name: 'Earth', system_id: 'elsewhere' },
  });

  expect(stdout).toContain('POI: sol_central');
  expect(stdout).toContain('Target: earth_station');
  expect(stdout).toContain('=== Players ===');
  expect(stdout).not.toContain('sol_earth');
  expect(stdout).not.toContain('Earth');
  expect(stdout).not.toContain('elsewhere');
  expect(stdout).not.toContain('System:');
});

test('remote poi scan prints signature only when it is exactly true', () => {
  const hidden = structuredClone(scanPoiFixture) as Record<string, unknown>;
  hidden.signature_detected = false;
  const omitted = structuredClone(scanPoiFixture) as Record<string, unknown>;
  delete omitted.signature_detected;

  expect(renderScan(hidden)).not.toContain('Signature detected.');
  expect(renderScan(omitted)).not.toContain('Signature detected.');

  const colored = renderScan(scanPoiFixture, scanColorOptions);
  const line = colored.split('\n').find((entry) => entry.includes('Signature detected.'));
  expect(line).toContain('Signature detected.');
  expect(line).toContain('\x1b[33m');
});

test('remote poi scan prints a native message and skips an empty or omitted one', () => {
  const withMessage = structuredClone(scanPoiEmptyFixture) as Record<string, unknown>;
  withMessage.message = 'Cloak margin held.';
  const printed = renderScan(withMessage);
  expect(printed.split('\n')).toContain('Cloak margin held.');
  expect(printed).not.toContain('Message:');

  const omitted = renderScan(scanPoiEmptyFixture);
  expect(omitted).not.toContain('Cloak margin held.');
  expect(omitted).not.toContain('Message:');

  const emptyMessage = structuredClone(scanPoiEmptyFixture) as Record<string, unknown>;
  emptyMessage.message = '';
  expect(renderScan(emptyMessage)).toBe(omitted);
});

test('remote poi scan prints Success only when success is false', () => {
  const failed = structuredClone(scanPoiEmptyFixture) as Record<string, unknown>;
  failed.success = false;
  const failedStdout = renderScan(failed);
  expect(failedStdout).toContain('Success: false');
  expect(failedStdout.indexOf('Scan power: 45')).toBeLessThan(failedStdout.indexOf('Success: false'));

  expect(renderScan(scanPoiEmptyFixture)).not.toContain('Success:');
  expect(renderScan(scanPoiFixture)).not.toContain('Success:');

  const targetFailed = structuredClone(scanFixture) as Record<string, unknown>;
  targetFailed.success = false;
  expect(renderScan(targetFailed)).not.toContain('Success:');
});

test('remote poi scan prints scan power 0 and still formats when power is omitted', () => {
  const zero = structuredClone(scanPoiEmptyFixture) as Record<string, unknown>;
  zero.scan_power = 0;
  expect(renderScan(zero)).toContain('Scan power: 0');

  const omitted = structuredClone(scanPoiEmptyFixture) as Record<string, unknown>;
  delete omitted.scan_power;
  const stdout = renderScan(omitted);
  expect(stdout).toContain('POI: sol_belt_4');
  expect(stdout).not.toContain('Scan power:');
  expect(stdout).not.toContain('=== Response ===');
});

test('scan with contacts and no native poi_id does not print players', () => {
  const withContacts = {
    ...structuredClone(scanFixture),
    contacts: [{ target_id: 'player-9', username: 'Ghost', revealed_info: ['username'], cloaked: true }],
  };
  const stdout = renderScan(withContacts);
  expect(stdout).toContain('Target: Ibis');
  expect(stdout).toContain('Ship: hauler');
  expect(stdout).not.toContain('=== Players ===');
  expect(stdout).not.toContain('Ghost');

  const sweep = renderScan({
    success: true,
    target_id: 'player-2',
    revealed_info: [],
    contacts: [{ target_id: 'player-9', username: 'Ghost', revealed_info: ['username'] }],
  });
  expect(sweep).toContain('Target: player-2');
  expect(sweep).not.toContain('=== Players ===');
  expect(sweep).not.toContain('Ghost');
});

test('empty poi_id stays on the target scan branch', () => {
  const stdout = renderScan({ ...structuredClone(scanFixture), poi_id: '' });

  expect(stdout).toContain('Target: Ibis (player-2)');
  expect(stdout).toContain('Ship: hauler');
  expect(stdout).not.toContain('POI:');
  expect(stdout).not.toContain('=== Players ===');
});

test('non-string poi_id stays on the target scan branch and whitespace does not', () => {
  const numeric = renderScan({ ...structuredClone(scanFixture), poi_id: 12 });
  expect(numeric).toContain('Ship: hauler');
  expect(numeric).not.toContain('POI:');

  const missing = renderScan({ ...structuredClone(scanFixture), poi_id: null });
  expect(missing).toContain('Target: Ibis (player-2)');
  expect(missing).not.toContain('POI:');

  const whitespace = renderScan({ ...structuredClone(scanFixture), poi_id: ' ' });
  expect(whitespace).toContain('POI:');
  expect(whitespace).toContain('Target: player-2');
  expect(whitespace).not.toContain('Target: Ibis');
  expect(whitespace).not.toContain('Ship:');
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
  expect(stdout).toContain('bounty 500');
  expect(stdout).not.toContain('outstanding_bounty');
  expect(stdout).not.toContain('baseline');
});

test.each([
  'get_status',
  'get_state',
] as const)('%s with V2Missions still prints status and omits Active Missions', (command) => {
  const stdout = renderStructuredResult(
    command,
    { ...structuredClone(getStatusFixture), missions: jumpSurveyMissionsEnvelope },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Standings:');
  expect(stdout).toContain('Location:');
  expect(stdout).not.toContain('=== Active Missions ===');
  expect(stdout).not.toContain('=== Response ===');
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
  expect(stdout).toContain('pirate_voss: -10 (bounty 500)');
  expect(stdout).not.toContain('=== Response ===');
});

function withoutCitizenships<T extends { player: Record<string, unknown> }>(fixture: T): T {
  const clone = structuredClone(fixture);
  delete clone.player.citizenships;
  delete clone.player.held_citizenships;
  delete clone.player.citizenship;
  return clone;
}

test.each([
  'get_status',
  'get_state',
  'get_player',
] as const)('%s prints Citizenships: none when the snapshot omits citizenships', (command) => {
  const fixture =
    command === 'get_player' ? withoutCitizenships(playerProfileFixture) : withoutCitizenships(getStatusFixture);
  const stdout = renderStructuredResult(command, fixture, options, context).stdout.join('\n');
  expect(stdout).toContain('Citizenships: none');
  expect(stdout).not.toContain('Citizenships: stateless');
});

test('get_status prints Citizenships: none for a present empty array', () => {
  const stdout = renderStructuredResult(
    'get_status',
    statusWithPlayer({ citizenships: [] }),
    options,
    context,
  ).stdout.join('\n');
  expect(stdout).toContain('Citizenships: none');
});

test('get_status still prints populated citizenships', () => {
  const stdout = renderStructuredResult('get_status', structuredClone(getStatusFixture), options, context).stdout.join(
    '\n',
  );
  expect(stdout).toContain('Citizenships: solarian, nebula');
  expect(stdout).not.toContain('Citizenships: none');
});

test('player-shaped buy shapeFallback omits Citizenships when the key is absent', () => {
  const stdout = renderStructuredResult(
    'buy',
    { player: { username: 'Marlowe', empire: 'Terran' } },
    options,
    context,
  ).stdout.join('\n');
  expect(stdout).toContain('=== Player Status ===');
  expect(stdout).not.toContain('Citizenships:');
});

test('player-shaped buy shapeFallback prints Citizenships: none for a present empty array', () => {
  const stdout = renderStructuredResult(
    'buy',
    { player: { username: 'Marlowe', empire: 'Terran', citizenships: [] } },
    options,
    context,
  ).stdout.join('\n');
  expect(stdout).toContain('Citizenships: none');
});

function statusWithPlayer(player: Record<string, unknown>) {
  const fixture = structuredClone(getStatusFixture) as {
    player: Record<string, unknown>;
  };
  fixture.player = { ...fixture.player, ...player };
  return fixture;
}

test('get_player table standings show non-zero bounty without the raw field name', () => {
  const rendered = renderStructuredResult('get_player', structuredClone(playerProfileFixture), options, context);
  const stdout = rendered.stdout.join('\n');

  expect(stdout).toContain('pirate_voss: -30 (bounty 2,500)');
  expect(stdout).not.toContain('outstanding_bounty');
  expect(stdout).not.toContain('baseline');
});

test('get_status omits zero outstanding bounties from standings', () => {
  const rendered = renderStructuredResult(
    'get_status',
    statusWithPlayer({
      standings: {
        solarian: { baseline: 0, outstanding_bounty: 0, reputation: 12 },
        crimson: { baseline: 10, outstanding_bounty: 0, reputation: 94 },
      },
    }),
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');

  expect(standingsSection(stdout)).toContain('solarian: 12, crimson: 94');
  expect(stdout).not.toContain('bounty');
  expect(stdout).not.toContain('outstanding_bounty');
});

test('get_status prints a detention line from standing jailed_until', () => {
  const rendered = renderStructuredResult(
    'get_status',
    statusWithPlayer({
      standings: {
        solarian: {
          baseline: 0,
          outstanding_bounty: 0,
          reputation: 12,
          jailed_until: '2026-07-18T12:34:56Z',
        },
      },
    }),
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');

  expect(stdout).toContain('Detained by: solarian until 2026-07-18 12:34:56');
  expect(stdout).toContain('solarian: 12 (jailed until 2026-07-18 12:34:56)');
  expect(stdout).not.toContain('(owe');
});

test('get_status prints a fully populated detention line before standings', () => {
  const rendered = renderStructuredResult('get_status', structuredClone(getStatusDetainedFixture), options, context);
  const stdout = rendered.stdout.join('\n');

  expect(stdout).toContain('Detained by: solarian until 2026-07-18 12:34:56 (owe 2,500 cr)');
  expect(stdout).toContain('solarian: 12 (bounty 2,500, jailed until 2026-07-18 12:34:56)');
  expect(stdout).not.toContain('restore');
  const tradingIdx = stdout.indexOf('Trading restricted until:');
  const detainedIdx = stdout.indexOf('Detained by:');
  const standingsIdx = stdout.indexOf('Standings:');
  const locationIdx = stdout.indexOf('Location:');
  expect(detainedIdx).toBeGreaterThan(tradingIdx);
  expect(standingsIdx).toBeGreaterThan(detainedIdx);
  expect(locationIdx).toBeGreaterThan(standingsIdx);
});

test('get_poi prints an arena line after Class', () => {
  const stdout = renderStructuredResult('get_poi', structuredClone(poiArenaFixture), options, context).stdout.join(
    '\n',
  );
  expect(stdout).toContain('Class: common');
  expect(stdout).toContain('Arena: yes (consequence-free matches; see: arena status)');
  expect(stdout.indexOf('Class: common')).toBeLessThan(stdout.indexOf('Arena: yes'));
  expect(stdout).not.toContain('=== Response ===');
});

const DEEP_CORE_LINE = 'Deep core: yes (too-sparse cutoff never applies; needs deep_core_access)';

test('get_poi prints Deep core after Class when overlaid', () => {
  const fixture = structuredClone(poiInfoFixture);
  (fixture.poi as Record<string, unknown>).deep_core = true;
  const stdout = renderStructuredResult('get_poi', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Class: common');
  expect(stdout).toContain(DEEP_CORE_LINE);
  expect(stdout.indexOf('Class: common')).toBeLessThan(stdout.indexOf(DEEP_CORE_LINE));
  expect(stdout).not.toContain('[deep core]');
  expect(stdout).not.toContain('=== Response ===');
});

test('get_poi prints Deep core after the arena line when both are set', () => {
  const fixture = structuredClone(poiArenaFixture);
  (fixture.poi as Record<string, unknown>).deep_core = true;
  const stdout = renderStructuredResult('get_poi', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Arena: yes (consequence-free matches; see: arena status)');
  expect(stdout).toContain(DEEP_CORE_LINE);
  expect(stdout.indexOf('Arena: yes')).toBeLessThan(stdout.indexOf(DEEP_CORE_LINE));
});

test('get_poi omits Deep core when false, missing, or non-boolean', () => {
  const missing = renderStructuredResult('get_poi', structuredClone(poiInfoFixture), options, context).stdout.join(
    '\n',
  );
  expect(missing).not.toContain('Deep core');
  expect(missing).not.toContain('[deep core]');

  for (const value of [false, 'true', 1]) {
    const fixture = structuredClone(poiInfoFixture);
    (fixture.poi as Record<string, unknown>).deep_core = value;
    const stdout = renderStructuredResult('get_poi', fixture, options, context).stdout.join('\n');
    expect(stdout).not.toContain('Deep core');
    expect(stdout).not.toContain('[deep core]');
  }
});

test('get_player prints arena record and XP after skill stats', () => {
  const stdout = renderStructuredResult(
    'get_player',
    structuredClone(playerArenaFixture),
    options,
    context,
  ).stdout.join('\n');
  expect(stdout).toContain('Crafting: Level 2 (175 XP)');
  expect(stdout).toContain('Arena: 3 wins / 1 loss / 7 knockouts');
  expect(stdout).toContain('Arena trials: first_blood ×3, two_on_one ×1');
  expect(stdout).toContain('Arena XP today (2026-09-04): gunnery 120, shields 40');
  expect(stdout.indexOf('Crafting:')).toBeLessThan(stdout.indexOf('Arena: 3 wins'));
  expect(stdout.indexOf('Arena: 3 wins')).toBeLessThan(stdout.indexOf('Arena trials:'));
  expect(stdout.indexOf('Arena trials:')).toBeLessThan(stdout.indexOf('Arena XP today'));
});

test('get_player omits arena stats at 0/0/0 with no XP', () => {
  const fixture = structuredClone(playerProfileFixture) as {
    player: { stats: Record<string, unknown> };
  };
  fixture.player.stats.arena_wins = 0;
  fixture.player.stats.arena_losses = 0;
  fixture.player.stats.arena_knockouts = 0;
  const stdout = renderStructuredResult('get_player', fixture, options, context).stdout.join('\n');
  expect(stdout).toContain('Crafting: Level 2 (175 XP)');
  expect(stdout).not.toContain('Arena: ');
  expect(stdout).not.toContain('Arena trials:');
  expect(stdout).not.toContain('Arena XP today');
});

test('get_status does not print arena stats', () => {
  const fixture = structuredClone(getStatusFixture) as { player: Record<string, unknown> };
  fixture.player.stats = { arena_wins: 3, arena_losses: 1, arena_knockouts: 7 };
  fixture.player.arena_xp = { by_skill: { gunnery: 120 }, day: '2026-09-04' };
  fixture.player.arena_won = { first_blood: 3 };
  const stdout = renderStructuredResult('get_status', fixture, options, context).stdout.join('\n');
  expect(stdout).not.toContain('Arena: 3 wins');
  expect(stdout).not.toContain('Arena trials');
  expect(stdout).not.toContain('Arena XP today');
});

test('get_player omits Arena trials when arena_won is empty or all zeros', () => {
  const empty = structuredClone(playerArenaFixture) as {
    player: { arena_won?: Record<string, number> };
  };
  empty.player.arena_won = {};
  const emptyOut = renderStructuredResult('get_player', empty, options, context).stdout.join('\n');
  expect(emptyOut).toContain('Arena: 3 wins');
  expect(emptyOut).not.toContain('Arena trials:');

  const zeros = structuredClone(playerArenaFixture) as {
    player: { arena_won?: Record<string, number> };
  };
  zeros.player.arena_won = { first_blood: 0 };
  const zerosOut = renderStructuredResult('get_player', zeros, options, context).stdout.join('\n');
  expect(zerosOut).toContain('Arena: 3 wins');
  expect(zerosOut).not.toContain('Arena trials:');
});

test('get_player prints detention after trading restriction and before stats', () => {
  const fixture = structuredClone(playerProfileFixture) as {
    player: { standings: Record<string, Record<string, unknown>> };
  };
  fixture.player.standings.crimson = {
    ...fixture.player.standings.crimson,
    jailed_until: '2026-07-18T12:34:56Z',
  };
  const stdout = renderStructuredResult('get_player', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Detained by: crimson until 2026-07-18 12:34:56');
  const restrictionIdx = stdout.indexOf('Trading restricted until:');
  const detainedIdx = stdout.indexOf('Detained by:');
  const statsIdx = stdout.indexOf('Stats:');
  const standingsIdx = stdout.indexOf('Standings:');
  expect(detainedIdx).toBeGreaterThan(restrictionIdx);
  expect(statsIdx).toBeGreaterThan(detainedIdx);
  expect(standingsIdx).toBeGreaterThan(statsIdx);
});

test('get_status omits detention when standings have no jailed_until', () => {
  for (const standings of [
    {
      solarian: { baseline: 0, outstanding_bounty: 2500, reputation: 12 },
    },
    {
      solarian: { baseline: 0, outstanding_bounty: 2500, reputation: 12, jailed_until: '' },
    },
  ]) {
    const rendered = renderStructuredResult('get_status', statusWithPlayer({ standings }), options, context);
    expect(rendered.stdout.join('\n')).not.toContain('Detained');
  }
});

test('get_status composes detention fragments from standings', () => {
  const stdout = renderStructuredResult(
    'get_status',
    statusWithPlayer({
      standings: {
        solarian: {
          baseline: 0,
          outstanding_bounty: 2500,
          reputation: 12,
          jailed_until: '2026-07-18T12:34:56Z',
        },
        crimson: {
          baseline: 10,
          outstanding_bounty: 0,
          reputation: 94,
          jailed_until: '2026-07-19T08:00:00Z',
        },
      },
    }),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Detained by: solarian until 2026-07-18 12:34:56 (owe 2,500 cr)');
  expect(stdout).toContain('Detained by: crimson until 2026-07-19 08:00:00');
  const solarianIdx = stdout.indexOf('Detained by: solarian');
  const crimsonIdx = stdout.indexOf('Detained by: crimson');
  expect(crimsonIdx).toBeGreaterThan(solarianIdx);
});

test('get_status_summary stays compact without detention or bounty', () => {
  const stdout = renderStructuredResult(
    'get_status_summary',
    structuredClone(getStatusDetainedFixture),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Player:');
  expect(stdout).toContain('Crew:');
  expect(stdout).toContain('4/6');
  expect(stdout).not.toContain('Detained');
  expect(stdout).not.toContain('bounty');
  expect(stdout).not.toContain('Standings:');
});

test('pay_bounty prints a bounty paid receipt', () => {
  const rendered = renderStructuredResult('pay_bounty', structuredClone(payBountyFixture), options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Bounty Paid ===');
  expect(stdout).toContain('Empire: solarian');
  expect(stdout).toContain('Amount paid: 2,500 cr');
  expect(stdout).toContain('Paid from: self');
  expect(stdout).toContain('Credits: 1,742');
  expect(stdout).toContain('Reputation after: 12');
  expect(stdout).toContain('Released from detention: yes');
  expect(stdout).toContain('Outstanding bounties:');
  expect(stdout).toContain('  crimson: 400 cr');
  expect(stdout).toContain('Bounty settled with Solarian.');
  expect(stdout).not.toContain('=== Response ===');
});

test('pay_bounty prints none when remaining bounties are empty', () => {
  const stdout = renderStructuredResult(
    'pay_bounty',
    { ...payBountyFixture, outstanding_bounties: [] },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Outstanding bounties: none');
  expect(stdout).not.toContain('=== Response ===');
});

test('pay_bounty prints released_from_detention no when still detained', () => {
  const stdout = renderStructuredResult(
    'pay_bounty',
    { ...payBountyFixture, released_from_detention: false },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Released from detention: no');
});

test('pay_bounty prints faction treasury source and faction credits', () => {
  const stdout = renderStructuredResult(
    'pay_bounty',
    { ...payBountyFixture, paid_from: 'faction', faction_credits: 90000 },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Paid from: faction');
  expect(stdout).toContain('Faction credits: 90,000');
});

test('get_poi nested station prints indented ID and POI and skips Station Base ID', () => {
  const rendered = renderStructuredResult('get_poi', structuredClone(stationPoiInfoFixture), options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(rendered.stderr).toEqual([]);
  expect(stdout).toContain('=== POI: Earth ===');
  expect(stdout).toContain('ID: sol_earth');
  expect(stdout).toContain('Station: Earth Station');
  expect(stdout).not.toContain('=== Station: Earth Station ===');
  expect(stdout).toContain('  ID: earth_station');
  expect(stdout).toContain('  POI: sol_earth');
  expect(stdout).toContain('  Type: station');
  expect(stdout).toContain('  Empire: Terran');
  expect(stdout).toContain('  A busy trade hub.');
  expect(stdout).toContain('  Hull: 900/1000');
  expect(stdout).toContain('  Shield: 200/300');
  expect(stdout).toContain('  Armor: 50');
  expect(stdout).toContain('  Guns: 40 DPS (reach 2)');
  expect(stdout).toContain('  Fuel: 500/1000');
  expect(stdout).not.toContain('Station Base ID:');
  expect(stdout).not.toContain("Station: earth_station (use 'dock' to enter)");
  expect(stdout).not.toContain('=== Response ===');
});

test('get_poi with poi.base_id and no nested base prints Station Base ID', () => {
  const rendered = renderStructuredResult(
    'get_poi',
    {
      poi: {
        id: 'sol_earth',
        name: 'Earth',
        type: 'station',
        system_id: 'sol',
        base_id: 'earth_station',
      },
    },
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain("Station Base ID: earth_station (use 'dock' to enter)");
  expect(stdout).not.toContain('Station: Earth Station');
  expect(stdout).not.toContain('  ID:');
  expect(stdout).not.toContain('  POI:');
  expect(stdout).not.toContain("Station: earth_station (use 'dock' to enter)");
  expect(stdout).not.toContain('=== Response ===');
});

test('get_poi nested station omits POI when poi_id is absent', () => {
  const fixture = structuredClone(stationPoiInfoFixture) as {
    base: { poi_id?: string };
  };
  delete fixture.base.poi_id;
  const stdout = renderStructuredResult('get_poi', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('  ID: earth_station');
  expect(stdout).not.toContain('  POI:');
});

test('get_poi prints lock min and too sparse on workability deposits', () => {
  const stdout = renderStructuredResult(
    'get_poi',
    structuredClone(poiWorkabilityFixture),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('- Iron Ore: richness 3, 120/300 (40.00% remaining), supports power 6, lock min 200');
  expect(stdout).toContain(
    '- Gold Ore: richness 1, 74/300 (24.67% remaining), supports power 3, lock min 200, too sparse',
  );
  expect(stdout).toContain('- \x1b[9mCopper Ore: richness 2, depleted, lock min 200, too sparse\x1b[29m');
});

test('get_poi too_sparse false does not print too sparse', () => {
  const fixture = {
    ...poiInfoFixture,
    resources: poiInfoFixture.resources.map((resource) => ({ ...resource, too_sparse: false })),
  };
  const stdout = renderStructuredResult('get_poi', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('supports power 12');
  expect(stdout).not.toContain('too sparse');
});

test('get_poi omitted lock does not print lock min', () => {
  const stdout = renderStructuredResult('get_poi', structuredClone(poiInfoFixture), options, context).stdout.join('\n');

  expect(stdout).toContain('- Iron Ore: richness 3, 750/1000 (75.00% remaining), supports power 12');
  expect(stdout).not.toContain('lock min');
  expect(stdout).not.toContain('too sparse');
});

test('pay_bounty declines to raw response without amount_paid', () => {
  const rendered = renderStructuredResult(
    'pay_bounty',
    { empire: 'solarian', outstanding_bounties: [], paid_from: 'self' },
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');

  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('=== Bounty Paid ===');
});

const personnelLeak = [
  'fit_crew',
  'fit_marines',
  'injured_crew',
  'injured_marines',
  'prize_crew_fit',
  'crew_disposition',
];

function assertCopyablePrizeIds(stdout: string, header: string): void {
  expect(stdout).toContain(`${header} (1):`);
  expect(stdout).toContain('Prize ID');
  expect(stdout).toContain('prize-dust-1');
  expect(stdout).toContain('Actor');
  expect(stdout).toContain('actor-prize-1');
  expect(stdout).toContain('Dust Devil');
  expect(stdout).toContain('frigate');
  expect(stdout).toContain('available');
  expect(stdout).toContain('40/80');
  for (const field of personnelLeak) {
    expect(stdout).not.toContain(field);
  }
}

test('get_nearby prints copyable Prize ID and Actor and omits personnel', () => {
  const rendered = renderStructuredResult('get_nearby', structuredClone(nearbyFixture), options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(rendered.stderr).toEqual([]);
  expect(stdout).toContain('=== Nearby ===');
  assertCopyablePrizeIds(stdout, 'Prizes');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('Arena NPCs');
});

test('get_nearby pirate lines stay unprefixed when is_boss is false', () => {
  const stdout = renderStructuredResult('get_nearby', structuredClone(nearbyFixture), options, context).stdout.join(
    '\n',
  );

  expect(stdout).toContain('Raider (skiff) - Admiral Kael - hostile');
  expect(stdout).not.toContain('Boss ');
});

const colorOptions: GlobalOptions = { ...options, plain: false };
const pirateFg = '#112233';
const pirateBg = '#445566';

function nearbyPirateLine(stdout: string, token: string): string | undefined {
  return stdout.split('\n').find((line) => line.includes(token));
}

function nearbyWithPirateColors(
  colors: Record<string, unknown>,
  source: typeof nearbyFixture = nearbyFixture,
  pirateIndex = 0,
): { pirates: Array<Record<string, unknown>> } {
  const fixture = structuredClone(source) as { pirates: Array<Record<string, unknown>> };
  fixture.pirates[pirateIndex] = { ...fixture.pirates[pirateIndex], ...colors };
  return fixture;
}

function locationWithPirateColors(
  colors: Record<string, unknown>,
  pirateIndex = 0,
): { location: { nearby_pirates: Array<Record<string, unknown>> } } {
  const fixture = structuredClone(getLocationFixture) as {
    location: { nearby_pirates: Array<Record<string, unknown>> };
  };
  const pirate = { ...fixture.location.nearby_pirates[pirateIndex] };
  delete pirate.primary_color;
  delete pirate.secondary_color;
  fixture.location.nearby_pirates[pirateIndex] = { ...pirate, ...colors };
  return fixture;
}

function locationBossFixture(): {
  location: { nearby_pirates: Array<Record<string, unknown>>; nearby_pirate_count: number };
} {
  const fixture = structuredClone(getLocationFixture) as {
    location: { nearby_pirates: Array<Record<string, unknown>>; nearby_pirate_count: number };
  };
  fixture.location.nearby_pirate_count = nearbyBossFixture.pirate_count;
  fixture.location.nearby_pirates = structuredClone(nearbyBossFixture.pirates);
  return fixture;
}

test('get_nearby colors pirate names with both crew hex colors', () => {
  const stdout = renderStructuredResult(
    'get_nearby',
    nearbyWithPirateColors({ primary_color: pirateFg, secondary_color: pirateBg }),
    colorOptions,
    context,
  ).stdout.join('\n');
  const line = nearbyPirateLine(stdout, 'Raider');

  expect(line).toBe(`  ${hexColor('Raider', pirateFg, pirateBg)} (skiff) - Admiral Kael - hostile`);
  expect(line).toContain('\x1b[38;2');
  expect(line).toContain('\x1b[48;2');
  expect(line?.endsWith('\x1b[0m (skiff) - Admiral Kael - hostile')).toBe(true);
});

test('get_nearby colors pirate names with primary color only', () => {
  const stdout = renderStructuredResult(
    'get_nearby',
    nearbyWithPirateColors({ primary_color: pirateFg }),
    colorOptions,
    context,
  ).stdout.join('\n');

  expect(nearbyPirateLine(stdout, 'Raider')).toBe(`  ${hexColor('Raider', pirateFg)} (skiff) - Admiral Kael - hostile`);
  expect(nearbyPirateLine(stdout, 'Raider')).toContain('\x1b[38;2');
  expect(nearbyPirateLine(stdout, 'Raider')).not.toContain('\x1b[48;2');
});

test('get_nearby colors pirate names with secondary color only', () => {
  const stdout = renderStructuredResult(
    'get_nearby',
    nearbyWithPirateColors({ secondary_color: pirateBg }),
    colorOptions,
    context,
  ).stdout.join('\n');

  expect(nearbyPirateLine(stdout, 'Raider')).toBe(
    `  ${hexColor('Raider', undefined, pirateBg)} (skiff) - Admiral Kael - hostile`,
  );
  expect(nearbyPirateLine(stdout, 'Raider')).toContain('\x1b[48;2');
  expect(nearbyPirateLine(stdout, 'Raider')).not.toContain('\x1b[38;2');
});

test('get_nearby leaves pirate names uncolored for invalid hex', () => {
  const stdout = renderStructuredResult(
    'get_nearby',
    nearbyWithPirateColors({ primary_color: 'red', secondary_color: '#fff' }),
    colorOptions,
    context,
  ).stdout.join('\n');
  const line = nearbyPirateLine(stdout, 'Raider');

  expect(line).toBe('  Raider (skiff) - Admiral Kael - hostile');
  expect(line).not.toContain('\x1b');
});

test('get_nearby colors only the valid pirate livery channel when mixed with invalid hex', () => {
  const stdout = renderStructuredResult(
    'get_nearby',
    nearbyWithPirateColors({ primary_color: pirateFg, secondary_color: 'red' }),
    colorOptions,
    context,
  ).stdout.join('\n');

  expect(nearbyPirateLine(stdout, 'Raider')).toBe(
    `  ${hexColor('Raider', pirateFg, 'red')} (skiff) - Admiral Kael - hostile`,
  );
});

test('get_nearby leaves pirate names uncolored when livery colors are missing', () => {
  const stdout = renderStructuredResult(
    'get_nearby',
    structuredClone(nearbyFixture),
    colorOptions,
    context,
  ).stdout.join('\n');
  const line = nearbyPirateLine(stdout, 'Raider');

  expect(line).toBe('  Raider (skiff) - Admiral Kael - hostile');
  expect(line).not.toContain('\x1b');
});

test('get_nearby --plain leaves pirate names uncolored even with valid hex', () => {
  const stdout = renderStructuredResult(
    'get_nearby',
    nearbyWithPirateColors({ primary_color: pirateFg, secondary_color: pirateBg }),
    { ...options, plain: true },
    context,
  ).stdout.join('\n');
  const line = nearbyPirateLine(stdout, 'Raider');

  expect(line).toBe('  Raider (skiff) - Admiral Kael - hostile');
  expect(line).not.toContain('\x1b');
});

test('get_nearby colors boss pirate names after an uncolored Boss prefix', () => {
  const stdout = renderStructuredResult(
    'get_nearby',
    nearbyWithPirateColors({ primary_color: pirateFg, secondary_color: pirateBg }, nearbyBossFixture, 1),
    colorOptions,
    context,
  ).stdout.join('\n');
  const bossLine = nearbyPirateLine(stdout, 'Dreadnought');

  expect(bossLine).toBe(`  Boss ${hexColor('Dreadnought', pirateFg, pirateBg)} (battleship) - Admiral Kael - hostile`);
  expect(bossLine?.startsWith('  Boss \x1b')).toBe(true);
  expect(nearbyPirateLine(stdout, 'Raider')).toBe('  Raider (skiff) - Admiral Kael - hostile');
});

test('get_nearby prefixes Boss only on pirates with is_boss true', () => {
  const stdout = renderStructuredResult('get_nearby', structuredClone(nearbyBossFixture), options, context).stdout.join(
    '\n',
  );

  expect(stdout).toContain('Pirates (2):');
  expect(stdout).toContain('Raider (skiff) - Admiral Kael - hostile');
  expect(stdout).toContain('Boss Dreadnought (battleship) - Admiral Kael - hostile');
});

test('get_location lists nearby pirates with the get_nearby livery line', () => {
  const stdout = renderStructuredResult(
    'get_location',
    structuredClone(getLocationFixture),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Nearby Pirates (1):');
  expect(stdout).toContain('  Raider (skiff) - Admiral Kael - hostile');
  expect(stdout).not.toContain('Nearby Pirates: 1');
});

test('get_location colors pirate names with both crew hex colors', () => {
  const stdout = renderStructuredResult(
    'get_location',
    locationWithPirateColors({ primary_color: pirateFg, secondary_color: pirateBg }),
    colorOptions,
    context,
  ).stdout.join('\n');
  const line = nearbyPirateLine(stdout, 'Raider');

  expect(line).toBe(`  ${hexColor('Raider', pirateFg, pirateBg)} (skiff) - Admiral Kael - hostile`);
  expect(line).toContain('\x1b[38;2');
  expect(line).toContain('\x1b[48;2');
  expect(line?.endsWith('\x1b[0m (skiff) - Admiral Kael - hostile')).toBe(true);
});

test('get_location colors pirate names with primary color only', () => {
  const stdout = renderStructuredResult(
    'get_location',
    locationWithPirateColors({ primary_color: pirateFg }),
    colorOptions,
    context,
  ).stdout.join('\n');

  expect(nearbyPirateLine(stdout, 'Raider')).toBe(`  ${hexColor('Raider', pirateFg)} (skiff) - Admiral Kael - hostile`);
  expect(nearbyPirateLine(stdout, 'Raider')).toContain('\x1b[38;2');
  expect(nearbyPirateLine(stdout, 'Raider')).not.toContain('\x1b[48;2');
});

test('get_location colors pirate names with secondary color only', () => {
  const stdout = renderStructuredResult(
    'get_location',
    locationWithPirateColors({ secondary_color: pirateBg }),
    colorOptions,
    context,
  ).stdout.join('\n');

  expect(nearbyPirateLine(stdout, 'Raider')).toBe(
    `  ${hexColor('Raider', undefined, pirateBg)} (skiff) - Admiral Kael - hostile`,
  );
  expect(nearbyPirateLine(stdout, 'Raider')).toContain('\x1b[48;2');
  expect(nearbyPirateLine(stdout, 'Raider')).not.toContain('\x1b[38;2');
});

test('get_location leaves pirate names uncolored for invalid hex', () => {
  const stdout = renderStructuredResult(
    'get_location',
    locationWithPirateColors({ primary_color: 'red', secondary_color: '#fff' }),
    colorOptions,
    context,
  ).stdout.join('\n');
  const line = nearbyPirateLine(stdout, 'Raider');

  expect(line).toBe('  Raider (skiff) - Admiral Kael - hostile');
  expect(line).not.toContain('\x1b');
});

test('get_location colors only the valid pirate livery channel when mixed with invalid hex', () => {
  const stdout = renderStructuredResult(
    'get_location',
    locationWithPirateColors({ primary_color: pirateFg, secondary_color: 'red' }),
    colorOptions,
    context,
  ).stdout.join('\n');

  expect(nearbyPirateLine(stdout, 'Raider')).toBe(
    `  ${hexColor('Raider', pirateFg, 'red')} (skiff) - Admiral Kael - hostile`,
  );
});

test('get_location leaves pirate names uncolored when livery colors are missing', () => {
  const stdout = renderStructuredResult(
    'get_location',
    locationWithPirateColors({}),
    colorOptions,
    context,
  ).stdout.join('\n');
  const line = nearbyPirateLine(stdout, 'Raider');

  expect(line).toBe('  Raider (skiff) - Admiral Kael - hostile');
  expect(line).not.toContain('\x1b');
});

test('get_location --plain leaves pirate names uncolored even with valid hex', () => {
  const stdout = renderStructuredResult(
    'get_location',
    locationWithPirateColors({ primary_color: pirateFg, secondary_color: pirateBg }),
    { ...options, plain: true },
    context,
  ).stdout.join('\n');
  const line = nearbyPirateLine(stdout, 'Raider');

  expect(line).toBe('  Raider (skiff) - Admiral Kael - hostile');
  expect(line).not.toContain('\x1b');
});

test('get_location colors boss pirate names after an uncolored Boss prefix', () => {
  const fixture = locationBossFixture();
  fixture.location.nearby_pirates[1] = {
    ...fixture.location.nearby_pirates[1],
    primary_color: pirateFg,
    secondary_color: pirateBg,
  };
  const stdout = renderStructuredResult('get_location', fixture, colorOptions, context).stdout.join('\n');
  const bossLine = nearbyPirateLine(stdout, 'Dreadnought');

  expect(bossLine).toBe(`  Boss ${hexColor('Dreadnought', pirateFg, pirateBg)} (battleship) - Admiral Kael - hostile`);
  expect(bossLine?.startsWith('  Boss \x1b')).toBe(true);
  expect(nearbyPirateLine(stdout, 'Raider')).toBe('  Raider (skiff) - Admiral Kael - hostile');
});

test('get_location prefixes Boss only on pirates with is_boss true', () => {
  const stdout = renderStructuredResult('get_location', locationBossFixture(), options, context).stdout.join('\n');

  expect(stdout).toContain('Nearby Pirates (2):');
  expect(stdout).toContain('Raider (skiff) - Admiral Kael - hostile');
  expect(stdout).toContain('Boss Dreadnought (battleship) - Admiral Kael - hostile');
});

test('get_location omits the pirate section when count is 0', () => {
  const fixture = structuredClone(getLocationFixture) as {
    location: { nearby_pirate_count: number; nearby_pirates: unknown[] };
  };
  fixture.location.nearby_pirate_count = 0;
  fixture.location.nearby_pirates = [];
  const stdout = renderStructuredResult('get_location', fixture, options, context).stdout.join('\n');

  expect(stdout).not.toContain('Nearby Pirates');
});

test('get_location prints a pirate heading with no rows when count is set and the array is empty', () => {
  const fixture = structuredClone(getLocationFixture) as {
    location: { nearby_pirate_count: number; nearby_pirates: unknown[] };
  };
  fixture.location.nearby_pirate_count = 3;
  fixture.location.nearby_pirates = [];
  const stdout = renderStructuredResult('get_location', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Nearby Pirates (3):');
  expect(stdout).not.toContain('Raider');
  expect(stdout).toContain('... and 3 more');
});

test('get_location falls back to nearby_pirates.length when nearby_pirate_count is omitted', () => {
  const fixture = structuredClone(getLocationFixture) as { location: Record<string, unknown> };
  delete fixture.location.nearby_pirate_count;
  const stdout = renderStructuredResult('get_location', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Nearby Pirates (1):');
  expect(stdout).toContain('  Raider (skiff) - Admiral Kael - hostile');
});

test('get_location prints every pirate row when the count matches the array', () => {
  const fixture = structuredClone(getLocationFixture) as {
    location: { nearby_pirate_count: number; nearby_pirates: Array<Record<string, unknown>> };
  };
  fixture.location.nearby_pirate_count = 12;
  fixture.location.nearby_pirates = Array.from({ length: 12 }, (_, index) => ({
    name: `P${index + 1}`,
    tier: 'skiff',
  }));
  const stdout = renderStructuredResult('get_location', fixture, options, context).stdout.join('\n');
  const pirateLines = stdout.split('\n').filter((line) => /^ {2}P\d+ \(skiff\)$/.test(line));

  expect(stdout).toContain('Nearby Pirates (12):');
  expect(pirateLines).toHaveLength(12);
  expect(stdout).toContain('  P1 (skiff)');
  expect(stdout).toContain('  P11 (skiff)');
  expect(stdout).toContain('  P12 (skiff)');
  expect(stdout).not.toContain('... and');
});

test('get_location still overflows when count exceeds the cap and the array is already 10', () => {
  const fixture = structuredClone(getLocationFixture) as {
    location: { nearby_pirate_count: number; nearby_pirates: Array<Record<string, unknown>> };
  };
  fixture.location.nearby_pirate_count = 12;
  fixture.location.nearby_pirates = Array.from({ length: 10 }, (_, index) => ({
    name: `P${index + 1}`,
    tier: 'skiff',
  }));
  const stdout = renderStructuredResult('get_location', fixture, options, context).stdout.join('\n');
  const pirateLines = stdout.split('\n').filter((line) => /^ {2}P\d+ \(skiff\)$/.test(line));

  expect(stdout).toContain('Nearby Pirates (12):');
  expect(pirateLines).toHaveLength(10);
  expect(stdout).toContain('  P10 (skiff)');
  expect(stdout).not.toContain('P11');
  expect(stdout).not.toContain('P12');
  expect(stdout).toContain('  ... and 2 more');
});

test('get_location prints a remainder when count is 2 and the array has 1 pirate', () => {
  const fixture = structuredClone(getLocationFixture) as {
    location: { nearby_pirate_count: number };
  };
  fixture.location.nearby_pirate_count = 2;
  const stdout = renderStructuredResult('get_location', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Nearby Pirates (2):');
  expect(stdout).toContain('  Raider (skiff) - Admiral Kael - hostile');
  expect(stdout).toContain('... and 1 more');
});

test('get_location uses faction when faction_name is missing', () => {
  const fixture = structuredClone(getLocationFixture) as {
    location: { nearby_pirates: Array<Record<string, unknown>> };
  };
  const pirate = fixture.location.nearby_pirates[0];
  if (!pirate) throw new Error('expected nearby pirate');
  delete pirate.faction_name;
  const stdout = renderStructuredResult('get_location', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('  Raider (skiff) - pirate_kael - hostile');
});

test('get_nearby prints Arena NPCs after Pirates and before Empire NPCs', () => {
  const stdout = renderStructuredResult(
    'get_nearby',
    structuredClone(nearbyArenaFixture),
    options,
    context,
  ).stdout.join('\n');
  const pirates = stdout.indexOf('Pirates (1):');
  const arena = stdout.indexOf('Arena NPCs (2):');
  const empire = stdout.indexOf('Empire NPCs (1):');

  expect(pirates).toBeGreaterThan(-1);
  expect(arena).toBeGreaterThan(pirates);
  expect(empire).toBeGreaterThan(arena);
  expect(stdout).toContain('  (in-match only; cannot be attacked from outside — see: arena status)');
  expect(stdout).toContain(
    '  Ring Cleaver [arena-cleaver-1] (Fighter) - hull 180/180 - shield 60/60 - battle btl-first-blood - ready',
  );
  expect(stdout).toContain(
    '  Boss Trial Master [arena-master-1] (Dreadnought) - hull 900/900 - shield 300/300 - battle btl-first-blood - guarding',
  );
});

test('get_nearby colors boss arena NPC names after an uncolored Boss prefix', () => {
  const stdout = renderStructuredResult(
    'get_nearby',
    structuredClone(nearbyArenaFixture),
    colorOptions,
    context,
  ).stdout.join('\n');
  const bossLine = nearbyPirateLine(stdout, 'Trial Master');
  const regularLine = nearbyPirateLine(stdout, 'Ring Cleaver');

  expect(bossLine).toBe(
    `  Boss ${hexColor('Trial Master', '#8b1a3a', '#2a0a14')} [arena-master-1] (Dreadnought) - hull 900/900 - shield 300/300 - battle btl-first-blood - guarding`,
  );
  expect(bossLine?.startsWith('  Boss \x1b')).toBe(true);
  expect(regularLine).toBe(
    `  ${hexColor('Ring Cleaver', '#c45a2a', '#1a1a1a')} [arena-cleaver-1] (Fighter) - hull 180/180 - shield 60/60 - battle btl-first-blood - ready`,
  );
});

test('get_nearby --plain leaves arena NPC names uncolored even with valid hex', () => {
  const stdout = renderStructuredResult(
    'get_nearby',
    structuredClone(nearbyArenaFixture),
    { ...options, plain: true },
    context,
  ).stdout.join('\n');
  const bossLine = nearbyPirateLine(stdout, 'Trial Master');
  const regularLine = nearbyPirateLine(stdout, 'Ring Cleaver');

  expect(regularLine).toBe(
    '  Ring Cleaver [arena-cleaver-1] (Fighter) - hull 180/180 - shield 60/60 - battle btl-first-blood - ready',
  );
  expect(bossLine).toBe(
    '  Boss Trial Master [arena-master-1] (Dreadnought) - hull 900/900 - shield 300/300 - battle btl-first-blood - guarding',
  );
  expect(regularLine).not.toContain('\x1b');
  expect(bossLine).not.toContain('\x1b');
});

test('subscribe_observation omits Arena NPCs when arena fields are absent', () => {
  const stdout = renderStructuredResult(
    'subscribe_observation',
    structuredClone(subscribeObservationFixture),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).not.toContain('Arena NPCs');
});

test('subscribe_observation prints Arena NPCs after Pirates and before Empire NPCs', () => {
  expect(subscribeObservationArenaFixture).not.toHaveProperty('arena_npc_count');
  const stdout = renderStructuredResult(
    'subscribe_observation',
    structuredClone(subscribeObservationArenaFixture),
    options,
    context,
  ).stdout.join('\n');
  const pirates = stdout.indexOf('Pirates (1):');
  const arena = stdout.indexOf('Arena NPCs (2):');
  const empire = stdout.indexOf('Empire NPCs (1):');

  expect(pirates).toBeGreaterThan(-1);
  expect(arena).toBeGreaterThan(pirates);
  expect(empire).toBeGreaterThan(arena);
  expect(stdout).toContain('  (in-match only; cannot be attacked from outside — see: arena status)');
  expect(stdout).toContain(
    '  Ring Cleaver [arena-cleaver-1] (Fighter) - hull 180/180 - shield 60/60 - battle btl-first-blood - ready',
  );
  expect(stdout).toContain(
    '  Boss Trial Master [arena-master-1] (Dreadnought) - hull 900/900 - shield 300/300 - battle btl-first-blood - guarding',
  );
});

test('subscribe_observation prints Active scan: true', () => {
  const stdout = renderStructuredResult(
    'subscribe_observation',
    structuredClone(subscribeObservationFixture),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('=== Nearby ===\nActive scan: true\nUnknown cloaked signature detected. Run: scan');
});

test('subscribe_observation prints Active scan: false', () => {
  const fixture = structuredClone(subscribeObservationFixture) as Record<string, unknown>;
  fixture.active_scan = false;
  const stdout = renderStructuredResult('subscribe_observation', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Active scan: false');
  expect(stdout).not.toContain('Active scan: true');
});

test('subscribe_observation omits Active scan when the field is absent', () => {
  const fixture = structuredClone(subscribeObservationFixture) as Record<string, unknown>;
  delete fixture.active_scan;
  const stdout = renderStructuredResult('subscribe_observation', fixture, options, context).stdout.join('\n');

  expect(stdout).not.toContain('Active scan');
});

test('get_nearby stays silent when active_scan is planted true or false', () => {
  for (const active_scan of [true, false]) {
    const fixture = { ...structuredClone(nearbyFixture), active_scan };
    const stdout = renderStructuredResult('get_nearby', fixture, options, context).stdout.join('\n');

    expect(stdout).toContain('=== Nearby ===');
    expect(stdout).not.toContain('Active scan');
  }
});

test('get_nearby marks arena NPC runners after ship class only when flees is true', () => {
  const stdout = renderStructuredResult(
    'get_nearby',
    structuredClone(nearbyArenaFleesFixture),
    options,
    context,
  ).stdout.join('\n');
  const runner = nearbyPirateLine(stdout, 'Ring Runner');
  const fighter = nearbyPirateLine(stdout, 'Ring Cleaver');

  expect(runner).toBe(
    '  Ring Runner [arena-runner-1] (Fighter) - flees - hull 180/180 - shield 60/60 - battle btl-obj-escape - ready',
  );
  expect(fighter).toBe(
    '  Ring Cleaver [arena-cleaver-1] (Fighter) - hull 180/180 - shield 60/60 - battle btl-obj-escape - ready',
  );
  expect(fighter).not.toContain(' - flees');
});

test('get_nearby leaves the flees token uncolored after a colored arena NPC name', () => {
  const stdout = renderStructuredResult(
    'get_nearby',
    structuredClone(nearbyArenaFleesFixture),
    colorOptions,
    context,
  ).stdout.join('\n');
  const runner = nearbyPirateLine(stdout, 'Ring Runner');

  expect(runner).toBe(
    `  ${hexColor('Ring Runner', '#c45a2a', '#1a1a1a')} [arena-runner-1] (Fighter) - flees - hull 180/180 - shield 60/60 - battle btl-obj-escape - ready`,
  );
});

test('get_nearby falls back to arena_npcs length and prints every returned row', () => {
  const extra = Array.from({ length: 11 }, (_, index) => ({
    npc_id: `arena-extra-${index + 1}`,
    name: `Shard ${index + 1}`,
    primary_color: '#335577',
    secondary_color: '#88aacc',
    is_boss: false,
    flees: false,
    ship_class: 'fighter',
    ship_class_name: 'Fighter',
    hull: 10,
    max_hull: 10,
    shield: 0,
    max_shield: 0,
    battle_id: 'btl-swarm',
  }));
  const withoutCount = structuredClone(nearbyArenaFixture) as Record<string, unknown>;
  delete withoutCount.arena_npc_count;
  const stdout = renderStructuredResult(
    'get_nearby',
    { ...withoutCount, arena_npcs: extra },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Arena NPCs (11):');
  expect(stdout).toContain('  Shard 1 [arena-extra-1] (Fighter) - hull 10/10 - shield 0/0 - battle btl-swarm');
  expect(stdout).toContain('  Shard 10 [arena-extra-10] (Fighter) - hull 10/10 - shield 0/0 - battle btl-swarm');
  expect(stdout).toContain('Shard 11');
  expect(stdout).not.toContain('... and 1 more');
  expect(stdout).not.toContain('... and');
});

test('subscribe_observation prefixes Boss when a pirate is_boss is true', () => {
  const fixture = structuredClone(subscribeObservationFixture) as {
    pirates: Array<Record<string, unknown>>;
  };
  fixture.pirates[0] = { ...fixture.pirates[0], is_boss: true };
  const stdout = renderStructuredResult('subscribe_observation', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Boss Corsair (skiff) - Admiral Kael - hostile');
  expect(stdout).not.toContain('\n  Corsair (skiff)');
});

test('subscribe_observation prints prizes without prize_count', () => {
  const fixture = structuredClone(subscribeObservationFixture) as Record<string, unknown>;
  expect(fixture).not.toHaveProperty('prize_count');
  const stdout = renderStructuredResult('subscribe_observation', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('=== Nearby ===');
  assertCopyablePrizeIds(stdout, 'Prizes');
  expect(stdout).not.toContain('prize_count');
});

test('get_location prints nearby prizes after players and before pirate rows', () => {
  const stdout = renderStructuredResult(
    'get_location',
    structuredClone(getLocationFixture),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('=== Location ===');
  expect(stdout).not.toContain('=== Nearby ===');
  expect(stdout).not.toContain('Resources:');
  assertCopyablePrizeIds(stdout, 'Nearby Prizes');
  const playersIdx = stdout.indexOf('Nearby Players');
  const prizesIdx = stdout.indexOf('Nearby Prizes');
  const piratesIdx = stdout.indexOf('Nearby Pirates');
  expect(prizesIdx).toBeGreaterThan(playersIdx);
  expect(piratesIdx).toBeGreaterThan(prizesIdx);
});

test('get_location prints resources after ship combat effects and before nearby players', () => {
  const fixture = {
    ...structuredClone(getLocationResourcesFixture),
    ship: { burn_ticks_remaining: 3 },
  };
  const stdout = renderStructuredResult('get_location', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Docked at: earth_station');
  expect(stdout).toContain('Effects:');
  expect(stdout).toContain('Burn: 3 ticks');
  expect(stdout).toContain('Resources:');
  expect(stdout).toContain('- Iron Ore: richness 3, 750, supports power 12');
  expect(stdout).toContain('- Gold Ore: richness 1, 74, supports power 3, lock min 200, too sparse');
  const dockedIdx = stdout.indexOf('Docked at:');
  const effectsIdx = stdout.indexOf('Effects:');
  const resourcesIdx = stdout.indexOf('Resources:');
  const playersIdx = stdout.indexOf('Nearby Players');
  expect(effectsIdx).toBeGreaterThan(dockedIdx);
  expect(resourcesIdx).toBeGreaterThan(effectsIdx);
  expect(playersIdx).toBeGreaterThan(resourcesIdx);
});

test('get_location remaining -1 prints unlimited', () => {
  const stdout = renderStructuredResult(
    'get_location',
    {
      location: {
        system_id: 'sol',
        system_name: 'Sol',
        resources: [{ item_id: 'ore_iron', item_name: 'Iron Ore', richness: 3, remaining: -1 }],
      },
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('- Iron Ore: richness 3, unlimited');
  expect(stdout).not.toContain('-1');
});

test('get_location remaining 0 prints depleted without strikethrough', () => {
  const stdout = renderStructuredResult(
    'get_location',
    {
      location: {
        system_id: 'sol',
        system_name: 'Sol',
        resources: [{ item_id: 'ore_iron', item_name: 'Iron Ore', richness: 3, remaining: 0 }],
      },
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('- Iron Ore: richness 3, depleted');
  expect(stdout).not.toContain('\x1b[9m');
});

test('get_location empty resources array prints no Resources heading', () => {
  const stdout = renderStructuredResult(
    'get_location',
    {
      location: {
        system_id: 'sol',
        system_name: 'Sol',
        resources: [],
      },
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('=== Location ===');
  expect(stdout).not.toContain('Resources:');
});

test('get_location formats a jump in transit when identity fields are empty strings', () => {
  const stdout = renderStructuredResult(
    'get_location',
    {
      credits: 1781133,
      location: {
        connections: [],
        docked_at: null,
        empire: '',
        in_transit: true,
        poi_id: '',
        poi_name: '',
        poi_type: '',
        system_id: '',
        system_name: '',
        security_status: '',
        transit_arrival_tick: 1799077,
        transit_dest_system_id: 'antares',
        transit_dest_system_name: 'Antares',
        transit_type: 'jump',
      },
      message: 'Current location',
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('=== Location ===');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).toContain('Credits: 1,781,133');
  expect(stdout).toContain('Transit: jump → Antares (antares)');
  expect(stdout).toContain('Arrival tick: 1799077');
  expect(stdout).not.toContain('System:');
  expect(stdout).not.toContain('POI:');
});

test('get_location prints travel transit alongside the current system', () => {
  const stdout = renderStructuredResult(
    'get_location',
    {
      location: {
        system_id: 'sol',
        system_name: 'Sol',
        empire: 'Terran',
        in_transit: true,
        poi_id: '',
        poi_name: '',
        poi_type: '',
        transit_arrival_tick: 42,
        transit_dest_poi_id: 'sol-station',
        transit_dest_poi_name: 'Sol Station',
        transit_type: 'travel',
      },
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('=== Location ===');
  expect(stdout).toContain('System: Sol (sol)');
  expect(stdout).toContain('Transit: travel → Sol Station (sol-station)');
  expect(stdout).toContain('Arrival tick: 42');
});

test('get_location prints pathfinder drift details', () => {
  const stdout = renderStructuredResult(
    'get_location',
    {
      location: {
        system_id: '',
        system_name: '',
        poi_id: '',
        poi_name: '',
        in_transit: true,
        transit_type: 'pathfinder',
        transit_bearing: 270,
        transit_x: 12.5,
        transit_y: -3,
        transit_ticks_elapsed: 17,
        void_message: 'Stars thin out behind you.',
      },
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('=== Location ===');
  expect(stdout).toContain('Transit: pathfinder');
  expect(stdout).toContain('Bearing: 270°');
  expect(stdout).toContain('Position: 12.5, -3');
  expect(stdout).toContain('Ticks elapsed: 17');
  expect(stdout).toContain('Stars thin out behind you.');
});

test('get_status and get_state print location.nearby_prizes', () => {
  for (const command of ['get_status', 'get_state'] as const) {
    const stdout = renderStructuredResult(command, structuredClone(getStatusFixture), options, context).stdout.join(
      '\n',
    );
    expect(stdout).toContain('=== Player Status ===');
    assertCopyablePrizeIds(stdout, 'Nearby Prizes');
    expect(stdout).toContain('Nearby Players:');
  }
});

test('get_status falls back to top-level nearby_prizes when location omits them', () => {
  const fixture = structuredClone(getStatusFixture) as {
    location: Record<string, unknown>;
    nearby_prizes?: unknown;
    nearby_prize_count?: unknown;
  };
  delete fixture.location.nearby_prizes;
  delete fixture.location.nearby_prize_count;
  fixture.nearby_prizes = [
    {
      prize_id: 'prize-hoisted-1',
      actor_id: 'actor-hoisted-1',
      ship_class: 'hauler',
      status: 'available',
      hull: 12,
      max_hull: 20,
    },
  ];
  fixture.nearby_prize_count = 1;

  const stdout = renderStructuredResult('get_status', fixture, options, context).stdout.join('\n');
  expect(stdout).toContain('Nearby Prizes (1):');
  expect(stdout).toContain('prize-hoisted-1');
  expect(stdout).toContain('actor-hoisted-1');
});

test('nearby prize sections are omitted when count is 0 and the array is empty', () => {
  const nearbyEmpty = renderStructuredResult(
    'get_nearby',
    { nearby: [], prizes: [], prize_count: 0 },
    options,
    context,
  ).stdout.join('\n');
  const observationEmpty = renderStructuredResult(
    'subscribe_observation',
    { nearby: [], prizes: [] },
    options,
    context,
  ).stdout.join('\n');
  const locationEmpty = renderStructuredResult(
    'get_location',
    {
      location: {
        system_id: 'sol',
        system_name: 'Sol',
        nearby_prizes: [],
        nearby_prize_count: 0,
      },
    },
    options,
    context,
  ).stdout.join('\n');
  const statusEmpty = structuredClone(getStatusFixture) as { location: Record<string, unknown> };
  statusEmpty.location.nearby_prizes = [];
  statusEmpty.location.nearby_prize_count = 0;
  const statusOut = renderStructuredResult('get_status', statusEmpty, options, context).stdout.join('\n');

  for (const stdout of [nearbyEmpty, observationEmpty, locationEmpty, statusOut]) {
    expect(stdout).not.toContain('Prizes (0):');
    expect(stdout).not.toContain('Nearby Prizes (0):');
    expect(stdout).not.toContain('(none)');
    expect(stdout).not.toContain('(None)');
  }
});

test('nearby prizes omit gated columns and never print personnel even when present on PrizeInfo', () => {
  const stdout = renderStructuredResult(
    'get_nearby',
    {
      nearby: [],
      prizes: [
        {
          prize_id: 'prize-bare-1',
          actor_id: 'actor-bare-1',
          ship_class: 'scout',
          status: 'available',
          hull: 8,
          max_hull: 10,
          fit_crew: 4,
          fit_marines: 2,
          injured_crew: 1,
          prize_crew_fit: 3,
          crew_disposition: 'aboard',
        },
      ],
      prize_count: 1,
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('prize-bare-1');
  expect(stdout).toContain('actor-bare-1');
  expect(stdout).toContain('Prize ID');
  expect(stdout).toContain('Actor');
  expect(stdout).not.toContain('Name');
  expect(stdout).not.toContain('Wait');
  expect(stdout).not.toContain('Shield');
  expect(stdout).not.toContain('Combat');
  for (const field of personnelLeak) {
    expect(stdout).not.toContain(field);
  }
});

test('nearby prizes print Wait when wait_reason is present', () => {
  const stdout = renderStructuredResult(
    'get_nearby',
    {
      nearby: [],
      prizes: [
        {
          prize_id: 'prize-stall-1',
          actor_id: 'actor-stall-1',
          ship_class: 'frigate',
          status: 'in_transit',
          wait_reason: 'no_fuel',
        },
      ],
      prize_count: 1,
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Prizes (1):');
  expect(stdout).toContain('Wait');
  expect(stdout).toContain('no_fuel');
  expect(stdout).toContain('prize-stall-1');
  expect(stdout).toContain('in_transit');
  expect(stdout).not.toContain('Prize recoveries');
});

test('nearby prize Combat is yes when in_combat is true and blank when false', () => {
  const stdout = renderStructuredResult(
    'get_nearby',
    {
      nearby: [],
      prizes: [
        {
          prize_id: 'prize-fight-1',
          actor_id: 'actor-fight-1',
          ship_class: 'frigate',
          status: 'available',
          in_combat: true,
        },
        {
          prize_id: 'prize-idle-1',
          actor_id: 'actor-idle-1',
          ship_class: 'frigate',
          status: 'available',
          in_combat: false,
        },
      ],
      prize_count: 2,
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Combat');
  expect(stdout).toContain('yes');
  expect(stdout).not.toContain('true');
  expect(stdout).not.toContain('false');
});

test('nearby prizes cap rows at 10 and print a remainder footer', () => {
  const prizes = Array.from({ length: 12 }, (_, index) => ({
    prize_id: `prize-${index + 1}`,
    actor_id: `actor-${index + 1}`,
    ship_class: 'frigate',
    status: 'available',
  }));
  const stdout = renderStructuredResult(
    'get_nearby',
    { nearby: [], prizes, prize_count: 12 },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Prizes (12):');
  expect(stdout).toContain('prize-10');
  expect(stdout).not.toContain('prize-11');
  expect(stdout).toContain('... and 2 more');
});

test('get_nearby still declines when location is an object so get_location keeps the location formatter', () => {
  const stdout = renderStructuredResult(
    'get_nearby',
    structuredClone(getLocationFixture),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('=== Location ===');
  expect(stdout).not.toContain('=== Nearby ===');
  assertCopyablePrizeIds(stdout, 'Nearby Prizes');
});

test('get_status flags each over-capacity ratio independently', () => {
  const stdout = renderStructuredResult(
    'get_status',
    structuredClone(getStatusOverCapacityFixture),
    options,
    context,
  ).stdout.join('\n');
  expect(stdout).toContain('  Cargo: 80/60 (over capacity)');
  expect(stdout).toContain('  CPU: 22/20 (over capacity)');
  expect(stdout).toContain('  Power: 30/25 (over capacity)');
});

test('get_status flags only the over-capacity CPU line', () => {
  const fixture = { ...getStatusFixture, ship: { ...getStatusFixture.ship, cpu_used: 22 } };
  const stdout = renderStructuredResult('get_status', fixture, options, context).stdout.join('\n');
  expect(stdout).toContain('  CPU: 22/20 (over capacity)');
  expect(stdout).toContain('  Cargo: 12/60');
  expect(stdout).toContain('  Power: 10/25');
  expect(stdout).not.toContain('  Cargo: 12/60 (over capacity)');
  expect(stdout).not.toContain('  Power: 10/25 (over capacity)');
});

test('get_status_summary stays compact without over-capacity ratio lines', () => {
  const stdout = renderStructuredResult(
    'get_status_summary',
    structuredClone(getStatusOverCapacityFixture),
    options,
    context,
  ).stdout.join('\n');
  expect(stdout).not.toContain('CPU:');
  expect(stdout).not.toContain('Power:');
  expect(stdout).not.toContain('Cargo:');
  expect(stdout).not.toContain('(over capacity)');
});

test('get_status prints personnel after Power and prize recoveries after nearby prizes', () => {
  const stdout = renderStructuredResult('get_status', structuredClone(getStatusFixture), options, context).stdout.join(
    '\n',
  );

  expect(stdout).not.toContain('Resources:');
  expect(stdout).toContain('  Crew: 4/6 fit (min 3)');
  expect(stdout).toContain('  Marines: 2/4 fit');
  expect(stdout).toContain('  Efficiency: 67%');
  expect(stdout).toContain('  Operational speed: 8');
  expect(stdout).not.toContain('injured');
  expect(stdout).not.toContain('INCAPACITATED');
  expect(stdout).toContain('Prize recoveries');
  expect(stdout).toContain('prize-recover-1');
  expect(stdout).toContain('earth_station');
  expect(stdout).toContain('Captured Lark (frigate)');
  expect(stdout).toContain('3 aboard');
  expect(stdout).toContain('jump sol → alpha_centauri');
  expect(stdout).not.toContain('return_crew_faction_id');
  expect(stdout).not.toContain('other_faction');
  expect(stdout).not.toContain('undefined');
  const powerIdx = stdout.indexOf('Power:');
  const crewIdx = stdout.indexOf('Crew:');
  const nearbyIdx = stdout.indexOf('Nearby Prizes');
  const recoveriesIdx = stdout.indexOf('Prize recoveries');
  expect(crewIdx).toBeGreaterThan(powerIdx);
  expect(recoveriesIdx).toBeGreaterThan(nearbyIdx);
});

test('get_status prints location.resources as indented bullets under Location', () => {
  const stdout = renderStructuredResult(
    'get_status',
    structuredClone(getStatusResourcesFixture),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Location:');
  expect(stdout).toContain('  Resources:');
  expect(stdout).toContain('    - Iron Ore: richness 3, 750, supports power 12');
  expect(stdout).toContain('    - Gold Ore: richness 1, 74, supports power 3, lock min 200, too sparse');
});

test('get_status inserts resources after cloak and before unknown-signature and towing', () => {
  const fixture = structuredClone(getStatusResourcesFixture) as {
    player: Record<string, unknown>;
    location: Record<string, unknown>;
  };
  fixture.player.is_cloaked = true;
  fixture.player.towing_wreck_id = 'wreck-1';
  fixture.location.unknown_signature = true;
  const stdout = renderStructuredResult('get_status', fixture, options, context).stdout.join('\n');

  const dockedIdx = stdout.indexOf('Docked:');
  const cloakedIdx = stdout.indexOf('[CLOAKED]');
  const resourcesIdx = stdout.indexOf('Resources:');
  const unknownIdx = stdout.indexOf('Unknown cloaked signature');
  const towingIdx = stdout.indexOf('Towing wreck');
  const shipIdx = stdout.indexOf('Ship:');
  const nearbyIdx = stdout.indexOf('Nearby Players');
  const prizesIdx = stdout.indexOf('Nearby Prizes');
  expect(cloakedIdx).toBeGreaterThan(dockedIdx);
  expect(resourcesIdx).toBeGreaterThan(cloakedIdx);
  expect(unknownIdx).toBeGreaterThan(resourcesIdx);
  expect(towingIdx).toBeGreaterThan(unknownIdx);
  expect(shipIdx).toBeGreaterThan(towingIdx);
  expect(nearbyIdx).toBeGreaterThan(shipIdx);
  expect(prizesIdx).toBeGreaterThan(nearbyIdx);
});

test('get_state prints location.resources with the status formatter', () => {
  const stdout = renderStructuredResult(
    'get_state',
    structuredClone(getStatusResourcesFixture),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('=== Player Status ===');
  expect(stdout).toContain('    - Iron Ore: richness 3, 750, supports power 12');
  expect(stdout).toContain('    - Gold Ore: richness 1, 74, supports power 3, lock min 200, too sparse');
  expect(stdout).not.toContain('=== Response ===');
});

test('get_status empty resources array prints no Resources heading', () => {
  const fixture = structuredClone(getStatusResourcesFixture) as {
    location: { resources: unknown[] };
  };
  fixture.location.resources = [];
  const stdout = renderStructuredResult('get_status', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Location:');
  expect(stdout).not.toContain('Resources:');
});

test('get_status remaining -1 prints unlimited', () => {
  const stdout = renderStructuredResult(
    'get_status',
    {
      player: { username: 'Marlowe', empire: 'Terran', credits: 100 },
      location: {
        system_id: 'sol',
        system_name: 'Sol',
        resources: [{ item_id: 'ore_iron', item_name: 'Iron Ore', richness: 3, remaining: -1 }],
      },
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('- Iron Ore: richness 3, unlimited');
  expect(stdout).not.toContain('-1');
});

test('get_status remaining 0 prints depleted without strikethrough', () => {
  const stdout = renderStructuredResult(
    'get_status',
    {
      player: { username: 'Marlowe', empire: 'Terran', credits: 100 },
      location: {
        system_id: 'sol',
        system_name: 'Sol',
        resources: [{ item_id: 'ore_iron', item_name: 'Iron Ore', richness: 3, remaining: 0 }],
      },
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('- Iron Ore: richness 3, depleted');
  expect(stdout).not.toContain('\x1b[9m');
});

test('get_status too_sparse false does not print too sparse', () => {
  const fixture = structuredClone(getStatusResourcesFixture) as {
    location: { resources: Array<Record<string, unknown>> };
  };
  fixture.location.resources = [
    {
      item_id: 'ore_iron',
      item_name: 'Iron Ore',
      richness: 3,
      remaining: 750,
      supported_power: 12,
      too_sparse: false,
    },
  ];
  const stdout = renderStructuredResult('get_status', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('supports power 12');
  expect(stdout).not.toContain('too sparse');
});

test('get_status_summary with location.resources stays compact without resource lines', () => {
  const stdout = renderStructuredResult(
    'get_status_summary',
    structuredClone(getStatusResourcesFixture),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Player:');
  expect(stdout).toContain('Credits:');
  expect(stdout).toContain('System:');
  expect(stdout).not.toContain('Resources:');
  expect(stdout).not.toContain('too sparse');
  expect(stdout).not.toContain('lock min');
});

test('get_status indents INCAPACITATED in the personnel block before combat effects', () => {
  const fixture = structuredClone(getStatusFixture) as { ship: Record<string, unknown> };
  fixture.ship.incapacitated = true;
  fixture.ship.personnel = {
    ...(fixture.ship.personnel as Record<string, unknown>),
    fit_crew: 0,
  };
  const stdout = renderStructuredResult('get_status', fixture, options, context).stdout.join('\n');
  expect(stdout).toContain('  INCAPACITATED: no fit crew — ship operations unavailable');
  expect(stdout).not.toMatch(/^INCAPACITATED:/m);
  const powerIdx = stdout.indexOf('  Power:');
  const warningIdx = stdout.indexOf('  INCAPACITATED:');
  const nearbyIdx = stdout.indexOf('Nearby Players:');
  const podIdx = stdout.indexOf('WARNING: You are in an Escape Pod!');
  expect(warningIdx).toBeGreaterThan(powerIdx);
  expect(nearbyIdx).toBeGreaterThan(warningIdx);
  expect(podIdx).toBe(-1);
});

test('get_status omits personnel when the ship has no personnel object or scalars', () => {
  const fixture = structuredClone(getStatusFixture) as { ship: Record<string, unknown> };
  delete fixture.ship.personnel;
  delete fixture.ship.effective_crew_capacity;
  delete fixture.ship.effective_marine_capacity;
  delete fixture.ship.minimum_crew;
  delete fixture.ship.crew_efficiency;
  delete fixture.ship.operational_speed;
  delete fixture.ship.incapacitated;
  const stdout = renderStructuredResult('get_status', fixture, options, context).stdout.join('\n');
  expect(stdout).not.toContain('Crew:');
  expect(stdout).not.toContain('Marines:');
  expect(stdout).not.toContain('Efficiency:');
  expect(stdout).not.toContain('Operational speed:');
});

test('get_status omits prize recoveries when the array is absent or empty', () => {
  const absent = structuredClone(getStatusFixture) as { prize_recoveries?: unknown };
  delete absent.prize_recoveries;
  const empty = structuredClone(getStatusFixture) as { prize_recoveries?: unknown };
  empty.prize_recoveries = [];
  for (const fixture of [absent, empty]) {
    const stdout = renderStructuredResult('get_status', fixture, options, context).stdout.join('\n');
    expect(stdout).not.toContain('Prize recoveries');
    expect(stdout).not.toContain('prize-recover-1');
  }
});

test('prize recovery transit prefers POI ids for travel and systems when kind is omitted', () => {
  const travel = structuredClone(getStatusFixture) as { prize_recoveries: Array<Record<string, unknown>> };
  travel.prize_recoveries = [
    {
      prize_id: 'prize-travel-1',
      ship_class: 'hauler',
      status: 'in_transit',
      destination_base_id: 'earth_station',
      prize_crew_fit: 0,
      crew_disposition: 'faction_reserve',
      transit_kind: 'travel',
      transit_from_system_id: 'sol',
      transit_to_system_id: 'alpha_centauri',
      transit_from_poi_id: 'sol_earth',
      transit_to_poi_id: 'ac_station',
    },
  ];
  const omittedKind = structuredClone(getStatusFixture) as { prize_recoveries: Array<Record<string, unknown>> };
  omittedKind.prize_recoveries = [
    {
      prize_id: 'prize-kindless-1',
      ship_class: 'scout',
      status: 'in_transit',
      destination_base_id: 'earth_station',
      crew_disposition: 'aboard',
      transit_from_system_id: 'sol',
      transit_to_system_id: 'alpha_centauri',
      transit_from_poi_id: 'sol_earth',
      transit_to_poi_id: 'ac_station',
    },
  ];
  const parked = structuredClone(getStatusFixture) as { prize_recoveries: Array<Record<string, unknown>> };
  parked.prize_recoveries = [
    {
      prize_id: 'prize-parked-1',
      ship_class: 'frigate',
      status: 'claimed',
      destination_base_id: 'earth_station',
      prize_crew_fit: 3,
      system_id: 'sol',
      poi_id: 'earth_station',
    },
  ];
  // pathfinder is not in the OpenAPI transit_kind enum; keep as unknown-kind fail-open.
  const pathfinder = structuredClone(getStatusFixture) as { prize_recoveries: Array<Record<string, unknown>> };
  pathfinder.prize_recoveries = [
    {
      prize_id: 'prize-path-1',
      ship_class: 'scout',
      status: 'in_transit',
      destination_base_id: 'earth_station',
      transit_kind: 'pathfinder',
      transit_from_system_id: 'sol',
      transit_to_system_id: 'alpha_centauri',
      transit_from_poi_id: 'sol_earth',
      transit_to_poi_id: 'ac_station',
    },
  ];
  const kindTo = structuredClone(getStatusFixture) as { prize_recoveries: Array<Record<string, unknown>> };
  kindTo.prize_recoveries = [
    {
      prize_id: 'prize-kind-to-1',
      ship_class: 'scout',
      status: 'in_transit',
      destination_base_id: 'earth_station',
      transit_kind: 'jump',
      transit_to_system_id: 'alpha_centauri',
    },
  ];

  const travelOut = renderStructuredResult('get_status', travel, options, context).stdout.join('\n');
  expect(travelOut).toContain('travel sol_earth → ac_station');
  expect(travelOut).toContain('0 faction_reserve');
  expect(travelOut).toContain('prize-travel-1');
  expect(travelOut).toContain('earth_station');

  const omittedOut = renderStructuredResult('get_status', omittedKind, options, context).stdout.join('\n');
  expect(omittedOut).toContain('sol → alpha_centauri');
  expect(omittedOut).toContain('aboard');
  expect(omittedOut).toContain('in_transit');
  expect(omittedOut).not.toContain('undefined');

  const parkedOut = renderStructuredResult('get_status', parked, options, context).stdout.join('\n');
  expect(parkedOut).toContain('sol / earth_station');
  expect(parkedOut).toContain('claimed');
  expect(parkedOut).toContain('3');

  const pathfinderOut = renderStructuredResult('get_status', pathfinder, options, context).stdout.join('\n');
  expect(pathfinderOut).toContain('pathfinder sol → alpha_centauri');

  const kindToOut = renderStructuredResult('get_status', kindTo, options, context).stdout.join('\n');
  expect(kindToOut).toContain('jump → alpha_centauri');
});

test('get_status_summary prints Crew occupancy and omits it without personnel or when riding', () => {
  const withCrew = renderStructuredResult(
    'get_status_summary',
    structuredClone(getStatusFixture),
    options,
    context,
  ).stdout.join('\n');
  expect(withCrew).toContain('Crew:');
  expect(withCrew).toContain('4/6');
  expect(withCrew).not.toContain('Marines:');
  expect(withCrew).not.toContain('INCAPACITATED');
  expect(withCrew).not.toContain('injured');

  const withoutPersonnel = structuredClone(getStatusFixture) as { ship: Record<string, unknown> };
  delete withoutPersonnel.ship.personnel;
  const omitted = renderStructuredResult('get_status_summary', withoutPersonnel, options, context).stdout.join('\n');
  expect(omitted).not.toContain('Crew:');

  const riding = structuredClone(getStatusFixture) as { riding?: Record<string, unknown> };
  riding.riding = { carrier: 'Ibis', ship_id: 'ship-ibis-1' };
  const ridingOut = renderStructuredResult('get_status_summary', riding, options, context).stdout.join('\n');
  expect(ridingOut).not.toContain('Crew:');
  expect(ridingOut).toContain('passenger on Ibis');
});

test('get_status_summary still prints Crew 0/6 when incapacitated', () => {
  const fixture = structuredClone(getStatusFixture) as { ship: Record<string, unknown> };
  fixture.ship.personnel = {
    ...(fixture.ship.personnel as Record<string, unknown>),
    fit_crew: 0,
  };
  fixture.ship.incapacitated = true;
  const stdout = renderStructuredResult('get_status_summary', fixture, options, context).stdout.join('\n');
  expect(stdout).toContain('Crew:');
  expect(stdout).toContain('0/6');
  expect(stdout).not.toContain('INCAPACITATED');
});

test('get_map system detail prints labeled chart fields including Description', () => {
  const rendered = renderStructuredResult('get_map', structuredClone(getMapSystemFixture), options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(rendered.stderr).toEqual([]);
  expect(stdout).toContain('=== System: Veiled Reach ===');
  expect(stdout).toContain('ID: veiled_reach');
  expect(stdout).toContain('Empire: None');
  expect(stdout).toContain('Online: 0');
  expect(stdout).toContain('POIs: 1');
  expect(stdout).toContain('Position: (120.5, -44)');
  expect(stdout).toContain('Visited: false');
  expect(stdout).toContain('Visited at: 2026-01-01T00:00:00Z');
  expect(stdout).toContain(
    'Description: No star lights this waypoint, but the dust lane still feeds three jump beacons, so navigators keep it on the chart.',
  );
  expect(stdout).toContain('Connections:');
  expect(stdout).toContain('  - sol');
  expect(stdout).toContain('  - barnards_star');
  expect(stdout).not.toContain('Stronghold');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('NaN');
  expect(stdout).not.toContain('undefined');
  expect(stdout).not.toContain('[object Object]');
});

test('get_map system detail omits Description when missing or whitespace-only', () => {
  const withoutDescription = structuredClone(getMapSystemFixture) as { description?: string };
  delete withoutDescription.description;
  const whitespaceOnly = { ...getMapSystemFixture, description: '   \n\t  ' };

  for (const fixture of [withoutDescription, whitespaceOnly]) {
    const stdout = renderStructuredResult('get_map', fixture, options, context).stdout.join('\n');
    expect(stdout).toContain('=== System: Veiled Reach ===');
    expect(stdout).not.toContain('Description:');
    expect(stdout).not.toContain('=== Response ===');
  }
});

test('get_map system detail prints Stronghold only when is_stronghold is true', () => {
  const stronghold = renderStructuredResult(
    'get_map',
    { ...getMapSystemFixture, is_stronghold: true },
    options,
    context,
  ).stdout.join('\n');
  const notStronghold = renderStructuredResult(
    'get_map',
    { ...getMapSystemFixture, is_stronghold: false },
    options,
    context,
  ).stdout.join('\n');

  expect(stronghold).toContain('Stronghold: yes');
  expect(notStronghold).not.toContain('Stronghold');
});

test('get_map system detail omits Connections when the array is empty', () => {
  const stdout = renderStructuredResult(
    'get_map',
    { ...getMapSystemFixture, connections: [] },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('=== System: Veiled Reach ===');
  expect(stdout).not.toContain('Connections:');
  expect(stdout).not.toContain('=== Response ===');
});

test('get_map unknown shape falls back to raw response', () => {
  const stdout = renderStructuredResult('get_map', { name: 'Sol' }, options, context).stdout.join('\n');

  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('=== System:');
});

test('get_map list without descriptions stays a Name/System ID table', () => {
  const stdout = renderStructuredResult('get_map', structuredClone(getMapFixture), options, context).stdout.join('\n');

  expect(stdout).toContain('=== Systems ===');
  expect(stdout).toContain('Sol');
  expect(stdout).toContain('alpha_centauri');
  expect(stdout).toContain('total 2');
  expect(stdout).not.toContain('Chart descriptions');
  expect(stdout).not.toContain('Description:');
  expect(stdout).not.toContain('=== Response ===');
});

test('get_map list with mixed descriptions prints a Chart descriptions table', () => {
  const stdout = renderStructuredResult(
    'get_map',
    structuredClone(getMapStarlessFixture),
    options,
    context,
  ).stdout.join('\n');
  const systemsSection = stdout.slice(0, stdout.indexOf('=== Chart descriptions ==='));
  const chartSection = stdout.slice(stdout.indexOf('=== Chart descriptions ==='));

  expect(stdout).toContain('=== Systems ===');
  expect(systemsSection).toContain('Sol');
  expect(systemsSection).toContain('Veiled Reach');
  expect(systemsSection).toContain('veiled_reach');
  expect(systemsSection).toContain('total 2');
  expect(systemsSection).not.toContain('Description');
  expect(stdout).toContain('=== Chart descriptions ===');
  expect(chartSection).toContain('Veiled Reach');
  expect(chartSection).toContain('veiled_reach');
  expect(chartSection).toContain('Description');
  expect(chartSection).toContain('No star lights this waypoint');
  expect(chartSection).not.toContain('sol');
  expect(stdout).not.toContain('=== Response ===');
});

test('get_map list with all-blank descriptions omits the Chart descriptions table', () => {
  const stdout = renderStructuredResult(
    'get_map',
    {
      systems: [
        { system_id: 'sol', name: 'Sol', description: '' },
        { system_id: 'alpha_centauri', name: 'Alpha Centauri', description: '   \n\t  ' },
      ],
      total_count: 2,
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('=== Systems ===');
  expect(stdout).toContain('total 2');
  expect(stdout).not.toContain('Chart descriptions');
  expect(stdout).not.toContain('Description');
  expect(stdout).not.toContain('=== Response ===');
});

test('get_map list ignores empty-string and whitespace descriptions when filtering chart rows', () => {
  const stdout = renderStructuredResult(
    'get_map',
    {
      systems: [
        { system_id: 'sol', name: 'Sol', description: '' },
        { system_id: 'blank_lane', name: 'Blank Lane', description: '   ' },
        {
          system_id: 'veiled_reach',
          name: 'Veiled Reach',
          description:
            'No star lights this waypoint, but the dust lane still feeds three jump beacons, so navigators keep it on the chart.',
        },
      ],
      total_count: 3,
    },
    options,
    context,
  ).stdout.join('\n');
  const chartSection = stdout.slice(stdout.indexOf('=== Chart descriptions ==='));

  expect(stdout).toContain('=== Systems ===');
  expect(stdout).toContain('Blank Lane');
  expect(stdout).toContain('total 3');
  expect(stdout).toContain('=== Chart descriptions ===');
  expect(chartSection).toContain('Veiled Reach');
  expect(chartSection).not.toContain('sol');
  expect(chartSection).not.toContain('Blank Lane');
  expect(stdout).not.toContain('=== Response ===');
});

function withPoiClass(fixture: typeof systemInfoFixture, value: unknown | undefined) {
  const next = structuredClone(fixture);
  const poi = next.system.pois[0] as Record<string, unknown>;
  if (value === undefined) {
    delete poi.class;
    delete (next.poi as Record<string, unknown>).class;
  } else {
    poi.class = value;
    (next.poi as Record<string, unknown>).class = value;
  }
  return next;
}

test('get_system prints class on list and Current POI', () => {
  const stdout = renderStructuredResult('get_system', structuredClone(systemInfoFixture), options, context).stdout.join(
    '\n',
  );

  expect(stdout).toContain('Earth (planet) [garden] [station]  sol_earth');
  expect(stdout).toContain('Current POI: Earth (planet) [garden]  sol_earth');
  expect(stdout).not.toContain('(2 online)');
  expect(stdout).not.toContain(' online)');
  expect(stdout).not.toContain('=== Response ===');
});

test('get_system omits class when missing', () => {
  const stdout = renderStructuredResult(
    'get_system',
    withPoiClass(systemInfoFixture, undefined),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Earth (planet) [station]  sol_earth');
  expect(stdout).not.toContain('[garden]');
  expect(stdout).toContain('Current POI: Earth (planet)  sol_earth');
  expect(stdout).not.toContain('=== Response ===');
});

test('get_system omits class when empty or whitespace-only', () => {
  for (const value of ['', '  \n\t']) {
    const stdout = renderStructuredResult(
      'get_system',
      withPoiClass(systemInfoFixture, value),
      options,
      context,
    ).stdout.join('\n');

    expect(stdout).toContain('Earth (planet) [station]  sol_earth');
    expect(stdout).not.toContain('[]');
    expect(stdout).not.toContain('[garden]');
    expect(stdout).toContain('Current POI: Earth (planet)  sol_earth');
    expect(stdout).not.toContain('=== Response ===');
  }
});

test('get_system prints unknown class tokens', () => {
  const stdout = renderStructuredResult(
    'get_system',
    withPoiClass(systemInfoFixture, 'black_hole_v2'),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Earth (planet) [black_hole_v2] [station]  sol_earth');
  expect(stdout).toContain('Current POI: Earth (planet) [black_hole_v2]');
  expect(stdout).not.toContain('=== Response ===');
});

test('get_system omits non-string class', () => {
  const stdout = renderStructuredResult('get_system', withPoiClass(systemInfoFixture, 1), options, context).stdout.join(
    '\n',
  );

  expect(stdout).toContain('Earth (planet) [station]  sol_earth');
  expect(stdout).not.toContain('[1]');
  expect(stdout).toContain('Current POI: Earth (planet)  sol_earth');
  expect(stdout).not.toContain('[1]');
  expect(stdout).not.toContain('=== Response ===');
});

test('get_system prints class on the list when Current POI omits it', () => {
  const fixture = structuredClone(systemInfoFixture);
  delete (fixture.poi as Record<string, unknown>).class;
  const stdout = renderStructuredResult('get_system', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Earth (planet) [garden] [station]  sol_earth');
  expect(stdout).toContain('Current POI: Earth (planet)  sol_earth');
  expect(stdout).not.toMatch(/Current POI:.*\[garden\]/);
  expect(stdout).not.toContain('=== Response ===');
});

test('get_system prints class on Current POI when the list omits it', () => {
  const fixture = structuredClone(systemInfoFixture);
  delete (fixture.system.pois[0] as Record<string, unknown>).class;
  const stdout = renderStructuredResult('get_system', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Earth (planet) [station]  sol_earth');
  expect(stdout).not.toMatch(/- Earth \(planet\) \[garden\]/);
  expect(stdout).toContain('Current POI: Earth (planet) [garden]');
  expect(stdout).not.toContain('=== Response ===');
});

test('get_system string-only pois stay unchanged', () => {
  const fixture = structuredClone(systemInfoFixture);
  (fixture.system as { pois: unknown }).pois = ['sol_earth'];
  const rendered = renderStructuredResult('get_system', fixture, options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('  - sol_earth');
  expect(stdout).toContain('Current POI: Earth (planet) [garden]');
  expect(stdout).not.toContain('=== Response ===');
});

test('get_system prints class without station when has_base is false', () => {
  const star = { id: 'sol', name: 'Sol', type: 'star', class: 'G2V', has_base: false, online: 0 };
  const fixture = structuredClone(systemInfoFixture);
  (fixture.system as { pois: unknown }).pois = [star];
  (fixture as { poi: unknown }).poi = star;
  const stdout = renderStructuredResult('get_system', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Sol (star) [G2V]  sol');
  expect(stdout).not.toContain('[station]');
  expect(stdout).not.toContain('(0 ships)');
  expect(stdout).toContain('Current POI: Sol (star) [G2V]  sol');
  expect(stdout).not.toContain('=== Response ===');
});

test('get_system classified fixture does not fall back', () => {
  const stdout = renderStructuredResult('get_system', structuredClone(systemInfoFixture), options, context).stdout.join(
    '\n',
  );

  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('NaN');
  expect(stdout).not.toContain('undefined');
  expect(stdout).not.toContain('[object Object]');
});

function withPoiDeepCore(
  fixture: typeof systemInfoFixture,
  listValue: unknown | undefined,
  currentValue: unknown | undefined,
) {
  const next = structuredClone(fixture);
  const poi = next.system.pois[0] as Record<string, unknown>;
  if (listValue === undefined) delete poi.deep_core;
  else poi.deep_core = listValue;
  const current = next.poi as Record<string, unknown>;
  if (currentValue === undefined) delete current.deep_core;
  else current.deep_core = currentValue;
  return next;
}

test('get_system appends [deep core] on list and Current POI when overlaid', () => {
  const stdout = renderStructuredResult(
    'get_system',
    withPoiDeepCore(systemInfoFixture, true, true),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Earth (planet) [garden] [deep core] [station]  sol_earth');
  expect(stdout).toContain('Current POI: Earth (planet) [garden] [deep core]');
  expect(stdout).not.toContain('Deep core: yes');
  expect(stdout).not.toContain('=== Response ===');
});

test('get_system prints [deep core] on the list when Current POI omits it', () => {
  const stdout = renderStructuredResult(
    'get_system',
    withPoiDeepCore(systemInfoFixture, true, undefined),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Earth (planet) [garden] [deep core] [station]  sol_earth');
  expect(stdout).not.toMatch(/Current POI:.*\[deep core\]/);
  expect(stdout).toContain('Current POI: Earth (planet) [garden]');
});

test('get_system prints [deep core] on Current POI when the list omits it', () => {
  const stdout = renderStructuredResult(
    'get_system',
    withPoiDeepCore(systemInfoFixture, undefined, true),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Earth (planet) [garden] [station]  sol_earth');
  expect(stdout).not.toMatch(/- Earth \(planet\) \[garden\] \[deep core\]/);
  expect(stdout).toContain('Current POI: Earth (planet) [garden] [deep core]');
});

test('get_system omits [deep core] when false or non-boolean', () => {
  const missing = renderStructuredResult(
    'get_system',
    structuredClone(systemInfoFixture),
    options,
    context,
  ).stdout.join('\n');
  expect(missing).not.toContain('[deep core]');

  for (const value of [false, 'true', 1]) {
    const stdout = renderStructuredResult(
      'get_system',
      withPoiDeepCore(systemInfoFixture, value, value),
      options,
      context,
    ).stdout.join('\n');
    expect(stdout).not.toContain('[deep core]');
    expect(stdout).not.toContain('Deep core:');
  }
});

function withListShipCount(value: unknown | undefined) {
  const next = structuredClone(systemInfoFixture);
  const poi = next.system.pois[0] as Record<string, unknown>;
  if (value === undefined) delete poi.ship_count;
  else poi.ship_count = value;
  return next;
}

test('get_system prints (N ships) when ship_count is a finite number', () => {
  const positive = renderStructuredResult('get_system', withListShipCount(2), options, context).stdout.join('\n');
  expect(positive).toContain('Earth (planet) [garden] [station] (2 ships)  sol_earth');
  expect(positive).not.toContain('=== Response ===');
  expect(positive).not.toContain('(2 online)');

  const zero = renderStructuredResult('get_system', withListShipCount(0), options, context).stdout.join('\n');
  expect(zero).toContain('Earth (planet) [garden] [station] (0 ships)  sol_earth');
  expect(zero).not.toContain('Ships:');

  const absent = renderStructuredResult('get_system', withListShipCount(undefined), options, context).stdout.join('\n');
  expect(absent).toContain('Earth (planet) [garden] [station]  sol_earth');
  expect(absent).not.toContain('(0 ships)');
  expect(absent).not.toContain('ships)');

  for (const value of ['2', null, true, Number.NaN]) {
    const stdout = renderStructuredResult('get_system', withListShipCount(value), options, context).stdout.join('\n');
    expect(stdout).toContain('Earth (planet) [garden] [station]  sol_earth');
    expect(stdout).not.toContain('(0 ships)');
    expect(stdout).not.toContain('ships)');
  }
});

test('get_system ship counts stay on the POI that sent them', () => {
  const fixture = structuredClone(systemInfoFixture);
  const earth = fixture.system.pois[0] as Record<string, unknown>;
  const counted: Record<string, unknown> = { ...earth, id: 'sol_counted', name: 'Counted', ship_count: 3 };
  const omitted: Record<string, unknown> = { ...earth, id: 'sol_omitted', name: 'Omitted' };
  delete omitted.ship_count;
  const empty: Record<string, unknown> = { ...earth, id: 'sol_empty', name: 'Empty', ship_count: 0 };
  (fixture.system as { pois: unknown }).pois = [counted, omitted, empty];
  const stdout = renderStructuredResult('get_system', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Counted (planet) [garden] [station] (3 ships)  sol_counted');
  expect(stdout).toContain('Omitted (planet) [garden] [station]  sol_omitted');
  expect(stdout).not.toMatch(/Omitted \(planet\).*ships/);
  expect(stdout).toContain('Empty (planet) [garden] [station] (0 ships)  sol_empty');
});

test('get_system current POI uses its own ship_count', () => {
  const both = structuredClone(systemInfoFixture);
  (both.system.pois[0] as Record<string, unknown>).ship_count = 2;
  (both.poi as Record<string, unknown>).ship_count = 4;
  const bothOut = renderStructuredResult('get_system', both, options, context).stdout.join('\n');
  expect(bothOut).toContain('Current POI: Earth (planet) [garden] (4 ships)  sol_earth');
  expect(bothOut).toContain('Earth (planet) [garden] [station] (2 ships)  sol_earth');

  const listOnly = withListShipCount(2);
  const listOut = renderStructuredResult('get_system', listOnly, options, context).stdout.join('\n');
  expect(listOut).toContain('Current POI: Earth (planet) [garden]  sol_earth');
  expect(listOut).not.toMatch(/Current POI:.*\(2 ships\)/);
  expect(listOut).toContain('Earth (planet) [garden] [station] (2 ships)  sol_earth');
});

function agentsHeader(stdout: string): string | undefined {
  return stdout.split('\n').find((line) => line.includes('|') && line.includes('Name') && line.includes('Combat'));
}

function agentsCell(stdout: string, rowNeedle: string, column: string): string | undefined {
  const header = agentsHeader(stdout);
  const row = stdout
    .split('\n')
    .find((line) => line.includes('|') && line.includes(rowNeedle) && !line.includes('---'));
  if (!header || !row) return undefined;
  const headers = header.split('|').map((part) => part.trim());
  const cells = row.split('|').map((part) => part.trim());
  const index = headers.indexOf(column);
  return index >= 0 ? cells[index] : undefined;
}

function renderSystemAgents(fixture: Record<string, unknown>) {
  const rendered = renderStructuredResult('get_system_agents', fixture, options, context);
  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(rendered.stderr).toEqual([]);
  expect(stdout).not.toContain('=== Response ===');
  return stdout;
}

function cloneSystemAgents() {
  return structuredClone(getSystemAgentsFixture) as Record<string, unknown> & {
    agents: Array<Record<string, unknown>>;
  };
}

test('get_system_agents table lists mixed Docked true/false from the golden fixture', () => {
  const stdout = renderSystemAgents(cloneSystemAgents());

  expect(stdout).toContain('Combat | Docked | Offline');
  expect(agentsCell(stdout, 'Marlowe', 'Docked')).toBe('false');
  expect(agentsCell(stdout, 'Ibis', 'Docked')).toBe('true');
  expect(stdout).not.toContain('[DOCKED]');
  expect(stdout.indexOf('count 2')).toBeLessThan(stdout.indexOf('offline collapsed 4'));
});

test('get_system_agents prints offline collapsed for finite numbers without rounding', () => {
  const zero = cloneSystemAgents();
  zero.offline_collapsed = 0;
  expect(renderSystemAgents(zero)).toContain('offline collapsed 0');

  const negative = cloneSystemAgents();
  negative.offline_collapsed = -1;
  expect(renderSystemAgents(negative)).toContain('offline collapsed -1');

  const fractional = cloneSystemAgents();
  fractional.offline_collapsed = 4.5;
  const fractionalOut = renderSystemAgents(fractional);
  expect(fractionalOut).toContain('offline collapsed 4.5');
  expect(fractionalOut).not.toContain('offline collapsed 5');
});

test('get_system_agents omits offline collapsed when the value is absent or not a finite number', () => {
  const absent = cloneSystemAgents();
  delete absent.offline_collapsed;
  const absentOut = renderSystemAgents(absent);
  expect(absentOut).toContain('count 2');
  expect(absentOut).toContain('Marlowe');
  expect(absentOut).not.toContain('offline collapsed');

  for (const value of [null, '', '4', Number.NaN, Number.POSITIVE_INFINITY, { count: 4 }, ['4'], true, 4n]) {
    const fixture = cloneSystemAgents();
    fixture.offline_collapsed = value;
    const stdout = renderSystemAgents(fixture);
    expect(stdout).toContain('=== System Agents: sol ===');
    expect(stdout).toContain('count 2');
    expect(stdout).not.toContain('offline collapsed');
    expect(stdout).not.toContain('[object Object]');
    expect(stdout).not.toContain('NaN');
    expect(stdout).not.toContain('Infinity');
  }
});

test('get_system_agents does not print warning or ship counts', () => {
  const fixture = cloneSystemAgents();
  fixture.warning = 'scanner-degraded-token';
  fixture.ship_counts = { sol_earth: 4, sol_belt: 0 };
  const stdout = renderSystemAgents(fixture);

  expect(stdout).toContain('offline collapsed 4');
  expect(stdout).not.toContain('scanner-degraded-token');
  expect(stdout).not.toContain('warning');
  expect(stdout).not.toContain('Ship counts');
  expect(stdout).not.toContain('sol_earth=4');
  expect(stdout).not.toContain('sol_belt=0');
});

test('get_system_agents omits Docked when every agent omits the field', () => {
  const fixture = cloneSystemAgents();
  for (const agent of fixture.agents) delete agent.docked;
  const stdout = renderSystemAgents(fixture);
  const header = agentsHeader(stdout);

  expect(header).toBeDefined();
  expect(header).not.toContain('Docked');
  expect(header).toContain('Combat');
  expect(header).toContain('Offline');
  expect(header).toContain('Status');
});

test('get_system_agents shows Docked when every agent is undocked', () => {
  const fixture = cloneSystemAgents();
  for (const agent of fixture.agents) agent.docked = false;
  const stdout = renderSystemAgents(fixture);

  expect(agentsHeader(stdout)).toContain('Docked');
  expect(agentsCell(stdout, 'Marlowe', 'Docked')).toBe('false');
  expect(agentsCell(stdout, 'Ibis', 'Docked')).toBe('false');
});

test('get_system_agents shows Docked when every agent is docked', () => {
  const fixture = cloneSystemAgents();
  for (const agent of fixture.agents) agent.docked = true;
  const stdout = renderSystemAgents(fixture);

  expect(agentsHeader(stdout)).toContain('Docked');
  expect(agentsCell(stdout, 'Marlowe', 'Docked')).toBe('true');
  expect(agentsCell(stdout, 'Ibis', 'Docked')).toBe('true');
});

test('get_system_agents leaves Docked blank when only some agents report it', () => {
  const fixture = cloneSystemAgents();
  const marlowe = fixture.agents[0] as Record<string, unknown>;
  const ibis = fixture.agents[1] as Record<string, unknown>;
  delete marlowe.docked;
  ibis.docked = true;
  const stdout = renderSystemAgents(fixture);

  expect(agentsHeader(stdout)).toContain('Docked');
  expect(agentsCell(stdout, 'Ibis', 'Docked')).toBe('true');
  expect(agentsCell(stdout, 'Marlowe', 'Docked')).toBe('');
});

test('get_system_agents prints a server warning above an empty agents table', () => {
  const warning = 'get_system_agents is deprecated and always empty. Use get_nearby for ships at your POI.';
  const stdout = renderSystemAgents({
    system_id: 'sol',
    count: 0,
    agents: [],
    warning,
  });

  expect(stdout).toContain('=== System Agents: sol ===');
  expect(stdout.split(`Warning: ${warning}`).length - 1).toBe(1);
  expect(stdout.indexOf('=== System Agents:')).toBeLessThan(stdout.indexOf('Warning:'));
  expect(stdout.indexOf('Warning:')).toBeLessThan(stdout.indexOf('=== Agents ==='));
  expect(stdout).toContain('=== Agents ===');
  expect(stdout).toContain('(None)');
  expect(stdout).toContain('count 0');
});

test('get_system_agents omits Warning when warning is missing or blank', () => {
  for (const warning of [undefined, '', '   '] as const) {
    const fixture = cloneSystemAgents();
    if (warning === undefined) delete fixture.warning;
    else fixture.warning = warning;
    expect(renderSystemAgents(fixture)).not.toContain('Warning:');
  }
});

test('get_system and get_system_agents JSON stay pass-through', () => {
  const jsonOptions = { ...options, json: true };
  const withCount = withListShipCount(0);
  const counted = renderStructuredResult('get_system', withCount, jsonOptions, context);
  const countedStdout = counted.stdout.join('\n');
  expect(counted.success).toBe(true);
  expect(counted.stderr).toEqual([]);
  expect(countedStdout).toContain('"ship_count": 0');
  expect(countedStdout).toContain('"online": 2');
  expect(countedStdout).not.toContain('=== System');

  const deleted = withListShipCount(0);
  delete (deleted.system.pois[0] as Record<string, unknown>).ship_count;
  const omittedStdout = renderStructuredResult('get_system', deleted, jsonOptions, context).stdout.join('\n');
  expect(omittedStdout).not.toContain('ship_count');
  expect(omittedStdout).toContain('"online": 2');
  expect(omittedStdout).toContain('Birthplace system');

  const warning = 'get_system_agents is deprecated and always empty.';
  const agents = renderStructuredResult(
    'get_system_agents',
    { system_id: 'sol', count: 0, agents: [], warning },
    jsonOptions,
    context,
  );
  const agentsStdout = agents.stdout.join('\n');
  expect(agents.success).toBe(true);
  expect(agentsStdout).toContain('"warning"');
  expect(agentsStdout).toContain(warning);
  expect(agentsStdout).toContain('"agents": []');
  expect(agentsStdout).not.toContain('"online"');
  expect(agentsStdout).not.toContain('=== System Agents');
});

const adultLeviathanLine = '  Adult Molt Leviathan [lev-molt-1] (molt_leviathan) - adult - hull 800/1200 - aggressive';
const juvenileLeviathanLine =
  '  Juvenile Molt Leviathan [lev-molt-2] (molt_leviathan) - juvenile - hull 0/90 - not aggressive - in combat';

function locationWithLeviathans(leviathans: unknown): Record<string, unknown> {
  const fixture = structuredClone(getLocationFixture) as { location: Record<string, unknown> };
  fixture.location.nearby_leviathans = leviathans;
  return fixture;
}

function statusWithLeviathans(leviathans: unknown): Record<string, unknown> {
  const fixture = structuredClone(getStatusFixture) as { location: Record<string, unknown> };
  fixture.location.nearby_leviathans = leviathans;
  return fixture;
}

function leviathanContact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...adultLeviathanContact, ...overrides };
}

function renderLocation(fixture: Record<string, unknown>, renderOptions: GlobalOptions = options): string {
  return renderStructuredResult('get_location', fixture, renderOptions, context).stdout.join('\n');
}

function leviathanLine(stdout: string, token: string): string | undefined {
  return stdout.split('\n').find((line) => line.startsWith('  ') && line.includes(token));
}

test('get_location omits leviathans when the array is empty', () => {
  const stdout = renderLocation(locationWithLeviathans([]));

  expect(stdout).not.toContain('Nearby Leviathans');
  expect(stdout).not.toContain('Leviathans: none');
  expect(stdout).toContain('Nearby Prizes');
  expect(stdout).toContain('Nearby Pirates (1):');
  expect(stdout).toContain('  Raider (skiff) - Admiral Kael - hostile');
});

test('get_location omits leviathans when the key is absent', () => {
  const stdout = renderLocation(structuredClone(getLocationFixture));

  expect(stdout).not.toContain('Nearby Leviathans');
  expect(stdout).not.toContain('Leviathans: none');
  expect(stdout).toContain('Nearby Pirates (1):');
  expect(stdout).toContain('prize-dust-1');
});

test('get_location prints one aggressive leviathan between pirates and nearby NPCs', () => {
  const stdout = renderLocation(structuredClone(getLocationLeviathansFixture));
  const heading = stdout.split('\n').find((line) => line.includes('Nearby Leviathans'));

  expect(heading).toBe('Nearby Leviathans (1):');
  expect(heading).not.toContain('\x1b');
  expect(leviathanLine(stdout, 'lev-molt-1')).toBe(adultLeviathanLine);
  expect(stdout).not.toContain('in combat');
  expect(stdout).not.toContain('not aggressive');
  expect(stdout).toContain('Marlowe [SMC] (prospector)');
  expect(stdout).toContain('prize-dust-1');
  expect(stdout).toContain('  Raider (skiff) - Admiral Kael - hostile');
  const prizesIdx = stdout.indexOf('Nearby Prizes');
  const piratesIdx = stdout.indexOf('Nearby Pirates');
  const leviathansIdx = stdout.indexOf('Nearby Leviathans');
  const npcsIdx = stdout.indexOf('Nearby NPCs');
  expect(piratesIdx).toBeGreaterThan(prizesIdx);
  expect(leviathansIdx).toBeGreaterThan(piratesIdx);
  expect(npcsIdx).toBeGreaterThan(leviathansIdx);
});

test('get_location prints two leviathans in server order', () => {
  const stdout = renderLocation(locationWithLeviathans([adultLeviathanContact, juvenileLeviathanContact]));
  const adultIdx = stdout.indexOf(adultLeviathanLine);
  const juvenileIdx = stdout.indexOf(juvenileLeviathanLine);

  expect(stdout).toContain('Nearby Leviathans (2):');
  expect(adultIdx).toBeGreaterThan(-1);
  expect(juvenileIdx).toBeGreaterThan(adultIdx);
  expect(juvenileLeviathanLine).toContain('hull 0/90');
  expect(juvenileLeviathanLine).toContain('not aggressive');
  expect(juvenileLeviathanLine).toContain(' - in combat');
});

test('get_location prints not aggressive as the full token', () => {
  const stdout = renderLocation(locationWithLeviathans([leviathanContact({ aggressive: false })]));
  const line = leviathanLine(stdout, 'lev-molt-1');

  expect(line).toBe('  Adult Molt Leviathan [lev-molt-1] (molt_leviathan) - adult - hull 800/1200 - not aggressive');
  expect(line?.endsWith(' - aggressive')).toBe(false);
});

test('get_location appends in combat only when in_combat is true', () => {
  const fighting = renderLocation(locationWithLeviathans([leviathanContact({ in_combat: true })]));
  const truthy = renderLocation(locationWithLeviathans([leviathanContact({ in_combat: 1 })]));
  const text = renderLocation(locationWithLeviathans([leviathanContact({ in_combat: 'yes' })]));

  expect(leviathanLine(fighting, 'lev-molt-1')).toBe(`${adultLeviathanLine} - in combat`);
  expect(leviathanLine(fighting, 'lev-molt-1')?.endsWith(' - in combat')).toBe(true);
  expect(leviathanLine(truthy, 'lev-molt-1')).toBe(adultLeviathanLine);
  expect(leviathanLine(text, 'lev-molt-1')).not.toContain('in combat');
});

test('get_location prints hull 0', () => {
  const stdout = renderLocation(locationWithLeviathans([leviathanContact({ hull: 0, max_hull: 90 })]));
  const line = leviathanLine(stdout, 'lev-molt-1');

  expect(line).toContain('hull 0/90');
  expect(line).not.toContain('hull ?/');
  expect(line).toContain(' - hull ');
});

test('get_location keeps brackets when the id equals the name', () => {
  const stdout = renderLocation(
    locationWithLeviathans([leviathanContact({ name: 'lev-molt-1', leviathan_id: 'lev-molt-1' })]),
  );

  expect(leviathanLine(stdout, 'lev-molt-1')).toBe(
    '  lev-molt-1 [lev-molt-1] (molt_leviathan) - adult - hull 800/1200 - aggressive',
  );
});

test('get_location falls back when name or id is missing', () => {
  const missingName = leviathanContact();
  delete missingName.name;
  const missingBoth = leviathanContact();
  delete missingBoth.name;
  delete missingBoth.leviathan_id;
  const whitespaceId = leviathanContact({ name: ' ', leviathan_id: '   ' });

  expect(leviathanLine(renderLocation(locationWithLeviathans([missingName])), 'lev-molt-1')).toBe(
    '  lev-molt-1 [lev-molt-1] (molt_leviathan) - adult - hull 800/1200 - aggressive',
  );
  const unknown = leviathanLine(renderLocation(locationWithLeviathans([missingBoth])), 'Unknown');
  expect(unknown).toBe('  Unknown (molt_leviathan) - adult - hull 800/1200 - aggressive');
  expect(unknown).not.toContain('[');
  const blankId = leviathanLine(renderLocation(locationWithLeviathans([whitespaceId])), 'Unknown');
  expect(blankId?.startsWith('  Unknown')).toBe(true);
  expect(blankId).not.toContain('[');
});

test('get_location prints ? for non-finite hull sides and does not coerce strings', () => {
  const both = renderLocation(locationWithLeviathans([leviathanContact({ hull: 'nope', max_hull: Number.NaN })]));
  const maxOnly = renderLocation(locationWithLeviathans([leviathanContact({ hull: 'nope', max_hull: 90 })]));
  const numericString = renderLocation(locationWithLeviathans([leviathanContact({ hull: '800', max_hull: 1200 })]));
  const big = renderLocation(locationWithLeviathans([leviathanContact({ hull: 800n, max_hull: 1200n })]));

  expect(leviathanLine(both, 'lev-molt-1')).toContain('hull ?/?');
  expect(leviathanLine(maxOnly, 'lev-molt-1')).toContain('hull ?/90');
  expect(leviathanLine(maxOnly, 'lev-molt-1')).not.toContain('nope');
  expect(leviathanLine(numericString, 'lev-molt-1')).toContain('hull ?/1200');
  expect(leviathanLine(numericString, 'lev-molt-1')).not.toContain('hull 800/');
  expect(leviathanLine(big, 'lev-molt-1')).toContain('hull ?/?');
  expect(leviathanLine(big, 'lev-molt-1')).not.toContain('1200');
});

test('get_location omits the aggressive token for non-booleans', () => {
  const yes = leviathanContact({ aggressive: 'yes' });
  const missing = leviathanContact();
  delete missing.aggressive;
  const yesLine = leviathanLine(renderLocation(locationWithLeviathans([yes])), 'lev-molt-1');
  const missingLine = leviathanLine(renderLocation(locationWithLeviathans([missing])), 'lev-molt-1');
  const expected = '  Adult Molt Leviathan [lev-molt-1] (molt_leviathan) - adult - hull 800/1200';

  expect(yesLine).toBe(expected);
  expect(yesLine).not.toContain('aggressive');
  expect(missingLine).toBe(expected);
  expect(missingLine).not.toContain('not aggressive');
});

test('get_location trims whitespace-only identity fields', () => {
  const stdout = renderLocation(
    locationWithLeviathans([leviathanContact({ name: ' ', leviathan_id: ' lev-molt-1 ', species: ' ', stage: ' ' })]),
  );
  const line = leviathanLine(stdout, 'lev-molt-1');

  expect(line).toBe('  lev-molt-1 [lev-molt-1] - hull 800/1200 - aggressive');
  expect(line).not.toContain('()');
  expect(line).not.toContain('molt_leviathan');
  expect(line).not.toContain('adult');
});

test('get_location does not cap leviathan rows', () => {
  const rows = Array.from({ length: 11 }, (_, index) =>
    leviathanContact({
      leviathan_id: `lev-${index + 1}`,
      name: `Pod ${index + 1}`,
      hull: index,
      max_hull: 10,
      aggressive: false,
    }),
  );
  const stdout = renderLocation(locationWithLeviathans(rows));
  const lines = stdout.split('\n').filter((line) => /^ {2}Pod \d+ \[lev-\d+\]/.test(line));

  expect(stdout).toContain('Nearby Leviathans (11):');
  expect(lines).toHaveLength(11);
  expect(stdout.indexOf('Pod 1 [')).toBeLessThan(stdout.indexOf('Pod 11 ['));
  expect(stdout).not.toContain('... and');
});

test('get_location skips non-record leviathan entries', () => {
  const mixed = renderLocation(locationWithLeviathans([null, adultLeviathanContact, 'skip', 1]));
  const junk = renderLocation(locationWithLeviathans([null, 'skip', 1, false]));

  expect(mixed).toContain('Nearby Leviathans (1):');
  expect(leviathanLine(mixed, 'lev-molt-1')).toBe(adultLeviathanLine);
  expect(junk).not.toContain('Nearby Leviathans');
  expect(junk).not.toContain('Leviathans: none');
});

test('get_location colors the leviathan heading and leaves the contact line plain', () => {
  const colored = renderLocation(structuredClone(getLocationLeviathansFixture), colorOptions);
  const plain = renderLocation(structuredClone(getLocationLeviathansFixture));
  const coloredLine = leviathanLine(colored, 'lev-molt-1');
  const plainHeading = plain.split('\n').find((line) => line.includes('Nearby Leviathans'));

  expect(colored).toContain('\n\x1b[31mNearby Leviathans (1):\x1b[0m');
  expect(coloredLine).toBe(adultLeviathanLine);
  expect(coloredLine).not.toContain('\x1b');
  expect(plainHeading).toBe('Nearby Leviathans (1):');
  expect(plainHeading).not.toContain('\x1b');
});

test.each([
  'get_status',
  'get_state',
] as const)('%s prints location leviathans between prizes and recoveries', (command) => {
  const stdout = renderStructuredResult(
    command,
    structuredClone(
      command === 'get_state' ? getStateLeviathansFixture : statusWithLeviathans([adultLeviathanContact]),
    ),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Nearby Leviathans (1):');
  expect(leviathanLine(stdout, 'lev-molt-1')).toBe(adultLeviathanLine);
  expect(stdout).toContain('Nearby Players: 1');
  expect(stdout).toContain('  - Ibis (hauler)');
  expect(stdout).toContain('prize-dust-1');
  const prizesIdx = stdout.indexOf('Nearby Prizes');
  const leviathansIdx = stdout.indexOf('Nearby Leviathans');
  const recoveriesIdx = stdout.indexOf('=== Prize recoveries ===');
  expect(leviathansIdx).toBeGreaterThan(prizesIdx);
  expect(recoveriesIdx).toBeGreaterThan(leviathansIdx);
});

test.each(['get_status', 'get_state'] as const)('%s omits leviathans when the array is empty or absent', (command) => {
  const empty = renderStructuredResult(command, statusWithLeviathans([]), options, context).stdout.join('\n');
  const absent = renderStructuredResult(command, structuredClone(getStatusFixture), options, context).stdout.join('\n');

  expect(empty).not.toContain('Nearby Leviathans');
  expect(empty).not.toContain('Leviathans: none');
  expect(absent).not.toContain('Nearby Leviathans');
  expect(absent).not.toContain('Leviathans: none');
});

test('get_status does not read top-level leviathan arrays', () => {
  const fixture = structuredClone(getStatusFixture) as Record<string, unknown>;
  fixture.nearby_leviathans = [adultLeviathanContact];
  fixture.leviathans = [juvenileLeviathanContact];
  const stdout = renderStructuredResult('get_status', fixture, options, context).stdout.join('\n');

  expect(stdout).not.toContain('Leviathan');
  expect(stdout).not.toContain('lev-molt');
});

test('get_status_summary does not print leviathans', () => {
  const stdout = renderStructuredResult(
    'get_status_summary',
    statusWithLeviathans([adultLeviathanContact]),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).not.toContain('Leviathan');
  expect(stdout).not.toContain('lev-molt');
});

test.each([
  'get_status',
  'get_state',
] as const)('%s with leviathans still omits the Active Missions appendix', (command) => {
  const stdout = renderStructuredResult(
    command,
    { ...statusWithLeviathans([adultLeviathanContact]), missions: jumpSurveyMissionsEnvelope },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain(adultLeviathanLine);
  expect(stdout).not.toContain('=== Active Missions ===');
});

function herdCreatures(count: number): Array<{ name: string; creature_id: string; species: string }> {
  return Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    return { name: `Pod ${n}`, creature_id: `creature-${n}`, species: 'pilot_whale' };
  });
}

function renderNearbyTable(command: string, payload: Record<string, unknown>): string {
  return renderStructuredResult(command, payload, options, context).stdout.join('\n');
}

function expectNearbyFormatterEngaged(stdout: string): void {
  expect(stdout).toContain('Players (0):');
  expect(stdout).toContain('(No other players at this location)');
  expect(stdout).not.toContain('=== Response ===');
}

test('get_nearby prints every returned creature when creature_count matches the list', () => {
  const stdout = renderNearbyTable('get_nearby', {
    nearby: [],
    creatures: herdCreatures(30),
    creature_count: 30,
  });

  expectNearbyFormatterEngaged(stdout);
  expect(stdout).toContain('Creatures (30):');
  expect(stdout).toContain('[creature-1]');
  expect(stdout).toContain('[creature-30]');
  expect(stdout).not.toContain('... and');
});

test('get_nearby remainder is creature_count minus printed rows', () => {
  const stdout = renderNearbyTable('get_nearby', {
    nearby: [],
    creatures: herdCreatures(30),
    creature_count: 45,
  });

  expectNearbyFormatterEngaged(stdout);
  expect(stdout).toContain('Creatures (45):');
  expect(stdout).toContain('[creature-1]');
  expect(stdout).toContain('[creature-30]');
  expect(stdout.match(/\.\.\. and/g)).toEqual(['... and']);
  expect(stdout).toContain('... and 15 more');
  expect(stdout).not.toContain('... and 35 more');
  expect(stdout).not.toContain('... and 20 more');
});

test('get_nearby prints creature rows past the shared nearby table limit', () => {
  const stdout = renderNearbyTable('get_nearby', {
    nearby: [],
    creatures: herdCreatures(12),
    creature_count: 12,
  });

  expectNearbyFormatterEngaged(stdout);
  expect(stdout).toContain('Creatures (12):');
  expect(stdout).toContain('[creature-1]');
  expect(stdout).toContain('[creature-12]');
  expect(stdout).not.toContain('... and');
});

test('subscribe_observation prints every creature when creature_count is absent', () => {
  const stdout = renderNearbyTable('subscribe_observation', {
    nearby: [],
    creatures: herdCreatures(12),
  });

  expectNearbyFormatterEngaged(stdout);
  expect(stdout).toContain('Creatures (12):');
  expect(stdout).toContain('[creature-1]');
  expect(stdout).toContain('[creature-12]');
  expect(stdout).not.toContain('... and');
});

test('get_nearby prints every creature when creature_count is deleted', () => {
  const payload: Record<string, unknown> = {
    nearby: [],
    creatures: herdCreatures(12),
    creature_count: 12,
  };
  delete payload.creature_count;
  const stdout = renderNearbyTable('get_nearby', payload);

  expectNearbyFormatterEngaged(stdout);
  expect(stdout).toContain('Creatures (12):');
  expect(stdout).toContain('[creature-1]');
  expect(stdout).toContain('[creature-12]');
  expect(stdout).not.toContain('... and');
});

test('get_nearby stays quiet when creature_count is 0 and the list is empty', () => {
  const stdout = renderNearbyTable('get_nearby', {
    nearby: [],
    creatures: [],
    creature_count: 0,
  });

  expectNearbyFormatterEngaged(stdout);
  expect(stdout).not.toContain('Creatures (');
});

test('get_nearby prints every creature when creature_count is smaller than the list', () => {
  const stdout = renderNearbyTable('get_nearby', {
    nearby: [],
    creatures: herdCreatures(12),
    creature_count: 5,
  });

  expectNearbyFormatterEngaged(stdout);
  expect(stdout).toContain('Creatures (12):');
  expect(stdout).not.toContain('Creatures (5):');
  expect(stdout).toContain('[creature-1]');
  expect(stdout).toContain('[creature-12]');
  expect(stdout).not.toContain('... and');
});

test('get_nearby does not treat non-finite or non-numeric creature_count as a total', () => {
  for (const creature_count of ['30', Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    const stdout = renderNearbyTable('get_nearby', {
      nearby: [],
      creatures: herdCreatures(2),
      creature_count,
    });

    expectNearbyFormatterEngaged(stdout);
    expect(stdout).toContain('Creatures (2):');
    expect(stdout).not.toContain('Creatures (30)');
    expect(stdout).not.toContain('Creatures (-1)');
    expect(stdout).not.toContain('Creatures (NaN)');
    expect(stdout).not.toContain('Creatures (Infinity)');
    expect(stdout).toContain('[creature-1]');
    expect(stdout).toContain('[creature-2]');
    expect(stdout).not.toContain('... and');
  }
});

test('get_nearby prints a fractional unlisted remainder', () => {
  const stdout = renderNearbyTable('get_nearby', {
    nearby: [],
    creatures: herdCreatures(10),
    creature_count: 12.5,
  });

  expectNearbyFormatterEngaged(stdout);
  expect(stdout).toContain('Creatures (12.5):');
  expect(stdout).toContain('[creature-1]');
  expect(stdout).toContain('[creature-10]');
  expect(stdout.match(/\.\.\. and/g)).toEqual(['... and']);
  expect(stdout).toContain('... and 2.5 more');
});

test('get_nearby shows a positive creature_count when creatures is not an array', () => {
  const stdout = renderNearbyTable('get_nearby', {
    nearby: [],
    creature_count: 30,
    creatures: 'not-an-array',
  });

  expectNearbyFormatterEngaged(stdout);
  expect(stdout).toContain('Creatures (30):');
  expect(stdout).toContain('... and 30 more');
  expect(stdout).not.toContain('... and 20 more');
  expect(stdout).not.toContain('[');
});

test('get_nearby prints every pirate row beside an uncapped creature list', () => {
  const pirates = Array.from({ length: 12 }, (_, index) => ({
    pirate_id: `pirate-${index + 1}`,
    name: `Corsair ${index + 1}`,
  }));
  const stdout = renderNearbyTable('get_nearby', {
    nearby: [],
    pirates,
    creatures: herdCreatures(12),
    creature_count: 12,
  });

  expectNearbyFormatterEngaged(stdout);
  expect(stdout).toContain('Pirates (12):');
  expect(stdout).toContain('Corsair 10');
  expect(stdout).toContain('Corsair 11');
  expect(stdout).toContain('Corsair 12');
  expect(stdout).toContain('Creatures (12):');
  expect(stdout).toContain('[creature-11]');
  expect(stdout).toContain('[creature-12]');
  expect(stdout).not.toContain('... and');
});

test('get_nearby prints a brand suffix only on the branded row and does not double the tag', () => {
  const stdout = renderNearbyTable('get_nearby', {
    nearby: [],
    creatures: [
      {
        creature_id: 'creature-wild-1',
        name: 'Belt-Grazer',
        species: 'belt_grazer',
        role: 'grazer',
        hull: 40,
        max_hull: 40,
      },
      {
        creature_id: 'creature-brand-2',
        name: '[RNC] Belt-Grazer',
        species: 'belt_grazer',
        role: 'grazer',
        hull: 40,
        max_hull: 40,
        in_combat: true,
        branded: true,
        brand_faction: '[RNC] Ranchers Co-op',
        brand_ranch: 'cloudbank-ranch',
      },
      {
        creature_id: 'creature-smc-3',
        name: '[SMC] Pilot-Whale Pod',
        species: 'pilot_whale',
        role: 'grazer',
        hull: 80,
        max_hull: 120,
        branded: true,
        brand_faction: '[SMC] Space Molt Corp',
        brand_ranch: 'cloudbank-ranch',
      },
    ],
  });

  const wild = '  Belt-Grazer [creature-wild-1] (belt_grazer) - grazer - hull 40/40';
  const branded =
    '  [RNC] Belt-Grazer [creature-brand-2] (belt_grazer) - grazer - hull 40/40 - in combat - brand [RNC] Ranchers Co-op, cloudbank-ranch';
  const smc =
    '  [SMC] Pilot-Whale Pod [creature-smc-3] (pilot_whale) - grazer - hull 80/120 - brand [SMC] Space Molt Corp, cloudbank-ranch';

  expectNearbyFormatterEngaged(stdout);
  expect(stdout).toContain(wild);
  expect(stdout).toContain(branded);
  expect(stdout).toContain(smc);
  expect(stdout.indexOf(wild)).toBeLessThan(stdout.indexOf(branded));
  expect(stdout.indexOf(branded)).toBeLessThan(stdout.indexOf(smc));
  expect(stdout).not.toContain(`${wild} - brand`);
  expect(stdout.split('[SMC] Pilot-Whale Pod').length - 1).toBe(1);
  expect(stdout).not.toContain('[[RNC]');
  expect(stdout).not.toContain('[[SMC]');
  expect(stdout).not.toContain('[RNC] [RNC]');
  expect(stdout).not.toContain('[SMC] [SMC]');
});

test.each([
  ['branded false', { branded: false }],
  ['brand keys absent', {}],
  ['branded true with blank strings', { branded: true, brand_faction: '   ', brand_ranch: '' }],
  ['branded true with non-strings', { branded: true, brand_faction: 1, brand_ranch: null }],
] as const)('get_nearby wild row (%s) has no brand suffix', (_label, extra) => {
  const stdout = renderNearbyTable('get_nearby', {
    nearby: [],
    creatures: [
      {
        creature_id: 'creature-wild-1',
        name: 'Belt-Grazer',
        species: 'belt_grazer',
        role: 'grazer',
        hull: 40,
        max_hull: 40,
        ...extra,
      },
    ],
  });

  expect(stdout).toContain('  Belt-Grazer [creature-wild-1] (belt_grazer) - grazer - hull 40/40');
  expect(stdout).not.toContain(' - brand');
});

test('subscribe_observation human output prints creature brand fields', () => {
  const stdout = renderStructuredResult(
    'subscribe_observation',
    structuredClone(subscribeObservationFixture),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Creatures (1):');
  expect(stdout).toContain('Pilot-Whale Pod [creature-pilot-whale-7]');
  expect(stdout).toContain(
    'Pilot-Whale Pod [creature-pilot-whale-7] (pilot_whale) - grazer - hull 80/120 - brand smc, cloudbank-ranch',
  );
  expect(stdout).not.toContain('=== Response ===');
});

test('get_nearby prints every player row when count matches the array', () => {
  const nearby = Array.from({ length: 11 }, (_, index) => ({ username: `Pilot ${index + 1}` }));
  const stdout = renderNearbyTable('get_nearby', { nearby, count: 11 });

  expect(stdout).toContain('Players (11):');
  expect(stdout.split('\n').some((line) => line.trim() === 'Pilot 11')).toBe(true);
  expect(stdout).not.toContain('... and');
});

test('get_nearby prints offline collapsed for a finite number, including 0, between players and pirates', () => {
  for (const offline_collapsed of [4, 0]) {
    const stdout = renderNearbyTable('get_nearby', {
      nearby: [{ username: 'Marlowe' }],
      count: 1,
      pirates: [{ pirate_id: 'pirate-1', name: 'Raider' }],
      pirate_count: 1,
      offline_collapsed,
    });
    const line = `offline collapsed ${offline_collapsed}`;

    expect(stdout).toContain(line);
    expect(stdout.indexOf('Players (')).toBeLessThan(stdout.indexOf(line));
    expect(stdout.indexOf(line)).toBeLessThan(stdout.indexOf('Pirates ('));
  }
});

test('get_nearby omits offline collapsed when the field is absent or a string', () => {
  const absent = renderNearbyTable('get_nearby', { nearby: [{ username: 'Marlowe' }], count: 1 });
  const stringValue = renderNearbyTable('get_nearby', {
    nearby: [{ username: 'Marlowe' }],
    count: 1,
    offline_collapsed: '4',
  });

  expect(absent).toContain('Marlowe');
  expect(absent).not.toContain('offline collapsed');
  expect(stringValue).toContain('Marlowe');
  expect(stringValue).not.toContain('offline collapsed');
});

test('get_nearby prints every empire NPC row when the header is the array length', () => {
  const empire_npcs = Array.from({ length: 11 }, (_, index) => ({
    npc_id: `npc-${index + 1}`,
    name: `Patrol ${index + 1}`,
  }));
  const stdout = renderNearbyTable('get_nearby', { nearby: [], empire_npcs });

  expect(stdout).toContain('Empire NPCs (11):');
  expect(stdout.split('\n').some((line) => line.trim() === 'Patrol 11')).toBe(true);
  expect(stdout).not.toContain('... and');
});

test('get_location prints every nearby player row when the count matches the array', () => {
  const fixture = structuredClone(getLocationFixture) as { location: Record<string, unknown> };
  fixture.location.nearby_player_count = 11;
  fixture.location.nearby_players = Array.from({ length: 11 }, (_, index) => ({ username: `Pilot ${index + 1}` }));
  const stdout = renderStructuredResult('get_location', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('Nearby Players (11):');
  expect(stdout.split('\n').some((line) => line.trim() === 'Pilot 11')).toBe(true);
  expect(stdout).not.toContain('... and');
});

test('get_location prints location.offline_collapsed including 0 before prizes and pirates', () => {
  const positive = structuredClone(getLocationFixture) as { location: Record<string, unknown> };
  positive.location.offline_collapsed = 4;
  const positiveOut = renderStructuredResult('get_location', positive, options, context).stdout.join('\n');
  expect(positiveOut).toContain('offline collapsed 4');
  expect(positiveOut.indexOf('Nearby Players')).toBeLessThan(positiveOut.indexOf('offline collapsed 4'));
  expect(positiveOut.indexOf('offline collapsed 4')).toBeLessThan(positiveOut.indexOf('Nearby Prizes'));
  expect(positiveOut.indexOf('offline collapsed 4')).toBeLessThan(positiveOut.indexOf('Nearby Pirates'));

  const zero = structuredClone(getLocationFixture) as { location: Record<string, unknown> };
  zero.location.offline_collapsed = 0;
  expect(renderStructuredResult('get_location', zero, options, context).stdout.join('\n')).toContain(
    'offline collapsed 0',
  );

  const omitted = structuredClone(getLocationFixture) as { location: Record<string, unknown> };
  delete omitted.location.offline_collapsed;
  expect(renderStructuredResult('get_location', omitted, options, context).stdout.join('\n')).not.toContain(
    'offline collapsed',
  );
});

test('get_location prints offline collapsed when the player section is skipped', () => {
  const fixture = structuredClone(getLocationFixture) as { location: Record<string, unknown> };
  fixture.location.nearby_player_count = 0;
  fixture.location.nearby_players = [];
  fixture.location.offline_collapsed = 2;
  const stdout = renderStructuredResult('get_location', fixture, options, context).stdout.join('\n');

  expect(stdout).not.toContain('Nearby Players');
  expect(stdout).toContain('offline collapsed 2');
  expect(stdout.indexOf('offline collapsed 2')).toBeLessThan(stdout.indexOf('Nearby Prizes'));
  expect(stdout.indexOf('offline collapsed 2')).toBeLessThan(stdout.indexOf('Nearby Pirates'));
});

test.each([
  'get_status',
  'get_state',
] as const)('%s reads location.offline_collapsed and prints every copied nearby player', (command) => {
  const positive = structuredClone(getStatusFixture) as {
    location: Record<string, unknown>;
    offline_collapsed?: unknown;
    nearby?: unknown;
  };
  positive.location.nearby_players = Array.from({ length: 11 }, (_, index) => ({ username: `Pilot ${index + 1}` }));
  positive.location.offline_collapsed = 4;
  positive.offline_collapsed = 99;
  delete positive.nearby;
  const positiveOut = renderStructuredResult(command, positive, options, context).stdout.join('\n');

  expect(positiveOut).toContain('Nearby Players: 11');
  expect(positiveOut).toContain('  - Pilot 11');
  expect(positiveOut).toContain('offline collapsed 4');
  expect(positiveOut).not.toContain('offline collapsed 99');
  expect(positiveOut).not.toContain('... and');
  expect(positiveOut.indexOf('Nearby Players:')).toBeLessThan(positiveOut.indexOf('offline collapsed 4'));
  expect(positiveOut.indexOf('offline collapsed 4')).toBeLessThan(positiveOut.indexOf('Nearby Prizes'));

  const zero = structuredClone(getStatusFixture) as { location: Record<string, unknown>; offline_collapsed?: unknown };
  zero.location.offline_collapsed = 0;
  zero.offline_collapsed = 7;
  const zeroOut = renderStructuredResult(command, zero, options, context).stdout.join('\n');
  expect(zeroOut).toContain('offline collapsed 0');
  expect(zeroOut).not.toContain('offline collapsed 7');

  const omitted = structuredClone(getStatusFixture) as { location: Record<string, unknown> };
  delete omitted.location.offline_collapsed;
  const omittedOut = renderStructuredResult(command, omitted, options, context).stdout.join('\n');
  expect(omittedOut).toContain('  - Ibis');
  expect(omittedOut).not.toContain('offline collapsed');
});

test('get_status prints offline collapsed when nearby players are empty and before prizes', () => {
  const fixture = structuredClone(getStatusFixture) as { location: Record<string, unknown> };
  fixture.location.nearby_players = [];
  fixture.location.offline_collapsed = 3;
  const stdout = renderStructuredResult('get_status', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('offline collapsed 3');
  expect(stdout).not.toContain('Nearby Players:');
  expect(stdout.indexOf('offline collapsed 3')).toBeLessThan(stdout.indexOf('Nearby Prizes'));
});

test('subscribe_observation prints every nearby row', () => {
  const nearby = Array.from({ length: 11 }, (_, index) => ({ username: `Pilot ${index + 1}` }));
  const stdout = renderNearbyTable('subscribe_observation', { nearby, count: 11 });

  expect(stdout).toContain('Players (11):');
  expect(stdout.split('\n').some((line) => line.trim() === 'Pilot 11')).toBe(true);
  expect(stdout).not.toContain('... and');
});

test('subscribe_observation prints offline collapsed from the snapshot', () => {
  const stdout = renderNearbyTable('subscribe_observation', {
    nearby: [{ username: 'Marlowe' }],
    pirates: [{ pirate_id: 'pirate-1', name: 'Raider' }],
    offline_collapsed: 2,
  });

  expect(stdout).toContain('offline collapsed 2');
  expect(stdout.indexOf('Players (')).toBeLessThan(stdout.indexOf('offline collapsed 2'));
  expect(stdout.indexOf('offline collapsed 2')).toBeLessThan(stdout.indexOf('Pirates ('));
});

test('subscribe_observation prints the full ship_counts map', () => {
  const stdout = renderNearbyTable('subscribe_observation', {
    nearby: [],
    prizes: [{ prize_id: 'prize-1', actor_id: 'actor-1', ship_class: 'frigate', status: 'available' }],
    ship_counts: { sol_earth: 4, sol_belt: 0 },
  });

  expect(stdout).toContain('Ship counts: sol_belt=0, sol_earth=4');
  expect(stdout.indexOf('Prizes')).toBeLessThan(stdout.indexOf('Ship counts:'));
});

test('subscribe_observation prints Ship counts: (cleared) for an empty map', () => {
  const stdout = renderNearbyTable('subscribe_observation', { nearby: [], ship_counts: {} });

  expect(stdout).toContain('Ship counts: (cleared)');
});

test('subscribe_observation omits Ship counts when ship_counts is absent', () => {
  const stdout = renderNearbyTable('subscribe_observation', { nearby: [] });

  expect(stdout).not.toContain('Ship counts');
});

test('get_nearby does not print a planted ship_counts object', () => {
  const stdout = renderNearbyTable('get_nearby', {
    nearby: [],
    ship_counts: { sol_earth: 4, sol_belt: 0 },
  });

  expect(stdout).toContain('=== Nearby ===');
  expect(stdout).not.toContain('Ship counts');
  expect(stdout).not.toContain('sol_earth=4');
  expect(stdout).not.toContain('sol_belt=0');
});

function renderArrival(command: 'travel' | 'jump', payload: Record<string, unknown>): string {
  const rendered = renderStructuredResult(command, payload, options, context);
  expect(rendered.success).toBe(true);
  expect(rendered.stderr).toEqual([]);
  return rendered.stdout.join('\n');
}

const schemaJumpDetails = {
  action: 'jumped',
  system: 'Procyon',
  system_id: 'procyon',
  from_system: 'sol',
  navigation_xp: 1,
};

test('travel arrival prints every online player, the truncated line, and offline collapsed', () => {
  const players = Array.from({ length: 11 }, (_, index) => ({
    username: `Pilot-${String(index + 1).padStart(2, '0')}`,
  }));
  const stdout = renderArrival('travel', {
    details: {
      action: 'travel',
      poi: 'Earth',
      poi_id: 'sol_earth',
      online_players: players,
      online_players_count: 11,
      online_players_truncated: true,
      offline_collapsed: 3,
    },
  });

  expect(stdout).toContain('Arrived at');
  expect(stdout).toContain('Players here (11):');
  for (const player of players) expect(stdout).toContain(`  ${player.username}`);
  expect(stdout).toContain('  ... and more');
  expect(stdout).toContain('offline collapsed 3');
  expect(stdout.indexOf('  Pilot-11')).toBeLessThan(stdout.indexOf('  ... and more'));
  expect(stdout.indexOf('  ... and more')).toBeLessThan(stdout.indexOf('offline collapsed 3'));
});

test('arrival omits the offline line when offline_collapsed is absent', () => {
  const stdout = renderArrival('travel', {
    details: {
      action: 'travel',
      poi: 'Earth',
      poi_id: 'sol_earth',
      online_players: [{ username: 'Ibis' }],
      online_players_count: 1,
    },
  });

  expect(stdout).toContain('Arrived at Earth');
  expect(stdout).toContain('Players here (1):');
  expect(stdout).toContain('  Ibis');
  expect(stdout).not.toContain('offline collapsed');
});

test('arrival prints offline collapsed 0 after an empty player list', () => {
  const stdout = renderArrival('travel', {
    details: {
      action: 'travel',
      poi: 'Earth',
      poi_id: 'sol_earth',
      online_players: [],
      online_players_count: 0,
      offline_collapsed: 0,
    },
  });

  expect(stdout).toContain('Arrived at Earth');
  expect(stdout).toContain('(No other players here)');
  expect(stdout).toContain('offline collapsed 0');
  expect(stdout.indexOf('(No other players here)')).toBeLessThan(stdout.indexOf('offline collapsed 0'));
  expect(stdout).not.toContain('Players here');
});

test('enveloped jump prints location players and not location offline_collapsed', () => {
  const stdout = renderArrival('jump', {
    details: schemaJumpDetails,
    location: {
      poi_id: 'procyon_a',
      poi_name: 'Procyon A',
      nearby_players: [{ username: 'Ibis' }],
      nearby_player_count: 1,
      offline_collapsed: 4,
    },
  });

  expect(stdout).toContain('Arrived at Procyon A');
  expect(stdout).toContain('Players here (1):');
  expect(stdout).toContain('  Ibis');
  expect(stdout).not.toContain('offline collapsed');
  expect(stdout).not.toContain('=== Jumped ===');
});

test('flat jump without online_players falls through to Jumped', () => {
  const stdout = renderArrival('jump', schemaJumpDetails);

  expect(stdout).toContain('=== Jumped ===');
  expect(stdout).not.toContain('Players here');
  expect(stdout).not.toContain('offline collapsed');
});

test('enveloped jump without nearby_players falls through to Jumped', () => {
  const stdout = renderArrival('jump', {
    details: schemaJumpDetails,
    location: {
      poi_id: 'procyon_a',
      poi_name: 'Procyon A',
    },
  });

  expect(stdout).toContain('=== Jumped ===');
  expect(stdout).not.toContain('Players here');
  expect(stdout).not.toContain('offline collapsed');
});
