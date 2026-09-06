import { describe, expect, test } from 'bun:test';
import {
  type BattleLogAttackRow,
  battleLogAttackRows,
  battleLogCombatantRows,
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

function ghostCannonComponent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    weapon_instance_id: 'w-leftover',
    weapon_name: 'Ghost Cannon',
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

const ACE_RAIDER = [
  { player_id: 'player-1', username: 'Ace' },
  { player_id: 'pirate-1', username: 'Raider' },
];

function partialVolleyAttack(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    attacker_id: 'player-1',
    target_id: 'pirate-1',
    hit_success: true,
    landed_damage: 600,
    shield_damage: 340,
    hull_damage: 180,
    weapons: [
      {
        instance_id: 'w-rail',
        name: 'Railgun',
        damage_type: 'energy',
        hit_chance: 0.65,
        hit_roll: 0.2,
        hit_success: true,
      },
      {
        instance_id: 'w-cannon',
        name: 'Pulse Cannon',
        damage_type: 'kinetic',
        hit_chance: 0.65,
        hit_roll: 0.3,
        hit_success: true,
      },
      {
        instance_id: 'w-mining',
        name: 'Mining Laser',
        damage_type: 'kinetic',
        hit_chance: 0.35,
        hit_roll: 0.61,
      },
    ],
    defense_components: [railgunComponent(), pulseCannonComponent(), ghostCannonComponent()],
    ...overrides,
  };
}

function partialVolleyRows(tick: unknown, from: string, to: string): BattleLogAttackRow[] {
  return [
    {
      tick,
      from,
      to,
      hit: 'hit 2/3',
      shieldHull: '200/150',
      defense: 'Railgun energy 400→380→360→350 (S5 T5 F3)',
    },
    {
      tick,
      from,
      to,
      hit: 'hit 2/3',
      shieldHull: '140/30',
      defense: 'Pulse Cannon kinetic 200→190→180→170 (S5 T5 F6)',
    },
    {
      tick,
      from,
      to,
      hit: 'hit 2/3',
      shieldHull: '',
      defense: 'Mining Laser chance 35% roll 61',
    },
  ];
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
          landed_damage: 888,
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

  test('prefixes Boss only when is_boss is true', () => {
    expect(resolveCombatantLabel('player-1', [{ player_id: 'player-1', username: 'PilotOne', is_boss: true }])).toBe(
      'Boss PilotOne',
    );
    expect(resolveCombatantLabel('player-1', [{ player_id: 'player-1', username: 'PilotOne', is_boss: false }])).toBe(
      'PilotOne',
    );
    expect(resolveCombatantLabel('player-1', [{ player_id: 'player-1', username: 'PilotOne' }])).toBe('PilotOne');
    expect(resolveCombatantLabel('player-1', [{ player_id: 'player-1', username: '' }])).toBe('player-1');
    expect(
      resolveCombatantLabel('player-1', [
        { player_id: 'player-1', username: 'PilotOne', kind: 'pirate', pirate_role: 'boss' },
      ]),
    ).toBe('PilotOne');
    expect(resolveCombatantLabel('player-1', [{ player_id: 'player-1', username: '', is_boss: true }])).toBe(
      'Boss player-1',
    );
  });
});

