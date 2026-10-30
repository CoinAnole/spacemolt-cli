import { describe, expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import {
  documentedMissingRouteFixture,
  findRouteExampleMessage,
  findRouteHighValueFixture,
} from './find-route.fixtures.ts';
import { c, formatIntegerText } from './helpers.ts';
import { renderStructuredResult } from './index.ts';

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

const DOCUMENTED_NOT_FOUND = [
  'Route: not found',
  'Target: proxima',
  'Total jumps: 0',
  'Fuel per jump: 0',
  'Estimated fuel: 0',
  'Fuel available: 0',
  'Cargo used: 0',
  'No route found',
].join('\n');

const CONTRADICTORY_NULL_ROUTE = [
  'Route: not found',
  'Found: true',
  'Target: proxima',
  'Total jumps: 0',
  'Fuel per jump: 0',
  'Estimated fuel: 0',
  'Fuel available: 0',
  'Cargo used: 0',
  'No route found',
].join('\n');

const FIRST_STEP_WARNING = 'Wormhole on the first step has no previous system.';

function render(result: Record<string, unknown>, renderOptions: Partial<GlobalOptions> = {}, command = 'find_route') {
  return renderStructuredResult(command, structuredClone(result), { ...options, ...renderOptions }, context);
}

function stdoutOf(
  result: Record<string, unknown>,
  renderOptions: Partial<GlobalOptions> = {},
  command = 'find_route',
): string {
  return render(result, renderOptions, command).stdout.join('\n');
}

function section(stdout: string, heading: string): string {
  return (stdout.split(`=== ${heading} ===`)[1] ?? '').split('\n=== ')[0] ?? '';
}

function rowByText(stdout: string, heading: string, text: string): string {
  const line = section(stdout, heading)
    .split('\n')
    .find((entry) => entry.includes(text));
  if (!line) throw new Error(`missing row ${text} under ${heading}`);
  return line;
}

function cells(line: string): string[] {
  return line.split('|').map((cell) => cell.trim());
}

function cloneRoute(steps: Array<Record<string, unknown>>): Record<string, unknown> {
  const fixture = structuredClone(findRouteHighValueFixture);
  fixture.route = steps;
  return fixture;
}

function foundBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    found: true,
    route: [{ system_id: 'sol', name: 'Sol', jumps: 0 }],
    total_jumps: 0,
    target_system: 'sol',
    fuel_per_jump: 6,
    estimated_fuel: 0,
    fuel_available: 85,
    cargo_used: 18,
    message: 'Route found: 0 jump(s).',
    ...overrides,
  };
}

function fleetMember(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    player_id: 'pilot-1',
    username: 'Pilot',
    ship_class: 'Hull',
    fuel_per_jump: 6,
    estimated_fuel: 12,
    fuel_available: 85,
    fuel_on_arrival: 73,
    can_complete: true,
    ...overrides,
  };
}

