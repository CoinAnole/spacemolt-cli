import { isAliasCopiedDumpKey } from './dock-state.ts';
import { c, emitLine, formatter, isRecord, type ResultFormatter } from './helpers.ts';

const RESULT_KEYS = new Set(['conversion', 'error', 'item_id', 'item_name', 'message', 'quantity', 'success']);

interface ConversionLines {
  outputItemId?: string;
  outputQuantity?: string;
}

interface ResultLines {
  itemId?: string;
  itemName?: string;
  quantity?: string;
  outputItemId?: string;
  outputQuantity?: string;
  success?: string;
  error?: string;
  message?: string;
  extras: Array<[string, string]>;
}

function isScalarDisplayValue(value: unknown): boolean {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  );
}

function formatQuantity(value: unknown): string | undefined {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isFinite(value)) return Object.is(value, -0) ? '0' : String(value);
  return undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.trim() === '' ? undefined : value;
}

function labelForScalarKey(key: string): string {
  return key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function titleForScalarAction(action: unknown): string {
  if (typeof action !== 'string' || action.trim() === '') return 'Result';
  return labelForScalarKey(action);
}

/** Unknown conversion keys decline so the raw dump still shows them. Null is omitted; 0 prints. */
function readConversion(value: unknown): ConversionLines | 'absent' | 'invalid' {
  if (value === undefined) return 'absent';
  if (!isRecord(value)) return 'invalid';
  const lines: ConversionLines = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || entry === null) continue;
    if (key === 'output_item_id') {
      if (typeof entry !== 'string') return 'invalid';
      const id = nonEmptyString(entry);
      if (id !== undefined) lines.outputItemId = id;
      continue;
    }
    if (key === 'output_quantity') {
      const text = formatQuantity(entry);
      if (text === undefined) return 'invalid';
      lines.outputQuantity = text;
      continue;
    }
    return 'invalid';
  }
  return lines;
}

function readResult(entry: unknown): ResultLines | 'invalid' {
  if (!isRecord(entry)) return 'invalid';
  const conversion = readConversion(entry.conversion);
  if (conversion === 'invalid') return 'invalid';
  const lines: ResultLines = { extras: [] };
  for (const [key, value] of Object.entries(entry)) {
    if (key === 'conversion') continue;
    if (!RESULT_KEYS.has(key)) {
      if (value === undefined || value === null || value === '') continue;
      if (!isScalarDisplayValue(value)) return 'invalid';
      lines.extras.push([labelForScalarKey(key), typeof value === 'bigint' ? value.toString() : String(value)]);
      continue;
    }
    if (value !== undefined && value !== null && value !== '' && !isScalarDisplayValue(value)) return 'invalid';
  }
  lines.itemId = nonEmptyString(entry.item_id);
  lines.itemName = nonEmptyString(entry.item_name);
  if (entry.quantity !== undefined && entry.quantity !== null && entry.quantity !== '') {
    const quantity = formatQuantity(entry.quantity);
    if (quantity === undefined) return 'invalid';
    lines.quantity = quantity;
  }
  if (conversion !== 'absent') {
    lines.outputItemId = conversion.outputItemId;
    lines.outputQuantity = conversion.outputQuantity;
  }
  if (entry.success === true) lines.success = 'yes';
  else if (entry.success === false) lines.success = 'no';
  else if (entry.success !== undefined && entry.success !== null && entry.success !== '') return 'invalid';
  lines.error = nonEmptyString(entry.error);
  lines.message = nonEmptyString(entry.message);
  return lines;
}

function readResults(value: unknown): ResultLines[] | 'absent' | 'invalid' {
  if (value === undefined) return 'absent';
  if (!Array.isArray(value)) return 'invalid';
  const rows: ResultLines[] = [];
  for (const entry of value) {
    const row = readResult(entry);
    if (row === 'invalid') return 'invalid';
    rows.push(row);
  }
  return rows;
}

function emitLabeled(label: string, value: string | undefined): void {
  if (value === undefined) return;
  emitLine(`${label}: ${value}`);
}

function formatJettison(result: Record<string, unknown>, command?: string): boolean {
  const conversion = readConversion(result.conversion);
  if (conversion === 'invalid') return false;
  const rows = readResults(result.results);
  if (rows === 'invalid') return false;

  const entries = Object.entries(result).filter(([key, value]) => {
    if (key === 'conversion' || key === 'results') return false;
    return value !== undefined && value !== null && value !== '' && !isAliasCopiedDumpKey(result, key);
  });
  if (entries.length > 16) return false;
  if (entries.some(([, value]) => !isScalarDisplayValue(value))) return false;

  const hasMarker =
    typeof result.action === 'string' ||
    typeof result.message === 'string' ||
    rows !== 'absent' ||
    conversion !== 'absent' ||
    entries.some(([key]) => key.endsWith('_id') || key === 'id');
  if (!hasMarker) return false;
  if (entries.length === 0 && rows === 'absent' && conversion === 'absent') return false;

  emitLine(`\n${c.bright}=== ${titleForScalarAction(result.action ?? command)} ===${c.reset}`);
  for (const [key, value] of entries) {
    emitLine(`${labelForScalarKey(key)}: ${typeof value === 'bigint' ? value.toString() : String(value)}`);
  }
  if (conversion !== 'absent') {
    emitLabeled('Output Item Id', conversion.outputItemId);
    emitLabeled('Output Quantity', conversion.outputQuantity);
  }
  if (entries.length === 1 && result.action !== undefined && rows === 'absent' && conversion === 'absent') {
    emitLine(`${c.green}OK${c.reset}`);
  }
  if (rows !== 'absent') {
    emitLine('');
    emitLine(`${c.bright}Results${c.reset}`);
    if (rows.length === 0) {
      emitLine('(None)');
    } else {
      for (const [index, row] of rows.entries()) {
        if (index > 0) emitLine('');
        emitLabeled('Item Id', row.itemId);
        emitLabeled('Item Name', row.itemName);
        emitLabeled('Quantity', row.quantity);
        emitLabeled('Output Item Id', row.outputItemId);
        emitLabeled('Output Quantity', row.outputQuantity);
        emitLabeled('Success', row.success);
        emitLabeled('Error', row.error);
        emitLabeled('Message', row.message);
        for (const [label, value] of row.extras) emitLabeled(label, value);
      }
    }
  }
  return true;
}

export const jettisonFormatters: ResultFormatter[] = [
  formatter(formatJettison, { commands: ['jettison', 'storage_jettison'] }),
];
