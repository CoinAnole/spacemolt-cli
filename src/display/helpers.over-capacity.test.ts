import { describe, expect, test } from 'bun:test';
import { rawColors } from './ansi.ts';
import {
  emitStationDefences,
  emitStationFuelPricing,
  emitStationIds,
  emitStationLifeSupport,
  emitStationPower,
  isOverCapacity,
  overCapacitySuffix,
  withDisplayRenderBuffer,
} from './helpers.ts';

function withBuffer<T>(fn: () => T, options: { plain?: boolean } = {}): T {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  return withDisplayRenderBuffer(buffer, fn, options);
}

function suffixPlain(used: unknown, capacity: unknown): string {
  return withBuffer(() => overCapacitySuffix(used, capacity), { plain: true });
}

function suffixColor(used: unknown, capacity: unknown): string {
  return withBuffer(() => overCapacitySuffix(used, capacity), { plain: false });
}

describe('isOverCapacity', () => {
  test('true when used exceeds capacity', () => {
    expect(withBuffer(() => isOverCapacity(40, 34))).toBe(true);
  });

  test('false when equal or under', () => {
    expect(withBuffer(() => isOverCapacity(34, 34))).toBe(false);
    expect(withBuffer(() => isOverCapacity(16, 34))).toBe(false);
  });

  test('false when used or capacity is not finite', () => {
    expect(withBuffer(() => isOverCapacity(undefined, 34))).toBe(false);
    expect(withBuffer(() => isOverCapacity(40, undefined))).toBe(false);
    expect(withBuffer(() => isOverCapacity(Number.NaN, 34))).toBe(false);
    expect(withBuffer(() => isOverCapacity(40, Number.NaN))).toBe(false);
    expect(withBuffer(() => isOverCapacity('not-a-number', 34))).toBe(false);
    expect(withBuffer(() => isOverCapacity(40, 'not-a-number'))).toBe(false);
  });

  test('coerces numeric strings', () => {
    expect(withBuffer(() => isOverCapacity('40', '34'))).toBe(true);
  });

  test('coerces empty string and null to 0', () => {
    expect(withBuffer(() => isOverCapacity(5, ''))).toBe(true);
    expect(withBuffer(() => isOverCapacity(5, null))).toBe(true);
  });

  test('capacity 0 is over when used is positive; 0/0 is full', () => {
    expect(withBuffer(() => isOverCapacity(5, 0))).toBe(true);
    expect(withBuffer(() => isOverCapacity(0, 0))).toBe(false);
  });
});

describe('overCapacitySuffix', () => {
  test('appends over-capacity when used exceeds capacity', () => {
    expect(suffixPlain(40, 34)).toBe(' (over capacity)');
  });

  test('empty when equal or under', () => {
    expect(suffixPlain(34, 34)).toBe('');
    expect(suffixPlain(16, 34)).toBe('');
  });

  test('empty when used or capacity is not finite', () => {
    expect(suffixPlain(undefined, 34)).toBe('');
    expect(suffixPlain(40, undefined)).toBe('');
    expect(suffixPlain(Number.NaN, 34)).toBe('');
    expect(suffixPlain('not-a-number', 34)).toBe('');
  });

  test('coerces numeric strings', () => {
    expect(suffixPlain('40', '34')).toBe(' (over capacity)');
  });

  test('coerces empty string and null to 0', () => {
    expect(suffixPlain(5, '')).toBe(' (over capacity)');
    expect(suffixPlain(5, null)).toBe(' (over capacity)');
  });

  test('capacity 0 is over when used is positive; 0/0 is full', () => {
    expect(suffixPlain(5, 0)).toBe(' (over capacity)');
    expect(suffixPlain(0, 0)).toBe('');
  });

  test('yellow wraps the phrase when color is on', () => {
    expect(suffixPlain(40, 34)).toBe(' (over capacity)');
    const colored = suffixColor(40, 34);
    expect(colored).toContain('(over capacity)');
    expect(colored).toContain(rawColors.yellow);
    expect(colored).not.toBe(suffixPlain(40, 34));
  });
});

describe('emitStationFuelPricing', () => {
  test('fuel price prints explicit 0', () => {
    const buffer = { stdout: [] as string[], stderr: [] as string[] };
    withDisplayRenderBuffer(buffer, () => emitStationFuelPricing({ fuel_price: 0 }), { plain: true });
    expect(buffer.stdout.join('\n')).toContain('Fuel Price: 0 credits');
  });

  test('fuel tax prints explicit 0', () => {
    const buffer = { stdout: [] as string[], stderr: [] as string[] };
    withDisplayRenderBuffer(buffer, () => emitStationFuelPricing({ fuel_tax_per_unit: 0 }), { plain: true });
    expect(buffer.stdout.join('\n')).toContain('Fuel Tax: 0 credits/unit');
  });

  test('all-in refuel price prints explicit 0', () => {
    const buffer = { stdout: [] as string[], stderr: [] as string[] };
    withDisplayRenderBuffer(buffer, () => emitStationFuelPricing({ fuel_price_all_in: 0 }), { plain: true });
    expect(buffer.stdout.join('\n')).toContain('All-in Refuel Price: 0 credits/unit');
  });
});

