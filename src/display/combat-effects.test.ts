import { expect, test } from 'bun:test';
import {
  emitShipCombatEffects,
  MODULE_BONUS_EXCLUSIONS,
  summarizeAmmoEffects,
  summarizeCatalogItemEffects,
  summarizeCombatSpecialEffects,
  summarizeEffect,
  summarizeModuleBonuses,
  summarizeModuleEffects,
} from './combat-effects.ts';
import { withDisplayRenderBuffer } from './helpers.ts';

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
};

test('summarizeCombatSpecialEffects uses integer percents without scaling 1 to 100%', () => {
  expect(summarizeCombatSpecialEffects({ lifesteal_pct: 1 })).toBe('lifesteal 1%');
  expect(summarizeCombatSpecialEffects({ lifesteal_pct: 20 })).toBe('lifesteal 20%');
});

test('a non-numeric percent combat effect is omitted', () => {
  expect(summarizeCombatSpecialEffects({ lifesteal_pct: 'nope' })).toBe('');
});

test('summarizeAmmoEffects still scales damage_mod 1.0 to 100%', () => {
  expect(summarizeAmmoEffects({ effect: { ammo: { damage_mod: 1.0 } } })).toBe('damage 100%');
  expect(summarizeAmmoEffects(antimatterTorpedoes)).toBe('damage 100%, armor bypass 30%, shield bypass 30%');
});

test('untraceable false prints damage 100% and omits untraceable', () => {
  const summary = summarizeAmmoEffects({ effect: { ammo: { damage_mod: 1, untraceable: false } } });
  expect(summary).toBe('damage 100%');
  expect(summary).not.toContain('untraceable');
});

test('explicit zero damage_mod prints damage 0%', () => {
  expect(summarizeAmmoEffects({ effect: { ammo: { damage_mod: 0 } } })).toBe('damage 0%');
});

test('ammo summary is empty when effect has no ammo record', () => {
  expect(summarizeAmmoEffects({ effect: { type: 'ammo' } })).toBe('');
});

test('a non-integer ammo percent keeps one decimal', () => {
  expect(summarizeAmmoEffects({ effect: { ammo: { damage_mod: 12.5 } } })).toBe('damage 12.5%');
});

