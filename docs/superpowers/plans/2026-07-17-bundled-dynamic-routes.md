# Bundled Dynamic Routes by Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every safe generated command embedded in the released CLI available without `spacemolt sync-api`, while preserving curated precedence and authoritative same/newer cache behavior.

**Architecture:** Centralize selection of bundled versus cached generated-route sources in the OpenAPI cache module. Build the default bundled registry with generated fallbacks enabled, retain a curated-only registry for help classification, and make the runner and Doctor consume the same cache-version decision. A valid equal/newer cache remains authoritative for generated visibility, while merged bundled-plus-cache metadata continues to enrich curated commands.

**Tech Stack:** Bun 1.x, TypeScript, `bun:test`, existing command registry and OpenAPI metadata generator, Biome, committed cached OpenAPI metadata.

## Global Constraints

- Expose all bundled routes that pass the existing generated-route safety filter; do not add a shipping-specific allowlist.
- Keep `SUPPRESSED_GENERATED_ROUTE_SIGNATURES`, `x-cli-hidden`, help-route, session-tool, curated-name, curated-route, and generated-name collision suppression unchanged.
- Curated commands must continue to win every command-name and API-route conflict.
- With no cache, an invalid cache, or an older cache, bundled routes are the generated fallback source.
- With an equal/newer cache, cached routes alone are authoritative for generated fallback visibility; do not union bundled routes into `dynamicGeneratedRoutes`.
- With an equal/newer cache, cached records still override matching bundled records in merged `generatedRoutes` for curated schema construction.
- Do not add curated shipping overrides, aliases, examples, formatters, fixtures, or golden files.
- Do not change generated command naming, request conversion, response rendering, or automatic synchronization behavior.
- Use only committed `spacemolt-docs/openapi.json`; never set `LIVE_API_SYNC=1` during routine verification.
- Preserve unrelated tracked, untracked, and ignored user files.

---

## File Structure

- Modify `src/openapi-cache.ts`: add a pure route-source resolver shared by the runner and Doctor.
- Modify `src/openapi-cache.test.ts`: verify no-cache, stale-cache, and equal/newer-cache source selection.
- Modify `src/command-registry.ts`: expose safe bundled generated commands and retain a curated-only registry for provenance-sensitive help rendering.
- Modify `src/command-metadata.test.ts`: assert the exact bundled generated shipping surface and curated precedence.
- Modify `src/help.ts`: classify generated help entries against the curated-only registry and clarify bundled-versus-cached discovery copy.
- Modify `src/help.test.ts`: cover bundled generated help, search, explanation, suppression, and revised copy.
- Modify `src/completion.test.ts`: cover static and runtime completion for bundled generated commands.
- Modify `src/runner.ts`: always enable generated fallbacks and use the shared source resolver.
- Modify `src/runner.test.ts`: cover clean-profile dispatch plus authoritative, stale, invalid, and absent cache behavior.
- Modify `src/doctor.ts`: apply the shared cache-version rule and report cache-provided dynamic commands accurately.
- Modify `src/doctor.test.ts`: cover usable and stale cache diagnostics and revised wording.
- Modify `README.md`: document immediate bundled fallback availability and the cache's extension role.

No new production file is needed. `resolveGeneratedRouteSources` belongs in `src/openapi-cache.ts` because it defines the trust and version boundary for data loaded by that module.

---

### Task 1: Centralize Generated Route Source Selection

**Files:**
- Modify: `src/openapi-cache.ts:1-75`
- Modify: `src/openapi-cache.test.ts:1-160`

**Interfaces:**
- Consumes: `compareVersions(current: string, latest: string): number`, `OpenApiCacheVersionStatus`, `GeneratedApiRoute`.
- Produces: `GeneratedRouteSources` and `resolveGeneratedRouteSources(options): GeneratedRouteSources` for Tasks 3 and 4.

- [ ] **Step 1: Add failing source-selection tests**

Extend the `src/openapi-cache.test.ts` import:

```ts
import {
  defaultOpenApiCacheDir,
  loadCachedGeneratedRoutes,
  refreshOpenApiCache,
  resolveGeneratedRouteSources,
} from './openapi-cache';
import type { GeneratedApiRoute } from './openapi-metadata';
```

Add these fixtures near `tempDir()`:

```ts
const bundledRoutes: Record<string, GeneratedApiRoute> = {
  'POST /api/v2/spacemolt_shipping/quote': {
    summary: 'Bundled shipping quote',
    route: { tool: 'spacemolt_shipping', action: 'quote', method: 'POST' },
    required: ['package_id'],
    schema: { package_id: { type: 'string' } },
  },
};

const cachedRoutes: Record<string, GeneratedApiRoute> = {
  'POST /api/v2/spacemolt_cached/probe': {
    summary: 'Cached probe',
    route: { tool: 'spacemolt_cached', action: 'probe', method: 'POST' },
  },
};
```

Add these tests inside `describe('OpenAPI cache', ...)`:

