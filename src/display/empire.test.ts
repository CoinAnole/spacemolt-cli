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
