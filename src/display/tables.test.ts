import { describe, expect, test } from 'bun:test';
import { formatCompactTable, formatItemTable, truncateCell } from './tables';

describe('formatCompactTable', () => {
  test('truncates very long cells to keep tables readable', () => {
    const lines = formatCompactTable(
      'Ships',
      [
        {
          name: 'A ship with a name that is far longer than a normal terminal column should allow',
          ship_id: 'ship_1234567890abcdefghijklmnopqrstuvwxyz',
        },
      ],
      [
        ['Name', ['name']],
        ['ID', ['ship_id']],
      ],
      { maxCellWidth: 24 },
    );

    expect(lines.join('\n')).toContain('...');
    expect(lines.some((line) => line.length > 80)).toBe(false);
  });

  test('maxCellWidth <= 3 returns repeated dots and not an ellipsis', () => {
    const cell = truncateCell('longer-than-three', 2);
    expect(cell).toBe('..');
    expect(cell).not.toContain('...');
  });

  test('maxCellWidth <= 0 returns an empty string', () => {
    expect(truncateCell('longer-than-three', 0)).toBe('');
    expect(truncateCell('longer-than-three', -1)).toBe('');
  });
});

describe('formatItemTable', () => {
  test('formatItemTable prints explicit quantity 0', () => {
    const lines = formatItemTable([{ item_id: 'fuel_cell', name: 'Fuel Cell', quantity: 0, size: 1 }]);
    const row = lines.find((line) => line.includes('fuel_cell'));
    expect(row).toBe('  Fuel Cell | fuel_cell |   0 |         1');
  });

  test('formatItemTable uses item_id when name and item_name are absent', () => {
    const lines = formatItemTable([{ item_id: 'ore_iron', quantity: 3, size: 2 }]);
    const row = lines.find((line) => line.includes('ore_iron'));
    expect(row?.split('|')[0]?.trim()).toBe('ore_iron');
  });
});
