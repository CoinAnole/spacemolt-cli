import { describe, expect, test } from 'bun:test';
import { formatCompactTable } from './tables';

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
});
