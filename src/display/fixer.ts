import { commandNameEquals, emitLine, formatIntegerText, isRecord } from './helpers.ts';

const FIXER_ACCOUNT_FIELDS = ['debt', 'allowance', 'exposure', 'available'] as const;

const FIXER_ACCOUNT_LABELS: Record<(typeof FIXER_ACCOUNT_FIELDS)[number], string> = {
  debt: 'Debt',
  allowance: 'Allowance',
  exposure: 'Exposure',
  available: 'Available',
};

/** Returns false when nothing prints. `leadingBlank` is skipped in that case. */
export function emitFixerAccount(value: unknown, leadingBlank = false): boolean {
  if (!isRecord(value)) return false;
  const lines: string[] = [];
  for (const field of FIXER_ACCOUNT_FIELDS) {
    const text = formatIntegerText(value[field]);
    if (text === undefined) continue;
    lines.push(`  ${FIXER_ACCOUNT_LABELS[field]}: ${text}`);
  }
  if (lines.length === 0) return false;
  if (leadingBlank) emitLine('');
  emitLine('Fixer:');
  for (const line of lines) emitLine(line);
  return true;
}

function readFixerInteger(value: unknown): number | bigint | undefined {
  if (typeof value === 'bigint' || (typeof value === 'number' && Number.isFinite(value))) return value;
  return undefined;
}

export function selectFixerDebt(
  result: Record<string, unknown>,
  command: string | undefined,
): number | bigint | undefined {
  if (
    !commandNameEquals(command, 'get_status') &&
    !commandNameEquals(command, 'get_state') &&
    !commandNameEquals(command, 'get_player')
  ) {
    return undefined;
  }

  if (isRecord(result.player) && Object.hasOwn(result.player, 'fixer_debt')) {
    const debt = readFixerInteger(result.player.fixer_debt);
    return debt;
  }

  if (isRecord(result.missions) && isRecord(result.missions.fixer)) {
    return readFixerInteger(result.missions.fixer.debt);
  }

  return undefined;
}
