import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { taxEstimateFixture } from './generic.fixtures.ts';
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
      return new Date('2026-06-21T00:00:00.000Z');
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

test('renders personal tax prepaid balance', () => {
  const rendered = renderStructuredResult(
    'get_tax_estimate',
    {
      ...taxEstimateFixture,
      tax_prepaid: 150,
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Tax prepaid: 150 cr');
});

test('renders inactive tax collection preview flag', () => {
  const rendered = renderStructuredResult(
    'get_tax_estimate',
    {
      ...taxEstimateFixture,
      tax_collection_active: false,
      note: 'Tax collection is in preview mode.',
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Collection active: false');
  expect(stdout).toContain('Tax collection is in preview mode.');
});

test('renders personal market margin tax fields', () => {
  const rendered = renderStructuredResult(
    'get_tax_estimate',
    {
      ...taxEstimateFixture,
      market_sales_to_date: 10000,
      market_cost_of_goods_deducted: 6500,
      taxable_market_income: 3500,
      market_loss_carryforward: 1200,
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Market sales: 10,000 cr');
  expect(stdout).toContain('Cost of goods deducted: 6,500 cr');
  expect(stdout).toContain('Taxable market income: 3,500 cr');
  expect(stdout).toContain('Market loss carryforward: 1,200 cr');
});
