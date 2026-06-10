# Output Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add global `--search`, `--search-keys`, `--search-values`, and `--search-regex` output projection flags that print recursive jq paths and values from structured command output.

**Architecture:** Parse dashed search flags as global options so command payload forms such as `search=fuel` still reach command handlers. Put recursive matching and path formatting in a focused `src/output-search.ts` module, then call it from `src/display/index.ts` as a projection over `normalizeStructuredResultForOutput`, with optional `--jq` scoping first.

**Tech Stack:** Bun test runner, TypeScript, existing SpaceMolt CLI renderer/projection pipeline.

---

## File Structure

- Create `src/output-search.ts`: pure helper for compiling search matchers, walking structured data, formatting jq-style paths, and formatting path/value output lines.
- Create `src/output-search.test.ts`: focused unit tests for recursive matching, mode selection, regex errors, arrays, root scalar search, and duplicate suppression.
- Modify `src/types.ts`: add optional global output search fields to `GlobalOptions`.
- Modify `src/global-options.ts`: parse the new dashed search flags and keep command payload forms such as `search=fuel` untouched as command arguments.
- Modify `src/args.test.ts`: add parser coverage for the new flags and missing-value errors.
- Modify `src/display/index.ts`: integrate search as a projection, including `--jq` scoping before search.
- Modify `src/formatter.test.ts`: add end-to-end renderer tests for search projection precedence and jq scoping.
- Modify `src/response-renderer.ts`: include output search in `hasProjection` so notifications/timestamps/full JSON do not wrap search output.
- Modify `src/completion-metadata.ts` and `src/command-metadata.test.ts`: expose the new global flags to shell completion.
- Modify `src/help.ts` and `src/help.test.ts`: document the flags and precedence.

## Task 1: Parse Global Output Search Flags

**Files:**
- Modify: `src/types.ts`
- Modify: `src/global-options.ts`
- Test: `src/args.test.ts`

- [ ] **Step 1: Write failing parser tests**

Add these tests inside the existing `describe('CLI output modes', () => {` block in `src/args.test.ts`, after the existing "global option parser handles watch, format, jq, profile, fuzzy, and dry-run values" test:

```ts
  test('global option parser handles output search flags', () => {
    const result = parseGlobalOptions([
      '--search',
      'fuel',
      '--search-keys=max_.*',
      '--search-values',
      '700',
      '--search-regex',
      'hull|armor',
      'get_status',
      'search=server_payload',
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.options.outputSearch).toBe('fuel');
    expect(result.options.outputSearchKeys).toBe('max_.*');
    expect(result.options.outputSearchValues).toBe('700');
    expect(result.options.outputSearchRegex).toBe('hull|armor');
    expect(result.options.args).toEqual(['get_status', 'search=server_payload']);
  });

  test('global option parser rejects missing output search values', () => {
    expect(parseGlobalOptions(['--search'])).toEqual({
      ok: false,
      error: {
        code: 'invalid_global_option',
        option: '--search',
        message: '--search requires a pattern.',
      },
    });
    expect(parseGlobalOptions(['--search-keys'])).toEqual({
      ok: false,
      error: {
        code: 'invalid_global_option',
        option: '--search-keys',
        message: '--search-keys requires a pattern.',
      },
    });
    expect(parseGlobalOptions(['--search-values'])).toEqual({
      ok: false,
      error: {
        code: 'invalid_global_option',
        option: '--search-values',
        message: '--search-values requires a pattern.',
      },
    });
    expect(parseGlobalOptions(['--search-regex'])).toEqual({
      ok: false,
      error: {
        code: 'invalid_global_option',
        option: '--search-regex',
        message: '--search-regex requires a pattern.',
      },
    });
  });
```

- [ ] **Step 2: Run parser tests and verify they fail**

Run:

```bash
bun test src/args.test.ts
```

Expected: FAIL because `GlobalOptions` does not have the `outputSearch*` properties and `parseGlobalOptions` leaves the dashed flags in `args`.

- [ ] **Step 3: Add the global option fields**

In `src/types.ts`, extend `GlobalOptions`:

```ts
  outputSearch?: string;
  outputSearchKeys?: string;
  outputSearchValues?: string;
  outputSearchRegex?: string;
```

Place these after `keys?: string;`.

- [ ] **Step 4: Add parser helper and flag handling**

In `src/global-options.ts`, add this helper near `parseProfileValue`:

