import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { checkForUpdates, compareVersions, type UpdateCheckOptions } from './update';

const NOW = new Date('2026-05-18T12:00:00.000Z');

function tempCachePath(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-update-test-')), 'update-check.json');
}

function readCache(cachePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(cachePath, 'utf8')) as Record<string, unknown>;
}

function updateOptions(overrides: Partial<UpdateCheckOptions> = {}): UpdateCheckOptions & { cachePath: string } {
  const { cachePath = tempCachePath(), ...rest } = overrides;
  const lines: string[] = [];
  return {
    env: { SPACEMOLT_UPDATE_CHECK: 'true' },
    clock: { now: () => NOW },
    cachePath,
    writer: {
      out(message = '') {
        lines.push(message);
      },
      err() {},
    },
    transport: async () => ({ ok: true, status: 200, data: { tag_name: 'v0.6.5' } }),
    version: '0.6.5',
    repo: 'CoinAnole/spacemolt-cli',
    debug: false,
    ...rest,
  };
}

describe('compareVersions', () => {
  test('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.6.5', '0.6.5')).toBe(0);
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
  });

  test('returns 1 when latest is newer (major)', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBe(1);
    expect(compareVersions('0.6.5', '1.0.0')).toBe(1);
  });

  test('returns 1 when latest is newer (minor)', () => {
    expect(compareVersions('1.0.0', '1.1.0')).toBe(1);
    expect(compareVersions('0.6.5', '0.7.0')).toBe(1);
  });

  test('returns 1 when latest is newer (patch)', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBe(1);
    expect(compareVersions('0.6.5', '0.6.6')).toBe(1);
  });

  test('returns -1 when current is newer', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBe(-1);
    expect(compareVersions('1.1.0', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.1', '1.0.0')).toBe(-1);
  });

  test('handles versions with different segment counts', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0')).toBe(0);
    expect(compareVersions('1.0', '1.0.1')).toBe(1);
    expect(compareVersions('1.0.1', '1.0')).toBe(-1);
  });

  test('handles v prefix', () => {
    expect(compareVersions('v0.6.5', 'v0.6.6')).toBe(1);
    expect(compareVersions('0.6.5', 'v0.6.6')).toBe(1);
    expect(compareVersions('v0.6.5', '0.6.6')).toBe(1);
  });
});

describe('checkForUpdates', () => {
  test('skips unless update checks are explicitly enabled', async () => {
    let fetched = false;
    const options = updateOptions({
      env: {},
      transport: async () => {
        fetched = true;
        return { ok: true, status: 200, data: { tag_name: 'v9.9.9' } };
      },
    });

    await checkForUpdates(options);

    expect(fetched).toBe(false);
  });

  test('uses a fresh cache without fetching', async () => {
    const options = updateOptions({ version: '1.0.0' });
    fs.mkdirSync(path.dirname(options.cachePath), { recursive: true });
    fs.writeFileSync(options.cachePath, JSON.stringify({ checked_at: NOW.toISOString(), latest_version: '1.1.0' }));
    let fetched = false;

    await checkForUpdates({
      ...options,
      transport: async () => {
        fetched = true;
        return { ok: true, status: 200, data: { tag_name: 'v1.1.0' } };
      },
    });

    expect(fetched).toBe(false);
  });

  test('refreshes a stale cache and stores the latest version', async () => {
    const options = updateOptions();
    fs.mkdirSync(path.dirname(options.cachePath), { recursive: true });
    fs.writeFileSync(
      options.cachePath,
      JSON.stringify({ checked_at: '2026-05-17T00:00:00.000Z', latest_version: '1.0.0' }),
    );

    await checkForUpdates({
      ...options,
      version: '2.0.0',
      transport: async () => ({ ok: true, status: 200, data: { tag_name: 'v2.0.1' } }),
    });

    expect(readCache(options.cachePath).latest_version).toBe('2.0.1');
    expect(readCache(options.cachePath).checked_at).toBe(NOW.toISOString());
  });

  test('does not throw when the fetch fails', async () => {
    const options = updateOptions({
      transport: async () => {
        throw new Error('network down');
      },
    });

    await expect(checkForUpdates(options)).resolves.toBeUndefined();
  });

  test('reports non-200 failures only in debug mode', async () => {
    const lines: string[] = [];
    await checkForUpdates(
      updateOptions({
        debug: true,
        writer: {
          out(message = '') {
            lines.push(message);
          },
          err() {},
        },
        transport: async () => ({ ok: false, status: 503, data: { tag_name: 'v9.9.9' } }),
      }),
    );

    expect(stripAnsi(lines.join('\n'))).toContain('[DEBUG] Update check failed: HTTP 503');
  });

  test('prints and records a newer version notification', async () => {
    const lines: string[] = [];
    const options = updateOptions({
      version: '1.0.0',
      writer: {
        out(message = '') {
          lines.push(message);
        },
        err() {},
      },
      transport: async () => ({ ok: true, status: 200, data: { tag_name: 'v1.2.0' } }),
    });

    await checkForUpdates(options);

    const output = stripAnsi(lines.join('\n'));
    expect(output).toContain('Update available!');
    expect(output).toContain('v1.0.0');
    expect(output).toContain('v1.2.0');
    expect(readCache(options.cachePath).notified_version).toBe('1.2.0');
    expect(readCache(options.cachePath).notified_at).toBe(NOW.toISOString());
  });

  test('throttles repeated notifications for the same cached version', async () => {
    const lines: string[] = [];
    const options = updateOptions({
      version: '1.0.0',
      writer: {
        out(message = '') {
          lines.push(message);
        },
        err() {},
      },
    });
    fs.mkdirSync(path.dirname(options.cachePath), { recursive: true });
    fs.writeFileSync(
      options.cachePath,
      JSON.stringify({
        checked_at: NOW.toISOString(),
        latest_version: '1.2.0',
        notified_version: '1.2.0',
        notified_at: NOW.toISOString(),
      }),
    );

    await checkForUpdates(options);

    expect(lines).toEqual([]);
  });

  test('silently ignores failures when debug is disabled', async () => {
    const lines: string[] = [];
    await checkForUpdates(
      updateOptions({
        debug: false,
        writer: {
          out(message = '') {
            lines.push(message);
          },
          err() {},
        },
        transport: async () => {
          throw new Error('network down');
        },
      }),
    );

    expect(lines).toEqual([]);
  });
});

function stripAnsi(value: string): string {
  return value.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '');
}
