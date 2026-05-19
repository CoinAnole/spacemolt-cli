import { describe, expect, test } from 'bun:test';
import { displayNotifications } from './notifications';
import type { APIResponse } from './types';

function renderNotification(notification: NonNullable<APIResponse['notifications']>[number]): string {
  const lines: string[] = [];
  displayNotifications([notification], {
    out(message = '') {
      lines.push(message);
    },
    err() {},
  });
  return stripAnsi(lines.join('\n'));
}

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
    const output = renderNotification(notification);
    for (const snippet of snippets) {
      expect(output).toContain(snippet);
    }
  });
});