```ts
function parseRequiredPatternValue(
  option: string,
  value: string | undefined,
  state: PartialOutputState,
): string | GlobalOptionParseResult {
  if (value === undefined || value.trim() === '') {
    return parseError(option, `${option} requires a pattern.`, state);
  }
  return value.trim();
}
```

Then add these branches after the `--keys` handling and before `--watch`:

```ts
    } else if (arg === '--search') {
      const parsed = parseRequiredPatternValue(arg, args[i + 1], outputState(result));
      if (typeof parsed !== 'string') return parsed;
      result.outputSearch = parsed;
      i++;
    } else if (arg.startsWith('--search=')) {
      const parsed = parseRequiredPatternValue('--search', arg.slice('--search='.length), outputState(result));
      if (typeof parsed !== 'string') return parsed;
      result.outputSearch = parsed;
    } else if (arg === '--search-keys') {
      const parsed = parseRequiredPatternValue(arg, args[i + 1], outputState(result));
      if (typeof parsed !== 'string') return parsed;
      result.outputSearchKeys = parsed;
      i++;
    } else if (arg.startsWith('--search-keys=')) {
      const parsed = parseRequiredPatternValue(
        '--search-keys',
        arg.slice('--search-keys='.length),
        outputState(result),
      );
      if (typeof parsed !== 'string') return parsed;
      result.outputSearchKeys = parsed;
    } else if (arg === '--search-values') {
      const parsed = parseRequiredPatternValue(arg, args[i + 1], outputState(result));
      if (typeof parsed !== 'string') return parsed;
      result.outputSearchValues = parsed;
      i++;
    } else if (arg.startsWith('--search-values=')) {
      const parsed = parseRequiredPatternValue(
        '--search-values',
        arg.slice('--search-values='.length),
        outputState(result),
      );
      if (typeof parsed !== 'string') return parsed;
      result.outputSearchValues = parsed;
    } else if (arg === '--search-regex') {
      const parsed = parseRequiredPatternValue(arg, args[i + 1], outputState(result));
      if (typeof parsed !== 'string') return parsed;
      result.outputSearchRegex = parsed;
      i++;
    } else if (arg.startsWith('--search-regex=')) {
      const parsed = parseRequiredPatternValue(
        '--search-regex',
        arg.slice('--search-regex='.length),
        outputState(result),
      );
      if (typeof parsed !== 'string') return parsed;
      result.outputSearchRegex = parsed;
```

- [ ] **Step 5: Run parser tests and verify they pass**

Run:

```bash
bun test src/args.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit parser support**

```bash
git add src/types.ts src/global-options.ts src/args.test.ts
git commit -m "feat: parse output search flags"
```

## Task 2: Build Recursive Output Search Helper

**Files:**
- Create: `src/output-search.ts`
- Create: `src/output-search.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `src/output-search.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { findOutputSearchMatches, formatOutputSearchLine } from './output-search.ts';

const fixture = {
  ship: {
    fuel: 13,
    max_fuel: 700,
    hull: 480,
    max_hull: 480,
    armor: 0,
    name: 'Fuel Runner',
    modules: [{ slot: 'utility', item_id: 'fuel_scoop' }],
  },
  market: {
    items: [
      { item_id: 'ore_iron', quantity: 5 },
      { item_id: 'fuel_cell', quantity: 700 },
    ],
  },
};

describe('output search', () => {
  test('--search matches keys and scalar values case-insensitively', () => {
    const result = findOutputSearchMatches(fixture, { outputSearch: 'fuel' });

    expect(result).toEqual({
      ok: true,
      matches: [
        { path: '.ship.fuel', value: 13 },
        { path: '.ship.max_fuel', value: 700 },
        { path: '.ship.name', value: 'Fuel Runner' },
        { path: '.ship.modules[0].item_id', value: 'fuel_scoop' },
        { path: '.market.items[1].item_id', value: 'fuel_cell' },
      ],
    });
  });

  test('--search-keys only matches property names', () => {
    const result = findOutputSearchMatches(fixture, { outputSearchKeys: 'fuel' });

    expect(result).toEqual({
      ok: true,
      matches: [
        { path: '.ship.fuel', value: 13 },
        { path: '.ship.max_fuel', value: 700 },
      ],
    });
  });

  test('--search-values only matches scalar values', () => {
    const result = findOutputSearchMatches(fixture, { outputSearchValues: '700' });

    expect(result).toEqual({
      ok: true,
      matches: [
        { path: '.ship.max_fuel', value: 700 },
        { path: '.market.items[1].quantity', value: 700 },
      ],
    });
  });

  test('--search-regex matches keys and values with a regex', () => {
    const result = findOutputSearchMatches(fixture, { outputSearchRegex: '^(max_)?hull$|^armor$' });

    expect(result).toEqual({
      ok: true,
      matches: [
        { path: '.ship.hull', value: 480 },
        { path: '.ship.max_hull', value: 480 },
        { path: '.ship.armor', value: 0 },
      ],
    });
  });

  test('invalid regex returns a structured error', () => {
    const result = findOutputSearchMatches(fixture, { outputSearchRegex: '[' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected regex failure');
    expect(result.message).toContain('Invalid --search-regex pattern');
  });

  test('key matches can print object or array values', () => {
    const result = findOutputSearchMatches(fixture, { outputSearchKeys: 'modules' });

    expect(result).toEqual({
      ok: true,
      matches: [{ path: '.ship.modules', value: [{ slot: 'utility', item_id: 'fuel_scoop' }] }],
    });
    if (!result.ok) throw new Error(result.message);
    expect(formatOutputSearchLine(result.matches[0]!)).toBe(
      '.ship.modules = [{"slot":"utility","item_id":"fuel_scoop"}]',
    );
  });

  test('root scalar search emits dot path', () => {
    const result = findOutputSearchMatches('Fuel Runner', { outputSearch: 'fuel' });

    expect(result).toEqual({
      ok: true,
      matches: [{ path: '.', value: 'Fuel Runner' }],
    });
  });

  test('duplicate paths are emitted once when multiple modes match', () => {
    const result = findOutputSearchMatches({ fuel: 'fuel' }, { outputSearch: 'fuel', outputSearchKeys: 'fuel' });

    expect(result).toEqual({
      ok: true,
      matches: [{ path: '.fuel', value: 'fuel' }],
    });
  });
});
```

