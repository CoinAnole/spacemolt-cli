import type { HighValueFixtureEntry } from './formatter-fixtures.ts';

const channels = [
  {
    channel: 'exchange_fills',
    description: 'One frame each time one of your resting exchange orders fills. Starts muted.',
    message_types: ['exchange_fill'],
    muted: true,
  },
  {
    channel: 'support',
    description: 'Ally refuel and repair.',
    message_types: ['refueled_by', 'repaired_by'],
    muted: false,
  },
];

export const getNotificationSettingsFixture = {
  action: 'get_notification_settings',
  muted: ['exchange_fills'],
  channels,
  message: '',
};

export const muteNotificationsFixture = {
  action: 'mute_notifications',
  muted: ['exchange_fills'],
  channels,
  message: '',
};

export const unmuteNotificationsFixture = {
  action: 'unmute_notifications',
  muted: [] as string[],
  channels,
  message: '',
};

export const notificationSettingsHighValueFixtures: Record<string, HighValueFixtureEntry> = {
  get_notification_settings: {
    command: 'get_notification_settings',
    fixture: getNotificationSettingsFixture,
  },
  mute_notifications: {
    command: 'mute_notifications',
    fixture: muteNotificationsFixture,
  },
  unmute_notifications: {
    command: 'unmute_notifications',
    fixture: unmuteNotificationsFixture,
  },
};
