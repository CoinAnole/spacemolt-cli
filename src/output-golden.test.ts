import { describe, test } from 'bun:test';
import { renderStructuredResult } from './display';
import {
  getStatusFixture,
  highValueCommandFixtures,
  viewMarketFixture,
} from './display/formatter-fixtures';
import {
  assertGoldenOutput,
  normalizeOutputLines,
  type GoldenOutput,
  type GoldenStdoutFormat,
} from './test-support/output-golden';
import type { GlobalOptions } from './types';

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
