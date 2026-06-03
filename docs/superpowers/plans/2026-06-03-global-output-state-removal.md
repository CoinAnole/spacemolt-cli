# Global Output State Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove mutable runtime/output globals while preserving CLI behavior and golden output.

**Architecture:** First rename the existing global-backed config to make the current bridge explicit. Then introduce explicit output state and plain-aware color helpers, route parser/runner/session/update/id-cache code through config/context instead of mutable module state, and finally delete the global-backed config, `setOutputMode()`, mutable exports, and legacy entrypoint exports.

**Tech Stack:** Bun test runner, TypeScript, existing `CliRuntimeContext`, `SpaceMoltConfig`, exact golden-output harness, local OpenAPI cache.

---

## File Structure

- Modify `src/runtime.ts` to rename the compatibility config in Part 1, then remove mutable globals and legacy helpers in Part 2.
- Modify `src/client.ts` to export `GlobalBackedConfig` in Part 1, then remove legacy config exports in Part 2.
- Modify `src/config.test.ts` to cover the temporary global-backed bridge, then replace those assertions with explicit immutable config behavior.
- Create `src/output-state.ts` for early parse-error output state derivation and immutable config snapshots.
- Create `src/output-style.ts` for `plain`-aware direct-output color helpers.
- Modify `src/global-options.ts` so parsing returns options and profile data without mutating runtime globals.
- Modify `src/runner.ts` so early parse errors, watch messages, and connection errors render from explicit output/config state.
- Modify `src/session.ts` so session debug messages use constructor-injected `debug` and `plain` state.
- Modify `src/api.ts` so `SpaceMoltClient` no longer defaults to a global-backed config.
- Modify `src/update.ts` so debug and update notice colors use explicit options.
- Modify `src/id-cache.ts` so quiet/plain output behavior is passed by callers.
- Modify `src/runner.test.ts`, `src/output-golden.test.ts`, `src/cli-local.test.ts`, and related tests to stop importing mutable runtime globals.

## Task 1: Rename the Existing Compatibility Bridge

**Files:**
- Modify: `src/runtime.ts`
- Modify: `src/client.ts`
- Modify: `src/config.test.ts`

- [ ] **Step 1: Update the config test names and imports**

In `src/config.test.ts`, change the runtime import to include `GlobalBackedConfig`:

```ts
import {
  createDefaultConfig,
  createRuntimeState,
  GlobalBackedConfig,
  LegacySpaceMoltConfig,
  type SpaceMoltConfig,
  setOutputMode,
} from './runtime.ts';
```

Rename the first test to:

```ts
test('GlobalBackedConfig resolves globals dynamically', () => {
  const config = new GlobalBackedConfig();

  expect(config.apiBase).toBeDefined();

  const configWithOverrides = createDefaultConfig({
    apiBase: 'https://custom-test.spacemolt.com/api/v2',
    jsonOutput: true,
  });

  expect(configWithOverrides.apiBase).toBe('https://custom-test.spacemolt.com/api/v2');
  expect(configWithOverrides.jsonOutput).toBe(true);
});
```

Add an alias assertion next to that test:

```ts
test('LegacySpaceMoltConfig remains a temporary alias', () => {
  expect(new LegacySpaceMoltConfig()).toBeInstanceOf(GlobalBackedConfig);
});
```

- [ ] **Step 2: Run the focused config test and verify it fails**

Run:

```bash
bun test src/config.test.ts --test-name-pattern "GlobalBackedConfig|temporary alias"
```

Expected: FAIL because `GlobalBackedConfig` is not exported yet.

- [ ] **Step 3: Rename the class and keep a deprecated alias**

In `src/runtime.ts`, replace:

```ts
export class LegacySpaceMoltConfig implements SpaceMoltConfig {
```

with:

```ts
export class GlobalBackedConfig implements SpaceMoltConfig {
```

After the class body, add:

