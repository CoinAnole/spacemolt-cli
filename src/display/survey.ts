import {
  c,
  emitLine,
  emitResourceInfoLines,
  finiteNumber,
  isRecord,
  namedFormatter,
  printCompactTable,
  type ResultFormatter,
} from './helpers.ts';

function isSurveySystemResponse(r: Record<string, unknown>): boolean {
  return (
    finiteNumber(r.survey_power) !== undefined && Array.isArray(r.newly_revealed) && Array.isArray(r.already_revealed)
  );
}

function formatSurveyedPoiHeadline(poi: Record<string, unknown>): string {
  const name = poi.name || poi.id || 'Unknown';
  const id = poi.id && poi.id !== name ? ` (${poi.id})` : '';
  const type = poi.type ? `  ${poi.type}` : '';
  const poiClass = typeof poi.class === 'string' && poi.class.trim() ? ` [${poi.class.trim()}]` : '';
  return `${name}${id}${type}${poiClass}`;
}

function emitSurveyedPoiList(title: string, value: unknown, emptyCopy?: string): void {
  const rows = Array.isArray(value) ? value.filter(isRecord) : [];
  if (!rows.length) {
    if (emptyCopy === undefined) return;
    emitLine(`\n${c.bright}${title}:${c.reset}`);
    emitLine(`  ${emptyCopy}`);
    return;
  }
  emitLine(`\n${c.bright}${title}:${c.reset}`);
  for (const poi of rows) {
    emitLine(`  - ${formatSurveyedPoiHeadline(poi)}`);
    if (typeof poi.description === 'string' && poi.description) {
      emitLine(`    ${poi.description}`);
    }
    emitResourceInfoLines(poi.resources, { indent: '  ', heading: false });
  }
}

function emitWildlifeCensus(value: unknown): void {
  const rows = Array.isArray(value) ? value.filter(isRecord) : [];
  if (!rows.length) {
    emitLine(`\n${c.bright}Wildlife:${c.reset}`);
    emitLine('  (none)');
    return;
  }
  const projected = rows.map((row) => ({
    ...row,
    ranched_display: finiteNumber(row.ranched) !== undefined ? String(row.ranched) : '',
  }));
  const columns: Array<[string, string[]]> = [
    ['Species', ['species']],
    ['Name', ['name']],
    ['Role', ['role']],
    ['Estimate', ['estimate']],
    ['Abundance', ['abundance']],
  ];
  if (projected.some((row) => row.ranched_display)) columns.push(['Ranched', ['ranched_display']]);
  printCompactTable('Wildlife', projected, columns, { maxCellWidth: 40 });
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

export const surveyFormatters: ResultFormatter[] = [
  namedFormatter(
    'survey_system',
    ['newly_revealed', 'already_revealed', 'survey_power'],
    (r) => {
      if (!isSurveySystemResponse(r)) return false;
      const systemName = r.system_name || r.system_id || 'Unknown';
      const systemId = r.system_id && r.system_id !== systemName ? ` (${r.system_id})` : '';
      emitLine(`\n${c.bright}=== Survey: ${systemName}${systemId} ===${c.reset}`);
      emitLine(`Survey power: ${r.survey_power}`);
      const bloomStatus = typeof r.bloom_status === 'string' && r.bloom_status ? r.bloom_status : undefined;
      const bloomIntensity = finiteNumber(r.bloom_intensity);
      if (bloomStatus !== undefined && bloomIntensity !== undefined) {
        emitLine(`Bloom: ${bloomStatus} (intensity ${bloomIntensity})`);
      }
      if (typeof r.message === 'string' && r.message) emitLine(r.message);
      if (typeof r.anomaly_hint === 'string' && r.anomaly_hint) {
        emitLine(`${c.yellow}${r.anomaly_hint}${c.reset}`);
      }
      emitSurveyedPoiList('Newly Revealed', r.newly_revealed, '(none)');
      emitSurveyedPoiList('Already Known', r.already_revealed);
      const faint = Array.isArray(r.faint_signatures) ? r.faint_signatures.filter(isRecord) : [];
      if (faint.length) {
        emitLine(`\n${c.bright}Faint Signatures:${c.reset}`);
        for (const row of faint) {
          const type = row.type || 'signature';
          const hint = row.hint ? `: ${row.hint}` : '';
          const difficulty =
            typeof row.difficulty === 'string' && row.difficulty ? ` (difficulty ${row.difficulty})` : '';
          emitLine(`  - ${type}${hint}${difficulty}`);
        }
      }
      emitWildlifeCensus(r.wildlife);
      const xp = formatXpGained(r.xp_gained);
      if (xp) emitLine(`\n${xp}`);
      return true;
    },
    { commands: ['survey_system'] },
  ),
];
