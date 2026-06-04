import { getFieldValue } from './response.ts';

type PathResolution = { found: true; value: unknown } | { found: false };

export function evaluateJq(data: Record<string, unknown>, expr: string): unknown {
  const trimmed = expr.trim();

  if (trimmed === '.') return data;

  if (isObjectConstruction(trimmed)) return evalObjectConstruction(data, trimmed);

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
    if (!resolved.found) throw new Error(formatPathNotFoundError(expr, data));
    return resolved.value;
  }

  const arrayKey = withoutDot.slice(0, bracketIndex);
  const rest = withoutDot.slice(bracketIndex);

  const array = getFieldValue(data, arrayKey);
  if (!Array.isArray(array)) {
    throw new Error(formatExpectedArrayError(arrayKey, array));
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
    if (!resolved.found) throw new Error(formatPathNotFoundError(expr, data));
    return resolved.value;
  }

  throw new Error(`Unsupported bracket content: "[${bracketContent}]"`);
}

function isObjectConstruction(expr: string): boolean {
  return expr.startsWith('{') && expr.endsWith('}');
}

function evalObjectConstruction(data: Record<string, unknown>, expr: string): Record<string, unknown> {
  const body = expr.slice(1, -1).trim();
  if (!body) return {};

  const result: Record<string, unknown> = {};
  for (const entry of splitTopLevel(body, ',')) {
    const trimmedEntry = entry.trim();
    if (!trimmedEntry) continue;
    const colonIndex = findTopLevelDelimiter(trimmedEntry, ':');
    if (colonIndex === -1) {
      throw new Error(`Unsupported jq object entry: "${trimmedEntry}"`);
    }

    const key = parseObjectKey(trimmedEntry.slice(0, colonIndex).trim());
    const valueExpr = trimmedEntry.slice(colonIndex + 1).trim();
    if (!valueExpr) throw new Error(`Unsupported jq object entry: "${trimmedEntry}"`);
    result[key] = evaluateJq(data, valueExpr);
  }

  return result;
}

function parseObjectKey(rawKey: string): string {
  if (!rawKey) throw new Error(`Unsupported jq object key: "${rawKey}"`);
  if (isQuoted(rawKey)) return unquote(rawKey);
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(rawKey)) return rawKey;
  throw new Error(`Unsupported jq object key: "${rawKey}"`);
}

function splitTopLevel(value: string, delimiter: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let bracketDepth = 0;
  let quote: '"' | "'" | undefined;
  let escaped = false;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '[' || char === '(') {
      bracketDepth++;
      continue;
    }
    if (char === ']' || char === ')') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (char === delimiter && bracketDepth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }

  parts.push(value.slice(start));
  return parts;
}

function findTopLevelDelimiter(value: string, delimiter: string): number {
  const parts = splitTopLevel(value, delimiter);
  const firstPart = parts[0];
  return parts.length === 1 || firstPart === undefined ? -1 : firstPart.length;
}

function isQuoted(value: string): boolean {
  return (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
  );
}

function unquote(value: string): string {
  return value.slice(1, -1).replace(/\\(["'\\])/g, '$1');
}

function formatPathNotFoundError(expr: string, data: unknown): string {
  const base = `Path not found: "${expr}"`;
  const availableKeys = formatAvailableKeys(data);
  const prefix = '.structuredContent.';
  if (!expr.startsWith(prefix)) return availableKeys ? `${base}\n${availableKeys}` : base;

  const suggestedPath = `.${expr.slice(prefix.length)}`;
  const structuredContentHint = `Hint: --jq operates on structuredContent (not the full API response). Try: ${suggestedPath}`;
  return [base, structuredContentHint, availableKeys].filter(Boolean).join('\n');
}

function formatAvailableKeys(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined;

  const keys = Object.keys(data);
  if (keys.length === 0) return undefined;
  return `Available keys: ${keys.join(', ')}`;
}

function formatExpectedArrayError(path: string, value: unknown): string {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const keys = Object.keys(value);
    const keySummary = keys.length > 0 ? `with keys: ${keys.join(', ')}` : 'with no keys';
    return `Expected array at path "${path}", got object ${keySummary}`;
  }

  return `Expected array at "${path}", got ${typeof value}`;
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