```ts
/** @deprecated Use explicit SpaceMoltConfig objects. This alias is removed in the global-state cleanup. */
export const LegacySpaceMoltConfig = GlobalBackedConfig;
```

Update defaults:

```ts
export function createRuntimeState(config: SpaceMoltConfig = new GlobalBackedConfig()): RuntimeState {
```

and:

```ts
const base = new GlobalBackedConfig();
```

- [ ] **Step 4: Export the new name from the package entrypoint**

In `src/client.ts`, replace:

```ts
export { createDefaultConfig, LegacySpaceMoltConfig } from './runtime.ts';
```

with:

```ts
export { createDefaultConfig, GlobalBackedConfig, LegacySpaceMoltConfig } from './runtime.ts';
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
bun test src/config.test.ts src/runner.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the compatibility rename**

Run:

```bash
git add src/runtime.ts src/client.ts src/config.test.ts
git commit -m "refactor: name global-backed runtime config"
```

## Task 2: Add Explicit Output State and Direct Color Helpers

**Files:**
- Create: `src/output-state.ts`
- Create: `src/output-state.test.ts`
- Create: `src/output-style.ts`
- Create: `src/output-style.test.ts`
- Modify: `src/cli-context.ts`

- [ ] **Step 1: Write failing output-state tests**

Create `src/output-state.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import {
  createDefaultConfig,
  outputStateFromGlobalOptionError,
  outputStateFromOptions,
  type OutputRuntimeState,
} from './output-state.ts';
import type { GlobalOptions } from './types.ts';

const baseOptions: GlobalOptions = {
  json: false,
  quiet: false,
  plain: false,
  debug: false,
  allowUnknown: false,
  dryRun: false,
  fields: undefined,
  noTimestamp: false,
  compact: false,
  args: [],
};

describe('explicit output state', () => {
  test('derives output state from parsed options and env', () => {
    const state = outputStateFromOptions(
      { ...baseOptions, format: 'yaml', plain: true, compact: true },
      { DEBUG: 'true', SPACEMOLT_OUTPUT: undefined },
    );

    expect(state).toEqual<OutputRuntimeState>({
      jsonOutput: false,
      debug: true,
      plain: true,
      quiet: false,
      format: 'yaml',
      compact: true,
    });
  });

  test('derives early parse-error output state from partial flags', () => {
    const state = outputStateFromGlobalOptionError(
      { code: 'invalid_global_option', option: '--format', message: 'bad', json: true, plain: true },
      { DEBUG: 'true', SPACEMOLT_OUTPUT: undefined },
    );

    expect(state).toEqual<OutputRuntimeState>({
      jsonOutput: true,
      debug: true,
      plain: true,
      quiet: false,
      format: 'json',
      compact: false,
    });
  });

  test('createDefaultConfig returns an immutable env-backed snapshot', () => {
    const config = createDefaultConfig(
      { plain: true, profile: 'pilot' },
      { SPACEMOLT_URL: 'https://example.test/api/v2', DEBUG: 'true', SPACEMOLT_OUTPUT: 'json' },
    );

    expect(config).toEqual({
      apiBase: 'https://example.test/api/v2',
      jsonOutput: true,
      debug: true,
      plain: true,
      quiet: false,
      format: 'json',
      compact: false,
      profile: 'pilot',
      profileIsExplicit: false,
    });
  });
});
```

- [ ] **Step 2: Write failing output-style tests**

Create `src/output-style.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { colorsForPlain, colorizeForPlain } from './output-style.ts';
import { rawColors } from './display/ansi.ts';

