import { c, emitLine, finiteNumber, isRecord } from './helpers.ts';

function formatPercent(value: unknown): string | undefined {
  const number = finiteNumber(value);
  if (number === undefined) return undefined;
  const pct = Math.abs(number) <= 1 ? number * 100 : number;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

function formatSignedPercent(value: unknown): string | undefined {
  const percent = formatPercent(value);
  if (!percent) return undefined;
  const number = finiteNumber(value);
  return number !== undefined && number > 0 ? `+${percent}` : percent;
}

function formatTicks(value: unknown): string | undefined {
  const ticks = finiteNumber(value);
  if (ticks === undefined || ticks <= 0) return undefined;
  return `${ticks} ${ticks === 1 ? 'tick' : 'ticks'}`;
}

function formatBuffAmount(stat: string | undefined, value: unknown): string | undefined {
  const amount = finiteNumber(value);
  if (amount === undefined) return undefined;
  const sign = amount > 0 ? '+' : '';
  const suffix = stat === 'hull_regen' ? '' : '%';
  return `${sign}${amount}${suffix}`;
}

function formatBuffLine(buff: Record<string, unknown>): string | undefined {
  const stat = typeof buff.stat === 'string' && buff.stat ? buff.stat : 'buff';
  const amount = formatBuffAmount(stat, buff.amount);
  const item = typeof buff.item_id === 'string' && buff.item_id ? ` from ${buff.item_id}` : '';
  const expires = finiteNumber(buff.expires_at);
  const expiresText = expires === undefined ? '' : `, expires tick ${expires}`;
  return `Buff: ${[stat, amount].filter(Boolean).join(' ')}${item}${expiresText}`;
}

function pushPercentEffect(parts: string[], label: string, value: unknown): void {
  const percent = formatPercent(value);
  if (percent) parts.push(`${label} ${percent}`);
}

function pushSignedPercentEffect(parts: string[], label: string, value: unknown): void {
  const percent = formatSignedPercent(value);
  if (percent) parts.push(`${label} ${percent}`);
}

export function summarizeAmmoEffects(item: Record<string, unknown>): string {
  const effect = item.effect;
  if (!isRecord(effect) || !isRecord(effect.ammo)) return '';
  const ammo = effect.ammo;
  const parts: string[] = [];

  pushPercentEffect(parts, 'damage', ammo.damage_mod);
  pushPercentEffect(parts, 'hull', ammo.hull_damage_mod);
  pushPercentEffect(parts, 'shield', ammo.shield_damage_mod);
  pushSignedPercentEffect(parts, 'accuracy', ammo.hit_chance_mod);
  pushPercentEffect(parts, 'armor bypass', ammo.armor_bypass);
  pushPercentEffect(parts, 'shield bypass', ammo.shield_bypass);

  const meltPct = formatPercent(ammo.armor_melt_pct);
  if (meltPct) {
    const ticks = finiteNumber(ammo.armor_melt_ticks);
    parts.push(ticks && ticks > 0 ? `armor melt ${meltPct}/${ticks}t` : `armor melt ${meltPct}`);
  }

  const dotPct = formatPercent(ammo.dot_pct);
  if (dotPct) {
    const ticks = finiteNumber(ammo.dot_ticks);
    parts.push(ticks && ticks > 0 ? `burn ${dotPct}/${ticks}t` : `burn ${dotPct}`);
  }

  if (ammo.disrupt_damage !== undefined) pushSignedPercentEffect(parts, 'disrupt damage', ammo.disrupt_damage);
  if (ammo.disrupt_speed !== undefined) pushSignedPercentEffect(parts, 'disrupt speed', ammo.disrupt_speed);
  if (ammo.disrupt_ticks !== undefined) {
    const ticks = formatTicks(ammo.disrupt_ticks);
    if (ticks) parts.push(`disrupt ${ticks}`);
  }
  if (ammo.disrupt_bonus_speed !== undefined) {
    pushSignedPercentEffect(parts, 'bonus disrupt speed', ammo.disrupt_bonus_speed);
  }
  if (ammo.disrupt_bonus_ticks !== undefined) {
    const ticks = formatTicks(ammo.disrupt_bonus_ticks);
    if (ticks) parts.push(`bonus disrupt ${ticks}`);
  }

  pushPercentEffect(parts, 'splash', ammo.splash_pct);
  pushSignedPercentEffect(parts, 'small', ammo.anti_small_mod);
  pushSignedPercentEffect(parts, 'large', ammo.anti_large_mod);
  pushSignedPercentEffect(parts, 'drone', ammo.anti_drone_mod);
  if (ammo.untraceable === true) parts.push('untraceable');

  return parts.join(', ');
}

export function emitShipCombatEffects(ship: Record<string, unknown>): boolean {
  const lines: string[] = [];

  const burnTicks = formatTicks(ship.burn_ticks_remaining);
  if (burnTicks) {
    const damage = finiteNumber(ship.burn_damage_per_tick);
    const damageText = damage === undefined ? '' : `, ${damage} hull/tick`;
    lines.push(`Burn: ${burnTicks}${damageText}`);
  }

  const meltPct = formatPercent(ship.armor_melt_pct);
  const meltTicks = formatTicks(ship.armor_melt_ticks_remaining);
  if (meltPct || meltTicks) {
    const duration = meltTicks ? ` for ${meltTicks}` : '';
    lines.push(`Armor melt: ${meltPct ?? 'active'}${duration}`);
  }

  const disruptionTicks = formatTicks(ship.disruption_ticks_remaining);
  if (disruptionTicks) lines.push(`Disruption: ${disruptionTicks}`);

  const activeBuffs = Array.isArray(ship.active_buffs) ? ship.active_buffs.filter(isRecord) : [];
  for (const buff of activeBuffs) {
    const line = formatBuffLine(buff);
    if (line) lines.push(line);
  }

  if (!lines.length) return false;
  emitLine(`${c.yellow}Effects:${c.reset}`);
  for (const line of lines) emitLine(`  ${line}`);
  return true;
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function summarizeScalarEffectEntry(entry: unknown): string | undefined {
  if (entry === undefined || entry === null || entry === '') return undefined;
  if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') return String(entry);
  return undefined;
}

export function summarizeEffect(value: unknown): string {
  if (!isRecord(value)) return summarizeScalarEffectEntry(value) ?? '';

  // Prefer the shared ammo formatter for nested ammo effect records.
  const ammoSummary = summarizeAmmoEffects({ effect: value });
  if (ammoSummary) {
    const type = text(value.type);
    return type ? `type: ${type}, ${ammoSummary}` : ammoSummary;
  }

  return Object.entries(value)
    .map(([key, entry]) => {
      if (isRecord(entry)) {
        const nested = summarizeEffect(entry);
        return nested ? `${key}: (${nested})` : undefined;
      }
      if (Array.isArray(entry)) {
        const parts = entry.map((item) => summarizeScalarEffectEntry(item) ?? summarizeEffect(item)).filter(Boolean);
        return parts.length ? `${key}: [${parts.join(', ')}]` : undefined;
      }
      const scalar = summarizeScalarEffectEntry(entry);
      return scalar !== undefined ? `${key}: ${scalar}` : undefined;
    })
    .filter(Boolean)
    .join(', ');
}

const COMBAT_EFFECT_LABELS = new Map<string, string>([
  ['anti_drone_pct', 'anti-drone'],
  ['anti_missile_pct', 'anti-missile'],
  ['aoe_radius', 'aoe'],
  ['armor_melt_pct', 'armor melt'],
  ['auto_cloak_on_shield_failure', 'auto-cloak on shield fail'],
  ['capacitor_drain', 'capacitor drain'],
  ['capacitor_transfer_pct', 'capacitor transfer'],
  ['chain_targets', 'chain'],
  ['cpu_damage_pct', 'cpu damage'],
  ['damage_boost_on_hit', 'damage boost on hit'],
  ['dot_damage', 'dot'],
  ['dot_duration', 'dot'],
  ['duration_ticks', 'duration'],
  ['energy_damage_pct', 'energy damage'],
  ['hull_damage_pct', 'hull damage'],
  ['ignore_all_defense', 'ignore all defense'],
  ['ignore_resistance_pct', 'ignore resist'],
  ['lifesteal_pct', 'lifesteal'],
  ['low_cpu_requirement', 'low CPU'],
  ['mine_capacity', 'mine capacity'],
  ['mine_detection', 'mine detection'],
  ['mine_duration', 'mine duration'],
  ['mine_tracking_speed', 'mine tracking'],
  ['module_disable_ticks', 'disable module'],
  ['phase_dodge_pct', 'phase dodge'],
  ['phase_strike_pct', 'phase strike'],
  ['rage_damage_scaling', 'rage scaling'],
  ['random_damage_pct', 'random damage'],
  ['reflect_energy_pct', 'reflect energy'],
  ['repair_from_salvage', 'repair from salvage'],
  ['shield_damage_pct', 'shield damage'],
  ['shield_drain', 'shield drain'],
  ['shield_phase', 'shield phase'],
  ['shield_transfer_pct', 'shield transfer'],
  ['shock_damage', 'shock'],
  ['system_disable_ticks', 'disable systems'],
]);

function humanizeKey(key: string): string {
  return key.replaceAll('_', ' ');
}

function isSkippedEffectValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '' || value === false || value === 0) return true;
  if (typeof value === 'number') return !Number.isFinite(value);
  return typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean';
}

