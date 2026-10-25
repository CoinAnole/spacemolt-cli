import { isAliasCopiedDumpKey } from './dock-state.ts';
import { c, emitLine, formatLiveryName, isRecord, pirateCrewLabel, printCompactTable } from './helpers.ts';
import { emitLeviathanContacts } from './leviathans.ts';

function hasAnyField(rows: Array<Record<string, unknown>>, fields: string[]): boolean {
  return rows.some((row) =>
    fields.some((field) => row[field] !== undefined && row[field] !== null && row[field] !== ''),
  );
}

const SCAN_CONSUMED_KEYS = new Set([
  'poi_id',
  'poi_name',
  'system_id',
  'facility_level',
  'facility_station',
  'scan_power',
  'hops',
  'message',
  'signature_detected',
  'contacts',
  'npcs',
  'pirates',
  'leviathans',
]);

const SHIP_ALIAS_DUMP_KEYS = new Set(['fuel_now', 'fuel_max']);

function isSkippedDumpKey(result: Record<string, unknown>, key: string): boolean {
  return SHIP_ALIAS_DUMP_KEYS.has(key) || isAliasCopiedDumpKey(result, key);
}

export function nativeScanField(result: Record<string, unknown>, key: string): unknown {
  if (isSkippedDumpKey(result, key)) return undefined;
  return result[key];
}

export function nativeRemotePoiId(result: Record<string, unknown>): string | undefined {
  const value = nativeScanField(result, 'poi_id');
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function nativeScalarText(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return value;
  if (isRecord(value) || Array.isArray(value)) return undefined;
  return String(value);
}

function emitNativePresentLine(label: string, value: unknown): void {
  const text = nativeScalarText(value);
  if (text === undefined) return;
  emitLine(`${label}: ${text}`);
}

function formatRevealedDisplay(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const parts = value.filter((item): item is string => typeof item === 'string' && item !== '');
  return parts.length ? parts.join(', ') : undefined;
}

function nativeRecordList(result: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  const value = nativeScanField(result, key);
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function formatScanPirateLine(p: Record<string, unknown>): string {
  const rawName = String(p.name || p.id || 'Unknown');
  const name = formatLiveryName(rawName, p);
  const ship = p.ship_class ? ` (${p.ship_class})` : '';
  const role = typeof p.role === 'string' && p.role.trim() ? ` - ${p.role.trim()}` : '';
  const crewLabel = pirateCrewLabel(p);
  const crew = crewLabel ? ` - ${crewLabel}` : '';
  return `${name}${ship}${role}${crew}`;
}

export function emitSignatureDetectedLine(): void {
  emitLine(`${c.yellow}Cloaked signature sensed, not identified (10 power below detection).${c.reset}`);
}

export function emitFactionScanHeader(result: Record<string, unknown>): void {
  const poiId = nativeScalarText(nativeScanField(result, 'poi_id'));
  const poiName = nativeScalarText(nativeScanField(result, 'poi_name'));
  if (poiName && poiId && poiName !== poiId) emitLine(`POI: ${poiName} (${poiId})`);
  else if (poiId) emitLine(`POI: ${poiId}`);
  else if (poiName) emitLine(`POI: ${poiName}`);

  emitNativePresentLine('System', nativeScanField(result, 'system_id'));

  const facilityLevel = nativeScalarText(nativeScanField(result, 'facility_level'));
  const facilityStation = nativeScalarText(nativeScanField(result, 'facility_station'));
  if (facilityLevel && facilityStation) emitLine(`Facility: L${facilityLevel} at ${facilityStation}`);
  else if (facilityLevel) emitLine(`Facility: L${facilityLevel}`);
  else if (facilityStation) emitLine(`Facility: ${facilityStation}`);

  emitNativePresentLine('Scan power', nativeScanField(result, 'scan_power'));
  emitNativePresentLine('Hops', nativeScanField(result, 'hops'));

  if (nativeScanField(result, 'signature_detected') === true) {
    emitSignatureDetectedLine();
  }

  const message = nativeScanField(result, 'message');
  if (typeof message === 'string' && message !== '') emitLine(message);
}

export function emitFactionScanContacts(result: Record<string, unknown>): void {
  const contacts = nativeRecordList(result, 'contacts');
  if (!contacts.length) return;

  const rows = contacts.map((contact) => ({
    ...contact,
    name_display: contact.username ?? contact.target_id ?? 'unknown',
    cloaked_display: contact.cloaked === true ? 'yes' : contact.cloaked === false ? 'no' : undefined,
    revealed_display: formatRevealedDisplay(contact.revealed_info),
  }));
  const columns: Array<[string, string[]]> = [
    ['Name', ['name_display']],
    ['ID', ['target_id']],
  ];
  if (hasAnyField(rows, ['ship_class'])) columns.push(['Ship', ['ship_class']]);
  if (hasAnyField(rows, ['ship_name'])) columns.push(['Ship name', ['ship_name']]);
  if (hasAnyField(rows, ['hull'])) columns.push(['Hull', ['hull']]);
  if (hasAnyField(rows, ['shield'])) columns.push(['Shield', ['shield']]);
  if (hasAnyField(rows, ['cloaked_display'])) columns.push(['Cloaked', ['cloaked_display']]);
  if (hasAnyField(rows, ['faction_id'])) columns.push(['Faction', ['faction_id']]);
  if (hasAnyField(rows, ['revealed_display'])) columns.push(['Revealed', ['revealed_display']]);
  printCompactTable('Players', rows, columns, { maxCellWidth: 64 });
}

export function emitFactionScanNpcs(result: Record<string, unknown>): void {
  const npcs = nativeRecordList(result, 'npcs');
  if (!npcs.length) return;

  const rows = npcs.map((npc) => ({
    ...npc,
    name_display: npc.name ?? npc.id ?? 'unknown',
  }));
  const columns: Array<[string, string[]]> = [
    ['Name', ['name_display']],
    ['ID', ['id']],
  ];
  if (hasAnyField(rows, ['empire'])) columns.push(['Empire', ['empire']]);
  if (hasAnyField(rows, ['role'])) columns.push(['Role', ['role']]);
  if (hasAnyField(rows, ['ship_class'])) columns.push(['Class', ['ship_class']]);
  printCompactTable('Empire NPCs', rows, columns);
}

export function emitFactionScanPirates(result: Record<string, unknown>): void {
  const pirates = nativeRecordList(result, 'pirates');
  if (!pirates.length) return;

  emitLine(`\n${c.red}Pirates (${pirates.length}):${c.reset}`);
  for (const pirate of pirates) emitLine(`  ${formatScanPirateLine(pirate)}`);
}

function isLeftoverScalar(value: unknown): boolean {
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value !== '';
  return false;
}

function emitFactionScanLeftovers(result: Record<string, unknown>): void {
  for (const key of Object.keys(result)) {
    if (SCAN_CONSUMED_KEYS.has(key) || isSkippedDumpKey(result, key)) continue;
    const value = result[key];
    if (Array.isArray(value) || isRecord(value)) continue;
    if (!isLeftoverScalar(value)) continue;
    emitLine(
      `${key
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')}: ${value}`,
    );
  }
}

export function emitFactionScanPoi(result: Record<string, unknown>): void {
  emitFactionScanHeader(result);
  emitFactionScanContacts(result);
  emitFactionScanNpcs(result);
  emitFactionScanPirates(result);
  emitLeviathanContacts(nativeScanField(result, 'leviathans'), 'Leviathans');
  emitFactionScanLeftovers(result);
}
