import { describe, expect, test } from 'bun:test';
import { formatCompactTable, truncateCell } from './tables';

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