function isDurationEffectKey(key: string): boolean {
  return key.endsWith('_ticks') || key === 'dot_duration' || key === 'mine_duration';
}

function formatCombatSpecialEffectToken(key: string, label: string, value: unknown): string | undefined {
  if (isSkippedEffectValue(value)) return undefined;
  if (value === true) return label;
  if (key.endsWith('_pct')) {
    const amount = finiteNumber(value);
    if (amount === undefined) return undefined;
    return `${label} ${amount}%`;
  }
  if (isDurationEffectKey(key)) {
    const ticks = formatTicks(value);
    return ticks ? `${label} ${ticks}` : undefined;
  }
  if (typeof value === 'number' || typeof value === 'string') return `${label} ${value}`;
  return undefined;
}

export function summarizeCombatSpecialEffects(effects: unknown): string {
  if (!isRecord(effects)) return '';
  const parts: string[] = [];

  for (const [key, label] of COMBAT_EFFECT_LABELS) {
    if (!Object.hasOwn(effects, key)) continue;
    const token = formatCombatSpecialEffectToken(key, label, effects[key]);
    if (token) parts.push(token);
  }

  for (const key of Object.keys(effects)) {
    if (COMBAT_EFFECT_LABELS.has(key)) continue;
    const token = formatCombatSpecialEffectToken(key, humanizeKey(key), effects[key]);
    if (token) parts.push(token);
  }

  return parts.join(', ');
}

