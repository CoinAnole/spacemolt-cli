export function firstArray(
  result: Record<string, unknown>,
  keys: string[],
): Array<Record<string, unknown>> | undefined {
  for (const key of keys) {
    const value = result[key];
    if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  }
  return undefined;
}

export function rowValue(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== '') return String(value);
  }
  return '';
}

export interface CompactTableOptions {
  maxCellWidth?: number;
}

export function truncateCell(value: string, maxCellWidth: number): string {
  if (maxCellWidth <= 0) return '';
  if (value.length <= maxCellWidth) return value;
  if (maxCellWidth <= 3) return '.'.repeat(maxCellWidth);
  return `${value.slice(0, maxCellWidth - 3)}...`;
}

export function formatItemTable(items: Array<Record<string, unknown>>, indent = '  '): string[] {
  const lines = [`Items (${items.length}):`];
  if (!items.length) {
    lines.push(`${indent}(Empty)`);
    return lines;
  }

  const idW = Math.max(2, ...items.map((i) => String(i.item_id || '').length));
  const nameW = Math.max(4, ...items.map((i) => String(i.name || i.item_id || '').length));
  const qtyW = Math.max(3, ...items.map((i) => String(i.quantity ?? '').length));
  const sizeW = Math.max(9, ...items.map((i) => String(i.size ?? '').length));

  lines.push('');
  lines.push(
    `${indent}${'Name'.padEnd(nameW)} | ${'ID'.padEnd(idW)} | ${'Qty'.padStart(qtyW)} | ${'Unit Size'.padStart(sizeW)}`,
  );
  lines.push(`${indent}${'-'.repeat(nameW)}-+-${'-'.repeat(idW)}-+-${'-'.repeat(qtyW)}-+-${'-'.repeat(sizeW)}`);
  for (const item of items) {
    const name = String(item.name || item.item_id || '').padEnd(nameW);
    const id = String(item.item_id || '').padEnd(idW);
    const qty = String(item.quantity ?? '').padStart(qtyW);
    const size = String(item.size ?? '').padStart(sizeW);
    lines.push(`${indent}${name} | ${id} | ${qty} | ${size}`);
  }
  return lines;
}

export function formatCompactTable(
  title: string,
  rows: Array<Record<string, unknown>>,
  columns: Array<[string, string[]]>,
  options: CompactTableOptions = {},
): string[] {
  const maxCellWidth = options.maxCellWidth ?? 32;
  const lines = [`\n=== ${title} ===`];
  if (!rows.length) {
    lines.push('(None)');
    return lines;
  }

  const tableRows = rows.map((row) => columns.map(([, keys]) => truncateCell(rowValue(row, keys), maxCellWidth)));
  const widths = columns.map(([label], idx) =>
    Math.max(label.length, ...tableRows.map((row) => row[idx]?.length ?? 0)),
  );
  lines.push('');
  lines.push(`  ${columns.map(([label], idx) => label.padEnd(widths[idx] || label.length)).join(' | ')}`);
  lines.push(`  ${widths.map((width) => '-'.repeat(width)).join('-+-')}`);
  for (const row of tableRows) {
    lines.push(`  ${row.map((value, idx) => value.padEnd(widths[idx] || 0)).join(' | ')}`);
  }
  return lines;
}