```ts
  test('uses bundled routes when cached metadata is absent, invalid, or older', () => {
    for (const testCase of [
      { cachedRoutes: undefined, cacheVersion: { status: 'not_synced' } as const },
      { cachedRoutes, cacheVersion: { status: 'invalid' } as const },
      {
        cachedRoutes,
        cacheVersion: {
          status: 'valid',
          gameserverVersion: 'v0.521.0',
          fetchedAt: '2026-07-16T00:00:00.000Z',
        } as const,
      },
    ]) {
      expect(
        resolveGeneratedRouteSources({
          bundledRoutes,
          bundledVersion: 'v0.522.0',
          ...testCase,
        }),
      ).toEqual({
        generatedRoutes: bundledRoutes,
        dynamicGeneratedRoutes: bundledRoutes,
        cacheIsUsable: false,
      });
    }
  });

  test('uses an equal or newer cache as the authoritative dynamic route catalog', () => {
    for (const gameserverVersion of ['v0.522.0', 'v0.523.0']) {
      const result = resolveGeneratedRouteSources({
        bundledRoutes,
        bundledVersion: 'v0.522.0',
        cachedRoutes,
        cacheVersion: {
          status: 'valid',
          gameserverVersion,
          fetchedAt: '2026-07-17T00:00:00.000Z',
        },
      });

      expect(result.cacheIsUsable).toBe(true);
      expect(result.dynamicGeneratedRoutes).toBe(cachedRoutes);
      expect(result.dynamicGeneratedRoutes['POST /api/v2/spacemolt_shipping/quote']).toBeUndefined();
      expect(result.generatedRoutes).toEqual({ ...bundledRoutes, ...cachedRoutes });
    }
  });

  test('lets usable cached records override matching bundled metadata', () => {
    const signature = 'POST /api/v2/spacemolt_shipping/quote';
    const cachedOverride: Record<string, GeneratedApiRoute> = {
      [signature]: {
        summary: 'Cached shipping quote',
        route: { tool: 'spacemolt_shipping', action: 'quote', method: 'POST' },
        required: ['cache_only'],
        schema: { cache_only: { type: 'string' } },
      },
    };

    const result = resolveGeneratedRouteSources({
      bundledRoutes,
      bundledVersion: 'v0.522.0',
      cachedRoutes: cachedOverride,
      cacheVersion: {
        status: 'valid',
        gameserverVersion: 'v0.523.0',
        fetchedAt: '2026-07-17T00:00:00.000Z',
      },
    });

    expect(result.generatedRoutes[signature]).toBe(cachedOverride[signature]);
    expect(result.dynamicGeneratedRoutes).toBe(cachedOverride);
  });
```

- [ ] **Step 2: Run the tests and verify the resolver is missing**

Run:

```bash
bun test src/openapi-cache.test.ts
```

Expected: FAIL because `resolveGeneratedRouteSources` is not exported by `src/openapi-cache.ts`.

- [ ] **Step 3: Implement the pure route-source resolver**

Add this import to `src/openapi-cache.ts`:

```ts
import { compareVersions } from './update.ts';
```

After `OpenApiCacheVersionStatus`, add:

```ts
export interface GeneratedRouteSources {
  generatedRoutes: Record<string, GeneratedApiRoute>;
  dynamicGeneratedRoutes: Record<string, GeneratedApiRoute>;
  cacheIsUsable: boolean;
}

export function resolveGeneratedRouteSources(options: {
  bundledRoutes: Record<string, GeneratedApiRoute>;
  bundledVersion: string;
  cachedRoutes?: Record<string, GeneratedApiRoute>;
  cacheVersion: OpenApiCacheVersionStatus;
}): GeneratedRouteSources {
  const cacheIsUsable =
    options.cachedRoutes !== undefined &&
    options.cacheVersion.status === 'valid' &&
    compareVersions(options.bundledVersion, options.cacheVersion.gameserverVersion) >= 0;

  if (!cacheIsUsable || !options.cachedRoutes) {
    return {
      generatedRoutes: options.bundledRoutes,
      dynamicGeneratedRoutes: options.bundledRoutes,
      cacheIsUsable: false,
    };
  }

  return {
    generatedRoutes: { ...options.bundledRoutes, ...options.cachedRoutes },
    dynamicGeneratedRoutes: options.cachedRoutes,
    cacheIsUsable: true,
  };
}
```

Do not read the filesystem or mutate either route map in this function.

- [ ] **Step 4: Run focused tests and formatting checks**

Run:

```bash
bun test src/openapi-cache.test.ts src/update.test.ts
bunx biome check src/openapi-cache.ts src/openapi-cache.test.ts
git diff --check
```

Expected: all commands exit 0; source-selection tests prove cache authority and stale-cache fallback.

- [ ] **Step 5: Commit the source-selection unit**

```bash
git add src/openapi-cache.ts src/openapi-cache.test.ts
git commit -m "refactor(openapi): centralize generated route sources"
```

---

### Task 2: Enable Bundled Generated Discovery Across Registry, Help, and Completion

**Files:**
- Modify: `src/command-registry.ts:35-75`
- Modify: `src/command-metadata.test.ts:1010-1080`
- Modify: `src/help.ts:1-15,919-935`
- Modify: `src/help.test.ts:780-825`
- Modify: `src/completion.test.ts:260-305,714-742`
- Test: `src/dynamic-commands.test.ts`