describe('plain-aware direct output styling', () => {
  test('colorizeForPlain strips color when plain is true', () => {
    expect(colorizeForPlain('Error', rawColors.red, true)).toBe('Error');
    expect(colorizeForPlain('Error', rawColors.red, false)).toBe(`${rawColors.red}Error${rawColors.reset}`);
  });

  test('colorsForPlain exposes empty styles in plain mode', () => {
    const plain = colorsForPlain(true);
    const color = colorsForPlain(false);

    expect(plain.red).toBe('');
    expect(plain.reset).toBe('');
    expect(color.red).toBe(rawColors.red);
    expect(color.reset).toBe(rawColors.reset);
  });
});
```

- [ ] **Step 3: Run focused tests and verify they fail**

Run:

```bash
bun test src/output-state.test.ts src/output-style.test.ts
```

Expected: FAIL because the new modules do not exist.

- [ ] **Step 4: Implement `src/output-state.ts`**

Create `src/output-state.ts`:

```ts
import type { CliEnv } from './cli-context.ts';
import type { GlobalOptionParseError } from './global-options.ts';
import { DEFAULT_V2_API_BASE, type SpaceMoltConfig } from './runtime.ts';
import type { GlobalOptions, OutputFormat } from './types.ts';

export interface OutputRuntimeState {
  jsonOutput: boolean;
  debug: boolean;
  plain: boolean;
  quiet: boolean;
  format: OutputFormat;
  compact: boolean;
}

export function outputStateFromOptions(options: GlobalOptions, env: CliEnv = process.env): OutputRuntimeState {
  const format = options.format ?? (options.json ? 'json' : 'table');
  const jsonOutput = options.json || format === 'json' || env.SPACEMOLT_OUTPUT === 'json';
  return {
    jsonOutput,
    debug: options.debug || env.DEBUG === 'true',
    plain: options.plain,
    quiet: options.quiet,
    format: jsonOutput ? 'json' : format,
    compact: options.compact,
  };
}

export function outputStateFromGlobalOptionError(
  error: GlobalOptionParseError,
  env: CliEnv = process.env,
): OutputRuntimeState {
  const jsonOutput = Boolean(error.json || env.SPACEMOLT_OUTPUT === 'json');
  return {
    jsonOutput,
    debug: Boolean(error.debug || env.DEBUG === 'true'),
    plain: Boolean(error.plain),
    quiet: Boolean(error.quiet),
    format: jsonOutput ? 'json' : 'table',
    compact: false,
  };
}

export function createDefaultConfig(
  overrides: Partial<SpaceMoltConfig> = {},
  env: CliEnv = process.env,
): SpaceMoltConfig {
  const jsonOutput = overrides.jsonOutput ?? env.SPACEMOLT_OUTPUT === 'json';
  return {
    apiBase: overrides.apiBase ?? env.SPACEMOLT_URL ?? DEFAULT_V2_API_BASE,
    jsonOutput,
    debug: overrides.debug ?? env.DEBUG === 'true',
    plain: overrides.plain ?? false,
    quiet: overrides.quiet ?? false,
    format: overrides.format ?? (jsonOutput ? 'json' : 'table'),
    compact: overrides.compact ?? false,
    profile: overrides.profile ?? env.SPACEMOLT_PROFILE,
    profileIsExplicit: overrides.profileIsExplicit ?? false,
  };
}
```

- [ ] **Step 5: Implement `src/output-style.ts`**

Create `src/output-style.ts`:

```ts
import { colorize, rawColors } from './display/ansi.ts';

export type DirectColors = typeof rawColors;

export function colorizeForPlain(text: string, code: string, plain: boolean): string {
  return colorize(text, code, plain);
}

export function colorsForPlain(plain: boolean): DirectColors {
  if (!plain) return rawColors;
  return {
    reset: '',
    bright: '',
    dim: '',
    red: '',
    green: '',
    yellow: '',
    blue: '',
    magenta: '',
    cyan: '',
  };
}
```

- [ ] **Step 6: Expand `CliOutputOptions` to match runtime state**

In `src/cli-context.ts`, change `CliOutputOptions` to:

```ts
export interface CliOutputOptions {
  json?: boolean;
  jsonOutput?: boolean;
  debug?: boolean;
  quiet?: boolean;
  plain?: boolean;
  format?: OutputFormat;
  compact?: boolean;
}
```

In `createDefaultCliRuntimeContext()` and `withResolvedConfig()`, include:

```ts
jsonOutput: config.jsonOutput,
debug: config.debug,
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
bun test src/output-state.test.ts src/output-style.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit explicit output helpers**

