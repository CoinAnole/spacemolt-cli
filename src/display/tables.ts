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
): string[] {
  const lines = [`\n=== ${title} ===`];
  if (!rows.length) {
    lines.push('(None)');
    return lines;
  }

  const widths = columns.map(([label, keys]) =>
    Math.max(label.length, ...rows.map((row) => rowValue(row, keys).length)),
  );
  lines.push('');
  lines.push(`  ${columns.map(([label], idx) => label.padEnd(widths[idx] || label.length)).join(' | ')}`);
  lines.push(`  ${widths.map((width) => '-'.repeat(width)).join('-+-')}`);
  for (const row of rows) {
    lines.push(`  ${columns.map(([, keys], idx) => rowValue(row, keys).padEnd(widths[idx] || 0)).join(' | ')}`);
  }
  return lines;
}
