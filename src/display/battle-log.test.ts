import { describe, expect, test } from 'bun:test';
import {
  type BattleLogAttackRow,
  battleLogAttackRows,
  formatBattleDefenseLine,
  formatBattleHitChance,
  formatBattleHitScale,
  formatShieldHull,
  resolveCombatantLabel,
} from './battle-log.ts';

const ROW_KEYS = ['tick', 'from', 'to', 'hit', 'shieldHull', 'defense'] as const;

function pulseLaserComponent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    weapon_instance_id: 'w-pulse',
    weapon_name: 'Pulse Laser',
    damage_type: 'kinetic',
    incoming_damage: 500,
    shield_resist_pct: 6,
    after_shield_resist: 470,
    type_resist_pct: 3,
    after_type_resist: 455,
    flat_reduction_pct: 3,
    after_flat_reduction: 440,
    shield_bypass_pct: 0,
    armor_bypass_pct: 0,
    ignore_all_defense: false,
    final_damage: 440,
    shield_damage: 300,
    hull_damage: 120,
    ...overrides,
  };
}

function railgunComponent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    weapon_instance_id: 'w-rail',
    weapon_name: 'Railgun',
    damage_type: 'energy',
    incoming_damage: 400,
    shield_resist_pct: 5,
    after_shield_resist: 380,
    type_resist_pct: 5,
    after_type_resist: 360,
    flat_reduction_pct: 3,
    after_flat_reduction: 350,
    shield_bypass_pct: 0,
    armor_bypass_pct: 0,
    ignore_all_defense: false,
    final_damage: 350,
    shield_damage: 200,
    hull_damage: 150,
    ...overrides,
  };
}

function pulseCannonComponent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    weapon_instance_id: 'w-cannon',
    weapon_name: 'Pulse Cannon',
    damage_type: 'kinetic',
    incoming_damage: 200,
    shield_resist_pct: 5,
    after_shield_resist: 190,
    type_resist_pct: 5,
    after_type_resist: 180,
    flat_reduction_pct: 6,
    after_flat_reduction: 170,
    shield_bypass_pct: 0,
    armor_bypass_pct: 0,
    ignore_all_defense: false,
    final_damage: 170,
    shield_damage: 140,
    hull_damage: 30,
    ...overrides,
  };
}

function expectAttackRows(rows: BattleLogAttackRow[], expected: BattleLogAttackRow[]): void {
  expect(rows.map((row) => Object.keys(row))).toEqual(expected.map(() => [...ROW_KEYS]));
  expect(rows).toEqual(expected);
}

describe('formatBattleHitScale / formatBattleHitChance', () => {
  test('scales 0–1 fractions and leaves already-percent values alone', () => {
    expect(formatBattleHitChance(0.12)).toBe('12%');
    expect(formatBattleHitScale(0.12)).toBe('12');
    expect(formatBattleHitChance(1)).toBe('100%');
    expect(formatBattleHitScale(1)).toBe('100');
    expect(formatBattleHitChance(12)).toBe('12%');
    expect(formatBattleHitScale(12)).toBe('12');
    expect(formatBattleHitChance(81)).toBe('81%');
    expect(formatBattleHitScale(81)).toBe('81');
  });

  test('returns undefined for non-numeric input', () => {
    expect(formatBattleHitScale(undefined)).toBeUndefined();
    expect(formatBattleHitChance('nope')).toBeUndefined();
    expect(formatBattleHitScale(Number.NaN)).toBeUndefined();
  });
});

describe('formatShieldHull', () => {
  test('joins both values, suffixes a lone side, and blanks when neither is finite', () => {
    expect(formatShieldHull(300, 120)).toBe('300/120');
    expect(formatShieldHull(0, 0)).toBe('0/0');
    expect(formatShieldHull(300, undefined)).toBe('300s');
    expect(formatShieldHull(undefined, 120)).toBe('120h');
    expect(formatShieldHull(undefined, undefined)).toBe('');
    expect(formatShieldHull('x', 'y')).toBe('');
  });
});