describe('find_route formatter', () => {
  test('prints the found route, wormhole entrance, fuel, travel, and fleet rows', () => {
    const stdout = stdoutOf(findRouteHighValueFixture);
    expect(stdout).toContain('Route: found');
    expect(stdout).toContain('Total jumps: 2');
    expect(stdout).toContain('Fuel per jump: 6');
    expect(stdout).toContain('Estimated fuel: 12');
    expect(stdout).toContain('Fuel available: 85');
    expect(stdout).toContain('Cargo used: 18');
    expect(stdout).toContain('Then travel: Fomalhaut 4675g I (fomalhaut_4675g_i)');
    expect(stdout).toContain('VegaDrift');
    expect(stdout).toContain('OreHauler7');
    expect(stdout).toContain('-4');
    expect(stdout).toContain(findRouteExampleMessage);
    const hop = cells(rowByText(stdout, 'Route', 'Alpha Centauri'));
    expect(hop[3]).toBe('yes');
    expect(hop[4]).toBe('sol_wormhole_alpha');
    const short = cells(rowByText(stdout, 'Fleet Fuel', 'OreHauler7'));
    expect(short[6]).toBe('-4');
    expect(short[7]).toBe('no');
    expect(cells(rowByText(stdout, 'Fleet Fuel', 'VegaDrift'))[7]).toBe('yes');
  });

  test('prints Then travel: (empty) when target poi name and id are blank', () => {
    const stdout = stdoutOf(
      foundBody({
        target_poi_name: '',
        target_poi: '',
      }),
    );
    expect(stdout).toContain('Then travel: (empty)');
  });

  test('prints a name-only travel target without a parenthesized poi', () => {
    const stdout = stdoutOf(
      foundBody({
        target_poi_name: 'Cloudbank',
      }),
    );
    const line = stdout.split('\n').find((entry) => entry.startsWith('Then travel:'));
    expect(line).toBe('Then travel: Cloudbank');
    expect(line).not.toContain('(');
  });

  test('prints a poi-only travel target without a parenthesis', () => {
    const stdout = stdoutOf(
      foundBody({
        target_poi: 'belt_1',
      }),
    );
    const line = stdout.split('\n').find((entry) => entry.startsWith('Then travel:'));
    expect(line).toBe('Then travel: belt_1');
    expect(line).not.toContain('(');
    expect(line).not.toContain(')');
  });

  test('leaves wormhole and entrance blank when via_wormhole is omitted', () => {
    const fixture = structuredClone(findRouteHighValueFixture);
    const steps = fixture.route as Array<Record<string, unknown>>;
    for (const step of steps) {
      delete step.via_wormhole;
      delete step.entrance_poi;
    }
    const stdout = stdoutOf(fixture);
    const route = section(stdout, 'Route');
    expect(route).not.toContain('yes');
    expect(route).not.toContain('sol_wormhole_alpha');
    expect(stdout).toContain('Sol');
    expect(stdout).toContain('Alpha Centauri');
    expect(stdout).toContain('Tau Ceti');
    expect(cells(rowByText(stdout, 'Route', 'Alpha Centauri'))[3]).toBe('');
    expect(cells(rowByText(stdout, 'Route', 'Alpha Centauri'))[4]).toBe('');
  });

  test('prints no when via_wormhole is false', () => {
    const stdout = stdoutOf(
      cloneRoute([
        { system_id: 'sol', name: 'Sol', jumps: 0, via_wormhole: false },
        { system_id: 'alpha_centauri', name: 'Alpha Centauri', jumps: 1, via_wormhole: false },
      ]),
    );
    expect(cells(rowByText(stdout, 'Route', 'Alpha Centauri'))[3]).toBe('no');
  });

  test('warns when the first step is a wormhole and still prints its entrance', () => {
    const stdout = stdoutOf(
      foundBody({
        route: [
          { system_id: 'sol', name: 'Sol', jumps: 0, via_wormhole: true, entrance_poi: 'unexpected_mouth' },
          { system_id: 'proxima', name: 'Proxima', jumps: 1 },
        ],
        total_jumps: 1,
        target_system: 'proxima',
      }),
    );
    expect(stdout).toContain(FIRST_STEP_WARNING);
    expect(stdout).toContain('unexpected_mouth');
  });

  test('prints a missing first-step entrance before fleet fuel and the message', () => {
    const message = 'Fleet follows the route.';
    const stdout = stdoutOf(
      foundBody({
        route: [{ system_id: 'sol', name: 'Sol', jumps: 0, via_wormhole: true }],
        fleet_fuel: [fleetMember()],
        message,
      }),
    );
    expect(cells(rowByText(stdout, 'Route', 'Sol'))[4]).toBe('(missing)');
    expect(stdout).toContain(FIRST_STEP_WARNING);
    const warningAt = stdout.indexOf(FIRST_STEP_WARNING);
    const fleetAt = stdout.indexOf('=== Fleet Fuel ===');
    const messageAt = stdout.indexOf(message);
    expect(warningAt).toBeGreaterThan(-1);
    expect(warningAt).toBeLessThan(fleetAt);
    expect(fleetAt).toBeLessThan(messageAt);
  });

  test('prints a missing entrance on a later wormhole without the first-step warning', () => {
    const stdout = stdoutOf(
      foundBody({
        route: [
          { system_id: 'sol', name: 'Sol', jumps: 0 },
          { system_id: 'alpha', name: 'Alpha', jumps: 1, via_wormhole: true },
        ],
        total_jumps: 1,
        target_system: 'alpha',
      }),
    );
    expect(cells(rowByText(stdout, 'Route', 'Alpha'))[4]).toBe('(missing)');
    expect(stdout).not.toContain(FIRST_STEP_WARNING);
  });

  test('prints (empty) for a blank wormhole entrance', () => {
    for (const entrance of ['', '   ']) {
      const stdout = stdoutOf(
        foundBody({
          route: [{ system_id: 'sol', name: 'Sol', jumps: 0, via_wormhole: true, entrance_poi: entrance }],
        }),
      );
      expect(cells(rowByText(stdout, 'Route', 'Sol'))[4]).toBe('(empty)');
    }
  });

  test('prints (invalid) when a wormhole entrance is not a string', () => {
    const stdout = stdoutOf(
      foundBody({
        route: [{ system_id: 'sol', name: 'Sol', jumps: 0, via_wormhole: true, entrance_poi: 12 }],
      }),
    );
    expect(cells(rowByText(stdout, 'Route', 'Sol'))[4]).toBe('(invalid)');
  });

  test('prints no and (null) when a normal hop sends a null entrance', () => {
    const stdout = stdoutOf(
      foundBody({
        route: [{ system_id: 'sol', name: 'Sol', jumps: 0, via_wormhole: false, entrance_poi: null }],
      }),
    );
    const row = cells(rowByText(stdout, 'Route', 'Sol'));
    expect(row[3]).toBe('no');
    expect(row[4]).toBe('(null)');
  });

  test('prints (missing) when a wormhole entrance is null', () => {
    const stdout = stdoutOf(
      foundBody({
        route: [{ system_id: 'sol', name: 'Sol', jumps: 0, via_wormhole: true, entrance_poi: null }],
      }),
    );
    expect(cells(rowByText(stdout, 'Route', 'Sol'))[4]).toBe('(missing)');
  });

  test('keeps an entrance that arrived on a non-wormhole step', () => {
    const stdout = stdoutOf(
      foundBody({
        route: [{ system_id: 'sol', name: 'Sol', jumps: 0, via_wormhole: false, entrance_poi: 'still_visible' }],
      }),
    );
    expect(cells(rowByText(stdout, 'Route', 'Sol'))[4]).toBe('still_visible');
  });

  test('prints (invalid) for a non-boolean wormhole flag', () => {
    const stdout = stdoutOf(
      foundBody({
        route: [{ system_id: 'sol', name: 'Sol', jumps: 0, via_wormhole: 'yes' }],
      }),
    );
    expect(cells(rowByText(stdout, 'Route', 'Sol'))[3]).toBe('(invalid)');
  });

  test('prints the documented missing route without a hop table', () => {
    const rendered = render(documentedMissingRouteFixture);
    expect(rendered.success).toBe(true);
    expect(rendered.stdout.join('\n')).toBe(DOCUMENTED_NOT_FOUND);
    expect(rendered.stdout.join('\n')).not.toContain('Steps:');
    expect(rendered.stdout.join('\n')).not.toContain('=== Route ===');
    expect(rendered.stdout.join('\n')).not.toContain('(None)');
  });

  test('dims the server message in color mode', () => {
    const rendered = render(documentedMissingRouteFixture, { plain: false });
    const line = rendered.stdout.find((entry) => entry.includes('No route found'));
    expect(line).toBe(`${c.dim}No route found${c.reset}`);
  });

  test('prints a whitespace message unchanged and skips an empty or non-string message', () => {
    const whitespace = stdoutOf({ ...documentedMissingRouteFixture, message: '   ' });
    expect(whitespace.split('\n')).toContain('   ');
    const empty = stdoutOf({ ...documentedMissingRouteFixture, message: '' });
    expect(empty).toBe(DOCUMENTED_NOT_FOUND.replace('\nNo route found', ''));
    const objectMessage = stdoutOf({ ...documentedMissingRouteFixture, message: { note: 'MESSAGE_OBJECT' } });
    expect(objectMessage).not.toContain('MESSAGE_OBJECT');
    expect(objectMessage).toBe(DOCUMENTED_NOT_FOUND.replace('\nNo route found', ''));
  });

  test('prints found true with route null as the contradictory block', () => {
    const stdout = stdoutOf({ ...documentedMissingRouteFixture, found: true, route: null });
    expect(stdout).toBe(CONTRADICTORY_NULL_ROUTE);
    expect(stdout).not.toContain('Steps:');
  });

  test('prints Steps: 0 for a not-found empty route and no hop table', () => {
    const stdout = stdoutOf({ ...documentedMissingRouteFixture, route: [] });
    expect(stdout).toContain('Route: not found');
    expect(stdout.split('\n')).toContain('Steps: 0');
    expect(stdout).not.toContain('=== Route ===');
  });

  test('prints Steps: (none) for a found empty route and no hop table', () => {
    const stdout = stdoutOf({ ...documentedMissingRouteFixture, found: true, route: [] });
    expect(stdout).toContain('Route: found');
    expect(stdout.split('\n')).toContain('Steps: (none)');
    expect(stdout).not.toContain('=== Route ===');
    expect(stdout).not.toContain('(None)');
  });

  test('prints Found: yes for a non-boolean found with a null route and no Steps line', () => {
    const stdout = stdoutOf({ ...documentedMissingRouteFixture, found: 'yes', route: null });
    expect(stdout).toContain('Route: (invalid)');
    expect(stdout).toContain('Found: yes');
    expect(stdout.indexOf('Route: (invalid)')).toBeLessThan(stdout.indexOf('Found: yes'));
    expect(stdout.indexOf('Found: yes')).toBeLessThan(stdout.indexOf('Target:'));
    expect(stdout).not.toContain('Steps:');
  });

  test('prints Found: (null) when found is null and route is null', () => {
    const stdout = stdoutOf({ ...documentedMissingRouteFixture, found: null, route: null });
    expect(stdout).toContain('Route: (invalid)');
    expect(stdout).toContain('Found: (null)');
    expect(stdout).not.toContain('Steps:');
  });

  test('prints Found: (empty) for a blank found string', () => {
    for (const found of ['', '   ']) {
      const stdout = stdoutOf({ ...documentedMissingRouteFixture, found, route: null });
      expect(stdout.split('\n')[1]).toBe('Found: (empty)');
    }
  });

  test('prints a non-boolean found number with formatIntegerText', () => {
    const stdout = stdoutOf({ ...documentedMissingRouteFixture, found: 2, route: null });
    expect(stdout).toContain(`Found: ${formatIntegerText(2)}`);
  });

  test('prints Found: (invalid) for an object found value', () => {
    const stdout = stdoutOf({ ...documentedMissingRouteFixture, found: { ok: true }, route: null });
    expect(stdout).toContain('Found: (invalid)');
    expect(stdout).not.toContain('[object Object]');
  });

  test('prints the step table and first-step warning when found is not a boolean', () => {
    const stdout = stdoutOf({
      ...documentedMissingRouteFixture,
      found: 'yes',
      route: [{ system_id: 'sol', name: 'Sol', jumps: 0, via_wormhole: true, entrance_poi: 'mouth' }],
    });
    expect(stdout).toContain('Route: (invalid)');
    expect(stdout).toContain('Found: yes');
    expect(stdout).toContain('=== Route ===');
    expect(stdout).toContain(FIRST_STEP_WARNING);
    expect(stdout).toContain('mouth');
    expect(stdout).not.toContain('Steps:');
  });

  test('prints Steps: (invalid) when route is not an array', () => {
    const stdout = stdoutOf({ ...documentedMissingRouteFixture, found: 'yes', route: 'sol' });
    expect(stdout).toContain('Route: (invalid)');
    expect(stdout).toContain('Found: yes');
    expect(stdout.split('\n')).toContain('Steps: (invalid)');
    expect(stdout).not.toContain('=== Route ===');
    expect(stdout).not.toContain('sol');
  });

  test('prints Route: (omitted) and Steps: (invalid) for a non-array route with found omitted', () => {
    const body: Record<string, unknown> = { ...documentedMissingRouteFixture, route: 'sol' };
    delete body.found;
    const stdout = stdoutOf(body);
    expect(stdout).toContain('Route: (omitted)');
    expect(stdout.split('\n')).toContain('Steps: (invalid)');
  });

  test('prints Route: found and Steps: (invalid) for a found true non-array route', () => {
    const stdout = stdoutOf({ ...documentedMissingRouteFixture, found: true, route: 'sol' });
    expect(stdout.split('\n')).toContain('Route: found');
    expect(stdout.split('\n')).toContain('Steps: (invalid)');
  });

  test('prints Steps: (omitted) when a found route omits route', () => {
    const fixture = structuredClone(findRouteHighValueFixture);
    delete fixture.route;
    const stdout = stdoutOf(fixture);
    expect(stdout).toContain('Route: found');
    expect(stdout.split('\n')).toContain('Steps: (omitted)');
    expect(stdout).not.toContain('=== Route ===');
  });

  test('prints route status from route length when found is omitted', () => {
    const hop: Record<string, unknown> = {
      ...documentedMissingRouteFixture,
      route: [{ system_id: 'sol', name: 'Sol', jumps: 0 }],
    };
    delete hop.found;
    const hopStdout = stdoutOf(hop);
    expect(hopStdout).toContain('Route: found');
    expect(hopStdout).toContain('=== Route ===');

    const empty: Record<string, unknown> = { ...documentedMissingRouteFixture, route: [] };
    delete empty.found;
    const emptyStdout = stdoutOf(empty);
    expect(emptyStdout).toContain('Route: not found');
    expect(emptyStdout.split('\n')).toContain('Steps: 0');
  });

  test('claims a body that only has a message', () => {
    const rendered = render({ message: 'Only a message' });
    const stdout = rendered.stdout.join('\n');
    expect(rendered.success).toBe(true);
    expect(stdout).toContain('Route: (omitted)');
    expect(stdout).toContain('Target: (omitted)');
    expect(stdout).toContain('Total jumps: (omitted)');
    expect(stdout).toContain('Only a message');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('counts steps and skips the table when found is false', () => {
    const stdout = stdoutOf({
      ...documentedMissingRouteFixture,
      found: false,
      route: [
        { system_id: 'sol', name: 'SystemAlphaName', jumps: 0, via_wormhole: true, entrance_poi: 'mouth' },
        { system_id: 'proxima', name: 'SystemBetaName', jumps: 1 },
      ],
    });
    expect(stdout).toContain('Route: not found');
    expect(stdout.split('\n')).toContain('Steps: 2');
    expect(stdout).not.toContain('=== Route ===');
    expect(stdout).not.toContain('SystemAlphaName');
    expect(stdout).not.toContain('SystemBetaName');
    expect(stdout).not.toContain(FIRST_STEP_WARNING);
  });

  test('prints explicit zero fuel on a found one-step route', () => {
    for (const zero of [0, 0n]) {
      const stdout = stdoutOf(
        foundBody({
          fuel_per_jump: zero,
          estimated_fuel: zero,
          fuel_available: zero,
          cargo_used: zero,
          total_jumps: zero,
          route: [{ system_id: 'sol', name: 'Sol', jumps: zero }],
          fleet_fuel: [
            fleetMember({
              fuel_per_jump: zero,
              estimated_fuel: zero,
              fuel_available: zero,
              fuel_on_arrival: zero,
            }),
          ],
        }),
      );
      expect(stdout).toContain('Route: found');
      expect(stdout).toContain('Total jumps: 0');
      expect(stdout).toContain('Fuel per jump: 0');
      expect(stdout).toContain('Estimated fuel: 0');
      expect(stdout).toContain('Fuel available: 0');
      expect(stdout).toContain('Cargo used: 0');
      expect(cells(rowByText(stdout, 'Route', 'Sol'))[2]).toBe('0');
      const fleet = cells(rowByText(stdout, 'Fleet Fuel', 'Pilot'));
      expect(fleet[3]).toBe('0');
      expect(fleet[6]).toBe('0');
      expect(
        section(stdout, 'Route')
          .split('\n')
          .filter((line) => line.includes('|') && !line.includes('System')),
      ).toHaveLength(1);
    }
  });

  test('omits the fleet block when fleet_fuel is absent', () => {
    const fixture = structuredClone(findRouteHighValueFixture);
    delete fixture.fleet_fuel;
    expect(stdoutOf(fixture)).not.toContain('Fleet');
  });

  test('prints fleet fuel placeholders for empty, null, and non-array values', () => {
    expect(stdoutOf(foundBody({ fleet_fuel: [] }))).toContain('Fleet fuel: (none)');
    expect(stdoutOf(foundBody({ fleet_fuel: null }))).toContain('Fleet fuel: (null)');
    expect(stdoutOf(foundBody({ fleet_fuel: 'nope' }))).toContain('Fleet fuel: (invalid)');
    expect(stdoutOf(foundBody({ fleet_fuel: [] }))).not.toContain('=== Fleet Fuel ===');
  });

  test('prints negative, zero, and positive fuel on arrival from the server', () => {
    for (const arrival of [-4, 0, 14]) {
      const stdout = stdoutOf(
        foundBody({ fleet_fuel: [fleetMember({ fuel_on_arrival: arrival, can_complete: false })] }),
      );
      const arrivalCell = cells(rowByText(stdout, 'Fleet Fuel', 'Pilot'))[6];
      expect(arrivalCell).toBe(formatIntegerText(arrival));
      expect(arrivalCell).not.toContain('+');
    }
  });

  test('prints can_complete yes next to a negative arrival', () => {
    const stdout = stdoutOf(foundBody({ fleet_fuel: [fleetMember({ fuel_on_arrival: -4, can_complete: true })] }));
    const row = cells(rowByText(stdout, 'Fleet Fuel', 'Pilot'));
    expect(row[6]).toBe(formatIntegerText(-4));
    expect(row[7]).toBe('yes');
  });

  test('leaves an unknown ship class and a missing player name blank', () => {
    const member = fleetMember({ ship_class: '' });
    delete member.username;
    const stdout = stdoutOf(foundBody({ fleet_fuel: [member] }));
    const row = cells(rowByText(stdout, 'Fleet Fuel', 'pilot-1'));
    expect(row[0]).toBe('');
    expect(row[2]).toBe('');
    expect(stdout).not.toContain('unknown');
  });

  test('prints (null) in the player cell for a null fleet username', () => {
    const stdout = stdoutOf(foundBody({ fleet_fuel: [fleetMember({ username: null })] }));
    const row = cells(rowByText(stdout, 'Fleet Fuel', 'pilot-1'));
    expect(row[0]).toBe('(null)');
  });

  test('prints (invalid) in the player cell for a non-string fleet username', () => {
    const stdout = stdoutOf(foundBody({ fleet_fuel: [fleetMember({ username: 1 })] }));
    const row = cells(rowByText(stdout, 'Fleet Fuel', 'pilot-1'));
    expect(row[0]).toBe('(invalid)');
  });

  test('prints fleet rows that are not the caller without inventing a leader', () => {
    const stdout = stdoutOf(
      foundBody({
        fleet_fuel: [
          fleetMember({ username: 'NotTheCaller', player_id: 'other-1' }),
          fleetMember({ username: 'AlsoNotCaller', player_id: 'other-2', can_complete: false }),
        ],
      }),
    );
    const dataLines = section(stdout, 'Fleet Fuel')
      .split('\n')
      .filter((line) => line.includes('|') && !line.includes('Player'));
    expect(dataLines).toHaveLength(2);
    expect(dataLines[0]).toContain('NotTheCaller');
    expect(dataLines[1]).toContain('AlsoNotCaller');
    expect(stdout).not.toContain('Leader');
  });

  test('drops extra human fields and keeps them on json output', () => {
    const fixture = structuredClone(findRouteHighValueFixture);
    const firstStep = (fixture.route as Array<Record<string, unknown>>)[0];
    if (!firstStep) throw new Error('missing route step');
    firstStep.comment = 'STEP_COMMENT_TOKEN';
    fixture.debug_trace = 'DEBUG_TRACE_TOKEN';
    const human = stdoutOf(fixture);
    expect(human).not.toContain('STEP_COMMENT_TOKEN');
    expect(human).not.toContain('DEBUG_TRACE_TOKEN');
    const json = stdoutOf(fixture, { format: 'json' });
    expect(JSON.parse(json)).toEqual(fixture);
    expect(json).toContain('STEP_COMMENT_TOKEN');
    expect(json).toContain('DEBUG_TRACE_TOKEN');
  });

  test('prints bigint fuel with formatIntegerText and keeps the negative sign', () => {
    const fuel = 9007199254740993n;
    const arrival = -9007199254740993n;
    const stdout = stdoutOf(
      foundBody({
        fuel_per_jump: fuel,
        fleet_fuel: [fleetMember({ fuel_on_arrival: arrival, can_complete: false })],
      }),
    );
    const summary = stdout.split('\n').find((line) => line.startsWith('Fuel per jump: '));
    const fleetCell = cells(rowByText(stdout, 'Fleet Fuel', 'Pilot'))[6];
    expect(summary).toBe(`Fuel per jump: ${formatIntegerText(fuel)}`);
    expect(fleetCell).toBe(formatIntegerText(arrival));
    expect(summary?.replace(/\D/g, '')).toContain('9007199254740993');
    expect(fleetCell?.replace(/\D/g, '')).toContain('9007199254740993');
    expect(summary).not.toContain('9007199254740992');
    expect(fleetCell).not.toContain('9007199254740992');
    expect(fleetCell).toContain('-');
  });

  test('prints (omitted) for a missing jumps cell and never the token undefined', () => {
    const step: Record<string, unknown> = { system_id: 'sol', name: 'Sol' };
    const stdout = stdoutOf(foundBody({ route: [step] }));
    expect(cells(rowByText(stdout, 'Route', 'Sol'))[2]).toBe('(omitted)');
    expect(stdout).not.toContain('undefined');
  });

  test('prints (invalid) for a numeric-string arrival and for fuel available "0"', () => {
    const stdout = stdoutOf(
      foundBody({
        fuel_available: '0',
        fleet_fuel: [fleetMember({ fuel_on_arrival: '14' })],
      }),
    );
    expect(stdout).toContain('Fuel available: (invalid)');
    expect(cells(rowByText(stdout, 'Fleet Fuel', 'Pilot'))[6]).toBe('(invalid)');
  });

  test('prints (null) for a null fuel field', () => {
    const stdout = stdoutOf(foundBody({ fuel_per_jump: null }));
    expect(stdout).toContain('Fuel per jump: (null)');
  });

  test('prints one (invalid) row for a non-record route element', () => {
    const rendered = render(foundBody({ route: ['NOT_A_RECORD'] }));
    const stdout = rendered.stdout.join('\n');
    expect(rendered.success).toBe(true);
    expect(cells(rowByText(stdout, 'Route', '(invalid)'))[0]).toBe('(invalid)');
    expect(stdout).not.toContain('NOT_A_RECORD');
  });

  test('prints (invalid) in the Fleet Fuel player cell for a non-record fleet member', () => {
    const stdout = stdoutOf(foundBody({ fleet_fuel: ['nope'] }));
    expect(cells(rowByText(stdout, 'Fleet Fuel', '(invalid)'))[0]).toBe('(invalid)');
  });

  test('falls through to raw JSON when find_route has no route keys', () => {
    const stdout = stdoutOf({ unrelated: true });
    expect(stdout).toContain('=== Response ===');
    expect(stdout).not.toContain('Route:');
  });

  test('keeps the generic name and id table for every other command', () => {
    const stdout = stdoutOf(
      {
        route: [{ name: 'Sol', system_id: 'sol', via_wormhole: true, entrance_poi: 'mouth', jumps: 1 }],
        message: '2 jumps',
      },
      {},
      'probe_route_list',
    );
    expect(stdout).toContain('Name');
    expect(stdout).toContain('ID');
    expect(stdout).toContain('Sol');
    expect(stdout).toContain('sol');
    expect(stdout).not.toContain('mouth');
    expect(stdout).not.toContain('via_wormhole');
    expect(stdout).not.toContain('yes');
  });

  test('json, structured, and compact stringify the fixture instead of the table', () => {
    const fixture = structuredClone(findRouteHighValueFixture);
    const cases = [{ format: 'json' as const }, { structured: true }, { compact: true }];
    for (const renderOptions of cases) {
      const stdout = stdoutOf(fixture, renderOptions);
      expect(stdout).not.toContain('Route: found');
      expect(JSON.parse(stdout)).toEqual(fixture);
      if (renderOptions.compact) expect(stdout).not.toContain('\n');
    }
  });

  test('format text matches the table lines', () => {
    const table = stdoutOf(findRouteHighValueFixture);
    const text = stdoutOf(findRouteHighValueFixture, { format: 'text' });
    expect(text).toBe(table);
    expect(text).toContain('Route: found');
    expect(text).toContain('sol_wormhole_alpha');
  });

  test('yaml keeps wormhole and fleet fields', () => {
    const stdout = stdoutOf(findRouteHighValueFixture, { format: 'yaml' });
    expect(stdout).toContain('via_wormhole:');
    expect(stdout).toContain('fleet_fuel:');
    expect(stdout).not.toContain('Route: found');
  });
});
