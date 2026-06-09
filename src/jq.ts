interface MissingPathContext {
  expr: string;
  requestedKey: string;
  parentPath: string;
  parent: Record<string, unknown>;
}

type PathResolution = { found: true; value: unknown } | { found: false; missing?: MissingPathContext };
type PathToken =
  | { kind: 'field'; name: string }
  | { kind: 'each'; raw: string }
  | { kind: 'index'; index: number; raw: string }
  | { kind: 'slice'; start: number; end: number; raw: string };

export function evaluateJq(data: unknown, expr: string): unknown {
  const trimmed = expr.trim();

  if (trimmed === '.') return data;

  const pipeParts = splitTopLevel(trimmed, '|').map((part) => part.trim());
  if (pipeParts.length > 1) return evalPipe(data, pipeParts);

  const commaParts = splitTopLevel(trimmed, ',').map((part) => part.trim());
  if (commaParts.length > 1) return commaParts.map((part) => evaluateJq(data, part));

  if (isObjectConstruction(trimmed)) return evalObjectConstruction(data, trimmed);

  if (trimmed.startsWith('.') && !hasUnsupportedWhitespace(trimmed)) return evalPath(data, trimmed);

  throw new Error(`Unsupported jq expression: "${expr}". Supported: .key, .key.nested, .key[], .key[0].field`);
}

function evalPipe(data: unknown, parts: string[]): unknown {
  if (parts.some((part) => part.length === 0)) {
    throw new Error(`Unsupported jq expression: "${parts.join(' | ')}"`);
  }

  let current = evaluateJq(data, parts[0] ?? '.');
  for (const part of parts.slice(1)) {
    if (Array.isArray(current)) {
      current = current.map((item) => evaluateJq(item, part));
    } else {
      current = evaluateJq(current, part);
    }
  }

  return current;
}

function evalPath(data: unknown, expr: string): unknown {
  const withoutDot = expr.slice(1);
  const tokens = parsePathTokens(withoutDot);
  const resolved = resolvePathTokens(data, tokens);
  if (!resolved.found) throw new Error(formatPathNotFoundError(expr, data, resolved.missing));
  return resolved.value;
}

function parsePathTokens(path: string): PathToken[] {
  const tokens: PathToken[] = [];

  for (let index = 0; index < path.length; ) {
    const char = path[index];
    if (char === '.') {
      index++;
      continue;
    }

    if (char === '[') {
      const closeIndex = path.indexOf(']', index);
      if (closeIndex === -1) throw new Error(`Unsupported bracket content: "${path.slice(index)}"`);
      tokens.push(parseBracketToken(path.slice(index + 1, closeIndex)));
      index = closeIndex + 1;
      continue;
    }

    const nextDot = path.indexOf('.', index);
    const nextBracket = path.indexOf('[', index);
    const nextIndexes = [nextDot, nextBracket].filter((value) => value !== -1);
    const nextIndex = nextIndexes.length === 0 ? path.length : Math.min(...nextIndexes);
    tokens.push({ kind: 'field', name: path.slice(index, nextIndex) });
    index = nextIndex;
  }

  return tokens;
}

function parseBracketToken(content: string): PathToken {
  const trimmed = content.trim();
  if (trimmed === '') return { kind: 'each', raw: content };

  const sliceMatch = /^(\d+):(\d+)$/.exec(trimmed);
  if (sliceMatch) {
    return {
      kind: 'slice',
      start: Number.parseInt(sliceMatch[1] ?? '0', 10),
      end: Number.parseInt(sliceMatch[2] ?? '0', 10),
      raw: content,
    };
  }

  if (/^-?\d+$/.test(trimmed)) {
    return { kind: 'index', index: Number.parseInt(trimmed, 10), raw: content };
  }

  throw new Error(`Unsupported bracket content: "[${content}]"`);
}

