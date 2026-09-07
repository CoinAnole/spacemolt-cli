import {
  c,
  emitLine,
  finiteNumber,
  formatDepletionRemainingSuffix,
  isRecord,
  namedFormatter,
  type ResultFormatter,
} from './helpers.ts';

function isMineYield(r: Record<string, unknown>): boolean {
  return (
    r.kind === 'yield' &&
    typeof r.resource_id === 'string' &&
    r.resource_id.length > 0 &&
    finiteNumber(r.quantity) !== undefined &&
    finiteNumber(r.remaining) !== undefined &&
    typeof r.remaining_display === 'string' &&
    r.remaining_display.length > 0
  );
}

function isMineFiltered(r: Record<string, unknown>): boolean {
  return r.kind === 'filtered' && r.filtered === true && typeof r.message === 'string' && r.message.length > 0;
}

function formatResourceLabel(r: Record<string, unknown>): string {
  const id = typeof r.resource_id === 'string' ? r.resource_id : '';
  const name = typeof r.resource_name === 'string' && r.resource_name ? r.resource_name : undefined;
  if (!name || name === id) return id;
  return `${name} (${id})`;
}

function formatXpGained(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const parts = Object.entries(value)
    .filter(([, xp]) => xp !== undefined && xp !== null && xp !== '' && xp !== 0)
    .map(([skill, xp]) => {
      const number = typeof xp === 'number' ? xp : Number(xp);
      const text = typeof xp === 'number' ? xp.toLocaleString() : String(xp);
      const signed = Number.isFinite(number) && number < 0 ? text : `+${text}`;
      return `${skill} ${signed}`;
    });
  return parts.length ? `Skill XP: ${parts.join(', ')}` : undefined;
}

function emitDepositRemaining(r: Record<string, unknown>): void {
  const remainingNum = finiteNumber(r.remaining);
  const display = typeof r.remaining_display === 'string' ? r.remaining_display : '';
  // Unlimited/depleted skip the depletion suffix so we never print -1/N.
  if (remainingNum === -1 || display === 'unlimited') {
    emitLine('Deposit: unlimited');
    return;
  }
  if (remainingNum === 0 || display === 'depleted') {
    emitLine('Deposit: depleted');
    return;
  }
  const maxRemaining = finiteNumber(r.max_remaining);
  const stock = maxRemaining !== undefined ? `${remainingNum}/${maxRemaining}` : display;
  const suffix = r.depletion_percent !== undefined ? formatDepletionRemainingSuffix(r.depletion_percent) : '';
  emitLine(`Deposit: ${stock}${suffix}`);
}

function renderMineYield(r: Record<string, unknown>): void {
  emitLine(`\n${c.bright}=== Mine ===${c.reset}`);
  emitLine(`Mined ${finiteNumber(r.quantity)} ${formatResourceLabel(r)}`);
  emitDepositRemaining(r);
  if (typeof r.drone_id === 'string' && r.drone_id.length > 0) {
    emitLine(`Drone: ${r.drone_id}`);
  }
  const xp = formatXpGained(r.xp_gained);
  if (xp) emitLine(xp);
}

function renderMineFiltered(r: Record<string, unknown>): void {
  emitLine(`\n${c.bright}=== Mine ===${c.reset}`);
  emitLine('No yield this cycle.');
  if (typeof r.message === 'string' && r.message) emitLine(r.message);
}

export const mineFormatters: ResultFormatter[] = [
  namedFormatter(
    'mine',
    ['kind', 'resource_id', 'quantity', 'remaining', 'remaining_display'],
    (r) => {
      if (isMineYield(r)) {
        renderMineYield(r);
        return true;
      }
      if (isMineFiltered(r)) {
        renderMineFiltered(r);
        return true;
      }
      return false;
    },
    { commands: ['mine'], suppressShapeFallbackOnDecline: true },
  ),
];
