import { describe, expect, test } from 'bun:test';
import { displayNotifications, formatNotification, NOTIFICATION_TYPES } from './notifications';

function stripAnsi(value: string): string {
  return value.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '');
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
      snippets: ['[TRADE]', 'Offer from Dockmaster', 'Offering: 250 credits', 'trade_accept trade_id=trade_123'],
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
      snippets: ['[ODDITY]', 'code: "strange"', 'count: 2'],
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
      snippets: ['[FACTION]', 'Wardens', 'join_faction faction_id=fac_1'],
    },
    {
      msgType: 'faction_peace_proposed',
      data: { proposer_name: 'Wardens', terms: 'truce', faction_id: 'fac_1' },
      snippets: ['[PEACE]', 'Wardens', 'Terms: truce'],
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
      snippets: ['[TRADE]', 'Offer from Dockmaster', 'Offering: 5 credits'],
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
});
