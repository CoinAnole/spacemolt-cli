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
  expect(stdout).toContain('Station');
  expect(stdout).toContain('nova_terra_central');
  expect(stdout).toContain('Iron Refinery');
  expect(stdout).not.toContain('e85ab866c46f5b3cb6c3dde515de1533');
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