- [ ] **Step 2: Run helper tests and verify they fail**

Run:

```bash
bun test src/output-search.test.ts
```

Expected: FAIL with module-not-found for `./output-search.ts`.

- [ ] **Step 3: Implement the helper module**

Create `src/output-search.ts`:

```ts
import type { GlobalOptions } from './types.ts';

export interface OutputSearchMatch {
  path: string;
  value: unknown;
}

export type OutputSearchResult =
  | { ok: true; matches: OutputSearchMatch[] }
  | { ok: false; message: string };

type SearchScope = 'key' | 'value';

interface SearchMatcher {
  option: string;
  scopes: Set<SearchScope>;
  matches(value: string): boolean;
}

const SIMPLE_JQ_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function hasOutputSearch(options?: GlobalOptions): boolean {
  return Boolean(
    options?.outputSearch ||
      options?.outputSearchKeys ||
      options?.outputSearchValues ||
      options?.outputSearchRegex,
  );
}

export function findOutputSearchMatches(data: unknown, options: Pick<
  GlobalOptions,
  'outputSearch' | 'outputSearchKeys' | 'outputSearchValues' | 'outputSearchRegex'
>): OutputSearchResult {
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

function buildMatchers(options: Pick<
  GlobalOptions,
  'outputSearch' | 'outputSearchKeys' | 'outputSearchValues' | 'outputSearchRegex'
>): OutputSearchResult | { ok: true; matchers: SearchMatcher[] } {
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
    value.forEach((item, index) => visitOutputValue(item, `${path}[${index}]`, matchers, emit));
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
```

- [ ] **Step 4: Run helper tests and verify they pass**

Run:

