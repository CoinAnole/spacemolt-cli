import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { renderStructuredResult } from './index.ts';
import { attackBrandedFixture } from './status.fixtures.ts';

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
      return new Date('2026-10-12T00:00:00.000Z');
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

const warning = attackBrandedFixture.details.warning;

const playerReply = {
  action: 'attack',
  kind: 'player',
  target: 'player-1',
  battle_id: 'btl-1',
  system: 'sol',
  your_side: 1,
  your_zone: 'approach',
  message: 'You open fire.',
};

function renderCombat(command: string, result: Record<string, unknown>, extra: Partial<GlobalOptions> = {}): string {
  return renderStructuredResult(command, structuredClone(result), { ...options, ...extra }, context).stdout.join('\n');
}

test('attack envelope with nearby players prints the warning instead of an arrival', () => {
  const stdout = renderCombat('attack', attackBrandedFixture);

  expect(stdout).toContain('=== Attack ===');
  expect(stdout).toContain('Target: [RNC] Belt-Grazer (creature-ember-1)');
  expect(stdout).toContain('Type: creature');
  expect(stdout).toContain('Kind: npc');
  expect(stdout).toContain(`Warning: ${warning}`);
  expect(stdout.split(warning).length - 1).toBe(1);
  expect(stdout).not.toContain('Arrived at');
  expect(stdout).not.toContain('Players here');
  expect(stdout).not.toContain('Fuel Now');
  expect(stdout).not.toContain('Fuel Max');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('Action: attack');
  expect(stdout).not.toContain('Ibis');
});

test('hunt uses the hunt header for the same attack details', () => {
  const stdout = renderCombat('hunt', attackBrandedFixture);

  expect(stdout).toContain('=== Hunt ===');
  expect(stdout).not.toContain('=== Attack ===');
  expect(stdout).toContain(`Warning: ${warning}`);
  expect(stdout).toContain('Target: [RNC] Belt-Grazer (creature-ember-1)');
  expect(stdout).not.toContain('Arrived at');
  expect(stdout).not.toContain('=== Response ===');
});

test('player reply prints the message once and omits a missing warning', () => {
  const stdout = renderCombat('attack', playerReply);

  expect(stdout).toContain('=== Attack ===');
  expect(stdout).toContain('Target: player-1');
  expect(stdout).toContain('Kind: player');
  expect(stdout).toContain('Battle: btl-1');
  expect(stdout).toContain('System: sol');
  expect(stdout).toContain('Side: 1');
  expect(stdout).toContain('Zone: approach');
  expect(stdout).toContain('You open fire.');
  expect(stdout.split('You open fire.').length - 1).toBe(1);
  expect(stdout).not.toContain('Warning:');
  expect(stdout).not.toContain('=== Response ===');
});

test('your_side 0 still prints Side', () => {
  const stdout = renderCombat('attack', { ...playerReply, your_side: 0 });

  expect(stdout).toContain('Side: 0');
});

test('a non-finite your_side does not print Side', () => {
  const stdout = renderCombat('attack', { ...playerReply, your_side: Infinity });

  expect(stdout).not.toContain('Side:');
});

test('whitespace warning prints no Warning line', () => {
  const stdout = renderCombat('attack', {
    details: { ...attackBrandedFixture.details, warning: '   ' },
    location: attackBrandedFixture.location,
    ship: attackBrandedFixture.ship,
  });

  expect(stdout).toContain('=== Attack ===');
  expect(stdout).not.toContain('Warning:');
  expect(stdout).not.toContain('Arrived at');
  expect(stdout).not.toContain('Fuel Now');
});

test('a player reply still prints a non-empty warning', () => {
  const stdout = renderCombat('attack', { ...playerReply, warning: 'Owners were told.' });

  expect(stdout).toContain('Kind: player');
  expect(stdout).toContain('Warning: Owners were told.');
  expect(stdout).toContain('You open fire.');
  expect(stdout.split('Owners were told.').length - 1).toBe(1);
});

test('a message identical to the warning is not printed twice', () => {
  const stdout = renderCombat('attack', {
    ...playerReply,
    warning: 'You open fire.',
    message: 'You open fire.',
  });

  expect(stdout).toContain('Warning: You open fire.');
  expect(stdout.split('You open fire.').length - 1).toBe(1);
});

