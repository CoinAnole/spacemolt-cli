import type { GlobalOptions } from './types.ts';

export interface OutputSearchMatch {
  path: string;
  value: unknown;
}

export type OutputSearchResult = { ok: true; matches: OutputSearchMatch[] } | { ok: false; message: string };

export type OutputFilterResult = { ok: true; value: unknown } | { ok: false; message: string };

type SearchScope = 'key' | 'value';
type OutputSearchOptions = Pick<
  GlobalOptions,
  'outputSearch' | 'outputSearchKeys' | 'outputSearchValues' | 'outputSearchRegex'
>;
type MatcherBuildResult = { ok: true; matchers: SearchMatcher[] } | { ok: false; message: string };

interface SearchMatcher {
  option: string;
  scopes: Set<SearchScope>;
  needles: string[];
  regex?: RegExp;
  matches(value: string): boolean;
}

const SIMPLE_JQ_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

const FILTER_METADATA_KEYS = new Set([
  'action',
  'count',
  'current_tick',
  'has_more',
  'has_next',
  'limit',
  'message',
  'offset',
  'remaining',
  'success',
  'timestamp',
  'total',
  'total_items',
]);

export function hasOutputSearch(options?: GlobalOptions): boolean {
  return Boolean(
    options?.outputSearch || options?.outputSearchKeys || options?.outputSearchValues || options?.outputSearchRegex,
  );
}

export function isOutputSearchFilterMode(options: OutputSearchOptions): boolean {
  return Boolean(
    options.outputSearch && !options.outputSearchKeys && !options.outputSearchValues && !options.outputSearchRegex,
  );
}

export function isEmptyFilteredOutput(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (isRecord(value)) return Object.keys(value).length === 0;
  return false;
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

export function filterStructuredOutputBySearch(data: unknown, options: OutputSearchOptions): OutputFilterResult {
  if (!options.outputSearch) return { ok: true, value: data };

  const matcherResult = buildMatchers({ outputSearch: options.outputSearch });
  if (!matcherResult.ok) return matcherResult;

  const filtered = filterOutputValue(data, matcherResult.matchers[0], true, isRecord(data) ? data : undefined);
  if (filtered === undefined) return { ok: true, value: isRecord(data) ? {} : undefined };
  return { ok: true, value: filtered };
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
  const needles = searchNeedles(pattern);
  return {
    option,
    scopes: new Set(scopes),
    needles,
    matches(value) {
      const haystack = normalizeSearchText(value);
      return needles.some((needle) => haystack.includes(needle));
    },
  };
}

function regexMatcher(option: string, pattern: string, scopes: SearchScope[]): SearchMatcher {
  const regex = new RegExp(pattern, 'i');
  return {
    option,
    scopes: new Set(scopes),
    needles: [],
    regex,
    matches(value) {
      regex.lastIndex = 0;
      return regex.test(value);
    },
  };
}

function searchNeedles(pattern: string): string[] {
  return pattern
    .split(',')
    .map((part) => normalizeSearchText(part))
    .filter(Boolean);
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
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

function filterOutputValue(
  value: unknown,
  matcher: SearchMatcher | undefined,
  preserveMetadata: boolean,
  originalRoot?: Record<string, unknown>,
): unknown | undefined {
  if (!matcher) return value;

  if (isScalar(value)) {
    return matchesValue([matcher], value) ? value : undefined;
  }

  if (Array.isArray(value)) {
    const filtered = value
      .map((item) => filterOutputValue(item, matcher, false))
      .filter((item) => item !== undefined);
    return filtered.length > 0 ? filtered : undefined;
  }

  if (!isRecord(value)) return undefined;

  const scalars: Record<string, unknown> = {};
  const filteredChildren: Record<string, unknown> = {};
  let hasMatch = false;

  for (const [key, child] of Object.entries(value)) {
    if (isScalar(child)) {
      scalars[key] = child;
      if (matchesKey([matcher], key) || matchesValue([matcher], child)) hasMatch = true;
      continue;
    }

    if (matchesKey([matcher], key)) {
      filteredChildren[key] = child;
      hasMatch = true;
      continue;
    }

    const filteredChild = filterOutputValue(child, matcher, false);
    if (filteredChild !== undefined) {
      filteredChildren[key] = filteredChild;
      hasMatch = true;
    }
  }

  if (!hasMatch) return undefined;

  const filtered = { ...scalars, ...filteredChildren };
  return preserveMetadata && originalRoot ? preserveFilterMetadata(filtered, originalRoot) : filtered;
}

function preserveFilterMetadata(filtered: Record<string, unknown>, original: Record<string, unknown>): Record<string, unknown> {
  const next = { ...filtered };
  for (const key of FILTER_METADATA_KEYS) {
    if (Object.hasOwn(original, key) && !Object.hasOwn(next, key)) {
      next[key] = original[key];
    }
  }
  return next;
}

function matchesKey(matchers: SearchMatcher[], key: string): boolean {
  return matchers.some((matcher) => {
    if (!matcher.scopes.has('key')) return false;
    if (matcher.regex) {
      matcher.regex.lastIndex = 0;
      return matcher.regex.test(key);
    }
    const haystack = normalizeSearchText(key);
    return matcher.needles.some((needle) => haystack.includes(needle));
  });
}

function matchesValue(matchers: SearchMatcher[], value: null | string | number | boolean): boolean {
  const haystack = normalizeSearchText(String(value));
  return matchers.some((matcher) => {
    if (!matcher.scopes.has('value')) return false;
    if (matcher.regex) {
      matcher.regex.lastIndex = 0;
      return matcher.regex.test(String(value));
    }
    return matcher.needles.some((needle) => haystack.includes(needle));
  });
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