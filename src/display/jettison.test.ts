import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { renderStructuredResult } from './index.ts';
import { jettisonFreezeFixture, storageJettisonPartialFixture } from './jettison.fixtures.ts';

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
      return new Date('2026-10-23T00:00:00.000Z');
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

function renderJettison(command: string, result: Record<string, unknown>, extra: Partial<GlobalOptions> = {}) {
  const rendered = renderStructuredResult(command, structuredClone(result), { ...options, ...extra }, context);
  return {
    stdout: rendered.stdout.join('\n'),
    stderr: rendered.stderr.join('\n'),
  };
}

test('jettison prints conversion output, including the openapi example quantity', () => {
  const { stdout, stderr } = renderJettison('jettison', jettisonFreezeFixture);

  expect(stderr).toBe('');
  expect(stdout).toContain('=== Jettison ===');
  expect(stdout).toContain('Item Id: purified_water');
  expect(stdout).toContain('Item Name: Purified Water');
  expect(stdout).toContain('Quantity: 5');
  expect(stdout).toContain('Container Id: jettison_container');
  expect(stdout).toContain('Output Item Id: water_ice');
  expect(stdout).toContain('Output Quantity: 3');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('[object Object]');
});

test.each(['jettison', 'storage jettison', 'storage_jettison'])('%s prints conversion.output_quantity 0', (command) => {
  const { stdout, stderr } = renderJettison(command, {
    details: {
      action: 'jettison',
      item_id: 'purified_water',
      item_name: 'Purified Water',
      quantity: 3,
      message: 'Jettisoned 3 Purified Water.',
      conversion: {
        output_item_id: 'water_ice',
        output_quantity: 0,
      },
    },
  });

  expect(stderr).toBe('');
  expect(stdout).toContain('Output Item Id: water_ice');
  expect(stdout).toContain('Output Quantity: 0');
  expect(stdout).not.toContain('=== Response ===');
});

test('omitted conversion prints no output lines', () => {
  const { stdout, stderr } = renderJettison('jettison', {
    details: {
      action: 'jettison',
      item_id: 'ore_iron',
      quantity: 12,
    },
  });

  expect(stderr).toBe('');
  expect(stdout).toContain('Item Id: ore_iron');
  expect(stdout).toContain('Quantity: 12');
  expect(stdout).not.toContain('Output Item Id');
  expect(stdout).not.toContain('Output Quantity');
  expect(stdout).not.toContain('=== Response ===');
});

test('empty jettison results print (None)', () => {
  const { stdout, stderr } = renderJettison('storage jettison', {
    details: {
      action: 'bulk_jettison',
      results: [],
    },
  });

  expect(stderr).toBe('');
  expect(stdout).toContain('(None)');
  expect(stdout).not.toContain('=== Response ===');
});

test('bulk jettison lists each conversion, including 0', () => {
  const { stdout, stderr } = renderJettison('storage jettison', storageJettisonPartialFixture);

  expect(stderr).toBe('');
  expect(stdout).toContain('=== Bulk Jettison ===');
  expect(stdout).toContain('Failed: 0');
  expect(stdout).toContain('Item Id: purified_water');
  expect(stdout).toContain('Output Quantity: 3');
  expect(stdout).toContain('Item Id: coolant_fluid');
  expect(stdout).toContain('Output Quantity: 0');
  expect(stdout.indexOf('Output Quantity: 3')).toBeLessThan(stdout.indexOf('Output Quantity: 0'));
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('[object Object]');
});

test('failed jettison result prints Success: no', () => {
  const { stdout, stderr } = renderJettison('storage jettison', {
    details: {
      action: 'bulk_jettison',
      results: [
        {
          item_id: 'ore_iron',
          success: false,
        },
      ],
    },
  });

  expect(stderr).toBe('');
  expect(stdout).toContain('Success: no');
  expect(stdout).not.toContain('=== Response ===');
});

test('an unknown conversion field still dumps the response', () => {
  const { stdout } = renderJettison('jettison', {
    details: {
      action: 'jettison',
      item_id: 'purified_water',
      quantity: 4,
      conversion: {
        output_item_id: 'water_ice',
        output_quantity: 0,
        bonus: 1,
      },
    },
  });

  expect(stdout).toContain('=== Response ===');
  expect(stdout).toContain('bonus');
});

test('json output stays the envelope', () => {
  const { stdout, stderr } = renderJettison('jettison', jettisonFreezeFixture, { format: 'json' });
  expect(stderr).toBe('');
  expect(JSON.parse(stdout)).toEqual(jettisonFreezeFixture);
});