Run:

```bash
git add src/output-state.ts src/output-state.test.ts src/output-style.ts src/output-style.test.ts src/cli-context.ts
git commit -m "feat: add explicit output runtime state"
```

## Task 3: Stop Mutating Runtime Globals During Option Parsing

**Files:**
- Modify: `src/global-options.ts`
- Modify: `src/runner.ts`
- Modify: `src/runner.test.ts`

- [ ] **Step 1: Add runner tests that assert repeated invocations do not depend on mutable runtime globals**

In `src/runner.test.ts`, add tests near the existing global option tests:

```ts
test('parse errors render from explicit output state without setOutputMode', async () => {
  const result = await captureInvocation(['--format=invalid'], { SPACEMOLT_OUTPUT: 'json', DEBUG: 'true' });

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toBe('');
  expect(JSON.parse(result.stdout)).toMatchObject({
    error: {
      code: 'invalid_global_option',
    },
  });
});

test('plain parse errors use explicit plain state', async () => {
  const result = await captureInvocation(['--plain', '--format=invalid']);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('Error:');
  expect(result.stderr).not.toContain('\x1b[');
});
```

- [ ] **Step 2: Run focused tests and verify they fail after removing setOutputMode calls**

Temporarily remove the `setOutputMode()` import from `src/global-options.ts` and `src/runner.ts`, then run:

```bash
bun test src/runner.test.ts --test-name-pattern "parse errors render|plain parse errors"
```

Expected: FAIL until explicit parse-error rendering is implemented.

- [ ] **Step 3: Make `applyGlobalOptions()` stop mutating output globals**

In `src/global-options.ts`, remove:

```ts
import { setOutputMode } from './runtime.ts';
```

Replace `applyGlobalOptions()` with:

```ts
export function applyGlobalOptions(options: GlobalOptions, env: CliEnv = process.env): void {
  setActiveProfile(options.profile || env.SPACEMOLT_PROFILE);
}
```

This function remains only for active-profile side effects during the transition.

- [ ] **Step 4: Update runner early parse-error rendering**

In `src/runner.ts`, remove `DEBUG` and `setOutputMode` from the runtime import. Add:

```ts
import { outputStateFromGlobalOptionError } from './output-state.ts';
import { colorsForPlain } from './output-style.ts';
```

Replace the parse-error block with:

```ts
if (!parsedInvocation.ok) {
  const output = outputStateFromGlobalOptionError(parsedInvocation.error, context.env);
  const colors = colorsForPlain(output.plain);
  if (output.jsonOutput) {
    printJsonError(parsedInvocation.error.code, parsedInvocation.error.message, context.writer);
  } else if (!output.quiet) {
    context.writer.err(`${colors.red}Error:${colors.reset} ${parsedInvocation.error.message}`);
  }
  return 1;
}
```

- [ ] **Step 5: Run focused runner tests**

Run:

```bash
bun test src/runner.test.ts --test-name-pattern "parse errors render|plain parse errors|global options"
```

Expected: PASS after updating old assertions that imported `JSON_OUTPUT`, `FORMAT`, `PLAIN`, `COMPACT`, or `DEBUG`.

- [ ] **Step 6: Commit parser mutation removal**

Run:

```bash
git add src/global-options.ts src/runner.ts src/runner.test.ts
git commit -m "refactor: render parse errors from explicit output state"
```

## Task 4: Move Runner Direct Output to Context Config

**Files:**
- Modify: `src/runner.ts`
- Modify: `src/runner.test.ts`

- [ ] **Step 1: Add connection-error tests for explicit debug/plain/API base**

In `src/runner.test.ts`, add:

