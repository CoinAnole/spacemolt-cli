import { describe, expect, test } from 'bun:test';
import type { CliRuntimeContext } from './cli-context';
import { displayStructuredResult } from './client';
import { renderResult, renderStructuredResult } from './display';
import {
  activeMissionsFixture,
  browseShipsFixture,
  catalogItemsFixture,
  createSellOrderFixture,
  formatterFixtureCases,
  getLocationFixture,
  getStatusFixture,
  highValueCommandFixtures,
  missionsFixture,
  poiInfoFixture,
  storageFixture,
  viewMarketFixture,
  viewMarketSingleItemFixture,
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

const queueFixture = {
  queue: { has_pending: true },
};

const { create_sell_order: createMarketOrderFixtureCase, ...otherFormatterFixtureCases } = formatterFixtureCases;
const namedFormatterFixtureCases = {
  ...otherFormatterFixtureCases,
  create_market_order: createMarketOrderFixtureCase,
  direct_buy: {
    command: 'buy',
    fixture: {
      action: 'buy',
      item: 'Fuel',
      item_id: 'fuel',
      quantity: 10,
      total_cost: 21,
      unfilled: 3,
      delivered_to_cargo: 7,
      fills: [
        { quantity: 4, price_each: 3, subtotal: 12, source: 'station' },
        { quantity: 3, price_each: 3, subtotal: 9, source: 'player' },
      ],
      auto_listed: {
        order_id: 'auto-buy-1',
        quantity: 3,
        price_each: 4,
        escrow: 12,
        listing_fee: 1,
      },
      level_up: false,
      message: 'Bought items.',
    },
  },
  direct_sell: {
    command: 'sell',
    fixture: {
      action: 'sell',
      item: 'Iron Ore',
      item_id: 'iron_ore',
      quantity_sold: 6,
      total_earned: 90,
      unsold: 4,
      fills: [
        { quantity: 5, price_each: 15, subtotal: 75, source: 'station' },
        { quantity: 1, price_each: 15, subtotal: 15, source: 'player' },
      ],
      auto_listed: {
        order_id: 'auto-sell-1',
        quantity: 4,
        price_each: 20,
        listing_fee: 2,
      },
      level_up: false,
      message: 'Sold items.',
    },
  },
};

const playerProfileFixture = {
  player: {
    username: 'Marlowe',
    credits: 4242,
    empire: 'Terran',
    citizenships: {
      solarian: { empire_id: 'solarian', granted_by: 'origin', granted_at: '2026-05-13T00:00:00.000Z' },
      nebula: { empire_id: 'nebula', granted_by: 'petition:cit-1', granted_at: '2026-05-14T00:00:00.000Z' },
    },
    faction_id: 'smc',
    clan_tag: 'SMC',
    home_base: 'earth_station',
    standings: {
      crimson: { baseline: 10, outstanding_bounty: 0, reputation: 94 },
      nebula: { baseline: 20, outstanding_bounty: 0, reputation: 20 },
      pirates: { baseline: 0, outstanding_bounty: 2500, reputation: -30 },
    },
    stats: {
      piloting: { level: 5, xp: 1200 },
      crafting: { level: 2, xp: 175 },
    },
  },
};

const chatHistoryFixture = {
  channel: 'local',
  has_more: true,
  messages: [
    {
      id: 'chat-1',
      sender: 'Ibis',
      content: 'Clear skies over Sol today.',
      timestamp: '2026-05-23T15:04:05.000Z',
    },
    {
      id: 'chat-2',
      sender: 'Solarian Confederacy',
      sender_id: 'solarian',
      empire_official: true,
      content: 'Treasury payment processed.',
      timestamp: '2026-05-23T15:05:05.000Z',
    },
  ],
};

const captainsLogListFixture = {
  entry: {
    index: 0,
    created_at: '2026-05-23T15:04:05.000Z',
    entry: 'Found an old beacon.\nThe signal repeats every seven ticks.',
  },
  has_next: true,
};

const actionLogFixture = {
  category: 'combat',
  has_more: true,
  entries: [
    {
      id: 'event-1',
      created_at: '2026-05-23T15:04:05.000Z',
      summary: 'Destroyed pirate skiff near Earth.',
      category: 'combat',
      event_type: 'pirate_destroyed',
    },
  ],
};

const emptyNotificationsFixture = {
  count: 0,
  current_tick: 900683,
  notifications: null,
  remaining: 0,
  timestamp: 1779562779,
};

const notificationsFixture = {
  count: 2,
  current_tick: 900684,
  notifications: [
    {
      type: 'system',
      msg_type: 'system',
      data: { message: 'Server maintenance scheduled.' },
      timestamp: '2026-05-23T18:59:39.049Z',
    },
    {
      type: 'chat',
      msg_type: 'chat_message',
      data: { channel: 'local', sender: 'Ibis', content: 'Clear skies over Sol today.' },
      timestamp: '2026-05-23T19:01:02.000Z',
    },
  ],
  remaining: 0,
  timestamp: 1779562862,
};

function nearbyPlayers(count: number): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, index) => ({
    username: `Pilot ${index + 1}`,
    player_id: `player_${index + 1}`,
    ship_class: 'prospector',
  }));
}

