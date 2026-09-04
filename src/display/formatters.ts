import { arenaFormatters } from './arena.ts';
import { empireFormatters } from './empire.ts';
import { genericFormatters } from './generic.ts';
import type { ResultFormatter } from './helpers.ts';
import { inspectFormatters } from './inspect.ts';
import { marketFormatters } from './market.ts';
import { notificationFormatters } from './notifications.ts';
import { passengerFormatters } from './passenger.ts';
import { prizeFormatters } from './prizes.ts';
import { shipFormatters } from './ship.ts';
import { shippingFormatters } from './shipping.ts';
import { socialFormatters } from './social.ts';
import { statusFormatters } from './status.ts';

export * from './helpers.ts';

export const resultFormatters: ResultFormatter[] = [
  ...statusFormatters,
  ...marketFormatters,
  ...notificationFormatters,
  ...passengerFormatters,
  ...shipFormatters,
  ...prizeFormatters,
  ...inspectFormatters,
  ...socialFormatters,
  ...empireFormatters,
  ...shippingFormatters,
  ...arenaFormatters,
  ...genericFormatters,
];
