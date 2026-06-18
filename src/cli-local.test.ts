import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CliEnv, CliRuntimeContext } from './cli-context';
import { runInvocation } from './main';
import { setActiveProfile } from './session';

function fakeContext(stdout: string[], stderr: string[], env: CliEnv = process.env): CliRuntimeContext {
  return {
    env: { ...process.env, SPACEMOLT_NO_UPDATE_CHECK: 'true', ...env },
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
    clock: {
      now() {
        return new Date('2026-01-01T00:00:00.000Z');
      },
    },
    sleep() {
      return Promise.resolve();
    },
  };
}

async function runDirect(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runInvocation(args, undefined, fakeContext(stdout, stderr, env));
  return {
    stdout: stdout.join('\n'),
    stderr: stderr.join('\n'),
    exitCode,
  };
}

function runClient(
  args: string[],
  env: Record<string, string> = {},
): { stdout: string; stderr: string; exitCode: number | null } {
  const result = Bun.spawnSync({
    cmd: [process.execPath, 'run', 'src/client.ts', ...args],
    cwd: path.join(import.meta.dir, '..'),
    env: { ...process.env, ...env, SPACEMOLT_NO_UPDATE_CHECK: 'true' },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  return {
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
    exitCode: result.exitCode,
  };
}

function stripAnsi(value: string): string {
  return value.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '');
}

afterEach(() => {
  setActiveProfile(undefined);
});

describe('CLI local usability behavior', () => {
  test('unknown command fails locally with a suggestion', async () => {
    const result = await runDirect(['trvel', 'sol_earth']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown command "trvel"');
    expect(result.stderr).toContain('Did you mean: travel');
    expect(result.stderr).not.toContain('Connection Error');
  });

  test('missing required argument shows usage and next discovery command', async () => {
    const result = await runDirect(['travel']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing required argument');
    expect(result.stderr).toContain('Usage:');
    expect(result.stderr).toContain('spacemolt travel <poi_id_or_cached_name>');
    expect(result.stderr).toContain('spacemolt get_system');
  });

  test('--help command renders local command help without network', async () => {
    const result = await runDirect(['--help', 'travel']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('travel');
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('spacemolt travel earth');
    expect(result.stderr).not.toContain('Connection Error');
  });

  test('help group renders once', async () => {
    const result = await runDirect(['help', 'combat']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.match(/Combat \/ Battle Commands/g) ?? []).toHaveLength(1);
  });

  test('--json unknown command keeps compatible error shape', async () => {
    const result = await runDirect(['--json', 'trvel']);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toEqual({ error: { code: 'unknown_command', message: 'Unknown command: trvel' } });
  });

  test('unknown command fields fail locally with a suggestion', async () => {
    const result = await runDirect(['sell', 'ore_iron', 'quanity=50']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown field "quanity" for "sell"');
    expect(result.stderr).toContain('Did you mean "quantity"?');
    expect(result.stderr).toContain('--allow-unknown');
    expect(result.stderr).not.toContain('Connection Error');
  });

  test('--raw allows unknown command fields through', async () => {
    const result = await runDirect(['--raw', '--dry-run', 'sell', 'ore_iron', '50', 'experimental_mode=true']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"experimental_mode": true');
  });

  test('storage direct transfer source is accepted without raw mode', async () => {
    const deposit = await runDirect([
      '--dry-run',
      'storage',
      'deposit',
      'ore_iron',
      '1',
      'source=faction',
      'target=self',
    ]);
    expect(deposit.exitCode).toBe(0);
    expect(deposit.stdout).toContain('"url": "https://game.spacemolt.com/api/v2/spacemolt_storage/deposit"');
    expect(deposit.stdout).toContain('"action": "deposit"');
    expect(deposit.stdout).toContain('"source": "faction"');
    expect(deposit.stdout).toContain('"target": "self"');

    const withdraw = await runDirect([
      '--dry-run',
      'storage',
      'withdraw',
      'ore_iron',
      '1',
      'source=faction',
      'target=self',
    ]);
    expect(withdraw.exitCode).toBe(0);
    expect(withdraw.stdout).toContain('"url": "https://game.spacemolt.com/api/v2/spacemolt_storage/withdraw"');
    expect(withdraw.stdout).toContain('"action": "withdraw"');
    expect(withdraw.stdout).toContain('"source": "faction"');
    expect(withdraw.stdout).toContain('"target": "self"');
  });

  test('storage view routes through storage view and strips client-only filters', async () => {
    const result = await runDirect([
      '--dry-run',
      'storage',
      'view',
      'nexus_base',
      '--item',
      'iron_ore',
      '--items',
      'iron_ore,fuel_cell',
      '--search',
      'iron',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"command": "storage"');
    expect(result.stdout).toContain('"url": "https://game.spacemolt.com/api/v2/spacemolt_storage/view"');
    expect(result.stdout).toContain('"action": "view"');
    expect(result.stdout).toContain('"station_id": "nexus_base"');
    expect(result.stdout).toContain('"target": "self"');
    expect(result.stdout).not.toContain('"item_id"');
    expect(result.stdout).not.toContain('"items"');
    expect(result.stdout).not.toContain('"search"');

    const faction = await runDirect(['--dry-run', 'storage', 'view', 'nexus_base', 'target=faction']);
    expect(faction.exitCode).toBe(0);
    expect(faction.stdout).toContain('"target": "faction"');
  });

  test('storage dry-run routes positional and action forms for all storage actions', async () => {
    const cases: Array<{ args: string[]; action: string }> = [
      { args: ['storage', 'view', 'nexus_base'], action: 'view' },
      { args: ['storage', 'action=view', 'nexus_base'], action: 'view' },
      { args: ['storage', 'deposit', 'ore_iron', '2'], action: 'deposit' },
      { args: ['storage', 'action=deposit', 'ore_iron', '2'], action: 'deposit' },
      { args: ['storage', 'withdraw', 'ore_iron', '2'], action: 'withdraw' },
      { args: ['storage', 'action=withdraw', 'ore_iron', '2'], action: 'withdraw' },
      { args: ['storage', 'loot', 'wreck_1', 'ore_iron', '2'], action: 'loot' },
      { args: ['storage', 'action=loot', 'wreck_1', 'ore_iron', '2'], action: 'loot' },
      { args: ['storage', 'jettison', 'ore_iron', '2'], action: 'jettison' },
      { args: ['storage', 'action=jettison', 'ore_iron', '2'], action: 'jettison' },
    ];

    for (const testCase of cases) {
      const result = await runDirect(['--dry-run', ...testCase.args]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(
        `"url": "https://game.spacemolt.com/api/v2/spacemolt_storage/${testCase.action}"`,
      );
      expect(result.stdout).toContain(`"action": "${testCase.action}"`);
    }
  });

  test('patch-note storage fuel deposit command is accepted without raw mode', async () => {
    const result = await runDirect([
      '--dry-run',
      'storage',
      'action=deposit',
      'target=faction',
      'item_id=fuel',
      'quantity=25',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"command": "storage"');
    expect(result.stdout).toContain('"url": "https://game.spacemolt.com/api/v2/spacemolt_storage/deposit"');
    expect(result.stdout).toContain('"action": "deposit"');
    expect(result.stdout).toContain('"target": "faction"');
    expect(result.stdout).toContain('"item_id": "fuel"');
    expect(result.stdout).toContain('"quantity": 25');
  });

  test('storage bulk items array is accepted without raw mode', async () => {
    const result = await runDirect([
      '--dry-run',
      'storage',
      'action=deposit',
      'target=faction',
      '--payload-json',
      '{"items":[{"item_id":"ore_iron","quantity":1},{"item_id":"ore_copper","quantity":2}]}',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"command": "storage"');
    expect(result.stdout).toContain('"url": "https://game.spacemolt.com/api/v2/spacemolt_storage/deposit"');
    expect(result.stdout).toContain('"target": "faction"');
    expect(result.stdout).toContain('"items": [');
    expect(result.stdout).toContain('"item_id": "ore_iron"');
    expect(result.stdout).toContain('"quantity": 1');
    expect(result.stdout).toContain('"item_id": "ore_copper"');
    expect(result.stdout).toContain('"quantity": 2');
  });

  test('patch-note storage loot command routes through storage loot', async () => {
    const result = await runDirect([
      '--dry-run',
      'storage',
      'action=loot',
      'wreck_id=wreck_1',
      'item_id=ore_iron',
      'quantity=2',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"command": "storage"');
    expect(result.stdout).toContain('"url": "https://game.spacemolt.com/api/v2/spacemolt_storage/loot"');
    expect(result.stdout).toContain('"action": "loot"');
    expect(result.stdout).toContain('"wreck_id": "wreck_1"');
    expect(result.stdout).toContain('"item_id": "ore_iron"');
    expect(result.stdout).toContain('"quantity": 2');
  });

  test('patch-note storage loot accepts towing default without wreck_id', async () => {
    const result = await runDirect(['--dry-run', 'storage', 'action=loot']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"url": "https://game.spacemolt.com/api/v2/spacemolt_storage/loot"');
    expect(result.stdout).toContain('"action": "loot"');
    expect(result.stdout).not.toContain('"wreck_id"');
  });

  test('patch-note storage jettison command routes through storage jettison', async () => {
    const result = await runDirect(['--dry-run', 'storage', 'action=jettison', 'item_id=ore_iron', 'quantity=2']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"command": "storage"');
    expect(result.stdout).toContain('"url": "https://game.spacemolt.com/api/v2/spacemolt_storage/jettison"');
    expect(result.stdout).toContain('"action": "jettison"');
    expect(result.stdout).toContain('"item_id": "ore_iron"');
    expect(result.stdout).toContain('"quantity": 2');
  });

  test('patch-note set_drone_name command maps to drone rename route', async () => {
    const result = await runDirect(['--dry-run', 'set_drone_name', 'drone_1', 'Miner-1']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"command": "set_drone_name"');
    expect(result.stdout).toContain('"url": "https://game.spacemolt.com/api/v2/spacemolt_drone/name"');
    expect(result.stdout).toContain('"id": "drone_1"');
    expect(result.stdout).toContain('"text": "Miner-1"');
  });

  test('profile list reads saved profile session names without secrets', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-profile-test-'));
    const originalHome = process.env.HOME;
    const sessionDir = path.join(home, '.config', 'spacemolt-cli', 'sessions');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(home, '.config', 'spacemolt-cli', 'config.json'), '{"defaultProfile":"marlowe"}\n');
    fs.writeFileSync(
      path.join(sessionDir, 'marlowe.json'),
      `${JSON.stringify({
        id: 'sess_marlowe',
        username: 'Marlowe',
        password: 'REDACTED',
        player_id: 'player_marlowe',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      })}\n`,
    );
    fs.writeFileSync(
      path.join(sessionDir, 'rescue.json'),
      `${JSON.stringify({
        id: 'sess_rescue',
        username: 'FuelRescue',
        password: 'secret',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      })}\n`,
    );
    fs.writeFileSync(path.join(sessionDir, 'marlowe_state.json'), '{"lastCommand":"status"}\n');
    fs.writeFileSync(path.join(sessionDir, 'marlowe.ids.json'), '{"sol_earth":"Earth"}\n');
    try {
      process.env.HOME = home;
      const result = await runDirect(['profile', 'list'], { HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') });
      expect(result.exitCode).toBe(0);
      expect(stripAnsi(result.stdout).split('\n')).toEqual(['Profiles', '* marlowe', '  rescue']);
      expect(result.stdout).not.toContain('REDACTED');
      expect(result.stdout).not.toContain('secret');
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
    }
  });

  test('profile default prints and changes the saved default profile', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-profile-default-test-'));
    try {
      const configDir = path.join(home, '.config', 'spacemolt-cli');
      fs.mkdirSync(path.join(configDir, 'sessions'), { recursive: true });
      fs.writeFileSync(path.join(configDir, 'sessions', 'marlowe.json'), '{}\n');
      fs.writeFileSync(path.join(configDir, 'sessions', 'pilot.json'), '{}\n');
      fs.writeFileSync(path.join(configDir, 'config.json'), '{"defaultProfile":"marlowe"}\n');

      const testEnv = { HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') };
      const show = await runDirect(['profile', 'default'], testEnv);
      expect(show.exitCode).toBe(0);
      expect(show.stdout).toContain('Default profile: marlowe');

      const set = await runDirect(['profile', 'default', 'pilot'], testEnv);
      expect(set.exitCode).toBe(0);
      expect(set.stdout).toContain('Default profile: pilot');
      expect(JSON.parse(fs.readFileSync(path.join(configDir, 'config.json'), 'utf-8'))).toEqual({
        defaultProfile: 'pilot',
      });
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test('--profile validates path-safe profile names before network work', async () => {
    const result = await runDirect(['--profile', '../bad', 'get_status']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Profile names may only contain');
  });
});

describe('CLI output modes', () => {
  test('--quiet suppresses notification-like output in help', async () => {
    const normal = await runDirect(['--help', 'travel']);
    const quiet = await runDirect(['--quiet', '--help', 'travel']);
    expect(normal.exitCode).toBe(0);
    expect(quiet.exitCode).toBe(0);
    expect(normal.stdout).toContain('travel');
    expect(quiet.stdout).toContain('travel');
  });

  test('--plain removes ANSI codes from error output', async () => {
    const resultPlain = await runDirect(['--plain', 'travel']);
    const resultColor = await runDirect(['travel']);
    expect(resultPlain.exitCode).toBe(1);
    expect(resultColor.exitCode).toBe(1);
    const hasAnsi = resultPlain.stderr.split('').some((char, i, arr) => {
      return char.charCodeAt(0) === 27 && arr[i + 1] === '[';
    });
    expect(hasAnsi).toBe(false);
  });

  test('--plain removes ANSI codes from --quiet error output', async () => {
    const result = await runDirect(['--quiet', '--plain', 'travel']);
    expect(result.exitCode).toBe(1);
    const hasAnsi = result.stderr.split('').some((char, i, arr) => {
      return char.charCodeAt(0) === 27 && arr[i + 1] === '[';
    });
    expect(hasAnsi).toBe(false);
  });

  test('--fields requires a value', async () => {
    const result = await runDirect(['--fields']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--fields requires a value');
  });

  test('--fields=value syntax works', async () => {
    const result = await runDirect(['--fields=player.name', '--help', 'travel']);
    expect(result.exitCode).toBe(0);
  });

  test('-f=value shorthand works', async () => {
    const result = await runDirect(['-f=ship.fuel', '--help', 'travel']);
    expect(result.exitCode).toBe(0);
  });
});

describe('CLI executable smoke', () => {
  test('client module exits nonzero for local command errors', () => {
    const result = runClient(['trvel', 'sol_earth']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown command "trvel"');
  });
});
