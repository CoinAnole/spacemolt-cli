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
          ['Fare', ['fare']],
          ['Base', ['base_fare']],
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
      const rows = passengerRows(r.waiting);
      if (!rows) return false;

      emitLine(`\n${c.bright}=== Waiting Passengers @ ${r.station || 'Station'} ===${c.reset}`);
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
