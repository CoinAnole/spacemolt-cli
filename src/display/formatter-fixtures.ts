import { genericFixtureCases, genericHighValueFixtures } from './generic.fixtures.ts';
import { inspectHighValueFixtures } from './inspect.fixtures.ts';
import { marketFixtureCases, marketHighValueFixtures } from './market.fixtures.ts';
import { notificationsHighValueFixtures } from './notifications.fixtures.ts';
import { passengerHighValueFixtures } from './passenger.fixtures.ts';
import { shipFixtureCases, shipHighValueFixtures } from './ship.fixtures.ts';
import { shippingHighValueFixtures } from './shipping.fixtures.ts';
import { socialFixtureCases, socialHighValueFixtures } from './social.fixtures.ts';
import { statusFixtureCases, statusHighValueFixtures } from './status.fixtures.ts';

export * from './generic.fixtures.ts';
export * from './inspect.fixtures.ts';
export * from './market.fixtures.ts';
export * from './notifications.fixtures.ts';
export * from './passenger.fixtures.ts';
export * from './ship.fixtures.ts';
export * from './shipping.fixtures.ts';
export * from './social.fixtures.ts';
export * from './status.fixtures.ts';

/**
 * Optional metadata for high-value fixtures used by the schema divergence reporter.
 * apiRoute overrides the command's default route when a fixture covers a runtime
 * action route rather than the curated command's fallback route.
 * schemaTarget controls whether the reporter compares the fixture against the inner
 * action `details.*Response` (e.g. RefuelResponse) or the top-level structuredContent.
 */
export interface HighValueFixtureEntry {
  command: string;
  fixture: Record<string, unknown>;
  /** Response route used by the fixture-schema reporter (undefined = command default route). */
  apiRoute?: string;
  /** Force comparison target for the fixture-schema reporter (undefined = use heuristic). */
  schemaTarget?: 'details' | 'structuredContent';
}

export const formatterFixtureCases = {
  ...statusFixtureCases,
  ...marketFixtureCases,
  ...shipFixtureCases,
  ...socialFixtureCases,
  ...genericFixtureCases,
};

export const highValueCommandFixtures: Record<string, HighValueFixtureEntry> = {
  ...statusHighValueFixtures,
  ...marketHighValueFixtures,
  ...passengerHighValueFixtures,
  ...shipHighValueFixtures,
  ...socialHighValueFixtures,
  ...notificationsHighValueFixtures,
  ...shippingHighValueFixtures,
  ...genericHighValueFixtures,
  ...inspectHighValueFixtures,
};
