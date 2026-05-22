import { getFieldValue } from './response.ts';

type PathResolution = { found: true; value: unknown } | { found: false };

export function evaluateJq(data: Record<string, unknown>, expr: string): unknown {
  const trimmed = expr.trim();

  if (trimmed === '.') return data;

  if (trimmed.includes(',')) {
    throw new Error('--jq does not support multiple values (use separate calls)');
  }

  if (trimmed.startsWith('.') && !hasUnsupportedWhitespace(trimmed)) return evalPath(data, trimmed);

  throw new Error(`Unsupported jq expression: "${expr}". Supported: .key, .key.nested, .key[], .key[0].field`);
}

function evalPath(data: unknown, expr: string): unknown {
  const withoutDot = expr.slice(1);

  const bracketIndex = withoutDot.indexOf('[');
  if (bracketIndex === -1) {
    const resolved = resolvePath(data, withoutDot);
    if (!resolved.found) throw new Error(`Path not found: "${expr}"`);
    return resolved.value;
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

  const trimmedBracketContent = bracketContent.trim();
  if (/^\d+$/.test(trimmedBracketContent)) {
    const afterBracket = rest.slice(rest.indexOf(']') + 1);
    if (afterBracket && !afterBracket.startsWith('.')) {
      throw new Error(`Unsupported expression after [${trimmedBracketContent}]: "${afterBracket}"`);
    }
    const indexedPath = [
      arrayKey,
      trimmedBracketContent,
      afterBracket.startsWith('.') ? afterBracket.slice(1) : afterBracket,
    ]
      .filter(Boolean)
      .join('.');
    const resolved = resolvePath(data, indexedPath);
    if (!resolved.found) throw new Error(`Path not found: "${expr}"`);
    return resolved.value;
  }

  throw new Error(`Unsupported bracket content: "[${bracketContent}]"`);
}

function hasUnsupportedWhitespace(expr: string): boolean {
  return /\s/.test(expr.replace(/\[[^\]]*\]/g, '[]'));
}

function resolvePath(obj: unknown, path: string): PathResolution {
  if (!path || typeof obj !== 'object' || obj === null) return { found: false };

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (!part || current === null || current === undefined) return { found: false };
    if (Array.isArray(current)) {
      const index = Number.parseInt(part, 10);
      if (Number.isNaN(index) || !Object.hasOwn(current, index)) return { found: false };
      current = current[index];
    } else if (typeof current === 'object') {
      if (!Object.hasOwn(current, part)) return { found: false };
      current = (current as Record<string, unknown>)[part];
    } else {
      return { found: false };
    }
  }

  return { found: true, value: current };
}

export function formatJqResult(value: unknown, compact = false): string {
  if (value === undefined) return 'null';
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value, null, compact ? 0 : 2);
  }
  return String(value);
}
