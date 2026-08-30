import { expect, test } from 'bun:test';
import {
  summarizeAmmoEffects,
  summarizeCatalogItemEffects,
  summarizeCombatSpecialEffects,
  summarizeEffect,
  summarizeModuleBonuses,
  summarizeModuleEffects,
} from './combat-effects.ts';

const adaptiveShieldI: Record<string, unknown> = {
  id: 'adaptive_shield_i',
  type_id: 'adaptive_shield_i',
  type: 'defense',
  slot: 'defense',
  name: 'Adaptive Shield I',
  description:
    'Adds 60 maximum shield points and 10% flat/adaptive damage reduction. Flat and adaptive reductions add and cap at 75%, applied after typed resistance.',
  size: 10,
  base_value: 21000,
  cpu_usage: 5,
  power_usage: 10,
  shield_bonus: 60,
  damage_reduction: 10,
  special: 'adaptive_resistance_10',
  combat_effects: {},
  required_skills: { shields: 4 },
};

const warpScrambler: Record<string, unknown> = {
  id: 'warp_scrambler',
  type_id: 'warp_scrambler',
  type: 'utility',
  slot: 'utility',
  name: 'Warp Scrambler',
  description: 'Prevents target from jumping to hyperspace.',
  size: 10,
  base_value: 4500,
  cpu_usage: 6,
  power_usage: 8,
  reach: 3,
  combat_effects: {},
  scramble_power: 2,
  required_skills: { scanning: 3 },
};

const bloodReaver: Record<string, unknown> = {
  id: 'blood_reaver',
  type_id: 'blood_reaver',
  type: 'weapon',
  slot: 'weapon',
  name: 'Blood Reaver',
  description: 'Deals 45 kinetic damage and repairs its user for 20% of damage dealt. Fires every 2 ticks at reach 3.',
  size: 10,
  base_value: 8700,
  cpu_usage: 9,
  power_usage: 20,
  damage: 45,
  damage_type: 'kinetic',
  ammo_type: 'autocannon',
  reach: 3,
  cooldown: 2,
  magazine_size: 1000,
  special: 'lifesteal_20',
  combat_effects: { lifesteal_pct: 20 },
  required_skills: { weapons: 4 },
};

const cloakingDeviceI: Record<string, unknown> = {
  id: 'cloaking_device_i',
  type_id: 'cloaking_device_i',
  type: 'utility',
  slot: 'utility',
  name: 'Cloaking Device I',
  description: 'Reduces scanner detection.',
  size: 10,
  base_value: 4800,
  cpu_usage: 5,
  power_usage: 10,
  combat_effects: {},
  cloak_strength: 40,
  required_skills: { stealth: 1 },
};

const armorRepairerI: Record<string, unknown> = {
  id: 'armor_repairer_i',
  type_id: 'armor_repairer_i',
  type: 'defense',
  slot: 'defense',
  name: 'Armor Repairer I',
  description: 'While bracing in battle, restores 5 hull points per tick. Multiple copies add their repair rates.',
  size: 10,
  base_value: 3700,
  cpu_usage: 3,
  power_usage: 8,
  armor_repair_rate: 5,
  combat_effects: {},
  required_skills: { armor: 2 },
};

const emHullHardener: Record<string, unknown> = {
  id: 'em_hull_hardener',
  type_id: 'em_hull_hardener',
  type: 'defense',
  slot: 'defense',
  name: 'EM Hull Hardener',
  description:
    'Adds 30% EM resistance. Typed module resistances add and cap at 75%, then flat/adaptive reduction applies as the next damage stage.',
  size: 10,
  base_value: 1600,
  cpu_usage: 2,
  power_usage: 4,
  resistance_bonus: { em: 30 },
  combat_effects: {},
  required_skills: { armor: 2 },
};

const antimatterTorpedoes: Record<string, unknown> = {
  id: 'antimatter_torpedoes',
  name: 'Antimatter Torpedoes',
  description: 'The most destructive single projectile in known space. Handle with extreme caution.',
  category: 'ammo',
  size: 1,
  base_value: 16300,
  stackable: true,
  tradeable: true,
  rarity: 'exotic',
  effect: {
    type: 'ammo',
    subtype: 'torpedo',
    ammo: {
      damage_mod: 1,
      armor_bypass: 0.3,
      shield_bypass: 0.3,
    },
  },
};

const expandedFuelTank: Record<string, unknown> = {
  id: 'expanded_fuel_tank',
  type_id: 'expanded_fuel_tank',
  type: 'utility',
  slot: 'utility',
  name: 'Expanded Fuel Tank',
  description:
    'Additional pressurized fuel bladders bolted into previously empty hull space. Significantly increases fuel capacity, but the structural modifications reduce hull integrity.',
  size: 10,
  base_value: 950,
  cpu_usage: 1,
  power_usage: 2,
  combat_effects: {},
  max_fuel_bonus: 100,
  hull_penalty: 20,
};