test('shield damage mod prints shield 100%', () => {
  expect(summarizeAmmoEffects({ effect: { ammo: { shield_damage_mod: 1 } } })).toBe('shield 100%');
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

test('an inherited combat-effect key is omitted', () => {
  expect(summarizeCombatSpecialEffects(Object.create({ lifesteal_pct: 20 }))).toBe('');
});

test('a non-finite combat effect is omitted', () => {
  expect(summarizeCombatSpecialEffects({ aoe_radius: Number.NaN, chain_targets: Number.POSITIVE_INFINITY })).toBe('');
});

test('summarizeCombatSpecialEffects formats booleans, durations, and split dot tokens', () => {
  expect(summarizeCombatSpecialEffects({ shield_phase: true })).toBe('shield phase');
  expect(summarizeCombatSpecialEffects({ system_disable_ticks: 1 })).toBe('disable systems 1 tick');
  expect(summarizeCombatSpecialEffects({ duration_ticks: 10 })).toBe('duration 10 ticks');
  expect(summarizeCombatSpecialEffects({ dot_damage: 5, dot_duration: 3 })).toBe('dot 5, dot 3 ticks');
  expect(summarizeCombatSpecialEffects({ mine_duration: 4 })).toBe('mine duration 4 ticks');
});

test('a negative duration combat effect is omitted', () => {
  expect(summarizeCombatSpecialEffects({ duration_ticks: -1 })).toBe('');
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

test('a string combat effect prints chain alpha', () => {
  expect(summarizeCombatSpecialEffects({ chain_targets: 'alpha' })).toBe('chain alpha');
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

test('an empty special string is not appended', () => {
  expect(summarizeModuleBonuses({ reach: 3, special: '' })).toBe('reach 3');
});

test('summarizeModuleBonuses of reach 3 and special 4 is reach 3 and does not contain 4', () => {
  const summary = summarizeModuleBonuses({ reach: 3, special: 4 });
  expect(summary).toBe('reach 3');
  expect(summary).not.toContain('4');
});

test('an inherited module bonus is an empty string', () => {
  expect(summarizeModuleBonuses(Object.create({ reach: 3 }))).toBe('');
});

test('MODULE_BONUS_EXCLUSIONS includes required_skills', () => {
  expect(MODULE_BONUS_EXCLUSIONS.has('required_skills')).toBe(true);
  expect(summarizeModuleBonuses({ reach: 3, required_skills: { scanning: 3 } })).toBe('reach 3');
});

test('telescope_grade stays out of the bonus summary and the effects column', () => {
  expect(MODULE_BONUS_EXCLUSIONS.has('telescope_grade')).toBe(true);
  expect(summarizeModuleBonuses({ telescope_grade: 2, reach: 1 })).toBe('reach 1');
  expect(summarizeModuleBonuses({ telescope_grade: 0 })).toBe('');
  expect(summarizeModuleBonuses({ telescope_grade: 1 })).toBe('');
  expect(summarizeModuleEffects({ telescope_grade: 2, combat_effects: { lifesteal_pct: 1 } })).toBe('lifesteal 1%');
  expect(summarizeCatalogItemEffects({ telescope_grade: 2, reach: 3 })).toBe('reach 3');
  expect(summarizeCatalogItemEffects({ telescope_grade: 1 })).not.toContain('telescope');
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

test('a string-zero shield bonus is omitted', () => {
  expect(summarizeModuleBonuses({ reach: 3, shield_bonus: '0' })).toBe('reach 3');
});

test('summarizeModuleBonuses drops a non-flag true shield_bonus and keeps reach 3', () => {
  expect(summarizeModuleBonuses({ reach: 3, shield_bonus: true })).toBe('reach 3');
});

test('a non-finite shield_bonus is omitted and the summary does not contain NaN', () => {
  const summary = summarizeModuleBonuses({ reach: 3, shield_bonus: Number.NaN });
  expect(summary).toBe('reach 3');
  expect(summary).not.toContain('NaN');
});

test('omitted passenger fields leave only reach', () => {
  expect(summarizeModuleBonuses({ passenger_bonus: 4, dining_rate: 2, leisure_power: 1, reach: 3 })).toBe('reach 3');
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

test('a non-record resistance bonus is omitted', () => {
  expect(summarizeModuleBonuses({ resistance_bonus: 10, reach: 2 })).toBe('reach 2');
});

test('a zero resistance map entry is omitted', () => {
  const summary = summarizeModuleBonuses({ resistance_bonus: { em: 0, thermal: 10 } });
  expect(summary).toBe('thermal +10');
  expect(summary).not.toContain('em');
});

test('summarizeModuleBonuses prints an unsigned flux_power suffix as flux 3', () => {
  expect(summarizeModuleBonuses({ flux_power: 3 })).toBe('flux 3');
});

test('summarizeModuleBonuses prints hazard percents, including 0, apart from damage-type resistance', () => {
  const summary = summarizeModuleBonuses({
    mining_power: 16,
    cargo_bonus: -15,
    hazard_mining_reduction: 50,
    hazard_scan_filter: 0,
    hazard_resistance: { radiation: 40, scar_dust: 0, debris: 95 },
    resistance_bonus: { em: 30 },
  });
  expect(summary).toBe(
    'mining 16, cargo -15, hazard radiation 40, hazard scar_dust 0, hazard debris 95, hazard mining reduction 50, hazard scan filter 0, em +30',
  );
  expect(summary).not.toContain('hazard mining 50');
  expect(summary).not.toContain('radiation +');
  expect(summary).not.toContain('em +70');
  expect(summary).not.toContain('90');
});

test('summarizeModuleBonuses keeps sent hazard key order and skips a non-finite entry', () => {
  expect(
    summarizeModuleBonuses({
      hazard_resistance: { scar_dust: 10, debris: Number.NaN, radiation: 0 },
    }),
  ).toBe('hazard scar_dust 10, hazard radiation 0');
});

test('summarizeModuleBonuses omits empty, omitted, and non-numeric hazard fields', () => {
  expect(summarizeModuleBonuses({ hazard_resistance: {} })).toBe('');
  expect(summarizeModuleBonuses({ hazard_resistance: { radiation: '40' } })).toBe('');
  expect(summarizeModuleBonuses({ hazard_resistance: 40 })).toBe('');
  expect(summarizeModuleBonuses({ hazard_mining_reduction: '50' })).toBe('');
  expect(summarizeModuleBonuses({ hazard_scan_filter: true })).toBe('');
  expect(summarizeModuleBonuses({ hazard_mining_reduction: Number.POSITIVE_INFINITY })).toBe('');
  expect(summarizeModuleBonuses({ hazard_scan_filter: null })).toBe('');
  expect(summarizeModuleBonuses({ mining_power: 16 })).toBe('mining 16');
  expect(
    summarizeModuleBonuses(Object.create({ hazard_mining_reduction: 50, hazard_resistance: { radiation: 10 } })),
  ).toBe('');
});

test('summarizeModuleBonuses prints hazard negative and negative zero as sent', () => {
  expect(summarizeModuleBonuses({ hazard_mining_reduction: -0, hazard_scan_filter: -4 })).toBe(
    'hazard mining reduction 0, hazard scan filter -4',
  );
});

test('summarizeCatalogItemEffects does not turn a sealant buff into a hazard bonus', () => {
  expect(
    summarizeCatalogItemEffects({
      description: 'Cuts hazard damage by 20% for 60 ticks. The total caps at 90%.',
      effect: { type: 'buff', amount: 20, stat: 'hazard_resistance', duration: 60 },
    }),
  ).toBe('');
  expect(summarizeEffect({ type: 'buff', amount: 20, stat: 'hazard_resistance', duration: 60 })).toBe(
    'type: buff, amount: 20, stat: hazard_resistance, duration: 60',
  );
});

test('a non-mechanical module key is omitted', () => {
  expect(summarizeModuleBonuses({ reach: 3, custom_stat: 4 })).toBe('reach 3');
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

test('summarizeEffect prints boolean scalars', () => {
  expect(summarizeEffect(true)).toBe('true');
  expect(summarizeEffect(false)).toBe('false');
});

test('an explicit zero effect scalar prints 0', () => {
  expect(summarizeEffect(0)).toBe('0');
});

test('a bigint effect scalar is an empty summary and does not contain 1', () => {
  const summary = summarizeEffect(1n);
  expect(summary).toBe('');
  expect(summary).not.toContain('1');
});

test('summarizeEffect turns null, undefined, and an empty string into an empty summary', () => {
  expect(summarizeEffect(null)).toBe('');
  expect(summarizeEffect(undefined)).toBe('');
  expect(summarizeEffect('')).toBe('');
});

test('summarizeEffect drops an empty array', () => {
  const summary = summarizeEffect({ list: [] });
  expect(summary).toBe('');
  expect(summary).not.toContain('list');
});

test('a numeric ammo effect type is printed', () => {
  expect(summarizeEffect({ type: 2, ammo: { damage_mod: 1 } })).toBe('type: 2, damage 100%');
});

test('a boolean ammo effect type is printed', () => {
  expect(summarizeEffect({ type: true, ammo: { damage_mod: 1 } })).toBe('type: true, damage 100%');
});

test('a whitespace effect type skips the type prefix and prints damage 100%', () => {
  expect(summarizeEffect({ type: '   ', ammo: { damage_mod: 1 } })).toBe('damage 100%');
});

test('an object ammo effect type is omitted and does not stringify', () => {
  const summary = summarizeEffect({ type: { kind: 'ammo' }, ammo: { damage_mod: 1 } });
  expect(summary).toBe('damage 100%');
  expect(summary).not.toContain('object Object');
});

test('summarizeEffect drops an empty nested record', () => {
  expect(summarizeEffect({ foo: {} })).toBe('');
});

test('summarizeEffect drops an empty-string scalar field', () => {
  const summary = summarizeEffect({ note: '' });
  expect(summary).toBe('');
  expect(summary).not.toContain('note');
});

test('armor melt without ticks prints the percent alone', () => {
  expect(summarizeAmmoEffects({ effect: { ammo: { armor_melt_pct: 0.2 } } })).toBe('armor melt 20%');
});

test('armor melt ticks without a percent omit the armor melt token', () => {
  expect(summarizeAmmoEffects({ effect: { ammo: { armor_melt_ticks: 4 } } })).toBe('');
});

test('armor melt with zero ticks prints the percent alone', () => {
  const summary = summarizeAmmoEffects({ effect: { ammo: { armor_melt_pct: 0.2, armor_melt_ticks: 0 } } });
  expect(summary).toBe('armor melt 20%');
  expect(summary).not.toContain('/0t');
});

test('a burn with ticks prints the percent and duration', () => {
  expect(summarizeAmmoEffects({ effect: { ammo: { dot_pct: 0.2, dot_ticks: 4 } } })).toBe('burn 20%/4t');
});

test('burn without ticks prints the percent alone', () => {
  expect(summarizeAmmoEffects({ effect: { ammo: { dot_pct: 0.2 } } })).toBe('burn 20%');
});

test('burn ticks without a percent omit the burn token', () => {
  expect(summarizeAmmoEffects({ effect: { ammo: { dot_ticks: 4 } } })).toBe('');
});

test('dot_ticks 0 prints burn 20% and does not print /0t', () => {
  const summary = summarizeAmmoEffects({ effect: { ammo: { dot_pct: 0.2, dot_ticks: 0 } } });
  expect(summary).toBe('burn 20%');
  expect(summary).not.toContain('/0t');
});

test('positive accuracy prints a leading plus', () => {
  expect(summarizeAmmoEffects({ effect: { ammo: { hit_chance_mod: 0.1 } } })).toBe('accuracy +10%');
});

test('anti_small_mod 0.1 prints small +10%', () => {
  expect(summarizeAmmoEffects({ effect: { ammo: { anti_small_mod: 0.1 } } })).toBe('small +10%');
});

test('anti_large_mod 0.1 prints large +10%', () => {
  expect(summarizeAmmoEffects({ effect: { ammo: { anti_large_mod: 0.1 } } })).toBe('large +10%');
});

test('negative accuracy prints accuracy -10%', () => {
  expect(summarizeAmmoEffects({ effect: { ammo: { hit_chance_mod: -0.1 } } })).toBe('accuracy -10%');
});

test('a non-finite hit_chance_mod is an empty string and does not contain NaN', () => {
  const summary = summarizeAmmoEffects({ effect: { ammo: { hit_chance_mod: Number.NaN } } });
  expect(summary).toBe('');
  expect(summary).not.toContain('NaN');
});

test('hit_chance_mod 0 prints accuracy 0%', () => {
  expect(summarizeAmmoEffects({ effect: { ammo: { hit_chance_mod: 0 } } })).toBe('accuracy 0%');
});

test('anti_drone_mod 0.1 prints drone +10%', () => {
  expect(summarizeAmmoEffects({ effect: { ammo: { anti_drone_mod: 0.1 } } })).toBe('drone +10%');
});

test('disrupt ticks prints the duration', () => {
  expect(summarizeAmmoEffects({ effect: { ammo: { disrupt_ticks: 2 } } })).toBe('disrupt 2 ticks');
});

test('disrupt ticks of 0 prints no disrupt duration', () => {
  expect(summarizeAmmoEffects({ effect: { ammo: { disrupt_ticks: 0 } } })).toBe('');
});

test('a non-finite disrupt_ticks is an empty string and does not contain NaN', () => {
  const summary = summarizeAmmoEffects({ effect: { ammo: { disrupt_ticks: Number.NaN } } });
  expect(summary).toBe('');
  expect(summary).not.toContain('NaN');
});

test('bonus disrupt ticks prints bonus disrupt 2 ticks', () => {
  expect(summarizeAmmoEffects({ effect: { ammo: { disrupt_bonus_ticks: 2 } } })).toBe('bonus disrupt 2 ticks');
});

test('disrupt_bonus_ticks 0 is an empty string and does not contain bonus disrupt', () => {
  const summary = summarizeAmmoEffects({ effect: { ammo: { disrupt_bonus_ticks: 0 } } });
  expect(summary).toBe('');
  expect(summary).not.toContain('bonus disrupt');
});

test('bonus disrupt speed prints the signed percent', () => {
  expect(summarizeAmmoEffects({ effect: { ammo: { disrupt_bonus_speed: 0.1 } } })).toBe('bonus disrupt speed +10%');
});

test('disrupt_bonus_speed 0 is bonus disrupt speed 0% and is not omitted', () => {
  const summary = summarizeAmmoEffects({ effect: { ammo: { disrupt_bonus_speed: 0 } } });
  expect(summary).toBe('bonus disrupt speed 0%');
  expect(summary).not.toBe('');
});

test('disrupt damage prints the signed percent', () => {
  expect(summarizeAmmoEffects({ effect: { ammo: { disrupt_damage: 0.1 } } })).toBe('disrupt damage +10%');
});

test('disrupt_damage 0 prints disrupt damage 0%', () => {
  expect(summarizeAmmoEffects({ effect: { ammo: { disrupt_damage: 0 } } })).toBe('disrupt damage 0%');
});

test('disrupt speed prints the signed percent', () => {
  expect(summarizeAmmoEffects({ effect: { ammo: { disrupt_speed: 0.1 } } })).toBe('disrupt speed +10%');
});

test('disrupt_speed 0 prints disrupt speed 0%', () => {
  expect(summarizeAmmoEffects({ effect: { ammo: { disrupt_speed: 0 } } })).toBe('disrupt speed 0%');
});

test('burn without per-tick damage prints Effects and Burn: 3 ticks', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitShipCombatEffects({ burn_ticks_remaining: 3 }), { plain: true });
  expect(buffer.stdout).toEqual(['Effects:', '  Burn: 3 ticks']);
});

test('explicit zero burn damage prints Effects and Burn: 3 ticks, 0 hull/tick', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitShipCombatEffects({ burn_ticks_remaining: 3, burn_damage_per_tick: 0 }), {
    plain: true,
  });
  expect(buffer.stdout).toEqual(['Effects:', '  Burn: 3 ticks, 0 hull/tick']);
});

test('burn_ticks_remaining 0 leaves stdout empty and does not print Effects or Burn', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitShipCombatEffects({ burn_ticks_remaining: 0 }), { plain: true });
  expect(buffer.stdout).toEqual([]);
  expect(buffer.stdout.join('\n')).not.toContain('Effects');
  expect(buffer.stdout.join('\n')).not.toContain('Burn');
});

test('disruption ticks 0 leaves stdout empty and does not print Disruption', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitShipCombatEffects({ disruption_ticks_remaining: 0 }), { plain: true });
  expect(buffer.stdout).toEqual([]);
  expect(buffer.stdout.join('\n')).not.toContain('Disruption');
});

test('active armor melt prints Armor melt: active for 2 ticks', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitShipCombatEffects({ armor_melt_ticks_remaining: 2 }), { plain: true });
  expect(buffer.stdout.join('\n')).toContain('Armor melt: active for 2 ticks');
});

test('armor melt percent without remaining ticks prints Armor melt: 20%', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitShipCombatEffects({ armor_melt_pct: 0.2 }), { plain: true });
  expect(buffer.stdout).toEqual(['Effects:', '  Armor melt: 20%']);
});

