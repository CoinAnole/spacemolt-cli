import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { renderStructuredResult } from './index.ts';
import {
  getNotificationSettingsFixture,
  muteNotificationsFixture,
  unmuteNotificationsFixture,
} from './notification-settings.fixtures.ts';

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
      return new Date('2026-05-29T00:00:00.000Z');
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

const catalogFixtures = [
  ['get_notification_settings', getNotificationSettingsFixture, 'Muted: exchange_fills'],
  ['mute_notifications', muteNotificationsFixture, 'Muted: exchange_fills'],
  ['unmute_notifications', unmuteNotificationsFixture, 'Muted: none'],
] as const;

function stdoutOf(command: string, fixture: Record<string, unknown>, extra: Partial<GlobalOptions> = {}): string {
  const rendered = renderStructuredResult(command, structuredClone(fixture), { ...options, ...extra }, context);
  expect(rendered.success).toBe(true);
  expect(rendered.stderr).toEqual([]);
  return rendered.stdout.join('\n');
}

function declined(stdout: string): boolean {
  return stdout.includes('=== Response ===') || stdout.includes('item(s)');
}

test.each(catalogFixtures)('%s prints channel rows', (command, fixture, summary) => {
  const stdout = stdoutOf(command, fixture);
  const lines = stdout.split('\n').filter((line) => line.length > 0);

  expect(stdout).toContain('=== Notification Settings ===');
  expect(stdout).toContain('Channel');
  expect(stdout).toContain('Muted');
  expect(stdout).toContain('Message types');
  expect(stdout).toContain('Description');
  expect(stdout).toContain('exchange_fills');
  expect(stdout).toContain('yes');
  expect(stdout).toMatch(/\bno\b/);
  expect(stdout).toContain('exchange_fill');
  expect(stdout).toContain('support');
  expect(stdout).toContain('refueled_by, repaired_by');
  expect(stdout).toContain('One frame each time one of your resting exchange orders fills. Starts muted.');
  expect(stdout).toContain('Ally refuel and repair.');
  expect(stdout).toContain(summary);
  expect(stdout).not.toContain('item(s)');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('Action:');
  expect(stdout).not.toContain(String(fixture.action));
  expect(lines.at(-1)).toContain('Ally refuel and repair.');
  if (summary === 'Muted: none') expect(stdout).not.toContain('Muted: exchange_fills');
  else expect(stdout).not.toContain('Muted: none');
});

test.each(catalogFixtures)('%s text format matches table format', (command, fixture) => {
  expect(stdoutOf(command, fixture, { format: 'text' })).toBe(stdoutOf(command, fixture, { format: 'table' }));
});

test.each(catalogFixtures)('%s json stays the server object', (command, fixture) => {
  const stdout = stdoutOf(command, fixture, { format: 'json' });
  expect(JSON.parse(stdout)).toEqual(fixture);
  expect(stdout).toContain('exchange_fills');
  expect(stdout).not.toContain('=== Notification Settings ===');
});

test('empty channels prints (None) without a column header', () => {
  const stdout = stdoutOf('get_notification_settings', {
    action: 'get_notification_settings',
    muted: [],
    channels: [],
    message: '',
  });

  expect(stdout).toContain('Muted: none');
  expect(stdout).toContain('(None)');
  expect(stdout).toContain('=== Notification Settings ===');
  expect(stdout).not.toContain('Channel');
  expect(stdout).not.toContain('Message types');
  expect(stdout).not.toContain('item(s)');
  expect(stdout).not.toContain('=== Response ===');
});

test('muted summary prints none or server-order names and omits empty or non-array values', () => {
  const base = {
    action: 'get_notification_settings',
    channels: [] as unknown[],
    message: '',
  };

  expect(stdoutOf('get_notification_settings', { ...base, muted: [] })).toContain('Muted: none');

  const names = stdoutOf('get_notification_settings', {
    ...base,
    muted: [' exchange_fills ', '', 'support', 1],
  });
  expect(names).toContain('Muted: exchange_fills, support');
  expect(names).not.toContain('Muted: support, exchange_fills');

  const blanks = stdoutOf('get_notification_settings', { ...base, muted: ['', '   '] });
  expect(blanks).not.toContain('Muted:');
  expect(blanks).toContain('(None)');

  const nonStrings = stdoutOf('get_notification_settings', { ...base, muted: [1, false] });
  expect(nonStrings).not.toContain('Muted:');

  const omitted = stdoutOf('get_notification_settings', { ...base, muted: 'exchange_fills' });
  expect(omitted).not.toContain('Muted:');
  expect(omitted).toContain('(None)');
});

