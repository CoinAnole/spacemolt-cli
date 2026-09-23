import {
  c,
  commandNameEquals,
  emitLine,
  formatIntegerText,
  formatter,
  isRecord,
  printCompactTable,
  type ResultFormatter,
} from './helpers.ts';

function formatCitizenshipId(value: unknown, key?: string): string | undefined {
  if (isRecord(value)) {
    const id = value.empire_id ?? value.id ?? value.name ?? key;
    return id === undefined || id === null || id === '' ? undefined : String(id);
  }
  if (typeof value === 'string') return value;
  if (value === true && key) return key;
  return undefined;
}

function formatCitizenships(value: unknown): string | undefined {
  const citizenships = Array.isArray(value)
    ? value.map((entry) => formatCitizenshipId(entry))
    : isRecord(value)
      ? Object.entries(value).map(([key, entry]) => {
          if (entry === undefined || entry === null || entry === false) return undefined;
          return formatCitizenshipId(entry, key);
        })
      : [];

  const unique = [...new Set(citizenships.filter((citizenship): citizenship is string => Boolean(citizenship)))];
  return unique.length ? unique.join(', ') : undefined;
}

function playerCitizenshipValue(player: Record<string, unknown>): unknown {
  if (Object.hasOwn(player, 'citizenships')) return player.citizenships;
  if (Object.hasOwn(player, 'held_citizenships')) return player.held_citizenships;
  if (Object.hasOwn(player, 'citizenship')) return player.citizenship;
  return undefined;
}

export function emitCitizenshipsLine(player: Record<string, unknown>, treatOmittedAsNone: boolean): void {
  const present =
    Object.hasOwn(player, 'citizenships') ||
    Object.hasOwn(player, 'held_citizenships') ||
    Object.hasOwn(player, 'citizenship');
  if (!present && !treatOmittedAsNone) return;
  const formatted = formatCitizenships(playerCitizenshipValue(player));
  emitLine(`Citizenships: ${formatted ?? 'none'}`);
}

function isDryRunLike(result: Record<string, unknown>): boolean {
  return typeof result.method === 'string' && typeof result.url === 'string' && Object.hasOwn(result, 'payload');
}

function isCitizenshipResponse(result: Record<string, unknown>): boolean {
  if (typeof result.origin === 'string') return true;
  if (Array.isArray(result.citizenships)) return true;
  if (isRecord(result.citizenship)) return true;
  if (Array.isArray(result.empires)) return true;
  if (Array.isArray(result.pending_petitions)) return true;
  if (Array.isArray(result.recent_decisions)) return true;
  if (Array.isArray(result.renounced)) return true;
  if (isRecord(result.petition)) return true;
  if (Object.hasOwn(result, 'petition_id')) return true;
  if (Object.hasOwn(result, 'fee_paid')) return true;
  if (Object.hasOwn(result, 'fee_refunded')) return true;
  return Object.hasOwn(result, 'empire_id') && (Object.hasOwn(result, 'status') || Object.hasOwn(result, 'message'));
}

function citizenshipHeading(command: string | undefined): string {
  if (commandNameEquals(command, 'citizenship_apply')) return 'Citizenship Application';
  if (commandNameEquals(command, 'citizenship_renounce')) return 'Citizenship Renounced';
  if (commandNameEquals(command, 'citizenship_withdraw')) return 'Application Withdrawn';
  return 'Citizenship';
}

function treatOmittedRemainingAsNone(command: string | undefined): boolean {
  return commandNameEquals(command, 'citizenship_list') || commandNameEquals(command, 'citizenship_renounce');
}

function remainingCitizenshipsInput(result: Record<string, unknown>): { present: boolean; value: unknown } {
  if (Object.hasOwn(result, 'citizenships')) return { present: true, value: result.citizenships };
  if (Object.hasOwn(result, 'citizenship')) return { present: true, value: result.citizenship };
  return { present: false, value: undefined };
}

function isCitizenshipGrant(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && (value.empire_id !== undefined || value.granted_at !== undefined);
}

