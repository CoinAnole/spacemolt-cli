import { describe, expect, test } from 'bun:test';
import { isRecord } from './helpers.ts';
import { battleLogFixture, battleLogSnapshotsFixture } from './social.fixtures.ts';

// AttackLogEntry.required in spacemolt-docs/openapi.json
const ATTACK_LOG_ENTRY_REQUIRED = [
  'attacker_id',
  'target_id',
  'zone_distance',
  'weapons',
  'raw_damage',
  'weapon_skill_pct',
  'landed_damage',
  'hit_chance',
  'hit_success',
  'final_damage',
  'shield_damage',
  'hull_damage',
  'damage_type',
] as const;

// WeaponFireDetail.required in spacemolt-docs/openapi.json
const WEAPON_FIRE_DETAIL_REQUIRED = [
  'instance_id',
  'name',
  'base_damage',
  'after_disruption',
  'type_bonus_pct',
  'crit_chance',
  'crit_roll',
  'crit_fired',
  'damage',
  'damage_type',
] as const;

const ATTACK_LOG_ENTRY_ALLOWED = new Set<string>([...ATTACK_LOG_ENTRY_REQUIRED, 'defense_components']);
const WEAPON_FIRE_DETAIL_ALLOWED = new Set<string>([
  ...WEAPON_FIRE_DETAIL_REQUIRED,
  'hit_chance',
  'hit_roll',
  'hit_success',
  'ammo_mod',
  'ammo_used',
]);

function fixtureAttacks(fixture: { entries: ReadonlyArray<{ attacks?: unknown }> }): Array<Record<string, unknown>> {
  const attacks: Array<Record<string, unknown>> = [];
  for (const entry of fixture.entries) {
    if (!Array.isArray(entry.attacks)) continue;
    for (const attack of entry.attacks) {
      if (isRecord(attack)) attacks.push(attack);
    }
  }
  return attacks;
}

function attackWeapons(attack: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(attack.weapons) ? attack.weapons.filter(isRecord) : [];
}

function weaponFired(weapon: Record<string, unknown>): boolean {
  return (
    typeof weapon.hit_chance === 'number' ||
    typeof weapon.hit_roll === 'number' ||
    weapon.hit_success === true ||
    weapon.hit_success === false
  );
}

const BATTLE_LOG_ATTACKS = [...fixtureAttacks(battleLogFixture), ...fixtureAttacks(battleLogSnapshotsFixture)];

describe('battle log fixture AttackLogEntry / WeaponFireDetail', () => {
  test('every attack has AttackLogEntry required keys and no illegal extras', () => {
    expect(BATTLE_LOG_ATTACKS.length).toBeGreaterThan(0);
    for (const attack of BATTLE_LOG_ATTACKS) {
      for (const key of ATTACK_LOG_ENTRY_REQUIRED) {
        expect(attack).toHaveProperty(key);
      }
      expect(attack).not.toHaveProperty('hit_roll');
      expect(attack).not.toHaveProperty('pre_hit_damage');
      for (const key of Object.keys(attack)) {
        expect(ATTACK_LOG_ENTRY_ALLOWED.has(key)).toBe(true);
      }
    }
  });

  test('every weapon has WeaponFireDetail required keys and no illegal extras', () => {
    for (const attack of BATTLE_LOG_ATTACKS) {
      for (const weapon of attackWeapons(attack)) {
        for (const key of WEAPON_FIRE_DETAIL_REQUIRED) {
          expect(weapon).toHaveProperty(key);
        }
        for (const key of Object.keys(weapon)) {
          expect(WEAPON_FIRE_DETAIL_ALLOWED.has(key)).toBe(true);
        }
      }
    }
  });

  test('fired weapons use fractional hit fields and omit hit_success on a miss', () => {
    for (const attack of BATTLE_LOG_ATTACKS) {
      for (const weapon of attackWeapons(attack)) {
        if (weapon.hit_success !== true) {
          expect(weapon.damage).toBe(0);
        }
        if (!weaponFired(weapon)) continue;
        expect(weapon.hit_chance).toBeGreaterThanOrEqual(0.05);
        expect(weapon.hit_chance).toBeLessThanOrEqual(0.95);
        expect(weapon.hit_roll).toBeGreaterThanOrEqual(0);
        expect(weapon.hit_roll).toBeLessThan(1);
        if (weapon.hit_success !== true) {
          expect(weapon).not.toHaveProperty('hit_success');
        }
      }
    }
  });

  test('battleLogFixture tick-1 live miss uses hit_chance 0.12', () => {
    const tick1 = battleLogFixture.entries.find((entry) => entry.tick === 1);
    const miss = tick1?.attacks.find((attack) => attack.hit_success === false);
    expect(miss?.hit_chance).toBe(0.12);
  });

  test('battleLogFixture tick-1 historical miss omits weapon hit fields', () => {
    const tick1 = battleLogFixture.entries.find((entry) => entry.tick === 1);
    const historical = tick1?.attacks.find(
      (attack) =>
        Array.isArray(attack.weapons) &&
        attack.weapons.some((weapon) => isRecord(weapon) && weapon.name === 'Light Blaster'),
    );
    expect(historical?.hit_success).toBe(false);
    expect(historical?.hit_chance).toBe(0.12);
    expect(historical?.raw_damage).toBe(80);
    expect(historical).not.toHaveProperty('hit_roll');
    const weapons = attackWeapons(historical ?? {});
    expect(weapons).toHaveLength(1);
    const blaster = weapons[0];
    expect(blaster?.name).toBe('Light Blaster');
    expect(blaster?.damage).toBe(0);
    expect(blaster).not.toHaveProperty('hit_chance');
    expect(blaster).not.toHaveProperty('hit_roll');
    expect(blaster).not.toHaveProperty('hit_success');
  });
});
