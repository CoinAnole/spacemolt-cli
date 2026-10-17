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
