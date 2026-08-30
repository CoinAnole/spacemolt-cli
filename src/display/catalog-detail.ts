import { summarizeCombatSpecialEffects, summarizeEffect, summarizeModuleBonuses } from './combat-effects.ts';
import { c, emitLine, finiteNumber, isRecord } from './helpers.ts';

const DEDICATED_MODULE_BONUS_KEYS = [
  'reach',
  'accuracy_bonus',
  'scramble_power',
  'disruptor_power',
  'webify_strength',
  'cloak_strength',
  'salvage_bonus',
  'scanner_power',
  'survey_power',
  'armor_repair_rate',
  'remote_repair_power',
  'tow_speed_penalty',
  'crew_capacity_bonus',
  'marine_capacity_bonus',
  'latch_strength',
  'latch_resistance',
  'boarding_defense_bonus_pct',
  'crew_combat_bonus_pct',
  'marine_combat_bonus_pct',
  'medical_treatment_rate',
  'fleet_triage_pct',
  'boarding_capability',
  'boarding_contact_defense',
  'remote_medical_treatment',
] as const;

export function packageOperationLabel(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value === true) return 'yes';
    if (value === false) return 'no';
  }
  return undefined;
}

export function joinStringIds(value: unknown): string {
  if (!Array.isArray(value)) return '';
  if (!value.every((id) => typeof id === 'string')) return '';
  return value.filter((id) => id.length > 0).join(', ');
}

export function summarizeNamedItemQuantities(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .filter(isRecord)
    .map((item) => {
      const quantity = item.quantity ?? '?';
      const name = item.name ?? item.item_name ?? item.item_id ?? item.id ?? 'item';
      return `${quantity}x ${name}`;
    })
    .join(', ');
}

export function summarizePassiveRecipes(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.filter((recipe) => typeof recipe === 'string').join(', ');
}

