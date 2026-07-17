import { formatBerthSummary } from './berths.ts';
import { c, emitLine, formatter, isRecord, printCompactTable } from './helpers.ts';

function passengerRows(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isRecord);
}

function berthSummary(result: Record<string, unknown>): string {
  const canonical = formatBerthSummary(result.berths);
  if (canonical) return canonical;
  return [
    ['Economy', result.economy_berths],
    ['Business', result.business_berths],
    ['First', result.first_berths],
  ]
    .filter(
      ([, value]) =>
        (typeof value === 'string' && value !== '') || (typeof value === 'number' && Number.isFinite(value)),
    )
    .map(([label, value]) => `${label}: ${value}`)
    .join(' | ');
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function singleUnloadRows(result: Record<string, unknown>): Array<Record<string, unknown>> | undefined {
  if (!hasValue(result.name) && !hasValue(result.base_fare) && !hasValue(result.fare_paid)) return undefined;
  if (
    Array.isArray(result.delivered) ||
    Array.isArray(result.stranded) ||
    Array.isArray(result.transferred) ||
    Array.isArray(result.checked_in)
  ) {
    return undefined;
  }
  return [result];
}

function reputationChangesSummary(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const parts = Object.entries(value)
    .filter(([, change]) => hasValue(change))
    .map(([empire, change]) => {
      const number = Number(change);
      const prefix = Number.isFinite(number) && number > 0 ? '+' : '';
      return `${empire} ${prefix}${change}`;
    });
  return parts.length ? parts.join(', ') : undefined;
}

function rowsHaveField(rows: Array<Record<string, unknown>>, field: string): boolean {
  return rows.some((row) => hasValue(row[field]));
}

function withOptionalColumn(
  columns: Array<[string, string[]]>,
  rows: Array<Record<string, unknown>>,
  label: string,
  fields: string[],
  afterLabel?: string,
): Array<[string, string[]]> {
  if (!fields.some((field) => rowsHaveField(rows, field))) return columns;
  const next = [...columns];
  const insertAt = afterLabel ? next.findIndex(([labelText]) => labelText === afterLabel) + 1 : next.length;
  const index = insertAt > 0 ? insertAt : next.length;
  next.splice(index, 0, [label, fields]);
  return next;
}

function connectingDisplay(value: unknown): string | undefined {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return undefined;
}

function withConnectingColumn(
  columns: Array<[string, string[]]>,
  rows: Array<Record<string, unknown>>,
  afterLabel = 'Class',
): Array<[string, string[]]> {
  if (!rows.some((row) => row.connecting !== undefined && row.connecting !== null)) return columns;
  const displayRows = rows.map((row) => ({
    ...row,
    connecting_display: connectingDisplay(row.connecting),
  }));
  // Mutate rows in place so table cells see connecting_display.
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const display = displayRows[i];
    if (row && display) row.connecting_display = display.connecting_display;
  }
  return withOptionalColumn(columns, rows, 'Connecting', ['connecting_display'], afterLabel);
}

function passengerTableColumns(
  rows: Array<Record<string, unknown>>,
  options?: {
    includeCitizenship?: boolean;
    includeEstimatedFare?: boolean;
    includeBio?: boolean;
    fareLabel?: string;
    includeBonus?: boolean;
    includeTicks?: boolean;
  },
): Array<[string, string[]]> {
  let columns: Array<[string, string[]]> = [
    ['Name', ['name']],
    ['Class', ['class']],
  ];
  columns = withOptionalColumn(columns, rows, 'Berth', ['berth_class'], 'Class');
  const afterClassContext = rowsHaveField(rows, 'berth_class') ? 'Berth' : 'Class';
  columns = withConnectingColumn(columns, rows, afterClassContext);
  if (options?.includeCitizenship) {
    const afterConnecting = columns.some(([label]) => label === 'Connecting') ? 'Connecting' : afterClassContext;
    columns = withOptionalColumn(columns, rows, 'Citizenship', ['citizenship'], afterConnecting);
  }
  columns.push(['Destination', ['destination_name', 'destination']], ['System', ['destination_system']]);
  if (options?.includeEstimatedFare) {
    columns.push(['Est. Fare', ['estimated_fare']]);
  } else {
    columns.push([options?.fareLabel ?? 'Base Fare', ['base_fare']]);
    if (options?.includeBonus !== false) columns.push(['Bonus', ['speed_bonus']]);
    if (options?.includeTicks !== false) columns.push(['Ticks', ['ticks_remaining']]);
  }
  if (options?.includeBio) columns.push(['Bio', ['bio']]);
  columns.push(['ID', ['citizen_id']]);
  return columns;
}

function emitSkipNotes(result: Record<string, unknown>, fields: string[]): void {
  for (const field of fields) {
    if (!hasValue(result[field])) continue;
    const label = field
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    emitLine(`${label}: ${result[field]}`);
  }
}

function renderTransitLounge(lounge: Record<string, unknown>): void {
  const name = hasValue(lounge.lounge) ? String(lounge.lounge) : 'Transit Lounge';
  emitLine(`\n${c.bright}=== ${name} ===${c.reset}`);
  if (hasValue(lounge.occupancy) || hasValue(lounge.capacity)) {
    emitLine(`Occupancy: ${lounge.occupancy ?? '?'}/${lounge.capacity ?? '?'}`);
  }
  const rows = passengerRows(lounge.passengers) ?? [];
  if (rows.length === 0) {
    emitLine('No connecting passengers in lounge.');
    return;
  }
  printCompactTable('Connecting Passengers', rows, passengerTableColumns(rows), { maxCellWidth: 72 });
}

