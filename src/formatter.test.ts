import { describe, expect, test } from 'bun:test';
import type { CliRuntimeContext } from './cli-context';
import { displayStructuredResult } from './client';
import { renderResult, renderStructuredResult } from './display';
import {
  activeMissionsFixture,
  browseShipsFixture,
  catalogItemsFixture,
  createSellOrderFixture,
  empireInfoFixture,
  factionQueryIntelFixture,
  formatterFixtureCases,
  getLocationFixture,
  getStatusFixture,
  highValueCommandFixtures,
  listPassengersFixture,
  listStationPassengersFixture,
  missionsFixture,
  poiInfoFixture,
  storageFixture,
  subscribeMarketFixture,
  systemInfoFixture,
  unloadPassengerBulkFixture,
  viewMarketFixture,
  viewMarketSingleItemFixture,
} from './display/formatter-fixtures';
import { resultFormatters } from './display/formatters';
import { renderResponse } from './main';
import type { GlobalOptions } from './types';

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

function trimLineEndSpaces(value: string): string {
  return value.replace(/[ \t]+$/gm, '');
}

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
    citizenships: ['solarian', 'nebula'],
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
  category: 'crafting',
  has_more: true,
  entries: [
    {
      id: 'event-1',
      created_at: '2026-05-23T15:04:05.000Z',
      summary: 'Completed basic iron smelting.',
      category: 'crafting',
      event_type: 'crafting.completed',
      job_id: 'job-craft-1',
      mode: 'craft',
      storage: 'faction',
    },
    {
      id: 'event-4',
      created_at: '2026-06-24T09:15:00.000Z',
      summary: 'Queued 10 runs of steel_plate at personal facility.',
      category: 'crafting',
      event_type: 'crafting.queued',
      job_id: 'job-craft-42',
      mode: 'craft',
      runs: 10,
      venue: 'player-refinery',
      storage: 'storage',
    },
    {
      id: 'event-2',
      created_at: '2026-06-22T11:30:00.000Z',
      summary: 'Marlowe rented your Ore Refinery: 5 runs, 250 credits earned.',
      category: 'other',
      event_type: 'other.facility_rented',
    },
    {
      id: 'event-3',
      created_at: '2026-06-22T12:00:00.000Z',
      summary: 'Drone Control reached level 15.',
      category: 'skill',
      event_type: 'skill.level_up',
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

const marketNotificationsFixture = {
  count: 1,
  current_tick: 901337,
  notifications: [
    {
      type: 'market',
      msg_type: 'market_update',
      data: {
        base_id: 'haven_exchange',
        base_name: 'Haven Exchange',
        tick: 901337,
        items: [
          {
            item_id: 'ore_iron',
            item_name: 'Iron Ore',
            sell_orders: [{ price_each: 12, quantity: 40, source: 'station' }],
            buy_orders: [{ price_each: 9, quantity: 25 }],
          },
        ],
      },
      timestamp: '2026-05-23T19:03:02.000Z',
    },
  ],
  remaining: 0,
  timestamp: 1779562982,
};

const craftingNotificationsFixture = {
  count: 4,
  current_tick: 901337,
  notifications: [
    {
      type: 'crafting',
      msg_type: 'crafting_progress',
      data: { tick: 901335, job_id: 'job-a', message: 'Crafting steel plate.' },
      timestamp: '2026-06-29T00:00:00.000Z',
    },
    {
      type: 'crafting',
      msg_type: 'crafting_progress',
      data: { tick: 901336, job_id: 'job-a', message: 'Crafting steel plate.' },
      timestamp: '2026-06-29T00:00:20.000Z',
    },
    {
      type: 'trade',
      msg_type: 'trade_offer_received',
      data: { from_name: 'Dockmaster', trade_id: 'trade-1' },
      timestamp: '2026-06-29T00:00:30.000Z',
    },
    {
      type: 'crafting',
      msg_type: 'crafting_completed',
      data: { event_type: 'crafting.completed', message: 'Completed steel plate.' },
      timestamp: '2026-06-29T00:00:40.000Z',
    },
  ],
  remaining: 0,
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

  test('--search filters structured output and renders matching branches', () => {
    const { stdout, stderr } = captureStructuredOutput(
      'get_status',
      {
        ship: { fuel: 13, max_fuel: 700, name: 'Fuel Runner' },
        player: { username: 'Marlowe' },
      },
      { outputSearch: 'fuel' },
    );

    expect(stderr).toBe('');
    expect(stdout).toContain('Fuel Runner');
    expect(stdout).not.toContain('Marlowe');
    expect(stdout).not.toContain('.ship.fuel = 13');
  });

  test('--search-keys and --search-values restrict match scopes', () => {
    const keyOnly = captureStructuredOutput(
      'get_status',
      { ship: { fuel: 13, name: 'Fuel Runner', max_fuel: 700 } },
      { outputSearchKeys: 'fuel' },
    );
    const valueOnly = captureStructuredOutput(
      'get_status',
      { ship: { fuel: 13, name: 'Fuel Runner', max_fuel: 700 } },
      { outputSearchValues: '700' },
    );

    expect(keyOnly.stderr).toBe('');
    expect(keyOnly.stdout).toBe(['.ship.fuel = 13', '.ship.max_fuel = 700'].join('\n'));
    expect(valueOnly.stderr).toBe('');
    expect(valueOnly.stdout).toBe('.ship.max_fuel = 700');
  });

  test('--search-regex prints matches or exits nonzero for invalid regex', () => {
    const valid = renderStructuredResult(
      'get_status',
      { ship: { hull: 480, max_hull: 480, armor: 0, fuel: 13 } },
      globalOptions({ outputSearchRegex: '^(max_)?hull$|^armor$' }),
    );

    expect(valid.success).toBe(true);
    expect(valid.stderr).toEqual([]);
    expect(valid.stdout).toEqual(['.ship.hull = 480', '.ship.max_hull = 480', '.ship.armor = 0']);

    const invalid = renderStructuredResult(
      'get_status',
      { ship: { fuel: 13 } },
      globalOptions({ outputSearchRegex: '[' }),
    );

    expect(invalid.success).toBe(false);
    expect(invalid.stdout).toEqual([]);
    expect(invalid.stderr.join('\n').replace(ANSI_PATTERN, '')).toContain('Invalid --search-regex pattern');
  });

  test('--jq scopes output search filter to the selected subtree', () => {
    const { stdout, stderr } = captureStructuredOutput(
      'get_status',
      {
        ship: { fuel: 13, max_fuel: 700, name: 'Fuel Runner' },
        station: { fuel: 999 },
      },
      { jq: '.ship', outputSearch: 'fuel' },
    );

    expect(stderr).toBe('');
    expect(stdout).toContain('Fuel Runner');
    expect(stdout).not.toContain('999');
    expect(stdout).not.toContain('.fuel = 13');
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

  test('--field comma-separated paths extracts an object like --fields', () => {
    const { stdout, stderr } = captureStructuredOutput('get_status', outputModeFixture, {
      field: 'player.name,ship.fuel',
    });

    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toEqual({ 'player.name': 'Marlowe', 'ship.fuel': 42 });
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

  test('--field missing top-level path hints available keys without failing', async () => {
    const { stdout, stderr, exitCode } = await captureRenderedOutput(
      { structuredContent: outputModeFixture },
      { field: 'fuel_capacity' },
    );

    expect(exitCode).toBe(0);
    expect(stdout).toBe('null');
    expect(stderr).toContain('Field not found: "fuel_capacity"');
    expect(stderr).toContain('Available keys: player, ship, items');
  });

  test('--field missing dotted path hints available keys without failing', async () => {
    const { stdout, stderr, exitCode } = await captureRenderedOutput(
      { structuredContent: outputModeFixture },
      { field: 'ship.fuel_capacity' },
    );

    expect(exitCode).toBe(0);
    expect(stdout).toBe('null');
    expect(stderr).toContain('Field not found: "ship.fuel_capacity"');
    expect(stderr).toContain('Available keys: player, ship, items');
  });

  test('--fields all missing emits one available-keys hint without failing', async () => {
    const { stdout, stderr, exitCode } = await captureRenderedOutput(
      { structuredContent: outputModeFixture },
      { fields: ['fuel_capacity', 'cargo.used'] },
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({});
    expect(stderr).toContain('Fields not found: fuel_capacity, cargo.used');
    expect(stderr).toContain('Available keys: player, ship, items');
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

  test('--jq supports simple object construction from paths', () => {
    const { stdout, stderr } = captureStructuredOutput('get_status', outputModeFixture, {
      jq: '{name: .player.name, fuel: .ship.fuel}',
    });

    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toEqual({ name: 'Marlowe', fuel: 42 });
  });

  test('--jq object construction supports quoted keys', () => {
    const { stdout, stderr } = captureStructuredOutput('get_status', outputModeFixture, {
      jq: `{"pilot name": .player.name, 'ship fuel': .ship.fuel}`,
    });

    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toEqual({ 'pilot name': 'Marlowe', 'ship fuel': 42 });
  });

  test('--jq supports array index bracket notation', () => {
    const { stdout, stderr } = captureStructuredOutput('view_market', outputModeFixture, {
      jq: '.items[0].quantity',
    });

    expect(stderr).toBe('');
    expect(stdout).toBe('5');
  });

  test('--jq supports string slice bracket notation', () => {
    const fixture = {
      commissions: [
        { commission_id: 'commission-1', status: 'active', ticks_remaining: 3 },
        { commission_id: 'commission-2', status: 'complete', ticks_remaining: 0 },
      ],
    };

    const barePath = captureStructuredOutput('commission_status', fixture, {
      jq: '.commissions[0].commission_id[0:8]',
    });
    const mappedObject = captureStructuredOutput('commission_status', fixture, {
      compact: true,
      jq: '.commissions[] | {id: .commission_id[0:8], status}',
    });

    expect(barePath.stderr).toBe('');
    expect(barePath.stdout).toBe('commissi');
    expect(mappedObject.stderr).toBe('');
    expect(JSON.parse(mappedObject.stdout)).toEqual([
      { id: 'commissi', status: 'active' },
      { id: 'commissi', status: 'complete' },
    ]);
  });

  test('--jq maps array item object construction into a JSON array', () => {
    const { stdout, stderr } = captureStructuredOutput(
      'commission_status',
      {
        commissions: [
          { commission_id: 'commission-1', status: 'active', ticks_remaining: 3 },
          { commission_id: 'commission-2', status: 'complete', ticks_remaining: 0 },
        ],
      },
      {
        compact: true,
        jq: '.commissions[] | {id: .commission_id, status, ticks: .ticks_remaining}',
      },
    );

    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toEqual([
      { id: 'commission-1', status: 'active', ticks: 3 },
      { id: 'commission-2', status: 'complete', ticks: 0 },
    ]);
  });

  test('--search filters faction intel to matching resources and renders table output', () => {
    const { stdout, stderr } = captureStructuredOutput('faction_query_intel', factionQueryIntelFixture, {
      outputSearch: 'hydrogen',
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Faction Intel ===');
    expect(stdout).toContain('hydrogen_gas');
    expect(stdout).not.toContain('argon_gas');
  });

  test('--jq supports select and array construction for nested intel resources', () => {
    const fixture = {
      entries: [
        {
          pois: [
            {
              name: 'Sol Gas Cloud',
              resources: [
                { id: 'hydrogen_gas', resource_id: 'hydrogen_gas', richness: 4, remaining: 500 },
                { id: 'argon_gas', resource_id: 'argon_gas', richness: 2, remaining: 200 },
              ],
            },
            { name: 'Empty POI' },
          ],
        },
      ],
    };

    const { stdout, stderr } = captureStructuredOutput('faction_query_intel', fixture, {
      compact: true,
      jq: '.entries[0].pois[] | select(.resources) | {name: .name, h2: [.resources[] | select(.id == "hydrogen_gas") | {richness, remaining}]}',
    });

    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toEqual([
      {
        name: 'Sol Gas Cloud',
        h2: [{ richness: 4, remaining: 500 }],
      },
    ]);
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

  test('--jq collects comma-separated expression values into a JSON array', () => {
    const { stdout, stderr } = captureStructuredOutput('get_status', outputModeFixture, {
      compact: true,
      jq: '.ship.fuel, .player.name',
    });

    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toEqual([42, 'Marlowe']);
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
    expect(missing.stderr.join('\n').replace(ANSI_PATTERN, '')).toContain('Available keys: player, ship, items');
    expect(existingNull.success).toBe(true);
    expect(existingNull.stderr).toEqual([]);
    expect(existingNull.stdout).toEqual(['null']);
  });

  test('--jq warns when projection output is empty', () => {
    const rendered = renderStructuredResult(
      'get_status',
      { ...outputModeFixture, items: [] },
      globalOptions({ jq: '.items[]' }),
    );

    expect(rendered.success).toBe(false);
    expect(rendered.stdout).toEqual([]);
    expect(rendered.stderr.join('\n').replace(ANSI_PATTERN, '')).toBe(
      '[warning] --jq produced no output. Path may not exist in structuredContent.\n' +
        'Use --keys to explore available fields, or add --fuzzy for auto-resolution.',
    );
  });

  test('--jq hints when user starts from structuredContent', () => {
    const rendered = renderStructuredResult(
      'get_status',
      outputModeFixture,
      globalOptions({ jq: '.structuredContent.ship.fuel' }),
    );

    expect(rendered.success).toBe(false);
    expect(rendered.stdout).toEqual([]);
    expect(rendered.stderr.join('\n').replace(ANSI_PATTERN, '')).toContain(
      'Hint: --jq operates on structuredContent (not the full API response). Try: .ship.fuel',
    );
  });

  test('--jq length returns array element count via pipe', () => {
    const { stdout, stderr } = captureStructuredOutput(
      'get_status',
      { items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
      {
        jq: '.items | length',
      },
    );

    expect(stderr).toBe('');
    expect(stdout).toBe('3');
  });

  test('--jq length on empty array returns 0', () => {
    const { stdout, stderr } = captureStructuredOutput(
      'get_status',
      { items: [] },
      {
        jq: '.items | length',
      },
    );

    expect(stderr).toBe('');
    expect(stdout).toBe('0');
  });

  test('--jq length works on objects and strings', () => {
    const obj = captureStructuredOutput(
      'get_status',
      { meta: { a: 1, b: 2 } },
      { compact: true, jq: '.meta | length' },
    );
    const str = captureStructuredOutput('get_status', { name: 'hello' }, { jq: '.name | length' });

    expect(obj.stderr).toBe('');
    expect(obj.stdout).toBe('2');
    expect(str.stderr).toBe('');
    expect(str.stdout).toBe('5');
  });

  test('--jq length produces bare number under json output', () => {
    const { stdout, stderr } = captureStructuredOutput(
      'view_market',
      { items: [1, 2] },
      {
        format: 'json',
        compact: true,
        jq: '.items | length',
      },
    );

    expect(stderr).toBe('');
    expect(stdout).toBe('2');
  });

  test('--jq length errors on non-container scalars', () => {
    const rendered = renderStructuredResult(
      'get_status',
      outputModeFixture,
      globalOptions({ jq: '.ship.fuel | length' }),
    );

    expect(rendered.success).toBe(false);
    expect(rendered.stdout).toEqual([]);
    expect(rendered.stderr.join('\n').replace(ANSI_PATTERN, '')).toContain('length is not defined for: number');
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

  test('storage view item filter narrows displayed rows without wrapping output', async () => {
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
      { command: 'storage', displayCommand: 'storage', payload: { action: 'view', item_id: 'iron_ore' } },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain('Iron Ore');
    expect(stdout).toContain('iron_ore');
    expect(stdout).toContain('718');
    expect(stdout).not.toContain('Fuel Cell');
  });

  test('storage view displays stored ship custom names', async () => {
    const { stdout, stderr, exitCode } = await captureRenderedOutput(
      {
        structuredContent: {
          ...storageFixture,
          ships: [
            {
              ship_id: 'ship-1',
              class_id: 'prospector',
              class_name: 'Prospector',
              custom_name: 'Rock Skipper',
              modules: 3,
              cargo_used: 10,
            },
          ],
        },
      },
      {},
      { command: 'storage', displayCommand: 'storage', payload: { action: 'view' } },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain('Rock Skipper');
    expect(stdout).toContain('prospector');
  });

  test('storage deposit with a ship UUID and self target renders carrier bay load confirmation', async () => {
    const shipId = '0ceb2c65-cc4b-4797-a8f0-baec04dab000';
    const { stdout, stderr, exitCode } = await captureRenderedOutput(
      {
        structuredContent: {
          action: 'deposit',
          item_id: shipId,
          quantity: 1,
          storage_total: 3,
          cargo_remaining: 0,
          cargo_space: 5,
          bay_capacity: 8,
          class_name: 'Dust Devil',
          class_id: 'dust_devil',
          base_id: 'grand_exchange_station',
        },
      },
      {},
      {
        command: 'storage',
        displayCommand: 'storage',
        payload: { action: 'deposit', item_id: shipId, quantity: 1, target: 'self' },
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain('=== Load Ship Into Carrier Bay ===');
    expect(stdout).toContain('Ship: Dust Devil (dust_devil)');
    expect(stdout).toContain('Bay Slots Used: 3/8 (5 remaining)');
    expect(stdout).toContain('Base: grand_exchange_station');
    expect(stdout).not.toContain('Cargo Remaining: 0');
    expect(stdout).not.toContain('Cargo Space: 5');
    expect(stdout).not.toContain('Storage Total: 3');
  });

  test('legacy deposit_items command name does not trigger carrier bay load display', async () => {
    const shipId = '0ceb2c65-cc4b-4797-a8f0-baec04dab000';
    const { stdout, stderr, exitCode } = await captureRenderedOutput(
      {
        structuredContent: {
          action: 'deposit',
          item_id: shipId,
          quantity: 1,
          storage_total: 3,
          cargo_remaining: 0,
          cargo_space: 5,
        },
      },
      {},
      {
        command: 'deposit_items',
        displayCommand: 'deposit_items',
        payload: { item_id: shipId, quantity: 1, target: 'self' },
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).not.toContain('=== Load Ship Into Carrier Bay ===');
  });

  test('storage deposit carrier bay load falls back to remaining slots when capacity is absent', async () => {
    const shipId = '0ceb2c65-cc4b-4797-a8f0-baec04dab000';
    const { stdout, stderr, exitCode } = await captureRenderedOutput(
      {
        structuredContent: {
          action: 'deposit',
          item_id: shipId,
          quantity: 1,
          storage_total: 3,
          cargo_remaining: 0,
          cargo_space: 5,
        },
      },
      {},
      {
        command: 'storage',
        displayCommand: 'storage',
        payload: { action: 'deposit', item_id: shipId, quantity: 1, target: 'self' },
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain('=== Load Ship Into Carrier Bay ===');
    expect(stdout).toContain(`Ship: ${shipId}`);
    expect(stdout).toContain('Bay Slots Remaining: 5');
    expect(stdout).not.toContain('Storage Total: 3');
  });

  test('storage deposit carrier bay display specialization does not alter structured output', async () => {
    const shipId = '0ceb2c65-cc4b-4797-a8f0-baec04dab000';
    const structuredContent = {
      action: 'deposit',
      item_id: shipId,
      quantity: 1,
      storage_total: 3,
      cargo_remaining: 0,
      cargo_space: 5,
    };
    const { stdout, stderr, exitCode } = await captureRenderedOutput(
      { structuredContent },
      { structured: true },
      {
        command: 'storage',
        displayCommand: 'storage',
        payload: { action: 'deposit', item_id: shipId, quantity: 1, target: 'self' },
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toEqual(structuredContent);
  });

  test('storage view faction search filter narrows displayed rows', async () => {
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
      { command: 'storage', displayCommand: 'storage', payload: { action: 'view', target: 'faction', search: 'iron' } },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain('Iron Ore');
    expect(stdout).not.toContain('Copper Ore');
  });

  test('storage view faction prints bunker fuel and station-local storage hint', async () => {
    const { stdout, stderr, exitCode } = await captureRenderedOutput(
      {
        structuredContent: {
          base_id: 'earth_station',
          target: 'faction',
          hint: "2,162,917 items in faction storage at crimson_war_citadel, nova_terra_central Fuel bunker here: deposit fuel from your ship's tank with storage deposit target=faction item_id=fuel.",
          faction_fuel_reserve: 320,
          faction_fuel_capacity: 500,
          items: [{ item_id: 'fuel_cell', item_name: 'Fuel Cell', quantity: 12, size: 1 }],
          ships: [],
        },
      },
      {},
      {
        command: 'storage',
        displayCommand: 'storage',
        payload: { action: 'view', target: 'faction', station_id: 'earth_station' },
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain('=== Faction Storage at earth_station ===');
    expect(stdout).toContain('Fuel bunker: 320 / 500 units');
    expect(stdout).toContain(
      "12 items in faction storage at earth_station (2,162,917 total across 2 stations)\nFuel bunker here: deposit fuel from your ship's tank with storage deposit target=faction item_id=fuel.",
    );
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

  test('yaml output preserves nearby player and NPC collections', () => {
    const result = {
      ...getStatusFixture,
      location: {
        ...getStatusFixture.location,
        nearby_players: nearbyPlayers(12),
        count: 12,
        nearby_empire_npcs: nearbyNpcs(13),
        empire_npc_count: 13,
      },
    };

    const rendered = renderStructuredResult('get_status', result, globalOptions({ format: 'yaml' }));
    const yaml = rendered.stdout.join('\n');

    expect(rendered.success).toBe(true);
    expect(yaml).toContain('username: "Pilot 12"');
    expect(yaml).toContain('name: "Patrol 13"');
    expect(yaml).toContain('count: 12');
    expect(yaml).toContain('empire_npc_count: 13');
    expect(yaml).not.toContain('nearby_player_count:');
    expect(yaml).not.toContain('nearby_empire_npc_count:');
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
      Credits: 12,345
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

  test('lean query formatters show current credit balance', () => {
    const cargo = captureStructuredOutput('get_cargo', {
      cargo: [],
      used: 0,
      capacity: 100,
      credits: 12345,
    });
    const ship = captureStructuredOutput('get_ship', {
      credits: 12345,
      ship: {
        id: 'ship-1',
        class_id: 'skiff',
        hull: 100,
        max_hull: 100,
        shield: 50,
        max_shield: 50,
        fuel: 80,
        max_fuel: 100,
        cargo_used: 0,
        cargo_capacity: 100,
        cpu_used: 0,
        cpu_capacity: 10,
        power_used: 0,
        power_capacity: 10,
      },
    });
    const location = captureStructuredOutput('get_location', {
      credits: 12345,
      location: {
        system_id: 'sol',
      },
    });

    expect(cargo.stdout).toContain('Credits: 12,345');
    expect(ship.stdout).toContain('Credits: 12,345');
    expect(location.stdout).toContain('Credits: 12,345');
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

  test('formats refuel transfers without raw JSON fallback', () => {
    const { stdout, stderr } = captureStructuredOutput('refuel', {
      action: 'refuel',
      fuel: -697,
      fuel_max: 4000,
      fuel_now: 3046,
      source: 'ship_transfer',
      target_fuel_max: 700,
      target_fuel_now: 700,
      target_player_id: '9c8913b2cf825728a2404c9e4c4d7afb',
      target_player_name: 'Fabrini',
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Refuel Complete ===');
    expect(stdout).toContain('Source: ship_transfer');
    expect(stdout).toContain('Ship fuel: 3046/4000 (-697)');
    expect(stdout).toContain('Target: Fabrini (9c8913b2cf825728a2404c9e4c4d7afb)');
    expect(stdout).toContain('Target fuel: 700/700');
    expect(stdout).not.toContain('Fuel cost:');
    expect(stdout).not.toContain('Fuel tax:');
    expect(stdout).not.toContain('Total spent:');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('formats station refuel cost and tax when present', () => {
    const { stdout, stderr } = captureStructuredOutput('refuel', {
      action: 'refuel',
      source: 'station',
      fuel: 3998,
      fuel_now: 4000,
      fuel_max: 4000,
      market_cost: 7996,
      tax_amount: 7996,
      cost: 15992,
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Refuel Complete ===');
    expect(stdout).toContain('Source: station');
    expect(stdout).toContain('Ship fuel: 4000/4000 (+3998)');
    expect(stdout).toContain('Fuel added: 3,998');
    expect(stdout).toContain('Market cost: 7,996 cr (2 cr/fuel)');
    expect(stdout).toContain('Fuel tax: 7,996 cr (2 cr/fuel)');
    expect(stdout).toContain('Total spent: 15,992 cr (4 cr/fuel)');
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
    expect(stdout).toContain('category crafting');
    expect(stdout).toContain('=== Entries ===');
    expect(stdout).toContain('Timestamp');
    expect(stdout).toContain('2026-05-23 15:04:05');
    expect(stdout).toContain('Completed basic iron smelting.');
    expect(stdout).toContain('crafting');
    expect(stdout).toContain('crafting.completed');
    expect(stdout).toContain('job-craft-1');
    expect(stdout).toContain('craft');
    expect(stdout).toContain('faction');
    expect(stdout).toContain('job-craft-42');
    expect(stdout).toContain('10');
    expect(stdout).toContain('player-refinery');
    expect(stdout).toContain('other.facility_rented');
    expect(stdout).toContain('Marlowe rented your Ore Refinery');
    expect(stdout).toContain('skill.level_up');
    expect(stdout).toContain('Drone Control reached level 15');
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

  test('formats market update notifications as a readable summary', () => {
    const { stdout, stderr } = captureStructuredOutput('get_notifications', marketNotificationsFixture);

    expect(stderr).toBe('');
    expect(stdout).toContain('market_update');
    expect(stdout).toContain('Haven Exchange');
    expect(stdout).toContain('1 item update');
    expect(stdout).toContain('Iron Ore');
    expect(stdout).not.toContain('"sell_orders"');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('formats crafting progress notifications as a summary row', () => {
    const { stdout, stderr } = captureStructuredOutput('get_notifications', craftingNotificationsFixture);

    expect(stderr).toBe('');
    expect(stdout).toContain('count 4');
    expect(stdout).toContain('crafting_summary');
    expect(stdout).toContain('2 crafting progress updates summarized');
    expect(stdout).toContain('latest tick 901336');
    expect(stdout).toContain('trade_offer_received');
    expect(stdout).toContain('crafting_completed');
    expect(stdout.match(/Crafting steel plate\./g)?.length ?? 0).toBe(1);
    expect(stdout).not.toContain('=== Response ===');
  });

  test('formats malformed notification arrays without crashing', () => {
    const fixture = {
      count: 2,
      notifications: [
        null,
        {
          type: 'system',
          msg_type: 'system',
          data: { message: 'Still here.' },
          timestamp: '2026-06-29T00:00:00.000Z',
        },
      ],
    };

    const { stdout, stderr } = captureStructuredOutput('get_notifications', fixture);

    expect(stderr).toBe('');
    expect(stdout).toContain('Still here.');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('formats malformed crafting summary fields without diagnostic tokens', () => {
    const fixture = {
      count: 1,
      notifications: [
        {
          type: 'crafting',
          msg_type: 'crafting_summary',
          timestamp: '2026-06-29T00:00:00.000Z',
          data: {
            count: Number.NaN,
            jobs: Number.POSITIVE_INFINITY,
            latest_tick: { bad: true },
            latest_message: { text: 'bad' },
          },
        },
      ],
    };

    const { stdout, stderr } = captureStructuredOutput('get_notifications', fixture);

    expect(stderr).toBe('');
    expect(stdout).toContain('crafting_summary');
    expect(stdout).toContain('0 crafting progress updates summarized');
    expect(stdout).not.toContain('NaN');
    expect(stdout).not.toContain('Infinity');
    expect(stdout).not.toContain('[object Object]');
    expect(stdout).not.toContain('latest tick');
    expect(stdout).not.toContain('latest:');
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

  test('formats view_orders with context and fill progress', () => {
    const { stdout, stderr } = captureStructuredOutput('view_orders', {
      action: 'view_orders',
      base: 'Earth Station',
      scope: 'personal',
      orders: [
        {
          order_id: 'order-1',
          order_type: 'limit',
          side: 'buy',
          item_id: 'ore_iron',
          item_name: 'Iron Ore',
          quantity: 100,
          remaining: 75,
          filled_quantity: 25,
          price_each: 12,
          listing_fee: 25,
          created_at: '2026-05-29T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
      has_more: false,
      hint: 'Showing personal market orders.',
      sort_by: 'newest',
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Orders ===');
    expect(stdout).toContain('Earth Station | personal | newest | 1 order | page 1/1');
    expect(stdout).toContain('Showing personal market orders.');
    expect(stdout).toContain('Item     | Side | Open/Qty | Filled | Price | Fee   | Created          | ID');
    expect(stdout).toContain('Iron Ore | buy  | 75/100   | 25     | 12 cr | 25 cr | 2026-05-29 00:00 | order-1');
    expect(stdout).not.toContain('ore_iron | order-1 | buy');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('formats empty view_orders with context and no rows', () => {
    const { stdout, stderr } = captureStructuredOutput('view_orders', {
      action: 'view_orders',
      base: 'Earth Station',
      scope: 'faction',
      orders: [],
      total: 0,
      page: 1,
      page_size: 20,
      total_pages: 1,
      has_more: false,
      hint: 'Showing faction market orders.',
      sort_by: 'price_desc',
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Orders ===');
    expect(stdout).toContain('Earth Station | faction | price_desc | 0 orders | page 1/1');
    expect(stdout).toContain('Showing faction market orders.');
    expect(stdout).toContain('(None)');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('formats view_orders fallbacks without NaN', () => {
    const { stdout, stderr } = captureStructuredOutput('view_orders', {
      orders: [
        {
          id: 'fallback-order',
          type: 'sell',
          item_id: 'nickel_ore',
          remaining: 3,
          filled_quantity: 'bad-filled',
          price: 'market-maker',
          listing_fee: 'fee-waived',
          created_at: 'not-a-date',
        },
      ],
    });

    expect(stderr).toBe('');
    expect(stdout).toContain(
      'nickel_ore | sell | 3        | bad-filled | market-maker | fee-waived | not-a-date | fallback-order',
    );
    expect(stdout).not.toContain('NaN');
    expect(stdout).not.toContain('undefined');
  });

  test('formats view_orders missing numeric fields as blanks instead of zeroes', () => {
    const { stdout, stderr } = captureStructuredOutput('view_orders', {
      base: 'Earth Station',
      scope: 'personal',
      sort_by: 'newest',
      total: null,
      page: '',
      total_pages: null,
      orders: [
        {
          id: 'missing-order',
          side: 'buy',
          item_id: 'void_ore',
          remaining: null,
          quantity: '',
          filled_quantity: null,
          listing_fee: '',
        },
      ],
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('Earth Station | personal | newest');
    expect(stdout).toContain('void_ore');
    expect(stdout).not.toContain('0 orders');
    expect(stdout).not.toContain('page 0/0');
    expect(stdout).not.toContain('0/0');
    expect(stdout).not.toContain('0 cr');
    expect(stdout).not.toContain('NaN');
    expect(stdout).not.toContain('undefined');
  });

  test('formats view_orders out-of-range numeric timestamps as raw values', () => {
    const createdAt = 1e20;

    const { stdout, stderr } = captureStructuredOutput('view_orders', {
      orders: [
        {
          id: 'far-future-order',
          side: 'sell',
          item_id: 'nickel_ore',
          created_at: createdAt,
        },
      ],
    });

    expect(stderr).toBe('');
    expect(stdout).toContain(String(createdAt));
    expect(stdout).not.toContain('RangeError');
    expect(stdout).not.toContain('NaN');
    expect(stdout).not.toContain('undefined');
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

  test('formats subscribe_market snapshots with market depth', () => {
    const { stdout, stderr } = captureStructuredOutput('subscribe_market', subscribeMarketFixture);

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Market at haven_exchange ===');
    expect(stdout).toContain('Iron Ore');
    expect(stdout).toContain('Buy orders (1):');
    expect(stdout).toContain('9 cr');
    expect(stdout).toContain('Sell orders (1):');
    expect(stdout).toContain('12 cr');
    expect(stdout).not.toContain('=== Response ===');
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
    expect(stdout).toContain('Item: Nickel Ore (nickel_ore)');
    expect(stdout).toContain('Requested: 1');
    expect(stdout).toContain('Price each: 999,999 cr');
    expect(stdout).toContain('Listing fee: 10,000 cr');
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

  test('formats faction_query_intel with searchable resource ids', () => {
    const { stdout, stderr } = captureStructuredOutput('faction_query_intel', factionQueryIntelFixture);

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Faction Intel ===');
    expect(stdout).toContain('Sol');
    expect(stdout).toContain('Sol Gas Cloud');
    expect(stdout).toContain('hydrogen_gas');
    expect(stdout).toContain('argon_gas');
    expect(stdout).toContain('richness 4');
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

  test.each([
    [
      'buy',
      {
        action: 'buy',
        item: 'Liquid Hydrogen',
        item_id: 'liquid_hydrogen',
        quantity: 1,
        total_cost: 25,
        unfilled: 0,
        fills: [{ quantity: 1, price_each: 25, subtotal: 25, source: 'player', counterparty: 'AetherWraith' }],
      },
      'Instant fills: 1 (spent: 25 cr) from AetherWraith',
    ],
    [
      'sell',
      {
        action: 'sell',
        item: 'Liquid Hydrogen',
        item_id: 'liquid_hydrogen',
        quantity_sold: 1,
        total_earned: 25,
        unsold: 0,
        fills: [{ quantity: 1, price_each: 25, subtotal: 25, source: 'player', counterparty: 'AetherWraith' }],
      },
      'Instant fills: 1 (earned: 25 cr) from AetherWraith',
    ],
    [
      'create_buy_order',
      {
        action: 'create_buy_order',
        item: 'Liquid Hydrogen',
        item_id: 'liquid_hydrogen',
        quantity: 1,
        price_each: 25,
        quantity_filled: 1,
        quantity_listed: 0,
        total_spent: 25,
        listing_fee: 1,
        order_id: 'order-buy-fill',
        fills: [{ quantity: 1, price_each: 25, subtotal: 25, source: 'player', counterparty: 'AetherWraith' }],
      },
      'Instant fills: 1 (spent: 25 cr) from AetherWraith',
    ],
    [
      'create_sell_order',
      {
        action: 'create_sell_order',
        item: 'Liquid Hydrogen',
        item_id: 'liquid_hydrogen',
        quantity: 1,
        price_each: 25,
        quantity_filled: 1,
        quantity_listed: 0,
        total_earned: 25,
        listing_fee: 1,
        order_id: 'order-sell-fill',
        fills: [{ quantity: 1, price_each: 25, subtotal: 25, source: 'player', counterparty: 'AetherWraith' }],
      },
      'Instant fills: 1 (earned: 25 cr) from AetherWraith',
    ],
    [
      'faction_create_buy_order',
      {
        action: 'create_buy_order',
        item: 'Liquid Hydrogen',
        item_id: 'liquid_hydrogen',
        quantity: 1,
        price_each: 25,
        quantity_filled: 1,
        quantity_listed: 0,
        total_spent: 25,
        listing_fee: 1,
        order_id: 'faction-buy-fill',
        fills: [{ quantity: 1, price_each: 25, subtotal: 25, source: 'player', counterparty: 'AetherWraith' }],
      },
      'Instant fills: 1 (spent: 25 cr) from AetherWraith',
    ],
    [
      'faction_create_sell_order',
      {
        action: 'create_sell_order',
        item: 'Liquid Hydrogen',
        item_id: 'liquid_hydrogen',
        quantity: 1,
        price_each: 25,
        quantity_filled: 1,
        quantity_listed: 0,
        total_earned: 25,
        listing_fee: 1,
        order_id: 'faction-sell-fill',
        fills: [{ quantity: 1, price_each: 25, subtotal: 25, source: 'player', counterparty: 'AetherWraith' }],
      },
      'Instant fills: 1 (earned: 25 cr) from AetherWraith',
    ],
  ] as const)('formats %s fill counterparties', (command, fixture, expectedFillLine) => {
    const { stdout, stderr } = captureStructuredOutput(command, fixture);

    expect(stderr).toBe('');
    expect(stdout).toContain(expectedFillLine);
    expect(stdout).not.toContain('=== Response ===');
  });

  test('keeps fill counterparty reachable in structured details output', () => {
    const { stdout, stderr } = captureStructuredOutput(
      'buy',
      {
        details: {
          action: 'buy',
          item: 'Liquid Hydrogen',
          item_id: 'liquid_hydrogen',
          quantity: 1,
          total_cost: 25,
          unfilled: 0,
          fills: [{ quantity: 1, price_each: 25, subtotal: 25, source: 'player', counterparty: 'AetherWraith' }],
        },
      },
      { format: 'json', jq: '.details.fills[0].counterparty' },
    );

    expect(stderr).toBe('');
    expect(stdout).toBe('"AetherWraith"');
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

  test('formats v0.372 post-action sell envelopes from nested details', () => {
    const { stdout, stderr } = captureStructuredOutput('sell', {
      details: {
        action: 'sell',
        item: 'Iron Ore',
        item_id: 'iron_ore',
        quantity_sold: 6,
        total_earned: 90,
        unsold: 0,
        fills: [{ quantity: 6, price_each: 15, subtotal: 90, source: 'station' }],
      },
      ship: { cargo_used: 4, cargo_capacity: 50 },
      cargo: { items: [{ item_id: 'copper_ore', quantity: 4 }] },
      location: { system_id: 'sol', system_name: 'Sol', poi_id: 'sol_earth', poi_name: 'Earth' },
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Sell Complete ===');
    expect(stdout).toContain('Item: Iron Ore (iron_ore)');
    expect(stdout).toContain('Instant fills: 6 (earned: 90 cr)');
    expect(stdout).not.toContain('=== Location ===');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('formats v0.372 post-action jump envelopes from nested details', () => {
    const { stdout, stderr } = captureStructuredOutput('jump', {
      details: {
        action: 'jump',
        message: 'Jumped to Alpha Centauri.',
        fuel_now: 72,
        fuel_max: 100,
        system_id: 'alpha_centauri',
        system_name: 'Alpha Centauri',
        poi_id: 'alpha_beacon',
        poi: 'Beacon',
        online_players: [],
        online_players_count: 0,
      },
      ship: { fuel: 72, max_fuel: 100 },
      cargo: { items: [] },
      location: {
        system_id: 'alpha_centauri',
        system_name: 'Alpha Centauri',
        poi_id: 'alpha_beacon',
        poi_name: 'Beacon',
      },
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('Arrived at Beacon');
    expect(stdout).toContain('(No other players here)');
    expect(stdout).not.toContain('=== Location ===');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('formats post-action accept mission envelopes from returned mission state', () => {
    const { stdout, stderr } = captureStructuredOutput('accept_mission', {
      details: {
        mission_id: 'mission-delivery-1',
        template_id: 'delivery-food',
        title: 'Food Delivery',
        type: 'delivery',
        expires_at: '2026-06-16T18:00:00Z',
        message: 'Mission accepted.',
      },
      player: { credits: 975 },
      cargo: [{ item_id: 'food_rations', item_name: 'Food Rations', quantity: 5 }],
      missions: {
        active: [
          {
            mission_id: 'mission-delivery-1',
            title: 'Food Delivery',
            type: 'delivery',
            objectives: [{ description: 'Deliver Food Rations', item_id: 'food_rations', quantity: 5 }],
          },
        ],
        max_missions: 5,
      },
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Active Missions ===');
    expect(stdout).toContain('mission-delivery-1');
    expect(stdout).toContain('missions 1/5');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('formats post-action abandon mission envelopes from returned mission state', () => {
    const { stdout, stderr } = captureStructuredOutput('abandon_mission', {
      details: {
        mission_id: 'mission-delivery-1',
        title: 'Food Delivery',
        message: 'Mission abandoned.',
      },
      missions: {
        active: [
          {
            mission_id: 'mission-survey-2',
            title: 'Survey Run',
            type: 'survey',
          },
        ],
        max_missions: 5,
      },
      queue: { has_pending: false },
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Active Missions ===');
    expect(stdout).toContain('mission-survey-2');
    expect(stdout).toContain('missions 1/5');
    expect(stdout).not.toContain('mission-delivery-1');
    expect(stdout).not.toContain('=== Response ===');
  });

  test.each([
    [
      'travel',
      {
        details: {
          action: 'travel',
          poi_id: 'sol_earth',
          poi: 'Earth',
          online_players: [],
          online_players_count: 0,
          online_players_truncated: false,
          offline_collapsed: 0,
          message: 'Arrived.',
        },
        ship: { fuel: 92, max_fuel: 100 },
        location: { system_id: 'sol', system_name: 'Sol', poi_id: 'sol_earth', poi_name: 'Earth' },
      },
      'Arrived at Earth',
    ],
    [
      'reload',
      {
        details: {
          action: 'reload',
          weapon_id: 'weapon-1',
          weapon_name: 'Pulse Laser',
          ammo_id: 'ammo-cell',
          ammo_name: 'Laser Cell',
          current_ammo: 8,
          magazine_size: 8,
        },
        cargo: [{ item_id: 'ammo-cell', item_name: 'Laser Cell', quantity: 2 }],
        ship: { fuel: 92, max_fuel: 100 },
      },
      '=== Reloaded ===',
    ],
    [
      'tow_wreck',
      {
        details: {
          action: 'tow_wreck',
          wreck_id: 'wreck-1',
          message: 'Tow line attached.',
          insured: false,
          cargo_count: 2,
          module_count: 1,
          salvage_value: 1250,
          ship_class: 'skiff',
          speed_penalty: '25%',
        },
        ship: { fuel: 92, max_fuel: 100 },
        location: { system_id: 'sol', system_name: 'Sol', poi_id: 'sol_belt', poi_name: 'Belt' },
      },
      'Wreck Id: wreck-1',
    ],
    [
      'release_tow',
      {
        details: {
          action: 'release_tow',
          wreck_id: 'wreck-1',
          message: 'Tow released.',
        },
        ship: { fuel: 92, max_fuel: 100 },
      },
      'Wreck Id: wreck-1',
    ],
    [
      'sell_wreck',
      {
        details: {
          action: 'sell_wreck',
          wreck_id: 'wreck-1',
          message: 'Sold wreck.',
          new_balance: 2400,
          total_payout: 500,
          salvage_value: 400,
          cargo_value: 100,
          ship_class: 'skiff',
        },
        player: { credits: 2400 },
      },
      'Total Payout: 500',
    ],
    [
      'scrap_wreck',
      {
        details: {
          action: 'scrap_wreck',
          wreck_id: 'wreck-1',
          message: 'Scrapped wreck.',
          materials: [{ item_id: 'scrap_metal', quantity: 4 }],
          total_value: 1250,
          stored_at: 'sol_yard',
          ship_class: 'skiff',
        },
        cargo: [{ item_id: 'scrap_metal', item_name: 'Scrap Metal', quantity: 4 }],
        skills: { salvaging: { level: 2, xp: 140 } },
      },
      'Materials: 1 item(s)',
    ],
    [
      'commission_ship',
      {
        details: {
          commission_id: 'commission-1',
          ship_class: 'prospector',
          ship_name: 'Prospector',
          status: 'pending',
          credits_paid: 15000,
          credits_left: 5000,
          material_cost: 12000,
          labor_cost: 3000,
          build_time: 18,
          message: 'Commission created.',
        },
        player: { credits: 5000 },
      },
      'Commission Id: commission-1',
    ],
    [
      'cancel_commission',
      {
        details: {
          refund: 7500,
          credits_total: 12500,
          materials_returned: [{ item_id: 'steel_plate', quantity: 12 }],
          materials_note: 'Materials returned to storage.',
          message: 'Commission cancelled.',
        },
        player: { credits: 12500 },
      },
      'Refund: 7500',
    ],
    [
      'supply_commission',
      {
        details: {
          commission_id: 'commission-1',
          commission_status: 'pending',
          item_id: 'steel_plate',
          item_name: 'Steel Plate',
          supplied: 12,
          materials: [{ item_id: 'steel_plate', required: 12, supplied: 12 }],
          all_sourced: true,
          credits: 5000,
          message: 'Materials supplied.',
        },
        player: { credits: 5000 },
        cargo: [],
      },
      'Commission Id: commission-1',
    ],
    [
      'list_ship_for_sale',
      {
        details: {
          listing_id: 'listing-1',
          ship_id: 'ship-1',
          price: 20000,
          fee: 200,
          credits_left: 4800,
          message: 'Ship listed.',
        },
        player: { credits: 4800 },
      },
      'Listing Id: listing-1',
    ],
    [
      'buy_listed_ship',
      {
        details: {
          ship_id: 'ship-2',
          old_ship_id: 'ship-1',
          class_id: 'prospector',
          price: 20000,
          credits_left: 30000,
          message: 'Ship purchased.',
        },
        player: { credits: 30000 },
        ship: { id: 'ship-2', class_id: 'prospector', fuel: 100, max_fuel: 100 },
      },
      'Ship Id: ship-2',
    ],
  ] as const)('formats v0.378 post-action %s envelopes without raw JSON fallback', (command, fixture, expected) => {
    const { stdout, stderr } = captureStructuredOutput(command, fixture);

    expect(stderr).toBe('');
    expect(stdout).toContain(expected);
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

  test('formats empty trade offer lists without raw JSON fallback', () => {
    const { stdout, stderr } = captureStructuredOutput('get_trades', {
      incoming: [],
      outgoing: [],
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Pending Trade Offers ===');
    expect(stdout).toContain('(No pending trade offers)');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('formats incoming trade offer credit terms', () => {
    const { stdout, stderr } = captureStructuredOutput('get_trades', {
      incoming: [
        {
          trade_id: 'trade-credit-1',
          offerer_name: 'Ada',
          offer_items: [],
          request_items: [],
          offer_credits: 250,
          request_credits: 75,
          expires_at: '2026-06-26T00:00:00Z',
        },
      ],
      outgoing: [],
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Pending Trade Offers ===');
    expect(stdout).toContain('trade-credit-1: Ada offers 250 cr for 75 cr');
    expect(stdout).not.toContain('offers  for');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('generic list fallback formats list-shaped responses', () => {
    const { stdout, stderr } = captureStructuredOutput('get_missions', missionsFixture);

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Missions ===');
    expect(stdout).toContain('Pirate Sweep');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('formats empire policy snapshots without raw JSON fallback', () => {
    const { stdout, stderr } = captureStructuredOutput('get_empire_info', empireInfoFixture);

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Empire Policies ===');
    expect(stdout).toContain('solarian');
    expect(stdout).toContain('voidborn');
    expect(stdout).toContain('Fee 5,000 cr, min balance 25,000 cr, min rep 40');
    expect(stdout).toContain('Auto-approved');
    expect(stdout).toContain('Sales 1%, income 5%, property 0.5%, foreign default 3%');
    expect(stdout).toContain('unstable_core');
    expect(stdout).not.toContain('=== Response ===');
    expect(stdout).not.toContain('[object Object]');
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

  test('generic list renders rich message + policies list without falling to raw response', () => {
    const { stdout, stderr } = captureStructuredOutput('claim_insurance', {
      message: 'Active policies',
      policies: [{ policy_id: 'policy-1', coverage: 50000 }],
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Policies ===');
    expect(stdout).toContain('policy-1');
    expect(stdout).not.toContain('=== Response ===');
    expect(stdout).not.toContain('OK: Active policies');
  });

  test('passenger tables expose destination system and fare breakdowns', () => {
    const aboard = captureStructuredOutput('list_passengers', listPassengersFixture);
    expect(aboard.stderr).toBe('');
    expect(aboard.stdout).toContain('System');
    expect(aboard.stdout).toContain('Nova');
    expect(aboard.stdout).toContain('Fare');
    expect(aboard.stdout).toContain('Bonus');
    expect(aboard.stdout).toContain('125');
    expect(aboard.stdout).toContain('25');

    const waiting = captureStructuredOutput('list_station_passengers', listStationPassengersFixture);
    expect(waiting.stderr).toBe('');
    expect(waiting.stdout).toContain('System');
    expect(waiting.stdout).toContain('Nova');
    expect(waiting.stdout).toContain('Est. Fare');
    expect(waiting.stdout).toContain('240');
  });

  test('passenger tables do not render removed legacy fare fields', () => {
    const aboard = captureStructuredOutput('list_passengers', {
      ...listPassengersFixture,
      passengers: [
        {
          citizen_id: 'citizen-legacy',
          name: 'Legacy Fare',
          bio: 'A stale fixture from the old passenger API.',
          class: 'economy',
          destination: 'nova_central',
          destination_name: 'Nova Central',
          destination_system: 'Nova',
          fare: 999,
          speed_bonus: 25,
          ticks_remaining: 8,
        },
      ],
    });

    expect(aboard.stderr).toBe('');
    expect(aboard.stdout).toContain('Legacy Fare');
    expect(aboard.stdout).not.toContain('999');
  });

  test('bulk passenger unload renders delivered and stranded base fares', () => {
    const rendered = captureStructuredOutput('unload_passenger', unloadPassengerBulkFixture);

    expect(rendered.stderr).toBe('');
    expect(rendered.stdout).toContain('=== Passenger Unload ===');
    expect(rendered.stdout).toContain('Fare collected: 150');
    expect(rendered.stdout).toContain('=== Delivered Passengers ===');
    expect(rendered.stdout).toContain('Lyra Vale');
    expect(rendered.stdout).toContain('Base Fare');
    expect(rendered.stdout).toContain('125');
    expect(rendered.stdout).toContain('=== Stranded Passengers ===');
    expect(rendered.stdout).toContain('Orin Pax');
    expect(rendered.stdout).toContain('240');
    expect(rendered.stdout).not.toContain('=== Response ===');
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
        current_draw: 95,
        battery_stored: 420,
        battery_capacity: 600,
        efficiency: 0.85,
        fuel_inputs: [
          { item_id: 'fuel_cell', name: 'Fuel Cell', quantity_per_cycle: 12 },
          { item_id: 'iron_ore', name: 'Iron Ore', quantity_per_cycle: 5 },
        ],
        remediation: 'Sell Fuel Cell and Iron Ore into this station market to restore power.',
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
          level: 3,
          active: true,
          maintenance_satisfied: true,
          is_recycler: false,
        },
      ],
      player_facilities: [
        {
          facility_id: 'player-refinery',
          type: 'ore_refinery',
          name: 'Ore Refinery',
          category: 'production',
          level: 2,
          active: false,
          maintenance_satisfied: true,
          power_throttled: true,
          is_recycler: true,
          configured_recipe_id: 'iron_ore_reverse',
        },
      ],
      faction_facilities: [],
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('Power: 95/120 draw (85% efficiency)');
    expect(stdout).toContain('Battery: 420/600');
    expect(stdout).toContain('Fuel Inputs: 12 Fuel Cell, 5 Iron Ore');
    expect(stdout).toContain('Sell Fuel Cell and Iron Ore into this station market to restore power.');
    expect(stdout).toContain('=== Construction ===');
    expect(stdout).toContain('Life Support Mk II');
    expect(stdout).toContain('28 missing');
    expect(stdout).toContain('Battery Bank Mk I');
    expect(stdout).toContain('9 ticks');
    expect(stdout).toContain('=== Station Facilities ===');
    expect(stdout).toContain('Fuel Bunker');
    expect(stdout).toContain('=== Player Facilities ===');
    expect(stdout).toContain('Ore Refinery');
    expect(stdout).toContain('Level');
    expect(stdout).toContain('Recycler');
    expect(stdout).toContain('Power Throttled');
    expect(stdout).toContain('Recipe');
    expect(stdout).toContain('iron_ore_reverse');
    expect(stdout).not.toContain('=== Response ===');
  });

  test('get_drone formats documented location fields', () => {
    const { stdout, stderr } = captureStructuredOutput('get_drone', {
      id: 'drone-1',
      item_id: 'survey_drone',
      type: 'survey',
      name: 'Survey Drone',
      status: 'loaded',
      system_id: 'sol',
      poi_id: 'earth_station',
      hull: 100,
      max_hull: 100,
      cargo: [],
      cargo_used: 0,
      cargo_capacity: 20,
      script: 'scan()',
      memory: {},
      loaded_at: '2026-06-01T00:00:00Z',
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Drone ===');
    expect(stdout).toContain('System');
    expect(stdout).toContain('POI');
    expect(stdout).toContain('sol');
    expect(stdout).toContain('earth_station');
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
        current_draw: 150,
        battery_stored: 900,
        battery_capacity: 1000,
        efficiency: 0.92,
        fuel_inputs: [{ item_id: 'deuterium', name: 'Deuterium', quantity_per_cycle: 4 }],
        remediation: 'Sell Deuterium into this station market to bring power back online.',
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
      fuel_price: 20,
      fuel_price_all_in: 26,
      fuel_tax_per_unit: 6,
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('Fuel Price: 20 credits');
    expect(stdout).toContain('Fuel Tax: 6 credits/unit');
    expect(stdout).toContain('All-in Refuel Price: 26 credits/unit');
    expect(stdout).toContain('Power: 150/200 draw (92% efficiency)');
    expect(stdout).toContain('Battery: 900/1,000');
    expect(stdout).toContain('Fuel Inputs: 4 Deuterium');
    expect(stdout).toContain('Sell Deuterium into this station market to bring power back online.');
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
      fuel_price_all_in: 23,
      fuel_tax_per_unit: 3,
      services: ['refuel'],
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('Fuel: 20920/0');
    expect(stdout).toContain('Fuel Price: 20 credits');
    expect(stdout).toContain('Fuel Tax: 3 credits/unit');
    expect(stdout).toContain('All-in Refuel Price: 23 credits/unit');
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

  test('get_battle_status formats current combat state from schema response', () => {
    const { stdout, stderr } = captureStructuredOutput('get_battle_status', {
      battle_id: 'battle-1',
      system_id: 'sol',
      is_participant: true,
      tick_duration: 10,
      combat_state: {
        flee_counter: 1,
        flee_required: 3,
        can_escape: true,
        warp_disrupted: false,
        webbed: true,
        em_disrupted: true,
        disruption_ticks: 2,
        speed_penalty_pct: 25,
        effective_speed: 85,
        max_weapon_reach: 2,
      },
      sides: [
        { side_id: 1, faction_id: 'faction-smc', faction_name: 'SpaceMolt Co', faction_tag: 'SMC', player_count: 1 },
        { side_id: 2, player_count: 1 },
      ],
      participants: [
        {
          player_id: 'player-1',
          username: 'Marlowe',
          side_id: 1,
          auto_pilot: false,
          ship_name: 'Prospector',
          ship_class: 'prospector',
          stance: 'flee',
          target_id: 'pirate-1',
          zone: 'outer',
          zone_distance: 0,
          hull_pct: 82,
          shield_pct: 40,
        },
        {
          player_id: 'pirate-1',
          username: 'Pirate Skiff',
          side_id: 2,
          auto_pilot: true,
          ship_class: 'skiff',
          zone: 'inner',
          zone_distance: 3,
          hull_pct: 55,
          shield_pct: 0,
        },
      ],
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('=== Battle ===');
    expect(stdout).toContain('ID: battle-1');
    expect(stdout).toContain('System: sol');
    expect(stdout).toContain('Can Escape: yes');
    expect(stdout).toContain('Flee Progress: 1/3');
    expect(stdout).toContain('Effective Speed: 85');
    expect(stdout).toContain('Weapon Reach: 2 zones');
    expect(stdout).toContain('Warp Disrupted: no');
    expect(stdout).toContain('Webbed: yes');
    expect(stdout).toContain('EM Disrupted: yes (25%, 2 ticks)');
    expect(stdout).toContain('Pirate Skiff');
    expect(stdout).toContain('Distance');
    expect(stdout).toContain('3');
    expect(stdout).toContain('Sides');
    expect(stdout).toContain('SMC');
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

  test('get_system table output marks stronghold systems', () => {
    const { stdout, stderr } = captureStructuredOutput('get_system', {
      ...systemInfoFixture,
      system: {
        ...systemInfoFixture.system,
        is_stronghold: true,
      },
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('Stronghold: yes');
  });

  test('renders unknown cloaked signature hints in location-aware tables', () => {
    const nearby = captureStructuredOutput('get_nearby', {
      nearby: [],
      count: 0,
      pirates: [],
      pirate_count: 0,
      empire_npcs: [],
      empire_npc_count: 0,
      poi_id: 'sol_earth',
      unknown_signature: true,
    });
    const location = captureStructuredOutput('get_location', {
      ...getLocationFixture,
      location: { ...getLocationFixture.location, unknown_signature: true },
    });
    const status = captureStructuredOutput('get_status', {
      ...getStatusFixture,
      location: { ...getStatusFixture.location, unknown_signature: true },
    });

    expect(nearby.stderr).toBe('');
    expect(location.stderr).toBe('');
    expect(status.stderr).toBe('');
    for (const output of [nearby.stdout, location.stdout, status.stdout]) {
      expect(output).toContain('Unknown cloaked signature detected');
      expect(output).toContain('scan');
    }
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
      outputs[formatterName] = trimLineEndSpaces(stdout);
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
        Ibis"
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

      === Sides ===

        Side | Faction | Players
        -----+---------+--------
        1    | SMC     | 1

      === Participants ===

        Name    | ID       | Side | Stance | Target
        --------+----------+------+--------+---------
        Marlowe | player-1 | 1    | fire   | pirate-1"
      ,
        "cargo": 
      "
      === Cargo ===
      Credits: 12,345
      Used: 50/100

      Cargo (1):

        Name     | ID       | Qty | Unit Size
        ---------+----------+-----+----------
        Iron Ore | ore_iron |  50 |"
      ,
        "chat_sent": "[local] Clear skies.",
        "drone": 
      "
      === Drone ===

        Name         | ID      | Type   | Status | System | POI
        -------------+---------+--------+--------+--------+--------------
        Survey Drone | drone-1 | survey | loaded | sol    | earth_station

      Script:
      scan()"
      ,
        "drones": 
      "
      === Drones ===

        Name         | ID      | Type   | Status   | POI               | Cargo
        -------------+---------+--------+----------+-------------------+------
        Survey Drone | drone-1 | survey | deployed | sol_asteroid_belt | 40"
      ,
        "facilities": 
      "
      === Facilities ===

        Name        | ID         | Level | Status | Recycler | Idle Reason    | Owner
        ------------+------------+-------+--------+----------+----------------+--------
        Fuel Bunker | facility-1 | 2     | online | false    | fuel_tank_full | Marlowe"
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

        Name                    | ID            | Level | Category       | Active | Maint | Upkeep                           | Labor/cycle | Recycler | Owner
        ------------------------+---------------+-------+----------------+--------+-------+----------------------------------+-------------+----------+------
        Fuel Bunker             | station-fuel  | 3     | service        | true   | true  |                                  |             | false    |
        Confederacy Fleet Depot | station-depot | 3     | infrastructure | true   | false | 12 Fuel Cell, 4 Plasma Cell Pack | 320cr       |          |

      === Player Facilities ===

        Name         | ID              | Level | Category   | Active | Maint | Recycler | Recipe           | Idle Reason | Owner
        -------------+-----------------+-------+------------+--------+-------+----------+------------------+-------------+------
        Ore Refinery | player-refinery | 2     | production | false  | true  | true     | iron_ore_reverse | no_inputs   |

      === Faction Facilities ===

        Name          | ID              | Level | Category   | Active | Maint | Idle Reason                | Owner
        --------------+-----------------+-------+------------+--------+-------+----------------------------+------
        Alloy Smelter | faction-smelter | 1     | production | true   | true  | insufficient_labor_credits |"
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
        "facility_upgrades": 
      "
      === Available Upgrades ===

        Current | To              | Cost  | Ticks | Labor | Requires
        --------+-----------------+-------+-------+-------+---------------
        1       | Ore Refinery II | 48000 | 96    | 180   | Engineering 10

      Dock at the facility to start an upgrade."
      ,
        "faction_facility_owned": 
      "
      === Faction Facilities ===

        Name                   | ID             | Base          | System | Active | Rent    | Missed | Arrears | Labor/run | Idle
        -----------------------+----------------+---------------+--------+--------+---------+--------+---------+-----------+---------------------
        Faction Shipyard Berth | faction-yard-1 | Earth Station | sol    | true   | 1,200cr | 2      | 2,400cr | 60cr      | awaiting_build_order

      Faction rent bill: 1,200cr/cycle
      Faction arrears: 2,400cr
      Grace remaining: 1 cycle
      Faction facilities pay rent from the treasury each cycle.
      Use action 'faction_list' while docked for full per-facility detail at that station."
      ,
        "faction_query_intel": 
      "
      === Faction Intel ===
      Current tick: 900690
      Systems: 1

      Sol (sol)
      Empire: solarian
      Police: 3
      Intel tick: 900685 by Marlowe, age 5 ticks
        Sol Gas Cloud (gas_cloud) sol_gas_cloud
          - hydrogen_gas: richness 4, 500/1000 (50.00% remaining)
          - argon_gas: richness 2, 200/500 (40.00% remaining)"
      ,
        "fleet": 
      "
      === Fleet ===
      ID: fleet-1
      Leader: Marlowe

      === Members ===

        Name    | ID       | Ship       | Location | Status
        --------+----------+------------+----------+-------
        Marlowe | player-1 | prospector | Sol      | ready"
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
      Earth Station | personal | newest | 1 order | page 1/1
      Showing personal market orders.

        Item     | Side | Open/Qty | Filled | Price | Fee   | Created          | ID
        ---------+------+----------+--------+-------+-------+------------------+--------
        Iron Ore | buy  | 75/100   | 25     | 12 cr | 25 cr | 2026-05-29 00:00 | order-1"
      ,
        "nearby": 
      "
      === Nearby ===

      Players (1):
        Marlowe [SMC] (prospector)

      Pirates (1):
        Raider (skiff) - hostile

      Empire NPCs (1):
        Patrol (interceptor)

      Creatures (1):
        Pilot-Whale Pod [creature_pilot_whale_1] (pilot_whale) - grazer - hull 80/120"
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
      Credits: 12,345
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
