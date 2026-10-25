import { stringifyApiJson } from '../json-number.ts';
import { emitLine, isRecord } from './helpers.ts';

const GIFT_GOODWILL_FIELDS = [
  ['counterparty', 'Counterparty', 'text'],
  ['need_value', 'Need value', 'value'],
  ['bounty_paid', 'Bounty paid', 'value'],
  ['bounty_remaining', 'Bounty remaining', 'value'],
  ['reputation_before', 'Reputation before', 'value'],
  ['reputation_after', 'Reputation after', 'value'],
  ['reputation_change', 'Reputation change', 'value'],
  ['situation', 'Situation', 'text'],
  ['reply', 'Reply', 'text'],
  ['reply_from', 'Reply from', 'text'],
] as const;

const GIFT_GOODWILL_KEYS = new Set<string>(GIFT_GOODWILL_FIELDS.map(([key]) => key));

function goodwillValueText(value: unknown): string {
  if (typeof value === 'bigint' || (typeof value === 'number' && Number.isInteger(value))) return String(value);
  if (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return String(value);
  }
  if (isRecord(value) || Array.isArray(value)) return stringifyApiJson(value);
  return String(value);
}

function pushExtraField(lines: string[], key: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return;
  const label = key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  if (Array.isArray(value)) {
    lines.push(`  ${label}: ${value.length} item(s)`);
    return;
  }
  if (isRecord(value)) {
    lines.push(`  ${label}: ${stringifyApiJson(value)}`);
    return;
  }
  lines.push(`  ${label}: ${String(value)}`);
}

export function giftGoodwillLines(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const lines: string[] = [];
  for (const [key, label, kind] of GIFT_GOODWILL_FIELDS) {
    if (!Object.hasOwn(value, key)) continue;
    const fieldValue = value[key];
    if (fieldValue === undefined || fieldValue === null || fieldValue === '') continue;
    if (kind === 'text') {
      if (typeof fieldValue !== 'string') continue;
      if (label === 'Reply') {
        const [first, ...rest] = fieldValue.split(/\r?\n/);
        // Continuation lines stay under Reply instead of reading as new fields.
        lines.push(`  Reply: ${first ?? ''}`);
        for (const line of rest) lines.push(`    ${line}`);
        continue;
      }
      lines.push(`  ${label}: ${fieldValue}`);
      continue;
    }
    lines.push(`  ${label}: ${goodwillValueText(fieldValue)}`);
  }
  for (const [key, entry] of Object.entries(value)) {
    if (GIFT_GOODWILL_KEYS.has(key)) continue;
    pushExtraField(lines, key, entry);
  }
  return lines;
}

export function emitGiftGoodwill(value: unknown, heading = 'Goodwill:'): boolean {
  const lines = giftGoodwillLines(value);
  if (lines.length === 0) return false;
  emitLine(heading);
  for (const line of lines) emitLine(line);
  return true;
}