export const passengerFormatters = [
  formatter(
    (r) => {
      const rows = passengerRows(r.passengers);
      if (!rows) return false;

      emitLine(`\n${c.bright}=== Passengers Aboard ===${c.reset}`);
      const berths = berthSummary(r);
      if (berths) emitLine(`${c.dim}${berths}${c.reset}`);
      if (hasValue(r.onboard_service)) emitLine(`Onboard service: ${r.onboard_service}`);
      if (rows.length === 0) {
        emitLine('No passengers aboard.');
        return true;
      }

      printCompactTable('Passengers', rows, passengerTableColumns(rows, { includeBio: true, fareLabel: 'Fare' }), {
        maxCellWidth: 72,
      });
      return true;
    },
    { commands: ['list_passengers'] },
  ),

  formatter(
    (r) => {
      const rows = passengerRows(r.loaded);
      if (!rows) return false;

      emitLine(`\n${c.bright}=== Passenger Boarding ===${c.reset}`);
      if (hasValue(r.message)) emitLine(String(r.message));
      if (hasValue(r.total_fare)) emitLine(`Total fare: ${r.total_fare}`);
      if (hasValue(r.skipped_unfunded)) emitLine(`Skipped unfunded: ${r.skipped_unfunded}`);

      printCompactTable('Loaded Passengers', rows, passengerTableColumns(rows), { maxCellWidth: 72 });
      return true;
    },
    { commands: ['load_passenger'] },
  ),

  formatter(
    (r) => {
      const transferredRows = passengerRows(r.transferred);
      const checkedInRows = passengerRows(r.checked_in);
      const deliveredRows = passengerRows(r.delivered);
      const strandedRows = passengerRows(r.stranded);
      const singleRows = singleUnloadRows(r);
      if (!transferredRows && !checkedInRows && !deliveredRows && !strandedRows && !singleRows) return false;

      emitLine(`\n${c.bright}=== Passenger Unload ===${c.reset}`);
      if (hasValue(r.message)) emitLine(String(r.message));

      if (transferredRows) {
        if (hasValue(r.target_ship_name) || hasValue(r.target_ship)) {
          const shipLabel = hasValue(r.target_ship_name)
            ? `${r.target_ship_name}${hasValue(r.target_ship) ? ` (${r.target_ship})` : ''}`
            : String(r.target_ship);
          emitLine(`Target ship: ${shipLabel}`);
        }
        if (hasValue(r.count)) emitLine(`Count: ${r.count}`);
        emitSkipNotes(r, ['skipped_expired', 'skipped_no_berth']);
        if (transferredRows.length === 0) {
          emitLine('No passengers transferred.');
        } else {
          printCompactTable('Transferred Passengers', transferredRows, passengerTableColumns(transferredRows), {
            maxCellWidth: 72,
          });
        }
        return true;
      }

      if (checkedInRows) {
        if (hasValue(r.lounge)) emitLine(`Lounge: ${r.lounge}`);
        if (hasValue(r.occupancy) || hasValue(r.capacity)) {
          emitLine(`Occupancy: ${r.occupancy ?? '?'}/${r.capacity ?? '?'}`);
        }
        if (hasValue(r.count)) emitLine(`Count: ${r.count}`);
        if (hasValue(r.deadline_bonus_ticks)) emitLine(`Deadline bonus: ${r.deadline_bonus_ticks} ticks`);
        emitSkipNotes(r, ['skipped_expired', 'skipped_full']);
        if (checkedInRows.length === 0) {
          emitLine('No passengers checked in.');
        } else {
          printCompactTable('Checked-In Passengers', checkedInRows, passengerTableColumns(checkedInRows), {
            maxCellWidth: 72,
          });
        }
        return true;
      }

      if (hasValue(r.fare_collected)) emitLine(`Fare collected: ${r.fare_collected}`);
      const reputation = reputationChangesSummary(r.reputation_changes);
      if (reputation) emitLine(`Reputation changes: ${reputation}`);

      if (singleRows) {
        printCompactTable(
          'Passenger',
          singleRows,
          [
            ['Name', ['name']],
            ['Delivered', ['delivered']],
            ['Base Fare', ['base_fare']],
            ['Bonus', ['speed_bonus']],
            ['Fare Paid', ['fare_paid']],
          ],
          { maxCellWidth: 72 },
        );
        return true;
      }

      if (deliveredRows) {
        printCompactTable('Delivered Passengers', deliveredRows, passengerTableColumns(deliveredRows), {
          maxCellWidth: 72,
        });
      }

      if (strandedRows) {
        printCompactTable(
          'Stranded Passengers',
          strandedRows,
          passengerTableColumns(strandedRows, { includeBonus: false }),
          { maxCellWidth: 72 },
        );
      }

      return true;
    },
    { commands: ['unload_passenger'] },
  ),

  formatter(
    (r) => {
      const rows = passengerRows(r.waiting);
      const lounge = isRecord(r.transit_lounge) ? r.transit_lounge : undefined;
      if (!rows && !lounge) return false;

      emitLine(`\n${c.bright}=== Waiting Passengers @ ${r.station || 'Station'} ===${c.reset}`);
      if (hasValue(r.fare_surge)) emitLine(`Fare surge: ${r.fare_surge}x`);
      if (hasValue(r.demand_level)) emitLine(`Demand: ${r.demand_level}`);
      if (hasValue(r.market_conditions)) emitLine(`${r.market_conditions}`);
      if (!rows || rows.length === 0) {
        emitLine('No passengers waiting.');
      } else {
        printCompactTable(
          'Passengers',
          rows,
          passengerTableColumns(rows, { includeCitizenship: true, includeEstimatedFare: true, includeBio: true }),
          { maxCellWidth: 72 },
        );
      }

      if (lounge) renderTransitLounge(lounge);
      return true;
    },
    { commands: ['list_station_passengers'] },
  ),
];
