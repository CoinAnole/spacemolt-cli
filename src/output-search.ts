import type { GlobalOptions } from './types.ts';

export interface OutputSearchMatch {
  path: string;
  value: unknown;
}

export type OutputSearchResult = { ok: true; matches: OutputSearchMatch[] } | { ok: false; message: string };

type SearchScope = 'key' | 'value';
type OutputSearchOptions = Pick<
  GlobalOptions,
  'outputSearch' | 'outputSearchKeys' | 'outputSearchValues' | 'outputSearchRegex'
>;
type MatcherBuildResult = { ok: true; matchers: SearchMatcher[] } | { ok: false; message: string };

interface SearchMatcher {
  option: string;
  scopes: Set<SearchScope>;
  matches(value: string): boolean;
}

const SIMPLE_JQ_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function hasOutputSearch(options?: GlobalOptions): boolean {
  return Boolean(
    options?.outputSearch || options?.outputSearchKeys || options?.outputSearchValues || options?.outputSearchRegex,
  );
}

export function findOutputSearchMatches(data: unknown, options: OutputSearchOptions): OutputSearchResult {
  const matcherResult = buildMatchers(options);
  if (!matcherResult.ok) return matcherResult;

  const matches: OutputSearchMatch[] = [];
  const seenPaths = new Set<string>();

  const emit = (path: string, value: unknown) => {
    if (seenPaths.has(path)) return;
    seenPaths.add(path);
    matches.push({ path, value });
  };

  visitOutputValue(data, '.', matcherResult.matchers, emit);
  return { ok: true, matches };
}

export function formatOutputSearchLine(match: OutputSearchMatch): string {
  return `${match.path} = ${formatOutputSearchValue(match.value)}`;
}

function buildMatchers(options: OutputSearchOptions): MatcherBuildResult {
  const matchers: SearchMatcher[] = [];

  if (options.outputSearch) {
    matchers.push(substringMatcher('--search', options.outputSearch, ['key', 'value']));
  }
  if (options.outputSearchKeys) {
    matchers.push(substringMatcher('--search-keys', options.outputSearchKeys, ['key']));
  }
  if (options.outputSearchValues) {
    matchers.push(substringMatcher('--search-values', options.outputSearchValues, ['value']));
  }
  if (options.outputSearchRegex) {
    try {
      matchers.push(regexMatcher('--search-regex', options.outputSearchRegex, ['key', 'value']));
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Invalid --search-regex pattern: ${detail}` };
    }
  }

  return { ok: true, matchers };
}

function substringMatcher(option: string, pattern: string, scopes: SearchScope[]): SearchMatcher {
  const needle = pattern.toLowerCase();
  return {
    option,
    scopes: new Set(scopes),
    matches(value) {
      return value.toLowerCase().includes(needle);
    },
  };
}

function regexMatcher(option: string, pattern: string, scopes: SearchScope[]): SearchMatcher {
  const regex = new RegExp(pattern, 'i');
  return {
    option,
    scopes: new Set(scopes),
    matches(value) {
      regex.lastIndex = 0;
      return regex.test(value);
    },
  };
}

function visitOutputValue(
  value: unknown,
  path: string,
  matchers: SearchMatcher[],
  emit: (path: string, value: unknown) => void,
): void {
  if (isScalar(value)) {
    if (matchesValue(matchers, value)) emit(path, value);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      visitOutputValue(item, `${path}[${index}]`, matchers, emit);
    });
    return;
  }

  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    const childPath = appendJqPath(path, key);
    if (matchesKey(matchers, key)) emit(childPath, child);
    if (isScalar(child) && matchesValue(matchers, child)) emit(childPath, child);
    if (!isScalar(child)) visitOutputValue(child, childPath, matchers, emit);
  }
}

function matchesKey(matchers: SearchMatcher[], key: string): boolean {
  return matchers.some((matcher) => matcher.scopes.has('key') && matcher.matches(key));
}

function matchesValue(matchers: SearchMatcher[], value: null | string | number | boolean): boolean {
  return matchers.some((matcher) => matcher.scopes.has('value') && matcher.matches(String(value)));
}

function appendJqPath(parent: string, key: string): string {
  const segment = SIMPLE_JQ_KEY.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
  return parent === '.' ? `${parent}${segment.slice(segment.startsWith('.') ? 1 : 0)}` : `${parent}${segment}`;
}

function formatOutputSearchValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  const rendered = JSON.stringify(value);
  return rendered === undefined ? String(value) : rendered;
}

function isScalar(value: unknown): value is null | string | number | boolean {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
