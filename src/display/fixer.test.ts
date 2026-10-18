import { describe, expect, test } from 'bun:test';
import { emitFixerAccount, selectFixerDebt } from './fixer.ts';
import { withDisplayRenderBuffer } from './helpers.ts';

const exampleAccount = {
  debt: 2000,
  allowance: 5000,
  exposure: 3000,
  available: 2000,
};

function renderAccount(value: unknown, leadingBlank = false): { printed: boolean; stdout: string } {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  const printed = withDisplayRenderBuffer(buffer, () => emitFixerAccount(value, leadingBlank), { plain: true });
  return { printed, stdout: buffer.stdout.join('\n') };
}

describe('emitFixerAccount', () => {
  test('prints the four example integers grouped, including an explicit zero debt', () => {
    const full = renderAccount(exampleAccount);
    expect(full.printed).toBe(true);
    expect(full.stdout).toBe(
      ['Fixer:', '  Debt: 2,000', '  Allowance: 5,000', '  Exposure: 3,000', '  Available: 2,000'].join('\n'),
    );

    const zeroDebt = renderAccount({ debt: 0, allowance: 5000, exposure: 800, available: 4200 });
    expect(zeroDebt.printed).toBe(true);
    expect(zeroDebt.stdout).toContain('Debt: 0');
    expect(zeroDebt.stdout).toContain('Exposure: 800');
  });

  test('skips omitted keys and still prints a lone explicit zero', () => {
    const partial = renderAccount({ debt: 0, exposure: 800 });
    expect(partial.stdout).toBe(['Fixer:', '  Debt: 0', '  Exposure: 800'].join('\n'));
    expect(partial.stdout).not.toContain('Allowance');
    expect(partial.stdout).not.toContain('Available');
  });

  test('prints a finite float and a negative integer as sent', () => {
    const floated = renderAccount({ debt: 2000.5 });
    expect(floated.stdout).toContain('Debt: 2,000.5');
    const negative = renderAccount({ debt: -200 });
    expect(negative.stdout).toContain('Debt: -200');
  });

  test('prints nothing for a missing object, an empty object, null, or numeric strings', () => {
    for (const value of [
      undefined,
      {},
      null,
      { debt: '2000', allowance: '5000', exposure: '3000', available: '2000' },
    ]) {
      const rendered = renderAccount(value);
      expect(rendered.printed).toBe(false);
      expect(rendered.stdout).toBe('');
    }
  });

  test('leading blank is emitted only when the account prints', () => {
    const printed = renderAccount(exampleAccount, true);
    expect(printed.printed).toBe(true);
    expect(printed.stdout.startsWith('\nFixer:')).toBe(true);
    expect(printed.stdout).toContain('Debt: 2,000');

    const empty = renderAccount({ debt: '2000' }, true);
    expect(empty.printed).toBe(false);
    expect(empty.stdout).toBe('');
  });

  test('ignores extra keys', () => {
    const rendered = renderAccount({
      ...exampleAccount,
      location: 'earth_station',
      fixer_deliveries: 12,
      base_id: 'earth_station',
    });
    expect(rendered.stdout).toBe(
      ['Fixer:', '  Debt: 2,000', '  Allowance: 5,000', '  Exposure: 3,000', '  Available: 2,000'].join('\n'),
    );
    expect(rendered.stdout).not.toContain('location');
    expect(rendered.stdout).not.toContain('earth_station');
    expect(rendered.stdout).not.toContain('fixer_deliveries');
    expect(rendered.stdout).not.toContain('12');
  });
});

describe('selectFixerDebt', () => {
  test('returns undefined for buy even when player.fixer_debt is set', () => {
    expect(selectFixerDebt({ player: { fixer_debt: 2000 } }, 'buy')).toBeUndefined();
    expect(selectFixerDebt({ player: { fixer_debt: 2000 } }, undefined)).toBeUndefined();
    expect(
      selectFixerDebt({ player: { fixer_debt: 2000 }, missions: { fixer: { debt: 5 } } }, 'storage_deposit'),
    ).toBeUndefined();
  });

  test('prefers player.fixer_debt for status commands, including zero, and does not fall through on a string', () => {
    const missions = { fixer: { debt: 2000 } };
    for (const command of ['get_status', 'get_state', 'get_player'] as const) {
      expect(selectFixerDebt({ player: { fixer_debt: 2000 }, missions }, command)).toBe(2000);
      expect(selectFixerDebt({ player: { fixer_debt: 0 }, missions }, command)).toBe(0);
      expect(selectFixerDebt({ player: { fixer_debt: 0n }, missions }, command)).toBe(0n);
      expect(selectFixerDebt({ player: { fixer_debt: '2000' }, missions }, command)).toBeUndefined();
      expect(selectFixerDebt({ player: { fixer_debt: null }, missions }, command)).toBeUndefined();
      expect(selectFixerDebt({ player: { fixer_debt: Number.NaN }, missions }, command)).toBeUndefined();
    }
  });

  test('falls through to missions.fixer.debt and returns zero so the caller can hide it', () => {
    expect(selectFixerDebt({ missions: { fixer: { debt: 2000 } } }, 'get_status')).toBe(2000);
    expect(selectFixerDebt({ player: { username: 'Marlowe' }, missions: { fixer: { debt: 1500 } } }, 'get_state')).toBe(
      1500,
    );
    expect(selectFixerDebt({ missions: { fixer: { debt: 0 } } }, 'get_player')).toBe(0);
    expect(selectFixerDebt({ missions: { fixer: { debt: 2000n } } }, 'get_player')).toBe(2000n);
    expect(selectFixerDebt({ missions: { fixer: { debt: '2000' } } }, 'get_status')).toBeUndefined();
    expect(selectFixerDebt({ missions: { fixer: null } }, 'get_status')).toBeUndefined();
    expect(selectFixerDebt({ missions: { active: [] } }, 'get_player')).toBeUndefined();
    expect(selectFixerDebt({ player: 'Marlowe', missions: { fixer: { debt: 40 } } }, 'get_status')).toBe(40);
    expect(selectFixerDebt({}, 'get_state')).toBeUndefined();
  });
});