describe('battleLogCombatantRows', () => {
  test('keeps first-seen order and last-write identity fields', () => {
    const rows = battleLogCombatantRows([
      {
        tick: 0,
        snapshots: [
          { player_id: 'player-1', username: 'Ace', is_npc: false, is_boss: false },
          { player_id: 'pirate-1', username: 'Raider', kind: 'pirate', is_npc: true, is_boss: false },
          'skip',
          { username: 'Nameless' },
        ],
      },
      {
        tick: 1,
        snapshots: [
          { player_id: 'pirate-1', username: 'Corsair', kind: 'pirate', is_npc: true, is_boss: true },
          { player_id: 'player-2', username: 'Nova' },
        ],
      },
    ]);

    expect(rows.map((row) => row.player_id)).toEqual(['player-1', 'pirate-1', 'player-2']);
    expect(rows[0]).toEqual({ player_id: 'player-1', username: 'Ace', is_npc: false, is_boss: false });
    expect(rows[1]).toEqual({
      player_id: 'pirate-1',
      username: 'Corsair',
      kind: 'pirate',
      is_npc: true,
      is_boss: true,
    });
    expect(rows[2]).toEqual({ player_id: 'player-2', username: 'Nova' });
  });

  test('is empty when snapshots are omitted or empty', () => {
    expect(battleLogCombatantRows(undefined)).toEqual([]);
    expect(battleLogCombatantRows([])).toEqual([]);
    expect(battleLogCombatantRows([{ tick: 0 }])).toEqual([]);
    expect(battleLogCombatantRows([{ tick: 0, snapshots: [] }])).toEqual([]);
    expect(battleLogCombatantRows(['nope', { tick: 1, snapshots: [null, { username: 'X' }] }])).toEqual([]);
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
      landed_damage: 888,
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

  test('live partial volley prints shared hit N/M, missed-gun chance/roll, and ignores leftover Ghost Cannon', () => {
    const rows = battleLogAttackRows([
      {
        tick: 1,
        snapshots: ACE_RAIDER,
        attacks: [partialVolleyAttack()],
      },
    ]);
    expectAttackRows(rows, partialVolleyRows(1, 'Ace', 'Raider'));
    expect(rows.map((row) => row.defense).join('\n')).not.toContain('Ghost Cannon');
    expect(rows.map((row) => row.defense).join('\n')).not.toContain('600');
    expect(rows.map((row) => row.hit)).toEqual(['hit 2/3', 'hit 2/3', 'hit 2/3']);
  });

  test('live full miss emits one row per fired gun and ignores leftover Ghost Cannon', () => {
    const rows = battleLogAttackRows([
      {
        tick: 1,
        snapshots: ACE_RAIDER,
        attacks: [
          {
            attacker_id: 'pirate-1',
            target_id: 'player-1',
            hit_success: false,
            landed_damage: 0,
            shield_damage: 200,
            hull_damage: 150,
            hit_chance: 0.12,
            weapons: [
              {
                instance_id: 'w-scatter',
                name: 'Scatter Cannon',
                damage_type: 'kinetic',
                hit_chance: 0.12,
                hit_roll: 0.81,
              },
              {
                instance_id: 'w-blaster',
                name: 'Light Blaster',
                damage_type: 'kinetic',
                hit_chance: 0.12,
                hit_roll: 0.9,
              },
            ],
            defense_components: [
              ghostCannonComponent(),
              pulseLaserComponent({ weapon_instance_id: 'w-scatter', weapon_name: 'Scatter Cannon' }),
            ],
          },
        ],
      },
    ]);
    expectAttackRows(rows, [
      {
        tick: 1,
        from: 'Raider',
        to: 'Ace',
        hit: 'miss',
        shieldHull: '',
        defense: 'Scatter Cannon chance 12% roll 81',
      },
      {
        tick: 1,
        from: 'Raider',
        to: 'Ace',
        hit: 'miss',
        shieldHull: '',
        defense: 'Light Blaster chance 12% roll 90',
      },
    ]);
  });

  test('historical miss-first with leftover Ghost Cannon stays one chance/roll row', () => {
    const rows = battleLogAttackRows([
      {
        tick: 0,
        attacks: [
          {
            attacker_id: 'pirate-1',
            target_id: 'player-1',
            hit_success: false,
            hit_chance: 12,
            hit_roll: 81,
            shield_damage: 300,
            hull_damage: 120,
            weapons: [{ name: 'Scatter Cannon', instance_id: 'w-scatter' }],
            defense_components: [ghostCannonComponent()],
          },
        ],
      },
    ]);
    expectAttackRows(rows, [
      {
        tick: 0,
        from: 'pirate-1',
        to: 'player-1',
        hit: 'miss',
        shieldHull: '',
        defense: 'chance 12% roll 81',
      },
    ]);
  });

  test('single-gun 0.593 hit prints hit not hit 1/1', () => {
    const rows = battleLogAttackRows([
      {
        tick: 0,
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            hit_success: true,
            weapons: [
              {
                instance_id: 'w-pulse',
                name: 'Pulse Laser',
                damage_type: 'kinetic',
                hit_chance: 0.65,
                hit_roll: 0.2,
                hit_success: true,
              },
            ],
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
    expect(rows[0]?.hit).not.toBe('hit 1/1');
  });

  test('full six-gun connect prints hit 6/6 on every row', () => {
    const weapons = Array.from({ length: 6 }, (_, index) => ({
      instance_id: `w-gun-${index}`,
      name: `Gun ${index}`,
      damage_type: 'kinetic',
      hit_chance: 0.65,
      hit_roll: 0.1,
      hit_success: true,
    }));
    const rows = battleLogAttackRows([
      {
        tick: 2,
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            hit_success: true,
            weapons,
            defense_components: weapons.map((weapon) =>
              pulseLaserComponent({
                weapon_instance_id: weapon.instance_id,
                weapon_name: weapon.name,
              }),
            ),
          },
        ],
      },
    ]);
    expect(rows).toHaveLength(6);
    expect(rows.map((row) => row.hit)).toEqual(Array.from({ length: 6 }, () => 'hit 6/6'));
    expect(rows.map((row) => row.defense)).toEqual(
      weapons.map((weapon) => `${weapon.name} kinetic 500→470→455→440 (S6 T3 F3)`),
    );
  });

  test('unfired weapons do not increment M and their leftover components are ignored', () => {
    const rows = battleLogAttackRows([
      {
        tick: 1,
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            hit_success: true,
            weapons: [
              {
                instance_id: 'w-rail',
                name: 'Railgun',
                damage_type: 'energy',
                hit_chance: 0.65,
                hit_roll: 0.2,
                hit_success: true,
              },
              {
                instance_id: 'w-reach',
                name: 'Reach Out',
                damage_type: 'kinetic',
              },
              {
                instance_id: 'w-mining',
                name: 'Mining Laser',
                damage_type: 'kinetic',
                hit_chance: 0.35,
                hit_roll: 0.61,
              },
            ],
            defense_components: [
              railgunComponent(),
              pulseLaserComponent({ weapon_instance_id: 'w-reach', weapon_name: 'Reach Out' }),
            ],
          },
        ],
      },
    ]);
    expectAttackRows(rows, [
      {
        tick: 1,
        from: 'player-1',
        to: 'pirate-1',
        hit: 'hit 1/2',
        shieldHull: '200/150',
        defense: 'Railgun energy 400→380→360→350 (S5 T5 F3)',
      },
      {
        tick: 1,
        from: 'player-1',
        to: 'pirate-1',
        hit: 'hit 1/2',
        shieldHull: '',
        defense: 'Mining Laser chance 35% roll 61',
      },
    ]);
    expect(rows.map((row) => row.defense).join('\n')).not.toContain('Reach Out');
    expect(rows.map((row) => row.hit)).not.toContain('hit 1/3');
  });

  test('connected gun without a matching component prints name and type with blank S/H', () => {
    const attack = {
      attacker_id: 'player-1',
      target_id: 'pirate-1',
      hit_success: true,
      shield_damage: 60,
      hull_damage: 30,
      landed_damage: 90,
      weapons: [
        {
          instance_id: 'w-ion',
          name: 'Ion Lance',
          damage_type: 'energy',
          hit_chance: 0.7,
          hit_roll: 0.2,
          hit_success: true,
        },
      ],
    };
    for (const defense_components of [undefined, [], [ghostCannonComponent()], ['skip']]) {
      const rows = battleLogAttackRows([{ tick: 0, attacks: [{ ...attack, defense_components }] }]);
      expectAttackRows(rows, [
        {
          tick: 0,
          from: 'player-1',
          to: 'pirate-1',
          hit: 'hit',
          shieldHull: '',
          defense: 'Ion Lance energy',
        },
      ]);
      expect(rows[0]?.shieldHull).not.toBe('60/30');
      expect(rows[0]?.defense).not.toContain('90');
    }
  });

  test('attack hit_success true with every fired weapon omitting hit_success is a miss volley', () => {
    const rows = battleLogAttackRows([
      {
        tick: 1,
        attacks: [
          {
            attacker_id: 'player-1',
            target_id: 'pirate-1',
            hit_success: true,
            landed_damage: 0,
            weapons: [
              {
                instance_id: 'w-scatter',
                name: 'Scatter Cannon',
                damage_type: 'kinetic',
                hit_chance: 0.12,
                hit_roll: 0.81,
              },
              {
                instance_id: 'w-blaster',
                name: 'Light Blaster',
                damage_type: 'kinetic',
                hit_chance: 0.12,
                hit_roll: 0.9,
              },
            ],
          },
        ],
      },
    ]);
    expectAttackRows(rows, [
      {
        tick: 1,
        from: 'player-1',
        to: 'pirate-1',
        hit: 'miss',
        shieldHull: '',
        defense: 'Scatter Cannon chance 12% roll 81',
      },
      {
        tick: 1,
        from: 'player-1',
        to: 'pirate-1',
        hit: 'miss',
        shieldHull: '',
        defense: 'Light Blaster chance 12% roll 90',
      },
    ]);
  });

  test('mixed-age page selects historical miss then per-weapon partial volley row by row', () => {
    const rows = battleLogAttackRows([
      {
        tick: 0,
        snapshots: ACE_RAIDER,
        attacks: [
          {
            attacker_id: 'pirate-1',
            target_id: 'player-1',
            hit_success: false,
            hit_chance: 12,
            hit_roll: 81,
            weapons: [{ name: 'Scatter Cannon', instance_id: 'w-scatter' }],
            defense_components: [ghostCannonComponent()],
          },
        ],
      },
      {
        tick: 1,
        snapshots: ACE_RAIDER,
        attacks: [partialVolleyAttack()],
      },
    ]);
    expectAttackRows(rows, [
      {
        tick: 0,
        from: 'Raider',
        to: 'Ace',
        hit: 'miss',
        shieldHull: '',
        defense: 'chance 12% roll 81',
      },
      ...partialVolleyRows(1, 'Ace', 'Raider'),
    ]);
  });

  test('per-weapon miss falls back to attack chance and never copies attack hit_roll', () => {
    const rows = battleLogAttackRows([
      {
        tick: 1,
        attacks: [
          {
            attacker_id: 'pirate-1',
            target_id: 'player-1',
            hit_success: false,
            hit_chance: 0.12,
            hit_roll: 99,
            weapons: [
              {
                instance_id: 'w-scatter',
                name: 'Scatter Cannon',
                hit_roll: 0.81,
              },
              {
                instance_id: 'w-blaster',
                name: 'Light Blaster',
                hit_chance: 0.35,
                hit_roll: 0.61,
              },
            ],
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
        defense: 'Scatter Cannon chance 12% roll 81',
      },
      {
        tick: 1,
        from: 'pirate-1',
        to: 'player-1',
        hit: 'miss',
        shieldHull: '',
        defense: 'Light Blaster chance 35% roll 61',
      },
    ]);
    expect(rows.map((row) => row.defense).join('\n')).not.toContain('99');
  });

  test('explicit weapon hit_success false still takes the per-weapon miss path', () => {
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
            weapons: [
              {
                instance_id: 'w-scatter',
                name: 'Scatter Cannon',
                hit_success: false,
              },
            ],
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
        defense: 'Scatter Cannon chance 12%',
      },
    ]);
    expect(rows[0]?.defense).not.toContain('roll 81');
  });

  test('omits missing per-weapon miss chance or roll fragments', () => {
    expect(
      battleLogAttackRows([
        {
          tick: 0,
          attacks: [
            {
              hit_success: false,
              weapons: [{ name: 'Scatter Cannon', hit_chance: 0.12 }],
            },
          ],
        },
      ])[0]?.defense,
    ).toBe('Scatter Cannon chance 12%');
    expect(
      battleLogAttackRows([
        {
          tick: 0,
          attacks: [
            {
              hit_success: false,
              weapons: [{ name: 'Scatter Cannon', hit_roll: 0.81 }],
            },
          ],
        },
      ])[0]?.defense,
    ).toBe('Scatter Cannon roll 81');
    expect(
      battleLogAttackRows([
        {
          tick: 0,
          attacks: [
            {
              hit_success: false,
              weapons: [{ hit_success: false }],
            },
          ],
        },
      ])[0]?.defense,
    ).toBe('');
  });
});
