import { emitLine, formatIntegerText, isRecord } from './helpers.ts';

export function emitGiftEntries(gifts: unknown, options: { ships: boolean }): void {
  if (!Array.isArray(gifts)) return;
  let printed = false;
  for (const gift of gifts) {
    const lines = giftLines(gift, options.ships);
    if (!lines) continue;
    if (printed) emitLine('');
    printed = true;
    for (const line of lines) emitLine(line);
  }
}

function giftLines(gift: unknown, ships: boolean): string[] | undefined {
  if (!isRecord(gift)) return undefined;
  const lines: string[] = [];
  const from = formatFrom(gift);
  if (from) lines.push(`  From: ${from}`);
  const when = formatGiftTimestamp(gift.timestamp);
  if (when) lines.push(`  When: ${when}`);
  if (Object.hasOwn(gift, 'credits')) {
    const text = formatIntegerText(gift.credits);
    if (text !== undefined) lines.push(`  Credits: ${text} cr`);
  }
  appendNestedLines(lines, 'Items', formatItemLines(gift.items));
  if (ships) appendNestedLines(lines, 'Ships', formatShipLines(gift.ships));
  const note = formatNote(gift.message);
  if (note !== undefined) lines.push(`  Note: ${note}`);
  return lines.length ? lines : undefined;
}

function appendNestedLines(lines: string[], label: string, nested: string[]): void {
  if (!nested.length) return;
  lines.push(`  ${label}:`);
  for (const line of nested) lines.push(`    ${line}`);
}

function formatFrom(gift: Record<string, unknown>): string | undefined {
  const sender = nonEmpty(gift.sender);
  const senderId = nonEmpty(gift.sender_id);
  if (sender && senderId && senderId !== sender) return `${sender} (${senderId})`;
  if (sender) return sender;
  if (senderId) return senderId;
  return undefined;
}

// Regex on the text so the clock does not depend on timezone. Objects are omitted, not stringified.
function formatGiftTimestamp(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 1_000_000_000_000 ? value : value * 1000;
    const date = new Date(milliseconds);
    if (!Number.isFinite(date.getTime())) return String(value);
    return date.toISOString().replace('T', ' ').slice(0, 16);
  }
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value);
  return match ? `${match[1]} ${match[2]}` : value;
}

function formatNote(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value.trimEnd();
}

function formatItemLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const lines: string[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const line = formatItemLine(item);
    if (line) lines.push(line);
  }
  return lines;
}

function formatItemLine(item: Record<string, unknown>): string | undefined {
  const name = nonEmpty(item.name) || nonEmpty(item.item_id);
  if (!name) return undefined;
  const itemId = nonEmpty(item.item_id);
  const idSuffix = itemId && itemId !== name ? ` (${itemId})` : '';
  const quantity = formatIntegerText(item.quantity);
  const label = quantity !== undefined ? `${quantity} ${name}` : name;
  return `${label}${idSuffix}`;
}

function formatShipLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const lines: string[] = [];
  for (const ship of value) {
    if (!isRecord(ship)) continue;
    const line = formatShipLine(ship);
    if (line) lines.push(line);
  }
  return lines;
}

function formatShipLine(ship: Record<string, unknown>): string | undefined {
  const custom = nonEmpty(ship.custom_name);
  const className = nonEmpty(ship.class_name);
  const classId = nonEmpty(ship.class_id);
  const shipId = nonEmpty(ship.ship_id);
  const label = [custom, className].filter(Boolean).join(' — ') || classId || shipId;
  if (!label) return undefined;
  // "" class_name is empty, so the label may already be class_id. Don't print that id twice.
  const classSuffix = classId && classId !== label ? ` (${classId})` : '';
  const idSuffix = shipId && shipId !== label ? ` ${shipId}` : '';
  return `${label}${classSuffix}${idSuffix}`;
}

function nonEmpty(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : '';
}
