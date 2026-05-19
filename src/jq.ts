import { getFieldValue } from './response.ts';

export function evaluateJq(data: Record<string, unknown>, expr: string): unknown {
  const trimmed = expr.trim();

  if (trimmed === '.') return data;

  if (trimmed.startsWith('.')) return evalPath(data, trimmed);

  throw new Error(`Unsupported jq expression: "${expr}". Supported: .key, .key.nested, .key[], .key[].field`);
}

function evalPath(data: unknown, expr: string): unknown {
  const withoutDot = expr.slice(1);

  const bracketIndex = withoutDot.indexOf('[');
  if (bracketIndex === -1) {
    return getFieldValue(data, withoutDot);
  }

  const arrayKey = withoutDot.slice(0, bracketIndex);
  const rest = withoutDot.slice(bracketIndex);

  const array = getFieldValue(data, arrayKey);
  if (!Array.isArray(array)) {
    throw new Error(`Expected array at "${arrayKey}", got ${typeof array}`);
  }

  const bracketContent = rest.slice(1, rest.indexOf(']'));
  if (bracketContent.trim() === '') {
    const afterBracket = rest.slice(rest.indexOf(']') + 1);
    if (afterBracket.startsWith('.')) {
      return array.map((item) => getFieldValue(item, afterBracket.slice(1)));
    }
    if (afterBracket === '') return array;
    throw new Error(`Unsupported expression after []: "${afterBracket}"`);
  }

  throw new Error(`Unsupported bracket content: "[${bracketContent}]"`);
}

export function formatJqResult(value: unknown, compact = false): string {
  if (value === undefined) return 'null';
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value, null, compact ? 0 : 2);
  }
  return String(value);
}
