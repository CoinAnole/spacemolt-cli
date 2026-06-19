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