```ts
test('connection errors use context config for debug and api base', async () => {
  const result = await captureInvocation(
    ['--plain', '--debug', 'get_status'],
    { SPACEMOLT_URL: 'https://configured.test/api/v2' },
    {
      getDefaultProfile: () => undefined,
      createClient(config) {
        return {
          config,
          async execute() {
            throw new Error('fetch failed');
          },
        } as unknown as SpaceMoltClient;
      },
    },
  );

  expect(result.exitCode).toBe(1);
  const stderr = result.stderr;
  expect(stderr).toContain('Connection Error: fetch failed');
  expect(stderr).toContain('Verify the API is reachable: https://configured.test/api/v2');
  expect(stderr).toContain('[DEBUG] Full error:');
  expect(stderr).not.toContain('\x1b[');
});
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```bash
bun test src/runner.test.ts --test-name-pattern "connection errors use context config"
```

Expected: FAIL because `renderConnectionError()` still reads `API_BASE`, `DEBUG`, and `runtime.c`.

- [ ] **Step 3: Update runner colors and debug checks**

In `src/runner.ts`, remove `c` and `API_BASE` imports from `runtime.ts`. Add helper:

```ts
function outputFromContext(context: CliRuntimeContext): {
  debug: boolean;
  plain: boolean;
  quiet: boolean;
  apiBase: string;
} {
  return {
    debug: Boolean(context.config?.debug ?? context.output?.debug),
    plain: Boolean(context.config?.plain ?? context.output?.plain),
    quiet: Boolean(context.config?.quiet ?? context.output?.quiet),
    apiBase: context.config?.apiBase ?? context.env.SPACEMOLT_URL ?? 'https://game.spacemolt.com/api/v2',
  };
}
```

Use `colorsForPlain(output.plain)` in `runWatchLoop()`, `renderCommandError()`, and `renderConnectionError()`. Replace `DEBUG` checks with `output.debug` and `API_BASE` with `output.apiBase`.

- [ ] **Step 4: Run focused runner tests**

Run:

```bash
bun test src/runner.test.ts --test-name-pattern "connection errors use context config|parse errors render|plain parse errors"
```

Expected: PASS.

- [ ] **Step 5: Commit runner context output**

Run:

```bash
git add src/runner.ts src/runner.test.ts
git commit -m "refactor: use context output state in runner"
```

## Task 5: Remove Runtime Globals From Session, Update, and ID Cache

**Files:**
- Modify: `src/session.ts`
- Modify: `src/api.ts`
- Modify: `src/update.ts`
- Modify: `src/id-cache.ts`
- Modify: `src/update.test.ts`
- Modify: `src/api.test.ts`
- Modify: `src/runner.test.ts`

- [ ] **Step 1: Add or update tests for explicit direct-output state**

Update `src/update.test.ts` debug assertions so `checkForUpdates()` receives `debug: true` and `plain: true`:

```ts
await checkForUpdates({
  env: { SPACEMOLT_UPDATE_CHECK: 'true' },
  writer,
  debug: true,
  plain: true,
  transport: async () => ({ ok: false, status: 503, data: { tag_name: 'v9.9.9' } }),
});

