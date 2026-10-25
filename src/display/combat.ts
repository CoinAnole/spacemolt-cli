import { isAliasCopiedDumpKey } from './dock-state.ts';
import { c, commandNameEquals, emitLine, isRecord, namedFormatter, type ResultFormatter } from './helpers.ts';

const PRINTED_ATTACK_KEYS = new Set([
  'action',
  'kind',
  'target',
  'target_name',
  'target_type',
  'battle_id',
  'system',
  'your_side',
  'your_zone',
  'warning',
  'message',
  'auto_docked',
  'auto_undocked',
]);

const SHIP_ALIAS_KEYS = new Set(['fuel_now', 'fuel_max']);

function isAttackReply(result: Record<string, unknown>): boolean {
  if (result.action !== 'attack') return false;
  if (result.kind !== 'npc' && result.kind !== 'player') return false;
  return typeof result.target === 'string' && result.target !== '';
}

function presentText(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value;
}

function labelForScalarKey(key: string): string {
  return key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function emitTarget(result: Record<string, unknown>): void {
  const name = presentText(result.target_name);
  const id = presentText(result.target);
  if (name && id && name !== id) emitLine(`Target: ${name} (${id})`);
  else if (name) emitLine(`Target: ${name}`);
  else if (id) emitLine(`Target: ${id}`);
}

function emitYesNo(label: string, value: unknown): void {
  if (value !== true && value !== false) return;
  emitLine(`${label}: ${value ? 'yes' : 'no'}`);
}

function emitAttackLeftovers(result: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(result)) {
    if (PRINTED_ATTACK_KEYS.has(key) || SHIP_ALIAS_KEYS.has(key) || isAliasCopiedDumpKey(result, key)) continue;
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      emitLine(`${labelForScalarKey(key)}: ${value.length} item(s)`);
      continue;
    }
    if (isRecord(value)) continue;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;
    emitLine(`${labelForScalarKey(key)}: ${String(value)}`);
  }
}

function formatAttackReply(result: Record<string, unknown>, command?: string): boolean {
  if (!isAttackReply(result)) return false;

  const title = commandNameEquals(command, 'hunt') ? 'Hunt' : 'Attack';
  emitLine(`\n${c.bright}=== ${title} ===${c.reset}`);
  emitTarget(result);
  const targetType = presentText(result.target_type);
  if (targetType) emitLine(`Type: ${targetType}`);
  emitLine(`Kind: ${result.kind}`);
  const battleId = presentText(result.battle_id);
  if (battleId) emitLine(`Battle: ${battleId}`);
  const system = presentText(result.system);
  if (system) emitLine(`System: ${system}`);
  if (typeof result.your_side === 'number' && Number.isFinite(result.your_side)) {
    emitLine(`Side: ${result.your_side}`);
  }
  const zone = presentText(result.your_zone);
  if (zone) emitLine(`Zone: ${zone}`);
  emitYesNo('Auto-docked', result.auto_docked);
  emitYesNo('Auto-undocked', result.auto_undocked);
  const warning = presentText(result.warning);
  if (warning) emitLine(`${c.yellow}Warning:${c.reset} ${warning}`);
  const message = presentText(result.message);
  if (message && message !== result.warning) emitLine(message);
  emitAttackLeftovers(result);
  return true;
}

export const combatFormatters: ResultFormatter[] = [
  namedFormatter('attack', ['action', 'kind', 'target'], formatAttackReply, {
    commands: ['attack', 'hunt'],
    suppressShapeFallbackOnDecline: true,
  }),
];
