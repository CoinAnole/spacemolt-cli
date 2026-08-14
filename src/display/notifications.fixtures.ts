import type { HighValueFixtureEntry } from './formatter-fixtures.ts';

/** Empty GetNotificationsResponse (schema-shaped; array not null). */
export const emptyNotificationsFixture = {
  count: 0,
  current_tick: 900683,
  notifications: [] as Array<Record<string, unknown>>,
  remaining: 0,
  timestamp: 1779562779,
};

/**
 * Mixed notification poll sample: system + chat + market update + ship commission receipt.
 * Notification items include required schema fields (id, type, msg_type, timestamp, data).
 */
export const getNotificationsFixture = {
  count: 4,
  current_tick: 901337,
  notifications: [
    {
      id: 'notif-system-1',
      type: 'system',
      msg_type: 'system',
      data: { message: 'Server maintenance scheduled.' },
      timestamp: '2026-05-23T18:59:39.049Z',
    },
    {
      id: 'notif-chat-1',
      type: 'chat',
      msg_type: 'chat_message',
      data: { channel: 'local', sender: 'Ibis', content: 'Clear skies over Sol today.' },
      timestamp: '2026-05-23T19:01:02.000Z',
    },
    {
      id: 'notif-market-1',
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
    {
      id: 'notif-ship-1',
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
      timestamp: '2026-07-17T20:00:00.000Z',
    },
  ],
  remaining: 0,
  timestamp: 1779562982,
};

/** One schema-complete mixed observation_update poll response (v0.554 contact domains). */
export const getNotificationsObservationFixture = {
  count: 1,
  current_tick: 901500,
  notifications: [
    {
      id: 'notif-observation-1',
      type: 'observation',
      msg_type: 'observation_update',
      data: {
        active_scan: true,
        cloaked_lost: ['player-cloaked-old'],
        cloaked_resolved: [
          {
            target_id: 'player-cloaked-1',
            revealed_info: ['username', 'ship_class', 'hull', 'shield', 'cloaked'],
            cloaked: true,
            faction_id: 'smc',
            hull: 72,
            shield: 18,
            ship_class: 'scout',
            ship_name: 'Quiet Current',
            username: 'Wisp',
          },
        ],
        creatures_changed: [
          {
            creature_id: 'creature-pilot-whale-7',
            species: 'pilot_whale',
            name: 'Pilot-Whale Pod',
            role: 'grazer',
            hull: 76,
            max_hull: 120,
            in_combat: true,
            brand_faction: 'smc',
            brand_ranch: 'cloudbank-ranch',
            branded: true,
          },
        ],
        creatures_departed: ['creature-starfish-2'],
        empire_npcs_changed: [
          {
            npc_id: 'npc-patrol-7',
            name: 'Solarian Patrol',
            role: 'patrol',
            empire: 'solarian',
            in_combat: true,
            fleet_name: 'Seventh Watch',
            ship_class: 'interceptor',
            ship_name: 'Vigilant',
          },
        ],
        empire_npcs_departed: ['npc-freighter-2'],
        nearby_changed: [
          {
            clan_tag: 'SMC',
            docked: false,
            faction_id: 'smc',
            faction_tag: 'SMC',
            in_combat: false,
            offline: false,
            player_id: 'player-marlowe',
            primary_color: '#335577',
            secondary_color: '#88aacc',
            ship_class: 'prospector',
            ship_name: 'Long Survey',
            status_message: 'mapping Cloudbank',
            username: 'Marlowe',
          },
        ],
        nearby_departed: ['player-ibis'],
        pirates_changed: [
          {
            pirate_id: 'pirate-corsair-7',
            name: 'Corsair',
            tier: 'skiff',
            is_boss: false,
            status: 'hostile',
            faction: 'pirate_kael',
            faction_name: 'Admiral Kael',
            hull: 32,
            max_hull: 50,
            shield: 0,
            max_shield: 20,
          },
          {
            pirate_id: 'pirate-raider-8',
            name: 'Raider',
            tier: 'cutter',
            is_boss: false,
            status: 'damaged',
            faction: 'pirate_voss',
            faction_name: 'Captain Voss',
            hull: 12,
            max_hull: 60,
            shield: 0,
            max_shield: 15,
          },
        ],
        pirates_departed: ['pirate-raider-6'],
        poi_id: 'sol_cloudbank',
        system_changed: [
          {
            clan_tag: 'FREE',
            docked: true,
            faction_id: 'free-captains',
            faction_tag: 'FREE',
            in_combat: false,
            offline: false,
            player_id: 'player-oriole',
            primary_color: '#775533',
            secondary_color: '#ccaa88',
            ship_class: 'hauler',
            ship_name: 'Outbound',
            status_message: 'departing soon',
            username: 'Oriole',
          },
        ],
        system_departed: ['player-wren'],
        system_id: 'sol',
        tick: 901500,
        unknown_signature: true,
      },
      timestamp: '2026-05-23T19:05:02.000Z',
    },
  ],
  remaining: 0,
  timestamp: 1779563102,
};

export const notificationsHighValueFixtures: Record<string, HighValueFixtureEntry> = {
  get_notifications: {
    command: 'get_notifications',
    fixture: getNotificationsFixture,
  },
  get_notifications_observation: {
    command: 'get_notifications',
    fixture: getNotificationsObservationFixture,
  },
  // Covers the GET /notifications alias command + empty poll path (shared formatter).
  notifications: {
    command: 'notifications',
    fixture: emptyNotificationsFixture,
    // GET route only documents V2Response; compare against the shared poll body schema.
    apiRoute: 'POST /api/v2/spacemolt/get_notifications',
  },
};
