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
  expect(stdout).not.toContain('=== Response ===');
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
  expect(stdout).toContain('Hull: 900/1000');
  expect(stdout).toContain('Shield: 200/300');
  expect(stdout).toContain('Guns: 40 DPS');
  expect(stdout).toContain('Facilities: 3');
  expect(stdout).toContain('A busy trade hub.');
  expect(stdout).not.toContain('=== Response ===');
});