test('nested loot with nearby players still prints the warning and skips the object', () => {
  const fixture = structuredClone(attackBrandedFixture) as { details: Record<string, unknown> };
  fixture.details.loot = { item: 'carapace' };
  fixture.details.echo = 'ping';
  const stdout = renderCombat('attack', fixture);

  expect(stdout).toContain(`Warning: ${warning}`);
  expect(stdout).toContain('Echo: ping');
  expect(stdout).not.toContain('carapace');
  expect(stdout).not.toContain('Arrived at');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('Fuel Now');
});

test('nested loot without location aliases still uses the combat block', () => {
  const stdout = renderCombat('attack', {
    details: {
      ...attackBrandedFixture.details,
      loot: { item: 'carapace' },
      tags: ['a', 'b'],
    },
  });

  expect(stdout).toContain('=== Attack ===');
  expect(stdout).toContain(`Warning: ${warning}`);
  expect(stdout).toContain('Tags: 2 item(s)');
  expect(stdout).not.toContain('carapace');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('Arrived at');
});

test('details auto_undocked true prints yes and the dock-state line, not the cyan banner', () => {
  const stdout = renderCombat('attack', {
    details: { ...attackBrandedFixture.details, auto_undocked: true },
    location: { poi_id: 'sol_belt', poi_name: 'Belt', docked_at: null },
  });

  expect(stdout).toContain('Auto-undocked: yes');
  expect(stdout).toContain('Undocked at: Belt (sol_belt)');
  expect(stdout.indexOf('Auto-undocked: yes')).toBeLessThan(stdout.indexOf('Undocked at: Belt (sol_belt)'));
  expect(stdout).not.toContain('[AUTO-UNDOCKED]');
  expect(stdout).not.toContain('Auto Undocked:');
  expect(stdout).toContain(`Warning: ${warning}`);
});

test.each([
  [true, 'yes'],
  [false, 'no'],
] as const)('details auto_docked %s prints %s without the banner or scalar dump', (flag, text) => {
  const stdout = renderCombat('attack', {
    details: { ...attackBrandedFixture.details, auto_docked: flag },
  });

  expect(stdout).toContain(`Auto-docked: ${text}`);
  expect(stdout).not.toContain('Auto Docked:');
  expect(stdout).not.toContain('[AUTO-DOCKED]');
});

test('details auto_undocked false prints no and does not append the dock-state line', () => {
  const stdout = renderCombat('attack', {
    details: { ...attackBrandedFixture.details, auto_undocked: false },
    location: { poi_id: 'sol_belt', poi_name: 'Belt', docked_at: null },
  });

  expect(stdout).toContain('Auto-undocked: no');
  expect(stdout).not.toContain('Undocked at');
  expect(stdout).not.toContain('[AUTO-UNDOCKED]');
  expect(stdout).not.toContain('Auto Undocked:');
});

test('an empty target declines to the response dump instead of an arrival', () => {
  const stdout = renderCombat('attack', {
    details: {
      action: 'attack',
      kind: 'npc',
      target: '',
      target_type: 'creature',
      target_name: '[RNC] Belt-Grazer',
    },
    location: {
      poi_id: 'sol_belt',
      poi_name: 'Belt',
      nearby_players: [{ username: 'Ibis' }],
    },
  });

  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('Arrived at');
  expect(stdout).not.toContain('=== Attack ===');
});

test('a non-npc non-player attack kind declines to the response dump', () => {
  const stdout = renderCombat('attack', {
    details: {
      action: 'attack',
      kind: 'structure',
      target: 'station-1',
      target_type: 'station',
      target_name: 'Earth Station',
    },
    location: {
      poi_id: 'sol_belt',
      poi_name: 'Belt',
      nearby_players: [{ username: 'Ibis' }],
    },
  });

  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('=== Attack ===');
});

test('json output passes the attack envelope through without the human warning label', () => {
  const envelope = structuredClone(attackBrandedFixture);
  const rendered = renderStructuredResult(
    'attack',
    envelope,
    { ...options, format: 'json' },
    { ...context, output: { ...context.output, format: 'json' } },
  );
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(stdout).toBe(JSON.stringify(envelope, null, 2));
  expect(stdout).toContain(warning);
  expect(stdout).not.toContain('Warning:');
  expect(stdout).not.toContain('=== Attack ===');
});

test('equal target name and id prints the target without parentheses', () => {
  const stdout = renderCombat('attack', { ...playerReply, target_name: 'player-1' });

  expect(stdout).toContain('Target: player-1');
  expect(stdout).not.toContain('Target: player-1 (player-1)');
});
