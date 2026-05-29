import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { assertGoldenOutput, goldenFilePath, normalizeOutputLines, validateGoldenOutput } from './output-golden';

describe('output golden test support', () => {
  test('normalizes buffered output with newlines between captured writes', () => {
    expect(normalizeOutputLines(['alpha', 'beta', 'gamma'])).toBe('alpha\nbeta\ngamma');
    expect(normalizeOutputLines([])).toBe('');
  });

  test('validates JSON stdout when requested', () => {
    expect(validateGoldenOutput({ stdout: '{"ok":true}', stderr: '' }, { stdoutFormat: 'json' })).toEqual([]);
    expect(validateGoldenOutput({ stdout: '{"ok":', stderr: '' }, { stdoutFormat: 'json' })).toEqual([
      'stdout is not valid JSON',
    ]);
    expect(validateGoldenOutput({ stdout: '', stderr: '' }, { stdoutFormat: 'json' })).toEqual([
      'stdout is not valid JSON',
    ]);
  });

  test('validates expected YAML top-level keys without parsing YAML', () => {
    expect(
      validateGoldenOutput(
        { stdout: '\nplayer:\n  username: Marlowe\nship:\n  fuel: 80', stderr: '' },
        { stdoutFormat: 'yaml', expectedYamlKeys: ['player', 'ship'] },
      ),
    ).toEqual([]);
    expect(
      validateGoldenOutput(
        { stdout: '\nplayer:\n  username: Marlowe', stderr: '' },
        { stdoutFormat: 'yaml', expectedYamlKeys: ['player', 'ship'] },
      ),
    ).toEqual(['YAML stdout is missing top-level key "ship"']);
    expect(
      validateGoldenOutput(
        { stdout: '  player:\n    username: Marlowe', stderr: '' },
        { stdoutFormat: 'yaml', expectedYamlKeys: ['player'] },
      ),
    ).toEqual(['YAML stdout is missing top-level key "player"']);
  });

  test('detects fallback and accidental diagnostic tokens', () => {
    expect(validateGoldenOutput({ stdout: '\n=== Response ===\n{}', stderr: '' })).toEqual([
      'stdout contains raw response fallback marker',
    ]);
    expect(validateGoldenOutput({ stdout: 'Fuel: NaN', stderr: '' })).toEqual([
      'output contains accidental token "NaN"',
    ]);
    expect(validateGoldenOutput({ stdout: '', stderr: 'value=[object Object]' })).toEqual([
      'output contains accidental token "[object Object]"',
    ]);
  });

  test('assertGoldenOutput writes and compares stdout and stderr in update mode', () => {
    const goldenRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-golden-helper-'));
    try {
      assertGoldenOutput(
        {
          group: 'renderer',
          name: 'sample.case',
          expectedExitCode: 3,
          goldenRoot,
          update: true,
        },
        { exitCode: 3, stdout: 'out', stderr: 'err' },
      );

      expect(
        fs.readFileSync(goldenFilePath({ group: 'renderer', name: 'sample.case', goldenRoot }, 'stdout'), 'utf8'),
      ).toBe('out');
      expect(
        fs.readFileSync(goldenFilePath({ group: 'renderer', name: 'sample.case', goldenRoot }, 'stderr'), 'utf8'),
      ).toBe('err');
    } finally {
      fs.rmSync(goldenRoot, { recursive: true, force: true });
    }
  });

  test('assertGoldenOutput validates guardrails before writing in update mode', () => {
    const goldenRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-golden-helper-'));
    try {
      const options = {
        group: 'renderer' as const,
        name: 'invalid.case',
        goldenRoot,
        update: true,
        stdoutFormat: 'json' as const,
      };

      expect(() => assertGoldenOutput(options, { stdout: '{"ok":', stderr: '' })).toThrow(
        'renderer/invalid.case guardrails',
      );
      expect(fs.existsSync(goldenFilePath(options, 'stdout'))).toBe(false);
      expect(fs.existsSync(goldenFilePath(options, 'stderr'))).toBe(false);
    } finally {
      fs.rmSync(goldenRoot, { recursive: true, force: true });
    }
  });

  test('assertGoldenOutput missing golden error includes path and generic update guidance', () => {
    const goldenRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-golden-helper-'));
    try {
      const options = {
        group: 'renderer' as const,
        name: 'missing.case',
        goldenRoot,
      };
      const missingPath = goldenFilePath(options, 'stdout');

      expect(() => assertGoldenOutput(options, { stdout: 'out', stderr: '' })).toThrow(
        `Missing golden file: ${missingPath}\nRun UPDATE_GOLDENS=1 bun test <golden test file>`,
      );
    } finally {
      fs.rmSync(goldenRoot, { recursive: true, force: true });
    }
  });
});