const advancedTowRig: Record<string, unknown> = {
  id: 'advanced_tow_rig',
  type_id: 'advanced_tow_rig',
  type: 'utility',
  slot: 'utility',
  name: 'Advanced Tow Rig',
  description:
    'High-efficiency tow system for wreckage or one of your own smaller ships. Only 30% speed reduction while towing.',
  size: 10,
  base_value: 1500,
  cpu_usage: 8,
  power_usage: 15,
  combat_effects: {},
  tow_speed_penalty: 30,
  required_skills: { salvaging: 3 },
};

const entropyBeam: Record<string, unknown> = {
  id: 'entropy_beam',
  type_id: 'entropy_beam',
  type: 'weapon',
  slot: 'weapon',
  name: 'Entropy Beam',
  description:
    "Deals 15 void damage, then immediately burns the target's hull for 10 damage on the hit tick and each of the next 4 ticks, bypassing shields and armor. Burns do not stack: active burns keep the higher per-tick damage and longer remaining duration. Fires every 2 ticks at reach 4.",
  size: 10,
  base_value: 12000,
  cpu_usage: 9,
  power_usage: 18,
  damage: 15,
  damage_type: 'void',
  ammo_type: 'void_core',
  reach: 4,
  cooldown: 2,
  magazine_size: 15,
  special: 'dot_damage_10,dot_duration_5',
  combat_effects: { dot_damage: 10, dot_duration: 5 },
  required_skills: { gunnery: 2, weapons: 3 },
};

const heavyMassDriver: Record<string, unknown> = {
  id: 'heavy_mass_driver',
  type_id: 'heavy_mass_driver',
  type: 'weapon',
  slot: 'weapon',
  name: 'Heavy Mass Driver',
  description:
    'Deals 120 kinetic damage; 80% bypasses armor and damage gains 50% while the target has no shields. Fires every 5 ticks at reach 5.',
  size: 10,
  base_value: 25000,
  cpu_usage: 15,
  power_usage: 35,
  damage: 120,
  damage_type: 'kinetic',
  ammo_type: 'railgun',
  reach: 5,
  cooldown: 5,
  magazine_size: 10,
  special: 'armor_bypass_80,hull_damage_bonus_50',
  armor_bypass_bonus: 0.8,
  combat_effects: { hull_damage_pct: 50 },
  required_skills: { gunnery: 4, weapons: 4 },
};

test('summarizeCombatSpecialEffects uses integer percents without scaling 1 to 100%', () => {
  expect(summarizeCombatSpecialEffects({ lifesteal_pct: 1 })).toBe('lifesteal 1%');
  expect(summarizeCombatSpecialEffects({ lifesteal_pct: 20 })).toBe('lifesteal 20%');
});

test('summarizeAmmoEffects still scales damage_mod 1.0 to 100%', () => {
  expect(summarizeAmmoEffects({ effect: { ammo: { damage_mod: 1.0 } } })).toBe('damage 100%');
  expect(summarizeAmmoEffects(antimatterTorpedoes)).toBe('damage 100%, armor bypass 30%, shield bypass 30%');
});

test('summarizeCombatSpecialEffects omits empty, zero, false, and non-scalars', () => {
  expect(summarizeCombatSpecialEffects({})).toBe('');
  expect(summarizeCombatSpecialEffects(undefined)).toBe('');
  expect(
    summarizeCombatSpecialEffects({
      lifesteal_pct: 0,
      shield_phase: false,
      aoe_radius: null,
      capacitor_drain: '',
      nested: { ignored: true },
    }),
  ).toBe('');
});

test('summarizeCombatSpecialEffects formats booleans, durations, and split dot tokens', () => {
  expect(summarizeCombatSpecialEffects({ shield_phase: true })).toBe('shield phase');
  expect(summarizeCombatSpecialEffects({ system_disable_ticks: 1 })).toBe('disable systems 1 tick');
  expect(summarizeCombatSpecialEffects({ duration_ticks: 10 })).toBe('duration 10 ticks');
  expect(summarizeCombatSpecialEffects({ dot_damage: 5, dot_duration: 3 })).toBe('dot 5, dot 3 ticks');
  expect(summarizeCombatSpecialEffects({ mine_duration: 4 })).toBe('mine duration 4 ticks');
});

test('summarizeCombatSpecialEffects walks label map before unmapped own keys', () => {
  expect(
    summarizeCombatSpecialEffects({
      unmapped_flag: true,
      lifesteal_pct: 1,
      weird_pct: 4,
    }),
  ).toBe('lifesteal 1%, unmapped flag, weird pct 4%');
});

