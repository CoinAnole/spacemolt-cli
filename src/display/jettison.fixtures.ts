import type { HighValueFixtureEntry } from './formatter-fixtures.ts';

/** OpenAPI JettisonResponse example: 5 purified_water forms 3 water_ice. */
export const jettisonFreezeFixture = {
  details: {
    action: 'jettison',
    item_id: 'purified_water',
    item_name: 'Purified Water',
    quantity: 5,
    container_id: 'jettison_container',
    message: 'Jettisoned 5 Purified Water; formed 3 water_ice for recovery. Unrecoverable material dissipated.',
    conversion: {
      output_item_id: 'water_ice',
      output_quantity: 3,
    },
  },
};

/** Bulk rows use the same conversion object. A short batch reports output_quantity 0. */
export const storageJettisonPartialFixture = {
  details: {
    action: 'bulk_jettison',
    container_id: 'jettison_container',
    requested: 2,
    succeeded: 2,
    failed: 0,
    message: 'Jettisoned 2 cargo types.',
    results: [
      {
        item_id: 'purified_water',
        item_name: 'Purified Water',
        quantity: 5,
        success: true,
        conversion: {
          output_item_id: 'water_ice',
          output_quantity: 3,
        },
      },
      {
        item_id: 'coolant_fluid',
        item_name: 'Coolant Fluid',
        quantity: 2,
        success: true,
        message: 'Incomplete batch dissipated.',
        conversion: {
          output_item_id: 'water_ice',
          output_quantity: 0,
        },
      },
    ],
  },
};

export const jettisonHighValueFixtures: Record<string, HighValueFixtureEntry> = {
  jettison: {
    command: 'jettison',
    fixture: jettisonFreezeFixture,
    schemaTarget: 'details',
  },
  storage_jettison: {
    command: 'storage jettison',
    fixture: storageJettisonPartialFixture,
    apiRoute: 'POST /api/v2/spacemolt_storage/jettison',
    schemaTarget: 'details',
  },
};
