import { commandNameEquals, emitLine, formatIntegerText, isRecord } from './helpers.ts';

export interface FixerAccountLines {
  debt?: string;
  allowance?: string;
  exposure?: string;
  available?: string;
}

const FIXER_ACCOUNT_FIELDS = ['debt', 'allowance', 'exposure', 'available'] as const;

const FIXER_ACCOUNT_LABELS: Record<(typeof FIXER_ACCOUNT_FIELDS)[number], string> = {
  debt: 'Debt',
  allowance: 'Allowance',
  exposure: 'Exposure',
  available: 'Available',
};

/** Finite number or bigint only. No string coercion. */
export function formatFixerInteger(value: unknown): string | undefined {
  return formatIntegerText(value);
}

/**
 * Allowlist: debt, allowance, exposure, available, in that order.
 * Returns undefined when value is not a record or none of the four format.
 * Explicit 0 is kept ("0"). Omitted keys are skipped.
 */
export function fixerAccountLines(value: unknown): FixerAccountLines | undefined {
  if (!isRecord(value)) return undefined;
  const lines: FixerAccountLines = {};
  let any = false;
  for (const field of FIXER_ACCOUNT_FIELDS) {
    const text = formatFixerInteger(value[field]);
    if (text === undefined) continue;
    lines[field] = text;
    any = true;
  }
  return any ? lines : undefined;
}

/** Prints "Fixer:" and one indented line per present field. Returns false when there is nothing to print. */
export function emitFixerAccount(value: unknown): boolean {
  const lines = fixerAccountLines(value);
  if (!lines) return false;
  emitLine('Fixer:');
  for (const field of FIXER_ACCOUNT_FIELDS) {
    const text = lines[field];
    if (text === undefined) continue;
    emitLine(`  ${FIXER_ACCOUNT_LABELS[field]}: ${text}`);
  }
  return true;
}

function readFixerInteger(value: unknown): number | bigint | undefined {
  if (typeof value === 'bigint' || (typeof value === 'number' && Number.isFinite(value))) return value;
  return undefined;
}

/** Debt integer for get_status, get_state, and get_player. Any other command returns undefined. */
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