function resolvePathTokens(value: unknown, tokens: PathToken[], path = ''): PathResolution {
  if (tokens.length === 0) return { found: true, value };

  const [token, ...rest] = tokens;
  if (!token) return { found: true, value };

  if (token.kind === 'field') {
    if (!token.name || typeof value !== 'object' || value === null || Array.isArray(value)) return { found: false };
    if (!Object.hasOwn(value, token.name)) {
      if (rest[0]?.kind && rest[0].kind !== 'field') {
        throw new Error(formatExpectedArrayError(appendPath(path, token.name), undefined));
      }
      return {
        found: false,
        missing: {
          expr: `.${appendPath(path, token.name)}`,
          requestedKey: token.name,
          parentPath: path,
          parent: value as Record<string, unknown>,
        },
      };
    }
    return resolvePathTokens((value as Record<string, unknown>)[token.name], rest, appendPath(path, token.name));
  }

  if (token.kind === 'each') {
    if (!Array.isArray(value)) throw new Error(formatExpectedArrayError(path, value));
    if (rest.length === 0) return { found: true, value };

    const mapped: unknown[] = [];
    for (const item of value) {
      const resolved = resolvePathTokens(item, rest, path);
      if (!resolved.found) return resolved;
      mapped.push(resolved.value);
    }
    return { found: true, value: mapped };
  }

  if (token.kind === 'index') {
    if (!Array.isArray(value)) throw new Error(formatExpectedArrayError(path, value));
    const normalizedIndex = token.index < 0 ? value.length + token.index : token.index;
    if (!Object.hasOwn(value, normalizedIndex)) return { found: false };
    return resolvePathTokens(value[normalizedIndex], rest, appendPath(path, String(token.index)));
  }

  if (typeof value === 'string') {
    return resolvePathTokens(value.slice(token.start, token.end), rest, path);
  }
  if (Array.isArray(value)) throw new Error(`Unsupported bracket content: "[${token.raw}]"`);
  throw new Error(formatExpectedArrayError(path, value));
}

function appendPath(path: string, part: string): string {
  return path ? `${path}.${part}` : part;
}

function isObjectConstruction(expr: string): boolean {
  return expr.startsWith('{') && expr.endsWith('}');
}

function evalObjectConstruction(data: unknown, expr: string): Record<string, unknown> {
  const body = expr.slice(1, -1).trim();
  if (!body) return {};

  const result: Record<string, unknown> = {};
  for (const entry of splitTopLevel(body, ',')) {
    const trimmedEntry = entry.trim();
    if (!trimmedEntry) continue;
    const colonIndex = findTopLevelDelimiter(trimmedEntry, ':');
    if (colonIndex === -1) {
      const key = parseObjectShorthandKey(trimmedEntry);
      result[key] = evaluateJq(data, `.${key}`);
      continue;
    }

    const key = parseObjectKey(trimmedEntry.slice(0, colonIndex).trim());
    const valueExpr = trimmedEntry.slice(colonIndex + 1).trim();
    if (!valueExpr) throw new Error(`Unsupported jq object entry: "${trimmedEntry}"`);
    result[key] = evaluateJq(data, valueExpr);
  }

  return result;
}