describe('formatBattleDefenseLine', () => {
  test('formats a single component stage chain', () => {
    expect(formatBattleDefenseLine(pulseLaserComponent(), 'component')).toBe(
      'Pulse Laser kinetic 500→470→455→440 (S6 T3 F3)',
    );
  });

  test('formats mixed-weapon components independently', () => {
    expect(formatBattleDefenseLine(railgunComponent(), 'component')).toBe('Railgun energy 400→380→360→350 (S5 T5 F3)');
    expect(formatBattleDefenseLine(pulseCannonComponent(), 'component')).toBe(
      'Pulse Cannon kinetic 200→190→180→170 (S5 T5 F6)',
    );
  });

  test('keeps S0 T0 F0 and does not collapse present equal hops', () => {
    expect(
      formatBattleDefenseLine(
        pulseLaserComponent({
          weapon_name: 'Void Lance',
          damage_type: 'void',
          incoming_damage: 400,
          after_shield_resist: 400,
          after_type_resist: 400,
          after_flat_reduction: 400,
          shield_resist_pct: 0,
          type_resist_pct: 0,
          flat_reduction_pct: 0,
          ignore_all_defense: true,
        }),
        'component',
      ),
    ).toBe('Void Lance void 400→400→400→400 (S0 T0 F0) bypass');
  });

  test('omits missing hops and omitted resist buckets', () => {
    expect(
      formatBattleDefenseLine(
        {
          weapon_name: 'Pulse Laser',
          damage_type: 'kinetic',
          incoming_damage: 400,
          after_flat_reduction: 350,
          shield_resist_pct: 6,
          flat_reduction_pct: 3,
        },
        'component',
      ),
    ).toBe('Pulse Laser kinetic 400→350 (S6 F3)');
  });

  test('appends bypass flags only when truthy or non-zero', () => {
    expect(
      formatBattleDefenseLine(
        pulseLaserComponent({
          ignore_all_defense: true,
          ignored_resistance_pct: 15,
          shield_bypass_pct: 10,
          armor_bypass_pct: 20,
        }),
        'component',
      ),
    ).toBe('Pulse Laser kinetic 500→470→455→440 (S6 T3 F3) bypass ign 15% sbypass 10% abypass 20%');

    expect(
      formatBattleDefenseLine(
        pulseLaserComponent({
          ignore_all_defense: false,
          ignored_resistance_pct: 0,
          shield_bypass_pct: 0,
          armor_bypass_pct: 0,
        }),
        'component',
      ),
    ).toBe('Pulse Laser kinetic 500→470→455→440 (S6 T3 F3) ign 0%');
  });

  test('attack-level fallback is percents and labels only', () => {
    expect(
      formatBattleDefenseLine(
        {
          weapons: [{ name: 'Pulse Laser' }],
          damage_type: 'kinetic',
          shield_resist_pct: 6,
          type_resist_pct: 3,
          flat_reduction_pct: 3,
          ignored_resistance_pct: 4,
          incoming_damage: 500,
          after_shield_resist: 470,
          after_type_resist: 455,
          after_flat_reduction: 440,
          raw_damage: 999,
          pre_hit_damage: 888,
          ignore_all_defense: true,
          shield_bypass_pct: 10,
          armor_bypass_pct: 20,
        },
        'attack',
      ),
    ).toBe('Pulse Laser kinetic (S6 T3 F3) ign 4%');
  });

  test('attack-level fallback omits name when weapons are not records', () => {
    expect(
      formatBattleDefenseLine(
        {
          weapons: ['Pulse Laser'],
          damage_type: 'kinetic',
          shield_resist_pct: 6,
        },
        'attack',
      ),
    ).toBe('kinetic (S6)');
  });
});

describe('resolveCombatantLabel', () => {
  test('uses snapshot username when non-empty and falls back to id', () => {
    const snapshots = [
      { player_id: 'player-1', username: 'PilotOne' },
      { player_id: 'player-2', username: '' },
      { player_id: 'player-3' },
    ];
    expect(resolveCombatantLabel('player-1', snapshots)).toBe('PilotOne');
    expect(resolveCombatantLabel('player-2', snapshots)).toBe('player-2');
    expect(resolveCombatantLabel('player-3', snapshots)).toBe('player-3');
    expect(resolveCombatantLabel('pirate-1', snapshots)).toBe('pirate-1');
    expect(resolveCombatantLabel('player-1', undefined)).toBe('player-1');
    expect(resolveCombatantLabel(undefined, snapshots)).toBe('');
  });
});

