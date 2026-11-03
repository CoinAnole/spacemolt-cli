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

test('jettison prints copied fuel and omits copied location aliases', () => {
  const { stdout, stderr } = renderJettison('jettison', {
    details: {
      action: 'jettison',
    },
    ship: { fuel: 10 },
    location: { system_id: 'sol' },
  });

  expect(stderr).toBe('');
  expect(stdout).toContain('Fuel Now: 10');
  expect(stdout).not.toContain('System Id');
  expect(stdout).not.toContain('=== Response ===');
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

test('null conversion output quantity keeps the item id and omits Output Quantity', () => {
  const { stdout } = renderJettison('jettison', {
    details: {
      action: 'jettison',
      conversion: {
        output_item_id: 'water_ice',
        output_quantity: null,
      },
    },
  });

  expect(stdout).toContain('Output Item Id: water_ice');
  expect(stdout).not.toContain('Output Quantity');
  expect(stdout).not.toContain('=== Response ===');
});

test('whitespace conversion output_item_id omits Output Item Id and prints Output Quantity', () => {
  const { stdout } = renderJettison('jettison', {
    details: {
      action: 'jettison',
      conversion: {
        output_item_id: '   ',
        output_quantity: 3,
      },
    },
  });

  expect(stdout).not.toContain('Output Item Id');
  expect(stdout).toContain('Output Quantity: 3');
  expect(stdout).not.toContain('=== Response ===');
});

test('numeric conversion output_item_id declines to the raw response', () => {
  const { stdout } = renderJettison('jettison', {
    details: {
      action: 'jettison',
      item_id: 'purified_water',
      quantity: 3,
      conversion: {
        output_item_id: 7,
        output_quantity: 3,
      },
    },
  });

  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('Output Item Id');
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

test('empty conversion object prints the jettison heading and omits output fields', () => {
  const { stdout, stderr } = renderJettison('jettison', {
    details: {
      action: 'jettison',
      conversion: {},
    },
  });

  expect(stderr).toBe('');
  expect(stdout).toContain('=== Jettison ===');
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

test('empty-string jettison result success omits Success', () => {
  const { stdout, stderr } = renderJettison('storage jettison', {
    details: {
      action: 'bulk_jettison',
      results: [
        {
          item_id: 'ore_iron',
          success: '',
        },
      ],
    },
  });

  expect(stderr).toBe('');
  expect(stdout).toContain('Item Id: ore_iron');
  expect(stdout).not.toContain('Success:');
  expect(stdout).not.toContain('=== Response ===');
});

test('null jettison result success omits Success', () => {
  const { stdout, stderr } = renderJettison('storage jettison', {
    details: {
      action: 'bulk_jettison',
      results: [
        {
          item_id: 'ore_iron',
          success: null,
        },
      ],
    },
  });

  expect(stderr).toBe('');
  expect(stdout).toContain('Item Id: ore_iron');
  expect(stdout).not.toContain('Success:');
  expect(stdout).not.toContain('=== Response ===');
});

test('non-boolean jettison success declines to the raw response', () => {
  const { stdout } = renderJettison('storage jettison', {
    details: {
      action: 'create_sell_order',
      kind: 'bulk',
      mode: 'bulk',
      note: { hidden: true },
      results: [{ success: 'yes' }],
    },
  });

  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('Success:');
});

test('jettison result-row scalar outside known keys prints Pilot Id', () => {
  const { stdout, stderr } = renderJettison('storage jettison', {
    details: {
      action: 'bulk_jettison',
      results: [
        {
          item_id: 'ore_iron',
          pilot_id: 'pilot-1',
        },
      ],
    },
  });

  expect(stderr).toBe('');
  expect(stdout).toContain('Pilot Id: pilot-1');
  expect(stdout).not.toContain('=== Response ===');
});

test('jettison results row with pilot_count 0 prints Pilot Count: 0 and not the raw response', () => {
  const { stdout, stderr } = renderJettison('storage jettison', {
    details: {
      action: 'bulk_jettison',
      results: [
        {
          item_id: 'ore_iron',
          pilot_count: 0,
        },
      ],
    },
  });

  expect(stderr).toBe('');
  expect(stdout).toContain('Pilot Count: 0');
  expect(stdout).not.toContain('=== Response ===');
});

test('jettison result-row with pilot_id null prints Item Id and omits Pilot Id', () => {
  const { stdout, stderr } = renderJettison('storage jettison', {
    details: {
      action: 'bulk_jettison',
      results: [
        {
          item_id: 'ore_iron',
          pilot_id: null,
        },
      ],
    },
  });

  expect(stderr).toBe('');
  expect(stdout).toContain('Item Id: ore_iron');
  expect(stdout).not.toContain('Pilot Id');
});

test('failed jettison result prints Error', () => {
  const { stdout, stderr } = renderJettison('storage jettison', {
    details: {
      action: 'bulk_jettison',
      results: [
        {
          item_id: 'ore_iron',
          success: false,
          error: 'cargo locked',
        },
      ],
    },
  });

  expect(stderr).toBe('');
  expect(stdout).toContain('Error: cargo locked');
  expect(stdout).not.toContain('=== Response ===');
});

test('whitespace jettison result message omits Message', () => {
  const { stdout } = renderJettison('storage jettison', {
    details: {
      action: 'bulk_jettison',
      results: [
        {
          item_id: 'ore_iron',
          message: '   ',
        },
      ],
    },
  });

  expect(stdout).toContain('Item Id: ore_iron');
  expect(stdout).not.toContain('Message:');
  expect(stdout).not.toContain('=== Response ===');
});

test('results-row bigint quantity prints the exact digits', () => {
  const { stdout, stderr } = renderJettison('storage jettison', {
    details: {
      action: 'bulk_jettison',
      results: [
        {
          item_id: 'ore_iron',
          quantity: 9007199254740993n,
        },
      ],
    },
  });

  expect(stderr).toBe('');
  expect(stdout).toContain('Quantity: 9007199254740993');
  expect(stdout).not.toContain('=== Response ===');
});

test('top-level jettison quantity 9007199254740993n prints exact digits and no Results heading', () => {
  const { stdout, stderr } = renderJettison('jettison', {
    details: {
      action: 'jettison',
      item_id: 'ore_iron',
      quantity: 9007199254740993n,
    },
  });

  expect(stderr).toBe('');
  expect(stdout).toContain('Quantity: 9007199254740993');
  expect(stdout).not.toContain('9007199254740992');
  expect(stdout).not.toContain('Results');
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

test('a nested object field beside action declines to the raw response', () => {
  const { stdout } = renderJettison('jettison', {
    details: {
      action: 'jettison',
      item_id: 'ore_iron',
      note: { hidden: true },
    },
  });

  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('=== Jettison ===');
});

test('json output stays the envelope', () => {
  const { stdout, stderr } = renderJettison('jettison', jettisonFreezeFixture, { format: 'json' });
  expect(stderr).toBe('');
  expect(JSON.parse(stdout)).toEqual(jettisonFreezeFixture);
});

test('single-action jettison OK line prints OK', () => {
  const { stdout } = renderJettison('jettison', {
    details: {
      action: 'jettison',
    },
  });

  expect(stdout).toContain('OK');
  expect(stdout).not.toContain('=== Response ===');
});

test('top-level jettison boolean false prints Sealed: false', () => {
  const { stdout, stderr } = renderJettison('jettison', {
    details: {
      action: 'jettison',
      sealed: false,
    },
  });

  expect(stderr).toBe('');
  expect(stdout).toContain('Sealed: false');
  expect(stdout).not.toContain('=== Response ===');
});

test('blank jettison action with item_id prints === Result ===', () => {
  const { stdout, stderr } = renderJettison('jettison', {
    details: {
      action: '',
      item_id: 'ore_iron',
    },
  });

  expect(stderr).toBe('');
  expect(stdout).toContain('=== Result ===');
});

test('whitespace jettison action prints === Result === and the Action line', () => {
  const { stdout, stderr } = renderJettison('jettison', {
    details: {
      action: '   ',
      item_id: 'ore_iron',
    },
  });

  expect(stderr).toBe('');
  expect(stdout).toContain('=== Result ===');
  expect(stdout).toContain('Action:');
  expect(stdout).not.toContain('=== Response ===');
});

test('omitted jettison action with item_id prints === Jettison ===', () => {
  const { stdout, stderr } = renderJettison('jettison', {
    details: {
      item_id: 'ore_iron',
    },
  });

  expect(stderr).toBe('');
  expect(stdout).toContain('=== Jettison ===');
  expect(stdout).not.toContain('=== Result ===');
});

test('more than 16 jettison scalar fields decline to the raw response', () => {
  const details: Record<string, string> = { action: 'jettison' };
  for (let index = 1; index <= 16; index += 1) {
    details[`extra_${index}`] = 'set';
  }
  const { stdout } = renderJettison('jettison', { details });

  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('=== Jettison ===');
});

test('jettison results row with quantity 0 prints Quantity: 0', () => {
  const { stdout, stderr } = renderJettison('storage jettison', {
    details: {
      action: 'bulk_jettison',
      results: [
        {
          item_id: 'ore_iron',
          quantity: 0,
        },
      ],
    },
  });

  expect(stderr).toBe('');
  expect(stdout).toContain('Quantity: 0');
  expect(stdout).not.toContain('=== Response ===');
});

test('null jettison result quantity omits Quantity', () => {
  const { stdout, stderr } = renderJettison('storage jettison', {
    details: {
      action: 'bulk_jettison',
      results: [
        {
          item_id: 'ore_iron',
          quantity: null,
        },
      ],
    },
  });

  expect(stderr).toBe('');
  expect(stdout).toContain('Item Id: ore_iron');
  expect(stdout).not.toContain('Quantity');
});

test('empty-string jettison result quantity omits Quantity', () => {
  const { stdout, stderr } = renderJettison('storage jettison', {
    details: {
      action: 'bulk_jettison',
      results: [
        {
          item_id: 'ore_iron',
          quantity: '',
        },
      ],
    },
  });

  expect(stderr).toBe('');
  expect(stdout).toContain('Item Id: ore_iron');
  expect(stdout).not.toContain('Quantity');
  expect(stdout).not.toContain('=== Response ===');
});

test('non-record jettison result row declines to the raw response', () => {
  const { stdout } = renderJettison('storage jettison', {
    details: {
      action: 'create_sell_order',
      kind: 'bulk',
      mode: 'bulk',
      note: { hidden: true },
      results: [null],
    },
  });

  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('=== Create Sell Order ===');
  expect(stdout).not.toContain('=== Intel ===');
});

test('string conversion output_quantity declines to the raw response', () => {
  const { stdout } = renderJettison('jettison', {
    details: {
      action: 'jettison',
      item_id: 'purified_water',
      quantity: 3,
      conversion: {
        output_item_id: 'water_ice',
        output_quantity: '3',
      },
    },
  });

  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('Output Quantity:');
});

test('Infinity conversion output_quantity declines to the raw response', () => {
  const { stdout } = renderJettison('jettison', {
    details: {
      action: 'jettison',
      item_id: 'purified_water',
      quantity: 3,
      conversion: {
        output_item_id: 'water_ice',
        output_quantity: Infinity,
      },
    },
  });

  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('Output Quantity');
});

test('null conversion declines to the raw response', () => {
  const { stdout } = renderJettison('jettison', {
    details: {
      action: 'jettison',
      item_id: 'purified_water',
      quantity: 1n,
      conversion: null,
    },
  });

  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('Output Item Id');
});