expect(lines.join('\n')).toContain('[DEBUG] Update check failed: HTTP 503');
expect(lines.join('\n')).not.toContain('\x1b[');
```

In `src/api.test.ts`, add a session debug test for plain output:

```ts
test('session debug output uses injected plain color state', async () => {
  const logs: string[] = [];
  const store = new SessionManager({
    debug: true,
    plain: true,
    transport: async () => ({
      status: 200,
      data: { session: { id: 'session-1', created_at: '2026-01-01T00:00:00Z', expires_at: '2026-01-01T01:00:00Z' } },
    }),
    logger: { log: (message) => logs.push(message) },
  });

  await store.createTransientSession();

  expect(logs.join('\n')).toContain('[DEBUG] Creating new session...');
  expect(logs.join('\n')).not.toContain('\x1b[');
});
```

If `SessionManager` does not yet accept `plain` or `logger`, this test should fail before implementation.

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```bash
bun test src/update.test.ts src/api.test.ts --test-name-pattern "debug output|Update check failed"
```

Expected: FAIL until direct-output state is injectable.

- [ ] **Step 3: Update `SessionManager` constructor and debug output**

In `src/session.ts`, remove `c` and `DEBUG` from the runtime import. Add:

```ts
import { colorsForPlain } from './output-style.ts';
```

Extend the `SessionManager` options interface with:

```ts
plain?: boolean;
logger?: {
  log(message: string): void;
};
```

Store `_plain` and `_logger`, defaulting to `false` and `console.log`. Replace debug writes with:

```ts
if (this.debug) {
  const colors = colorsForPlain(this._plain);
  this._logger.log(`${colors.dim}[DEBUG] Creating new session...${colors.reset}`);
}
```

and:

```ts
if (this.debug) {
  const colors = colorsForPlain(this._plain);
  this._logger.log(`${colors.dim}[DEBUG] Authenticating profile ${profName} as ${session.username}...${colors.reset}`);
}
```

- [ ] **Step 4: Pass `plain` into `SessionManager` from `SpaceMoltClient`**

In `src/api.ts`, update the default `SessionManager` construction:

```ts
new SessionManager({
  apiBase: this.config.apiBase,
  profile: this.config.profile,
  profileIsExplicit: this.config.profileIsExplicit,
  debug: this.config.debug,
  plain: this.config.plain,
})
```

- [ ] **Step 5: Update update-check styling**

In `src/update.ts`, remove `c` and `DEBUG` from the runtime import. Add:

```ts
import { colorsForPlain } from './output-style.ts';
```

Extend `UpdateCheckOptions`:

```ts
plain?: boolean;
```

Set:

```ts
const debug = options.debug ?? false;
const colors = colorsForPlain(options.plain ?? false);
```

Replace `c.dim`, `c.reset`, `c.yellow`, `c.bright`, `c.green`, and `c.cyan` with `colors.*`. Pass `plain` into `printUpdateNotice()`:

```ts
printUpdateNotice(latestVersion, writer, version, repo, options.plain ?? false);
```

Update `printUpdateNotice()` signature:

```ts
export function printUpdateNotice(
  latestVersion: string,
  writer?: CliWriter,
  currentVersion = VERSION,
  repo = GITHUB_REPO,
  plain = false,
): void {
  const colors = colorsForPlain(plain);
  const out = writer?.out.bind(writer) ?? console.log;
  out(`${colors.yellow}╭─────────────────────────────────────────────────────────────╮${colors.reset}`);
  out(
    `${colors.yellow}│${colors.reset}  ${colors.bright}Update available!${colors.reset} ${colors.dim}v${currentVersion}${colors.reset} → ${colors.green}v${latestVersion}${colors.reset}                        ${colors.yellow}│${colors.reset}`,
  );
  out(
    `${colors.yellow}│${colors.reset}  Run: ${colors.cyan}curl -fsSL https://spacemolt.com/install.sh | bash${colors.reset}  ${colors.yellow}│${colors.reset}`,
  );
  out(
    `${colors.yellow}│${colors.reset}  Or download from: ${colors.cyan}https://github.com/${repo}/releases${colors.reset}   ${colors.yellow}│${colors.reset}`,
  );
  out(`${colors.yellow}╰─────────────────────────────────────────────────────────────╯${colors.reset}`);
  out('');
}
```

- [ ] **Step 6: Update ID-cache suggestion output**

In `src/id-cache.ts`, remove `QUIET` and `c` imports from `runtime.ts`. Add:

```ts
import { colorsForPlain } from './output-style.ts';
```

Change `printCachedIdSuggestions()` signature to:

```ts
export function printCachedIdSuggestions(
  command: string,
  field?: string,
  sessionPath?: string,
  writer?: CliWriter,
  options: { quiet?: boolean; plain?: boolean } = {},
): void {
  if (options.quiet) return;
  const kind = idKindForCommandField(command, field);
  if (!kind) return;
  const hints = loadIdCacheSync(sessionPath);
  const suggestions = hintsForKind(kind, hints).slice(0, 8);
  if (suggestions.length === 0) return;

  const colors = colorsForPlain(options.plain ?? false);
  const err = writer?.err.bind(writer) ?? console.error;
  err(`\n${colors.cyan}Cached ${kind} IDs:${colors.reset}`);
  for (const hint of suggestions) err(`  ${formatHint(hint, colors)}`);
}
```

Change `formatHint()` to accept colors:

```ts
function formatHint(hint: IdHint, colors = colorsForPlain(false)): string {
  const parts = [hint.id];
  if (hint.name && hint.name !== hint.id) parts.push(`${colors.dim}(${hint.name})${colors.reset}`);
  return parts.join(' ');
}
```

Update call sites to pass:

```ts
{ quiet: context.config?.quiet, plain: context.config?.plain }
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
bun test src/update.test.ts src/api.test.ts src/runner.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit direct-output consumer migration**