export function formatShipAvailability(ship: Record<string, unknown>): string {
  const parts: string[] = [];
  if (ship.hidden === true) parts.push('hidden');
  if (ship.legacy === true) parts.push('legacy');
  return parts.join(', ');
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function emitCatalogOptional(label: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return;
  emitLine(`${label}: ${String(value)}`);
}

export function emitCatalogFlag(label: string, value: unknown): void {
  if (value === true) emitLine(`${label}: yes`);
}

export function emitCatalogNumber(label: string, value: unknown): void {
  const number = finiteNumber(value);
  if (number === undefined) return;
  emitLine(`${label}: ${number}`);
}

export function emitCatalogBonus(label: string, value: unknown): void {
  const number = finiteNumber(value);
  if (number === undefined || number === 0) return;
  emitLine(`${label}: ${number}`);
}

export function emitCatalogPercent(label: string, value: unknown): void {
  const number = finiteNumber(value);
  if (number === undefined || number === 0) return;
  emitLine(`${label}: ${number}%`);
}

function emitDetailsHeader(): void {
  emitLine(`\n${c.bright}Details${c.reset}`);
}

function emitCatalogIdentity(entry: Record<string, unknown>, options: { categoryFallback?: boolean } = {}): void {
  const description = text(entry.description);
  if (description) emitLine(description);

  emitCatalogOptional('Size', entry.size);
  emitCatalogOptional('Base value', entry.base_value);
  const category = options.categoryFallback === false ? entry.category : (entry.category ?? entry.type);
  emitCatalogOptional('Category', category);
  emitCatalogOptional('Class', entry.class_name);
  emitCatalogOptional('Tier', entry.tier);
}

function summarizeRequiredSkills(value: unknown): string {
  if (!isRecord(value)) return '';
  return Object.entries(value)
    .filter(([, level]) => level !== undefined && level !== null && level !== '')
    .map(([skill, level]) => `${skill} ${level}`)
    .join(', ');
}

function summarizeLeftoverModuleBonuses(entry: Record<string, unknown>): string {
  const leftover: Record<string, unknown> = { ...entry };
  for (const key of DEDICATED_MODULE_BONUS_KEYS) delete leftover[key];
  delete leftover.combat_effects;
  delete leftover.special;
  return summarizeModuleBonuses(leftover);
}

function summarizeCapabilities(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .filter(isRecord)
    .map((capability) => {
      const parts: string[] = [];
      if (typeof capability.type === 'string' && capability.type.trim()) parts.push(capability.type.trim());
      if (typeof capability.flag === 'string' && capability.flag.trim()) parts.push(capability.flag.trim());
      if (capability.value !== undefined && capability.value !== null && capability.value !== '') {
        parts.push(String(capability.value));
      }
      return parts.join(' ');
    })
    .filter(Boolean)
    .join(', ');
}

function summarizeBuildMaterials(value: unknown): string {
  if (!Array.isArray(value)) return '';
  const parts = value.filter(isRecord).map((item) => {
    const quantity = item.quantity ?? '?';
    const name = item.name ?? item.item_name ?? item.item_id ?? item.id ?? 'item';
    return `${quantity}x ${name}`;
  });
  if (parts.length > 12) return `${parts.slice(0, 12).join(', ')}, ... and ${parts.length - 12} more`;
  return parts.join(', ');
}

export function emitCatalogItemDetail(entry: Record<string, unknown>, catalog: Record<string, unknown>): void {
  emitDetailsHeader();
  emitCatalogIdentity(entry);

  const effect = summarizeEffect(entry.effect);
  if (effect) emitLine(`Effect: ${effect}`);

  const packageOperation = packageOperationLabel(entry.package_operation, catalog.package_operation);
  if (packageOperation) emitLine(`Package operation: ${packageOperation}`);
}

export function emitCatalogModuleDetail(entry: Record<string, unknown>, catalog: Record<string, unknown>): void {
  emitDetailsHeader();
  emitCatalogIdentity(entry, { categoryFallback: false });

  emitCatalogOptional('Slot', entry.slot);
  emitCatalogOptional('Type', entry.type);
  emitCatalogNumber('CPU', entry.cpu_usage);
  emitCatalogNumber('Power', entry.power_usage);
  emitCatalogBonus('Reach', entry.reach);
  emitCatalogBonus('Accuracy', entry.accuracy_bonus);
  emitCatalogBonus('Scramble', entry.scramble_power);
  emitCatalogBonus('Disruptor', entry.disruptor_power);
  emitCatalogBonus('Webify', entry.webify_strength);
  emitCatalogBonus('Cloak', entry.cloak_strength);
  emitCatalogBonus('Salvage', entry.salvage_bonus);
  emitCatalogBonus('Scanner', entry.scanner_power);
  emitCatalogBonus('Survey', entry.survey_power);
  emitCatalogBonus('Repair', entry.armor_repair_rate);
  emitCatalogBonus('Remote repair', entry.remote_repair_power);
  emitCatalogBonus('Tow penalty', entry.tow_speed_penalty);
  emitCatalogBonus('Crew capacity', entry.crew_capacity_bonus);
  emitCatalogBonus('Marine capacity', entry.marine_capacity_bonus);
  emitCatalogBonus('Latch', entry.latch_strength);
  emitCatalogBonus('Latch resistance', entry.latch_resistance);
  emitCatalogPercent('Boarding defense', entry.boarding_defense_bonus_pct);
  emitCatalogPercent('Crew combat', entry.crew_combat_bonus_pct);
  emitCatalogPercent('Marine combat', entry.marine_combat_bonus_pct);
  emitCatalogBonus('Medical', entry.medical_treatment_rate);
  emitCatalogPercent('Fleet triage', entry.fleet_triage_pct);
  emitCatalogFlag('Boarding', entry.boarding_capability);
  emitCatalogFlag('Boarding contact defense', entry.boarding_contact_defense);
  emitCatalogFlag('Remote medical', entry.remote_medical_treatment);
  emitCatalogNumber('Damage', entry.damage);
  emitCatalogOptional('Damage type', entry.damage_type);
  emitCatalogNumber('Cooldown', entry.cooldown);
  emitCatalogNumber('Magazine', entry.magazine_size);
  emitCatalogOptional('Ammo', entry.ammo_type);

  const requiredSkills = summarizeRequiredSkills(entry.required_skills);
  if (requiredSkills) emitLine(`Required skills: ${requiredSkills}`);

  const combat = summarizeCombatSpecialEffects(entry.combat_effects);
  if (combat) emitLine(`Combat: ${combat}`);

  const bonuses = summarizeLeftoverModuleBonuses(entry);
  if (bonuses) emitLine(`Bonuses: ${bonuses}`);

  emitCatalogOptional('Special', entry.special);
  emitCatalogFlag('Hidden', entry.hidden);

  const effect = summarizeEffect(entry.effect);
  if (effect) emitLine(`Effect: ${effect}`);

  const packageOperation = packageOperationLabel(entry.package_operation, catalog.package_operation);
  if (packageOperation) emitLine(`Package operation: ${packageOperation}`);
}

export function emitCatalogShipDetail(entry: Record<string, unknown>, _catalog: Record<string, unknown>): void {
  emitDetailsHeader();
  const description = text(entry.description);
  if (description) emitLine(description);

  emitCatalogOptional('Class', entry.class);
  emitCatalogOptional('Tier', entry.tier);
  emitCatalogOptional('Scale', entry.scale);
  emitCatalogOptional('Empire', entry.empire ?? entry.faction);

  emitCatalogNumber('Hull', entry.base_hull);
  const shield = finiteNumber(entry.base_shield);
  if (shield !== undefined) {
    const recharge = finiteNumber(entry.base_shield_recharge);
    const suffix = recharge === undefined ? '' : ` (+${recharge}/tick)`;
    emitLine(`Shield: ${shield}${suffix}`);
  }
  emitCatalogNumber('Armor', entry.base_armor);
  emitCatalogNumber('Speed', entry.base_speed);
  emitCatalogNumber('Fuel', entry.base_fuel);
  emitCatalogNumber('Cargo', entry.cargo_capacity);
  emitCatalogNumber('CPU', entry.cpu_capacity);
  emitCatalogNumber('Power', entry.power_capacity);

  const weapon = finiteNumber(entry.weapon_slots);
  const defense = finiteNumber(entry.defense_slots);
  const utility = finiteNumber(entry.utility_slots);
  if (weapon !== undefined || defense !== undefined || utility !== undefined) {
    emitLine(`Slots: ${weapon ?? 0} weapon, ${defense ?? 0} defense, ${utility ?? 0} utility`);
  }

  emitCatalogNumber('Crew capacity', entry.crew_capacity);
  emitCatalogNumber('Minimum crew', entry.minimum_crew);
  emitCatalogNumber('Marine capacity', entry.marine_capacity);
  emitCatalogNumber('Latch resistance', entry.latch_resistance);
  emitCatalogPercent('Boarding defense', entry.boarding_defense_bonus_pct);

  emitCatalogNumber('Shipyard tier', entry.shipyard_tier);
  emitCatalogNumber('Build time', entry.build_time);
  if (typeof entry.price === 'number' && Number.isFinite(entry.price)) emitLine(`Price: ${entry.price}`);

  const loadout = joinStringIds(entry.default_modules);
  if (loadout) emitLine(`Default loadout: ${loadout}`);

  const requiredItems = summarizeNamedItemQuantities(entry.required_items);
  if (requiredItems) emitLine(`Required items: ${requiredItems}`);

  emitCatalogNumber('Reputation', entry.required_reputation);
  emitCatalogOptional('Achievement', entry.required_achievement);
  emitCatalogOptional('Faction achievement', entry.required_faction_achievement);
  emitCatalogFlag('Faction leader', entry.required_faction_leader);
  emitCatalogOptional('Lock', entry.prestige_lock);

  const availability = formatShipAvailability(entry);
  if (availability) emitLine(`Availability: ${availability}`);

  const recipes = summarizePassiveRecipes(entry.passive_recipes);
  if (recipes) emitLine(`Passive recipes: ${recipes}`);

  const capabilities = summarizeCapabilities(entry.inherent_capabilities);
  if (capabilities) emitLine(`Capabilities: ${capabilities}`);

  const materials = summarizeBuildMaterials(entry.build_materials);
  if (materials) emitLine(`Build materials: ${materials}`);
}
