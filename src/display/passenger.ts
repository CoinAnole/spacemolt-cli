import { c, emitLine, formatter, isRecord, printCompactTable } from './helpers.ts';

function passengerRows(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isRecord);
}

function berthSummary(result: Record<string, unknown>): string {
  const berths = [
    ['Economy', result.economy_berths],
    ['Business', result.business_berths],
    ['First', result.first_berths],
  ]
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([label, value]) => `${label}: ${value}`);
  return berths.join(' | ');
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function singleUnloadRows(result: Record<string, unknown>): Array<Record<string, unknown>> | undefined {
  if (!hasValue(result.name) && !hasValue(result.base_fare) && !hasValue(result.fare_paid)) return undefined;
  if (Array.isArray(result.delivered) || Array.isArray(result.stranded)) return undefined;
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

export const passengerFormatters = [
  formatter(
    (r) => {
      const rows = passengerRows(r.passengers);
      if (!rows) return false;

      emitLine(`\n${c.bright}=== Passengers Aboard ===${c.reset}`);
      const berths = berthSummary(r);
      if (berths) emitLine(`${c.dim}${berths}${c.reset}`);
      if (rows.length === 0) {
        emitLine('No passengers aboard.');
        return true;
      }

      printCompactTable(
        'Passengers',
        rows,
        [
          ['Name', ['name']],
          ['Class', ['class']],
          ['Destination', ['destination_name', 'destination']],
          ['System', ['destination_system']],
          ['Fare', ['base_fare']],
          ['Bonus', ['speed_bonus']],
          ['Ticks', ['ticks_remaining']],
          ['Bio', ['bio']],
          ['ID', ['citizen_id']],
        ],
        { maxCellWidth: 72 },
      );
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

      printCompactTable(
        'Loaded Passengers',
        rows,
        [
          ['Name', ['name']],
          ['Class', ['class']],
          ['Destination', ['destination_name', 'destination']],
          ['System', ['destination_system']],
          ['Base Fare', ['base_fare']],
          ['Bonus', ['speed_bonus']],
          ['Ticks', ['ticks_remaining']],
          ['ID', ['citizen_id']],
        ],
        { maxCellWidth: 72 },
      );
      return true;
    },
    { commands: ['load_passenger'] },
  ),

  formatter(
    (r) => {
      const deliveredRows = passengerRows(r.delivered);
      const strandedRows = passengerRows(r.stranded);
      const singleRows = singleUnloadRows(r);
      if (!deliveredRows && !strandedRows && !singleRows) return false;

      emitLine(`\n${c.bright}=== Passenger Unload ===${c.reset}`);
      if (hasValue(r.message)) emitLine(String(r.message));
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
        printCompactTable(
          'Delivered Passengers',
          deliveredRows,
          [
            ['Name', ['name']],
            ['Class', ['class']],
            ['Destination', ['destination_name', 'destination']],
            ['System', ['destination_system']],
            ['Base Fare', ['base_fare']],
            ['Bonus', ['speed_bonus']],
            ['Ticks', ['ticks_remaining']],
            ['ID', ['citizen_id']],
          ],
          { maxCellWidth: 72 },
        );
      }

      if (strandedRows) {
        printCompactTable(
          'Stranded Passengers',
          strandedRows,
          [
            ['Name', ['name']],
            ['Class', ['class']],
            ['Destination', ['destination_name', 'destination']],
            ['System', ['destination_system']],
            ['Base Fare', ['base_fare']],
            ['Ticks', ['ticks_remaining']],
            ['ID', ['citizen_id']],
          ],
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
      if (!rows) return false;

      emitLine(`\n${c.bright}=== Waiting Passengers @ ${r.station || 'Station'} ===${c.reset}`);
      if (hasValue(r.fare_surge)) emitLine(`Fare surge: ${r.fare_surge}x`);
      if (hasValue(r.demand_level)) emitLine(`Demand: ${r.demand_level}`);
      if (hasValue(r.market_conditions)) emitLine(`${r.market_conditions}`);
      if (rows.length === 0) {
        emitLine('No passengers waiting.');
        return true;
      }

      printCompactTable(
        'Passengers',
        rows,
        [
          ['Name', ['name']],
          ['Class', ['class']],
          ['Citizenship', ['citizenship']],
          ['Destination', ['destination_name', 'destination']],
          ['System', ['destination_system']],
          ['Est. Fare', ['estimated_fare']],
          ['Bio', ['bio']],
          ['ID', ['citizen_id']],
        ],
        { maxCellWidth: 72 },
      );
      return true;
    },
    { commands: ['list_station_passengers'] },
  ),
];
