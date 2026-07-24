import { describe, expect, test } from 'bun:test';
import { formatNotificationMessage } from './display/notifications';
import { getNotificationsFixture } from './display/notifications.fixtures';
import {
  formatActionResultDetails,
  formatInventoryPreview,
  formatNotificationPreview,
  hasPreviewHandler,
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
      snippets: ['[PIRATES]', 'Pirate destroyed!', 'Loot: 1 item: credits×10'],
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

    // Typed PREVIEW_HANDLER returns null (no receipt); writeLine also emits nothing;
    // dual-registry falls through to Policy 5 scalar bag. Never dump nested ship_id as JSON.
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
    const notification = {
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
    };
    const output = stripAnsi(formatNotification(notification).join('\n'));

    expect(output).toContain('[ACTION RESULT]');
    expect(output).toContain('undock completed');
    expect(output).toContain('undock');
    expect(output).not.toContain('nearby_players');
    expect(output).not.toContain('ILC Knurl');
    expect(output).not.toContain('"hull":130');
    expect(output).not.toContain('Dust Devil');
    expectNoNestedJsonDump(output);

    // Pure preview path (PREVIEW_HANDLERS) matches inline compact form.
    expect(hasPreviewHandler('action_result')).toBe(true);
    const preview = formatNotificationPreview(notification);
    expect(preview.tag).toBe('ACTION RESULT');
    expect(preview.headline).toContain('undock completed');
    expect(preview.headline).toContain('1433948');
    expect(preview.details.join(' ')).toContain('undock');
    expectNoNestedJsonDump(preview.headline);
    expectNoNestedJsonDump(preview.details.join('\n'));
    expect(preview.omittedHint).toBeDefined();
  });

  test('system jump progress formats a compact one-liner', () => {
    const notification = {
      type: 'system',
      msg_type: 'system',
      timestamp: '2026-07-24T19:05:15.000Z',
      data: { action: 'jump', arrival_tick: 1433950, destination: 'lacaille_9352', is_wormhole: false },
    };
    const output = stripAnsi(formatNotification(notification).join('\n'));

    expect(output).toContain('[SYSTEM]');
    expect(output).toContain('jump');
    expect(output).toContain('→ lacaille_9352');
    expect(output).toContain('arrival tick 1433950');
    expect(output).not.toContain('"action"');

    expect(hasPreviewHandler('system')).toBe(true);
    const preview = formatNotificationPreview(notification);
    expect(preview.tag).toBe('SYSTEM');
    expect(preview.headline).toContain('jump');
    expect(preview.headline).toContain('→ lacaille_9352');
    expect(preview.headline).toContain('arrival tick 1433950');
  });

  test('system tip/generic without message never dumps nested JSON', () => {
    const tipWithoutMessage = {
      type: 'system',
      msg_type: 'system',
      timestamp: '2026-07-24T19:05:15.000Z',
      data: {
        type: 'gameplay_tip',
        ship: { id: 'ship-1', name: 'Dust Devil', hull: 130 },
        nearby_players: [{ username: 'Spy' }],
      },
    };
    const tipOutput = stripAnsi(formatNotification(tipWithoutMessage).join('\n'));
    expect(tipOutput).toContain('[TIP]');
    expect(tipOutput).toContain('gameplay tip');
    expect(tipOutput).not.toContain('Dust Devil');
    expect(tipOutput).not.toContain('Spy');
    expectNoNestedJsonDump(tipOutput);

    const tipPreview = formatNotificationPreview(tipWithoutMessage);
    expect(tipPreview.tag).toBe('TIP');
    expect(tipPreview.headline).toBe('gameplay tip');
    expectNoNestedJsonDump(tipPreview.headline);

    const systemWithoutMessage = {
      type: 'system',
      msg_type: 'system',
      timestamp: '2026-07-24T19:05:15.000Z',
      data: {
        code: 'info',
        tick: 42,
        ship: { id: 'ship-1', hull: 100 },
        location: { nearby_players: [{ username: 'Spy' }] },
      },
    };
    const systemOutput = stripAnsi(formatNotification(systemWithoutMessage).join('\n'));
    expect(systemOutput).toContain('[SYSTEM]');
    expect(systemOutput).toContain('code=info');
    expect(systemOutput).toContain('tick=42');
    expect(systemOutput).not.toContain('Spy');
    expect(systemOutput).not.toMatch(/"hull"\s*:/);
    expectNoNestedJsonDump(systemOutput);

    const systemPreview = formatNotificationPreview(systemWithoutMessage);
    expect(systemPreview.tag).toBe('SYSTEM');
    expect(systemPreview.headline).toContain('code=info');
    expect(systemPreview.headline).not.toContain('{');
    expectNoNestedJsonDump(systemPreview.headline);
  });

  test('formatActionResultDetails prefers message then compact scalars', () => {
    expect(formatActionResultDetails({ message: 'jumped to Alfirk' })).toBe('jumped to Alfirk');
    expect(
      formatActionResultDetails({
        action: 'mine',
        item_name: 'Iron Ore',
        quantity: 5,
        system: 'Alfirk',
      }),
    ).toBe('mine → Alfirk 5× Iron Ore');
    // Nested bulky keys are ignored — only listed scalars.
    expect(
      formatActionResultDetails({
        action: 'undock',
        ship: { hull: 130 },
      } as Record<string, unknown>),
    ).toBe('undock');
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

  describe('formatInventoryPreview (K15 compact inventory)', () => {
    test('formats count-map loot as N items: id×qty', () => {
      expect(formatInventoryPreview({ ore_iron: 5, credits: 100 })).toBe(
        '2 items: credits×100, ore_iron×5',
      );
      expect(formatInventoryPreview({ credits: 10 })).toBe('1 item: credits×10');
    });

    test('formats item arrays and nested bags', () => {
      expect(
        formatInventoryPreview([
          { item_id: 'ore_iron', quantity: 5 },
          { item_id: 'fuel_cell', quantity: 2 },
        ]),
      ).toBe('2 items: ore_iron×5, fuel_cell×2');

      expect(
        formatInventoryPreview({
          items: [{ item_id: 'ore_iron', quantity: 5 }],
          credits: 100,
        }),
      ).toBe('2 items: credits×100, ore_iron×5');
    });

    test('truncates with +N more and never emits nested JSON', () => {
      const loot = {
        a: 1,
        b: 2,
        c: 3,
        d: 4,
        e: 5,
        f: 6,
        g: 7,
      };
      const preview = formatInventoryPreview(loot, 3);
      expect(preview).toMatch(/^7 items: /);
      expect(preview).toContain('+4 more');
      expect(preview).not.toContain('{');
      expect(preview).not.toContain('[');
    });

    test('returns undefined for empty or non-inventory values', () => {
      expect(formatInventoryPreview({})).toBeUndefined();
      expect(formatInventoryPreview([])).toBeUndefined();
      expect(formatInventoryPreview(null)).toBeUndefined();
      expect(formatInventoryPreview('credits')).toBeUndefined();
      expect(formatInventoryPreview({ nested: { ore_iron: 5 } })).toBeUndefined();
    });

    test('pirate_destroyed nested loot never JSON.stringifies', () => {
      const output = stripAnsi(
        formatNotification({
          type: 'combat',
          msg_type: 'pirate_destroyed',
          timestamp: '2026-05-18T12:00:00.000Z',
          data: {
            loot: {
              ore_iron: 5,
              credits: 100,
              fuel_cell: 2,
              scrap: 1,
            },
          },
        }).join('\n'),
      );

      expect(output).toContain('[PIRATES]');
      expect(output).toContain('Pirate destroyed!');
      expect(output).toContain('Loot: 4 items:');
      expect(output).toContain('credits×100');
      expect(output).toContain('ore_iron×5');
      expect(output).not.toContain('"ore_iron"');
      expect(output).not.toContain(JSON.stringify({ ore_iron: 5, credits: 100, fuel_cell: 2, scrap: 1 }));
      expectNoDiagnosticTokens(output);

      // Pure PREVIEW_HANDLERS path (PR7a) uses formatInventoryPreview too.
      expect(hasPreviewHandler('pirate_destroyed')).toBe(true);
      const preview = formatNotificationPreview({
        type: 'combat',
        msg_type: 'pirate_destroyed',
        data: { loot: { ore_iron: 5, credits: 100, fuel_cell: 2, scrap: 1 } },
      });
      expect(preview.tag).toBe('PIRATES');
      expect(preview.headline).toBe('Pirate destroyed!');
      expect(preview.details.join(' ')).toContain('Loot: 4 items:');
      expect(preview.details.join(' ')).toContain('credits×100');
      expectNoNestedJsonDump(preview.details.join('\n'));
    });
  });

  describe('PR7a combat domain pure previews', () => {
    const combatTypes = [
      'combat_update',
      'player_died',
      'player_kill',
      'police_warning',
      'police_spawn',
      'police_combat',
      'pirate_warning',
      'pirate_spawn',
      'pirate_combat',
      'pirate_destroyed',
      'battle_started',
      'battle_update',
      'battle_damage',
      'battle_joined',
      'battle_left',
      'battle_ended',
    ] as const;

    test('registers pure PREVIEW_HANDLERS for every combat-domain type', () => {
      for (const msgType of combatTypes) {
        expect(hasPreviewHandler(msgType)).toBe(true);
      }
    });

    test('combat_update pure preview matches compact hit line', () => {
      const notification = {
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
      };
      const preview = formatNotificationPreview(notification);
      expect(preview.tag).toBe('COMBAT');
      expect(preview.headline).toContain('raider hit Marlowe for 12 laser damage');
      expect(preview.headline).toContain('shield: 8');
      expect(preview.headline).toContain('hull: 4');
      expect(preview.headline).toContain('DESTROYED');
      expect(preview.details).toEqual([]);

      const output = stripAnsi(formatNotification(notification).join('\n'));
      expect(output).toContain('[COMBAT]');
      expect(output).toContain('raider hit Marlowe for 12 laser damage');
    });

    test('player_died headline is death summary; combat_log is details (no nested dump)', () => {
      const notification = {
        type: 'combat',
        msg_type: 'player_died',
        timestamp: '2026-05-18T12:00:00.000Z',
        data: {
          killer_name: 'Raider',
          respawn_base: 'home',
          ship_lost: 'Dust Devil',
          clone_cost: 500,
          combat_log: {
            message: 'Last stand at the gate',
            attacker_ship: 'raider_frigate',
            weapons_used: { laser: 3, missile: 1 },
            total_damage: 120,
            shield_damage: 40,
            hull_damage: 80,
            combat_rounds: 4,
            death_location: 'Gate Alpha',
            death_system: 'Alfirk',
            // Bulky junk must never appear in human output
            full_ship: { hull: 0, modules: [{ id: 'laser' }] },
          },
        },
      };

      const preview = formatNotificationPreview(notification);
      expect(preview.tag).toBe('DEATH');
      expect(preview.headline).toBe('Destroyed by Raider!');
      expect(preview.details.some((line) => line.includes('Last stand at the gate'))).toBe(true);
      expect(preview.details.some((line) => line.includes('Attacker ship: raider_frigate'))).toBe(true);
      expect(preview.details.some((line) => line.includes('Weapons:'))).toBe(true);
      expect(preview.details.some((line) => line.includes('Damage taken: 120 total'))).toBe(true);
      expect(preview.details.some((line) => line.includes('Location: Gate Alpha in Alfirk'))).toBe(true);
      expect(preview.details.some((line) => line.includes('Ship lost: Dust Devil'))).toBe(true);
      expect(preview.details.some((line) => line.includes('Clone cost: 500 credits'))).toBe(true);
      expect(preview.details.some((line) => line.includes('Respawned at: home'))).toBe(true);
      // Never dump nested full_ship / modules
      expectNoNestedJsonDump(preview.headline);
      expectNoNestedJsonDump(preview.details.join('\n'));
      expect(preview.details.join('\n')).not.toContain('full_ship');
      expect(preview.details.join('\n')).not.toContain('"hull"');

      // Table Message is headline-first (may fold a short first detail)
      const tableMessage = tableMessageFromPreview(preview);
      expect(tableMessage).toContain('Destroyed by Raider!');
      expectNoNestedJsonDump(tableMessage);

      const output = stripAnsi(formatNotification(notification).join('\n'));
      expect(output).toContain('[DEATH]');
      expect(output).toContain('Destroyed by Raider!');
      expect(output).toContain('Respawned at: home');
      expect(output).not.toContain('full_ship');
      expectNoNestedJsonDump(output);
    });

    test('player_died malformed combat_log never dumps JSON', () => {
      const preview = formatNotificationPreview({
        type: 'combat',
        msg_type: 'player_died',
        data: {
          killer_name: 'Raider',
          combat_log: 'not-a-record',
          respawn_base: 'home',
        },
      });
      expect(preview.tag).toBe('DEATH');
      expect(preview.headline).toBe('Destroyed by Raider!');
      expect(preview.details.join('\n')).toContain('Respawned at: home');
      expect(preview.details.join('\n')).not.toContain('not-a-record');
      expectNoNestedJsonDump(preview.details.join('\n'));

      const police = formatNotificationPreview({
        type: 'combat',
        msg_type: 'player_died',
        data: { cause: 'police' },
      });
      expect(police.headline).toBe('Destroyed by system police!');

      const selfDestruct = formatNotificationPreview({
        type: 'combat',
        msg_type: 'player_died',
        data: { cause: 'self_destruct' },
      });
      expect(selfDestruct.headline).toBe('Self-destructed!');
    });

    test('player_kill pure preview keeps bounty/wreck as details', () => {
      const preview = formatNotificationPreview({
        type: 'combat',
        msg_type: 'player_kill',
        data: { victim_name: 'Raider', bounty: 50, wreck_id: 'wreck_1' },
      });
      expect(preview.tag).toBe('KILL');
      expect(preview.headline).toContain('You destroyed Raider!');
      expect(preview.details).toEqual(expect.arrayContaining(['Bounty: 50 credits', 'Wreck: wreck_1']));
    });

    test('police / pirate / battle pure previews stay compact', () => {
      expect(
        formatNotificationPreview({
          msg_type: 'police_warning',
          data: { message: 'Contraband', police_level: 2, response_ticks: 5 },
        }).headline,
      ).toBe('Contraband');
      expect(
        formatNotificationPreview({
          msg_type: 'police_spawn',
          data: { num_drones: 3 },
        }).headline,
      ).toContain('3 police drone(s) arrived');
      expect(
        formatNotificationPreview({
          msg_type: 'police_combat',
          data: { damage: 12, destroyed: true },
        }).headline,
      ).toContain('YOU WERE DESTROYED');

      expect(
        formatNotificationPreview({
          msg_type: 'pirate_spawn',
          data: { num_pirates: 2 },
        }).headline,
      ).toContain('2 pirate(s) appeared');
      expect(
        formatNotificationPreview({
          msg_type: 'pirate_combat',
          data: { damage: 8, destroyed: true },
        }).headline,
      ).toContain('Pirate dealt 8 damage');

      expect(
        formatNotificationPreview({
          msg_type: 'battle_started',
          data: { battle_id: 'battle_1' },
        }).headline,
      ).toContain('Battle started! ID: battle_1');
      expect(
        formatNotificationPreview({
          msg_type: 'battle_update',
          data: { tick: 9, message: 'shields holding' },
        }).headline,
      ).toContain('Battle tick 9 - shields holding');
      expect(
        formatNotificationPreview({
          msg_type: 'battle_damage',
          data: { attacker: 'Alpha', target: 'Beta', damage: 3 },
        }).headline,
      ).toBe('Alpha hit Beta for 3 damage');
      expect(
        formatNotificationPreview({
          msg_type: 'battle_joined',
          data: { username: 'Marlowe' },
        }).headline,
      ).toContain('Marlowe joined the battle');
      expect(
        formatNotificationPreview({
          msg_type: 'battle_left',
          data: { username: 'Marlowe' },
        }).headline,
      ).toContain('Marlowe left the battle');
      expect(
        formatNotificationPreview({
          msg_type: 'battle_ended',
          data: { message: 'Victory' },
        }).headline,
      ).toBe('Battle ended! Victory');
    });

    test('K13: table Type stays raw msg_type; Message uses pure preview headline', () => {
      const notification = {
        type: 'combat',
        msg_type: 'combat_update',
        data: {
          attacker: 'raider',
          target: 'ship',
          damage: 4,
          damage_type: 'laser',
          shield_hit: 2,
          hull_hit: 2,
        },
      };
      const message = formatNotificationMessage(notification);
      expect(message).toContain('raider hit ship for 4 laser damage');
      // Type column is independent of preview.tag (COMBAT); Message is not the tag.
      expect(message).not.toBe('COMBAT');
      expect(formatNotificationMessage(notification)).toBe(
        tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 })),
      );
    });
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

  describe('PR4 table Message via shared preview', () => {
    /** Table Message is always the pure preview pipeline (thin wrapper contract). */
    function expectTableMessageFromPreview(notification: Record<string, unknown>) {
      const fromPreview = tableMessageFromPreview(
        formatNotificationPreview(notification, { maxLineLength: 120 }),
      );
      expect(formatNotificationMessage(notification)).toBe(fromPreview);
      expectNoNestedJsonDump(fromPreview);
      expectNoDiagnosticTokens(fromPreview);
    }

    const messageSnippetFixtures: Array<{
      name: string;
      notification: Record<string, unknown>;
      snippets: string[];
    }> = [
      {
        name: 'market_update zero items',
        notification: {
          type: 'market',
          msg_type: 'market_update',
          data: { base_name: 'Empty Dock', tick: 1, items: [] },
        },
        snippets: ['Empty Dock tick 1: 0 item updates'],
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
        snippets: [
          'Haven Exchange tick 901337: 1 item update',
          'Iron Ore',
          'sell 40 @ 12',
          'buy 25 @ 9',
        ],
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
        snippets: ['2 item updates', 'Iron Ore', 'sell 40 @ 12, 10 @ 11, +1 more', '+1 more'],
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
        snippets: ['Haven Exchange: 1 item update', 'Iron Ore book emptied'],
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
        snippets: [
          '1 job tick 901500',
          'Power Cell',
          'rental',
          '300cr escrowed',
          '2 runs left',
          'out Pack (pkg-9)',
        ],
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
        snippets: ['4 jobs tick 9', 'A, 1 run left', 'B, 2 runs left', 'C, 3 runs left', '+1 more'],
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
        snippets: ['Job completed', 'out Solo Pack (pkg-solo-1)', 'tick 901510'],
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
        snippets: ['rental facility', '120cr still escrowed', 'tick 9'],
      },
      {
        name: 'crafting_update empty fallback',
        notification: {
          type: 'crafting',
          msg_type: 'crafting_update',
          data: {},
        },
        snippets: ['Crafting update'],
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
        snippets: [
          '3 crafting progress updates summarized',
          'latest tick 901501',
          '2 active jobs',
          '1 on rented facility',
          '300cr still escrowed',
          // Full string exceeds maxLineLength 120; table Message truncates with ….
        ],
      },
      {
        name: 'crafting_summary count only',
        notification: {
          type: 'crafting',
          msg_type: 'crafting_summary',
          data: { count: 1 },
        },
        snippets: ['1 crafting progress update summarized'],
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
        snippets: ['0 crafting progress updates summarized'],
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
        snippets: [
          '18 action results summarized',
          'jump×12',
          'latest tick 1434000',
          'latest jump',
          'latest: jumped → Alfirk',
        ],
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
        snippets: ['2 action results summarized', 'dock×2', 'latest tick 10', 'latest dock'],
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
        snippets: [
          '2 travel progress updates summarized',
          'jump×2',
          'latest jump → grumium',
          'arrival tick 1433952',
        ],
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
        snippets: ['1 travel progress update summarized', 'latest travel'],
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
        snippets: ['4 travel progress updates summarized', 'latest → alfirk'],
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
        snippets: [
          'Commission commission-1',
          'ship ship-42',
          'Prospector (prospector)',
          'Earth Station (earth_station)',
        ],
      },
    ];

    test.each(messageSnippetFixtures)('Message: $name', ({ notification, snippets }) => {
      expectTableMessageFromPreview(notification);
      const message = formatNotificationMessage(notification);
      for (const snippet of snippets) {
        expect(message).toContain(snippet);
      }
    });

    test('get_notifications fixture non-regressable market/commission/chat Message snippets', () => {
      const rows = getNotificationsFixture.notifications as Array<Record<string, unknown>>;
      for (const notification of rows) {
        expectTableMessageFromPreview(notification);
      }

      const market = rows.find((n) => n.msg_type === 'market_update')!;
      const commission = rows.find((n) => n.msg_type === 'ship_commission_complete')!;
      const chat = rows.find((n) => n.msg_type === 'chat_message')!;
      const system = rows.find((n) => n.msg_type === 'system')!;

      const marketMsg = formatNotificationMessage(market);
      expect(marketMsg).toContain('Haven Exchange');
      expect(marketMsg).toContain('1 item update');
      expect(marketMsg).toContain('Iron Ore');
      expect(marketMsg).toContain('sell 40 @ 12');
      expect(marketMsg).toContain('buy 25 @ 9');

      const commissionMsg = formatNotificationMessage(commission);
      expect(commissionMsg).toContain('Commission commission-1');
      expect(commissionMsg).toContain('ship ship-42');
      expect(commissionMsg).toContain('Prospector (prospector)');
      expect(commissionMsg).toContain('Earth Station (earth_station)');

      // Chat is Policy 5 ladder — non-regressable sender:content form (K11 / K12).
      expect(formatNotificationMessage(chat)).toBe('Ibis: Clear skies over Sol today.');
      expect(formatNotificationMessage(system)).toBe('Server maintenance scheduled.');
    });

    test('residual action_result table Message is compact, never nested JSON', () => {
      const notification = {
        type: 'action_result',
        msg_type: 'action_result',
        timestamp: '2026-07-24T19:05:05.000Z',
        data: {
          command: 'undock',
          tick: 1433948,
          result: {
            message: 'Left berth 3.',
            ship: { id: 'ship-1', name: 'Dust Devil', hull: 130 },
            location: {
              system_name: 'Nova Terra',
              nearby_players: [{ username: 'ILC Knurl' }, { username: 'Cody' }],
              nearby_player_count: 88,
            },
            details: { action: 'undock' },
          },
        },
      };

      const message = formatNotificationMessage(notification);
      expect(message).toContain('undock completed');
      expect(message).toContain('1433948');
      // Short result.message folds into the table cell via tableMessageFromPreview.
      expect(message).toContain('Left berth 3.');
      expect(message).not.toContain('Dust Devil');
      expect(message).not.toContain('ILC Knurl');
      expect(message).not.toContain('"hull"');
      expect(message).not.toContain('nearby_players');
      expectNoNestedJsonDump(message);

      // Without result.message, compact details scalar still lands in Message.
      const detailsOnly = {
        ...notification,
        data: {
          command: 'jump',
          tick: 99,
          result: {
            ship: { id: 'ship-1', hull: 50 },
            details: { action: 'jump', system: 'alfirk' },
          },
        },
      };
      const detailsMsg = formatNotificationMessage(detailsOnly);
      expect(detailsMsg).toContain('jump completed');
      expect(detailsMsg).toContain('jump → alfirk');
      expectNoNestedJsonDump(detailsMsg);
    });

    test('ship_commission without receipt falls through to scalar bag (not JSON)', () => {
      const notification = {
        type: 'system',
        msg_type: 'ship_commission_complete',
        data: { commission_id: 'commission-only' },
      };
      const message = formatNotificationMessage(notification);
      // Typed handler returns null → Policy 5 scalar bag.
      expect(message).toContain('commission_id=commission-only');
      expectNoNestedJsonDump(message);
      expect(formatNotificationPreview(notification).tag).toBe('SHIP_COMMISSION_COMPLETE');
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
      // Table Message matches the same pure headline (no detail fold for market).
      expect(formatNotificationMessage(notification)).toBe(preview.headline);
    });
  });
});
