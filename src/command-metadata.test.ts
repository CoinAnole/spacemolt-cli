import { afterEach, describe, expect, test } from 'bun:test';
import { getArgNames } from './args';
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

  test('completion values include schema-derived boolean choices and argument descriptions', () => {
    const bash = generateCompletion('bash');
    expect(bash).toContain('true false');

    for (const shell of ['zsh', 'fish']) {
      const completion = generateCompletion(shell);
      expect(completion).toContain('True to activate cloak, false to deactivate');
      expect(completion).toContain('Filter by notification types. Omit for all types.');
    }
  });
});
