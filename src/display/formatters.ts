import { genericFormatters } from './generic.ts';
import type { ResultFormatter } from './helpers.ts';
import { marketFormatters } from './market.ts';
import { notificationFormatters } from './notifications.ts';
import { shipFormatters } from './ship.ts';
import { socialFormatters } from './social.ts';
import { statusFormatters } from './status.ts';

export * from './helpers.ts';

export const resultFormatters: ResultFormatter[] = [
  ...statusFormatters,
  ...marketFormatters,
  ...notificationFormatters,
  ...shipFormatters,
  ...socialFormatters,
  ...genericFormatters,
];
