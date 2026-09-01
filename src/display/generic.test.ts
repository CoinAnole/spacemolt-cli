import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import {
  catalogItemsModulesFixture,
  catalogShipsFixture,
  storageDepositAutoDockedFixture,
  storageDepositBulkStationGiftFixture,
  storageDepositStationGiftFixture,
  storageWithdrawAutoDockedFixture,
} from './generic.fixtures.ts';
import { renderStructuredResult } from './index.ts';

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
      return new Date('2026-06-19T00:00:00.000Z');
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

test('renders faction espionage narrative results', () => {
  const rendered = renderStructuredResult(
    'faction_espionage',
    {
      action: 'espionage',
      outcome: 'intel',
      intel_type: 'facility_build',
      story: 'Your spy slips through a service hatch and overhears plans for a new smelter.',
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('=== Espionage ===');
  expect(stdout).toContain('Outcome: intel');
  expect(stdout).toContain('Intel type: facility_build');
  expect(stdout).toContain('Your spy slips through a service hatch');
});

test('renders facility dismantle with materials table and cargo_container hint', () => {
  const rendered = renderStructuredResult(
    'facility_dismantle',
    {
      action: 'dismantle',
      facility_id: 'fac-1',
      facility_type: 'ore_refinery',
      facility_name: 'Frontier Smelter',
      base_id: 'earth_station',
      package_count: 2,
      materials_to_package: [
        { item_id: 'steel_plate', quantity: 40 },
        { item_id: 'circuit_board', quantity: 10 },
      ],
      ticks_to_complete: 12,
      complete_tick: 901200,
      hint: 'Need 2 cargo_container in storage before packaging finishes.',
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('=== Dismantle ===');
  expect(stdout).toContain('Facility: Frontier Smelter');
  expect(stdout).toContain('Packages to produce: 2');
  expect(stdout).toContain('Materials to package');
  expect(stdout).toContain('steel_plate');
  expect(stdout).toContain('circuit_board');
  expect(stdout).toContain('Need 2 cargo_container');
  expect(stdout).not.toContain('2 item(s)');
});

test('renders dismantle_outpost kit refund and details-only auto-undocked field line', () => {
  // Nest under details so envelope-level auto_undocked banner is not emitted;
  // the formatter still surfaces details.auto_undocked as a field line.
  const rendered = renderStructuredResult(
    'dismantle_outpost',
    {
      details: {
        base_id: 'outpost_forward_cache',
        name: 'Forward Cache',
        kit_item: 'outpost_kit',
        kit_refunded: true,
        fee_refunded: 0,
        hint: 'You are adrift at the former outpost point of interest.',
        auto_undocked: true,
      },
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('=== Outpost Dismantled ===');
  expect(stdout).toContain('Outpost: Forward Cache');
  expect(stdout).toContain('Base ID: outpost_forward_cache');
  expect(stdout).toContain('Kit returned: outpost_kit');
  expect(stdout).toContain('Kit refunded: yes');
  expect(stdout).toContain('Fee refunded: 0cr');
  expect(stdout).toContain('Auto-undocked: yes');
  expect(stdout).toContain('You are adrift at the former outpost point of interest.');
  expect(stdout).not.toContain('=== Response ===');
  // Formatter must not re-emit the cyan envelope banner from details-only flag
  expect(stdout).not.toContain('[AUTO-UNDOCKED]');
});

test.each([
  ['storage_deposit', storageDepositAutoDockedFixture, 'Deposit Items', 'Storage Total: 42'],
  ['storage_withdraw', storageWithdrawAutoDockedFixture, 'Withdraw Items', 'Storage Remaining: 35'],
] as const)('renders nested %s auto-dock receipts with the resulting station', (command, fixture, title, totalLine) => {
  const rendered = renderStructuredResult(command, structuredClone(fixture), options, context);

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain(`=== ${title} ===`);
  expect(stdout).toContain(totalLine);
  expect(stdout).toContain('Auto Docked: true');
  expect(stdout).toContain('Station Name: Earth Station');
  expect(stdout).toContain('Station Id: earth_station');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders a station material gift receipt instead of the scalar send-gift dump', () => {
  const rendered = renderStructuredResult(
    'storage_deposit',
    structuredClone(storageDepositStationGiftFixture),
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('=== Station Gift ===');
  expect(stdout).toContain('Station: station:grand_exchange_station');
  expect(stdout).toContain('Item: steel_plate');
  expect(stdout).toContain('Quantity: 20');
  expect(stdout).toContain('Source: cargo');
  expect(stdout).toContain('Cargo remaining: 80');
  expect(stdout).not.toContain('Storage remaining');
  expect(stdout).not.toContain('=== Send Gift ===');
  expect(stdout).not.toContain('Auto Docked');
  expect(stdout).not.toContain('[AUTO-DOCKED]');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders a storage-source station gift remaining count and omits cargo remaining', () => {
  const rendered = renderStructuredResult(
    'storage_deposit',
    {
      details: {
        action: 'send_gift',
        recipient: 'station:grand_exchange_station',
        base_id: 'grand_exchange_station',
        source: 'storage',
        item_id: 'steel_plate',
        quantity: 20,
        storage_remaining: 5,
      },
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('=== Station Gift ===');
  expect(stdout).toContain('Source: storage');
  expect(stdout).toContain('Storage remaining: 5');
  expect(stdout).not.toContain('Cargo remaining');
  expect(stdout).not.toContain('Storage remaining: 0');
  expect(stdout).not.toContain('=== Response ===');
});

test('does not invent zero remaining counts when the server omitted them', () => {
  const rendered = renderStructuredResult(
    'storage_deposit',
    {
      details: {
        action: 'send_gift',
        recipient: 'station:grand_exchange_station',
        base_id: 'grand_exchange_station',
        item_id: 'steel_plate',
        quantity: 20,
      },
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('=== Station Gift ===');
  expect(stdout).toContain('Item: steel_plate');
  expect(stdout).not.toContain('Cargo remaining');
  expect(stdout).not.toContain('Storage remaining');
  expect(stdout).not.toContain(': 0');
  expect(stdout).not.toContain('=== Response ===');
});

test('matches mixed-case station: recipients', () => {
  const rendered = renderStructuredResult(
    'storage_deposit',
    {
      details: {
        action: 'send_gift',
        recipient: 'Station:Grand_Exchange_Station',
        base_id: 'grand_exchange_station',
        item_id: 'steel_plate',
        quantity: 20,
        cargo_remaining: 80,
      },
    },
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Station Gift ===');
  expect(stdout).toContain('Station: Station:Grand_Exchange_Station');
  expect(stdout).not.toContain('=== Send Gift ===');
});

test('formats bulk station gifts when only nested results carry station: recipients', () => {
  const rendered = renderStructuredResult(
    'storage_deposit',
    {
      details: {
        action: 'bulk_deposit',
        requested: 1,
        succeeded: 1,
        failed: 0,
        results: [
          {
            item_id: 'steel_plate',
            quantity: 20,
            success: true,
            result: {
              action: 'send_gift',
              recipient: 'station:grand_exchange_station',
              base_id: 'grand_exchange_station',
              item_id: 'steel_plate',
              quantity: 20,
              cargo_remaining: 80,
            },
          },
        ],
      },
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('=== Station Gift ===');
  expect(stdout).toContain('Station: station:grand_exchange_station');
  expect(stdout).toContain('steel_plate');
  expect(stdout).not.toContain('Results: 1 item(s)');
  expect(stdout).not.toContain('=== Response ===');
});

test('does not print auto-dock fields or location aliases on a station gift receipt', () => {
  const rendered = renderStructuredResult(
    'storage_deposit',
    {
      details: {
        action: 'send_gift',
        recipient: 'station:grand_exchange_station',
        base_id: 'grand_exchange_station',
        item_id: 'steel_plate',
        quantity: 20,
        cargo_remaining: 80,
        auto_docked: true,
      },
      location: {
        system_id: 'sol',
        system_name: 'Sol',
        poi_id: 'grand_exchange_station',
        poi_name: 'Grand Exchange',
        docked_at: 'grand_exchange_station',
      },
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('=== Station Gift ===');
  expect(stdout).toContain('Station: station:grand_exchange_station');
  expect(stdout).not.toContain('Auto Docked');
  expect(stdout).not.toContain('Auto-docked');
  expect(stdout).not.toContain('[AUTO-DOCKED]');
  expect(stdout).not.toContain('Station Name: Grand Exchange');
  expect(stdout).not.toContain('=== Response ===');
});

test('keeps player send_gift on the scalar dump', () => {
  const rendered = renderStructuredResult(
    'storage_deposit',
    {
      details: {
        action: 'send_gift',
        recipient: 'PlayerName',
        base_id: 'earth_station',
        source: 'cargo',
        item_id: 'steel_plate',
        quantity: 5,
        cargo_remaining: 10,
      },
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('=== Send Gift ===');
  expect(stdout).toContain('Recipient: PlayerName');
  expect(stdout).not.toContain('=== Station Gift ===');
  expect(stdout).not.toContain('=== Response ===');
});

test('expands bulk station-gift success and failure instead of a results count', () => {
  const rendered = renderStructuredResult(
    'storage_deposit',
    structuredClone(storageDepositBulkStationGiftFixture),
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('=== Station Gift ===');
  expect(stdout).toContain('Station: station:grand_exchange_station');
  expect(stdout).toContain('2 requested | 1 succeeded | 1 failed');
  expect(stdout).toContain('=== Results ===');
  expect(stdout).toContain('steel_plate');
  expect(stdout).toContain('quest_token');
  expect(stdout).toContain('yes');
  expect(stdout).toContain('no');
  expect(stdout).toContain('cargo 80');
  expect(stdout).toContain('Donated 20 steel plates without payment.');
  expect(stdout).toContain('Quest items cannot be donated to a station.');
  expect(stdout).not.toContain('Results: 2 item(s)');
  expect(stdout).not.toContain('=== Bulk Deposit ===');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders bulk station-gift remaining zero when the server includes it', () => {
  const rendered = renderStructuredResult(
    'storage_deposit',
    {
      details: {
        action: 'bulk_deposit',
        requested: 1,
        succeeded: 1,
        failed: 0,
        target: 'station:grand_exchange_station',
        results: [
          {
            item_id: 'steel_plate',
            quantity: 20,
            success: true,
            result: {
              action: 'send_gift',
              recipient: 'station:grand_exchange_station',
              base_id: 'grand_exchange_station',
              item_id: 'steel_plate',
              quantity: 20,
              cargo_remaining: 0,
            },
          },
        ],
      },
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('=== Station Gift ===');
  expect(stdout).toContain('cargo 0');
  expect(stdout).not.toContain('Results: 1 item(s)');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders bulk station-gift all-failure without remaining counts', () => {
  const rendered = renderStructuredResult(
    'storage_deposit',
    {
      details: {
        action: 'bulk_deposit',
        requested: 1,
        succeeded: 0,
        failed: 1,
        target: 'station:grand_exchange_station',
        results: [
          {
            item_id: 'credits',
            quantity: 100,
            success: false,
            error: 'Credits cannot be donated to a station.',
          },
        ],
      },
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('=== Station Gift ===');
  expect(stdout).toContain('1 requested | 0 succeeded | 1 failed');
  expect(stdout).toContain('credits');
  expect(stdout).toContain('Credits cannot be donated to a station.');
  expect(stdout).not.toContain('Remaining');
  expect(stdout).not.toContain('cargo ');
  expect(stdout).not.toContain('=== Response ===');
});

test('does not treat personal bulk deposits as station gifts', () => {
  const rendered = renderStructuredResult(
    'storage_deposit',
    {
      details: {
        action: 'bulk_deposit',
        requested: 1,
        succeeded: 1,
        failed: 0,
        target: 'self',
        results: [
          {
            item_id: 'ore_iron',
            quantity: 12,
            success: true,
            result: {
              action: 'deposit_items',
              item_id: 'ore_iron',
              quantity: 12,
              storage_total: 42,
              cargo_remaining: 8,
            },
          },
        ],
      },
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('=== Bulk Deposit ===');
  expect(stdout).toContain('Results: 1 item(s)');
  expect(stdout).not.toContain('=== Station Gift ===');
  expect(stdout).not.toContain('=== Response ===');
});

test('station gift JSON keeps SendGiftResponse field names', () => {
  const rendered = renderStructuredResult(
    'storage_deposit',
    structuredClone(storageDepositStationGiftFixture),
    { ...options, format: 'json' },
    { ...context, output: { ...context.output, format: 'json' } },
  );

  expect(rendered.success).toBe(true);
  const parsed = JSON.parse(rendered.stdout.join('\n')) as {
    details: Record<string, unknown>;
  };
  expect(parsed.details).toEqual(storageDepositStationGiftFixture.details);
  expect(parsed.details).toHaveProperty('cargo_remaining', 80);
  expect(parsed.details).toHaveProperty('recipient', 'station:grand_exchange_station');
});

test('renders catalog ships with prestige lock notes when present', () => {
  const rendered = renderStructuredResult(
    'catalog',
    {
      items: [
        {
          class: 'luxury_liner',
          empire: 'solarian',
          id: 'concierge_liner',
          name: 'Concierge Liner',
          piloting_required: 8,
          prestige_lock:
            'Locked: prestige hull reserved for pilots who have earned the "Galactic Concierge" achievement.',
          required_achievement: 'galactic_concierge',
          shipyard_tier: 3,
          tier: 4,
        },
      ],
      message: 'Ships: showing 1 of 1',
      page: 1,
      page_size: 20,
      total: 1,
      total_pages: 1,
      type: 'ships',
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Items ===');
  expect(stdout).toContain('Concierge Liner');
  expect(stdout).toContain('Locked: prestige hull reserved');
  expect(stdout).not.toContain('=== Response ===');
});

function catalogShipsHeader(stdout: string): string | undefined {
  return stdout.split('\n').find((line) => line.includes('Name') && line.includes('ID') && line.includes('Class'));
}

test('renders catalog ship Loadout when default_modules are present and omits it when absent', () => {
  const withLoadout = renderStructuredResult(
    'catalog',
    {
      items: [
        {
          class: 'capital_refinery',
          default_modules: ['ore_processor_i', 'fuel_converter_i'],
          empire: 'outerrim',
          id: 'money_pit',
          name: 'Money Pit',
          shipyard_tier: 5,
          tier: 5,
        },
        {
          class: 'luxury_liner',
          empire: 'solarian',
          id: 'concierge_liner',
          name: 'Concierge Liner',
          shipyard_tier: 3,
          tier: 4,
        },
      ],
      type: 'ships',
    },
    options,
    context,
  );
  const withLoadoutOut = withLoadout.stdout.join('\n');
  expect(withLoadout.success).toBe(true);
  expect(catalogShipsHeader(withLoadoutOut)).toContain('Loadout');
  expect(withLoadoutOut).toContain('ore_processor_i, fuel_converter_i');
  expect(withLoadoutOut).not.toContain('Details');

  const withoutLoadout = renderStructuredResult(
    'catalog',
    {
      items: [
        {
          class: 'capital_refinery',
          empire: 'outerrim',
          id: 'money_pit',
          name: 'Money Pit',
          shipyard_tier: 5,
          tier: 5,
        },
        {
          class: 'luxury_liner',
          empire: 'solarian',
          id: 'concierge_liner',
          name: 'Concierge Liner',
          shipyard_tier: 3,
          tier: 4,
        },
      ],
      type: 'ships',
    },
    options,
    context,
  );
  const withoutLoadoutOut = withoutLoadout.stdout.join('\n');
  expect(withoutLoadout.success).toBe(true);
  expect(catalogShipsHeader(withoutLoadoutOut)).not.toContain('Loadout');
  expect(withoutLoadoutOut).not.toContain('Details');
});

test('omits catalog ship Lock when required_achievement is set without prestige_lock', () => {
  const rendered = renderStructuredResult(
    'catalog',
    {
      items: [
        {
          class: 'luxury_liner',
          empire: 'solarian',
          id: 'concierge_liner',
          name: 'Concierge Liner',
          required_achievement: 'galactic_concierge',
          shipyard_tier: 3,
          tier: 4,
        },
        {
          class: 'capital_refinery',
          empire: 'outerrim',
          id: 'money_pit',
          name: 'Money Pit',
          shipyard_tier: 5,
          tier: 5,
        },
      ],
      type: 'ships',
    },
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(catalogShipsHeader(stdout)).not.toContain('Lock');
  expect(stdout).not.toContain('Details');
});

test('renders catalog ship Req. items when required_items are present', () => {
  const rendered = renderStructuredResult(
    'catalog',
    {
      items: [
        {
          class: 'capital_refinery',
          empire: 'outerrim',
          id: 'money_pit',
          name: 'Money Pit',
          required_items: [{ name: 'Steel Plate', quantity: 3 }],
          shipyard_tier: 5,
          tier: 5,
        },
        {
          class: 'luxury_liner',
          empire: 'solarian',
          id: 'concierge_liner',
          name: 'Concierge Liner',
          shipyard_tier: 3,
          tier: 4,
        },
      ],
      type: 'ships',
    },
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(catalogShipsHeader(stdout)).toContain('Req. items');
  expect(stdout).toContain('3x Steel Plate');
  expect(stdout).not.toContain('Details');
});

test('omits catalog ship Availability when hidden is false or absent', () => {
  const rendered = renderStructuredResult(
    'catalog',
    {
      items: [
        {
          class: 'capital_refinery',
          empire: 'outerrim',
          hidden: false,
          id: 'money_pit',
          name: 'Money Pit',
          shipyard_tier: 5,
          tier: 5,
        },
        {
          class: 'luxury_liner',
          empire: 'solarian',
          id: 'concierge_liner',
          name: 'Concierge Liner',
          shipyard_tier: 3,
          tier: 4,
        },
      ],
      type: 'ships',
    },
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(catalogShipsHeader(stdout)).not.toContain('Availability');
  expect(stdout).not.toContain('Details');
});

test('renders catalog ship Availability when hidden or legacy', () => {
  const rendered = renderStructuredResult(
    'catalog',
    {
      items: [
        {
          class: 'capital_refinery',
          empire: 'outerrim',
          hidden: true,
          id: 'money_pit',
          legacy: true,
          name: 'Money Pit',
          shipyard_tier: 5,
          tier: 5,
        },
        {
          class: 'luxury_liner',
          empire: 'solarian',
          id: 'concierge_liner',
          name: 'Concierge Liner',
          shipyard_tier: 3,
          tier: 4,
        },
      ],
      type: 'ships',
    },
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(catalogShipsHeader(stdout)).toContain('Availability');
  expect(stdout).toContain('hidden, legacy');
  expect(stdout).not.toContain('Details');
});

test('renders catalog ship Empire from faction when empire is absent', () => {
  const rendered = renderStructuredResult(
    'catalog',
    {
      items: [
        {
          class: 'capital_refinery',
          empire: 'outerrim',
          id: 'money_pit',
          name: 'Money Pit',
          shipyard_tier: 5,
          tier: 5,
        },
        {
          class: 'luxury_liner',
          faction: 'nebula',
          id: 'comet',
          name: 'Comet',
          shipyard_tier: 3,
          tier: 4,
        },
      ],
      type: 'ships',
    },
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(catalogShipsHeader(stdout)).toContain('Empire');
  expect(stdout).toContain('outerrim');
  expect(stdout).toContain('nebula');
  expect(stdout).not.toContain('Details');
});

test('renders catalog ship Details with a full untruncated loadout for a one-row list', () => {
  const modules = [
    'judgment_beam',
    'solar_lance',
    'focused_beam_iii',
    'focused_beam_iii',
    'heavy_pulse_laser',
    'heavy_pulse_laser',
    'pulse_laser_iii',
    'pulse_laser_iii',
    'solarian_aegis',
    'adaptive_shield_iii',
    'shield_booster_iv',
    'shield_booster_iii',
    'darksteel_armor',
    'nanite_hull_coating',
  ];
  const rendered = renderStructuredResult(
    'catalog',
    {
      items: [
        {
          class: 'Titan',
          default_modules: modules,
          empire: 'solarian',
          id: 'opus_magna',
          name: 'Opus Magna',
          shipyard_tier: 5,
          tier: 5,
        },
      ],
      type: 'ships',
    },
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');
  const loadout = modules.join(', ');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Items ===');
  expect(stdout).toContain('Details');
  expect(stdout.indexOf('=== Items ===')).toBeLessThan(stdout.indexOf('Details'));
  expect(stdout).toContain(`Default loadout: ${loadout}`);
  expect(catalogShipsHeader(stdout)).toContain('Loadout');
});

test('does not render catalog ship Details for a multi-row list', () => {
  const rendered = renderStructuredResult('catalog', structuredClone(catalogShipsFixture), options, context);
  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Items ===');
  expect(stdout).toContain('Money Pit');
  expect(stdout).toContain('Concierge Liner');
  expect(stdout).not.toContain('Details');
});

test('renders catalog item compression when at least one item declares it', () => {
  const rendered = renderStructuredResult(
    'catalog',
    {
      items: [
        {
          id: 'quantum_fragments',
          name: 'Quantum Fragments',
          category: 'ore',
          base_value: 600,
          size: 3,
          compression: 'ore',
        },
        {
          id: 'food_rations',
          name: 'Food Rations',
          category: 'consumable',
          base_value: 10,
          size: 1,
        },
      ],
      type: 'items',
    },
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toMatch(/Size\s+\|\s+Compression/);
  expect(stdout).toContain('Quantum Fragments');
  expect(stdout).toContain('ore');
});

test('renders catalog item slot and module effects when present', () => {
  const rendered = renderStructuredResult('catalog', structuredClone(catalogItemsModulesFixture), options, context);
  const stdout = rendered.stdout.join('\n');
  const tableHeader = stdout.split('\n').find((line) => line.includes('Name') && line.includes('Effects'));

  expect(rendered.success).toBe(true);
  expect(tableHeader).toBeDefined();
  expect(tableHeader).toMatch(/Slot\s+\|\s+Effects/);
  expect(stdout).toContain('Warp Scrambler');
  expect(stdout).toContain('utility');
  expect(stdout).toContain('reach 3, scramble 2');
  expect(stdout).toContain('Adaptive Shield I');
  expect(stdout).toContain('defense');
  expect(stdout).toContain('shield +60, damage reduction 10, adaptive_resistance_10');
  expect(stdout).toContain('Ghost Rounds Box');
  expect(stdout).toContain('damage 90%, armor bypass 30%, untraceable');
  expect(stdout).not.toContain('=== Response ===');
});

test('omits catalog item slot when no item declares it', () => {
  const rendered = renderStructuredResult(
    'catalog',
    {
      items: [
        {
          id: 'food_rations',
          name: 'Food Rations',
          category: 'consumable',
          base_value: 10,
          size: 1,
        },
      ],
      type: 'items',
    },
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).not.toContain('Slot');
});

test('omits catalog item compression when no item declares it', () => {
  const rendered = renderStructuredResult(
    'catalog',
    {
      items: [
        {
          id: 'food_rations',
          name: 'Food Rations',
          category: 'consumable',
          base_value: 10,
          size: 1,
        },
      ],
      type: 'items',
    },
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).not.toContain('Compression');
});

test('renders catalog facilities with maintenance_fuel and maintenance_inputs req. stock', () => {
  const rendered = renderStructuredResult(
    'catalog',
    {
      type: 'facilities',
      items: [
        {
          id: 'bunker_fed_reactor',
          name: 'Bunker-Fed Reactor',
          category: 'infrastructure',
          level: 1,
          maintenance_fuel: 55,
          power_supply: 12,
          build_cost: 4000,
        },
        {
          id: 'storage_locker',
          name: 'Storage Locker',
          category: 'infrastructure',
          level: 1,
          maintenance_inputs: [
            { item_id: 'steel_plate', name: 'Steel Plate', quantity: 3 },
            { item_id: 'durasteel_plate', quantity: 2 },
          ],
          build_cost: 500,
        },
      ],
      message: 'Facilities: showing 2 of 2',
      page: 1,
      page_size: 20,
      total: 2,
      total_pages: 1,
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  const tableHeader = stdout
    .split('\n')
    .find((line) => line.includes('Name') && line.includes('ID') && line.includes('Level'));
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Facilities ===');
  expect(tableHeader).toBeDefined();
  expect(tableHeader).toContain('Req. stock');
  expect(stdout).toContain('Bunker-Fed Reactor');
  expect(stdout).toContain('55 fuel stock');
  expect(stdout).not.toContain('fuel/cycle');
  expect(stdout).toContain('Storage Locker');
  expect(stdout).toContain('3 Steel Plate');
  expect(stdout).toContain('2 durasteel_plate');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders catalog recipe items with recipe availability', () => {
  const rendered = renderStructuredResult(
    'catalog',
    {
      items: [
        {
          category: 'Components',
          crafting_time: 6.75,
          facility_only: true,
          id: 'assemble_nimh_power_cell',
          inputs: [{ item_id: 'nickel_billet', quantity: 3 }],
          name: 'Assemble NiMH Power Cell',
          outputs: [{ item_id: 'power_cell', quantity: 1 }],
        },
        {
          category: 'Components',
          crafting_time: 6.75,
          id: 'build_power_cell',
          inputs: [{ item_id: 'energy_crystal', quantity: 3 }],
          name: 'Build Power Cell',
          outputs: [{ item_id: 'power_cell', quantity: 1 }],
        },
      ],
      message: 'Recipes matching "power_cell": showing 2 of 2.',
      page: 1,
      page_size: 20,
      total: 2,
      total_pages: 1,
      type: 'recipes',
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Recipes ===');
  expect(stdout).toContain('Use');
  expect(stdout).toContain('facility only');
  expect(stdout).toContain('craftable');
});

test('renders craft dry-run details without raw response fallback', () => {
  const rendered = renderStructuredResult(
    'craft',
    {
      details: {
        action: 'craft',
        cost: {
          inputs: [
            { item_id: 'circuit_board', name: 'Circuit Board', quantity: 2 },
            { item_id: 'energy_crystal', name: 'Energy Crystal', quantity: 3 },
          ],
        },
        dry_run: true,
        effective_time_per_run: 3.5,
        est_completion_tick: 1131729,
        facility_id: 'workshop:player:station',
        have_credits: true,
        have_inputs: true,
        mode: 'craft',
        produces: [{ item_id: 'power_cell', name: 'Power Cell', quantity: 1 }],
        recipe: 'Build Power Cell',
        runs: 1,
        venue: 'Station Workshop',
        venue_type: 'workshop',
      },
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Craft Quote ===');
  expect(stdout).toContain('Recipe: Build Power Cell');
  expect(stdout).toContain('Runs: 1');
  expect(stdout).toContain('Venue: Station Workshop');
  expect(stdout).toContain('Output: 1x Power Cell');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders dry-run route previews for craft cancellation payloads', () => {
  const rendered = renderStructuredResult(
    'craft',
    {
      dry_run: true,
      command: 'craft',
      method: 'POST',
      url: 'https://game.spacemolt.com/api/v2/spacemolt/craft',
      payload: { job_id: 'craft-job-1' },
      server_request_sent: false,
      notes: ['No mutation was sent. This is a client-side route and payload preview.'],
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Dry Run: craft ===');
  expect(stdout).toContain('POST https://game.spacemolt.com/api/v2/spacemolt/craft');
  expect(stdout).toContain('Payload: {"job_id":"craft-job-1"}');
  expect(stdout).toContain('No request was sent.');
  expect(stdout).not.toContain('=== Craft Quote ===');
});

test('renders queued craft details with job id and output', () => {
  const rendered = renderStructuredResult(
    'craft',
    {
      details: {
        action: 'craft',
        kind: 'job',
        effective_time_per_run: 3.5,
        escrowed: {
          inputs: [{ item_id: 'circuit_board', name: 'Circuit Board', quantity: 2 }],
        },
        est_completion_tick: 1131729,
        facility_id: 'workshop:player:station',
        job_id: 'craft-job-1',
        mode: 'craft',
        produces: [{ item_id: 'power_cell', name: 'Power Cell', quantity: 1 }],
        recipe: 'Build Power Cell',
        runs: 1,
        venue: 'Station Workshop',
        venue_type: 'workshop',
      },
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Craft Queued ===');
  expect(stdout).toContain('Job: craft-job-1');
  expect(stdout).toContain('Recipe: Build Power Cell');
  expect(stdout).toContain('Runs: 1');
  expect(stdout).toContain('Output: 1x Power Cell');
  expect(stdout).not.toContain('Action:');
  expect(stdout).not.toContain('Package:');
  expect(stdout).not.toContain('Label:');
  expect(stdout).not.toContain('ETA:');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders craft job retarget details instead of a queued response', () => {
  const rendered = renderStructuredResult(
    'craft',
    {
      details: {
        action: 'job_retarget',
        kind: 'retarget',
        job_id: 'craft-job-1',
        previous_deliver_to: 'storage',
        deliver_to: 'faction:Workshop',
        runs_remaining: 12,
        auto_docked: true,
        message: 'Crafting job output redirected.',
      },
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Craft Job Retargeted ===');
  expect(stdout).toContain('Job: craft-job-1');
  expect(stdout).toContain('Previous destination: storage');
  expect(stdout).toContain('New destination: faction:Workshop');
  expect(stdout).toContain('Runs remaining: 12');
  expect(stdout).toContain('Auto-docked: yes');
  expect(stdout).toContain('Crafting job output redirected.');
  expect(stdout).not.toContain('=== Craft Queued ===');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders recycle job retarget with zero remaining runs and auto-undock', () => {
  const rendered = renderStructuredResult(
    'recycle',
    {
      details: {
        action: 'job_retarget',
        kind: 'retarget',
        job_id: 'recycle-job-1',
        previous_deliver_to: 'faction:Scrap',
        deliver_to: 'storage',
        runs_remaining: 0,
        auto_undocked: true,
        message: 'Recycling job output redirected.',
      },
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Recycle Job Retargeted ===');
  expect(stdout).toContain('Job: recycle-job-1');
  expect(stdout).toContain('Previous destination: faction:Scrap');
  expect(stdout).toContain('New destination: storage');
  expect(stdout).toContain('Runs remaining: 0');
  expect(stdout).toContain('Auto-undocked: yes');
  expect(stdout).not.toContain('=== Recycle Queued ===');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders package pack job with action package label and eta', () => {
  const rendered = renderStructuredResult(
    'craft',
    {
      details: {
        action: 'pack',
        kind: 'package',
        job_id: 'pkg-job-1',
        package_id: 'pkg-abc',
        label: 'Spare Parts Kit',
        eta_ticks: 5,
        facility_id: 'workshop:player:station',
        mode: 'craft',
        runs: 1,
        venue: 'Station Workshop',
        venue_type: 'workshop',
      },
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Craft Queued ===');
  expect(stdout).toContain('Job: pkg-job-1');
  expect(stdout).toContain('Action: pack');
  expect(stdout).toContain('Package: pkg-abc');
  expect(stdout).toContain('Label: Spare Parts Kit');
  expect(stdout).toContain('ETA: 5 ticks');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders package unpack job fields', () => {
  const rendered = renderStructuredResult(
    'craft',
    {
      details: {
        action: 'unpack',
        kind: 'package',
        job_id: 'pkg-job-2',
        package_id: 'pkg-xyz',
        label: 'Salvage Bundle',
        eta_ticks: 1,
        facility_id: 'workshop:player:station',
        mode: 'craft',
        runs: 1,
      },
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Craft Queued ===');
  expect(stdout).toContain('Action: unpack');
  expect(stdout).toContain('Package: pkg-xyz');
  expect(stdout).toContain('Label: Salvage Bundle');
  expect(stdout).toContain('ETA: 1 tick');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders craft quote capacity available as yes/no', () => {
  const renderQuote = (have_capacity: unknown) => {
    const details: Record<string, unknown> = {
      action: 'craft',
      cost: {
        inputs: [{ item_id: 'circuit_board', name: 'Circuit Board', quantity: 2 }],
      },
      dry_run: true,
      effective_time_per_run: 3.5,
      est_completion_tick: 1131729,
      facility_id: 'workshop:player:station',
      have_credits: true,
      have_inputs: true,
      mode: 'craft',
      produces: [{ item_id: 'power_cell', name: 'Power Cell', quantity: 1 }],
      recipe: 'Build Power Cell',
      runs: 1,
      venue: 'Station Workshop',
      venue_type: 'workshop',
    };
    if (have_capacity !== undefined) details.have_capacity = have_capacity;
    return renderStructuredResult('craft', { details }, options, context);
  };

  const yes = renderQuote(true);
  const yesOut = yes.stdout.join('\n');
  expect(yes.success).toBe(true);
  expect(yesOut).toContain('Inputs available: true');
  expect(yesOut).toContain('Credits available: true');
  expect(yesOut).toContain('Capacity available: yes');

  const no = renderQuote(false);
  const noOut = no.stdout.join('\n');
  expect(no.success).toBe(true);
  expect(noOut).toContain('Inputs available: true');
  expect(noOut).toContain('Credits available: true');
  expect(noOut).toContain('Capacity available: no');

  const absent = renderQuote(undefined);
  const absentOut = absent.stdout.join('\n');
  expect(absent.success).toBe(true);
  expect(absentOut).toContain('Inputs available: true');
  expect(absentOut).toContain('Credits available: true');
  expect(absentOut).not.toContain('Capacity available');

  const garbage = renderQuote('maybe');
  const garbageOut = garbage.stdout.join('\n');
  expect(garbage.success).toBe(true);
  expect(garbageOut).not.toContain('Capacity available');
});

test('renders craft queue total_jobs and truncation message', () => {
  const rendered = renderStructuredResult(
    'craft',
    {
      action: 'queue',
      total_jobs: 450,
      message: 'Showing the 200 soonest-finishing jobs.',
      jobs: [
        {
          job_id: 'job-1',
          recipe: 'Refine Steel',
          mode: 'craft',
          runs_done: 0,
          runs_remaining: 1,
          runs_total: 1,
          venue: 'Station Workshop',
          facility_id: 'workshop:player:station',
          eta_ticks: 2,
          status: 'queued',
        },
      ],
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Craft Queue ===');
  expect(stdout).toContain('job-1');
  expect(stdout).toContain('Total jobs: 450 (showing 1)');
  expect(stdout).toContain('Showing the 200 soonest-finishing jobs.');
  expect(stdout).not.toContain('Destination');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders queued craft destinations when present', () => {
  const rendered = renderStructuredResult(
    'craft',
    {
      details: {
        action: 'queue',
        jobs: [
          {
            job_id: 'storage-job-1',
            recipe: 'Refine Steel',
            mode: 'craft',
            runs_done: 1,
            runs_remaining: 4,
            runs_total: 5,
            produces: [{ item_id: 'steel_plate', name: 'Steel Plate', quantity: 5 }],
            deliver_to: 'storage',
            venue: 'Station Workshop',
            eta_ticks: 8,
            status: 'running',
          },
          {
            job_id: 'faction-job-1',
            recipe: 'Recycle Power Cell',
            mode: 'recycle',
            runs_done: 0,
            runs_remaining: 2,
            runs_total: 2,
            produces: [{ item_id: 'circuit_board', name: 'Circuit Board', quantity: 2 }],
            deliver_to: 'faction:Scrap',
            venue: 'Faction Recycler',
            eta_ticks: 5,
            status: 'queued',
          },
        ],
      },
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Destination');
  expect(stdout).toContain('storage');
  expect(stdout).toContain('faction:Scrap');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders craft queue lists across workshop own and faction venues', () => {
  const rendered = renderStructuredResult(
    'craft',
    {
      details: {
        action: 'queue',
        jobs: [
          {
            job_id: 'workshop-job-1',
            recipe: 'Build Power Cell',
            mode: 'craft',
            runs_done: 0,
            runs_remaining: 1,
            runs_total: 1,
            produces: [{ item_id: 'power_cell', name: 'Power Cell', quantity: 1 }],
            venue: 'Station Workshop',
            facility_id: 'workshop:player:station',
            eta_ticks: 2,
            status: 'queued',
          },
          {
            job_id: 'own-job-1',
            recipe: 'Assemble Power Cell',
            mode: 'facility',
            runs_done: 3,
            runs_remaining: 2,
            runs_total: 5,
            produces: [{ item_id: 'power_cell', name: 'Power Cell', quantity: 5 }],
            venue: 'Own Power Cell Assembler',
            facility_id: 'own-cell-assembler',
            eta_ticks: 4,
            status: 'running',
          },
          {
            job_id: 'faction-job-1',
            recipe: 'Refine Fuel',
            mode: 'facility',
            runs_done: 1,
            runs_remaining: 9,
            runs_total: 10,
            produces: [{ item_id: 'fuel_cell', name: 'Fuel Cell', quantity: 10 }],
            venue: 'Faction Fuel Plant',
            facility_id: 'faction-fuel-plant',
            eta_ticks: 9,
            status: 'queued',
          },
        ],
      },
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Craft Queue ===');
  expect(stdout).toContain('workshop-job-1');
  expect(stdout).toContain('own-job-1');
  expect(stdout).toContain('faction-job-1');
  expect(stdout).toContain('Station Workshop');
  expect(stdout).toContain('Own Power Cell Assembler');
  expect(stdout).toContain('Faction Fuel Plant');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders craft queue station from workshop facility ids', () => {
  const rendered = renderStructuredResult(
    'craft',
    {
      action: 'queue',
      jobs: [
        {
          job_id: 'workshop-job-1',
          base_id: 'nova_terra_central',
          base_name: 'Nova Terra Central',
          recipe: 'Sinter Tungsten Steel',
          mode: 'craft',
          runs_done: 4329,
          runs_remaining: 21357,
          runs_total: 25686,
          produces: [{ item_id: 'steel_plate', name: 'Steel Plate', quantity: 3 }],
          venue: 'Station Workshop',
          facility_id: 'workshop-job-facility',
          eta_ticks: 18160,
          status: 'active',
          position: 0,
        },
        {
          job_id: 'facility-job-1',
          recipe: 'Refine Steel',
          mode: 'craft',
          runs_done: 5250,
          runs_remaining: 4750,
          runs_total: 10000,
          produces: [{ item_id: 'steel_plate', name: 'Steel Plate', quantity: 2 }],
          venue: 'Iron Refinery',
          facility_id: 'e85ab866c46f5b3cb6c3dde515de1533',
          eta_ticks: 514,
          status: 'active',
          position: 0,
        },
      ],
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Craft Queue ===');
  expect(stdout).toContain('Nova Terra Central (nova_terra_central)');
  expect(stdout).toContain('Iron Refinery');
  expect(stdout).not.toContain('e85ab866c46f5b3cb6c3dde515de1533');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders craft queue station from workshop facility-ID fallback', () => {
  const rendered = renderStructuredResult(
    'craft',
    {
      action: 'queue',
      jobs: [
        {
          job_id: 'workshop-fallback-job-1',
          recipe: 'Sinter Tungsten Steel',
          mode: 'craft',
          runs_done: 4329,
          runs_remaining: 21357,
          runs_total: 25686,
          produces: [{ item_id: 'steel_plate', name: 'Steel Plate', quantity: 3 }],
          venue: 'Station Workshop',
          facility_id: 'workshop:3b887e57d3e875649579bc301a66df34:nova_terra_central',
          eta_ticks: 18160,
          status: 'active',
          position: 0,
        },
      ],
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('nova_terra_central');
  expect(stdout).not.toContain('3b887e57d3e875649579bc301a66df34');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders craft queue with station context and a single table heading', () => {
  const rendered = renderStructuredResult(
    'craft',
    {
      location: {
        docked_at: 'iron_reach_station',
        poi_name: 'Iron Reach Station',
        system_id: 'iron_reach',
        system_name: 'Iron Reach',
      },
      details: {
        action: 'queue',
        jobs: [
          {
            job_id: 'steel-job-1',
            recipe: 'Refine Steel',
            mode: 'craft',
            runs_done: 2,
            runs_remaining: 3,
            runs_total: 5,
            produces: [{ item_id: 'steel_plate', name: 'Steel Plate', quantity: 2 }],
            venue: 'Iron Refinery',
            facility_id: 'iron-refinery',
            eta_ticks: 12,
            status: 'active',
            position: 0,
          },
        ],
      },
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Craft Queue @ Iron Reach Station (iron_reach_station) ===');
  expect(stdout).toContain('steel-job-1');
  expect(stdout).toContain('Iron Refinery');
  expect(stdout).not.toContain('=== Jobs ===');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders rented facility and remaining escrow on a queued craft job', () => {
  const rendered = renderStructuredResult(
    'craft',
    {
      details: {
        action: 'craft',
        effective_time_per_run: 2,
        escrowed: {
          fee: 150,
          inputs: [{ item_id: 'iron_ore', name: 'Iron Ore', quantity: 20 }],
          labor: 40,
        },
        est_completion_tick: 1200,
        external: true,
        facility_id: 'public-smelter-1',
        job_id: 'rental-job-1',
        mode: 'craft',
        produces: [{ item_id: 'steel_plate', name: 'Steel Plate', quantity: 2 }],
        recipe: 'Refine Steel',
        runs: 10,
        venue: 'Public Smelter',
        venue_type: 'facility',
        message: 'Queued on a public rental facility.',
      },
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Rented facility: yes');
  expect(stdout).toContain('Fee: 150cr');
  expect(stdout).toContain('Labor: 40cr');
  expect(stdout).toContain('Public Smelter');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders craft queue rental and escrow columns when present', () => {
  const rendered = renderStructuredResult(
    'craft',
    {
      details: {
        action: 'queue',
        jobs: [
          {
            job_id: 'own-job-1',
            recipe: 'Refine Steel',
            mode: 'facility',
            runs_done: 1,
            runs_remaining: 4,
            runs_total: 5,
            venue: 'Own Smelter',
            facility_id: 'own-smelter',
            external: false,
            eta_ticks: 8,
            status: 'running',
            position: 0,
          },
          {
            job_id: 'rental-job-1',
            recipe: 'Assemble Power Cell',
            mode: 'facility',
            runs_done: 0,
            runs_remaining: 3,
            runs_total: 3,
            venue: 'Public Assembler',
            facility_id: 'public-assembler',
            external: true,
            escrowed_credits: 450,
            eta_ticks: 6,
            status: 'running',
            position: 1,
          },
        ],
      },
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Rented');
  expect(stdout).toContain('Escrow');
  expect(stdout).toContain('yes');
  expect(stdout).toContain('450cr');
  expect(stdout).toContain('Public Assembler');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders bulk craft results with rental and fee columns', () => {
  const rendered = renderStructuredResult(
    'craft',
    {
      details: {
        action: 'bulk',
        mode: 'craft',
        results: [
          {
            index: 0,
            success: true,
            job_id: 'bulk-own-1',
            recipe: 'Refine Steel',
            runs: 5,
            venue: 'Own Smelter',
            external: false,
            message: 'Queued.',
          },
          {
            index: 1,
            success: true,
            job_id: 'bulk-rent-1',
            recipe: 'Assemble Power Cell',
            runs: 3,
            venue: 'Public Assembler',
            external: true,
            escrowed: { fee: 90, labor: 30 },
            message: 'Queued on rental.',
          },
        ],
        summary: { total: 2, succeeded: 2, failed: 0 },
      },
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Rented');
  expect(stdout).toContain('Fee');
  expect(stdout).toContain('yes');
  expect(stdout).toContain('90cr');
  expect(stdout).toContain('Summary: 2 succeeded, 0 failed, 2 total');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders packaged craft quote with gates, ready, and output package preview', () => {
  const rendered = renderStructuredResult(
    'craft',
    {
      details: {
        action: 'craft',
        kind: 'packaged_quote',
        dry_run: true,
        recipe: 'Iron Plates',
        mode: 'craft',
        quantity: 10,
        runs: 10,
        venue: 'Station Workshop',
        venue_type: 'workshop',
        facility_id: 'workshop:player:station',
        cost: {
          inputs: [{ item_id: 'iron_ore', name: 'Iron Ore', quantity: 20 }],
        },
        credits_total: 0,
        effective_time_per_run: 2,
        est_completion_tick: 1131800,
        ready: false,
        package_ids: ['pkg-ore-1', 'pkg-ore-2'],
        output_package_label: 'Plate Pack',
        produces: [{ item_id: 'iron_plate', name: 'Iron Plate', quantity: 10 }],
        gates: {
          package_match: { ok: true },
          inputs: { ok: false, reason: 'contents do not match recipe × quantity' },
          credits: { ok: true },
          logistics: { ok: true },
          cargo_container: { ok: true },
          output_size: { ok: true },
          destination_room: { ok: true },
          future_gate: { ok: false, reason: 'not yet supported' },
        },
        output_package: {
          label: 'Plate Pack',
          size_used: 12,
          size_max: 50,
          container_consumed: 1,
          reclaimed_containers: 2,
          items: [{ item_id: 'iron_plate', name: 'Iron Plate', quantity: 10 }],
        },
        message: 'Quote only — nothing queued.',
      },
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Craft Quote ===');
  expect(stdout).toContain('Recipe: Iron Plates');
  expect(stdout).toContain('Ready: no');
  expect(stdout).toContain('Gates:');
  // Known gates in triage order, then unknown keys alphabetically.
  const gateBlock = stdout.slice(stdout.indexOf('Gates:'));
  const order = [
    'package_match: ok',
    'inputs: FAIL — contents do not match recipe × quantity',
    'credits: ok',
    'logistics: ok',
    'cargo_container: ok',
    'output_size: ok',
    'destination_room: ok',
    'future_gate: FAIL — not yet supported',
  ];
  let cursor = 0;
  for (const line of order) {
    const at = gateBlock.indexOf(line, cursor);
    expect(at).toBeGreaterThanOrEqual(0);
    cursor = at + line.length;
  }
  expect(stdout).toContain('Output package: Plate Pack');
  expect(stdout).toContain('Size: 12/50');
  expect(stdout).toContain('Container consumed: 1');
  expect(stdout).toContain('Reclaimed containers: 2');
  expect(stdout).toContain('Contents: 10x Iron Plate');
  expect(stdout).toContain('Package IDs: pkg-ore-1,pkg-ore-2');
  expect(stdout).toContain('Output package label: Plate Pack');
  expect(stdout).toContain('Inputs: 20x Iron Ore');
  expect(stdout).not.toContain('Inputs available');
  expect(stdout).not.toContain('Credits available');
  expect(stdout).not.toContain('Capacity available');
  expect(stdout).not.toContain('Credits total');
  expect(stdout).not.toContain('credits_total');
  expect(stdout).not.toContain('=== Response ===');
});

test('ordinary craft quote still surfaces have_* fields', () => {
  const rendered = renderStructuredResult(
    'craft',
    {
      details: {
        action: 'craft',
        kind: 'quote',
        cost: {
          inputs: [{ item_id: 'circuit_board', name: 'Circuit Board', quantity: 2 }],
        },
        dry_run: true,
        effective_time_per_run: 3.5,
        est_completion_tick: 1131729,
        facility_id: 'workshop:player:station',
        have_credits: true,
        have_inputs: true,
        have_capacity: false,
        mode: 'craft',
        produces: [{ item_id: 'power_cell', name: 'Power Cell', quantity: 1 }],
        recipe: 'Build Power Cell',
        runs: 1,
        venue: 'Station Workshop',
        venue_type: 'workshop',
      },
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Craft Quote ===');
  expect(stdout).toContain('Inputs available: true');
  expect(stdout).toContain('Credits available: true');
  expect(stdout).toContain('Capacity available: no');
  expect(stdout).not.toContain('Ready:');
  expect(stdout).not.toContain('Gates:');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders output package on ordinary packaged craft job', () => {
  const rendered = renderStructuredResult(
    'craft',
    {
      details: {
        action: 'craft',
        kind: 'job',
        job_id: 'craft-pkg-job-1',
        recipe: 'Iron Plates',
        mode: 'craft',
        runs: 10,
        venue: 'Station Workshop',
        venue_type: 'workshop',
        facility_id: 'workshop:player:station',
        effective_time_per_run: 2,
        est_completion_tick: 1131805,
        produces: [{ item_id: 'iron_plate', name: 'Iron Plate', quantity: 10 }],
        escrowed: {
          inputs: [{ item_id: 'iron_ore', name: 'Iron Ore', quantity: 20 }],
        },
        output_package_id: 'pkg-out-1',
        output_package_label: 'Plate Pack',
        message: 'Queued with sealed output package.',
      },
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Craft Queued ===');
  expect(stdout).toContain('Job: craft-pkg-job-1');
  expect(stdout).toContain('Output package: Plate Pack (pkg-out-1)');
  expect(stdout).not.toContain('Package: pkg-out-1');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders Package and Label columns on craft queue when present', () => {
  const rendered = renderStructuredResult(
    'craft',
    {
      details: {
        kind: 'queue',
        jobs: [
          {
            job_id: 'pkg-queue-1',
            package_id: 'pkg-abc',
            label: 'Spare Parts',
            recipe: 'pack_package',
            mode: 'craft',
            runs_done: 0,
            runs_remaining: 1,
            runs_total: 1,
            venue: 'Station Workshop',
            facility_id: 'workshop:player:station',
            eta_ticks: 3,
            status: 'queued',
            position: 0,
          },
          {
            job_id: 'craft-queue-2',
            recipe: 'Build Power Cell',
            mode: 'craft',
            runs_done: 0,
            runs_remaining: 2,
            runs_total: 2,
            venue: 'Station Workshop',
            facility_id: 'workshop:player:station',
            eta_ticks: 5,
            status: 'queued',
            position: 1,
          },
        ],
      },
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Package');
  expect(stdout).toContain('Label');
  expect(stdout).toContain('pkg-abc');
  expect(stdout).toContain('Spare Parts');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders Package and Label columns on bulk craft results when present', () => {
  const rendered = renderStructuredResult(
    'craft',
    {
      details: {
        action: 'bulk',
        mode: 'craft',
        results: [
          {
            index: 0,
            success: true,
            job_id: 'bulk-pkg-1',
            package_id: 'pkg-bulk-1',
            label: 'Bulk Plates',
            recipe: 'Iron Plates',
            runs: 5,
            venue: 'Own Smelter',
            message: 'Queued sealed.',
          },
          {
            index: 1,
            success: true,
            job_id: 'bulk-plain-1',
            recipe: 'Build Power Cell',
            runs: 1,
            venue: 'Station Workshop',
            message: 'Queued.',
          },
        ],
        summary: { total: 2, succeeded: 2, failed: 0 },
      },
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Package');
  expect(stdout).toContain('Label');
  expect(stdout).toContain('pkg-bulk-1');
  expect(stdout).toContain('Bulk Plates');
  expect(stdout).not.toContain('=== Response ===');
});

test('packaged craft quote renders Ready: yes when ready is true', () => {
  const rendered = renderStructuredResult(
    'craft',
    {
      details: {
        action: 'craft',
        kind: 'packaged_quote',
        dry_run: true,
        recipe: 'Iron Plates',
        mode: 'craft',
        quantity: 1,
        runs: 1,
        venue: 'Station Workshop',
        venue_type: 'workshop',
        facility_id: 'workshop:player:station',
        cost: {
          inputs: [{ item_id: 'iron_ore', name: 'Iron Ore', quantity: 2 }],
        },
        credits_total: 0,
        effective_time_per_run: 2,
        est_completion_tick: 1131800,
        ready: true,
        gates: {
          package_match: { ok: true },
          inputs: { ok: true },
          credits: { ok: true },
          logistics: { ok: true },
          cargo_container: { ok: true },
          output_size: { ok: true },
          destination_room: { ok: true },
        },
        produces: [{ item_id: 'iron_plate', name: 'Iron Plate', quantity: 1 }],
        message: 'Quote only — ready to queue.',
      },
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('=== Craft Quote ===');
  expect(stdout).toContain('Ready: yes');
  expect(stdout).not.toContain('Ready: no');
  expect(stdout).not.toContain('=== Response ===');
});

test('places Label column after Job when only label is present on craft queue', () => {
  const rendered = renderStructuredResult(
    'craft',
    {
      details: {
        kind: 'queue',
        jobs: [
          {
            job_id: 'label-only-1',
            label: 'Named Job',
            recipe: 'Build Power Cell',
            mode: 'craft',
            runs_done: 0,
            runs_remaining: 1,
            runs_total: 1,
            venue: 'Station Workshop',
            facility_id: 'workshop:player:station',
            eta_ticks: 2,
            status: 'queued',
            position: 0,
          },
        ],
      },
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Label');
  expect(stdout).toContain('Named Job');
  expect(stdout).not.toContain('Package');
  // Header adjacency: Label should sit next to Job, not trailing after Pos.
  const header = stdout.split('\n').find((line) => line.includes('Job') && line.includes('Label'));
  expect(header).toBeDefined();
  if (header === undefined) throw new Error('expected craft queue header with Job and Label');
  expect(header.indexOf('Job')).toBeLessThan(header.indexOf('Label'));
  expect(header.indexOf('Label')).toBeLessThan(header.indexOf('Recipe'));
  expect(stdout).not.toContain('=== Response ===');
});

test('places Label column after Job when only label is present on bulk craft results', () => {
  const rendered = renderStructuredResult(
    'craft',
    {
      details: {
        action: 'bulk',
        mode: 'craft',
        results: [
          {
            index: 0,
            success: true,
            job_id: 'bulk-label-1',
            label: 'Sealed Label Only',
            recipe: 'Iron Plates',
            runs: 2,
            venue: 'Own Smelter',
            message: 'Queued.',
          },
        ],
        summary: { total: 1, succeeded: 1, failed: 0 },
      },
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Label');
  expect(stdout).toContain('Sealed Label Only');
  expect(stdout).not.toContain('Package');
  const header = stdout.split('\n').find((line) => line.includes('Job') && line.includes('Label'));
  expect(header).toBeDefined();
  if (header === undefined) throw new Error('expected bulk craft header with Job and Label');
  expect(header.indexOf('Job')).toBeLessThan(header.indexOf('Label'));
  expect(header.indexOf('Label')).toBeLessThan(header.indexOf('Recipe'));
  expect(stdout).not.toContain('=== Response ===');
});