Run:

```bash
git add src/session.ts src/api.ts src/update.ts src/id-cache.ts src/update.test.ts src/api.test.ts src/runner.test.ts
git commit -m "refactor: pass explicit output state to direct output"
```

## Task 6: Delete Mutable Runtime Globals and Legacy Config Exports

**Files:**
- Modify: `src/runtime.ts`
- Modify: `src/output-state.ts`
- Modify: `src/client.ts`
- Modify: `src/api.ts`
- Modify: `src/config.test.ts`
- Modify: `src/runner.test.ts`
- Modify: `src/output-golden.test.ts`
- Modify: `src/cli-local.test.ts`

- [ ] **Step 1: Add final config/export tests**

In `src/config.test.ts`, replace the legacy mutability test with:

```ts
test('createRuntimeState requires explicit config state', () => {
  const config: SpaceMoltConfig = {
    apiBase: 'https://example.test/api/v2',
    jsonOutput: false,
    debug: false,
    plain: true,
    quiet: false,
    format: 'table',
    compact: false,
    profile: 'pilot',
    profileIsExplicit: true,
  };

  expect(createRuntimeState(config)).toEqual({
    ...config,
    profileIsExplicit: true,
  });
});
```

Add a client export test using a namespace import:

```ts
test('client entrypoint does not export legacy global-backed config symbols', async () => {
  const client = await import('./client.ts');

  expect('LegacySpaceMoltConfig' in client).toBe(false);
  expect('GlobalBackedConfig' in client).toBe(false);
  expect('setOutputMode' in client).toBe(false);
});
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```bash
bun test src/config.test.ts --test-name-pattern "requires explicit|does not export"
```

Expected: FAIL while legacy exports and no-argument runtime state still exist.

- [ ] **Step 3: Move immutable `createDefaultConfig()` into runtime exports**

In `src/runtime.ts`, remove:

```ts
export let JSON_OUTPUT = process.env.SPACEMOLT_OUTPUT === 'json';
export let DEBUG = process.env.DEBUG === 'true';
export let PLAIN = false;
export let QUIET = false;
export let FORMAT: 'table' | 'json' | 'yaml' | 'text' = 'table';
export let COMPACT = false;
```

Remove `GlobalBackedConfig`, `LegacySpaceMoltConfig`, and `setOutputMode()`.

Change `createRuntimeState()` to require a config:

```ts
export function createRuntimeState(config: SpaceMoltConfig): RuntimeState {
  return {
    apiBase: config.apiBase,
    jsonOutput: config.jsonOutput,
    debug: config.debug,
    plain: config.plain,
    quiet: config.quiet,
    format: config.format,
    compact: config.compact,
    profile: config.profile,
    profileIsExplicit: Boolean(config.profileIsExplicit),
  };
}
```

Re-export the immutable factory from `src/output-state.ts` by adding to `src/runtime.ts`:

```ts
export { createDefaultConfig } from './output-state.ts';
```

Keep constants and pure table/color exports only if still imported. Any helper that depends on removed `PLAIN` must be deleted or changed to require a `plain` argument.

- [ ] **Step 4: Update `SpaceMoltClient` default config**

In `src/api.ts`, keep:

```ts
import { createDefaultConfig, MAX_RATE_LIMIT_RETRIES, MAX_SESSION_RECOVERY_ATTEMPTS, type SpaceMoltConfig } from './runtime.ts';
```

The constructor can continue:

```ts
this.config = options.config ?? createDefaultConfig();
```

because `createDefaultConfig()` is now immutable and env-backed.

- [ ] **Step 5: Remove legacy entrypoint exports**

In `src/client.ts`, replace:

```ts
export { createDefaultConfig, GlobalBackedConfig, LegacySpaceMoltConfig } from './runtime.ts';
```

with:

```ts
export { createDefaultConfig } from './runtime.ts';
```

- [ ] **Step 6: Replace test setup that imported mutable globals**

In `src/output-golden.test.ts`, `src/runner.test.ts`, `src/cli-local.test.ts`, and `src/config.test.ts`, remove imports of:

```ts
COMPACT, DEBUG, FORMAT, JSON_OUTPUT, PLAIN, QUIET, setOutputMode
```

Replace reset blocks with explicit context/config creation. For golden tests, store and restore only display-buffer state that is local to the display helpers. For runner tests, assert captured output and `context.config` instead of mutable runtime exports.

- [ ] **Step 7: Run grep to prove mutable globals are gone**

Run:

```bash
rg -n "JSON_OUTPUT|setOutputMode|LegacySpaceMoltConfig|GlobalBackedConfig|\\bDEBUG\\b|\\bPLAIN\\b|\\bQUIET\\b|\\bFORMAT\\b|\\bCOMPACT\\b" src
```

Expected: no references to removed mutable runtime globals, except ordinary words inside test names or documentation comments that explicitly describe removed behavior. Remove stale comments from source files.

- [ ] **Step 8: Run focused tests**

Run:

```bash
bun test src/config.test.ts src/runner.test.ts src/output-state.test.ts src/output-style.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit runtime global deletion**

