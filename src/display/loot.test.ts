import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { storageDepositAutoDockedFixture } from './generic.fixtures.ts';
import { renderStructuredResult } from './index.ts';
import {
  lootWreckAllCargoFixture,
  lootWreckAllEmptyFixture,
  lootWreckAllModulesFixture,
  lootWreckAllXpFixture,
} from './loot.fixtures.ts';
import { lootFormatters } from './loot.ts';

const options: GlobalOptions = {
  args: [],
  json: false,
  quiet: false,
  plain: true,
  allowUnknown: false,
  dryRun: false,
  noTimestamp: true,
  compact: false,
};

const context = {
  clock: {
    now() {
      return new Date('2026-06-19T00:00:00.000Z');
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

function renderLoot(command: string, result: Record<string, unknown>, extra: Partial<GlobalOptions> = {}) {
  return renderStructuredResult(command, structuredClone(result), { ...options, ...extra }, context);
}

function stdoutOf(command: string, result: Record<string, unknown>, extra: Partial<GlobalOptions> = {}): string {
  return renderLoot(command, result, extra).stdout.join('\n');
}

function detailsOf(fixture: Record<string, unknown>): Record<string, unknown> {
  return (fixture.details ?? {}) as Record<string, unknown>;
}

function withDetails(
  fixture: Record<string, unknown>,
  mutate: (details: Record<string, unknown>) => void,
): Record<string, unknown> {
  const copy = structuredClone(fixture);
  mutate(detailsOf(copy));
  return copy;
}

test('loot_wreck all-loot prints cargo stacks, wreck empty no, and the message', () => {
  const rendered = renderLoot('loot_wreck', lootWreckAllCargoFixture);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.stderr).toEqual([]);
  expect(stdout).toContain('=== Wreck Loot ===\nWreck empty: no');
  expect(stdout).toContain('=== Looted ===');
  expect(stdout).toContain('ore_iron');
  expect(stdout).toContain('adamant_tooth');
  expect(stdout).toContain('| 40');
  expect(stdout).toContain('| 2');
  expect(stdout).toMatch(/adamant_tooth\s+\|\s+2\s*\nLooted 2 cargo stacks\./);
  expect(stdout).not.toContain('=== Looted Modules ===');
  expect(stdout).not.toContain('=== Skipped ===');
  expect(stdout).not.toContain('Looted: 2 item(s)');
  expect(stdout).not.toContain('item(s)');
  expect(stdout).not.toContain('Action:');
  expect(stdout).not.toContain('=== Loot Wreck All ===');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('Skill XP:');
  expect(stdout).not.toContain('Unreadable');
});

test('loot_wreck all-loot prints modules taken and skipped modules with reason', () => {
  const stdout = stdoutOf('loot_wreck', lootWreckAllModulesFixture);

  expect(stdout).toContain('Wreck empty: no');
  expect(stdout).toContain('=== Looted ===');
  expect(stdout).toContain('ore_iron');
  expect(stdout).toContain('=== Looted Modules ===');
  expect(stdout).toContain('Name');
  expect(stdout).toContain('Type ID');
  expect(stdout).toContain('Adaptive Shield I');
  expect(stdout).toContain('adaptive_shield_i');
  expect(stdout).toContain('mod-shield-1');
  expect(stdout).toContain('=== Skipped ===');
  expect(stdout).toContain('Reason');
  expect(stdout).toContain('Pulse Laser');
  expect(stdout).toContain('pulse_laser_i');
  expect(stdout).toContain('mod-laser-9');
  expect(stdout).toContain('no_space');
  expect(stdout).toMatch(/no_space\s*\nSome modules did not fit\./);
  expect(stdout.indexOf('=== Looted ===')).toBeLessThan(stdout.indexOf('=== Looted Modules ==='));
  expect(stdout.indexOf('=== Looted Modules ===')).toBeLessThan(stdout.indexOf('=== Skipped ==='));
  expect(stdout.indexOf('=== Skipped ===')).toBeLessThan(stdout.indexOf('Some modules did not fit.'));
  expect(stdout).not.toContain('item(s)');
  expect(stdout).not.toContain('=== Response ===');
});

test('storage loot and flat storage_loot use the same all-loot tables', () => {
  const salvage = stdoutOf('loot_wreck', lootWreckAllModulesFixture);
  const grouped = stdoutOf('storage loot', lootWreckAllModulesFixture);
  const flat = stdoutOf('storage_loot', lootWreckAllModulesFixture);

  expect(grouped).toBe(salvage);
  expect(flat).toBe(salvage);
  expect(grouped).toContain('=== Wreck Loot ===');
  expect(grouped).not.toContain('=== Response ===');
});

test('empty all-loot arrays print (None) and omitted optional arrays print nothing', () => {
  const empty = stdoutOf('loot_wreck', lootWreckAllEmptyFixture);
  expect(empty).toContain('=== Wreck Loot ===\nWreck empty: yes');
  expect(empty).toContain('=== Looted ===\n(None)');
  expect(empty).toContain('=== Looted Modules ===\n(None)');
  expect(empty).toContain('=== Skipped ===\n(None)');
  expect(empty.split('(None)').length - 1).toBe(3);
  expect(empty).toMatch(/\(None\)\nThe wreck is empty\./);
  expect(empty).not.toContain('Looted: (not in response)');
  expect(empty).not.toContain('item(s)');

  const omitted = stdoutOf('loot_wreck', lootWreckAllCargoFixture);
  expect(omitted).not.toContain('=== Looted Modules ===');
  expect(omitted).not.toContain('=== Skipped ===');
  expect(omitted).not.toContain('(None)');
});

test('absent looted is a one-line miss and still prints wreck empty, modules, and message', () => {
  const stdout = stdoutOf(
    'loot_wreck',
    withDetails(lootWreckAllModulesFixture, (details) => {
      delete details.looted;
      delete details.skipped;
    }),
  );

  expect(stdout).toContain('Wreck empty: no\nLooted: (not in response)');
  expect(stdout).toContain('=== Looted Modules ===');
  expect(stdout).toContain('Adaptive Shield I');
  expect(stdout).not.toContain('=== Looted ===');
  expect(stdout).not.toContain('=== Skipped ===');
  expect(stdout).toContain('Some modules did not fit.');
  expect(stdout).not.toContain('=== Response ===');
});

test('all-loot prints Skill XP after the message and drops zero or empty maps', () => {
  const xp = stdoutOf('loot_wreck', lootWreckAllXpFixture);
  expect(xp).toContain('ore_iron');
  expect(xp).toContain('1,500');
  expect(xp).toContain('Wreck empty: no');
  expect(xp).toMatch(/Looted 1 cargo stack\.\nSkill XP: armor \+1,200/);
  expect(xp).not.toContain('scanning');
  expect(xp).not.toContain('=== Response ===');
  expect(xp).not.toContain('item(s)');

  const zeros = stdoutOf(
    'loot_wreck',
    withDetails(lootWreckAllXpFixture, (details) => {
      details.xp_gained = { armor: 0, scanning: 0 };
    }),
  );
  const emptyMap = stdoutOf(
    'loot_wreck',
    withDetails(lootWreckAllXpFixture, (details) => {
      details.xp_gained = {};
    }),
  );
  for (const stdout of [zeros, emptyMap]) {
    expect(stdout).toContain('=== Wreck Loot ===');
    expect(stdout).toContain('Looted 1 cargo stack.');
    expect(stdout).not.toContain('Skill XP:');
    expect(stdout).not.toContain('=== Response ===');
  }

  const scalarXp = stdoutOf(
    'loot_wreck',
    withDetails(lootWreckAllCargoFixture, (details) => {
      details.xp_gained = 8;
    }),
  );
  expect(scalarXp).toContain('=== Looted ===');
  expect(scalarXp).not.toContain('Skill XP:');
  expect(scalarXp).not.toContain('Xp Gained');
  expect(scalarXp).not.toContain('=== Response ===');
  expect(scalarXp).not.toContain('8');
});

test('all-loot Skill XP keeps skill order and signs negative values', () => {
  const stdout = stdoutOf(
    'loot_wreck',
    withDetails(lootWreckAllCargoFixture, (details) => {
      delete details.message;
      details.xp_gained = { scanning: 2, armor: -1200 };
    }),
  );

  expect(stdout).toContain('Skill XP: scanning +2, armor -1,200');
  expect(stdout).not.toContain('Message:');
  expect(stdout.indexOf('adamant_tooth')).toBeLessThan(stdout.indexOf('Skill XP:'));
});

test('all-loot blanks missing or non-numeric quantity cells and keeps partial rows', () => {
  const stdout = stdoutOf(
    'loot_wreck',
    withDetails(lootWreckAllCargoFixture, (details) => {
      details.looted = [
        { item_id: 'ore_iron' },
        { quantity: 0 },
        { item_id: 'string_qty', quantity: '40' },
        { item_id: 'object_qty', quantity: { n: 1 } },
        { item_id: 'nan_qty', quantity: Number.NaN },
        {},
      ];
      details.message = 'partial rows';
    }),
  );

  expect(stdout).toContain('ore_iron');
  expect(stdout).toMatch(/\|\s+0\s*$/m);
  expect(stdout).toContain('string_qty');
  expect(stdout).not.toContain('40');
  expect(stdout).toContain('object_qty');
  expect(stdout).toContain('nan_qty');
  expect(stdout).not.toContain('[object Object]');
  expect(stdout).not.toContain('NaN');
  expect(stdout).toContain('partial rows');
  expect(stdout).not.toContain('Unreadable');
  expect(stdout).not.toContain('=== Response ===');
});

test('all-loot formats bigint quantities and ignores non-record rows', () => {
  const stdout = stdoutOf(
    'loot_wreck',
    withDetails(lootWreckAllModulesFixture, (details) => {
      details.looted = [{ item_id: 'ore_iron', quantity: 1500n }, 'nope', null, 4];
      details.looted_modules = ['mod'];
      details.skipped = [{ name: 'Pulse Laser' }, false];
    }),
  );

  expect(stdout).toContain('1,500');
  expect(stdout).toContain('Unreadable Looted rows: 3');
  expect(stdout).toContain('=== Looted Modules ===\n(None)');
  expect(stdout).toContain('Unreadable Looted Modules rows: 1');
  expect(stdout).toContain('Pulse Laser');
  expect(stdout).toContain('Unreadable Skipped rows: 1');
  expect(stdout.indexOf('=== Looted ===')).toBeLessThan(stdout.indexOf('Unreadable Looted rows: 3'));
  expect(stdout.indexOf('Unreadable Looted rows: 3')).toBeLessThan(stdout.indexOf('=== Looted Modules ==='));
  expect(stdout).not.toContain('=== Response ===');
});

test('all-loot replaces carriage returns and newlines in table cells only', () => {
  const longReason = `no_${'space'.repeat(10)}`;
  const stdout = stdoutOf(
    'loot_wreck',
    withDetails(lootWreckAllModulesFixture, (details) => {
      details.looted = [{ item_id: 'ore\r\niron', quantity: 1 }];
      details.skipped = [
        {
          id: 'mod-laser-9',
          name: 'Pulse\nLaser',
          type: 'weapon',
          type_id: 'i'.repeat(48),
          reason: `line\r\n${longReason}`,
        },
      ];
      details.message = 'kept\nnewline';
    }),
  );

  expect(stdout).toContain('ore iron');
  expect(stdout).not.toContain('ore  iron');
  expect(stdout).not.toContain('ore\niron');
  expect(stdout).toContain('Pulse Laser');
  expect(stdout).toContain('i'.repeat(48));
  expect(stdout).toContain(`line ${longReason.slice(0, 40)}...`);
  expect(stdout).not.toContain(`line  ${longReason.slice(0, 10)}`);
  expect(stdout).toContain('kept\nnewline');
  expect(stdout).not.toContain('=== Response ===');
});

test('all-loot omits non-boolean wreck and dock flags and unknown keys', () => {
  const stdout = stdoutOf(
    'loot_wreck',
    withDetails(lootWreckAllCargoFixture, (details) => {
      delete details.wreck_empty;
      details.auto_docked = 'yes';
      details.auto_undocked = 0;
      details.message = '';
      details.hint = 'do-not-print-hint';
    }),
  );

  expect(stdout).toContain('=== Wreck Loot ===');
  expect(stdout).toContain('=== Looted ===');
  expect(stdout).not.toContain('Wreck empty:');
  expect(stdout).not.toContain('Auto-docked:');
  expect(stdout).not.toContain('Auto-undocked:');
  expect(stdout).not.toContain('do-not-print-hint');
  expect(stdout).not.toContain('Hint:');
  expect(stdout).not.toContain('Looted 2 cargo stacks.');
});

test('all-loot prints yes and no for dock flags without the cyan banner', () => {
  const stdout = stdoutOf('loot_wreck', {
    ...structuredClone(lootWreckAllCargoFixture),
    location: structuredClone(storageDepositAutoDockedFixture.location as Record<string, unknown>),
    ship: { fuel: 10, max_fuel: 40 },
    details: {
      ...structuredClone(lootWreckAllCargoFixture.details),
      auto_docked: true,
      auto_undocked: false,
    },
  });

  expect(stdout).toContain('Wreck empty: no\nAuto-docked: yes\nAuto-undocked: no');
  expect(stdout).toContain('Docked at: Earth Station (earth_station)');
  expect(stdout).not.toContain('[AUTO-DOCKED]');
  expect(stdout).not.toContain('[AUTO-UNDOCKED]');
  expect(stdout).not.toContain('Fuel Now');
  expect(stdout).not.toContain('Fuel Max');
  expect(stdout).not.toContain('solarian');
  expect(stdout.indexOf('Auto-undocked: no')).toBeLessThan(stdout.indexOf('=== Looted ==='));
  expect(stdout.indexOf('Looted 2 cargo stacks.')).toBeLessThan(stdout.indexOf('Docked at:'));
});

test('all-loot does not suppress an envelope auto-dock banner', () => {
  const stdout = stdoutOf('loot_wreck', {
    ...structuredClone(lootWreckAllCargoFixture),
    auto_docked: true,
  });

  expect(stdout).toContain('[AUTO-DOCKED]');
  expect(stdout).toContain('=== Wreck Loot ===');
  expect(stdout).not.toContain('Auto-docked:');
});

test('copied location and ship aliases stay off the all-loot block', () => {
  const stdout = stdoutOf('loot_wreck', {
    ...structuredClone(lootWreckAllCargoFixture),
    location: structuredClone(storageDepositAutoDockedFixture.location as Record<string, unknown>),
    ship: { fuel: 10, max_fuel: 40 },
  });

  expect(stdout).toContain('=== Wreck Loot ===');
  expect(stdout).not.toContain('Fuel Now');
  expect(stdout).not.toContain('earth_station');
  expect(stdout).not.toContain('Docked at:');
  expect(stdout).not.toContain('=== Response ===');
});

test('a non-array loot list declines before any wreck-loot heading', () => {
  const badLooted = stdoutOf(
    'loot_wreck',
    withDetails(lootWreckAllCargoFixture, (details) => {
      details.looted = { item_id: 'ore_iron', quantity: 1 };
    }),
  );
  expect(badLooted).not.toContain('=== Wreck Loot ===');
  expect(badLooted).toContain('=== Response ===');

  const badModules = stdoutOf(
    'loot_wreck',
    withDetails(lootWreckAllModulesFixture, (details) => {
      details.looted_modules = { id: 'mod-shield-1' };
    }),
  );
  expect(badModules).not.toContain('=== Wreck Loot ===');
  expect(badModules).toContain('=== Response ===');

  const stringLooted = stdoutOf(
    'loot_wreck',
    withDetails(lootWreckAllCargoFixture, (details) => {
      details.looted = 'not-an-array';
    }),
  );
  expect(stringLooted).not.toContain('=== Wreck Loot ===');
  expect(stringLooted).toContain('Looted: not-an-array');
});

test('all-loot tables are not a shape fallback for other commands', () => {
  const stdout = stdoutOf('storage_deposit', lootWreckAllCargoFixture);

  expect(stdout).not.toContain('=== Wreck Loot ===');
  expect(stdout).toContain('Looted: 2 item(s)');
});

test('single-item loot without xp stays on the scalar printer', () => {
  const item = {
    details: {
      action: 'loot_wreck',
      item_id: 'adamant_tooth',
      quantity: 4,
      wreck_empty: false,
    },
    ship: { fuel: 10, max_fuel: 40 },
  };
  expect(lootFormatters[0]?.(item.details, 'loot_wreck')).toBe(false);
  expect(lootFormatters[0]?.(item.details, 'storage loot')).toBe(false);
  const stdout = stdoutOf('loot_wreck', item);
  const grouped = stdoutOf('storage loot', item);

  expect(grouped).toBe(stdout);
  expect(stdout).toContain(
    '=== Loot Wreck ===\nAction: loot_wreck\nItem Id: adamant_tooth\nQuantity: 4\nWreck Empty: false\nFuel Now: 10\nFuel Max: 40',
  );
  expect(stdout).not.toContain('=== Wreck Loot ===');
  expect(stdout).not.toContain('Skill XP:');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('Wreck empty:');

  const bigQty = structuredClone(item) as { details: Record<string, unknown> };
  bigQty.details.quantity = 1500;
  const big = stdoutOf('loot_wreck', bigQty);
  expect(big).toContain('Quantity: 1500');
  expect(big).not.toContain('1,500');

  const moduleBody = {
    details: {
      action: 'loot_wreck',
      module_id: 'mod-shield-1',
      module_type_id: 'adaptive_shield_i',
      quantity: 1,
      wreck_empty: false,
    },
  };
  const moduleStdout = stdoutOf('loot_wreck', moduleBody);
  expect(stdoutOf('storage loot', moduleBody)).toBe(moduleStdout);
  expect(moduleStdout).toContain(
    '=== Loot Wreck ===\nAction: loot_wreck\nModule Id: mod-shield-1\nModule Type Id: adaptive_shield_i\nQuantity: 1\nWreck Empty: false',
  );
  expect(moduleStdout).not.toContain('=== Wreck Loot ===');
});

test('single-item xp prints Skill XP under the scalar lines for items and modules', () => {
  const item = {
    details: {
      action: 'loot_wreck',
      item_id: 'adamant_tooth',
      quantity: 4,
      wreck_empty: false,
      xp_gained: { armor: 1 },
    },
    ship: { fuel: 10, max_fuel: 40 },
    location: structuredClone(storageDepositAutoDockedFixture.location as Record<string, unknown>),
    player: { username: 'should-not-print' },
  };
  expect(lootFormatters[0]?.(item, 'loot_wreck')).toBe(false);

  const salvage = stdoutOf('loot_wreck', item);
  const grouped = stdoutOf('storage loot', item);
  expect(grouped).toBe(salvage);
  expect(salvage).toContain(
    '=== Loot Wreck ===\nAction: loot_wreck\nItem Id: adamant_tooth\nQuantity: 4\nWreck Empty: false\nFuel Now: 10\nFuel Max: 40\nSkill XP: armor +1',
  );
  expect(salvage.split('=== Loot Wreck ===').length - 1).toBe(1);
  expect(salvage).not.toContain('\nOK');
  expect(salvage).not.toContain('=== Wreck Loot ===');
  expect(salvage).not.toContain('=== Response ===');
  expect(salvage).not.toContain('Wreck empty:');
  expect(salvage).not.toContain('1,500');
  expect(salvage).not.toContain('System Id:');
  expect(salvage).not.toContain('Online Players');
  expect(salvage).not.toContain('earth_station');
  expect(salvage).not.toContain('solarian');
  expect(salvage).not.toContain('should-not-print');
  expect(salvage).not.toContain('Xp Gained:');

  const bigQty = structuredClone(item) as { details: Record<string, unknown> };
  bigQty.details.quantity = 1500;
  const big = stdoutOf('loot_wreck', bigQty);
  expect(big).toContain('Quantity: 1500\nWreck Empty: false\nFuel Now: 10\nFuel Max: 40\nSkill XP: armor +1');
  expect(big).not.toContain('1,500');

  const signed = stdoutOf('loot_wreck', {
    details: {
      action: 'loot_wreck',
      item_id: 'adamant_tooth',
      quantity: 4,
      wreck_empty: false,
      message: 'took the tooth',
      tags: ['rare', 'quest'],
      xp_gained: { scanning: 2, armor: -1200 },
    },
  });
  expect(signed).toContain(
    '=== Loot Wreck ===\nAction: loot_wreck\nItem Id: adamant_tooth\nQuantity: 4\nWreck Empty: false\nMessage: took the tooth\nTags: 2 item(s)\nSkill XP: scanning +2, armor -1,200',
  );
  expect(signed).not.toContain('\nOK');
  expect(signed).not.toContain('=== Response ===');

  const moduleBody = {
    details: {
      action: 'loot_wreck',
      module_id: 'mod-shield-1',
      module_type_id: 'adaptive_shield_i',
      quantity: 1,
      wreck_empty: false,
      xp_gained: { armor: 1200, scanning: 0 },
    },
  };
  const moduleStdout = stdoutOf('loot_wreck', moduleBody);
  expect(stdoutOf('storage loot', moduleBody)).toBe(moduleStdout);
  expect(moduleStdout).toContain(
    '=== Loot Wreck ===\nAction: loot_wreck\nModule Id: mod-shield-1\nModule Type Id: adaptive_shield_i\nQuantity: 1\nWreck Empty: false\nSkill XP: armor +1,200',
  );
  expect(moduleStdout).not.toContain('scanning');
  expect(moduleStdout).not.toContain('=== Wreck Loot ===');
  expect(moduleStdout).not.toContain('=== Response ===');
  expect(moduleStdout).not.toContain('Wreck empty:');

  for (const body of [item, moduleBody]) {
    const json = stdoutOf('loot_wreck', body, { format: 'json' });
    expect(JSON.parse(json)).toEqual(body);
    expect(json).not.toContain('Skill XP:');
    expect(json).not.toContain('=== Loot Wreck ===');
  }
});

test('empty and zero xp maps claim single-item scalar lines without Skill XP', () => {
  const base = {
    action: 'loot_wreck',
    item_id: 'adamant_tooth',
    quantity: 4,
    wreck_empty: false,
  };
  const emptyMap = stdoutOf('loot_wreck', { details: { ...base, xp_gained: {} } });
  const zeros = stdoutOf('storage loot', { details: { ...base, xp_gained: { armor: 0 } } });
  const wreckTrue = stdoutOf('loot_wreck', {
    details: { ...base, wreck_empty: true, xp_gained: { armor: 0, scanning: 0 } },
  });

  for (const stdout of [emptyMap, zeros]) {
    expect(stdout).toContain(
      '=== Loot Wreck ===\nAction: loot_wreck\nItem Id: adamant_tooth\nQuantity: 4\nWreck Empty: false',
    );
    expect(stdout).not.toContain('Skill XP:');
    expect(stdout).not.toContain('=== Response ===');
    expect(stdout).not.toContain('=== Wreck Loot ===');
    expect(stdout).not.toContain('Xp Gained:');
  }
  expect(wreckTrue).toContain('Wreck Empty: true');
  expect(wreckTrue).not.toContain('Wreck empty:');
  expect(wreckTrue).not.toContain('Skill XP:');
  expect(wreckTrue).not.toContain('=== Response ===');

  const onlyAction = stdoutOf('loot_wreck', {
    details: { action: 'loot_wreck', item_id: '', quantity: null, xp_gained: { armor: 1 } },
  });
  expect(onlyAction).toContain('=== Loot Wreck ===\nAction: loot_wreck\nOK\nSkill XP: armor +1');
  expect(onlyAction).not.toContain('Item Id:');
  expect(onlyAction).not.toContain('Quantity:');
  expect(onlyAction).not.toContain('=== Response ===');

  const onlyActionEmpty = stdoutOf('storage loot', {
    details: { action: 'loot_wreck', xp_gained: {} },
  });
  expect(onlyActionEmpty).toContain('=== Loot Wreck ===\nAction: loot_wreck\nOK');
  expect(onlyActionEmpty).not.toContain('Skill XP:');
  expect(onlyActionEmpty).not.toContain('=== Response ===');
});

test('number and array xp_gained stay on the shared scalar printer', () => {
  const base = {
    action: 'loot_wreck',
    item_id: 'adamant_tooth',
    quantity: 4,
    wreck_empty: false,
  };
  expect(lootFormatters[0]?.({ ...base, xp_gained: 8 }, 'loot_wreck')).toBe(false);
  expect(lootFormatters[0]?.({ ...base, xp_gained: [8, 9] }, 'storage loot')).toBe(false);

  const numberXp = stdoutOf('loot_wreck', { details: { ...base, xp_gained: 8 } });
  expect(numberXp).toContain(
    '=== Loot Wreck ===\nAction: loot_wreck\nItem Id: adamant_tooth\nQuantity: 4\nWreck Empty: false\nXp Gained: 8',
  );
  expect(numberXp).not.toContain('Skill XP:');
  expect(numberXp).not.toContain('=== Response ===');
  expect(numberXp).not.toContain('=== Wreck Loot ===');

  const arrayXp = stdoutOf('storage loot', { details: { ...base, xp_gained: [8, 9] } });
  expect(arrayXp).toContain('Xp Gained: 2 item(s)');
  expect(arrayXp).toContain('Quantity: 4');
  expect(arrayXp).toContain('Wreck Empty: false');
  expect(arrayXp).not.toContain('Skill XP:');
  expect(arrayXp).not.toContain('=== Response ===');
});

test('single-item xp declines non-scalars and overlong bodies before any heading', () => {
  const nested = {
    action: 'loot_wreck',
    item_id: 'adamant_tooth',
    quantity: 4,
    wreck_empty: false,
    note: { text: 'hidden' },
    xp_gained: { armor: 1 },
  };
  expect(lootFormatters[0]?.(nested, 'loot_wreck')).toBe(false);
  const nestedStdout = stdoutOf('loot_wreck', { details: nested });
  expect(nestedStdout).toContain('=== Response ===');
  expect(nestedStdout).not.toContain('=== Loot Wreck ===');
  expect(nestedStdout).not.toContain('Item Id:');
  expect(nestedStdout).not.toContain('Skill XP:');

  const overlong: Record<string, unknown> = {
    action: 'loot_wreck',
    item_id: 'adamant_tooth',
    quantity: 4,
    wreck_empty: false,
    xp_gained: { armor: 1 },
  };
  for (let index = 1; index <= 13; index += 1) overlong[`extra_${index}`] = index;
  expect(lootFormatters[0]?.(overlong, 'loot_wreck')).toBe(false);
  const overlongStdout = stdoutOf('storage loot', { details: overlong });
  expect(overlongStdout).toContain('=== Response ===');
  expect(overlongStdout).not.toContain('=== Loot Wreck ===');
  expect(overlongStdout).not.toContain('Extra 1:');
  expect(overlongStdout).not.toContain('Skill XP:');

  const atCap: Record<string, unknown> = {
    action: 'loot_wreck',
    item_id: 'adamant_tooth',
    quantity: 4,
    wreck_empty: false,
    xp_gained: { armor: 1 },
  };
  for (let index = 1; index <= 12; index += 1) atCap[`extra_${index}`] = index;
  const atCapStdout = stdoutOf('loot_wreck', { details: atCap });
  expect(atCapStdout).toContain('=== Loot Wreck ===');
  expect(atCapStdout).toContain('Extra 12: 12');
  expect(atCapStdout).toContain('Skill XP: armor +1');
  expect(atCapStdout).not.toContain('=== Response ===');
  expect(atCapStdout.indexOf('Extra 12: 12')).toBeLessThan(atCapStdout.indexOf('Skill XP:'));
});

test('storage_deposit with an xp object still falls through to the raw response', () => {
  const stdout = stdoutOf('storage_deposit', {
    details: {
      action: 'deposit_items',
      item_id: 'ore_iron',
      quantity: 4,
      xp_gained: { armor: 1 },
    },
    missions: {
      active: [
        {
          mission_id: 'mission-delivery-partial',
          title: 'Food Delivery',
          objectives: [
            {
              description: 'Deliver Food Rations',
              current: 2,
              required: 5,
              in_cargo: 0,
              in_storage: 5,
            },
          ],
        },
      ],
      max_missions: 5,
    },
  });

  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('=== Loot Wreck ===');
  expect(stdout).not.toContain('=== Deposit Items ===');
  expect(stdout).not.toContain('Skill XP:');
  expect(stdout.split('=== Active Missions ===').length - 1).toBe(0);
});

test('single-item loot without xp prints Active Missions when envelope missions is present', () => {
  const item = {
    details: {
      action: 'loot_wreck',
      item_id: 'adamant_tooth',
      quantity: 4,
      wreck_empty: false,
    },
    missions: {
      active: [
        {
          mission_id: 'mission-delivery-partial',
          title: 'Food Delivery',
          type: 'delivery',
          objectives: [
            {
              description: 'Deliver Food Rations',
              current: 2,
              required: 5,
              in_cargo: 0,
              in_storage: 5,
            },
          ],
          rewards: {},
        },
      ],
      max_missions: 5,
    },
  };
  expect(lootFormatters[0]?.(item.details, 'loot_wreck')).toBe(false);
  expect(lootFormatters[0]?.(item.details, 'storage loot')).toBe(false);

  const stdout = stdoutOf('loot_wreck', item);
  const grouped = stdoutOf('storage loot', item);

  expect(grouped).toBe(stdout);
  expect(stdout).toContain('=== Loot Wreck ===');
  expect(stdout).toContain('Item Id: adamant_tooth');
  expect(stdout).not.toContain('=== Wreck Loot ===');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout.split('=== Active Missions ===').length - 1).toBe(1);
  expect(stdout).toContain('Deliver Food Rations 2/5 cargo:0 storage:5');
  expect(stdout.indexOf('=== Loot Wreck ===')).toBeLessThan(stdout.indexOf('=== Active Missions ==='));
});

test('loot_wreck_all prints one Active Missions table after the wreck loot heading', () => {
  const missions = {
    active: [
      {
        mission_id: 'mission-delivery-partial',
        title: 'Food Delivery',
        type: 'delivery',
        objectives: [
          {
            description: 'Deliver Food Rations',
            current: 2,
            required: 5,
            in_cargo: 0,
            in_storage: 5,
          },
        ],
        rewards: {},
      },
    ],
    max_missions: 5,
  };
  const body = { ...lootWreckAllCargoFixture, missions };
  const salvage = stdoutOf('loot_wreck', body);
  const grouped = stdoutOf('storage loot', body);

  expect(grouped).toBe(salvage);
  expect(salvage).toContain('=== Wreck Loot ===');
  expect(salvage).not.toContain('=== Loot Wreck ===');
  expect(salvage.split('=== Active Missions ===').length - 1).toBe(1);
  expect(salvage).toContain('Deliver Food Rations 2/5 cargo:0 storage:5');
  expect(salvage.indexOf('=== Wreck Loot ===')).toBeLessThan(salvage.indexOf('=== Active Missions ==='));
  expect(salvage).not.toContain('=== Response ===');
});

test('json, yaml, structured, compact, and text modes keep or use the human tables', () => {
  const body = lootWreckAllCargoFixture;
  const json = stdoutOf('loot_wreck', body, { format: 'json' });
  expect(JSON.parse(json)).toEqual(body);
  expect(json).not.toContain('=== Wreck Loot ===');

  const structured = stdoutOf('storage loot', body, { structured: true });
  expect(JSON.parse(structured)).toEqual(body);

  const yaml = stdoutOf('loot_wreck', body, { format: 'yaml' });
  expect(yaml).toContain('loot_wreck_all');
  expect(yaml).not.toContain('=== Wreck Loot ===');

  const compact = stdoutOf('loot_wreck', body, { compact: true });
  expect(compact).toContain('"action":"loot_wreck_all"');
  expect(compact).not.toContain('=== Wreck Loot ===');

  const text = stdoutOf('loot_wreck', body, { format: 'text' });
  expect(text).toContain('=== Wreck Loot ===');
  expect(text).toContain('ore_iron');
  expect(text).not.toContain('=== Response ===');
});
