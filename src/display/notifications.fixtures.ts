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
 * Mixed notification poll sample: system + chat + market update.
 * Notification items include required schema fields (id, type, msg_type, timestamp, data).
 */
export const getNotificationsFixture = {
  count: 3,
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
  ],
  remaining: 0,
  timestamp: 1779562982,
};

export const notificationsHighValueFixtures: Record<string, HighValueFixtureEntry> = {
  get_notifications: {
    command: 'get_notifications',
    fixture: getNotificationsFixture,
  },
  // Covers the GET /notifications alias command + empty poll path (shared formatter).
  notifications: {
    command: 'notifications',
    fixture: emptyNotificationsFixture,
    // GET route only documents V2Response; compare against the shared poll body schema.
    apiRoute: 'POST /api/v2/spacemolt/get_notifications',
  },
};
