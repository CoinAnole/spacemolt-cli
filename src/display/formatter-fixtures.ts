import { genericFixtureCases, genericHighValueFixtures } from './generic.fixtures.ts';
import { marketFixtureCases, marketHighValueFixtures } from './market.fixtures.ts';
import { passengerHighValueFixtures } from './passenger.fixtures.ts';
import { shipFixtureCases, shipHighValueFixtures } from './ship.fixtures.ts';
import { socialFixtureCases, socialHighValueFixtures } from './social.fixtures.ts';
import { statusFixtureCases, statusHighValueFixtures } from './status.fixtures.ts';

export * from './generic.fixtures.ts';
export * from './market.fixtures.ts';
export * from './passenger.fixtures.ts';
export * from './ship.fixtures.ts';
export * from './social.fixtures.ts';
export * from './status.fixtures.ts';

export const formatterFixtureCases = {
  ...statusFixtureCases,
  ...marketFixtureCases,
  ...shipFixtureCases,
  ...socialFixtureCases,
  ...genericFixtureCases,
};

export const highValueCommandFixtures = {
  ...statusHighValueFixtures,
  ...marketHighValueFixtures,
  ...passengerHighValueFixtures,
  ...shipHighValueFixtures,
  ...socialHighValueFixtures,
  ...genericHighValueFixtures,
};