function parseObjectShorthandKey(rawKey: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(rawKey)) return rawKey;
  throw new Error(`Unsupported jq object entry: "${rawKey}"`);
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
    if (char === '[' || char === '(' || char === '{') {
      bracketDepth++;
      continue;
    }
    if (char === ']' || char === ')' || char === '}') {
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

interface KeySuggestion {
  key: string;
  path: string;
  value: unknown;
  semantic: boolean;
  substring: boolean;
  distance: number;
  commonWords: number;
  rank: number[];
}

const CAPACITY_WORDS = new Set(['cap', 'capacity', 'max', 'total']);
const CAPACITY_KEY_WORDS = new Set(['cap', 'capacity', 'max', 'total', 'limit', 'size']);

function suggestionPath(parentPath: string, key: string): string {
  return `.${appendPath(parentPath, key)}`;
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function keyWords(value: string): string[] {
  return normalizeKey(value).split('_').filter(Boolean);
}

function containsCapacityIntent(words: string[]): boolean {
  return words.some((word) => CAPACITY_WORDS.has(word) || word.includes('cap'));
}

function hasCapacityKey(words: string[]): boolean {
  return words.some((word) => CAPACITY_KEY_WORDS.has(word) || word.includes('cap'));
}

function commonWordCount(left: string[], right: string[]): number {
  const rightSet = new Set(right);
  return left.filter((word) => rightSet.has(word)).length;
}

function hasSubstringMatch(
  requested: string,
  candidate: string,
  requestedWords: string[],
  candidateWords: string[],
): boolean {
  if (requested.includes(candidate) || candidate.includes(requested)) return true;
  return requestedWords.some((left) => candidateWords.some((right) => left.includes(right) || right.includes(left)));
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    for (let j = 1; j <= right.length; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min((current[j - 1] ?? 0) + 1, (previous[j] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? 0;
}

function findKeySuggestions(missing: MissingPathContext, limit = 3): KeySuggestion[] {
  const requested = normalizeKey(missing.requestedKey);
  const requestedWords = keyWords(missing.requestedKey);
  const capacityIntent = containsCapacityIntent(requestedWords);

  return Object.entries(missing.parent)
    .map(([key, value]) => {
      const candidate = normalizeKey(key);
      const candidateWords = keyWords(key);
      const distance = levenshtein(requested, candidate);
      const commonWords = commonWordCount(requestedWords, candidateWords);
      const semantic = capacityIntent && (hasCapacityKey(candidateWords) || commonWords > 0);
      const substring = hasSubstringMatch(requested, candidate, requestedWords, candidateWords);
      const eligible = substring || distance <= 2 || semantic;
      if (!eligible) return undefined;
      const rank = [semantic ? 0 : 1, substring ? 0 : 1, distance <= 2 ? 0 : 1, distance, -commonWords];
      return {
        key,
        path: suggestionPath(missing.parentPath, key),
        value,
        semantic,
        substring,
        distance,
        commonWords,
        rank,
      };
    })
    .filter((suggestion): suggestion is KeySuggestion => Boolean(suggestion))
    .sort(compareSuggestions)
    .slice(0, limit);
}

function compareSuggestions(left: KeySuggestion, right: KeySuggestion): number {
  for (let index = 0; index < left.rank.length; index++) {
    const delta = (left.rank[index] ?? 0) - (right.rank[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return left.path.localeCompare(right.path);
}

function previewValue(value: unknown): string {
  if (value === undefined) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  const rendered = JSON.stringify(value);
  if (!rendered) return String(value);
  return rendered.length > 80 ? `${rendered.slice(0, 77)}...` : rendered;
}

function formatSimilarKeys(missing?: MissingPathContext): string | undefined {
  if (!missing) return undefined;
  const suggestions = findKeySuggestions(missing);
  if (suggestions.length === 0) return undefined;
  return `Similar keys: ${suggestions.map((suggestion) => `${suggestion.path} (${previewValue(suggestion.value)})`).join(', ')}`;
}

function formatPathNotFoundError(expr: string, data: unknown, missing?: MissingPathContext): string {
  const base = `Path not found: "${expr}"`;
  const similarKeys = formatSimilarKeys(missing);
  const prefix = '.structuredContent.';
  const availableKeys = formatAvailableKeys(data);
  if (!expr.startsWith(prefix)) return [base, similarKeys, availableKeys].filter(Boolean).join('\n');

  const suggestedPath = `.${expr.slice(prefix.length)}`;
  const structuredContentHint = `Hint: --jq operates on structuredContent (not the full API response). Try: ${suggestedPath}`;
  return [base, structuredContentHint, similarKeys, availableKeys].filter(Boolean).join('\n');
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

export function formatJqResult(value: unknown, compact = false): string {
  if (value === undefined) return 'null';
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value, null, compact ? 0 : 2);
  }
  return String(value);
}
