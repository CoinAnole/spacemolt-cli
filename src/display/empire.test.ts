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

test('formats an out-of-range bounty with locale digits', () => {
  const bounty = 9007199254740993n;
  const rendered = renderStructuredResult(
    'get_tax_estimate',
    {
      ...taxEstimateFixture,
      outstanding_bounties: [{ empire: 'solarian', bounty }],
    },
    options,
    context,
  );

  const stdout = rendered.stdout.join('\n');
  expect(rendered.success).toBe(true);
  expect(stdout).toContain(`solarian: ${bounty.toLocaleString()} cr`);
  expect(stdout).not.toContain('9007199254740992');
});

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

test('an empty note matches an omitted note and does not print Estimate only', () => {
  const { note: _, ...omittedNote } = taxEstimateFixture;
  const omitted = renderStructuredResult('get_tax_estimate', omittedNote, options, context).stdout.join('\n');
  const empty = renderStructuredResult(
    'get_tax_estimate',
    { ...taxEstimateFixture, note: '' },
    options,
    context,
  ).stdout.join('\n');

  expect(empty).toBe(omitted);
  expect(empty).not.toContain('Estimate only');
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

test('omits Preview when the weekly statement preview field is absent', () => {
  const fixture = structuredClone(taxEstimateFixture);
  delete (fixture.latest_statement as { preview?: unknown }).preview;
  const stdout = renderStructuredResult('get_tax_estimate', fixture, options, context).stdout.join('\n');

  expect(stdout).toContain('=== Latest Weekly Statement ===');
  expect(stdout).not.toContain('Preview:');
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

test('renders unknown for an empty outstanding bounty record', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    { ...taxEstimateFixture, outstanding_bounties: [{}] },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('unknown: unknown');
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

test('renders a millisecond epoch string as Period started: none', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      ...taxEstimateFixture,
      latest_statement: {
        ...taxEstimateFixture.latest_statement,
        period_started_at: '1970-01-01T00:00:00.000Z',
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

test('omits Period started when latest_statement period_started_at is null', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      ...taxEstimateFixture,
      latest_statement: {
        ...taxEstimateFixture.latest_statement,
        period_started_at: null,
      },
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('=== Latest Weekly Statement ===');
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

test('omits statement Ships when the ships array is empty', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      ...taxEstimateFixture,
      latest_statement: {
        ...taxEstimateFixture.latest_statement,
        ships: [],
      },
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).not.toContain('Ships:');
});

test('prints the singular Empire Policy heading for one empire', () => {
  const stdout = renderStructuredResult(
    'get_empire_info',
    {
      empires: [{ empire_id: 'solarian' }],
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('=== Empire Policy ===');
  expect(stdout).not.toContain('=== Empire Policies ===');
});

test('prints unknown for a missing empire id under the singular Empire Policy heading', () => {
  const stdout = renderStructuredResult(
    'get_empire_info',
    {
      empires: [{}],
    },
    options,
    context,
  ).stdout.join('\n');
  const lines = stdout.split('\n');
  const headingIndex = lines.indexOf('=== Empire Policy ===');

  expect(headingIndex).toBeGreaterThanOrEqual(0);
  expect(lines.slice(headingIndex + 1)).toContain('unknown');
  expect(stdout).not.toContain('=== Empire Policies ===');
});

test('prints Citizenship: Closed when citizenship is closed', () => {
  const stdout = renderStructuredResult(
    'get_empire_info',
    {
      empires: [{ empire_id: 'solarian', citizenship_open: false }],
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Citizenship: Closed');
});

test('prints Citizenship: Open for open citizenship with no requirements', () => {
  const stdout = renderStructuredResult(
    'get_empire_info',
    {
      empires: [{ empire_id: 'solarian', citizenship_open: true }],
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Citizenship: Open');
});

test('prints (None) under Empire Policies when empires is empty', () => {
  const stdout = renderStructuredResult(
    'get_empire_info',
    {
      empires: [],
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('=== Empire Policies ===');
  expect(stdout).toContain('(None)');
});

test('prints exclusive on an auto-approved empire citizenship', () => {
  const stdout = renderStructuredResult(
    'get_empire_info',
    {
      empires: [
        {
          empire_id: 'solarian',
          citizenship_auto_approve: true,
          citizenship_exclusive: true,
        },
      ],
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Auto-approved; exclusive');
});

test('prints an open-ended tax bracket when upper_bound is omitted', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      income_tax: [
        {
          brackets: [{ lower_bound: 0 }],
        },
      ],
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('0+');
});

test('prints foreign income deductions when the bps map is present', () => {
  const stdout = renderStructuredResult(
    'get_empire_info',
    {
      empires: [
        {
          empire_id: 'solarian',
          foreign_income_tax_deduction: { crimson: 200 },
        },
      ],
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Foreign Income Deductions: crimson 2%');
});

test('prints the facility rent multiplier as a Fees rent percentage', () => {
  const stdout = renderStructuredResult(
    'get_empire_info',
    {
      empires: [
        {
          empire_id: 'solarian',
          facility_rent_multiplier_bps: 15000,
        },
      ],
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Fees: rent 150%');
});

test('prints customs evasion bounty and reputation loss, including 0, and not eviction grace', () => {
  const stdout = renderStructuredResult(
    'get_empire_info',
    {
      empires: [
        {
          empire_id: 'solarian',
          bounty_attack: 500,
          bounty_kill: 2000,
          bounty_customs_evasion: 1000,
          bounty_hold: 40,
          bounty_plunder: 70,
          rep_penalty_attack: 5,
          rep_penalty_kill: 10,
          rep_penalty_customs_evasion: 8,
          rep_penalty_hold: 3,
          rep_penalty_plunder: 6,
          eviction_grace_cycles: 2,
          listing_fee_bps: 200,
        },
        {
          empire_id: 'voidborn',
          bounty_attack: 500,
          bounty_kill: 2000,
          bounty_customs_evasion: 0,
          rep_penalty_attack: 5,
          rep_penalty_kill: 10,
          rep_penalty_customs_evasion: 0,
        },
      ],
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Bounties: Attack bounty 500 cr, kill bounty 2,000 cr, customs evasion bounty 1,000 cr');
  expect(stdout).toContain('Bounties: Attack bounty 500 cr, kill bounty 2,000 cr, customs evasion bounty 0 cr');
  expect(stdout).toContain('Reputation: Attack -5, kill -10, customs evasion -8');
  expect(stdout).toContain('Reputation: Attack -5, kill -10, customs evasion -0');
  expect(stdout).toContain('Fees: Listing 2%');
  expect(stdout).not.toContain('eviction grace');
  expect(stdout).not.toContain('hold');
  expect(stdout).not.toContain('plunder');
  expect(stdout).not.toContain('customs evasion +');
  expect(stdout).not.toContain('customs_evasion_policed_space');
});

test('prints customs evasion bounty and reputation for bigint values, including 0', () => {
  const bounty = 1000n;
  const penalty = 0n;
  const stdout = renderStructuredResult(
    'get_empire_info',
    {
      empires: [
        {
          empire_id: 'solarian',
          bounty_customs_evasion: bounty,
          rep_penalty_customs_evasion: penalty,
        },
      ],
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain(`Bounties: customs evasion bounty ${bounty.toLocaleString()} cr`);
  expect(stdout).toContain(`Reputation: customs evasion -${penalty.toLocaleString()}`);
  expect(stdout).not.toContain('customs evasion +');
});

test('omits customs evasion and eviction grace when the keys are missing or not finite numbers', () => {
  const stdout = renderStructuredResult(
    'get_empire_info',
    {
      empires: [
        {
          empire_id: 'solarian',
          bounty_attack: 500,
          bounty_kill: 2000,
          rep_penalty_attack: 5,
          rep_penalty_kill: 10,
          eviction_grace_cycles: 2,
        },
        {
          empire_id: 'voidborn',
          bounty_customs_evasion: '0',
          rep_penalty_customs_evasion: Number.NaN,
          bounty_hold: 40,
          bounty_plunder: 70,
        },
      ],
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Bounties: Attack bounty 500 cr, kill bounty 2,000 cr');
  expect(stdout).toContain('Reputation: Attack -5, kill -10');
  expect(stdout).not.toContain('customs evasion');
  expect(stdout).not.toContain('eviction grace');
  expect(stdout).not.toContain('hold');
  expect(stdout).not.toContain('plunder');
});

test('prints a near-integer sales tax bps as a whole percent', () => {
  const stdout = renderStructuredResult(
    'get_empire_info',
    {
      empires: [
        {
          empire_id: 'solarian',
          sales_tax_bps: 100.1,
        },
      ],
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Taxes: Sales 1%');
  expect(stdout).not.toContain('1.00');
  expect(stdout).not.toContain('1.');
});

test('prints an omitted tax-bracket lower_bound as brackets 0-100', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      income_tax: [
        {
          brackets: [{ upper_bound: 100 }],
        },
      ],
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('brackets 0-100');
});

test('prints reputation restore without a cap', () => {
  const stdout = renderStructuredResult(
    'get_empire_info',
    {
      empires: [
        {
          empire_id: 'solarian',
          bounty_rep_restoration_bps: 5000,
        },
      ],
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Reputation: restore 50%');
  expect(stdout).not.toContain(' cap ');
});

test('omits trade fill when only the cap is set', () => {
  const stdout = renderStructuredResult(
    'get_empire_info',
    {
      empires: [
        {
          empire_id: 'solarian',
          rep_decay_amount: 1,
          rep_trade_fill_cap: 2,
        },
      ],
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Reputation: decay 1');
  expect(stdout).not.toContain('trade fill');
});

test('omits a one-sided reputation baseline', () => {
  const stdout = renderStructuredResult(
    'get_empire_info',
    {
      empires: [
        {
          empire_id: 'solarian',
          rep_decay_amount: 1,
          rep_baseline_citizen: 20,
        },
      ],
    },
    options,
    context,
  ).stdout.join('\n');

  const reputationLine = stdout.split('\n').find((line) => line.includes('Reputation:'));
  expect(reputationLine).toContain('decay 1');
  expect(reputationLine).not.toContain('baseline');
});

test('prints last_assessed_at 1779926400000 as Last assessed: 2026-05-28 00:00 UTC', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      ...taxEstimateFixture,
      last_assessed_at: 1779926400000,
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Last assessed: 2026-05-28 00:00 UTC');
});

test('prints last_assessed_at 1e20 as Last assessed with the locale number and without UTC', () => {
  const lastAssessedAt = 1e20;
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      ...taxEstimateFixture,
      last_assessed_at: lastAssessedAt,
    },
    options,
    context,
  ).stdout.join('\n');

  const lastAssessed = stdout.split('\n').find((line) => line.startsWith('Last assessed:'));
  expect(lastAssessed).toBe(`Last assessed: ${lastAssessedAt.toLocaleString()}`);
  expect(lastAssessed).not.toContain('UTC');
});

test('prints next_assessment_approx_seconds 0 as Next assessment approx: 0s', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      ...taxEstimateFixture,
      next_assessment_approx_seconds: 0,
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Next assessment approx: 0s');
});

test('renders numeric period_started_at 0 as Period started: none', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      ...taxEstimateFixture,
      latest_statement: {
        ...taxEstimateFixture.latest_statement,
        period_started_at: 0,
      },
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Period started: none');
});

test('renders numeric assessed_at 0 as Assessed at: 1970-01-01 00:00 UTC', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      ...taxEstimateFixture,
      latest_statement: {
        ...taxEstimateFixture.latest_statement,
        assessed_at: 0,
      },
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Assessed at: 1970-01-01 00:00 UTC');
  expect(stdout).not.toContain('Assessed at: none');
});

test('prints statement tick 0', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      ...taxEstimateFixture,
      latest_statement: {
        ...taxEstimateFixture.latest_statement,
        tick: 0,
      },
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Tick: 0');
});

test('prints an income_tax record note flat instead of the raw response dump', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      income_tax: { note: 'flat' },
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Income tax: note flat');
  expect(stdout).not.toContain('=== Response ===');
});

test('prints an income_tax record note flat and omits nested records and arrays', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      income_tax: {
        note: 'flat',
        detail: { kind: 'nested-detail-token' },
        tags: ['nested-array-token'],
      },
    },
    options,
    context,
  ).stdout.join('\n');

  const incomeLine = stdout.split('\n').find((line) => line.startsWith('Income tax:'));
  expect(incomeLine).toBe('Income tax: note flat');
  expect(stdout).not.toContain('nested-detail-token');
  expect(stdout).not.toContain('nested-array-token');
});

test('prints an income_tax string withheld instead of the raw response dump', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      income_tax: 'withheld',
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Income tax: withheld');
  expect(stdout).not.toContain('=== Response ===');
});

test('prints a taxable_income_by_source string withheld instead of the raw response heading', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      income_tax: '',
      taxable_income_by_source: 'withheld',
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Income by source: withheld');
  expect(stdout).not.toContain('=== Response ===');
});

test('prints Income by source: source when taxable_income_by_source is one empty record', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      income_tax: '',
      taxable_income_by_source: [{}],
    },
    options,
    context,
  ).stdout.join('\n');

  const sourceLine = stdout.split('\n').find((line) => line.startsWith('Income by source:'));
  expect(sourceLine).toBe('Income by source: source');
  expect(stdout).not.toContain('=== Response ===');
});

test('prints an assessed_property_by_ship string withheld instead of the raw response heading', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      income_tax: '',
      assessed_property_by_ship: 'withheld',
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Property by ship: withheld');
  expect(stdout).not.toContain('=== Response ===');
});

test('prints Property by ship: ship when assessed_property_by_ship is [{}]', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      income_tax: '',
      assessed_property_by_ship: [{}],
    },
    options,
    context,
  ).stdout.join('\n');

  const propertyLine = stdout.split('\n').find((line) => line.startsWith('Property by ship:'));
  expect(propertyLine).toBe('Property by ship: ship');
});

test('prints a sales_tax_rates record instead of the raw response dump', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      sales_tax_rates: { crimson: 200 },
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Sales tax rates: crimson 2%');
  expect(stdout).not.toContain('=== Response ===');
});

test('prints Sales tax rates: withheld when sales_tax_rates is the string withheld', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      sales_tax_rates: 'withheld',
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Sales tax rates: withheld');
  expect(stdout).not.toContain('=== Response ===');
});

test('renders an empty sales-tax reason without a parenthetical', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      sales_tax_rates: [{ empire: 'solarian', rate_bps: 100, reason: '' }],
    },
    options,
    context,
  ).stdout.join('\n');

  const ratesLine = stdout.split('\n').find((line) => line.startsWith('Sales tax rates:'));
  expect(ratesLine).toBe('Sales tax rates: solarian 1%');
});

test('prints Sales tax rates: rate when sales_tax_rates is one empty record', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      sales_tax_rates: [{}],
    },
    options,
    context,
  ).stdout.join('\n');

  const ratesLine = stdout.split('\n').find((line) => line.startsWith('Sales tax rates:'));
  expect(ratesLine).toBe('Sales tax rates: rate');
});

test('prints the Tax Estimate header and omits Income tax when income_tax is empty', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      income_tax: '',
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('=== Tax Estimate ===');
  expect(stdout).not.toContain('Income tax');
});

test('prints the Tax Estimate header and omits Sales tax rates when sales_tax_rates is an empty array', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      sales_tax_rates: [],
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('=== Tax Estimate ===');
  expect(stdout).not.toContain('Sales tax rates');
});

