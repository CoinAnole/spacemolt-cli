import { expect } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface GoldenOutput {
  exitCode?: number;
  stdout: string;
  stderr: string;
}

export type GoldenGroup = 'renderer' | 'cli';
export type GoldenStdoutFormat = 'text' | 'json' | 'yaml';

export interface GoldenValidationOptions {
  stdoutFormat?: GoldenStdoutFormat;
  expectedYamlKeys?: string[];
  allowFallback?: boolean;
  allowDiagnosticTokens?: boolean;
}

export interface GoldenAssertionOptions extends GoldenValidationOptions {
  group: GoldenGroup;
  name: string;
  expectedExitCode?: number;
  goldenRoot?: string;
  update?: boolean;
}

export const DEFAULT_GOLDEN_ROOT = path.join(import.meta.dir, '..', 'golden-output');

const ACCIDENTAL_TOKENS = ['undefined', 'NaN', '[object Object]'] as const;

export function normalizeOutputLines(lines: string[]): string {
  return lines.join('\n');
}

export function goldenFilePath(
  options: Pick<GoldenAssertionOptions, 'group' | 'name' | 'goldenRoot'>,
  stream: 'stdout' | 'stderr',
): string {
  return path.join(options.goldenRoot ?? DEFAULT_GOLDEN_ROOT, options.group, `${options.name}.${stream}`);
}

export function validateGoldenOutput(actual: GoldenOutput, options: GoldenValidationOptions = {}): string[] {
  const errors: string[] = [];

  if (options.stdoutFormat === 'json' && actual.stdout.trim()) {
    try {
      JSON.parse(actual.stdout);
    } catch {
      errors.push('stdout is not valid JSON');
    }
  }

  if (options.stdoutFormat === 'yaml') {
    for (const key of options.expectedYamlKeys ?? []) {
      if (!hasYamlTopLevelKey(actual.stdout, key)) {
        errors.push(`YAML stdout is missing top-level key "${key}"`);
      }
    }
  }

  if (options.allowFallback !== true && actual.stdout.includes('=== Response ===')) {
    errors.push('stdout contains raw response fallback marker');
  }

  if (options.allowDiagnosticTokens !== true) {
    const combined = `${actual.stdout}\n${actual.stderr}`;
    for (const token of ACCIDENTAL_TOKENS) {
      if (combined.includes(token)) errors.push(`output contains accidental token "${token}"`);
    }
  }

  return errors;
}

function hasYamlTopLevelKey(output: string, key: string): boolean {
  const trimmed = output.trimStart();
  return trimmed.startsWith(`${key}:`) || output.includes(`\n${key}:`);
}

export function assertGoldenOutput(options: GoldenAssertionOptions, actual: GoldenOutput): void {
  const expectedExitCode = options.expectedExitCode ?? 0;
  expect(actual.exitCode ?? 0, `${options.group}/${options.name} exit code`).toBe(expectedExitCode);

  const update = options.update ?? process.env.UPDATE_GOLDENS === '1';
  assertGoldenStream(options, 'stdout', actual.stdout, update);
  assertGoldenStream(options, 'stderr', actual.stderr, update);

  expect(validateGoldenOutput(actual, options), `${options.group}/${options.name} guardrails`).toEqual([]);
}

function assertGoldenStream(
  options: GoldenAssertionOptions,
  stream: 'stdout' | 'stderr',
  actualValue: string,
  update: boolean,
): void {
  const filePath = goldenFilePath(options, stream);

  if (update) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, actualValue);
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing golden file: ${filePath}\nRun UPDATE_GOLDENS=1 bun test src/output-golden.test.ts`);
  }

  const expectedValue = fs.readFileSync(filePath, 'utf8');
  expect(actualValue, `${options.group}/${options.name} ${stream}`).toBe(expectedValue);
}