function nearbyNpcs(count: number): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, index) => ({
    name: `Patrol ${index + 1}`,
    npc_id: `npc_${index + 1}`,
    ship_class: 'interceptor',
  }));
}

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

  test('--field resolves unique bare names one level under structured content', () => {
    const { stdout, stderr } = captureStructuredOutput(
      'get_status',
      { ...outputModeFixture, player: { name: 'Marlowe', credits: 4242 } },
      {
        field: 'credits',
      },
    );

    expect(stderr).toBe('');
    expect(stdout).toBe('4242');
  });

  test('--field prefers exact top-level matches before bare-name fallback', () => {
    const { stdout, stderr } = captureStructuredOutput(
      'get_status',
      { ...outputModeFixture, credits: 99 },
      {
        field: 'credits',
      },
    );

    expect(stderr).toBe('');
    expect(stdout).toBe('99');
  });

  test('--field fails on ambiguous bare-name fallback matches', () => {
    const rendered = renderStructuredResult(
      'get_status',
      {
        player: { credits: 4242 },
        faction: { credits: 9000 },
      },
      globalOptions({ field: 'credits' }),
    );

    expect(rendered.success).toBe(false);
    expect(rendered.stdout).toEqual([]);
    expect(rendered.stderr.join('\n').replace(ANSI_PATTERN, '')).toContain(
      'Ambiguous field "credits". Use one of: faction.credits, player.credits',
    );
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

  test('--jq supports array index bracket notation', () => {
    const { stdout, stderr } = captureStructuredOutput('view_market', outputModeFixture, {
      jq: '.items[0].quantity',
    });

    expect(stderr).toBe('');
    expect(stdout).toBe('5');
  });

  test('--jq suggests object keys when bracket notation targets an object', () => {
    const rendered = renderStructuredResult(
      'get_skills',
      {
        skills: {
          Combat: [{ name: 'Gunnery' }],
          Commerce: [{ name: 'Trading' }],
          Industry: [{ name: 'Mining' }],
        },
      },
      globalOptions({ jq: '.skills[0]' }),
    );

    expect(rendered.success).toBe(false);
    expect(rendered.stdout).toEqual([]);
    expect(rendered.stderr.join('\n').replace(ANSI_PATTERN, '')).toContain(
      'Error: Expected array at path "skills", got object with keys: Combat, Commerce, Industry',
    );
  });

  test('--jq rejects comma-separated expressions instead of silently returning null', () => {
    const rendered = renderStructuredResult(
      'get_status',
      outputModeFixture,
      globalOptions({ jq: '.ship.fuel, .ship.class_name' }),
    );

    expect(rendered.success).toBe(false);
    expect(rendered.stdout).toEqual([]);
    expect(rendered.stderr.join('\n').replace(ANSI_PATTERN, '')).toContain(
      'Error: --jq does not support multiple values',
    );
  });

  test('--jq rejects whitespace-separated expressions instead of silently returning null', () => {
    const rendered = renderStructuredResult(
      'get_status',
      outputModeFixture,
      globalOptions({ jq: '.ship.fuel .ship.class_name' }),
    );

    expect(rendered.success).toBe(false);
    expect(rendered.stdout).toEqual([]);
    expect(rendered.stderr.join('\n').replace(ANSI_PATTERN, '')).toContain('Unsupported jq expression');
  });

  test('--jq reports missing paths while preserving existing null values', () => {
    const missing = renderStructuredResult(
      'get_status',
      outputModeFixture,
      globalOptions({ jq: '.ship.fuel_capacity' }),
    );
    const existingNull = renderStructuredResult(
      'get_status',
      { ...outputModeFixture, ship: { ...outputModeFixture.ship, fuel_capacity: null } },
      globalOptions({ jq: '.ship.fuel_capacity' }),
    );

    expect(missing.success).toBe(false);
    expect(missing.stdout).toEqual([]);
    expect(missing.stderr.join('\n').replace(ANSI_PATTERN, '')).toContain('Path not found: ".ship.fuel_capacity"');
    expect(existingNull.success).toBe(true);
    expect(existingNull.stderr).toEqual([]);
    expect(existingNull.stdout).toEqual(['null']);
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

  test('--structured outputs only structuredContent as JSON', async () => {
    const { stdout, stderr, exitCode } = await captureRenderedOutput(
      {
        result: 'large rendered table',
        structuredContent: outputModeFixture,
        session: {
          id: 'session-1',
          player_id: 'player-1',
          created_at: '2026-05-19T12:00:00.000Z',
          expires_at: '2026-05-19T12:30:00.000Z',
        },
        notifications: [
          {
            type: 'info',
            msg_type: 'notice',
            data: { message: 'hello' },
            timestamp: '2026-05-19T12:01:00.000Z',
          },
        ],
      },
      { structured: true },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toEqual(outputModeFixture);
    expect(stdout).not.toContain('large rendered table');
    expect(stdout).not.toContain('session-1');
    expect(stdout).not.toContain('notifications');
  });

  test('--structured --compact outputs compact structuredContent JSON', async () => {
    const { stdout, stderr, exitCode } = await captureRenderedOutput(
      { result: 'large rendered table', structuredContent: outputModeFixture },
      { structured: true, compact: true },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toBe('{"player":{"name":"Marlowe"},"ship":{"fuel":42},"items":[{"id":"ore_iron","quantity":5}]}');
  });

  test('--structured --fields projects from structuredContent', async () => {
    const { stdout, stderr, exitCode } = await captureRenderedOutput(
      { result: 'large rendered table', structuredContent: outputModeFixture },
      { structured: true, fields: ['player'] },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toEqual({ player: { name: 'Marlowe' } });
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

  test('ambiguous --field projection exits nonzero without stdout', async () => {
    const { stdout, stderr, exitCode } = await captureRenderedOutput(
      {
        structuredContent: {
          player: { credits: 4242 },
          faction: { credits: 9000 },
        },
      },
      { field: 'credits' },
    );

    expect(exitCode).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toContain('Ambiguous field "credits". Use one of: faction.credits, player.credits');
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

  test('yaml output truncates nearby player and NPC collections without losing totals', () => {
    const result = {
      ...getStatusFixture,
      location: {
        ...getStatusFixture.location,
        nearby_players: nearbyPlayers(12),
        nearby_empire_npcs: nearbyNpcs(13),
      },
    };

    const rendered = renderStructuredResult('get_status', result, globalOptions({ format: 'yaml' }));
    const yaml = rendered.stdout.join('\n');

    expect(rendered.success).toBe(true);
    expect(yaml).toContain('nearby_player_count: 12');
    expect(yaml).toContain('nearby_empire_npc_count: 13');
    expect(yaml).toContain('username: "Pilot 10"');
    expect(yaml).not.toContain('username: "Pilot 11"');
    expect(yaml).toContain('name: "Patrol 10"');
    expect(yaml).not.toContain('name: "Patrol 11"');
    expect(result.location.nearby_players).toHaveLength(12);
    expect(result.location.nearby_empire_npcs).toHaveLength(13);
  });

  test('pure structured renderer formats text as table output and compact output', () => {
    const text = renderStructuredResult('get_status', outputModeFixture, globalOptions({ format: 'text' }));
    const table = renderStructuredResult('get_status', outputModeFixture, globalOptions({ format: 'table' }));
    const compact = renderStructuredResult('get_status', outputModeFixture, globalOptions({ compact: true }));

    expect(text.stdout).toEqual(table.stdout);
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

  test('formats queue state without raw JSON fallback', () => {
    const { stdout, stderr } = captureStructuredOutput('get_queue', queueFixture);

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Queue ===');
    expect(stdout).toContain('Queue: 1 action pending');
    expect(stdout).not.toContain('=== Response ===');

    const empty = captureStructuredOutput('get_queue', { queue: { has_pending: false } });
    expect(empty.stderr).toBe('');
    expect(empty.stdout).toContain('Queue: empty');
    expect(empty.stdout).not.toContain('=== Response ===');
  });

  test('formats player profile summary without raw JSON fallback', () => {
    const { stdout, stderr } = captureStructuredOutput('get_player', playerProfileFixture);

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Player ===');
    expect(stdout).toContain('Username: Marlowe');
    expect(stdout).toContain('Credits: 4,242');
    expect(stdout).toContain('Citizenships: solarian, nebula');
    expect(stdout).toContain('Faction: smc [SMC]');
    expect(stdout).toContain('Home Base: earth_station');
    expect(stdout).toContain('Piloting: Level 5 (1200 XP)');
    expect(stdout).toContain('Crafting: Level 2 (175 XP)');
    expect(stdout).toContain('crimson: 94');
    expect(stdout).toContain('nebula: 20');
    expect(stdout).toContain('pirates: -30');
    expect(stdout).not.toContain('[object Object]');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('formats chat history as a chat log without raw JSON fallback', () => {
    const { stdout, stderr } = captureStructuredOutput('get_chat_history', chatHistoryFixture);

    expect(stderr).toBe('');
    expect(stdout).toContain('channel local');
    expect(stdout).toContain('=== Messages ===');
    expect(stdout).toContain('Timestamp');
    expect(stdout).toContain('2026-05-23 15:04:05');
    expect(stdout).toContain('Ibis');
    expect(stdout).toContain('Solarian Confederacy [empire_official]');
    expect(stdout).toContain('Clear skies over Sol today.');
    expect(stdout).toContain('More messages available.');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('formats captain log list entries without raw JSON fallback', () => {
    const { stdout, stderr } = captureStructuredOutput('captains_log_list', captainsLogListFixture);

    expect(stderr).toBe('');
    expect(stdout).toContain('log captain');
    expect(stdout).toContain('=== Entries ===');
    expect(stdout).toContain('Index');
    expect(stdout).toContain('2026-05-23 15:04:05');
    expect(stdout).toContain('Found an old beacon.');
    expect(stdout).toContain('More entries available.');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('formats action log entries without raw JSON fallback', () => {
    const { stdout, stderr } = captureStructuredOutput('get_action_log', actionLogFixture);

    expect(stderr).toBe('');
    expect(stdout).toContain('category combat');
    expect(stdout).toContain('=== Entries ===');
    expect(stdout).toContain('Timestamp');
    expect(stdout).toContain('2026-05-23 15:04:05');
    expect(stdout).toContain('Destroyed pirate skiff near Earth.');
    expect(stdout).toContain('combat');
    expect(stdout).toContain('More entries available.');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('formats empty notifications without raw JSON fallback', () => {
    const { stdout, stderr } = captureStructuredOutput('notifications', emptyNotificationsFixture);

    expect(stderr).toBe('');
    expect(stdout).toBe('No new notifications.');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('formats notifications as text when --format=text is used', async () => {
    const { stdout, stderr, exitCode } = await captureRenderedOutput(
      { result: notificationsFixture },
      { format: 'text' },
      { command: 'notifications', displayCommand: 'notifications' },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain('count 2');
    expect(stdout).toContain('=== Notifications ===');
    expect(stdout).toContain('2026-05-23 18:59:39');
    expect(stdout).toContain('system');
    expect(stdout).toContain('Server maintenance scheduled.');
    expect(stdout).toContain('chat_message');
    expect(stdout).toContain('Ibis: Clear skies over Sol today.');
    expect(stdout).not.toContain('=== Response ===');
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


      === Items ===

        Item      | ID        | Best Buy | Buy Depth | Best Sell | Sell Depth
        ----------+-----------+----------+-----------+-----------+-----------
        Iron Ore  | ore_iron  | 15 cr    | 575 / 2   | 18 cr     | 15 / 2    
        Fuel Cell | fuel_cell |          |           |           |           

      Depth columns show quantity / orders at the best price.
      Use spacemolt view_market <item_id> for full order depth."
    `);
  });

  test('formats single-item market lookups with full order depth', () => {
    const { stdout, stderr } = captureStructuredOutput('view_market', viewMarketSingleItemFixture);

    expect(stderr).toBe('');
    expect(stdout).toMatchInlineSnapshot(`
      "
      === Market at earth_station ===

      Iron Ore
        Buy orders (3):
          15 cr x 500
          15 cr x 75
          12 cr x 900
        Sell orders (3):
          18 cr x 5
          18 cr x 10
          75 cr x 1,000
      "
    `);
  });

  test('omits malformed single-item market depth numbers instead of printing NaN', () => {
    const { stdout, stderr } = captureStructuredOutput('view_market', {
      action: 'view_market',
      base_id: 'earth_station',
      items: [
        {
          item_name: 'Iron Ore',
          item_id: 'iron_ore',
          buy_orders: [{ price_each: 'not-a-number', quantity: 5 }],
          sell_orders: [{ price_each: 18, quantity: 'bad-quantity' }],
        },
      ],
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('Buy orders (1):');
    expect(stdout).toContain('? cr x 5');
    expect(stdout).toContain('Sell orders (1):');
    expect(stdout).toContain('18 cr x ?');
    expect(stdout).not.toContain('NaN');
  });

  test('formats created sell order with listing fee', () => {
    const { stdout, stderr } = captureStructuredOutput('create_sell_order', createSellOrderFixture);

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Sell Order Created ===');
    expect(stdout).toContain('Item: Iron Ore (iron_ore)');
    expect(stdout).toContain('Requested: 1');
    expect(stdout).toContain('Remaining listed: 1');
    expect(stdout).toContain('Price each: 999,999 cr');
    expect(stdout).toContain('Listing fee: 19,999 cr');
    expect(stdout).toContain('Order ID: order-sell-1');
  });

  test('formats created sell order with partial instant fills', () => {
    const { stdout, stderr } = captureStructuredOutput('create_sell_order', {
      action: 'create_sell_order',
      item: 'Contained Enriched Uranium Rod',
      item_id: 'contained_enriched_uranium_rod',
      quantity: 14,
      price_each: 24001,
      quantity_filled: 13,
      quantity_listed: 1,
      total_earned: 430000,
      listing_fee: 360,
      order_id: 'order-sell-partial',
      message: 'Created sell order.',
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('Requested: 14');
    expect(stdout).toContain('Instant fills: 13 (earned: 430,000 cr)');
    expect(stdout).toContain('Remaining listed: 1');
    expect(stdout).not.toContain('Quantity listed:');
  });

  test('formats created sell order with full instant fill without treating requested quantity as listed', () => {
    const { stdout, stderr } = captureStructuredOutput('create_sell_order', {
      action: 'create_sell_order',
      item: 'Contained Enriched Uranium Rod',
      item_id: 'contained_enriched_uranium_rod',
      quantity: 20,
      price_each: 24001,
      quantity_filled: 20,
      listing_fee: 0,
      order_id: 'order-sell-full',
      message: 'Created sell order.',
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('Requested: 20');
    expect(stdout).toContain('Instant fills: 20');
    expect(stdout).toContain('Remaining listed: 0');
    expect(stdout).not.toContain('Quantity listed: 20');
  });

  test('formats created buy order with buy-specific instant fill output', () => {
    const { stdout, stderr } = captureStructuredOutput('create_buy_order', {
      action: 'create_buy_order',
      item: 'Iron Ore',
      item_id: 'iron_ore',
      quantity: 10,
      price_each: 5,
      quantity_filled: 4,
      quantity_listed: 6,
      total_spent: 20,
      total_escrowed: 30,
      remaining_escrowed: 30,
      listing_fee: 1,
      delivered_to_cargo: 4,
      order_id: 'order-buy-1',
      fills: [{ quantity: 4, subtotal: 20, price_each: 5 }],
      message: 'Created buy order.',
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Buy Order Created ===');
    expect(stdout).toContain('Item: Iron Ore (iron_ore)');
    expect(stdout).toContain('Requested: 10');
    expect(stdout).toContain('Instant fills: 4 (spent: 20 cr)');
    expect(stdout).toContain('Delivered to cargo: 4');
    expect(stdout).toContain('Remaining open: 6');
    expect(stdout).toContain('Total escrowed: 30 cr');
    expect(stdout).toContain('Remaining escrowed: 30 cr');
    expect(stdout).toContain('Listing fee: 1 cr');
    expect(stdout).toContain('Order ID: order-buy-1');
    expect(stdout).not.toContain('Sell Order Created');
    expect(stdout).not.toContain('earned:');
  });

  test('formats faction created buy order without sell wording', () => {
    const { stdout, stderr } = captureStructuredOutput('faction_create_buy_order', {
      action: 'create_buy_order',
      item: 'Fuel',
      item_id: 'fuel',
      quantity: 100,
      price_each: 3,
      quantity_filled: 0,
      quantity_listed: 100,
      total_spent: 0,
      total_escrowed: 300,
      remaining_escrowed: 300,
      listing_fee: 6,
      order_id: 'faction-buy-1',
      message: 'Created buy order.',
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Buy Order Created ===');
    expect(stdout).toContain('Remaining open: 100');
    expect(stdout).not.toContain('Sell Order Created');
    expect(stdout).not.toContain('earned:');
  });

  test('formats faction created sell order with sell wording', () => {
    const { stdout, stderr } = captureStructuredOutput('faction_create_sell_order', {
      action: 'create_sell_order',
      item: 'Fuel',
      item_id: 'fuel',
      quantity: 100,
      price_each: 4,
      quantity_filled: 25,
      quantity_listed: 75,
      total_earned: 100,
      listing_fee: 8,
      order_id: 'faction-sell-1',
      message: 'Created sell order.',
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Sell Order Created ===');
    expect(stdout).toContain('Instant fills: 25 (earned: 100 cr)');
    expect(stdout).toContain('Remaining listed: 75');
  });

  test('formats direct sell fills and auto-listed leftovers', () => {
    const { stdout, stderr } = captureStructuredOutput('sell', {
      action: 'sell',
      item: 'Iron Ore',
      item_id: 'iron_ore',
      quantity_sold: 6,
      total_earned: 90,
      unsold: 4,
      fills: [
        { quantity: 5, price_each: 15, subtotal: 75, source: 'station' },
        { quantity: 1, price_each: 15, subtotal: 15, source: 'player' },
      ],
      auto_listed: {
        order_id: 'auto-sell-1',
        quantity: 4,
        price_each: 20,
        listing_fee: 2,
      },
      level_up: false,
      message: 'Sold items.',
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Sell Complete ===');
    expect(stdout).toContain('Item: Iron Ore (iron_ore)');
    expect(stdout).toContain('Sold: 6');
    expect(stdout).toContain('Instant fills: 6 (earned: 90 cr)');
    expect(stdout).toContain('Unsold: 4');
    expect(stdout).toContain('Auto-listed: 4 @ 20 cr');
    expect(stdout).toContain('Listing fee: 2 cr');
    expect(stdout).toContain('Order ID: auto-sell-1');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('does not format sparse sell messages as direct market sells', () => {
    const { stdout, stderr } = captureStructuredOutput('sell', {
      message: 'Sold items.',
    });

    expect(stderr).toBe('');
    expect(stdout).not.toContain('=== Sell Complete ===');
    expect(stdout).not.toContain('Item: unknown');
    expect(stdout).toContain('Sold items.');
  });

  test('does not format wreck sales as direct market sells', () => {
    const { stdout, stderr } = captureStructuredOutput('sell_wreck', {
      action: 'sell',
      wreck_id: 'wreck-1',
      credits_earned: 500,
      message: 'Sold wreck.',
    });

    expect(stderr).toBe('');
    expect(stdout).not.toContain('=== Sell Complete ===');
    expect(stdout).not.toContain('Item: unknown');
    expect(stdout).toContain('wreck-1');
  });

  test('formats direct buy fills, delivery, and auto-listed unfilled quantity', () => {
    const { stdout, stderr } = captureStructuredOutput('buy', {
      action: 'buy',
      item: 'Fuel',
      item_id: 'fuel',
      quantity: 10,
      total_cost: 21,
      unfilled: 3,
      delivered_to_cargo: 7,
      fills: [
        { quantity: 4, price_each: 3, subtotal: 12, source: 'station' },
        { quantity: 3, price_each: 3, subtotal: 9, source: 'player' },
      ],
      auto_listed: {
        order_id: 'auto-buy-1',
        quantity: 3,
        price_each: 4,
        escrow: 12,
        listing_fee: 1,
      },
      level_up: false,
      message: 'Bought items.',
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Buy Complete ===');
    expect(stdout).toContain('Item: Fuel (fuel)');
    expect(stdout).toContain('Requested: 10');
    expect(stdout).toContain('Filled: 7');
    expect(stdout).toContain('Instant fills: 7 (spent: 21 cr)');
    expect(stdout).toContain('Delivered to cargo: 7');
    expect(stdout).toContain('Unfilled: 3');
    expect(stdout).toContain('Auto-listed: 3 @ 4 cr');
    expect(stdout).toContain('Escrow: 12 cr');
    expect(stdout).toContain('Listing fee: 1 cr');
    expect(stdout).toContain('Order ID: auto-buy-1');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('does not format sparse buy messages as direct market buys', () => {
    const { stdout, stderr } = captureStructuredOutput('buy', {
      message: 'Bought items.',
    });

    expect(stderr).toBe('');
    expect(stdout).not.toContain('=== Buy Complete ===');
    expect(stdout).not.toContain('Item: unknown');
    expect(stdout).toContain('Bought items.');
  });

  test('does not format cancelled orders as created sell orders', () => {
    const { stdout, stderr } = captureStructuredOutput('cancel_order', {
      action: 'cancel_order',
      order_id: 'order-sell-1',
      message: 'Order cancelled.',
    });

    expect(stderr).toBe('');
    expect(stdout).not.toContain('=== Sell Order Created ===');
    expect(stdout).not.toContain('Item: unknown');
    expect(stdout).toContain('cancel_order');
    expect(stdout).toContain('order-sell-1');
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
    expect(stdout).toContain('=== Listings ===');
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
    expect(stdout).toContain('(Showing 2 of 537 items. Use --page 2 for more results.)');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('catalog recipe responses warn when pagination hides more results', () => {
    const { stdout, stderr } = captureStructuredOutput('catalog', {
      recipes: [{ id: 'repair_patch', name: 'Repair Patch' }],
      page: 1,
      page_size: 20,
      total: 3,
      total_pages: 2,
      type: 'recipes',
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Recipes ===');
    expect(stdout).toContain('(Showing 1 of 3 recipes. Use --page 2 for more results.)');
  });

  test('--structured catalog output keeps JSON stdout and writes truncation warning to stderr', async () => {
    const { stdout, stderr, exitCode } = await captureRenderedOutput(
      { structuredContent: catalogItemsFixture },
      { structured: true },
      { command: 'catalog', displayCommand: 'catalog' },
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual(catalogItemsFixture);
    expect(stderr).toBe('(Showing 2 of 537 items. Use --page 2 for more results.)');
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
    expect(stdout).toContain('=== Items ===');
    expect(stdout).toContain('T4 Ore Refinery');
    expect(stdout).toContain('passive_refine_iron_ore, passive_refine_solar_crystal');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('table output keeps structured collection names stable', () => {
    const cases: Array<{
      command: string;
      fixture: Record<string, unknown>;
      expected: string;
      unexpected?: string;
    }> = [
      {
        command: 'get_cargo',
        fixture: { cargo: [{ item_id: 'ore_iron', quantity: 4 }] },
        expected: 'Cargo (1):',
        unexpected: 'Items (1):',
      },
      {
        command: 'view_market',
        fixture: viewMarketFixture,
        expected: '=== Items ===',
        unexpected: '=== Market Summary ===',
      },
      {
        command: 'view_orders',
        fixture: { orders: [{ order_id: 'order-1', item_id: 'ore_iron', side: 'buy', quantity: 5 }] },
        expected: '=== Orders ===',
        unexpected: '=== Market Orders ===',
      },
      {
        command: 'commission_status',
        fixture: { commissions: [{ commission_id: 'commission-1', ship_class_id: 'prospector' }] },
        expected: '=== Commissions ===',
        unexpected: '=== Ship Commissions ===',
      },
      {
        command: 'get_trades',
        fixture: { listings: [{ listing_id: 'listing-1', item_id: 'ore_iron', quantity: 5, price_each: 12 }] },
        expected: '=== Listings ===',
        unexpected: '=== Market Listings ===',
      },
      {
        command: 'catalog',
        fixture: {
          items: [{ id: 't4_ore_refinery', name: 'T4 Ore Refinery', type: 'ship' }],
          type: 'ships',
        },
        expected: '=== Items ===',
        unexpected: '=== Ships ===',
      },
      {
        command: 'get_chat_history',
        fixture: chatHistoryFixture,
        expected: '=== Messages ===',
        unexpected: '=== Chat: local ===',
      },
      {
        command: 'captains_log_list',
        fixture: captainsLogListFixture,
        expected: '=== Entries ===',
        unexpected: "=== Captain's Log ===",
      },
      {
        command: 'get_action_log',
        fixture: actionLogFixture,
        expected: '=== Entries ===',
        unexpected: '=== Action Log: combat ===',
      },
      {
        command: 'notifications',
        fixture: notificationsFixture,
        expected: '=== Notifications ===',
        unexpected: '=== Notifications (2) ===',
      },
      {
        command: 'facility_types',
        fixture: { categories: { production: { count: 2, buildable: true } }, total: 2 },
        expected: '=== Categories ===',
        unexpected: '=== Facility Type Categories ===',
      },
      {
        command: 'fleet_status',
        fixture: { fleet: { fleet_id: 'fleet-1', members: [{ username: 'Ibis', player_id: 'player-1' }] } },
        expected: '=== Members ===',
        unexpected: '=== Fleet Members ===',
      },
    ];

    for (const { command, fixture, expected, unexpected } of cases) {
      const { stdout, stderr } = captureStructuredOutput(command, fixture);
      expect(stderr, command).toBe('');
      expect(stdout, command).toContain(expected);
      if (unexpected) expect(stdout, command).not.toContain(unexpected);
    }
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
    expect(stdout).toContain('=== Items ===');
    expect(stdout).toContain('=== Passive Recipes ===');
    expect(stdout).toContain('Passive Iron Refining');
    expect(stdout).toContain('ship passive');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('facility_list formats grouped facility responses', () => {
    const { stdout, stderr } = captureStructuredOutput('facility_list', {
      base_id: 'earth_station',
      power: {
        supply: 120,
        structural_draw: 95,
        battery_stored: 420,
        battery_capacity: 600,
        efficiency: 0.85,
      },
      construction: {
        pending: [
          {
            definition_id: 'life_support_mk2',
            name: 'Life Support Mk II',
            category: 'infrastructure',
            status: 'gathering_materials',
            materials: [
              {
                item_id: 'circuit_board',
                name: 'Circuit Board',
                quantity_required: 40,
                quantity_in_storage: 12,
                quantity_missing: 28,
              },
            ],
          },
        ],
        under_construction: [
          {
            definition_id: 'battery_bank_mk1',
            name: 'Battery Bank Mk I',
            category: 'infrastructure',
            status: 'building',
            ticks_until_complete: 9,
          },
        ],
      },
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
    expect(stdout).toContain('Power: 95/120 draw (85% efficiency)');
    expect(stdout).toContain('Battery: 420/600');
    expect(stdout).toContain('=== Construction ===');
    expect(stdout).toContain('Life Support Mk II');
    expect(stdout).toContain('28 missing');
    expect(stdout).toContain('Battery Bank Mk I');
    expect(stdout).toContain('9 ticks');
    expect(stdout).toContain('=== Station Facilities ===');
    expect(stdout).toContain('Fuel Bunker');
    expect(stdout).toContain('=== Player Facilities ===');
    expect(stdout).toContain('Ore Refinery');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('get_base formats station power and construction state', () => {
    const { stdout, stderr } = captureStructuredOutput('get_base', {
      base: {
        id: 'earth_station',
        name: 'Earth Station',
        poi_id: 'earth_station',
        empire: 'solarian',
        defense_level: 100,
        fuel: 1200,
        max_fuel: 2400,
        has_drones: true,
        public_access: true,
      },
      services: ['market', 'storage'],
      condition: {
        condition: 'stable',
        condition_text: 'All systems nominal.',
        satisfaction_pct: 100,
        satisfied_count: 4,
        total_service_infra: 4,
      },
      power: {
        supply: 200,
        structural_draw: 150,
        battery_stored: 900,
        battery_capacity: 1000,
        efficiency: 0.92,
      },
      construction: {
        pending: [
          {
            definition_id: 'life_support_mk3',
            name: 'Life Support Mk III',
            category: 'infrastructure',
            status: 'gathering_materials',
            materials: [
              {
                item_id: 'oxygen_generator',
                name: 'Oxygen Generator',
                quantity_required: 10,
                quantity_in_storage: 6,
                quantity_missing: 4,
              },
            ],
          },
        ],
      },
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('Power: 150/200 draw (92% efficiency)');
    expect(stdout).toContain('Battery: 900/1,000');
    expect(stdout).toContain('=== Construction ===');
    expect(stdout).toContain('Life Support Mk III');
    expect(stdout).toContain('4 missing');
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

  test('get_poi includes station fuel and fuel price when present', () => {
    const { stdout, stderr } = captureStructuredOutput('get_poi', {
      poi: {
        id: 'grand_exchange',
        name: 'Grand Exchange',
        type: 'station',
        system_id: 'haven',
        description: 'The largest market in the known galaxy.',
        base_id: 'grand_exchange_station',
      },
      base: {
        id: 'grand_exchange_station',
        name: 'Grand Exchange Station',
        empire: 'nebula',
        defense_level: 100,
        fuel: 20920,
        max_fuel: 0,
      },
      fuel_price: 20,
      services: ['refuel'],
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('Fuel: 20920/0');
    expect(stdout).toContain('Fuel Price: 20 credits');
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

  test('get_ship renders installed modules from nested ship data when top-level modules is empty', () => {
    const { stdout, stderr } = captureStructuredOutput('get_ship', {
      ship: {
        id: 'ship-1',
        name: 'Deep Survey',
        class_id: 'deep_survey',
        hull: 420,
        max_hull: 420,
        shield: 300,
        max_shield: 300,
        fuel: 240,
        max_fuel: 240,
        cargo_used: 0,
        cargo_capacity: 1250,
        cpu_used: 16,
        cpu_capacity: 34,
        power_used: 23,
        power_capacity: 75,
        modules: [
          {
            module_id: 'module-nested-1',
            name: 'Cargo Expander III',
            slot: 'utility',
            type: 'utility',
            type_id: 'cargo_expander_iii',
            wear_status: 'Pristine',
            wear: 0,
            cpu_usage: 2,
            power_usage: 2,
            size: 10,
          },
        ],
      },
      modules: [],
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Modules ===');
    expect(stdout).toContain('Cargo Expander III');
    expect(stdout).toContain('module-nested-1');
    expect(stdout).not.toContain('(None)');
  });

  test('normalizes get_status location data before player status formatting', () => {
    const { stdout, stderr } = captureStructuredOutput('get_status', getStatusFixture);

    expect(stderr).toBe('');
    expect(stdout).toMatchInlineSnapshot(`
      "
      === Player Status ===
      Username: Marlowe
      Empire: Terran
      Citizenships: solarian, nebula
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

    expect(Object.keys(namedFormatterFixtureCases).sort()).toEqual(namedFormatters);
  });

  test('named formatter fixtures select custom formatters', () => {
    const outputs: Record<string, string> = {};

    for (const [formatterName, { command, fixture }] of Object.entries(namedFormatterFixtureCases).sort()) {
      const { stdout, stderr } = captureStructuredOutput(command, fixture);
      expect(stderr, `${formatterName} should not emit drift warnings`).toBe('');
      expect(stdout, `${formatterName} should not fall back to JSON`).not.toContain('=== Response ===');
      outputs[formatterName] = stdout;
    }

    expect(outputs.create_market_order).toContain('=== Sell Order Created ===');
    expect(outputs.direct_buy).toContain('=== Buy Complete ===');
    expect(outputs.direct_sell).toContain('=== Sell Complete ===');
    delete outputs.create_market_order;
    delete outputs.direct_buy;
    delete outputs.direct_sell;

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

      Power:
        Power: 95/120 draw (85% efficiency)
        Battery: 420/600
      Condition: Critical infrastructure failure. (16% satisfaction)
      Services: crafting, market, missions, refuel
      Facilities: 3
        fuel_grid, trade_nexus, fleet_yards

      === Construction ===

      === Pending ===

        Name               | ID               | Category       | Status              | ETA | Materials                       
        -------------------+------------------+----------------+---------------------+-----+---------------------------------
        Life Support Mk II | life_support_mk2 | infrastructure | gathering_materials |     | Circuit Board: 12/40, 28 missing

      === Under Construction ===

        Name              | ID               | Category       | Status   | ETA     | Materials
        ------------------+------------------+----------------+----------+---------+----------
        Battery Bank Mk I | battery_bank_mk1 | infrastructure | building | 9 ticks |          

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

      Cargo (1):

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

      Power:
        Power: 95/120 draw (85% efficiency)
        Battery: 420/600

      === Construction ===

      === Pending ===

        Name               | ID               | Category       | Status              | ETA | Materials                       
        -------------------+------------------+----------------+---------------------+-----+---------------------------------
        Life Support Mk II | life_support_mk2 | infrastructure | gathering_materials |     | Circuit Board: 12/40, 28 missing

      === Under Construction ===

        Name              | ID               | Category       | Status   | ETA     | Materials
        ------------------+------------------+----------------+----------+---------+----------
        Battery Bank Mk I | battery_bank_mk1 | infrastructure | building | 9 ticks |          

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
      === Categories ===

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

      === Members ===

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
      === Orders ===

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


      === Items ===

        Item      | ID        | Best Buy | Buy Depth | Best Sell | Sell Depth
        ----------+-----------+----------+-----------+-----------+-----------
        Iron Ore  | ore_iron  | 15 cr    | 575 / 2   | 18 cr     | 15 / 2    
        Fuel Cell | fuel_cell |          |           |           |           

      Depth columns show quantity / orders at the best price.
      Use spacemolt view_market <item_id> for full order depth."
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
