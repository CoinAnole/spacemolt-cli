import { describe, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { SpaceMoltClient } from './api';
import type { CliRuntimeContext } from './cli-context';
import { renderStructuredResult } from './display';
import { getStatusFixture, highValueCommandFixtures, viewMarketFixture } from './display/formatter-fixtures';
import { type RunnerDependencies, runInvocation } from './runner';
import { COMPACT, DEBUG, FORMAT, JSON_OUTPUT, PLAIN, QUIET, setOutputMode } from './runtime';
import { ACTIVE_PROFILE, setActiveProfile } from './session';
import { compareHighValueFixturesToSpec, formatComparisonReport } from './test-support/fixture-schema-compare.ts';
import {
  assertGoldenOutput,
  type GoldenOutput,
  type GoldenStdoutFormat,
  normalizeOutputLines,
} from './test-support/output-golden';
import type { APIResponse, GlobalOptions } from './types';

const baseOptions: GlobalOptions = {
  args: [],
  json: false,
  quiet: false,
  plain: true,
  allowUnknown: false,
  dryRun: false,
  noTimestamp: true,
  compact: false,
};

const rendererContext = {
  clock: {
    now() {
      return new Date('2026-05-29T00:00:00.000Z');
    },
  },
  output: {
    json: false,
    quiet: false,
    plain: true,
    format: 'table' as const,
    compact: false,
  },
};

interface RendererGoldenCase {
  name: string;
  command: string;
  fixture: Record<string, unknown>;
  options?: Partial<GlobalOptions>;
  stdoutFormat?: GoldenStdoutFormat;
  expectedYamlKeys?: string[];
  allowFallback?: boolean;
}

function globalOptions(overrides: Partial<GlobalOptions> = {}): GlobalOptions {
  return { ...baseOptions, ...overrides };
}

function renderRendererCase(testCase: RendererGoldenCase): GoldenOutput {
  const rendered = renderStructuredResult(
    testCase.command,
    structuredClone(testCase.fixture),
    globalOptions(testCase.options),
    rendererContext,
  );

  return {
    exitCode: rendered.success ? 0 : 1,
    stdout: normalizeOutputLines(rendered.stdout),
    stderr: normalizeOutputLines(rendered.stderr),
  };
}

interface CliGoldenCase {
  name: string;
  argv: string[];
  response?: APIResponse;
  expectedExitCode?: number;
  stdoutFormat?: GoldenStdoutFormat;
  expectedYamlKeys?: string[];
}

function fakeClient(response: APIResponse): SpaceMoltClient {
  return {
    config: {},
    async execute() {
      return structuredClone(response);
    },
    async executeCommandConfig() {
      return structuredClone(response);
    },
  } as unknown as SpaceMoltClient;
}

interface CliStreamCapture {
  stdout: string;
  stderr: string;
}

function cliContext(tempDir: string, capture: CliStreamCapture): CliRuntimeContext {
  return {
    env: {
      XDG_CONFIG_HOME: path.join(tempDir, 'config'),
      SPACEMOLT_PROFILE: 'golden',
      SPACEMOLT_UPDATE_CHECK: 'false',
    },
    writer: {
      out(message = '') {
        capture.stdout += `${message}\n`;
      },
      err(message = '') {
        capture.stderr += `${message}\n`;
      },
      writeOut(chunk) {
        capture.stdout += chunk;
      },
    },
    clock: {
      now() {
        return new Date('2026-05-29T00:00:00.000Z');
      },
    },
    sleep() {
      return Promise.resolve();
    },
    output: {
      json: false,
      quiet: false,
      plain: true,
      format: 'table',
      compact: false,
    },
  };
}

async function renderCliCase(testCase: CliGoldenCase): Promise<GoldenOutput> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-output-golden-'));
  const capture: CliStreamCapture = { stdout: '', stderr: '' };
  const originalOutputMode = {
    json: JSON_OUTPUT,
    quiet: QUIET,
    plain: PLAIN,
    debug: DEBUG,
    format: FORMAT,
    compact: COMPACT,
  };
  const originalActiveProfile = ACTIVE_PROFILE;

  try {
    const dependencies: RunnerDependencies = {
      createClient() {
        throw new Error('unexpected real client creation in golden test');
      },
      loadCachedGeneratedRoutes() {
        return undefined;
      },
      defaultOpenApiCacheDir() {
        return path.join(tempDir, 'openapi-cache');
      },
      async checkForUpdates() {},
      getDefaultProfile() {
        return undefined;
      },
      onSigint() {
        return () => undefined;
      },
    };
    const exitCode = await runInvocation(
      testCase.argv,
      fakeClient(testCase.response ?? { structuredContent: { ok: true } }),
      cliContext(tempDir, capture),
      dependencies,
    );

    return {
      exitCode,
      stdout: capture.stdout,
      stderr: capture.stderr,
    };
  } finally {
    setOutputMode(originalOutputMode);
    setActiveProfile(originalActiveProfile);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

const rendererMatrixCases: RendererGoldenCase[] = Object.entries(highValueCommandFixtures).flatMap(
  ([label, { command, fixture }]) => [
    {
      name: `${label}.table`,
      command,
      fixture,
      stdoutFormat: 'text',
    },
    {
      name: `${label}.json`,
      command,
      fixture,
      options: { format: 'json' },
      stdoutFormat: 'json',
    },
    {
      name: `${label}.yaml`,
      command,
      fixture,
      options: { format: 'yaml' },
      stdoutFormat: 'yaml',
      expectedYamlKeys: Object.keys(fixture),
    },
    {
      name: `${label}.compact-json`,
      command,
      fixture,
      options: { format: 'json', compact: true },
      stdoutFormat: 'json',
    },
  ],
);

const rendererProjectionCases: RendererGoldenCase[] = [
  {
    name: 'get_status.text',
    command: 'get_status',
    fixture: getStatusFixture,
    options: { format: 'text' },
    stdoutFormat: 'text',
  },
  {
    name: 'get_status.field-ship-fuel',
    command: 'get_status',
    fixture: getStatusFixture,
    options: { field: 'ship.fuel' },
    stdoutFormat: 'text',
  },
  {
    name: 'get_status.fields-player-ship-json',
    command: 'get_status',
    fixture: getStatusFixture,
    options: { format: 'json', fields: ['player.username', 'ship.fuel'] },
    stdoutFormat: 'json',
  },
  {
    name: 'view_market.jq-first-item-id',
    command: 'view_market',
    fixture: viewMarketFixture,
    options: { jq: '.items[0].item_id' },
    stdoutFormat: 'text',
  },
];

const cliCases: CliGoldenCase[] = [
  {
    name: 'get_status.--json',
    argv: ['--plain', '--json', 'get_status'],
    response: { structuredContent: getStatusFixture },
    stdoutFormat: 'json',
  },
  {
    name: 'get_status.--structured',
    argv: ['--plain', '--structured', 'get_status'],
    response: { result: 'server rendered status', structuredContent: getStatusFixture },
    stdoutFormat: 'json',
  },
  {
    name: 'get_status.--format-yaml',
    argv: ['--plain', '--format', 'yaml', 'get_status'],
    response: { structuredContent: getStatusFixture },
    stdoutFormat: 'yaml',
    expectedYamlKeys: Object.keys(getStatusFixture),
  },
  {
    name: 'validation-error.table',
    argv: ['--plain', 'travel'],
    expectedExitCode: 1,
  },
  {
    name: 'validation-error.--json',
    argv: ['--plain', '--json', 'travel'],
    expectedExitCode: 1,
    stdoutFormat: 'json',
  },
  {
    name: 'unknown-command.table',
    argv: ['--plain', 'trvel'],
    expectedExitCode: 1,
  },
  {
    name: 'unknown-command.--json',
    argv: ['--plain', '--json', 'trvel'],
    expectedExitCode: 1,
    stdoutFormat: 'json',
  },
  {
    name: 'structured-api-error.--structured',
    argv: ['--plain', '--structured', 'get_status'],
    response: {
      error: {
        code: 'missing_materials',
        message: 'need 300 x optical_fiber_bundle, have 0 in faction storage + 0 in cargo',
      },
    },
    expectedExitCode: 1,
    stdoutFormat: 'json',
  },
];

describe('renderer golden output', () => {
  for (const testCase of [...rendererMatrixCases, ...rendererProjectionCases]) {
    test(testCase.name, () => {
      assertGoldenOutput(
        {
          group: 'renderer',
          name: testCase.name,
          stdoutFormat: testCase.stdoutFormat,
          expectedYamlKeys: testCase.expectedYamlKeys,
          allowFallback: testCase.allowFallback,
        },
        renderRendererCase(testCase),
      );
    });
  }
});

describe('CLI golden output', () => {
  for (const testCase of cliCases) {
    test(testCase.name, async () => {
      assertGoldenOutput(
        {
          group: 'cli',
          name: testCase.name,
          expectedExitCode: testCase.expectedExitCode,
          stdoutFormat: testCase.stdoutFormat,
          expectedYamlKeys: testCase.expectedYamlKeys,
        },
        await renderCliCase(testCase),
      );
    });
  }
});

// Optional schema divergence report (awareness only, never fails the suite)
if (process.env.SHOW_FIXTURE_SCHEMA_DIVERGENCES === '1') {
  // Run after module load so it prints once when the golden test file is executed
  // (Bun test loads the module before running describes).
  // Using queueMicrotask so it appears after the test runner header output.
  queueMicrotask(() => {
    try {
      const comparisons = compareHighValueFixturesToSpec();
      console.log(`\n${formatComparisonReport(comparisons)}\n`);
    } catch (err) {
      console.error('[fixture-schema-compare] failed to generate report:', err);
    }
  });
}