**Interfaces:**
- Consumes: existing `buildCommandRegistrySnapshot`, `buildDynamicCommands`, and generated-route safety filters.
- Produces: `CURATED_COMMAND_REGISTRY` for provenance classification and a generated-enabled `BUNDLED_COMMAND_REGISTRY` used by default help, parsing, and completion paths.

- [ ] **Step 1: Change registry tests to require bundled shipping commands**

In `src/command-metadata.test.ts`, rename the current test `notifications is curated while shipping remains generated-only` to `notifications stays curated while safe shipping commands are bundled generated fallbacks`.

Keep the existing `notifications` assertions, then replace the local `buildCommandRegistrySnapshot()` shipping inventory with:

```ts
    expect(
      Object.entries(BUNDLED_COMMAND_REGISTRY.commands)
        .filter(([, commandConfig]) => commandConfig.category === 'Generated API')
        .map(([command]) => command)
        .sort(),
    ).toEqual([
      'shipping_accept',
      'shipping_cancel',
      'shipping_deliver',
      'shipping_get',
      'shipping_list',
      'shipping_pay_debt',
      'shipping_post',
      'shipping_profile',
      'shipping_quote',
      'shipping_return',
      'shipping_track',
    ]);
    expect(BUNDLED_COMMAND_REGISTRY.commands.shipping_quote).toMatchObject({
      required: ['package_id', 'destination_base_id'],
      category: 'Generated API',
      route: { tool: 'spacemolt_shipping', action: 'quote', method: 'POST' },
    });
```

Import `commandRegistryApiCommands` from `./command-registry`, then add a bundled safety assertion:

```ts
  test('bundled generated fallbacks retain route safety suppressions', () => {
    const routes = commandRegistryApiCommands(BUNDLED_COMMAND_REGISTRY).map((config) => config.route);

    expect(routes.some((route) => route.tool === 'session')).toBe(false);
    expect(
      routes.some((route) => route.tool === 'spacemolt_storage' && ['jettison', 'loot', 'view'].includes(route.action)),
    ).toBe(false);
    expect(BUNDLED_COMMAND_REGISTRY.commands.shipping_help).toBeUndefined();
  });
```

The curated-name and curated-route collision tests already in `src/dynamic-commands.test.ts` remain the regression proof for curated precedence; do not duplicate their synthetic fixtures.

- [ ] **Step 2: Add failing help and completion coverage**

In `src/help.test.ts`, add:

```ts
  test('bundled generated commands appear in full help, local help, and search', () => {
    const full = captureWriter();
    const command = captureWriter();
    const explanation = captureWriter();
    const search = captureWriter();

    showFullHelp(full.writer, BUNDLED_COMMAND_REGISTRY);
    expect(showCommandHelp('shipping_quote', command.writer, BUNDLED_COMMAND_REGISTRY)).toBe(true);
    expect(
      showCommandExplanation('shipping_quote', explanation.writer, BUNDLED_COMMAND_REGISTRY, { plain: true }),
    ).toBe(true);
    showCommandSearch('shipping quote', search.writer, BUNDLED_COMMAND_REGISTRY);

    expect(full.stdout.join('\n')).toContain('Generated API Commands');
    expect(full.stdout.join('\n')).toContain('shipping_quote');
    expect(command.stdout.join('\n')).toContain('spacemolt shipping_quote');
    expect(command.stdout.join('\n')).toContain('POST /api/v2/spacemolt_shipping/quote');
    expect(explanation.stdout.join('\n')).toContain('API route: POST /api/v2/spacemolt_shipping/quote');
    expect(search.stdout.join('\n')).toContain('shipping_quote');
  });
```

Extend `Generated API Commands excludes bundled nested command actions` with:

```ts
    expect(generatedSection).toContain('shipping_quote');
```

In `src/completion.test.ts`, add:

```ts
  test('bundled generated commands appear in runtime and static completion', () => {
    const values = completeWords({ shell: 'fish', words: ['spacemolt', 'shipping_q'], current: 'shipping_q' }).map(
      (candidate) => candidate.value,
    );
    const bash = generateCompletion('bash');
    const fish = generateCompletion('fish');

    expect(values).toContain('shipping_quote');
    expect(bash).toContain('shipping_quote');
    expect(fish).toContain(
      'complete -c spacemolt -n "__spacemolt_no_dynamic_complete; and __fish_use_subcommand" -a shipping_quote',
    );
  });
```

- [ ] **Step 3: Run tests and verify bundled discovery is absent**

Run:

```bash
bun test src/command-metadata.test.ts src/help.test.ts src/completion.test.ts src/dynamic-commands.test.ts
```

Expected: FAIL because `BUNDLED_COMMAND_REGISTRY` excludes generated commands, so shipping is missing from registry, help, and completion.

- [ ] **Step 4: Add curated-only and generated-enabled registry constants**

Replace the final export in `src/command-registry.ts` with:

