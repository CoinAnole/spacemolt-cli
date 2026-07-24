import { describe, expect, test } from 'bun:test';
import { formatNotificationMessage } from './display/notifications';
import { getNotificationsFixture } from './display/notifications.fixtures';
import {
  formatNotificationPreview,
  tableMessageFromPreview,
} from './notification-format-shared';
import { displayNotifications, formatNotification, NOTIFICATION_TYPES } from './notifications';

function stripAnsi(value: string): string {
  return value.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '');
}

function expectNoDiagnosticTokens(value: string): void {
  expect(value).not.toContain('NaN');
  expect(value).not.toContain('Infinity');
  expect(value).not.toContain('[object Object]');
  expect(value).not.toContain('undefined');
}

/** Nested JSON dump signatures that Policy 5 generic must never emit. */
function expectNoNestedJsonDump(value: string): void {
  expect(value).not.toMatch(/"hull"\s*:/);
  expect(value).not.toContain('nearby_players');
  expect(value).not.toMatch(/\{[^{}]*"id"\s*:/);
  expectNoDiagnosticTokens(value);
}

describe('notification formatting', () => {
  test.each([
    {
      name: 'chat message',
      notification: {
        type: 'chat',
        msg_type: 'chat_message',
        timestamp: '2026-05-18T12:00:00.000Z',
        data: { channel: 'local', sender: 'Marlowe', content: 'Fuel rescue inbound.' },
      },
      snippets: ['[CHAT:local]', 'Marlowe: Fuel rescue inbound.'],
    },
    {
      name: 'combat update',
      notification: {
        type: 'combat',
        msg_type: 'combat_update',
        timestamp: '2026-05-18T12:00:00.000Z',
        data: {
          attacker: 'raider',
          target: 'Marlowe',
          damage: 12,
          damage_type: 'laser',
          shield_hit: 8,
          hull_hit: 4,
          destroyed: true,
        },
      },
      snippets: ['[COMBAT]', 'raider hit Marlowe for 12 laser damage', 'DESTROYED'],
    },
    {
      name: 'mining yield',
      notification: {
        type: 'mining',
        msg_type: 'mining_yield',
        timestamp: '2026-05-18T12:00:00.000Z',
        data: { quantity: 5, resource_id: 'ore_iron', remaining: 42 },
      },
      snippets: ['[MINED]', '+5x ore_iron', '42 remaining at POI'],
    },
    {
      name: 'trade offer',
      notification: {
        type: 'trade',
        msg_type: 'trade_offer_received',
        timestamp: '2026-05-18T12:00:00.000Z',
        data: { from_name: 'Dockmaster', trade_id: 'trade_123', offer_credits: 250, request_credits: 100 },
      },
      snippets: ['[TRADE]', 'Offer from Dockmaster', 'Offering: 250 credits', 'trade accept trade_id=trade_123'],
    },
    {
      name: 'action error',
      notification: {
        type: 'action',
        msg_type: 'action_error',
        timestamp: '2026-05-18T12:00:00.000Z',
        data: { command: 'travel', tick: 77, message: 'drive offline' },
      },
      snippets: ['[ACTION FAILED]', 'travel failed (tick 77): drive offline'],
    },
    {
      name: 'market update',
      notification: {
        type: 'market',
        msg_type: 'market_update',
        timestamp: '2026-05-18T12:00:00.000Z',
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
            {
              item_id: 'ore_copper',
              sell_orders: [],
              buy_orders: [],
            },
          ],
        },
      },
      // Dual-use PREVIEW_HANDLERS: table Message quality (first item + +N more).
      snippets: [
        '[MARKET]',
        'Haven Exchange tick 901337: 2 item updates',
        'Iron Ore sell 40 @ 12, buy 25 @ 9',
        '+1 more',
      ],
    },
    {
      name: 'unknown with message',
      notification: {
        type: 'mystery',
        timestamp: '2026-05-18T12:00:00.000Z',
        data: { message: 'Something happened.' },
      },
      snippets: ['[MYSTERY]', 'Something happened.'],
    },
    {
      name: 'unknown detail fallback',
      notification: {
        type: 'oddity',
        timestamp: '2026-05-18T12:00:00.000Z',
        data: { code: 'strange', count: 2 },
      },
      // Policy 5 scalar bag: preferred keys as key=value, no nested JSON dump.
      snippets: ['[ODDITY]', 'code=strange', 'count=2'],
    },
  ])('$name', ({ notification, snippets }) => {
    const output = stripAnsi(formatNotification(notification).join('\n'));
    for (const snippet of snippets) {
      expect(output).toContain(snippet);
    }
  });

  const knownCases: Array<{ msgType: string; data: Record<string, unknown>; snippets: string[] }> = [
    {
      msgType: 'action_error',
      data: { command: 'travel', tick: 7, message: 'blocked' },
      snippets: ['[ACTION FAILED]', 'travel failed'],
    },
    {
      msgType: 'action_result',
      data: { command: 'mine', tick: 7, result: { message: 'Mined ore.' } },
      snippets: ['[ACTION RESULT]', 'mine completed', 'Mined ore.'],
    },
    {
      msgType: 'action_result_summary',
      data: {
        count: 18,
        commands: { jump: 12, undock: 1, storage: 1 },
        latest_tick: 1434000,
        latest_command: 'jump',
        latest_message: 'jumped → Alfirk',
      },
      snippets: [
        '[ACTION RESULTS]',
        '18 action results summarized',
        'jump×12',
        'undock×1',
        'storage×1',
        'latest tick 1434000',
        'latest jump',
        'latest: jumped → Alfirk',
      ],
    },
    {
      msgType: 'system_progress_summary',
      data: {
        count: 10,
        actions: { jump: 10 },
        latest_action: 'jump',
        latest_destination: 'alfirk',
        latest_arrival_tick: 1433966,
      },
      snippets: [
        '[SYSTEM]',
        '10 travel progress updates summarized',
        'jump×10',
        'latest jump → alfirk',
        'arrival tick 1433966',
      ],
    },
    {
      msgType: 'base_destroyed',
      data: { base_name: 'Outpost', wreck_id: 'wreck_1' },
      snippets: ['[BASE DESTROYED]', 'Outpost', 'wreck_1'],
    },
    {
      msgType: 'base_raid_update',
      data: { base_name: 'Outpost', current_health: 80, max_health: 100, damage_per_tick: 5 },
      snippets: ['[RAID]', 'Outpost: 80/100 HP'],
    },
    {
      msgType: 'battle_damage',
      data: { attacker: 'Alpha', target: 'Beta', damage: 3 },
      snippets: ['[BATTLE]', 'Alpha hit Beta for 3 damage'],
    },
    { msgType: 'battle_ended', data: { message: 'Victory' }, snippets: ['[BATTLE]', 'Battle ended! Victory'] },
    { msgType: 'battle_joined', data: { username: 'Marlowe' }, snippets: ['[BATTLE]', 'Marlowe joined'] },
    { msgType: 'battle_left', data: { username: 'Marlowe' }, snippets: ['[BATTLE]', 'Marlowe left'] },
    {
      msgType: 'battle_started',
      data: { battle_id: 'battle_1' },
      snippets: ['[BATTLE]', 'Battle started! ID: battle_1'],
    },
    {
      msgType: 'battle_update',
      data: { tick: 9, message: 'shields holding' },
      snippets: ['[BATTLE]', 'Battle tick 9', 'shields holding'],
    },
    {
      msgType: 'chat_message',
      data: { channel: 'local', sender: 'Marlowe', content: 'Docking.' },
      snippets: ['[CHAT:local]', 'Marlowe: Docking.'],
    },
    {
      msgType: 'combat_update',
      data: { attacker: 'raider', target: 'ship', damage: 4, damage_type: 'laser' },
      snippets: ['[COMBAT]', 'raider hit ship for 4 laser damage'],
    },
    {
      msgType: 'drone_destroyed',
      data: { drone_type: 'combat', drone_id: 'drone_1' },
      snippets: ['[DRONE]', 'combat drone was destroyed', 'drone_1'],
    },
    {
      msgType: 'drone_update',
      data: { drone_type: 'combat', damage: 6, target_id: 'pirate' },
      snippets: ['[DRONE]', 'combat drone dealt 6 damage'],
    },
    {
      msgType: 'faction_invite',
      data: { faction_name: 'Wardens', faction_id: 'fac_1' },
      snippets: ['[FACTION]', 'Wardens', 'join_faction faction_id=fac_1', 'faction decline_invite faction_id=fac_1'],
    },
    {
      msgType: 'faction_peace_proposed',
      data: { proposer_name: 'Wardens', terms: 'truce', faction_id: 'fac_1' },
      snippets: ['[PEACE]', 'Wardens', 'Terms: truce', 'faction accept_peace target_faction_id=fac_1'],
    },
    {
      msgType: 'faction_war_declared',
      data: { attacker_name: 'Raiders', reason: 'territory' },
      snippets: ['[WAR]', 'Raiders', 'Reason: territory'],
    },
    { msgType: 'friend_offline', data: { username: 'Marlowe' }, snippets: ['[FRIEND]', 'Marlowe went offline'] },
    { msgType: 'friend_online', data: { username: 'Marlowe' }, snippets: ['[FRIEND]', 'Marlowe is now online'] },
    { msgType: 'friend_removed', data: { username: 'Marlowe' }, snippets: ['[FRIEND]', 'Marlowe removed you'] },
    {
      msgType: 'friend_request',
      data: { from_name: 'Marlowe' },
      snippets: ['[FRIEND]', 'Marlowe sent you a friend request'],
    },
    {
      msgType: 'friend_request_accepted',
      data: { from_name: 'Marlowe' },
      snippets: ['[FRIEND]', 'Marlowe accepted your friend request'],
    },
    { msgType: 'mining_yield', data: { quantity: 2, resource_id: 'ore_iron' }, snippets: ['[MINED]', '+2x ore_iron'] },
    {
      msgType: 'market_update',
      data: {
        base_id: 'haven_exchange',
        base_name: 'Haven Exchange',
        tick: 901337,
        items: [
          {
            item_id: 'ore_iron',
            item_name: 'Iron Ore',
            sell_orders: [{ price_each: 12, quantity: 40 }],
            buy_orders: [{ price_each: 9, quantity: 25 }],
          },
        ],
      },
      snippets: ['[MARKET]', 'Haven Exchange', '1 item update', 'Iron Ore', 'sell 40 @ 12', 'buy 25 @ 9'],
    },
    {
      msgType: 'crafting_summary',
      data: {
        count: 48,
        latest_tick: 901337,
        jobs: 2,
        rental_jobs: 1,
        escrowed_credits: 300,
        latest_message: 'Crafting fuel cells.',
      },
      snippets: [
        '[CRAFTING]',
        '48 crafting progress updates summarized',
        'latest tick 901337',
        '2 active jobs',
        '1 on rented facility',
        '300cr still escrowed',
        'latest: Crafting fuel cells.',
      ],
    },
    {
      msgType: 'crafting_update',
      data: {
        tick: 901338,
        jobs: [
          {
            job_id: 'rental-job',
            recipe: 'Assemble Power Cell',
            external: true,
            escrowed_credits: 300,
            runs_remaining: 2,
            completed: false,
          },
        ],
      },
      // Dual-use table Message: "1 job tick 901338: recipe, rental, …"
      snippets: [
        '[CRAFTING]',
        '1 job tick 901338',
        'Assemble Power Cell',
        'rental',
        '300cr escrowed',
        '2 runs left',
      ],
    },
    {
      msgType: 'pilotless_ship',
      data: { player_username: 'Marlowe', ship_class: 'hauler', ticks_remaining: 3 },
      snippets: ['[PILOTLESS]', "Marlowe's hauler", 'Vulnerable for 3 ticks'],
    },
    {
      msgType: 'pirate_combat',
      data: { damage: 8, destroyed: true },
      snippets: ['[PIRATES]', 'Pirate dealt 8 damage', 'YOU WERE DESTROYED'],
    },
    {
      msgType: 'pirate_destroyed',
      data: { loot: { credits: 10 } },
      snippets: ['[PIRATES]', 'Pirate destroyed!', 'Loot: {"credits":10}'],
    },
    { msgType: 'pirate_spawn', data: { num_pirates: 2 }, snippets: ['[PIRATES]', '2 pirate(s) appeared'] },
    { msgType: 'pirate_warning', data: { message: 'Incoming' }, snippets: ['[PIRATES]', 'Incoming'] },
    {
      msgType: 'player_died',
      data: { killer_name: 'Raider', respawn_base: 'home' },
      snippets: ['[DEATH]', 'Destroyed by Raider', 'Respawned at: home'],
    },
    {
      msgType: 'player_kill',
      data: { victim_name: 'Raider', bounty: 50, wreck_id: 'wreck_1' },
      snippets: ['[KILL]', 'Raider', 'Bounty: 50 credits', 'Wreck: wreck_1'],
    },
    {
      msgType: 'poi_arrival',
      data: { clan_tag: 'SOL', username: 'Marlowe', poi_name: 'Earth' },
      snippets: ['[ARRIVAL]', '[SOL] Marlowe has arrived at Earth'],
    },
    {
      msgType: 'poi_departure',
      data: { clan_tag: 'SOL', username: 'Marlowe', poi_name: 'Earth' },
      snippets: ['[DEPARTURE]', '[SOL] Marlowe has departed from Earth'],
    },
    {
      msgType: 'police_combat',
      data: { damage: 12, destroyed: true },
      snippets: ['[POLICE]', 'Police drone dealt 12 damage', 'YOU WERE DESTROYED'],
    },
    { msgType: 'police_spawn', data: { num_drones: 3 }, snippets: ['[POLICE]', '3 police drone(s) arrived'] },
    {
      msgType: 'police_warning',
      data: { message: 'Contraband', police_level: 2, response_ticks: 5 },
      snippets: ['[POLICE]', 'Contraband', 'Security level: 2'],
    },
    { msgType: 'queue_cleared', data: { reason: 'manual' }, snippets: ['[QUEUE]', 'Action queue cleared: manual'] },
    {
      msgType: 'reconnected',
      data: { message: 'Back online', was_pilotless: true, ticks_remaining: 2 },
      snippets: ['[RECONNECTED]', 'Back online', 'recovered with 2 ticks'],
    },
    {
      msgType: 'scan_detected',
      data: { scanner_username: 'Marlowe', scanner_ship_class: 'scout', revealed_info: ['hull'] },
      snippets: ['[SCANNED]', 'Marlowe', 'They learned: hull'],
    },
    {
      msgType: 'scan_result',
      data: { username: 'Raider', success: true, revealed_info: ['hull'], ship_class: 'fighter' },
      snippets: ['[SCAN]', 'Scan of Raider revealed: hull', 'Ship: fighter'],
    },
    {
      msgType: 'ship_commission_complete',
      data: {
        tick: 901400,
        commission_id: 'commission-1',
        ship_id: 'ship-42',
        ship_class: 'prospector',
        ship_name: 'Prospector',
        base_id: 'earth_station',
        base_name: 'Earth Station',
      },
      snippets: [
        '[SHIP READY]',
        'Commission commission-1',
        'Prospector (prospector)',
        'ship ship-42',
        'Earth Station (earth_station)',
      ],
    },
    {
      msgType: 'skill_level_up',
      data: { skill_id: 'mining', new_level: 3, xp_gained: 50 },
      snippets: ['[LEVEL UP]', 'mining is now level 3', '+50 XP'],
    },
    {
      msgType: 'skill_xp_gain',
      data: { skill_id: 'mining', xp_gained: 5, current_xp: 10, next_level_xp: 20 },
      snippets: ['[XP]', '+5 XP in mining', '10/20'],
    },
    {
      msgType: 'system',
      data: { type: 'gameplay_tip', message: 'Use scanners.' },
      snippets: ['[TIP]', 'Use scanners.'],
    },
    { msgType: 'trade_cancelled', data: { trade_id: 'trade_1' }, snippets: ['[TRADE]', 'Trade cancelled', 'trade_1'] },
    {
      msgType: 'trade_complete',
      data: { partner_name: 'Marlowe' },
      snippets: ['[TRADE]', 'Trade completed with Marlowe'],
    },
    { msgType: 'trade_declined', data: { from_name: 'Marlowe' }, snippets: ['[TRADE]', 'Trade declined by Marlowe'] },
    {
      msgType: 'trade_offer_received',
      data: { from_name: 'Dockmaster', trade_id: 'trade_1', offer_credits: 5 },
      snippets: ['[TRADE]', 'Offer from Dockmaster', 'Offering: 5 credits', 'trade accept trade_id=trade_1'],
    },
    { msgType: 'version_info', data: { version: '2.0.0' }, snippets: ['[VERSION]', 'Server version: 2.0.0'] },
  ];

  test('known notification cases cover every formatter', () => {
    expect(knownCases.map((entry) => entry.msgType).sort()).toEqual(NOTIFICATION_TYPES);
  });

  test.each(knownCases)('formats known notification type $msgType', ({ msgType, data, snippets }) => {
    const output = stripAnsi(
      formatNotification({
        type: msgType,
        msg_type: msgType,
        timestamp: '2026-05-18T12:00:00.000Z',
        data,
      }).join('\n'),
    );

    for (const snippet of snippets) {
      expect(output).toContain(snippet);
    }
  });

  test('malformed ship commission receipt falls back without diagnostic tokens', () => {
    const output = stripAnsi(
      formatNotification({
        type: 'system',
        msg_type: 'ship_commission_complete',
        timestamp: '2026-07-17T20:00:00.000Z',
        data: {
          commission_id: 'commission-only',
          ship_id: { malformed: true },
          ship_name: Number.NaN,
        },
      }).join('\n'),
    );

    // Handler emits diagnostic tokens (NaN) → Policy 5 generic scalar bag fallback.
    // Never dump nested ship_id object as JSON.
    expect(output).toContain('commission_id=commission-only');
    expect(output).not.toContain('malformed');
    expectNoDiagnosticTokens(output);
    expectNoNestedJsonDump(output);
  });

  test('crafting summary formatter omits malformed numeric and object fields', () => {
    const output = stripAnsi(
      formatNotification({
        type: 'crafting',
        msg_type: 'crafting_summary',
        timestamp: '2026-06-29T00:00:00.000Z',
        data: {
          count: Number.NaN,
          jobs: Number.POSITIVE_INFINITY,
          latest_tick: { bad: true },
          latest_message: { text: 'bad' },
        },
      }).join('\n'),
    );

    expect(output).toContain('0 crafting progress updates summarized');
    expect(output).not.toContain('NaN');
    expect(output).not.toContain('Infinity');
    expect(output).not.toContain('[object Object]');
    expect(output).not.toContain('latest tick');
    expect(output).not.toContain('latest:');
  });

  test('crafting summary formatter handles non-object data defensively', () => {
    const output = stripAnsi(
      formatNotification({
        type: 'crafting',
        msg_type: 'crafting_summary',
        timestamp: '2026-06-29T00:00:00.000Z',
        data: null,
      } as unknown as Parameters<typeof formatNotification>[0]).join('\n'),
    );

    expect(output).toContain('[CRAFTING]');
    expectNoDiagnosticTokens(output);
  });

  test('action_result omits bulky ship and location payloads', () => {
    const output = stripAnsi(
      formatNotification({
        type: 'action_result',
        msg_type: 'action_result',
        timestamp: '2026-07-24T19:05:05.000Z',
        data: {
          command: 'undock',
          tick: 1433948,
          result: {
            ship: { id: 'ship-1', name: 'Dust Devil', hull: 130 },
            location: {
              system_name: 'Nova Terra',
              nearby_players: [{ username: 'ILC Knurl' }, { username: 'Cody' }],
              nearby_player_count: 88,
            },
            details: { action: 'undock' },
          },
        },
      }).join('\n'),
    );

    expect(output).toContain('[ACTION RESULT]');
    expect(output).toContain('undock completed');
    expect(output).toContain('undock');
    expect(output).not.toContain('nearby_players');
    expect(output).not.toContain('ILC Knurl');
    expect(output).not.toContain('"hull":130');
  });

  test('system jump progress formats a compact one-liner', () => {
    const output = stripAnsi(
      formatNotification({
        type: 'system',
        msg_type: 'system',
        timestamp: '2026-07-24T19:05:15.000Z',
        data: { action: 'jump', arrival_tick: 1433950, destination: 'lacaille_9352', is_wormhole: false },
      }).join('\n'),
    );

    expect(output).toContain('[SYSTEM]');
    expect(output).toContain('jump');
    expect(output).toContain('→ lacaille_9352');
    expect(output).toContain('arrival tick 1433950');
    expect(output).not.toContain('"action"');
  });

  test.each([
    ['null entry', null],
    ['string entry', 'bad'],
    ['missing data', { type: 'system', timestamp: '2026-06-29T00:00:00.000Z' }],
    ['non-object data', { type: 'system', timestamp: '2026-06-29T00:00:00.000Z', data: 'bad' }],
    ['array data', { type: 'system', timestamp: '2026-06-29T00:00:00.000Z', data: [{ bad: true }] }],
  ])('displayNotifications handles malformed notification: %s', (_name, notification) => {
    const lines: string[] = [];

    expect(() =>
      displayNotifications([notification] as unknown as Parameters<typeof displayNotifications>[0], {
        out(message = '') {
          lines.push(message);
        },
        err() {},
      }),
    ).not.toThrow();

    expect(lines.length).toBeGreaterThan(0);
    expectNoDiagnosticTokens(stripAnsi(lines.join('\n')));
  });

  test.each([
    [
      'scan_result malformed revealed_info',
      {
        type: 'scan',
        msg_type: 'scan_result',
        timestamp: '2026-06-29T00:00:00.000Z',
        data: { success: true, revealed_info: { bad: true } },
      },
    ],
    [
      'scan_detected malformed revealed_info',
      {
        type: 'scan',
        msg_type: 'scan_detected',
        timestamp: '2026-06-29T00:00:00.000Z',
        data: { revealed_info: { bad: true } },
      },
    ],
    [
      'police_warning missing message',
      {
        type: 'police',
        msg_type: 'police_warning',
        timestamp: '2026-06-29T00:00:00.000Z',
        data: {},
      },
    ],
    [
      'reconnected missing message',
      {
        type: 'system',
        msg_type: 'reconnected',
        timestamp: '2026-06-29T00:00:00.000Z',
        data: {},
      },
    ],
  ])('formatNotification handles malformed known handler data: %s', (_name, notification) => {
    const output = stripAnsi(formatNotification(notification).join('\n'));

    expect(output.length).toBeGreaterThan(0);
    expectNoDiagnosticTokens(output);
  });

  test('action prompts do not reference removed flat grouped commands', () => {
    const prompts = [
      formatNotification({
        type: 'trade',
        msg_type: 'trade_offer_received',
        timestamp: '2026-05-18T12:00:00.000Z',
        data: { from_name: 'Dockmaster', trade_id: 'trade_1' },
      }).join('\n'),
      formatNotification({
        type: 'faction',
        msg_type: 'faction_invite',
        timestamp: '2026-05-18T12:00:00.000Z',
        data: { faction_name: 'Wardens', faction_id: 'fac_1' },
      }).join('\n'),
      formatNotification({
        type: 'faction',
        msg_type: 'faction_peace_proposed',
        timestamp: '2026-05-18T12:00:00.000Z',
        data: { proposer_name: 'Wardens', faction_id: 'fac_1' },
      }).join('\n'),
    ]
      .map(stripAnsi)
      .join('\n');

    expect(prompts).toContain('trade accept trade_id=trade_1');
    expect(prompts).toContain('trade decline trade_id=trade_1');
    expect(prompts).toContain('faction decline_invite faction_id=fac_1');
    expect(prompts).toContain('faction accept_peace target_faction_id=fac_1');
    expect(prompts).not.toContain('trade_accept');
    expect(prompts).not.toContain('trade_decline');
    expect(prompts).not.toContain('faction_decline_invite');
    expect(prompts).not.toContain('faction_accept_peace');
  });

  test('displayNotifications writes formatted lines through the provided writer', () => {
    const lines: string[] = [];
    displayNotifications(
      [
        {
          type: 'chat',
          msg_type: 'chat_message',
          timestamp: '2026-05-18T12:00:00.000Z',
          data: { sender: 'Marlowe', content: 'Docking.' },
        },
      ],
      {
        out(message = '') {
          lines.push(message);
        },
        err() {},
      },
    );

    expect(stripAnsi(lines.join('\n'))).toContain('Marlowe: Docking.');
  });

  describe('Policy 5 pure preview ladder (formatNotificationPreview)', () => {
    test('chat-like sender+content without dedicated PREVIEW_HANDLER keeps sender prefix', () => {
      // No PREVIEW_HANDLERS entry for this msg_type — must use Policy 5 sender+body rung.
      const preview = formatNotificationPreview({
        type: 'chat',
        msg_type: 'future_chat_variant',
        timestamp: '2026-05-18T12:00:00.000Z',
        data: {
          channel: 'local',
          sender: 'Ibis',
          content: 'Clear skies over Sol today.',
        },
      });

      expect(preview.headline).toBe('Ibis: Clear skies over Sol today.');
      expect(preview.headline).not.toBe('Clear skies over Sol today.');
      expect(preview.tag).toBe('FUTURE_CHAT_VARIANT');
      expect(tableMessageFromPreview(preview)).toBe('Ibis: Clear skies over Sol today.');
    });

    test('unknown type with scalar system+tick includes both; never nested JSON', () => {
      const preview = formatNotificationPreview({
        type: 'oddity',
        msg_type: 'oddity',
        timestamp: '2026-05-18T12:00:00.000Z',
        data: { system: 'Alfirk', tick: 1 },
      });

      expect(preview.headline).toContain('system=Alfirk');
      expect(preview.headline).toContain('tick=1');
      expectNoNestedJsonDump(preview.headline);
    });

    test('unknown type with bulky ship + scalar code omits nested ship JSON', () => {
      const preview = formatNotificationPreview({
        type: 'mystery',
        msg_type: 'mystery',
        timestamp: '2026-05-18T12:00:00.000Z',
        data: {
          code: 'strange',
          ship: {
            id: 'ship-1',
            name: 'Dust Devil',
            hull: 130,
            modules: [{ id: 'laser' }],
          },
          nearby_players: [{ username: 'Spy', id: 'p-9' }],
        },
      });

      expect(preview.headline).toContain('code=strange');
      expect(preview.headline).not.toContain('Dust Devil');
      expect(preview.headline).not.toContain('Spy');
      expectNoNestedJsonDump(preview.headline);
      expect(preview.omittedHint).toBeDefined();
      expect(preview.omittedHint).toMatch(/ship|nearby_players/);
    });

    test('sender+body beats bare MESSAGE_KEYS', () => {
      const preview = formatNotificationPreview({
        type: 'social',
        msg_type: 'untyped_social',
        data: {
          sender: 'Ibis',
          content: 'Clear skies over Sol today.',
          message: 'should-not-win-alone',
        },
      });
      expect(preview.headline).toBe('Ibis: Clear skies over Sol today.');
    });

    test('command+error beats bare MESSAGE_KEYS', () => {
      const preview = formatNotificationPreview({
        type: 'action',
        msg_type: 'untyped_error',
        data: { command: 'jump', message: 'drive offline', code: 'E_DRIVE' },
      });
      expect(preview.headline).toBe('jump: drive offline');
    });

    test('MESSAGE_KEYS beat scalar bag', () => {
      const preview = formatNotificationPreview({
        type: 'mystery',
        msg_type: 'mystery',
        data: { message: 'Something happened.', code: 'strange', tick: 9 },
      });
      expect(preview.headline).toBe('Something happened.');
      expect(preview.headline).not.toContain('code=');
    });

    test('last resort is short notification label, never JSON.stringify of data', () => {
      const preview = formatNotificationPreview({
        type: 'emptyish',
        msg_type: 'emptyish',
        data: {
          ship: { id: 'ship-1', hull: 100 },
          location: { nearby_players: [{ username: 'Spy' }] },
        },
      });
      expect(preview.headline).toBe('notification');
      expectNoNestedJsonDump(preview.headline);
      expect(JSON.stringify(preview)).not.toMatch(/"hull"\s*:/);
    });

    test('length caps truncate pathological strings', () => {
      const long = 'x'.repeat(500);
      const preview = formatNotificationPreview(
        {
          type: 'mystery',
          msg_type: 'mystery',
          data: { message: long },
        },
        { maxLineLength: 40 },
      );
      expect(preview.headline.length).toBeLessThanOrEqual(40);
      expect(preview.headline.endsWith('…')).toBe(true);
    });

    test('inline generic path never dumps nested ship/nearby JSON', () => {
      const output = stripAnsi(
        formatNotification({
          type: 'mystery',
          msg_type: 'mystery_bulk',
          timestamp: '2026-05-18T12:00:00.000Z',
          data: {
            code: 'strange',
            ship: { id: 'ship-1', name: 'Dust Devil', hull: 130 },
            location: { nearby_players: [{ username: 'Spy' }] },
          },
        }).join('\n'),
      );

      expect(output).toContain('[MYSTERY_BULK]');
      expect(output).toContain('code=strange');
      expect(output).not.toContain('Dust Devil');
      expect(output).not.toContain('Spy');
      expectNoNestedJsonDump(output);
    });

    test('tableMessageFromPreview folds short first detail only', () => {
      expect(
        tableMessageFromPreview({
          tag: 'SUMMARY',
          headline: '18 results summarized',
          details: ['Latest: jumped → Alfirk'],
        }),
      ).toBe('18 results summarized; Latest: jumped → Alfirk');

      expect(
        tableMessageFromPreview({
          tag: 'SUMMARY',
          headline: '18 results summarized',
          details: [],
        }),
      ).toBe('18 results summarized');

      // Long first detail is not folded.
      const longDetail = 'y'.repeat(81);
      expect(
        tableMessageFromPreview({
          tag: 'SUMMARY',
          headline: 'headline',
          details: [longDetail],
        }),
      ).toBe('headline');
    });
  });

  describe('PR2 table Message baseline parity (PREVIEW_HANDLERS)', () => {
    /**
     * Until PR4, pure preview Message must match today's table Message oracle.
     * Use a high maxLineLength so truncation does not mask formatter drift — table cell
     * width (120) is applied by printCompactTable, not formatNotificationMessage itself.
     */
    function expectBaselineMessageParity(notification: Record<string, unknown>) {
      const options = { maxLineLength: 10_000 as const };
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, options));
      expect(fromPreview).toBe(formatNotificationMessage(notification));
    }

    const baselineFixtures: Array<{ name: string; notification: Record<string, unknown> }> = [
      {
        name: 'market_update zero items',
        notification: {
          type: 'market',
          msg_type: 'market_update',
          data: { base_name: 'Empty Dock', tick: 1, items: [] },
        },
      },
      {
        name: 'market_update single item depth',
        notification: {
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
        },
      },
      {
        name: 'market_update multi item + more',
        notification: {
          type: 'market',
          msg_type: 'market_update',
          data: {
            base_name: 'Haven Exchange',
            tick: 901337,
            items: [
              {
                item_name: 'Iron Ore',
                sell_orders: [
                  { price_each: 12, quantity: 40 },
                  { price_each: 11, quantity: 10 },
                  { price_each: 10, quantity: 5 },
                ],
                buy_orders: [{ price_each: 9, quantity: 25 }],
              },
              { item_id: 'ore_copper', sell_orders: [], buy_orders: [] },
            ],
          },
        },
      },
      {
        name: 'market_update book emptied',
        notification: {
          type: 'market',
          msg_type: 'market_update',
          data: {
            base_name: 'Haven Exchange',
            items: [{ item_name: 'Iron Ore', sell_orders: [], buy_orders: [] }],
          },
        },
      },
      {
        name: 'crafting_update jobs path',
        notification: {
          type: 'crafting',
          msg_type: 'crafting_update',
          data: {
            tick: 901500,
            jobs: [
              {
                job_id: 'rental-job',
                recipe: 'Power Cell',
                external: true,
                escrowed_credits: 300,
                runs_remaining: 2,
                completed: true,
                output_package_id: 'pkg-9',
                output_package_label: 'Pack',
              },
            ],
          },
        },
      },
      {
        name: 'crafting_update multi jobs +more',
        notification: {
          type: 'crafting',
          msg_type: 'crafting_update',
          data: {
            tick: 9,
            jobs: [
              { recipe: 'A', runs_remaining: 1 },
              { recipe: 'B', runs_remaining: 2 },
              { recipe: 'C', runs_remaining: 3 },
              { recipe: 'D', runs_remaining: 4 },
            ],
          },
        },
      },
      {
        name: 'crafting_update no-jobs package path',
        notification: {
          type: 'crafting',
          msg_type: 'crafting_update',
          data: {
            message: 'Job completed',
            completed: true,
            tick: 901510,
            output_package_id: 'pkg-solo-1',
            output_package_label: 'Solo Pack',
          },
        },
      },
      {
        name: 'crafting_update no-jobs rental escrow',
        notification: {
          type: 'crafting',
          msg_type: 'crafting_update',
          data: {
            external: true,
            escrowed_credits: 120,
            tick: 9,
          },
        },
      },
      {
        name: 'crafting_update empty fallback',
        notification: {
          type: 'crafting',
          msg_type: 'crafting_update',
          data: {},
        },
      },
      {
        name: 'crafting_summary full fields',
        notification: {
          type: 'crafting',
          msg_type: 'crafting_summary',
          data: {
            count: 3,
            jobs: 2,
            rental_jobs: 1,
            escrowed_credits: 300,
            latest_tick: 901501,
            latest_message: 'Still running.',
          },
        },
      },
      {
        name: 'crafting_summary count only',
        notification: {
          type: 'crafting',
          msg_type: 'crafting_summary',
          data: { count: 1 },
        },
      },
      {
        name: 'crafting_summary malformed numerics',
        notification: {
          type: 'crafting',
          msg_type: 'crafting_summary',
          data: {
            count: Number.NaN,
            jobs: Number.POSITIVE_INFINITY,
            latest_tick: { bad: true },
            latest_message: { text: 'bad' },
          },
        },
      },
      {
        name: 'action_result_summary with latest message',
        notification: {
          type: 'action',
          msg_type: 'action_result_summary',
          data: {
            count: 18,
            commands: { jump: 12, undock: 1, storage: 1 },
            latest_tick: 1434000,
            latest_command: 'jump',
            latest_message: 'jumped → Alfirk',
          },
        },
      },
      {
        name: 'action_result_summary without latest message',
        notification: {
          type: 'action',
          msg_type: 'action_result_summary',
          data: {
            count: 2,
            commands: { dock: 2 },
            latest_tick: 10,
            latest_command: 'dock',
          },
        },
      },
      {
        name: 'system_progress_summary action+destination',
        notification: {
          type: 'system',
          msg_type: 'system_progress_summary',
          data: {
            count: 2,
            actions: { jump: 2 },
            latest_action: 'jump',
            latest_destination: 'grumium',
            latest_arrival_tick: 1433952,
          },
        },
      },
      {
        name: 'system_progress_summary action only',
        notification: {
          type: 'system',
          msg_type: 'system_progress_summary',
          data: {
            count: 1,
            latest_action: 'travel',
          },
        },
      },
      {
        name: 'system_progress_summary destination only',
        notification: {
          type: 'system',
          msg_type: 'system_progress_summary',
          data: {
            count: 4,
            latest_destination: 'alfirk',
          },
        },
      },
      {
        name: 'ship_commission_complete receipt',
        notification: {
          type: 'system',
          msg_type: 'ship_commission_complete',
          data: {
            tick: 901400,
            commission_id: 'commission-1',
            ship_id: 'ship-42',
            ship_class: 'prospector',
            ship_name: 'Prospector',
            base_id: 'earth_station',
            base_name: 'Earth Station',
          },
        },
      },
    ];

    test.each(baselineFixtures)('parity: $name', ({ notification }) => {
      expectBaselineMessageParity(notification);
    });

    test('get_notifications fixture non-regressable Message snippets', () => {
      const rows = getNotificationsFixture.notifications as Array<Record<string, unknown>>;
      for (const notification of rows) {
        const msgType =
          typeof notification.msg_type === 'string' ? notification.msg_type : String(notification.type ?? '');
        // Only assert exact parity for PR2 typed special-cases; others use Policy 5 ladder
        // (chat already covered by PR1) or still-independent table path.
        if (
          msgType === 'market_update' ||
          msgType === 'ship_commission_complete' ||
          msgType === 'crafting_update' ||
          msgType === 'crafting_summary' ||
          msgType === 'action_result_summary' ||
          msgType === 'system_progress_summary'
        ) {
          expectBaselineMessageParity(notification);
        }
      }

      const market = rows.find((n) => n.msg_type === 'market_update')!;
      const commission = rows.find((n) => n.msg_type === 'ship_commission_complete')!;
      const chat = rows.find((n) => n.msg_type === 'chat_message')!;

      const marketMsg = tableMessageFromPreview(
        formatNotificationPreview(market, { maxLineLength: 120 }),
      );
      expect(marketMsg).toContain('Haven Exchange');
      expect(marketMsg).toContain('1 item update');
      expect(marketMsg).toContain('Iron Ore');
      expect(marketMsg).toContain('sell 40 @ 12');
      expect(marketMsg).toContain('buy 25 @ 9');

      const commissionMsg = tableMessageFromPreview(
        formatNotificationPreview(commission, { maxLineLength: 120 }),
      );
      expect(commissionMsg).toContain('Commission commission-1');
      expect(commissionMsg).toContain('ship ship-42');
      expect(commissionMsg).toContain('Prospector (prospector)');
      expect(commissionMsg).toContain('Earth Station (earth_station)');

      // Chat is Policy 5 ladder (PR1) — still non-regressable sender:content form.
      const chatMsg = tableMessageFromPreview(formatNotificationPreview(chat, { maxLineLength: 120 }));
      expect(chatMsg).toBe('Ibis: Clear skies over Sol today.');
      expect(chatMsg).toBe(formatNotificationMessage(chat));
    });

    test('ship_commission without receipt falls through (no forced empty headline)', () => {
      const notification = {
        type: 'system',
        msg_type: 'ship_commission_complete',
        data: { commission_id: 'commission-only' },
      };
      const preview = formatNotificationPreview(notification, { maxLineLength: 120 });
      // Typed handler returns null → Policy 5 scalar bag (improvement over table JSON dump).
      expect(preview.headline).toContain('commission_id=commission-only');
      expect(preview.tag).toBe('SHIP_COMMISSION_COMPLETE');
      expectNoNestedJsonDump(preview.headline);
    });

    test('inline dual-use uses preview headline for market_update', () => {
      const notification = {
        type: 'market',
        msg_type: 'market_update',
        timestamp: '2026-05-18T12:00:00.000Z',
        data: {
          base_name: 'Haven Exchange',
          tick: 901337,
          items: [
            {
              item_name: 'Iron Ore',
              sell_orders: [{ price_each: 12, quantity: 40 }],
              buy_orders: [{ price_each: 9, quantity: 25 }],
            },
          ],
        },
      };
      const preview = formatNotificationPreview(notification);
      const output = stripAnsi(formatNotification(notification).join('\n'));
      expect(output).toContain(`[MARKET] ${preview.headline}`);
      expect(output).toContain('Haven Exchange tick 901337: 1 item update');
    });
  });
});