function citizenshipGrantRows(value: unknown): Array<Record<string, unknown>> | undefined {
  const entries = Array.isArray(value) ? value : isCitizenshipGrant(value) ? [value] : [];
  if (!entries.length || !entries.every(isRecord)) return undefined;
  return entries.map((row) => ({
    empire_id: formatCitizenshipId(row) ?? row.empire_id,
    granted_at: row.granted_at,
    granted_by: row.granted_by,
  }));
}

function hasAnyField(rows: Array<Record<string, unknown>>, field: string): boolean {
  return rows.some((row) => row[field] !== undefined && row[field] !== null && row[field] !== '');
}

function citizenshipGrantColumns(rows: Array<Record<string, unknown>>): Array<[string, string[]]> {
  const columns: Array<[string, string[]]> = [
    ['Empire', ['empire_id']],
    ['Granted', ['granted_at']],
  ];
  if (hasAnyField(rows, 'granted_by')) columns.push(['By', ['granted_by']]);
  return columns;
}

function emitRemainingCitizenships(result: Record<string, unknown>, treatOmittedAsNone: boolean): void {
  const { present, value } = remainingCitizenshipsInput(result);
  if (!present && !treatOmittedAsNone) return;

  const grantRows = citizenshipGrantRows(value);
  if (grantRows?.length) {
    printCompactTable('Citizenships', grantRows, citizenshipGrantColumns(grantRows));
    return;
  }

  const formatted = formatCitizenships(value);
  emitLine(`Citizenships: ${formatted ?? 'none'}`);
}

function formatCredits(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return `${value.toLocaleString()} cr`;
}

function formatNumber(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value.toLocaleString();
}

function formatBoolean(value: unknown): string | undefined {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return undefined;
}

function formatHeldCitizenships(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  return formatCitizenships(value);
}

function emitScalar(label: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return;
  emitLine(`${label}: ${value}`);
}

function feeCredits(value: unknown): string | undefined {
  const formatted = formatCredits(value);
  if (formatted !== undefined) return formatted;
  if (typeof value !== 'bigint') return undefined;
  const text = formatIntegerText(value);
  return text === undefined ? undefined : `${text} cr`;
}

function emitFee(label: string, value: unknown): void {
  const formatted = feeCredits(value);
  if (!formatted) return;
  emitLine(`${label}: ${formatted}`);
}

function emitPetition(petition: Record<string, unknown>): void {
  emitLine('Petition:');
  const empire = formatCitizenshipId(petition);
  if (empire) emitLine(`  Empire: ${empire}`);
  if (petition.status !== undefined && petition.status !== null && petition.status !== '') {
    emitLine(`  Status: ${petition.status}`);
  }
  const fee = feeCredits(petition.fee_paid);
  if (fee) emitLine(`  Fee: ${fee}`);
  if (petition.id !== undefined && petition.id !== null && petition.id !== '') {
    emitLine(`  ID: ${petition.id}`);
  }
}

function petitionRows(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value.filter(isRecord);
  return rows.length ? rows : undefined;
}

function projectPetitionRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    empire_id: formatCitizenshipId(row) ?? row.empire_id,
    status: row.status,
    fee_paid: formatCredits(row.fee_paid) ?? row.fee_paid,
    id: row.id,
    decision: row.decision,
    held_citizenships: formatHeldCitizenships(row.held_citizenships),
  };
}

function petitionColumns(
  rows: Array<Record<string, unknown>>,
  options: { decision?: boolean } = {},
): Array<[string, string[]]> {
  const columns: Array<[string, string[]]> = [
    ['Empire', ['empire_id']],
    ['Status', ['status']],
    ['Fee', ['fee_paid']],
    ['ID', ['id']],
  ];
  if (options.decision && hasAnyField(rows, 'decision')) columns.push(['Decision', ['decision']]);
  if (hasAnyField(rows, 'held_citizenships')) columns.push(['Held', ['held_citizenships']]);
  return columns;
}