```bash
bun test src/output-search.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit helper module**

```bash
git add src/output-search.ts src/output-search.test.ts
git commit -m "feat: add output search matcher"
```

## Task 3: Integrate Search Into Structured Rendering

**Files:**
- Modify: `src/display/index.ts`
- Modify: `src/response-renderer.ts`
- Test: `src/formatter.test.ts`

- [ ] **Step 1: Write failing renderer tests**

Add these tests inside the existing `describe('structuredContent output mode precedence', () => {` block in `src/formatter.test.ts`, after the `--jq wins over --fields` test:

```ts
  test('--search prints matching jq paths and values', () => {
    const { stdout, stderr } = captureStructuredOutput(
      'get_status',
      {
        ship: { fuel: 13, max_fuel: 700, name: 'Fuel Runner' },
        player: { username: 'Marlowe' },
      },
      { outputSearch: 'fuel' },
    );

    expect(stderr).toBe('');
    expect(stdout).toBe(['.ship.fuel = 13', '.ship.max_fuel = 700', '.ship.name = Fuel Runner'].join('\n'));
  });

  test('--search-keys and --search-values restrict match scopes', () => {
    const keyOnly = captureStructuredOutput(
      'get_status',
      { ship: { fuel: 13, name: 'Fuel Runner', max_fuel: 700 } },
      { outputSearchKeys: 'fuel' },
    );
    const valueOnly = captureStructuredOutput(
      'get_status',
      { ship: { fuel: 13, name: 'Fuel Runner', max_fuel: 700 } },
      { outputSearchValues: '700' },
    );

    expect(keyOnly.stderr).toBe('');
    expect(keyOnly.stdout).toBe(['.ship.fuel = 13', '.ship.max_fuel = 700'].join('\n'));
    expect(valueOnly.stderr).toBe('');
    expect(valueOnly.stdout).toBe('.ship.max_fuel = 700');
  });

  test('--search-regex prints matches or exits nonzero for invalid regex', () => {
    const valid = renderStructuredResult(
      'get_status',
      { ship: { hull: 480, max_hull: 480, armor: 0, fuel: 13 } },
      globalOptions({ outputSearchRegex: '^(max_)?hull$|^armor$' }),
    );

    expect(valid.success).toBe(true);
    expect(valid.stderr).toEqual([]);
    expect(valid.stdout).toEqual(['.ship.hull = 480', '.ship.max_hull = 480', '.ship.armor = 0']);

    const invalid = renderStructuredResult(
      'get_status',
      { ship: { fuel: 13 } },
      globalOptions({ outputSearchRegex: '[' }),
    );

    expect(invalid.success).toBe(false);
    expect(invalid.stdout).toEqual([]);
    expect(invalid.stderr.join('\n').replace(ANSI_PATTERN, '')).toContain('Invalid --search-regex pattern');
  });

  test('--jq scopes output search to the selected subtree', () => {
    const { stdout, stderr } = captureStructuredOutput(
      'get_status',
      {
        ship: { fuel: 13, max_fuel: 700 },
        station: { fuel: 999 },
      },
      { jq: '.ship', outputSearch: 'fuel' },
    );

    expect(stderr).toBe('');
    expect(stdout).toBe(['.fuel = 13', '.max_fuel = 700'].join('\n'));
  });
```

- [ ] **Step 2: Run renderer tests and verify they fail**

Run:

```bash
bun test src/formatter.test.ts
```

Expected: FAIL because the renderer ignores `outputSearch*` options.

- [ ] **Step 3: Import search helpers into the display renderer**

In `src/display/index.ts`, add:

```ts
import { findOutputSearchMatches, formatOutputSearchLine, hasOutputSearch } from '../output-search.ts';
```

- [ ] **Step 4: Add search projection inside `displayStructuredResultInternal`**

In `src/display/index.ts`, after `const jqExpr = options?.jq;` add:

```ts
  const outputSearch = hasOutputSearch(options);
```

Replace the current `if (jqExpr) {` block that evaluates jq and emits `formatProjection` with:

```ts
  if (jqExpr) {
    try {
      const jqResult = evaluateJq(structuredOutputResult, jqExpr, { fuzzy: options?.fuzzy });
      if (outputSearch) {
        const searchResult = findOutputSearchMatches(jqResultValue(jqResult), options ?? ({} as GlobalOptions));
        if (!searchResult.ok) {
          emitError(`${c.red}Error:${c.reset} ${searchResult.message}`);
          return false;
        }
        for (const match of searchResult.matches) emitLine(formatOutputSearchLine(match));
        return true;
      }
      emitLine(formatProjection(jqResult, format, compact, 'jq'));
      return true;
    } catch (err) {
      emitError(`${c.red}Error:${c.reset} ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  if (outputSearch) {
    const searchResult = findOutputSearchMatches(structuredOutputResult, options ?? ({} as GlobalOptions));
    if (!searchResult.ok) {
      emitError(`${c.red}Error:${c.reset} ${searchResult.message}`);
      return false;
    }
    for (const match of searchResult.matches) emitLine(formatOutputSearchLine(match));
    return true;
  }
```

Leave the existing `--keys` block before this code so `--keys` behavior remains unchanged.

- [ ] **Step 5: Include output search in projection detection**

In `src/response-renderer.ts`, add:

```ts
import { hasOutputSearch } from './output-search.ts';
```

Then replace the `hasProjection` calculation with:

```ts
  const hasProjection = Boolean(
    options.jq ||
      options.keys !== undefined ||
      options.field ||
      (options.fields && options.fields.length > 0) ||
      hasOutputSearch(options),
  );
```

- [ ] **Step 6: Run renderer tests and verify they pass**

Run:

```bash
bun test src/formatter.test.ts src/response-renderer.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit renderer integration**

```bash
git add src/display/index.ts src/response-renderer.ts src/formatter.test.ts
git commit -m "feat: render output search projections"
```

## Task 4: Add Help and Completion Metadata

**Files:**
- Modify: `src/completion-metadata.ts`
- Modify: `src/command-metadata.test.ts`
- Modify: `src/help.ts`
- Modify: `src/help.test.ts`

- [ ] **Step 1: Write failing help and completion tests**

In `src/command-metadata.test.ts`, add these strings to the `globalOptions` array in `shell completions include every parser-supported global option`:

```ts
      '--search',
      '--search-keys',
      '--search-values',
      '--search-regex',
```

In `src/help.test.ts`, add these assertions to both `showHelp documents automation output semantics` and `showFullHelp documents automation output semantics`:

```ts
    expect(output).toContain('--search');
    expect(output).toContain('--search-keys');
    expect(output).toContain('--search-values');
    expect(output).toContain('--search-regex');
    expect(output).toContain('Search projections print jq paths and values.');
```

- [ ] **Step 2: Run metadata/help tests and verify they fail**

Run:

```bash
bun test src/command-metadata.test.ts src/help.test.ts
```

Expected: FAIL because the flags are not documented in completion/help output.

- [ ] **Step 3: Add completion metadata**

In `src/completion-metadata.ts`, add these entries after the `--keys` entry:

```ts
  { long: '--search', description: 'Search structured output keys and values', takesValue: true },
  { long: '--search-keys', description: 'Search structured output keys', takesValue: true },
  { long: '--search-values', description: 'Search structured output values', takesValue: true },
  { long: '--search-regex', description: 'Regex search structured output keys and values', takesValue: true },
```

- [ ] **Step 4: Document the flags in short help**

In `src/help.ts`, in `showHelp`, add these global flag lines after `--keys [path]`:

```text
  --search          Search structured output keys and values
  --search-keys     Search structured output keys only
  --search-values   Search structured output scalar values only
  --search-regex    Regex search structured output keys and values
```

Then add this line to the `Output Precedence` section after `Projections read from structuredContent when present.`:

```text
  Search projections print jq paths and values.
```

- [ ] **Step 5: Document the flags in full help**

In `src/help.ts`, in `showFullHelp`, add these output mode lines after `--keys [path]`:

```text
      --search <text>      Search structured output keys and values
      --search-keys <text> Search structured output keys only
      --search-values <t>  Search structured output scalar values only
      --search-regex <rx>  Regex search structured output keys and values
```

Then add this line to the full-help `Output precedence` section after `Projections read from structuredContent when present.`:

```text
      Search projections print jq paths and values.
```

- [ ] **Step 6: Run metadata/help tests and verify they pass**

Run:

```bash
bun test src/command-metadata.test.ts src/help.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit docs and completion metadata**

```bash
git add src/completion-metadata.ts src/command-metadata.test.ts src/help.ts src/help.test.ts
git commit -m "docs: document output search flags"
```

## Task 5: Verify End-to-End Behavior and Type Safety

**Files:**
- No new files.
- Modify files only if verification exposes a real issue in the implementation from Tasks 1-4.

- [ ] **Step 1: Run focused tests**

Run:

```bash
bun test src/output-search.test.ts src/args.test.ts src/formatter.test.ts src/response-renderer.test.ts src/command-metadata.test.ts src/help.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run the full test suite**

Run:

```bash
bun test
```

Expected: PASS.

- [ ] **Step 4: Manually verify CLI examples with dry-run structured data**

Run:

```bash
bun run src/client.ts --dry-run get_status --search route
```

Expected: output includes path/value lines from the dry-run response, with no timestamp line.

Run:

```bash
bun run src/client.ts --dry-run get_status --jq '.payload' --search route
```

Expected: output paths are rooted at `.` because `--jq` scoped the search subtree.

- [ ] **Step 5: Check final diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: the worktree has only intentional changes from the implementation if any verification fixes were needed.

- [ ] **Step 6: Commit verification fixes if any were required**

If Step 5 shows verification fixes, commit them:

```bash
git add src
git commit -m "fix: stabilize output search"
```

If Step 5 shows no uncommitted changes, do not create an empty commit.
