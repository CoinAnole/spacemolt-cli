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
  pushSignedPercentEffect(parts, 'wear/shot', ammo.wear_per_shot);

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