test('prints Income tax: entry when income_tax is an empty record', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      income_tax: [{}],
    },
    options,
    context,
  ).stdout.join('\n');

  const incomeLine = stdout.split('\n').find((line) => line.startsWith('Income tax:'));
  expect(incomeLine).toBe('Income tax: entry');
});

test('prints Income tax: entry and does not print bracket when income_tax brackets are [{}]', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      income_tax: [{ brackets: [{}] }],
    },
    options,
    context,
  ).stdout.join('\n');

  const incomeLine = stdout.split('\n').find((line) => line.startsWith('Income tax:'));
  expect(incomeLine).toBe('Income tax: entry');
  expect(stdout).not.toContain('bracket');
});

test('omits Foreign Overrides when foreign_sales_tax_bps is an empty map', () => {
  const stdout = renderStructuredResult(
    'get_empire_info',
    {
      empires: [
        {
          empire_id: 'solarian',
          foreign_sales_tax_bps: {},
        },
      ],
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('=== Empire Policy ===');
  expect(stdout).not.toContain('Foreign Overrides');
});

test('omits Foreign Overrides when every foreign sales tax bps is non-numeric', () => {
  const stdout = renderStructuredResult(
    'get_empire_info',
    {
      empires: [
        {
          empire_id: 'solarian',
          foreign_sales_tax_bps: { crimson: 'nope' },
        },
      ],
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('=== Empire Policy ===');
  expect(stdout).not.toContain('Foreign Overrides');
  expect(stdout).not.toContain('nope');
});

test('prints Contraband None when contraband_items is omitted', () => {
  const stdout = renderStructuredResult(
    'get_empire_info',
    {
      empires: [
        {
          empire_id: 'solarian',
        },
      ],
    },
    options,
    context,
  ).stdout.join('\n');

  expect(stdout).toContain('Contraband: None');
});

test('prints property tax brackets when a bracket has lower and upper bounds', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      property_tax: [
        {
          brackets: [{ lower_bound: 10, upper_bound: 250 }],
        },
      ],
    },
    options,
    context,
  ).stdout.join('\n');

  const propertyLine = stdout.split('\n').find((line) => line.startsWith('Property tax:'));
  expect(propertyLine).toContain('brackets 10-250');
});

test('prints property tax brackets 0-0 when upper_bound is 0', () => {
  const stdout = renderStructuredResult(
    'get_tax_estimate',
    {
      property_tax: [
        {
          brackets: [{ upper_bound: 0 }],
        },
      ],
    },
    options,
    context,
  ).stdout.join('\n');

  const propertyLine = stdout.split('\n').find((line) => line.startsWith('Property tax:'));
  expect(propertyLine).toContain('brackets 0-0');
  expect(propertyLine).not.toContain('0+');
});