test('channel rows stay in server order', () => {
  const stdout = stdoutOf('unmute_notifications', {
    action: 'unmute_notifications',
    muted: [],
    channels: [...unmuteNotificationsFixture.channels].reverse(),
    message: '',
  });

  expect(stdout.indexOf('support')).toBeLessThan(stdout.indexOf('exchange_fills'));
  expect(stdout).toContain('Muted: none');
  expect(stdout).toMatch(/\byes\b/);
});

test('blank optional cells still print all four columns', () => {
  const stdout = stdoutOf('mute_notifications', {
    action: 'mute_notifications',
    muted: [],
    channels: [
      {
        channel: 12,
        description: '  Ally refuel and repair.  ',
        message_types: [' refueled_by ', '', 2, 'repaired_by'],
        muted: 'yes',
      },
      {
        channel: 'exchange_fills',
        description: 4,
        message_types: 'exchange_fill',
        muted: false,
      },
    ],
    message: '   ',
  });
  const lines = stdout.split('\n').filter((line) => line.length > 0);

  expect(stdout).toContain('Channel');
  expect(stdout).toContain('Muted');
  expect(stdout).toContain('Message types');
  expect(stdout).toContain('Description');
  const fillsLine = lines.find((line) => line.includes('exchange_fills'));

  expect(stdout).toContain('refueled_by, repaired_by');
  expect(stdout).toContain('Ally refuel and repair.');
  expect(stdout).not.toContain('  Ally');
  expect(stdout).toMatch(/\bno\b/);
  expect(stdout).not.toContain('yes');
  expect(stdout).not.toContain('12');
  expect(stdout).not.toMatch(/\bexchange_fill\b/);
  expect(fillsLine).not.toContain('4');
  expect(stdout).not.toContain('(None)');
  expect(lines.at(-1)).toContain('exchange_fills');
});

test('a trimmed message prints after the table', () => {
  const stdout = stdoutOf('get_notification_settings', {
    ...getNotificationSettingsFixture,
    message: '  Notification settings.  ',
  });
  const lines = stdout.split('\n').filter((line) => line.length > 0);

  expect(lines.at(-1)).toBe('Notification settings.');
  expect(stdout.indexOf('Ally refuel and repair.')).toBeLessThan(stdout.indexOf('Notification settings.'));
});

test('a numeric message does not print after the notification-settings table', () => {
  const stdout = stdoutOf('get_notification_settings', {
    ...getNotificationSettingsFixture,
    message: 404,
  });
  const lines = stdout.split('\n').filter((line) => line.length > 0);

  expect(stdout).not.toContain('404');
  expect(lines.at(-1)).toContain('Ally refuel and repair.');
});

test('a non-record channel declines without a partial table', () => {
  const cases: unknown[] = [
    [{ channel: 'support', description: 'Ally', message_types: ['refueled_by'], muted: false }, 'nope'],
    [{ channel: 'support' }, null],
    { channel: 'support' },
    undefined,
  ];

  for (const channels of cases) {
    const stdout = stdoutOf('mute_notifications', {
      action: 'mute_notifications',
      muted: ['exchange_fills'],
      channels,
      message: '',
    });
    expect(declined(stdout)).toBe(true);
    expect(stdout).not.toContain('=== Notification Settings ===');
    expect(stdout).not.toContain('Message types');
  }
});

test('prints one remaining notification in the singular', () => {
  const stdout = stdoutOf('get_notifications', {
    count: 1,
    notifications: [
      {
        id: 'notif-1',
        type: 'system',
        msg_type: 'system',
        timestamp: '2026-05-23T18:59:39.049Z',
        data: { message: 'Server maintenance scheduled.' },
      },
    ],
    remaining: 1,
  });

  expect(stdout).toContain('1 more notification remaining.');
  expect(stdout).not.toContain('1 more notifications remaining.');
});

test('prints the plural remaining line when remaining is 2', () => {
  const stdout = stdoutOf('get_notifications', {
    count: 1,
    notifications: [
      {
        id: 'notif-1',
        type: 'system',
        msg_type: 'system',
        timestamp: '2026-05-23T18:59:39.049Z',
        data: { message: 'Server maintenance scheduled.' },
      },
    ],
    remaining: 2,
  });

  expect(stdout).toContain('2 more notifications remaining.');
});

test('omits the remaining line when remaining is a string', () => {
  const stdout = stdoutOf('get_notifications', {
    count: 1,
    notifications: [
      {
        id: 'notif-1',
        type: 'system',
        msg_type: 'system',
        timestamp: '2026-05-23T18:59:39.049Z',
        data: { message: 'Server maintenance scheduled.' },
      },
    ],
    remaining: '2',
  });

  expect(stdout).toContain('count 1');
  expect(stdout).not.toContain('more notification');
});