describe('emitStationDefences', () => {
  test('emitStationDefences prints explicit armor 0', () => {
    const buffer = { stdout: [] as string[], stderr: [] as string[] };
    withDisplayRenderBuffer(buffer, () => emitStationDefences({ armor: 0 }), { plain: true });
    expect(buffer.stdout.join('\n')).toContain('Armor: 0');
  });

  test('emitStationDefences prints explicit hull 0', () => {
    const buffer = { stdout: [] as string[], stderr: [] as string[] };
    withDisplayRenderBuffer(buffer, () => emitStationDefences({ hull: 0, max_hull: 10 }), { plain: true });
    expect(buffer.stdout.join('\n')).toContain('Hull: 0/10');
  });

  test('emitStationDefences prints guns dps without a reach suffix', () => {
    const buffer = { stdout: [] as string[], stderr: [] as string[] };
    withDisplayRenderBuffer(buffer, () => emitStationDefences({ weapon_dps: 40 }), { plain: true });
    expect(buffer.stdout.join('\n')).toBe('Guns: 40 DPS');
  });

  test('emitStationDefences prints a hull question mark when hull is absent', () => {
    const buffer = { stdout: [] as string[], stderr: [] as string[] };
    withDisplayRenderBuffer(buffer, () => emitStationDefences({ max_hull: 10 }), { plain: true });
    expect(buffer.stdout.join('\n')).toContain('Hull: ?/10');
  });

  test('emitStationDefences prints a max hull question mark when max_hull is absent', () => {
    const buffer = { stdout: [] as string[], stderr: [] as string[] };
    withDisplayRenderBuffer(buffer, () => emitStationDefences({ hull: 5 }), { plain: true });
    expect(buffer.stdout.join('\n')).toContain('Hull: 5/?');
  });

  test('emitStationDefences prints a dps question mark when only reach is set', () => {
    const buffer = { stdout: [] as string[], stderr: [] as string[] };
    withDisplayRenderBuffer(buffer, () => emitStationDefences({ weapon_reach: 2 }), { plain: true });
    expect(buffer.stdout.join('\n')).toBe('Guns: ? DPS (reach 2)');
  });
});

describe('emitStationIds', () => {
  test('prints unknown id and omits poi when ids are missing', () => {
    const buffer = { stdout: [] as string[], stderr: [] as string[] };
    withDisplayRenderBuffer(buffer, () => emitStationIds({}), { plain: true });
    const stdout = buffer.stdout.join('\n');
    expect(stdout).toContain('ID: unknown');
    expect(stdout).not.toContain('POI:');
  });

  test('emitStationIds prints base_id when id is absent', () => {
    const buffer = { stdout: [] as string[], stderr: [] as string[] };
    withDisplayRenderBuffer(buffer, () => emitStationIds({ base_id: 'earth_station' }), { plain: true });
    expect(buffer.stdout.join('\n')).toContain('ID: earth_station');
  });
});

describe('emitStationLifeSupport', () => {
  test('life support prints upkeep items without a cadence', () => {
    const buffer = { stdout: [] as string[], stderr: [] as string[] };
    withDisplayRenderBuffer(
      buffer,
      () => emitStationLifeSupport({ maintenance: [{ name: 'Oxygen', quantity_per_cycle: 2 }] }),
      { plain: true },
    );
    const stdout = buffer.stdout.join('\n');
    expect(stdout).toContain('Upkeep: Oxygen x2');
    expect(stdout).not.toContain('every');
  });
});

describe('emitStationPower', () => {
  test('station power uses draw when current_draw is absent', () => {
    const buffer = { stdout: [] as string[], stderr: [] as string[] };
    withDisplayRenderBuffer(buffer, () => emitStationPower({ supply: 120, draw: 95 }), { plain: true });
    expect(buffer.stdout.join('\n')).toContain('Power: 95/120 draw');
  });

  test('station power fuel inputs use quantity when quantity_per_cycle is absent', () => {
    const buffer = { stdout: [] as string[], stderr: [] as string[] };
    withDisplayRenderBuffer(buffer, () => emitStationPower({ fuel_inputs: [{ name: 'Fuel Cell', quantity: 3 }] }), {
      plain: true,
    });
    expect(buffer.stdout.join('\n')).toContain('Fuel Inputs: 3 Fuel Cell');
  });

  test('station power efficiency above 1 is not rescaled', () => {
    const buffer = { stdout: [] as string[], stderr: [] as string[] };
    withDisplayRenderBuffer(buffer, () => emitStationPower({ supply: 10, current_draw: 10, efficiency: 85 }), {
      plain: true,
    });
    const stdout = buffer.stdout.join('\n');
    expect(stdout).toContain('85% efficiency');
    expect(stdout).not.toContain('8500%');
  });
});
