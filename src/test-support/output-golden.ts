import { expect } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface GoldenOutput {
  exitCode?: number;
  stdout: string;
  stderr: string;
}

export type GoldenGroup = 'renderer' | 'cli';
export type GoldenStream = 'stdout' | 'stderr';
export type GoldenStdoutFormat = 'text' | 'json' | 'yaml';

export interface GoldenManifestEntry {
  group: GoldenGroup;
  name: string;
}

export interface GoldenFileSetOptions {
  goldenRoot?: string;
  update?: boolean;
  env?: Record<string, string | undefined>;
}

export interface GoldenUpdateDecisionOptions {
  update?: boolean;
  only?: string[];
}

export interface GoldenUpdateGuardOptions {
  update: boolean;
  env?: Record<string, string | undefined>;
}

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
  only?: string[];
  env?: Record<string, string | undefined>;
}

export const DEFAULT_GOLDEN_ROOT = path.join(import.meta.dir, '..', 'golden-output');

const ACCIDENTAL_TOKENS = ['undefined', 'NaN', '[object Object]'] as const;

export function normalizeOutputLines(lines: string[]): string {
  return lines.length ? `${lines.join('\n')}\n` : '';
}

export function goldenFilePath(
  options: Pick<GoldenAssertionOptions, 'group' | 'name' | 'goldenRoot'>,
  stream: GoldenStream,
): string {
  return path.join(options.goldenRoot ?? DEFAULT_GOLDEN_ROOT, options.group, `${options.name}.${stream}`);
}

export function expectedGoldenFiles(entries: GoldenManifestEntry[], goldenRoot = DEFAULT_GOLDEN_ROOT): string[] {
  return entries
    .flatMap((entry) => [
      goldenFilePath({ ...entry, goldenRoot }, 'stderr'),
      goldenFilePath({ ...entry, goldenRoot }, 'stdout'),
    ])
    .sort();
}

export function listGoldenFiles(goldenRoot = DEFAULT_GOLDEN_ROOT): string[] {
  if (!fs.existsSync(goldenRoot)) return [];

  const files: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.stdout') || entry.name.endsWith('.stderr'))) {
        files.push(fullPath);
      }
    }
  };

  visit(goldenRoot);
  return files.sort();
}

export function parseGoldenOnly(value: string | undefined): string[] | undefined {
  const only = value
    ?.split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return only?.length ? only : undefined;
}

export function shouldUpdateGolden(entry: GoldenManifestEntry, options: GoldenUpdateDecisionOptions = {}): boolean {
  if (!options.update) return false;
  const only = options.only;
  if (!only?.length) return true;
  const id = `${entry.group}/${entry.name}`;
  return only.some((needle) => id.includes(needle) || entry.name.includes(needle));
}

export function assertGoldenUpdateAllowed(options: GoldenUpdateGuardOptions): void {
  if (!options.update) return;
  const env = options.env ?? process.env;
  if (isTruthyEnvFlag(env.CI) && env.ALLOW_CI_GOLDEN_UPDATE !== '1') {
    throw new Error('Refusing to update golden files in CI without ALLOW_CI_GOLDEN_UPDATE=1');
  }
}

function isTruthyEnvFlag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true' || value?.trim() === '1';
}

export function assertGoldenFileSet(entries: GoldenManifestEntry[], options: GoldenFileSetOptions = {}): void {
  const goldenRoot = options.goldenRoot ?? DEFAULT_GOLDEN_ROOT;
  const env = options.env ?? process.env;
  const update = options.update ?? env.UPDATE_GOLDENS === '1';
  assertGoldenUpdateAllowed({ update, env });
  const expected = expectedGoldenFiles(entries, goldenRoot);
  const actual = listGoldenFiles(goldenRoot);
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const missing = update ? [] : expected.filter((file) => !actualSet.has(file));
  const unexpected = actual.filter((file) => !expectedSet.has(file));

  if (missing.length > 0 || unexpected.length > 0) {
    const formatList = (files: string[]) => files.map((file) => path.relative(goldenRoot, file)).join('\n');
    throw new Error(
      [
        'golden file manifest mismatch',
        unexpected.length > 0 ? `Unexpected golden file:\n${formatList(unexpected)}` : undefined,
        missing.length > 0 ? `Missing golden file:\n${formatList(missing)}` : undefined,
      ]
        .filter(Boolean)
        .join('\n\n'),
    );
  }
}

export function validateGoldenOutput(actual: GoldenOutput, options: GoldenValidationOptions = {}): string[] {
  const errors: string[] = [];

  if (options.stdoutFormat === 'json') {
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
  return output.split(/\r?\n/).some((line) => line.startsWith(`${key}:`));
}

export function assertGoldenOutput(options: GoldenAssertionOptions, actual: GoldenOutput): void {
  const expectedExitCode = options.expectedExitCode ?? 0;
  expect(actual.exitCode ?? 0, `${options.group}/${options.name} exit code`).toBe(expectedExitCode);
  expect(validateGoldenOutput(actual, options), `${options.group}/${options.name} guardrails`).toEqual([]);

  const env = options.env ?? process.env;
  const requestedUpdate = options.update ?? env.UPDATE_GOLDENS === '1';
  assertGoldenUpdateAllowed({ update: requestedUpdate, env });
  const update = shouldUpdateGolden(options, {
    update: requestedUpdate,
    only: options.only ?? parseGoldenOnly(env.GOLDEN_ONLY),
  });
  assertGoldenStream(options, 'stdout', actual.stdout, update);
  assertGoldenStream(options, 'stderr', actual.stderr, update);
}

function assertGoldenStream(
  options: GoldenAssertionOptions,
  stream: GoldenStream,
  actualValue: string,
  update: boolean,
): void {
  const filePath = goldenFilePath(options, stream);

  if (update) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, actualValue);
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing golden file: ${filePath}\nRun UPDATE_GOLDENS=1 bun test <golden test file>`);
  }

  const expectedValue = fs.readFileSync(filePath, 'utf8');
  expect(actualValue, `${options.group}/${options.name} ${stream}`).toBe(expectedValue);
}