test('a numeric unix-second notification timestamp prints the UTC second preview', () => {
  const timestamp = 1779562779;
  const stdout = stdoutOf('get_notifications', {
    count: 1,
    notifications: [
      {
        id: 'notif-1',
        type: 'system',
        msg_type: 'system',
        timestamp,
        data: { message: 'Server maintenance scheduled.' },
      },
    ],
  });

  expect(stdout).toContain('2026-05-23 18:59:39');
  expect(stdout).not.toContain(String(timestamp));
});

test('prints the epoch preview when a notification timestamp is 0', () => {
  const stdout = stdoutOf('get_notifications', {
    count: 1,
    notifications: [
      {
        id: 'notif-1',
        type: 'system',
        msg_type: 'system',
        timestamp: 0,
        data: { message: 'Server maintenance scheduled.' },
      },
    ],
  });

  const dataRow = stdout.split('\n').find((line) => line.includes('|') && !line.includes('Timestamp'));
  const timestampCell = dataRow?.split('|').map((cell) => cell.trim())[0];
  expect(timestampCell).toBe('1970-01-01 00:00:00');
});

test('prints a created_at preview when the notification timestamp is omitted', () => {
  const createdAt = '2026-05-23T18:59:39.049Z';
  const stdout = stdoutOf('get_notifications', {
    count: 1,
    notifications: [
      {
        id: 'notif-1',
        type: 'system',
        msg_type: 'system',
        created_at: createdAt,
        data: { message: 'Server maintenance scheduled.' },
      },
    ],
  });

  expect(stdout).toContain('2026-05-23 18:59:39');
  expect(stdout).not.toContain('2026-05-23T18:59:39');
});

test('leaves the raw created_at string in the Timestamp cell when timestamp is empty', () => {
  const createdAt = '2026-05-23T18:59:39.049Z';
  const stdout = stdoutOf('get_notifications', {
    count: 1,
    notifications: [
      {
        id: 'notif-1',
        type: 'system',
        msg_type: 'system',
        timestamp: '',
        created_at: createdAt,
        data: { message: 'Server maintenance scheduled.' },
      },
    ],
  });

  const dataRow = stdout.split('\n').find((line) => line.includes('|') && !line.includes('Timestamp'));
  const timestampCell = dataRow?.split('|').map((cell) => cell.trim())[0];
  expect(timestampCell).toBe(createdAt);
});

test('prints the response timestamp when a notification omits timestamp and created_at', () => {
  const timestamp = 1779562779;
  const stdout = stdoutOf('get_notifications', {
    count: 1,
    timestamp,
    notifications: [
      {
        id: 'notif-1',
        type: 'system',
        msg_type: 'system',
        data: { message: 'Server maintenance scheduled.' },
      },
    ],
  });

  const dataRow = stdout.split('\n').find((line) => line.includes('|') && !line.includes('Timestamp'));
  const timestampCell = dataRow?.split('|').map((cell) => cell.trim())[0];
  expect(timestampCell).toBe('2026-05-23 18:59:39');
  expect(stdout).not.toContain('1779562779');
});

test('a numeric unix-millisecond notification timestamp prints the UTC second preview', () => {
  const timestamp = 1779562779000;
  const stdout = stdoutOf('get_notifications', {
    count: 1,
    notifications: [
      {
        id: 'notif-1',
        type: 'system',
        msg_type: 'system',
        timestamp,
        data: { message: 'Server maintenance scheduled.' },
      },
    ],
  });

  expect(stdout).toContain('2026-05-23 18:59:39');
  expect(stdout).not.toContain(String(timestamp));
});

test('prints NaN in the Timestamp cell when the notification timestamp is not finite', () => {
  const stdout = stdoutOf('get_notifications', {
    count: 1,
    notifications: [
      {
        id: 'notif-1',
        type: 'system',
        msg_type: 'system',
        timestamp: Number.NaN,
        data: { message: 'Server maintenance scheduled.' },
      },
    ],
  });

  const dataRow = stdout.split('\n').find((line) => line.includes('|') && !line.includes('Timestamp'));
  const timestampCell = dataRow?.split('|').map((cell) => cell.trim())[0];
  expect(timestampCell).toBe('NaN');
});

