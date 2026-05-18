import { afterEach, describe, expect, test } from 'bun:test';
import { getArgNames, validatePayloadAgainstSchema } from './args';
import { COMMANDS } from './commands';
import { generateCompletion } from './completion';
import { showCommandHelp } from './help';

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

const originalLog = console.log;

afterEach(() => {
  console.log = originalLog;
});

function captureHelp(command: string): string {
  const stdout: string[] = [];
  console.log = (...args: unknown[]) => stdout.push(args.map(String).join(' '));

  expect(showCommandHelp(command)).toBe(true);

  return stdout.join('\n').replace(ANSI_PATTERN, '');
}

function getCompletionEnumCases(): Array<{ command: string; arg: string; values: string[] }> {
  const cases: Array<{ command: string; arg: string; values: string[] }> = [];
  for (const [command, config] of Object.entries(COMMANDS)) {
    for (const arg of getArgNames(config)) {
      const canonicalArg = config.aliases?.[arg] || arg;
      const values = config.schema?.[canonicalArg]?.enum;
      if (values?.length) cases.push({ command, arg, values });
    }
  }
  return cases;
}

describe('command metadata', () => {
  test('every required arg appears in command args and local help', () => {
    const missing: string[] = [];

    for (const [command, config] of Object.entries(COMMANDS)) {
      const required = config.required || [];
      if (required.length === 0) continue;

      const argNames = getArgNames(config);
      const help = captureHelp(command);
      for (const arg of required) {
        if (!argNames.includes(arg)) missing.push(`${command}: ${arg} missing from args`);
        if (!help.includes(arg)) missing.push(`${command}: ${arg} missing from help`);
      }
    }

    expect(missing).toEqual([]);
  });

  test('completion enum values match generated command schemas', () => {
    const enumCases = getCompletionEnumCases();
    expect(enumCases.length).toBeGreaterThan(0);

    for (const shell of ['bash', 'zsh', 'fish']) {
      const completion = generateCompletion(shell);
      const missing = enumCases.flatMap(({ command, arg, values }) =>
        values
          .filter((value) => !completion.includes(value))
          .map((value) => `${shell}: ${command}.${arg} missing enum value ${value}`),
      );

      expect(missing).toEqual([]);
    }
  });

  test('every command has a description from override or generated summary', () => {
    const missing: string[] = [];

    for (const [command, config] of Object.entries(COMMANDS)) {
      if (!config.description) {
        missing.push(command);
      }
    }

    expect(
      missing,
      `Commands missing description (add a description override or ensure the OpenAPI spec has a summary):\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });

  test('schema validation catches invalid enum values', () => {
    const errors = validatePayloadAgainstSchema('register', { empire: 'invalid_empire' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.code).toBe('invalid_enum');
    expect(errors[0]?.field).toBe('empire');
  });

  test('schema validation catches invalid integers', () => {
    const errors = validatePayloadAgainstSchema('buy_insurance', { ticks: 'abc' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.code).toBe('invalid_integer');
  });

  test('schema validation catches boolean typos with suggestions', () => {
    const errors = validatePayloadAgainstSchema('cloak', { enable: 'flase' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.code).toBe('invalid_boolean');
    expect(errors[0]?.message).toContain('Did you mean');
  });

  test('schema validation passes for valid payloads', () => {
    const errors = validatePayloadAgainstSchema('register', {
      username: 'test',
      empire: 'solarian',
      registration_code: 'abc123',
    });
    expect(errors).toEqual([]);
  });
});