type BonusSign = 'unsigned' | 'bonus' | 'penalty';

const MODULE_BONUS_LABELS: ReadonlyArray<{ key: string; label: string; sign: BonusSign }> = [
  { key: 'reach', label: 'reach', sign: 'unsigned' },
  { key: 'accuracy_bonus', label: 'accuracy', sign: 'bonus' },
  { key: 'tracking_bonus', label: 'tracking', sign: 'bonus' },
  { key: 'scramble_power', label: 'scramble', sign: 'unsigned' },
  { key: 'disruptor_power', label: 'disruptor', sign: 'unsigned' },
  { key: 'webify_strength', label: 'webify', sign: 'unsigned' },
  { key: 'warp_stabilization', label: 'warp stab', sign: 'unsigned' },
  { key: 'cloak_strength', label: 'cloak', sign: 'unsigned' },
  { key: 'jam_strength', label: 'jam', sign: 'unsigned' },
  { key: 'salvage_bonus', label: 'salvage', sign: 'bonus' },
  { key: 'scanner_power', label: 'scanner', sign: 'unsigned' },
  { key: 'survey_power', label: 'survey', sign: 'unsigned' },
  { key: 'scan_reduction', label: 'scan reduction', sign: 'unsigned' },
  { key: 'targeting_reduction', label: 'targeting reduction', sign: 'unsigned' },
  { key: 'armor_repair_rate', label: 'armor repair', sign: 'unsigned' },
  { key: 'remote_repair_power', label: 'remote repair', sign: 'unsigned' },
  { key: 'passive_repair', label: 'passive repair', sign: 'unsigned' },
  { key: 'tow_speed_penalty', label: 'tow', sign: 'penalty' },
  { key: 'mining_power', label: 'mining', sign: 'unsigned' },
  { key: 'shield_bonus', label: 'shield', sign: 'bonus' },
  { key: 'armor_bonus', label: 'armor', sign: 'bonus' },
  { key: 'hull_bonus', label: 'hull', sign: 'bonus' },
  { key: 'hull_penalty', label: 'hull', sign: 'penalty' },
  { key: 'shield_recharge_bonus', label: 'shield recharge', sign: 'bonus' },
  { key: 'damage_reduction', label: 'damage reduction', sign: 'unsigned' },
  { key: 'reactive_resistance', label: 'reactive resist', sign: 'unsigned' },
  { key: 'armor_bypass_bonus', label: 'armor bypass', sign: 'bonus' },
  { key: 'shield_bypass_bonus', label: 'shield bypass', sign: 'bonus' },
  { key: 'speed_bonus', label: 'speed', sign: 'bonus' },
  { key: 'speed_penalty', label: 'speed', sign: 'penalty' },
  { key: 'cargo_bonus', label: 'cargo', sign: 'bonus' },
  { key: 'cpu_bonus', label: 'cpu', sign: 'bonus' },
  { key: 'power_bonus', label: 'power', sign: 'bonus' },
  { key: 'fuel_efficiency', label: 'fuel efficiency', sign: 'unsigned' },
  { key: 'max_fuel_bonus', label: 'max fuel', sign: 'bonus' },
  { key: 'signature_bonus', label: 'signature', sign: 'bonus' },
  { key: 'precision_factor', label: 'precision', sign: 'unsigned' },
  { key: 'drone_capacity', label: 'drone capacity', sign: 'unsigned' },
  { key: 'drone_bandwidth', label: 'drone bandwidth', sign: 'unsigned' },
];