```ts
export const CURATED_COMMAND_REGISTRY = buildCommandRegistrySnapshot({ includeDynamic: false });
export const BUNDLED_COMMAND_REGISTRY = buildCommandRegistrySnapshot();
```

Do not change the default behavior of `buildCommandRegistrySnapshot`: it already includes generated commands unless `includeDynamic === false`.

- [ ] **Step 5: Preserve generated provenance in full help**

Update the registry import in `src/help.ts`:

```ts
import {
  BUNDLED_COMMAND_REGISTRY,
  type CommandRegistrySnapshot,
  CURATED_COMMAND_REGISTRY,
} from './command-registry.ts';
```

In `showGeneratedCommandReference`, replace the bundled baseline with the curated-only baseline:

```ts
  const curatedCommands = commandHelpMap(CURATED_COMMAND_REGISTRY);
  const generatedCommands = Object.entries(commands)
    .filter(([command]) => !curatedCommands[command])
    .sort(([a], [b]) => a.localeCompare(b));
```

This must remain provenance-based rather than checking `category === 'Generated API'`, because OpenAPI may assign a generated route to another category through `x-cli-category`.

- [ ] **Step 6: Run focused registry, help, and completion tests**

Run:

```bash
bun test src/command-metadata.test.ts src/help.test.ts src/completion.test.ts src/dynamic-commands.test.ts src/command-groups.test.ts src/args.test.ts
bunx biome check src/command-registry.ts src/command-metadata.test.ts src/help.ts src/help.test.ts src/completion.test.ts
git diff --check
```

Expected: all commands exit 0; bundled shipping appears in help and completion, while session/help/storage suppressions and curated collisions remain intact.

- [ ] **Step 7: Commit bundled discovery**

```bash
git add src/command-registry.ts src/command-metadata.test.ts src/help.ts src/help.test.ts src/completion.test.ts
git commit -m "feat(commands): expose bundled generated routes"
```

---

### Task 3: Use Bundled Routes by Default and Cached Routes Authoritatively at Runtime

**Files:**
- Modify: `src/runner.ts:15-26,238-256`
- Modify: `src/runner.test.ts:150-350`
- Modify: `src/completion.test.ts:600-660`

**Interfaces:**
- Consumes: `resolveGeneratedRouteSources` and `GeneratedRouteSources` from Task 1; generated-enabled bundled registry behavior from Task 2.
- Produces: runtime registry behavior where bundled routes are available without a cache and equal/newer cached routes are authoritative for generated visibility.

- [ ] **Step 1: Add a failing clean-profile dispatch test**

In `src/runner.test.ts`, add inside `describe('runInvocation option isolation', ...)`:

