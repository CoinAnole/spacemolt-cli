import { describe, expect, test } from 'bun:test';
import type { CommandParseError } from './args';
import type { CommandRegistrySnapshot } from './command-registry';
import { displayCommandParseErrors, preparePayload, validationErrorFromParseErrors } from './payload';
import type { GlobalOptions } from './types';

const baseOptions: GlobalOptions = {
  args: [],
  json: false,
  quiet: false,
  plain: false,
  allowUnknown: false,
  dryRun: false,
  noTimestamp: false,
  compact: false,
};

function captureWriter() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    writer: {
      out(message = '') {
        stdout.push(message);
      },
      err(message = '') {
        stderr.push(message);
      },
    },
  };
}

describe('payload preparation', () => {
  test('unknown commands return JSON errors in JSON mode', () => {
    const capture = captureWriter();
    const result = preparePayload('does_not_exist', {}, { ...baseOptions, json: true }, undefined, capture.writer);

    expect(result).toEqual({ type: 'exit', exitCode: 1 });
    expect(capture.stdout).toEqual([]);
    expect(JSON.parse(capture.stderr.join('\n'))).toMatchObject({
      error: {
        code: 'unknown_command',
        message: 'Unknown command: does_not_exist',
      },
    });
  });

  test('unknown command text suggestions use the supplied registry', () => {
    const capture = captureWriter();
    const registry = {
      commands: {
        cached_action: {
          description: 'Cache-added action',
          route: { tool: 'cached', action: 'action' },
        },
      },
    } satisfies Pick<CommandRegistrySnapshot, 'commands'>;

    const result = preparePayload('cached_acton', {}, baseOptions, undefined, capture.writer, registry);

    expect(result).toEqual({ type: 'exit', exitCode: 1 });
    expect(capture.stderr.join('\n')).toContain('Did you mean: cached_action');
  });

  test('help=true exits after rendering command help', () => {
    const capture = captureWriter();
    const result = preparePayload('travel', { help: 'true' }, baseOptions, undefined, capture.writer);

    expect(result).toEqual({ type: 'exit', exitCode: 0 });
    expect(capture.stdout.join('\n')).toContain('Usage:');
    expect(capture.stdout.join('\n')).toContain('travel');
  });

  test('help=true respects explicit plain output state', () => {
    const capture = captureWriter();
    const result = preparePayload(
      'travel',
      { help: 'true' },
      { ...baseOptions, plain: true },
      undefined,
      capture.writer,
    );

    expect(result).toEqual({ type: 'exit', exitCode: 0 });
    expect(capture.stdout.join('\n')).toContain('Usage:');
    expect(capture.stdout.join('\n')).not.toContain('\x1b[');
  });

  test('missing required args return JSON errors in JSON mode', () => {
    const capture = captureWriter();
    const result = preparePayload('travel', {}, { ...baseOptions, json: true }, undefined, capture.writer);

    expect(result).toEqual({ type: 'exit', exitCode: 1 });
    expect(capture.stdout).toEqual([]);
    expect(JSON.parse(capture.stderr.join('\n'))).toMatchObject({
      error: {
        code: 'missing_required_argument',
        message: 'Missing required argument: target_poi',
      },
    });
  });

  test('displayCommandParseErrors writes JSON errors in JSON mode and text errors in text mode', () => {
    const errors: CommandParseError[] = [{ code: 'unknown_field', field: 'bad', message: 'Unknown field: bad' }];

    const jsonCapture = captureWriter();
    displayCommandParseErrors(errors, { ...baseOptions, json: true }, jsonCapture.writer);
    expect(jsonCapture.stdout).toEqual([]);
    expect(JSON.parse(jsonCapture.stderr.join('\n'))).toMatchObject({
      error: {
        code: 'validation_error',
        message: 'Unknown field: bad',
      },
    });

    const textCapture = captureWriter();
    displayCommandParseErrors(errors, baseOptions, textCapture.writer);
    expect(textCapture.stderr.join('\n')).toContain('Unknown field: bad');
  });

  test('validationErrorFromParseErrors preserves parse error details', () => {
    const errors: CommandParseError[] = [{ code: 'invalid_number', field: 'quantity', message: 'Invalid quantity' }];

    expect(validationErrorFromParseErrors(errors)).toEqual({
      code: 'validation_error',
      message: 'Invalid quantity',
      errors,
      exitCode: 1,
    });
  });
});
