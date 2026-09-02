import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { renderStructuredResult } from './index.ts';
import {
  getLocationFixture,
  getMapFixture,
  getMapStarlessFixture,
  getMapSystemFixture,
  getStatusDetainedFixture,
  getStatusFixture,
  nearbyBossFixture,
  nearbyFixture,
  payBountyFixture,
  playerProfileFixture,
  scanCreatureFixture,
  stationPoiInfoFixture,
  subscribeObservationFixture,
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
});

test('get_nearby pirate lines stay unprefixed when is_boss is false', () => {
  const stdout = renderStructuredResult('get_nearby', structuredClone(nearbyFixture), options, context).stdout.join(
    '\n',
  );

  expect(stdout).toContain('Raider (skiff) - Admiral Kael - hostile');
  expect(stdout).not.toContain('Boss ');
});

test('get_nearby prefixes Boss only on pirates with is_boss true', () => {
  const stdout = renderStructuredResult('get_nearby', structuredClone(nearbyBossFixture), options, context).stdout.join(
    '\n',
  );

  expect(stdout).toContain('Pirates (2):');
  expect(stdout).toContain('Raider (skiff) - Admiral Kael - hostile');
  expect(stdout).toContain('Boss Dreadnought (battleship) - Admiral Kael - hostile');
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

test('get_location prints nearby prizes after players and before pirate counts', () => {
  const stdout = renderStructuredResult(
    'get_location',
    structuredClone(getLocationFixture),
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('=== Location ===');
  expect(stdout).not.toContain('=== Nearby ===');
  assertCopyablePrizeIds(stdout, 'Nearby Prizes');
  const playersIdx = stdout.indexOf('Nearby Players');
  const prizesIdx = stdout.indexOf('Nearby Prizes');
  const piratesIdx = stdout.indexOf('Nearby Pirates');
  expect(prizesIdx).toBeGreaterThan(playersIdx);
  expect(piratesIdx).toBeGreaterThan(prizesIdx);
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

test('get_status prints personnel after Power and prize recoveries after nearby prizes', () => {
  const stdout = renderStructuredResult('get_status', structuredClone(getStatusFixture), options, context).stdout.join(
    '\n',
  );

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
