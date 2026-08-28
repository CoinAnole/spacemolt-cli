import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
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

test('renders package inspect results with contents table', () => {
  const rendered = renderStructuredResult(
    'inspect',
    {
      id: 'package:pkg_abc',
      kind: 'package',
      source: 'cargo',
      package: {
        package_id: 'pkg_abc',
        label: 'Main Belt Survey Supplies',
        size: 100,
        created_at: '2026-07-16T12:00:00Z',
        owner: { type: 'player', id: 'p1', name: 'PilotOne' },
        creator: {
          player_id: 'p1',
          username: 'PilotOne',
          faction: { type: 'player_faction', id: 'f1', name: 'Survey Corps', tag: 'SRV' },
        },
        contents: [
          { item_id: 'iron_ore', name: 'Iron Ore', quantity: 20, size: 20 },
          { item_id: 'copper_ore', name: 'Copper Ore', quantity: 10, size: 10 },
        ],
      },
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('=== Inspect: package:pkg_abc ===');
  expect(stdout).toContain('Kind: package');
  expect(stdout).toContain('Source: cargo');
  expect(stdout).toContain('Package: Main Belt Survey Supplies');
  expect(stdout).toContain('ID: pkg_abc');
  expect(stdout).toContain('Size: 100');
  expect(stdout).toContain('Owner: PilotOne (player)');
  expect(stdout).toContain('Creator: PilotOne / Survey Corps [SRV]');
  expect(stdout).toContain('Iron Ore');
  expect(stdout).toContain('Copper Ore');
  expect(stdout).toContain('iron_ore');
  // Gated optional: no nested shipment → no Shipment section
  expect(stdout).not.toContain('Shipment');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders package inspect freight shipment summary when nested shipment is present', () => {
  const rendered = renderStructuredResult(
    'inspect',
    {
      id: 'package:pkg_freight',
      kind: 'package',
      source: 'cargo',
      package: {
        package_id: 'pkg_freight',
        label: 'Sealed Reactor Parts',
        size: 50,
        created_at: '2026-07-26T12:00:00Z',
        owner: { type: 'player', id: 'p1', name: 'PilotOne' },
        creator: {
          player_id: 'p1',
          username: 'PilotOne',
          faction: { type: 'player_faction', id: 'f1', name: 'Survey Corps', tag: 'SRV' },
        },
        contents: [{ item_id: 'reactor_parts', name: 'Reactor Parts', quantity: 1, size: 50 }],
        // OpenAPI InspectPackageShipment required + optional late fee
        shipment: {
          shipment_id: 'shipment-late-1',
          status: 'in_transit',
          role: 'carrier',
          destination_base_id: 'sirius_observatory',
          destination_name: 'Sirius Observatory',
          destination_system: 'Sirius',
          base_reward: 22000,
          payout_if_delivered_now: 0,
          failure_debt: 72000,
          ticks_to_deadline: -15,
          ticks_to_recovery_deadline: 2865,
          late: true,
          late_fee_if_delivered_now: 400,
        },
      },
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('Package: Sealed Reactor Parts');
  expect(stdout).toContain('Shipment');
  expect(stdout).toContain('Contract: shipment-late-1');
  expect(stdout).toContain('Status: in_transit');
  expect(stdout).toContain('Role: carrier');
  // Design destination: name / system (base_id)
  expect(stdout).toContain('Destination: Sirius Observatory / Sirius (sirius_observatory)');
  expect(stdout).toContain('Base reward: 22,000 cr');
  expect(stdout).toContain('Payout if delivered now: 0 cr');
  expect(stdout).toContain('Failure debt: 72,000 cr');
  expect(stdout).toContain('Late fee if delivered now: 400 cr');
  // Negative overdue ticks must not be clamped (exact values)
  expect(stdout).toContain('Ticks to deadline: -15 ticks');
  expect(stdout).toContain('Ticks to recovery deadline: 2,865 ticks');
  expect(stdout).toContain('Late: yes');
  // Shipment section appears before contents table
  expect(stdout.indexOf('Shipment')).toBeLessThan(stdout.indexOf('=== Contents ==='));
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('[object Object]');
});

test('omits gated shipment fields when optional late fee is absent and late is false', () => {
  const rendered = renderStructuredResult(
    'inspect',
    {
      id: 'package:pkg_on_time',
      kind: 'package',
      package: {
        package_id: 'pkg_on_time',
        label: 'On-time run',
        size: 10,
        created_at: '2026-07-26T12:00:00Z',
        owner: { type: 'player', id: 'p1', name: 'PilotOne' },
        creator: { player_id: 'p1', username: 'PilotOne' },
        contents: [],
        shipment: {
          shipment_id: 'shipment-on-time-1',
          status: 'in_transit',
          role: 'carrier',
          destination_base_id: 'nova_central',
          destination_name: 'Nova Central',
          destination_system: 'centauri',
          base_reward: 12000,
          payout_if_delivered_now: 12000,
          failure_debt: 500,
          ticks_to_deadline: 28,
          ticks_to_recovery_deadline: 2908,
          late: false,
        },
      },
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('Late: no');
  expect(stdout).toContain('Contract: shipment-on-time-1');
  expect(stdout).toContain('Destination: Nova Central / centauri (nova_central)');
  expect(stdout).toContain('Payout if delivered now: 12,000 cr');
  // Optional late fee gated — omit line entirely when absent
  expect(stdout).not.toContain('Late fee if delivered now');
  expect(stdout).not.toContain('=== Response ===');
});

test('suppresses bare Shipment heading when shipment record has no formattable fields', () => {
  const rendered = renderStructuredResult(
    'inspect',
    {
      id: 'package:pkg_empty_ship',
      kind: 'package',
      package: {
        package_id: 'pkg_empty_ship',
        label: 'Empty shipment bag',
        size: 1,
        created_at: '2026-07-26T12:00:00Z',
        owner: { type: 'player', id: 'p1', name: 'PilotOne' },
        creator: { player_id: 'p1', username: 'PilotOne' },
        contents: [],
        shipment: {},
      },
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('Package: Empty shipment bag');
  expect(stdout).not.toContain('Shipment');
  expect(stdout).not.toContain('Contract:');
  expect(stdout).not.toContain('=== Response ===');
});

test('ignores non-record package.shipment values', () => {
  const rendered = renderStructuredResult(
    'inspect',
    {
      id: 'package:pkg_bad_ship',
      kind: 'package',
      package: {
        package_id: 'pkg_bad_ship',
        label: 'Bad shipment type',
        size: 1,
        created_at: '2026-07-26T12:00:00Z',
        owner: { type: 'player', id: 'p1', name: 'PilotOne' },
        creator: { player_id: 'p1', username: 'PilotOne' },
        contents: [],
        shipment: 'not-a-record',
      },
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).not.toContain('Shipment');
  expect(stdout).not.toContain('[object Object]');
});

test('renders system inspect results with faction intel', () => {
  const rendered = renderStructuredResult(
    'inspect',
    {
      id: 'sol',
      kind: 'system',
      system: {
        system_id: 'sol',
        name: 'Sol',
        empire: 'solarian',
        online: 12,
        poi_count: 4,
        position: { x: 0, y: 0 },
        connections: ['alpha_centauri', 'barnards_star'],
        visited: true,
        visited_at: '2026-01-01T00:00:00Z',
        description: 'The cradle of humanity.',
      },
      faction_system_intel: {
        name: 'Sol',
        empire: 'solarian',
        pois: [
          { id: 'earth_station', name: 'Earth Station' },
          { id: 'main_belt', name: 'Main Belt' },
        ],
      },
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('=== Inspect: sol ===');
  expect(stdout).toContain('Kind: system');
  expect(stdout).toContain('System: Sol');
  expect(stdout).toContain('ID: sol');
  expect(stdout).toContain('Empire: solarian');
  expect(stdout).toContain('Connections: alpha_centauri, barnards_star');
  expect(stdout).toContain('Visited: true');
  expect(stdout).toContain('Visited at: 2026-01-01T00:00:00Z');
  expect(stdout).toContain('The cradle of humanity.');
  expect(stdout).toContain('Faction intel');
  expect(stdout).toContain('Earth Station');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders catalog inspect results for an item lookup with details', () => {
  const rendered = renderStructuredResult(
    'inspect',
    {
      id: 'iron_ore',
      kind: 'catalog',
      catalog: {
        type: 'items',
        items: [
          {
            id: 'iron_ore',
            name: 'Iron Ore',
            category: 'ore',
            size: 1,
            base_value: 2,
            description: 'Raw iron-bearing rock.',
          },
        ],
        page: 1,
        total_pages: 1,
        total: 1,
      },
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('=== Inspect: iron_ore ===');
  expect(stdout).toContain('Kind: catalog');
  expect(stdout).toContain('Catalog (items)');
  expect(stdout).toContain('Iron Ore');
  expect(stdout).toContain('iron_ore');
  expect(stdout).toContain('Details');
  expect(stdout).toContain('Raw iron-bearing rock.');
  expect(stdout).toContain('Page 1/1');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders single recipe catalog inspect with inputs and outputs', () => {
  const rendered = renderStructuredResult(
    'inspect',
    {
      id: 'pack_package',
      kind: 'catalog',
      catalog: {
        type: 'recipes',
        recipes: [
          {
            id: 'pack_package',
            name: 'Pack Package',
            category: 'logistics',
            crafting_time: 1,
            facility_only: true,
            package_operation: 'pack',
            description: 'Bundle mixed items into a labeled package.',
            inputs: [
              { item_id: 'cargo_container', name: 'Cargo Container', quantity: 1 },
              { item_id: 'iron_ore', name: 'Iron Ore', quantity: 20 },
            ],
            outputs: [{ item_id: 'package', name: 'Package', quantity: 1 }],
          },
        ],
      },
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('Catalog (recipes)');
  expect(stdout).toContain('Pack Package');
  expect(stdout).toContain('Details');
  expect(stdout).toContain('Bundle mixed items into a labeled package.');
  expect(stdout).toContain('Inputs:');
  expect(stdout).toContain('Cargo Container');
  expect(stdout).toContain('Outputs:');
  expect(stdout).toContain('Facility only: yes');
  expect(stdout).toContain('Package operation: pack');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders unpack recipe package_operation string', () => {
  const rendered = renderStructuredResult(
    'inspect',
    {
      id: 'unpack_package',
      kind: 'catalog',
      catalog: {
        type: 'recipes',
        recipes: [
          {
            id: 'unpack_package',
            name: 'Unpack Package',
            category: 'logistics',
            crafting_time: 5,
            package_operation: 'unpack',
            description: 'Open a cargo package.',
          },
        ],
      },
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('Package operation: unpack');
  expect(stdout).not.toContain('Package operation: yes');
});

test('renders ammo catalog effect without [object Object]', () => {
  const rendered = renderStructuredResult(
    'inspect',
    {
      id: 'antimatter_torpedoes',
      kind: 'catalog',
      catalog: {
        type: 'items',
        items: [
          {
            id: 'antimatter_torpedoes',
            name: 'Antimatter Torpedoes',
            category: 'ammo',
            size: 1,
            base_value: 500,
            description: 'The most destructive single projectile in known space.',
            effect: {
              type: 'ammo',
              ammo: {
                damage_mod: 0.5,
                splash_pct: 0.6,
                hull_damage_mod: 1.0,
              },
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
  expect(stdout).toContain('Effect:');
  expect(stdout).toContain('type: ammo');
  expect(stdout).toContain('damage');
  expect(stdout).toContain('splash');
  expect(stdout).not.toContain('[object Object]');
  expect(stdout).not.toContain('=== Response ===');
});

test('falls through when inspect has kind but no specialized payload', () => {
  const rendered = renderStructuredResult(
    'inspect',
    {
      id: 'mystery',
      kind: 'unknown_future_kind',
      mystery_field: 'still useful',
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  // Should not claim success with header-only output; generic path should show data.
  expect(stdout).not.toMatch(/^=== Inspect: mystery ===\s*Kind: unknown_future_kind\s*$/);
  expect(
    stdout.includes('mystery_field') || stdout.includes('still useful') || stdout.includes('=== Response ==='),
  ).toBe(true);
});

test('renders poi inspect results with description', () => {
  const rendered = renderStructuredResult(
    'inspect',
    {
      id: 'main_belt',
      kind: 'poi',
      poi: {
        summary: {
          id: 'main_belt',
          name: 'Main Belt',
          class: 'asteroid_belt',
          online: 3,
          position: { x: 1, y: 2 },
        },
        detail: {
          poi: {
            id: 'main_belt',
            name: 'Main Belt',
            class: 'asteroid_belt',
            description: 'A dense ring of iron-rich rock.',
          },
          services: ['mining', 'scan'],
          resources: [{ resource_id: 'iron_ore', remaining: 5000, richness: 3 }],
        },
      },
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('=== Inspect: main_belt ===');
  expect(stdout).toContain('POI: Main Belt');
  expect(stdout).toContain('Class: asteroid_belt');
  expect(stdout).toContain('A dense ring of iron-rich rock.');
  expect(stdout).toContain('Services: mining, scan');
  expect(stdout).toContain('iron_ore');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders base inspect results with station defences', () => {
  const rendered = renderStructuredResult(
    'inspect',
    {
      id: 'earth_station',
      kind: 'base',
      base: {
        base: {
          id: 'earth_station',
          poi_id: 'earth_orbit',
          name: 'Earth Station',
          description: 'A busy trade hub.',
          empire: 'solarian',
          faction_id: 'sol_gov',
          fuel: 100,
          max_fuel: 500,
          hull: 900,
          max_hull: 1000,
          shield: 200,
          max_shield: 300,
          armor: 50,
          weapon_dps: 40,
          weapon_reach: 2,
          public_access: true,
          facilities: ['market', 'shipyard', 'logistics'],
        },
        condition: {
          condition: 'good',
          condition_text: 'Good',
          satisfaction_pct: 88,
          satisfied_count: 7,
          total_service_infra: 8,
        },
      },
    },
    options,
    context,
  );

  expect(rendered.success).toBe(true);
  const stdout = rendered.stdout.join('\n');
  expect(stdout).toContain('=== Inspect: earth_station ===');
  expect(stdout).toContain('Station: Earth Station');
  expect(stdout).not.toContain('=== Station: Earth Station ===');
  expect(stdout).toMatch(/^ID: earth_station$/m);
  expect(stdout).toMatch(/^POI: earth_orbit$/m);
  expect(stdout).not.toContain('  ID: earth_station');
  expect(stdout).not.toContain('  POI: earth_orbit');
  expect(stdout).toContain('Hull: 900/1000');
  expect(stdout).toContain('Shield: 200/300');
  expect(stdout).toContain('Guns: 40 DPS');
  expect(stdout).toContain('Facilities: 3');
  expect(stdout).toContain('A busy trade hub.');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders base inspect identity without POI when poi_id is absent', () => {
  const rendered = renderStructuredResult(
    'inspect',
    {
      id: 'earth_station',
      kind: 'base',
      base: {
        base: {
          id: 'earth_station',
          name: 'Earth Station',
          empire: 'solarian',
        },
      },
    },
    options,
    context,
  );
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toMatch(/^ID: earth_station$/m);
  expect(stdout).not.toMatch(/^POI:/m);
  expect(stdout).not.toContain('=== Response ===');
});