test('armor_melt_pct 0 prints Armor melt: 0% and does not print active', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitShipCombatEffects({ armor_melt_pct: 0 }), { plain: true });
  const stdout = buffer.stdout.join('\n');
  expect(stdout).toContain('Armor melt: 0%');
  expect(stdout).not.toContain('active');
});

test('hull_regen buff equals Effects lines for Buff: hull_regen +5', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitShipCombatEffects({ active_buffs: [{ stat: 'hull_regen', amount: 5 }] }), {
    plain: true,
  });
  expect(buffer.stdout).toEqual(['Effects:', '  Buff: hull_regen +5']);
});

test('a non-record active buff is skipped', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(
    buffer,
    () => emitShipCombatEffects({ active_buffs: [null, { stat: 'hull_regen', amount: 5 }] }),
    { plain: true },
  );
  expect(buffer.stdout).toEqual(['Effects:', '  Buff: hull_regen +5']);
});

test('a non-array active_buffs leaves stdout empty and does not print Buff', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitShipCombatEffects({ active_buffs: { stat: 'hull_regen', amount: 5 } }), {
    plain: true,
  });
  expect(buffer.stdout).toEqual([]);
  expect(buffer.stdout.join('\n')).not.toContain('Buff');
});

test('an empty item_id omits the from clause', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(
    buffer,
    () => emitShipCombatEffects({ active_buffs: [{ stat: 'hull_regen', amount: 5, item_id: '' }] }),
    { plain: true },
  );
  expect(buffer.stdout).toEqual(['Effects:', '  Buff: hull_regen +5']);
});