test('pinned catalog module effect cells', () => {
  expect(summarizeModuleEffects(warpScrambler)).toBe('reach 3, scramble 2');
  expect(summarizeModuleEffects(adaptiveShieldI)).toBe('shield +60, damage reduction 10, adaptive_resistance_10');
  expect(summarizeModuleEffects(bloodReaver)).toBe('reach 3, lifesteal 20%');
  expect(summarizeModuleEffects(cloakingDeviceI)).toBe('cloak 40');
  expect(summarizeModuleEffects(armorRepairerI)).toBe('armor repair 5');
  expect(summarizeModuleEffects(emHullHardener)).toBe('em +30');
  expect(summarizeModuleEffects({})).toBe('');
  expect(summarizeModuleBonuses({})).toBe('');
});

test('special is kept only when combat special effects are empty', () => {
  expect(summarizeModuleBonuses(adaptiveShieldI)).toContain('adaptive_resistance_10');
  expect(summarizeModuleBonuses(bloodReaver)).toBe('reach 3');
  expect(summarizeModuleBonuses(bloodReaver)).not.toContain('lifesteal_20');
  expect(summarizeModuleBonuses({ special: 'kept', combat_effects: {} })).toBe('kept');
  expect(summarizeModuleBonuses({ special: 'dropped', combat_effects: { shield_phase: true } })).toBe('');
});

test('summarizeModuleBonuses omits inspect-only weapon fields and zero bonuses', () => {
  expect(summarizeModuleBonuses(bloodReaver)).not.toContain('damage');
  expect(summarizeModuleBonuses(bloodReaver)).not.toContain('autocannon');
  expect(summarizeModuleBonuses(bloodReaver)).not.toContain('cooldown');
  expect(summarizeModuleBonuses(bloodReaver)).not.toContain('1000');
  expect(summarizeModuleBonuses(warpScrambler)).not.toContain('cpu');
  expect(summarizeModuleBonuses(warpScrambler)).not.toContain('power');
  expect(summarizeModuleBonuses({ reach: 3, shield_bonus: 0, speed_penalty: 0, cpu_usage: 9 })).toBe('reach 3');
});

test('summarizeModuleBonuses prints boarding flags and percent bonuses', () => {
  expect(
    summarizeModuleBonuses({
      crew_capacity_bonus: 2,
      boarding_defense_bonus_pct: 15,
      crew_combat_bonus_pct: 0,
      marine_combat_bonus_pct: -5,
      fleet_triage_pct: 8,
      boarding_capability: true,
      boarding_contact_defense: false,
      remote_medical_treatment: true,
    }),
  ).toBe('crew capacity +2, boarding defense +15%, marine combat -5%, fleet triage +8%, boarding, remote medical');
});

test('summarizeModuleBonuses signs penalties, resistance maps, and bypass fractions', () => {
  expect(summarizeModuleBonuses(expandedFuelTank)).toBe('hull -20, max fuel +100');
  expect(summarizeModuleBonuses(advancedTowRig)).toBe('tow -30');
  expect(summarizeModuleBonuses({ resistance_bonus: { em: 30, thermal: -10 } })).toBe('em +30, thermal -10');
  expect(summarizeModuleBonuses(heavyMassDriver)).toBe('reach 5, armor bypass +0.8');
  expect(summarizeModuleBonuses({ extra_flux_bonus: 7, odd_penalty: 4, reach: 2 })).toBe(
    'reach 2, extra flux +7, odd -4',
  );
});

test('summarizeModuleEffects joins bonuses and combat special effects', () => {
  expect(summarizeModuleEffects(entropyBeam)).toBe('reach 4, dot 10, dot 5 ticks');
  expect(summarizeModuleEffects(heavyMassDriver)).toBe('reach 5, armor bypass +0.8, hull damage 50%');
  expect(summarizeModuleEffects({ combat_effects: { lifesteal_pct: 1 } })).toBe('lifesteal 1%');
});

test('summarizeCatalogItemEffects joins ammo and module summaries', () => {
  expect(summarizeCatalogItemEffects(antimatterTorpedoes)).toBe('damage 100%, armor bypass 30%, shield bypass 30%');
  expect(summarizeCatalogItemEffects(bloodReaver)).toBe('reach 3, lifesteal 20%');
  expect(summarizeCatalogItemEffects({})).toBe('');
  expect(
    summarizeCatalogItemEffects({
      effect: { ammo: { damage_mod: 1.0 } },
      reach: 3,
    }),
  ).toBe('damage 100%; reach 3');
});

test('summarizeEffect prefers ammo then recurses scalars', () => {
  expect(summarizeEffect({ type: 'ammo', ammo: { damage_mod: 1.0 } })).toBe('type: ammo, damage 100%');
  expect(summarizeEffect('plain')).toBe('plain');
  expect(summarizeEffect(4)).toBe('4');
  expect(summarizeEffect({ foo: { bar: 1 } })).toBe('foo: (bar: 1)');
  expect(summarizeEffect({ list: [1, { a: 2 }] })).toBe('list: [1, a: 2]');
});
