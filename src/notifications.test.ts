import { describe, expect, test } from 'bun:test';
import { formatNotificationMessage } from './display/notifications';
import { getNotificationsFixture, getNotificationsObservationFixture } from './display/notifications.fixtures';
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
      // Pure PREVIEW_HANDLERS: table Message quality (first item + +N more).
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
      msgType: 'drone_adrift',
      data: {
        drone_id: 'drone_1',
        owner_id: 'player_1',
        drone_type: 'survey',
        system_id: 'sol',
        poi_id: 'earth',
      },
      snippets: [
        '[DRONE]',
        'survey drone is adrift at earth in sol',
        'ID: drone_1',
        'get_drone drone_id=drone_1',
        'recall_drone drone_id=drone_1',
      ],
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
      msgType: 'faction_alliance_broken',
      data: {
        by_faction_id: 'fac_1',
        by_faction_name: 'Wardens',
        by_faction_tag: 'WRD',
        message: 'Wardens broke the alliance.',
      },
      snippets: ['[FACTION]', 'Wardens broke the alliance.'],
    },
    {
      msgType: 'faction_alliance_formed',
      data: {
        with_faction_id: 'fac_1',
        with_faction_name: 'Wardens',
        with_faction_tag: 'WRD',
        message: 'Alliance formed with Wardens.',
      },
      snippets: ['[FACTION]', 'Alliance formed with Wardens.'],
    },
    {
      msgType: 'faction_alliance_proposal',
      data: {
        from_faction_id: 'fac_1',
        from_faction_name: 'Wardens',
        from_faction_tag: 'WRD',
        message: 'Wardens have proposed an alliance.',
      },
      snippets: ['[FACTION]', 'Wardens have proposed an alliance.', 'faction accept_ally target_faction_id=fac_1'],
    },
    {
      msgType: 'faction_invite',
      data: { faction_name: 'Wardens', faction_id: 'fac_1' },
      snippets: ['[FACTION]', 'Wardens', 'join_faction faction_id=fac_1', 'faction decline_invite faction_id=fac_1'],
    },
    {
      msgType: 'faction_peace_accepted',
      data: {
        faction_id: 'fac_1',
        faction_name: 'Wardens',
        message: 'Wardens accepted peace.',
      },
      snippets: ['[PEACE]', 'Wardens accepted peace.'],
    },
    {
      msgType: 'faction_peace_proposal',
      data: {
        from_faction_id: 'fac_1',
        from_faction_name: 'Wardens',
        terms: 'truce',
        message: 'Wardens have proposed peace.',
      },
      snippets: [
        '[PEACE]',
        'Wardens have proposed peace.',
        'Terms: truce',
        'faction accept_peace target_faction_id=fac_1',
      ],
    },
    {
      msgType: 'faction_war_declared',
      data: {
        aggressor_faction_id: 'fac_raiders',
        aggressor_faction_name: 'Raiders',
        defender_faction_id: 'fac_wardens',
        defender_faction_name: 'Wardens',
        message: 'Raiders declared war on Wardens.',
        reason: 'territory',
      },
      snippets: ['[WAR]', 'Raiders declared war on Wardens.', 'Reason: territory'],
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
      msgType: 'observation_update',
      data: {
        poi_id: 'sol_cloudbank',
        system_id: 'sol',
        tick: 901500,
        unknown_signature: false,
        pirates_changed: [{ pirate_id: 'pirate-1', name: 'Corsair', faction_name: 'Admiral Kael' }],
      },
      snippets: [
        '[OBSERVATION]',
        'Observation at sol_cloudbank in sol (tick 901500): 1 changed, 0 departed',
        'Pirates — changed 1: Corsair [pirate-1] (Admiral Kael)',
      ],
    },
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
      // Pure PREVIEW_HANDLER table Message: "1 job tick 901338: recipe, rental, …"
      snippets: ['[CRAFTING]', '1 job tick 901338', 'Assemble Power Cell', 'rental', '300cr escrowed', '2 runs left'],
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
      data: { pirate_name: 'Corsair', pirate_role: 'raider', loot: { credits: 10 } },
      snippets: ['[PIRATES]', 'Corsair destroyed!', 'Loot: 1 item: credits×10', 'Role: raider'],
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
      data: { victim: 'Raider', bounty: 50, wreck_id: 'wreck_1' },
      snippets: ['[KILL]', 'You destroyed Raider!', 'wreck wreck_1', 'Bounty: 50 credits'],
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
      msgType: 'prize_update',
      data: {
        prize_id: 'prize-1',
        ship_id: 'ship-recover-1',
        ship_class: 'frigate',
        ship_name: 'Captured Lark',
        status: 'in_transit',
        wait_reason: 'dry',
        destination_base_id: 'earth_station',
        system_id: 'sol',
        poi_id: 'sol_cloudbank',
        message: 'Prize recovery stopped: fuel empty',
      },
      snippets: [
        '[PRIZE]',
        'Prize prize-1',
        'Captured Lark',
        'in transit',
        '(dry)',
        'sol_cloudbank (sol)',
        'service_prize prize_id=prize-1',
      ],
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
      msgType: 'server_restart_warning',
      data: {
        message: 'Server restart in 60 seconds. Finish or park in-flight actions.',
        seconds_until_restart: 60,
        target_version: '0.574.0',
      },
      snippets: [
        '[SYSTEM]',
        'Server restart in 60s (0.574.0)',
        'Server restart in 60 seconds. Finish or park in-flight actions.',
      ],
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
      msgType: 'ship_captured',
      data: {
        battle_id: 'battle-42',
        tick: 901800,
        boarding_operation_id: 'board-1',
        captor_id: 'player-1',
        captor_username: 'Marlowe',
        former_owner_id: 'pirate-1',
        former_owner_username: 'Corsair-7',
        ship_id: 'ship-skiff-1',
        ship_class: 'skiff',
      },
      snippets: ['[CAPTURE]', 'Marlowe captured skiff from Corsair-7', 'get_nearby then claim_prize'],
    },
    {
      // Assumed keys (aligned with ShippingActiveContract / InspectPackageShipment —
      // NOT schema-verified; no Notification_shipment_overdue in OpenAPI).
      msgType: 'shipment_overdue',
      data: {
        shipment_id: 'shipment-late-1',
        destination_name: 'Nova Central',
        ticks_to_recovery_deadline: 2400,
        late_fee_if_delivered_now: 400,
      },
      snippets: [
        '[FREIGHT OVERDUE]',
        'Overdue:',
        'shipment shipment-late-1',
        '→ Nova Central',
        '2,400 ticks left',
        'late fee 400 cr',
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

    // Typed PREVIEW_HANDLER returns null (no receipt); pure registry falls through
    // to Policy 5 scalar bag. Never dump nested ship_id as JSON.
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
    const leftoverWear = formatActionResultDetails({
      action: 'install_module',
      module_id: 'module-1',
      wear_status: 'Pristine',
    });
    expect(leftoverWear).toContain('module_id=module-1');
    expect(leftoverWear).not.toContain('wear_status=');
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
    [
      'faction_war_declared empty bag',
      {
        type: 'combat',
        msg_type: 'faction_war_declared',
        timestamp: '2026-06-29T00:00:00.000Z',
        data: {},
      },
    ],
    [
      'faction_peace_proposal empty bag',
      {
        type: 'system',
        msg_type: 'faction_peace_proposal',
        timestamp: '2026-06-29T00:00:00.000Z',
        data: {},
      },
    ],
    [
      'server_restart_warning empty bag',
      {
        type: 'system',
        msg_type: 'server_restart_warning',
        timestamp: '2026-06-29T00:00:00.000Z',
        data: {},
      },
    ],
    [
      'drone_adrift empty bag',
      {
        type: 'system',
        msg_type: 'drone_adrift',
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
        msg_type: 'faction_peace_proposal',
        timestamp: '2026-05-18T12:00:00.000Z',
        data: { from_faction_name: 'Wardens', from_faction_id: 'fac_1' },
      }).join('\n'),
      formatNotification({
        type: 'faction',
        msg_type: 'faction_alliance_proposal',
        timestamp: '2026-05-18T12:00:00.000Z',
        data: { from_faction_name: 'Wardens', from_faction_id: 'fac_1', from_faction_tag: 'WRD' },
      }).join('\n'),
    ]
      .map(stripAnsi)
      .join('\n');

    expect(prompts).toContain('trade accept trade_id=trade_1');
    expect(prompts).toContain('trade decline trade_id=trade_1');
    expect(prompts).toContain('faction decline_invite faction_id=fac_1');
    expect(prompts).toContain('faction accept_peace target_faction_id=fac_1');
    expect(prompts).toContain('faction accept_ally target_faction_id=fac_1');
    expect(prompts).not.toContain('trade_accept');
    expect(prompts).not.toContain('trade_decline');
    expect(prompts).not.toContain('faction_decline_invite');
    expect(prompts).not.toContain('faction_accept_peace');
    expect(prompts).not.toContain('faction_accept_ally');
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
      expect(formatInventoryPreview({ ore_iron: 5, credits: 100 })).toBe('2 items: credits×100, ore_iron×5');
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
      'ship_captured',
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

    test('player_died wreck site folds into table Message after respawn', () => {
      const notification = {
        type: 'combat',
        msg_type: 'player_died',
        timestamp: '2026-05-18T12:00:00.000Z',
        data: {
          killer_id: 'player-raider',
          killer_name: 'Raider',
          cause: 'combat',
          respawn_base: 'earth_station',
          clone_cost: 500,
          insurance_payout: 1200,
          ship_lost: 'Dust Devil',
          wreck_id: 'wreck-2',
          wreck_poi_id: 'alfirk_gate',
          wreck_poi_name: 'Gate Alpha',
          wreck_system_id: 'alfirk',
          wreck_system_name: 'Alfirk',
          wreck_has_cargo: true,
          wreck_has_modules: true,
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
          },
        },
      };
      const preview = formatNotificationPreview(notification);
      expect(preview.tag).toBe('DEATH');
      expect(preview.headline).toBe('Destroyed by Raider!');
      expect(preview.details[0]).toBe('wreck wreck-2 at Gate Alpha (Alfirk)');
      expect(preview.details.some((line) => line.includes('Last stand at the gate'))).toBe(true);
      expect(preview.details.some((line) => line.includes('Respawned at: earth_station'))).toBe(true);
      expect(preview.details).not.toContain('cargo');
      expect(preview.details).not.toContain('modules');
      expect(preview.details).not.toContain('cargo+modules');
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toBe('Destroyed by Raider!; wreck wreck-2 at Gate Alpha (Alfirk)');
      const output = stripAnsi(formatNotification(notification).join('\n'));
      expect(output).toContain('Respawned at: earth_station');
      expect(output).toContain('Last stand at the gate');
      expectNoDiagnosticTokens(`${preview.headline}\n${preview.details.join('\n')}\n${fromPreview}\n${output}`);
    });

    test('player_died skips duplicate Location when wreck already names that POI', () => {
      const notification = {
        type: 'combat',
        msg_type: 'player_died',
        data: {
          killer_name: 'Raider',
          respawn_base: 'home',
          wreck_id: 'wreck-2',
          wreck_poi_id: 'alfirk_gate',
          wreck_poi_name: 'Gate Alpha',
          wreck_system_id: 'alfirk',
          wreck_system_name: 'Alfirk',
          combat_log: {
            message: 'Last stand at the gate',
            death_location: 'Gate Alpha',
            death_system: 'Alfirk',
          },
        },
      };
      const preview = formatNotificationPreview(notification);
      expect(preview.details[0]).toBe('wreck wreck-2 at Gate Alpha (Alfirk)');
      expect(preview.details.some((line) => line.startsWith('Location:'))).toBe(false);
      expect(preview.details.some((line) => line.includes('Last stand at the gate'))).toBe(true);
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toBe('Destroyed by Raider!; wreck wreck-2 at Gate Alpha (Alfirk)');
      expect(fromPreview).not.toContain('Location:');
      expectNoDiagnosticTokens(`${preview.details.join('\n')}\n${fromPreview}`);

      const noDeathSystem = formatNotificationPreview({
        type: 'combat',
        msg_type: 'player_died',
        data: {
          killer_name: 'Raider',
          wreck_id: 'wreck-2',
          wreck_poi_name: 'Gate Alpha',
          wreck_system_name: 'Alfirk',
          combat_log: { death_location: 'Gate Alpha' },
          respawn_base: 'home',
        },
      });
      expect(noDeathSystem.details.some((line) => line.startsWith('Location:'))).toBe(false);

      const systemMismatch = formatNotificationPreview({
        type: 'combat',
        msg_type: 'player_died',
        data: {
          killer_name: 'Raider',
          wreck_id: 'wreck-2',
          wreck_poi_name: 'Gate Alpha',
          wreck_system_name: 'Alfirk',
          combat_log: { death_location: 'Gate Alpha', death_system: 'Sol' },
          respawn_base: 'home',
        },
      });
      expect(systemMismatch.details.some((line) => line.includes('Location: Gate Alpha in Sol'))).toBe(true);

      const poiWithoutWreckId = formatNotificationPreview({
        type: 'combat',
        msg_type: 'player_died',
        data: {
          killer_name: 'Raider',
          wreck_poi_name: 'Gate Alpha',
          wreck_system_name: 'Alfirk',
          combat_log: { death_location: 'Gate Alpha', death_system: 'Alfirk' },
          respawn_base: 'home',
        },
      });
      expect(poiWithoutWreckId.details.some((line) => line.startsWith('wreck '))).toBe(false);
      expect(poiWithoutWreckId.details.some((line) => line.includes('Location: Gate Alpha in Alfirk'))).toBe(true);
    });

    test('player_died keeps Location when wreck is system-only', () => {
      const notification = {
        type: 'combat',
        msg_type: 'player_died',
        timestamp: '2026-05-18T12:00:00.000Z',
        data: {
          killer_name: 'Raider',
          respawn_base: 'home',
          wreck_id: 'wreck-2',
          wreck_system_id: 'sol',
          wreck_system_name: 'Sol',
          combat_log: {
            message: 'Last stand at the gate',
            death_location: 'Gate Alpha',
            death_system: 'Sol',
          },
        },
      };
      const preview = formatNotificationPreview(notification);
      expect(preview.details[0]).toBe('wreck wreck-2 in Sol');
      expect(preview.details.some((line) => line.includes('Location: Gate Alpha in Sol'))).toBe(true);
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toBe('Destroyed by Raider!; wreck wreck-2 in Sol');
      expect(fromPreview).toContain('in Sol');
      expect(fromPreview).not.toContain('Gate Alpha');
      expect(fromPreview).not.toContain('Location:');
      const output = stripAnsi(formatNotification(notification).join('\n'));
      expect(output).toContain('Location: Gate Alpha in Sol');
      expectNoDiagnosticTokens(`${preview.details.join('\n')}\n${fromPreview}\n${output}`);
    });

    test('player_died wreck_suppressed folds into table Message', () => {
      const notification = {
        type: 'combat',
        msg_type: 'player_died',
        data: {
          cause: 'self_destruct',
          respawn_base: 'home',
          wreck_suppressed: true,
          combat_log: {
            death_location: 'Gate Alpha',
            death_system: 'Alfirk',
          },
        },
      };
      const preview = formatNotificationPreview(notification);
      expect(preview.headline).toBe('Self-destructed!');
      expect(preview.details[0]).toBe('wreck suppressed');
      expect(preview.details.some((line) => line.includes('Location: Gate Alpha in Alfirk'))).toBe(true);
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toBe('Self-destructed!; wreck suppressed');
      expect(fromPreview).toContain('wreck suppressed');
      expect(fromPreview).not.toContain('wreck undefined');
      expectNoDiagnosticTokens(`${preview.headline}\n${preview.details.join('\n')}\n${fromPreview}`);

      const suppressedWithPoi = formatNotificationPreview({
        type: 'combat',
        msg_type: 'player_died',
        data: {
          cause: 'self_destruct',
          respawn_base: 'home',
          wreck_suppressed: true,
          wreck_poi_name: 'Gate Alpha',
          wreck_system_name: 'Alfirk',
          combat_log: {
            death_location: 'Gate Alpha',
            death_system: 'Alfirk',
          },
        },
      });
      expect(suppressedWithPoi.details[0]).toBe('wreck suppressed');
      expect(suppressedWithPoi.details.some((line) => line.includes('Location: Gate Alpha in Alfirk'))).toBe(true);
      expect(tableMessageFromPreview(suppressedWithPoi)).not.toContain('Location:');
    });

    test('player_died self_destruct_fee > 0 is next to clone cost', () => {
      const notification = {
        type: 'combat',
        msg_type: 'player_died',
        data: {
          cause: 'self_destruct',
          clone_cost: 500,
          self_destruct_fee: 250,
          insurance_payout: 1200,
          respawn_base: 'home',
        },
      };
      const preview = formatNotificationPreview(notification);
      const cloneIdx = preview.details.findIndex((line) => line.startsWith('Clone cost:'));
      const feeIdx = preview.details.findIndex((line) => line.startsWith('Self-destruct fee:'));
      expect(cloneIdx).toBeGreaterThanOrEqual(0);
      expect(feeIdx).toBe(cloneIdx + 1);
      expect(preview.details[feeIdx]).toBe('Self-destruct fee: 250 credits');
      expect(preview.details).toContain('Clone cost: 500 credits');
      expect(preview.details).toContain('Insurance payout: 1200 credits');
      const zeroFee = formatNotificationPreview({
        type: 'combat',
        msg_type: 'player_died',
        data: { cause: 'self_destruct', clone_cost: 500, self_destruct_fee: 0, respawn_base: 'home' },
      });
      expect(zeroFee.details.some((line) => line.includes('Self-destruct fee:'))).toBe(false);
      expectNoDiagnosticTokens(`${preview.details.join('\n')}\n${zeroFee.details.join('\n')}`);
    });

    test('player_kill schema victim puts wreck site as first detail', () => {
      const notification = {
        type: 'combat',
        msg_type: 'player_kill',
        data: { victim: 'Raider', wreck_id: 'wreck_1' },
      };
      const preview = formatNotificationPreview(notification);
      expect(preview.tag).toBe('KILL');
      expect(preview.headline).toBe('You destroyed Raider!');
      expect(preview.details[0]?.startsWith('wreck ')).toBe(true);
      expect(preview.details[0]).toBe('wreck wreck_1');
      expect(preview.details.join('\n')).not.toContain('Wreck:');
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toBe('You destroyed Raider!; wreck wreck_1');
      expectNoDiagnosticTokens(`${preview.headline}\n${preview.details.join('\n')}\n${fromPreview}`);
    });

    test('player_kill legacy victim_name still renders bounty after wreck site', () => {
      const notification = {
        type: 'combat',
        msg_type: 'player_kill',
        data: { victim_name: 'Raider', bounty: 50, wreck_id: 'wreck_1' },
      };
      const preview = formatNotificationPreview(notification);
      expect(preview.tag).toBe('KILL');
      expect(preview.headline).toBe('You destroyed Raider!');
      expect(preview.details).toContain('Bounty: 50 credits');
      expect(preview.details[0]).not.toBe('Bounty: 50 credits');
      expect(preview.details[0]?.startsWith('wreck ')).toBe(true);
      expect(preview.details.join('\n')).not.toContain('Wreck:');
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toBe('You destroyed Raider!; wreck wreck_1');
      expect(fromPreview).not.toContain('Bounty:');
      expectNoDiagnosticTokens(`${preview.headline}\n${preview.details.join('\n')}\n${fromPreview}`);
    });

    test('player_kill prefers victim over victim_name', () => {
      const notification = {
        type: 'combat',
        msg_type: 'player_kill',
        data: { victim: 'Marlowe', victim_name: 'Raider', target_name: 'Wisp', wreck_id: 'wreck_1' },
      };
      const preview = formatNotificationPreview(notification);
      expect(preview.headline).toBe('You destroyed Marlowe!');
      expect(preview.headline).not.toContain('Raider');
      expect(preview.headline).not.toContain('Wisp');
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toContain('You destroyed Marlowe!');
      expectNoDiagnosticTokens(`${preview.headline}\n${fromPreview}`);
    });

    test('player_kill falls back to target_name when victim fields are absent', () => {
      const notification = {
        type: 'combat',
        msg_type: 'player_kill',
        data: { target_name: 'Wisp' },
      };
      const preview = formatNotificationPreview(notification);
      expect(preview.headline).toBe('You destroyed Wisp!');
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toBe('You destroyed Wisp!');
      expectNoDiagnosticTokens(fromPreview);
    });

    test('player_kill wreck site folds into table Message', () => {
      const notification = {
        type: 'combat',
        msg_type: 'player_kill',
        data: {
          victim: 'Marlowe',
          wreck_id: 'wreck-1',
          wreck_has_cargo: true,
          wreck_has_modules: false,
          wreck_poi_id: 'sol_asteroid_belt',
          wreck_poi_name: 'Asteroid Belt',
          wreck_system_id: 'sol',
          wreck_system_name: 'Sol',
        },
      };
      const preview = formatNotificationPreview(notification);
      expect(preview.headline).toBe('You destroyed Marlowe!');
      expect(preview.details[0]).toBe('wreck wreck-1 at Asteroid Belt (Sol)');
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toBe('You destroyed Marlowe!; wreck wreck-1 at Asteroid Belt (Sol)');
      expectNoDiagnosticTokens(`${preview.headline}\n${preview.details.join('\n')}\n${fromPreview}`);
    });

    test('player_kill hidden POI prints system only', () => {
      const notification = {
        type: 'combat',
        msg_type: 'player_kill',
        data: {
          victim: 'Wisp',
          wreck_id: 'wreck-hidden-1',
          wreck_system_id: 'sol',
          wreck_system_name: 'Sol',
        },
      };
      const preview = formatNotificationPreview(notification);
      expect(preview.details[0]).toBe('wreck wreck-hidden-1 in Sol');
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toBe('You destroyed Wisp!; wreck wreck-hidden-1 in Sol');
      expect(fromPreview).toContain('in Sol');
      expect(fromPreview).not.toContain(' at ');
      expect(fromPreview.toLowerCase()).not.toContain('hidden poi');
      expectNoDiagnosticTokens(`${preview.headline}\n${preview.details.join('\n')}\n${fromPreview}`);
    });

    test('player_kill POI-only wreck site omits system', () => {
      const notification = {
        type: 'combat',
        msg_type: 'player_kill',
        data: {
          victim: 'Marlowe',
          wreck_id: 'wreck-1',
          wreck_poi_id: 'sol_asteroid_belt',
          wreck_poi_name: 'Asteroid Belt',
        },
      };
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toBe('You destroyed Marlowe!; wreck wreck-1 at Asteroid Belt');
      expect(fromPreview).not.toContain('(');
      expectNoDiagnosticTokens(fromPreview);
    });

    test('player_kill id-only wreck site folds the wreck id', () => {
      const notification = {
        type: 'combat',
        msg_type: 'player_kill',
        data: { victim: 'Marlowe', wreck_id: 'wreck-1' },
      };
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toBe('You destroyed Marlowe!; wreck wreck-1');
      expectNoDiagnosticTokens(fromPreview);
    });

    test('player_kill with no wreck and no bounty is headline only', () => {
      const notification = {
        type: 'combat',
        msg_type: 'player_kill',
        data: { victim: 'Raider' },
      };
      const preview = formatNotificationPreview(notification);
      expect(preview.headline).toBe('You destroyed Raider!');
      expect(preview.details).toEqual([]);
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toBe('You destroyed Raider!');
      expectNoDiagnosticTokens(fromPreview);
    });

    test('player_kill omits bounty 0 and false contents flags', () => {
      const notification = {
        type: 'combat',
        msg_type: 'player_kill',
        data: {
          victim: 'Raider',
          bounty: 0,
          wreck_id: 'wreck_1',
          wreck_has_cargo: false,
          wreck_has_modules: false,
        },
      };
      const preview = formatNotificationPreview(notification);
      expect(preview.details).toEqual(['wreck wreck_1']);
      expect(preview.details.join('\n')).not.toContain('Bounty:');
      expect(preview.details.join('\n')).not.toContain('cargo');
      expect(preview.details.join('\n')).not.toContain('modules');
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toBe('You destroyed Raider!; wreck wreck_1');
      expectNoDiagnosticTokens(`${preview.details.join('\n')}\n${fromPreview}`);
    });

    test('player_kill contents flags are later inline details', () => {
      const cargo = {
        type: 'combat',
        msg_type: 'player_kill',
        data: { victim: 'Raider', wreck_id: 'wreck_1', wreck_has_cargo: true },
      };
      const cargoPreview = formatNotificationPreview(cargo);
      expect(cargoPreview.details[0]?.startsWith('wreck ')).toBe(true);
      expect(cargoPreview.details).toContain('cargo');
      expect(cargoPreview.details[0]).not.toBe('cargo');
      const cargoMessage = formatNotificationMessage(cargo);
      expect(cargoMessage).toBe(tableMessageFromPreview(formatNotificationPreview(cargo, { maxLineLength: 120 })));
      expect(cargoMessage).not.toContain('cargo');

      const modules = formatNotificationPreview({
        type: 'combat',
        msg_type: 'player_kill',
        data: { victim: 'Raider', wreck_id: 'wreck_1', wreck_has_modules: true },
      });
      expect(modules.details).toContain('modules');
      expect(modules.details[0]).not.toBe('modules');

      const both = formatNotificationPreview({
        type: 'combat',
        msg_type: 'player_kill',
        data: { victim: 'Raider', wreck_id: 'wreck_1', wreck_has_cargo: true, wreck_has_modules: true },
      });
      expect(both.details).toContain('cargo+modules');
      expect(both.details[0]).not.toBe('cargo+modules');
      expectNoDiagnosticTokens(
        `${cargoPreview.details.join('\n')}\n${modules.details.join('\n')}\n${both.details.join('\n')}`,
      );
    });

    test('player_kill long victim still keeps foldable wreck site in table Message', () => {
      const notification = {
        type: 'combat',
        msg_type: 'player_kill',
        data: {
          victim: 'V'.repeat(80),
          wreck_id: 'wreck-overflow-1',
          wreck_poi_name: 'Asteroid Belt',
          wreck_system_name: 'Sol',
        },
      };
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toContain('wreck-overflow-1');
      expect(fromPreview).toContain('Asteroid Belt');
      expect(fromPreview).toContain('Sol');
      expect(fromPreview).toContain('…');
      expect(fromPreview.length).toBeLessThanOrEqual(120);
      expectNoDiagnosticTokens(fromPreview);
    });

    test('player_kill site longer than 80 goes on the headline', () => {
      const wreckId = `wreck-${'x'.repeat(80)}`;
      const notification = {
        type: 'combat',
        msg_type: 'player_kill',
        data: { victim: 'Raider', wreck_id: wreckId },
      };
      const preview = formatNotificationPreview(notification, { maxLineLength: 120 });
      expect(preview.details[0]).toBe(`wreck ${wreckId}`);
      expect(preview.details[0]?.length).toBeGreaterThan(80);
      expect(preview.headline).toContain(wreckId);
      const fromPreview = tableMessageFromPreview(preview);
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toBe(preview.headline);
      expect(fromPreview).toContain('wreck-');
      expect(fromPreview).not.toContain('Bounty:');
      expectNoDiagnosticTokens(`${preview.headline}\n${preview.details.join('\n')}\n${fromPreview}`);
    });

    test('player_kill site longer than 80 plus bounty does not fold Bounty into Message', () => {
      const wreckId = `wreck-${'x'.repeat(80)}`;
      const notification = {
        type: 'combat',
        msg_type: 'player_kill',
        data: { victim: 'Raider', bounty: 50, wreck_id: wreckId },
      };
      const preview = formatNotificationPreview(notification, { maxLineLength: 120 });
      expect(preview.details[0]).toBe(`wreck ${wreckId}`);
      expect(preview.details).toContain('Bounty: 50 credits');
      const fromPreview = tableMessageFromPreview(preview);
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toContain(wreckId);
      expect(fromPreview).not.toContain('Bounty:');
      expectNoDiagnosticTokens(`${preview.headline}\n${preview.details.join('\n')}\n${fromPreview}`);
    });

    test('player_kill site at least maxLineLength clips the headline but keeps full site in details', () => {
      const wreckId = `wreck-${'x'.repeat(120)}`;
      const notification = {
        type: 'combat',
        msg_type: 'player_kill',
        data: { victim: 'Raider', wreck_id: wreckId },
      };
      const preview = formatNotificationPreview(notification, { maxLineLength: 120 });
      expect(preview.details[0]).toBe(`wreck ${wreckId}`);
      expect(preview.headline.length).toBeLessThanOrEqual(120);
      expect(preview.headline).toContain('wreck-');
      expect(preview.headline).toContain('…');
      const fromPreview = tableMessageFromPreview(preview);
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toBe(preview.headline);
      expect(fromPreview).toContain('wreck-');
      expect(fromPreview.length).toBeLessThanOrEqual(120);
      expectNoDiagnosticTokens(`${preview.headline}\n${preview.details.join('\n')}\n${fromPreview}`);
    });

    test('pirate_destroyed loot snippet folds Loot not Role into table Message', () => {
      const notification = {
        type: 'combat',
        msg_type: 'pirate_destroyed',
        data: { pirate_name: 'Corsair', pirate_role: 'raider', loot: { credits: 10 } },
      };
      const preview = formatNotificationPreview(notification, { maxLineLength: 120 });
      expect(preview.headline).toBe('Corsair destroyed!');
      expect(preview.details[0]).toBe('Loot: 1 item: credits×10');
      expect(preview.details).toContain('Role: raider');
      expect(preview.details[0]).not.toBe('Role: raider');
      const fromPreview = tableMessageFromPreview(preview);
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toBe('Corsair destroyed!; Loot: 1 item: credits×10');
      expect(fromPreview).not.toContain('Role:');
      expectNoDiagnosticTokens(`${preview.headline}\n${preview.details.join('\n')}\n${fromPreview}`);
    });

    test('pirate_destroyed required fields only keeps Role inline and out of table Message', () => {
      const notification = {
        type: 'combat',
        msg_type: 'pirate_destroyed',
        data: { pirate_name: 'Corsair', pirate_role: 'raider' },
      };
      const preview = formatNotificationPreview(notification, { maxLineLength: 120 });
      expect(preview.headline).toBe('Corsair destroyed!');
      expect(preview.details).toEqual(['Role: raider']);
      const fromPreview = tableMessageFromPreview(preview);
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toBe('Corsair destroyed!');
      expect(fromPreview).not.toContain('Role:');
      const output = stripAnsi(
        formatNotification({
          type: 'combat',
          msg_type: 'pirate_destroyed',
          timestamp: '2026-05-18T12:00:00.000Z',
          data: { pirate_name: 'Corsair', pirate_role: 'raider' },
        }).join('\n'),
      );
      expect(output).toContain('Corsair destroyed!');
      expect(output).toContain('Role: raider');
      expectNoDiagnosticTokens(`${preview.details.join('\n')}\n${fromPreview}\n${output}`);
    });

    test('pirate_destroyed names pirate, credits, and wreck; Role stays inline-only', () => {
      const notification = {
        type: 'combat',
        msg_type: 'pirate_destroyed',
        data: {
          pirate_id: 'pirate-corsair-7',
          pirate_name: 'Corsair',
          pirate_role: 'raider',
          is_boss: false,
          credits_earned: 150,
          combat_xp: 25,
          wreck_id: 'wreck-3',
          wreck_has_cargo: true,
          wreck_has_modules: true,
          wreck_poi_id: 'sol_cloudbank',
          wreck_poi_name: 'Cloudbank',
          wreck_system_id: 'sol',
          wreck_system_name: 'Sol',
        },
      };
      const preview = formatNotificationPreview(notification);
      expect(preview.tag).toBe('PIRATES');
      expect(preview.headline).toBe('Corsair destroyed!');
      expect(preview.headline).not.toContain('Boss ');
      expect(preview.details[0]).toBe('wreck wreck-3 at Cloudbank (Sol)');
      expect(preview.details).toContain('Credits: 150 credits');
      expect(preview.details).toContain('Weapons XP: 25');
      expect(preview.details).toContain('Role: raider');
      expect(preview.details).toContain('cargo+modules');
      expect(preview.details.join('\n')).not.toContain('combat_xp:');
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toBe('Corsair destroyed!; wreck wreck-3 at Cloudbank (Sol)');
      expect(fromPreview).not.toContain('Role:');
      expect(fromPreview).not.toContain('Credits:');
      expectNoDiagnosticTokens(`${preview.headline}\n${preview.details.join('\n')}\n${fromPreview}`);
    });

    test('pirate_destroyed is_boss true prefixes Boss in the headline', () => {
      const notification = {
        type: 'combat',
        msg_type: 'pirate_destroyed',
        data: {
          pirate_name: 'Dreadnought',
          pirate_role: 'boss',
          is_boss: true,
          wreck_id: 'wreck-9',
          wreck_poi_name: 'Cloudbank',
          wreck_system_name: 'Sol',
        },
      };
      const preview = formatNotificationPreview(notification);
      expect(preview.headline).toBe('Boss Dreadnought destroyed!');
      expect(preview.headline.startsWith('Boss ')).toBe(true);
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toBe('Boss Dreadnought destroyed!; wreck wreck-9 at Cloudbank (Sol)');
      expectNoDiagnosticTokens(`${preview.headline}\n${fromPreview}`);
    });

    test('pirate_destroyed pirate_role boss without is_boss has no Boss prefix', () => {
      const notification = {
        type: 'combat',
        msg_type: 'pirate_destroyed',
        data: {
          pirate_name: 'Dreadnought',
          pirate_role: 'boss',
          killer: 'Marlowe',
          system_name: 'Sol',
        },
      };
      const preview = formatNotificationPreview(notification);
      expect(preview.headline).toBe('Dreadnought destroyed by Marlowe in Sol!');
      expect(preview.headline).not.toContain('Boss ');
      expect(preview.details).toEqual([]);
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toBe('Dreadnought destroyed by Marlowe in Sol!');
      expectNoDiagnosticTokens(fromPreview);
    });

    test('pirate_destroyed broadcast with message uses the server announcement', () => {
      const notification = {
        type: 'combat',
        msg_type: 'pirate_destroyed',
        data: {
          pirate_name: 'Dreadnought',
          pirate_role: 'boss',
          killer: 'Marlowe',
          system_id: 'sol',
          system_name: 'Sol',
          message: 'Marlowe destroyed the Dreadnought in Sol!',
        },
      };
      const preview = formatNotificationPreview(notification);
      expect(preview.headline).toBe('Marlowe destroyed the Dreadnought in Sol!');
      expect(preview.details).toEqual([]);
      expect(preview.details.join('\n')).not.toContain('Marlowe destroyed the Dreadnought in Sol!');
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toBe('Marlowe destroyed the Dreadnought in Sol!');
      expect(fromPreview).not.toContain('Credits:');
      expect(fromPreview).not.toContain('wreck');
      expect(fromPreview).not.toContain('Role:');
      expectNoDiagnosticTokens(`${preview.headline}\n${fromPreview}`);
    });

    test('pirate_destroyed broadcast without message synthesizes killer and system', () => {
      const notification = {
        type: 'combat',
        msg_type: 'pirate_destroyed',
        data: {
          pirate_name: 'Dreadnought',
          pirate_role: 'boss',
          killer: 'Marlowe',
          system_id: 'sol',
          system_name: 'Sol',
        },
      };
      const preview = formatNotificationPreview(notification);
      expect(preview.headline).toBe('Dreadnought destroyed by Marlowe in Sol!');
      expect(preview.details).toEqual([]);
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toBe('Dreadnought destroyed by Marlowe in Sol!');
      expectNoDiagnosticTokens(fromPreview);

      const killerOnly = formatNotificationPreview({
        type: 'combat',
        msg_type: 'pirate_destroyed',
        data: { pirate_name: 'Dreadnought', pirate_role: 'boss', killer: 'Marlowe' },
      });
      expect(killerOnly.headline).toBe('Dreadnought destroyed by Marlowe!');
      expect(killerOnly.headline).not.toContain('Boss ');

      const systemIdOnly = formatNotificationPreview({
        type: 'combat',
        msg_type: 'pirate_destroyed',
        data: { pirate_name: 'Dreadnought', pirate_role: 'boss', killer: 'Marlowe', system_id: 'sol' },
      });
      expect(systemIdOnly.headline).toBe('Dreadnought destroyed by Marlowe in sol!');

      const bossBroadcast = formatNotificationPreview({
        type: 'combat',
        msg_type: 'pirate_destroyed',
        data: {
          pirate_name: 'Dreadnought',
          pirate_role: 'raider',
          is_boss: true,
          killer: 'Marlowe',
          system_name: 'Sol',
        },
      });
      expect(bossBroadcast.headline).toBe('Boss Dreadnought destroyed by Marlowe in Sol!');
    });

    test('pirate_destroyed broadcast long message is truncated to 120', () => {
      const message = `Marlowe destroyed the Dreadnought in Sol after a long running fight that spilled across every dock and lane ${'x'.repeat(40)}!`;
      expect(message.length).toBeGreaterThan(120);
      const notification = {
        type: 'combat',
        msg_type: 'pirate_destroyed',
        data: {
          pirate_name: 'Dreadnought',
          pirate_role: 'boss',
          killer: 'Marlowe',
          system_name: 'Sol',
          message,
        },
      };
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromFormatter.length).toBeLessThanOrEqual(120);
      expect(fromFormatter).toContain('…');
      expectNoDiagnosticTokens(fromFormatter);
    });

    test('pirate_destroyed private site longer than 80 plus credits does not fold Credits into Message', () => {
      const wreckId = `wreck-${'x'.repeat(80)}`;
      const notification = {
        type: 'combat',
        msg_type: 'pirate_destroyed',
        data: {
          pirate_name: 'Corsair',
          pirate_role: 'raider',
          wreck_id: wreckId,
          credits_earned: 150,
        },
      };
      const preview = formatNotificationPreview(notification, { maxLineLength: 120 });
      expect(preview.details[0]).toBe(`wreck ${wreckId}`);
      expect(preview.details).toContain('Credits: 150 credits');
      const fromPreview = tableMessageFromPreview(preview);
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toContain(wreckId);
      expect(fromPreview).not.toContain('Credits:');
      expectNoDiagnosticTokens(`${preview.headline}\n${preview.details.join('\n')}\n${fromPreview}`);
    });

    test('pirate_destroyed leftover message with XP and operator stays private', () => {
      const notification = {
        type: 'combat',
        msg_type: 'pirate_destroyed',
        data: {
          pirate_name: 'Corsair',
          pirate_role: 'raider',
          combat_xp: 25,
          operator_id: 'drone-7',
          message: 'This leftover announcement should not become the headline',
        },
      };
      const preview = formatNotificationPreview(notification);
      expect(preview.headline).toBe('Corsair destroyed!');
      expect(preview.headline).not.toContain('leftover announcement');
      expect(preview.details).toContain('Weapons XP: 25');
      expect(preview.details).toContain('Drone operator: drone-7');
      expect(preview.details).toContain('Role: raider');
      expect(preview.details.join('\n')).not.toContain('combat_xp:');
      expect(preview.details.some((line) => line.startsWith('XP:'))).toBe(false);
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).not.toContain('leftover announcement');
      expectNoDiagnosticTokens(`${preview.headline}\n${preview.details.join('\n')}\n${fromPreview}`);
    });

    test('pirate_destroyed operator_id with wreck is inline-only', () => {
      const notification = {
        type: 'combat',
        msg_type: 'pirate_destroyed',
        data: {
          pirate_name: 'Corsair',
          pirate_role: 'raider',
          wreck_id: 'wreck-3',
          wreck_poi_name: 'Cloudbank',
          wreck_system_name: 'Sol',
          operator_id: 'drone-7',
        },
      };
      const preview = formatNotificationPreview(notification);
      expect(preview.details[0]).toBe('wreck wreck-3 at Cloudbank (Sol)');
      expect(preview.details).toContain('Drone operator: drone-7');
      expect(preview.details[0]).not.toBe('Drone operator: drone-7');
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toBe('Corsair destroyed!; wreck wreck-3 at Cloudbank (Sol)');
      expect(fromPreview).not.toContain('Drone operator:');
      expectNoDiagnosticTokens(`${preview.details.join('\n')}\n${fromPreview}`);
    });

    test('pirate_destroyed with credits and no wreck folds Credits into table Message', () => {
      const notification = {
        type: 'combat',
        msg_type: 'pirate_destroyed',
        data: { pirate_name: 'Corsair', pirate_role: 'raider', credits_earned: 150 },
      };
      const preview = formatNotificationPreview(notification);
      expect(preview.headline).toBe('Corsair destroyed!');
      expect(preview.details[0]).toBe('Credits: 150 credits');
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
      const fromFormatter = formatNotificationMessage(notification);
      expect(fromPreview).toBe(fromFormatter);
      expect(fromPreview).toBe('Corsair destroyed!; Credits: 150 credits');
      expect(fromPreview).not.toContain('Role:');
      expectNoDiagnosticTokens(`${preview.details.join('\n')}\n${fromPreview}`);

      const zeroCredits = formatNotificationPreview({
        type: 'combat',
        msg_type: 'pirate_destroyed',
        data: {
          pirate_name: 'Corsair',
          pirate_role: 'raider',
          credits_earned: 0,
          combat_xp: 0,
          wreck_has_cargo: false,
          wreck_has_modules: false,
        },
      });
      expect(zeroCredits.headline).toBe('Corsair destroyed!');
      expect(zeroCredits.details).toEqual(['Role: raider']);
      expect(zeroCredits.details.join('\n')).not.toContain('Credits:');
      expect(zeroCredits.details.join('\n')).not.toContain('Weapons XP:');
      expect(tableMessageFromPreview(zeroCredits)).toBe('Corsair destroyed!');
      expect(tableMessageFromPreview(zeroCredits)).not.toContain('Role:');
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

    test('battle_ended prefers raw reason, keeps message, and notes no winning side on -1', () => {
      const stalemate = formatNotificationPreview({
        msg_type: 'battle_ended',
        data: { reason: 'stalemate', winning_side: -1 },
      });
      expect(stalemate.headline).toBe('Battle ended (stalemate)');
      expect(stalemate.details).toContain('no winning side');
      expect(tableMessageFromPreview(stalemate)).toContain('Battle ended (stalemate)');
      expect(tableMessageFromPreview(stalemate)).toContain('no winning side');

      expect(
        formatNotificationPreview({
          msg_type: 'battle_ended',
          data: { reason: 'mutual_destruction' },
        }).headline,
      ).toBe('Battle ended (mutual_destruction)');

      expect(
        formatNotificationPreview({
          msg_type: 'battle_ended',
          data: { reason: 'victory' },
        }).headline,
      ).toBe('Battle ended (victory)');

      const mixed = formatNotificationPreview({
        msg_type: 'battle_ended',
        data: { reason: 'stalemate', message: 'Victory' },
      });
      expect(mixed.headline).toBe('Battle ended (stalemate)');
      expect(mixed.details.join('\n')).toContain('Victory');
      expect(tableMessageFromPreview(mixed)).toContain('Victory');

      const sentinelOnly = formatNotificationPreview({
        msg_type: 'battle_ended',
        data: { winning_side: -1 },
      });
      expect(sentinelOnly.headline).toBe('Battle ended!');
      expect(sentinelOnly.details).toContain('no winning side');
      expect(sentinelOnly.headline).not.toContain('stalemate');
    });

    test('battle_left headlines map known reasons and never interpolate unknown tokens', () => {
      expect(
        formatNotificationPreview({
          msg_type: 'battle_left',
          data: { username: 'Marlowe', reason: 'fled' },
        }).headline,
      ).toContain('Marlowe fled the battle');
      expect(
        formatNotificationPreview({
          msg_type: 'battle_left',
          data: { username: 'Marlowe', reason: 'destroyed' },
        }).headline,
      ).toContain('Marlowe was destroyed — combat over');
      expect(
        formatNotificationPreview({
          msg_type: 'battle_left',
          data: { username: 'Marlowe', reason: 'emergency_warp' },
        }).headline,
      ).toBe('Marlowe emergency-warped out of the battle');

      const disconnected = formatNotificationPreview({
        msg_type: 'battle_left',
        data: { username: 'Marlowe', reason: 'disconnected' },
      }).headline;
      expect(disconnected).toContain('Marlowe left the battle');
      expect(disconnected).not.toContain('disconnected');

      const totallyNew = formatNotificationPreview({
        msg_type: 'battle_left',
        data: { username: 'Marlowe', reason: 'totally_new' },
      }).headline;
      expect(totallyNew).toContain('Marlowe left the battle');
      expect(totallyNew).not.toContain('totally_new');

      expect(
        formatNotificationPreview({
          msg_type: 'battle_left',
          data: { username: 'Marlowe', reason: 1 },
        }).headline,
      ).toContain('Marlowe left the battle');

      const booleanReason = formatNotificationPreview({
        msg_type: 'battle_left',
        data: { username: 'Marlowe', reason: true },
      }).headline;
      expect(booleanReason).toContain('Marlowe left the battle');
      expect(booleanReason).not.toContain('true');

      expect(
        formatNotificationPreview({
          msg_type: 'battle_left',
          data: { reason: 'destroyed' },
        }).headline,
      ).toContain('Someone was destroyed — combat over');
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

  describe('boarding / prize recovery previews', () => {
    const boardingPrizeTypes = ['ship_captured', 'prize_update'] as const;
    const captureUse = 'Use: get_nearby then claim_prize';
    const prizeIdentity = {
      prize_id: 'prize-1',
      ship_id: 'ship-recover-1',
      ship_class: 'frigate',
      ship_name: 'Captured Lark',
    } as const;

    function captureNotification(data: Record<string, unknown>) {
      return {
        type: 'combat',
        msg_type: 'ship_captured',
        timestamp: '2026-05-23T19:12:00.000Z',
        data,
      };
    }

    function prizeNotification(data: Record<string, unknown>) {
      return {
        type: 'prize',
        msg_type: 'prize_update',
        timestamp: '2026-05-23T19:12:05.000Z',
        data,
      };
    }

    function tableMessage(notification: Record<string, unknown>): string {
      return tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
    }

    test('registers ship_captured and prize_update; personnel_update stays unhandled', () => {
      for (const msgType of boardingPrizeTypes) {
        expect(hasPreviewHandler(msgType)).toBe(true);
        expect(NOTIFICATION_TYPES).toContain(msgType);
      }
      expect(hasPreviewHandler('personnel_update')).toBe(false);
    });

    test('full ship_captured names captor, class, and former owner and folds Use:', () => {
      const notification = captureNotification({
        battle_id: 'battle-42',
        tick: 901800,
        boarding_operation_id: 'board-1',
        captor_id: 'player-1',
        captor_username: 'Marlowe',
        former_owner_id: 'pirate-1',
        former_owner_username: 'Corsair-7',
        ship_id: 'ship-skiff-1',
        ship_class: 'skiff',
      });
      const preview = formatNotificationPreview(notification);
      expect(preview.tag).toBe('CAPTURE');
      expect(preview.severity).toBe('success');
      expect(preview.headline).toBe('Marlowe captured skiff from Corsair-7');
      expect(preview.details[0]).toBe(captureUse);
      const fromPreview = tableMessage(notification);
      expect(fromPreview).toBe(formatNotificationMessage(notification));
      expect(fromPreview).toBe('Marlowe captured skiff from Corsair-7; Use: get_nearby then claim_prize');
      expect(fromPreview).not.toContain('captor_id');
      expect(fromPreview).not.toContain('boarding_operation_id');
      expect(fromPreview).not.toContain('player-1');
      expect(fromPreview).not.toContain('You captured');
      expect(captureUse.length).toBeLessThanOrEqual(80);
    });

    test('NPC former owner username is printed as-is', () => {
      const preview = formatNotificationPreview(
        captureNotification({
          captor_username: 'Marlowe',
          former_owner_username: 'Corsair-7',
          ship_class: 'skiff',
        }),
      );
      expect(preview.headline).toBe('Marlowe captured skiff from Corsair-7');
      expect(preview.headline).toContain('Corsair-7');
    });

    test('empty ship_captured bag uses last-resort headline without Use: or Someone', () => {
      const preview = formatNotificationPreview(captureNotification({}));
      expect(preview.tag).toBe('CAPTURE');
      expect(preview.headline).toBe('Ship captured');
      expect(preview.details).toEqual([]);
      expect(preview.headline).not.toContain('Someone');
      expectNoDiagnosticTokens(preview.headline);
      expect(tableMessage(captureNotification({}))).toBe('Ship captured');
    });

    test('class-only capture synthesizes Someone fallbacks and still folds Use:', () => {
      const notification = captureNotification({ ship_class: 'skiff' });
      const preview = formatNotificationPreview(notification);
      expect(preview.headline).toBe('Someone captured skiff from Someone');
      expect(preview.details).toEqual([captureUse]);
      expect(tableMessage(notification)).toBe('Someone captured skiff from Someone; Use: get_nearby then claim_prize');
    });

    test('stall in_transit + dry keeps site in the headline and folds Use: not the server message', () => {
      const notification = prizeNotification({
        ...prizeIdentity,
        status: 'in_transit',
        wait_reason: 'dry',
        destination_base_id: 'earth_station',
        system_id: 'sol',
        poi_id: 'sol_cloudbank',
        message: 'Prize recovery stopped: fuel empty',
      });
      const preview = formatNotificationPreview(notification);
      expect(preview.tag).toBe('PRIZE');
      expect(preview.severity).toBe('warning');
      expect(preview.headline).toBe('Prize prize-1 (Captured Lark) in transit (dry) at sol_cloudbank (sol)');
      expect(preview.headline).toContain('prize-1');
      expect(preview.headline).toContain('Captured Lark');
      expect(preview.headline).toContain('in transit');
      expect(preview.headline).toContain('(dry)');
      expect(preview.headline).toContain('sol_cloudbank (sol)');
      expect(preview.details[0]).toBe('Use: service_prize prize_id=prize-1');
      expect(preview.details[1]).toBe('Prize recovery stopped: fuel empty');
      const fromPreview = tableMessage(notification);
      expect(fromPreview).toBe(formatNotificationMessage(notification));
      expect(fromPreview).toBe(
        'Prize prize-1 (Captured Lark) in transit (dry) at sol_cloudbank (sol); Use: service_prize prize_id=prize-1',
      );
      expect(fromPreview).toContain('sol_cloudbank (sol)');
      expect(fromPreview).toContain('Use: service_prize prize_id=prize-1');
      expect(fromPreview).not.toContain('Prize recovery stopped: fuel empty');
      expect(preview.details[0]?.length).toBeLessThanOrEqual(80);
    });

    test('in_transit with no wait is headline-only and does not fold the server message', () => {
      const notification = prizeNotification({
        ...prizeIdentity,
        status: 'in_transit',
        system_id: 'sol',
        poi_id: 'sol_cloudbank',
        message: 'Recovery underway on schedule',
      });
      const preview = formatNotificationPreview(notification);
      expect(preview.headline).toBe('Prize prize-1 (Captured Lark) in transit at sol_cloudbank (sol)');
      expect(preview.headline).toContain('in transit');
      expect(preview.headline).toContain('sol_cloudbank (sol)');
      expect(preview.headline).not.toContain('(dry)');
      expect(preview.details).toEqual([]);
      expect(preview.severity).toBe('info');
      const fromPreview = tableMessage(notification);
      expect(fromPreview).toBe(formatNotificationMessage(notification));
      expect(fromPreview).toBe(preview.headline);
      expect(fromPreview).not.toContain('Recovery underway on schedule');
    });

    test('delivered plus destination omits the server message from details and table Message', () => {
      const notification = prizeNotification({
        ...prizeIdentity,
        status: 'delivered',
        destination_base_id: 'earth_station',
        message: 'Prize delivered to storage',
      });
      const preview = formatNotificationPreview(notification);
      expect(preview.headline).toBe('Prize prize-1 (Captured Lark) delivered to earth_station');
      expect(preview.details).toEqual([]);
      expect(preview.severity).toBe('success');
      const fromPreview = tableMessage(notification);
      expect(fromPreview).toBe(formatNotificationMessage(notification));
      expect(fromPreview).toBe(preview.headline);
      expect(fromPreview).not.toContain('Prize delivered to storage');
    });

    test('delivered leftover wait_reason is omitted', () => {
      const notification = prizeNotification({
        ...prizeIdentity,
        status: 'delivered',
        destination_base_id: 'earth_station',
        wait_reason: 'jump_cooldown',
        message: 'Prize delivered to storage',
      });
      const preview = formatNotificationPreview(notification);
      expect(preview.headline).not.toContain('jump_cooldown');
      expect(preview.details).toEqual([]);
      expect(tableMessage(notification)).not.toContain('jump_cooldown');
    });

    test('destroyed leftover wait_reason is omitted while wreck still folds', () => {
      const notification = prizeNotification({
        ...prizeIdentity,
        status: 'destroyed',
        wait_reason: 'dry',
        wreck_id: 'wreck-9',
        system_id: 'sol',
        poi_id: 'sol_cloudbank',
        message: 'Prize hull destroyed',
      });
      const preview = formatNotificationPreview(notification);
      expect(preview.headline).toBe('Prize prize-1 (Captured Lark) destroyed');
      expect(preview.headline).not.toContain('(dry)');
      expect(preview.details[0]).toBe('wreck wreck-9 at sol_cloudbank (sol)');
      const fromPreview = tableMessage(notification);
      expect(fromPreview).toBe('Prize prize-1 (Captured Lark) destroyed; wreck wreck-9 at sol_cloudbank (sol)');
      expect(fromPreview).not.toContain('(dry)');
    });

    test('destroyed plus wreck folds the site and never prints wreck undefined', () => {
      const notification = prizeNotification({
        ...prizeIdentity,
        status: 'destroyed',
        wreck_id: 'wreck-9',
        system_id: 'sol',
        poi_id: 'sol_cloudbank',
        message: 'Prize hull destroyed',
      });
      const preview = formatNotificationPreview(notification);
      expect(preview.tag).toBe('PRIZE');
      expect(preview.severity).toBe('danger');
      expect(preview.details[0]).toBe('wreck wreck-9 at sol_cloudbank (sol)');
      const fromPreview = tableMessage(notification);
      expect(fromPreview).toBe(formatNotificationMessage(notification));
      expect(fromPreview).toBe('Prize prize-1 (Captured Lark) destroyed; wreck wreck-9 at sol_cloudbank (sol)');
      expect(fromPreview).not.toContain('wreck undefined');
      expectNoDiagnosticTokens(`${preview.headline}\n${preview.details.join('\n')}\n${fromPreview}`);
    });

    test('unknown status prints the raw token without a fabricated verb', () => {
      const notification = prizeNotification({
        ...prizeIdentity,
        status: 'warp_jammed',
        message: 'Cannot plot a recovery route',
      });
      const preview = formatNotificationPreview(notification);
      expect(preview.headline).toBe('Prize prize-1 (Captured Lark) (warp_jammed)');
      expect(preview.headline).not.toContain('stalled');
      expect(preview.headline).not.toContain('waiting');
      expect(preview.details[0]).toBe('Use: service_prize prize_id=prize-1');
      expect(preview.severity).toBe('warning');
    });

    test('status without prize_id drops the id segment and has no Use:', () => {
      const notification = prizeNotification({
        ship_id: 'ship-recover-1',
        ship_class: 'frigate',
        status: 'in_transit',
        wait_reason: 'dry',
        system_id: 'sol',
        poi_id: 'sol_cloudbank',
        message: 'Prize recovery stopped: fuel empty',
      });
      const preview = formatNotificationPreview(notification);
      expect(preview.headline.startsWith('Prize ')).toBe(true);
      expect(preview.headline.startsWith('Prize  ')).toBe(false);
      expect(preview.headline).toBe('Prize (frigate) in transit (dry) at sol_cloudbank (sol)');
      expect(preview.details).toEqual([]);
      expect(tableMessage(notification)).not.toContain('Use:');
      expect(tableMessage(notification)).not.toContain('Prize recovery stopped: fuel empty');
    });

    test('nested personnel and ship junk never dumps JSON or complement fields', () => {
      const capture = captureNotification({
        captor_username: 'Marlowe',
        former_owner_username: 'Corsair-7',
        ship_class: 'skiff',
        personnel: { fit_crew: 4 },
        ship: { hull: 1 },
      });
      const prize = prizeNotification({
        ...prizeIdentity,
        status: 'in_transit',
        wait_reason: 'dry',
        system_id: 'sol',
        poi_id: 'sol_cloudbank',
        message: 'Prize recovery stopped: fuel empty',
        personnel: { fit_crew: 4 },
        ship: { hull: 1 },
      });
      for (const notification of [capture, prize]) {
        const preview = formatNotificationPreview(notification);
        const output = `${preview.headline}\n${preview.details.join('\n')}\n${tableMessage(notification)}`;
        expectNoNestedJsonDump(output);
        expect(output).not.toContain('fit_crew');
        expect(output).not.toContain('"hull"');
        expect(formatNotificationMessage(notification)).toBe(tableMessage(notification));
      }
    });

    test('54-character prize_id drops Use: from the table cell but keeps the full site', () => {
      const prizeId = `p${'x'.repeat(53)}`;
      expect(prizeId.length).toBe(54);
      const useLine = `Use: service_prize prize_id=${prizeId}`;
      expect(useLine.length).toBeGreaterThan(80);

      const notification = prizeNotification({
        ...prizeIdentity,
        prize_id: prizeId,
        status: 'in_transit',
        wait_reason: 'dry',
        system_id: 'sol',
        poi_id: 'sol_cloudbank',
        message: 'Prize recovery stopped: fuel empty',
      });
      const untruncated = formatNotificationPreview(notification, { maxLineLength: 1000 });
      expect(untruncated.headline.length).toBeLessThanOrEqual(120);
      expect(untruncated.details[0]).toBe(useLine);
      expect(untruncated.details[0]).not.toContain('…');

      const fromPreview = tableMessage(notification);
      expect(fromPreview).toBe(formatNotificationMessage(notification));
      expect(fromPreview).toBe(untruncated.headline);
      expect(fromPreview).toContain('sol_cloudbank (sol)');
      expect(fromPreview).not.toContain('s…');
      expect(fromPreview).not.toContain(useLine);
    });

    test('empty prize_update bag uses fixed Prize update headline', () => {
      const preview = formatNotificationPreview(prizeNotification({}));
      expect(preview.tag).toBe('PRIZE');
      expect(preview.headline).toBe('Prize update');
      expect(preview.details).toEqual([]);
      expect(preview.severity).toBe('neutral');
      expect(preview.headline).not.toBe('Prize ');
      expectNoDiagnosticTokens(preview.headline);
    });

    test('capture IDs without display-identity scalars do not synthesize Someone', () => {
      const notification = captureNotification({
        battle_id: 'battle-42',
        tick: 901800,
        boarding_operation_id: 'board-1',
        captor_id: 'player-1',
        former_owner_id: 'pirate-1',
        ship_id: 'ship-skiff-1',
      });
      const preview = formatNotificationPreview(notification);
      expect(preview.headline).toBe('Ship captured');
      expect(preview.details).toEqual([]);
      expect(preview.headline).not.toContain('Someone');
      expect(tableMessage(notification)).not.toContain('player-1');
    });

    test('prize_id without status uses updated and folds Use:', () => {
      const notification = prizeNotification({
        prize_id: 'prize-1',
        ship_id: 'ship-recover-1',
        message: 'Claimant still owns this hull',
      });
      const preview = formatNotificationPreview(notification);
      expect(preview.headline).toBe('Prize prize-1 updated');
      expect(preview.details[0]).toBe('Use: service_prize prize_id=prize-1');
      expect(preview.severity).toBe('neutral');
      expect(tableMessage(notification)).toBe('Prize prize-1 updated; Use: service_prize prize_id=prize-1');
    });

    test('destroyed without wreck_id omits the server message', () => {
      const notification = prizeNotification({
        ...prizeIdentity,
        status: 'destroyed',
        message: 'Prize hull destroyed',
      });
      const preview = formatNotificationPreview(notification);
      expect(preview.headline).toBe('Prize prize-1 (Captured Lark) destroyed');
      expect(preview.details).toEqual([]);
      expect(tableMessage(notification)).toBe(preview.headline);
      expect(tableMessage(notification)).not.toContain('Prize hull destroyed');
    });

    test('last-resort prize_update with message still omits the server sentence', () => {
      const notification = prizeNotification({
        ship_id: 'ship-recover-1',
        message: 'Prize recovery stopped: fuel empty',
      });
      const preview = formatNotificationPreview(notification);
      expect(preview.headline).toBe('Prize update');
      expect(preview.details).toEqual([]);
      expect(preview.severity).toBe('neutral');
      const fromPreview = tableMessage(notification);
      expect(fromPreview).toBe(formatNotificationMessage(notification));
      expect(fromPreview).toBe('Prize update');
      expect(fromPreview).not.toContain('Prize recovery stopped: fuel empty');
    });

    test('non-in_transit stall-like prints raw status, wait, and location and folds Use:', () => {
      const notification = prizeNotification({
        ...prizeIdentity,
        status: 'warp_jammed',
        wait_reason: 'dry',
        system_id: 'sol',
        poi_id: 'sol_cloudbank',
        message: 'Prize recovery stopped: fuel empty',
      });
      const preview = formatNotificationPreview(notification);
      expect(preview.headline).toBe('Prize prize-1 (Captured Lark) (warp_jammed) (dry) at sol_cloudbank (sol)');
      expect(preview.headline).not.toContain('stalled');
      expect(preview.headline).not.toContain('waiting');
      expect(preview.details[0]).toBe('Use: service_prize prize_id=prize-1');
      expect(preview.severity).toBe('warning');
      const fromPreview = tableMessage(notification);
      expect(fromPreview).toBe(formatNotificationMessage(notification));
      expect(fromPreview).toBe(
        'Prize prize-1 (Captured Lark) (warp_jammed) (dry) at sol_cloudbank (sol); Use: service_prize prize_id=prize-1',
      );
      expect(fromPreview).toContain('Use: service_prize prize_id=prize-1');
      expect(fromPreview).not.toContain('Prize recovery stopped: fuel empty');
    });

    test('wreck and location optional parts omit missing poi, system, and destination', () => {
      const wreckOnly = prizeNotification({
        ...prizeIdentity,
        status: 'destroyed',
        wreck_id: 'wreck-9',
        message: 'Prize hull destroyed',
      });
      expect(formatNotificationPreview(wreckOnly).details[0]).toBe('wreck wreck-9');
      expect(tableMessage(wreckOnly)).toBe('Prize prize-1 (Captured Lark) destroyed; wreck wreck-9');
      expect(tableMessage(wreckOnly)).not.toContain('wreck undefined');

      const wreckPoi = prizeNotification({
        ...prizeIdentity,
        status: 'destroyed',
        wreck_id: 'wreck-9',
        poi_id: 'sol_cloudbank',
        message: 'Prize hull destroyed',
      });
      expect(formatNotificationPreview(wreckPoi).details[0]).toBe('wreck wreck-9 at sol_cloudbank');
      expect(tableMessage(wreckPoi)).toBe('Prize prize-1 (Captured Lark) destroyed; wreck wreck-9 at sol_cloudbank');

      const wreckSystem = prizeNotification({
        ...prizeIdentity,
        status: 'destroyed',
        wreck_id: 'wreck-9',
        system_id: 'sol',
        message: 'Prize hull destroyed',
      });
      expect(formatNotificationPreview(wreckSystem).details[0]).toBe('wreck wreck-9 in sol');
      expect(tableMessage(wreckSystem)).toBe('Prize prize-1 (Captured Lark) destroyed; wreck wreck-9 in sol');

      const stallPoi = prizeNotification({
        ...prizeIdentity,
        status: 'in_transit',
        wait_reason: 'dry',
        poi_id: 'sol_cloudbank',
        message: 'Prize recovery stopped: fuel empty',
      });
      expect(formatNotificationPreview(stallPoi).headline).toBe(
        'Prize prize-1 (Captured Lark) in transit (dry) at sol_cloudbank',
      );

      const stallSystem = prizeNotification({
        ...prizeIdentity,
        status: 'in_transit',
        wait_reason: 'dry',
        system_id: 'sol',
        message: 'Prize recovery stopped: fuel empty',
      });
      expect(formatNotificationPreview(stallSystem).headline).toBe(
        'Prize prize-1 (Captured Lark) in transit (dry) at sol',
      );

      const deliveredNoDest = prizeNotification({
        ...prizeIdentity,
        status: 'delivered',
        message: 'Prize delivered to storage',
      });
      const deliveredPreview = formatNotificationPreview(deliveredNoDest);
      expect(deliveredPreview.headline).toBe('Prize prize-1 (Captured Lark) delivered');
      expect(deliveredPreview.headline).not.toContain('to ');
      expect(deliveredPreview.details).toEqual([]);
      expect(tableMessage(deliveredNoDest)).toBe(deliveredPreview.headline);
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

    test('verbose generic previews add bounded scalars and omitted-field metadata', () => {
      const notification = {
        type: 'mystery',
        msg_type: 'mystery',
        data: {
          message: 'Something happened.',
          code: 'strange',
          tick: 9,
          ship: { id: 'ship-1', name: 'Dust Devil', hull: 130 },
        },
      };

      const standard = formatNotificationPreview(notification);
      expect(standard.details).toEqual([]);
      expect(standard.omittedHint).toBeUndefined();

      const verbose = formatNotificationPreview(notification, { verbose: true, maxDetails: 2 });
      expect(verbose.details).toEqual(['code=strange', 'tick=9']);
      expect(verbose.omittedHint).toBe('omitted: ship');
      expect(JSON.stringify(verbose)).not.toContain('Dust Devil');
      expect(JSON.stringify(verbose)).not.toMatch(/"hull"\s*:/);
    });

    test('verbose scalar details respect maxDetails and maxLineLength', () => {
      const preview = formatNotificationPreview(
        {
          type: 'mystery',
          msg_type: 'mystery',
          data: {
            message: 'Something happened.',
            code: 'a-very-long-code',
            tick: 9,
          },
        },
        { verbose: true, maxDetails: 1, maxLineLength: 12 },
      );

      expect(preview.details).toHaveLength(1);
      expect(preview.details[0]?.length).toBeLessThanOrEqual(12);
      expect(preview.details[0]?.endsWith('…')).toBe(true);
    });

    test('inline verbose output shows extras and a dim omission hint without expanding nested data', () => {
      const notification = {
        type: 'mystery',
        msg_type: 'mystery',
        timestamp: '2026-05-18T12:00:00.000Z',
        data: {
          message: 'Something happened.',
          code: 'strange',
          tick: 9,
          ship: { id: 'ship-1', name: 'Dust Devil', hull: 130 },
        },
      };

      const standard = formatNotification(notification, { plain: true }).join('\n');
      expect(standard).not.toContain('code=strange');
      expect(standard).not.toContain('omitted: ship');

      const verbose = formatNotification(notification, { plain: true, verbose: true }).join('\n');
      expect(verbose).toContain('code=strange');
      expect(verbose).toContain('tick=9');
      expect(verbose).toContain('omitted: ship');
      expect(verbose).not.toContain('Dust Devil');
      expect(verbose).not.toMatch(/"hull"\s*:/);
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

  describe('PR7b pure social domain previews', () => {
    const socialTypes = [
      'chat_message',
      'trade_offer_received',
      'trade_complete',
      'trade_declined',
      'trade_cancelled',
      'friend_request',
      'friend_request_accepted',
      'friend_removed',
      'friend_online',
      'friend_offline',
      'faction_invite',
      'faction_war_declared',
      'faction_peace_proposal',
      'faction_peace_accepted',
      'faction_alliance_proposal',
      'faction_alliance_formed',
      'faction_alliance_broken',
      'base_raid_update',
      'base_destroyed',
      'scan_result',
      'scan_detected',
    ] as const;

    test('social domain types are registered as pure PREVIEW_HANDLERS', () => {
      for (const msgType of socialTypes) {
        expect(hasPreviewHandler(msgType)).toBe(true);
      }
    });

    test('chat_message pure preview keeps channel tag and sender:content', () => {
      const notification = {
        type: 'chat',
        msg_type: 'chat_message',
        data: {
          channel: 'local',
          sender: 'Ibis',
          content: 'Clear skies over Sol today.',
          tick: 9,
          ship: { id: 'ship-1', name: 'Dust Devil' },
        },
      };
      const preview = formatNotificationPreview(notification);
      expect(preview.tag).toBe('CHAT:local');
      expect(preview.headline).toBe('Ibis: Clear skies over Sol today.');
      expect(preview.details).toEqual([]);
      // Table Message is headline only (K11) — Type stays raw chat_message elsewhere.
      expect(tableMessageFromPreview(preview)).toBe('Ibis: Clear skies over Sol today.');
      expect(formatNotificationMessage(notification)).toBe('Ibis: Clear skies over Sol today.');

      const verbose = formatNotificationPreview(notification, { verbose: true });
      expect(verbose.details).toContain('tick=9');
      expect(verbose.omittedHint).toBe('omitted: ship');
      expect(JSON.stringify(verbose)).not.toContain('Dust Devil');
    });

    test('trade_offer_received pure preview includes prompts and credits details', () => {
      const preview = formatNotificationPreview({
        type: 'trade',
        msg_type: 'trade_offer_received',
        data: {
          from_name: 'Dockmaster',
          trade_id: 'trade_1',
          offer_credits: 5,
          request_credits: 2,
        },
      });
      expect(preview.tag).toBe('TRADE');
      expect(preview.headline).toContain('Offer from Dockmaster');
      expect(preview.headline).toContain('trade_1');
      expect(preview.details.some((d) => d.includes('Offering: 5 credits'))).toBe(true);
      expect(preview.details.some((d) => d.includes('Requesting: 2 credits'))).toBe(true);
      expect(preview.details.some((d) => d.includes('trade accept trade_id=trade_1'))).toBe(true);
    });

    test('faction_invite pure preview includes decline prompt', () => {
      const preview = formatNotificationPreview({
        type: 'faction',
        msg_type: 'faction_invite',
        data: { faction_name: 'Wardens', faction_id: 'fac_1' },
      });
      expect(preview.tag).toBe('FACTION');
      expect(preview.headline).toContain('Wardens');
      expect(preview.details.join('\n')).toContain('join_faction faction_id=fac_1');
      expect(preview.details.join('\n')).toContain('faction decline_invite faction_id=fac_1');
    });

    test('scan_result pure preview never dumps malformed revealed_info object', () => {
      const preview = formatNotificationPreview({
        type: 'scan',
        msg_type: 'scan_result',
        data: { success: true, username: 'Raider', revealed_info: { bad: true }, ship_class: 'fighter' },
      });
      expect(preview.tag).toBe('SCAN');
      expect(preview.headline).toContain('Scan of Raider revealed:');
      expect(preview.headline).not.toContain('[object Object]');
      expect(preview.details).toContain('Ship: fighter');
      expectNoNestedJsonDump(JSON.stringify(preview));
    });

    test('inline pure registry: social types go through pure preview path', () => {
      const output = stripAnsi(
        formatNotification({
          type: 'chat',
          msg_type: 'chat_message',
          timestamp: '2026-05-18T12:00:00.000Z',
          data: { channel: 'faction', sender: 'Marlowe', content: 'Rally at Sol.' },
        }).join('\n'),
      );
      expect(output).toContain('[CHAT:faction]');
      expect(output).toContain('Marlowe: Rally at Sol.');
    });

    test('base_raid_update pure preview is compact HP line', () => {
      const preview = formatNotificationPreview({
        type: 'base',
        msg_type: 'base_raid_update',
        data: { base_name: 'Outpost', current_health: 80, max_health: 100, damage_per_tick: 5 },
      });
      expect(preview.tag).toBe('RAID');
      expect(preview.headline).toBe('Outpost: 80/100 HP (-5/tick)');
    });
  });

  describe('0.573.2 diplomacy previews', () => {
    test('war OpenAPI names without message synthesize aggressor and defender', () => {
      const preview = formatNotificationPreview({
        type: 'combat',
        msg_type: 'faction_war_declared',
        data: {
          aggressor_faction_id: 'fac_raiders',
          aggressor_faction_name: 'Raiders',
          defender_faction_id: 'fac_wardens',
          defender_faction_name: 'Wardens',
        },
      });
      expect(preview.tag).toBe('WAR');
      expect(preview.headline).toBe('Raiders declared war on Wardens!');
      expect(preview.headline).not.toContain('a faction');
      expect(preview.details).toEqual([]);
    });

    test('war message without reason omits the Reason line', () => {
      const preview = formatNotificationPreview({
        type: 'combat',
        msg_type: 'faction_war_declared',
        data: {
          aggressor_faction_id: 'fac_raiders',
          aggressor_faction_name: 'Raiders',
          defender_faction_id: 'fac_wardens',
          defender_faction_name: 'Wardens',
          message: 'Raiders declared war on Wardens.',
        },
      });
      expect(preview.tag).toBe('WAR');
      expect(preview.headline).toBe('Raiders declared war on Wardens.');
      expect(preview.details.join('\n')).not.toContain('Reason:');
    });

    test('war synthesis does not append undocumented faction tags', () => {
      const preview = formatNotificationPreview({
        type: 'combat',
        msg_type: 'faction_war_declared',
        data: {
          aggressor_faction_name: 'Raiders',
          defender_faction_name: 'Wardens',
          aggressor_faction_tag: 'RAID',
        },
      });
      expect(preview.headline).toBe('Raiders declared war on Wardens!');
      expect(preview.headline).not.toContain('[RAID]');
    });

    test('war empty bag uses last-resort headline and keeps the WAR tag', () => {
      const preview = formatNotificationPreview({
        type: 'combat',
        msg_type: 'faction_war_declared',
        data: {},
      });
      expect(preview.tag).toBe('WAR');
      expect(preview.headline).toBe('A faction declared war');
      expect(preview.details).toEqual([]);
      expectNoDiagnosticTokens(preview.headline);
    });

    test('legacy attacker_name bag does not feed the war headline', () => {
      const preview = formatNotificationPreview({
        type: 'combat',
        msg_type: 'faction_war_declared',
        data: { attacker_name: 'Raiders', reason: 'territory' },
      });
      expect(preview.tag).toBe('WAR');
      expect(preview.headline).toBe('A faction declared war');
      expect(preview.headline).not.toContain('Raiders');
      expect(preview.details).toEqual(['Reason: territory']);
    });

    test('peace proposal message without terms omits Terms: and uses from_faction_id', () => {
      const preview = formatNotificationPreview({
        type: 'system',
        msg_type: 'faction_peace_proposal',
        data: {
          from_faction_id: 'fac_1',
          from_faction_name: 'Wardens',
          message: 'Wardens have proposed peace.',
        },
      });
      expect(preview.tag).toBe('PEACE');
      expect(preview.headline).toBe('Wardens have proposed peace.');
      expect(preview.details.join('\n')).not.toContain('Terms:');
      expect(preview.details.join('\n')).not.toContain('unconditional');
      expect(preview.details).toEqual(['Use: faction accept_peace target_faction_id=fac_1']);
    });

    test('peace proposal empty bag last-resort still emits target_faction_id=', () => {
      const preview = formatNotificationPreview({
        type: 'system',
        msg_type: 'faction_peace_proposal',
        data: {},
      });
      expect(preview.tag).toBe('PEACE');
      expect(preview.headline).toBe('Peace proposed');
      expect(preview.details).toEqual(['Use: faction accept_peace target_faction_id=']);
      expectNoDiagnosticTokens(`${preview.headline}\n${preview.details.join('\n')}`);
    });

    test('stale faction_peace_proposed type falls through to Policy 5', () => {
      expect(hasPreviewHandler('faction_peace_proposed')).toBe(false);
      const preview = formatNotificationPreview({
        type: 'system',
        msg_type: 'faction_peace_proposed',
        data: { message: 'Wardens have proposed peace.', proposer_name: 'Wardens' },
      });
      expect(preview.tag).toBe('FACTION_PEACE_PROPOSED');
      expect(preview.headline).toBe('Wardens have proposed peace.');
      expect(preview.details).toEqual([]);
    });

    test('peace accepted empty bag uses last-resort headline', () => {
      const preview = formatNotificationPreview({
        type: 'system',
        msg_type: 'faction_peace_accepted',
        data: {},
      });
      expect(preview.tag).toBe('PEACE');
      expect(preview.headline).toBe('Peace accepted');
      expectNoDiagnosticTokens(preview.headline);
    });

    test('alliance proposal without message synthesizes name and tag', () => {
      const preview = formatNotificationPreview({
        type: 'system',
        msg_type: 'faction_alliance_proposal',
        data: {
          from_faction_id: 'fac_1',
          from_faction_name: 'Wardens',
          from_faction_tag: 'WRD',
        },
      });
      expect(preview.tag).toBe('FACTION');
      expect(preview.headline).toBe('Wardens [WRD] proposed an alliance');
      expect(preview.details).toEqual(['Use: faction accept_ally target_faction_id=fac_1']);
    });

    test('alliance proposal with message does not force-append the faction tag', () => {
      const preview = formatNotificationPreview({
        type: 'system',
        msg_type: 'faction_alliance_proposal',
        data: {
          from_faction_id: 'fac_1',
          from_faction_name: 'Wardens',
          from_faction_tag: 'WRD',
          message: 'Wardens have proposed an alliance.',
        },
      });
      expect(preview.headline).toBe('Wardens have proposed an alliance.');
      expect(preview.headline).not.toContain('[WRD]');
    });

    test('alliance formed and broken synthesize tagged names when message is absent', () => {
      const formed = formatNotificationPreview({
        type: 'system',
        msg_type: 'faction_alliance_formed',
        data: {
          with_faction_id: 'fac_1',
          with_faction_name: 'Wardens',
          with_faction_tag: 'WRD',
        },
      });
      expect(formed.tag).toBe('FACTION');
      expect(formed.headline).toBe('Alliance formed with Wardens [WRD]');

      const broken = formatNotificationPreview({
        type: 'system',
        msg_type: 'faction_alliance_broken',
        data: {
          by_faction_id: 'fac_1',
          by_faction_name: 'Wardens',
          by_faction_tag: 'WRD',
        },
      });
      expect(broken.tag).toBe('FACTION');
      expect(broken.headline).toBe('Wardens [WRD] broke the alliance');
    });

    test('tableMessageFromPreview folds alliance Use: into Message', () => {
      const preview = formatNotificationPreview({
        type: 'system',
        msg_type: 'faction_alliance_proposal',
        data: {
          from_faction_id: 'fac_1',
          from_faction_name: 'Wardens',
          from_faction_tag: 'WRD',
          message: 'Wardens have proposed an alliance.',
        },
      });
      const useLine = 'Use: faction accept_ally target_faction_id=fac_1';
      expect(preview.details).toEqual([useLine]);
      expect(useLine.length).toBeLessThanOrEqual(80);
      expect(tableMessageFromPreview(preview)).toBe(`${preview.headline}; ${useLine}`);
    });
  });

  describe('0.573.2 ops previews', () => {
    const opsTypes = ['server_restart_warning', 'drone_adrift'] as const;

    test('registers pure PREVIEW_HANDLERS for restart and drone adrift', () => {
      for (const msgType of opsTypes) {
        expect(hasPreviewHandler(msgType)).toBe(true);
        expect(NOTIFICATION_TYPES).toContain(msgType);
      }
    });

    test('restart empty bag uses last-resort headline and warning severity', () => {
      const preview = formatNotificationPreview({
        type: 'system',
        msg_type: 'server_restart_warning',
        data: {},
      });
      expect(preview.tag).toBe('SYSTEM');
      expect(preview.headline).toBe('Server restart warning');
      expect(preview.details).toEqual([]);
      expect(preview.severity).toBe('warning');
      expectNoDiagnosticTokens(preview.headline);
    });

    test('restart without countdown uses message as headline and does not duplicate it', () => {
      const preview = formatNotificationPreview({
        type: 'system',
        msg_type: 'server_restart_warning',
        data: { message: 'The server will restart shortly.' },
      });
      expect(preview.tag).toBe('SYSTEM');
      expect(preview.headline).toBe('The server will restart shortly.');
      expect(preview.details).toEqual([]);
      expect(preview.severity).toBe('warning');
    });

    test('restart countdown omits empty target_version', () => {
      const preview = formatNotificationPreview({
        type: 'system',
        msg_type: 'server_restart_warning',
        data: {
          seconds_until_restart: 60,
          target_version: '',
          message: 'Finish or park in-flight actions.',
        },
      });
      expect(preview.headline).toBe('Server restart in 60s');
      expect(preview.headline).not.toContain('()');
      expect(preview.details).toEqual(['Finish or park in-flight actions.']);
    });

    test('tableMessageFromPreview keeps countdown when the server message is longer than 80 characters', () => {
      const message =
        'Server restart in 60 seconds. Finish or park in-flight actions now so you are not mid-jump when the world closes.';
      expect(message.length).toBeGreaterThan(80);
      const preview = formatNotificationPreview({
        type: 'system',
        msg_type: 'server_restart_warning',
        data: { seconds_until_restart: 60, message },
      });
      expect(preview.headline.startsWith('Server restart in 60s')).toBe(true);
      expect(preview.details[0]).toBe(message);
      const tableMessage = tableMessageFromPreview(preview);
      expect(tableMessage).toBe(preview.headline);
      expect(tableMessage).toContain('60s');
    });

    test('drone empty bag uses last-resort headline without (ID: )', () => {
      const preview = formatNotificationPreview({
        type: 'system',
        msg_type: 'drone_adrift',
        data: {},
      });
      expect(preview.tag).toBe('DRONE');
      expect(preview.headline).toBe('A drone is adrift');
      expect(preview.headline).not.toContain('(ID:');
      expect(preview.details).toEqual([]);
      expect(preview.severity).toBe('warning');
      expectNoDiagnosticTokens(preview.headline);
    });

    test('drone_id-only bag uses location fallbacks and still appends (ID: )', () => {
      const preview = formatNotificationPreview({
        type: 'system',
        msg_type: 'drone_adrift',
        data: { drone_id: 'drone_1' },
      });
      expect(preview.headline).toBe('Your drone drone is adrift at unknown POI in unknown system (ID: drone_1)');
      expect(preview.details).toEqual(['Use: get_drone drone_id=drone_1', 'Use: recall_drone drone_id=drone_1']);
    });

    test('drone location sentence omits (ID: ) when drone_id is missing', () => {
      const preview = formatNotificationPreview({
        type: 'system',
        msg_type: 'drone_adrift',
        data: { drone_type: 'survey', poi_id: 'earth', system_id: 'sol' },
      });
      expect(preview.tag).toBe('DRONE');
      expect(preview.headline).toBe('Your survey drone is adrift at earth in sol');
      expect(preview.headline).not.toContain('(ID:');
      expect(preview.details).toEqual([]);
      expect(preview.severity).toBe('warning');
    });

    test('drone recovery hints list get_drone first and recall_drone second', () => {
      const preview = formatNotificationPreview({
        type: 'system',
        msg_type: 'drone_adrift',
        data: {
          drone_id: 'drone_1',
          owner_id: 'player_1',
          drone_type: 'survey',
          system_id: 'sol',
          poi_id: 'earth',
        },
      });
      expect(preview.headline).toBe('Your survey drone is adrift at earth in sol (ID: drone_1)');
      expect(preview.headline).not.toContain('player_1');
      expect(preview.details).toEqual(['Use: get_drone drone_id=drone_1', 'Use: recall_drone drone_id=drone_1']);
      expect(preview.severity).toBe('warning');
      const tableMessage = tableMessageFromPreview(preview);
      expect(tableMessage).toContain('get_drone drone_id=drone_1');
      expect(tableMessage).not.toContain('recall_drone');
    });
  });

  describe('PR7c remainder pure previews + pure registry', () => {
    const remainderTypes = [
      'mining_yield',
      'drone_update',
      'drone_destroyed',
      'skill_level_up',
      'skill_xp_gain',
      'pilotless_ship',
      'reconnected',
      'version_info',
      'queue_cleared',
      'action_error',
      'poi_arrival',
      'poi_departure',
    ] as const;

    test('registers pure PREVIEW_HANDLERS for every remainder type', () => {
      for (const msgType of remainderTypes) {
        expect(hasPreviewHandler(msgType)).toBe(true);
      }
    });

    test('NOTIFICATION_TYPES equals sorted PREVIEW_HANDLERS keys (pure registry)', () => {
      // knownCases coverage already asserts equality; double-check pure source of truth.
      expect(NOTIFICATION_TYPES).toEqual([...NOTIFICATION_TYPES].sort());
      for (const msgType of NOTIFICATION_TYPES) {
        expect(hasPreviewHandler(msgType)).toBe(true);
      }
      // Remainder types are included in the sole registry.
      for (const msgType of remainderTypes) {
        expect(NOTIFICATION_TYPES).toContain(msgType);
      }
    });

    test('mining_yield pure preview is compact yield line', () => {
      const preview = formatNotificationPreview({
        type: 'mining',
        msg_type: 'mining_yield',
        data: { quantity: 5, resource_id: 'ore_iron', remaining: 42 },
      });
      expect(preview.tag).toBe('MINED');
      expect(preview.headline).toBe('+5x ore_iron (42 remaining at POI)');
      expect(preview.details).toEqual([]);
    });

    test('skill_level_up and skill_xp_gain pure previews', () => {
      const levelUp = formatNotificationPreview({
        msg_type: 'skill_level_up',
        data: { skill_id: 'mining', new_level: 3, xp_gained: 50 },
      });
      expect(levelUp.tag).toBe('LEVEL UP');
      expect(levelUp.headline).toContain('mining is now level 3');
      expect(levelUp.headline).toContain('+50 XP');

      const xp = formatNotificationPreview({
        msg_type: 'skill_xp_gain',
        data: { skill_id: 'mining', xp_gained: 5, current_xp: 10, next_level_xp: 20 },
      });
      expect(xp.tag).toBe('XP');
      expect(xp.headline).toBe('+5 XP in mining (10/20)');
    });

    test('drone_update / drone_destroyed pure previews', () => {
      expect(
        formatNotificationPreview({
          msg_type: 'drone_update',
          data: { drone_type: 'combat', damage: 6, target_id: 'pirate' },
        }).headline,
      ).toContain('combat drone dealt 6 damage to pirate');
      expect(
        formatNotificationPreview({
          msg_type: 'drone_destroyed',
          data: { drone_type: 'combat', drone_id: 'drone_1' },
        }).headline,
      ).toContain('combat drone was destroyed! (ID: drone_1)');
    });

    test('pilotless_ship and reconnected use details for secondary lines', () => {
      const pilotless = formatNotificationPreview({
        msg_type: 'pilotless_ship',
        data: { player_username: 'Marlowe', ship_class: 'hauler', ticks_remaining: 3 },
      });
      expect(pilotless.tag).toBe('PILOTLESS');
      expect(pilotless.headline).toContain("Marlowe's hauler is now pilotless");
      expect(pilotless.details.some((d) => d.includes('Vulnerable for 3 ticks'))).toBe(true);

      const reconnected = formatNotificationPreview({
        msg_type: 'reconnected',
        data: { message: 'Back online', was_pilotless: true, ticks_remaining: 2 },
      });
      expect(reconnected.tag).toBe('RECONNECTED');
      expect(reconnected.headline).toBe('Back online');
      expect(reconnected.details.some((d) => d.includes('recovered with 2 ticks'))).toBe(true);
    });

    test('poi_arrival / poi_departure / queue / version / action_error pure previews', () => {
      expect(
        formatNotificationPreview({
          msg_type: 'poi_arrival',
          data: { clan_tag: 'SOL', username: 'Marlowe', poi_name: 'Earth' },
        }).headline,
      ).toBe('[SOL] Marlowe has arrived at Earth');
      expect(
        formatNotificationPreview({
          msg_type: 'poi_departure',
          data: { clan_tag: 'SOL', username: 'Marlowe', poi_name: 'Earth' },
        }).headline,
      ).toBe('[SOL] Marlowe has departed from Earth');
      expect(
        formatNotificationPreview({
          msg_type: 'queue_cleared',
          data: { reason: 'manual' },
        }).headline,
      ).toBe('Action queue cleared: manual');
      expect(
        formatNotificationPreview({
          msg_type: 'version_info',
          data: { version: '2.0.0' },
        }).headline,
      ).toBe('Server version: 2.0.0');
      expect(
        formatNotificationPreview({
          msg_type: 'action_error',
          data: { command: 'travel', tick: 77, message: 'drive offline' },
        }).headline,
      ).toBe('travel failed (tick 77): drive offline');
    });

    test('inline layout-only: remainder types render via pure preview (no writeLine registry)', () => {
      const output = stripAnsi(
        formatNotification({
          type: 'mining',
          msg_type: 'mining_yield',
          timestamp: '2026-05-18T12:00:00.000Z',
          data: { quantity: 5, resource_id: 'ore_iron', remaining: 42 },
        }).join('\n'),
      );
      expect(output).toContain('[MINED]');
      expect(output).toContain('+5x ore_iron');
      expect(output).toContain('42 remaining at POI');
      expectNoNestedJsonDump(output);
    });

    test('reconnected missing message has safe fallback (no undefined token)', () => {
      const preview = formatNotificationPreview({
        msg_type: 'reconnected',
        data: {},
      });
      expect(preview.tag).toBe('RECONNECTED');
      expect(preview.headline).toBe('Reconnected');
      expectNoDiagnosticTokens(preview.headline);
    });
  });

  describe('observation_update pure preview (v0.554 presence feed)', () => {
    const observationNotification = getNotificationsObservationFixture.notifications[0];
    if (!observationNotification) throw new Error('expected observation notification fixture');

    test('registers the typed handler and exported notification type', () => {
      expect(hasPreviewHandler('observation_update')).toBe(true);
      expect(NOTIFICATION_TYPES).toContain('observation_update');
    });

    test('summarizes all six contact domains in stable order', () => {
      const preview = formatNotificationPreview(observationNotification);

      expect(preview.tag).toBe('OBSERVATION');
      expect(preview.headline).toBe(
        'Observation at sol_cloudbank in sol (tick 901500): 7 changed, 6 departed; unknown signature; active scan',
      );
      expect(preview.details).toEqual([
        'Nearby players — changed 1: Marlowe [player-marlowe]; departed 1: player-ibis',
        'System agents — changed 1: Oriole [player-oriole]; departed 1: player-wren',
        'Pirates — changed 2: Corsair [pirate-corsair-7] (Admiral Kael), Raider [pirate-raider-8] (Captain Voss); departed 1: pirate-raider-6',
        'Empire NPCs — changed 1: Solarian Patrol [npc-patrol-7]; departed 1: npc-freighter-2',
        'Creatures — changed 1: Pilot-Whale Pod [creature-pilot-whale-7]; departed 1: creature-starfish-2',
        'Cloaked contacts — changed 1: Wisp [player-cloaked-1]; departed 1: player-cloaked-old',
      ]);
      expectNoDiagnosticTokens(JSON.stringify(preview));
      expectNoNestedJsonDump(JSON.stringify(preview));
    });

    test('limits each domain to three identities total and reports every count', () => {
      const preview = formatNotificationPreview({
        msg_type: 'observation_update',
        data: {
          poi_id: 'sol_belt',
          system_id: 'sol',
          tick: 42,
          unknown_signature: false,
          pirates_changed: [
            { pirate_id: 'p1', name: 'Corsair', faction_name: 'Crew X' },
            { pirate_id: 'p2', name: 'Raider' },
            { pirate_id: 'p3', name: 'Marauder' },
            { pirate_id: 'p4', name: 'Reaver' },
          ],
          pirates_departed: ['p5'],
        },
      });

      expect(preview.headline).toContain('4 changed, 1 departed');
      expect(preview.details).toEqual([
        'Pirates — changed 4: Corsair [p1] (Crew X), Raider [p2], Marauder [p3]; departed 1; +2 more',
      ]);
      expect(preview.details[0]).not.toContain('Reaver');
      expect(preview.details[0]).not.toContain('p5');
    });

    test('metadata-only flags append to the headline without detail lines', () => {
      const preview = formatNotificationPreview({
        msg_type: 'observation_update',
        data: {
          poi_id: 'sol_earth',
          system_id: 'sol',
          tick: 901501,
          unknown_signature: true,
          active_scan: true,
        },
      });

      expect(preview.headline).toBe(
        'Observation at sol_earth in sol (tick 901501): 0 changed, 0 departed; unknown signature; active scan',
      );
      expect(preview.details).toEqual([]);
    });

    test('ignores malformed array members and never emits diagnostic tokens or nested data', () => {
      const preview = formatNotificationPreview({
        msg_type: 'observation_update',
        data: {
          poi_id: { nested: true },
          system_id: 'undefined',
          tick: Number.NaN,
          unknown_signature: false,
          nearby_changed: [
            null,
            'not-a-record',
            { username: { nested: true }, player_id: Number.NaN },
            { username: 'undefined', ship: { id: 'hidden' } },
          ],
          nearby_departed: [null, { nested: true }, '', 'NaN', 'player-safe'],
          pirates_changed: { nested: true },
        },
      });
      const output = JSON.stringify(preview);

      expect(preview.headline).toBe('Observation at current POI in current system (tick ?): 2 changed, 1 departed');
      expect(preview.details).toEqual([
        'Nearby players — changed 2: nearby player, nearby player; departed 1: player-safe',
      ]);
      expect(output).not.toContain('hidden');
      expectNoDiagnosticTokens(output);
      expectNoNestedJsonDump(output);
    });

    test('inline and notification-table layouts consume the same typed preview', () => {
      const inline = stripAnsi(formatNotification(observationNotification).join('\n'));
      expect(inline).toContain('[OBSERVATION]');
      expect(inline).toContain('Observation at sol_cloudbank in sol (tick 901500): 7 changed, 6 departed');
      expect(inline).toContain('Nearby players — changed 1');
      expect(inline).toContain('Cloaked contacts — changed 1');

      const compactNotification = {
        type: 'observation',
        msg_type: 'observation_update',
        data: {
          poi_id: 'earth',
          system_id: 'sol',
          tick: 7,
          unknown_signature: false,
          nearby_changed: [{ username: 'Ada', player_id: 'p1' }],
        },
      };
      const tableMessage = formatNotificationMessage(compactNotification);
      expect(tableMessage).toBe(
        'Observation at earth in sol (tick 7): 1 changed, 0 departed; Nearby players — changed 1: Ada [p1]',
      );
      expectNoDiagnosticTokens(inline);
      expectNoNestedJsonDump(tableMessage);
    });
  });

  describe('shipment_overdue pure preview (0.549 freight late warning)', () => {
    // Field names assumed from ShippingActiveContract / InspectPackageShipment + shipping prose.
    // No Notification_shipment_overdue schema — multi-branch coverage for partial bags.

    test('registers pure PREVIEW_HANDLER for shipment_overdue', () => {
      expect(hasPreviewHandler('shipment_overdue')).toBe(true);
      expect(NOTIFICATION_TYPES).toContain('shipment_overdue');
    });

    test('full assumed bag: shipment, destination, ticks left, late fee', () => {
      const preview = formatNotificationPreview({
        type: 'shipment_overdue',
        msg_type: 'shipment_overdue',
        data: {
          shipment_id: 'shipment-late-1',
          destination_name: 'Nova Central',
          ticks_to_recovery_deadline: 2400,
          late_fee_if_delivered_now: 400,
        },
      });
      expect(preview.tag).toBe('FREIGHT OVERDUE');
      expect(preview.severity).toBe('warning');
      expect(preview.headline).toBe(
        'Overdue: shipment shipment-late-1, → Nova Central, 2,400 ticks left, late fee 400 cr',
      );
      expect(preview.details).toEqual([]);
    });

    test('ticks-only bag prefers recovery window over deadline delta', () => {
      const preview = formatNotificationPreview({
        msg_type: 'shipment_overdue',
        data: {
          ticks_to_recovery_deadline: 2865,
          ticks_to_deadline: -15,
        },
      });
      expect(preview.tag).toBe('FREIGHT OVERDUE');
      expect(preview.headline).toBe('Overdue: 2,865 ticks left');
      expect(preview.headline).not.toContain('-15');
    });

    test('message-only bag uses server message when no structured scalars', () => {
      const preview = formatNotificationPreview({
        msg_type: 'shipment_overdue',
        data: {
          message: 'Delivery deadline passed; late fee applies until recovery window ends.',
        },
      });
      expect(preview.tag).toBe('FREIGHT OVERDUE');
      expect(preview.headline).toBe('Delivery deadline passed; late fee applies until recovery window ends.');
    });

    test('empty bag last-resort headline (typed, never Policy 5 null fallthrough)', () => {
      const preview = formatNotificationPreview({
        msg_type: 'shipment_overdue',
        data: {},
      });
      expect(preview.tag).toBe('FREIGHT OVERDUE');
      expect(preview.headline).toBe('Freight shipment overdue');
      expectNoDiagnosticTokens(preview.headline);
    });

    test('secondary field aliases still resolve shipment and destination', () => {
      const preview = formatNotificationPreview({
        msg_type: 'shipment_overdue',
        data: {
          contract_id: 'shipment-alias-1',
          destination_base_id: 'nova_central',
          ticks_remaining: 100,
          late_fee: 250,
        },
      });
      expect(preview.headline).toContain('shipment shipment-alias-1');
      expect(preview.headline).toContain('→ nova_central');
      expect(preview.headline).toContain('100 ticks left');
      expect(preview.headline).toContain('late fee 250 cr');
    });

    test('table Message matches pure preview (Type stays raw msg_type)', () => {
      const notification = {
        type: 'shipment_overdue',
        msg_type: 'shipment_overdue',
        data: {
          shipment_id: 'shipment-late-1',
          destination_name: 'Nova Central',
          ticks_to_recovery_deadline: 2400,
          late_fee_if_delivered_now: 400,
        },
      };
      const message = formatNotificationMessage(notification);
      expect(message).toBe(tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 })));
      expect(message).toContain('Overdue:');
      expect(message).toContain('shipment-late-1');
      expectNoNestedJsonDump(message);
    });
  });

  describe('PR4 table Message via shared preview', () => {
    /** Table Message is always the pure preview pipeline (thin wrapper contract). */
    function expectTableMessageFromPreview(notification: Record<string, unknown>) {
      const fromPreview = tableMessageFromPreview(formatNotificationPreview(notification, { maxLineLength: 120 }));
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
        snippets: ['Haven Exchange tick 901337: 1 item update', 'Iron Ore', 'sell 40 @ 12', 'buy 25 @ 9'],
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
        snippets: ['1 job tick 901500', 'Power Cell', 'rental', '300cr escrowed', '2 runs left', 'out Pack (pkg-9)'],
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
        snippets: ['2 travel progress updates summarized', 'jump×2', 'latest jump → grumium', 'arrival tick 1433952'],
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

      const market = rows.find((n) => n.msg_type === 'market_update');
      const commission = rows.find((n) => n.msg_type === 'ship_commission_complete');
      const chat = rows.find((n) => n.msg_type === 'chat_message');
      const system = rows.find((n) => n.msg_type === 'system');
      expect(market).toBeDefined();
      expect(commission).toBeDefined();
      expect(chat).toBeDefined();
      expect(system).toBeDefined();
      if (market === undefined || commission === undefined || chat === undefined || system === undefined) {
        throw new Error('expected market/commission/chat/system rows in get_notifications fixture');
      }

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

      // Chat pure PREVIEW_HANDLER — non-regressable sender:content form (K11 / K12).
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

    test('inline pure registry uses preview headline for market_update', () => {
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