describe('battleLogAttackRows', () => {
  test('uses stable row keys for the later Attacks table', () => {
    const rows = battleLogAttackRows([
      {
        tick: 0,
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            hit_success: true,
            defense_components: [pulseLaserComponent()],
          },
        ],
      },
    ]);
    expectAttackRows(rows, [
      {
        tick: 0,
        from: 'player-1',
        to: 'pirate-1',
        hit: 'hit',
        shieldHull: '300/120',
        defense: 'Pulse Laser kinetic 500→470→455→440 (S6 T3 F3)',
      },
    ]);
  });

  test('emits one row per component on a mixed-weapon hit', () => {
    const rows = battleLogAttackRows([
      {
        tick: 1,
        snapshots: [
          { player_id: 'player-1', username: 'PilotOne' },
          { player_id: 'pirate-1', username: 'Raider' },
        ],
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            hit_success: true,
            shield_damage: 999,
            hull_damage: 888,
            defense_components: [railgunComponent(), pulseCannonComponent()],
          },
        ],
      },
    ]);
    expectAttackRows(rows, [
      {
        tick: 1,
        from: 'PilotOne',
        to: 'Raider',
        hit: 'hit',
        shieldHull: '200/150',
        defense: 'Railgun energy 400→380→360→350 (S5 T5 F3)',
      },
      {
        tick: 1,
        from: 'PilotOne',
        to: 'Raider',
        hit: 'hit',
        shieldHull: '140/30',
        defense: 'Pulse Cannon kinetic 200→190→180→170 (S5 T5 F6)',
      },
    ]);
  });

  test('miss-first emits one chance/roll row and ignores components and S/H', () => {
    const rows = battleLogAttackRows([
      {
        tick: 1,
        attacks: [
          {
            attacker_id: 'pirate-1',
            target_id: 'player-1',
            hit_success: false,
            hit_chance: 12,
            hit_roll: 81,
            shield_damage: 300,
            hull_damage: 120,
            defense_components: [pulseLaserComponent(), railgunComponent()],
          },
        ],
      },
    ]);
    expectAttackRows(rows, [
      {
        tick: 1,
        from: 'pirate-1',
        to: 'player-1',
        hit: 'miss',
        shieldHull: '',
        defense: 'chance 12% roll 81',
      },
    ]);
  });

  test('omits absent miss chance or roll fragments', () => {
    expect(battleLogAttackRows([{ tick: 0, attacks: [{ hit_success: false, hit_chance: 12 }] }])[0]?.defense).toBe(
      'chance 12%',
    );
    expect(battleLogAttackRows([{ tick: 0, attacks: [{ hit_success: false, hit_roll: 81 }] }])[0]?.defense).toBe(
      'roll 81',
    );
    expect(battleLogAttackRows([{ tick: 0, attacks: [{ hit_success: false }] }])[0]?.defense).toBe('');
  });

  test('falls back to attack-level percents and labels when components are empty', () => {
    const attack = {
      attacker_id: 'player-1',
      target_id: 'pirate-1',
      hit_success: true,
      weapons: [{ name: 'Pulse Laser' }],
      damage_type: 'kinetic',
      shield_resist_pct: 6,
      type_resist_pct: 3,
      flat_reduction_pct: 3,
      shield_damage: 300,
      hull_damage: 120,
      incoming_damage: 500,
      after_shield_resist: 470,
      raw_damage: 999,
      pre_hit_damage: 888,
    };
    for (const defense_components of [undefined, [], ['skip']]) {
      const rows = battleLogAttackRows([{ tick: 0, attacks: [{ ...attack, defense_components }] }]);
      expectAttackRows(rows, [
        {
          tick: 0,
          from: 'player-1',
          to: 'pirate-1',
          hit: 'hit',
          shieldHull: '300/120',
          defense: 'Pulse Laser kinetic (S6 T3 F3)',
        },
      ]);
      expect(rows[0]?.defense).not.toContain('→');
      expect(rows[0]?.defense).not.toContain('999');
      expect(rows[0]?.defense).not.toContain('888');
    }
  });

  test('leaves Hit blank when hit_success is missing and still prints fallback S/H', () => {
    const rows = battleLogAttackRows([
      {
        battle_tick: 4,
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            shield_damage: 50,
            hull_damage: 10,
          },
        ],
      },
    ]);
    expectAttackRows(rows, [
      {
        tick: 4,
        from: 'player-1',
        to: 'pirate-1',
        hit: '',
        shieldHull: '50/10',
        defense: '',
      },
    ]);
  });

  test('missing hit_success still expands defense_components', () => {
    const rows = battleLogAttackRows([
      {
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            defense_components: [pulseLaserComponent()],
          },
        ],
      },
    ]);
    expectAttackRows(rows, [
      {
        tick: 0,
        from: 'player-1',
        to: 'pirate-1',
        hit: '',
        shieldHull: '300/120',
        defense: 'Pulse Laser kinetic 500→470→455→440 (S6 T3 F3)',
      },
    ]);
  });

  test('skips non-record entries and empty attacks', () => {
    expect(battleLogAttackRows(undefined)).toEqual([]);
    expect(battleLogAttackRows(['nope', { tick: 2, attacks: [] }, { tick: 3 }])).toEqual([]);
  });
});