function emitPetitionTable(title: string, value: unknown, options: { decision?: boolean } = {}): void {
  const rows = petitionRows(value);
  if (!rows) return;
  const projected = rows.map(projectPetitionRow);
  printCompactTable(title, projected, petitionColumns(projected, options), { maxCellWidth: 40 });
}

function projectEmpirePolicy(row: Record<string, unknown>): Record<string, unknown> {
  return {
    empire_name: row.empire_name,
    empire_id: row.empire_id,
    is_citizen: formatBoolean(row.is_citizen) ?? row.is_citizen,
    open: formatBoolean(row.open) ?? row.open,
    exclusive: formatBoolean(row.exclusive) ?? row.exclusive,
    auto_approve: formatBoolean(row.auto_approve) ?? row.auto_approve,
    fee: formatCredits(row.fee) ?? row.fee,
    min_balance: formatCredits(row.min_balance) ?? row.min_balance,
    min_reputation: formatNumber(row.min_reputation) ?? row.min_reputation,
    your_reputation: formatNumber(row.your_reputation) ?? row.your_reputation,
    eligible: formatBoolean(row.eligible) ?? row.eligible,
    ineligible_reason: row.ineligible_reason,
  };
}

function empirePolicyColumns(rows: Array<Record<string, unknown>>): Array<[string, string[]]> {
  const columns: Array<[string, string[]]> = [
    ['Empire', ['empire_name']],
    ['ID', ['empire_id']],
    ['Citizen', ['is_citizen']],
    ['Open', ['open']],
    ['Exclusive', ['exclusive']],
    ['Auto', ['auto_approve']],
    ['Fee', ['fee']],
    ['Min bal', ['min_balance']],
    ['Min rep', ['min_reputation']],
    ['Your rep', ['your_reputation']],
    ['Eligible', ['eligible']],
  ];
  if (hasAnyField(rows, 'ineligible_reason')) columns.push(['Reason', ['ineligible_reason']]);
  return columns;
}

function emitEmpires(value: unknown): void {
  if (!Array.isArray(value)) return;
  const rows = value.filter(isRecord);
  if (!rows.length) return;
  const projected = rows.map(projectEmpirePolicy);
  printCompactTable('Empires', projected, empirePolicyColumns(projected), { maxCellWidth: 40 });
}

function emitRules(value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) return;
  for (const rule of value) {
    if (typeof rule === 'string' && rule) emitLine(rule);
  }
}

function emitRenounced(result: Record<string, unknown>): void {
  if (!Object.hasOwn(result, 'renounced')) return;
  emitLine(`Renounced: ${formatCitizenships(result.renounced) ?? 'none'}`);
}

function renderCitizenshipResponse(result: Record<string, unknown>, command: string | undefined): boolean {
  if (isDryRunLike(result)) return false;
  if (!isCitizenshipResponse(result)) return false;

  emitLine(`\n${c.bright}=== ${citizenshipHeading(command)} ===${c.reset}`);
  if (typeof result.message === 'string' && result.message) emitLine(result.message);
  emitScalar('Status', result.status);
  emitScalar('Empire', result.empire_id);
  emitScalar('Origin', result.origin);
  emitRemainingCitizenships(result, treatOmittedRemainingAsNone(command));
  emitRenounced(result);
  emitFee('Fee paid', result.fee_paid);
  emitFee('Fee refunded', result.fee_refunded);
  const petition = result.petition;
  const hasPetition = isRecord(petition);
  if (hasPetition) emitPetition(petition);
  emitPetitionTable('Pending Petitions', result.pending_petitions);
  emitPetitionTable('Recent Decisions', result.recent_decisions, { decision: true });
  emitEmpires(result.empires);
  emitRules(result.rules);
  if (!hasPetition) emitScalar('Petition ID', result.petition_id);
  return true;
}

export const citizenshipFormatters: ResultFormatter[] = [
  formatter((r, command) => renderCitizenshipResponse(r, command), {
    commands: ['citizenship_list', 'citizenship_apply', 'citizenship_renounce', 'citizenship_withdraw'],
  }),
];