Run:

```bash
git add src/runtime.ts src/output-state.ts src/client.ts src/api.ts src/config.test.ts src/runner.test.ts src/output-golden.test.ts src/cli-local.test.ts
git commit -m "refactor: remove mutable runtime output globals"
```

## Task 7: Full Verification and Golden Stability

**Files:**
- Modify only if intentional: `src/golden-output/**`

- [ ] **Step 1: Run exact output golden tests**

Run:

```bash
bun test src/output-golden.test.ts
```

Expected: PASS. If this fails because output text changed unintentionally, fix the code instead of updating goldens.

- [ ] **Step 2: Run full test suite**

Run:

```bash
bun test
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run lint**

Run:

```bash
bun run lint
```

Expected: PASS.

- [ ] **Step 5: Run build**

Run:

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 6: Run final source scan**

Run:

```bash
rg -n "setOutputMode|LegacySpaceMoltConfig|GlobalBackedConfig|JSON_OUTPUT|PLAIN|QUIET|FORMAT|COMPACT" src
```

Expected: no matches.

- [ ] **Step 7: Commit verification-only golden updates if needed**

If Task 7 Step 1 produced intentional golden changes, update only affected files with targeted commands such as:

```bash
UPDATE_GOLDENS=1 GOLDEN_ONLY=cli/invalid_format bun test src/output-golden.test.ts
```

Then commit:

```bash
git add src/golden-output
git commit -m "test: update output goldens for explicit runtime state"
```

Skip this commit if no golden files changed.