const MODULE_BONUS_KEYS = new Set(MODULE_BONUS_LABELS.map((entry) => entry.key));

const MODULE_BONUS_EXCLUSIONS = new Set([
  'damage',
  'damage_type',
  'cooldown',
  'magazine_size',
  'ammo_type',
  'cpu_usage',
  'power_usage',
  'required_skills',
  'id',
  'type_id',
  'type',
  'slot',
  'name',
  'description',
  'size',
  'base_value',
  'hidden',
  'quest_item',
  'combat_effects',
  'special',
  'effect',
  'category',
  'stackable',
  'tradeable',
  'rarity',
]);

const MECHANICAL_BONUS_SUFFIX = /^(.*)_(power|strength|bonus|penalty|rate|reduction)$/;

function isTableOnlyPassengerField(key: string): boolean {
  return key.startsWith('passenger') || key.startsWith('dining') || key.startsWith('leisure');
}

function isOmittedBonusValue(value: unknown): boolean {
  return value === undefined || value === null || value === '' || value === false || value === 0;
}

function formatBonusToken(label: string, sign: BonusSign, value: unknown): string | undefined {
  if (isOmittedBonusValue(value) || typeof value === 'boolean') return undefined;
  const amount = finiteNumber(value);
  if (amount === undefined || amount === 0) return undefined;
  if (sign === 'penalty') return `${label} -${Math.abs(amount)}`;
  if (sign === 'bonus') return `${label} ${amount > 0 ? `+${amount}` : `${amount}`}`;
  return `${label} ${amount}`;
}

function mechanicalBonus(key: string): { label: string; sign: BonusSign } | undefined {
  const match = key.match(MECHANICAL_BONUS_SUFFIX);
  if (!match?.[1] || !match[2]) return undefined;
  const suffix = match[2];
  const sign: BonusSign = suffix === 'bonus' ? 'bonus' : suffix === 'penalty' ? 'penalty' : 'unsigned';
  return { label: humanizeKey(match[1]), sign };
}

function pushResistanceBonusTokens(parts: string[], value: unknown): void {
  if (!isRecord(value)) return;
  for (const [resistance, amount] of Object.entries(value)) {
    const token = formatBonusToken(resistance, 'bonus', amount);
    if (token) parts.push(token);
  }
}

export function summarizeModuleBonuses(module: Record<string, unknown>): string {
  const parts: string[] = [];

  for (const { key, label, sign } of MODULE_BONUS_LABELS) {
    if (!Object.hasOwn(module, key)) continue;
    const token = formatBonusToken(label, sign, module[key]);
    if (token) parts.push(token);
  }

  for (const key of Object.keys(module)) {
    if (MODULE_BONUS_KEYS.has(key) || MODULE_BONUS_EXCLUSIONS.has(key) || isTableOnlyPassengerField(key)) continue;
    if (key === 'resistance_bonus') {
      pushResistanceBonusTokens(parts, module[key]);
      continue;
    }
    const fallback = mechanicalBonus(key);
    if (!fallback) continue;
    const token = formatBonusToken(fallback.label, fallback.sign, module[key]);
    if (token) parts.push(token);
  }

  const cse = summarizeCombatSpecialEffects(module.combat_effects);
  if (!cse && typeof module.special === 'string' && module.special) parts.push(module.special);

  return parts.join(', ');
}

export function summarizeModuleEffects(module: Record<string, unknown>): string {
  return [summarizeModuleBonuses(module), summarizeCombatSpecialEffects(module.combat_effects)]
    .filter(Boolean)
    .join(', ');
}

export function summarizeCatalogItemEffects(item: Record<string, unknown>): string {
  return [summarizeAmmoEffects(item), summarizeModuleEffects(item)].filter(Boolean).join('; ');
}