test('a hull_regen buff with no amount prints Buff: hull_regen', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitShipCombatEffects({ active_buffs: [{ stat: 'hull_regen' }] }), {
    plain: true,
  });
  expect(buffer.stdout).toEqual(['Effects:', '  Buff: hull_regen']);
});

test('a weapon_damage buff with amount 0 prints Buff: weapon_damage 0%', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(
    buffer,
    () => emitShipCombatEffects({ active_buffs: [{ stat: 'weapon_damage', amount: 0 }] }),
    { plain: true },
  );
  expect(buffer.stdout).toEqual(['Effects:', '  Buff: weapon_damage 0%']);
});

test('a buff without a stat prints Buff: buff +5%', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitShipCombatEffects({ active_buffs: [{ amount: 5 }] }), { plain: true });
  expect(buffer.stdout).toEqual(['Effects:', '  Buff: buff +5%']);
});

test('an active buff with an empty-string stat and amount 5 prints Buff: buff +5%', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitShipCombatEffects({ active_buffs: [{ stat: '', amount: 5 }] }), {
    plain: true,
  });
  expect(buffer.stdout).toEqual(['Effects:', '  Buff: buff +5%']);
});

test('expires tick 0 prints on a hull_regen buff', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(
    buffer,
    () => emitShipCombatEffects({ active_buffs: [{ stat: 'hull_regen', expires_at: 0 }] }),
    { plain: true },
  );
  expect(buffer.stdout).toEqual(['Effects:', '  Buff: hull_regen, expires tick 0']);
});
