import { finiteNumber, isRecord } from './helpers.ts';

const STAGE_HOPS = ['incoming_damage', 'after_shield_resist', 'after_type_resist', 'after_flat_reduction'] as const;

export type BattleDefenseLineKind = 'component' | 'attack';

export type BattleLogAttackRow = {
  tick: unknown;
  from: string;
  to: string;
  hit: string;
  shieldHull: string;
  defense: string;
};

export function formatBattleHitScale(value: unknown): string | undefined {
  const n = finiteNumber(value);
  if (n === undefined) return undefined;
  const pct = Math.abs(n) <= 1 ? n * 100 : n;
  return Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1);
}

export function formatBattleHitChance(value: unknown): string | undefined {
  const scale = formatBattleHitScale(value);
  return scale === undefined ? undefined : `${scale}%`;
}

export function formatShieldHull(shield: unknown, hull: unknown): string {
  const s = finiteNumber(shield);
  const h = finiteNumber(hull);
  if (s !== undefined && h !== undefined) return `${s}/${h}`;
  if (s !== undefined) return `${s}s`;
  if (h !== undefined) return `${h}h`;
  return '';
}

export function resolveCombatantLabel(id: unknown, snapshots: unknown): string {
  const fallback = id === undefined || id === null ? '' : String(id);
  if (!Array.isArray(snapshots)) return fallback;
  for (const snapshot of snapshots) {
    if (!isRecord(snapshot) || snapshot.player_id !== id) continue;
    const username = snapshot.username;
    if (typeof username === 'string' && username) return username;
    return fallback;
  }
  return fallback;
}

export function formatBattleDefenseLine(source: Record<string, unknown>, kind: BattleDefenseLineKind): string {
  if (kind === 'attack') {
    return [
      firstWeaponName(source),
      stringLabel(source.damage_type),
      formatResistBuckets(source),
      formatIgnoredFlag(source),
    ]
      .filter(Boolean)
      .join(' ');
  }

  return [
    stringLabel(source.weapon_name),
    stringLabel(source.damage_type),
    formatStageChain(source),
    formatResistBuckets(source),
    formatComponentFlags(source),
  ]
    .filter(Boolean)
    .join(' ');
}

export function battleLogAttackRows(entries: unknown): BattleLogAttackRow[] {
  if (!Array.isArray(entries)) return [];
  const rows: BattleLogAttackRow[] = [];
  for (const [index, entry] of entries.entries()) {
    if (!isRecord(entry)) continue;
    const tick = entry.tick ?? entry.battle_tick ?? index;
    const snapshots = entry.snapshots;
    const attacks = Array.isArray(entry.attacks) ? entry.attacks.filter(isRecord) : [];
    for (const attack of attacks) {
      appendAttackRows(rows, tick, attack, snapshots);
    }
  }
  return rows;
}

function appendAttackRows(
  rows: BattleLogAttackRow[],
  tick: unknown,
  attack: Record<string, unknown>,
  snapshots: unknown,
): void {
  if (attack.hit_success === false) {
    rows.push(missRow(tick, attack, snapshots));
    return;
  }
  const components = Array.isArray(attack.defense_components) ? attack.defense_components.filter(isRecord) : [];
  if (components.length > 0) {
    for (const component of components) rows.push(attackRowFromComponent(tick, attack, component, snapshots));
    return;
  }
  rows.push(attackRowFromAttack(tick, attack, snapshots));
}

function missRow(tick: unknown, attack: Record<string, unknown>, snapshots: unknown): BattleLogAttackRow {
  return combatantRow(tick, attack, snapshots, 'miss', '', missDefense(attack));
}

function attackRowFromComponent(
  tick: unknown,
  attack: Record<string, unknown>,
  component: Record<string, unknown>,
  snapshots: unknown,
): BattleLogAttackRow {
  return combatantRow(
    tick,
    attack,
    snapshots,
    hitCell(attack.hit_success),
    formatShieldHull(component.shield_damage, component.hull_damage),
    formatBattleDefenseLine(component, 'component'),
  );
}

function attackRowFromAttack(tick: unknown, attack: Record<string, unknown>, snapshots: unknown): BattleLogAttackRow {
  return combatantRow(
    tick,
    attack,
    snapshots,
    hitCell(attack.hit_success),
    formatShieldHull(attack.shield_damage, attack.hull_damage),
    formatBattleDefenseLine(attack, 'attack'),
  );
}

function combatantRow(
  tick: unknown,
  attack: Record<string, unknown>,
  snapshots: unknown,
  hit: string,
  shieldHull: string,
  defense: string,
): BattleLogAttackRow {
  return {
    tick,
    from: resolveCombatantLabel(attack.attacker_id, snapshots),
    to: resolveCombatantLabel(attack.target_id, snapshots),
    hit,
    shieldHull,
    defense,
  };
}

function hitCell(hitSuccess: unknown): string {
  if (hitSuccess === true) return 'hit';
  if (hitSuccess === false) return 'miss';
  return '';
}

function missDefense(attack: Record<string, unknown>): string {
  const parts: string[] = [];
  const chance = formatBattleHitChance(attack.hit_chance);
  if (chance !== undefined) parts.push(`chance ${chance}`);
  const roll = formatBattleHitScale(attack.hit_roll);
  if (roll !== undefined) parts.push(`roll ${roll}`);
  return parts.join(' ');
}

function stringLabel(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function firstWeaponName(source: Record<string, unknown>): string | undefined {
  if (!Array.isArray(source.weapons)) return undefined;
  const weapon = source.weapons.find(isRecord);
  return weapon ? stringLabel(weapon.name) : undefined;
}

function formatStageChain(source: Record<string, unknown>): string {
  return STAGE_HOPS.map((key) => finiteNumber(source[key]))
    .filter((n): n is number => n !== undefined)
    .join('→');
}

function formatResistBuckets(source: Record<string, unknown>): string {
  const parts = (
    [
      ['S', source.shield_resist_pct],
      ['T', source.type_resist_pct],
      ['F', source.flat_reduction_pct],
    ] as const
  )
    .filter(([, value]) => finiteNumber(value) !== undefined)
    .map(([label, value]) => `${label}${finiteNumber(value)}`);
  return parts.length ? `(${parts.join(' ')})` : '';
}

function formatReportedPercent(value: unknown): string | undefined {
  const n = finiteNumber(value);
  return n === undefined ? undefined : `${n}%`;
}

function formatIgnoredFlag(source: Record<string, unknown>): string | undefined {
  const ign = formatReportedPercent(source.ignored_resistance_pct);
  return ign ? `ign ${ign}` : undefined;
}

function formatComponentFlags(source: Record<string, unknown>): string {
  const flags: string[] = [];
  if (source.ignore_all_defense === true) flags.push('bypass');
  const ign = formatIgnoredFlag(source);
  if (ign) flags.push(ign);
  const sbypass = finiteNumber(source.shield_bypass_pct);
  if (sbypass !== undefined && sbypass !== 0) flags.push(`sbypass ${sbypass}%`);
  const abypass = finiteNumber(source.armor_bypass_pct);
  if (abypass !== undefined && abypass !== 0) flags.push(`abypass ${abypass}%`);
  return flags.join(' ');
}
