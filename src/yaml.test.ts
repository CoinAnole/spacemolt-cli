import { describe, expect, test } from 'bun:test';
import { toYaml } from './yaml';

describe('toYaml', () => {
  test.each([
    ['null', null, 'null'],
    ['undefined', undefined, 'null'],
    ['true', true, 'true'],
    ['false', false, 'false'],
    ['number', 42, '42'],
    ['plain string', 'ore_iron', 'ore_iron'],
    ['empty string', '', '""'],
    ['reserved boolean string', 'yes', '"yes"'],
    ['string with spaces', 'fuel cell', '"fuel cell"'],
    ['string with colon', 'sector: alpha', '"sector: alpha"'],
    ['string with quote', 'say "hi"', '"say \\"hi\\""'],
    ['timestamp string', '2026-05-18T12:00:00.000Z', '2026-05-18T12:00:00.000Z'],
  ])('formats scalar %s', (_name, value, expected) => {
    expect(toYaml(value)).toBe(expected);
  });

  test('formats arrays with stable indentation', () => {
    expect(toYaml(['ore_iron', null, true, 'fuel cell'])).toBe('\n- ore_iron\n- null\n- true\n- "fuel cell"');
  });

  test('formats nested objects with stable indentation', () => {
    expect(
      toYaml({
        ship: {
          class: 'hauler',
          cargo: ['ore_iron', 'fuel_cell'],
          docked: false,
        },
        credits: 1200,
      }),
    ).toBe('\nship:\n  class: hauler\n  cargo:\n    - ore_iron\n    - fuel_cell\n  docked: false\ncredits: 1200');
  });

  test('formats arrays of objects with stable indentation', () => {
    expect(
      toYaml({
        routes: [
          { from: 'earth', to: 'mars', safe: true },
          { from: 'mars', to: 'ceres', safe: false },
        ],
      }),
    ).toBe('\nroutes:\n  - from: earth\n    to: mars\n    safe: true\n  - from: mars\n    to: ceres\n    safe: false');
  });

  test('formats empty collections', () => {
    expect(toYaml({ cargo: [], metadata: {} })).toBe('\ncargo: []\nmetadata: {}');
  });
});