```ts
  test('dispatches bundled generated shipping commands without an OpenAPI cache', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-bundled-dynamic-'));
    const configHome = path.join(tempDir, 'config');
    const calls: Array<{ command: string; route: unknown; payload: Record<string, unknown> }> = [];
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig(command: string, config: { route: unknown }, payload: Record<string, unknown>) {
        calls.push({ command, route: config.route, payload });
        return { structuredContent: { ok: true } };
      },
    } as unknown as SpaceMoltClient;
    const stdout: string[] = [];
    const stderr: string[] = [];

    try {
      const exitCode = await runInvocation(
        [
          '--json',
          'shipping_quote',
          'package_id=package-1',
          'destination_base_id=earth-station',
          'insured=true',
        ],
        client,
        fakeContext(stdout, stderr, {
          HOME: tempDir,
          XDG_CONFIG_HOME: configHome,
          SPACEMOLT_PROFILE: 'pilot',
          SPACEMOLT_NO_UPDATE_CHECK: 'true',
        }),
      );

      expect(exitCode).toBe(0);
      expect(stderr).toEqual([]);
      expect(calls).toEqual([
        {
          command: 'shipping_quote',
          route: { tool: 'spacemolt_shipping', action: 'quote', method: 'POST' },
          payload: {
            package_id: 'package-1',
            destination_base_id: 'earth-station',
            insured: true,
          },
        },
      ]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 2: Add clean-profile local discovery and hidden-completion tests**

Add to `src/runner.test.ts`:

```ts
  test('clean-profile local help and search discover bundled generated commands', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-bundled-help-'));
    const env = {
      HOME: tempDir,
      XDG_CONFIG_HOME: path.join(tempDir, 'config'),
      SPACEMOLT_NO_UPDATE_CHECK: 'true',
    };

    try {
      const help = await captureInvocation(['--plain', 'help', 'shipping_quote'], env);
      const search = await captureInvocation(['--plain', 'commands', '--search', 'shipping quote'], env);

      expect(help.exitCode).toBe(0);
      expect(help.stderr).toBe('');
      expect(help.stdout).toContain('spacemolt shipping_quote');
      expect(search.exitCode).toBe(0);
      expect(search.stdout).toContain('shipping_quote');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
```

Add a dry-run test beside it:

```ts
  test('clean-profile dry run previews a bundled generated route without sending a request', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-bundled-preview-'));
    const env = {
      HOME: tempDir,
      XDG_CONFIG_HOME: path.join(tempDir, 'config'),
      SPACEMOLT_NO_UPDATE_CHECK: 'true',
    };

    try {
      const result = await captureInvocation(
        [
          '--json',
          '--dry-run',
          'shipping_quote',
          'package_id=package-1',
          'destination_base_id=earth-station',
        ],
        env,
      );
      const body = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(body.structuredContent).toMatchObject({
        command: 'shipping_quote',
        method: 'POST',
        payload: {
          package_id: 'package-1',
          destination_base_id: 'earth-station',
        },
        server_request_sent: false,
      });
      expect(body.structuredContent.url).toContain('/api/v2/spacemolt_shipping/quote');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
```

Add to the hidden completion tests in `src/completion.test.ts`:

```ts
  test('hidden __complete exposes bundled generated commands without a cache', async () => {
    const home = tempDir();
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runInvocation(
      ['__complete', 'fish', '--', 'spacemolt', 'shipping_q'],
      undefined,
      {
        env: {
          HOME: home,
          XDG_CONFIG_HOME: path.join(home, '.config'),
          SPACEMOLT_NO_UPDATE_CHECK: 'true',
        },
        writer: {
          out(message = '') {
            stdout.push(message);
          },
          err(message = '') {
            stderr.push(message);
          },
          writeOut(chunk) {
            stdout.push(chunk);
          },
        },
        clock: { now: () => new Date('2026-07-17T00:00:00.000Z') },
        sleep: async () => {},
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join('')).toContain('shipping_quote\t');
  });
```

- [ ] **Step 3: Add cache-authority and stale-cache fallback tests**

In `src/runner.test.ts`, add a test using the same cache-writing shape as the existing `loads cached OpenAPI routes when resolving dynamic commands` test:

```ts
  test('an accepted cache is authoritative for generated visibility and schemas', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-authoritative-cache-'));
    const configHome = path.join(tempDir, 'config');
    const cacheDir = path.join(configHome, 'spacemolt-cli');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, 'openapi-cache.json'),
      `${JSON.stringify({
        fetchedAt: '2026-07-17T00:00:00.000Z',
        gameserverVersion: 'v999.0.0',
        routes: {
          'POST /api/v2/spacemolt_shipping/quote': {
            operationId: 'spacemolt_shipping_quote',
            summary: 'Cached shipping quote',
            route: { tool: 'spacemolt_shipping', action: 'quote', method: 'POST' },
            required: ['cache_only'],
            schema: { cache_only: { type: 'string' } },
          },
        },
      })}\n`,
    );
    const calls: Array<Record<string, unknown>> = [];
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig(_command: string, _config: unknown, payload: Record<string, unknown>) {
        calls.push(payload);
        return { structuredContent: { ok: true } };
      },
    } as unknown as SpaceMoltClient;
    const stdout: string[] = [];
    const stderr: string[] = [];

    try {
      const exitCode = await runInvocation(
        ['--json', 'shipping_quote', 'cache_only=accepted'],
        client,
        fakeContext(stdout, stderr, {
          HOME: tempDir,
          XDG_CONFIG_HOME: configHome,
          SPACEMOLT_PROFILE: 'pilot',
          SPACEMOLT_NO_UPDATE_CHECK: 'true',
        }),
      );

      expect(exitCode).toBe(0);
      expect(stderr).toEqual([]);
      expect(calls).toEqual([{ cache_only: 'accepted' }]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
```

Add this accepted-cache removal test:

```ts
  test('an accepted cache can remove a bundled generated route from visibility', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-cache-removal-'));
    const configHome = path.join(tempDir, 'config');
    const cacheDir = path.join(configHome, 'spacemolt-cli');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, 'openapi-cache.json'),
      `${JSON.stringify({
        fetchedAt: '2026-07-17T00:00:00.000Z',
        gameserverVersion: 'v999.0.0',
        routes: {
          'POST /api/v2/runner_dynamic/invoke': {
            summary: 'Cached-only command',
            route: { tool: 'runner_dynamic', action: 'invoke', method: 'POST' },
            cli: { command: 'runner_cached_dynamic' },
          },
        },
      })}\n`,
    );

    try {
      const result = await captureInvocation(['--plain', 'commands', '--search', 'shipping_quote'], {
        HOME: tempDir,
        XDG_CONFIG_HOME: configHome,
        SPACEMOLT_NO_UPDATE_CHECK: 'true',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).not.toContain('shipping_quote');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
```

In `stale cached OpenAPI routes do not expose removed dynamic commands`, insert this second invocation after the existing `ship_claim_commission` assertion:

```ts
    const bundledStdout: string[] = [];
    const bundledStderr: string[] = [];
    const bundledExitCode = await runInvocation(
      ['--plain', 'commands', '--search', 'shipping_quote'],
      undefined,
      fakeContext(bundledStdout, bundledStderr, {
        HOME: tempDir,
        XDG_CONFIG_HOME: configHome,
        SPACEMOLT_NO_UPDATE_CHECK: 'true',
      }),
    );

    expect(bundledExitCode).toBe(0);
    expect(bundledStderr).toEqual([]);
    expect(bundledStdout.join('\n')).toContain('shipping_quote');
```

This distinguishes “ignore stale cache” from “disable all dynamic commands.”

Add an integration test for a versionless cache file:

```ts
  test('an invalid cache falls back to bundled generated routes', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-invalid-cache-'));
    const configHome = path.join(tempDir, 'config');
    const cacheDir = path.join(configHome, 'spacemolt-cli');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, 'openapi-cache.json'),
      JSON.stringify({
        fetchedAt: '2026-07-17T00:00:00.000Z',
        routes: {
          'POST /api/v2/spacemolt_ship/claim_commission': {
            route: { tool: 'spacemolt_ship', action: 'claim_commission', method: 'POST' },
          },
        },
      }),
    );

    try {
      const result = await captureInvocation(['--plain', 'help', 'shipping_quote'], {
        HOME: tempDir,
        XDG_CONFIG_HOME: configHome,
        SPACEMOLT_NO_UPDATE_CHECK: 'true',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('spacemolt shipping_quote');
      expect(result.stdout).not.toContain('claim_commission');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 4: Run tests and verify clean-profile dispatch fails**

Run:

```bash
bun test src/runner.test.ts src/completion.test.ts --test-name-pattern 'bundled generated|authoritative|stale cached|hidden __complete'
```

Expected: the clean-profile shipping dispatch/help/completion, stale-cache bundled fallback, and invalid-cache bundled fallback assertions FAIL because the runner passes `includeDynamic: false` without a usable cache. The accepted-cache schema and removal assertions PASS under the current cache-only dynamic behavior.

- [ ] **Step 5: Resolve route sources once and always enable runtime fallbacks**

Update the `src/runner.ts` cache import:

```ts
import {
  defaultOpenApiCacheDir,
  loadCachedGeneratedRoutes,
  loadOpenApiCacheVersion,
  resolveGeneratedRouteSources,
} from './openapi-cache.ts';
```

Remove `compareVersions` from the `./update.ts` import, leaving only `checkForUpdates`.

Replace the current `cacheCanExtendBundled`, `usableCachedGeneratedRoutes`, `generatedRoutes`, and registry block with:

```ts
  const routeSources = resolveGeneratedRouteSources({
    bundledRoutes: GENERATED_API_ROUTES,
    bundledVersion: GENERATED_API_GAMESERVER_VERSION,
    cachedRoutes: cachedGeneratedRoutes,
    cacheVersion,
  });
  const commandRegistry = buildCommandRegistrySnapshot({
    generatedRoutes: routeSources.generatedRoutes,
    dynamicGeneratedRoutes: routeSources.dynamicGeneratedRoutes,
    includeDynamic: true,
  });
```

Do not merge bundled routes into `dynamicGeneratedRoutes` when `routeSources.cacheIsUsable` is true; the resolver deliberately returns the cache object alone.

- [ ] **Step 6: Run runtime, parser, help, and completion tests**

Run:

```bash
bun test src/runner.test.ts src/completion.test.ts src/help.test.ts src/args.test.ts src/command-metadata.test.ts
bunx biome check src/runner.ts src/runner.test.ts src/completion.test.ts
git diff --check
```

Expected: all commands exit 0; no-cache shipping dispatch works, accepted caches control the generated surface, and stale caches fall back to bundled shipping.

- [ ] **Step 7: Commit runtime route-source behavior**

```bash
git add src/runner.ts src/runner.test.ts src/completion.test.ts
git commit -m "feat(runner): dispatch bundled dynamic commands"
```

---

### Task 4: Align Doctor With Runtime Cache Trust

**Files:**
- Modify: `src/doctor.ts:1-15,105-135`
- Modify: `src/doctor.test.ts:35-75,210-305`

**Interfaces:**
- Consumes: `resolveGeneratedRouteSources` from Task 1, `GENERATED_API_GAMESERVER_VERSION`, and existing registry inventory helpers.
- Produces: Doctor fields `cachedOpenApiRoutes` and `dynamicCommands`, with the latter explicitly representing cache-provided generated commands from a usable cache.

- [ ] **Step 1: Make the Doctor cache fixture version explicit**

Change `writeOpenApiCache` in `src/doctor.test.ts` to accept a version after `routes`:

```ts
function writeOpenApiCache(
  configHome: string,
  routes: Record<string, unknown> = {
    'POST /api/v2/spacemolt_shipyard/repair': {
      operationId: 'spacemolt_shipyard_repair',
      summary: 'Repair a ship from cached OpenAPI metadata',
      route: { tool: 'spacemolt_shipyard', action: 'repair', method: 'POST' },
      cli: { category: 'Shipyard' },
      required: ['ship_id'],
      schema: { ship_id: { type: 'string', positionalIndex: 0 } },
    },
  },
  gameserverVersion = 'v999.0.0',
): void {
```

Use `gameserverVersion` in the serialized cache instead of the current hard-coded `v0.324.1`.

- [ ] **Step 2: Change diagnostics tests to require cache-aware wording and stale rejection**

Update the three existing expectations from `dynamic command(s)` to `cache-provided dynamic command(s)`:

```ts
detail: '1 cache-provided dynamic command'
```

and:

```ts
expect(result.stdout).toContain('1 cache-provided dynamic command');
```

Add:

```ts
  test('doctor reports stale cached routes without counting them as cache-provided commands', async () => {
    const configHome = tempDir();
    try {
      writeOpenApiCache(
        configHome,
        {
          'POST /api/v2/spacemolt_ship/claim_commission': {
            summary: 'Removed cached route',
            route: { tool: 'spacemolt_ship', action: 'claim_commission', method: 'POST' },
          },
        },
        'v0.366.0',
      );

      const result = await runDirect(['--json', 'doctor'], { XDG_CONFIG_HOME: configHome });
      const parsed = JSON.parse(result.stdout);
      const cacheCheck = parsed.structuredContent.checks.find(
        (check: { name: string }) => check.name === 'openapi-cache',
      );

      expect(parsed.structuredContent.cachedOpenApiRoutes).toBe(1);
      expect(parsed.structuredContent.dynamicCommands).toBe(0);
      expect(cacheCheck).toMatchObject({
        ok: true,
        message: '1 cached OpenAPI route',
        detail: '0 cache-provided dynamic commands',
      });
    } finally {
      fs.rmSync(configHome, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 3: Run Doctor tests and verify stale cache is still counted as dynamic**

Run:

```bash
bun test src/doctor.test.ts --test-name-pattern 'OpenAPI|cached|dynamic'
```

Expected: FAIL because Doctor neither checks cache version nor uses the new cache-provided wording.

- [ ] **Step 4: Apply the shared route-source decision in Doctor**

Change imports in `src/doctor.ts` to include the generated version and cache helpers:

```ts
import { GENERATED_API_GAMESERVER_VERSION, GENERATED_API_ROUTES } from './generated/api-commands.ts';
import {
  defaultOpenApiCacheDir,
  loadCachedGeneratedRoutes,
  loadOpenApiCacheVersion,
  resolveGeneratedRouteSources,
} from './openapi-cache.ts';
```

Replace the current cached-route registry block with:

```ts
    const cacheDir = defaultOpenApiCacheDir(env);
    const cachedRoutes = loadCachedGeneratedRoutes(cacheDir);
    const cacheVersion = loadOpenApiCacheVersion(cacheDir);
    const routeSources = resolveGeneratedRouteSources({
      bundledRoutes: GENERATED_API_ROUTES,
      bundledVersion: GENERATED_API_GAMESERVER_VERSION,
      cachedRoutes,
      cacheVersion,
    });
    cachedOpenApiRoutes = cachedRoutes ? Object.keys(cachedRoutes).length : 0;
    if (cachedRoutes && routeSources.cacheIsUsable) {
      const registry = buildCommandRegistrySnapshot({
        generatedRoutes: routeSources.generatedRoutes,
        dynamicGeneratedRoutes: routeSources.dynamicGeneratedRoutes,
        includeDynamic: true,
      });
      const cachedRouteSignatures = new Set(Object.keys(cachedRoutes));
      const curatedRouteSignatures = new Set(Object.values(COMMANDS).map((command) => routeSignature(command.route)));
      dynamicCommands = commandRegistryApiCommands(registry).filter((command) => {
        const signature = routeSignature(command.route);
        return cachedRouteSignatures.has(signature) && !curatedRouteSignatures.has(signature);
      }).length;
    }
```

Change the detail passed to `pass('openapi-cache', ...)` to:

```ts
`${dynamicCommands} cache-provided dynamic ${dynamicCommands === 1 ? 'command' : 'commands'}`
```

Keep `cachedOpenApiRoutes` as the raw readable cache route count even when the cache is older; `dynamicCommands` alone reflects whether that cache is accepted for dispatch.

- [ ] **Step 5: Run Doctor and cache tests**

Run:

```bash
bun test src/doctor.test.ts src/openapi-cache.test.ts src/local-command-handlers.test.ts
bunx biome check src/doctor.ts src/doctor.test.ts
git diff --check
```

Expected: all commands exit 0; usable cache commands are counted, stale cache routes are visible diagnostically but contribute zero commands.

- [ ] **Step 6: Commit Doctor alignment**

```bash
git add src/doctor.ts src/doctor.test.ts
git commit -m "fix(doctor): report cache-provided dynamic commands"
```

---

### Task 5: Clarify User Documentation and Run Release Verification

**Files:**
- Modify: `src/help.ts:829-840`
- Modify: `src/help.test.ts:80-120,850-885`
- Modify: `README.md:135-150,200-215,270-282`
- Verify: all files changed in Tasks 1-5

**Interfaces:**
- Consumes: the bundled and cache behavior implemented by Tasks 1-4.
- Produces: accurate local help and README guidance explaining immediate bundled availability and `sync-api` extension semantics.

- [ ] **Step 1: Change help tests to require the new discovery contract**

Update both `showHelp includes top-level cache sections` and `showFullHelp includes cache sections near command discovery` to assert:

```ts
    expect(output).toContain('Dynamic API Commands:');
    expect(output).toContain('Safe generated commands bundled with this CLI are available immediately.');
    expect(output).toContain('spacemolt sync-api              Discover API routes published after this CLI release');
    expect(output).toContain('Accepted cached routes replace the generated fallback catalog.');
    expect(output).not.toContain('Cached v2 routes appear in help, command search, completion, and dispatch.');
```

- [ ] **Step 2: Run help tests and verify the old cache-only copy fails**

Run:

```bash
bun test src/help.test.ts --test-name-pattern 'cache sections'
```

Expected: FAIL because `cacheHelpSections` still describes cached routes as the only generated command source.

- [ ] **Step 3: Update local help copy**

Replace the `Dynamic API Cache` block in `cacheHelpSections` with:

```ts
${c.bright}Dynamic API Commands:${c.reset}
  Safe generated commands bundled with this CLI are available immediately.
  spacemolt sync-api              Discover API routes published after this CLI release
  Accepted cached routes replace the generated fallback catalog.
```

Do not change the adjacent live-server-help or ID-cache sections.

- [ ] **Step 4: Update README usage and dynamic-command guidance**

Change the Usage sentence to:

```markdown
Local help is generated from bundled command metadata and, when present, an accepted same/newer OpenAPI cache:
```

Replace the opening Dynamic API Commands paragraphs with:

```markdown
Curated commands are bundled with the CLI for friendly names, aliases, examples, and formatting. Safe generated fallback commands from the CLI's reviewed bundled OpenAPI metadata are also available immediately; no cache refresh is required.

Run `sync-api` to discover safe v2 routes published after the installed CLI release. An accepted same-version or newer cache becomes authoritative for generated fallback visibility, while older or invalid caches are ignored:
```

Keep the existing `spacemolt sync-api` command block and predictable naming paragraph.

Change the Development note to:

```markdown
This updates the bundled metadata committed with the CLI. Released CLIs expose safe generated fallback commands from this metadata immediately. It does not refresh a user's runtime OpenAPI cache; use `spacemolt sync-api` to discover routes published after that CLI release.
```

- [ ] **Step 5: Run documentation-focused checks**

Run:

```bash
bun test src/help.test.ts src/command-metadata.test.ts src/completion.test.ts
bunx biome check src/help.ts src/help.test.ts
git diff --check
```

Expected: all commands exit 0; help and README consistently describe bundled availability and cache authority.

- [ ] **Step 6: Commit user-facing documentation**

```bash
git add src/help.ts src/help.test.ts README.md
git commit -m "docs: explain bundled dynamic commands"
```

- [ ] **Step 7: Run focused feature verification**

Run:

```bash
bun test src/openapi-cache.test.ts src/dynamic-commands.test.ts src/command-metadata.test.ts src/help.test.ts src/completion.test.ts src/runner.test.ts src/doctor.test.ts src/api-sync.test.ts
STRICT_FIXTURE_SCHEMA_DIVERGENCES=1 bun test src/output-golden.test.ts
bun run report:curated-commands
```

Expected:

- All focused tests and strict golden tests exit 0.
- The curated report has no `missing-generated-route` entry for a surviving curated command.
- Shipping remains generated-only and no golden files change.

- [ ] **Step 8: Run full release gates**

Run:

```bash
bun test
bun run typecheck
bun run lint
bun run build
git diff --check
git status --short --branch
```

Expected in a clean checkout:

- `bun test`: 0 failures.
- `bun run typecheck`: exit 0.
- `bun run lint`: exit 0 with no fixes applied.
- `bun run build`: exit 0 and produces the CLI binary.
- `git diff --check`: no whitespace errors.
- Worktree contains only intentional implementation changes or is clean after the task commits.

The current shared workspace contains an ignored `docs/_phase5c_run_verify.ts` that may make the unscoped `bun run typecheck` fail. Do not edit, delete, move, or commit that user file. If it is still present, report the exact standard typecheck failure, create `tsconfig.audit.json` with `apply_patch` using this exact content, run the scoped check, and delete the file with `apply_patch` afterward:

```json
{
  "extends": "./tsconfig.json",
  "include": ["src/**/*.ts", "scripts/**/*.ts"],
  "exclude": ["docs/**", "node_modules"]
}
```

Run:

```bash
bunx tsc --project tsconfig.audit.json --noEmit
```

Expected: exit 0. Confirm `tsconfig.audit.json` is absent from `git status` after deleting it.

- [ ] **Step 9: Audit scope and acceptance criteria**

Run:

```bash
git log --oneline --reverse f514180..HEAD
git diff --stat f514180..HEAD
rg -n 'shipping_(accept|cancel|deliver|get|list|pay_debt|post|profile|quote|return|track)' src/command-overrides-*.ts src/display
```

Expected:

- Commits correspond to the five tasks above.
- No generated metadata, command override, display formatter, fixture, or golden file changed.
- The `rg` command exits 1 with no matches, confirming there is no curated shipping override or shipping-specific formatter.
- Clean-profile help, search, completion, dry run, and dispatch all recognize `shipping_quote`.
- Equal/newer caches control generated visibility; stale, invalid, and absent caches fall back to bundled routes.

Do not claim completion until every applicable verification command has fresh output supporting the claim.
