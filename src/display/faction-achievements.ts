import {
  c,
  emitLine,
  formatExactGroupedInteger,
  formatter,
  isRecord,
  printCompactTable,
  type ResultFormatter,
} from './helpers.ts';

function stringField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function displayCount(value: unknown): string | undefined {
  const grouped = formatExactGroupedInteger(value);
  if (grouped !== undefined) return grouped;
  if (typeof value === 'number' && Number.isFinite(value) && !Number.isInteger(value)) return String(value);
  return undefined;
}

function exactIntegerText(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return formatExactGroupedInteger(value) ?? '?';
}

function pointsCell(value: unknown): string {
  if (value === undefined) return '';
  return displayCount(value) ?? '?';
}

function earnedCell(value: unknown): string {
  if (value === undefined) return '';
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return '?';
}

function hiddenCell(value: unknown): string {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return '';
}

function formatTimestampPreview(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)/.exec(value);
  return match ? `${match[1]} ${match[2]}` : value;
}

function earnedAtCell(value: unknown): string {
  if (typeof value !== 'string' || value === '') return '';
  return formatTimestampPreview(value);
}

function progressSide(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return displayCount(value) ?? '?';
}

function progressCell(progress: unknown): string {
  if (!isRecord(progress)) return '';
  const left = progressSide(progress.current);
  const right = progressSide(progress.target);
  if (left === undefined && right === undefined) return '';
  return `${left ?? '?'}/${right ?? '?'}`;
}

function displayRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    name_display: stringField(row.name),
    id_display: stringField(row.id),
    category_display: stringField(row.category),
    points_display: pointsCell(row.points),
    earned_display: earnedCell(row.earned),
    progress_display: progressCell(row.progress),
    earned_at_display: earnedAtCell(row.earned_at),
    hidden_display: hiddenCell(row.hidden),
  };
}

function tableColumns(rows: Array<Record<string, unknown>>): Array<[string, string[]]> {
  const columns: Array<[string, string[]]> = [
    ['Name', ['name_display']],
    ['ID', ['id_display']],
    ['Category', ['category_display']],
    ['Points', ['points_display']],
    ['Earned', ['earned_display']],
  ];
  if (rows.some((row) => row.progress_display !== '')) columns.push(['Progress', ['progress_display']]);
  if (rows.some((row) => row.earned_at_display !== '')) columns.push(['Earned at', ['earned_at_display']]);
  if (rows.some((row) => row.hidden === true)) columns.push(['Hidden', ['hidden_display']]);
  return columns;
}

function emitSummary(summary: unknown): void {
  if (!isRecord(summary)) return;
  const earned = exactIntegerText(summary.earned);
  const total = exactIntegerText(summary.total);
  if (earned !== undefined && total !== undefined) emitLine(`Earned: ${earned} / ${total}`);
  else if (earned !== undefined) emitLine(`Earned: ${earned}`);
  else if (total !== undefined) emitLine(`Earned: ? / ${total}`);
  const points = exactIntegerText(summary.points);
  if (points !== undefined) emitLine(`Points: ${points}`);
}

function emitDescriptions(rows: Array<Record<string, unknown>>): void {
  const lines: string[] = [];
  for (const row of rows) {
    if (typeof row.description !== 'string') continue;
    const text = row.description.replace(/\s+/g, ' ').trim();
    if (text === '') continue;
    const id = typeof row.id === 'string' && row.id !== '' ? row.id : '?';
    lines.push(`${id}: ${text}`);
  }
  if (lines.length === 0) return;
  emitLine('');
  for (const line of lines) emitLine(line);
}

function emitMessage(message: unknown): void {
  if (typeof message !== 'string') return;
  const text = message.trim();
  if (text === '') return;
  emitLine(`${c.dim}${text}${c.reset}`);
}

function formatFactionAchievements(result: Record<string, unknown>): boolean {
  if (!Array.isArray(result.achievements)) return false;
  const achievements: Array<Record<string, unknown>> = [];
  for (const row of result.achievements) {
    if (!isRecord(row)) return false;
    const progress = row.progress;
    if (progress !== undefined && progress !== null && !isRecord(progress)) return false;
    achievements.push(row);
  }
  if (result.summary !== undefined && !isRecord(result.summary)) return false;

  emitSummary(result.summary);
  const rows = achievements.map(displayRow);
  printCompactTable('Faction Achievements', rows, tableColumns(rows), { maxCellWidth: 64 });
  emitDescriptions(achievements);
  emitMessage(result.message);
  return true;
}

// Do not add hintKeys, and do not set shapeFallback to quiet a debug warning.
const formatFactionAchievementsCommand = formatter(formatFactionAchievements, {
  commands: ['get_faction_achievements'],
});
formatFactionAchievementsCommand.formatterName = 'get_faction_achievements';

export const factionAchievementFormatters: ResultFormatter[] = [formatFactionAchievementsCommand];
