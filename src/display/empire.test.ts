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

test('renders tax estimate exemption, bounties, guidance, and weekly statement', () => {
  const rendered = renderStructuredResult('get_tax_estimate', taxEstimateFixture, options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toContain('Inactivity exempt: false');
  expect(stdout).toContain('Outstanding bounties:');
  expect(stdout).toContain('  solarian: 125 cr');
  expect(stdout).toContain('Payment guidance: Use pay_bounty');
  expect(stdout).toContain('=== Latest Weekly Statement ===');
  expect(stdout).toContain('solarian owed 110 cr, paid 110 cr, unpaid 0 cr');
  expect(stdout).toContain('Total unpaid: 0 cr');
  expect(stdout).toContain('Total owed: 710 cr');
  expect(stdout).toContain('Tax prepaid: 150 cr');
  expect(stdout).toContain('Market sales: 30,000 cr');
});

test('renders inactivity exempt true', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    { ...taxEstimateFixture, inactivity_exempt: true },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Inactivity exempt: true');
});

test('renders outstanding bounties none when the list is empty', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    { ...taxEstimateFixture, outstanding_bounties: [] },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Outstanding bounties: none');
  expect(stdout).not.toContain('solarian:');
});

test('omits outstanding bounties when the field is absent', () => {
  const { outstanding_bounties: _, ...fixture } = taxEstimateFixture;
  const stdout = renderStructuredResult('get_tax_estimate', fixture, options, context).stdout.join('\n');

  expect(stdout).not.toContain('Outstanding bounties');
});

test('omits payment guidance when the field is absent', () => {
  const { payment_guidance: _, ...fixture } = taxEstimateFixture;
  const stdout = renderStructuredResult('get_tax_estimate', fixture, options, context).stdout.join('\n');

  expect(stdout).not.toContain('Payment guidance:');
});

test('omits payment guidance when the field is empty', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    { ...taxEstimateFixture, payment_guidance: '' },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).not.toContain('Payment guidance:');
});

test('omits the weekly statement section when latest_statement is absent', () => {
  const { latest_statement: _, ...fixture } = taxEstimateFixture;
  const stdout = renderStructuredResult('get_tax_estimate', fixture, options, context).stdout.join('\n');

  expect(stdout).not.toContain('=== Latest Weekly Statement ===');
});

test('renders statement period started as none for unix epoch', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      ...taxEstimateFixture,
      latest_statement: {
        ...taxEstimateFixture.latest_statement,
        period_started_at: '1970-01-01T00:00:00Z',
      },
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Period started: none');
});

test('omits statement period started when the timestamp is unparseable', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      ...taxEstimateFixture,
      latest_statement: {
        ...taxEstimateFixture.latest_statement,
        period_started_at: 'not-a-date',
      },
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).not.toContain('Period started');
});

test('omits statement income by category when the map is empty', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      ...taxEstimateFixture,
      latest_statement: {
        ...taxEstimateFixture.latest_statement,
        income_by_category: {},
      },
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).not.toContain('Income by category');
});