test('prints notification in the Type cell when msg_type, type, and data.type are blank', () => {
  const stdout = stdoutOf('get_notifications', {
    count: 1,
    notifications: [
      {
        id: 'notif-1',
        msg_type: '',
        type: '',
        timestamp: '2026-05-23T18:59:39.049Z',
        data: { type: '', message: 'Server maintenance scheduled.' },
      },
    ],
  });

  const dataRow = stdout.split('\n').find((line) => line.includes('|') && !line.includes('Type'));
  const typeCell = dataRow?.split('|').map((cell) => cell.trim())[1];
  expect(typeCell).toBe('notification');
});

test('prints notification in the Type cell when msg_type is empty and type is chat_message', () => {
  const stdout = stdoutOf('get_notifications', {
    count: 1,
    notifications: [
      {
        id: 'notif-1',
        msg_type: '',
        type: 'chat_message',
        timestamp: '2026-05-23T18:59:39.049Z',
        data: { message: 'Server maintenance scheduled.' },
      },
    ],
  });

  const dataRow = stdout.split('\n').find((line) => line.includes('|') && !line.includes('Type'));
  const typeCell = dataRow?.split('|').map((cell) => cell.trim())[1];
  expect(typeCell).toBe('notification');
  expect(stdout).not.toContain('chat_message');
});

test('prints chat_message in the Type cell when msg_type is null and type is chat_message', () => {
  const stdout = stdoutOf('get_notifications', {
    count: 1,
    notifications: [
      {
        id: 'notif-1',
        msg_type: null,
        type: 'chat_message',
        timestamp: '2026-05-23T18:59:39.049Z',
        data: { message: 'Server maintenance scheduled.' },
      },
    ],
  });

  const dataRow = stdout.split('\n').find((line) => line.includes('|') && !line.includes('Type'));
  const typeCell = dataRow?.split('|').map((cell) => cell.trim())[1];
  expect(typeCell).toBe('chat_message');
  expect(typeCell).not.toBe('notification');
});

test('prints an explicit zero msg_type as 0', () => {
  const stdout = stdoutOf('get_notifications', {
    count: 1,
    notifications: [
      {
        id: 'notif-1',
        msg_type: 0,
        timestamp: '2026-05-23T18:59:39.049Z',
        data: { message: 'Server maintenance scheduled.' },
      },
    ],
  });

  const dataRow = stdout.split('\n').find((line) => line.includes('|') && !line.includes('Type'));
  const typeCell = dataRow?.split('|').map((cell) => cell.trim())[1];
  expect(typeCell).toBe('0');
  expect(typeCell).not.toBe('notification');
});

test('prints data.type in the Type cell when msg_type and type are omitted', () => {
  const stdout = stdoutOf('get_notifications', {
    count: 1,
    notifications: [
      {
        id: 'notif-1',
        timestamp: '2026-05-23T18:59:39.049Z',
        data: { type: 'gameplay_tip', message: 'Server maintenance scheduled.' },
      },
    ],
  });

  const dataRow = stdout.split('\n').find((line) => line.includes('|') && !line.includes('Type'));
  const typeCell = dataRow?.split('|').map((cell) => cell.trim())[1];
  expect(typeCell).toBe('gameplay_tip');
});

test('prints count 0 and not count 1 when one notification is present', () => {
  const stdout = stdoutOf('get_notifications', {
    count: 0,
    notifications: [
      {
        id: 'notif-1',
        type: 'system',
        msg_type: 'system',
        timestamp: '2026-05-23T18:59:39.049Z',
        data: { message: 'Server maintenance scheduled.' },
      },
    ],
  });

  expect(stdout).toContain('count 0');
  expect(stdout).not.toContain('count 1');
});

test('prints a non-ISO notification timestamp string unchanged in the Timestamp cell', () => {
  const timestamp = 'not-a-date';
  const stdout = stdoutOf('get_notifications', {
    count: 1,
    notifications: [
      {
        id: 'notif-1',
        type: 'system',
        msg_type: 'system',
        timestamp,
        data: { message: 'Server maintenance scheduled.' },
      },
    ],
  });

  const dataRow = stdout.split('\n').find((line) => line.includes('|') && !line.includes('Timestamp'));
  const timestampCell = dataRow?.split('|').map((cell) => cell.trim())[0];
  expect(timestampCell).toBe(timestamp);
});

test('ignores a string count and prints the notification array length', () => {
  const stdout = stdoutOf('get_notifications', {
    count: '9',
    notifications: [
      {
        id: 'notif-1',
        type: 'system',
        msg_type: 'system',
        timestamp: '2026-05-23T18:59:39.049Z',
        data: { message: 'Server maintenance scheduled.' },
      },
    ],
  });

  expect(stdout).toContain('count 1');
  expect(stdout).not.toContain('count 9');
});
